// Debate Buddy: topic discovery, research workspaces, practice sessions with an
// AI opponent or simulated participants, reviews, progress and history.
// Visual systems (looks, cursor, motion) are shared with the Core, Glass and Marigold interfaces.
import './cursor.js';
import {initMotion} from './motion.js';
import {initLooks} from './looks.js';
import {loadWorkspace, saveWorkspace} from './storage.js';
import {createCloud} from './cloud.js';
import {renderRich} from './results.js';
import {CATEGORIES, TOPICS, COMMITTEES, COUNTRIES, shuffle} from './topics.js';
import {offlineWorkspace} from './research-offline.js';
import {Reader, Dictation, dictationSupported} from './voice.js';
import {Face} from './face.js';
import {countryCode, flagUrl} from './flags.js';

const gsap = window.gsap;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const KEY = name => 'debatebuddy.' + name;
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(KEY(key))) ?? fallback; } catch { return fallback; } }
function store(key, value) { try { localStorage.setItem(KEY(key), JSON.stringify(value)); } catch {} }
// Phones reach the app over plain http on the Wi-Fi, where randomUUID is unavailable.
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
const REMOTE = !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
document.documentElement.dataset.remote = String(REMOTE);
const reduced = () => !!prefs.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Vocabulary ----------
const FORMAT = {'for-against': 'For / Against', group: 'Group Discussion', mun: 'Model United Nations'};
const FORMAT_SHORT = {'for-against': 'For / Against', group: 'Group Discussion', mun: 'MUN'};
const DIFFICULTY = {
  beginner: {label: 'Beginner', points: ['Plain vocabulary and one point per turn', 'Gentle rebuttals that leave you an opening', 'Short, slower turns', 'A coaching tip after every AI turn']},
  intermediate: {label: 'Intermediate', points: ['Standard debate vocabulary (mechanism, impact, weighing)', 'Up to two points per turn with evidence', 'Direct rebuttals of your strongest point', 'Coaching only when you seem stuck']},
  advanced: {label: 'Advanced', points: ['Precise, technical language and layered arguments', 'Hard rebuttals aimed at your weakest link', 'Brisk pace and challenges to your evidence', 'No coaching unless you ask for a hint']}
};
const DIFFICULTY_FORMAT = {
  'for-against': {beginner: 'Simple arguments; only your main claim is rebutted.', intermediate: 'Arguments with clear mechanisms and impacts.', advanced: 'Pre-empts your best responses; uses framing and burdens.'},
  group: {beginner: 'Friendly participants who ask you easy, direct questions.', intermediate: 'Participants push back on weak reasoning.', advanced: 'Sophisticated participants who challenge evidence and assumptions.'},
  mun: {beginner: 'Simplified procedure explained by the Chair; cooperative delegates.', intermediate: 'Standard procedure; loose blocs that need real compromise.', advanced: 'Full procedural realism, hard bargaining and conflicting red lines.'}
};
const MUN_ACTIVITIES = {opening: 'Opening statements', 'moderated-caucus': 'Moderated caucus', 'unmoderated-caucus': 'Unmoderated caucus', poi: 'Points of information', negotiation: 'Bloc negotiation', 'draft-resolution': 'Draft resolution', closing: 'Closing statements and vote'};
const SCORE_KEYS = {'for-against': ['clarity', 'evidence', 'rebuttal', 'listening', 'structure', 'delivery'], group: ['clarity', 'evidence', 'listening', 'collaboration', 'structure', 'delivery'], mun: ['diplomacy', 'policy', 'evidence', 'negotiation', 'speaking', 'procedure']};
const SCORE_LABEL = {clarity: 'Argument clarity', evidence: 'Evidence', rebuttal: 'Rebuttal', listening: 'Listening', structure: 'Structure', delivery: 'Delivery (written)', collaboration: 'Collaboration', diplomacy: 'Diplomacy', policy: 'Policy consistency', negotiation: 'Negotiation', speaking: 'Speaking (written)', procedure: 'Procedure'};
const HINTS = {mun: [['point', 'A point to raise'], ['response', 'A response to the last speaker'], ['motion', 'A procedural motion']], other: [['point', 'A next point'], ['rebuttal', 'A rebuttal']]};
const CHAIR = /^(moderator|chair|coach|opposition|debate buddy)$/i;

// ---------- State ----------
let prefs = Object.assign({theme: 'dark', ui: 'core', cursor: true, reducedMotion: false, readAloud: 'browser'}, load('preferences', {}) || {});
if (!prefs.narrationV2) { prefs.narrationV2 = true; if (prefs.readAloud === 'off') prefs.readAloud = 'browser'; store('preferences', prefs); }
let selection = Object.assign({topic: '', format: '', category: 'all', committee: ''}, load('selection', {}) || {});
let setup = Object.assign({format: 'for-against', topic: '', side: '', rounds: 4, opener: 'user', participants: 3, groupRounds: 5, committee: '', country: '', delegates: '', munOpener: 'user', activity: 'opening', speakingTime: 90, responseLength: 'standard', difficulty: 'intermediate'}, load('setup', {}) || {});
let researchForm = Object.assign({topic: '', format: 'for-against', side: '', committee: '', country: '', web: true}, load('research', {}) || {});
const restored = await loadWorkspace();
let sessions = Array.isArray(restored.state?.sessions) ? restored.state.sessions : [];
let activePracticeId = restored.state?.activePracticeId || null, activeResearchId = restored.state?.activeResearchId || null;
let view = 'debate', busy = false, controller = null, engine = 'checking', historyFilter = 'all';
// Topics a teacher has shared (only when signed in). They are listed before the built-in samples.
let cloud = null, sharedTopics = [];
const allTopics = () => [...sharedTopics, ...TOPICS];
let suggestionOrder = shuffle(TOPICS), saveRevision = 0, unsavedWrites = 0, saveFailed = false;
const practice = () => sessions.find(s => s.id === activePracticeId && s.type === 'practice') || null;
const researchSession = () => sessions.find(s => s.id === activeResearchId && s.type === 'research') || null;
// A request interrupted by a refresh is marked as such instead of looking stuck.
for (const s of sessions) { if (s.status === 'running') s.status = s.text ? 'done' : 'failed'; if (s.status === 'reviewing') s.status = 'active'; }

function save(fromCloud = false) {
  const revision = ++saveRevision; unsavedWrites++;
  saveWorkspace({version: 1, sessions, activePracticeId, activeResearchId}).then(() => {
    if (revision === saveRevision) { saveFailed = false; $('#saveWarning').hidden = true; }
  }).catch(() => {
    saveFailed = true; $('#saveWarning').hidden = false;
    $('#saveWarningText').textContent = 'Your latest changes are not saved. Keep this tab open, export a backup, then retry.';
  }).finally(() => { unsavedWrites--; });
  $('#historyCount').textContent = sessions.length;
  if (fromCloud !== true) cloud?.changed();
}
$('#retrySave').onclick = () => save();
$('#saveWarningExport').onclick = () => $('#exportData').click();
window.addEventListener('beforeunload', event => { if (saveFailed || unsavedWrites) { event.preventDefault(); event.returnValue = ''; } });

