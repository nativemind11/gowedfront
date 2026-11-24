'use strict';
/* CULMERA API: helpers shared by api/brief.js, api/admin.js and api/notify.js (Phase 5).
   Nothing in this file stores or logs names, emails, message text, IP addresses or secrets. */
const crypto = require('crypto');

const env = k => (process.env[k] || '').trim();
const isProd = () => (env('VERCEL_ENV') ? env('VERCEL_ENV') === 'production' : env('NODE_ENV') === 'production');
function allowedOrigins() {
  const list = env('ALLOWED_ORIGIN').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
  return list.filter(o => /^https?:\/\/[^*\s/]+$/i.test(o)); // never a wildcard, never a path
}
const siteUrl = () => (env('SITE_URL') || allowedOrigins().find(o => o === 'https://culmera-solutions.com') || allowedOrigins()[0] || 'https://culmera-solutions.com').replace(/\/$/, '');

/* ---------- structured, privacy-conscious logging ---------- */
function log(level, event, fields) {
  const rec = { t: new Date().toISOString(), level, event, ...(fields || {}) };
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  out(JSON.stringify(rec));
}
const errInfo = e => ({ name: e && e.name ? String(e.name).slice(0, 40) : 'Error', code: e && (e.code || e.status) ? String(e.code || e.status).slice(0, 40) : undefined });

/* ---------- text ---------- */
const CTRL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069\uFEFF]/g;
function clean(v, multi) {
  const s = String(v).normalize('NFC').replace(/\r\n?/g, '\n').replace(CTRL, '');
  if (multi) return s.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return s.replace(/\s+/g, ' ').trim();
}
const line = (s, n = 300) => clean(s == null ? '' : s).slice(0, n);

/* ---------- network ---------- */
async function timed(url, opts, ms) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opts, signal: c.signal }); } finally { clearTimeout(t); }
}

/* ---------- Supabase (service key; server side only) ---------- */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const enc = encodeURIComponent;
const base = () => env('SUPABASE_URL').replace(/\/$/, '');
function svcHeaders(extra) {
  const key = env('SUPABASE_SERVICE_KEY');
  return { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}), 'Content-Type': 'application/json', ...(extra || {}) };
}
async function sb(method, path, body, extra) {
  if (!env('SUPABASE_URL') || !env('SUPABASE_SERVICE_KEY')) { const e = new Error('not configured'); e.code = 'not_configured'; throw e; }
  const r = await timed(base() + path, { method, headers: svcHeaders(extra), body: body === undefined ? undefined : JSON.stringify(body) }, 8000);
  let data = null; try { data = await r.json(); } catch (e) { /* empty body */ }
  return { ok: r.ok, status: r.status, data };
}
/* the access token must belong to a real, signed-in user; returns the user id or null */
async function whoIs(jwt) {
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(jwt) || jwt.length > 4096) return null;
  const r = await timed(base() + '/auth/v1/user', { headers: { apikey: env('SUPABASE_SERVICE_KEY'), Authorization: 'Bearer ' + jwt } }, 8000);
  if (!r.ok) return null;
  const u = await r.json().catch(() => null);
  return u && UUID.test(u.id || '') ? u.id : null;
}

/* the caller's role comes from the database, never from the request: an active profile, and for partners/directors an active partner row */
async function callerOf(id) {
  const p = await sb('GET', '/rest/v1/profiles?select=id,role,status&id=eq.' + enc(id));
  const row = p.ok && Array.isArray(p.data) && p.data[0];
  if (!row || row.status !== 'active') return null;
  if (row.role === 'director' || row.role === 'partner') {
    const x = await sb('GET', '/rest/v1/partners?select=active&profile_id=eq.' + enc(id));
    if (!(x.ok && Array.isArray(x.data) && x.data[0] && x.data[0].active)) return null;
  }
  return { id: row.id, role: row.role };
}

/* ---------- rate limiting: Upstash Redis REST when configured, in-memory best-effort fallback ---------- */
const hits = new Map();
let warnedFallback = false;
function memLimited(key, windowS, max) {
  const now = Date.now(), a = (hits.get(key) || []).filter(t => now - t < windowS * 1000);
  a.push(now); hits.set(key, a);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => now - t < windowS * 1000)) hits.delete(k);
  return a.length > max;
}
/* limited('ip', ip, 600, 10, rid) -> true when the caller is over the limit.
   The identifier (an IP or a user id) is never stored or logged in clear text: only a keyed hash names the bucket. */
