# CULMERA solutions: changed files

Rebrand GOWED -> CULMERA (wordmark "CULMERA" with small "solutions" beneath).

## Front end
- index.html: new title/meta/og/twitter, SVG favicon, apple-touch icon, wordmark preloader, deferred scripts (three.js now loads on demand).
- css/style.css: full redesign (ink/midnight/graphite/ivory/gold/steel, Cormorant Garamond + Inter, 12-col grid, 900-1400 ms easing).
- js/config.js: brand, legalName, about, leaders, hero lines; added `industries` (derived from existing clients). Stats, testimonials, certs untouched. `api` untouched.
- js/app.js: new home (hero, stats band, featured testimonial, trusted by, industries, categories, process, leadership, certifications, CTA), restyled catalog/type/category pages, footer, mobile menu, JSON-LD, line reveals, count-up, parallax. Draft key migrates from `gowed.brief` to `culmera.brief`.
- js/scenes.js: gold wireframe hero scene, fewer particles, pixel ratio cap 2, pauses offscreen, static fallback on mobile and reduced motion.
- js/brief.js: CULMERA text in summary/PDF title, step progress, "what happens next" success screen. Flow, validation, honeypot and API call unchanged.
- sitemap.xml, robots.txt: brand header (URLs unchanged, see note).
- images/: new hero.webp, og.jpg (1200x630), favicon.svg, apple-touch-icon.png. People photos unchanged.
- Unchanged: js/catalog.js (77 types, slugs identical to backend), js/i18n/en.js, .nojekyll.

## Back end (text only)
- api/brief.js (notification and confirmation text, sender name), supabase/schema.sql, .env.example, package.json name.

## Note
Site URLs still use `nativemind11.github.io/gowedfront` and the API still uses `gowedback.vercel.app`. If you rename the repos, replace those in js/config.js, index.html, sitemap.xml, robots.txt and the backend ALLOWED_ORIGIN.
