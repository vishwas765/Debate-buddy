// Supabase client for the local Debate Buddy server, built with @supabase/ssr.
// A new client is made for every request. The signed-in session lives in cookies in
// the visitor's browser; they are HttpOnly, so page scripts cannot read the tokens.
// Only the publishable (anon) key is used, and it never leaves the server.
// There is no browser client on purpose: the page talks to this server, not to Supabase.
import {createServerClient} from '@supabase/ssr';

export function parseCookies(header = '') {
  return String(header).split(';').map(part => part.trim()).filter(Boolean).map(part => {
    const at = part.indexOf('='); if (at < 1) return null;
    let value = part.slice(at + 1); try { value = decodeURIComponent(value); } catch {}
    return {name: part.slice(0, at), value};
  }).filter(Boolean);
}

function serializeCookie({name, value, options = {}}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (process.env.VERCEL === '1') parts.push('Secure');
  if (options.maxAge != null) parts.push('Max-Age=' + Math.max(0, Math.floor(options.maxAge)));
  return parts.join('; ');
}

// `jar` collects the Set-Cookie lines the response must carry (sign-in, refresh, sign-out).
export function createClient(config, req, jar) {
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll() { return parseCookies(req.headers.cookie); },
      setAll(cookiesToSet) { for (const cookie of cookiesToSet) jar.push(serializeCookie(cookie)); }
    }
  });
}
