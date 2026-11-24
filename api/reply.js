'use strict';
/* CULMERA reply API (Phase 2). The Project Manager answers a brief from his console; the answer reaches the client's account AND email together
   (a visitor without an account gets the email only). He can also confirm a call the client asked for, pasting the Teams link by hand
   (the system never creates a link). Same protection as api/admin.js.

   POST /api/reply   Authorization: Bearer <user access token>   Content-Type: application/json   PROJECT MANAGER ONLY (everyone else: 403)
     {action:'reply',   ref, body, price?, propose_meeting?, req_id?}        ref 'CB-...' = account brief, 'BR-...' = public (visitor) brief
     {action:'confirm', ref, meeting_id, teams_url, body?, starts_at?, req_id?}   account briefs only
     {action:'resend',  ref, id}                                              re-send the email of one of the Project Manager's messages

   Rules:
   - The message is saved FIRST (service key), then the email is sent, then the email state is recorded (sending -> sent | failed | skipped).
     A failed email never undoes the message: the answer is 200 with email:'failed' and the Project Manager can resend.
   - req_id (one fresh uuid per button press) makes a double click harmless: a repeated id answers {already:true} with no message and no email.
   - Price, message text, email addresses and links never reach a log. Only counts and states do. */
const { env, allowedOrigins, siteUrl, log, UUID, enc, sb, whoIs, callerOf, limited, clientIp, newRid, reply, err, clean, EMAIL_OK, replyAddress, sendMail } = require('../lib/shared');
const mailT = require('../lib/mail-templates');

const MAX_BYTES = 24 * 1024;                     // a 4000-character message can be 16 KB in UTF-8
const IP_WINDOW_S = 600, IP_MAX = 60;            // per address, before the token is checked
const USER_WINDOW_S = 600, USER_MAX = 40;        // per signed-in user
const SENDING_STALE_MS = 5 * 60 * 1000;          // a message stuck in 'sending' longer than this may be re-sent
const MAX_AHEAD_MS = 400 * 24 * 3600 * 1000;
const REF_ACCOUNT = /^CB-[A-Z0-9]{8}$/, REF_VISITOR = /^BR-[A-Z0-9]{6}$/;

const one = r => (r.ok && Array.isArray(r.data) && r.data[0]) || null;

/* ---------- input checks (each returns the clean value, or undefined when invalid) ---------- */
function messageText(v, required) {
  if (v == null || v === '') return required ? undefined : '';
  if (typeof v !== 'string' || v.length > 16000) return undefined;
  const s = clean(v, true);
  return (required ? s.length >= 1 : true) && s.length <= 4000 ? s : undefined;
}
function priceText(v) {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || v.length > 480) return undefined;
  const s = clean(v);
  return s.length >= 1 && s.length <= 120 ? s : (s.length === 0 ? null : undefined);
}
/* the Teams link: https, 12..500 characters, no spaces, no credentials, a real URL. Any host: it is not tied to a Teams domain. */
function teamsLink(v) {
  if (typeof v !== 'string' || v.length < 12 || v.length > 500 || !/^https:\/\/[^\s]+$/.test(v)) return undefined;
  try { const u = new URL(v); if (u.protocol !== 'https:' || u.username || u.password || !u.hostname) return undefined; return v; } catch (e) { return undefined; }
}
const isoTime = v => (typeof v === 'string' && v.length <= 40 && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : undefined);

/* ---------- small database helpers ---------- */
const nowIso = () => new Date().toISOString();
async function setEmail(table, id, status) {
  const r = await sb('PATCH', '/rest/v1/' + table + '?id=eq.' + enc(id), { email_status: status, email_at: nowIso() }, { Prefer: 'return=minimal' }).catch(() => null);
  return !!(r && r.ok);
}
async function mailTo(rid, to, m) {
  if (!EMAIL_OK.test(String(to || ''))) return 'skipped';
  const r = await sendMail(rid, to, m.subject, m.body, replyAddress());
  return r === 'sent' ? 'sent' : r === 'skipped' ? 'skipped' : 'failed';     // 'misconfigured' counts as failed: the Project Manager can resend once it is fixed
}
async function seen(table, reqId) {
  if (!reqId) return false;
  const r = await sb('GET', '/rest/v1/' + table + '?select=id&req_id=eq.' + enc(reqId));
  return !!one(r);
}
/* the account brief and its client, by reference */
async function accountBrief(ref) {
  const b = one(await sb('GET', '/rest/v1/client_briefs?select=id,ref,client_id,status,locale&ref=eq.' + enc(ref)));
  if (!b) return null;
  const p = one(await sb('GET', '/rest/v1/profiles?select=email,full_name,locale&id=eq.' + enc(b.client_id)));
  if (!p) return null;
  return { id: b.id, ref: b.ref, clientId: b.client_id, status: b.status, email: p.email, name: p.full_name, locale: b.locale || p.locale };
}
async function visitorBrief(ref) {
  const b = one(await sb('GET', '/rest/v1/briefs?select=ref,name,email,payload&ref=eq.' + enc(ref)));
  if (!b) return null;
  return { ref: b.ref, email: b.email, name: b.name, locale: b.payload && typeof b.payload === 'object' ? b.payload.locale : undefined };
}
const portalUrl = () => siteUrl() + '/#/account';

