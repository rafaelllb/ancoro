// [2026-10-26] Criado: monta um histórico de alterações realista no REQ-003 do banco DESCARTÁVEL de gravação — Rafael Brito
// Por quê: o seed demo não tem nenhuma alteração registrada, então a abertura do trailer ("quando o requisito foi modificado?")
// mostraria o histórico vazio. As alterações abaixo são feitas pela API de verdade (cada uma gera ChangeLog com usuário e de→para);
// só a DATA é recuada (-12 d, -5 d, -2 d) direto no banco descartável para a linha do tempo fazer sentido.
// Só use contra o ambiente de gravação (scripts/e2e/process-studio-env.sh) — nunca contra demo/QA/produção.
// Uso: chamado por record-trailer.js (ou: node seed-history.js)
const path = require('path');

const API = process.env.ANCORO_API || 'http://localhost:3100';
const root = path.resolve(__dirname, '..', '..');

async function call(method, url, token, body) {
  const res = await fetch(API + url, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}
const login = async email => (await call('POST', '/api/auth/login', null, { email, password: 'demo123' })).token;

module.exports = async function seedHistory(reqCode = 'REQ-003') {
  if (!/localhost:3100/.test(API)) throw new Error('seed-history só roda contra o ambiente de gravação (localhost:3100)');
  const [maria, rafael] = await Promise.all([login('maria.santos@ancoro.com'), login('rafael.brito@ancoro.com')]);
  const projects = await call('GET', '/api/projects', rafael);
  const proj = (Array.isArray(projects) ? projects : projects.projects).find(p => /S\/4 HANA Utilities/.test(p.name));
  const reqs = await call('GET', `/api/projects/${proj.id}/requirements`, rafael);
  const req = (Array.isArray(reqs) ? reqs : reqs.requirements).find(r => r.reqId === reqCode);
  if (!req) throw new Error(reqCode + ' não encontrado');

  const { PrismaClient } = require(path.join(root, 'backend', 'node_modules', '@prisma', 'client'));
  const prisma = new PrismaClient({ datasources: { db: { url: 'file:' + path.join(root, 'backend', 'prisma', 'e2e.db').replace(/\\/g, '/') } } });
  try {
    if (await prisma.changeLog.count({ where: { requirementId: req.id } }) > 0) throw new Error(reqCode + ' já tem histórico: rode "process-studio-env.sh reset" antes');

    // 1) Maria (consultora responsável) reabre o requisito após o workshop; 2) ajusta o SLA do TO-BE; 3) Rafael (gerente) revalida
    await call('PATCH', `/api/requirements/${req.id}`, maria, { status: 'IN_PROGRESS' });
    await call('PATCH', `/api/requirements/${req.id}`, maria, { howMuchToBe: '~150 contratos/mês, ciclo < 2 dias' });
    await call('PATCH', `/api/requirements/${req.id}`, rafael, { status: 'VALIDATED' });

    // recua as datas (ordem cronológica preservada)
    const logs = await prisma.changeLog.findMany({ where: { requirementId: req.id }, orderBy: { createdAt: 'asc' } });
    const daysAgo = [12, 5, 2];
    for (let i = 0; i < logs.length; i++) {
      const d = new Date(Date.now() - daysAgo[Math.min(i, daysAgo.length - 1)] * 86400000);
      await prisma.changeLog.update({ where: { id: logs[i].id }, data: { createdAt: d } });
    }
    console.log(`histórico de ${reqCode}: ${logs.length} registros (${logs.map(l => l.field).join(', ')})`);
  } finally { await prisma.$disconnect(); }
};

if (require.main === module) module.exports().catch(e => { console.error(e.message); process.exit(1); });
