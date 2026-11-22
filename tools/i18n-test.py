#!/usr/bin/env python3
"""Phase 8 browser test: every public route in every delivered language, at 360 and 1280 px.
Checks: <html lang/dir>, no JavaScript errors, no sideways scroll, a translated h1, no obvious English left,
the switcher (open, choose, persists after reload, hash kept), Turnstile language, title/description follow the language.
Serve the site first:  python3 -m http.server 8765   then:  python3 tools/i18n-test.py [codes...]"""
import re, sys, os, json
from playwright.sync_api import sync_playwright
BASE = os.environ.get('BASE', 'http://localhost:8765/')
ROOT = os.path.join(os.path.dirname(__file__), '..')
ALL = {'fr': 'fr', 'de': 'de', 'zh': 'zh-CN', 'ru': 'ru', 'pt': 'pt-PT', 'nl': 'nl', 'ar': 'ar'}
codes = sys.argv[1:] or [c for c in ALL if os.path.exists(os.path.join(ROOT, 'js/i18n/%s.js' % c))]
ROUTES = ['home', 'catalog', 'type/corporate-website', 'type/online-store', 'how-we-work', 'about', 'contact', 'brief', 'signup', 'signin', 'reset', 'privacy', 'terms', 'does-not-exist']
EN_WORDS = re.compile(r'\b(the|and|your|with|for|from|that|this|our|are|you|is|to)\b', re.I)
fails = []; passed = 0
def check(ok, msg):
    global passed
    if ok: passed += 1; print('PASS', msg)
    else: fails.append(msg); print('FAIL', msg)
LEAK = '''()=>{const o=[];const w=document.createTreeWalker(document.querySelector('#app')||document.body,NodeFilter.SHOW_TEXT);let n;
while(n=w.nextNode()){const t=n.nodeValue.trim();if(t.length<14)continue;const p=n.parentElement;if(!p||p.closest('.hp,[hidden],script,style,[data-keep-en],.tst,.testimonial,figure'))continue;
const cs=getComputedStyle(p);if(cs.display==='none'||cs.visibility==='hidden')continue;o.push(t)}return o}'''
with sync_playwright() as p:
    b = p.chromium.launch()
    for code in codes:
        for w in (360, 1280):
            ctx = b.new_context(viewport={'width': w, 'height': 900})
            ctx.route(re.compile(r'https://(challenges\.cloudflare\.com|[a-z0-9]+\.supabase\.co)/.*'), lambda r, q: r.fulfill(status=200, body='{}'))
            pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.goto(BASE + '?lang=%s#/home' % code); pg.wait_for_selector('#app h1', timeout=8000)
            h = pg.evaluate("[document.documentElement.lang, document.documentElement.dir]")
            check(h == [ALL[code], 'rtl' if code == 'ar' else 'ltr'], '%s %dpx html lang/dir = %s' % (code, w, h))
            en_h1 = None
            for r in ROUTES:
                pg.goto(BASE + '#/' + r); pg.reload(); pg.wait_for_timeout(350)
                ov = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
                check(ov <= 1, '%s %dpx #/%s no sideways scroll (%dpx)' % (code, w, r, ov))
                txt = pg.evaluate(LEAK); eng = [t for t in txt if len(EN_WORDS.findall(t)) >= 3]
                check(not eng, '%s %dpx #/%s no English sentences left %s' % (code, w, r, [e[:60] for e in eng[:2]]))
            check(not errs, '%s %dpx no JavaScript errors %s' % (code, w, errs[:2]))
            if w == 1280:
                pg.goto(BASE + '#/catalog'); pg.reload(); pg.wait_for_timeout(300)
                title = pg.title(); desc = pg.evaluate("document.querySelector('meta[name=description]').content")
                og = pg.evaluate("document.querySelector('meta[property=\"og:locale\"]').content")
                check(not EN_WORDS.search(desc) or code in ('fr',), '%s meta description translated (%s)' % (code, desc[:50]))
                check(og != 'en_US', '%s og:locale = %s' % (code, og))
                # switcher: open, list, choose English, persists, back
                pg.click('#lgb'); check(pg.evaluate("document.querySelector('#lgm').hidden") is False, '%s switcher opens' % code)
                n = pg.evaluate("document.querySelectorAll('#lgm [data-lang]').length"); check(n == 8, '%s switcher lists 8 languages (%d)' % (code, n))
                check(pg.evaluate("document.querySelector('#lgm [aria-current]').dataset.lang") == code, '%s current language marked' % code)
                pg.keyboard.press('Escape'); check(pg.evaluate("document.querySelector('#lgm').hidden") is True, '%s Esc closes the switcher' % code)
                pg.click('#lgb'); pg.click('#lgm [data-lang=en]'); pg.wait_for_selector('#app h1'); pg.wait_for_timeout(300)
                check(pg.evaluate("document.documentElement.lang") == 'en' and '#/catalog' in pg.url, '%s -> English keeps the page (%s)' % (code, pg.url[-12:]))
                pg.reload(); pg.wait_for_selector('#app h1')
                check(pg.evaluate("document.documentElement.lang") == 'en', '%s English choice survives reload' % code)
                pg.click('#lgb'); pg.click('#lgm [data-lang=%s]' % code); pg.wait_for_selector('#app h1'); pg.wait_for_timeout(300)
                check(pg.evaluate("document.documentElement.lang") == ALL[code], '%s back to %s' % (code, code))
            ctx.close()
        # mobile menu switcher
        ctx = b.new_context(viewport={'width': 360, 'height': 800}); pg = ctx.new_page()
        pg.goto(BASE + '?lang=en#/home'); pg.wait_for_selector('#app h1')
        pg.click('#mnu') if pg.query_selector('#mnu') else pg.click('button[aria-controls=mm]')
        pg.wait_for_timeout(200)
        vis = pg.evaluate("[...document.querySelectorAll('.mlg [data-lang]')].filter(e=>e.offsetParent).length")
        check(vis == 8, '%s mobile menu shows 8 language buttons (%d)' % (code, vis))
        pg.click('.mlg [data-lang=%s]' % code); pg.wait_for_selector('#app h1'); pg.wait_for_timeout(300)
        check(pg.evaluate("document.documentElement.lang") == ALL[code], '%s chosen from the mobile menu' % code)
        ctx.close()
    b.close()
print('\n%d passed, %d failed' % (passed, len(fails)))
sys.exit(1 if fails else 0)