function toast(text) {
  const t = $('#toast'); t.textContent = text; t.hidden = false;
  if (gsap && !reduced()) gsap.fromTo(t, {y: 12, opacity: 0}, {y: 0, opacity: 1, duration: .25, ease: 'power3.out'});
  clearTimeout(toast.timer); toast.timer = setTimeout(() => t.hidden = true, 4500);
}
function confirmAction(title, text, ok = 'Confirm') {
  const dialog = $('#confirmDialog'); $('#confirmTitle').textContent = title; $('#confirmText').textContent = text; $('#confirmOk').textContent = ok;
  dialog.returnValue = ''; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), {once: true}));
}
function radioGroup(container, attr, value, onChange) {
  const buttons = [...container.querySelectorAll('[role=radio]')];
  const paint = v => buttons.forEach(b => { const on = b.dataset[attr] === v; b.setAttribute('aria-checked', String(on)); b.tabIndex = on || (!buttons.some(x => x.dataset[attr] === v) && b === buttons[0]) ? 0 : -1; });
  buttons.forEach((b, i) => {
    b.onclick = () => { paint(b.dataset[attr]); onChange(b.dataset[attr]); };
    b.onkeydown = e => {
      const step = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[e.key]; if (!step) return;
      e.preventDefault(); const next = buttons[(i + step + buttons.length) % buttons.length]; next.focus(); next.click();
    };
  });
  paint(value); return paint;
}
const timeOf = t => new Date(t).toLocaleString(undefined, {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
const clip = (text, n) => text.length > n ? text.slice(0, n - 1).trimEnd() + '…' : text;

// ---------- Views ----------
const VIEWS = ['debate', 'research', 'practice', 'ask', 'topics', 'progress', 'history', 'settings'];
function setView(next, {focus = false} = {}) {
  if (!VIEWS.includes(next)) next = 'debate';
  view = next; document.body.dataset.view = next; store('view', next);
  if (location.hash.slice(1) !== next) history.replaceState(null, '', next === 'debate' ? location.pathname : '#' + next);
  for (const v of VIEWS) $('#' + v + 'Panel').hidden = v !== next;
  $$('.tab').forEach(t => t.dataset.view === next ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current'));
  if (next === 'practice') renderPractice();
  if (next === 'research') renderResearchView();
  if (next === 'progress') renderProgress();
  if (next === 'history') renderHistory();
  if (next === 'topics') renderLibrary();
  if (next === 'settings') { supabaseStatus(); paintAccount(); }
  updateDock(); updateBrief();
  if (focus) $('#' + next + 'Panel h2')?.focus?.();
  if (gsap && !reduced()) gsap.fromTo($('#' + next + 'Panel'), {opacity: 0, y: 8}, {opacity: 1, y: 0, duration: .3, ease: 'power3.out'});
}
$$('.tab').forEach(t => t.addEventListener('click', () => setView(t.dataset.view)));
$$('.panel-head h2').forEach(h => h.tabIndex = -1);
window.addEventListener('hashchange', () => { const v = location.hash.slice(1) || 'debate'; if (v !== view) setView(v); });

// ---------- The brief strip ----------
function updateBrief() {
  const s = view === 'practice' ? practice() : null;
  const live = s && s.status !== 'ended';
  const src = live || (s && view === 'practice') ? {...s.settings, topic: s.topic, format: s.format} : view === 'research' ? {topic: $('#researchTopic').value || researchForm.topic, format: researchForm.format, side: researchForm.side, country: researchForm.country} : view === 'practice' ? setup : selection;
  $('#briefFormat').textContent = src.format ? FORMAT_SHORT[src.format] : 'Not chosen';
  $('#briefTopic').textContent = src.topic || 'No topic chosen yet';
  $('#briefTopic').title = src.topic || '';
  const showSide = src.format === 'for-against' && (view === 'practice' || src.side);
  const showCountry = src.format === 'mun' && src.country;
  $('#briefSideItem').hidden = !(showSide || showCountry);
  $('#briefSideLabel').textContent = showCountry ? 'Country' : 'Your side';
  $('#briefSide').textContent = showCountry ? src.country : src.side === 'for' ? 'For' : src.side === 'against' ? 'Against' : 'Not chosen';
  $('#briefLevelItem').hidden = !['practice', 'debate'].includes(view);
  $('#briefLevel').textContent = DIFFICULTY[src.difficulty || setup.difficulty]?.label || 'Intermediate';
  const rounds = s?.format === 'mun' ? 0 : s?.settings.rounds;
  $('#briefRoundItem').hidden = !(live && s);
  if (live && s) {
    if (s.format === 'mun') { $('#briefRoundLabel').textContent = 'Activity'; $('#briefRound').textContent = MUN_ACTIVITIES[s.settings.activity]; }
    else { $('#briefRoundLabel').textContent = 'Round'; $('#briefRound').textContent = `${Math.min(s.round || 1, rounds)} of ${rounds}`; }
  }
  $('#timerBox').hidden = !(live && s && s.settings.speakingTime > 0 && view === 'practice');
}

// ---------- Engine status ----------
const ENGINE_TEXT = {ready: 'Vercel AI Gateway is ready.', missing: 'AI is not configured. On Vercel, connect AI Gateway in the Vercel dashboard. For local use, add AI_GATEWAY_API_KEY to .env.local.', unreachable: 'Debate Buddy could not reach its server. Reload the page or start it again with the launcher.', checking: 'Checking…'};
async function status() {
  try {
    const response = await fetch('/api/status', {cache: 'no-store'}); const data = await response.json();
    engine = data.engine || (data.connected ? 'ready' : 'missing');
  } catch { engine = 'unreachable'; }
  $('#settingsStatus').textContent = ENGINE_TEXT[engine];
  paintSystem(); renderSetupNote();
}
function paintSystem() {
  const activity = document.body.dataset.activity;
  $('#systemState').textContent = activity !== 'idle' ? 'AI // ' + activity.toUpperCase() : 'AI GATEWAY // ' + ({ready: 'READY', missing: 'SETUP', unreachable: 'OFFLINE', checking: 'CHECKING'}[engine]);
  $('#systemState').dataset.engine = engine;
}
const setActivity = a => { document.body.dataset.activity = a; paintSystem(); if (!narrator.speaking) face?.setState(a === 'idle' ? 'idle' : a === 'searching' ? 'searching' : a === 'writing' ? 'writing' : 'thinking'); };
// ---------- Optional Supabase connection (status only; the key stays on the server) ----------
async function supabaseStatus(fresh = false) {
  const box = $('#supabaseStatus'), button = $('#checkSupabase'); button.disabled = true;
  if (fresh) box.textContent = 'Checking…';
  try {
    const response = await fetch('/api/supabase', {method: fresh ? 'POST' : 'GET', cache: 'no-store'}); const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    box.textContent = 'Supabase project' + (data.host ? ' ' + data.host : '') + ': ' + data.message; box.dataset.state = data.state;
  } catch { box.textContent = 'Could not check. The local Debate Buddy server is not responding.'; box.dataset.state = 'unreachable'; }
  finally { button.disabled = false; }
}
$('#checkSupabase').onclick = () => supabaseStatus(true);
$('#reconnectEngine').onclick = async () => {
  const button = $('#reconnectEngine'); button.disabled = true;
  try { const response = await fetch('/api/reconnect', {method: 'POST'}); const data = await response.json(); if (!response.ok) throw new Error(data.error); await status(); toast(engine === 'ready' ? 'AI engine connected.' : ENGINE_TEXT[engine]); }
  catch (error) { toast(error.message || 'Could not reconnect.'); } finally { button.disabled = false; }
};

// ---------- Topic discovery (Debate view) ----------
const topicByText = text => allTopics().find(t => t.text.toLowerCase() === String(text).trim().toLowerCase());
function pool() { return selection.category === 'all' ? suggestionOrder : suggestionOrder.filter(t => t.category === selection.category); }
function topicButton(topic, {onPick}) {
  const b = el('button', 'topic-btn'); b.type = 'button';
  b.setAttribute('aria-pressed', String(selection.topic === topic.text));
  b.append(el('span', 'topic-text', topic.text));
  const meta = el('span', 'topic-meta');
  meta.append(el('span', 'topic-cat', CATEGORIES.find(c => c.id === topic.category)?.label || ''));
  if (topic.shared) meta.append(el('span', 'format-tag teacher-tag', 'From your teacher'));
  for (const f of topic.formats) meta.append(el('span', 'format-tag', FORMAT_SHORT[f]));
  b.append(meta); b.onclick = () => onPick(topic); return b;
}
function renderCategories() {
  const box = $('#categoryChips'); box.replaceChildren();
  for (const c of [{id: 'all', label: 'All'}, ...CATEGORIES]) {
    const b = el('button', 'chip', c.label); b.type = 'button'; b.setAttribute('aria-pressed', String(selection.category === c.id));
    b.onclick = () => { selection.category = c.id; store('selection', selection); renderCategories(); renderSuggestions(); };
    box.append(b);
  }
}
function renderSuggestions() {
  const grid = $('#topicGrid'); grid.replaceChildren();
  for (const topic of pool().slice(0, 6)) grid.append(topicButton(topic, {onPick: t => selectTopic(t.text)}));
}
function selectTopic(text, {announce = true} = {}) {
  const t = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300); if (!t) return;
  selection.topic = t; const known = topicByText(t); selection.committee = known?.committee || '';
  store('selection', selection); renderSuggestions(); renderReady(); updateBrief();
  $('#topicInput').value = known ? '' : t;
  if (announce) { $('#formatPicker').scrollIntoView({behavior: reduced() ? 'auto' : 'smooth', block: 'nearest'}); }
}
function renderReady() {
  $$('#formatPicker input').forEach(i => { i.checked = i.value === selection.format; });
  const known = topicByText(selection.topic);
  let text = 'Pick a topic and a format to begin.';
  if (selection.topic && selection.format) {
    text = `Ready: “${clip(selection.topic, 110)}” as ${FORMAT[selection.format]}, ${DIFFICULTY[setup.difficulty].label} level.`;
    if (known && !known.formats.includes(selection.format)) text += ` This topic is usually used for ${known.formats.map(f => FORMAT_SHORT[f]).join(' or ')}, but any format works.`;
  } else if (selection.topic) text = `Topic chosen: “${clip(selection.topic, 110)}”. Now choose a format.`;
  else if (selection.format) text = `${FORMAT[selection.format]} chosen. Now pick or type a topic.`;
  $('#readyText').textContent = text;
  $('#readyBar').dataset.ready = String(!!(selection.topic && selection.format));
  // First-screen difficulty note: format-specific once a format is chosen.
  const level = DIFFICULTY[setup.difficulty] || DIFFICULTY.intermediate;
  $('#homeDifficultyNote').textContent = selection.format ? DIFFICULTY_FORMAT[selection.format][setup.difficulty] + ' You can change this at any time.' : level.points.slice(0, 2).join('. ') + '. You can change this at any time.';
}
$('#topicForm').onsubmit = e => { e.preventDefault(); const v = $('#topicInput').value.trim(); if (!v) { toast('Type a topic or pick a suggestion.'); $('#topicInput').focus(); return; } selectTopic(v); };
$('#refreshTopics').onclick = () => { const shown = new Set(pool().slice(0, 6)); suggestionOrder = [...shuffle(allTopics().filter(t => !shown.has(t))), ...shown]; renderSuggestions(); };
$('#surpriseMe').onclick = () => {
  const options = pool().filter(t => t.text !== selection.topic), pick = options[Math.floor(Math.random() * options.length)] || TOPICS[0];
  suggestionOrder = [pick, ...suggestionOrder.filter(t => t !== pick)];
  selectTopic(pick.text); toast('Surprise topic: ' + clip(pick.text, 80));
};
$$('#formatPicker input').forEach(input => input.addEventListener('change', () => { selection.format = input.value; store('selection', selection); renderReady(); updateBrief(); }));
$('#goPractice').onclick = async () => {
  if (!selection.topic) { toast('Choose a topic first.'); $('#topicInput').focus(); return; }
  if (!selection.format) { toast('Choose a format first.'); $('#formatPicker input').focus(); return; }
  const live = practice();
  if (live && ['active', 'paused'].includes(live.status)) {
    if (!await confirmAction('Set up a new session?', 'Your current session will be paused and stays in History, so you can return to it later.', 'Set up new session')) return;
    pauseSession(true);
  }
  activePracticeId = null; save();
  Object.assign(setup, {topic: selection.topic, format: selection.format}); if (selection.committee) setup.committee = selection.committee;
  store('setup', setup); paintSetup(); setView('practice');
};
$('#goResearch').onclick = () => {
  if (!selection.topic) { toast('Choose a topic first.'); $('#topicInput').focus(); return; }
  Object.assign(researchForm, {topic: selection.topic, format: selection.format || researchForm.format}); if (selection.committee) researchForm.committee = selection.committee;
  store('research', researchForm); activeResearchId = null; paintResearchForm(); setView('research');
};

// ---------- Topics library ----------
function renderLibrary() {
  const box = $('#topicLibrary'), query = $('#topicSearch').value.trim().toLowerCase(); box.replaceChildren();
  let any = false;
  const shared = sharedTopics.filter(t => !query || t.text.toLowerCase().includes(query) || 'from your teacher'.includes(query));
  if (shared.length) {
    any = true;
    const section = el('section', 'library-group'); section.append(el('h3', null, cloud?.state().role === 'teacher' ? 'Shared with students' : 'From your teacher'));
    const list = el('div', 'suggestions topic-grid');
    for (const t of shared) {
      const button = topicButton(t, {onPick: pickFromLibrary});
      if (cloud?.state().role !== 'teacher') { list.append(button); continue; }
      const wrap = el('div', 'shared-topic'), remove = el('button', 'ghost', 'Remove'); remove.type = 'button'; remove.setAttribute('aria-label', 'Remove shared topic: ' + clip(t.text, 80));
      remove.onclick = async () => { if (!await confirmAction('Remove this shared topic?', `“${clip(t.text, 80)}” will disappear for every student.`, 'Remove')) return; try { await cloud.removeTopic(t.id); toast('Shared topic removed.'); } catch (error) { toast(error.message); } };
      wrap.append(button, remove); list.append(wrap);
    }
    section.append(list); box.append(section);
  }
  for (const c of CATEGORIES) {
    const items = TOPICS.filter(t => t.category === c.id && (!query || t.text.toLowerCase().includes(query) || c.label.toLowerCase().includes(query)));
    if (!items.length) continue; any = true;
    const section = el('section', 'library-group'); const h = el('h3', null, c.label); section.append(h);
    const list = el('div', 'suggestions topic-grid');
    for (const t of items) list.append(topicButton(t, {onPick: pickFromLibrary}));
    section.append(list); box.append(section);
  }
  if (!any) box.append(el('p', 'empty', 'No suggested topics match. You can still debate it: type it in the box above.'));
}
function pickFromLibrary(t) {
  selectTopic(t.text, {announce: false});
  if (!selection.format || !t.formats.includes(selection.format)) { selection.format = t.formats[0]; store('selection', selection); renderReady(); }
  setView('debate'); toast('Topic selected. Check the format, then set up practice or research.');
  requestAnimationFrame(() => $('#formatPicker').scrollIntoView({block: 'center', behavior: reduced() ? 'auto' : 'smooth'}));
}
$('#topicSearch').oninput = renderLibrary;
$('#browseTopics').onclick = () => setView('topics');
$('#openProgress').onclick = () => setView('progress');
$('#customTopicForm').onsubmit = e => { e.preventDefault(); const v = $('#customTopic').value.trim(); if (!v) return; $('#customTopic').value = ''; selectTopic(v, {announce: false}); setView('debate'); toast('Custom topic selected. Now choose a format.'); };

// ---------- Streaming requests ----------
const historyFor = messages => messages.filter(m => ['user', 'assistant', 'review'].includes(m.role) && m.text).map(m => ({role: m.role === 'user' ? 'user' : 'assistant', text: m.text})).slice(-60);
async function stream({kind, session, message = '', chatId, history = [], web = false, onDraft, onMessage, onStatus, onMeta}) {
  controller = new AbortController(); busy = true; setActivity('thinking'); updateDock();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    const response = await fetch('/api/chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, signal: controller.signal, body: JSON.stringify({kind, session, message, chatId, history, web, timeZone})});
    if (!response.ok) { const data = await response.json().catch(() => ({})); if (data.engine) { engine = data.engine; paintSystem(); } throw new Error(data.error || 'Debate Buddy could not reach its AI engine.'); }
    const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = '', received = false, failure = null;
    const consume = line => {
      if (!line.trim()) return; let e; try { e = JSON.parse(line); } catch { return; }
      if (e.type === 'draft') { setActivity('writing'); onDraft?.(e.itemId, e.text || ''); }
      else if (e.type === 'message') { received = true; onMessage?.(e.itemId, e.text || ''); }
      else if (e.type === 'status') { setActivity(e.phase === 'searching' ? 'searching' : 'thinking'); onStatus?.(e.text); }
      else if (e.type === 'meta') onMeta?.(e);
      else if (e.type === 'error') failure = e.text;
    };
    while (true) {
      const {value, done} = await reader.read();
      pending += decoder.decode(value || new Uint8Array(), {stream: !done});
      const lines = pending.split('\n'); pending = lines.pop(); lines.forEach(consume);
      if (done) { consume(pending); break; }
    }
    if (failure) throw new Error(failure);
    if (!received) throw new Error('The connection ended before a reply arrived. Please try again.');
  } finally { busy = false; controller = null; setActivity('idle'); updateDock(); }
}
$('#stopResponse').onclick = () => controller?.abort();

// ---------- Rendering helpers ----------
function tagify(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [];
  while (walker.nextNode()) if (/\[(Verified|Sourced|Analysis|Background)\]/.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const frag = document.createDocumentFragment(); let last = 0; const text = node.nodeValue;
    for (const m of text.matchAll(/\[(Verified|Sourced|Analysis|Background)\]/g)) {
      frag.append(text.slice(last, m.index)); const tag = el('span', 'evidence-tag tag-' + m[1].toLowerCase(), TAG_LABEL[m[1]]); tag.title = TAG_HELP[m[1]]; frag.append(tag); last = m.index + m[0].length;
    }
    frag.append(text.slice(last)); node.replaceWith(frag);
  }
}
const TAG_HELP = {Verified: 'confirmed in an official or primary source opened during this research', Sourced: 'reported by a source that was opened (the link is right after it)', Analysis: "Debate Buddy's own reasoning or advice", Background: 'general knowledge that was not checked: verify it before you use it'};
const TAG_LABEL = {Verified: '✓ Checked', Sourced: 'Source', Analysis: 'Our take', Background: 'Verify'};
function rich(parent, text) { renderRich(parent, text); tagify(parent); return parent; }
const stripJson = text => String(text || '').replace(/```\s*json[\s\S]*?(```|$)/i, '').trim();
function speakerBlocks(text) {
  const blocks = []; let current = {name: '', role: '', lines: []};
  for (const line of stripJson(text).split('\n')) {
    const m = /^#{3}\s+(.+?)\s*$/.exec(line);
    if (m) { if (current.lines.join('').trim() || current.name) blocks.push(current); const [name, role = ''] = m[1].split('|').map(x => x.replace(/\*\*/g, '').trim()); current = {name, role, lines: []}; }
    else current.lines.push(line);
  }
  if (current.lines.join('').trim() || current.name) blocks.push(current);
  return blocks.map(b => ({...b, text: b.lines.join('\n').trim()})).filter(b => b.text || b.name);
}
const hue = name => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 6; };