/* ---------- reply ---------- */
async function doReply(res, b, rid) {
  const isAcc = typeof b.ref === 'string' && REF_ACCOUNT.test(b.ref), isVis = typeof b.ref === 'string' && REF_VISITOR.test(b.ref);
  if (!isAcc && !isVis) return err(res, 400, 'ref', 'Invalid request.');
  const body = messageText(b.body, true); if (body === undefined) return err(res, 400, 'body', 'Write a message of 1 to 4000 characters.');
  const price = priceText(b.price); if (price === undefined) return err(res, 400, 'price', 'The price must be 120 characters or fewer.');
  if (b.propose_meeting != null && typeof b.propose_meeting !== 'boolean') return err(res, 400, 'propose', 'Invalid request.');
  const proposes = b.propose_meeting === true;
  if (b.req_id != null && (typeof b.req_id !== 'string' || !UUID.test(b.req_id))) return err(res, 400, 'req_id', 'Invalid request.');
  const reqId = b.req_id || null;
  const table = isAcc ? 'brief_messages' : 'visitor_replies';

  const t = isAcc ? await accountBrief(b.ref) : await visitorBrief(b.ref);
  if (!t) return err(res, 404, 'missing', 'Brief not found.');
  if (isAcc && t.status === 'draft') return err(res, 409, 'draft', 'This brief has not been submitted yet.');
  if (await seen(table, reqId)) return reply(res, 200, { ok: true, already: true });

  const row = isAcc
    ? { brief_id: t.id, client_id: t.clientId, sender: 'founder', kind: 'reply', body, price_text: price, proposes_meeting: proposes, req_id: reqId, email_status: 'sending', email_at: nowIso() }
    : { brief_ref: t.ref, body, price_text: price, proposes_meeting: proposes, req_id: reqId, email_status: 'sending', email_at: nowIso() };
  const ins = await sb('POST', '/rest/v1/' + table, row, { Prefer: 'return=representation' });
  if (!ins.ok) {
    if (ins.status === 409 && reqId && await seen(table, reqId)) return reply(res, 200, { ok: true, already: true });
    log('error', 'reply_not_saved', { rid, table, status: ins.status, hint: ins.status === 404 ? 'Has supabase/migration-008-replies.sql been run?' : undefined });
    return err(res, ins.status === 404 ? 503 : 502, 'not_saved', 'Could not save the message. Please try again.');
  }
  const saved = ins.data && (Array.isArray(ins.data) ? ins.data[0] : ins.data);
  const id = saved && saved.id;
  if (!id) { log('error', 'reply_no_id', { rid, table }); return err(res, 502, 'not_saved', 'Could not save the message. Please try again.'); }

  const m = mailT.founderReply(t.locale, { name: t.name, ref: t.ref, message: body, price: price || undefined, proposes, account: isAcc, portalUrl: portalUrl() });
  const email = await mailTo(rid, t.email, m);
  const recorded = await setEmail(table, id, email);
  if (!recorded) log('warn', 'email_state_not_recorded', { rid, table });
  log('info', 'reply_saved', { rid, kind: isAcc ? 'account' : 'visitor', email, proposes, priced: !!price });
  return reply(res, 200, { ok: true, id, email });
}

