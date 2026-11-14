// Account, cloud sync and shared-topic routes. Everything here talks to Supabase with
// the visitor's own session, so Row Level Security in the database decides what each
// person may read or change (see supabase/schema.sql). The server adds no extra powers.
import {readSupabaseConfig, usableConfig} from './supabase.mjs';
import {createClient} from './supabase-client.mjs';
import {CATEGORIES} from './public/topics.js';

const FORMATS = ['for-against', 'group', 'mun'];
const CATEGORY_IDS = CATEGORIES.map(c => c.id);
const SETUP_HINT = 'The database tables are missing. Run supabase/schema.sql in the Supabase SQL editor (see START HERE.txt).';
const fail = (status, message) => Object.assign(new Error(message), {status});
const missingTable = error => ['PGRST205', '42P01'].includes(error?.code);
function dbError(error) {
  if (missingTable(error)) return fail(503, SETUP_HINT);
  if (error?.code === '42501') return fail(403, 'Your account is not allowed to do that.');
  if (error?.code === 'PGRST301' || /jwt/i.test(error?.message || '')) return fail(401, 'Your sign-in has expired. Sign in again.');
  return fail(502, 'Supabase could not finish the request. Try again in a moment.');
}

async function currentUser(supabase) {
  const {data, error} = await supabase.auth.getSession();
  const token = !error && data?.session?.access_token; if (!token) return null;
  try { const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); return claims.sub ? {id: claims.sub, email: claims.email || ''} : null; } catch { return null; }
}
async function accountState(supabase) {
  const user = await currentUser(supabase);
  if (!user) return {configured: true, signedIn: false};
  const {data, error} = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (error && !missingTable(error)) {
    if (error.code === 'PGRST301' || /jwt/i.test(error.message || '')) return {configured: true, signedIn: false};
    return {configured: true, signedIn: true, userId: user.id, email: user.email, role: 'student', schema: true, problem: 'Could not load your account details from Supabase just now.'};
  }
  return {configured: true, signedIn: true, userId: user.id, email: user.email, role: data?.role === 'teacher' ? 'teacher' : 'student', schema: !error, problem: error ? SETUP_HINT : ''};
}
function credentials(data) {
  const email = typeof data?.email === 'string' ? data.email.trim().toLowerCase() : '', password = typeof data?.password === 'string' ? data.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw fail(400, 'Enter a valid email address.');
  if (password.length < 6 || password.length > 200) throw fail(400, 'The password needs at least 6 characters.');
  return {email, password};
}
function sessionRow(userId, item) {
  const id = typeof item?.id === 'string' ? item.id : '', updatedAt = Number(item?.updatedAt);
  if (!id || id.length > 80 || !Number.isFinite(updatedAt) || updatedAt < 0) throw fail(400, 'Invalid session.');
  if (item.deleted === true) return {user_id: userId, id, type: 'practice', topic: '', format: '', status: 'deleted', updated_at: Math.round(updatedAt), deleted: true, data: null};
  const data = item.data;
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.id !== id || !['practice', 'research'].includes(data.type)) throw fail(400, 'Invalid session.');
  const text = value => typeof value === 'string' ? value.slice(0, 300) : '';
  return {user_id: userId, id, type: data.type, topic: text(data.topic), format: text(data.format), status: text(data.status), updated_at: Math.round(updatedAt), deleted: false, data};
}

const SETTING_KEYS = ['preferences', 'setup', 'bg.core', 'bg.glass', 'bg.marigold'];
function settingsData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(400, 'Invalid settings.');
  const out = {};
  for (const key of SETTING_KEYS) {
    const v = value[key]; if (v == null) continue;
    if (key.startsWith('bg.') ? typeof v === 'string' && v.startsWith('data:image/') : typeof v === 'object' && !Array.isArray(v)) out[key] = v; else throw fail(400, 'Invalid settings.');
  }
  return out;
}

// The app is for signed-in people only. Used by the server before AI and voice requests.
// Returns '' when the visitor is signed in, otherwise the reason to show them.
export async function signInProblem(req, res, root) { return (await signedInUser(req, res, root)).problem; }
// Same check, but also hands back who is signed in ({id, email}) when someone is.
export async function signedInUser(req, res, root) {
  const config = readSupabaseConfig(root);
  if (!usableConfig(config)) return {user: null, problem: 'Sign-in is not set up on this computer yet. See START HERE.txt.'};
  const jar = []; let user = null;
  try { user = await currentUser(createClient(config, req, jar)); } catch {}
  if (jar.length) res.setHeader('Set-Cookie', jar);
  return {user, problem: user ? '' : 'Sign in to use Debate Buddy.'};
}

