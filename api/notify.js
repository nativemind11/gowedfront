'use strict';
/* CULMERA notifications API (Phase 5). The browser saves a brief or a meeting straight to Supabase (Row Level Security protects it);
   afterwards it asks THIS function to send the emails, because the browser may never hold the email key or the service key.

   POST /api/notify   Authorization: Bearer <user access token>   Content-Type: application/json
     {event:'registered'}                    the signed-in client's own account is new
     {event:'brief_submitted', id:<uuid>}    the signed-in client's own brief was submitted (also sends the client's thank-you, with its own claim)
     {event:'client_reply', id:<uuid>}       the signed-in client's own reply (brief_messages row, sender 'client', at most 7 days old)
     {event:'meeting', id:<uuid>}            the signed-in client's own meeting was requested, moved or cancelled
   Nothing the browser sends is trusted: the server re-reads the real row with the service key, checks that it belongs to the caller
   and is in the claimed state, and sends at most ONE email set per real event (the `notify_events` table is the claim: a repeated
   or replayed call answers {ok:true, already:true} and sends nothing). Recipients and content come from lib/notify-core.js.
   Responses never reveal who was emailed. Logs never contain names, emails or message text. */
const { env, mailConfigured, allowedOrigins, log, errInfo, UUID, enc, sb, whoIs, limited, clientIp, newRid, reply, err, EMAIL_OK, replyAddress, sendMail } = require('../lib/shared');
const core = require('../lib/notify-core');
const mailT = require('../lib/mail-templates');

const MAX_BYTES = 2 * 1024;
const IP_WINDOW_S = 600, IP_MAX = 60;      // per address, before the token is even checked
const USER_WINDOW_S = 600, USER_MAX = 20;  // per signed-in user
const FRESH_ACCOUNT_MS = 3 * 24 * 3600 * 1000;   // "new account" only means a really new account, never an old one signing in
const FRESH_BRIEF_MS = 7 * 24 * 3600 * 1000;     // a brief submitted long ago is not news

/* ---------- the claim: one email set per real event ---------- */
async function claim(key, kind) {
  const r = await sb('POST', '/rest/v1/notify_events', { key, kind }, { Prefer: 'return=minimal' });
  return r.ok ? 'new' : r.status === 409 ? 'dup' : 'error';
}
const release = key => sb('DELETE', '/rest/v1/notify_events?key=eq.' + enc(key), undefined, { Prefer: 'return=minimal' }).catch(() => null);
const record = (key, result) => sb('PATCH', '/rest/v1/notify_events?key=eq.' + enc(key), { result }, { Prefer: 'return=minimal' }).catch(() => null);

const one = r => (r.ok && Array.isArray(r.data) && r.data[0]) || null;
async function clientCard(uid) {
  const [p, c] = await Promise.all([
    sb('GET', '/rest/v1/profiles?select=full_name,email,locale,status,role,created_at&id=eq.' + enc(uid)),
    sb('GET', '/rest/v1/clients?select=partner_id,code_used,company,country&profile_id=eq.' + enc(uid))]);
  const pr = one(p), cl = one(c);
  if (!pr || pr.status !== 'active' || pr.role !== 'client') return null;
  return { name: pr.full_name, email: pr.email, locale: pr.locale, createdAt: pr.created_at, company: cl && cl.company, country: cl && cl.country, code: cl && cl.code_used, partnerId: cl && cl.partner_id };
}

/* sends the message, then settles the claim: failed everywhere -> release it so a retry can work.
   Returns {sent, retry?} or {fail:true} (the recipients could not be loaded: the claim is released). Never replies by itself. */
async function dispatchCore(rid, key, partnerId, msg) {
  let to;
  try { to = await core.recipientsFor(partnerId); } catch (e) { await release(key); log('error', 'recipients_failed', { rid, ...errInfo(e) }); return { fail: true }; }
  const out = await core.deliver(rid, to, msg, msg.subject);
  /* Nothing went out although someone should have been told (a mail error, a missing key, an unverified sender): the event is NOT lost.
     The claim is released and the browser asks again on a later page load (bounded: 6 tries, 3 days), so fixing the setting is enough.
     The one exception is a deliberate chat-only setup (no mail key, but a webhook): there the webhook was the notification. */
  const hookOnly = !mailConfigured() && !!env('NOTIFY_WEBHOOK_URL');
  if (out.sent === 0 && (out.failed > 0 || out.skipped > 0) && !hookOnly) { await release(key); log('warn', 'notify_not_sent', { rid, failed: out.failed, skipped: out.skipped }); return { sent: 0, retry: true }; }
  await record(key, out);
  log('info', 'notified', { rid, sent: out.sent, failed: out.failed, skipped: out.skipped });
  return { sent: out.sent };
}
const serverErr = res => err(res, 502, 'server', 'Something went wrong on our side.');
async function dispatch(res, rid, key, partnerId, msg) {
  const r = await dispatchCore(rid, key, partnerId, msg);
  if (r.fail) return serverErr(res);
  return reply(res, 200, { ok: true, ...r });
}
/* the client's thank-you after a brief: its OWN claim (thanks:<brief>:<submitted_at>), same retry rule as the Project Manager's message.
   Returns 'sent' | 'skipped' | 'dup' | 'retry' | 'off'. A failing claim (migration 008 not run) never blocks the Project Manager's email. */
