#!/usr/bin/env python3
"""Browser test for Phase 5 (notifications) with a MOCK Supabase and a MOCK notify API. No real network, no real keys.
It proves the page tells /api/notify at the right moments, with only an event name and a record id, with the user's token,
never blocks the page, and retries later when the server was down. The server's own rules are proven by the back end's
`npm test` (tests/notify.test.js).
Run in ONE command:  (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! > /tmp/srv.pid; sleep 1; python3 tools/notify-test.py; kill $(cat /tmp/srv.pid))"""
import json, re, os
from datetime import datetime, timedelta, timezone
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
fails = []; notes = []; db = []
os.makedirs('/home/claude/shots', exist_ok=True)
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
ST = {}
def reset(**k):
    notes.clear(); ST.clear(); ST.update({'br': None, 'mt': [], 'api': 200, 'api_body': {'ok': True, 'sent': 3}, 'seq': 0}); ST.update(k)
def sb(route, req):
    u = req.url; m = req.method
    if m == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    body = {}
    try: body = req.post_data_json or {}
    except Exception: pass
    db.append((m, re.sub(r'^https://[^/]+', '', u), body))
    def j(s, d): route.fulfill(status=s, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(d))
    if '/auth/v1/logout' in u: return route.fulfill(status=204, headers=CORS)
    if '/rest/v1/profiles' in u: return j(200, [{'full_name': 'Test Client', 'role': 'client', 'status': 'active', 'email': 't@example.com'}])
    if '/rest/v1/clients' in u: return j(200, [{'company': 'Acme', 'country': 'Egypt', 'phone': '+20 100 000 0000', 'code_used': None}])
    if '/rest/v1/client_briefs' in u:
        if m == 'GET': return j(200, [ST['br']] if ST['br'] else [])
        if m == 'POST':
            ST['br'] = {'id': 'b1', 'ref': 'CB-ABCD1234', 'status': 'draft', 'answers': {}, 'selected_types': [], 'updated_at': 'x', 'submitted_at': None, **body}; ST['br']['status'] = 'draft'; return j(201, [ST['br']])
        if m == 'PATCH':
            ST['br'].update(body)
            if body.get('status') == 'submitted': ST['br']['submitted_at'] = '2026-11-21T10:00:00Z'
            return j(200, [ST['br']])
    if '/rest/v1/meetings' in u:
        if m == 'GET':
            rows = [x for x in ST['mt'] if not ('status=neq.cancelled' in u and x['status'] == 'cancelled')]; return j(200, rows)
        if m == 'POST':
            ST['seq'] += 1; row = {'id': 'm%d' % ST['seq'], **{k: body.get(k) for k in ('brief_id', 'starts_at', 'timezone', 'duration_min', 'status', 'note')}}; ST['mt'].append(row); return j(201, [row])
        if m == 'PATCH':
            mid = re.search(r'id=eq\.([^&]+)', u).group(1); row = next(x for x in ST['mt'] if x['id'] == mid); row.update(body); return j(200, [row])
    if '/rest/v1/data_requests' in u: return j(200, [])
    return j(200, [])
def api(route, req):
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    try: body = req.post_data_json
    except Exception: body = None
    notes.append({'url': req.url, 'body': body, 'auth': req.headers.get('authorization'), 'ct': req.headers.get('content-type')})
    route.fulfill(status=ST['api'], headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(ST['api_body']))