// Returns false when the request is not for this module.
export async function handleCloud(req, res, url, {root, readJson}) {
  const route = url.pathname;
  if (!(route === '/api/account' || route.startsWith('/api/account/') || route.startsWith('/api/cloud/') || route === '/api/topics/shared')) return false;
  const jar = [];
  const send = (status, data) => { const headers = {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}; if (jar.length) headers['Set-Cookie'] = jar; res.writeHead(status, headers); res.end(JSON.stringify(data)); };
  const config = readSupabaseConfig(root);
  if (!usableConfig(config)) { if (route === '/api/account' && req.method === 'GET') send(200, {configured: false, signedIn: false}); else send(503, {error: 'Supabase is not set up on this computer. See START HERE.txt.'}); return true; }
  try {
    const supabase = createClient(config, req, jar);
    const body = limit => readJson(req, limit);
    const requireUser = async () => { const user = await currentUser(supabase); if (!user) throw fail(401, 'Sign in first (Settings > Account).'); return user; };

    if (route === '/api/account' && req.method === 'GET') return send(200, await accountState(supabase)), true;
    if (route === '/api/account/sign-in' && req.method === 'POST') {
      const {error} = await supabase.auth.signInWithPassword(credentials(await body(2000)));
      if (error) throw fail(error.status === 400 ? 400 : 502, error.status === 400 ? (/confirm/i.test(error.message) ? 'Confirm your email first: open the link Supabase emailed you, then sign in.' : 'Wrong email or password.') : 'Could not reach Supabase to sign in. Check the internet connection.');
      return send(200, await accountState(supabase)), true;
    }
    if (route === '/api/account/sign-up' && req.method === 'POST') {
      const {data, error} = await supabase.auth.signUp(credentials(await body(2000)));
      if (error) throw fail(error.status && error.status < 500 ? 400 : 502, error.status && error.status < 500 ? String(error.message || 'Could not create the account.').slice(0, 200) : 'Could not reach Supabase to create the account.');
      if (!data?.session) return send(200, {configured: true, signedIn: false, needsConfirmation: true}), true;
      return send(200, await accountState(supabase)), true;
    }
    if (route === '/api/account/sign-out' && req.method === 'POST') { await supabase.auth.signOut({scope: 'local'}); return send(200, {configured: true, signedIn: false}), true; }

    if (route === '/api/cloud/index' && req.method === 'GET') {
      await requireUser();
      const {data, error} = await supabase.from('debate_sessions').select('id,updated_at,deleted').order('updated_at', {ascending: false}).limit(2000);
      if (error) throw dbError(error);
      return send(200, {items: data.map(r => ({id: r.id, updatedAt: Number(r.updated_at), deleted: !!r.deleted}))}), true;
    }
    if (route === '/api/cloud/pull' && req.method === 'POST') {
      await requireUser();
      const ids = (await body(20000))?.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > 20 || ids.some(id => typeof id !== 'string' || !id || id.length > 80)) throw fail(400, 'Invalid request.');
      const {data, error} = await supabase.from('debate_sessions').select('id,updated_at,data').in('id', ids).eq('deleted', false);
      if (error) throw dbError(error);
      return send(200, {items: data.filter(r => r.data).map(r => ({id: r.id, updatedAt: Number(r.updated_at), data: r.data}))}), true;
    }
    if (route === '/api/cloud/push' && req.method === 'POST') {
      const user = await requireUser();
      const row = sessionRow(user.id, await body(4_000_000));
      const {error} = await supabase.from('debate_sessions').upsert(row, {onConflict: 'user_id,id'});
      if (error) throw dbError(error);
      return send(200, {saved: true}), true;
    }

    if (route === '/api/cloud/settings') {
      const user = await requireUser();
      if (req.method === 'GET') {
        const {data, error} = await supabase.from('user_settings').select('updated_at,data').eq('user_id', user.id).maybeSingle();
        if (error) throw dbError(error);
        return send(200, {data: data?.data || null, updatedAt: Number(data?.updated_at || 0)}), true;
      }
      if (req.method === 'POST') {
        const input = await body(3_000_000);
        const {error} = await supabase.from('user_settings').upsert({user_id: user.id, updated_at: Date.now(), data: settingsData(input?.data)}, {onConflict: 'user_id'});
        if (error) throw dbError(error);
        return send(200, {saved: true}), true;
      }
    }

    if (route === '/api/topics/shared') {
      await requireUser();
      if (req.method === 'GET') {
        const {data, error} = await supabase.from('shared_topics').select('id,text,category,formats').order('created_at', {ascending: false}).limit(500);
        if (error) throw dbError(error);
        return send(200, {topics: data.map(t => ({id: t.id, text: t.text, category: CATEGORY_IDS.includes(t.category) ? t.category : 'society', formats: (t.formats || []).filter(f => FORMATS.includes(f))}))}), true;
      }
      if (req.method === 'POST') {
        const data = await body(4000);
        const text = typeof data?.text === 'string' ? data.text.replace(/\s+/g, ' ').trim() : '';
        const formats = Array.isArray(data?.formats) ? [...new Set(data.formats.filter(f => FORMATS.includes(f)))] : [];
        if (text.length < 3 || text.length > 300) throw fail(400, 'A topic needs between 3 and 300 characters.');
        if (!CATEGORY_IDS.includes(data?.category)) throw fail(400, 'Choose a category.');
        if (!formats.length) throw fail(400, 'Choose at least one format.');
        const {error} = await supabase.from('shared_topics').insert({text, category: data.category, formats});
        if (error) throw error.code === '42501' ? fail(403, 'Only teacher accounts can add shared topics.') : dbError(error);
        return send(200, {saved: true}), true;
      }
      if (req.method === 'DELETE') {
        const id = url.searchParams.get('id') || '';
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw fail(400, 'Invalid topic.');
        const {data, error} = await supabase.from('shared_topics').delete().eq('id', id).select('id');
        if (error) throw dbError(error);
        if (!data.length) throw fail(403, 'Only teacher accounts can remove shared topics.');
        return send(200, {deleted: true}), true;
      }
    }
    send(405, {error: 'Method not allowed'});
  } catch (error) {
    if (res.headersSent) { res.end(); return true; }
    send(error.status || 502, {error: error.status ? error.message : 'Could not reach Supabase. Check the internet connection.'});
  }
  return true;
}
