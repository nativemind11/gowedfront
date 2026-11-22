# Phase 2.3 (Founder console, js/team.js) - DONE and browser-tested with a mock Supabase / mock /api/reply
- Client page in #/team (Founder only): Partner name AND Director name (or "Direct"); the conversation with the client; a reply form (message, optional price,
  "suggest a meeting"); email state per message (sent / failed / skipped) with "Resend email" for failed or skipped ones.
- A call the client asked for: "Confirm the call..." opens a form with the Teams link (https only, pasted by hand), an optional note and an optional new time.
  The old one-click "confirm" (no link) is gone. The link is shown to the Founder as a plain https link.
- New tab "Public briefs" (Founder only): the visitors' briefs, their details, the replies already sent, and an email-only reply form.
- Every write goes through POST /api/reply with the Founder's token and a NEW req_id on every press (reply, confirm and resend).
- Partner and Director: nothing new. They do not request brief_messages / visitor_replies / briefs, and no reply form, price or link is ever drawn for them
  (tools/roles-test.py proves it). Strings: L.tm.rp in the four languages.
- Files changed in the front: js/team.js, js/i18n/{en,ar,de,fr}.js, css/style.css (plus 2.2: js/brief.js, js/portal.js, js/auth.js).
- Tests run (Chromium, mock Supabase): tools/replies-test.py (new), roles-test.py (updated), team-test.py: all passed. NOT run: the real Supabase, the real mail, npm run test:rls.
- If migration 008 is NOT applied yet, the Founder console still opens; the conversation and Public briefs show a clear message instead of data.

# Phase 2, step 2.2 (front: brief and client page): DONE (v4), NOT PUBLISHED

Needs the back end of step 2.1 and `migration-008-replies.sql` first (order: 008, back end, front).

