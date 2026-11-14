// Optional account and cloud sync. The page never talks to Supabase itself and never sees
// a key or a token: it calls the local Debate Buddy server, which holds the session in
// HttpOnly cookies. Without an account everything keeps working from this browser only.
const KEY = name => 'debatebuddy.cloud.' + name;
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(KEY(key))) ?? fallback; } catch { return fallback; } }
function store(key, value) { try { localStorage.setItem(KEY(key), JSON.stringify(value)); } catch {} }

// A fingerprint of a session's content (its timestamp aside), used to tell what changed since the last sync.
function fingerprint(session) {
  const {updatedAt, ...rest} = session; const text = JSON.stringify(rest);
  let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36) + ':' + text.length;
}

// Looks and preferences that follow the account: colours, background, theme, interface,
// voice choice and practice defaults such as difficulty. Uploaded background photos too, when small enough.
const SETTING_KEYS = ['preferences', 'setup', 'bg.core', 'bg.glass', 'bg.marigold'];
const stable = value => Array.isArray(value) ? '[' + value.map(stable).join(',') + ']' : value && typeof value === 'object' ? '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}' : JSON.stringify(value ?? null);
function mark(value) { const text = stable(value); let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return (h >>> 0).toString(36) + ':' + text.length; }
function collectSettings() {
  const out = {};
  for (const key of SETTING_KEYS) { try { const raw = localStorage.getItem('debatebuddy.' + key); if (raw == null) continue; if (key.startsWith('bg.')) { if (raw.startsWith('data:image/')) out[key] = raw; } else { const v = JSON.parse(raw); if (v && typeof v === 'object') out[key] = v; } } catch {} }
  // Very large photos stay on this device so the rest of the settings still sync.
  if (stable(out).length > 2_500_000) for (const key of SETTING_KEYS) if (key.startsWith('bg.')) delete out[key];
  return out;
}
function writeSettings(data) {
  for (const key of SETTING_KEYS) { try { const v = data[key]; if (v == null) continue; /* e.g. a photo too large to sync stays where it is */ localStorage.setItem('debatebuddy.' + key, key.startsWith('bg.') ? v : JSON.stringify(v)); } catch {} }
}

async function api(path, {method = 'GET', body} = {}) {
  let response, data = {};
  try { response = await fetch(path, {method, cache: 'no-store', headers: body ? {'Content-Type': 'application/json'} : undefined, body: body ? JSON.stringify(body) : undefined}); }
  catch { throw Object.assign(new Error('The local Debate Buddy server is not responding.'), {status: 0}); }
  try { data = await response.json(); } catch {}
  if (!response.ok) throw Object.assign(new Error(data.error || 'The request could not finish.'), {status: response.status});
  return data;
}