async function thankClient(rid, c, b) {
  if (env('CONFIRM_CLIENT') === '0') return 'off';
  const to = String(c.email || '').trim().toLowerCase();
  if (!EMAIL_OK.test(to)) return 'skipped';
  const key = 'thanks:' + b.id + ':' + Date.parse(b.submitted_at);
  const cl = await claim(key, 'brief_thanks');
  if (cl === 'dup') return 'dup';
  if (cl === 'error') { log('error', 'thanks_claim_failed', { rid, hint: 'Has supabase/migration-008-replies.sql been run?' }); return 'skipped'; }
  const m = mailT.thanks(b.locale || c.locale, { name: c.name, ref: b.ref });
  const r = await sendMail(rid, to, m.subject, m.body, replyAddress());
  if (r === 'sent') { await record(key, { sent: 1 }); log('info', 'thanked', { rid }); return 'sent'; }
  await release(key);
  /* no mail key at all and a chat webhook: a deliberate chat-only setup, nothing to retry */
  if (!mailConfigured() && env('NOTIFY_WEBHOOK_URL')) return 'skipped';
  log('warn', 'thanks_not_sent', { rid, result: r });
  return 'retry';
}
const claimOrStop = async (res, rid, key, kind) => {
  const c = await claim(key, kind);
  if (c === 'dup') { reply(res, 200, { ok: true, already: true, sent: 0 }); return false; }
  if (c === 'error') { log('error', 'claim_failed', { rid, hint: 'Has supabase/migration-005-notify.sql been run?' }); err(res, 503, 'not_ready', 'Notifications are not ready yet.'); return false; }
  return true;
};

