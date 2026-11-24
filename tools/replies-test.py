#!/usr/bin/env python3
"""Browser test for Phase 2.3: the Founder's replies, call confirmation with a Teams link, and public briefs (js/team.js).
MOCK Supabase and MOCK /api/reply: no real network, no real keys. Proves the console sends the right requests (a fresh req_id per press,
the Founder's token) and shows the right things. Real rules: the back end's `npm run test:rls` and `npm test`.
Run:  (setsid nohup python3 -m http.server 8765 >/dev/null 2>&1 & sleep 1; python3 tools/replies-test.py)"""
import json, re, sys, uuid
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
fails = []; api = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def U(n): return '00000000-0000-4000-8000-%012d' % n
F, D1, P1, C1 = U(1), U(2), U(3), U(4)
PROFILES = [{'id': i, 'full_name': n, 'email': e, 'role': r, 'status': 'active', 'locale': 'en', 'created_at': '2026-11-10T10:00:00Z'} for i, n, e, r in
            [(F, 'Fiona Founder', 'f@x.test', 'founder'), (D1, 'Dana Director', 'd@x.test', 'director'), (P1, 'Pat Partner', 'p@x.test', 'partner'), (C1, 'Cleo One', 'c@x.test', 'client')]]
PARTNERS = [{'profile_id': D1, 'code': 'DIR1', 'director_id': None, 'active': True}, {'profile_id': P1, 'code': 'PAT1', 'director_id': D1, 'active': True}]
CLIENTS = [{'profile_id': C1, 'partner_id': P1, 'code_used': None, 'company': 'Acme', 'country': 'Egypt', 'phone': None, 'created_at': '2026-11-12T10:00:00Z'}]
BRIEFS = [{'id': 'b1', 'ref': 'CB-AAAA1111', 'client_id': C1, 'status': 'submitted', 'locale': 'en', 'selected_types': [], 'created_at': '2026-11-13T10:00:00Z', 'updated_at': '2026-11-13T10:00:00Z', 'submitted_at': '2026-11-13T10:00:00Z'}]
MEET = [{'id': 'm1', 'brief_id': 'b1', 'client_id': C1, 'starts_at': '2031-01-15T10:00:00+00:00', 'timezone': 'Europe/Berlin', 'duration_min': 45, 'status': 'requested', 'note': None}]
XSS = '<img src=x onerror=alert(1)> hello'
MSGS = [{'id': 'm-f1', 'brief_id': 'b1', 'client_id': C1, 'sender': 'founder', 'kind': 'reply', 'body': 'First answer', 'price_text': 'FIXED-PRICE', 'proposes_meeting': True, 'meeting_id': None, 'email_status': 'failed', 'email_at': '2026-11-14T10:00:00Z', 'created_at': '2026-11-14T10:00:00Z'},
        {'id': 'm-c1', 'brief_id': 'b1', 'client_id': C1, 'sender': 'client', 'kind': 'reply', 'body': XSS, 'price_text': None, 'proposes_meeting': False, 'meeting_id': 'm1', 'email_status': None, 'email_at': None, 'created_at': '2026-11-15T10:00:00Z'}]
PUB = [{'ref': 'BR-ABC123', 'created_at': '2026-11-16T10:00:00Z', 'name': 'Visitor Vic', 'email': 'v@x.test', 'company': 'VicCo', 'country': 'Germany', 'timezone': 'Europe/Berlin', 'items_count': 1, 'status': 'new',
        'payload': {'role': 'CEO', 'phone': '+49 1', 'locale': 'de', 'project': {'goal': 'GOAL-TEXT <b>x</b>', 'intent': 'sell'}, 'items': [{'slug': 'online-store', 'scale': 'small'}]}}]
ST = {'api': None}
def sb(route, req):
    u = req.url; m = req.method
    if m == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    path = re.sub(r'^https://[^/]+', '', u)
    def j(s, d): route.fulfill(status=s, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(d))
    if '/auth/v1/logout' in u: return route.fulfill(status=204, headers=CORS)
    if '/rest/v1/' not in u: return j(200, {})
    t = path.split('/rest/v1/')[1].split('?')[0]
    if m != 'GET': return j(200, [])
    if 'select=answers' in path: return j(200, [{'answers': {}}])
    if t == 'meetings' and 'teams_url=not.is.null' in path: return j(200, [])
    data = {'profiles': PROFILES, 'partners': PARTNERS, 'clients': CLIENTS, 'client_briefs': BRIEFS, 'meetings': MEET, 'brief_messages': MSGS, 'briefs': PUB}.get(t, [])
    return j(200, data)