// hooks: sessions() -> array, protectedIds() -> Set, apply({upserts, remove, clear}), persist(), onState(state), onTopics(list), onSettings()
export function createCloud(hooks) {
  let account = {configured: false, signedIn: false, checking: true};
  let syncing = false, again = false, timer = null, lastSync = 0, lastError = '', blocked = '', settingsBusy = false, settingsProblem = '';
  const ready = () => account.signedIn && account.schema !== false && !blocked;
  const state = () => ({...account, syncing, lastSync, lastError: lastError || settingsProblem, blocked});
  const emit = () => hooks.onState(state());

  // A different person signing in on this browser must not inherit the last person's history.
  function adoptOwner() {
    blocked = '';
    if (!account.signedIn) return;
    const owner = load('owner', null);
    if (owner && owner.id !== account.userId) {
      const synced = load('synced', {});
      const unsynced = hooks.sessions().some(s => synced[s.id] !== fingerprint(s)) || load('tombstones', []).length > 0;
      if (unsynced) { blocked = `This browser still holds history from ${owner.email || 'another account'} that has not been synced. Sign in as that account to sync it, or export or delete it under "Your data". Until then nothing is synced for this account.`; return; }
      hooks.apply({clear: true}); store('synced', {}); store('tombstones', []); store('settingsMark', null);
    }
    store('owner', {id: account.userId, email: account.email});
  }
  async function loadTopics() {
    if (!ready()) return;
    try { const {topics} = await api('/api/topics/shared'); store('topics', topics); hooks.onTopics(topics); } catch {}
  }
  async function afterAccount() {
    adoptOwner(); emit();
    if (!account.signedIn) { if (!account.offline) { store('topics', []); hooks.onTopics([]); } return; }
    if (await syncSettings(true)) return;   // the page is reloading with this account's settings
    await sync(); await loadTopics();
  }
  // first = just signed in or just opened: the account's saved settings win unless this
  // browser's settings were changed since they were last synced. Returns true when the
  // account's settings were written to this browser and the page must reload to show them.
  async function syncSettings(first = false) {
    if (!ready() || settingsBusy) return false;
    settingsBusy = true;
    try {
      const local = collectSettings(), here = mark(local), synced = load('settingsMark', null);
      if (first) {
        const remote = await api('/api/cloud/settings');
        if (remote.data) {
          const there = mark(remote.data);
          if (there === here) { store('settingsMark', here); settingsProblem = ''; return false; }
          if (synced === null || synced === here) { writeSettings(remote.data); store('settingsMark', mark(collectSettings())); hooks.onSettings(); return true; }
        }
      }
      if (here !== synced) { await api('/api/cloud/settings', {method: 'POST', body: {data: local}}); store('settingsMark', here); }
      settingsProblem = '';
    } catch (error) { settingsProblem = error.status === 503 ? 'Settings are not synced yet. ' + error.message : ''; }
    finally { settingsBusy = false; }
    return false;
  }
  setInterval(() => { if (!document.hidden) syncSettings(false); }, 5000);
  async function refresh() {
    try { account = await api('/api/account'); } catch { account = {...account, checking: false, offline: true}; emit(); return; }
    await afterAccount();
  }

  async function sync() {
    if (!ready()) return;
    if (syncing) { again = true; return; }
    syncing = true; emit();
    const synced = load('synced', {}), settled = new Set(); let problem = '';
    try {
      const {items} = await api('/api/cloud/index');
      const remote = new Map(items.map(i => [i.id, i])), protect = hooks.protectedIds();
      const local = hooks.sessions(), byId = new Map(local.map(s => [s.id, s]));
      const pull = [], push = [], remove = [];
      // Deletions made here: the cloud still needs to hear about some; the rest are settled.
      const tombs = load('tombstones', []).filter(t => { const r = remote.get(t.id); if (r && !r.deleted) return true; settled.add(t.id); return false; });
      const tombIds = new Set(tombs.map(t => t.id));
      for (const r of items) {
        if (tombIds.has(r.id) || protect.has(r.id)) continue;
        const l = byId.get(r.id), known = l ? synced[l.id] : undefined, changed = l && known !== undefined && known !== fingerprint(l);
        if (r.deleted) { if (!l) continue; if (changed || (known === undefined && (l.updatedAt || 0) > r.updatedAt)) push.push(l); else remove.push(l.id); continue; }
        if (!l) { pull.push(r.id); continue; }
        if (known === undefined) (r.updatedAt >= (l.updatedAt || 0) ? pull : push).push(r.updatedAt >= (l.updatedAt || 0) ? r.id : l);
        else if (changed) push.push(l);                       // edited here since the last sync: this copy wins
        else if (r.updatedAt > (l.updatedAt || 0)) pull.push(r.id); // unchanged here, newer in the cloud
      }
      for (const l of local) if (!remote.has(l.id) && !protect.has(l.id)) push.push(l);

      const upserts = [];
      for (let i = 0; i < pull.length; i += 10) {
        const {items: rows} = await api('/api/cloud/pull', {method: 'POST', body: {ids: pull.slice(i, i + 10)}});
        for (const row of rows) if (row.data && row.data.id === row.id) { row.data.updatedAt = row.updatedAt; upserts.push(row.data); }
      }
      if (upserts.length || remove.length) {
        hooks.apply({upserts, remove});
        const now = new Map(hooks.sessions().map(s => [s.id, s]));
        for (const u of upserts) if (now.has(u.id)) synced[u.id] = fingerprint(now.get(u.id));
        for (const id of remove) delete synced[id];
      }
      let touched = false;
      for (const l of push) {
        const r = remote.get(l.id);
        if (r && (l.updatedAt || 0) <= r.updatedAt) { l.updatedAt = Date.now(); touched = true; }
        const mark = fingerprint(l);
        try { await api('/api/cloud/push', {method: 'POST', body: {id: l.id, updatedAt: l.updatedAt || l.createdAt || Date.now(), data: l}}); synced[l.id] = mark; }
        catch (error) { if (error.status === 401 || error.status === 503 || !error.status) throw error; problem = error.status === 413 ? 'One item is too large to sync and stays on this device only.' : error.message; }
      }
      if (touched) hooks.persist();
      for (const t of tombs) {
        await api('/api/cloud/push', {method: 'POST', body: {id: t.id, updatedAt: t.at, deleted: true}});
        settled.add(t.id); delete synced[t.id];
      }
      lastSync = Date.now(); lastError = problem;
    } catch (error) {
      lastError = error.message;
      if (error.status === 401) { account = {configured: true, signedIn: false}; blocked = ''; }
    } finally {
      // Re-read the list so deletions recorded while this sync was running are kept.
      store('tombstones', load('tombstones', []).filter(t => !settled.has(t.id)));
      store('synced', synced); syncing = false; emit();
      if (again) { again = false; changed(); }
    }
  }

  function changed() { if (!ready()) return; clearTimeout(timer); timer = setTimeout(sync, 3000); }
  // Remember deletions so other devices remove the item too (only once an account has been used here).
  function deleted(ids) {
    if (!load('owner', null)) return;
    const tombs = load('tombstones', []), synced = load('synced', {});
    for (const id of ids) { if (!tombs.some(t => t.id === id)) tombs.push({id, at: Date.now()}); delete synced[id]; }
    store('tombstones', tombs); store('synced', synced); changed();
  }

  return {
    state, refresh, changed, deleted,
    syncNow: sync,
    cachedTopics: () => load('topics', []),
    async signIn(email, password) { account = await api('/api/account/sign-in', {method: 'POST', body: {email, password}}); await afterAccount(); return state(); },
    async signUp(email, password) {
      const result = await api('/api/account/sign-up', {method: 'POST', body: {email, password}});
      if (result.needsConfirmation) return {needsConfirmation: true};
      account = result; await afterAccount(); return state();
    },
    async signOut() {
      clearTimeout(timer); await syncSettings(false); await sync();
      try { await api('/api/account/sign-out', {method: 'POST'}); } finally { account = {configured: account.configured, signedIn: false}; blocked = ''; lastError = ''; store('topics', []); hooks.onTopics([]); emit(); }
    },
    async addTopic(topic) { await api('/api/topics/shared', {method: 'POST', body: topic}); await loadTopics(); },
    async removeTopic(id) { await api('/api/topics/shared?id=' + encodeURIComponent(id), {method: 'DELETE'}); await loadTopics(); }
  };
}
