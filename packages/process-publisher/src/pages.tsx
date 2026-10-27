/**
 * Páginas estáticas do portal (sem JavaScript): uma por processo, legíveis, imprimíveis e indexáveis.
 *
 * [2026-10-14] Criado: Fase 3 — regra "o viewer degrada bem": o conteúdo essencial (diagrama + elementos + atributos) existe em HTML puro — Rafael Brito
 * Tudo passa por renderToStaticMarkup => texto escapado automaticamente (nenhum HTML de usuário chega ao DOM).
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticDiagram } from '@ancoro/process-render';
import type { ProcessModel } from '@ancoro/process-core';
import type { ProcessPayload } from './payload';

const KIND_PT: Record<string, string> = {
  start: 'Evento de início', end: 'Evento de fim', intermediate: 'Evento intermediário', boundary: 'Evento de borda', task: 'Tarefa', gateway: 'Gateway',
  subprocess: 'Subprocesso', dataObject: 'Objeto de dados', dataStore: 'Repositório de dados', annotation: 'Anotação',
};
const KIND_EN: Record<string, string> = {
  start: 'Start event', end: 'End event', intermediate: 'Intermediate event', boundary: 'Boundary event', task: 'Task', gateway: 'Gateway',
  subprocess: 'Subprocess', dataObject: 'Data object', dataStore: 'Data store', annotation: 'Annotation',
};

/** SVG do processo como string (mesmo renderer do editor). */
export function renderDiagramSvg(model: ProcessModel, loaded: ReadonlySet<string>): string {
  return renderToStaticMarkup(<StaticDiagram model={model} loadedProcessIds={loaded} />);
}

export interface StaticPageProps {
  lang: 'pt' | 'en';
  title: string;
  payload: ProcessPayload;
  cssHref: string;
  brandCss: string;
  /** link para a versão interativa */
  appHref: string;
  svg: string;
  logoHref?: string;
  footer?: string;
}

function attrText(v: unknown): string {
  if (typeof v === 'string') return v.startsWith('data:') ? '' : v;
  return Array.isArray(v) ? v.flat().join(', ') : String(v);
}

export function renderStaticPage(p: StaticPageProps): string {
  const pt = p.lang === 'pt';
  const KIND = pt ? KIND_PT : KIND_EN;
  const L = pt
    ? { open: 'Abrir a versão interativa', elements: 'Elementos', name: 'Nome', type: 'Tipo', lane: 'Raia', who: 'Responsável', sla: 'SLA', desc: 'Descrição', attrs: 'Atributos', noscript: 'Versão estática (sem JavaScript)', owner: 'Dono', version: 'Versão', author: 'Autor' }
    : { open: 'Open the interactive version', elements: 'Elements', name: 'Name', type: 'Type', lane: 'Lane', who: 'Responsible', sla: 'SLA', desc: 'Description', attrs: 'Attributes', noscript: 'Static version (no JavaScript)', owner: 'Owner', version: 'Version', author: 'Author' };
  const ids = p.payload.order.filter((id) => p.payload.elements[id]);
  const withAttrs = ids.filter((id) => (p.payload.elements[id]!.attributes ?? []).length > 0);
  const m = p.payload.meta;
  const doc = (
    <html lang={p.lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${p.payload.name} · ${p.title}`}</title>
        <link rel="stylesheet" href={p.cssHref} />
        {p.brandCss ? <style dangerouslySetInnerHTML={{ __html: p.brandCss }} /> : null}
      </head>
      <body className="static-page">
        <header className="top">
          {p.logoHref ? <img className="logo" src={p.logoHref} alt="" /> : null}
          <div className="brand"><strong>{p.title}</strong><span>{L.noscript}</span></div>
          <div className="tools"><a className="btn primary" href={p.appHref}>{L.open}</a></div>
        </header>
        <article className="static-body">
          <h1>{p.payload.name}</h1>
          {m.description ? <p className="pre">{m.description}</p> : null}
          <p className="hint">{[m.version && `${L.version}: ${m.version}`, m.author && `${L.author}: ${m.author}`, m.owner && `${L.owner}: ${m.owner}`].filter(Boolean).join(' · ')}</p>
          <div className="static-diagram" dangerouslySetInnerHTML={{ __html: p.svg }} />
          <h2>{L.elements}</h2>
          <div className="tblwrap">
            <table className="grid">
              <thead><tr>{[L.name, L.type, L.lane, L.who, L.sla, L.desc].map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {ids.map((id) => {
                  const e = p.payload.elements[id]!;
                  return (
                    <tr key={id} id={`e-${id}`}>
                      <td>{e.name || id}</td><td>{KIND[e.kind] ?? e.kind}</td><td>{e.lane ?? ''}</td><td>{e.performer ?? ''}</td><td>{e.sla ?? ''}</td><td className="trunc">{(e.description ?? '').slice(0, 200)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {withAttrs.length ? <h2>{L.attrs}</h2> : null}
          {withAttrs.map((id) => {
            const e = p.payload.elements[id]!;
            return (
              <details key={id} open>
                <summary>{e.name || id}</summary>
                {(e.attributes ?? []).map((a) => (
                  <section className="psec" key={a.name}>
                    <h3>{a.name}</h3>
                    {a.type === 'table' && Array.isArray(a.value)
                      ? <table className="attr-table"><thead><tr>{(a.columns ?? []).map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{(a.value as string[][]).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{/^https?:\/\//i.test(c) ? <a href={c}>{c.length > 60 ? `${c.slice(0, 57)}…` : c}</a> : c}</td>)}</tr>)}</tbody></table>
                      : <p className="pre">{attrText(a.value)}</p>}
                  </section>
                ))}
              </details>
            );
          })}
        </article>
        {p.footer ? <footer>{p.footer}</footer> : null}
      </body>
    </html>
  );
  return `<!doctype html>${renderToStaticMarkup(doc)}`;
}
