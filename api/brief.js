'use strict';
/**
 * CULMERA brief + contact endpoint (Vercel serverless, Supabase storage).
 *
 * Order of work for every request:
 *   CORS/origin -> method -> content type -> rate limit -> size -> honeypot ->
 *   weak timing signal -> validation -> Turnstile -> database save -> notifications.
 * A request is only reported as saved after the database insert succeeded.
 * Owner/client notification results are reported separately and never imply a save.
 */
const crypto = require('crypto');
const SLUGS = new Set(require('../lib/slugs.json'));
const MODULES = require('../lib/modules.json');
const OPT = require('../lib/options.json');

const MAX_BYTES = 100 * 1024;
const MIN_SECONDS = 5; // weak abuse signal only, never a security control
const WINDOW_S = 10 * 60, MAX_HITS = 10;
/* Phase 2: the brief has NO meeting step. A call is optional and happens outside the brief (the Project Manager replies, the client may ask for one).
   An old front end that still sends `meet` is simply ignored: no error, nothing stored. */
const LOCALES = ['en', 'fr', 'de', 'zh', 'ru', 'pt', 'nl', 'ar'];   // the site languages; anything else is ignored, never an error

/* ---------- shared helpers (environment, logging, text, limiter, mail): lib/shared.js ---------- */
const { env, isProd, allowedOrigins, log, errInfo, clean, line, timed, limited, clientIp, sendMail, sendHook, replyAddress, EMAIL_OK } = require('../lib/shared');
const mailT = require('../lib/mail-templates');

/* ---------- text normalisation ---------- */
class VErr extends Error {}
const fail = m => { throw new VErr(m); };
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function text(v, label, max, o = {}) {
  if (v == null || v === '') { if (o.min) fail('Invalid ' + label); return ''; }
  if (typeof v !== 'string' || v.length > max * 4) fail('Invalid ' + label);
  const s = clean(v, o.multi);
  if (s.length < (o.min || 0) || s.length > max) fail('Invalid ' + label);
  return s;
}
function pick(v, label, allowed) {
  if (v == null || v === '') return '';
  if (typeof v !== 'string' || !allowed.includes(v)) fail('Invalid ' + label);
  return v;
}
function list(v, label, n, max, allowed) {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > n) fail('Invalid ' + label);
  const out = [];
  for (const x of v) {
    const s = text(x, label, max, { min: 1 });
    if (allowed && !allowed.includes(s)) fail('Invalid ' + label);
    if (!out.includes(s)) out.push(s);
  }
  return out;
}
const EMAIL = /^(?!\.)(?!.*\.\.)[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}(?<!\.)@[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?)*\.[\p{L}]{2,24}$/u;
function email(v) {
  const s = text(v, 'email', 200, { min: 5 }).toLowerCase();
  if (!EMAIL.test(s)) fail('Invalid email');
  return s;
}

/* ---------- time zones ---------- */
function tzOk(tz) {
  if (typeof tz !== 'string' || !/^[A-Za-z0-9_+\-\/]{1,64}$/.test(tz)) return null;
  try { return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone; } catch (e) { return null; }
}

/* ---------- validation ---------- */
function validItem(it) {
  if (!isObj(it) || typeof it.slug !== 'string' || !/^[a-z0-9-]{2,60}$/.test(it.slug) || !SLUGS.has(it.slug)) fail('Invalid item');
  const o = { slug: it.slug };
  if (it.mods != null) {
    if (!isObj(it.mods)) fail('Invalid modules');
    const allowed = MODULES[it.slug] || [], mods = {};
    for (const k of Object.keys(it.mods)) {
      if (Object.keys(mods).length >= 40 || !allowed.includes(k) || ![1, 2].includes(it.mods[k])) fail('Invalid modules');
      mods[k] = it.mods[k];
    }
    if (Object.keys(mods).length) o.mods = mods;
  }
  for (const [f, allowed] of [['users', OPT.users], ['have', OPT.have], ['integ', OPT.integ], ['mood', OPT.mood]]) { const l = list(it[f], f, 20, 80, allowed); if (l.length) o[f] = l; }
  const langs = list(it.langs, 'languages', 20, 80); if (langs.length) o.langs = langs;
  const refs = list(it.refs, 'references', 3, 300); if (refs.length) o.refs = refs;
  const sc = pick(it.scale, 'scale', OPT.scale); if (sc) o.scale = sc;
  const d3 = pick(it.threeD, '3D level', OPT.threeD); if (d3) o.threeD = d3;
  for (const [f, m] of [['haveLinks', 300], ['integOther', 300], ['countries', 300], ['avoid', 300]]) { const s = text(it[f], f, m); if (s) o[f] = s; }
  const n = text(it.text, 'notes', 4000, { multi: true }); if (n) o.text = n;
  if (it.rtl != null) { if (typeof it.rtl !== 'boolean') fail('Invalid rtl'); if (it.rtl) o.rtl = true; }
  return o;
}

