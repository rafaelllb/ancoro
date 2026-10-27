// [2026-10-14] Criado: Fase 3 — publisher: determinismo, segurança do conteúdo, marca, árvore, busca, páginas estáticas — Rafael Brito
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addNode, billingSample, moveNodes, parseModel, updateNode, type ProcessModel } from '@ancoro/process-core';
import { brandCss, parseBrand } from '../src/brand';
import { buildTree, tokenize } from '../src/payload';
import { publish, zipFiles, type FileMap } from '../src/publish';
import { isSealedFile, unsealFile } from '../src/seal';
import type { VersionsFile } from '../src/versions';

const viewer = { js: '/* js */', css: '/* css */' }; // testes do publisher não dependem do build do viewer
const text = (f: FileMap, name: string): string => { const v = f.get(name); if (v === undefined) throw new Error(`arquivo ausente: ${name}`); return typeof v === 'string' ? v : new TextDecoder().decode(v); };
const names = (f: FileMap) => [...f.keys()].sort();

/** Dois processos ligados por call activity: Raiz -> Filho (e o Filho tem atributo tipado, para a busca). */
function pair(): ProcessModel[] {
  const root = parseModel({
    id: 'Raiz', name: 'Processo raiz',
    nodes: [
      { id: 's', kind: 'start', name: 'Início', bounds: { x: 20, y: 20, w: 36, h: 36 } },
      { id: 'c', kind: 'subprocess', name: 'Chamar filho', calledProcessId: 'Filho', bounds: { x: 100, y: 5, w: 140, h: 80 } },
      { id: 'e', kind: 'end', name: 'Fim', bounds: { x: 300, y: 20, w: 36, h: 36 } },
    ],
    flows: [{ id: 'f1', sourceId: 's', targetId: 'c' }, { id: 'f2', sourceId: 'c', targetId: 'e' }],
  });
  const filho = parseModel({
    id: 'Filho', name: 'Processo filho', meta: { description: 'Faz coisas de faturamento', tags: ['isu'] },
    attributeDefs: [{ id: 'TC', name: 'TCodes', type: 'textarea', options: [], columns: [] }],
    nodes: [
      { id: 'a', kind: 'task', variant: 'user', name: 'Criar fatura', performer: 'Analista', sapTransaction: 'EA00', attributes: [{ name: 'TCodes', defId: 'TC', value: 'EA19 - Reverter fatura\nEAMABI - Faturamento em massa' }], bounds: { x: 20, y: 20, w: 120, h: 70 } },
    ],
    flows: [],
  });
  return [filho, root]; // ordem de entrada propositalmente fora de ordem
}

describe('publish: arquivos e manifesto', () => {
  it('gera o site: index, assets com hash, um módulo de dados por processo, busca, páginas estáticas e relatório', async () => {
    const r = await publish({ models: pair(), brand: { title: 'Portal Teste' }, viewer });
    const n = names(r.files);
    expect(n).toContain('index.html');
    expect(n.filter((x) => /^assets\/portal\.[0-9a-f]{10}\.(js|css)$/.test(x))).toHaveLength(2);
    expect(n.filter((x) => /^data\/p\.[A-Za-z0-9_.-]+\.[0-9a-f]{10}\.js$/.test(x))).toHaveLength(2);
    expect(n.some((x) => /^data\/search\.[0-9a-f]{10}\.js$/.test(x))).toBe(true);
    expect(n).toEqual(expect.arrayContaining(['p/Raiz.html', 'p/Filho.html', 'publish-report.json']));
    const m = JSON.parse(text(r.files, 'index.html').match(/<script type="application\/json" id="ps-manifest">([\s\S]*?)<\/script>/)![1]!);
    expect(m.roots).toEqual(['Raiz']);
    expect(m.processes.find((p: { id: string }) => p.id === 'Filho').parent).toBe('Raiz');
    expect(m.title).toBe('Portal Teste');
    expect(r.report.totals.processes).toBe(2);
  });

  it('é DETERMINÍSTICO: mesma entrada => mesmos arquivos, mesmos bytes e mesmo ZIP, independente da ordem de entrada', async () => {
    const a = await publish({ models: pair(), viewer });
    const b = await publish({ models: [...pair()].reverse(), viewer });
    expect(names(a.files)).toEqual(names(b.files));
    for (const [k, v] of a.files) expect(b.files.get(k), k).toEqual(v);
    expect(zipFiles(a.files)).toEqual(zipFiles(b.files));
  });

  it('o hash do arquivo muda quando o conteúdo muda (cache seguro) e só o que mudou', async () => {
    const base = await publish({ models: pair(), viewer });
    const changed = pair().map((m) => (m.id === 'Filho' ? updateNode(m, 'a', { name: 'Criar fatura mensal' }) : m));
    const next = await publish({ models: changed, viewer });
    const dataOf = (f: FileMap, id: string) => names(f).find((x) => x.startsWith(`data/p.${id}.`))!;
    expect(dataOf(next.files, 'Filho')).not.toBe(dataOf(base.files, 'Filho'));
    expect(dataOf(next.files, 'Raiz')).toBe(dataOf(base.files, 'Raiz'));
  });

  it('--exclude (por id ou nome) tira o processo e a árvore se recompõe', async () => {
    const r = await publish({ models: pair(), exclude: ['Processo filho'], viewer });
    expect(r.report.totals.processes).toBe(1);
    expect(names(r.files).some((x) => x.startsWith('p/Filho'))).toBe(false);
  });
});

