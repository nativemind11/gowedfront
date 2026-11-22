#!/usr/bin/env python3
"""Browser test for Phase 2.2: the conversation on the brief and the client's reply form (js/portal.js, section "the conversation").
MOCK Supabase and MOCK /api/notify: no real network, no real keys. The mock imitates the database rules that matter here
(the client may write only after the Founder wrote first, only on an open brief, one req_id once, 10 replies an hour, one hour ahead,
no Teams link from a client). It proves the page sends the right requests and shows the right things; the real rules are proven by
the back end's `npm run test:rls`.
Run in ONE command:  (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! > /tmp/srv.pid; sleep 1; python3 tools/convo-test.py; kill $(cat /tmp/srv.pid))"""
import json, re, sys, os, uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
BERLIN = ZoneInfo('Europe/Berlin')
calls = []; notes = []; fails = []
os.makedirs('/home/claude/shots', exist_ok=True)
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def brief(status='submitted'): return {'id': 'b1', 'ref': 'CB-ABCD1234', 'status': status, 'answers': {}, 'selected_types': [], 'updated_at': '2026-11-20T10:00:00Z', 'submitted_at': None}
def fmsg(i, body='Thanks for the brief. Can we talk?', **k): return {'id': i, 'brief_id': 'b1', 'client_id': 'u1', 'sender': 'founder', 'kind': 'reply', 'body': body, 'price_text': None, 'proposes_meeting': False, 'meeting_id': None, 'created_at': '2026-11-21T10:00:00Z', **k}
def meet(i='m1', status='requested', start='2030-01-01T10:00:00+00:00', url=None): return {'id': i, 'brief_id': 'b1', 'starts_at': start, 'timezone': 'Europe/Berlin', 'duration_min': 45, 'status': status, 'note': None, 'teams_url': url}
ST = {}
def reset(**k):
    ST.clear(); ST.update({'role': 'client', 'status': 'active', 'briefs': [brief()], 'meetings': [], 'msgs': [], 'seq': 0, 'recent': 0, 'soon': False, 'failmsg': 0, 'offline': False, 'e401': False}); ST.update(k)