function validate(b) {
  try {
    if (!isObj(b)) fail('Invalid body');
    if (!['brief', 'contact'].includes(b.type)) fail('Invalid type');
    const name = text(b.name, 'name', 120, { min: 2 }), em = email(b.email);
    if (b.type === 'contact') return { data: { type: 'contact', name, email: em, message: text(b.message, 'message', 4000, { min: 1, multi: true }) } };
    const company = text(b.company, 'company', 160, { min: 1 }), country = text(b.country, 'country', 100, { min: 2 });
    const role = text(b.role, 'role', 120), phone = text(b.phone, 'phone', 40);
    if (phone && !/^[0-9+()\-.\s\u0660-\u0669]{5,40}$/.test(phone)) fail('Invalid phone');
    const timezone = tzOk(b.timezone);
    if (!timezone) fail('Invalid timezone');
    const p = isObj(b.project) ? b.project : {}, project = {};
    for (const [f, m] of [['company', 160], ['industry', 160], ['success', 400], ['launch', 60], ['budget', 60], ['systems', 400]]) { const s = text(p[f], 'project ' + f, m); if (s) project[f] = s; }
    const goal = text(p.goal, 'project goal', 4000, { multi: true }); if (goal) project.goal = goal;
    if (p.currency != null && p.currency !== '') { const c = text(p.currency, 'currency', 3); if (!/^[A-Z]{3}$/.test(c)) fail('Invalid currency'); project.currency = c; }
    if (p.stake != null && p.stake !== '') { const s = String(p.stake).trim(); if (!/^\d{1,3}$/.test(s) || +s < 1) fail('Invalid stakeholders'); project.stake = s; }
    const intent = pick(p.intent, 'intent', OPT.intents); if (intent) project.intent = intent;
    const unsure = intent === 'unsure';
    if (!goal && !unsure) fail('Invalid project goal');
    const locale = typeof b.locale === 'string' && LOCALES.includes(b.locale) ? b.locale : '';   // optional; unknown values are ignored
    if (!Array.isArray(b.items) || b.items.length > 20 || (b.items.length < 1 && !unsure)) fail('Items must be 1 to 20');
    const items = [], seen = new Set();
    for (const it of b.items) { const v = validItem(it); if (seen.has(v.slug)) fail('Duplicate item'); seen.add(v.slug); items.push(v); }
    return { data: { type: 'brief', name, email: em, company, country, timezone, items_count: items.length, payload: { role, phone, project, ...(locale ? { locale } : {}), items } } };
  } catch (e) {
    if (e instanceof VErr) return { error: e.message };
    throw e;
  }
}

/* ---------- reference ids ---------- */
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeRef = p => p + '-' + Array.from(crypto.randomBytes(6), b => ALPHA[b % ALPHA.length]).join('');

/* ---------- rate limiting: the shared limiter (Upstash Redis when configured, in-memory fallback), see lib/shared.js ---------- */
const rateLimited = (ip, rid) => limited('ip', ip, WINDOW_S, MAX_HITS, rid);

/* ---------- network helpers ---------- */
/** Turnstile is mandatory in production unless TURNSTILE_REQUIRED=0 is set on purpose. */
function turnstilePolicy() {
  const secret = env('TURNSTILE_SECRET'), required = isProd() ? env('TURNSTILE_REQUIRED') !== '0' : env('TURNSTILE_REQUIRED') === '1';
  return { secret, required, misconfigured: required && !secret };
}
async function verifyTurnstile(token, ip) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    const r = await timed('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ secret: env('TURNSTILE_SECRET'), response: token, remoteip: ip }).toString() }, 5000);
    const j = await r.json();
    return j.success === true;
  } catch (e) { return false; }
}

async function db(method, path, body, ms = 8000) {
  const key = env('SUPABASE_SERVICE_KEY'), url = env('SUPABASE_URL');
  if (!key || !url) { const e = new Error('not configured'); e.code = 'not_configured'; throw e; }
  const r = await timed(url.replace(/\/$/, '') + '/rest/v1/' + path, { method, headers: { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}), 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: body ? JSON.stringify(body) : undefined }, ms);
  if (!r.ok) { const e = new Error('db ' + r.status); e.status = r.status; throw e; }
}

/* ---------- notifications (each reports its own status) ---------- */
const lst = a => (Array.isArray(a) && a.length ? a.join(', ') : '');

