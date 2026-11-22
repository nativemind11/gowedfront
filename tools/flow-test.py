#!/usr/bin/env python3
"""END-TO-END flow test (mock Supabase + mock /api/reply, ONE shared state, two browsers): client <-> Founder, start to finish.
Client opens account -> Founder replies with a price and proposes a call -> client sees it, answers and picks a time -> Founder sees it and confirms with a
Teams link -> client sees the link -> client moves the call (link must vanish) -> Founder confirms again -> client sees the new link.
The mock imitates the rules of migration 008 (client writes only after the Founder wrote, a moved call loses its link, only the server sets the link) and what
api/reply.js writes. The REAL database rules are proven by the back end's `npm run test:rls`; the real handler by `npm test`.
Run:  (setsid nohup python3 -m http.server 8765 >/dev/null 2>&1 & sleep 1; python3 tools/flow-test.py)"""
import json, re, sys
from datetime import datetime, timedelta
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
FID, DID, PID, CID = 'f1', 'd1', 'p1', 'u1'
def prof(i, n, e, r): return {'id': i, 'full_name': n, 'email': e, 'role': r, 'status': 'active', 'locale': 'en', 'created_at': '2026-11-10T10:00:00Z'}
PROFILES = [prof(FID, 'Fiona Founder', 'f@x.test', 'founder'), prof(DID, 'Dana Director', 'd@x.test', 'director'), prof(PID, 'Pat Partner', 'p@x.test', 'partner'), prof(CID, 'Cleo Client', 'c@x.test', 'client')]
PARTNERS = [{'profile_id': DID, 'code': 'DIR1', 'director_id': None, 'active': True}, {'profile_id': PID, 'code': 'PAT1', 'director_id': DID, 'active': True}]
CLIENT = {'profile_id': CID, 'partner_id': PID, 'code_used': None, 'company': 'Acme', 'country': 'Egypt', 'phone': None, 'created_at': '2026-11-12T10:00:00Z'}
S = {'brief': {'id': 'b1', 'ref': 'CB-FLOW0001', 'client_id': CID, 'status': 'submitted', 'locale': 'en', 'answers': {}, 'selected_types': [], 'created_at': '2026-11-13T10:00:00Z', 'updated_at': '2026-11-13T10:00:00Z', 'submitted_at': '2026-11-13T10:00:00Z'},
     'msgs': [], 'meets': [], 'seq': 0, 'apicalls': [], 'ts': 0}