describe('publish: segurança do conteúdo', () => {
  const evil = (): ProcessModel[] => {
    const m = billingSample();
    return [{ ...m, name: '</script><script>alert(1)</script>', nodes: m.nodes.map((n) => (n.id === 't1' ? { ...n, name: '<img src=x onerror=alert(1)>', description: '"><svg onload=alert(2)>' } : n)) }];
  };

  it('nome/descrição maliciosos não viram HTML/JS: index, páginas estáticas e SVG escapam', async () => {
    const r = await publish({ models: evil(), brand: { title: 'T<script>alert(3)</script>' }, viewer });
    for (const f of ['index.html', 'p/Process_Billing.html']) {
      const html = text(r.files, f);
      expect(html, f).not.toMatch(/<script>alert/i);
      expect(html, f).not.toMatch(/<img src=x onerror/i);
      expect(html, f).not.toMatch(/<svg onload/i);
    }
    expect(text(r.files, 'p/Process_Billing.html')).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // o manifesto dentro do <script type=application/json> não pode fechar a tag
    const idx = text(r.files, 'index.html');
    expect(idx.split('</script>').length - 1).toBe(2); // manifesto + viewer; nenhum "</script>" extra injetado
  });

  it('páginas estáticas não executam JS (sem <script>) e só usam links http(s)', async () => {
    const r = await publish({ models: pair(), viewer });
    expect(text(r.files, 'p/Filho.html')).not.toContain('<script');
  });
});

describe('brand.json', () => {
  it('aceita cores/fonte e gera CSS ordenado (estável); tema escuro separado', () => {
    const b = parseBrand({ title: 'ACME', accent: '#ff6600', tokens: { '--user': '#123456', '--gateway': '#abcdef' }, tokensDark: { '--user': '#654321' }, fontFamily: 'Inter, sans-serif' });
    const css = brandCss(b);
    expect(css).toContain(':root:root{--accent:#ff6600;--gateway:#abcdef;--user:#123456}');
    expect(css).toContain('data-theme=dark');
    expect(css).toContain('body{font-family:Inter, sans-serif}');
    expect(brandCss(b)).toBe(css);
  });

  it.each([
    ['nome de token fora do padrão', { tokens: { 'color': 'red' } }],
    ['url() no valor', { tokens: { '--bg': 'url(javascript:alert(1))' } }],
    ['injeção de CSS com ;} ', { tokens: { '--bg': 'red;}body{display:none' } }],
    ['fecha a tag <style>', { tokens: { '--bg': '</style><script>' } }],
    ['accent que não é #rrggbb', { accent: 'red' }],
    ['GA4 inválido', { analytics: { ga4: 'UA-1' } }],
  ])('recusa: %s', (_n, input) => { expect(() => parseBrand(input)).toThrow(); });

  it('o CSS da marca vai no index.html e nas páginas estáticas', async () => {
    const r = await publish({ models: pair(), brand: { accent: '#ff6600', title: 'X' }, viewer });
    expect(text(r.files, 'index.html')).toContain('--accent:#ff6600');
    expect(text(r.files, 'p/Raiz.html')).toContain('--accent:#ff6600');
  });
});

