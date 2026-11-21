#!/usr/bin/env python3
"""Browser test for the autosaving brief (signed-in clients) with a MOCK Supabase. No real network, no real keys.
Run in ONE command:  (python3 -m http.server 8765 >/dev/null 2>&1 & sleep 1; python3 tools/brief-test.py)"""
import json, re, sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
calls = []; fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
ST = {'role': 'client', 'status': 'active', 'br': None, 'fail': False, 'lock': False}
def reset_state(): ST.update({'role': 'client', 'status': 'active', 'br': None, 'fail': False, 'lock': False})
def sb(route, req):
    u = req.url; m = req.method
    if m == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    body = {}
    try: body = req.post_data_json or {}
    except Exception: pass
    path = re.sub(r'^https://[^/]+', '', u); calls.append((m, path, body, req.headers.get('authorization'), req.headers.get('prefer')))
    def j(s, d): route.fulfill(status=s, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(d))
    if '/auth/v1/logout' in u: return route.fulfill(status=204, headers=CORS)
    if 'grant_type=refresh_token' in u: return j(200, {'access_token': 'at2', 'refresh_token': 'rt', 'expires_in': 3600, 'user': {'id': 'u1', 'email': 't@example.com'}})
    if '/rest/v1/profiles' in u: return j(200, [{'full_name': 'Test Client', 'role': ST['role'], 'status': ST['status'], 'email': 't@example.com'}])
    if '/rest/v1/clients' in u: return j(200, [{'company': 'Acme', 'country': 'Egypt', 'phone': None}])
    if '/rest/v1/client_briefs' in u:
        if m == 'GET': return j(200, [ST['br']] if ST['br'] else [])
        if ST['fail']: return j(500, {'message': 'boom'})
        if m == 'POST':
            ST['br'] = {'id': 'b1', 'ref': 'CB-ABCD1234', 'status': 'draft', 'answers': {}, 'selected_types': [], 'updated_at': 'x', 'submitted_at': None, **{k: v for k, v in body.items()}}
            ST['br']['status'] = 'draft'; return j(201, [ST['br']])
        if m == 'PATCH':
            if ST['lock'] or not ST['br']: return j(200, [])
            ST['br'].update(body)
            if body.get('status') == 'submitted': ST['br']['submitted_at'] = '2026-11-21T10:00:00Z'
            return j(200, [ST['br']])
    return j(200, [])
