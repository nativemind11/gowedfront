'use strict';
/* CULMERA management API (Phase 4). The ONLY place the Supabase service key is used for people management.
   The browser sends the signed-in user's access token; this function verifies it, loads the caller's role from the database
   (never from the request) and enforces who may do what. Row Level Security still protects every table behind it.

   POST /api/admin   Authorization: Bearer <user access token>   Content-Type: application/json
     {action:'invite',        email, role:'director'|'partner', director_id?}   Project Manager only
     {action:'revoke_invite', id}                                               Project Manager only
     {action:'set_status',    id, status:'active'|'suspended'}                  Project Manager only (also blocks / unblocks the sign-in)
     {action:'delete_user',   id}                                               Project Manager only (cascades to the person's rows)
   Invitations: a row is written to public.invitations FIRST (the sign-up trigger reads it to decide the role), then Supabase
   sends the invitation email through the project's configured SMTP. Logs never contain names, emails or message text. */
const crypto = require('crypto');
const { env, allowedOrigins, siteUrl, log, UUID, enc, sb, whoIs, callerOf, limited, newRid, reply, err } = require('../lib/shared');
const { notifyInvitation } = require('../lib/notify-core');

const MAX_BYTES = 8 * 1024, WINDOW_S = 10 * 60, MAX_HITS = 40;
const EMAIL = /^[A-Za-z0-9._%+'-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*\.[A-Za-z]{2,24}$/;

/* ---------- actions ---------- */
async function invite(res, me, b, rid) {
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!email || email.length > 200 || !EMAIL.test(email)) return err(res, 400, 'email', 'Please enter a valid email address.');
  const role = b.role;
  if (role !== 'director' && role !== 'partner') return err(res, 400, 'role', 'Choose Partner or Partner Director.');
  if (me.role !== 'founder') return err(res, 403, 'forbidden', 'Not allowed.');
  let group = null;
  if (role === 'partner') {
    if (b.director_id != null && b.director_id !== '') {
      if (typeof b.director_id !== 'string' || !UUID.test(b.director_id)) return err(res, 400, 'group', 'Choose a valid group.');
      const d = await sb('GET', '/rest/v1/profiles?select=id&role=eq.director&status=eq.active&id=eq.' + enc(b.director_id));
      if (!(d.ok && Array.isArray(d.data) && d.data[0])) return err(res, 400, 'group', 'That group does not exist.');
      group = b.director_id;
    }
  }
  // someone who already has an account cannot be invited: the role is decided when the account is created
  const ex = await sb('GET', '/rest/v1/profiles?select=id&email=eq.' + enc(email));
  if (ex.ok && Array.isArray(ex.data) && ex.data.length) return err(res, 409, 'exists', 'This email already has an account.');
  // replace an unused earlier invitation (the table allows one pending invitation per email)
  const del = await sb('DELETE', '/rest/v1/invitations?accepted_at=is.null&email=eq.' + enc(email), undefined, { Prefer: 'return=minimal' });
  if (!del.ok) { log('error', 'invite_cleanup_failed', { rid, status: del.status }); return err(res, 502, 'upstream', 'Could not send the invitation. Please try again.'); }
  const row = { email, role, invited_by: me.id, director_id: group, token_hash: crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex') };
  const ins = await sb('POST', '/rest/v1/invitations', row, { Prefer: 'return=representation' });
  const invId = ins.ok && Array.isArray(ins.data) && ins.data[0] && ins.data[0].id;
  if (!ins.ok || !invId) { log('error', 'invite_insert_failed', { rid, status: ins.status }); return err(res, ins.status === 409 ? 409 : 502, 'upstream', 'Could not send the invitation. Please try again.'); }
  const r = await sb('POST', '/auth/v1/invite?redirect_to=' + enc(siteUrl() + '/?auth=invite'), { email });
  if (!r.ok) {
    await sb('DELETE', '/rest/v1/invitations?id=eq.' + enc(invId), undefined, { Prefer: 'return=minimal' }).catch(() => {});
    const k = r.data && (r.data.error_code || r.data.code || r.data.error) || '';
    log('warn', 'invite_failed', { rid, status: r.status, code: String(k).slice(0, 40) });
    if (r.status === 422 || k === 'email_exists') return err(res, 409, 'exists', 'This email already has an account.');
    if (r.status === 429 || /rate/.test(String(k))) return err(res, 429, 'rate', 'Too many emails were sent just now. Please wait a few minutes.');
    return err(res, 502, 'upstream', 'Could not send the invitation. Please try again.');
  }
  log('info', 'invited', { rid, by: me.role, role });
  // Phase 5: tell the Project Manager (and the group's Director). Never blocks or fails the invitation.
  const note = await notifyInvitation(rid, { by: me.role, role, group, email }).catch(() => 'failed');
  return reply(res, 200, { ok: true, id: invId, notified: note });
}

async function revoke(res, me, b, rid) {
  if (me.role !== 'founder') return err(res, 403, 'forbidden', 'Not allowed.');
  if (typeof b.id !== 'string' || !UUID.test(b.id)) return err(res, 400, 'id', 'Invalid request.');
  const f = await sb('GET', '/rest/v1/invitations?select=id,invited_by,accepted_at&id=eq.' + enc(b.id));
  const inv = f.ok && Array.isArray(f.data) && f.data[0];
  if (!inv) return err(res, 404, 'missing', 'Invitation not found.');
  if (inv.accepted_at) return err(res, 409, 'accepted', 'This invitation was already accepted.');
  const d = await sb('DELETE', '/rest/v1/invitations?accepted_at=is.null&id=eq.' + enc(b.id), undefined, { Prefer: 'return=minimal' });
  if (!d.ok) return err(res, 502, 'upstream', 'Could not cancel the invitation.');
  log('info', 'invite_revoked', { rid, by: me.role });
  return reply(res, 200, { ok: true });
}

async function target(res, me, b) {
  if (me.role !== 'founder') { err(res, 403, 'forbidden', 'Not allowed.'); return null; }
  if (typeof b.id !== 'string' || !UUID.test(b.id)) { err(res, 400, 'id', 'Invalid request.'); return null; }
  if (b.id === me.id) { err(res, 400, 'self', 'You cannot do this to your own account.'); return null; }
  const f = await sb('GET', '/rest/v1/profiles?select=id,role&id=eq.' + enc(b.id));
  const t = f.ok && Array.isArray(f.data) && f.data[0];
  if (!t) { err(res, 404, 'missing', 'Account not found.'); return null; }
  if (t.role === 'founder') { err(res, 400, 'founder', 'The Project Manager account cannot be changed here.'); return null; }
  return t;
}
async function setStatus(res, me, b, rid) {
  if (b.status !== 'active' && b.status !== 'suspended') return err(res, 400, 'status', 'Invalid request.');
  const t = await target(res, me, b); if (!t) return;
  const p = await sb('PATCH', '/rest/v1/profiles?id=eq.' + enc(t.id), { status: b.status }, { Prefer: 'return=minimal' });
  if (!p.ok) return err(res, 502, 'upstream', 'Could not change the account.');
  // the profile status already blocks every table at once; the ban also stops new sign-ins and token refreshes
  const bn = await sb('PUT', '/auth/v1/admin/users/' + enc(t.id), { ban_duration: b.status === 'suspended' ? '876000h' : 'none' });
  if (!bn.ok) { log('error', 'ban_failed', { rid, status: bn.status }); return reply(res, 200, { ok: true, partial: true }); }
  log('info', 'status_set', { rid, status: b.status });
  return reply(res, 200, { ok: true });
}
async function deleteUser(res, me, b, rid) {
  const t = await target(res, me, b); if (!t) return;
  const d = await sb('DELETE', '/auth/v1/admin/users/' + enc(t.id));
  if (!d.ok) { log('error', 'delete_failed', { rid, status: d.status }); return err(res, 502, 'upstream', 'Could not delete the account.'); }
  log('info', 'user_deleted', { rid, role: t.role });
  return reply(res, 200, { ok: true });
}

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
  let b = req.body;
  if (typeof b === 'string' || Buffer.isBuffer(b)) { try { b = JSON.parse(String(b)); } catch (e) { return err(res, 400, 'bad_json', 'Invalid JSON'); } }
  if (!b || typeof b !== 'object' || Array.isArray(b) || Buffer.byteLength(JSON.stringify(b)) > MAX_BYTES) return err(res, 400, 'bad_body', 'Invalid body');
  const m = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ''));
  if (!m) return err(res, 401, 'auth', 'Please sign in again.');
  try {
    const uid = await whoIs(m[1]);
    if (!uid) return err(res, 401, 'auth', 'Please sign in again.');
    if (await limited('admin', uid, WINDOW_S, MAX_HITS, rid)) return err(res, 429, 'rate_limited', 'Too many requests. Please try again later.');
    const me = await callerOf(uid);
    if (!me || me.role === 'client') return err(res, 403, 'forbidden', 'Not allowed.');
    switch (b.action) {
      case 'invite': return await invite(res, me, b, rid);
      case 'revoke_invite': return await revoke(res, me, b, rid);
      case 'set_status': return await setStatus(res, me, b, rid);
      case 'delete_user': return await deleteUser(res, me, b, rid);
      default: return err(res, 400, 'action', 'Unknown action.');
    }
  } catch (e) {
    log('error', 'admin_crashed', { rid, name: e && e.name, code: e && e.code });
    return err(res, e && e.code === 'not_configured' ? 503 : 502, 'server', 'Something went wrong on our side.');
  }
}
module.exports = handler;
module.exports.__test = { reset() { require('../lib/shared').__reset(); } };