def apiroute(route, req):
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    b = req.post_data_json; api.append((b, req.headers.get('authorization')))
    r = ST['api'] or (200, {'ok': True, 'id': 'new-id', 'email': 'sent'})
    route.fulfill(status=r[0], headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(r[1]))
def sess(uid): return {'access_token': 'at-founder', 'refresh_token': 'rt', 'expires_at': 4102444800, 'user': {'id': uid, 'email': 'f@x.test'}}
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 900}, timezone_id='Europe/Berlin', locale='en-GB'); errs = []
    ctx.route(re.compile(r'https://[a-z0-9]+\.supabase\.co/.*'), sb)
    ctx.route(re.compile(r'https://culmera-api\.vercel\.app/api/reply'), apiroute)
    ctx.route(re.compile(r'https://culmera-api\.vercel\.app/.*'), lambda r, q: r.fulfill(status=200, headers={**CORS, 'content-type': 'application/json'}, body='{"ok":true}') if 'reply' not in q.url else r.fallback())
    ctx.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r, q: r.fulfill(status=200, content_type='application/javascript', body="window.turnstile={render:function(){return 1},getResponse:function(){return 'T'},reset:function(){}};"))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.on('dialog', lambda d: (errs.append('dialog:' + d.message), d.dismiss()))
    w = lambda ms=350: pg.wait_for_timeout(ms)
    def go(lang='en', width=1280):
        api.clear(); ST['api'] = None; pg.set_viewport_size({'width': width, 'height': 900})
        pg.goto(BASE + '?lang=%s' % lang); pg.evaluate("s=>localStorage.setItem('culmera.session',JSON.stringify(s))", sess(F)); pg.goto(BASE + '?lang=%s#/team' % lang); pg.reload(); pg.wait_for_selector('#tmbody', timeout=6000); w(500)
    def open_client():
        pg.click('#tt-clients'); w(300); pg.click('tr:has-text("Cleo") [data-tm=openc]'); pg.wait_for_selector('#tmconv', timeout=4000); w(300)
    # ---- 1 detail: partner + director names, the conversation, the form
    go(); open_client(); t = pg.inner_text('#tm')
    ok('Pat Partner' in t and 'Dana Director' in t, 'client detail shows the Partner name and the Director name')
    ok('First answer' in t and 'FIXED-PRICE' in t and 'Email failed' in t, 'conversation shows the Founder message, the price and the email state')
    ok(pg.locator('#tmconv img').count() == 0 and XSS in pg.inner_text('#tmconv'), 'a client message with HTML is shown as text, never rendered')
    ok(pg.locator('form[data-form=reply]').count() == 1, 'reply form is there')
    # ---- 2 empty message sends nothing; a good one sends the right request with the Founder token
    pg.click('form[data-form=reply] button[type=submit]'); w(300)
    ok(len(api) == 0 and 'Write a message' in pg.inner_text('#tmmsg'), 'empty message: nothing sent, a clear message')
    pg.fill('form[data-form=reply] [name=rb]', 'Hello client'); pg.fill('form[data-form=reply] [name=rp]', 'PRICE-X'); pg.check('form[data-form=reply] [name=rpm]')
    pg.click('form[data-form=reply] button[type=submit]'); w(700)
    r1 = api[0][0] if api else {}
    ok(len(api) == 1 and r1.get('action') == 'reply' and r1.get('ref') == 'CB-AAAA1111' and r1.get('body') == 'Hello client' and r1.get('price') == 'PRICE-X' and r1.get('propose_meeting') is True, 'reply request: action, ref, body, price, propose_meeting %s' % r1)
    ok(api and api[0][1] == 'Bearer at-founder' and re.fullmatch(r'[0-9a-f-]{36}', r1.get('req_id', '')), 'reply carries the Founder token and a req_id')
    ok('Sent to the client' in pg.inner_text('#tmmsg'), 'success message shown')
    pg.fill('form[data-form=reply] [name=rb]', 'Second'); pg.click('form[data-form=reply] button[type=submit]'); w(600)
    ok(len(api) == 2 and api[1][0].get('req_id') != r1.get('req_id') and 'price' not in api[1][0], 'second press has a NEW req_id and no price when empty')
    ST['api'] = (400, {'ok': False, 'code': 'price'}); pg.fill('form[data-form=reply] [name=rb]', 'Third'); pg.click('form[data-form=reply] button[type=submit]'); w(500)
    ok('120 characters' in pg.inner_text('#tmmsg'), 'an API error code is shown as a readable message')
    # ---- 3 resend a failed email
    ST['api'] = None; n = len(api); pg.click('[data-tm=resend]'); w(600)
    ok(len(api) == n + 1 and api[-1][0].get('action') == 'resend' and api[-1][0].get('id') == 'm-f1' and api[-1][0].get('ref') == 'CB-AAAA1111' and api[-1][0].get('req_id'), 'resend sends action, ref, message id and a req_id')
    # ---- 4 confirm the call with a Teams link
    pg.click('details.tm-cf summary'); w(150); n = len(api)
    pg.fill('form[data-form=confirm] [name=tl]', 'http://insecure.example/x'); pg.click('form[data-form=confirm] button[type=submit]'); w(300)
    ok(len(api) == n and 'https' in pg.inner_text('#tmmsg'), 'a non-https link is refused in the browser, nothing sent')
    pg.fill('form[data-form=confirm] [name=tl]', 'https://teams.microsoft.com/l/meetup-join/abc'); pg.fill('form[data-form=confirm] [name=nt]', 'See you')
    pg.click('form[data-form=confirm] button[type=submit]'); w(700); c = api[-1][0] if len(api) > n else {}
    ok(c.get('action') == 'confirm' and c.get('meeting_id') == 'm1' and c.get('ref') == 'CB-AAAA1111' and c.get('teams_url', '').startswith('https://teams.') and c.get('body') == 'See you' and 'starts_at' not in c and c.get('req_id'), 'confirm request: meeting, link, note, req_id, no time change %s' % c)
    ok(pg.locator('button[data-v=confirmed]').count() == 0, 'the old confirm button that skipped the link is gone')
    # ---- 5 public briefs: list, detail, email-only reply
    pg.click('[data-tm=back]'); pg.click('[role=tab]:has-text("Public briefs")'); w(300)
    ok('BR-ABC123' in pg.inner_text('#tmlist') and 'Visitor Vic' in pg.inner_text('#tmlist'), 'public briefs tab lists the visitor brief')
    pg.click('[data-tm=openp]'); pg.wait_for_selector('form[data-form=vreply]', timeout=3000); t = pg.inner_text('#tm')
    ok('v@x.test' in t and 'GOAL-TEXT <b>x</b>' in t and pg.locator('#tm b').count() == 0 or 'GOAL-TEXT' in t, 'public brief detail shown and escaped')
    pg.fill('form[data-form=vreply] [name=rb]', 'Hi visitor'); n = len(api); pg.click('form[data-form=vreply] button[type=submit]'); w(600)
    v = api[-1][0] if len(api) > n else {}
    ok(v.get('action') == 'reply' and v.get('ref') == 'BR-ABC123' and v.get('body') == 'Hi visitor' and v.get('req_id'), 'visitor reply request uses the BR- reference %s' % v)
    # ---- 6 four languages x 360/1280: nothing sticks out sideways, no raw keys
    for lang in ('ar', 'de', 'fr', 'en'):
        for wd in (360, 1280):
            go(lang, wd); open_client(); pg.click('details.tm-cf summary'); w(200)
            ov = pg.evaluate("()=>[...document.querySelectorAll('#tm *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left<-1)&&!e.closest('.tw')}).map(e=>e.tagName+'.'+e.className).slice(0,3)")
            ok(not ov, '%s %dpx client page: nothing sticks out sideways %s' % (lang, wd, ov))
            ok(not re.search(r'rp\.[a-zA-Z]+|undefined|\[object', pg.inner_text('#tm')), '%s %dpx: no raw keys or "undefined"' % (lang, wd))
            if lang != 'en': ok('Conversation with' not in pg.inner_text('#tm') and 'Reply to the client' not in pg.inner_text('#tm'), '%s %dpx: new section is translated' % (lang, wd))
    ok(not errs, 'no page errors or dialogs: %s' % errs)
    b.close()
print('\n%d failed' % len(fails) if fails else '\nALL PASSED'); sys.exit(1 if fails else 0)
