import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import http from 'node:http';
import {readFileSync, writeFileSync, mkdirSync, realpathSync, statSync} from 'node:fs';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {validateChatPayload} from './request-validation.mjs';
import {readVoiceConfig, voiceStatus, streamSpeech, listVoices, testVoice} from './tts.mjs';
import {setEnvValue} from './env-file.mjs';
import {readSupabaseConfig, checkSupabase} from './supabase.mjs';
import {handleCloud, signInProblem, signedInUser} from './cloud.mjs';
import {askAi, allowQuestion, streamDebate, readAiConfig} from './ai.mjs';
import {appInstructions, buildPrompt} from './debate-coach.mjs';

const APP_ID = 'debate-buddy';
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8350);
const instanceId = createHash('sha256').update(realpathSync(root)).digest('hex').slice(0, 24);
const build = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex').slice(0, 16);
let busy = false, ttsActive = 0;

// Optional Supabase connection (see supabase.mjs). Checked on demand and cached briefly;
// the key stays on the server.
let supabaseState = null, supabaseCheckedAt = 0, supabaseProbe = null;
async function supabaseStatus(force = false) {
  if (!force && supabaseState && Date.now() - supabaseCheckedAt < 60000) return supabaseState;
  if (supabaseProbe) return supabaseProbe;
  supabaseProbe = checkSupabase(readSupabaseConfig(root)).then(state => { supabaseState = state; supabaseCheckedAt = Date.now(); return state; }).finally(() => { supabaseProbe = null; });
  return supabaseProbe;
}
const supabasePublic = (state, lan) => ({configured: state.configured, ok: state.ok, state: state.state, message: state.message, host: lan ? '' : state.host});

async function readJsonBody(req, limit) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('Expected JSON.'), {status: 415});
  let body = ''; for await (const chunk of req) { body += chunk; if (body.length > limit) throw Object.assign(new Error('Request too large.'), {status: 413}); }
  try { return JSON.parse(body || '{}'); } catch { throw Object.assign(new Error('Invalid request.'), {status: 400}); }
}
const json = (res, status, data) => { res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(data)); };
const engineState = () => readAiConfig(root).apiKey || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL === '1' ? 'ready' : 'missing';

