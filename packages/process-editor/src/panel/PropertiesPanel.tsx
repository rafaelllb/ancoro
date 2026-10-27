/**
 * Painel de propriedades EDITÁVEL, em abas (estilo Bizagi) + validação.
 *
 * [2026-10-14] Criado: Fase 2 / etapa 1 (somente leitura) — Rafael Brito
 * [2026-10-14] Alterado: Fase 2 etapa 4 — campos editáveis; commit em blur/Enter (1 entrada de histórico por campo) — Rafael Brito
 * [2026-10-14] Alterado: abas Geral/Documentação/Responsáveis (RACI)/Execução/Dados/Atributos/Aparência/Vínculos; propriedades de
 *   fluxo (condição, probabilidade), lane e processo (autor, versão, tags…) — Rafael Brito
 * Campos são NÃO-controlados com `key` = id+valor: ao desfazer/refazer o valor externo muda, a key muda e o campo remonta.
 * Quais abas aparecem depende do elemento (uma anotação não tem "Execução"; um evento não tem "Dados"…).
 */
import { IS_HOST } from '../host';
import { ReqPicker } from '../HostUi';
import { useEffect, useMemo, useRef } from 'react';
import { EVENT_VARIANTS, GATEWAY_VARIANTS, LOOP_TYPES, PRIORITIES, TASK_VARIANTS, isSatellite, validateModel, type ProcessModel, type ProcessNode } from '@ancoro/process-core';
import { useT } from '../i18n';
import { useEditor } from '../store';
import { useUi, type PanelTab } from '../ui';
import { AttributesTab } from './AttributesTab';
import { Check, ChipsField, Field, SelectField, TextField } from './fields';

// ---------------------------------------------------------------------------------------------- campos
const PRESETS: Array<[string, string]> = [
  ['#dae8fc', '#6c8ebf'], ['#d5e8d4', '#82b366'], ['#fff2cc', '#d6b656'], ['#ffe6cc', '#d79b00'],
  ['#f8cecc', '#b85450'], ['#e1d5e7', '#9673a6'], ['#f5f5f5', '#666666'], ['#ffffff', '#000000'],
];

/** `<input type=color>` com commit no evento NATIVO `change` (o onChange do React dispara a cada arrasto no seletor => spam no histórico). */
function ColorInput({ value, label, onCommit }: { value?: string; label: string; onCommit: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const cb = useRef(onCommit);
  cb.current = onCommit;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = () => cb.current(el.value);
    el.addEventListener('change', h);
    return () => el.removeEventListener('change', h);
  }, []);
  return <input ref={ref} type="color" aria-label={label} defaultValue={value ?? '#ffffff'} key={value ?? 'none'} />;
}