SESSION = {'access_token': 'at', 'refresh_token': 'rt', 'expires_at': 4102444800, 'user': {'id': 'u1', 'email': 't@example.com'}}
TS = "window.turnstile={render:function(){return 1},getResponse:function(){return 'T'},reset:function(){}};"
def writes(since=0): return [c for c in calls[since:] if c[0] in ('POST', 'PATCH') and '/client_briefs' in c[1]]
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 800}); errs = []
    ctx.route(re.compile(r'https://[a-z0-9]+\.supabase\.co/.*'), sb)
    ctx.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r, q: r.fulfill(status=200, content_type='application/javascript', body=TS))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:150]))
    w = lambda ms=400: pg.wait_for_timeout(ms)
    sign_in = lambda: (pg.goto(BASE), pg.evaluate("s=>localStorage.setItem('culmera.session',JSON.stringify(s))", SESSION))
    # 1 visitor: public flow intact + invitation to create an account
    pg.goto(BASE + '#/brief'); w()
    t = pg.inner_text('#bp')
    ok('Save your brief automatically' in t and pg.locator('a[href="#/signup"]').count() >= 1, 'visitor sees the invitation to create an account')
    ok(pg.locator('.st li').count() == 5 and pg.locator('[data-goal="sell"]').count() == 1, 'visitor still gets the 5-step public wizard')
    ok(not any('/client_briefs' in c[1] for c in calls), 'visitor never touches client_briefs')
    # 2 signed-in client without a brief
    sign_in(); pg.goto(BASE + '#/brief'); pg.wait_for_selector('[data-goal="sell"]', timeout=4000); w()
    ok(pg.locator('.st li').count() == 3, 'signed-in client gets 3 steps (no You / Meeting)')
    ok('Save your brief automatically' not in pg.inner_text('#bp'), 'no sign-up invitation for a signed-in client')
    n = len(calls); w(1600); ok(not writes(n), 'no empty draft is created just by opening the page')
    # 3 first choice creates the draft after the debounce
    pg.click('[data-goal="sell"]'); n = len(calls); w(300); ok(not writes(n), 'save waits for the debounce')
    w(1800); wr = writes(n)
    ok(len(wr) == 1 and wr[0][0] == 'POST', 'first change creates one draft (POST)')
    c = wr[0]; ok(c[3] == 'Bearer at' and c[4] == 'return=representation', 'draft is written with the user token')
    ok(c[2]['status'] == 'draft' and c[2]['client_id'] == 'u1' and c[2]['locale'] == 'en', 'draft body: status draft, own client_id, locale')
    ok(c[2]['answers']['project']['intent'] == 'sell' and c[2]['answers']['v'] == 1, 'answers store the stable option value "sell"')
    ok('role' not in json.dumps(c[2]) and 'you' not in c[2]['answers'] and 'meet' not in c[2]['answers'], 'no role, contact data or meeting inside answers')
    ok('Sell online' not in json.dumps(c[2]), 'translated labels are never stored')
    ok('saved' in pg.inner_text('#svst').lower(), 'status line says changes are saved')
    # 4 package -> PATCH with slugs
    n = len(calls); pg.click('[data-pkg="1"]'); w(1900); wr = writes(n)
    ok(len(wr) == 1 and wr[0][0] == 'PATCH' and 'id=eq.b1' in wr[0][1], 'next change updates the same draft (PATCH)')
    ok('online-store' in wr[0][2]['selected_types'] and 'status' not in wr[0][2], 'selected_types are slugs; status is not touched by autosave')
    # 5 debounce: many keystrokes -> one request
    pg.click('[data-step="2"]'); w(); n = len(calls); pg.click('[data-p="project.goal"]'); pg.keyboard.type('We sell handmade rugs worldwide', delay=20); w(1900)
    ok(len(writes(n)) == 1, 'typing sends one request, not one per key')
    ok(ST['br']['answers']['project']['goal'] == 'We sell handmade rugs worldwide', 'goal text reached the (mock) database')
    # 6 reload: server copy comes back
    pg.reload(); pg.wait_for_selector('[data-goal="sell"]', timeout=4000); w(); pg.click('[data-step="2"]'); w()
    ok(pg.input_value('[data-p="project.goal"]') == 'We sell handmade rugs worldwide', 'after reload the saved brief is restored')
    # 7 server failure -> clear message + retry
    ST['fail'] = True; pg.fill('[data-p="project.goal"]', 'We sell handmade rugs worldwide, now in 12 countries'); w(1800)
    ok('Not saved yet' in pg.inner_text('#svst'), 'failed save is shown honestly, not hidden')
    ST['fail'] = False; pg.wait_for_selector('#svretry:not([hidden])', timeout=3000); n0 = len(calls); pg.click('#svretry'); w(2500)
    ok('saved' in pg.inner_text('#svst').lower() and '12 countries' in ST['br']['answers']['project']['goal'], 'retry succeeds and the text is saved')
    # 8 submit
    pg.click('[data-go="1"]'); pg.wait_for_selector('[data-send]', timeout=3000)
    ok(pg.locator('#ts').count() == 0, 'no Turnstile on the signed-in submit (the account is the protection)')
    n = len(calls); pg.click('[data-send]'); pg.wait_for_selector('text=Brief submitted', timeout=4000); wr = writes(n)
    ok(any(c[0] == 'PATCH' and c[2].get('status') == 'submitted' for c in wr), 'submit moves status draft -> submitted')
    ok(not any(c[2].get('status') not in (None, 'draft', 'submitted') for c in wr), 'client never sends any other status')
    ok('CB-ABCD1234' in pg.inner_text('.ref') and 'info@culmera-solutions.com' in pg.inner_text('.done'), 'success screen shows the reference and contact email')
    ok('/api/brief' not in ' '.join(c[1] for c in calls), 'signed-in submit does not use the public /api/brief')
    # 9 edit after submit: allowed, no status in body
    pg.goto(BASE + '#/account'); w(600); pg.goto(BASE + '#/brief'); pg.wait_for_selector('[data-goal="sell"]', timeout=4000); w()
    ok('Submitted on' in pg.inner_text('#bp'), 'submitted brief shows a clear note that edits are still saved')
    pg.click('[data-step="2"]'); w(); n = len(calls)
    pg.click('summary:has-text("Advanced")'); pg.fill('[data-p="project.industry"]', 'Retail'); w(1900); wr = writes(n)
    ok(len(wr) == 1 and 'status' not in wr[0][2], 'edit after submit saves answers only')
    # 10 team moved it on: read-only
    ST['br']['status'] = 'in_review'; pg.reload(); pg.wait_for_selector('[data-newbrief]', timeout=4000)
    ok('In review' in pg.inner_text('#bp') and pg.locator('[data-goal]').count() == 0, 'brief in review is read-only with its status')
    n = len(calls); pg.click('[data-newbrief]'); w(1600); ok(not writes(n), 'starting a new brief does not create an empty row')
    pg.click('[data-goal="showcase"]'); w(1900); wr = writes(n)
    ok(len(wr) == 1 and wr[0][0] == 'POST' and ST['br']['id'] == 'b1', 'first change in a new brief creates a new draft')
    # 11 RLS says 0 rows because the team moved the brief on meanwhile -> read-only view, no endless retries
    ST['lock'] = True; ST['br']['status'] = 'in_review'; n = len(calls); pg.click('[data-pkg="0"]'); w(2600)
    ok(pg.locator('[data-newbrief]').count() == 1 and pg.locator('[data-goal]').count() == 0, 'brief locked by the team during editing switches to the read-only view')
    ok(len(writes(n)) <= 2, 'no retry loop after a rejected update (%d writes)' % len(writes(n)))
    # 11b rejected updates with no status change: bounded, then an honest error
    ST['br']['status'] = 'draft'; pg.reload(); pg.wait_for_selector('.st', timeout=4000); w(); n = len(calls); pg.click('[data-goal="ai"]'); w(5000)
    ok(len(writes(n)) <= 4 and 'Not saved' in pg.inner_text('#svst'), 'repeated rejection stops and shows "Not saved" (%d writes)' % len(writes(n)))
    ST['lock'] = False
    # 12 hostile server data is cleaned and escaped
    reset_state(); ST['br'] = {'id': 'b9', 'ref': 'CB-HOSTILE1', 'status': 'draft', 'updated_at': 'x', 'submitted_at': None, 'selected_types': [],
        'answers': {'v': 1, 'project': {'intent': 'hack', 'goal': '<img src=x onerror=window.__x=1>' + 'A' * 5000, 'budget': 'free'}, 'refine': {'who': 'bad'},
        'items': {'online-store': {'mods': {'nope': 1, 'Payments': 9}, 'users': ['Customers', 'evil'], 'text': '<script>window.__y=1</script>'}, 'not-a-type': {'text': 'x'}}}}
    pg.evaluate("localStorage.removeItem('culmera.brief');localStorage.removeItem('culmera.brief.sync')"); pg.goto(BASE + '#/brief'); pg.reload(); pg.wait_for_selector('.st', timeout=4000); w()
    pg.click('[data-step="2"]'); w()
    ok(pg.evaluate('window.__x') is None and pg.evaluate('window.__y') is None, 'no script or HTML from stored answers runs')
    ok(len(pg.input_value('[data-p="project.goal"]')) <= 2000, 'oversized stored text is trimmed')
    ok(pg.evaluate("Object.keys(JSON.parse(localStorage['culmera.brief']).items).join()") == 'online-store', 'unknown types from the server are dropped')
    # 13 first time on a device: local catalogue picks merge with the server draft
    reset_state(); ST['br'] = {'id': 'b2', 'ref': 'CB-MERGE001', 'status': 'draft', 'updated_at': 'x', 'submitted_at': None, 'selected_types': ['landing-page'], 'answers': {'v': 1, 'project': {'goal': 'From server'}, 'refine': {}, 'items': {'landing-page': {}}}}
    pg.evaluate("localStorage.setItem('culmera.brief',JSON.stringify({items:{'online-store':{}}}));localStorage.removeItem('culmera.brief.sync')"); pg.reload(); w(); n = len(calls); pg.goto(BASE + '#/brief'); pg.reload(); pg.wait_for_selector('.st', timeout=4000); w(2200)
    mrg = ST['br']['answers']['items']; ok('landing-page' in mrg and 'online-store' in mrg, 'local picks and the server draft are merged, nothing lost')
    # 14 staff roles do not get a client brief
    reset_state(); ST['role'] = 'partner'; n = len(calls); pg.goto(BASE + '#/brief'); pg.reload(); pg.wait_for_selector('text=Briefs are for client accounts', timeout=4000); w(1500)
    ok(not writes(n), 'staff accounts never write client briefs')
    # 15 sign-out wipes the local draft
    reset_state(); pg.goto(BASE + '#/account'); pg.wait_for_selector('[data-so]', timeout=4000); pg.click('[data-so]'); pg.wait_for_selector('#fin', timeout=4000)
    ok(pg.evaluate("localStorage.getItem('culmera.brief')") is None and pg.evaluate("localStorage.getItem('culmera.session')") is None, 'sign-out removes session and local brief draft')
    ok(not any('service_role' in json.dumps(c) or 'sb_secret' in json.dumps(c) for c in calls), 'no secret key in any request')
    ok(not errs, 'no JavaScript errors ' + str(errs))
    # 16 layout
    reset_state(); sign_in(); pg.set_viewport_size({'width': 360, 'height': 740}); pg.goto(BASE + '#/brief'); pg.reload(); pg.wait_for_selector('.st', timeout=4000); w()
    ok(pg.evaluate('document.documentElement.scrollWidth') <= 360, 'brief has no horizontal scroll at 360px')
    pg.screenshot(path='/home/claude/shots/brief-acct-360.png'); pg.set_viewport_size({'width': 1280, 'height': 800}); w(); pg.screenshot(path='/home/claude/shots/brief-acct-1280.png')
    b.close()
print('\n%d failed' % len(fails)); sys.exit(1 if fails else 0)
