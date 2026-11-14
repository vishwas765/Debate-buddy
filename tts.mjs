import {readEnv} from './env-file.mjs';

export const DEFAULT_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9';
export const DEFAULT_MODEL_ID = 'eleven_turbo_v2_5';

export function readVoiceConfig(root) {
  const local = readEnv(root);
  const pick = key => String(local[key] || process.env[key] || '').trim().replace(/^["']|["']$/g, '');
  // Keys copied from the dashboard sometimes carry spaces or a "Bearer " prefix.
  const apiKey = pick('ELEVENLABS_API_KEY').replace(/^bearer\s+/i, '').replace(/\s+/g, '');
  return {apiKey, voiceId: pick('ELEVENLABS_VOICE_ID') || DEFAULT_VOICE_ID, modelId: pick('ELEVENLABS_MODEL_ID') || DEFAULT_MODEL_ID};
}
export function voiceStatus(config) {
  return {provider: 'ElevenLabs', configured: !!config.apiKey, voiceId: config.voiceId, modelId: config.modelId, keyHint: config.apiKey ? '…' + config.apiKey.slice(-4) : ''};
}
export class VoiceError extends Error { constructor(status, message, code = '') { super(message); this.status = status; this.code = code; } }

// ElevenLabs answers with {detail:{status,message}}; turn it into advice a person can act on.
export async function describeFailure(response) {
  let detail = {};
  try { const body = await response.json(); detail = typeof body?.detail === 'object' ? body.detail : {message: String(body?.detail || body?.message || '')}; } catch {}
  const code = String(detail.status || detail.code || '').toLowerCase();
  const said = String(detail.message || '').slice(0, 240);
  const advice = {
    invalid_api_key: 'ElevenLabs says this API key is invalid. Copy the key again from elevenlabs.io → Developers → API keys.',
    missing_permissions: 'This ElevenLabs key is restricted. Edit the key on elevenlabs.io and allow “Text to Speech” (and “Voices: read” to list voices).',
    quota_exceeded: 'Your ElevenLabs character quota is used up for this period.',
    detected_unusual_activity: 'ElevenLabs blocked free-tier API use from this network (often a VPN or shared IP). Turn off the VPN or use a paid plan.',
    voice_not_found: 'The chosen ElevenLabs voice is not in your account. Pick another voice in Settings.',
    payment_required: 'That voice needs a paid ElevenLabs plan. Pick one of your account voices in Settings.',
    paid_plan_required: 'That voice or model needs a paid ElevenLabs plan. Pick another voice in Settings.',
    model_not_found: 'The ElevenLabs model is not available to this key. Choose another model in Settings.',
    too_many_concurrent_requests: 'ElevenLabs is limiting concurrent requests on your plan. Try again in a moment.',
    system_busy: 'ElevenLabs is busy right now. Try again in a moment.',
  }[code];
  const fallback = response.status === 401 ? 'ElevenLabs rejected the key (401). Check that it was copied completely.'
    : response.status === 402 ? 'ElevenLabs needs a paid plan for this voice or model (402).'
    : response.status === 403 ? 'ElevenLabs refused this request (403). Check the key permissions.'
    : response.status === 404 ? 'ElevenLabs could not find that voice (404). Pick another voice in Settings.'
    : response.status === 429 ? 'ElevenLabs usage or rate limit reached (429).'
    : `ElevenLabs could not generate audio (HTTP ${response.status}).`;
  const message = (advice || fallback) + (said && !advice ? ` ElevenLabs said: ${said}` : '');
  const status = response.status === 429 ? 429 : 502;
  return new VoiceError(status, message, code || (response.status === 404 ? 'voice_not_found' : response.status === 402 ? 'payment_required' : response.status === 401 ? 'invalid_api_key' : ''));
}

export async function* streamSpeech(text, config, signal, fetcher = fetch) {
  if (typeof text !== 'string' || !text.trim() || text.length > 5000) throw new VoiceError(400, 'Speech text must contain 1–5,000 characters.');
  if (!config.apiKey) throw new VoiceError(503, 'Save an ElevenLabs API key in Settings to enable this voice.', 'no_key');
  const combined = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(45000)]);
  let reader;
  try {
    const response = await fetcher('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(config.voiceId) + '/stream?output_format=mp3_44100_128', {method: 'POST', headers: {'xi-api-key': config.apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'}, body: JSON.stringify({text: text.trim(), model_id: config.modelId, voice_settings: {stability: .5, similarity_boost: .75, use_speaker_boost: true}}), signal: combined});
    if (!response.ok) throw await describeFailure(response);
    if (!response.body) throw new VoiceError(502, 'ElevenLabs returned empty audio.');
    reader = response.body.getReader(); let size = 0;
    while (true) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > 15 * 1024 ** 2) throw new VoiceError(502, 'Speech audio exceeded the size limit.'); yield Buffer.from(value); }
    if (!size) throw new VoiceError(502, 'ElevenLabs returned empty audio.');
  } catch (error) {
    if (error instanceof VoiceError) throw error;
    if (signal?.aborted) throw new VoiceError(499, 'Speech request canceled.');
    throw new VoiceError(502, combined.aborted ? 'Speech generation timed out. Try again.' : 'Could not connect to ElevenLabs. Check your internet connection or firewall.', 'network');
  } finally { if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); } }
}

// Voices the key can use. Premade voices come first because they work on every plan.
export async function listVoices(config, fetcher = fetch) {
  if (!config.apiKey) throw new VoiceError(503, 'Save an ElevenLabs API key first.', 'no_key');
  let response;
  try { response = await fetcher('https://api.elevenlabs.io/v1/voices', {headers: {'xi-api-key': config.apiKey, Accept: 'application/json'}, signal: AbortSignal.timeout(15000)}); }
  catch { throw new VoiceError(502, 'Could not connect to ElevenLabs. Check your internet connection.', 'network'); }
  if (!response.ok) throw await describeFailure(response);
  const data = await response.json();
  const order = {premade: 0, cloned: 1, generated: 1, professional: 2};
  return (data.voices || []).map(v => ({id: v.voice_id, name: v.name, category: v.category || 'other', accent: v.labels?.accent || '', gender: v.labels?.gender || ''}))
    .sort((a, b) => (order[a.category] ?? 3) - (order[b.category] ?? 3) || a.name.localeCompare(b.name));
}

// A tiny real request that proves the key, voice and model work together.
export async function testVoice(config, fetcher = fetch) {
  let bytes = 0;
  for await (const chunk of streamSpeech('Hi.', config, null, fetcher)) bytes += chunk.length;
  return {ok: bytes > 0, bytes};
}

export async function synthesize(text, config, signal, fetcher = fetch) { const chunks = []; for await (const chunk of streamSpeech(text, config, signal, fetcher)) chunks.push(chunk); return Buffer.concat(chunks); }
