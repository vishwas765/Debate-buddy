// Optional Supabase connection. The project URL and key are read on the server from
// the local .env.local file (or .env, or real environment variables) and are never sent
// to the browser: the page only learns whether the connection works.
// This module reads the settings and checks the project is reachable; supabase-client.mjs
// builds the client and cloud.mjs holds the account, sync and shared-topic routes.
import {readEnv} from './env-file.mjs';

// The NEXT_PUBLIC_ names are accepted too, so lines copied from the Supabase dashboard work as they are.
const URL_NAMES = ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'];
const KEY_NAMES = ['SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_KEY'];

export function readSupabaseConfig(root) {
  const local = readEnv(root);
  const pick = key => String(local[key] || process.env[key] || '').trim().replace(/^["']|["']$/g, '');
  let url = '';
  for (const name of URL_NAMES) { url = pick(name).replace(/\/+$/, ''); if (url) break; }
  let key = '';
  for (const name of KEY_NAMES) { key = pick(name).replace(/^bearer\s+/i, '').replace(/\s+/g, ''); if (key) break; }
  return {url, key};
}

// Secret ("service role") keys bypass Supabase's row-level security. They do not belong
// in an app that runs on students' computers, so they are refused.
export function isSecretKey(key) {
  if (/^sb_secret_/i.test(key)) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'service_role'; } catch { return false; }
}

// True when the settings are complete and safe to use (valid address, not a secret key).
export function usableConfig(config) { return !!(config.url && config.key && parseUrl(config.url) && !isSecretKey(config.key)); }

function parseUrl(value) {
  let url; try { url = new URL(value); } catch { return null; }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  return url;
}

const MESSAGES = {
  'not-configured': 'Not set up. Debate Buddy works without it and keeps everything in this browser.',
  incomplete: 'Only half set up. Both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are needed in the .env.local file.',
  'invalid-url': 'SUPABASE_URL is not a valid address. It should look like https://your-project.supabase.co',
  'secret-key': 'The key in .env.local is a secret (service role) key, so it was not used. Use the anon or publishable key instead.',
  connected: 'Connected.',
  'bad-key': 'Supabase rejected the key. Copy the anon or publishable key again from your project\'s API settings.',
  unreachable: 'Could not reach the Supabase project. Check the internet connection and the project URL.',
  error: 'Supabase answered, but not as expected.'
};

export async function checkSupabase(config, {fetchImpl = fetch, timeoutMs = 8000} = {}) {
  const result = state => ({configured: !['not-configured', 'incomplete'].includes(state), ok: state === 'connected', state, message: MESSAGES[state], host: ''});
  if (!config.url && !config.key) return result('not-configured');
  if (!config.url || !config.key) return result('incomplete');
  const url = parseUrl(config.url);
  if (!url) return result('invalid-url');
  if (isSecretKey(config.key)) return result('secret-key');
  const withHost = state => ({...result(state), host: url.host});
  try {
    // Public auth settings: a small request that only succeeds with a valid project key.
    const response = await fetchImpl(new URL('auth/v1/settings', url.href.replace(/\/?$/, '/')), {headers: {apikey: config.key}, redirect: 'error', signal: AbortSignal.timeout(timeoutMs)});
    try { await response.body?.cancel(); } catch {}
    if (response.ok) return withHost('connected');
    if (response.status === 401 || response.status === 403) return withHost('bad-key');
    return {...withHost('error'), message: `${MESSAGES.error} (status ${response.status}). Check the project URL.`};
  } catch { return withHost('unreachable'); }
}
