/**
 * Testes do adaptador standalone (Fase 6): SQLite em memória, mailer em memória, processkit real.
 * Pré-requisito: `npm run build:kit` (vendor/processkit.cjs).
 *
 * [2026-10-16] Criado: login por código/link, papéis, CRUD com concorrência otimista, versões, import, publicação, CSRF — Rafael Brito
 */
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import type { Config } from '../src/config';
import { openDb } from '../src/db';
import { loadKit } from '../src/kit';
import { memoryMailer } from '../src/mailer';

const cfg: Config = {
  production: false, port: 0, baseUrl: 'http://localhost:3200', dataDir: '.', adminEmail: 'admin@t.io', mailFrom: 'x',
  sessionDays: 1, codeMinutes: 10, trustProxy: false, cookieSecure: false, kitPath: '', publicDir: '/nonexistent',
};
const db = openDb(':memory:');
const mailer = memoryMailer();
const { app } = createApp({ cfg, db, mailer, kit: loadKit(new URL('../vendor/processkit.cjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')) });
const H = { 'x-ps-csrf': '1' };

/** Faz o fluxo completo de login por código e devolve o cookie. */
async function login(email: string): Promise<string> {
  const before = mailer.sent.length;
  // zera o throttle de 30 s para testes (o throttle em si é testado à parte)
  db.prepare('DELETE FROM login_challenges WHERE email = ?').run(email);
  await request(app).post('/api/auth/request').set(H).send({ email }).expect(202);
  expect(mailer.sent.length).toBe(before + 1);
  const { code } = mailer.sent[mailer.sent.length - 1]!;
  const r = await request(app).post('/api/auth/verify').set(H).send({ email, code }).expect(200);
  return String(r.headers['set-cookie']![0]).split(';')[0]!;
}
const as = (cookie: string) => ({ ...H, Cookie: cookie });
const cookies: Record<string, string> = {};

beforeAll(async () => {
  cookies.admin = await login('admin@t.io');
  for (const [email, role] of [['editor@t.io', 'EDITOR'], ['editor2@t.io', 'EDITOR'], ['viewer@t.io', 'VIEWER']] as const) {
    await request(app).post('/api/users').set(as(cookies.admin!)).send({ email, role }).expect(201);
  }
  cookies.editor = await login('editor@t.io');
  cookies.editor2 = await login('editor2@t.io');
  cookies.viewer = await login('viewer@t.io');
});

