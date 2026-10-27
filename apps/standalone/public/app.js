// [2026-10-16] Criado: shell do Process Studio standalone (Fase 6) — login por código/link, lista, editor embutido, usuários — Rafael Brito
// Sem build e sem framework de propósito: o standalone tem de subir com `npm start`. Todo texto vai por textContent (nada de innerHTML).
// A ponte com o editor (iframe) espelha frontend/src/hooks/useProcesses.ts do Ancoro: mesmo protocolo { ps:1, kind, ... }.

const I18N = {
  pt: {
    app: 'Process Studio', loginTitle: 'Entrar', loginHint: 'Enviaremos um código e um link de acesso para o seu e-mail.', email: 'E-mail',
    sendCode: 'Enviar código', code: 'Código de 6 dígitos', enter: 'Entrar', back: 'Voltar', sent: 'Se o e-mail estiver cadastrado, enviamos um código e um link.',
    badCode: 'Código ou link inválido, expirado ou já utilizado.', linkTitle: 'Confirmar acesso', linkBody: 'Clique para concluir o login neste navegador.',
    processes: 'Processos', users: 'Usuários', logout: 'Sair', newProcess: 'Novo processo', importFile: 'Importar .bpmn/.bpm', publish: 'Publicar portal',
    name: 'Nome', updated: 'Atualizado', rev: 'Rev.', refs: 'Vínculos', open: 'Abrir', exportBpmn: 'Exportar', del: 'Excluir', none: 'Nenhum processo ainda.',
    confirmDelete: 'Excluir este processo e seu histórico de versões?', processName: 'Nome do processo', create: 'Criar', cancel: 'Cancelar',
    label: 'Rótulo da publicação (opcional)', password: 'Senha do portal (opcional, mín. 6)', publishing: 'Publicando…', published: 'Portal publicado (ZIP baixado).',
    imported: 'processos importados', warnings: 'avisos', unsaved: 'Há alterações não salvas. Sair mesmo assim?', editorMissing: 'O editor não carregou. Rode `npm run build:editor` em apps/standalone.',
    invite: 'Convidar', role: 'Papel', status: 'Situação', active: 'Ativo', disabled: 'Desativado', lastLogin: 'Último acesso', never: 'nunca',
    ADMIN: 'Administrador', EDITOR: 'Editor', VIEWER: 'Leitor', disable: 'Desativar', enable: 'Reativar', error: 'Erro',
  },
  en: {
    app: 'Process Studio', loginTitle: 'Sign in', loginHint: "We'll email you a sign-in code and link.", email: 'Email',
    sendCode: 'Send code', code: '6-digit code', enter: 'Sign in', back: 'Back', sent: 'If the email is registered, we sent a code and a link.',
    badCode: 'Invalid, expired or already used code or link.', linkTitle: 'Confirm sign-in', linkBody: 'Click to finish signing in on this browser.',
    processes: 'Processes', users: 'Users', logout: 'Sign out', newProcess: 'New process', importFile: 'Import .bpmn/.bpm', publish: 'Publish portal',
    name: 'Name', updated: 'Updated', rev: 'Rev.', refs: 'Links', open: 'Open', exportBpmn: 'Export', del: 'Delete', none: 'No processes yet.',
    confirmDelete: 'Delete this process and its version history?', processName: 'Process name', create: 'Create', cancel: 'Cancel',
    label: 'Release label (optional)', password: 'Portal password (optional, min. 6)', publishing: 'Publishing…', published: 'Portal published (ZIP downloaded).',
    imported: 'processes imported', warnings: 'warnings', unsaved: 'You have unsaved changes. Leave anyway?', editorMissing: 'The editor did not load. Run `npm run build:editor` in apps/standalone.',
    invite: 'Invite', role: 'Role', status: 'Status', active: 'Active', disabled: 'Disabled', lastLogin: 'Last sign-in', never: 'never',
    ADMIN: 'Administrator', EDITOR: 'Editor', VIEWER: 'Viewer', disable: 'Disable', enable: 'Enable', error: 'Error',
  },
};
let lang = (() => { try { return localStorage.getItem('ps_lang') || (navigator.language.startsWith('en') ? 'en' : 'pt'); } catch { return 'pt'; } })();
const t = (k) => I18N[lang][k] ?? k;