describe('árvore e busca', () => {
  it('hierarquia pelas call activities; ciclos e auto-chamadas não quebram; soltos viram raízes', () => {
    const [filho, raiz] = pair() as [ProcessModel, ProcessModel];
    const solto = parseModel({ id: 'Solto', name: 'Aaa solto', nodes: [{ id: 'x', kind: 'start', name: '' }], flows: [] });
    const t = buildTree([filho, raiz, solto]);
    expect(t.roots).toEqual(['Solto', 'Raiz']); // por nome: "Aaa solto" < "Processo raiz"
    expect(t.nodes.Raiz!.children).toEqual(['Filho']);
    // ciclo: filho passa a chamar a raiz
    const cyc = { ...filho, nodes: [...filho.nodes, parseModel({ id: 'z', name: 'z', nodes: [{ id: 'k', kind: 'subprocess', name: 'volta', calledProcessId: 'Raiz' }], flows: [] }).nodes[0]!] };
    const tc = buildTree([cyc, raiz]);
    // um só pai por processo e nenhum ciclo: por ordem de nome, o filho é processado primeiro e adota a raiz; a volta é descartada
    expect(tc.roots).toEqual(['Filho']);
    expect(tc.nodes.Raiz!.parent).toBe('Filho');
    expect(tc.nodes.Filho!.parent).toBeUndefined();
    expect(tc.nodes.Raiz!.children).toEqual([]);
  });

  it('tokenize: sem acentos, minúsculas, mantém códigos (EA00, F2185)', () => {
    expect(tokenize('Geração de Faturamento — EA00 / Apps(\'F2185\')')).toEqual(['geracao', 'de', 'faturamento', 'ea00', 'apps', 'f2185']);
  });

  it('índice encontra por nome, transação SAP, texto de atributo (TCodes) e responsável, com peso maior para o nome', async () => {
    const models = pair();
    const r = await publish({ models, viewer });
    const idx = JSON.parse(text(r.files, names(r.files).find((x) => x.startsWith('data/search.'))!).replace(/^PS\.s\(/, '').replace(/\);\s*$/, ''));
    const docsFor = (term: string) => (idx.terms[term] ?? []).map(([d]: [number]) => idx.docs[d]);
    expect(docsFor('ea00').some((d: string[]) => d[1] === 'a')).toBe(true);              // transação SAP
    expect(docsFor('eamabi').some((d: string[]) => d[1] === 'a')).toBe(true);            // dentro do TCodes (atributo)
    expect(docsFor('analista').some((d: string[]) => d[1] === 'a')).toBe(true);          // responsável
    expect(docsFor('faturamento').map((d: string[]) => d[0])).toContain('Filho');        // descrição do processo
    const w = (term: string) => Math.max(...idx.terms[term].map(([, wt]: [number, number]) => wt));
    expect(w('fatura')).toBeGreaterThan(w('eamabi'));                                    // nome (peso 5) > texto de atributo (peso 1)
  });
});