describe('autenticação por código/link', () => {
  it('e-mail desconhecido recebe a MESMA resposta e nada é enviado (sem enumeração)', async () => {
    const n = mailer.sent.length;
    const r = await request(app).post('/api/auth/request').set(H).send({ email: 'ninguem@t.io' });
    expect(r.status).toBe(202);
    expect(mailer.sent.length).toBe(n);
  });

  it('sem sessão => 401; sem cabeçalho anti-CSRF => 403', async () => {
    await request(app).get('/api/processes').expect(401);
    await request(app).post('/api/auth/request').send({ email: 'admin@t.io' }).expect(403);
  });

  it('código errado conta tentativa e após 5 erros o desafio morre (nem o código certo vale)', async () => {
    db.prepare('DELETE FROM login_challenges WHERE email = ?').run('viewer@t.io');
    await request(app).post('/api/auth/request').set(H).send({ email: 'viewer@t.io' });
    const { code } = mailer.sent[mailer.sent.length - 1]!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await request(app).post('/api/auth/verify').set(H).send({ email: 'viewer@t.io', code: wrong }).expect(401);
    await request(app).post('/api/auth/verify').set(H).send({ email: 'viewer@t.io', code }).expect(401);
  });

  it('código é de uso único', async () => {
    db.prepare('DELETE FROM login_challenges WHERE email = ?').run('viewer@t.io');
    await request(app).post('/api/auth/request').set(H).send({ email: 'viewer@t.io' });
    const { code } = mailer.sent[mailer.sent.length - 1]!;
    await request(app).post('/api/auth/verify').set(H).send({ email: 'viewer@t.io', code }).expect(200);
    await request(app).post('/api/auth/verify').set(H).send({ email: 'viewer@t.io', code }).expect(401);
  });

  it('link (token) entra e também é de uso único; throttle de 30 s impede reenvio imediato', async () => {
    db.prepare('DELETE FROM login_challenges WHERE email = ?').run('viewer@t.io');
    await request(app).post('/api/auth/request').set(H).send({ email: 'viewer@t.io' });
    const n = mailer.sent.length;
    await request(app).post('/api/auth/request').set(H).send({ email: 'viewer@t.io' }).expect(202);
    expect(mailer.sent.length).toBe(n); // segundo pedido em < 30 s: ignorado
    const token = decodeURIComponent(mailer.sent[n - 1]!.link.split('token=')[1]!);
    const ok = await request(app).post('/api/auth/verify').set(H).send({ token }).expect(200);
    expect(ok.body.user.email).toBe('viewer@t.io');
    await request(app).post('/api/auth/verify').set(H).send({ token }).expect(401);
  });

  it('código expirado é recusado', async () => {
    db.prepare('DELETE FROM login_challenges WHERE email = ?').run('viewer@t.io');
    await request(app).post('/api/auth/request').set(H).send({ email: 'viewer@t.io' });
    const { code } = mailer.sent[mailer.sent.length - 1]!;
    db.prepare('UPDATE login_challenges SET expires_at = ? WHERE email = ?').run(new Date(Date.now() - 1000).toISOString(), 'viewer@t.io');
    await request(app).post('/api/auth/verify').set(H).send({ email: 'viewer@t.io', code }).expect(401);
  });

  it('logout invalida a sessão; usuário desativado perde o acesso na hora', async () => {
    const c = await login('editor2@t.io');
    await request(app).get('/api/me').set(as(c)).expect(200);
    await request(app).post('/api/auth/logout').set(as(c)).expect(204);
    await request(app).get('/api/me').set(as(c)).expect(401);

    const c2 = await login('editor2@t.io');
    const users = (await request(app).get('/api/users').set(as(cookies.admin!))).body.users as Array<{ id: string; email: string }>;
    const u = users.find((x) => x.email === 'editor2@t.io')!;
    await request(app).patch(`/api/users/${u.id}`).set(as(cookies.admin!)).send({ disabled: true }).expect(204);
    await request(app).get('/api/me').set(as(c2)).expect(401);
    await request(app).patch(`/api/users/${u.id}`).set(as(cookies.admin!)).send({ disabled: false }).expect(204);
  });

  it('não é possível rebaixar/desativar o último administrador', async () => {
    const users = (await request(app).get('/api/users').set(as(cookies.admin!))).body.users as Array<{ id: string; email: string }>;
    const a = users.find((x) => x.email === 'admin@t.io')!;
    await request(app).patch(`/api/users/${a.id}`).set(as(cookies.admin!)).send({ role: 'EDITOR' }).expect(409);
    await request(app).patch(`/api/users/${a.id}`).set(as(cookies.admin!)).send({ disabled: true }).expect(409);
  });

  it('gestão de usuários é só do ADMIN', async () => {
    await request(app).get('/api/users').set(as(cookies.editor!)).expect(403);
    await request(app).post('/api/users').set(as(cookies.editor!)).send({ email: 'x@t.io', role: 'VIEWER' }).expect(403);
  });
});