function ColorRow({ label, value, onChange, resetLabel }: { label: string; value?: string; onChange: (v: string) => void; resetLabel: string }) {
  return (
    <div className="colorrow">
      <span className="lab">{label}</span>
      <ColorInput label={label} value={value} onCommit={onChange} />
      <code>{value ?? '—'}</code>
      <button disabled={!value} onClick={() => onChange('')}>{resetLabel}</button>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------- painel
export function PropertiesPanel({ model }: { model: ProcessModel }) {
  const t = useT();
  const { selectedId, select, processes, openProcess, warnings, deleteSelected, readOnly } = useEditor();
  const issues = useMemo(() => validateModel(model), [model]);

  const node = model.nodes.find((n) => n.id === selectedId);
  const flow = model.flows.find((f) => f.id === selectedId);
  const lane = model.lanes.find((l) => l.id === selectedId);
  const participant = model.participants.find((p) => p.id === selectedId);
  const isPool = selectedId === model.id;
  const called = node?.calledProcessId ? processes.find((p) => p.id === node.calledProcessId) : undefined;

  return (
    <aside className="panel" aria-label={t.ui.showRight}>
      <fieldset className="ro" disabled={readOnly}>
      <section>
        {node ? <NodeProps node={node} model={model} />
          : flow ? <FlowProps flowId={flow.id} model={model} />
          : lane ? <ContainerProps kind="lane" id={lane.id} model={model} />
          : participant ? <ContainerProps kind="participant" id={participant.id} model={model} />
          : isPool ? <ProcessProps model={model} />
          : <ProcessProps model={model} showHint />}
        {called && <button className="link" onClick={() => openProcess(called.id, true)}>↗ {called.name}</button>}
        {selectedId && !isPool && (node || flow || lane || participant) && (
          <button className="danger" onClick={deleteSelected} data-action="delete">{t.delete}</button>
        )}
      </section>
      </fieldset>

      <section>
        <h3>{t.issues} <span className="badge">{issues.length}</span></h3>
        {issues.length === 0 ? <p className="hint">{t.noIssues}</p> : (
          <ul className="issues">
            {issues.map((i, idx) => (
              <li key={idx} className={`sev-${i.severity}`} onClick={() => i.elementId && select(i.elementId)}>
                <strong>{t.sev[i.severity]}</strong> {i.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      {warnings.length > 0 && (
        <section>
          <h3>{t.warnings} <span className="badge">{warnings.length}</span></h3>
          <ul className="issues">{warnings.map((w, i) => <li key={i} className="sev-info">{w}</li>)}</ul>
        </section>
      )}
    </aside>
  );
}

function Tabs({ tabs, active, onPick }: { tabs: PanelTab[]; active: PanelTab; onPick: (t: PanelTab) => void }) {
  const t = useT();
  return (
    <div className="tabs" role="tablist">
      {tabs.map((k) => <button key={k} role="tab" aria-selected={k === active} data-tab={k} className={k === active ? 'on' : ''} onClick={() => onPick(k)}>{t.tab[k]}</button>)}
    </div>
  );
}

/** aba ativa, caindo na primeira disponível se a preferida não existe para este elemento */
function useTab(available: PanelTab[]): [PanelTab, (t: PanelTab) => void] {
  const { tab, setTab } = useUi();
  return [available.includes(tab) ? tab : available[0]!, setTab];
}

// ---------------------------------------------------------------------------------------------- nó
const SUBPROCESS = '__subprocess';

function NodeProps({ node: n, model }: { node: ProcessNode; model: ProcessModel }) {
  const t = useT();
  const { patchNode, assignLane, processes, rename, resetLabel, changeKind } = useEditor();
  const isActivity = n.kind === 'task' || n.kind === 'subprocess';
  const isFlowNode = !isSatellite(n.kind) && n.kind !== 'boundary';
  const tabs: PanelTab[] = ['general', 'docs',
    ...(isFlowNode ? (['people'] as PanelTab[]) : []),
    ...(isActivity ? (['execution', 'data'] as PanelTab[]) : []),
    'attrs', 'look', 'links'];
  const [tab, setTab] = useTab(tabs);

  const variants: readonly string[] | null =
    n.kind === 'task' ? TASK_VARIANTS : n.kind === 'gateway' ? GATEWAY_VARIANTS : ['start', 'end', 'intermediate', 'boundary'].includes(n.kind) ? EVENT_VARIANTS : null;
  const tv = t.variant as Record<string, string>;
  const others = processes.filter((p) => p.id !== model.id);
  const nameOf = (id: string) => model.nodes.find((x) => x.id === id)?.name || model.participants.find((p) => p.id === id)?.name || (id === model.id ? model.name : id);
  const inc = model.flows.filter((f) => f.targetId === n.id && f.kind === 'sequence');
  const out = model.flows.filter((f) => f.sourceId === n.id && f.kind === 'sequence');
  const list = (key: 'consulted' | 'informed' | 'systems' | 'inputs' | 'outputs' | 'rules', label: string, hint?: string) => (
    <Field label={label} hint={hint}><ChipsField label={label} values={n[key]} placeholder={t.prop.addItem} onChange={(v) => patchNode(n.id, { [key]: v })} /></Field>
  );

  return (
    <>
      <div className="type">{t.kind[n.kind]}</div>
      <Tabs tabs={tabs} active={tab} onPick={setTab} />
      <div className="tabbody" data-tabbody={tab}>
        {tab === 'general' && (
          <>
            <Field label={t.prop.name}><TextField id={n.id} value={n.name} label={t.prop.name} onCommit={(v) => rename(n.id, v)} /></Field>
            {/* Variante: tarefa e subprocesso são intercambiáveis aqui (como no Bizagi). Valor '__subprocess' = subprocesso. */}
            {(n.kind === 'task' || n.kind === 'subprocess') ? (
              <Field label={t.prop.variant}>
                <SelectField label={t.prop.variant} value={n.kind === 'subprocess' ? SUBPROCESS : n.variant ?? 'generic'}
                  onChange={(v) => (v === SUBPROCESS ? (n.kind === 'task' && changeKind(n.id, 'subprocess')) : n.kind === 'subprocess' ? changeKind(n.id, 'task', v) : patchNode(n.id, { variant: v }))}
                  options={[...TASK_VARIANTS.map((v): [string, string] => [v, tv[v] ?? v]), [SUBPROCESS, tv.subprocess ?? 'subprocess']]} />
              </Field>
            ) : variants && (
              <Field label={t.prop.variant}>
                <SelectField label={t.prop.variant} value={n.variant ?? variants[0]!} onChange={(v) => patchNode(n.id, { variant: v })} options={variants.map((v) => [v, tv[v] ?? v])} />
              </Field>
            )}
            {n.kind === 'intermediate' && <Check label={t.prop.throwing} checked={n.throw} onChange={(v) => patchNode(n.id, { throw: v })} />}
            {n.kind === 'boundary' && (
              <>
                <Field label={t.prop.attached}><span className="ro">{nameOf(n.attachedToId ?? '')}</span></Field>
                <Check label={t.prop.interrupting} checked={n.cancelActivity} onChange={(v) => patchNode(n.id, { cancelActivity: v })} />
              </>
            )}
            {isFlowNode && model.lanes.length > 0 && (
              <Field label={t.prop.lane}>
                <SelectField label={t.prop.lane} value={n.laneId ?? ''} onChange={(v) => v && assignLane(n.id, v)}
                  options={[...(n.laneId ? [] : [['', t.prop.none] as [string, string]]), ...model.lanes.map((l): [string, string] => [l.id, l.name || l.id])]} />
              </Field>
            )}
            {n.kind === 'subprocess' && (
              <Field label={t.prop.called}>
                <SelectField label={t.prop.called} value={n.calledProcessId ?? ''} onChange={(v) => patchNode(n.id, { calledProcessId: v })}
                  options={[['', t.prop.nobody], ...others.map((p): [string, string] => [p.id, p.name]),
                    ...(n.calledProcessId && !others.some((p) => p.id === n.calledProcessId) ? [[n.calledProcessId, n.calledProcessId] as [string, string]] : [])]} />
              </Field>
            )}
            {n.labelOffset && <button className="link" data-action="reset-label" onClick={() => resetLabel(n.id)}>{t.label.reset}</button>}
            <Field label={t.prop.description}><TextField id={`${n.id}:desc`} multiline rows={2} value={n.description ?? ''} label={t.prop.description} onCommit={(v) => patchNode(n.id, { description: v })} /></Field>
            <Field label={t.prop.url}>
              <TextField id={`${n.id}:url`} value={n.url ?? ''} label={t.prop.url} placeholder="https://" onCommit={(v) => patchNode(n.id, { url: v })} />
              {n.url && /^https?:\/\//i.test(n.url) && <a className="ext" href={n.url} target="_blank" rel="noopener noreferrer">{t.prop.hyperlinkOpen} ↗</a>}
            </Field>
          </>
        )}

        {tab === 'docs' && (
          <Field label={t.prop.doc}><TextField id={`${n.id}:doc`} multiline rows={14} value={n.documentation ?? ''} label={t.prop.doc} onCommit={(v) => patchNode(n.id, { documentation: v })} /></Field>
        )}

        {tab === 'people' && (
          <>
            <p className="fhint">{t.hints.raci}</p>
            <Field label={t.prop.responsible}><TextField id={`${n.id}:perf`} value={n.performer ?? ''} label={t.prop.responsible} onCommit={(v) => patchNode(n.id, { performer: v })} /></Field>
            <Field label={t.prop.accountable}><TextField id={`${n.id}:acc`} value={n.accountable ?? ''} label={t.prop.accountable} onCommit={(v) => patchNode(n.id, { accountable: v })} /></Field>
            {list('consulted', t.prop.consulted)}
            {list('informed', t.prop.informed)}
            {list('systems', t.prop.systems, t.hints.systems)}
          </>
        )}

        {tab === 'execution' && (
          <>
            <Field label={t.prop.sla}><TextField id={`${n.id}:sla`} value={n.sla ?? ''} label={t.prop.sla} onCommit={(v) => patchNode(n.id, { sla: v })} /></Field>
            <Field label={t.prop.duration}><TextField id={`${n.id}:dur`} value={n.duration ?? ''} label={t.prop.duration} placeholder="2 h" onCommit={(v) => patchNode(n.id, { duration: v })} /></Field>
            <Field label={t.prop.cost}><TextField id={`${n.id}:cost`} value={n.cost ?? ''} label={t.prop.cost} onCommit={(v) => patchNode(n.id, { cost: v })} /></Field>
            <Field label={t.prop.priority}>
              <SelectField label={t.prop.priority} value={n.priority ?? ''} onChange={(v) => patchNode(n.id, { priority: (v || undefined) as ProcessNode['priority'] })}
                options={[['', t.priority.none], ...PRIORITIES.map((p): [string, string] => [p, t.priority[p]])]} />
            </Field>
            <Field label={t.prop.loop}>
              <SelectField label={t.prop.loop} value={n.loop} onChange={(v) => patchNode(n.id, { loop: v as ProcessNode['loop'] })} options={LOOP_TYPES.map((l): [string, string] => [l, t.loop[l]])} />
            </Field>
            <Field label={t.prop.sap}><TextField id={`${n.id}:tx`} mono value={n.sapTransaction ?? ''} label={t.prop.sap} placeholder="ABC-01" onCommit={(v) => patchNode(n.id, { sapTransaction: v })} /></Field>
          </>
        )}

        {tab === 'data' && (
          <>
            {list('inputs', t.prop.inputs, t.hints.inputs)}
            {list('outputs', t.prop.outputs, t.hints.outputs)}
            {list('rules', t.prop.rules, t.hints.rules)}
          </>
        )}

        {tab === 'attrs' && <AttributesTab node={n} model={model} />}

        {tab === 'look' && <Appearance fill={n.fill} stroke={n.stroke} onChange={(p) => patchNode(n.id, p)} />}

        {tab === 'links' && (
          <>
            <Field label={t.prop.reqs}>{IS_HOST ? <ReqPicker values={n.requirementRefs} onChange={(v) => patchNode(n.id, { requirementRefs: v })} /> : <ChipsField label={t.prop.reqs} mono values={n.requirementRefs} placeholder={t.prop.addItem} onChange={(v) => patchNode(n.id, { requirementRefs: v })} />}</Field>
            {n.requirementRefs.length === 0 && <p className="fhint">{t.prop.noReqs}</p>}
            {n.source && <Field label={t.prop.source}><span className="ro">{n.source}</span></Field>}
            {inc.length > 0 && <Field label={t.prop.incoming}><span className="ro">{inc.map((f) => nameOf(f.sourceId)).join(', ')}</span></Field>}
            {out.length > 0 && <Field label={t.prop.outgoing}><span className="ro">{out.map((f) => (f.name ? `${f.name} → ` : '') + nameOf(f.targetId)).join(', ')}</span></Field>}
          </>
        )}
      </div>
    </>
  );
}

function Appearance({ fill, stroke, onChange }: { fill?: string; stroke?: string; onChange: (p: { fill?: string; stroke?: string }) => void }) {
  const t = useT();
  return (
    <>
      <span className="lab">{t.look.presets}</span>
      <div className="presets">
        {PRESETS.map(([f, s]) => (
          <button key={f} aria-label={`${f} ${s}`} title={`${f} / ${s}`} style={{ background: f, borderColor: s }} className={fill === f && stroke === s ? 'on' : ''} onClick={() => onChange({ fill: f, stroke: s })} />
        ))}
      </div>
      <ColorRow label={t.look.fill} value={fill} resetLabel={t.look.reset} onChange={(v) => onChange({ fill: v })} />
      <ColorRow label={t.look.stroke} value={stroke} resetLabel={t.look.reset} onChange={(v) => onChange({ stroke: v })} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------- fluxo
function FlowProps({ flowId, model }: { flowId: string; model: ProcessModel }) {
  const t = useT();
  const { patchFlow, rename, resetLabel, autoRoute } = useEditor();
  const f = model.flows.find((x) => x.id === flowId)!;
  const tabs: PanelTab[] = ['general', 'docs'];
  const [tab, setTab] = useTab(tabs);
  const src = model.nodes.find((n) => n.id === f.sourceId);
  const nameOf = (id: string) => model.nodes.find((x) => x.id === id)?.name || model.participants.find((p) => p.id === id)?.name || (id === model.id ? model.name : id);
  const canBeDefault = f.kind === 'sequence' && src?.kind === 'gateway' && ['exclusive', 'inclusive'].includes(src.variant ?? '');

  return (
    <>
      <div className="type">{t.kind[f.kind]}</div>
      <Tabs tabs={tabs} active={tab} onPick={setTab} />
      <div className="tabbody" data-tabbody={tab}>
        {tab === 'general' && (
          <>
            <Field label={t.prop.name}><TextField id={f.id} value={f.name ?? ''} label={t.prop.name} onCommit={(v) => rename(f.id, v)} /></Field>
            {f.manualRoute && <button className="link" data-action="auto-route" onClick={() => autoRoute(f.id)}>{t.route.auto}</button>}
            {f.labelOffset && <button className="link" data-action="reset-label" onClick={() => resetLabel(f.id)}>{t.label.reset}</button>}
            <Field label={t.prop.description}><TextField id={`${f.id}:desc`} multiline rows={2} value={f.description ?? ''} label={t.prop.description} onCommit={(v) => patchFlow(f.id, { description: v })} /></Field>
            {f.kind === 'sequence' && (
              <>
                <Field label={t.prop.condition} hint={t.hints.condition}><TextField id={`${f.id}:cond`} multiline rows={2} mono value={f.condition ?? ''} label={t.prop.condition} onCommit={(v) => patchFlow(f.id, { condition: v })} /></Field>
                <Field label={t.prop.probability} hint={t.hints.probability}>
                  <TextField id={`${f.id}:prob`} type="number" value={f.probability === undefined ? '' : String(f.probability)} label={t.prop.probability}
                    onCommit={(v) => patchFlow(f.id, { probability: v === '' ? undefined : Math.min(100, Math.max(0, Number(v))) })} />
                </Field>
              </>
            )}
            {canBeDefault && <Check label={t.prop.isDefault} checked={f.isDefault} onChange={(v) => patchFlow(f.id, { isDefault: v })} />}
            <Field label={t.prop.from}><span className="ro">{nameOf(f.sourceId)}</span></Field>
            <Field label={t.prop.to}><span className="ro">{nameOf(f.targetId)}</span></Field>
          </>
        )}
        {tab === 'docs' && (
          <Field label={t.prop.doc}><TextField id={`${f.id}:doc`} multiline rows={12} value={f.documentation ?? ''} label={t.prop.doc} onCommit={(v) => patchFlow(f.id, { documentation: v })} /></Field>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- lane / participante
function ContainerProps({ kind, id, model }: { kind: 'lane' | 'participant'; id: string; model: ProcessModel }) {
  const t = useT();
  const { patchLane, patchParticipant, rename } = useEditor();
  const lane = kind === 'lane' ? model.lanes.find((l) => l.id === id) : undefined;
  const part = kind === 'participant' ? model.participants.find((p) => p.id === id) : undefined;
  const tabs: PanelTab[] = kind === 'lane' ? ['general', 'look'] : ['general'];
  const [tab, setTab] = useTab(tabs);
  const name = lane?.name ?? part?.name ?? '';
  const description = lane?.description ?? part?.description ?? '';
  const count = lane ? model.nodes.filter((n) => n.laneId === id).length : 0;

  return (
    <>
      <div className="type">{t.kind[kind]}</div>
      <Tabs tabs={tabs} active={tab} onPick={setTab} />
      <div className="tabbody" data-tabbody={tab}>
        {tab === 'general' && (
          <>
            <Field label={t.prop.name}><TextField id={id} value={name} label={t.prop.name} onCommit={(v) => rename(id, v)} /></Field>
            <Field label={t.prop.description}>
              <TextField id={`${id}:desc`} multiline rows={3} value={description} label={t.prop.description}
                onCommit={(v) => (lane ? patchLane(id, { description: v }) : patchParticipant(id, { description: v }))} />
            </Field>
            {lane && <p className="fhint">{t.stats(count, 0).split(' · ')[0]}</p>}
          </>
        )}
        {tab === 'look' && lane && (
          <>
            <span className="lab">{t.look.presets}</span>
            <div className="presets">
              {PRESETS.map(([f, s]) => <button key={f} aria-label={f} title={f} style={{ background: f, borderColor: s }} className={lane.fill === f ? 'on' : ''} onClick={() => patchLane(id, { fill: f })} />)}
            </div>
            <ColorRow label={t.look.fill} value={lane.fill} resetLabel={t.look.reset} onChange={(v) => patchLane(id, { fill: v })} />
          </>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------- processo
function ProcessProps({ model, showHint }: { model: ProcessModel; showHint?: boolean }) {
  const t = useT();
  const { setProcessName, patchMeta } = useEditor();
  const tabs: PanelTab[] = ['general', 'docs'];
  const [tab, setTab] = useTab(tabs);
  const m = model.meta;
  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : '—');

  return (
    <>
      <div className="type">{t.kind.pool}</div>
      <Tabs tabs={tabs} active={tab} onPick={setTab} />
      <div className="tabbody" data-tabbody={tab}>
        {tab === 'general' && (
          <>
            <Field label={t.prop.processName}><TextField id={model.id} value={model.name} label={t.prop.processName} onCommit={setProcessName} /></Field>
            <Field label={t.prop.description}><TextField id={`${model.id}:desc`} multiline rows={3} value={m.description ?? ''} label={t.prop.description} onCommit={(v) => patchMeta({ description: v })} /></Field>
            <Field label={t.prop.author}><TextField id={`${model.id}:auth`} value={m.author ?? ''} label={t.prop.author} onCommit={(v) => patchMeta({ author: v })} /></Field>
            <Field label={t.prop.owner}><TextField id={`${model.id}:own`} value={m.owner ?? ''} label={t.prop.owner} onCommit={(v) => patchMeta({ owner: v })} /></Field>
            <Field label={t.prop.version}><TextField id={`${model.id}:ver`} value={m.version ?? ''} label={t.prop.version} placeholder="1.0" onCommit={(v) => patchMeta({ version: v })} /></Field>
            <Field label={t.prop.tags} hint={t.hints.tags}><ChipsField label={t.prop.tags} values={m.tags} placeholder={t.prop.addItem} onChange={(tags) => patchMeta({ tags })} /></Field>
            <Field label={t.prop.createdAt}><span className="ro">{fmt(m.createdAt)}</span></Field>
            <Field label={t.prop.modifiedAt}><span className="ro">{fmt(m.modifiedAt)}</span></Field>
            <p className="fhint">{t.stats(model.nodes.length, model.flows.length)}</p>
            {showHint && <p className="fhint">{t.noSelection}</p>}
          </>
        )}
        {tab === 'docs' && (
          <Field label={t.prop.doc}><TextField id={`${model.id}:doc`} multiline rows={14} value={m.documentation ?? ''} label={t.prop.doc} onCommit={(v) => patchMeta({ documentation: v })} /></Field>
        )}
      </div>
    </>
  );
}
