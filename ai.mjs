// "Ask AI": one question in, one answer out, using the Vercel AI SDK through the
// Vercel AI Gateway. This runs on the server only. The gateway key is read from the
// local .env.local file and is never sent to the browser.
import {generateText, createGateway} from 'ai';
import {readEnv} from './env-file.mjs';

// A small, low-cost model. Change it by setting AI_GATEWAY_MODEL in .env.local
// (the Vercel AI Gateway dashboard lists the model names you can use).
export const DEFAULT_MODEL = 'openai/gpt-5.4-nano';

export function readAiConfig(root) {
  const local = readEnv(root);
  const pick = key => String(local[key] || process.env[key] || '').trim().replace(/^["']|["']$/g, '');
  return {apiKey: pick('AI_GATEWAY_API_KEY').replace(/^bearer\s+/i, '').replace(/\s+/g, ''), model: pick('AI_GATEWAY_MODEL') || DEFAULT_MODEL, baseURL: pick('AI_GATEWAY_BASE_URL')};
}

// What the AI is told before every question. It keeps answers on debate and honest about sources.
const INSTRUCTIONS = `You are the question helper inside Debate Buddy, an app that helps school students research and practise debates, group discussions and Model United Nations.
- Only help with debate-related work: motions and topics, arguments for and against, rebuttals, structure, delivery, research planning, group discussion skills and MUN procedure. If the question is about something else, say in one or two sentences that Debate Buddy only supports debate-related work and suggest a debate angle if there is one. Do not answer the unrelated question.
- You cannot browse the web or check facts here. Never invent sources, statistics, quotations, citations or a country's official position. If a fact matters, say it needs checking and suggest two or three search queries and the kind of source to look for (for example an official UN page, a government site or a named research body).
- Make clear what is your own reasoning or suggestion and what the student must verify.
- Help the student think for themselves: explain the reasoning, offer both sides where it helps, and do not write a speech for them to memorise unless they ask for an example.
- Write for a school student in plain, friendly language. Keep it short: usually under 250 words, with short paragraphs or a few bullet points.`;

// A simple per-person limit so one account cannot use up the AI budget.
const WINDOW_MS = 10 * 60 * 1000, MAX_QUESTIONS = 20, recent = new Map();
export function allowQuestion(userId, now = Date.now()) {
  const times = (recent.get(userId) || []).filter(t => now - t < WINDOW_MS);
  if (times.length >= MAX_QUESTIONS) { recent.set(userId, times); return false; }
  times.push(now); recent.set(userId, times); return true;
}

const fail = (status, message) => Object.assign(new Error(message), {status});
export async function askAi(root, question, signal) {
  const config = readAiConfig(root);
  if (!config.apiKey) throw fail(503, 'The AI is not set up on this computer yet. Add AI_GATEWAY_API_KEY to the .env.local file (see START HERE.txt).');
  const gateway = createGateway({apiKey: config.apiKey, ...(config.baseURL ? {baseURL: config.baseURL} : {})});
  try {
    const {text} = await generateText({model: gateway(config.model), instructions: INSTRUCTIONS, prompt: question, maxOutputTokens: 700, maxRetries: 1, timeout: 60000, abortSignal: signal});
    if (!text?.trim()) throw fail(502, 'The AI returned an empty answer. Try asking again.');
    return {answer: text.trim(), model: config.model};
  } catch (error) {
    if (error.status) throw error;
    if (signal?.aborted) throw fail(499, 'Stopped.');
    // The SDK reports gateway problems by error name; some also carry an HTTP status.
    const byName = {GatewayAuthenticationError: 401, GatewayForbiddenError: 403, GatewayModelNotFoundError: 404, GatewayRateLimitError: 429, GatewayTimeoutError: 408};
    const code = error.statusCode ?? error.cause?.statusCode ?? byName[error.name] ?? byName[error.cause?.name] ?? 0;
    // The gateway's own words (colour codes and anything key-like removed), shown when they explain the refusal.
    const said = String(error.message || '').replace(/\x1b\[[0-9;]*m/g, '').replace(/\b(vck|sk|key)_[A-Za-z0-9_-]{8,}/g, '[key hidden]').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (code === 401) throw fail(502, 'The AI Gateway did not accept the key. Check that AI_GATEWAY_API_KEY in .env.local is the whole key, has not been deleted in the Vercel dashboard, and belongs to the right team.');
    if (code === 403) throw fail(502, 'The AI Gateway recognised the key but refused the request. It says: "' + (said || 'Forbidden') + '" This is fixed in the Vercel dashboard, not in the app.');
    if (code === 404) throw fail(502, `The AI Gateway does not know the model "${config.model}". Set AI_GATEWAY_MODEL in .env.local to a model from your AI Gateway dashboard.`);
    if (code === 402) throw fail(502, 'The AI Gateway account has no credit left. Add credit in the Vercel dashboard (AI Gateway).');
    if (code === 429) throw fail(429, 'The AI is busy or the usage limit was reached. Wait a moment and try again.');
    if (code === 408 || error.name === 'TimeoutError' || /timed? ?out/i.test(error.message || '')) throw fail(504, 'The AI took too long to answer. Try again.');
    if (code >= 400 && code < 500 && said) throw fail(502, 'The AI Gateway refused the request. It says: "' + said + '"');
    throw fail(502, 'Could not reach the AI. Check the internet connection and try again.');
  }
}