/* ---------- events ---------- */
async function registered(res, uid, rid) {
  const c = await clientCard(uid);
  if (!c) return reply(res, 200, { ok: true, sent: 0, skipped: 'not_a_client' });
  if (!(Date.parse(c.createdAt) > Date.now() - FRESH_ACCOUNT_MS)) return reply(res, 200, { ok: true, sent: 0, skipped: 'not_new' });
  const key = 'registered:' + uid;
  if (!(await claimOrStop(res, rid, key, 'registered'))) return;
  return dispatch(res, rid, key, c.partnerId, core.msgRegistered(c, await core.chainOf(c.partnerId)));
}
async function briefSubmitted(res, uid, id, rid) {
  const b = one(await sb('GET', '/rest/v1/client_briefs?select=id,ref,status,selected_types,submitted_at,locale&id=eq.' + enc(id) + '&client_id=eq.' + enc(uid)));
  if (!b) return err(res, 404, 'missing', 'Not found.');
  if (b.status === 'draft' || !b.submitted_at) return err(res, 409, 'not_submitted', 'This brief has not been submitted.');
  if (!(Date.parse(b.submitted_at) > Date.now() - FRESH_BRIEF_MS)) return reply(res, 200, { ok: true, sent: 0, skipped: 'old' });
  const c = await clientCard(uid);
  if (!c) return err(res, 403, 'forbidden', 'Not allowed.');
  /* 1) the Project Manager's message. When its claim is a duplicate we still go on, so the thank-you can be retried on its own. */
  const key = 'brief:' + b.id + ':' + Date.parse(b.submitted_at);
  let founder = { sent: 0, already: true };
  const cl = await claim(key, 'brief_submitted');
  if (cl === 'error') { log('error', 'claim_failed', { rid, hint: 'Has supabase/migration-005-notify.sql been run?' }); return err(res, 503, 'not_ready', 'Notifications are not ready yet.'); }
  if (cl === 'new') {
    const ch = await core.chainOf(c.partnerId);
    founder = await dispatchCore(rid, key, c.partnerId, core.msgBrief(c, { ref: b.ref, types: Array.isArray(b.selected_types) ? b.selected_types.length : 0, at: b.submitted_at }, ch));
    if (founder.fail) return serverErr(res);
  }
  /* 2) the client's thank-you (its own claim; never blocks the message above) */
  const thanks = await thankClient(rid, c, b);
  const retry = !!founder.retry || thanks === 'retry';
  return reply(res, 200, { ok: true, sent: founder.sent, ...(founder.already ? { already: true } : {}), thanks, ...(retry ? { retry: true } : {}) });
}
async function meeting(res, uid, id, rid) {
  const m = one(await sb('GET', '/rest/v1/meetings?select=id,brief_id,starts_at,timezone,duration_min,status,note&id=eq.' + enc(id) + '&client_id=eq.' + enc(uid)));
  if (!m) return err(res, 404, 'missing', 'Not found.');
  if (m.status !== 'requested' && m.status !== 'cancelled') return reply(res, 200, { ok: true, sent: 0, skipped: 'staff_state' });
  const [b, c] = await Promise.all([sb('GET', '/rest/v1/client_briefs?select=ref&id=eq.' + enc(m.brief_id)), clientCard(uid)]);
  const br = one(b);
  if (!br || !c) return err(res, 403, 'forbidden', 'Not allowed.');
  const key = 'meeting:' + m.id + ':' + m.status + ':' + Date.parse(m.starts_at);
  let kind = 'cancelled';
  if (m.status === 'requested') {
    const prior = one(await sb('GET', '/rest/v1/notify_events?select=key&limit=1&key=like.' + enc('meeting:' + m.id + ':') + '*'));
    kind = prior ? 'changed' : 'requested';
  }
  if (!(await claimOrStop(res, rid, key, 'meeting'))) return;
  return dispatch(res, rid, key, c.partnerId, core.msgMeeting(c, { kind, ref: br.ref, starts: m.starts_at, tz: m.timezone, dur: m.duration_min, hasNote: !!(m.note && String(m.note).trim()) }, await core.chainOf(c.partnerId)));
}
/* the client answered the Project Manager (a brief_messages row written by the browser, under RLS). The Project Manager is told THAT it happened, never WHAT it says. */
async function clientReply(res, uid, id, rid) {
  const m = one(await sb('GET', '/rest/v1/brief_messages?select=id,brief_id,meeting_id,created_at&id=eq.' + enc(id) + '&client_id=eq.' + enc(uid) + '&sender=eq.client'));
  if (!m) return err(res, 404, 'missing', 'Not found.');
  if (!(Date.parse(m.created_at) > Date.now() - FRESH_BRIEF_MS)) return reply(res, 200, { ok: true, sent: 0, skipped: 'old' });
  const [b, c, mt] = await Promise.all([
    sb('GET', '/rest/v1/client_briefs?select=ref&id=eq.' + enc(m.brief_id) + '&client_id=eq.' + enc(uid)), clientCard(uid),
    m.meeting_id ? sb('GET', '/rest/v1/meetings?select=starts_at,timezone,duration_min,status&id=eq.' + enc(m.meeting_id) + '&client_id=eq.' + enc(uid)) : Promise.resolve(null)]);
  const br = one(b), me = mt ? one(mt) : null;
  if (!br || !c) return err(res, 403, 'forbidden', 'Not allowed.');
  const key = 'reply:' + m.id;
  if (!(await claimOrStop(res, rid, key, 'client_reply'))) return;
  const slot = me && me.status === 'requested' ? { starts: me.starts_at, tz: me.timezone, dur: me.duration_min } : {};
  return dispatch(res, rid, key, c.partnerId, core.msgClientReply(c, { ref: br.ref, ...slot }, await core.chainOf(c.partnerId)));
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
  if (await limited('nip', clientIp(req), IP_WINDOW_S, IP_MAX, rid)) return err(res, 429, 'rate_limited', 'Too many requests. Please try again later.');
  let b = req.body;
  if (typeof b === 'string' || Buffer.isBuffer(b)) { try { b = JSON.parse(String(b)); } catch (e) { return err(res, 400, 'bad_json', 'Invalid JSON'); } }
  if (!b || typeof b !== 'object' || Array.isArray(b) || Buffer.byteLength(JSON.stringify(b)) > MAX_BYTES) return err(res, 400, 'bad_body', 'Invalid body');
  const m = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ''));
  if (!m) return err(res, 401, 'auth', 'Please sign in again.');
  try {
    const uid = await whoIs(m[1]);
    if (!uid) return err(res, 401, 'auth', 'Please sign in again.');
    if (await limited('notify', uid, USER_WINDOW_S, USER_MAX, rid)) return err(res, 429, 'rate_limited', 'Too many requests. Please try again later.');
    switch (b.event) {
      case 'registered': return await registered(res, uid, rid);
      case 'brief_submitted':
      case 'client_reply':
      case 'meeting': {
        if (typeof b.id !== 'string' || !UUID.test(b.id)) return err(res, 400, 'id', 'Invalid request.');
        return b.event === 'meeting' ? await meeting(res, uid, b.id, rid) : b.event === 'client_reply' ? await clientReply(res, uid, b.id, rid) : await briefSubmitted(res, uid, b.id, rid);
      }
      default: return err(res, 400, 'event', 'Unknown event.');
    }
  } catch (e) {
    log('error', 'notify_crashed', { rid, name: e && e.name, code: e && e.code });
    return err(res, e && e.code === 'not_configured' ? 503 : 502, 'server', 'Something went wrong on our side.');
  }
}
module.exports = handler;
module.exports.__test = { reset() { require('../lib/shared').__reset(); } };
