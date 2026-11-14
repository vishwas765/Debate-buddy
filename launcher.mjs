// Starts Debate Buddy's local server (or reuses a running copy) and opens the browser.
// Shared by Windows (START Debate Buddy.cmd), macOS (Start Debate Buddy.command)
// and Linux (Start Debate Buddy.sh). Paths are built with path.join only.
import {spawn} from 'node:child_process';
import {mkdirSync, openSync, closeSync, writeFileSync, readFileSync, realpathSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import net from 'node:net';
import {resolveChrome, appBundleOf} from './runtime-locator.mjs';

const APP_ID = 'debate-buddy';
const root = path.dirname(fileURLToPath(import.meta.url));
const work = path.join(root, 'work');
const instanceId = createHash('sha256').update(realpathSync(root)).digest('hex').slice(0, 24);
const options = new Set(process.argv.slice(2));
const DEFAULT_PORT = 8350;

async function statusAt(port) {
  try { const response = await fetch(`http://127.0.0.1:${port}/api/status`, {signal: AbortSignal.timeout(1500)}); return response.ok ? await response.json() : null; } catch { return null; }
}
const entry = 'server.mjs';
const build = createHash('sha256').update(readFileSync(path.join(root, entry))).digest('hex').slice(0, 16);
const ours = status => status?.appId === APP_ID && status.instanceId === instanceId;
const current = status => ours(status) && status.build === build;
// An older copy from this folder (for example before an update) is stopped and replaced.
async function replaceOutdated(port) {
  console.log('An older Debate Buddy server is running. Restarting it with the updated version…');
  try { await fetch(`http://127.0.0.1:${port}/api/shutdown`, {method: 'POST', signal: AbortSignal.timeout(2000)}); } catch {}
  for (let i = 0; i < 10 && await statusAt(port); i++) await new Promise(r => setTimeout(r, 300));
  if (await statusAt(port)) { try { const pid = Number(readFileSync(path.join(work, 'server.pid'), 'utf8')); if (pid) process.kill(pid); } catch {} }
  for (let i = 0; i < 20 && await statusAt(port); i++) await new Promise(r => setTimeout(r, 300));
  if (await statusAt(port)) throw new Error('The older Debate Buddy server could not be stopped. Restart the computer, then start Debate Buddy again.');
}
async function freePort(port) { return new Promise(resolve => { const server = net.createServer(); server.once('error', () => resolve(false)); server.listen(port, '127.0.0.1', () => server.close(() => resolve(true))); }); }

async function launchBrowser(browser, url) {
  let command, args;
  if (process.platform === 'darwin') {
    // `open -a` reuses a running browser and works from Finder-launched Terminal windows.
    const bundle = appBundleOf(browser);
    command = 'open'; args = bundle ? ['-a', bundle, url] : [url];
  } else if (browser) { command = browser; args = [url]; }
  else if (process.platform === 'win32') { command = 'rundll32.exe'; args = ['url.dll,FileProtocolHandler', url]; }
  else { command = 'xdg-open'; args = [url]; }
  try {
    await new Promise((resolve, reject) => { const child = spawn(command, args, {detached: true, stdio: 'ignore', windowsHide: true}); child.once('error', reject); child.once('spawn', () => { child.unref(); resolve(); }); });
    if (!browser) console.log('Chrome or Edge was not found, so the default browser was opened. Chrome or Edge is recommended for dictation.');
  } catch { console.log('Could not open a browser automatically. Open this address yourself: ' + url); }
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required. Use the supplied click-to-start launcher.');
  let previous; try { previous = JSON.parse(readFileSync(path.join(work, 'launcher.json'), 'utf8')).port; } catch {}
  // A second click opens the running app without restarting anything.
  if (!options.has('--diagnose')) {
    for (const candidate of [...new Set([previous, Number(process.env.PORT || DEFAULT_PORT)].filter(p => Number.isInteger(p) && p >= 1024 && p <= 65535))]) {
      const running = await statusAt(candidate);
      if (ours(running) && !current(running)) { await replaceOutdated(candidate); continue; }
      if (current(running)) {
        const url = `http://localhost:${candidate}/`; console.log('Already running: ' + url);
        if (!options.has('--no-browser')) await launchBrowser(resolveChrome(), url);
        return;
      }
    }
  }
  const browser = resolveChrome();
  if (options.has('--diagnose')) {
    console.log(JSON.stringify({platform: `${process.platform}-${process.arch}`, node: process.version, ai: 'Vercel AI Gateway (configure AI_GATEWAY_API_KEY for local use)', browser: browser || 'default browser fallback', folder: root}, null, 2));
    return;
  }
  console.log('Debate Buddy · starting');
  console.log('AI uses Vercel AI Gateway. Local AI needs AI_GATEWAY_API_KEY in .env.local.');
  mkdirSync(work, {recursive: true});
  const requested = Number(process.env.PORT || DEFAULT_PORT);
  if (!Number.isInteger(requested) || requested < 1024 || requested > 65525) throw new Error('PORT must be a number between 1024 and 65525.');
  let port, existing = false;
  for (const candidate of [...new Set([previous, ...Array.from({length: 10}, (_, i) => requested + i)].filter(p => Number.isInteger(p) && p >= 1024 && p <= 65535))]) {
    const status = await statusAt(candidate);
    if (ours(status) && !current(status)) { await replaceOutdated(candidate); if (await freePort(candidate)) { port = candidate; break; } continue; }
    if (current(status)) { port = candidate; existing = true; break; }
    if (!status && await freePort(candidate)) { port = candidate; break; }
  }
  if (!port) throw new Error('No free local port was found. Close an older copy or set PORT.');
  if (!existing) {
    const stdout = openSync(path.join(work, 'server.log'), 'a'), stderr = openSync(path.join(work, 'server-error.log'), 'a');
    const env = {...process.env, PATH: path.dirname(process.execPath) + path.delimiter + (process.env.PATH || ''), PORT: String(port)};
    const child = spawn(process.execPath, [path.join(root, entry)], {cwd: root, env, detached: true, windowsHide: true, stdio: ['ignore', stdout, stderr]});
    await new Promise((resolve, reject) => { child.once('error', reject); child.once('spawn', resolve); });
    closeSync(stdout); closeSync(stderr); child.unref();
    writeFileSync(path.join(work, 'server.pid'), String(child.pid));
    let ready = false;
    for (let i = 0; i < 80; i++) { if (current(await statusAt(port))) { ready = true; break; } await new Promise(resolve => setTimeout(resolve, 300)); }
    if (!ready) throw new Error('The server did not start. Open work/server-error.log in the Debate Buddy folder for details.');
  }
  const url = `http://localhost:${port}/`;
  writeFileSync(path.join(work, 'launcher.json'), JSON.stringify({port, url}, null, 2));
  console.log((existing ? 'Already running: ' : 'Ready: ') + url);
  if (!options.has('--no-browser')) await launchBrowser(browser, url);
}
main().catch(error => { console.error('\nCould not start: ' + error.message); console.error('Keep the extracted folder together. See START HERE.txt for help.'); process.exitCode = 1; });