## Done in code
- `js/brief.js`: the meeting step is gone (visitor: 4 steps, signed-in client: 3). The public brief sends `locale`.
- `js/i18n/{en,ar,de,fr}.js`: meeting texts removed; new namespace `cv` (conversation and reply form), same keys in the 4 files.
- `js/portal.js`: conversation on `#/account` (Founder messages, price only inside his message, call proposal, confirmed call with an https-only Teams button, `rel="noopener noreferrer"`), reply form (message 1..4000 + OPTIONAL day/time/length in the client's time zone, at least one hour ahead, fresh `req_id` per message). The client cannot confirm.
- `js/auth.js`, `css/style.css`.

## Bugs found by the new browser test and fixed (v2/v3)
- `js/portal.js`: after the client suggests a new time, the call card on top of `#/account` kept showing the old CONFIRMED call and its Teams link. Now `cardRefresh()` reloads it (`id="mcard"`).
- `js/auth.js` notify queue: two events back to back (meeting, then client_reply) lost the second one until the next page load, because the running flush saved its old copy of the queue over the new item. Fixed with `nAgain` (run again right away) and "keep what was added while sending".

## Tests: what was RUN (headless Chromium, mock Supabase)
- `tools/convo-test.py` (NEW): 93/93 pass, last run after every code change (69 checks of the flow + section 10: the account page in ar, de, fr, en at 360 and 1280 px, no English left, no raw keys, nothing inside the page sticking out sideways). Details of the flow checks: 69/69 pass (conversation, form, optional time, req_id, one-hour and 12-month limits, 6 unsafe Teams links refused, HTML escaped, price only in the Founder's message, client cannot confirm, Partner/Director load nothing, 360 px). This run included the queue fix.
- `tools/notify-test.py`: 0 failed. `tools/auth-test.py`: 0 failed. (after the queue fix)
- `tools/brief-test.py`: 0 failed (60). Updated: visitor = 4 steps; NEW section 17: the visitor submit sends `locale` (en, ar, de, fr) and no meeting field.
- `tools/portal-test.py`: 0 failed (78). Updated: the brief review is step 4 and shows the optional "Request a call" link (`#/meeting`).
- `tools/i18n-test.py` (fr, de, ar): 179 pass, 34 fail. ALL 34 also fail on the ORIGINAL live front (fr 360 px sideways scroll 16 px on 14 pages, de 360 px 2 px on 14 pages, "8 languages" expected but 4 exist, for fr, de, ar; zh, ru, pt, nl are Batch 2). Not caused by Phase 2. Same counts per kind on the original (fr and de/ar compared).

## Also run
- `node tools/validate.js`: only the old known failure (`js/boot.js` lists 4 of the 8 languages; zh, ru, pt, nl are Batch 2). Nothing new.
- Known, NOT from Phase 2: at 360 px the header menu button sticks out of the page in French (16 px) and German (2 px) on every page, also on the original live front. `convo-test.py` section 10 therefore judges only what is inside the account page. Fix later in the header CSS if wanted.

## NOT done
- The privacy text still lists "meeting preferences" and does not mention the conversation messages: needs a legal review.
- Step 2.2 is finished. Steps 2.3 (Founder console, `js/team.js`) and 2.4 (final review and deployment steps) are not started.


---

# Phase 9, step 1 (roles): Partner, Director, Founder

Needs the back end's `migration-007-roles.sql` (the page reads the new views). Deploy the back end and run the migration BEFORE publishing this page, or Partner and Director dashboards show a load error until the views exist. The Founder page is unaffected.

- `js/team.js`: Partner reads only `partner_clients` and sees names, the count and the project per client (no status, brief, call, owner, search by email, client page or notes). Director reads `director_team`, `director_clients`, `director_briefs`, `director_meetings` and sees partners with their clients, the project per client, brief status and answers, calls: read only (no status form, no confirm / finish / cancel, no notes, no invite form, no deactivate, no CSV, no contact details). The Founder page is unchanged. No new text: every label reuses an existing one, so the 4 language packs need no change.
- `tools/roles-test.py` (new): 38 browser checks with a mock Supabase (what each role sees, what it asks for, nothing written). `tools/team-test.py`: the old Partner and Director sections (old rules) were removed; Founder, invitation-link and layout sections pass.
- Known, not from this change: `node tools/validate.js` still reports that `js/boot.js` lists 4 of the 8 languages (zh, ru, pt, nl are Batch 2).

---

# Phase 8, header fix + French polish (after Batch 1)
- Header: every item stays on ONE line (cause: global `overflow-wrap:anywhere` on `.chip/.btn` broke "EN" and "Search" letter by letter and links wrapped). Search is now an icon button (tooltip shows Ctrl K). `fit()` in `js/app.js` steps down only when labels do not fit: short button text, then the menu button. Works for every language and for the "Your account" label change after sign-in.
- French: non-breaking space before `: ; ! ?` and inside « », and "relire" -> "examiner".
- Still to deliver (Batch 2): zh, ru, pt, nl.

---

# Phase 8, Batch 1 (languages): system + Arabic, French, German

**Status: delivered for review. zh, ru, pt, nl are Batch 2.** Translations are AI-assisted: a native speaker must review each language before launch.

## What is new
- `js/boot.js` picks the language (`?lang=xx`, saved choice `culmera.lang`, browser language, English) and loads only `js/i18n/<code>.js` before any other script, so the first paint is already translated. `LANGS` there holds the 8 languages (en fr de zh ru pt nl ar). TO ADD A LANGUAGE: one file in `js/i18n/` + one line in `LANGS` (+ the code in the SQL check).
- Pack format: `window.I18N_PACK={code,L,CAT}`. `L` has exactly the keys of `en.js`; `CAT` translates every catalogue sentence. `js/lang-apply.js` translates only display fields of the catalogue. Module names stay English as saved keys and are shown through `TR()`. Option values stay English; labels come from `L.optL` through `OL()`.
- Language switcher in the header (desktop) and in the mobile menu: native names, `lang`/`dir` on each option, `aria-current`, Esc and arrow keys. Choosing a language saves it and reloads the same address (hash kept). The reload is deliberate: it refreshes every module's cached text reliably.
- Title, description, `og:*`, `twitter:*`, `og:locale` follow the language. No `hreflang` (hash routes cannot have per-language URLs; that belongs to Phase 1).
- Turnstile language comes from `LANGS[code].ts` (`pt` uses `pt-br`, `ar` uses `ar-eg`: Turnstile has no European Portuguese).
- About 45 English texts that were written inside the code (validation messages, brief summary, slider buttons, footer, tooltips, stat labels) moved to `L.x`, `L.statL`, `L.optL`.
- CSS: per-language system font stacks (ar, zh, ru), no letter-spacing for ar/zh, hyphenation, wrap-safe buttons. FIX found by the new test: the class `.lg` already existed as a grid class, so the switcher uses `.lsw`.
- `LOCALES` in `brief.js` is now the 8 codes. Sign-up already sent `locale`.
- `tools/validate.js` now fails the build if a pack has a missing or extra key, an empty text, a different `{placeholder}`, a changed non-text value, a catalogue sentence or option label without translation. Proven by a deliberate mistake.
- `tools/i18n-test.py`: every public route in every delivered language at 360 and 1280 px (lang/dir, no JS errors, no sideways scroll, no English sentences left, switcher, persistence after reload, mobile menu). Last run: 213 passed, 0 failed (ar, fr, de). `tools/i18n-pseudo.js` makes a marker language to hunt hard-coded text.
- Old tests (auth, brief, launch, notify, portal, team, testimonials) pass. `browser-test.py` already failed before this phase (waits for `.ref`).

## Not tested
- Private screens (account, meeting, dashboards) in ar/fr/de were checked only through the validator (every string translated) and the static scan, not by a browser crawl.
- Testimonials stay in their approved English wording by design.

---

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

## Phase 5: email and protection
- `js/auth.js`: `CulmeraAuth.notify(event, id)` tells `/api/notify` (derived from the API address in `js/config.js`) after a real event, with only the event name and a record id plus the user's token. A small queue in `localStorage` key `culmera.notify` (ids only, no personal data) retries after a network or server failure on the next page load; items are dropped after 3 days, 6 tries, or when the server answers 400/401/403/404/409. `culmera.reg.<user>` remembers that a new account was already reported.
- Hooks: first account view of a client (`registered`), `js/brief.js` after a successful signed-in submit (`brief_submitted`), `js/portal.js` after a booking, a reschedule and a cancel (`meeting`). Nothing blocks or slows the page; a failed notification is never shown as an error.
- Visitors without an account are not affected: the public form still goes to `/api/brief`, which emails the Founder as before.
- Tests: new `tools/notify-test.py` (browser, mock Supabase + mock notify API); `tools/team-test.py`, `portal-test.py`, `brief-test.py`, `auth-test.py` still pass; `node tools/validate.js <back>` passes.

## Phase 5 fixes
- Text that was out of date after Phase 4 is corrected: signed-in staff on the brief and booking pages (and the account fallback) now say their tools are in the team dashboard, not "in a later release".
- Privacy text ("Who handles it") now says what the notification emails hold and who receives them: name, company, country and the brief reference or call time go to the CULMERA team and, for a client introduced by a partner, to that partner and their director; never the client's email address, phone, answers or notes. **A lawyer must review this wording (see the launch pack).**

## Phase 6: content and launch
- **Home: "How pricing works"** block (3 steps, no prices, no "best price" claim, one button to the brief). Home order is now: hero, five areas, how an engagement works, selected work (hidden until supplied), pricing, principles, proof, team, leadership, certifications, final call to action. Strings are in `L.pricing` (English only until Phase 8).
- **Selected work: anonymous "features-only" entries.** `proof.caseStudies` entries may now carry `summary` + `features` (3 or more) instead of `problem` + `solution`. They show only when `verified:true` and `permission:"approved"`; the page prints "A features-only description" and never invents a problem, a result or a client name. Text is escaped. With no approved entry the section, the header link and the route stay hidden (nothing is drawn as a placeholder). **No entry is shipped yet: the owner's feature lists for the two projects are still needed.**
- `tools/validate.js`: new checks (pricing block has 3 steps and no price; case-study ids unique and valid; a verified entry must be approved; a features-only entry needs a summary and 3+ features; every outcome needs a source; no "later release" text). Proven to fail when a price is put in the pricing block.
- New `tools/launch-test.py` (browser, 23 checks): pricing block, order, no sideways scroll at 360 px, work section hidden when empty / unverified / too short / no summary, shown when approved, escaped text, no problem/solution invented, no JavaScript errors.
- No new file to delete by hand; `routes.json` and `sitemap.xml` are unchanged.

### Phase 6 addition: "Examples" section (what we can build)
- New home section after "How an engagement works": 8 simple illustrations (platforms with roles, studios and media platforms, dashboards, online stores, booking and client portals, company websites, assistants and automation, operations systems). Each card is labelled "Illustration" and the section says plainly that these are concepts, not client projects. No real project, client, sector, number or person is shown or hinted at. Pictures are inline SVG (no image files, no people), hidden from screen readers; the text carries the meaning. Strings in `L.show`; pictures in `ART` in `js/app.js`.
- Because no client work is published, the "Selected work" section stays hidden until the owner chooses to supply entries (it is optional).
- `tools/validate.js` and `tools/launch-test.py` check the section (8 cards, labelled, no sector or client claim, no external images).

## Brief: no prices, timing in days
- Removed the "Budget range" and "Currency" fields from the brief (form, summary text, answer whitelist). No price or budget is asked or shown anywhere.
- Timing options are now 5, 7, 10, 20 and 30 days (was ASAP / 1-3 months / 3-6 months / Flexible). Old saved answers with budget/currency are dropped by the whitelist on load.
- Privacy text and brief intro no longer mention budget.

## Phase 7: client testimonials
- 12 client opinions from "CULMERA Client Voices" entered in `proof.testimonials` (js/config.js). The owner confirmed the data in the chat (names, roles, companies, wording and ratings) on 2026-11-21; `approvedOn` records it. Display mode: full name, role and company. The "draft / not verified" notice printed in the PDF is not published. The PDF's Gmail address is ignored.
- Ratings are shown one by one (half stars supported, e.g. 4.5 of 5). No average or total rating anywhere; no Review/AggregateRating data.
- Component: `displayMode` full | first | anonymous. Anonymous never prints the name, company or role. Photos only when `photoReal:true` in full mode; otherwise a monogram. Carousel with 2+ entries (pause control, reduced motion respected); dots wrap on small screens.
- `tools/validate.js`: fails if an unverified/unapproved entry is in the file, if rating, displayMode, approvedOn or id are wrong, if a quote carries a price or percentage, or if Review/AggregateRating data appears.
- New `tools/testimonials-test.py` (hidden when empty / unverified, shown when approved, anonymous never reveals the name, escaped text, 360 and 1280 px, RTL preview). Screenshots in /home/claude/shots.
- No database change and no back-end change: no migration for Phase 7 (next migration number is still 006, for Phase 8 languages).
