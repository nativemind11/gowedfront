/* CULMERA language registry: the ONLY list of site languages.
   To add a language: (1) copy js/i18n/en.js to js/i18n/<code>.js and translate it, (2) add ONE line below.
   code  = short code, also what the database stores (profiles.locale, client_briefs.locale): zh, pt, ...
   tag   = BCP-47 tag for <html lang> and for Intl (zh-CN, pt-PT, ar with Latin digits)
   name  = the language's own name, shown in the switcher
   dir   = ltr | rtl
   Only languages that are fully translated and checked by tools/validate.js belong here. */
window.LANGS=[
{code:"en",name:"English",tag:"en",dir:"ltr"}
/* fr and ar are added here when their files exist (Phase 8, batch 1) */
];