// ---------------------------------------------------------------- utilitários
const root = document.getElementById('app');
/** Cria elemento. Atributos: on* viram listeners; filhos string viram texto. */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

class ApiError extends Error {
  constructor(status, message, data) { super(message); this.status = status; this.data = data; }
}
async function api(method, path, body) {
  const res = await fetch(path, {
    method, credentials: 'same-origin',
    headers: { 'x-ps-csrf': '1', ...(body !== undefined && { 'content-type': 'application/json' }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : ct.includes('zip') ? await res.blob() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/verify') { state.me = null; if (!location.hash.startsWith('#/entrar')) location.hash = '#/entrar'; }
    throw new ApiError(res.status, data?.message || res.statusText, data);
  }
  return Object.assign(data instanceof Blob ? { blob: data } : { data }, { headers: res.headers });
}
const get = async (p) => (await api('GET', p)).data;

const state = { me: null, permissions: null, dirty: false };
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString(lang) : t('never'));
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
const toBase64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

function topbar(extra = []) {
  return h('header', { class: 'topbar' },
    h('span', { class: 'brand' }, t('app')),
    h('a', { href: '#/' }, t('processes')),
    state.permissions?.canManageUsers && h('a', { href: '#/usuarios' }, t('users')),
    h('span', { class: 'spacer' }),
    ...extra,
    h('span', { class: 'muted' }, state.me?.email ?? ''),
    h('button', { onClick: () => setLang(lang === 'pt' ? 'en' : 'pt') }, lang === 'pt' ? 'EN' : 'PT'),
    h('button', { onClick: logout }, t('logout')),
  );
}
function setLang(l) { lang = l; try { localStorage.setItem('ps_lang', l); } catch { /* sem storage: ok */ } document.documentElement.lang = l; render(); }
async function logout() { try { await api('POST', '/api/auth/logout'); } catch { /* sessão já inválida */ } state.me = null; location.hash = '#/entrar'; }
const errBox = (e) => h('div', { class: 'msg err', role: 'alert' }, e?.message ?? String(e));

// ---------------------------------------------------------------- telas
function loginView(prefillToken) {
  const msg = h('div', { 'aria-live': 'polite' });
  const show = (text, cls) => msg.replaceChildren(h('div', { class: `msg ${cls || ''}` }, text));
  if (prefillToken) {
    // O link NÃO loga sozinho (scanners de e-mail pré-visitam links): exige o clique.
    const btn = h('button', { class: 'primary', onClick: async () => {
      try { await api('POST', '/api/auth/verify', { token: prefillToken }); await boot(); location.hash = '#/'; } catch { show(t('badCode'), 'err'); }
    } }, t('enter'));
    return h('div', { class: 'page' }, h('div', { class: 'card login' }, h('h1', {}, t('linkTitle')), h('p', {}, t('linkBody')), btn, msg));
  }
  const email = h('input', { type: 'email', required: true, autocomplete: 'email', placeholder: t('email'), 'aria-label': t('email') });
  const code = h('input', { class: 'code', inputmode: 'numeric', maxlength: 6, autocomplete: 'one-time-code', placeholder: '······', 'aria-label': t('code') });
  const codeForm = h('form', { hidden: true, onSubmit: async (e) => {
    e.preventDefault();
    try { await api('POST', '/api/auth/verify', { email: email.value, code: code.value.trim() }); await boot(); location.hash = '#/'; } catch { show(t('badCode'), 'err'); }
  } }, code, h('button', { class: 'primary', type: 'submit' }, t('enter')));
  const form = h('form', { onSubmit: async (e) => {
    e.preventDefault();
    try { await api('POST', '/api/auth/request', { email: email.value }); show(t('sent'), 'ok'); codeForm.hidden = false; code.focus(); } catch (err) { show(err.message, 'err'); }
  } }, email, h('button', { class: 'primary', type: 'submit' }, t('sendCode')));
  return h('div', { class: 'page' }, h('div', { class: 'card login' }, h('h1', {}, t('loginTitle')), h('p', {}, t('loginHint')), form, codeForm, msg));
}

async function listView() {
  const body = h('div', { class: 'wrap' });
  const page = h('div', { class: 'page' }, body);
  const fileInput = h('input', { type: 'file', accept: '.bpm,.bpmn,.xml', hidden: true, onChange: async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const kind = f.name.toLowerCase().endsWith('.bpm') ? 'bpm' : 'bpmn';
      const r = (await api('POST', '/api/processes/import', { kind, data: toBase64(bytes) })).data;
      alert(`${r.processes.length} ${t('imported')}${r.warnings.length ? `, ${r.warnings.length} ${t('warnings')}` : ''}`);
      render();
    } catch (err) { alert(err.message); }
  } });

  const load = async () => {
    let data;
    try { data = await get('/api/processes'); } catch (e) { body.replaceChildren(errBox(e)); return; }
    const canEdit = data.permissions.canEdit;
    const rows = data.processes.map((p) => h('tr', {},
      h('td', {}, h('a', { href: `#/p/${p.id}` }, p.name)),
      h('td', {}, `r${p.rev}`), h('td', {}, String(p.linkCount)), h('td', {}, fmtDate(p.updatedAt)),
      h('td', { class: 'actions' },
        h('a', { href: `/api/processes/${p.id}/bpmn`, download: '' }, t('exportBpmn')),
        p.canDelete && h('button', { class: 'danger', onClick: async () => {
          if (!confirm(t('confirmDelete'))) return;
          try { await api('DELETE', `/api/processes/${p.id}`); load(); } catch (e) { alert(e.message); }
        } }, t('del')),
      )));
    body.replaceChildren(
      h('div', { class: 'toolbar' }, h('h2', {}, t('processes')),
        canEdit && h('button', { class: 'primary', onClick: () => newDialog(load) }, t('newProcess')),
        canEdit && h('button', { onClick: () => fileInput.click() }, t('importFile')),
        data.permissions.canPublish && h('button', { onClick: () => publishDialog() }, t('publish'))),
      h('div', { class: 'card' }, data.processes.length
        ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, t('name')), h('th', {}, t('rev')), h('th', {}, t('refs')), h('th', {}, t('updated')), h('th'))), h('tbody', {}, rows))
        : h('div', { class: 'empty' }, t('none'))),
      fileInput);
  };
  await load();
  return h('div', { style: 'display:contents' }, topbar(), page);
}

