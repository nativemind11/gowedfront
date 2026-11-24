'use strict';
/* CULMERA client emails (Phase 2): the thank-you, the Project Manager's reply and the meeting confirmation, written for the client.
   Languages: en, ar, de, fr. Any other site language (zh, ru, pt, nl) and anything unknown gets English.
   Team notifications (the Project Manager's own emails) stay English: see lib/notify-core.js.
   Plain text only. Every value that comes from a person is passed through line() / clean() by the caller; nothing here builds HTML.
   Nothing here reaches a log. */
const { line } = require('./shared');

const LOCALES = ['en', 'ar', 'de', 'fr'];
const pickLocale = l => (LOCALES.includes(l) ? l : 'en');
const INTL = { en: 'en-GB', ar: 'ar-EG', de: 'de-DE', fr: 'fr-FR' };

/* "Tuesday 12 May 2026 at 14:30" in the client's own time zone and language */
function when(iso, tz, loc) {
  try { return new Intl.DateTimeFormat(INTL[pickLocale(loc)], { timeZone: tz, dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso)); } catch (e) { return ''; }
}
/* a missing or unknown time zone must never give an email with an empty date: fall back to UTC and say so */
const zoneOf = (iso, tz, loc) => (tz && when(iso, tz, loc) ? { w: when(iso, tz, loc), z: line(tz, 64) } : { w: when(iso, 'UTC', loc), z: 'UTC' });

const T = {
  en: {
    sign: 'CULMERA solutions',
    hello: n => 'Hello ' + n + ',',
    thanksSubject: ref => 'We received your project brief ' + ref,
    thanksBody: ref => ['Thank you. We received your project brief (reference ' + ref + ').',
      'We will review the details and come back to you within 24 hours with our reply, including the price. If a conversation would help, we will send you a meeting link with one of our partners.'],
    replySubject: ref => 'Our reply to your brief ' + ref,
    replyIntro: ref => 'We have reviewed your brief (reference ' + ref + ').',
    price: p => 'Price: ' + p,
    meetAccount: url => 'If you would like to talk, open your account and choose a time that suits you: ' + url,
    meetVisitor: 'If you would like to talk, reply to this email with the days and times that suit you, and your time zone.',
    openAccount: url => 'You can read this message and answer it in your account: ' + url,
    confSubject: ref => 'Your meeting is confirmed (' + ref + ')',
    confIntro: ref => 'Your meeting about brief ' + ref + ' is confirmed.',
    confWhen: w => 'Date and time: ' + w,
    confLen: m => 'Length: ' + m + ' minutes',
    confLink: u => 'Microsoft Teams link: ' + u,
    confOpen: url => 'Your account shows the same details: ' + url
  },
  ar: {
    sign: 'CULMERA solutions',
    hello: n => 'مرحبًا ' + n + '،',
    thanksSubject: ref => 'استلمنا بريف مشروعك ' + ref,
    thanksBody: ref => ['شكرًا لك. استلمنا بريف مشروعك (المرجع ' + ref + ').',
      'سنراجع التفاصيل ونعود إليك خلال 24 ساعة بردّنا، ويتضمّن السعر. وإن لزم الأمر فسنرسل إليك رابط اجتماع مع أحد شركائنا.'],
    replySubject: ref => 'ردّنا على بريف مشروعك ' + ref,
    replyIntro: ref => 'راجعنا بريف مشروعك (المرجع ' + ref + ').',
    price: p => 'السعر: ' + p,
    meetAccount: url => 'إن رغبت في الحديث معنا، افتح حسابك واختر الموعد المناسب لك: ' + url,
    meetVisitor: 'إن رغبت في الحديث معنا، فرُدّ على هذه الرسالة بالأيام والأوقات المناسبة لك مع ذكر منطقتك الزمنية.',
    openAccount: url => 'يمكنك قراءة هذه الرسالة والرد عليها من حسابك: ' + url,
    confSubject: ref => 'تم تأكيد اجتماعك (' + ref + ')',
    confIntro: ref => 'تم تأكيد اجتماعك بخصوص البريف ' + ref + '.',
    confWhen: w => 'الموعد: ' + w,
    confLen: m => 'المدة: ' + m + ' دقيقة',
    confLink: u => 'رابط Microsoft Teams: ' + u,
    confOpen: url => 'تجد التفاصيل نفسها في حسابك: ' + url
  },
  de: {
    sign: 'CULMERA solutions',
    hello: n => 'Guten Tag ' + n + ',',
    thanksSubject: ref => 'Wir haben Ihr Projektbriefing erhalten ' + ref,
    thanksBody: ref => ['Vielen Dank. Wir haben Ihr Projektbriefing erhalten (Referenz ' + ref + ').',
      'Wir prüfen die Angaben und melden uns innerhalb von 24 Stunden mit unserer Antwort, einschließlich des Preises. Falls ein Gespräch sinnvoll ist, senden wir Ihnen einen Meeting-Link mit einem unserer Partner.'],
    replySubject: ref => 'Unsere Antwort auf Ihr Briefing ' + ref,
    replyIntro: ref => 'Wir haben Ihr Briefing (Referenz ' + ref + ') geprüft.',
    price: p => 'Preis: ' + p,
    meetAccount: url => 'Wenn Sie sprechen möchten, öffnen Sie Ihr Konto und wählen Sie einen passenden Termin: ' + url,
    meetVisitor: 'Wenn Sie sprechen möchten, antworten Sie auf diese E-Mail mit den Tagen und Uhrzeiten, die Ihnen passen, und Ihrer Zeitzone.',
    openAccount: url => 'Sie können diese Nachricht in Ihrem Konto lesen und beantworten: ' + url,
    confSubject: ref => 'Ihr Termin ist bestätigt (' + ref + ')',
    confIntro: ref => 'Ihr Termin zum Briefing ' + ref + ' ist bestätigt.',
    confWhen: w => 'Datum und Uhrzeit: ' + w,
    confLen: m => 'Dauer: ' + m + ' Minuten',
    confLink: u => 'Microsoft-Teams-Link: ' + u,
    confOpen: url => 'Dieselben Angaben finden Sie in Ihrem Konto: ' + url
  },
  fr: {
    sign: 'CULMERA solutions',
    hello: n => 'Bonjour ' + n + ',',
    thanksSubject: ref => 'Nous avons bien reçu votre brief ' + ref,
    thanksBody: ref => ['Merci. Nous avons bien reçu votre brief de projet (référence ' + ref + ').',
      'Nous étudions les détails et revenons vers vous sous 24 heures avec notre réponse, prix compris. Si un échange est utile, nous vous enverrons un lien de réunion avec l’un de nos partenaires.'],
    replySubject: ref => 'Notre réponse à votre brief ' + ref,
    replyIntro: ref => 'Nous avons étudié votre brief (référence ' + ref + ').',
    price: p => 'Prix : ' + p,
    meetAccount: url => 'Si vous souhaitez en parler, ouvrez votre compte et choisissez un créneau qui vous convient : ' + url,
    meetVisitor: 'Si vous souhaitez en parler, répondez à cet e-mail avec les jours et heures qui vous conviennent, ainsi que votre fuseau horaire.',
    openAccount: url => 'Vous pouvez lire ce message et y répondre dans votre compte : ' + url,
    confSubject: ref => 'Votre réunion est confirmée (' + ref + ')',
    confIntro: ref => 'Votre réunion concernant le brief ' + ref + ' est confirmée.',
    confWhen: w => 'Date et heure : ' + w,
    confLen: m => 'Durée : ' + m + ' minutes',
    confLink: u => 'Lien Microsoft Teams : ' + u,
    confOpen: url => 'Votre compte affiche les mêmes informations : ' + url
  }
};
const t = l => T[pickLocale(l)];
const name = n => line(n || '', 80) || '';
/* greeting: "Hello Ana," or, without a name, "Hello," (the greeting words end in the name slot) */
const hello = (l, n) => { const g = t(l).hello('\u0001'), nm = name(n); return (nm ? g.replace('\u0001', nm) : g.replace(/ ?\u0001/, '')).replace(/ ([,،])/, '$1'); };