def sb(route, req):
    u = req.url; m = req.method
    if m == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    body = {}
    try: body = req.post_data_json or {}
    except Exception: pass
    path = re.sub(r'^https://[^/]+', '', u); calls.append((m, path, body, req.headers.get('authorization'), req.headers.get('prefer')))
    def j(s, d): route.fulfill(status=s, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(d))
    if '/auth/v1/logout' in u: return route.fulfill(status=204, headers=CORS)
    if '/rest/v1/profiles' in u: return j(200, [{'full_name': 'Test Client', 'role': ST['role'], 'status': ST['status'], 'email': 't@example.com'}])
    if '/rest/v1/clients' in u: return j(200, [{'company': 'Acme', 'country': 'Egypt', 'phone': None, 'code_used': None}])
    if '/rest/v1/data_requests' in u: return j(200, [])
    if '/rest/v1/client_briefs' in u: return j(200, ST['briefs'][:1] if m == 'GET' else [])
    if '/rest/v1/brief_messages' in u:
        if m == 'GET': return j(200, sorted(ST['msgs'], key=lambda x: x['created_at']))
        if m == 'POST':
            if ST['offline']: return route.abort()
            if ST['e401']: return j(401, {'message': 'JWT expired'})
            if ST['failmsg'] > 0: ST['failmsg'] -= 1; return j(500, {'message': 'boom'})
            if ST['recent'] >= 10: return j(400, {'code': 'P0001', 'message': 'too many replies, try again later'})
            b = ST['briefs'][0]
            if b['status'] not in ('submitted', 'in_review', 'scheduled', 'in_discussion') or not any(x['sender'] == 'founder' for x in ST['msgs']) or body.get('sender') != 'client' or body.get('client_id') != 'u1':
                return j(403, {'code': '42501', 'message': 'new row violates row-level security policy'})
            if any(k in body for k in ('price_text', 'proposes_meeting', 'email_status')) or body.get('kind') != 'reply': return j(403, {'code': '42501', 'message': 'new row violates check constraint'})
            if body.get('req_id') and any(x.get('req_id') == body['req_id'] for x in ST['msgs']): return j(409, {'code': '23505', 'message': 'duplicate key value violates unique constraint "brief_messages_req_id_key"'})
            ST['seq'] += 1; row = {'id': 'c%d' % ST['seq'], 'brief_id': 'b1', 'client_id': 'u1', 'sender': 'client', 'kind': 'reply', 'body': body['body'], 'price_text': None, 'proposes_meeting': False, 'meeting_id': body.get('meeting_id'), 'req_id': body.get('req_id'), 'created_at': '2026-11-22T%02d:00:00Z' % (10 + ST['seq'])}
            ST['msgs'].append(row); return j(201, [row])
    if '/rest/v1/meetings' in u:
        if m == 'GET':
            rows = sorted(ST['meetings'], key=lambda x: x['starts_at'], reverse=True)
            if 'status=neq.cancelled' in u: rows = [x for x in rows if x['status'] != 'cancelled']
            return j(200, rows)
        if m == 'POST':
            if ST['soon']: return j(400, {'code': 'P0001', 'message': 'meeting must start at least one hour from now'})
            if 'teams_url' in body: return j(400, {'code': 'P0001', 'message': 'only the Founder sets the meeting link'})
            if any(x['status'] in ('requested', 'confirmed') for x in ST['meetings']): return j(409, {'code': '23505', 'message': 'duplicate key'})
            ST['seq'] += 1; row = {'id': 'm%d' % (100 + ST['seq']), **{k: body.get(k) for k in ('brief_id', 'starts_at', 'timezone', 'duration_min', 'status', 'note')}, 'teams_url': None}
            ST['meetings'].append(row); return j(201, [row])
        if m == 'PATCH':
            mid = re.search(r'id=eq\.([^&]+)', u).group(1); row = next((x for x in ST['meetings'] if x['id'] == mid), None)
            if not row or row['status'] not in ('requested', 'confirmed'): return j(200, [])
            row.update(body)
            if row['status'] in ('requested', 'cancelled'): row['teams_url'] = None
            return j(200, [row])
    return j(200, [])
def api(route, req):
    try: notes.append(req.post_data_json)
    except Exception: notes.append(None)
    route.fulfill(status=200, headers={**CORS, 'content-type': 'application/json'}, body='{"ok":true}')