/* ---------- confirm ---------- */
async function doConfirm(res, b, rid) {
  if (typeof b.ref !== 'string' || !REF_ACCOUNT.test(b.ref)) return err(res, 400, 'ref', 'A call can only be confirmed on an account brief.');
  if (typeof b.meeting_id !== 'string' || !UUID.test(b.meeting_id)) return err(res, 400, 'meeting', 'Invalid request.');
  const link = teamsLink(b.teams_url); if (link === undefined) return err(res, 400, 'teams_url', 'Paste a valid https link (12 to 500 characters, no spaces).');
  const note = messageText(b.body, false); if (note === undefined) return err(res, 400, 'body', 'The note must be 4000 characters or fewer.');
  let startsOverride;
  if (b.starts_at != null && b.starts_at !== '') { startsOverride = isoTime(b.starts_at); if (!startsOverride) return err(res, 400, 'starts_at', 'Invalid time.'); }
  if (b.req_id != null && (typeof b.req_id !== 'string' || !UUID.test(b.req_id))) return err(res, 400, 'req_id', 'Invalid request.');
  const reqId = b.req_id || null;

  const t = await accountBrief(b.ref);
  if (!t) return err(res, 404, 'missing', 'Brief not found.');
  if (await seen('brief_messages', reqId)) return reply(res, 200, { ok: true, already: true });
  const m = one(await sb('GET', '/rest/v1/meetings?select=id,starts_at,timezone,duration_min,status&id=eq.' + enc(b.meeting_id) + '&brief_id=eq.' + enc(t.id) + '&client_id=eq.' + enc(t.clientId)));
  if (!m) return err(res, 404, 'missing', 'Meeting not found.');
  if (m.status !== 'requested' && m.status !== 'confirmed') return err(res, 409, 'state', 'This call can no longer be confirmed.');
  const when = startsOverride || new Date(m.starts_at).toISOString(), ts = Date.parse(when);
  if (!(ts > Date.now()) || ts > Date.now() + MAX_AHEAD_MS) return err(res, 400, 'starts_at', 'The call time must be in the future (within 400 days).');

  /* 1) the meeting becomes confirmed with the link (only if it is still requested or confirmed: the client may have cancelled meanwhile) */
  const patch = { status: 'confirmed', teams_url: link, ...(startsOverride ? { starts_at: startsOverride } : {}) };
  const up = await sb('PATCH', '/rest/v1/meetings?id=eq.' + enc(m.id) + '&brief_id=eq.' + enc(t.id) + '&client_id=eq.' + enc(t.clientId) + '&status=in.(requested,confirmed)', patch, { Prefer: 'return=representation' });
  if (!up.ok) { log('error', 'confirm_not_saved', { rid, status: up.status, hint: up.status === 400 ? 'Has supabase/migration-008-replies.sql been run?' : undefined }); return err(res, 502, 'not_saved', 'Could not confirm the call. Please try again.'); }
  if (!one(up)) return err(res, 409, 'state', 'This call changed while you were confirming it. Reload and check.');

  /* 2) the message in the client's conversation, then 3) the email */
  const ins = await sb('POST', '/rest/v1/brief_messages', { brief_id: t.id, client_id: t.clientId, sender: 'founder', kind: 'meeting_confirmed', body: note, meeting_id: m.id, req_id: reqId, email_status: 'sending', email_at: nowIso() }, { Prefer: 'return=representation' });
  const saved = ins.ok && ins.data && (Array.isArray(ins.data) ? ins.data[0] : ins.data);
  if (!saved || !saved.id) {
    if (ins.status === 409 && reqId && await seen('brief_messages', reqId)) return reply(res, 200, { ok: true, already: true });
    /* the call IS confirmed; confirming again (allowed for a confirmed call) writes the message and sends the email */
    log('error', 'confirm_message_not_saved', { rid, status: ins.status });
    return err(res, 502, 'message_not_saved', 'The call is confirmed but the message was not saved. Press confirm again.');
  }
  const mail = mailT.confirmed(t.locale, { name: t.name, ref: t.ref, startsAt: when, tz: m.timezone, duration: m.duration_min, teamsUrl: link, note: note || undefined, portalUrl: portalUrl() });
  const email = await mailTo(rid, t.email, mail);
  if (!(await setEmail('brief_messages', saved.id, email))) log('warn', 'email_state_not_recorded', { rid, table: 'brief_messages' });
  log('info', 'call_confirmed', { rid, email, moved: !!startsOverride });
  return reply(res, 200, { ok: true, id: saved.id, email });
}