function briefText(ref, d) {
  const p = d.payload, pr = p.project || {}, o = [];
  o.push('CULMERA brief ' + ref, '');
  o.push('Name: ' + line(d.name), 'Email: ' + d.email, 'Company: ' + line(d.company) + (p.role ? ' (' + line(p.role) + ')' : ''), 'Country: ' + line(d.country));
  if (p.phone) o.push('Phone: ' + line(p.phone));
  o.push('Visitor timezone: ' + d.timezone);
  if (p.locale) o.push('Visitor language: ' + p.locale);
  o.push('');
  if (pr.intent) o.push('Starting point: ' + pr.intent + (pr.intent === 'unsure' ? ' (visitor is not sure yet: suggest a discovery conversation)' : ''));
  o.push('Goal: ' + (pr.goal || ''));
  for (const [k, l] of [['industry', 'Industry'], ['success', 'Success measure'], ['launch', 'Launch preference'], ['systems', 'Existing systems'], ['stake', 'Stakeholders']]) if (pr[k]) o.push(l + ': ' + pr[k]);
  if (pr.budget) o.push('Budget preference: ' + pr.budget + ' ' + (pr.currency || '') + ' (a preference, not a commitment)');
  o.push('', 'Types (' + p.items.length + '):');
  for (const it of p.items) {
    o.push('', '* ' + it.slug);
    const mods = Object.entries(it.mods || {});
    if (mods.length) o.push('  Modules: ' + mods.map(([k, v]) => k + (v === 1 ? ' (must)' : ' (nice)')).join(', '));
    for (const [k, l] of [['users', 'Users'], ['have', 'Already has'], ['integ', 'Integrations'], ['langs', 'Languages'], ['mood', 'Mood'], ['refs', 'References']]) if (lst(it[k])) o.push('  ' + l + ': ' + lst(it[k]));
    for (const [k, l] of [['scale', 'Scale'], ['haveLinks', 'Links'], ['integOther', 'Other integrations'], ['countries', 'Countries'], ['threeD', '3D level'], ['avoid', 'Avoid'], ['text', 'Notes']]) if (it[k]) o.push('  ' + l + ': ' + it[k]);
    if (it.rtl) o.push('  Right-to-left: yes');
  }
  return o.join('\n');
}

/* NOTIFY_EMAIL_TO may hold several addresses separated by commas (as .env.example says): one email to each valid one.
   Result: sent if any went out, else failed / misconfigured if one was tried, else skipped. */
async function toFounder(rid, subject, body, replyTo) {
  const list = env('NOTIFY_EMAIL_TO').split(',').map(x => x.trim().toLowerCase()).filter(x => EMAIL_OK.test(x));
  if (!list.length) return 'skipped';
  const out = await Promise.all(list.map(to => sendMail(rid, to, subject, body, replyTo)));
  return out.includes('sent') ? 'sent' : out.includes('failed') ? 'failed' : out.includes('misconfigured') ? 'misconfigured' : 'skipped';
}

async function notifyAll(rid, d, ref) {
  const ownerJob = d.type === 'contact'
    ? toFounder(rid, 'New contact ' + ref + ' - ' + d.name, 'Contact ' + ref + '\n\nName: ' + line(d.name) + '\nEmail: ' + d.email + '\n\n' + d.message, d.email)
    : toFounder(rid, 'New brief ' + ref + ' - ' + d.company, briefText(ref, d), d.email);
  // Thank-you to the visitor, in the visitor's language (en/ar/de/fr, else English). On by default; CONFIRM_CLIENT=0 turns it off.
  // It never blocks the save. A 'failed' send is tried ONE more time. Replies to it go to the Project Manager (REPLY_TO, else NOTIFY_EMAIL_TO).
  const clientJob = env('CONFIRM_CLIENT') !== '0' && d.type === 'brief'
    ? (async () => {
      const m = mailT.thanks(d.payload.locale, { name: d.name, ref });
      let r = await sendMail(rid, d.email, m.subject, m.body, replyAddress());
      if (r === 'failed') r = await sendMail(rid, d.email, m.subject, m.body, replyAddress());
      return r;
    })()
    : Promise.resolve('skipped');
  const hookJob = sendHook(rid, d.type === 'contact' ? `New contact ${ref}` : `New brief ${ref}\nCompany: ${line(d.company, 80)}\nCountry: ${line(d.country, 60)}\nTypes: ${d.items_count}`);
  const [o, c, w] = await Promise.all([ownerJob, clientJob, hookJob]);
  return { owner: o, client: c, webhook: w };
}

