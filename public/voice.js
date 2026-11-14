// Optional voice helpers: read AI turns aloud, and dictate a contribution.
// Dictation only produces text; Debate Buddy never records or scores audio.
export function plainForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+(.+?)\s*\|\s*(.+)$/gm, '$1.')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`>#]/g, '')
    .replace(/\s+/g, ' ').trim();
}

// Reads speaker blocks one after another. Each speaker keeps its own browser
// voice and pitch, and the callbacks let the face speak for whoever has the floor.
// A tiny silent WAV used to unlock audio on phones.
const SILENCE = 'data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';

export class Reader {
  constructor({mode = () => 'off', onError = () => {}}) {
    this.mode = mode; this.onError = onError; this.version = 0; this.voiceFor = new Map(); this.unlocked = false;
    // One audio element is reused for every clip: phones only allow playback on an element a tap has started once.
    this.audio = typeof Audio === 'function' ? new Audio() : null; if (this.audio) this.audio.preload = 'auto';
    try { speechSynthesis.addEventListener?.('voiceschanged', () => this.voiceFor.clear()); } catch {}
  }
  // Phones (iOS Safari, Android Chrome) block speech that was not started by a tap.
  // Call this from a tap: it plays silence on both speech paths so later turns can talk.
  unlock() {
    if (this.unlocked) return; this.unlocked = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch {}
    try { if (this.audio) { this.audio.src = SILENCE; this.audio.play().catch(() => { this.unlocked = false; }); } } catch {}
  }
  stop() {
    this.version++;
    try { speechSynthesis.cancel(); } catch {}
    if (this.audio && !this.audio.paused) this.audio.pause();
    if (this.blobUrl) { URL.revokeObjectURL(this.blobUrl); this.blobUrl = null; }
    this.finish?.(); this.finish = null;
  }
  get on() { return this.mode() !== 'off'; }
  pickVoice(name) {
    if (this.voiceFor.has(name)) return this.voiceFor.get(name);
    const all = window.speechSynthesis?.getVoices() || [];
    // Prefer voices installed on the device: network voices often fail on phones.
    const english = all.filter(v => /^en/i.test(v.lang)), local = english.filter(v => v.localService);
    const voices = local.length ? local : english;
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const choice = {voice: voices.length ? voices[h % voices.length] : null, pitch: .85 + (h % 7) * .06, rate: .98 + (h % 3) * .03};
    if (voices.length) this.voiceFor.set(name, choice); return choice;
  }
  // blocks: [{name, text}]. Resolves when everything was read or reading stopped.
  async speakBlocks(blocks, {onBlock = () => {}, onWord = () => {}, force = false} = {}) {
    const mode = force && this.mode() === 'off' ? 'browser' : this.mode();
    if (mode === 'off') return;
    this.stop(); const version = this.version;
    const alive = () => version === this.version;
    // Some browsers drop an utterance queued right after cancel().
    await new Promise(r => setTimeout(r, 80));
    for (const [index, block] of blocks.entries()) {
      const text = plainForSpeech(block.text).slice(0, 4000); if (!text || !alive()) continue;
      onBlock(block, index);
      if (mode === 'elevenlabs') {
        try { await this.playEleven(text, alive, onWord); continue; }
        catch (error) { this.onError(error.message + ' Using the browser voice instead.'); }
      }
      await this.sayBrowser(text, block.name || 'Debate Buddy', alive, onWord);
    }
  }
  async playEleven(text, alive, onWord) {
    const response = await fetch('/api/tts', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text})});
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'ElevenLabs could not read this turn.'); }
    const blob = await response.blob(); if (!alive()) return;
    if (!this.audio) throw new Error('Audio playback is not supported here.');
    this.blobUrl = URL.createObjectURL(blob); this.audio.src = this.blobUrl;
    const ticker = setInterval(onWord, 260);
    try {
      await new Promise((resolve, reject) => { this.finish = resolve; this.audio.onended = resolve; this.audio.onerror = () => reject(new Error('Audio playback failed.')); this.audio.play().catch(() => reject(new Error('The phone blocked audio. Tap anywhere on the page, then press play on a turn.'))); });
    } finally { clearInterval(ticker); }
  }
  sayBrowser(text, name, alive, onWord) {
    if (!('speechSynthesis' in window)) { this.onError('This browser cannot read text aloud.'); return Promise.resolve(); }
    const {voice, pitch, rate} = this.pickVoice(name);
    // Short sentences keep Chrome from stopping long utterances part way.
    const parts = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
    return new Promise(res => {
      let resolve = res; this.finish = () => resolve(); let left = parts.length;
      // Some systems never report the end of speech; never wait longer than the text could take.
      const words = text.split(/\s+/).length, cap = setTimeout(resolve, (words / (2.3 * rate) + 2.5) * 1000);
      const done = resolve; resolve = () => { clearTimeout(cap); done(); };
      for (const part of parts) {
        const u = new SpeechSynthesisUtterance(part); if (voice) u.voice = voice; u.lang = voice?.lang || 'en-US'; u.pitch = pitch; u.rate = rate;
        u.onstart = onWord; u.onboundary = onWord;
        u.onend = () => { if (--left <= 0 || !alive()) resolve(); };
        u.onerror = e => { if (e.error === 'not-allowed' && !this.warned) { this.warned = true; this.unlocked = false; this.onError('Your browser blocked the voice. Tap the page once (or press play on a turn) and it will speak.'); } if (--left <= 0 || !alive()) resolve(); };
        speechSynthesis.speak(u);
      }
    });
  }
}

export const dictationSupported = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);

export class Dictation {
  constructor({onText, onState, onError}) { Object.assign(this, {onText, onState, onError}); this.recognition = null; this.active = false; this.base = ''; }
  start(base = '') {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { this.onError('Dictation is not available in this browser. Chrome and Edge support it on Windows and macOS.'); return; }
    this.base = base ? base.replace(/\s*$/, ' ') : '';
    const r = new Recognition(); r.lang = navigator.language || 'en-US'; r.continuous = true; r.interimResults = true;
    let finalText = '';
    r.onresult = event => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript + ' '; else interim += result[0].transcript;
      }
      this.onText((this.base + finalText + interim).replace(/\s+/g, ' ').trimStart());
    };
    r.onerror = event => { if (event.error !== 'no-speech' && event.error !== 'aborted') this.onError(event.error === 'not-allowed' ? 'Microphone access was blocked. Allow it in the browser’s site settings to dictate.' : 'Dictation stopped: ' + event.error + '.'); };
    r.onend = () => { this.active = false; this.recognition = null; this.onState(false); };
    try { r.start(); this.recognition = r; this.active = true; this.onState(true); } catch (error) { this.onError('Dictation could not start.'); }
  }
  stop() { try { this.recognition?.stop(); } catch {} }
}
