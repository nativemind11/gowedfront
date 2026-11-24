'use strict';
/* CULMERA notifications (Phase 5, changed in Phase 2): who is told, what the message holds, how it is delivered.
   Rules:
   - Since Phase 2 only the Project Manager is told about events. The partner and the Director no longer get event emails; NOTIFY_STAFF=1 brings the
     old behaviour back (the partner who owns the client and that partner's Director, only while their profile and partner row are active).
     The invitation notice (notifyInvitation) is not part of this and is unchanged.
   - The Project Manager's messages name the partner and the Director of the client (chainOf), so he sees the chain without opening the console.
   - Minimum client detail: name, company, country, brief reference, number of chosen types, meeting time. Never the email address,
     phone number, answers, notes or message text: those are read in the console, behind the login.
   - Owner/staff notifications are written in English. Subjects and bodies are single-purpose plain text (no HTML, no links except the console).
   - Nothing here logs names, emails or message text. */
const { env, siteUrl, log, enc, sb, line, EMAIL_OK, mailConfigured, sendMail, sendHook } = require('./shared');

const studioTz = () => {
  const tz = env('OWNER_TZ') || env('MEETING_TZ') || 'Africa/Cairo';
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return tz; } catch (e) { return 'Africa/Cairo'; }
};
function when(s, tz) {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(s)) + ' (' + tz + ')'; } catch (e) { return ''; }
}
const consoleUrl = () => siteUrl() + '/#/team';

/* ---------- who ---------- */
async function founderEmails() {
  const set = env('NOTIFY_EMAIL_TO');
  if (set) return set.split(',').map(x => x.trim().toLowerCase()).filter(x => x && EMAIL_OK.test(x));
  const r = await sb('GET', '/rest/v1/profiles?select=email&role=eq.founder&status=eq.active');
  return r.ok && Array.isArray(r.data) ? r.data.map(x => String(x.email || '').toLowerCase()).filter(x => EMAIL_OK.test(x)) : [];
}
/* an active staff member: active profile AND active partner row (a deactivated partner or director gets nothing) */
async function activeStaff(id) {
  if (!id) return null;
  const [p, x] = await Promise.all([
    sb('GET', '/rest/v1/profiles?select=email,role,status&id=eq.' + enc(id)),
    sb('GET', '/rest/v1/partners?select=active,director_id&profile_id=eq.' + enc(id))]);
  const pr = p.ok && Array.isArray(p.data) && p.data[0], pa = x.ok && Array.isArray(x.data) && x.data[0];
  if (!pr || !pa || pr.status !== 'active' || !pa.active || !(pr.role === 'partner' || pr.role === 'director')) return null;
  return { email: String(pr.email || '').toLowerCase(), directorId: pa.director_id || null };
}
/** Everyone who must hear about an event on a client: the Project Manager. With NOTIFY_STAFF=1 also the owning partner (or director) and that partner's Director. */
async function recipientsFor(partnerId) {
  const out = new Map(); // email -> why (first reason wins: founder > owner > group)
  const add = (email, why) => { if (email && EMAIL_OK.test(email) && !out.has(email)) out.set(email, why); };
  for (const e of await founderEmails()) add(e, 'founder');
  if (env('NOTIFY_STAFF') !== '1') return [...out].map(([email, why]) => ({ email, why }));
  const owner = await activeStaff(partnerId);
  if (owner) {
    add(owner.email, 'owner');
    const dir = await activeStaff(owner.directorId);
    if (dir) add(dir.email, 'group');
  }
  return [...out].map(([email, why]) => ({ email, why }));
}
/** The partner and the Director of a client, by name, for the Project Manager: {partner, director}. "Direct" when the client has no partner;
    when the owner is himself a Director, his name is given for both. Names only (never an email); never throws. */
async function chainOf(partnerId) {
  const direct = { partner: 'Direct', director: 'Direct' };
  if (!partnerId) return direct;
  try {
    const [p, x] = await Promise.all([
      sb('GET', '/rest/v1/profiles?select=full_name,role&id=eq.' + enc(partnerId)),
      sb('GET', '/rest/v1/partners?select=director_id&profile_id=eq.' + enc(partnerId))]);
    const pr = p.ok && Array.isArray(p.data) && p.data[0], pa = x.ok && Array.isArray(x.data) && x.data[0];
    if (!pr) return direct;
    const name = line(pr.full_name || '', 120) || 'Unnamed';
    if (pr.role === 'director') return { partner: name, director: name };
    if (!pa || !pa.director_id) return { partner: name, director: 'Direct' };
    const d = await sb('GET', '/rest/v1/profiles?select=full_name&id=eq.' + enc(pa.director_id));
    const dr = d.ok && Array.isArray(d.data) && d.data[0];
    return { partner: name, director: (dr && line(dr.full_name || '', 120)) || 'Unnamed' };
  } catch (e) { return direct; }
}
const chainRows = ch => ch ? ['Partner: ' + ch.partner, 'Director: ' + ch.director] : [];

const WHY = {
  founder: 'You receive this as the Project Manager.',
  owner: 'You receive this because this client signed up with your partner code.',
  group: 'You receive this because this client belongs to a partner in your group.'
};
const frame = (head, rows, why) => [head, '', ...rows.filter(Boolean), '', 'Open the console (sign in required): ' + consoleUrl(), '', WHY[why] || '', 'CULMERA solutions'].join('\n');