describe('páginas estáticas e logo', () => {
  it('p/<id>.html tem SVG, tabela de elementos e atributos em HTML puro, e link para a versão interativa', async () => {
    const r = await publish({ models: pair(), viewer });
    const html = text(r.files, 'p/Filho.html');
    expect(html).toContain('<svg');
    expect(html).toContain('<table');
    expect(html).toContain('Criar fatura');
    expect(html).toContain('EA19 - Reverter fatura');          // TCodes renderizado (atributo tipado)
    expect(html).toContain('../index.html#/p/Filho');
  });

  it('logo é otimizado (webp pequeno) e referenciado no manifesto', async () => {
    const { default: sharp } = await import('sharp');
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'ps-logo-'));
    const big = await sharp({ create: { width: 1800, height: 900, channels: 3, background: '#cc3300' } }).png().toBuffer();
    writeFileSync(join(dir, 'logo.png'), big);
    const r = await publish({ models: pair(), brand: { logo: 'logo.png' }, brandDir: dir, viewer });
    const logo = names(r.files).find((x) => x.startsWith('assets/logo.'))!;
    expect(logo).toMatch(/\.webp$/);
    expect((r.files.get(logo) as Uint8Array).byteLength).toBeLessThan(big.byteLength / 10);
    expect(text(r.files, 'index.html')).toContain(logo);
    expect(readFileSync(join(dir, 'logo.png')).byteLength).toBe(big.byteLength); // não mexe no original
  });
});

describe('versões e "o que mudou"', () => {
  const versionsOf = (f: FileMap) => JSON.parse(text(f, 'versions.json')) as VersionsFile;

  it('1ª publicação = versão 1, sem lista de mudanças; republicar sem mudanças é idempotente (mesmos bytes, mesma versão)', async () => {
    const a = await publish({ models: pair(), viewer });
    expect(versionsOf(a.files).versions.map((v) => v.version)).toEqual([1]);
    expect(names(a.files).some((x) => x.startsWith('data/changes.'))).toBe(false);
    const b = await publish({ models: pair(), viewer, previousVersions: versionsOf(a.files) });
    expect(names(b.files)).toEqual(names(a.files));
    for (const [k, v] of a.files) expect(b.files.get(k), k).toEqual(v);
    expect(b.report.version).toBe(1);
  });

  it('mudança semântica gera a versão 2 com o diff (campos alterados, adicionados, removidos); processos novos e removidos entram', async () => {
    const a = await publish({ models: pair(), viewer });
    const next = pair().map((m) => (m.id === 'Filho' ? addNode(updateNode(m, 'a', { name: 'Criar fatura mensal', sla: '4 h' }), { kind: 'task', name: 'Conferir fatura', at: { x: 400, y: 60 } }).model : m));
    const extra = parseModel({ id: 'Novo', name: 'Processo novo', nodes: [{ id: 'q', kind: 'start', name: '' }], flows: [] });
    const b = await publish({ models: [...next, extra], viewer, previousVersions: versionsOf(a.files), versionLabel: 'Release 2' });
    const v = versionsOf(b.files);
    expect(v.versions.map((x) => x.version)).toEqual([1, 2]);
    const cur = v.versions[1]!;
    expect(cur.label).toBe('Release 2');
    expect(cur.summary).toMatchObject({ processesAdded: 1, elementsAdded: 1, elementsChanged: 1 });
    const filho = cur.changes.find((c) => c.id === 'Filho')!;
    expect(filho.changed[0]).toMatchObject({ id: 'a', fields: expect.arrayContaining(['name', 'sla']) });
    expect(filho.added.map((e) => e.name)).toEqual(['Conferir fatura']);
    expect(cur.changes.find((c) => c.id === 'Novo')!.status).toBe('added');
    expect(names(b.files).some((x) => /^data\/changes\.[0-9a-f]{10}\.js$/.test(x))).toBe(true);
    expect(text(b.files, 'index.html')).toContain('"changes":{"file":"data/changes.');
    // remover um processo na 3ª publicação
    const c = await publish({ models: [...next], viewer, previousVersions: v });
    expect(versionsOf(c.files).versions[2]!.changes.find((x) => x.id === 'Novo')!.status).toBe('removed');
  });

  it('só geometria (mover elemento, ajustar linha) NÃO cria versão nova', async () => {
    const a = await publish({ models: pair(), viewer });
    const moved = pair().map((m) => (m.id === 'Filho' ? moveNodes(m, ['a'], 40, 10) : m));
    const b = await publish({ models: moved, viewer, previousVersions: versionsOf(a.files) });
    expect(versionsOf(b.files).versions).toHaveLength(1);
  });

  it('relatório de publicação lista lacunas (sem descrição/responsável/requisito) e chamadas quebradas', async () => {
    const models = pair().map((m) => (m.id === 'Raiz' ? { ...m, nodes: m.nodes.map((n) => (n.id === 'c' ? { ...n, calledProcessId: 'Inexistente' } : n)) } : m));
    const r = await publish({ models, viewer });
    expect(r.report.gaps.brokenCalls).toEqual([{ process: 'Processo raiz', id: 'c', name: 'Chamar filho', calls: 'Inexistente' }]);
    expect(r.report.gaps.noDescription.map((g) => g.id)).toEqual(expect.arrayContaining(['a', 'c'])); // nenhum dos dois tem descrição neste fixture
    expect(r.report.gaps.noPerformer.map((g) => g.id)).toContain('c');
    expect(r.report.gaps.noPerformer.map((g) => g.id)).not.toContain('a'); // 'Criar fatura' tem responsável
  });
});