SESSION = {'access_token': 'at', 'refresh_token': 'rt', 'expires_at': 4102444800, 'user': {'id': 'u1', 'email': 't@example.com'}}
TS = "window.turnstile={render:function(){return 1},getResponse:function(){return 'T'},reset:function(){}};"
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 800}, timezone_id='Europe/Berlin', locale='en-GB'); errs = []
    ctx.route(re.compile(r'https://[a-z0-9]+\.supabase\.co/.*'), sb)
    ctx.route(re.compile(r'https://culmera-api\.vercel\.app/api/notify'), api)
    ctx.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r, q: r.fulfill(status=200, content_type='application/javascript', body=TS))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:150]))
    w = lambda ms=400: pg.wait_for_timeout(ms)
    def sign_in(): pg.goto(BASE); pg.evaluate("s=>{localStorage.clear();localStorage.setItem('culmera.session',JSON.stringify(s))}", SESSION)
    queue = lambda: pg.evaluate("JSON.parse(localStorage.getItem('culmera.notify')||'[]')")
    now = datetime.now(timezone.utc).astimezone(); nm = (now.replace(day=1) + timedelta(days=32)).replace(day=1)

    # 1 visitor: nothing is ever sent
    reset(); pg.goto(BASE); pg.evaluate("localStorage.clear()"); pg.goto(BASE + '#/account'); pg.reload(); w(800)
    pg.goto(BASE + '#/brief'); pg.reload(); w(600)
    ok(len(notes) == 0, 'a visitor never calls /api/notify')

    # 2 new account: the first account view tells the server once, with only the event name
    reset(); sign_in(); n0 = len(notes); pg.goto(BASE + '#/account'); pg.reload(); pg.wait_for_selector('#acct h2', timeout=5000); w(800)
    reg = notes[n0:]
    ok(len(reg) == 1 and reg[0]['body'] == {'event': 'registered'}, 'first account view sends {event: registered} and nothing else')
    ok(reg[0]['auth'] == 'Bearer at' and reg[0]['ct'].startswith('application/json'), 'it uses the user token (the server decides who the user is)')
    ok(reg[0]['url'] == 'https://culmera-api.vercel.app/api/notify', 'the address is derived from the API address in config.js')
    ok(queue() == [] and pg.evaluate("localStorage.getItem('culmera.reg.u1')") == '1', 'success empties the queue and remembers that this account was reported')
    n1 = len(notes); pg.reload(); pg.wait_for_selector('#acct h2', timeout=5000); w(700)
    ok(len(notes) == n1, 'opening the account again does not call the server again')

    # 3 signed-in brief submit: one call with the real brief id
    reset(); sign_in(); pg.evaluate("localStorage.setItem('culmera.reg.u1','1')")
    pg.goto(BASE + '#/brief'); pg.reload(); pg.wait_for_selector('[data-goal="sell"]', timeout=4000); w()
    ok(len(notes) == 0, 'autosave and normal browsing of the brief send no notification')
    pg.click('[data-goal="sell"]'); w(1800); pg.click('[data-pkg="1"]'); w(1900); pg.click('[data-step="2"]'); w()
    pg.click('[data-p="project.goal"]'); pg.keyboard.type('We sell handmade rugs worldwide', delay=10); w(1900)
    ok(len(notes) == 0, 'a draft being saved is not news: no notification while drafting')
    pg.click('[data-go="1"]'); pg.wait_for_selector('[data-send]', timeout=3000); pg.click('[data-send]'); pg.wait_for_selector('text=Brief submitted', timeout=4000); w(800)
    ok(len(notes) == 1 and notes[0]['body'] == {'event': 'brief_submitted', 'id': 'b1'}, 'submitting sends {event: brief_submitted, id} (and no brief text, name, email or phone)')
    ok(notes[0]['auth'] == 'Bearer at', 'the brief notification uses the user token')
    ok('We sell handmade rugs' not in json.dumps(notes) and 't@example.com' not in json.dumps(notes) and '+20 100' not in json.dumps(notes), 'no personal data in any notification request')
    ok(queue() == [], 'queue is empty after success')

    # 4 meeting: request, move, cancel
    ST['br']['status'] = 'submitted'
    pg.goto(BASE + '#/meeting'); pg.reload(); pg.wait_for_selector('.cal', timeout=5000); w(200)
    pg.click('button[data-mt=next]'); pg.click('button.cd[data-day$="-15"]'); pg.select_option('#mth2', '14'); pg.select_option('#mtm', '30'); pg.click('[data-dur="45"]')
    n = len(notes); pg.click('#mtbtn'); pg.wait_for_selector('.pill.requested', timeout=4000); w(800)
    ok(notes[n:] and notes[n]['body'] == {'event': 'meeting', 'id': 'm1'} and len(notes) == n + 1, 'booking sends {event: meeting, id: m1}')
    pg.click('[data-mt=edit]'); pg.wait_for_selector('.cal'); pg.select_option('#mth2', '16'); n = len(notes); pg.click('#mtbtn'); pg.wait_for_selector('text=Your new time is saved', timeout=4000); w(800)
    ok(len(notes) == n + 1 and notes[n]['body'] == {'event': 'meeting', 'id': 'm1'}, 'moving it sends one more {event: meeting} for the same meeting')
    pg.click('[data-mt=cancel]'); n = len(notes); pg.click('[data-mt=cancel-yes]'); pg.wait_for_selector('text=is cancelled', timeout=4000); w(800)
    ok(len(notes) == n + 1 and notes[n]['body'] == {'event': 'meeting', 'id': 'm1'}, 'cancelling sends {event: meeting} again; the server reads the real status')

    # 5 server down: the page still works, the item waits in the queue, the next page load delivers it
    reset(api=503, api_body={'ok': False, 'code': 'server'}); sign_in(); pg.evaluate("localStorage.setItem('culmera.reg.u1','1')")
    ST['br'] = {'id': 'b1', 'ref': 'CB-ABCD1234', 'status': 'submitted', 'answers': {}, 'selected_types': [], 'updated_at': 'x', 'submitted_at': '2026-11-21T10:00:00Z'}
    pg.goto(BASE + '#/meeting'); pg.reload(); pg.wait_for_selector('.cal', timeout=5000); w(200)
    pg.click('button[data-mt=next]'); pg.click('button.cd[data-day$="-18"]'); pg.select_option('#mth2', '11'); pg.click('#mtbtn'); pg.wait_for_selector('.pill.requested', timeout=4000); w(800)
    q = queue(); ok(len(q) == 1 and q[0]['e'] == 'meeting' and q[0]['id'] == 'm1' and q[0]['n'] == 1, 'a failed call stays in the queue (ids only) and counts the attempt')
    ok(json.dumps(q).count('@') == 0 and 'Test Client' not in json.dumps(q), 'the queue holds no personal data')
    ST['api'] = 200; ST['api_body'] = {'ok': True, 'sent': 3}; n = len(notes); pg.goto(BASE + '#/account'); pg.reload(); pg.wait_for_selector('#acct h2', timeout=5000); w(1200)
    ok(any(x['body'] == {'event': 'meeting', 'id': 'm1'} for x in notes[n:]) and queue() == [], 'the next page load delivers it and empties the queue')

    # 6 server says "retry" (all emails failed) -> kept; says "never" (400/404) -> dropped
    reset(api_body={'ok': True, 'sent': 0, 'retry': True}); sign_in(); pg.evaluate("localStorage.setItem('culmera.reg.u1','1')")
    pg.evaluate("window.CulmeraAuth&&0"); pg.goto(BASE + '#/account'); pg.reload(); pg.wait_for_selector('#acct h2', timeout=5000)
    pg.evaluate("localStorage.setItem('culmera.notify',JSON.stringify([{e:'brief_submitted',id:'b9',u:'u1',t:Date.now(),n:0}]))"); pg.reload(); pg.wait_for_selector('#acct h2', timeout=5000); w(900)
    q = queue(); ok(len(q) == 1 and q[0]['n'] == 1, 'ok:true with retry:true keeps the item for another try')
    ST['api'] = 404; ST['api_body'] = {'ok': False, 'code': 'missing'}; pg.reload(); pg.wait_for_selector('#acct h2', timeout=5000); w(900)
    ok(queue() == [], 'a 404 (the server will never accept it) drops the item instead of retrying forever')
    pg.evaluate("localStorage.setItem('culmera.notify',JSON.stringify([{e:'meeting',id:'m1',u:'u1',t:Date.now()-4*864e5,n:0},{e:'meeting',id:'m2',u:'u1',t:Date.now(),n:6},{e:'meeting',id:'m3',u:'someone-else',t:Date.now(),n:0}]))")
    ST['api'] = 503; n = len(notes); pg.reload(); pg.wait_for_selector('#acct h2', timeout=5000); w(900)
    q = queue(); ok(all(x['id'] != 'm1' and x['id'] != 'm2' for x in q) and not any(x['body'] and x['body'].get('id') == 'm3' for x in notes[n:]), 'items older than 3 days or tried 6 times are dropped, and another account\'s items are never sent with this token')
    ok(any(x['id'] == 'm3' for x in q), 'another account\'s item stays until that account signs in')

    ok(not errs, 'no JavaScript errors %s' % errs[:2])
    pg.screenshot(path='/home/claude/shots/notify-account-1280.png')
    b.close()
print('\n%d failed' % len(fails))
raise SystemExit(1 if fails else 0)