function dialog(title, fields, confirmLabel, onConfirm) {
  const inputs = fields.map((f) => h('input', { type: f.type || 'text', id: `f_${f.key}`, ...(f.attrs || {}) }));
  const err = h('div');
  const dlg = h('dialog', {},
    h('h3', {}, title),
    h('form', { method: 'dialog', onSubmit: async (e) => {
      e.preventDefault();
      const values = Object.fromEntries(fields.map((f, i) => [f.key, inputs[i].value]));
      try { await onConfirm(values); dlg.close(); dlg.remove(); } catch (ex) { err.replaceChildren(errBox(ex)); }
    } },
      ...fields.map((f, i) => h('div', { class: 'field' }, h('label', { for: `f_${f.key}` }, f.label), inputs[i])), err,
      h('div', { class: 'actions' }, h('button', { type: 'button', onClick: () => { dlg.close(); dlg.remove(); } }, t('cancel')), h('button', { class: 'primary', type: 'submit' }, confirmLabel))));
  document.body.append(dlg); dlg.showModal(); inputs[0]?.focus();
}
const newDialog = (reload) => dialog(t('newProcess'), [{ key: 'name', label: t('processName'), attrs: { required: true, maxlength: 200 } }], t('create'), async ({ name }) => {
  const r = (await api('POST', '/api/processes', { name })).data;
  location.hash = `#/p/${r.id}`; reload?.();
});
const publishDialog = () => dialog(t('publish'), [
  { key: 'label', label: t('label'), attrs: { maxlength: 120 } },
  { key: 'password', label: t('password'), type: 'password', attrs: { minlength: 6, autocomplete: 'new-password' } },
], t('publish'), async ({ label, password }) => {
  const r = await api('POST', '/api/processes/publish', { ...(label && { label }), ...(password && { password }) });
  download(r.blob, `portal-processos-v${r.headers.get('x-portal-publish-count') ?? '1'}.zip`);
  alert(t('published'));
});