describe('portal protegido por senha', () => {
  const PW = 'frase longa de teste';
  const fast = { password: PW, kdfIterations: 1000, viewer }; // PBKDF2 curto só nos testes

  it('nada em claro: sem páginas estáticas/relatório, nomes e conteúdo cifrados, ids fora dos nomes de arquivo', async () => {
    const r = await publish({ models: pair(), brand: { title: 'Portal Secreto' }, ...fast });
    const n = names(r.files);
    expect(n.some((x) => x.startsWith('p/'))).toBe(false);
    expect(n).not.toContain('publish-report.json');
    expect(n.filter((x) => x.startsWith('data/')).every((x) => !/Raiz|Filho/.test(x))).toBe(true);
    for (const [name, data] of r.files) {
      const body = typeof data === 'string' ? data : '';
      if (!/\.(html|js|json)$/.test(name) || name.startsWith('assets/')) continue;
      expect(body, name).not.toMatch(/Criar fatura|Processo filho|Processo raiz|EA00|EAMABI|Analista/);
    }
    const html = text(r.files, 'index.html');
    const m = JSON.parse(html.match(/<script type="application\/json" id="ps-manifest">([\s\S]*?)<\/script>/)![1]!);
    expect(m.locked).toMatchObject({ iter: 1000 });
    expect(m.sealed).toMatchObject({ e: 1 });
    expect(m.processes).toBeUndefined();
    expect(m.title).toBe('Portal Secreto'); // título e logo são públicos (tela de senha)
  });

  it('é determinístico também protegido; senha curta é recusada', async () => {
    const a = await publish({ models: pair(), ...fast });
    const b = await publish({ models: [...pair()].reverse(), ...fast });
    for (const [k, v] of a.files) expect(b.files.get(k), k).toEqual(v);
    await expect(publish({ models: pair(), password: 'curta', viewer })).rejects.toThrow(/8 caracteres/);
  });

  it('senha diferente => conteúdo diferente; versions.json cifrado volta com a senha certa e falha com a errada', async () => {
    const a = await publish({ models: pair(), ...fast });
    const other = await publish({ models: pair(), ...fast, password: 'outra frase longa' });
    expect(text(a.files, names(a.files).find((x) => x.startsWith('data/search.'))!)).not.toBe(text(other.files, names(other.files).find((x) => x.startsWith('data/search.'))!));
    const raw = JSON.parse(text(a.files, 'versions.json'));
    expect(isSealedFile(raw)).toBe(true);
    const v = JSON.parse(unsealFile(PW, raw)) as VersionsFile;
    expect(v.versions[0]!.version).toBe(1);
    expect(() => unsealFile('senha errada qualquer', raw)).toThrow(/senha incorreta/);
    // a 2ª publicação continua o histórico a partir do arquivo decifrado
    const next = pair().map((m) => (m.id === 'Filho' ? updateNode(m, 'a', { name: 'Outro nome' }) : m));
    const b = await publish({ models: next, ...fast, previousVersions: v });
    expect((JSON.parse(unsealFile(PW, JSON.parse(text(b.files, 'versions.json')))) as VersionsFile).versions.map((x) => x.version)).toEqual([1, 2]);
  });
});