/** The thank-you after a brief: {subject, body}. */
function thanks(locale, { name: n, ref }) {
  const x = t(locale);
  return { subject: x.thanksSubject(ref), body: [hello(locale, n), '', ...x.thanksBody(ref).flatMap(p => [p, '']), x.sign].join('\n') };
}

/** The Project Manager's reply. account = the client has an account (a link to it is added); visitor = reply to the email itself.
    message and note were cleaned by the caller (multi-line text, never HTML). */
function founderReply(locale, { name: n, ref, message, price, proposes, account, portalUrl }) {
  const x = t(locale), o = [hello(locale, n), '', x.replyIntro(ref), '', message, ''];
  if (price) o.push(x.price(line(price, 120)), '');
  if (proposes) o.push(account ? x.meetAccount(portalUrl) : x.meetVisitor, '');
  else if (account) o.push(x.openAccount(portalUrl), '');
  o.push(x.sign);
  return { subject: x.replySubject(ref), body: o.join('\n') };
}

/** The meeting confirmation with the Teams link the Project Manager pasted. */
function confirmed(locale, { name: n, ref, startsAt, tz, duration, teamsUrl, note, portalUrl }) {
  const x = t(locale), zz = zoneOf(startsAt, tz, locale);
  const o = [hello(locale, n), '', x.confIntro(ref), '', x.confWhen(zz.w + ' (' + zz.z + ')'), x.confLen(duration || 30), x.confLink(teamsUrl), ''];
  if (note) o.push(note, '');
  o.push(x.confOpen(portalUrl), '', x.sign);
  return { subject: x.confSubject(ref), body: o.join('\n') };
}

module.exports = { LOCALES, pickLocale, thanks, founderReply, confirmed, __t: { when } };
