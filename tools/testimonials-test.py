#!/usr/bin/env python3
"""Browser test for Phase 7 (client testimonials). Test entries are TEST DATA injected by the test only.
Run in ONE command:  (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! > /tmp/srv.pid; sleep 1; python3 tools/testimonials-test.py; kill $(cat /tmp/srv.pid))"""
import re, os
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
fails = []
os.makedirs('/home/claude/shots', exist_ok=True)
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

def entry(id, **kw):
    d = dict(id=id, country='Testland', sector='Test sector', quote='Approved test words for this entry.', name='Jane Roe', role='CTO', company='Acme Test', rating=4.5, displayMode='full', verified=True, permission='approved', approvedOn='2026-11-21')
    d.update(kw); return d
import json
def run(p, entries, vw=1280):
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': vw, 'height': 900}); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    def cfg(route, req):
        r = route.fetch(); body = r.text()
        route.fulfill(response=r, body=body + ('\nCFG.proof.testimonials=%s;' % json.dumps(entries) if entries is not None else ''))
    ctx.route('**/js/config.js', cfg)
    ctx.route(re.compile(r'https://(challenges\.cloudflare\.com|.*supabase\.co)/.*'), lambda r, q: r.fulfill(status=200, body='{}'))
    pg.goto(BASE + '#/home'); pg.reload(); pg.wait_for_selector('#app h1', timeout=8000)
    return b, pg, errs

with sync_playwright() as p:
    # 1. empty: hidden, neutral line, no placeholder
    b, pg, errs = run(p, [])
    ok(pg.locator('.feat').count() == 0 and 'Client feedback available on request' in pg.inner_text('#app'), 'empty: no testimonial block, neutral line only'); b.close()
    # 2. unverified or not approved: hidden
    b, pg, errs = run(p, [entry('t-a', verified=False, name='Hidden One'), entry('t-b', permission='pending', name='Hidden Two'), entry('t-c', permission=None, name='Hidden Three')])
    t = pg.inner_text('#app')
    ok(pg.locator('.feat').count() == 0 and not re.search('Hidden (One|Two|Three)', t), 'unverified / unapproved entries are never shown'); b.close()
    # 3. approved single: shown with its own rating, half star = 90%
    b, pg, errs = run(p, [entry('t-d', quote='Approved words <img src=x onerror=window.__xss=1> end of quote.')])
    t = pg.inner_text('#app')
    ok(pg.locator('.feat').count() == 1 and 'Jane Roe' in t and 'CTO, Acme Test' in t, 'approved entry shows name, role and company')
    ok(pg.locator('.stars').get_attribute('aria-label') == '4.5 out of 5 stars' and 'inline-size:90%' in pg.locator('.stars .sf').get_attribute('style'), 'rating is shown for that entry (4.5 of 5, half star)')
    ok(pg.locator('[role="tablist"]').count() == 0, 'one entry: no carousel')
    ok(pg.evaluate('window.__xss') is None and pg.locator('.feat blockquote img').count() == 0 and '<img' in pg.locator('.feat blockquote').first.inner_text(), 'quote text is escaped (shown as text)')
    ok(not re.search(r'average|aggregate|rated .* by', t, re.I), 'no average or aggregate rating text')
    ok(pg.locator('script[type="application/ld+json"]').count() == 0 or 'Review' not in pg.locator('script[type="application/ld+json"]').first.inner_text(), 'no Review structured data'); b.close()
    # 4. anonymous never reveals the name; first-name mode hides the surname
    b, pg, errs = run(p, [entry('t-e', displayMode='anonymous', name='Secret Person', company='Secret Co', role='Secret Role', photo='images/x.webp', photoReal=True), entry('t-f', displayMode='first', name='Maria Lopez', company='Hidden Corp', role='CFO')])
    html = pg.content(); t = pg.inner_text('#app')
    ok('Secret' not in html, 'anonymous: name, company and role appear nowhere in the page')
    ok('Test sector' in t and 'Testland' in t, 'anonymous: sector and country are shown')
    pg.click('#feat [role=tab] >> nth=1'); t = pg.inner_text('#feat')
    ok('Maria' in t and 'Lopez' not in pg.content() and 'Hidden Corp' not in pg.content() and 'CFO' in t, 'first-name mode: first name and role only')
    ok(pg.locator('.pf img').count() == 0, 'no photo unless photoReal and full mode'); b.close()
    # 5. the real shipped entries, at 1280 and 360
    for vw in (1280, 360):
        b, pg, errs = run(p, None, vw)
        n = pg.locator('#fq figure').count()
        ok(n == 12, f'{vw}px: all 12 approved entries are in the carousel (got {n})')
        ok(pg.locator('#feat [role=tab]').count() == 12 and pg.locator('#fpause').count() == 1, f'{vw}px: carousel controls present')
        ok(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), f'{vw}px: no sideways scroll')
        pg.locator('#feat').scroll_into_view_if_needed(); pg.wait_for_timeout(900)
        pg.locator('#feat').screenshot(path=f'/home/claude/shots/testimonials-{vw}.png')
        pg.screenshot(path=f'/home/claude/shots/testimonials-page-{vw}.png')
        ok(not errs, f'{vw}px: no JavaScript errors {errs}'); b.close()
    # 6. RTL preview keeps stars and layout
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 900})
    pg.goto(BASE + '?dir=rtl#/home'); pg.reload(); pg.wait_for_selector('#app h1'); pg.locator('#feat').scroll_into_view_if_needed(); pg.wait_for_timeout(700)
    ok(pg.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'), 'rtl: no sideways scroll'); pg.screenshot(path='/home/claude/shots/testimonials-rtl.png'); b.close()
print('\n%d failed' % len(fails))
