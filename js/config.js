/* CULMERA site configuration.
   URLs: SITE_URL and API_URL below are placeholders on purpose. Run `node tools/set-urls.js <site-url> <api-url>`
   once the final addresses are known; it updates this file, index.html, robots.txt and sitemap.xml together.

   PROOF: everything under `proof` is hidden unless the owner has confirmed it. An item is shown only when
   verified:true AND permission:"approved" (plus the extra rules per type below). Anything else is hidden automatically
   and no placeholder is drawn. Nothing here is invented: leave arrays empty until real, permitted facts exist.

   proof.stats        [{v:"12", l:"Projects delivered", verified:true, source:"how this was counted"}]
   proof.clients      [{name:"Company", logo:"images/clients/company.svg", verified:true, permission:"approved"}]
   proof.testimonials [{quote:"Exact approved words", name:"Full name", role:"Title", company:"Company", verified:true,
                        permission:"approved", sourceUrl:"link to the original (optional)", photo:"images/team/x.webp", photoReal:true}]
                      (a photo is used only when photoReal:true; otherwise initials are shown, never a generated portrait)
   proof.certs        [{name:"Certification", issuer:"Body", holder:"Team member name", verifyUrl:"https://...", verified:true}]
                      (the certifications section appears only if EVERY listed certificate has a holder and a verifyUrl)
   proof.leaders      [{name:"Full name", role:"Title", quote:"Approved words (optional)", photo:"images/team/x.webp", photoReal:true,
                        verified:true, permission:"approved"}]
   proof.caseStudies  [{id:"slug-like-id", client:"Client name", anonymousSector:"Approved sector label used when client is empty",
                        country:"(optional, approved)", sector:"(optional, approved)", problem:"...", solution:"...",
                        deliverables:["..."], images:[{src:"images/work/a.webp", alt:"Describe it"}],
                        outcomes:[{label:"What changed", value:"Verified figure or statement", source:"Where it comes from"}],
                        verified:true, permission:"approved"}]                                                                  */
const CFG={
brand:"CULMERA",sub:"solutions",legalName:"CULMERA Solutions",country:"Egypt",
siteUrl:"https://culmera-solutions.com",
api:"https://culmera-api.vercel.app/api/brief",
/* Supabase (public values only). The publishable key is safe in the browser because every table is protected by Row Level Security. NEVER put the secret or service_role key here. */
supabase:{url:"https://xxwvkvgkitrjggptlljr.supabase.co",key:"sb_publishable_4fTLep42RDimKd6gFmdsHw_DBpErhNm"},
email:"info@culmera-solutions.com",phone:"",bookingUrl:"",ownerTimezone:"Africa/Cairo",
/* Studio hours shown and checked in the brief. Example: {days:[0,1,2,3,4],from:"10:00",to:"18:00"} (0 = Sunday). Must match the API's MEETING_* settings. */
meetingHours:null,
/* Real profile links only. Empty networks are hidden. */
socials:{linkedin:"",x:"",youtube:"",instagram:"",facebook:""},
/* Cloudflare Turnstile site key (public). Required for the API in production. */
turnstileSiteKey:"0x4AAAAAAGK-0Loh50KfHO_U",
analytics:null,
proof:{stats:[{v:"1500+",l:"Projects delivered",verified:true,source:"Confirmed by the owner"},{v:"45+",l:"Countries with delivered projects",verified:true,source:"Confirmed by the owner"}],clients:[],testimonials:[],certs:[],leaders:[],caseStudies:[]}
};