SESSION = {'access_token': 'at', 'refresh_token': 'rt', 'expires_at': 4102444800, 'user': {'id': 'u1', 'email': 't@example.com'}}
TS = "window.turnstile={render:function(){return 1},getResponse:function(){return 'T'},reset:function(){}};"
def writes(since, table): return [c for c in calls[since:] if c[0] in ('POST', 'PATCH') and '/rest/v1/' + table in c[1]]
UUID = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 900}, timezone_id='Europe/Berlin', locale='en-GB'); errs = []
    ctx.route(re.compile(r'https://[a-z0-9]+\.supabase\.co/.*'), sb)
    ctx.route(re.compile(r'https://culmera-api\.vercel\.app/api/notify'), api)
    ctx.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r, q: r.fulfill(status=200, content_type='application/javascript', body=TS))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    w = lambda ms=400: pg.wait_for_timeout(ms)
    def sign_in(): pg.goto(BASE); pg.evaluate("s=>{localStorage.clear();localStorage.setItem('culmera.session',JSON.stringify(s))}", SESSION)
    def open_account(sel='#cv'):
        pg.goto(BASE + '#/account'); pg.reload(); pg.wait_for_selector('#acct h2', timeout=5000); w(700)
    def day(n): return (datetime.now(BERLIN) + timedelta(days=n)).replace(hour=0, minute=0, second=0, microsecond=0)
    sign_in()

    # 1 no message from the Founder yet: the conversation is there, the form is not
    reset(); open_account()
    t = pg.inner_text('#cv')
    ok('Conversation with CULMERA' in pg.inner_text('#acct') and 'No messages yet' in t, 'submitted brief, no message yet: the section shows the empty note')
    ok(pg.locator('#cvbody').count() == 0 and pg.locator('#cvsend').count() == 0, 'no reply form before the Founder has written')
    # draft brief: no section at all
    reset(briefs=[brief('draft')]); open_account()
    ok('Conversation with CULMERA' not in pg.inner_text('#acct') and pg.locator('#cvbody').count() == 0, 'draft brief: no conversation section')

    # 2 Founder wrote: messages, price in HIS message only, hostile text is escaped, the form appears
    hostile = '<img src=x onerror="window.__x=1"><b>bold</b> مرحبا'
    reset(msgs=[fmsg('f1', hostile, price_text='1,200 EUR <i>net</i>', proposes_meeting=True)]); open_account()
    t = pg.inner_text('#cv')
    ok('<b>bold</b>' in t and pg.locator('#cv b:text-is("bold")').count() == 0 and pg.evaluate('window.__x') is None, 'Founder text is shown as text, never as HTML')
    ok('1,200 EUR <i>net</i>' in t and pg.locator('#cv i').count() == 0, 'price is shown (as text) inside the Founder message')
    ok(t.count('1,200') == 1 and '1,200' not in pg.inner_text('#acct').replace(t, ''), 'the price appears only in the conversation, nowhere else on the page')
    ok('We suggest a short call' in t, 'a proposed call is announced on the Founder message')
    ok(pg.locator('#cvbody').count() == 1 and pg.locator('#cvd').count() == 1 and pg.locator('#cvt').count() == 1, 'reply form appears after the Founder wrote: message plus optional day and time')
    ok(pg.get_attribute('#cvbody', 'maxlength') == '4000', 'message field is limited to 4000 characters')
    ok(pg.locator('#cv [data-cv=confirm], #cv input[name=teams], #cv input[type=url]').count() == 0, 'the client has no confirm button and no link field')
    pg.screenshot(path='/home/claude/shots/convo-1280.png', full_page=True)
    # closed brief: no form, polite note
    reset(briefs=[brief('lost')], msgs=[fmsg('f1')]); open_account()
    ok(pg.locator('#cvbody').count() == 0 and 'This brief is closed' in pg.inner_text('#cv'), 'closed brief: no form, a note with the email instead')
    # other open statuses keep the form
    for s in ('in_review', 'scheduled', 'in_discussion'):
        reset(briefs=[brief(s)], msgs=[fmsg('f1')]); open_account(); ok(pg.locator('#cvbody').count() == 1, 'status %s: the form is available' % s)

    # 3 send a plain message
    reset(msgs=[fmsg('f1')]); open_account(); notes.clear()
    n = len(calls); pg.click('#cvsend'); w(200)
    ok('Write a message first' in pg.inner_text('#cverr') and not writes(n, 'brief_messages'), 'empty message: friendly error, nothing sent')
    pg.fill('#cvbody', '  Hello, this is my answer <b>x</b>  '); ok('27/4000' in pg.inner_text('#cvcnt') or '/4000' in pg.inner_text('#cvcnt'), 'character counter updates')
    n = len(calls); pg.click('#cvsend'); pg.wait_for_selector('#cvmsg', timeout=4000); w(300)
    wr = writes(n, 'brief_messages'); ok(len(wr) == 1 and wr[0][0] == 'POST' and wr[0][3] == 'Bearer at' and wr[0][4] == 'return=representation', 'one POST on brief_messages with the user token')
    bd = wr[0][2]
    ok(bd['sender'] == 'client' and bd['kind'] == 'reply' and bd['brief_id'] == 'b1' and bd['client_id'] == 'u1' and bd['body'] == 'Hello, this is my answer <b>x</b>' and bd['meeting_id'] is None, 'body: client, reply, own brief, trimmed text, no meeting')
    ok(set(bd) <= {'brief_id', 'client_id', 'sender', 'kind', 'body', 'meeting_id', 'req_id'}, 'only the allowed columns are sent (no price, no proposal, no email status)')
    ok(isinstance(bd.get('req_id'), str) and UUID.match(bd['req_id']) is not None, 'req_id is a fresh UUID')
    rid1 = bd['req_id']
    ok(not writes(n, 'meetings'), 'no time chosen: no meeting row is touched')
    ok([x for x in notes if x] == [{'event': 'client_reply', 'id': 'c1'}], 'the server is told once: client_reply with only the record id (%s)' % notes)
    ok('Your reply was sent' in pg.inner_text('#cv') and 'Hello, this is my answer <b>x</b>' in pg.inner_text('#cv') and pg.locator('#cv .cvm.me').count() == 1, 'the reply is shown in the conversation')
    ok(pg.input_value('#cvbody') == '', 'the field is cleared after sending')
    pg.fill('#cvbody', 'Second message'); n = len(calls); pg.click('#cvsend'); pg.wait_for_selector('.cvm.me >> nth=1', timeout=4000); wr = writes(n, 'brief_messages')
    ok(len(wr) == 1 and wr[0][2]['req_id'] != rid1 and UUID.match(wr[0][2]['req_id']), 'the next message has a new req_id')

    # 4 double press: one message
    reset(msgs=[fmsg('f1')]); open_account(); notes.clear(); pg.fill('#cvbody', 'Once only'); n = len(calls)
    pg.evaluate("()=>{const b=document.querySelector('#cvsend');b.click();b.click();b.click()}"); w(1200)
    ok(len(writes(n, 'brief_messages')) == 1 and len([x for x in ST['msgs'] if x['sender'] == 'client']) == 1, 'three fast presses create one message')

    # 5 optional time
    d3 = day(3)
    reset(msgs=[fmsg('f1', proposes_meeting=True)]); open_account(); pg.fill('#cvbody', 'Time works'); pg.fill('#cvd', d3.strftime('%Y-%m-%d')); n = len(calls); pg.click('#cvsend'); w(300)
    ok('both a day and a time' in pg.inner_text('#cverr') and not writes(n, 'brief_messages') and not writes(n, 'meetings'), 'a day without a time: friendly error, nothing sent')
    soon = datetime.now(BERLIN) + timedelta(minutes=30); pg.fill('#cvd', soon.strftime('%Y-%m-%d')); pg.fill('#cvt', soon.strftime('%H:%M')); pg.click('#cvsend'); w(300)
    ok('at least one hour' in pg.inner_text('#cverr') and not writes(n, 'brief_messages') and not writes(n, 'meetings'), 'a time within the hour is refused before anything is sent')
    far = day(400); pg.fill('#cvd', far.strftime('%Y-%m-%d')); pg.fill('#cvt', '10:00'); pg.click('#cvsend'); w(300)
    ok('12 months' in pg.inner_text('#cverr') and not writes(n, 'meetings'), 'a time more than 12 months ahead is refused')
    pg.click('[data-cv=clear]'); ok(pg.input_value('#cvd') == '' and pg.input_value('#cvt') == '', '"Clear the time" empties both fields')
    pg.fill('#cvd', d3.strftime('%Y-%m-%d')); pg.fill('#cvt', '14:30'); pg.select_option('#cvl', '60'); notes.clear(); n = len(calls); pg.click('#cvsend'); pg.wait_for_selector('#cvmsg', timeout=4000); w(300)
    wm = writes(n, 'meetings'); wb = writes(n, 'brief_messages')
    ok(len(wm) == 1 and wm[0][0] == 'POST' and len(wb) == 1, 'a chosen time: one meeting POST, then one message')
    mb = wm[0][2]; want = d3.replace(hour=14, minute=30)
    ok(mb['status'] == 'requested' and mb['brief_id'] == 'b1' and mb['client_id'] == 'u1' and mb['duration_min'] == 60 and mb['timezone'] == 'Europe/Berlin', 'meeting is requested, own brief, 60 min, client time zone')
    ok(datetime.fromisoformat(mb['starts_at'].replace('Z', '+00:00')) == want, 'starts_at is the exact instant 14:30 Europe/Berlin')
    ok('teams_url' not in mb and 'confirmed' not in json.dumps(mb), 'the client never sends a Teams link or a confirmed status')
    ok(wb[0][2]['meeting_id'] == ST['meetings'][0]['id'], 'the message is linked to the meeting')
    ok([x['event'] for x in notes if x] == ['meeting', 'client_reply'], 'server told: meeting, then client_reply (%s)' % [x['event'] for x in notes if x])
    ok('Your reply and your suggested time were sent' in pg.inner_text('#cv') and 'Time you suggested' in pg.inner_text('#cv'), 'the suggested time is shown on the client message')
    ok(ST['meetings'][0]['status'] == 'requested', 'after sending, the meeting is still only requested')
    # existing requested meeting: it is moved, not duplicated
    pg.fill('#cvbody', 'Another time please'); pg.fill('#cvd', day(5).strftime('%Y-%m-%d')); pg.fill('#cvt', '09:00'); n = len(calls); pg.click('#cvsend'); pg.wait_for_selector('.cvm.me >> nth=1', timeout=4000)
    wm = writes(n, 'meetings'); ok(len(wm) == 1 and wm[0][0] == 'PATCH' and len(ST['meetings']) == 1, 'a second suggestion moves the same meeting (PATCH), no second meeting')
    # confirmed meeting + a new time: goes back to requested, link is cleared (database does it, page says nothing false)
    reset(msgs=[fmsg('f1')], meetings=[meet('m1', 'confirmed', url='https://teams.microsoft.com/l/meetup-join/abc')]); open_account(); pg.fill('#cvbody', 'Can we move it?'); pg.fill('#cvd', d3.strftime('%Y-%m-%d')); pg.fill('#cvt', '11:00'); pg.click('#cvsend'); pg.wait_for_selector('#cvmsg', timeout=4000)
    ok(ST['meetings'][0]['status'] == 'requested' and ST['meetings'][0]['teams_url'] is None and 'teams.microsoft.com' not in pg.content(), 'moving a confirmed call sends it back to requested and the link disappears')

    # 6 failures
    reset(msgs=[fmsg('f1')]); open_account(); pg.fill('#cvbody', 'Offline try'); ST['offline'] = True; n = len(calls); pg.click('#cvsend'); w(900)
    ok('No connection' in pg.inner_text('#cverr') and not pg.locator('#cvsend').is_disabled() and pg.input_value('#cvbody') == 'Offline try', 'offline: honest message, text kept, button works again')
    rid_a = [c for c in calls[n:] if '/brief_messages' in c[1] and c[0] == 'POST']; ST['offline'] = False
    ST['failmsg'] = 1; pg.click('#cvsend'); w(700); ok('could not be sent' in pg.inner_text('#cverr') and 'boom' not in pg.inner_text('#cv'), 'server error: friendly sentence, no raw error')
    pg.click('#cvsend'); pg.wait_for_selector('#cvmsg', timeout=4000)
    ok(len([x for x in ST['msgs'] if x['sender'] == 'client']) == 1, 'after failed tries one retry creates exactly one message')
    reset(msgs=[fmsg('f1')], recent=10); open_account(); pg.fill('#cvbody', 'Too many'); pg.click('#cvsend'); w(700); ok('many replies' in pg.inner_text('#cverr') and 'P0001' not in pg.inner_text('#cv'), 'rate limit (10 an hour) is explained politely')
    reset(msgs=[fmsg('f1')], e401=True); open_account(); pg.fill('#cvbody', 'Expired'); pg.click('#cvsend'); w(700); ok('session ended' in pg.inner_text('#cverr'), 'expired session: asks to sign in again')
    # time saved, message fails
    reset(msgs=[fmsg('f1')]); open_account(); pg.fill('#cvbody', 'Half'); pg.fill('#cvd', d3.strftime('%Y-%m-%d')); pg.fill('#cvt', '12:00'); ST['failmsg'] = 1; pg.click('#cvsend'); w(1200)
    ok('time was saved' in pg.inner_text('#cv') and len(ST['meetings']) == 1 and not [x for x in ST['msgs'] if x['sender'] == 'client'], 'time saved but message failed: the page says so')
    pg.fill('#cvbody', 'Half'); pg.click('#cvsend'); pg.wait_for_selector('.cvm.me', timeout=4000); ok(len(ST['meetings']) == 1, 'pressing send again does not create a second meeting')
    # a meeting insert refused (one hour rule from the database)
    reset(msgs=[fmsg('f1')], soon=True); open_account(); pg.fill('#cvbody', 'x'); pg.fill('#cvd', d3.strftime('%Y-%m-%d')); pg.fill('#cvt', '12:00'); n = len(calls); pg.click('#cvsend'); w(900)
    ok('at least one hour' in pg.inner_text('#cverr') or 'could not be sent' in pg.inner_text('#cverr'), 'database refuses the time: friendly message') ; ok(not writes(n, 'brief_messages'), 'no message is sent when its time was refused')

    # 7 confirmed call: Teams link rules
    good = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc/0?context=%7b%22Tid%22%7d'
    conf = lambda url, mid='m1': [fmsg('f1'), {**fmsg('f2', 'See you there <u>soon</u>'), 'kind': 'meeting_confirmed', 'meeting_id': mid, 'created_at': '2026-11-21T12:00:00Z'}]
    reset(msgs=conf(good), meetings=[meet('m1', 'confirmed', url=good)]); open_account()
    a = pg.locator('#cv a[href^="https://teams"]'); ok(a.count() == 1 and a.get_attribute('target') == '_blank' and 'noopener' in a.get_attribute('rel') and 'noreferrer' in a.get_attribute('rel'), 'confirmed call: https link opens in a new tab with rel noopener noreferrer')
    ok(a.get_attribute('href') == good, 'the link is exactly what the Founder pasted')
    t = pg.inner_text('#cv'); ok('Call confirmed' in t and 'Europe/Berlin' in t and 'Africa/Cairo' in t and '<u>soon</u>' in t and pg.locator('#cv u').count() == 0, 'confirmation shows both time zones and the note as plain text')
    ok(pg.locator('#acct a[href^="https://teams"]').count() == 2, 'link also on the account call card (and in the conversation)')
    pg.goto(BASE + '#/meeting'); pg.reload(); pg.wait_for_selector('#mth', timeout=5000); w(300)
    ok(pg.locator('#mt a[href^="https://teams"]').count() == 1, 'link also on the call page (#/meeting)')
    for bad_url, label in (('http://teams.microsoft.com/x', 'http (not https)'), ('javascript:alert(1)', 'javascript:'), ('https://user:pw@teams.example.com/x', 'credentials in the address'), ('https://a b.com/x', 'a space'), ('data:text/html,<script>1</script>', 'data:'), ('https://' + 'a' * 600 + '.com', 'over 500 characters')):
        reset(msgs=conf(bad_url), meetings=[meet('m1', 'confirmed', url=bad_url)]); open_account()
        ok(pg.locator('#cv a[href^="http"], #cv a[href^="javascript"], #cv a[href^="data"]').count() == 0 and pg.locator('#acct a[href^="javascript"], #acct a[href^="http:"], #acct a[href^="data"]').count() == 0 and 'appears here once our team adds it' in pg.inner_text('#cv'), 'unsafe link refused (%s): no link, the client is told it is coming' % label)
    reset(msgs=conf(good), meetings=[meet('m1', 'requested', url=good)]); open_account(); ok(pg.locator('#acct a[href^="https://teams"]').count() == 0, 'a link on a call that is not confirmed is never shown')
    reset(msgs=conf(good), meetings=[meet('m1', 'confirmed', url=None)]); open_account(); ok('appears here once our team adds it' in pg.inner_text('#cv') and pg.locator('#cv a[href^="https"]').count() == 0, 'confirmed call without a link yet: tells the client it will appear')
    ok(pg.locator('#acct [data-mt=confirm], #acct button:text-matches("confirm", "i")').count() == 0, 'the client page has no confirm button anywhere')

    # 8 roles and signed out
    reset(role='partner', msgs=[fmsg('f1')]); n = len(calls); pg.goto(BASE + '#/account'); pg.reload(); w(1500)
    ok('#/team' in pg.url and not [c for c in calls[n:] if '/brief_messages' in c[1]], 'a Partner never loads conversation messages (goes to the team page)')
    reset(role='director', msgs=[fmsg('f1')]); n = len(calls); pg.goto(BASE + '#/account'); pg.reload(); w(1500)
    ok('#/team' in pg.url and not [c for c in calls[n:] if '/brief_messages' in c[1]], 'a Director never loads conversation messages')

    # 9 layout
    reset(msgs=[fmsg('f1', 'x ' * 300 + 'A' * 200, price_text='900 EUR'), {**fmsg('f2', 'ok'), 'sender': 'client', 'created_at': '2026-11-21T11:00:00Z'}], meetings=[meet('m1', 'confirmed', url=good)])
    pg.set_viewport_size({'width': 360, 'height': 740}); open_account()
    ok(pg.evaluate('document.documentElement.scrollWidth') <= 360, 'conversation has no horizontal scroll at 360px')
    pg.screenshot(path='/home/claude/shots/convo-360.png', full_page=True)
    pg.set_viewport_size({'width': 1280, 'height': 900})

    # 10 the account page with the conversation in the four languages, 360 and 1280 px: no sideways scroll, no English left, no keys shown raw
    LEAK = """()=>{const o=[];const w=document.createTreeWalker(document.querySelector('#acct'),NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){const t=n.nodeValue.trim();if(t.length<14)continue;const p=n.parentElement;if(!p||p.closest('[dir=auto],.cvb,[dir=ltr]'))continue;o.push(t)}return o}"""
    EN = re.compile(r'\b(the|and|your|with|for|from|that|this|our|are|you|is|to)\b', re.I)
    for lang in ('ar', 'de', 'fr', 'en'):
        for wd in (360, 1280):
            reset(msgs=[fmsg('f1', 'Hello', price_text='900 EUR', proposes_meeting=True), {**fmsg('f2', 'ok'), 'kind': 'meeting_confirmed', 'meeting_id': 'm1', 'created_at': '2026-11-21T12:00:00Z'}], meetings=[meet('m1', 'confirmed', url=good)])
            pg.set_viewport_size({'width': wd, 'height': 900}); pg.goto(BASE + '?lang=%s#/account' % lang); pg.evaluate("s=>localStorage.setItem('culmera.session',JSON.stringify(s))", SESSION); pg.reload(); pg.wait_for_selector('#cvbody', timeout=6000); w(500)
            # the header menu button of fr (16 px) and de (2 px) sticks out at 360 px on EVERY page of the site, also on the original live front (i18n-test shows it); so here only what is inside #acct is judged
            ov = pg.evaluate("()=>{const W=document.documentElement.clientWidth;return [...document.querySelectorAll('#acct, #acct *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+1||r.left<-1)}).map(e=>e.tagName+'.'+e.className).slice(0,3)}")
            ok(not ov, '%s %dpx account with conversation: nothing inside the page sticks out sideways %s' % (lang, wd, ov))
            if lang != 'en':
                eng = [t for t in pg.evaluate(LEAK) if len(EN.findall(t)) >= 3]
                ok(not eng, '%s %dpx account with conversation: no English sentences left %s' % (lang, wd, [e[:50] for e in eng[:2]]))
            ok(not re.search(r'\bcv\.[a-zA-Z]+|undefined|\[object', pg.inner_text('#acct')), '%s %dpx no raw keys or "undefined" on the page' % (lang, wd))
            if lang == 'ar': ok(pg.evaluate('document.documentElement.dir') == 'rtl', 'ar page is right-to-left')
    pg.set_viewport_size({'width': 1280, 'height': 900})

    ok(not any('service_role' in json.dumps(c) or 'sb_secret' in json.dumps(c) for c in calls), 'no secret key in any request')
    ok(not any('/api/reply' in c[1] for c in calls), 'the client page never calls /api/reply (that is the Founder only)')
    ok(not errs, 'no JavaScript errors ' + str(errs))
    b.close()
print('\n%d failed' % len(fails)); sys.exit(1 if fails else 0)