// ---------- Phone access ----------
// The computer keeps running the server. When the user turns phone
// access on, a second listener opens on the local network (Wi-Fi). Every phone
// request needs the secret key from the QR code; it is then kept in a cookie.
const phoneFile = path.join(root, 'work', 'phone.json');
let phone = {enabled: false, token: '', port: 0};
try { phone = {...phone, ...JSON.parse(readFileSync(phoneFile, 'utf8')), port: 0}; } catch {}
let phoneServer = null;
const savePhone = () => { try { mkdirSync(path.dirname(phoneFile), {recursive: true}); writeFileSync(phoneFile, JSON.stringify({enabled: phone.enabled, token: phone.token}), {mode: 0o600}); } catch {} };
function lanAddresses() {
  const list = [];
  for (const [name, nets] of Object.entries(os.networkInterfaces())) for (const n of nets || []) {
    if (n.internal || (n.family !== 'IPv4' && n.family !== 4) || n.address.startsWith('169.254.')) continue;
    const local = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address);
    if (/^(docker|br-|veth|vmnet|vboxnet|utun|tailscale)/i.test(name) && !/tailscale/i.test(name)) continue;
    list.push({address: n.address, name, local});
  }
  return list.sort((a, b) => b.local - a.local);
}
const phoneInfo = () => ({enabled: phone.enabled && !!phoneServer, starting: phone.enabled && !phoneServer, port: phone.port, links: phone.port ? lanAddresses().map(a => ({...a, url: `http://${a.address}:${phone.port}/?key=${phone.token}`})) : []});
async function startPhone() {
  if (phoneServer) return;
  if (!phone.token) phone.token = randomBytes(18).toString('base64url');
  for (let candidate = port + 1; candidate < port + 12; candidate++) {
    const listener = http.createServer((req, res) => handleRequest(req, res, {lan: true}).catch(error => { if (!res.headersSent) json(res, error.status || 500, {error: error.status ? error.message : 'The request could not finish.'}); else res.end(); }));
    const ok = await new Promise(resolve => { listener.once('error', () => resolve(false)); listener.listen(candidate, '0.0.0.0', () => resolve(true)); });
    if (ok) { phoneServer = listener; phone.port = candidate; phone.enabled = true; savePhone(); return; }
  }
  throw Object.assign(new Error('No free network port was found for phone access.'), {status: 500});
}
function stopPhone() { phoneServer?.close(); phoneServer = null; phone.port = 0; phone.enabled = false; savePhone(); }
const sameSecret = value => { const a = Buffer.from(String(value || '')), b = Buffer.from(phone.token || '-'); return a.length === b.length && timingSafeEqual(a, b); };
const cookieKey = req => /(?:^|;\s*)db_phone=([^;]+)/.exec(req.headers.cookie || '')?.[1];
const PHONE_LOCKED = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Debate Buddy</title><body style="font:17px/1.5 system-ui,sans-serif;background:#000;color:#eee;padding:32px;max-width:480px;margin:auto"><h1 style="font-size:24px">Debate Buddy</h1><p>This link needs the phone key. On your computer, open Debate Buddy, go to <b>Settings &gt; Use on your phone</b>, and scan the QR code again.</p></body>`;

export async function handleRequest(req, res, {lan = false} = {}) {
  const url = new URL(req.url, 'http://localhost');
  const origin = req.headers.origin;
  if (lan) {
    if (!phoneServer) return json(res, 403, {error: 'Phone access is off.'});
    if (url.searchParams.has('key')) {
      if (!sameSecret(url.searchParams.get('key'))) { res.writeHead(401, {'Content-Type': 'text/html; charset=utf-8'}); return res.end(PHONE_LOCKED); }
      res.writeHead(302, {'Set-Cookie': `db_phone=${phone.token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`, Location: '/', 'Cache-Control': 'no-store'}); return res.end();
    }
    if (!sameSecret(cookieKey(req))) { if (url.pathname.startsWith('/api/')) return json(res, 401, {error: 'Scan the phone QR code again.'}); res.writeHead(401, {'Content-Type': 'text/html; charset=utf-8'}); return res.end(PHONE_LOCKED); }
    if (origin && origin !== 'http://' + req.headers.host) return json(res, 403, {error: 'Invalid origin'});
    // Settings that change the computer stay on the computer.
    if (url.pathname.startsWith('/api/phone') || url.pathname.startsWith('/api/settings/elevenlabs-key')) return json(res, 403, {error: 'Change this on the computer running Debate Buddy.'});
  } else {
    if (process.env.VERCEL === '1') {
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      if (!host || (origin && origin !== `${protocol}://${host}`)) return json(res, 403, {error: 'Invalid origin'});
    } else {
      if (!['localhost:' + port, '127.0.0.1:' + port].includes(req.headers.host)) return json(res, 403, {error: 'Invalid host'});
      if (origin && !['http://localhost:' + port, 'http://127.0.0.1:' + port].includes(origin)) return json(res, 403, {error: 'Invalid origin'});
    }
  }
  const openingPage = req.method === 'GET' && url.pathname === '/' && req.headers['sec-fetch-mode'] === 'navigate';
  if (req.headers['sec-fetch-site'] === 'cross-site' && !openingPage) return json(res, 403, {error: 'Local same-origin requests only.'});

  if (req.method === 'GET' && url.pathname === '/api/status') {
    const engine = engineState();
    return json(res, 200, {remote: lan, hosted: process.env.VERCEL === '1', appId: APP_ID, app: 'Debate Buddy', instanceId, build, connected: engine === 'ready', busy, engine, platform: process.platform, voice: voiceStatus(readVoiceConfig(root))});
  }
  if (url.pathname === '/api/supabase' && ['GET', 'POST'].includes(req.method)) {
    // POST asks for a fresh check (the Settings button); GET uses the cached result.
    return json(res, 200, supabasePublic(await supabaseStatus(req.method === 'POST' && !lan), lan));
  }
  // Account, cloud sync and shared topics (cloud.mjs). Each visitor acts with their own sign-in.
  if (await handleCloud(req, res, url, {root, readJson: readJsonBody})) return;
  if (url.pathname === '/api/phone') {
    if (process.env.VERCEL === '1') return json(res, 404, {error: 'Phone access is not available on the hosted app.'});
    if (req.method === 'POST') {
      let data; try { data = await readJsonBody(req, 1000); } catch (error) { return json(res, error.status || 400, {error: error.message}); }
      try {
        if (data.reset) { phone.token = randomBytes(18).toString('base64url'); savePhone(); }
        if (data.enabled === true) await startPhone(); else if (data.enabled === false) stopPhone();
      } catch (error) { return json(res, error.status || 500, {error: error.message}); }
    }
    return json(res, 200, phoneInfo());
  }
  if (req.method === 'POST' && url.pathname === '/api/shutdown' && process.env.VERCEL !== '1') {
    if (lan) return json(res, 403, {error: 'Not allowed from the phone.'});
    json(res, 200, {stopping: true}); setTimeout(stop, 100); return;
  }
  if (req.method === 'POST' && url.pathname === '/api/reconnect') {
    const engine = engineState();
    return json(res, 200, {connected: engine === 'ready', engine});
  }
  const readJson = async limit => {
    if (!req.headers['content-type']?.startsWith('application/json')) throw Object.assign(new Error('Expected JSON.'), {status: 415});
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > limit) throw Object.assign(new Error('Request too large.'), {status: 413}); }
    try { return JSON.parse(body); } catch { throw Object.assign(new Error('Invalid request.'), {status: 400}); }
  };
  const saveSetting = (key, value) => { try { setEnvValue(root, key, value); } catch { throw Object.assign(new Error('Could not save the setting. Check that the app folder is writable.'), {status: 500}); } };

  // ---------- Optional ElevenLabs voice for reading AI turns aloud ----------
  if (req.method === 'POST' && url.pathname === '/api/settings/elevenlabs-key') {
    if (process.env.VERCEL === '1') return json(res, 404, {error: 'Set ELEVENLABS_API_KEY in the Vercel project Environment Variables.'});
    let data; try { data = await readJson(2048); } catch (error) { return json(res, error.status || 400, {error: error.message}); }
    const apiKey = typeof data?.apiKey === 'string' ? data.apiKey.trim().replace(/^bearer\s+/i, '').replace(/\s+/g, '') : '';
    if (!apiKey || apiKey.length > 256) return json(res, 400, {error: 'Enter a valid ElevenLabs API key.'});
    try { saveSetting('ELEVENLABS_API_KEY', apiKey); } catch (error) { return json(res, error.status, {error: error.message}); }
    let check; try { check = {ok: (await testVoice(readVoiceConfig(root))).ok}; } catch (error) { check = {ok: false, error: error.message, code: error.code}; }
    return json(res, 200, {saved: true, check, voice: voiceStatus(readVoiceConfig(root))});
  }
  if (req.method === 'POST' && url.pathname === '/api/settings/elevenlabs-test') {
    try { await testVoice(readVoiceConfig(root)); return json(res, 200, {ok: true, voice: voiceStatus(readVoiceConfig(root))}); }
    catch (error) { return json(res, 200, {ok: false, error: error.message, code: error.code || ''}); }
  }
  // Ask AI: one question, one answer, through the Vercel AI Gateway (ai.mjs). Signed-in people only.
  if (req.method === 'POST' && url.pathname === '/api/ask') {
    const {user, problem} = await signedInUser(req, res, root);
    if (!user) return json(res, 401, {error: problem});
    let data; try { data = await readJsonBody(req, 8000); } catch (error) { return json(res, error.status || 400, {error: error.message}); }
    const question = typeof data?.question === 'string' ? data.question.trim() : '';
    if (question.length < 3 || question.length > 2000) return json(res, 400, {error: 'Type a question between 3 and 2,000 characters.'});
    if (!allowQuestion(user.id)) return json(res, 429, {error: 'You have asked a lot of questions in a short time. Wait a few minutes and try again.'});
    const controller = new AbortController(); res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try { return json(res, 200, await askAi(root, question, controller.signal)); }
    catch (error) { if (res.destroyed) return; return json(res, error.status && error.status !== 499 ? error.status : 502, {error: error.status ? error.message : 'The AI could not answer. Try again.'}); }
  }
  // AI and voice requests are for signed-in people only (the page shows a sign-in screen first).
  if (req.method === 'POST' && ['/api/tts', '/api/chat'].includes(url.pathname)) { const problem = await signInProblem(req, res, root); if (problem) return json(res, 401, {error: problem}); }
  if (req.method === 'POST' && url.pathname === '/api/tts') {
    let data; try { data = await readJson(30000); } catch (error) { return json(res, error.status || 400, {error: error.message}); }
    for (let waited = 0; ttsActive >= 2 && waited < 20000 && !res.destroyed; waited += 100) await new Promise(r => setTimeout(r, 100));
    if (res.destroyed) return;
    ttsActive++; const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      const audio = streamSpeech(data?.text, readVoiceConfig(root), controller.signal), first = await audio.next();
      if (!res.destroyed) {
        res.writeHead(200, {'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
        await pipeline(Readable.from((async function* () { try { if (!first.done) yield first.value; yield* audio; } finally { await audio.return(); } })()), res, {signal: controller.signal});
      } else await audio.return();
    } catch (error) { if (!res.destroyed) { if (res.headersSent) res.destroy(); else json(res, error.status || 502, {error: error.message, code: error.code || ''}); } }
    finally { ttsActive--; }
    return;
  }

  // ---------- Debate turns, hints, reviews and research ----------
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    let data; try { data = validateChatPayload(await readJson(600000)); } catch (error) { return json(res, error.status || 400, {error: error.message}); }
    const {user} = await signedInUser(req, res, root);
    if (!user) return json(res, 401, {error: 'Sign in to use Debate Buddy.'});
    if (!allowQuestion(user.id)) return json(res, 429, {error: 'You have made a lot of AI requests in a short time. Wait a few minutes and try again.'});
    res.writeHead(200, {'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
    const send = x => { if (!res.destroyed) res.write(JSON.stringify(x) + '\n'); };
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    send({type: 'status', phase: 'reading', text: data.kind === 'research' ? (data.web ? 'Planning searches…' : 'Preparing your brief…') : data.kind === 'research-ask' ? 'Reading your question…' : 'Reading the round…'});
    try {
      const result = streamDebate(root, data, controller.signal);
      let text = '', searches = 0;
      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          text += part.text || part.textDelta || '';
          send({type: 'draft', itemId: 'reply', text});
        } else if (part.type === 'tool-call') {
          searches++;
          send({type: 'status', phase: 'searching', text: 'Searching reliable sources…'});
        } else if (part.type === 'tool-result') {
          send({type: 'status', phase: 'reasoning', text: 'Reviewing the sources…'});
        } else if (part.type === 'error') {
          throw part.error || new Error('The AI could not finish this request.');
        }
      }
      if (!text.trim()) throw new Error('The AI returned an empty answer. Try again.');
      send({type: 'message', itemId: 'reply', text: text.trim()});
      send({type: 'meta', webSearches: searches});
    } catch (error) {
      const message = String(error?.message || 'The AI could not finish this request.').replace(/\b(vck|sk|key)_[A-Za-z0-9_-]{8,}/g, '[key hidden]').slice(0, 400);
      if (!controller.signal.aborted) send({type: 'error', text: message});
    } finally { send({type: 'done'}); res.end(); }
    return;
  }

  if (req.method !== 'GET') return json(res, 405, {error: 'Method not allowed'});
  // Any non-hidden file inside public/ with a known type can be served; nothing outside it.
  const types = {html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', woff2: 'font/woff2', svg: 'image/svg+xml', png: 'image/png', json: 'application/json', txt: 'text/plain; charset=utf-8'};
  const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
  const publicRoot = path.join(root, 'public'), target = path.resolve(publicRoot, relative), ext = path.extname(target).slice(1).toLowerCase();
  if (!target.startsWith(publicRoot + path.sep) || relative.split(/[\\/]/).some(part => part.startsWith('.') || !part) || !types[ext]) return json(res, 404, {error: 'Not found'});
  let stat; try { stat = statSync(target); } catch { return json(res, 404, {error: 'Not found'}); }
  if (!stat.isFile()) return json(res, 404, {error: 'Not found'});
  res.writeHead(200, {'Content-Type': types[ext], 'Cache-Control': ext === 'woff2' || relative.startsWith('vendor/') ? 'public, max-age=86400' : 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer'});
  res.end(readFileSync(target));
}
const server = http.createServer((req, res) => { handleRequest(req, res).catch(error => { if (res.destroyed) return; if (res.headersSent) res.end(JSON.stringify({type: 'error', text: 'The request could not finish. Please retry.'}) + '\n'); else json(res, error.status || 500, {error: error.status ? error.message : 'The request could not finish. Please retry.'}); }); });

export default function vercelHandler(req, res) {
  return handleRequest(req, res).catch(error => {
    if (res.destroyed) return;
    if (res.headersSent) res.end(JSON.stringify({type: 'error', text: 'The request could not finish. Please retry.'}) + '\n');
    else json(res, error.status || 500, {error: error.status ? error.message : 'The request could not finish. Please retry.'});
  });
}

if (process.env.VERCEL !== '1') {
  server.listen(port, '127.0.0.1', () => console.log(`Debate Buddy: http://localhost:${port} | AI ${engineState()}`));
  if (phone.enabled) startPhone().then(() => console.log('Phone access on port ' + phone.port)).catch(error => console.error(error.message));
  function stop() { phoneServer?.close(); server.close(() => process.exit()); setTimeout(() => process.exit(), 1500).unref(); }
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
