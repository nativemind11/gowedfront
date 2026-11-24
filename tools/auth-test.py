#!/usr/bin/env python3
"""Browser test for sign-up, sign-in, reset and account with a MOCK Supabase (no real network, no real keys).
Run: python3 -m http.server 8765  (in the front folder), then: python3 tools/auth-test.py"""
import json, re, sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
calls = []; fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
SESSION = {'access_token': 'at', 'refresh_token': 'rt', 'expires_in': 3600, 'user': {'id': 'u1', 'email': 't@example.com'}}
STATE = {'role': 'client', 'status': 'active'}
def sb(route, req):
    u = req.url; m = req.method
    if m == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    body = {}
    try: body = req.post_data_json or {}
    except Exception: pass
    calls.append((m, re.sub(r'^https://[^/]+', '', u), body, req.headers.get('authorization')))
    def j(s, d): route.fulfill(status=s, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(d))
    if '/auth/v1/signup' in u: return j(200, {'id': 'u1', 'email': body.get('email')})
    if 'grant_type=password' in u:
        return j(200, SESSION) if body.get('password') == 'Correct12345' else j(400, {'error_code': 'invalid_credentials', 'msg': 'x'})
    if 'grant_type=pkce' in u: return j(200, SESSION) if body.get('code_verifier') else j(400, {'error_code': 'flow_state_not_found'})
    if 'grant_type=refresh_token' in u: return j(200, {**SESSION, 'access_token': 'at2'})
    if '/auth/v1/recover' in u: return j(200, {})
    if '/auth/v1/user' in u: return j(200, {})
    if '/auth/v1/logout' in u: return route.fulfill(status=204, headers=CORS)
    if '/rest/v1/profiles' in u: return j(200, [{'full_name': '<b>Test Client</b>', 'role': STATE['role'], 'status': STATE['status'], 'email': 't@example.com'}])
    if '/rest/v1/clients' in u: return j(200, [{'company': 'Acme', 'country': 'Egypt', 'phone': None, 'code_used': 'PARTNER1'}])
    return j(200, [])