async function usersView() {
  const body = h('div', { class: 'wrap' });
  const load = async () => {
    let data;
    try { data = await get('/api/users'); } catch (e) { body.replaceChildren(errBox(e)); return; }
    const roleSel = (u) => {
      const s = h('select', { 'aria-label': t('role'), onChange: async () => { try { await api('PATCH', `/api/users/${u.id}`, { role: s.value }); } catch (e) { alert(e.message); load(); } } },
        ...['ADMIN', 'EDITOR', 'VIEWER'].map((r) => h('option', { value: r, ...(r === u.role && { selected: true }) }, t(r))));
      return s;
    };
    body.replaceChildren(
      h('div', { class: 'toolbar' }, h('h2', {}, t('users')), h('button', { class: 'primary', onClick: () => inviteDialog(load) }, t('invite'))),
      h('div', { class: 'card' }, h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, t('email')), h('th', {}, t('role')), h('th', {}, t('lastLogin')), h('th', {}, t('status')), h('th'))),
        h('tbody', {}, data.users.map((u) => h('tr', {},
          h('td', {}, u.email), h('td', {}, roleSel(u)), h('td', {}, fmtDate(u.lastLoginAt)),
          h('td', {}, h('span', { class: 'badge' }, u.disabled ? t('disabled') : t('active'))),
          h('td', { class: 'actions' }, h('button', { onClick: async () => { try { await api('PATCH', `/api/users/${u.id}`, { disabled: !u.disabled }); load(); } catch (e) { alert(e.message); } } }, u.disabled ? t('enable') : t('disable')))))))));
  };
  await load();
  return h('div', { style: 'display:contents' }, topbar(), h('div', { class: 'page' }, body));
}
const inviteDialog = (reload) => dialog(t('invite'), [
  { key: 'email', label: t('email'), type: 'email', attrs: { required: true } },
  { key: 'role', label: `${t('role')} (ADMIN / EDITOR / VIEWER)`, attrs: { value: 'EDITOR', required: true, pattern: 'ADMIN|EDITOR|VIEWER' } },
], t('invite'), async ({ email, role }) => { await api('POST', '/api/users', { email, role: role.toUpperCase() }); reload(); });

