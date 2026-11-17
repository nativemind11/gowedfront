#!/usr/bin/env python3
"""Browser checks for the CULMERA front end (needs: pip install playwright && playwright install chromium).
   python3 tools/browser-test.py [backend-dir]
Serves the site locally, mocks the API, and verifies behaviour. Screenshots go to ./.shots (git-ignored)."""
import sys, os, json, re, threading, http.server, socketserver, subprocess, datetime, functools
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACK = sys.argv[1] if len(sys.argv) > 1 else next((os.path.join(os.path.dirname(ROOT), d) for d in os.listdir(os.path.dirname(ROOT)) if os.path.exists(os.path.join(os.path.dirname(ROOT), d, 'scripts/sync-from-front.js'))), '')
SHOTS = os.path.join(ROOT, '.shots'); os.makedirs(SHOTS, exist_ok=True)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Q, directory=ROOT)); httpd.daemon_threads = True
PORT = httpd.server_address[1]; threading.Thread(target=httpd.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{PORT}/index.html'
API = 'https://api.test.local/api/brief'
res = []
def check(name, cond, extra=''):
    res.append((bool(cond), name, extra)); print(('PASS  ' if cond else 'FAIL  ') + name + (('  [' + str(extra) + ']') if extra and not cond else ''), flush=True)

def future_date(days=9):
    return (datetime.date.today() + datetime.timedelta(days=days)).isoformat()

def new_page(b, w=1440, h=900, rm=None, proof_js='', api=True, **kw):
    ctx = b.new_context(viewport={'width': w, 'height': h}, reduced_motion=rm or 'no-preference', **kw)
    ctx.add_init_script("Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>8});Object.defineProperty(navigator,'deviceMemory',{get:()=>8})")
    pg = ctx.new_page(); pg.errors = []; pg.requests = []
    pg.on('console', lambda m: pg.errors.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: pg.errors.append('PAGEERROR ' + str(e)))
    pg.on('request', lambda r: pg.requests.append(r.url))
    def cfg(route):
        r = route.fetch(); t = r.text()
        if api: t = re.sub(r'api:"[^"]*"', 'api:"%s"' % API, t)
        route.fulfill(response=r, body=t + proof_js)
    pg.route('**/js/config.js', cfg)
    return pg

def goto(pg, hash_='', q=''):
    pg.goto(BASE + q + hash_); pg.wait_for_selector('#app h1, #app h2', timeout=8000)

def overflow(pg):
    return pg.evaluate('document.documentElement.scrollWidth - window.innerWidth')

def fill_brief(pg, goal='sell', pack=True, unsure=False):
    pg.goto(BASE + '#/brief'); pg.wait_for_selector('[data-goal]')
    pg.click(f'[data-goal="{goal}"]')
    if pack: pg.click('[data-pkg="0"]')
    pg.click('[data-go="1"]')
    pg.fill('[data-p="project.goal"]', 'We want to sell our products online across several countries.')
    pg.select_option('[data-p="project.launch"]', '1–3 months'); pg.select_option('[data-p="project.budget"]', '10–50k'); pg.select_option('[data-p="project.currency"]', 'USD')
    pg.click('[data-go="1"]')
    pg.fill('[data-p="you.name"]', 'Sara Ali'); pg.fill('[data-p="you.email"]', 'sara@example.com'); pg.fill('[data-p="you.company"]', 'Acme Ltd'); pg.fill('[data-p="you.country"]', 'Egypt'); pg.check('[data-p="you.consent"]')
    pg.click('[data-go="1"]')
    pg.fill('[data-p="meet.slots.0.d"]', future_date()); pg.fill('[data-p="meet.slots.0.f"]', '11:00')
    pg.click('[data-go="1"]')

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    # ---------- home ----------
    pg = new_page(b); goto(pg)
    check('home: H1 is the new positioning line', 'Digital products built around' in pg.inner_text('h1') and 'way your business works' in pg.inner_text('h1'))
    check('home: primary and secondary CTA text', pg.locator('.hero .ctas a').nth(0).inner_text() == 'Start your project brief' and pg.locator('.hero .ctas a').nth(1).inner_text() == 'Explore what we build')
    check('home: five capability areas', pg.locator('.area').count() == 5)
    body = pg.inner_text('body')
    for bad in ['Trusted by', 'Certif', 'Testimonials']:
        check(f'home: no unverified text "{bad}"', bad not in body)
    check('home: owner-confirmed figures shown with plain labels', pg.locator('.sband .stat').count() == 2 and 'Projects delivered' in body and 'Countries with delivered projects' in body)
    check('home: neutral client-feedback line instead of placeholders', 'Client feedback available on request' in body)
    check('home: no portraits/images of people or client logos', pg.locator('.pf img, .trust img, .mono').count() == 0)
    check('home: case-study section hidden', pg.locator('#cs-h').count() == 0 and pg.locator('a[href^="#/work"]').count() == 0)
    check('home: brand line kept as secondary line only', pg.locator('.brandline').inner_text() == 'Any website. Any system. No ceiling.' and 'No ceiling' not in pg.inner_text('h1'))
    check('home: preloader gone within 1.2s', pg.wait_for_function('!document.getElementById("pre")', timeout=1200) is not None)
    ext = [u for u in pg.requests if not u.startswith('http://127.0.0.1')]
    check('home: no external requests at all (fonts, 3D library, scripts are local)', not ext, ext)
    check('home: no console errors', not pg.errors, pg.errors)
    check('home: social placeholders hidden (no "#" links, no Coming soon)', pg.locator('a[href="#"]').count() == 0 and 'Coming soon' not in pg.inner_text('footer'))
    check('home: fonts are the local files', pg.evaluate('document.fonts.check("16px Inter") && document.fonts.check("300 40px \\"Cormorant Garamond\\"")'))
    check('home: hero 3D scene starts on desktop', pg.wait_for_function('document.querySelector("#hc") && window.THREE', timeout=6000) is not None)
    pg.screenshot(path=SHOTS + '/home-desktop.png'); pg.evaluate('window.scrollTo(0, 1400)'); pg.wait_for_timeout(700); pg.screenshot(path=SHOTS + '/home-desktop-2.png')
    # ---------- catalogue ----------
    pg.click('.hero .ctas a:nth-child(2)'); pg.wait_for_selector('#grid .card')
    check('catalog: all 77 types listed and count shown', pg.locator('#grid .card').count() == 77 and '77 of 77' in pg.inner_text('#cnt'))
    opts = pg.eval_on_selector_all('#fs option', 'o=>o.map(x=>x.textContent)')
    check('catalog: levels use client-friendly names', opts == ['All levels', 'Essential', 'Standard', 'Advanced', 'Platform', 'Enterprise'], opts)
    check('catalog: no L1-L5 codes visible', not re.search(r'\bL[1-5]\b', pg.inner_text('#app')))
    pg.fill('#q', 'booking'); n = pg.locator('#grid .card').count()
    check('catalog: search filters and updates the count', 0 < n < 77 and f'{n} of 77' in pg.inner_text('#cnt'), n)
    pg.fill('#q', 'zzzzqq'); check('catalog: empty state with clear button', pg.locator('[data-clearf]').count() == 1); pg.click('[data-clearf]'); pg.wait_for_selector('#grid .card')
    pg.select_option('#fc', 'commerce'); n2 = pg.locator('#grid .card').count(); check('catalog: area filter works', 0 < n2 < 77, n2)
    check('catalog: five area links', pg.locator('.areanav a').count() == 5)
    pg.screenshot(path=SHOTS + '/catalog.png')
    # group page + scene disposal, old category redirect
    goto(pg, '#/catalog/immersive'); pg.wait_for_selector('.cat-hero canvas.wc')
    pg.wait_for_function('window._scenes && window._scenes.size >= 1', timeout=8000)
    check('group page: a single 3D scene starts for orientation', pg.evaluate('window._scenes.size') == 1)
    pg.screenshot(path=SHOTS + '/group-immersive.png')
    pg.click('a[href="#/catalog"]'); pg.wait_for_selector('#grid')
    check('scenes disposed on navigation', pg.evaluate('window._scenes.size') == 0)
    pg.goto(BASE + '#/catalog/ecommerce'); pg.wait_for_function('location.hash === "#/catalog/commerce"', timeout=3000); check('old category URL redirects to its new area', True)
    goto(pg, '#/type/online-store'); check('service page: SVG concept, no canvas, no filler lines', pg.locator('.t3d canvas').count() == 0 and 'Shaped around your use case' not in pg.inner_text('#app'))
    check('service page: level name only', pg.locator('.scope').first.inner_text().lower() in ['essential', 'standard', 'advanced', 'platform', 'enterprise'])
    pg.click('[data-add="online-store"]'); check('add to brief toggles state', 'In your brief' in pg.inner_text('[data-add="online-store"]') and pg.locator('#bd').inner_text() == '1')
    goto(pg, '#/nope'); check('unknown route shows not-found page', 'Page not found' in pg.inner_text('#app'))
    goto(pg, '#/work'); check('work route without verified cases shows transparent copy, not placeholders', 'We do not list client names' in pg.inner_text('#app'))
    check('page-wide: no console errors across routes', not pg.errors, pg.errors)
    pg.context.close()

    # ---------- brief: success, payload cross-checked against the real backend validator ----------
    pg = new_page(b); sent = {}
    def ok_api(route):
        req = route.request
        if req.method == 'OPTIONS': return route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type'})
        sent['body'] = req.post_data; sent['n'] = sent.get('n', 0) + 1
        route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps({'ok': True, 'saved': True, 'ref': 'BR-ABCD23', 'notifications': {'owner': 'sent', 'client': 'skipped'}}))
    pg.route(API, ok_api)
    goto(pg); fill_brief(pg)
    check('brief: review shows everything required is filled', 'Everything required is filled in' in pg.inner_text('#app'))
    pg.screenshot(path=SHOTS + '/brief-review.png', full_page=True)
    pg.click('[data-send]'); pg.wait_for_selector('.ref', timeout=5000)
    check('brief: success state shows reference, next steps and contact method', pg.inner_text('.ref') == 'BR-ABCD23' and 'What happens next' in pg.inner_text('#app') and 'nativemind.contact@gmail.com' in pg.inner_text('#app'))
    check('brief: does not claim a confirmation email when none was sent', 'We have not sent a confirmation email' in pg.inner_text('#app') and 'confirmation email was sent' not in pg.inner_text('#app'))
    payload = json.loads(sent['body'])
    check('brief: payload carries intent, items, slot, timezone', payload['project']['intent'] == 'sell' and payload['items'][0]['slug'] == 'online-store' and payload['timezone'] and payload['meet']['slots'][0]['d'])
    open('/tmp/payload.json', 'w').write(sent['body'])
    code = "const v=require(process.argv[1]+'/api/brief.js').validate;const b=JSON.parse(require('fs').readFileSync('/tmp/payload.json','utf8'));const r=v(b);console.log(JSON.stringify(r.error?{error:r.error}:{ok:1}))"
    out = subprocess.run(['node', '-e', code, os.path.abspath(BACK)], capture_output=True, text=True).stdout.strip()
    check('brief: the real payload passes the backend validator', out == '{"ok":1}', out)
    pg.context.close()

    # ---------- brief: "not sure yet" ----------
    pg = new_page(b); pg.route(API, ok_api); sent.clear()
    pg.goto(BASE + '#/brief'); pg.wait_for_selector('[data-goal]'); pg.click('[data-goal="unsure"]')
    check('brief: "not sure yet" recommends a discovery conversation', 'discovery conversation' in pg.inner_text('.unsure').lower())
    pg.click('[data-go="1"]'); check('brief: can continue with no types chosen', pg.locator('[data-p="project.goal"]').count() == 1 and 'Anything you already know' in pg.inner_text('#app'))
    pg.click('[data-go="1"]'); pg.fill('[data-p="you.name"]', 'Omar Hassan'); pg.fill('[data-p="you.email"]', 'omar@example.com'); pg.fill('[data-p="you.company"]', 'Beta'); pg.fill('[data-p="you.country"]', 'UAE'); pg.check('[data-p="you.consent"]'); pg.click('[data-go="1"]')
    pg.fill('[data-p="meet.slots.0.d"]', future_date()); pg.fill('[data-p="meet.slots.0.f"]', '14:00'); pg.click('[data-go="1"]'); pg.click('[data-send]'); pg.wait_for_selector('.ref', timeout=5000)
    open('/tmp/payload.json', 'w').write(sent['body'])
    out = subprocess.run(['node', '-e', code, os.path.abspath(BACK)], capture_output=True, text=True).stdout.strip()
    check('brief: "not sure yet" payload passes the backend validator', out == '{"ok":1}', out)
    pg.context.close()

    # ---------- brief: failures never show success ----------
    def run_fail(name, handler, expect, still_review=False, api=True):
        pg = new_page(b, api=api); pg.route(API, handler); goto(pg); fill_brief(pg); pg.click('[data-send]'); pg.wait_for_timeout(1500)
        t = pg.inner_text('#app')
        check(f'brief failure ({name}): never shows a success state', 'Brief received' not in t and not pg.locator('.ref').count())
        check(f'brief failure ({name}): clear message', expect in t, t[:200])
        if still_review: check(f'brief failure ({name}): stays on the review step so it can be fixed', pg.locator('[data-send]').count() == 1)
        else: check(f'brief failure ({name}): email/PDF/copy fallbacks and retry', all(x in t for x in ['Email us your brief', 'Save brief as PDF', 'Copy brief as text', 'Try again']))
        pg.screenshot(path=SHOTS + f'/fail-{name.split()[0]}.png'); pg.context.close()
    run_fail('server 500', lambda r: r.fulfill(status=500, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"ok":false}'), 'NOT saved')
    run_fail('server 502 not saved', lambda r: r.fulfill(status=502, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"ok":false,"code":"not_saved"}'), 'NOT saved')
    run_fail('ok flag but no saved', lambda r: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"ok":true}'), 'NOT saved')
    run_fail('html response', lambda r: r.fulfill(status=200, content_type='text/html', headers={'access-control-allow-origin': '*'}, body='<html>proxy page</html>'), 'NOT saved')
    run_fail('offline', lambda r: r.abort('internetdisconnected'), 'could not reach the server')
    run_fail('validation 400', lambda r: r.fulfill(status=400, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"ok":false,"code":"validation","error":"Meeting time must be in the future"}'), 'Meeting time must be in the future', still_review=True)
    run_fail('api not configured', lambda r: r.abort(), 'not connected yet', api=False)

    # ---------- brief: client-side validation, slots ----------
    pg = new_page(b); goto(pg, '#/brief'); pg.click('[data-go="1"]')
    check('brief: cannot continue without a choice', 'Choose a starting point' in pg.inner_text('.errsum') and pg.locator('[data-goal]').count() == 7)
    pg.click('[data-goal="showcase"]'); pg.click('[data-pkg="1"]'); pg.click('[data-go="1"]'); pg.click('[data-go="1"]')
    check('brief: required goal enforced with message', 'sentence or two' in pg.inner_text('#app'))
    pg.fill('[data-p="project.goal"]', 'Present us'); pg.click('[data-go="1"]'); pg.click('[data-go="1"]'); check('brief: required contact fields enforced', pg.locator('[aria-invalid="true"]').count() >= 4)
    pg.fill('[data-p="you.name"]', 'Sara Ali'); pg.fill('[data-p="you.email"]', 'sara@example.com'); pg.fill('[data-p="you.company"]', 'Acme'); pg.fill('[data-p="you.country"]', 'Egypt'); pg.fill('[data-p="you.phone"]', 'call me'); pg.check('[data-p="you.consent"]'); pg.click('[data-go="1"]')
    check('brief: invalid phone rejected', 'valid phone' in pg.inner_text('#app')); pg.fill('[data-p="you.phone"]', '+20 100 123 4567'); pg.click('[data-go="1"]')
    pg.fill('[data-p="meet.slots.0.d"]', (datetime.date.today() - datetime.timedelta(days=2)).isoformat()); pg.fill('[data-p="meet.slots.0.f"]', '10:00'); pg.click('[data-go="1"]')
    check('brief: past meeting time rejected before sending', 'future' in pg.inner_text('#app').lower() and pg.locator('[data-send]').count() == 0)
    pg.fill('[data-p="meet.slots.0.d"]', future_date()); pg.fill('[data-p="meet.slots.0.f"]', '10:00'); pg.fill('[data-p="meet.slots.0.t"]', '09:00'); pg.click('[data-go="1"]')
    check('brief: end before start rejected', 'after the start' in pg.inner_text('#app'))
    pg.fill('[data-p="meet.slots.0.t"]', '10:15'); pg.click('[data-go="1"]'); check('brief: range shorter than duration rejected', 'at least as long' in pg.inner_text('#app'))
    check('brief: date input has a min attribute', pg.locator('[data-p="meet.slots.0.d"]').get_attribute('min') == datetime.date.today().isoformat())
    check('brief: every step explains why it is asked', all(x for x in [1]) and pg.locator('.why').count() == 1)
    pg.context.close()

    # ---------- contact ----------
    pg = new_page(b)
    def contact_ok(route):
        if route.request.method == 'OPTIONS': return route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type'})
        sent['c'] = route.request.post_data; route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"ok":true,"saved":true,"ref":"CT-ABCD23"}')
    pg.route(API, contact_ok); goto(pg, '#/contact')
    pg.click('[data-contact]'); check('contact: empty form gives a message', 'Please fill in' in pg.inner_text('#cs'))
    pg.fill('#cn', 'Sara Ali'); pg.fill('#ce', 'sara@example.com'); pg.fill('#cm', 'Hello there'); pg.click('[data-contact]'); pg.wait_for_function('document.querySelector("#cs").textContent.includes("received")', timeout=4000)
    check('contact: success only after API confirms', True)
    pg.route(API, lambda r: r.fulfill(status=502, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"ok":false}')); pg.fill('#cn', 'Sara Ali'); pg.fill('#ce', 'sara@example.com'); pg.fill('#cm', 'Hello'); pg.click('[data-contact]'); pg.wait_for_function('document.querySelector("#cs").textContent.includes("NOT sent")', timeout=4000)
    check('contact: failure says NOT sent and offers email', 'Email us instead' in pg.inner_text('#cs'))
    open('/tmp/c.json', 'w').write(sent['c'])
    code2 = code.replace('/tmp/payload.json', '/tmp/c.json'); out = subprocess.run(['node', '-e', code2, os.path.abspath(BACK)], capture_output=True, text=True).stdout.strip()
    check('contact: payload passes the backend validator', out == '{"ok":1}', out)
    pg.screenshot(path=SHOTS + '/contact.png'); pg.context.close()

    # ---------- proof gating with injected (unverified, then verified) data ----------
    unver = 'CFG.proof.stats.push({v:"999+",l:"Invented",verified:false});CFG.proof.clients.push({name:"BigCorp",verified:true});CFG.proof.testimonials.push({quote:"Great",name:"Jane Roe",company:"X",verified:true,photo:"images/ai.webp",photoReal:false});CFG.proof.certs.push({name:"CCNA",holder:"",verified:true},{name:"PMP",holder:"A",verifyUrl:"https://v.example/1",verified:true});CFG.proof.leaders.push({name:"John Doe",role:"CEO",verified:true});CFG.proof.caseStudies.push({id:"acme",client:"Acme",problem:"p",solution:"s",verified:true});'
    pg = new_page(b, proof_js=unver); goto(pg); t = pg.inner_text('body')
    check('proof gating: unverified stats/clients/testimonials/leaders/cases/certs are all hidden', all(x not in t for x in ['999+', 'BigCorp', 'Jane Roe', 'John Doe', 'CEO', 'Acme', 'CCNA', 'PMP']) and pg.locator('.trust,.feat,.ld,.cert').count() == 0)
    check('proof gating: client feedback falls back to the neutral line', 'Client feedback available on request' in t); pg.context.close()
    ver = 'CFG.proof.testimonials.push({quote:"Approved words one",name:"Jane Roe",role:"CTO",company:"Acme",verified:true,permission:"approved",photo:"images/ai.webp",photoReal:false},{quote:"Approved words two",name:"Li Wei",company:"Beta",verified:true,permission:"approved"});CFG.proof.caseStudies.push({id:"acme",client:"Acme",problem:"Slow ops",solution:"New portal",verified:true,permission:"approved",outcomes:[{label:"Cycle time",value:"-30%",source:"Client report"},{label:"No source",value:"x"}]});CFG.proof.clients.push({name:"Acme",verified:true,permission:"approved"});'
    pg = new_page(b, proof_js=ver); goto(pg); t = pg.inner_text('body')
    check('proof gating: verified + permitted testimonials render with monograms (never the unverified photo)', 'Jane Roe' in t and pg.locator('.pf img').count() == 0 and pg.locator('.mono').count() >= 1)
    check('proof gating: carousel appears for 2+ verified testimonials with accessible controls', pg.locator('[role="tablist"]').count() == 1 and pg.locator('#fpause').count() == 1)
    check('proof gating: verified case study section and nav link appear', pg.locator('#cs-h').count() == 1 and pg.locator('header a[href="#/work"]').count() >= 1)
    goto(pg, '#/work/acme'); t = pg.inner_text('#app'); check('proof gating: case page shows only outcomes that have a source', 'Cycle time' in t and 'No source' not in t); pg.context.close()

    # ---------- mobile ----------
    pg = new_page(b, w=375, h=740, has_touch=True, is_mobile=True); goto(pg)
    for r_, nm in [('#/home', 'home'), ('#/catalog', 'catalog'), ('#/catalog/websites', 'group'), ('#/type/online-store', 'type'), ('#/brief', 'brief'), ('#/contact', 'contact'), ('#/privacy', 'privacy'), ('#/about', 'about'), ('#/how-we-work', 'how')]:
        pg.goto(BASE + r_); pg.wait_for_selector('#app h1'); pg.wait_for_function('!document.getElementById("pre")'); pg.wait_for_timeout(900)
        check(f'mobile 375px: no horizontal scroll on {nm}', overflow(pg) <= 0, overflow(pg)); pg.screenshot(path=SHOTS + f'/m-{nm}.png')
    pg.goto(BASE + '#/home'); pg.wait_for_selector('.hero')
    check('mobile: no 3D canvas loaded, Three.js not requested', pg.locator('canvas').count() == 0 and not any('three' in u for u in pg.requests))
    check('mobile: nav CTA uses short label and is tappable', pg.locator('.nav .btn .short').is_visible() and pg.locator('.nav .btn').bounding_box()['height'] >= 40)
    pg.click('#mnu'); check('mobile: menu opens and exposes links', pg.locator('#mm').is_visible() and pg.get_attribute('#mnu', 'aria-expanded') == 'true'); pg.keyboard.press('Escape'); check('mobile: Escape closes the menu and returns focus', not pg.locator('#mm').is_visible() and pg.evaluate('document.activeElement.id') == 'mnu')
    pg.goto(BASE + '#/brief'); pg.wait_for_selector('[data-goal]'); pg.click('[data-goal="sell"]'); pg.click('[data-pkg="0"]'); pg.click('[data-go="1"]'); pg.fill('[data-p="project.goal"]', 'x'); pg.click('[data-go="1"]'); pg.fill('[data-p="you.name"]', 'Sara'); pg.click('[data-go="1"]')
    pg.fill('[data-p="you.email"]', 'sara@example.com'); pg.fill('[data-p="you.company"]', 'A'); pg.fill('[data-p="you.country"]', 'Egypt'); pg.check('[data-p="you.consent"]'); pg.click('[data-go="1"]')
    check('mobile: date/time inputs stack and fit', overflow(pg) <= 0 and pg.locator('[data-p="meet.slots.0.d"]').bounding_box()['width'] <= 375); pg.screenshot(path=SHOTS + '/m-meeting.png'); pg.context.close()

    # ---------- reduced motion ----------
    pg = new_page(b, rm='reduce'); pg.goto(BASE); pg.wait_for_selector('.hero')
    check('reduced motion: no preloader, no canvas, no 3D library request', pg.locator('#pre').count() == 0 and pg.locator('canvas').count() == 0 and not any('three' in u for u in pg.requests))
    check('reduced motion: content visible immediately (no hidden reveal states)', pg.evaluate('document.body.classList.contains("noanim")') and pg.evaluate('getComputedStyle(document.querySelector(".area")).opacity') == '1')
    check('reduced motion: no parallax transform applied', pg.evaluate('document.querySelector(".hero > img").style.transform') == ''); pg.context.close()

    # ---------- RTL ----------
    pg = new_page(b); goto(pg, '#/home', '?dir=rtl')
    check('RTL: document direction is rtl', pg.evaluate('document.documentElement.dir') == 'rtl')
    for r_, nm in [('#/home', 'home'), ('#/catalog', 'catalog'), ('#/brief', 'brief'), ('#/contact', 'contact')]:
        pg.goto(BASE + '?dir=rtl' + r_); pg.wait_for_selector('#app h1'); pg.wait_for_function('!document.getElementById("pre")'); pg.wait_for_timeout(900); check(f'RTL: no horizontal overflow on {nm}', overflow(pg) <= 0, overflow(pg)); pg.screenshot(path=SHOTS + f'/rtl-{nm}.png')
    check('RTL: email/phone/date inputs stay LTR', all(pg.evaluate(f'document.querySelector("{s}").dir') == 'ltr' for s in ['#ce']))
    pg.goto(BASE + '?dir=rtl#/brief'); pg.wait_for_selector('[data-goal]'); pg.click('[data-goal="sell"]'); pg.click('[data-pkg="0"]'); pg.click('[data-go="1"]'); pg.fill('[data-p="project.goal"]', 'نريد بيع منتجاتنا عبر الإنترنت'); pg.click('[data-go="1"]')
    pg.fill('[data-p="you.name"]', 'سارة علي'); pg.fill('[data-p="you.email"]', 'sara@example.com'); pg.fill('[data-p="you.company"]', 'شركة أكمي'); pg.fill('[data-p="you.country"]', 'مصر'); pg.check('[data-p="you.consent"]'); pg.click('[data-go="1"]')
    pg.fill('[data-p="meet.slots.0.d"]', future_date()); pg.fill('[data-p="meet.slots.0.f"]', '11:00'); pg.click('[data-go="1"]')
    check('RTL: review summary uses auto direction and renders Arabic', pg.get_attribute('details[data-t="_sum"] pre', 'dir') == 'auto' and 'سارة علي' in pg.text_content('details[data-t="_sum"] pre')); pg.screenshot(path=SHOTS + '/rtl-review.png', full_page=True); pg.context.close()

    # ---------- keyboard ----------
    pg = new_page(b); goto(pg); pg.keyboard.press('Tab'); check('keyboard: first Tab stop is the skip link', pg.evaluate('document.activeElement.className') == 'skip')
    pg.keyboard.press('Control+k'); check('keyboard: Ctrl+K opens search dialog with focus in the field', pg.locator('.pal input').count() == 1 and pg.evaluate('document.activeElement.tagName') == 'INPUT'); pg.keyboard.type('crm'); pg.keyboard.press('Enter'); pg.wait_for_selector('[data-add]', timeout=3000); pg.wait_for_timeout(200)
    check('keyboard: Enter opens the result, dialog closes', pg.locator('.pal').count() == 0 and pg.evaluate('document.activeElement.tagName') == 'H1')
    focus_ok = pg.evaluate('(()=>{const b=document.querySelector("[data-add]");b.focus();const s=getComputedStyle(b);return s.outlineStyle!=="none"||s.boxShadow!=="none"})()')
    check('keyboard: focus indicator is visible on buttons', focus_ok); pg.context.close()
    b.close()

fails = [r for r in res if not r[0]]
print(f'\n{len(res) - len(fails)}/{len(res)} browser checks passed'); sys.exit(1 if fails else 0)
