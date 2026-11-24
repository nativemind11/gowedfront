'use strict';
/* Phase 2.1: unit tests of lib/mail-templates.js (thanks, founderReply, confirmed) in en, ar, de, fr. Pure functions, no network. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../lib/mail-templates');

const LOCS = ['en', 'ar', 'de', 'fr'];
const REF = 'CB-AAAA1111', URL_ = 'https://culmera-solutions.com/#/account', LINK = 'https://teams.example/l/meetup-join/abc123';
const STARTS = '2027-03-09T12:30:00.000Z';
const lines = s => s.split('\n');
const MARKERS = { thanks: { en: /within 24 hours/, ar: /24 ساعة/, de: /24 Stunden/, fr: /24 heures/ } };

test('locales: only en, ar, de, fr are written; everything else (zh, ru, pt, nl, unknown, empty, non-string) falls back to English', () => {
  assert.deepEqual(T.LOCALES, ['en', 'ar', 'de', 'fr']);
  for (const l of ['en', 'ar', 'de', 'fr']) assert.equal(T.pickLocale(l), l);
  for (const l of ['zh', 'ru', 'pt', 'nl', 'xx', '', null, undefined, 5, {}, 'EN', '__proto__', 'constructor']) assert.equal(T.pickLocale(l), 'en', String(l));
  for (const l of ['zh', 'ru', 'pt', 'nl', '__proto__']) assert.equal(T.thanks(l, { name: 'A', ref: REF }).subject, T.thanks('en', { name: 'A', ref: REF }).subject);
});

test('thanks: every language says: received, the reference, 24 hours, the price comes with the reply, a meeting link may follow', () => {
  for (const l of LOCS) {
    const m = T.thanks(l, { name: 'Carla', ref: REF });
    assert.ok(m.subject.includes(REF), l + ' subject has the reference'); assert.ok(m.body.includes(REF)); assert.ok(m.body.includes('Carla'));
    assert.match(m.body, MARKERS.thanks[l], l + ' promises 24 hours'); assert.ok(m.body.trimEnd().endsWith('CULMERA solutions'));
    assert.ok(!/<[a-z!/]/i.test(m.body), 'plain text, no HTML');
  }
  assert.match(T.thanks('en', { name: 'A', ref: REF }).body, /including the price/); assert.match(T.thanks('en', { name: 'A', ref: REF }).body, /meeting link with one of our partners/);
});

test('thanks: no price is shown, no meeting is promised as part of the brief, and there is no link', () => {
  for (const l of LOCS) { const b = T.thanks(l, { name: 'A', ref: REF }).body; assert.ok(!/https?:\/\//.test(b), l); assert.ok(!/\d+\s?(EUR|USD|€|\$|EGP)/.test(b), l); }
});

test('greeting: with a name, without a name (no dangling comma or double space), with a hostile name', () => {
  assert.equal(lines(T.thanks('en', { name: 'Ana', ref: REF }).body)[0], 'Hello Ana,');
  assert.equal(lines(T.thanks('en', { name: '', ref: REF }).body)[0], 'Hello,');
  assert.equal(lines(T.thanks('en', { name: undefined, ref: REF }).body)[0], 'Hello,');
  assert.equal(lines(T.thanks('de', { name: 'Ana', ref: REF }).body)[0], 'Guten Tag Ana,');
  assert.equal(lines(T.thanks('de', { ref: REF }).body)[0], 'Guten Tag,');
  assert.equal(lines(T.thanks('fr', { name: 'Ana', ref: REF }).body)[0], 'Bonjour Ana,');
  assert.equal(lines(T.thanks('fr', { ref: REF }).body)[0], 'Bonjour,');
  assert.equal(lines(T.thanks('ar', { name: 'أحمد', ref: REF }).body)[0], 'مرحبًا أحمد،');
  assert.equal(lines(T.thanks('ar', { ref: REF }).body)[0], 'مرحبًا،');
  const h = lines(T.thanks('en', { name: 'Ana\r\nBcc: evil@x.test\u0000\u202E  ', ref: REF }).body);
  assert.equal(h[0], 'Hello Ana Bcc: evil@x.test,', 'control characters and line breaks in a name cannot start a new line'); assert.ok(!/[\u0000\u202E]/.test(h[0]));
  assert.ok(lines(T.thanks('en', { name: 'x'.repeat(500), ref: REF }).body)[0].length <= 'Hello ,'.length + 80);
});

test('founderReply: account client: message, price, meeting invitation pointing to the account, in all four languages', () => {
  const want = { en: [/Our reply to your brief/, /Price: EUR 900/, /choose a time that suits you/], ar: [/ردّنا على بريف/, /السعر: EUR 900/, /اختر الموعد المناسب/], de: [/Unsere Antwort auf Ihr Briefing/, /Preis: EUR 900/, /passenden Termin/], fr: [/Notre réponse à votre brief/, /Prix : EUR 900/, /créneau qui vous convient/] };
  for (const l of LOCS) {
    const m = T.founderReply(l, { name: 'Carla', ref: REF, message: 'Line A\nLine B', price: 'EUR 900', proposes: true, account: true, portalUrl: URL_ });
    assert.match(m.subject, want[l][0]); assert.ok(m.subject.includes(REF)); assert.match(m.body, want[l][1]); assert.match(m.body, want[l][2]);
    assert.ok(m.body.includes('Line A\nLine B'), 'multi-line message kept'); assert.ok(m.body.includes(URL_)); assert.ok(m.body.includes(REF));
    assert.ok(m.body.indexOf('Line A') < m.body.indexOf('EUR 900'), 'message, then price'); assert.ok(m.body.trimEnd().endsWith('CULMERA solutions'));
  }
});

test('founderReply: no price line without a price, no meeting text without the proposal, but an account link to read and answer', () => {
  for (const l of LOCS) {
    const m = T.founderReply(l, { name: 'C', ref: REF, message: 'Hi there', proposes: false, account: true, portalUrl: URL_ });
    assert.ok(!/EUR|Price|Preis|Prix|السعر/.test(m.body), l + ' no price'); assert.ok(m.body.includes(URL_)); assert.ok(!/undefined|null|NaN/.test(m.body + m.subject));
  }
  const noPrice = T.founderReply('en', { name: 'C', ref: REF, message: 'Hi', price: '', proposes: false, account: true, portalUrl: URL_ });
  assert.ok(!/Price/.test(noPrice.body));
  assert.match(T.founderReply('en', { name: 'C', ref: REF, message: 'Hi', proposes: false, account: true, portalUrl: URL_ }).body, /read this message and answer it in your account/);
});

test('founderReply: visitor (no account): no account link, asks him to reply to the email, with or without the proposal', () => {
  const want = { en: /reply to this email with the days and times/, ar: /فرُدّ على هذه الرسالة/, de: /antworten Sie auf diese E-Mail/, fr: /répondez à cet e-mail/ };
  for (const l of LOCS) {
    const p = T.founderReply(l, { name: 'V', ref: 'BR-ABC123', message: 'Hi', price: '1', proposes: true, account: false, portalUrl: URL_ });
    assert.match(p.body, want[l]); assert.ok(!p.body.includes(URL_), l + ' visitor has no account'); assert.ok(!p.body.includes('#/account'));
    const n = T.founderReply(l, { name: 'V', ref: 'BR-ABC123', message: 'Hi', proposes: false, account: false, portalUrl: URL_ });
    assert.ok(!want[l].test(n.body), l + ' no meeting text without the proposal'); assert.ok(!n.body.includes(URL_));
  }
});

test('founderReply: the price is cut at 120 characters and never HTML-escaped or wrapped (plain text)', () => {
  const m = T.founderReply('en', { name: 'C', ref: REF, message: 'Hi', price: 'P'.repeat(300) + '<b>', proposes: false, account: true, portalUrl: URL_ });
  assert.ok(m.body.includes('Price: ' + 'P'.repeat(120) + '\n')); assert.ok(!m.body.includes('<b>'));
  const lt = T.founderReply('en', { name: 'C', ref: REF, message: 'a < b & c > d', price: '5 < 6', proposes: false, account: true, portalUrl: URL_ });
  assert.ok(lt.body.includes('a < b & c > d') && lt.body.includes('Price: 5 < 6'), 'text stays text');
});

test('confirmed: date and time in the CLIENT time zone and language, the length, the Teams link, the note, the account link', () => {
  const cases = { en: { tz: 'Europe/Berlin', loc: 'en-GB' }, ar: { tz: 'Africa/Cairo', loc: 'ar-EG' }, de: { tz: 'Europe/Berlin', loc: 'de-DE' }, fr: { tz: 'America/New_York', loc: 'fr-FR' } };
  const label = { en: /Date and time: /, ar: /الموعد: /, de: /Datum und Uhrzeit: /, fr: /Date et heure : / };
  const len = { en: 'Length: 45 minutes', ar: 'المدة: 45 دقيقة', de: 'Dauer: 45 Minuten', fr: 'Durée : 45 minutes' };
  const subj = { en: /Your meeting is confirmed/, ar: /تم تأكيد اجتماعك/, de: /Ihr Termin ist bestätigt/, fr: /Votre réunion est confirmée/ };
  for (const l of LOCS) {
    const { tz, loc } = cases[l], w = new Intl.DateTimeFormat(loc, { timeZone: tz, dateStyle: 'full', timeStyle: 'short' }).format(new Date(STARTS));
    const m = T.confirmed(l, { name: 'Carla', ref: REF, startsAt: STARTS, tz, duration: 45, teamsUrl: LINK, note: 'See you then.\nBring the logo.', portalUrl: URL_ });
    assert.match(m.subject, subj[l]); assert.ok(m.subject.includes(REF)); assert.match(m.body, label[l]);
    assert.ok(m.body.includes(w + ' (' + tz + ')'), l + ': ' + w); assert.ok(m.body.includes(len[l])); assert.ok(m.body.includes(LINK)); assert.ok(m.body.includes('See you then.\nBring the logo.')); assert.ok(m.body.includes(URL_));
    assert.ok(m.body.indexOf(LINK) < m.body.indexOf('See you then'), 'the link comes before the note');
  }
});

test('confirmed: the same instant shows different clock times in different time zones', () => {
  const a = T.confirmed('en', { name: 'A', ref: REF, startsAt: STARTS, tz: 'Europe/Berlin', duration: 30, teamsUrl: LINK, portalUrl: URL_ }).body;
  const b = T.confirmed('en', { name: 'A', ref: REF, startsAt: STARTS, tz: 'Asia/Tokyo', duration: 30, teamsUrl: LINK, portalUrl: URL_ }).body;
  assert.match(a, /13:30/); assert.match(b, /21:30/); assert.match(a, /\(Europe\/Berlin\)/); assert.match(b, /\(Asia\/Tokyo\)/);
});

test('confirmed: no note means no empty block; the length defaults to 30; a bad time zone does not break the email', () => {
  const m = T.confirmed('en', { name: 'A', ref: REF, startsAt: STARTS, tz: 'Africa/Cairo', teamsUrl: LINK, portalUrl: URL_ });
  assert.match(m.body, /Length: 30 minutes/); assert.ok(!/\n\n\n/.test(m.body), 'no stacked blank lines'); assert.ok(m.body.includes(LINK));
  const utc = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'full', timeStyle: 'short' }).format(new Date(STARTS));
  for (const tz of ['Not/AZone', undefined, '', null]) {
    const m = T.confirmed('en', { name: 'A', ref: REF, startsAt: STARTS, tz, duration: 30, teamsUrl: LINK, portalUrl: URL_ });
    assert.ok(m.body.includes('Date and time: ' + utc + ' (UTC)'), 'UTC fallback for ' + String(tz)); assert.ok(m.body.includes(LINK)); assert.ok(!/undefined|null|NaN|Invalid|\(\)/.test(m.body));
  }
});

test('confirmed: an unknown language is English', () => {
  for (const l of ['zh', 'ru', 'pt', 'nl', undefined, 'xx']) assert.match(T.confirmed(l, { name: 'A', ref: REF, startsAt: STARTS, tz: 'Europe/Berlin', duration: 30, teamsUrl: LINK, portalUrl: URL_ }).subject, /Your meeting is confirmed/);
});

test('every language has the same set of keys (nothing missing in ar, de, fr)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../lib/mail-templates.js'), 'utf8');
  const keysOf = l => { const i = src.indexOf('\n  ' + l + ': {'); const j = src.indexOf('\n  },', i); return [...src.slice(i, j).matchAll(/\n    (\w+):/g)].map(x => x[1]).sort(); };
  const en = keysOf('en'); assert.ok(en.length >= 15);
  for (const l of ['ar', 'de', 'fr']) assert.deepEqual(keysOf(l), en, l);
});

test('templates never put a price, a Teams link or a message anywhere they should not: a reply with no link has no link, thanks has none', () => {
  for (const l of LOCS) {
    assert.ok(!/https?:\/\//.test(T.thanks(l, { name: 'A', ref: REF }).body));
    assert.ok(!/https?:\/\//.test(T.founderReply(l, { name: 'A', ref: REF, message: 'm', proposes: false, account: false, portalUrl: URL_ }).body), l + ' a visitor reply has no link at all');
  }
});
