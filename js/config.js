/* CULMERA site configuration.
   URLs: SITE_URL and API_URL below are placeholders on purpose. Run `node tools/set-urls.js <site-url> <api-url>`
   once the final addresses are known; it updates this file, index.html, robots.txt and sitemap.xml together.

   PROOF: everything under `proof` is hidden unless the owner has confirmed it. An item is shown only when
   verified:true AND permission:"approved" (plus the extra rules per type below). Anything else is hidden automatically
   and no placeholder is drawn. Nothing here is invented: leave arrays empty until real, permitted facts exist.

   proof.stats        [{v:"12", l:"Projects delivered", verified:true, source:"how this was counted"}]
   proof.clients      [{name:"Company", logo:"images/clients/company.svg", verified:true, permission:"approved"}]
   proof.testimonials [{id:"t-xx", country:"", sector:"", quote:"Exact approved words", name:"Full name", role:"Title", company:"Company", rating:4.5 (1 to 5, halves allowed), displayMode:"full|first|anonymous", approvedOn:"YYYY-MM-DD", verified:true,
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
proof:{stats:[{v:"1500+",l:"Projects delivered",verified:true,source:"Confirmed by the owner"},{v:"45+",l:"Countries with delivered projects",verified:true,source:"Confirmed by the owner"}],clients:[],testimonials:[
{id:"t-us",country:"United States",sector:"Legal systems",quote:"Thank you, CULMERA, for building a secure and intuitive system that brings our cases, documents, and daily legal workflows into one clear view. It feels purpose-built for our practice rather than like another off-the-shelf tool.",name:"Ethan Mitchell",role:"Founder & Managing Partner",company:"VIM Legal Systems",rating:5,displayMode:"full",verified:true,permission:"approved",approvedOn:"2026-11-21"},
{id:"t-ca",country:"Canada",sector:"Data training",quote:"Thank you, CULMERA, for creating a complete recording studio workflow for our data-training business. From recording and editing to delivery, the experience is professional, organised, and built around the quality our learners expect.",name:"Sophie Tremblay",role:"Chief Executive Officer",company:"DataForge Training Co.",rating:4.5,displayMode:"full",verified:true,permission:"approved",approvedOn:"2026-11-21"},
{id:"t-de",country:"Germany",sector:"Food manufacturing",quote:"We sincerely thank CULMERA for understanding the character of our cheese business and translating it into a digital platform that feels premium, rooted in tradition, and modern at the same time. It works beautifully for customers and employees.",name:"Klaus Schneider",role:"Managing Director",company:"AlpenKäse Manufaktur GmbH",rating:4.5,displayMode:"full",verified:true,permission:"approved",approvedOn:"2026-11-21"},
{id:"t-cn",country:"China",sector:"Steel & industry",quote:"Thank you, CULMERA, for bringing production, inventory, and daily operations into one organised workspace. Our teams move faster, information is easier to find, and everyone now works from a clearer shared process.",name:"Wei Zhang",role:"Operations Director",company:"PakSteel Industries",rating:4,displayMode:"full",verified:true,permission:"approved",approvedOn:"2026-11-21"},
{id:"t-nl",country:"The Netherlands",sector:"Digital platform",quote:"Thank you, CULMERA, for turning our ambition into a digital experience that people understand immediately. The combination of clear structure, thoughtful design, and dependable technology gives our business a stronger way to grow.",name:"Lucas de Vries",role:"Commercial Director",company:"Northstar Digital Ventures",rating:4.5,displayMode:"full",verified:true,permission:"approved",approvedOn:"2026-11-21"},
{id:"t-ae",country:"United Arab Emirates",sector:"Real estate",quote:"Thank you, CULMERA, for making our digital presence worthy of our real-estate projects. The website is clear, elegant, and easy to use, helping clients discover our developments and take the next step with confidence.",name:"Omar Al Mansoori",role:"Chief Executive Officer",company:"Al Noor Real Estate Development",rating:5,displayMode:"full",verified:true,permission:"approved",approvedOn:"2026-11-21"},
{id:"t-ru",country:"Russia",sector:"Data & technology",quote:"Thank you, CULMERA, for turning a complex technology brief into a dependable platform. The team connected our data, workflows, and reporting in a way that makes daily decisions faster and clearer.",name:"Alexei Volkov",role:"Chief Technology Officer",company:"Baltic Data Systems",rating:4,displayMode:"full",verified:true,permission:"approved",approvedOn:"2026-11-21"},
{id:"t-fr",country:"France",sector:"Brand experience",quote:"We thank CULMERA for creating a digital experience that feels as considered as our brand. The website is elegant, easy to navigate, and gives our customers a much clearer way to discover our work.",name:"Claire Dubois",role:"Brand Director",company:"Maison Lumière Group",rating:4.5,displayMode:"full",verified:true,permission:"approved",approvedOn:"2026-11-21"},
{id:"t-jp",country:"Japan",sector:"Manufacturing",quote:"Thank you, CULMERA, for bringing our operations into one organised system. The solution respects the detail of our manufacturing process while making information easier for every team to use.",name:"Kenji Nakamura",role:"Managing Director",company:"Kizuna Manufacturing Co.",rating:4.5,displayMode:"full",verified:true,permission:"approved",approvedOn:"2026-11-21"},
{id:"t-se",country:"Sweden",sector:"Education",quote:"We are grateful to CULMERA for giving our learning platform a clear structure and a more human experience. Learners find what they need faster, and our team can improve the product with confidence.",name:"Elin Andersson",role:"Head of Product",company:"Nordic Learning Lab",rating:4,displayMode:"full",verified:true,permission:"approved",approvedOn:"2026-11-21"},
{id:"t-sa",country:"Saudi Arabia",sector:"Business services",quote:"Thank you, CULMERA, for building a professional platform that supports our teams and our clients. The clarity of the experience has made our services easier to explain and easier to scale.",name:"Faisal Al Harbi",role:"Chief Operating Officer",company:"Riyadh Growth Partners",rating:4.5,displayMode:"full",verified:true,permission:"approved",approvedOn:"2026-11-21"},
{id:"t-sg",country:"Singapore",sector:"E-commerce",quote:"Thank you, CULMERA, for combining strong design with practical technology. Our new digital commerce experience is clearer for customers and gives our internal teams a better foundation for growth.",name:"Daniel Tan",role:"Founder & CEO",company:"Meridian Commerce Pte. Ltd.",rating:4.5,displayMode:"full",verified:true,permission:"approved",approvedOn:"2026-11-21"}
],certs:[],leaders:[],caseStudies:[]}
};