async function limited(scope, id, windowS, max, rid) {
  const salt = env('RATE_LIMIT_SALT') || env('SUPABASE_SERVICE_KEY') || 'culmera';
  const key = 'culmera:rl:' + (scope === 'ip' ? '' : scope + ':') + crypto.createHmac('sha256', salt).update(String(id)).digest('hex').slice(0, 32);
  const url = env('UPSTASH_REDIS_REST_URL'), token = env('UPSTASH_REDIS_REST_TOKEN');
  if (url && token) {
    try {
      const r = await timed(url.replace(/\/$/, '') + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify([['INCR', key], ['EXPIRE', key, windowS, 'NX']]) }, 2500);
      const j = await r.json();
      const n = Array.isArray(j) && j[0] && Number(j[0].result);
      if (r.ok && Number.isFinite(n)) return n > max;
      throw new Error('bad rate limit response');
    } catch (e) { log('error', 'rate_limit_store_failed', { rid, ...errInfo(e) }); }
  } else if (isProd() && !warnedFallback) {
    warnedFallback = true;
    log('warn', 'rate_limit_fallback_in_memory', { rid, hint: 'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for distributed limiting' });
  }
  return memLimited(key, windowS, max);
}
/* the real client address: Vercel appends it; the left-most x-forwarded-for entry can be spoofed by the caller */
const clientIp = req => String(req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || String(req.headers['x-forwarded-for'] || '').split(',').pop() || (req.socket && req.socket.remoteAddress) || 'unknown').split(',')[0].trim();

/* ---------- email (Resend) and chat webhook ---------- */
const EMAIL_OK = /^[A-Za-z0-9._%+'-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;
const mailConfigured = () => !!env('RESEND_API_KEY');
/* where a client's answer to one of our emails goes: REPLY_TO, else the first Project Manager address (NOTIFY_EMAIL_TO); undefined when neither is a valid address */
function replyAddress() {
  const v = (env('REPLY_TO') || env('NOTIFY_EMAIL_TO').split(',')[0] || '').trim().toLowerCase();
  return EMAIL_OK.test(v) ? v : undefined;
}
/** Returns 'sent' | 'failed' | 'skipped' | 'misconfigured'. Never throws. */
async function sendMail(rid, to, subject, textBody, replyTo) {
  const key = env('RESEND_API_KEY');
  if (!key || !to) return 'skipped';
  const from = env('EMAIL_FROM');
  if (isProd() && (!from || /resend\.dev/i.test(from))) { log('error', 'mail_sender_not_verified', { rid, hint: 'Set EMAIL_FROM to an address on a domain verified in Resend' }); return 'misconfigured'; }
  try {
    const r = await timed('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: from || 'CULMERA <onboarding@resend.dev>', to: [to], subject: line(subject, 150), text: textBody, ...(replyTo ? { reply_to: replyTo } : {}) }) }, 6000);
    if (!r.ok) { log('error', 'mail_failed', { rid, status: r.status }); return 'failed'; }
    return 'sent';
  } catch (e) { log('error', 'mail_failed', { rid, ...errInfo(e) }); return 'failed'; }
}
async function sendHook(rid, content) {
  const u = env('NOTIFY_WEBHOOK_URL');
  if (!u) return 'skipped';
  if (!/^https:\/\//i.test(u)) { log('error', 'webhook_not_https', { rid }); return 'misconfigured'; }
  const safe = String(content).replace(/[@`*_~<>|\[\]]/g, '').slice(0, 1500);
  try {
    const r = await timed(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: safe, text: safe, allowed_mentions: { parse: [] } }) }, 3000);
    if (!r.ok) { log('error', 'webhook_failed', { rid, status: r.status }); return 'failed'; }
    return 'sent';
  } catch (e) { log('error', 'webhook_failed', { rid, ...errInfo(e) }); return 'failed'; }
}

/* ---------- CORS / request plumbing used by the authenticated endpoints ---------- */
const reply = (res, status, body) => res.status(status).json(body);
const err = (res, status, code, error) => reply(res, status, { ok: false, code, error });
const newRid = req => String(req.headers['x-vercel-id'] || crypto.randomBytes(4).toString('hex')).slice(0, 40);

module.exports = { env, isProd, allowedOrigins, siteUrl, log, errInfo, clean, line, timed, UUID, enc, sb, whoIs, callerOf, limited, clientIp, EMAIL_OK, mailConfigured, replyAddress, sendMail, sendHook, reply, err, newRid,
  __reset() { hits.clear(); warnedFallback = false; } };