// ---------- The face: it speaks for whoever has the floor ----------
// Delegates speak through a flag face of their country; everyone else through
// the Debate Buddy face of the current interface. Lip movement is a synthetic
// syllable rhythm kicked by each spoken word (browser voices cannot be measured).
const narrator = {
  speaking: false, kick: 0, block: null,
  levels() {
    if (!this.speaking) return {level: 0, low: 0, mid: 0, high: 0, bins: null};
    const t = performance.now(), since = (t - this.kick) / 1000;
    const pulse = Math.exp(-since * 6) * .9, flutter = (Math.sin(t / 55) * .5 + .5) * (Math.sin(t / 137) * .5 + .5);
    const level = Math.min(1, pulse * .7 + flutter * (since < 1.2 ? .45 : .1));
    return {level, low: .5 + Math.sin(t / 210) * .3, mid: .4, high: .2 + Math.max(0, Math.sin(t / 160)) * .3, bins: Array.from({length: 14}, (_, i) => level * (.4 + .6 * Math.abs(Math.sin(t / 90 + i))))};
  },
  word() { this.kick = performance.now(); },
  show(block, s) {
    this.block = block;
    const name = block?.name || 'Debate Buddy', code = speakerCountry(block, s);
    $('#speakerNow').textContent = code ? name.replace(/^delegate of /i, 'Delegate of ') : name;
    $('#speakerSub').textContent = this.speaking ? (block?.role && !name.toLowerCase().includes(block.role.toLowerCase()) ? block.role + ' · speaking' : 'Speaking') : 'Ready when you are';
    $('#flagFace').hidden = !code; $('#narrator').classList.toggle('has-flag', !!code);
    if (code) $('#flagImg').src = flagUrl(code);
    $$('#messages li.speaking-now').forEach(n => n.classList.remove('speaking-now'));
    if (block?.key) $(`#messages li[data-key="${block.key}"]`)?.classList.add('speaking-now');
  },
  start(block, s) { this.speaking = true; this.word(); this.show(block, s); face.setState('speaking', true); document.body.dataset.narrating = 'true'; paintTimer(); },
  stop() {
    this.speaking = false; document.body.dataset.narrating = 'false';
    $('#speakerSub').textContent = 'Ready when you are'; $('#speakerNow').textContent = 'Debate Buddy';
    $('#flagFace').hidden = true; $('#narrator').classList.remove('has-flag');
    $$('#messages li.speaking-now').forEach(n => n.classList.remove('speaking-now'));
    face.setState(document.body.dataset.activity === 'idle' ? 'idle' : 'thinking', true); paintTimer();
  }
};
// The flag face's mouth follows the same rhythm as the main face.
(function flagMouthLoop() {
  const mouth = $('#flagMouth');
  if (mouth && !$('#flagFace').hidden) {
    const open = narrator.speaking ? narrator.levels().level : 0, h = 2 + open * 12;
    mouth.setAttribute('d', `M38 63 Q50 ${63 + 3 + h * .3} 62 63 Q50 ${63 + 3 + h} 38 63Z`);
  }
  requestAnimationFrame(flagMouthLoop);
})();
function speakerCountry(block, s) {
  if (!block?.name || CHAIR.test(block.name)) return null;
  if (s && s.format !== 'mun' && !/^delegat/i.test(block.name)) return null;
  return countryCode(block.name, block.role);
}
// Reads a list of speaker blocks aloud through the face. Resolves when finished.
async function narrate(blocks, s, {force = false} = {}) {
  const spoken = blocks.filter(b => b.text && !/^coach$/i.test(b.name || ''));
  if (!spoken.length || (!reader.on && !force)) return;
  try {
    await reader.speakBlocks(spoken, {force, onBlock: b => narrator.start(b, s), onWord: () => narrator.word()});
  } finally { narrator.stop(); }
}
const NARRATION_COLORS = 8;
function colorFor(s, name) {
  if (!s || !name || CHAIR.test(name)) return null;
  s.colors ||= {}; const key = name.toLowerCase();
  if (s.colors[key] == null) s.colors[key] = Object.keys(s.colors).length % NARRATION_COLORS;
  return s.colors[key];
}
$('#voiceToggle').onclick = () => {
  prefs.readAloud = reader.on ? 'off' : (prefs.lastVoice || 'browser'); if (prefs.readAloud !== 'off') prefs.lastVoice = prefs.readAloud;
  savePrefs(); if (!reader.on) reader.stop(); toast(reader.on ? 'Voice on: the other side will speak its turns.' : 'Voice off: turns appear as text only.');
};
$('#faceButton').onclick = () => {
  const s = practice(); if (!s) { toast('Start a practice session and the face will speak for each speaker.'); return; }
  const last = [...s.messages].reverse().find(m => m.role === 'assistant'); if (!last) return;
  const index = s.messages.indexOf(last);
  narrate(speakerBlocks(last.text).map((b, i) => ({...b, key: index + ':' + i})), s, {force: true});
};

// ---------- Practice: setup ----------
function fillSelect(select, entries) { select.replaceChildren(...entries.map(([v, l]) => new Option(l, v))); }
fillSelect($('#activity'), Object.entries(MUN_ACTIVITIES)); fillSelect($('#sessionActivity'), Object.entries(MUN_ACTIVITIES));
$('#committeeList').replaceChildren(...COMMITTEES.map(c => new Option(c)));
$('#countryList').replaceChildren(...COUNTRIES.map(c => new Option(c)));
const paintSetupFormat = radioGroup($('#setupFormat'), 'format', setup.format, v => { setup.format = v; saveSetup(); });
const paintSide = radioGroup($('#sidePicker'), 'side', setup.side, v => { setup.side = v; saveSetup(); });
function showOnly(scope, format) { scope.querySelectorAll('[data-only]').forEach(n => { n.hidden = n.dataset.only !== format; }); }
function paintSetup() {
  paintSetupFormat(setup.format); paintSide(setup.side); showOnly($('#setupForm'), setup.format);
  const f = {setupTopic: 'topic', rounds: 'rounds', opener: 'opener', participants: 'participants', groupRounds: 'groupRounds', committee: 'committee', country: 'country', delegates: 'delegates', munOpener: 'munOpener', activity: 'activity', speakingTime: 'speakingTime', responseLength: 'responseLength'};
  for (const [id, key] of Object.entries(f)) if (document.activeElement !== $('#' + id)) $('#' + id).value = String(setup[key] ?? '');
  $$('input[name=difficulty]').forEach(i => { i.checked = i.value === setup.difficulty; });
  const d = DIFFICULTY[setup.difficulty]; $('#difficultyExplain').replaceChildren(...[...d.points, DIFFICULTY_FORMAT[setup.format][setup.difficulty]].map(p => el('li', null, p)));
  $('#setupSummary').textContent = setup.topic ? `${FORMAT[setup.format]} · ${d.label}` : 'Choose a topic on the Debate tab, or type one here.';
  renderSetupNote(); renderReady(); updateBrief();
}
function saveSetup() { store('setup', setup); paintSetup(); }
for (const [id, key, num] of [['setupTopic', 'topic'], ['rounds', 'rounds', 1], ['opener', 'opener'], ['participants', 'participants', 1], ['groupRounds', 'groupRounds', 1], ['committee', 'committee'], ['country', 'country'], ['delegates', 'delegates'], ['munOpener', 'munOpener'], ['activity', 'activity'], ['speakingTime', 'speakingTime', 1], ['responseLength', 'responseLength']]) {
  $('#' + id).addEventListener($('#' + id).tagName === 'SELECT' ? 'change' : 'input', () => { setup[key] = num ? Number($('#' + id).value) : $('#' + id).value; saveSetup(); });
}
$$('input[name=difficulty]').forEach(i => i.addEventListener('change', () => { setup.difficulty = i.value; saveSetup(); }));
function renderSetupNote(message) {
  const note = $('#setupNote'); if (!note) return;
  if (message) { note.textContent = message; note.dataset.tone = 'warn'; return; }
  note.dataset.tone = '';
  note.textContent = engine === 'ready' ? '' : engine === 'checking' ? 'Checking the AI engine…' : 'AI practice is unavailable right now: ' + ENGINE_TEXT[engine] + ' The solo drill works offline.';
  $('#startSession').disabled = !['ready', 'checking'].includes(engine);
}
function setupProblem(offline = false) {
  if (!setup.topic.trim()) return ['Type or choose a topic first.', '#setupTopic'];
  if (setup.format === 'for-against' && !setup.side) return [offline ? 'Choose For or Against first.' : 'Choose For or Against first. Debate Buddy will take the other side.', '#sidePicker [role=radio]'];
  if (setup.format === 'mun' && !setup.country.trim()) return ['Choose the country you represent, or press “Help me choose a country”.', '#country'];
  return null;
}
function sessionSettings() {
  const s = {...setup, topic: setup.topic.trim(), rounds: setup.format === 'group' ? setup.groupRounds : setup.rounds};
  delete s.groupRounds; return s;
}
function newPracticeSession(offline = false) {
  const settings = sessionSettings();
  const s = {id: uuid(), type: 'practice', format: settings.format, topic: settings.topic, settings, messages: [], status: 'active', round: 1, roster: [], offline, createdAt: Date.now(), updatedAt: Date.now()};
  sessions.unshift(s); activePracticeId = s.id; save(); return s;
}
$('#setupForm').onsubmit = async e => {
  e.preventDefault();
  const problem = setupProblem(); if (problem) { renderSetupNote(problem[0]); $(problem[1])?.focus(); return; }
  if (engine !== 'ready') { renderSetupNote('The AI engine is not ready. ' + ENGINE_TEXT[engine]); return; }
  const s = newPracticeSession(false); renderPractice();
  await aiTurn(s, 'start', `Start the session.`);
};
$('#soloDrill').onclick = () => {
  const problem = setupProblem(true); if (problem) { renderSetupNote(problem[0]); $(problem[1])?.focus(); return; }
  const s = newPracticeSession(true);
  s.messages.push({role: 'notice', text: 'Solo drill: no AI opponent and no AI judging. Debate Buddy gives you structured speaking prompts and a timer; at the end you rate yourself.'});
  s.messages.push({role: 'prompt', text: drillPrompt(s)}); save(); renderPractice(); startTimer(s);
};
$('#countryHelp').onclick = async () => {
  const box = $('#countryAdvice'); box.hidden = false;
  if (engine !== 'ready') { box.replaceChildren(el('p', null, 'Country suggestions need the AI engine. Meanwhile: pick a country with a clear stake in the agenda (a major producer, a strongly affected state, or a permanent Security Council member), then check its recent UN statements.')); return; }
  if (busy) return toast('Wait for the current reply to finish.');
  if (!setup.topic.trim()) return toast('Choose the agenda (topic) first.');
  box.replaceChildren(el('p', 'field-note', 'Finding countries with different stakes…'));
  let text = '';
  try { await stream({kind: 'country-help', session: sessionSettings(), message: '', onDraft: (_, t) => { text = t; box.replaceChildren(rich(el('div', 'bubble'), t)); }, onMessage: (_, t) => { text = t; }}); box.replaceChildren(rich(el('div', 'bubble'), text)); }
  catch (error) { box.replaceChildren(el('p', 'error-text', error.message)); }
};