/* ---------- handler ---------- */
const reply = (res, status, body) => res.status(status).json(body);
const err = (res, status, code, error) => reply(res, status, { ok: false, code, error });

async function handler(req, res) {
  const rid = String(req.headers['x-vercel-id'] || crypto.randomBytes(4).toString('hex')).slice(0, 40);
  const origins = allowedOrigins(), o = req.headers.origin, allowed = !!o && origins.includes(o);
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Origin');
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.status(allowed ? 204 : 403).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); return err(res, 405, 'method', 'Method not allowed'); }
  if (!allowed) { log('warn', 'origin_rejected', { rid }); return err(res, 403, 'origin', 'Origin not allowed'); }
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return err(res, 415, 'content_type', 'Content-Type must be application/json');

  const ip = clientIp(req); // Vercel appends the real client address; the left-most x-forwarded-for entry can be spoofed
  if (await rateLimited(ip, rid)) return err(res, 429, 'rate_limited', 'Too many requests. Please try again later.');

  if (Number(req.headers['content-length'] || 0) > MAX_BYTES) return err(res, 413, 'too_large', 'Payload too large');
  let body;
  try { body = req.body; } catch (e) { return err(res, 400, 'bad_json', 'Invalid JSON'); }
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    if (Buffer.byteLength(body) > MAX_BYTES) return err(res, 413, 'too_large', 'Payload too large');
    try { body = JSON.parse(String(body)); } catch (e) { return err(res, 400, 'bad_json', 'Invalid JSON'); }
  }
  if (!isObj(body)) return err(res, 400, 'bad_body', 'Invalid body');
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BYTES) return err(res, 413, 'too_large', 'Payload too large');

  // Honeypot: look successful to bots, but store nothing and send nothing.
  if (body.website) { log('info', 'honeypot', { rid }); return reply(res, 200, { ok: true, saved: true, ref: makeRef(body.type === 'contact' ? 'CT' : 'BR'), notifications: { owner: 'skipped', client: 'skipped' } }); }
  // Client-reported elapsed time is a weak abuse signal only. It is trivially forged and is not a security control.
  if (typeof body.elapsed !== 'number' || !(body.elapsed >= MIN_SECONDS)) return err(res, 400, 'too_fast', 'Please try again in a moment.');

  let v;
  try { v = validate(body); } catch (e) { log('error', 'validate_crashed', { rid, ...errInfo(e) }); return err(res, 500, 'server', 'Something went wrong on our side.'); }
  if (v.error) return err(res, 400, 'validation', v.error);

  const tp = turnstilePolicy();
  if (tp.misconfigured) { log('error', 'turnstile_not_configured', { rid, hint: 'Production requires TURNSTILE_SECRET (or an explicit TURNSTILE_REQUIRED=0)' }); return err(res, 503, 'protection_unavailable', 'The form is temporarily unavailable. Please email us instead.'); }
  if (tp.secret && (tp.required || body.turnstile) && !(await verifyTurnstile(body.turnstile, ip))) return err(res, 400, 'verification', 'Verification failed. Please try again.');

  const d = v.data, pre = d.type === 'contact' ? 'CT' : 'BR', table = d.type === 'contact' ? 'contacts' : 'briefs';
  let ref = null;
  for (let i = 0; i < 3 && !ref; i++) {
    const r = makeRef(pre);
    try {
      await db('POST', table, d.type === 'contact' ? { ref: r, name: d.name, email: d.email, message: d.message } : { ref: r, name: d.name, email: d.email, company: d.company, country: d.country, timezone: d.timezone, items_count: d.items_count, payload: d.payload });
      ref = r;
    } catch (e) {
      if (e.status !== 409) { log('error', 'db_insert_failed', { rid, table, ...errInfo(e) }); return err(res, e.code === 'not_configured' ? 503 : 502, 'not_saved', 'Could not save. Please use the email option.'); }
    }
  }
  if (!ref) return err(res, 502, 'not_saved', 'Could not save. Please use the email option.');

  // From here on the submission IS saved. Notification problems are reported, never turned into a failure.
  const n = await notifyAll(rid, d, ref);
  try { await db('PATCH', table + '?ref=eq.' + encodeURIComponent(ref), { notify: n }, 4000); } catch (e) { log('warn', 'notify_status_not_recorded', { rid, table, ...errInfo(e) }); }
  log('info', 'saved', { rid, ref, type: d.type, owner: n.owner, client: n.client, webhook: n.webhook });
  return reply(res, 200, { ok: true, saved: true, ref, notifications: { owner: n.owner, client: n.client } });
}

module.exports = handler;
module.exports.validate = validate;
module.exports.__test = { reset() { require('../lib/shared').__reset(); }, tzOk };