def now_iso():
    S['ts'] += 1; return '2026-11-20T10:%02d:%02dZ' % (S['ts'] // 60, S['ts'] % 60)
def role_of(req):
    a = req.headers.get('authorization') or ''
    return 'founder' if a == 'Bearer at-founder' else 'client' if a == 'Bearer at-client' else None
def sb(route, req):
    u = req.url; m = req.method
    if m == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    def j(s, d): route.fulfill(status=s, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(d))
    if '/auth/v1/logout' in u: return route.fulfill(status=204, headers=CORS)
    if '/rest/v1/' not in u: return j(200, {})
    role = role_of(req); path = re.sub(r'^https://[^/]+', '', u); t = path.split('/rest/v1/')[1].split('?')[0]
    try: body = req.post_data_json or {}
    except Exception: body = {}
    if t == 'profiles': return j(200, PROFILES if role == 'founder' else [PROFILES[3]])
    if t == 'clients': return j(200, [CLIENT])
    if t == 'partners': return j(200, PARTNERS if role == 'founder' else [])
    if t == 'client_briefs': return j(200, [S['brief']] if m == 'GET' else [])
    if t == 'brief_messages':
        if m == 'GET': return j(200, sorted(S['msgs'], key=lambda x: x['created_at']))
        if m == 'POST':   # the rules of migration 008 for a client
            if role != 'client' or body.get('sender') != 'client' or not any(x['sender'] == 'founder' for x in S['msgs']): return j(403, {'code': '42501', 'message': 'row-level security'})
            if any(k in body for k in ('price_text', 'proposes_meeting', 'email_status')) or body.get('kind') != 'reply': return j(403, {'code': '42501', 'message': 'check'})
            S['seq'] += 1; r = {'id': 'c%d' % S['seq'], 'brief_id': 'b1', 'client_id': CID, 'sender': 'client', 'kind': 'reply', 'body': body['body'], 'price_text': None, 'proposes_meeting': False, 'meeting_id': body.get('meeting_id'), 'email_status': None, 'email_at': None, 'created_at': now_iso()}
            S['msgs'].append(r); return j(201, [r])
    if t == 'meetings':
        if m == 'GET':
            if 'teams_url=not.is.null' in path: return j(200, [{'id': x['id'], 'teams_url': x['teams_url']} for x in S['meets'] if x['teams_url']])
            rows = [x for x in S['meets'] if not ('status=neq.cancelled' in path and x['status'] == 'cancelled')]
            return j(200, sorted(rows, key=lambda x: x['starts_at'], reverse=True))
        if m == 'POST':
            if role != 'client' or 'teams_url' in body: return j(403, {'code': '42501', 'message': 'no'})
            if any(x['status'] in ('requested', 'confirmed') for x in S['meets']): return j(409, {'code': '23505', 'message': 'duplicate'})
            S['seq'] += 1; r = {'id': 'm%d' % S['seq'], 'brief_id': 'b1', 'client_id': CID, 'starts_at': body['starts_at'], 'timezone': body['timezone'], 'duration_min': body['duration_min'], 'status': 'requested', 'note': None, 'teams_url': None}
            S['meets'].append(r); return j(201, [r])
        if m == 'PATCH':
            if role != 'client' or 'teams_url' in body: return j(403, {'code': '42501', 'message': 'no'})
            mid = re.search(r'id=eq\.([^&]+)', u).group(1); r = next((x for x in S['meets'] if x['id'] == mid), None)
            if not r or r['status'] not in ('requested', 'confirmed'): return j(200, [])
            r.update({k: body[k] for k in ('starts_at', 'timezone', 'duration_min', 'status') if k in body})
            if r['status'] in ('requested', 'cancelled') or 'starts_at' in body: r['teams_url'] = None       # the trigger of migration 008
            return j(200, [r])
    return j(200, [])
def api(route, req):    # mirrors what api/reply.js writes (the handler itself is proven by the back end tests)
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    b = req.post_data_json; S['apicalls'].append(b)
    def j(s, d): route.fulfill(status=s, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(d))
    if role_of(req) != 'founder': return j(403, {'ok': False, 'code': 'forbidden'})
    S['seq'] += 1; mid = 'f%d' % S['seq']
    if b['action'] == 'reply':
        S['msgs'].append({'id': mid, 'brief_id': 'b1', 'client_id': CID, 'sender': 'founder', 'kind': 'reply', 'body': b['body'], 'price_text': b.get('price'), 'proposes_meeting': bool(b.get('propose_meeting')), 'meeting_id': None, 'email_status': 'sent', 'email_at': now_iso(), 'created_at': now_iso()})
        return j(200, {'ok': True, 'id': mid, 'email': 'sent'})
    if b['action'] == 'confirm':
        r = next((x for x in S['meets'] if x['id'] == b['meeting_id']), None)
        if not r or r['status'] not in ('requested', 'confirmed'): return j(409, {'ok': False, 'code': 'state'})
        r['status'] = 'confirmed'; r['teams_url'] = b['teams_url']
        if b.get('starts_at'): r['starts_at'] = b['starts_at']
        S['msgs'].append({'id': mid, 'brief_id': 'b1', 'client_id': CID, 'sender': 'founder', 'kind': 'meeting_confirmed', 'body': b.get('body', ''), 'price_text': None, 'proposes_meeting': False, 'meeting_id': r['id'], 'email_status': 'sent', 'email_at': now_iso(), 'created_at': now_iso()})
        return j(200, {'ok': True, 'id': mid, 'email': 'sent'})
    return j(200, {'ok': True, 'email': 'sent'})
def other(route, req): route.fulfill(status=200 if req.method != 'OPTIONS' else 204, headers={**CORS, 'content-type': 'application/json'}, body='{"ok":true}')
TS = "window.turnstile={render:function(){return 1},getResponse:function(){return 'T'},reset:function(){}};"
def session(uid, tok): return {'access_token': tok, 'refresh_token': 'rt', 'expires_at': 4102444800, 'user': {'id': uid, 'email': 'x@x.test'}}
with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    def mk(uid, tok):
        c = b.new_context(viewport={'width': 1280, 'height': 900}, timezone_id='Europe/Berlin', locale='en-GB')
        c.route(re.compile(r'https://[a-z0-9]+\.supabase\.co/.*'), sb)
        c.route(re.compile(r'https://culmera-api\.vercel\.app/.*'), other)
        c.route(re.compile(r'https://culmera-api\.vercel\.app/api/reply'), api)
        c.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r, q: r.fulfill(status=200, content_type='application/javascript', body=TS))
        pg = c.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:160])); pg.on('dialog', lambda d: (errs.append('dialog:' + d.message), d.dismiss()))
        pg.goto(BASE); pg.evaluate("s=>localStorage.setItem('culmera.session',JSON.stringify(s))", session(uid, tok)); return pg
    cl = mk(CID, 'at-client'); fo = mk(FID, 'at-founder')
    def client_page():
        cl.goto(BASE + '#/account'); cl.reload(); cl.wait_for_selector('#cv', timeout=6000); cl.wait_for_timeout(700)
    def founder_open():
        fo.goto(BASE + '#/team'); fo.reload(); fo.wait_for_selector('#tmbody', timeout=6000); fo.wait_for_timeout(500)
        fo.locator('.tm-tabs [role=tab]').nth(1).click(); fo.wait_for_timeout(300); fo.click('[data-tm=openc]'); fo.wait_for_selector('#tmconv', timeout=4000); fo.wait_for_timeout(300)
    # 1 client opens the account before anybody wrote: no reply form yet
    client_page(); ok(cl.locator('#cvsend').count() == 0 and cl.locator('.cvm').count() == 0, '1 client: nothing to answer yet, no reply form')
    # 2 Founder opens the client, sees the Partner and the Director, replies with a price and proposes a call
    founder_open(); t = fo.inner_text('#tm'); ok('Pat Partner' in t and 'Dana Director' in t, '2 Founder sees the Partner and the Director names')
    fo.fill('form[data-form=reply] [name=rb]', 'Welcome, we can do this'); fo.fill('form[data-form=reply] [name=rp]', 'PRICE-777'); fo.check('form[data-form=reply] [name=rpm]')
    fo.click('form[data-form=reply] button[type=submit]'); fo.wait_for_timeout(800)
    ok(len(S['msgs']) == 1 and S['msgs'][0]['price_text'] == 'PRICE-777' and S['msgs'][0]['proposes_meeting'], '2 reply saved with price and the call proposal')
    ok('Welcome, we can do this' in fo.inner_text('#tmconv') and 'PRICE-777' in fo.inner_text('#tmconv'), '2 Founder sees his own message in the conversation')
    # 3 client sees it (message, price, proposal) and now has the form
    client_page(); ct = cl.inner_text('#cv'); ok('Welcome, we can do this' in ct and 'PRICE-777' in ct, '3 client sees the Founder message and the price')
    ok(cl.locator('#cvsend').count() == 1, '3 client now has the reply form')
    # 4 client answers and picks a time
    day = (datetime.now() + timedelta(days=10)).strftime('%Y-%m-%d')
    cl.fill('#cvbody', 'Sounds good, call me'); cl.fill('#cvd', day); cl.fill('#cvt', '11:00'); cl.click('#cvsend'); cl.wait_for_timeout(1000)
    ok(len(S['meets']) == 1 and S['meets'][0]['status'] == 'requested' and any(x['sender'] == 'client' and x['meeting_id'] == S['meets'][0]['id'] for x in S['msgs']), '4 client reply saved together with the requested call')
    ok('Sounds good, call me' in cl.inner_text('#cv'), '4 client sees his own message')
    # 5 Founder sees the client answer and the requested call, confirms with a Teams link
    founder_open(); ft = fo.inner_text('#tm'); ok('Sounds good, call me' in ft, '5 Founder sees the client answer')
    ok(fo.locator('form[data-form=confirm]').count() == 1, '5 Founder gets the confirm form for the requested call')
    fo.click('details.tm-cf summary'); fo.fill('form[data-form=confirm] [name=tl]', 'https://teams.microsoft.com/l/meetup-join/ONE'); fo.fill('form[data-form=confirm] [name=nt]', 'See you then')
    fo.click('form[data-form=confirm] button[type=submit]'); fo.wait_for_timeout(900)
    ok(S['meets'][0]['status'] == 'confirmed' and S['meets'][0]['teams_url'].endswith('/ONE'), '5 call confirmed with the link')
    ok('meetup-join/ONE' in fo.inner_text('#tm') and 'Confirmed' in fo.inner_text('#tm'), '5 Founder sees the call confirmed and the link')
    # 6 client sees the confirmed call, the message and the link (conversation and card)
    client_page(); ok(cl.locator('#cv a[href$="/ONE"]').count() >= 1, '6 client sees the Teams button in the conversation')
    ok('See you then' in cl.inner_text('#cv'), '6 client sees the Founder note')
    cl.goto(BASE + '#/account'); cl.wait_for_timeout(700); ok(cl.locator('#mcard a[href$="/ONE"]').count() == 1, '6 client sees the Teams button on the call card')
    # 7 client moves the call: the old link must vanish for him and for the Founder
    day2 = (datetime.now() + timedelta(days=12)).strftime('%Y-%m-%d')
    client_page(); cl.fill('#cvbody', 'Can we move it?'); cl.fill('#cvd', day2); cl.fill('#cvt', '15:00'); cl.click('#cvsend'); cl.wait_for_timeout(1000)
    ok(S['meets'][0]['status'] == 'requested' and S['meets'][0]['teams_url'] is None and len(S['meets']) == 1, '7 moved call is requested again and the old link is gone')
    ok(cl.locator('a[href$="/ONE"]').count() == 0, '7 client no longer sees the old link anywhere')
    founder_open(); ok('meetup-join/ONE' not in fo.inner_text('#tm'), '7 Founder no longer sees the old link')
    # 8 Founder confirms again with a new link
    fo.click('details.tm-cf summary'); fo.fill('form[data-form=confirm] [name=tl]', 'https://teams.microsoft.com/l/meetup-join/TWO'); fo.click('form[data-form=confirm] button[type=submit]'); fo.wait_for_timeout(900)
    client_page(); ok(cl.locator('#cv a[href$="/TWO"]').count() >= 1 and cl.locator('a[href$="/ONE"]').count() == 0, '8 client sees ONLY the new link')
    # 9 the API refuses anybody but the Founder; every call carried a fresh req_id
    ids = [c.get('req_id') for c in S['apicalls']]; ok(len(ids) == 3 and len(set(ids)) == 3 and all(ids), '9 three Founder calls, three different req_id: %s' % len(set(ids)))
    cl.set_viewport_size({'width': 360, 'height': 800}); client_page()
    ov = cl.evaluate("()=>document.documentElement.scrollWidth-innerWidth"); ok(ov <= 0, '9 client page at 360px: no sideways scroll (%s)' % ov)
    ok(not errs, '9 no page errors or dialogs: %s' % errs)
    b.close()
print('\n%d failed' % len(fails) if fails else '\nALL PASSED'); sys.exit(1 if fails else 0)