describe('processos', () => {
  let pid = '';
  let model: any;

  it('EDITOR cria; VIEWER lê mas não cria/edita/versiona/importa/publica', async () => {
    const r = await request(app).post('/api/processes').set(as(cookies.editor!)).send({ name: 'Faturamento' }).expect(201);
    expect(r.body.rev).toBe(1);
    pid = r.body.id;
    const g = await request(app).get(`/api/processes/${pid}`).set(as(cookies.viewer!)).expect(200);
    model = g.body.model;
    expect(g.body.permissions).toEqual({ canEdit: false, canPublish: false });
    await request(app).post('/api/processes').set(as(cookies.viewer!)).send({ name: 'X' }).expect(403);
    await request(app).put(`/api/processes/${pid}`).set(as(cookies.viewer!)).send({ baseRev: 1, model }).expect(403);
    await request(app).post(`/api/processes/${pid}/versions`).set(as(cookies.viewer!)).send({}).expect(403);
    await request(app).post('/api/processes/publish').set(as(cookies.viewer!)).send({}).expect(403);
  });

  it('save incrementa rev e projeta referências; conflito (baseRev velho) => 409', async () => {
    const start = model.nodes[0];
    const next = { ...model, nodes: [{ ...start, requirementRefs: ['REQ-001', 'RF-9'] }, ...model.nodes.slice(1)] };
    const ok = await request(app).put(`/api/processes/${pid}`).set(as(cookies.editor!)).send({ baseRev: 1, model: next }).expect(200);
    expect(ok.body.rev).toBe(2);
    const c = await request(app).put(`/api/processes/${pid}`).set(as(cookies.editor!)).send({ baseRev: 1, model: next }).expect(409);
    expect(c.body.currentRev).toBe(2);
    // todo save grava versão (não só o botão "Versões"); rótulo é opcional
    const afterSave = (await request(app).get(`/api/processes/${pid}/versions`).set(as(cookies.editor!)).expect(200)).body.versions;
    expect(afterSave).toHaveLength(1);
    expect(afterSave[0].label).toBeNull();
    const where = await request(app).get('/api/processes/by-reference/REQ-001').set(as(cookies.viewer!)).expect(200);
    expect(where.body.links).toHaveLength(1);
  });

  it('catálogo de referências: acha as usadas e oferece o texto digitado como novo', async () => {
    const used = await request(app).get('/api/processes/references?q=REQ').set(as(cookies.editor!)).expect(200);
    expect(used.body.requirements.map((r: any) => r.reqId)).toContain('REQ-001');
    const fresh = await request(app).get('/api/processes/references?q=NOVO-7').set(as(cookies.editor!)).expect(200);
    expect(fresh.body.requirements[0]).toMatchObject({ reqId: 'NOVO-7', shortDesc: '(novo)' });
  });

  it('modelo com integridade quebrada => 422 e nada é gravado', async () => {
    const broken = { ...model, flows: [...model.flows, { id: 'F_x', source: 'nao-existe', target: model.nodes[0].id, type: 'sequence' }] };
    const r = await request(app).put(`/api/processes/${pid}`).set(as(cookies.editor!)).send({ baseRev: 2, model: broken });
    expect([400, 422]).toContain(r.status);
    const g = await request(app).get(`/api/processes/${pid}`).set(as(cookies.editor!));
    expect(g.body.rev).toBe(2);
  });

  it('versões: snapshot rotulado, restaurar cria novo save e guarda o estado anterior', async () => {
    const snap = await request(app).post(`/api/processes/${pid}/versions`).set(as(cookies.editor!)).send({ label: 'base' }).expect(201);
    expect(snap.body.version).toBe(1);
    const cur = (await request(app).get(`/api/processes/${pid}`).set(as(cookies.editor!))).body;
    const renamed = { ...cur.model, name: 'Renomeado' };
    await request(app).put(`/api/processes/${pid}`).set(as(cookies.editor!)).send({ baseRev: cur.rev, model: renamed }).expect(200);
    const rest = await request(app).post(`/api/processes/${pid}/versions/1/restore`).set(as(cookies.editor!)).send({}).expect(200);
    expect(rest.body.rev).toBe(cur.rev + 2);
    const after = (await request(app).get(`/api/processes/${pid}`).set(as(cookies.editor!))).body;
    expect(after.name).toBe(cur.name);
    const list = (await request(app).get(`/api/processes/${pid}/versions`).set(as(cookies.editor!))).body.versions;
    expect(list.map((v: any) => v.label)).toContain('Antes de restaurar v1');
  });

  it('exclusão: EDITOR só o que criou; ADMIN qualquer', async () => {
    await request(app).delete(`/api/processes/${pid}`).set(as(cookies.viewer!)).expect(403);
    const mine = (await request(app).post('/api/processes').set(as(cookies.editor!)).send({ name: 'Meu' }).expect(201)).body.id;
    cookies.editor2 = await login('editor2@t.io'); // a sessão antiga foi revogada no teste de desativação
    const theirs = (await request(app).post('/api/processes').set(as(cookies.editor2)).send({ name: 'Do editor2' }).expect(201)).body.id;
    await request(app).delete(`/api/processes/${mine}`).set(as(cookies.editor!)).expect(204);
    await request(app).delete(`/api/processes/${theirs}`).set(as(cookies.editor!)).expect(403);
    await request(app).delete(`/api/processes/${theirs}`).set(as(cookies.admin!)).expect(204);
  });

  it('exporta BPMN e importa de volta (chave única)', async () => {
    const x = await request(app).get(`/api/processes/${pid}/bpmn`).set(as(cookies.viewer!)).expect(200);
    expect(x.text).toContain('<bpmn');
    const imp = await request(app).post('/api/processes/import').set(as(cookies.editor!))
      .send({ kind: 'bpmn', data: Buffer.from(x.text).toString('base64') }).expect(201);
    expect(imp.body.processes).toHaveLength(1);
    await request(app).post('/api/processes/import').set(as(cookies.editor!)).send({ kind: 'bpmn', data: Buffer.from('lixo').toString('base64') }).expect(400);
  });

  it('publica o portal (ZIP) e o contador/histórico sobem', async () => {
    const bin = (res: any, cb: any) => { const ch: Buffer[] = []; res.on('data', (c: Buffer) => ch.push(c)); res.on('end', () => cb(null, Buffer.concat(ch))); };
    const r = await request(app).post('/api/processes/publish').set(as(cookies.editor!)).send({ label: 'R1' }).buffer(true).parse(bin);
    expect(r.status).toBe(200);
    expect((r.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const again = await request(app).post('/api/processes/publish').set(as(cookies.editor!)).send({ label: 'R2' }).buffer(true).parse(bin);
    expect(again.headers['x-portal-publish-count']).toBe('2');
  });
});