TS = "window.turnstile={render:function(s,o){return 1},getResponse:function(){return 'TSTOKEN'},reset:function(){}};"
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 800}); errs = []
    ctx.route(re.compile(r'https://[a-z0-9]+\.supabase\.co/.*'), sb)
    ctx.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r, q: r.fulfill(status=200, content_type='application/javascript', body=TS))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:150]))
    wait = lambda: pg.wait_for_timeout(500)
    # sign-up with ?ref prefill; validation; success payload
    pg.goto(BASE + '?ref=partner1#/signup'); wait()
    ok(pg.input_value('#ur') == 'PARTNER1', 'ref link pre-fills the partner code (upper-cased)')
    ok('ref=' not in pg.url, 'ref removed from the address bar')
    pg.click('#ub'); wait(); ok('fill in' in pg.inner_text('#am'), 'empty sign-up shows a clear message')
    pg.fill('#un', 'Test Client'); pg.fill('#ue', 't@example.com'); pg.fill('#up', 'short'); pg.fill('#uc', 'Acme'); pg.fill('#uk', 'Egypt')
    pg.click('#ub'); wait(); ok('10 characters' in pg.inner_text('#am'), 'weak password rejected before sending')
    pg.fill('#up', 'Correct12345'); pg.click('#ub'); wait(); ok('privacy notice' in pg.inner_text('#am'), 'consent required')
    ur = pg.input_value('#ur'); pg.fill('#ur', 'bad code!'); pg.check('#ux'); pg.click('#ub'); wait(); ok('partner code looks wrong' in pg.inner_text('#am'), 'bad partner code rejected')
    pg.fill('#ur', ur); n = len(calls); pg.click('#ub'); pg.wait_for_selector('text=Check your email', timeout=4000)
    c = [x for x in calls[n:] if '/auth/v1/signup' in x[1]][0]
    ok(c[2]['data']['partner_code'] == 'PARTNER1' and c[2]['data']['full_name'] == 'Test Client', 'sign-up sends full_name and partner_code metadata')
    ok('role' not in c[2]['data'] and 'role' not in c[2], 'sign-up never sends a role')
    ok(c[2].get('code_challenge_method') == 's256' and c[2].get('code_challenge'), 'sign-up uses PKCE')
    ok(c[2].get('gotrue_meta_security', {}).get('captcha_token') == 'TSTOKEN', 'Turnstile token forwarded for Supabase CAPTCHA')
    ok('redirect_to=https%3A%2F%2Fculmera-solutions.com%2F%3Fauth%3Dconfirm' in c[1], 'confirmation link returns to the production site')
    ok(c[3] is None, 'no Authorization header on public sign-up (publishable key only in apikey)')
    # sign-in wrong then right
    pg.goto(BASE + '#/signin'); wait(); pg.fill('#ie', 't@example.com'); pg.fill('#ip', 'Wrong12345'); pg.click('#ib'); wait()
    ok('not correct' in pg.inner_text('#am'), 'wrong password shows a friendly error')
    pg.fill('#ip', 'Correct12345'); pg.click('#ib'); pg.wait_for_selector('text=Welcome', timeout=4000)
    ok(pg.evaluate("document.querySelectorAll('#acct b').length")==0 and '<b>Test Client</b>' in pg.inner_text('#acct'), 'account page escapes user text (no HTML injection)')
    ok('Introduced by partner code PARTNER1' in pg.inner_text('#acct'), 'account shows the attributed partner code')
    ok(pg.inner_text('#acc') == 'Your account', 'header link switches to Your account')
    ok(any(x[1].startswith('/rest/v1/clients') and x[3] == 'Bearer at' for x in calls), 'data requests use the user token')
    ok(pg.evaluate("document.querySelector('meta[name=robots]')&&document.querySelector('meta[name=robots]').content")=='noindex,nofollow', 'account page is noindex')
    # expired token refreshes
    pg.evaluate("var s=JSON.parse(localStorage['culmera.session']);s.expires_at=1;localStorage['culmera.session']=JSON.stringify(s)")
    pg.reload(); pg.wait_for_selector('text=Welcome', timeout=4000); ok(json.loads(pg.evaluate("localStorage['culmera.session']"))['access_token'] == 'at2', 'expired session refreshes automatically')
    # sign out
    pg.click('[data-so]'); pg.wait_for_selector('#fin', timeout=4000); ok(pg.evaluate("localStorage['culmera.session']") is None, 'sign-out clears the session')
    # account without session redirects
    pg.goto(BASE + '#/account'); pg.wait_for_selector('#fin', timeout=4000); ok(True, 'account without a session goes to sign-in')
    # suspended user is signed out
    STATE['status'] = 'suspended'; pg.fill('#ie', 't@example.com'); pg.fill('#ip', 'Correct12345'); pg.click('#ib'); pg.wait_for_selector('text=not active', timeout=4000); STATE['status'] = 'active'
    ok(pg.evaluate("localStorage['culmera.session']") is None, 'suspended account is signed out with a clear message')
    # reset: neutral message
    pg.goto(BASE + '#/reset'); wait(); pg.fill('#re', 'nobody@example.com'); pg.click('#rb'); wait()
    ok('If an account exists' in pg.inner_text('#am'), 'reset reply is neutral (no account enumeration)')
    ok(any('/auth/v1/recover' in x[1] and 'auth%3Drecovery' in x[1] for x in calls), 'reset link returns with auth=recovery')
    # confirm return with code: exchanges using stored verifier
    pg.goto(BASE + '#/signup'); wait(); pg.fill('#un', 'Test Client'); pg.fill('#ue', 't@example.com'); pg.fill('#up', 'Correct12345'); pg.fill('#uc', 'A'); pg.fill('#uk', 'B'); pg.check('#ux'); pg.click('#ub'); pg.wait_for_selector('text=Check your email')
    pg.goto(BASE + '?auth=confirm&code=abc'); pg.wait_for_selector('text=Welcome', timeout=4000)
    ok(any('grant_type=pkce' in x[1] and x[2].get('auth_code') == 'abc' and x[2].get('code_verifier') for x in calls), 'email link code is exchanged with the PKCE verifier')
    ok('code=' not in pg.url, 'code removed from the address bar')
    # expired link
    pg.evaluate("localStorage.clear()"); pg.goto(BASE + '?error=access_denied&error_code=otp_expired&error_description=expired'); wait()
    ok('expired' in pg.inner_text('#am'), 'expired email link shows a clear message')
    # recovery -> new password
    pg.evaluate("localStorage.clear()"); pg.goto(BASE + '#/reset'); wait(); pg.fill('#re', 't@example.com'); pg.click('#rb'); wait()
    pg.goto(BASE + '?auth=recovery&code=zzz'); pg.wait_for_selector('#fnp', timeout=4000); wait()
    pg.fill('#np', 'NewPass12345'); pg.fill('#np2', 'Different1234'); pg.click('#fnp button'); wait(); ok('do not match' in pg.inner_text('#am'), 'password mismatch caught')
    pg.fill('#np2', 'NewPass12345'); pg.click('#fnp button'); wait()
    ok(any(x[0] == 'PUT' and '/auth/v1/user' in x[1] and x[2].get('password') == 'NewPass12345' and x[3] == 'Bearer at' for x in calls), 'new password saved with the recovery session')
    # no secrets / privileged keys sent anywhere
    ok(not any('service_role' in json.dumps(x) or 'sb_secret' in json.dumps(x) for x in calls), 'no secret or service key in any request')
    ok(not errs, 'no JavaScript errors ' + str(errs))
    # mobile layout
    pg.set_viewport_size({'width': 360, 'height': 740}); pg.goto(BASE + '#/signup'); wait()
    ok(pg.evaluate('document.documentElement.scrollWidth') <= 360, 'sign-up has no horizontal scroll at 360px')
    pg.screenshot(path='/home/claude/shots/signup-360.png'); pg.set_viewport_size({'width': 1280, 'height': 800}); pg.goto(BASE + '#/signin'); wait(); pg.screenshot(path='/home/claude/shots/signin-1280.png')
    b.close()
print('\n%d failed' % len(fails)); sys.exit(1 if fails else 0)
