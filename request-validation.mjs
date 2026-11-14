import {KINDS} from './debate-coach.mjs';
const invalid = message => Object.assign(new Error(message), {status: 400});
export function validateChatPayload(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw invalid('Expected a message object.');
  if (!KINDS.includes(data.kind)) throw invalid('Unknown request type.');
  if (data.message !== undefined && (typeof data.message !== 'string' || data.message.length > 10000)) throw invalid('Keep each contribution under 10,000 characters.');
  if (['turn', 'research-ask'].includes(data.kind) && !String(data.message || '').trim()) throw invalid('Write your contribution first.');
  if (!data.session || typeof data.session !== 'object' || Array.isArray(data.session)) throw invalid('Missing debate session settings.');
  if (typeof data.session.topic !== 'string' || !data.session.topic.trim()) throw invalid('Choose a topic first.');
  if (data.history !== undefined && !Array.isArray(data.history)) throw invalid('history must be an array.');
  if ((data.history || []).some(x => !x || typeof x !== 'object' || !['user', 'assistant'].includes(x.role) || typeof x.text !== 'string')) throw invalid('Invalid session history.');
  if (data.chatId !== undefined && (typeof data.chatId !== 'string' || !/^[a-f0-9-]{36}$/i.test(data.chatId))) throw invalid('Invalid session id.');
  const timeZone = typeof data.timeZone === 'string' && /^[A-Za-z0-9_+\-/]{1,64}$/.test(data.timeZone) ? data.timeZone : '';
  return {kind: data.kind, message: String(data.message || ''), session: data.session, chatId: data.chatId || null, web: data.web === true, timeZone,
    history: (data.history || []).slice(-60).map(x => ({role: x.role, text: x.text.slice(0, 6000)}))};
}