/* ---------- messages: minimum detail ---------- */
const who = c => line(c.name || 'A client', 120) + (c.company ? ' (' + line(c.company, 160) + (c.country ? ', ' + line(c.country, 100) : '') + ')' : c.country ? ' (' + line(c.country, 100) + ')' : '');
function msgRegistered(c, ch) {
  return { subject: 'New client account: ' + line(c.company || c.name || 'client', 80), body: why => frame('A new client created a CULMERA account.',
    ['Name: ' + line(c.name || '-', 120), 'Company: ' + line(c.company || '-', 160), 'Country: ' + line(c.country || '-', 100), 'Partner code used: ' + (c.code ? line(c.code, 40) : 'none (direct client)'), ...chainRows(ch), 'Language: ' + line(c.locale || 'en', 5)], why) };
}
function msgBrief(c, b, ch) {
  return { subject: 'Brief submitted ' + line(b.ref, 20) + ': ' + line(c.company || c.name || 'client', 80), body: why => frame('A client submitted a project brief.',
    ['Reference: ' + line(b.ref, 20), 'Client: ' + who(c), ...chainRows(ch), 'Types chosen: ' + (b.types || 0), 'Submitted: ' + when(b.at, studioTz())], why) };
}
function msgMeeting(c, m, ch) {
  const head = m.kind === 'cancelled' ? 'A client cancelled a call.' : m.kind === 'changed' ? 'A client moved a call to a new time.' : 'A client requested a call.';
  return { subject: (m.kind === 'cancelled' ? 'Call cancelled ' : m.kind === 'changed' ? 'Call moved ' : 'Call requested ') + line(m.ref, 20) + ': ' + line(c.company || c.name || 'client', 80), body: why => frame(head,
    ['Brief: ' + line(m.ref, 20), 'Client: ' + who(c), ...chainRows(ch), (m.kind === 'cancelled' ? 'Was: ' : 'Time: ') + when(m.starts, studioTz()), m.kind === 'cancelled' ? '' : 'Client time zone: ' + line(m.tz, 64) + ', length ' + (m.dur || 30) + ' min', m.hasNote && m.kind !== 'cancelled' ? 'The client added a note: read it in the console.' : '',
      m.kind === 'cancelled' ? '' : 'The call is not confirmed until the team confirms it in the console.'], why) };
}

/** "A client replied": reference, client, chain, and whether a time was chosen. NEVER the message text, the price or the client's email. */
function msgClientReply(c, m, ch) {
  return { subject: 'Client reply ' + line(m.ref, 20) + ': ' + line(c.company || c.name || 'client', 80), body: why => frame('A client replied.',
    ['Brief: ' + line(m.ref, 20), 'Client: ' + who(c), ...chainRows(ch),
      m.starts ? 'The client chose a call time: ' + when(m.starts, studioTz()) + ' (client time zone ' + line(m.tz, 64) + ', length ' + (m.dur || 30) + ' min)' : 'The client did not choose a call time.',
      m.starts ? 'The call is not confirmed until you confirm it and add the Teams link in the console.' : '',
      'Read the reply in the console.'], why) };
}

/* ---------- delivery ---------- */
/** Sends one message to every recipient. Returns {sent, failed, skipped}. Never throws. */
async function deliver(rid, recipients, msg, hookText) {
  const res = { sent: 0, failed: 0, skipped: 0 };
  if (!mailConfigured()) { res.skipped = recipients.length; if (hookText && env('NOTIFY_WEBHOOK_URL')) await sendHook(rid, hookText); return res; }
  const out = await Promise.all(recipients.map(r => sendMail(rid, r.email, msg.subject, msg.body(r.why))));
  for (const s of out) { if (s === 'sent') res.sent++; else if (s === 'failed') res.failed++; else res.skipped++; }
  if (hookText && res.sent > 0) await sendHook(rid, hookText);   /* only when the event is settled: a retried event must not repeat the chat message */
  return res;
}

/** Invitation sent (called by api/admin.js). Tells the Project Manager and, for a partner placed in a group, that group's Director. */
async function notifyInvitation(rid, { by, role, group, email }) {
  if (!mailConfigured()) return 'skipped';
  try {
    const list = new Map();
    for (const e of await founderEmails()) list.set(e, 'founder');
    if (group) { const d = await activeStaff(group); if (d && d.email && !list.has(d.email)) list.set(d.email, 'group'); }
    const rows = ['Invited: ' + line(email, 200), 'Role: ' + (role === 'director' ? 'Partner Director' : 'Partner'), 'Invited by: ' + (by === 'founder' ? 'the Project Manager' : 'a Partner Director'), 'The invitation link works for 7 days. Cancel or resend it in the console.'];
    const subject = 'Invitation sent: ' + (role === 'director' ? 'Partner Director' : 'Partner');
    const w = { founder: 'You receive this as the Project Manager.', group: 'You receive this because a partner was invited into your group.' };
    const out = await Promise.all([...list].map(([to, why]) => sendMail(rid, to, subject, ['A team invitation was sent.', '', ...rows, '', 'Open the console (sign in required): ' + consoleUrl(), '', w[why], 'CULMERA solutions'].join('\n'))));
    const sent = out.filter(x => x === 'sent').length;
    log('info', 'invite_notified', { rid, sent, total: out.length });
    return sent ? 'sent' : out.includes('failed') ? 'failed' : 'skipped';
  } catch (e) { log('error', 'invite_notify_failed', { rid, name: e && e.name }); return 'failed'; }
}

module.exports = { recipientsFor, chainOf, msgRegistered, msgBrief, msgMeeting, msgClientReply, deliver, notifyInvitation, founderEmails, __t: { when, studioTz } };