// ---------------------------------------------------------------- editor embutido + ponte RPC
let bridgeCleanup = null;
async function editorView(processId) {
  const frame = h('iframe', { class: 'editor-frame hidden', title: t('app'), allow: '' });
  const status = h('span', { class: 'muted' });
  const view = h('div', { style: 'display:contents' }, topbar([status]), frame);
  let ready = false;
  const origin = location.origin;
  const post = (msg) => frame.contentWindow?.postMessage({ ps: 1, ...msg }, origin);
  const sendLang = () => post({ kind: 'event', type: 'lang', payload: { lang } });

  const run = async (type, p) => {
    switch (type) {
      case 'process.load': return get(`/api/processes/${processId}`);
      case 'process.save': return (await api('PUT', `/api/processes/${processId}`, { baseRev: p.baseRev, model: p.model })).data;
      case 'process.saveAs': return (await api('POST', '/api/processes', { name: p.name, model: p.model })).data;
      case 'versions.list': return get(`/api/processes/${processId}/versions`);
      case 'versions.snapshot': return (await api('POST', `/api/processes/${processId}/versions`, { label: p?.label })).data;
      // [2026-10-19] Alterado: 'versions.restore' -> 'versions.get' (só leitura; o editor carrega como rascunho, salvar é manual)
      case 'versions.get': return get(`/api/processes/${processId}/versions/${p.version}`);
      case 'requirements.search': return get(`/api/processes/references?q=${encodeURIComponent(p?.q ?? '')}`);
      default: throw new ApiError(400, `unknown request: ${type}`);
    }
  };
  const onMessage = async (e) => {
    // só aceita o próprio iframe e a mesma origem (o editor também verifica a nossa)
    if (e.source !== frame.contentWindow || e.origin !== origin) return;
    const d = e.data;
    if (d?.ps !== 1) return;
    if (d.kind === 'event') {
      if (d.type === 'ready') { ready = true; frame.classList.remove('hidden'); sendLang(); }
      else if (d.type === 'dirty') { state.dirty = !!d.payload?.dirty; status.textContent = state.dirty ? '●' : ''; }
      else if (d.type === 'navigate') {
        state.dirty = false;
        if (d.payload?.processId) location.hash = `#/p/${d.payload.processId}`;
        else if (d.payload?.key) {
          const list = (await get('/api/processes')).processes;
          const target = list.find((p) => p.key === d.payload.key);
          if (target) location.hash = `#/p/${target.id}`;
        }
      }
      return;
    }
    if (d.kind !== 'req') return;
    try { post({ kind: 'res', id: d.id, ok: true, data: await run(d.type, d.payload) }); }
    catch (err) { post({ kind: 'res', id: d.id, ok: false, error: { status: err.status ?? 500, message: err.message ?? 'error', data: err.data } }); }
  };
  window.addEventListener('message', onMessage);
  const beforeUnload = (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  bridgeCleanup = () => { window.removeEventListener('message', onMessage); window.removeEventListener('beforeunload', beforeUnload); state.dirty = false; };

  frame.src = `/editor/index.html?host=1&origin=${encodeURIComponent(origin)}&lang=${lang}`;
  // Se o editor não foi compilado o servidor devolve o shell dentro do iframe e o "ready" nunca chega.
  setTimeout(() => { if (!ready) { status.textContent = ''; view.append(h('div', { class: 'msg err', role: 'alert' }, t('editorMissing'))); } }, 8000);
  return view;
}

// ---------------------------------------------------------------- roteamento
async function boot() {
  try {
    const me = await get('/api/me');
    state.me = me.user; state.permissions = me.permissions;
  } catch { state.me = null; state.permissions = null; }
}

async function render() {
  bridgeCleanup?.(); bridgeCleanup = null;
  const [path, query] = location.hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query || '');
  if (!state.me && !(path || '').startsWith('/entrar')) { location.hash = '#/entrar'; return; }
  let view;
  try {
    if (path.startsWith('/entrar')) view = loginView(params.get('token'));
    else if (path === '/usuarios' && state.permissions?.canManageUsers) view = await usersView();
    else if (path.startsWith('/p/')) view = await editorView(path.slice(3));
    else view = await listView();
  } catch (e) { view = h('div', { class: 'page' }, errBox(e)); }
  root.replaceChildren(view);
}

window.addEventListener('hashchange', (e) => {
  // não deixa sair do editor com alterações não salvas
  if (state.dirty && !confirm(t('unsaved'))) { history.replaceState(null, '', e.oldURL); return; } // replaceState não dispara hashchange
  state.dirty = false; render();
});
document.documentElement.lang = lang;
await boot();
if (state.me && (!location.hash || location.hash.startsWith('#/entrar') && !new URLSearchParams(location.hash.split('?')[1] || '').get('token'))) location.hash = '#/';
render();