// ---------- Practice: the live session ----------
function renderPractice() {
  const s = practice();
  $('#practiceSetup').hidden = !!s; $('#practiceSession').hidden = !s;
  $('#sessionControls').hidden = !s || s.status === 'ended'; $('#newSession').hidden = !s;
  if (!s && !setup.topic.trim() && selection.topic) { setup.topic = selection.topic; if (selection.format) setup.format = selection.format; if (selection.committee) setup.committee = selection.committee; store('setup', setup); }
  if (!s) { $('#practiceTitle').textContent = 'Practice'; paintSetup(); updateDock(); updateBrief(); return; }
  $('#practiceTitle').textContent = clip(s.topic, 90); $('#practiceTitle').title = s.topic;
  document.body.dataset.format = s.format;
  $('#pauseSession').textContent = s.status === 'paused' ? 'Continue' : 'Pause'; $('#pauseSession').setAttribute('aria-pressed', String(s.status === 'paused'));
  $('#pausedBanner').hidden = s.status !== 'paused';
  $('#munControls').hidden = s.format !== 'mun' || s.status === 'ended' || s.offline;
  $('#sessionActivity').value = s.settings.activity;
  renderRoster(s); renderMessages(s); updateDock(); updateBrief();
  $('#practiceLive').hidden = !['active', 'paused'].includes(s.status);
}
function renderRoster(s) {
  const box = $('#roster'); box.replaceChildren();
  const you = s.format === 'mun' ? `You: ${s.settings.country}` : s.format === 'for-against' ? `You: ${s.settings.side === 'for' ? 'For' : 'Against'}` : 'You';
  box.append(el('span', 'roster-chip you', you));
  if (s.offline) box.append(el('span', 'roster-chip', 'Solo drill: no AI opponent'));
  else if (s.format === 'for-against') box.append(el('span', 'roster-chip opp', `Debate Buddy: ${s.settings.side === 'for' ? 'Against' : 'For'}`));
  for (const r of s.roster || []) {
    const [name, role] = r.split('|').map(x => x.trim()), code = speakerCountry({name, role}, s);
    const chip = el('span', 'roster-chip spk-' + (colorFor(s, name) ?? hue(name)));
    if (code) { chip.classList.add('flagged'); const img = el('img', 'chip-flag'); img.src = flagUrl(code); img.alt = ''; chip.append(img); }
    chip.append(role && !name.toLowerCase().includes(role.toLowerCase()) ? `${name} · ${role}` : name); box.append(chip);
  }
}
function blockNode(block, {streaming = false, s = practice()} = {}) {
  const name = block.name || 'Debate Buddy';
  const li = el('li', 'msg assistant speaker');
  if (block.key) li.dataset.key = block.key;
  if (/^coach$/i.test(name)) li.classList.add('coach'); else if (CHAIR.test(name)) li.classList.add('chair'); else li.classList.add('spk-' + ((streaming ? s?.colors?.[name.toLowerCase()] : colorFor(s, name)) ?? hue(name)));
  const who = el('span', 'who'), code = speakerCountry(block, s);
  if (code) { const img = el('img', 'who-flag'); img.src = flagUrl(code); img.alt = ''; who.append(img); }
  else if (!li.classList.contains('chair') && !li.classList.contains('coach')) who.append(el('span', 'who-dot'));
  who.append(el('b', null, name)); if (block.role && !name.toLowerCase().includes(block.role.toLowerCase())) who.append(el('span', 'role', block.role));
  if (!streaming && block.text && !/^coach$/i.test(name)) {
    const play = el('button', 'replay-btn'); play.type = 'button'; play.setAttribute('aria-label', 'Play ' + name + "'s turn aloud"); play.title = 'Play aloud';
    play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    play.onclick = () => narrate([block], s, {force: true}); who.append(play);
  }
  li.append(who); const bubble = el('div', 'bubble'); rich(bubble, block.text || ''); li.append(bubble);
  if (streaming) li.classList.add('streaming');
  return li;
}
function messageNodes(m, index) {
  if (m.role === 'user') { const li = el('li', 'msg user'); const who = el('span', 'who', m.label || 'You'); li.append(who, el('div', 'bubble', m.text)); if (m.dictated) li.append(el('span', 'msg-meta', 'Dictated')); return [li]; }
  if (m.role === 'assistant') return speakerBlocks(m.text).map((b, i) => blockNode({...b, key: index + ':' + i}));
  if (m.role === 'prompt') { const li = el('li', 'msg assistant speaker chair'); li.append(el('span', 'who', 'Drill')); li.append(rich(el('div', 'bubble'), m.text)); return [li]; }
  if (m.role === 'review') return [reviewNode(m)];
  const li = el('li', 'msg ' + (m.role === 'error' ? 'error' : 'notice')); li.append(el('div', 'bubble', m.text)); return [li];
}
function renderMessages(s) {
  const box = $('#messages'); box.replaceChildren();
  s.messages.forEach((m, i) => box.append(...messageNodes(m, i)));
  scrollThread(true);
}
function scrollThread(force) { const t = $('#thread'); if (force || t.scrollHeight - t.scrollTop - t.clientHeight < 240) motion?.glideTo ? motion.glideTo(t, t.scrollHeight) : (t.scrollTop = t.scrollHeight); }
function paintDraft(text) {
  const box = $('#messages'); box.querySelectorAll('li.draft').forEach(n => n.remove());
  for (const b of speakerBlocks(text)) { const li = blockNode(b, {streaming: true}); li.classList.add('draft'); li.dataset.rv = 'skip'; box.append(li); }
  scrollThread();
}
function waitingNode(text) { const li = el('li', 'msg notice waiting'); li.append(el('div', 'bubble', text)); li.id = 'waitingLi'; return li; }
function updateRoster(s, text) {
  for (const b of speakerBlocks(text)) {
    if (!b.name || CHAIR.test(b.name)) continue;
    const entry = b.role ? `${b.name} | ${b.role}` : b.name;
    if (!s.roster.some(r => r.split('|')[0].trim().toLowerCase() === b.name.toLowerCase())) s.roster.push(entry);
  }
  s.roster = s.roster.slice(0, 8);
}
async function aiTurn(s, kind, message = '') {
  if (busy) { toast('Wait for the current reply to finish.'); return; }
  stopTimer(s); reader.stop();
  // A reply to the user's speech belongs to the round that speech was in.
  const settings = {...s.settings, round: kind === 'turn' && s.format !== 'mun' ? Math.max(1, s.round - 1) : s.round, roster: s.roster, hintType: $('#hintType').value || 'point'};
  const box = $('#messages'); box.append(waitingNode(kind === 'review' ? 'Writing your review…' : kind === 'hint' ? 'Thinking of a hint…' : 'The other side is preparing…')); scrollThread(true);
  if (kind === 'review') s.status = 'reviewing';
  $('#messages').setAttribute('aria-busy', 'true');
  let finalText = '', drafts = new Map();
  try {
    await stream({kind, session: settings, message, chatId: s.id, history: historyFor(s.messages.slice(0, kind === 'turn' ? -1 : undefined)),
      onStatus: t => { const w = $('#waitingLi .bubble'); if (w) w.textContent = t; },
      onDraft: (id, t) => { drafts.set(id, t); if (kind !== 'review') { $('#waitingLi')?.remove(); paintDraft([...drafts.values()].join('\n\n')); if (!reader.on) { const bl = speakerBlocks(t).at(-1); if (bl && narrator.block?.name !== bl.name) narrator.start(bl, s); narrator.word(); } } },
      onMessage: (id, t) => { drafts.set(id, t); finalText = [...drafts.values()].join('\n\n'); }});
    if (kind === 'review') {
      const review = parseReview(finalText);
      s.messages.push({role: 'review', text: finalText, review, at: Date.now()}); s.review = review ? {...review, at: Date.now(), selfAssessed: false} : null; s.status = 'ended';
      $('#practiceLive').hidden = true;
    } else {
      s.messages.push({role: 'assistant', kind, text: finalText, at: Date.now()}); updateRoster(s, finalText);
      if (s.format !== 'mun' && kind === 'turn' && s.round > s.settings.rounds) s.messages.push({role: 'notice', text: 'That was the final round. Press End & review for feedback, or keep going if you want more practice.'});
    }
  } catch (error) {
    const partial = [...drafts.values()].join('\n\n');
    if (partial.trim() && kind !== 'review') s.messages.push({role: 'assistant', kind, text: partial, at: Date.now()});
    s.messages.push({role: error.name === 'AbortError' ? 'notice' : 'error', text: error.name === 'AbortError' ? 'Stopped.' : error.message});
    if (kind === 'review') s.status = 'active';
  } finally {
    $('#waitingLi')?.remove(); $('#messages').setAttribute('aria-busy', 'false'); if (narrator.speaking) narrator.stop(); s.updatedAt = Date.now(); save(); renderPractice();
    if (!matchMedia('(pointer: coarse)').matches && s.status === 'active') $('#prompt').focus();
  }
  // The speaking clock waits until the other side has finished talking.
  const last = s.messages.at(-1);
  if (s.status === 'active' && kind !== 'review' && last?.role === 'assistant') {
    const index = s.messages.length - 1;
    if (kind !== 'hint') await narrate(speakerBlocks(last.text).map((b, i) => ({...b, key: index + ':' + i})), s);
    if (practice() === s && s.status === 'active' && !busy && !timer.started) startTimer(s);
  } else if (s.status === 'active' && kind !== 'review') startTimer(s);
}
function parseReview(text) {
  const m = /```\s*json\s*([\s\S]*?)```/i.exec(text || ''); if (!m) return null;
  try {
    const d = JSON.parse(m[1]), scores = {};
    for (const [k, v] of Object.entries(d.scores || {})) { const n = Number(v); if (Number.isFinite(n)) scores[k] = Math.min(5, Math.max(1, Math.round(n))); }
    return {scores, strengths: (d.strengths || []).map(String).slice(0, 5), nextSteps: (d.next_steps || []).map(String).slice(0, 4), summary: String(d.summary || '')};
  } catch { return null; }
}
function scoreBars(scores, format) {
  const list = el('dl', 'score-list');
  for (const key of SCORE_KEYS[format].filter(k => scores[k] != null)) {
    const row = el('div', 'score-row'); row.append(el('dt', null, SCORE_LABEL[key] || key));
    const dd = el('dd'); const bar = el('span', 'score-bar'); bar.style.setProperty('--v', scores[key] / 5); bar.setAttribute('aria-hidden', 'true');
    dd.append(bar, el('span', 'score-num', `${scores[key]} / 5`)); row.append(dd); list.append(row);
  }
  return list;
}
function reviewNode(m) {
  const li = el('li', 'msg assistant review-card'); li.append(el('span', 'who', m.review?.selfAssessed ? 'Your self-review' : 'Session review'));
  const card = el('div', 'bubble');
  const s = practice();
  if (m.review?.scores && Object.keys(m.review.scores).length) card.append(scoreBars(m.review.scores, s?.format || 'for-against'));
  if (m.text) rich(card, stripJson(m.text));
  if (m.review?.selfAssessed && m.review.nextSteps?.length) { card.append(el('h4', null, 'Next time')); const ul = el('ul'); m.review.nextSteps.forEach(x => ul.append(el('li', null, x))); card.append(ul); }
  li.append(card); return li;
}

// Composer, hints and controls
const dictation = new Dictation({onText: t => { $('#prompt').value = t; resizePrompt(); dictatedDraft = true; }, onState: on => { $('#micInline').setAttribute('aria-pressed', String(on)); $('#micInline').classList.toggle('on', on); $('#composerStatus').textContent = on ? 'Listening… press the microphone again to stop' : ''; }, onError: toast});
let dictatedDraft = false;
$('#micInline').hidden = !dictationSupported() || !window.isSecureContext;
$('#micInline').onclick = () => dictation.active ? dictation.stop() : dictation.start($('#prompt').value);
function resizePrompt() { const p = $('#prompt'); p.style.height = 'auto'; p.style.height = Math.min(p.scrollHeight, 200) + 'px'; }
$('#prompt').addEventListener('input', () => { resizePrompt(); if (!$('#prompt').value) dictatedDraft = false; const s = practice(); if (s?.status === 'active' && !busy && !timer.started && s.settings.speakingTime) startTimer(s); });
$('#prompt').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#chatForm').requestSubmit(); } });
function updateDock() {
  const s = practice(), live = view === 'practice' && s && ['active', 'paused', 'reviewing'].includes(s.status);
  $('#dock').hidden = !live; document.body.classList.toggle('has-dock', !!live);
  if (!s) return;
  const paused = s.status !== 'active';
  $('#prompt').disabled = paused || busy; $('#send').hidden = busy; $('#stopResponse').hidden = !busy;
  $('#send').disabled = paused; $('#hintBtn').disabled = paused || busy || s.offline; $('#listenBtn').disabled = paused || busy;
  $('#hintType').disabled = paused || busy || s.offline;
  $('#listenBtn').hidden = s.format === 'for-against' || s.offline;
  $('.hint-menu').hidden = !!s.offline;
  $('#endSession').disabled = busy || s.status === 'reviewing'; $('#pauseSession').disabled = s.status === 'reviewing';
  $('#moveActivity').disabled = paused || busy;
  const hints = s.format === 'mun' ? HINTS.mun : HINTS.other;
  if ($('#hintType').dataset.format !== s.format) { fillSelect($('#hintType'), hints); $('#hintType').dataset.format = s.format; }
  const placeholder = s.format === 'mun' ? `Speak as the delegate of ${s.settings.country}…` : s.format === 'group' ? 'Add to the discussion…' : `Make your ${s.round <= 1 ? 'opening case' : s.round >= s.settings.rounds ? 'closing statement' : 'rebuttal'}…`;
  $('#prompt').placeholder = paused ? 'Session paused. Press Continue to resume.' : placeholder;
  $('#promptLabel').textContent = s.format === 'mun' ? 'Your statement as ' + s.settings.country : 'Your contribution';
}
$('#chatForm').onsubmit = async e => {
  e.preventDefault(); reader.unlock(); const s = practice(); if (!s || s.status !== 'active' || busy) return;
  const text = $('#prompt').value.trim(); if (!text) { toast('Write your contribution first.'); return; }
  if (dictation.active) dictation.stop();
  reader.stop();
  const used = timer.started ? Math.round((Date.now() - timer.started) / 1000) + timer.carried : null;
  s.messages.push({role: 'user', text, dictated: dictatedDraft, seconds: used, at: Date.now(), label: s.format === 'mun' ? `Delegate of ${s.settings.country} (you)` : 'You'});
  $('#prompt').value = ''; dictatedDraft = false; resizePrompt();
  if (s.format !== 'mun') s.round = (s.round || 1) + 1;
  s.updatedAt = Date.now(); save(); renderPractice();
  if (s.offline) { if (s.format !== 'mun' && s.round > s.settings.rounds) s.messages.push({role: 'notice', text: 'Drill complete. Press End & review to rate yourself, or keep practising.'}); else s.messages.push({role: 'prompt', text: drillPrompt(s)}); save(); renderPractice(); startTimer(s); return; }
  await aiTurn(s, 'turn', text);
};
$('#hintBtn').onclick = () => { const s = practice(); if (s) aiTurn(s, 'hint', 'I would like a hint.'); };
$('#listenBtn').onclick = () => { const s = practice(); if (!s) return; s.messages.push({role: 'notice', text: 'You let the others speak.'}); aiTurn(s, 'continue', ''); };
$('#moveActivity').onclick = () => {
  const s = practice(); if (!s) return; const next = $('#sessionActivity').value;
  if (next === s.settings.activity) { toast('The committee is already in ' + MUN_ACTIVITIES[next] + '.'); return; }
  s.settings.activity = next; s.messages.push({role: 'notice', text: 'The committee moves to: ' + MUN_ACTIVITIES[next] + '.'}); save(); updateBrief();
  if (s.offline) { s.messages.push({role: 'prompt', text: drillPrompt(s)}); save(); renderPractice(); return; }
  aiTurn(s, 'continue', `The Chair moves the committee to: ${MUN_ACTIVITIES[next]}.`);
};
function pauseSession(quiet = false) {
  const s = practice(); if (!s || s.status !== 'active') return;
  if (busy) controller?.abort();
  stopTimer(s); reader.stop(); if (dictation.active) dictation.stop();
  s.status = 'paused'; s.updatedAt = Date.now(); save(); if (!quiet) { renderPractice(); toast('Paused. Your session is saved, even if you close the tab.'); }
}
function resumeSession() { const s = practice(); if (!s || s.status !== 'paused') return; s.status = 'active'; save(); renderPractice(); startTimer(s, true); $('#prompt').focus(); }
$('#pauseSession').onclick = () => practice()?.status === 'paused' ? resumeSession() : pauseSession();
$('#resumeSession').onclick = resumeSession;
$('#endSession').onclick = async () => {
  const s = practice(); if (!s || busy) return;
  const turns = s.messages.filter(m => m.role === 'user').length;
  if (!await confirmAction('End this session?', turns ? 'You will get a review of your contributions. The transcript stays in History.' : 'You have not contributed yet, so the review will be short. End anyway?', 'End & review')) return;
  if (s.status === 'paused') s.status = 'active';
  stopTimer(s);
  if (s.offline) { openSelfReview(s); return; }
  if (engine !== 'ready') { s.status = 'ended'; s.messages.push({role: 'notice', text: 'Session ended. A review needs the AI engine, which is not available right now.'}); save(); renderPractice(); return; }
  await aiTurn(s, 'review', 'End of session.' + (s.messages.some(m => m.dictated) ? ' [dictated]' : ''));
};
$('#newSession').onclick = async () => {
  const s = practice();
  if (s && ['active', 'paused'].includes(s.status) && !await confirmAction('Start a new session?', 'This session will be paused and stays in History.', 'New session')) return;
  pauseSession(true); activePracticeId = null; save(); renderPractice();
};

