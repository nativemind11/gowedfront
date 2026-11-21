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

## Phase 3, step 2: autosaving brief for signed-in clients
- Signed-in clients get a 3-step brief (Outcome, Project, Review). Name, email, company and country come from the account, and the meeting is booked in the next step (3.3), so those two steps are not asked again.
- Every change is saved automatically (about 1.2 s after you stop typing) to `client_briefs` with the user's own token; Row Level Security decides what is allowed. The first change creates one draft; opening the page never creates an empty row. Failed saves are shown honestly ("Not saved yet"), retried a few times, and can be retried with "Save now". A save that the database rejects (the team has moved the brief on) switches to a read-only view instead of looping.
- Answers are stored as `{v:1, project, refine, items}` using slugs and option values, which are identical in every language. Every value is whitelisted and trimmed both when saving and when loading, so stored data can never inject HTML or unknown types.
- Submit = status draft -> submitted (the only change a client may make). After submitting, answers can still be edited and are saved; once the team changes the status the brief is read-only and shows its status.
- This device and the server are reconciled: first time on a device the local catalogue picks are merged with the server draft; after that the server copy wins unless this device has unsaved changes.
- Visitors keep the existing public form (`/api/brief`) and see an invitation to create an account. Sign-out now also clears the local brief draft and reloads, so nothing stays on a shared computer.
- New privacy block "Accounts". New strings live in `L.pb` (English only until the languages phase).
- Tests: `tools/brief-test.py` (43 browser checks against a mock), `tools/auth-test.py` still 32/32. Back end: 23 RLS isolation tests (one new test for the exact query shapes).

## Phase 3, steps 3 and 4: meeting booking, status view, data rights
- New `js/portal.js` (no library). Route `#/meeting` (private, noindex, not in the sitemap).
- **Booking (3.3).** Calendar grid (keyboard: arrows, Home/End, PageUp/PageDown, Enter) and hour/minute selects, any day and any time (no studio hours), lengths 30/45/60 from `L.opts.duration`, optional note (max 1000). The client's time zone and the studio time zone (`ownerTimezone`) are shown side by side, both while choosing and after booking. Times in the past or less than one hour ahead are refused with a friendly message (same rule as the database; the page adds one minute of safety). Booking needs a **submitted** brief (the call is built around it); a draft or missing brief is sent back to the brief. One active (requested/confirmed) meeting per brief: change = update the same row (status goes back to `requested`), cancel = status `cancelled` after a confirm step, then a new request is possible. A client never confirms. If the team has already moved a meeting on, the database changes zero rows and the page says so and reloads it. After a call is marked done the page offers no further booking.
- The 3.2 screens no longer say "we email you": the brief success screen and the submitted brief now have a "Book your free call" button. No email is sent for bookings until Phase 5; the page says the team confirms and the status appears here.
- **Account page (3.4).** The meeting card shows the time in both zones, status, length and a Book / Manage button. New status timeline from `client_briefs.status` (Draft, Submitted, In review, Call scheduled, In discussion, Agreed; closed and archived get a note). New "How pricing works" block (free first call, scoped brief, written quote before any work; no prices). New "Your data" block: request a copy of your data or deletion of your account. A deletion request asks for confirmation first, is only recorded in `data_requests` for the Founder, and nothing is deleted automatically. If the table is missing the page says so and offers the email.
- Privacy text now says the requests can be made from the account page.
- Floating "Start your project brief" button is hidden on the booking and account pages.
- Needs `supabase/migration-003-portal.sql` in the back-end repo (run once in the Supabase SQL Editor): unique active meeting per brief and the `data_requests` table with Row Level Security.
- Tests: `tools/portal-test.py` (78 browser checks against a mock), `tools/brief-test.py` 43/43, `tools/auth-test.py` 32/32.

## Phase 4: partner portal and management consoles
- New `js/team.js` and one private route `#/team` (noindex, not in the sitemap). It adapts to the role; clients are sent to their account, and staff opening `#/account` land on the dashboard. Everything is read and written with the signed-in user's own token, so Row Level Security decides what each role sees; buttons the database would refuse are simply not shown.
- **Partner:** personal code, link builder (home or sign-up page) with copy button, own clients with brief status and call, client page (details, answers shown as plain text, internal notes), counts by status, and the **Partner Playbook**.
- **Director:** the same for the whole group, plus brief status changes, confirming / finishing / cancelling calls (two time zones shown), "needs attention" list, group totals, partner list with activate / deactivate, invitations (partners into his own group only) and cancelling invitations.
- **Founder:** everything above for all groups, plus reassigning clients, moving partners between groups, changing Partner / Partner Director roles, suspend and delete (both ask for confirmation first), data requests (export / deletion) with status handling, activity log, CSV export of clients, briefs and calls.
- **Playbook** is read from the database table `playbook` (staff only), not from the public site files. Edit it in Supabase > Table Editor > playbook.
- Invitation emails: the invited person opens the link, lands on "Welcome to the CULMERA team", enters a name and a password, then goes to their dashboard. Tokens are removed from the address bar immediately.
- CSV cells that start with `=`, `+`, `-` or `@` are neutralised so a spreadsheet cannot run them. Answers, notes and call notes are always escaped.
- Needs `supabase/migration-004-team.sql` (back-end repo) and `api/admin.js` (Vercel). No new environment variables.
- Tests: `tools/team-test.py` (browser, mock), `tools/portal-test.py`, `tools/brief-test.py`, `tools/auth-test.py`.
- English only for now; strings are in `L.tm`.
