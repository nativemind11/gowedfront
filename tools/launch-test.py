#!/usr/bin/env python3
"""Browser test for Phase 6 (home pricing block and anonymous features-only work entries). No real network.
Case-study data used here is TEST DATA injected into config.js by the test only; nothing of it is shipped.
Run in ONE command:  (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! > /tmp/srv.pid; sleep 1; python3 tools/launch-test.py; kill $(cat /tmp/srv.pid))"""
import re, os
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
fails = []
os.makedirs('/home/claude/shots', exist_ok=True)
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)

GOOD = '{id:"test-one",anonymousSector:"Test sector A",title:"Test platform A",summary:"A short approved summary.",features:["Feature one","Feature two <img src=x onerror=window.__xss=1>","Feature three"],verified:true,permission:"approved"}'
UNVER = '{id:"test-two",anonymousSector:"Test sector B",summary:"Hidden",features:["a","b","c"],verified:false,permission:"approved"}'
TWO = '{id:"test-three",anonymousSector:"Test sector C",summary:"Hidden",features:["a","b"],verified:true,permission:"approved"}'
NOSUM = '{id:"test-four",anonymousSector:"Test sector D",features:["a","b","c"],verified:true,permission:"approved"}'

def run(p, cases_js, label, vw=1280):
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': vw, 'height': 900}); pg = ctx.new_page()
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    def cfg(route, req):
        r = route.fetch(); body = r.text()
        route.fulfill(response=r, body=body + ('\nCFG.proof.caseStudies=[%s];' % cases_js if cases_js is not None else ''))
    ctx.route('**/js/config.js', cfg)
    ctx.route(re.compile(r'https://(challenges\.cloudflare\.com|.*supabase\.co)/.*'), lambda r, q: r.fulfill(status=200, body='{}'))
    pg.goto(BASE + '#/home'); pg.reload(); pg.wait_for_selector('#app h1', timeout=8000)
    return b, pg, errs

with sync_playwright() as p:
    # 1. nothing supplied: the work section stays hidden, pricing is there
    b, pg, errs = run(p, None, 'empty')
    ok(pg.locator('#pc-h').count() == 1, 'home has the pricing block')
    ok(pg.locator('#pc-h ~ .pgrid article, #app section:has(#pc-h) .pgrid article').count() == 3, 'pricing block has exactly 3 steps')
    txt = pg.locator('#app section:has(#pc-h)').inner_text()
    ok(not re.search(r'[$€£]|\b\d[\d,.]*\s?(USD|EUR|EGP|GBP)\b|best price|cheapest', txt, re.I), 'pricing block shows no price and no "best price" claim')
    ok('free' in txt.lower() and 'written quote' in txt.lower(), 'pricing block says first call is free and a written quote comes first')
    ok(pg.locator('#app section:has(#pc-h) a[href="#/brief"]').count() == 1, 'pricing block has one call to action to the brief')
    ok(pg.locator('#sh-h').count() == 1 and pg.locator('#app section:has(#sh-h) article.show').count() == 8, 'home has the "What we build" section with 8 illustrated cards')
    sh = pg.locator('#app section:has(#sh-h)')
    ok(sh.locator('svg').count() == 8 and sh.locator('svg[aria-hidden="true"]').count() == 8, 'every picture is decorative for screen readers (text carries the meaning)')
    ok(sh.locator('.scope', has_text='Illustration').count() == 8, 'every card is labelled "Illustration"')
    ok('not client projects' in sh.inner_text(), 'the section says plainly that these are not client projects')
    ok(not re.search(r'\b(law|legal|food|manufactur|client of|for a client|we built for|delivered for)\b', sh.inner_text(), re.I), 'no sector or client claim in the section (no real project is hinted at)')
    ok(sh.locator('img').count() == 0 and sh.locator('[src^="http"]').count() == 0, 'no external image and no photo of people in the section')
    ok(pg.locator('#cs-h').count() == 0, 'selected work is hidden when no entry is verified (no placeholder)')
    ok(pg.locator('#app').inner_text().lower().count('whatsapp') == 0, 'no WhatsApp on the home page')
    order = pg.evaluate("""()=>['en-h','sh-h','pc-h','rd-h'].map(i=>{const e=document.getElementById(i);return e?e.getBoundingClientRect().top+scrollY:null})""")
    ok(None not in order and order[0] < order[1] < order[2] < order[3], 'order on the page: how it works, what we build, pricing, principles')
    pg.goto(BASE + '#/work'); pg.reload(); pg.wait_for_selector('#app h1')
    ok('Selected work' in pg.locator('#app h1').inner_text() and pg.locator('#app .grid article').count() == 0, '#/work with no entries shows the honest empty message')
    pg.goto(BASE + '#/home'); pg.reload(); pg.wait_for_selector('#app h1'); pg.screenshot(path='/home/claude/shots/p6-home-1280.png', full_page=True)
    ok(not errs, 'no JavaScript errors (empty) %s' % errs); b.close()

    # 2. only invalid entries: still hidden
    b, pg, errs = run(p, ','.join([UNVER, TWO, NOSUM]), 'invalid')
    ok(pg.locator('#cs-h').count() == 0, 'unverified, <3 features, and no-summary entries are all hidden')
    ok(pg.locator('nav a[href="#/work"]').count() == 0, 'no Work link in the header when nothing is shown')
    b.close()

    # 3. one approved features-only entry
    b, pg, errs = run(p, ','.join([GOOD, UNVER, TWO]), 'good')
    ok(pg.locator('#cs-h').count() == 1 and pg.locator('#app section:has(#cs-h) article').count() == 1, 'exactly the approved entry is shown on the home page')
    c = pg.locator('#app section:has(#cs-h) article').inner_text()
    ok('test sector a' in c.lower() and 'A short approved summary.' in c and 'Hidden' not in c, 'card shows the sector label and the approved summary only')
    pg.goto(BASE + '#/work/test-one'); pg.reload(); pg.wait_for_selector('#app h1')
    page = pg.locator('#app').inner_text()
    ok(all(x in page for x in ['What it does', 'Feature one', 'Feature three']) and 'A features-only description' in page, 'work page lists the features and the honest note')
    ok(pg.locator('#app li').filter(has_text='Feature two <img').count() == 1 and pg.evaluate('window.__xss') is None and pg.locator('#app img[src="x"]').count() == 0, 'feature text is escaped (no HTML injected)')
    ok('Problem' not in page and 'The problem' not in page, 'no invented problem/solution text for a features-only entry')
    pg.screenshot(path='/home/claude/shots/p6-work-1280.png', full_page=True)
    pg.goto(BASE + '#/work/test-two'); pg.reload(); pg.wait_for_selector('#app h1')
    ok('test-two' not in pg.title().lower() and 'Hidden' not in pg.locator('#app').inner_text(), 'an unverified entry has no page of its own')
    ok(not errs, 'no JavaScript errors (entries) %s' % errs); b.close()

    # 4. phone width: no sideways scroll on home and work page
    b, pg, errs = run(p, GOOD, 'phone', vw=360)
    for r in ['#/home', '#/work', '#/work/test-one']:
        pg.goto(BASE + r); pg.reload(); pg.wait_for_selector('#app h1')
        ok(pg.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'no horizontal scroll at 360px on ' + r)
    pg.goto(BASE + '#/home'); pg.reload(); pg.wait_for_selector('#app h1'); pg.screenshot(path='/home/claude/shots/p6-home-360.png', full_page=True)
    ok(not errs, 'no JavaScript errors (360) %s' % errs); b.close()
print('\n%d failed' % len(fails)); raise SystemExit(1 if fails else 0)