// Speaking timer (soft: it shows overtime but never blocks you)
const timer = {started: 0, carried: 0, limit: 0, handle: 0, sessionId: null};
function startTimer(s, resume = false) {
  if (!s || !s.settings.speakingTime || s.status !== 'active') { $('#timerBox').hidden = true; return; }
  if (!resume || timer.sessionId !== s.id) timer.carried = 0;
  Object.assign(timer, {started: Date.now(), limit: s.settings.speakingTime, sessionId: s.id});
  clearInterval(timer.handle); timer.handle = setInterval(paintTimer, 250); paintTimer(); updateBrief();
}
document.addEventListener('visibilitychange', () => { const s = practice(); if (!s || s.status !== 'active') return; if (document.hidden && timer.started) { stopTimer(); timer.hiddenPause = true; } else if (!document.hidden && timer.hiddenPause) { timer.hiddenPause = false; startTimer(s, true); } });
function stopTimer() { if (timer.started) timer.carried += Math.round((Date.now() - timer.started) / 1000); timer.started = 0; clearInterval(timer.handle); paintTimer(); }
function paintTimer() {
  const live = practice(), limit = timer.limit || live?.settings.speakingTime || 0;
  const elapsed = (timer.started ? (Date.now() - timer.started) / 1000 : 0) + timer.carried, left = Math.round(limit - elapsed);
  const t = $('#timer'), fmt = n => `${Math.floor(Math.abs(n) / 60)}:${String(Math.abs(n) % 60).padStart(2, '0')}`;
  t.textContent = left >= 0 ? fmt(left) : '+' + fmt(left);
  t.dataset.state = !timer.started ? 'stopped' : left < 0 ? 'over' : left <= 10 ? 'low' : 'run';
  const waiting = !timer.started && live?.status === 'active';
  $('#timerBox .brief-k').textContent = waiting ? (busy || narrator.speaking ? 'Your time · waits for them' : 'Your time · starts when you type') : live?.status === 'paused' ? 'Your time · paused' : 'Your time';
  t.setAttribute('aria-label', left >= 0 ? `${fmt(left)} left of your speaking time` : `${fmt(left)} over your speaking time`);
  if (left === 0 && timer.started && !timer.announced) { timer.announced = true; toast('Time is up for this speech. Finish your sentence and send.'); }
  if (left > 0) timer.announced = false;
}


// Offline solo drill prompts
function drillPrompt(s) {
  const r = s.round || 1, n = s.settings.rounds, t = s.settings.speakingTime ? ` You have ${Math.round(s.settings.speakingTime / 60 * 10) / 10} minutes.` : '';
  if (s.format === 'for-against') {
    const side = s.settings.side === 'for' ? 'For' : 'Against', other = s.settings.side === 'for' ? 'Against' : 'For';
    if (r === 1) return `**Round 1 of ${n}: your opening case (${side}).** Define the key terms, give two arguments (claim, reasoning, evidence, impact), and preview why your side wins.${t}`;
    if (r >= n) return `**Round ${r} of ${n}: closing statement.** Summarise the two biggest clashes and explain why ${side} wins each one. No new arguments.${t}`;
    return `**Round ${r} of ${n}: rebuttal.** Write the strongest point the ${other} side would make, then rebut it: why it is wrong, why it matters less, or why it actually supports you.${t}`;
  }
  if (s.format === 'group') {
    const prompts = ['Give your opening view in three sentences, and end with a question for the group.', 'Summarise a view that differs from yours as fairly as you can, then respond to it.', 'Find one point of agreement between two opposing views and build on it.', 'Invite a quieter participant in: write the question you would ask them and why.', 'Bring in a piece of evidence or an example that moves the discussion forward.', 'Offer a compromise and explain who would accept it and who would not.', 'Close by summarising the discussion: agreements, disagreements and open questions.'];
    return `**Round ${r} of ${n}.** ${r >= n ? prompts[6] : prompts[(r - 1) % 6]}${t}`;
  }
  const map = {opening: `Deliver ${s.settings.country}'s opening statement: your position, your interests, and one proposal.`, 'moderated-caucus': 'Give a 60-second moderated caucus speech on one sub-topic of the agenda.', 'unmoderated-caucus': 'Write the pitch you would make to a likely ally to join your bloc.', poi: 'Write two pointed questions you would ask another delegation, and how you would answer one aimed at you.', negotiation: 'State your red lines and the compromise you could accept.', 'draft-resolution': 'Draft two preambulatory and three operative clauses.', closing: 'Give your closing statement and say how you will vote, and why.'};
  return `**${MUN_ACTIVITIES[s.settings.activity]}.** ${map[s.settings.activity]}${t}`;
}
function openSelfReview(s) {
  const fields = $('#selfReviewFields'); fields.replaceChildren();
  for (const key of SCORE_KEYS[s.format]) {
    const id = 'self-' + key, label = el('label', 'range-row self-row'); label.htmlFor = id;
    const input = Object.assign(document.createElement('input'), {type: 'range', min: 1, max: 5, step: 1, value: 3, id}); const out = el('output', null, '3');
    input.oninput = () => { out.textContent = input.value; }; input.setAttribute('aria-describedby', id + '-v'); out.id = id + '-v';
    label.append(el('span', null, SCORE_LABEL[key]), input, out); fields.append(label);
  }
  $('#selfNext').value = ''; const dialog = $('#selfReview'); dialog.returnValue = ''; dialog.showModal();
  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'ok') { renderPractice(); return; }
    const scores = Object.fromEntries(SCORE_KEYS[s.format].map(k => [k, Number($('#self-' + k).value)]));
    const next = $('#selfNext').value.trim();
    const review = {scores, strengths: [], nextSteps: next ? [next] : [], summary: 'Self-assessed solo drill', selfAssessed: true, at: Date.now()};
    s.review = review; s.messages.push({role: 'review', text: '', review, at: Date.now()}); s.status = 'ended'; save(); renderPractice();
  }, {once: true});
}

// ---------- Research ----------
const paintResearchFormat = radioGroup($('#researchFormat'), 'format', researchForm.format, v => { researchForm.format = v; saveResearchForm(); });
const paintResearchSide = radioGroup($('#researchSide'), 'side', researchForm.side, v => { researchForm.side = v; saveResearchForm(); });
function paintResearchForm() {
  paintResearchFormat(researchForm.format); paintResearchSide(researchForm.side); showOnly($('#researchForm'), researchForm.format);
  for (const [id, key] of [['researchTopic', 'topic'], ['researchCommittee', 'committee'], ['researchCountry', 'country']]) if (document.activeElement !== $('#' + id)) $('#' + id).value = researchForm[key] || '';
  $('#researchWeb').checked = researchForm.web !== false; updateBrief();
}
function saveResearchForm() { store('research', researchForm); paintResearchForm(); }
for (const [id, key] of [['researchTopic', 'topic'], ['researchCommittee', 'committee'], ['researchCountry', 'country']]) $('#' + id).addEventListener('input', () => { researchForm[key] = $('#' + id).value; store('research', researchForm); updateBrief(); });
$('#researchWeb').onchange = () => { researchForm.web = $('#researchWeb').checked; store('research', researchForm); };
function newResearch(offline) {
  const settings = {topic: researchForm.topic.trim(), format: researchForm.format, side: researchForm.side, committee: researchForm.committee.trim(), country: researchForm.country.trim()};
  const r = {id: uuid(), type: 'research', format: settings.format, topic: settings.topic, settings, text: '', web: !offline && researchForm.web !== false, offline, webSearches: 0, status: offline ? 'done' : 'running', createdAt: Date.now(), updatedAt: Date.now()};
  if (offline) r.text = offlineWorkspace(settings);
  sessions.unshift(r); activeResearchId = r.id; save(); return r;
}
$('#researchForm').onsubmit = async e => {
  e.preventDefault(); if (busy) return toast('Wait for the current reply to finish.');
  if (!researchForm.topic.trim()) { toast('Enter a topic to research.'); $('#researchTopic').focus(); return; }
  if (engine !== 'ready') { const r = newResearch(true); r.offlineReason = ENGINE_TEXT[engine]; save(); renderResearchView(); toast('The AI engine is unavailable, so an offline template was built instead.'); return; }
  const r = newResearch(false); renderResearchView();
  let drafts = new Map();
  try {
    await stream({kind: 'research', session: r.settings, chatId: r.id, web: r.web,
      onStatus: t => { r.statusText = t; paintResearchStatus(r); },
      onDraft: (id, t) => { drafts.set(id, t); r.text = [...drafts.values()].join('\n\n'); scheduleResearchPaint(r); },
      onMessage: (id, t) => { drafts.set(id, t); r.text = [...drafts.values()].join('\n\n'); },
      onMeta: m => { r.webSearches = m.webSearches || 0; }});
    r.status = 'done';
  } catch (error) { r.status = r.text ? 'done' : 'failed'; r.error = error.name === 'AbortError' ? 'Stopped before it finished.' : error.message; }
  finally { r.updatedAt = Date.now(); save(); renderResearchView(); }
};
$('#offlineResearch').onclick = () => { if (!researchForm.topic.trim()) { toast('Enter a topic to research.'); $('#researchTopic').focus(); return; } newResearch(true); renderResearchView(); };
$('#newResearch').onclick = () => { activeResearchId = null; save(); renderResearchView(); $('#researchTopic').focus(); };
let researchFrame = 0;
function scheduleResearchPaint(r) { if (researchFrame) return; researchFrame = setTimeout(() => { researchFrame = 0; if (activeResearchId === r.id && view === 'research') renderResearchOutput(r); }, 300); }
function paintResearchStatus(r) { const t = $('#researchOutput .rw-trust'); if (t && r.status === 'running') t.textContent = r.statusText || 'Researching…'; }
function renderResearchView() {
  paintResearchForm(); const r = researchSession();
  $('#researchForm').hidden = !!r && r.status !== 'failed'; $('#newResearch').hidden = !r;
  $('#researchTitle').textContent = r ? 'Research workspace' : 'Research';
  renderResearchOutput(r);
}
// ---------- Research workspace: a readable brief in tabs, plus an Ask box ----------
const RW_TABS = [['overview', 'Overview'], ['arguments', 'Arguments'], ['sources', 'Plan & sources'], ['cheat', 'Cheat sheet'], ['ask', 'Ask a question']];
const tabOf = title => /cheat|revision/i.test(title) ? 'cheat'
  : /research plan|what to search|search|source|where to look/i.test(title) ? 'sources'
    : /argument|viewpoint|countries stand|respond|counter|rebut|game plan|preparation|case/i.test(title) ? 'arguments' : 'overview';
