# CULMERA front end: change notes

## Positioning and structure
- Home rebuilt: clear hero, five capability areas, case studies (hidden until verified), how an engagement works, what we pay attention to, honest proof, capabilities, brief CTA.
- Catalogue grouped into five public areas (Websites and digital experiences, Business systems and platforms, Commerce and booking, AI automation and data, 3D and immersive). All 77 types stay reachable and searchable. Old category links redirect to the new areas.
- Internal levels L1 to L5 are shown as Essential, Standard, Advanced, Platform, Enterprise.

## Truthfulness
- Removed the invented figures, client list, testimonials, leadership profiles, certifications and AI-generated portraits (images/people deleted).
- Proof is driven by `proof` in `js/config.js` and only renders when `verified:true` and `permission:"approved"` (certifications: only when every certificate has a holder and a verification link). Photos are used only when `photoReal:true`, otherwise monograms.
- Case-study data model and pages (`#/work`) exist but stay hidden until a verified case study is added.

## Brief
- Starts with the business outcome (7 simple choices incl. "Not sure yet", which recommends a discovery conversation and needs no types).
- Each step explains why it is asked. Budget and timing are preferences. Details are optional and under "Advanced".
- Success screen only after the API confirms the save (reference number, next steps, contact method). Offline, server and configuration problems get a clear "not saved" screen with email/PDF/copy fallbacks and a retry. Fixable errors (for example a past time slot) stay on the review step.
- Turnstile now renders on the review step (the token was previously lost) and on the contact form.

## Performance, motion, accessibility
- Local fonts only (no Google Fonts); Three.js self-hosted (js/vendor); GSAP removed (light rAF parallax).
- One hero scene; group pages may show one scene; cards use SVG. Scenes are disposed on route change, pause off-screen and respect reduced motion, small screens, save-data and low-memory devices.
- Preloader is a short optional transition (about 0.8s maximum, skipped for reduced motion and repeat visits).
- Focus moves to the page heading on navigation; semantic headings; labelled controls; carousel only when 2+ verified testimonials exist.
- RTL: set `L.dir="rtl"` (or add `?dir=rtl` to preview). Logical CSS properties; inputs for email, phone, dates and times stay left-to-right.

## Tooling
- `node tools/set-urls.js <site> <api>` sets the final addresses everywhere (config, meta tags, sitemap, robots).
- `node tools/build-routes.js` regenerates `routes.json`, `sitemap.xml`, `robots.txt`.
- `node tools/validate.js [backend-dir]` runs the static checks (no old URLs, no unverified claims, slug and option parity with the API).

## Phase 0 cleanup (platform build)
- Deleted `images/people` (AI portraits).
- No WhatsApp number or button: `whatsapp` removed from config; brief phone label is now "Phone (optional)". Catalogue entries that mention WhatsApp describe services we build for clients and stay.
- Contact email is `info@culmera-solutions.com` everywhere (config); the old Gmail address is gone.
- Site address set to https://culmera-solutions.com (config, canonical/Open Graph, sitemap, robots) and a `CNAME` file added for GitHub Pages. The API address is still a placeholder until the Vercel project exists.
- `supabase.url` and `supabase.key` (publishable key only) added to config for the upcoming portal.

## Phase 1, step 1
- Removed the leftover images/people folder (AI portraits) that was still in the repository copy. Nothing referenced it.

## Phase 3, step 1: accounts
- New `js/auth.js`: sign-up, sign-in, password reset, new password, account page. No library: Supabase Auth over HTTPS with the publishable key only, PKCE flow (email links return to `<site>/?auth=confirm|recovery&code=...`, which the hash router cannot break), automatic token refresh, sign-out.
- Sign-up sends `full_name, company, country, phone, partner_code, locale` and never a role. `?ref=CODE` pre-fills the partner code (editable). Turnstile token is forwarded for Supabase CAPTCHA.
- Account page shows brief status, meeting, details and next steps; staff roles see a short note until Phase 4. Suspended users are signed out.
- Header gets Sign in / Your account. Auth pages are noindex (except sign-up and sign-in in the sitemap).
- `tools/auth-test.py`: 32 browser checks against a mocked Supabase.
- English only for now; translations come in the languages phase.