/* ---------- resend ---------- */
async function doResend(res, b, rid) {
  const isAcc = typeof b.ref === 'string' && REF_ACCOUNT.test(b.ref), isVis = typeof b.ref === 'string' && REF_VISITOR.test(b.ref);
  if (!isAcc && !isVis) return err(res, 400, 'ref', 'Invalid request.');
  if (typeof b.id !== 'string' || !UUID.test(b.id)) return err(res, 400, 'id', 'Invalid request.');
  const table = isAcc ? 'brief_messages' : 'visitor_replies';
  const t = isAcc ? await accountBrief(b.ref) : await visitorBrief(b.ref);
  if (!t) return err(res, 404, 'missing', 'Brief not found.');
  const scope = isAcc ? 'brief_id=eq.' + enc(t.id) + '&sender=eq.founder' : 'brief_ref=eq.' + enc(t.ref);
  const msg = one(await sb('GET', '/rest/v1/' + table + '?select=id,kind,body,price_text,proposes_meeting,meeting_id,email_status&id=eq.' + enc(b.id) + '&' + scope));
  if (!msg) return err(res, 404, 'missing', 'Message not found.');
  /* a confirmation is only re-sent while the call is still confirmed (it may have been moved or cancelled since) */
  let meet = null;
  if (isAcc && msg.kind === 'meeting_confirmed') {
    meet = msg.meeting_id ? one(await sb('GET', '/rest/v1/meetings?select=starts_at,timezone,duration_min,status,teams_url&id=eq.' + enc(msg.meeting_id) + '&client_id=eq.' + enc(t.clientId))) : null;
    if (!meet || meet.status !== 'confirmed' || !meet.teams_url) return err(res, 409, 'state', 'This call is no longer confirmed, so the confirmation is not sent again.');
  }
  /* one atomic claim = one email: only a failed or skipped message, or one stuck in 'sending' for over 5 minutes */
  const stale = new Date(Date.now() - SENDING_STALE_MS).toISOString();
  const orf = '(email_status.in.(failed,skipped),and(email_status.eq.sending,email_at.lt.' + stale + '))';
  const claim = await sb('PATCH', '/rest/v1/' + table + '?id=eq.' + enc(msg.id) + '&' + scope + '&or=' + enc(orf), { email_status: 'sending', email_at: nowIso() }, { Prefer: 'return=representation' });
  if (!claim.ok) { log('error', 'resend_claim_failed', { rid, status: claim.status }); return err(res, 502, 'upstream', 'Could not send the message again. Please try again.'); }
  if (!one(claim)) return err(res, 409, 'not_resendable', 'This email was already sent or is being sent.');

  const mail = meet
    ? mailT.confirmed(t.locale, { name: t.name, ref: t.ref, startsAt: new Date(meet.starts_at).toISOString(), tz: meet.timezone, duration: meet.duration_min, teamsUrl: meet.teams_url, note: msg.body || undefined, portalUrl: portalUrl() })
    : mailT.founderReply(t.locale, { name: t.name, ref: t.ref, message: msg.body, price: msg.price_text || undefined, proposes: !!msg.proposes_meeting, account: isAcc, portalUrl: portalUrl() });
  const email = await mailTo(rid, t.email, mail);
  if (!(await setEmail(table, msg.id, email))) log('warn', 'email_state_not_recorded', { rid, table });
  log('info', 'resent', { rid, email });
  return reply(res, 200, { ok: true, email });
}

/* ---------- handler ---------- */
async function handler(req, res) {
  const rid = newRid(req);
  const origins = allowedOrigins(), o = req.headers.origin, allowed = !!o && origins.includes(o);
  res.setHeader('Cache-Control', 'no-store'); res.setHeader('Vary', 'Origin');
  if (allowed) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.status(allowed ? 204 : 403).end();
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST, OPTIONS'); return err(res, 405, 'method', 'Method not allowed'); }
  if (!allowed) { log('warn', 'origin_rejected', { rid }); return err(res, 403, 'origin', 'Origin not allowed'); }
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return err(res, 415, 'content_type', 'Content-Type must be application/json');
  if (Number(req.headers['content-length'] || 0) > MAX_BYTES) return err(res, 413, 'too_large', 'Payload too large');
  if (await limited('rip', clientIp(req), IP_WINDOW_S, IP_MAX, rid)) return err(res, 429, 'rate_limited', 'Too many requests. Please try again later.');
  let b = req.body;
  if (typeof b === 'string' || Buffer.isBuffer(b)) { try { b = JSON.parse(String(b)); } catch (e) { return err(res, 400, 'bad_json', 'Invalid JSON'); } }
  if (!b || typeof b !== 'object' || Array.isArray(b) || Buffer.byteLength(JSON.stringify(b)) > MAX_BYTES) return err(res, 400, 'bad_body', 'Invalid body');
  const m = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ''));
  if (!m) return err(res, 401, 'auth', 'Please sign in again.');
  try {
    const uid = await whoIs(m[1]);
    if (!uid) return err(res, 401, 'auth', 'Please sign in again.');
    if (await limited('reply', uid, USER_WINDOW_S, USER_MAX, rid)) return err(res, 429, 'rate_limited', 'Too many requests. Please try again later.');
    const me = await callerOf(uid);               // the role comes from the database, never from the request
    if (!me || me.role !== 'founder') return err(res, 403, 'forbidden', 'Not allowed.');
    switch (b.action) {
      case 'reply': return await doReply(res, b, rid);
      case 'confirm': return await doConfirm(res, b, rid);
      case 'resend': return await doResend(res, b, rid);
      default: return err(res, 400, 'action', 'Unknown action.');
    }
  } catch (e) {
    log('error', 'reply_crashed', { rid, name: e && e.name, code: e && e.code });
    return err(res, e && e.code === 'not_configured' ? 503 : 502, 'server', 'Something went wrong on our side.');
  }
}
module.exports = handler;
module.exports.__test = { reset() { require('../lib/shared').__reset(); }, teamsLink, priceText, messageText };