const cleanTitle = t => t.replace(/[*#]/g, '').trim();
function researchSections(text) {
  const parts = String(text || '').split(/^##\s+/m), intro = parts.shift() || '';
  return {intro, sections: parts.map(part => { const [title, ...body] = part.split('\n'); return {title: cleanTitle(title), body: body.join('\n').trim(), tab: tabOf(title)}; })};
}
function card(title, body, cls = '') {
  const c = el('section', 'rw-card ' + cls); if (title) c.append(el('h4', 'rw-card-title', title));
  if (body instanceof Node) c.append(body); else c.append(rich(el('div', 'bubble'), body || '…'));
  return c;
}
function sourceCards(body) {
  const lines = body.split('\n').filter(l => l.trim());
  const parsed = lines.map(l => l.replace(/^\s*[-*•]\s+/, '').split('|').map(x => x.trim())).filter(p => p.length >= 3);
  if (!parsed.length) return null;
  const grid = el('div', 'source-grid');
  for (const p of parsed) {
    const link = /\[([^\]]*)\]\((https?:[^)\s]+)\)/.exec(p.join(' | ')), url = link?.[2];
    const c = el('article', 'source-card');
    const title = el('h5', null, p[0].replace(/\*\*/g, '')); c.append(title);
    c.append(el('p', 'source-meta', [p[1], p[2]].filter(x => x && !/^\[/.test(x)).join(' · ')));
    const why = p.slice(3).filter(x => !/^\[.*\]\(/.test(x)).join(' '); if (why) c.append(el('p', 'source-why', why));
    if (url) { const a = el('a', 'source-link', 'Open source ↗'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; try { a.title = new URL(url).hostname; } catch {} c.append(a); }
    grid.append(c);
  }
  return grid;
}
function trustLine(r) {
  if (r.offline) return ['warn', 'Offline brief: nothing here was researched or checked. It gives you a plan and searches to run yourself.' + (r.offlineReason ? ' ' + r.offlineReason : '')];
  if (r.status === 'running') return ['', r.statusText || 'Researching…'];
  if (!r.web) return ['warn', 'Web research was off, so facts come from the AI’s general knowledge. Check them before you use them.'];
  if (!r.webSearches) return ['warn', 'No web searches were reported, so treat facts and links as unchecked until you open them.'];
  return ['ok', `Researched live with ${r.webSearches} web search${r.webSearches === 1 ? '' : 'es'}. Open a source before quoting it.`];
}
function renderResearchOutput(r) {
  const out = $('#researchOutput');
  if (!r) { out.replaceChildren(); delete out.dataset.rid; return; }
  if (out.dataset.rid !== r.id) buildResearchShell(out, r);
  r.tab ||= 'overview';
  const [tone, trust] = trustLine(r); const t = out.querySelector('.rw-trust'); t.textContent = trust; t.dataset.tone = tone;
  out.querySelector('.rw-progress').hidden = r.status !== 'running';
  out.querySelectorAll('.rw-tab').forEach(b => { const on = b.dataset.tab === r.tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; });
  out.querySelector('.rw-actions').hidden = r.status === 'running';
  const pane = out.querySelector('.rw-pane'); pane.replaceChildren(); pane.setAttribute('aria-labelledby', 'rwtab-' + r.tab);
  if (r.error) pane.append(el('p', 'error-text', r.error));
  const {intro, sections} = researchSections(r.text);
  if (r.tab === 'ask') { renderAsk(pane, r); }
  else {
    const mine = sections.filter(x => x.tab === r.tab);
    if (r.tab === 'overview') {
      const short = mine.find(x => /in short|overview/i.test(x.title));
      if (short) pane.append(card('In short', short.body, 'rw-hero'));
      else if (intro.trim()) pane.append(card('', intro, 'rw-hero'));
      for (const x of mine.filter(x => x !== short)) pane.append(card(x.title, x.body));
    } else if (r.tab === 'arguments') {
      const pro = mine.find(x => /^arguments for/i.test(x.title)), con = mine.find(x => /^arguments against/i.test(x.title));
      if (pro || con) { const cols = el('div', 'side-cols'); if (pro) cols.append(card(pro.title, pro.body, 'side-for')); if (con) cols.append(card(con.title, con.body, 'side-against')); pane.append(cols); }
      for (const x of mine.filter(x => x !== pro && x !== con)) pane.append(card(x.title, x.body, /respond/i.test(x.title) ? 'rw-respond' : ''));
    } else if (r.tab === 'sources') {
      for (const x of mine) { const grid = /^sources/i.test(x.title) ? sourceCards(x.body) : null; pane.append(card(x.title, grid || x.body, /plan/i.test(x.title) ? 'rw-plan' : '')); }
    } else if (r.tab === 'cheat') {
      for (const x of mine) {
        const c = card(x.title, x.body, 'rw-cheat'); const actions = el('div', 'head-actions');
        const copy = el('button', 'ghost', 'Copy'); copy.type = 'button'; copy.onclick = () => navigator.clipboard.writeText(x.title + '\n' + x.body).then(() => toast('Cheat sheet copied.'), () => toast('Copy was blocked by the browser.'));
        const print = el('button', 'ghost', 'Print'); print.type = 'button'; print.onclick = () => printSection(c);
        actions.append(copy, print); c.prepend(actions); pane.append(c);
      }
    }
    if (!pane.querySelector('.rw-card')) pane.append(el('p', 'empty', r.status === 'running' ? 'This part is still being written…' : 'Nothing in this part. Try another tab, or ask a question below.'));
  }
}
function buildResearchShell(out, r) {
  out.dataset.rid = r.id; out.replaceChildren();
  const head = el('header', 'rw-head');
  const kicker = [FORMAT[r.format], r.settings.side ? 'You argue ' + (r.settings.side === 'for' ? 'For' : 'Against') : '', r.settings.country, r.settings.committee, timeOf(r.createdAt)].filter(Boolean).join(' · ');
  const left = el('div', 'rw-head-text'); left.append(el('p', 'rw-kicker', kicker), el('h3', 'rw-title', r.topic), el('p', 'rw-trust'));
  const legend = el('details', 'rw-legend'); legend.append(el('summary', null, 'What do the little labels mean?'));
  const ul = el('ul'); for (const [k, v] of Object.entries(TAG_HELP)) { const li = el('li'); li.append(el('span', 'evidence-tag tag-' + k.toLowerCase(), TAG_LABEL[k]), document.createTextNode(' ' + v)); ul.append(li); }
  legend.append(ul); left.append(legend);
  const actions = el('div', 'rw-actions');
  const use = el('button', 'primary-btn', 'Practise this topic'); use.type = 'button';
  use.onclick = () => { Object.assign(setup, {topic: r.topic, format: r.format}); if (r.settings.side) setup.side = r.settings.side; if (r.settings.country) setup.country = r.settings.country; if (r.settings.committee) setup.committee = r.settings.committee; store('setup', setup); pauseSession(true); activePracticeId = null; save(); paintSetup(); setView('practice'); };
  const again = el('button', 'ghost', 'Change & rebuild'); again.type = 'button'; again.onclick = () => { Object.assign(researchForm, r.settings, {web: r.web}); store('research', researchForm); activeResearchId = null; save(); renderResearchView(); };
  actions.append(use, again); head.append(left, actions);
  const progress = el('div', 'rw-progress'); progress.setAttribute('role', 'status'); progress.append(el('span', 'rw-spinner'), el('span', null, 'Building your brief. You can read each tab as it fills in.'));
  const stop = el('button', 'ghost', 'Stop'); stop.type = 'button'; stop.onclick = () => controller?.abort(); progress.append(stop);
  const tabs = el('div', 'rw-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Research brief');
  RW_TABS.forEach(([id, label], i) => {
    const b = el('button', 'rw-tab', label); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'rwtab-' + id; b.dataset.tab = id;
    b.onclick = () => { r.tab = id; renderResearchOutput(r); if (id === 'ask') out.querySelector('#askInput')?.focus(); };
    b.onkeydown = e => { const step = {ArrowRight: 1, ArrowLeft: -1}[e.key]; if (!step) return; e.preventDefault(); const next = RW_TABS[(i + step + RW_TABS.length) % RW_TABS.length][0]; r.tab = next; renderResearchOutput(r); out.querySelector('#rwtab-' + next).focus(); };
    tabs.append(b);
  });
  const pane = el('div', 'rw-pane'); pane.setAttribute('role', 'tabpanel'); pane.tabIndex = 0;
  const ask = el('form', 'ask-bar'); ask.id = 'askForm';
  const label = el('label', 'sr-only', 'Ask a question about this topic'); label.htmlFor = 'askInput';
  const input = el('textarea'); input.id = 'askInput'; input.rows = 1; input.maxLength = 2000; input.placeholder = 'Have a doubt? Ask anything about this topic…';
  input.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask.requestSubmit(); } };
  input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; };
  const send = el('button', 'send-btn'); send.type = 'submit'; send.setAttribute('aria-label', 'Ask'); send.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  ask.append(label, input, send);
  ask.onsubmit = e => { e.preventDefault(); const q = input.value.trim(); if (!q) return; input.value = ''; input.style.height = 'auto'; askResearch(r, q); };
  out.append(head, progress, tabs, pane, ask);
}
const ASK_IDEAS = s => [
  'Explain this topic to me like I am new to it',
  s.format === 'mun' ? `What is ${s.country || 'my country'}'s likely position, and who are my allies?` : s.side ? `What are the 3 strongest points for ${s.side === 'for' ? 'For' : 'Against'}?` : 'What are the strongest points on each side?',
  'What will the other side say, and how do I answer it?',
  'Quiz me with 5 quick questions',
  s.format === 'mun' ? 'Write a 1-minute opening statement I can adapt' : 'Write a 1-minute opening speech I can adapt'
];
function renderAsk(pane, r) {
  const thread = el('div', 'ask-thread');
  if (!r.chat?.length) {
    const hello = el('div', 'ask-empty'); hello.append(el('h4', null, 'Ask anything about this topic'), el('p', null, 'Stuck on a term, an argument or what to say? Ask in your own words. Debate Buddy answers using your brief' + (r.web ? ' and live web search when it needs fresh facts.' : '.')));
    const ideas = el('div', 'ask-ideas'); for (const q of ASK_IDEAS(r.settings)) { const b = el('button', 'chip', q); b.type = 'button'; b.onclick = () => askResearch(r, q); ideas.append(b); }
    hello.append(ideas); thread.append(hello);
  }
  for (const m of r.chat || []) {
    const row = el('div', 'ask-msg ' + (m.role === 'user' ? 'me' : m.role === 'error' ? 'err' : 'bot'));
    row.append(el('span', 'who', m.role === 'user' ? 'You' : m.role === 'error' ? 'Problem' : 'Debate Buddy'));
    const b = el('div', 'bubble'); if (m.role === 'assistant') rich(b, m.text); else b.textContent = m.text; row.append(b); thread.append(row);
  }
  if (r.asking) { const row = el('div', 'ask-msg bot pending'); row.append(el('span', 'who', 'Debate Buddy')); const b = el('div', 'bubble'); r.pending ? rich(b, r.pending) : b.append(el('span', 'typing', 'Thinking')); row.append(b); thread.append(row); }
  pane.append(thread);
  requestAnimationFrame(() => { const panel = $('#researchPanel'); panel.scrollTop = panel.scrollHeight; });
}
async function askResearch(r, question) {
  r.tab = 'ask'; r.chat ||= [];
  if (busy) { toast('Wait for the current reply to finish.'); return; }
  r.chat.push({role: 'user', text: question, at: Date.now()});
  if (engine !== 'ready') { r.chat.push({role: 'error', text: 'Questions need the AI engine, which is not available right now. ' + ENGINE_TEXT[engine]}); save(); renderResearchOutput(r); return; }
  r.asking = true; r.pending = ''; save(); renderResearchOutput(r);
  const history = [{role: 'assistant', text: r.text.slice(0, 6000)}, ...r.chat.slice(0, -1).filter(m => m.role !== 'error').map(m => ({role: m.role, text: m.text}))];
  const drafts = new Map(); let paint = 0;
  try {
    await stream({kind: 'research-ask', session: r.settings, message: question, chatId: r.id, web: r.web, history,
      onDraft: (id, t) => { drafts.set(id, t); r.pending = [...drafts.values()].join('\n\n'); if (!paint) paint = setTimeout(() => { paint = 0; if (activeResearchId === r.id && view === 'research' && r.tab === 'ask') renderResearchOutput(r); }, 200); },
      onMessage: (id, t) => { drafts.set(id, t); }});
    r.chat.push({role: 'assistant', text: [...drafts.values()].join('\n\n'), at: Date.now()});
  } catch (error) { const partial = [...drafts.values()].join('\n\n'); if (partial) r.chat.push({role: 'assistant', text: partial, at: Date.now()}); r.chat.push({role: 'error', text: error.name === 'AbortError' ? 'Stopped.' : error.message}); }
  finally { clearTimeout(paint); r.asking = false; r.pending = ''; r.updatedAt = Date.now(); save(); if (activeResearchId === r.id) renderResearchOutput(r); }
}
function printSection(section) {
  document.body.classList.add('printing'); section.classList.add('print-target');
  const done = () => { document.body.classList.remove('printing'); section.classList.remove('print-target'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done); window.print(); setTimeout(done, 1000);
}

// ---------- Progress ----------
function renderProgress() {
  const body = $('#progressBody'); body.replaceChildren();
  const practiced = sessions.filter(s => s.type === 'practice'), reviewed = practiced.filter(s => s.review?.scores);
  if (!practiced.length) {
    const empty = el('div', 'empty-state'); empty.append(el('p', null, 'No practice yet. Finish a session with End & review and your feedback will collect here.'));
    const go = el('button', 'primary-btn', 'Choose a topic'); go.type = 'button'; go.onclick = () => setView('debate'); empty.append(go); body.append(empty); return;
  }
  const stats = el('div', 'stat-row');
  const stat = (n, label) => { const s = el('div', 'stat'); s.append(el('b', null, String(n)), el('span', null, label)); return s; };
  stats.append(stat(practiced.length, 'sessions'), stat(reviewed.length, 'reviewed'), stat(practiced.reduce((n, s) => n + s.messages.filter(m => m.role === 'user').length, 0), 'contributions'));
  for (const f of Object.keys(FORMAT)) { const n = practiced.filter(s => s.format === f).length; if (n) stats.append(stat(n, FORMAT_SHORT[f])); }
  body.append(stats);
  if (!reviewed.length) { body.append(el('p', 'panel-note', 'Your sessions have no reviews yet. Press End & review at the end of a session to get feedback.')); }
  for (const f of Object.keys(FORMAT)) {
    const list = reviewed.filter(s => s.format === f); if (!list.length) continue;
    const card = el('section', 'progress-card'); card.append(el('h3', null, FORMAT[f]));
    const self = list.filter(s => s.review.selfAssessed).length;
    card.append(el('p', 'panel-note', `Average of ${list.length} review${list.length === 1 ? '' : 's'}${self ? `, ${self} of them self-assessed` : ''}. Scores are out of 5.`));
    const avg = {}; for (const k of SCORE_KEYS[f]) { const vals = list.map(s => s.review.scores[k]).filter(v => v != null); if (vals.length) avg[k] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10; }
    card.append(scoreBars(avg, f));
    const recent = list.slice(0, 5).reverse();
    if (recent.length > 1) {
      const trend = el('p', 'trend'); trend.append(el('b', null, 'Recent sessions (overall): '));
      trend.append(document.createTextNode(recent.map(s => { const v = Object.values(s.review.scores); return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1); }).join(' → ')));
      card.append(trend);
    }
    const steps = list.flatMap(s => s.review.nextSteps || []).slice(0, 3);
    if (steps.length) { card.append(el('h4', null, 'Your next steps')); const ul = el('ul', 'next-steps'); steps.forEach(x => ul.append(el('li', null, x))); card.append(ul); }
    body.append(card);
  }
  body.append(el('h3', 'section-title', 'Recent reviews'));
  const grid = el('div', 'h-grid');
  for (const s of reviewed.slice(0, 6)) grid.append(historyCard(s));
  body.append(grid);
}

// ---------- History ----------
radioGroup($('#historyFilter'), 'filter', historyFilter, v => { historyFilter = v; renderHistory(); });
// Each item is a card that says in plain words what it is, how far it got, and what you can do next.
function describe(s) {
  const turns = s.type === 'practice' ? s.messages.filter(m => m.role === 'user').length : 0;
  const avg = s.review?.scores ? Object.values(s.review.scores) : null;
  const score = avg?.length ? (avg.reduce((a, b) => a + b, 0) / avg.length).toFixed(1) : null;
  if (s.type === 'research') {
    const sources = (researchSections(s.text).sections.find(x => /^sources/i.test(x.title))?.body.match(/https?:\/\//g) || []).length;
    const questions = (s.chat || []).filter(m => m.role === 'user').length;
    return {kind: 'Research brief', status: s.status === 'failed' ? ['bad', 'Did not finish'] : s.status === 'running' ? ['live', 'Being written'] : s.offline ? ['warn', 'Offline brief'] : s.web ? ['good', 'Researched live'] : ['warn', 'No web search'],
      detail: [s.offline ? 'Plan and searches only' : sources ? `${sources} source${sources === 1 ? '' : 's'}` : 'No sources listed', questions ? `${questions} question${questions === 1 ? '' : 's'} asked` : ''].filter(Boolean).join(' · '),
      action: 'Open brief'};
  }
  const who = s.format === 'mun' ? `You were ${s.settings.country}` : s.format === 'for-against' ? `You argued ${s.settings.side === 'for' ? 'For' : 'Against'}` : `${s.settings.participants || 3} other participants`;
  const status = s.status === 'ended' ? (score ? ['good', `Reviewed · ${score} / 5`] : ['muted', 'Finished']) : s.status === 'paused' ? ['warn', 'Paused'] : ['live', 'In progress'];
  return {kind: s.offline ? 'Solo drill' : 'Practice', status, detail: [who, `${turns} turn${turns === 1 ? '' : 's'} by you`, DIFFICULTY[s.settings.difficulty]?.label].filter(Boolean).join(' · '),
    action: s.status === 'ended' ? (s.review ? 'See review' : 'Read transcript') : 'Continue'};
}
function historyCard(s) {
  const d = describe(s);
  const card = el('article', 'h-card ' + s.type);
  const icon = el('span', 'h-icon', s.type === 'research' ? '📚' : s.format === 'mun' ? '🌐' : s.format === 'group' ? '💬' : '⚖️'); icon.setAttribute('aria-hidden', 'true');
  const body = el('div', 'h-body');
  const top = el('div', 'h-top'); top.append(el('span', 'h-kind', `${d.kind} · ${FORMAT_SHORT[s.format]}`), el('span', 'h-status h-' + d.status[0], d.status[1]));
  const title = el('h3', 'h-title', s.topic);
  body.append(top, title, el('p', 'h-detail', d.detail), el('p', 'h-time', 'Last updated ' + timeOf(s.updatedAt || s.createdAt)));
  const actions = el('div', 'h-actions');
  const open = el('button', 'primary-btn', d.action); open.type = 'button'; open.onclick = () => openSession(s); open.setAttribute('aria-label', d.action + ': ' + clip(s.topic, 60));
  const del = el('button', 'ghost', 'Delete'); del.type = 'button'; del.setAttribute('aria-label', 'Delete ' + clip(s.topic, 60));
  del.onclick = async () => { if (!await confirmAction('Delete this item?', `“${clip(s.topic, 80)}” will be removed from this browser${cloud?.state().signedIn ? ' and from your account on every device' : ''}. This cannot be undone.`, 'Delete')) return; if (busy && (s.id === activePracticeId || s.id === activeResearchId)) controller?.abort(); sessions = sessions.filter(x => x !== s); cloud?.deleted([s.id]); if (activePracticeId === s.id) activePracticeId = null; if (activeResearchId === s.id) activeResearchId = null; save(); renderHistory(); if (view === 'progress') renderProgress(); };
  actions.append(open, del);
  card.append(icon, body, actions); return card;
}
const historyRow = historyCard;
function openSession(s) {
  if (s.type === 'research') { activeResearchId = s.id; save(); setView('research'); return; }
  const live = practice(); if (live && live !== s && live.status === 'active') pauseSession(true);
  activePracticeId = s.id; save(); setView('practice');
}
function dayLabel(t) {
  const d = new Date(t), today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  return diff <= 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? 'This week' : 'Earlier';
}
function renderHistory() {
  const box = $('#sessionHistory'); box.replaceChildren();
  const q = ($('#historySearch')?.value || '').trim().toLowerCase();
  const list = sessions.filter(s => (historyFilter === 'all' || s.type === historyFilter) && (!q || [s.topic, FORMAT[s.format], s.settings?.country, s.settings?.committee].filter(Boolean).join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
  $('#historySummary').textContent = sessions.length ? `${list.length} of ${sessions.length} saved item${sessions.length === 1 ? '' : 's'}. ${cloud?.state().signedIn ? 'Saved in this browser and synced to your account.' : 'Everything stays in this browser on this computer.'}` : '';
  if (!sessions.length) {
    const empty = el('div', 'empty-state'); empty.append(el('p', null, 'Nothing saved yet. Every practice session and research brief you make shows up here, so you can pick up where you left off.'));
    const go = el('button', 'primary-btn', 'Choose a topic'); go.type = 'button'; go.onclick = () => setView('debate'); empty.append(go); box.append(empty); return;
  }
  if (!list.length) { box.append(el('p', 'empty', 'Nothing matches. Try another word or show All.')); return; }
  let group = null, grid = null;
  for (const s of list) {
    const label = dayLabel(s.updatedAt || s.createdAt);
    if (label !== group) { group = label; box.append(el('h3', 'h-group', label)); grid = el('div', 'h-grid'); box.append(grid); }
    grid.append(historyCard(s));
  }
}
$('#historySearch').oninput = renderHistory;

// ---------- Settings ----------
function applyPreferences() {
  const theme = prefs.theme === 'light' ? 'light' : 'dark'; document.documentElement.dataset.theme = theme;
  const look = ['core', 'glass', 'marigold'].includes(prefs.ui) ? prefs.ui : 'core'; document.documentElement.dataset.ui = look;
  $('#uiChoice').value = look; $('#themePreference').value = theme;
  document.documentElement.classList.toggle('reduce-motion', !!prefs.reducedMotion);
  document.documentElement.dataset.cursor = prefs.cursor === false ? 'off' : 'on';
  $('#cursorPreference').checked = prefs.cursor !== false; $('#motionPreference').checked = !!prefs.reducedMotion;
  $('#readAloud').value = ['off', 'browser', 'elevenlabs'].includes(prefs.readAloud) ? prefs.readAloud : 'off';
  document.body.dataset.face = {core: 'dots', glass: 'orb', marigold: 'illustrated'}[look];
  $('#voiceToggle').setAttribute('aria-pressed', String(prefs.readAloud !== 'off')); $('#voiceToggleLabel').textContent = prefs.readAloud !== 'off' ? 'Voice on' : 'Voice off';
  requestAnimationFrame(() => { document.querySelector('meta[name=theme-color]').content = getComputedStyle(document.body).backgroundColor || (theme === 'light' ? '#F2F2F2' : '#000000'); });
}
const savePrefs = () => { store('preferences', prefs); applyPreferences(); };
applyPreferences();
const FACE_FOR_UI = {core: 'dots', glass: 'orb', marigold: 'illustrated'};
const face = new Face({getVoiceLevels: () => narrator.levels(), reducedMotion: reduced, style: () => FACE_FOR_UI[prefs.ui] || 'dots'});
const motion = initMotion({face});
initLooks({prefs, save: () => store('preferences', prefs), toast});
$('#themePreference').onchange = () => { prefs.theme = $('#themePreference').value; motion.switchLook(savePrefs); };
$('#uiChoice').onchange = () => { prefs.ui = $('#uiChoice').value; motion.switchLook(savePrefs); };
$('#cursorPreference').onchange = () => { prefs.cursor = $('#cursorPreference').checked; savePrefs(); };
$('#motionPreference').onchange = () => { prefs.reducedMotion = $('#motionPreference').checked; savePrefs(); };
const reader = new Reader({mode: () => prefs.readAloud, onError: toast});
// Phones only allow speech after a tap, so the first tap anywhere unlocks it.
for (const type of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(type, () => { if (prefs.readAloud !== 'off') reader.unlock(); }, {capture: true, passive: true});
$('#readAloud').onchange = () => { prefs.readAloud = $('#readAloud').value; savePrefs(); if (prefs.readAloud === 'off') reader.stop(); };
$('#saveElevenLabsKey').onclick = async () => {
  const input = $('#elevenLabsApiKey'), button = $('#saveElevenLabsKey'); if (!input.value.trim()) { toast('Paste an ElevenLabs API key first.'); return; }
  button.disabled = true;
  try {
    const response = await fetch('/api/settings/elevenlabs-key', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({apiKey: input.value})});
    const data = await response.json(); if (!response.ok) throw new Error(data.error); input.value = '';
    $('#voiceCheck').textContent = data.check?.ok ? 'Key saved and working.' : 'Key saved, but ElevenLabs reported: ' + (data.check?.error || 'a problem.');
    if (data.check?.ok) { prefs.readAloud = 'elevenlabs'; savePrefs(); }
  } catch (error) { $('#voiceCheck').textContent = error.message; } finally { button.disabled = false; }
};
$('#testVoice').onclick = async () => {
  if (prefs.readAloud === 'off') { toast('Choose a voice under “Read AI turns aloud” first.'); return; }
  if (prefs.readAloud === 'elevenlabs') {
    try { const r = await fetch('/api/settings/elevenlabs-test', {method: 'POST'}); const d = await r.json(); $('#voiceCheck').textContent = d.ok ? 'ElevenLabs is working.' : d.error; } catch { $('#voiceCheck').textContent = 'The local server did not respond.'; }
  }
  narrate([{name: 'Debate Buddy', text: 'This is how Debate Buddy will read the other side of the debate.'}], null);
};
$('#exportData').onclick = () => {
  const blob = new Blob([JSON.stringify({app: 'Debate Buddy', exportedAt: new Date().toISOString(), sessions, selection, setup}, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob); const a = Object.assign(document.createElement('a'), {href: url, download: 'debate-buddy-history.json'}); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('#clearData').onclick = async () => {
  if (!await confirmAction('Delete all history?', 'Every practice session, review and research workspace saved in this browser will be removed' + (cloud?.state().signedIn ? ', and also from your account on every device' : '') + '. Settings stay. Export a backup first if you want to keep them.', 'Delete everything')) return;
  controller?.abort(); cloud?.deleted(sessions.map(s => s.id)); sessions = []; activePracticeId = null; activeResearchId = null; save(); renderHistory(); renderPractice(); toast('History deleted.');
};

// ---------- Phone access ----------
let phoneLinks = [];
function drawQr(text) {
  const box = $('#phoneQr'); box.replaceChildren();
  if (!window.qrcode) { box.textContent = 'QR code unavailable.'; return; }
  const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
  const n = qr.getModuleCount(), cell = 6, pad = 4, size = (n + pad * 2) * cell;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', `0 0 ${size} ${size}`); svg.setAttribute('aria-hidden', 'true');
  let d = ''; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${(c + pad) * cell} ${(r + pad) * cell}h${cell}v${cell}h-${cell}z`;
  const bg = document.createElementNS(svg.namespaceURI, 'rect'); bg.setAttribute('width', size); bg.setAttribute('height', size); bg.setAttribute('fill', '#fff');
  const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); path.setAttribute('fill', '#000');
  svg.append(bg, path); box.append(svg);
}
function paintPhone(info) {
  phoneLinks = info.links || [];
  const on = !!info.enabled;
  $('#phoneToggle').textContent = on ? 'Turn off phone access' : 'Turn on phone access'; $('#phoneToggle').setAttribute('aria-pressed', String(on));
  $('#phoneReset').hidden = !on; $('#phonePanel').hidden = !on || !phoneLinks.length;
  const pick = $('#phoneAddress'); pick.hidden = $('#phoneAddressLabel').hidden = phoneLinks.length < 2;
  pick.replaceChildren(...phoneLinks.map((l, i) => new Option(`${l.address} (${l.name}${l.local ? '' : ', not a home network'})`, String(i))));
  const show = i => { const l = phoneLinks[i]; if (!l) return; drawQr(l.url); $('#phoneUrl').textContent = l.url; };
  pick.onchange = () => show(Number(pick.value)); show(0);
  $('#phoneNote').textContent = on && !phoneLinks.length ? 'Phone access is on, but this computer is not connected to a network. Connect to Wi-Fi and reopen Settings.'
    : on ? 'If your phone cannot open it, allow Node.js through the firewall when your computer asks, and check both devices are on the same Wi-Fi (guest networks often block this).' : '';
}
async function phoneRequest(body) {
  const response = await fetch('/api/phone', body ? {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)} : {cache: 'no-store'});
  if (response.status === 404 || response.status === 405) throw new Error('An older Debate Buddy server is still running. Close Debate Buddy, start it again with the launcher, and try once more.');
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Phone access could not change.'); return data;
}
if (REMOTE) {
  $('#phoneSetting').hidden = true;
  $('#saveElevenLabsKey').closest('.inline-field').hidden = true;
  $('#reconnectEngine').hidden = true;
} else {
  phoneRequest().then(paintPhone).catch(() => {});
  $('#phoneToggle').onclick = async () => {
    const button = $('#phoneToggle'); button.disabled = true;
    try { paintPhone(await phoneRequest({enabled: button.getAttribute('aria-pressed') !== 'true'})); } catch (error) { toast(error.message); } finally { button.disabled = false; }
  };
  $('#phoneReset').onclick = async () => {
    if (!await confirmAction('Make a new phone link?', 'The old link and any phone already signed in will stop working. Scan the new code on your phone.', 'New link')) return;
    try { paintPhone(await phoneRequest({reset: true, enabled: true})); toast('New phone link ready.'); } catch (error) { toast(error.message); }
  };
}

// ---------- Ask AI: one question, one answer (the server calls the AI; this page only shows the reply) ----------
let asking = null;
$('#askQuestion').addEventListener('input', () => { $('#askCount').textContent = $('#askQuestion').value.length.toLocaleString() + ' / 2,000'; });
$('#askQuestion').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#askForm').requestSubmit(); } });
$('#askForm').onsubmit = async e => {
  e.preventDefault();
  const button = $('#askSend'), status = $('#askStatus');
  if (asking) { asking.abort(); return; }           // the button reads "Stop" while waiting
  const question = $('#askQuestion').value.trim();
  if (question.length < 3) { status.textContent = 'Type a question first.'; $('#askQuestion').focus(); return; }
  asking = new AbortController(); button.textContent = 'Stop'; status.textContent = 'Thinking…'; $('#askAnswer').hidden = true;
  try {
    const response = await fetch('/api/ask', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({question}), signal: asking.signal});
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { cloud?.refresh(); throw new Error(data.error || 'Sign in to use the AI.'); }
    if (!response.ok) throw new Error(data.error || 'The AI could not answer. Try again.');
    rich($('#askAnswerText'), data.answer); $('#askAnswerText').dir = 'auto';
    $('#askAnswerNote').textContent = 'Written by AI (' + data.model + '). It did not check the web: verify facts and sources before you rely on them.';
    $('#askAnswer').hidden = false; status.textContent = '';
  } catch (error) { status.textContent = error.name === 'AbortError' ? 'Stopped.' : error.message || 'The local Debate Buddy server is not responding.'; }
  finally { asking = null; button.textContent = 'Ask'; }
};

// ---------- Account, cloud sync and shared topics ----------
let gateWasLocked = true;
function paintAccount() {
  if (!cloud) return;
  const a = cloud.state(), box = $('#accountStatus'), note = $('#accountNote');
  // The sign-in screen covers the app until someone is signed in.
  const locked = !a.signedIn;
  document.body.dataset.locked = String(locked); $('#authGate').hidden = !locked;
  for (const node of [$('.topbar'), $('.tabs'), $('.shell'), $('#saveWarning')]) node.inert = locked;
  $('#accountForm').hidden = !a.configured || a.signedIn || !!a.checking || !!a.offline;
  $('#gateRetry').hidden = !(a.offline && !a.signedIn);
  $('#gateTitle').textContent = a.checking ? 'Debate Buddy' : 'Sign in to start';
  $('#gateText').textContent = a.checking ? 'Checking your sign-in…' : a.offline ? 'Could not check your sign-in. The Debate Buddy server on this computer is not responding. Start it again with the launcher.' : !a.configured ? 'Sign-in is not set up on this computer yet. Whoever installed Debate Buddy needs to add the Supabase details to the .env.local file (see START HERE.txt).' : 'Use your Debate Buddy account. Your sessions, progress and settings are saved to it.';
  if (locked && !gateWasLocked) { narrator?.stop?.(); if (practice()?.status === 'active' && !busy) pauseSession(true); if (!a.checking) setTimeout(() => $('#accountEmail')?.focus(), 50); }
  gateWasLocked = locked;
  $('#signOut').hidden = !a.signedIn; $('#syncNow').hidden = !a.signedIn || a.schema === false || !!a.blocked; $('#syncNow').disabled = !!a.syncing;
  if (!a.signedIn) box.textContent = 'Not signed in.';
  else box.textContent = `Signed in as ${a.email} (${a.role === 'teacher' ? 'teacher' : 'student'}).`;
  let text = '';
  if (a.signedIn) text = a.problem || a.blocked || (a.syncing ? 'Syncing…' : a.lastError ? 'Sync problem: ' + a.lastError + ' Your work is still saved in this browser.' : a.lastSync ? 'All synced at ' + new Date(a.lastSync).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) + '.' : '');
  note.textContent = text;
  $('#sharedTopicForm').hidden = !(a.signedIn && a.role === 'teacher' && a.schema !== false);
  $('#dataSummary').textContent = a.signedIn && a.schema !== false && !a.blocked ? 'Sessions, research and settings are saved in this browser and synced to your account in your Supabase project. Turns sent to Vercel AI Gateway are processed by the selected AI provider.' : 'Sessions, research and settings are saved in this browser on this computer. Only your AI requests are sent to Vercel AI Gateway and the selected AI provider.';
}
function setSharedTopics(list) {
  const before = sharedTopics.map(t => t.id).join();
  sharedTopics = (Array.isArray(list) ? list : []).filter(t => t && typeof t.text === 'string' && Array.isArray(t.formats) && t.formats.length).map(t => ({id: t.id, text: t.text, category: t.category, formats: t.formats, shared: true}));
  if (before === sharedTopics.map(t => t.id).join()) return;
  const own = suggestionOrder.filter(t => !t.shared); suggestionOrder = [...sharedTopics, ...own];
  renderSuggestions(); if (view === 'topics') renderLibrary();
}
// Sessions that arrived from (or were removed by) another device.
function applyCloud({upserts = [], remove = [], clear = false}) {
  if (clear) sessions = [];
  const gone = new Set(remove); sessions = sessions.filter(s => !gone.has(s.id));
  for (const u of upserts) {
    if (u.status === 'running') u.status = u.text ? 'done' : 'failed'; if (u.status === 'reviewing') u.status = 'active';
    const at = sessions.findIndex(s => s.id === u.id); if (at >= 0) sessions[at] = u; else sessions.push(u);
  }
  sessions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  if (activePracticeId && !practice()) activePracticeId = null;
  if (activeResearchId && !researchSession()) activeResearchId = null;
  save(true);
  if (view === 'history') renderHistory(); else if (view === 'progress') renderProgress(); else if (view === 'practice' && !busy) renderPractice(); else if (view === 'research' && !busy) renderResearchView();
  updateBrief();
}
cloud = createCloud({
  sessions: () => sessions,
  protectedIds: () => new Set(busy ? [activePracticeId, activeResearchId].filter(Boolean) : []),
  apply: applyCloud, persist: () => save(true), onState: paintAccount, onTopics: setSharedTopics,
  onSettings: () => { $('#gateTitle').textContent = 'Debate Buddy'; $('#gateText').textContent = 'Loading your settings…'; $('#accountForm').hidden = true; $('#authGate').hidden = false; location.reload(); }
});
async function accountAction(kind) {
  const form = $('#accountForm'), note = $('#gateNote'); if (!form.reportValidity()) return;
  const email = $('#accountEmail').value.trim(), password = $('#accountPassword').value, buttons = [$('#signIn'), $('#signUp')];
  buttons.forEach(b => { b.disabled = true; }); note.textContent = kind === 'up' ? 'Creating your account…' : 'Signing in…';
  try {
    const result = kind === 'up' ? await cloud.signUp(email, password) : await cloud.signIn(email, password);
    $('#accountPassword').value = '';
    if (result.needsConfirmation) note.textContent = 'Almost there. Supabase has emailed you a link: open it to confirm your address, then come back here and sign in.';
    else { note.textContent = ''; toast('Signed in as ' + email + '.'); paintAccount(); }
  } catch (error) { note.textContent = error.message; }
  finally { buttons.forEach(b => { b.disabled = false; }); }
}
$('#accountForm').onsubmit = e => { e.preventDefault(); accountAction('in'); };
$('#signUp').onclick = () => accountAction('up');
$('#gateRetry').onclick = () => { $('#gateText').textContent = 'Checking your sign-in…'; cloud.refresh(); };
$('#syncNow').onclick = async () => { await cloud.syncNow(); const a = cloud.state(); toast(a.lastError ? 'Sync problem: ' + a.lastError : 'Synced.'); };
$('#signOut').onclick = async () => {
  if (!await confirmAction('Sign out?', 'Your work is saved in your account. Debate Buddy will show the sign-in screen until someone signs in again.', 'Sign out')) return;
  const button = $('#signOut'); button.disabled = true;
  // Pause first so the paused state is uploaded before signing out.
  narrator.stop(); if (practice()?.status === 'active' && !busy) pauseSession(true);
  try { await cloud.signOut(); toast('Signed out.'); } catch (error) { toast(error.message); } finally { button.disabled = false; }
};
for (const c of CATEGORIES) { const o = el('option', null, c.label); o.value = c.id; $('#sharedTopicCategory').append(o); }
$('#sharedTopicForm').onsubmit = async e => {
  e.preventDefault();
  const formats = $$('input[name=sharedFormat]:checked').map(i => i.value);
  if (!formats.length) { toast('Choose at least one format.'); return; }
  try { await cloud.addTopic({text: $('#sharedTopicText').value, category: $('#sharedTopicCategory').value, formats}); $('#sharedTopicText').value = ''; toast('Topic shared with your students.'); }
  catch (error) { toast(error.message); }
};
setSharedTopics(cloud.cachedTopics());
document.addEventListener('visibilitychange', () => { if (!document.hidden && cloud.state().signedIn && Date.now() - cloud.state().lastSync > 60000) cloud.syncNow(); });

// ---------- Start ----------
renderCategories(); renderSuggestions(); renderReady(); paintSetup(); paintResearchForm();
$('#historyCount').textContent = sessions.length;
const startView = location.hash.slice(1) || load('view', 'debate');
setView(VIEWS.includes(startView) ? startView : 'debate');
if (practice()?.status === 'active') startTimer(practice(), true);
if (restored.error) { $('#saveWarning').hidden = false; $('#saveWarningText').textContent = 'Saved history could not be opened in this browser (' + (restored.error.message || 'storage blocked') + '). New work may not be saved.'; }
status(); setInterval(status, 30000);
cloud.refresh();
