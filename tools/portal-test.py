#!/usr/bin/env python3
"""Browser test for Phase 3.3 (meeting booking) and 3.4 (status timeline, pricing, data requests) with a MOCK Supabase.
No real network, no real keys. The mock imitates the database rules (one hour ahead, one active meeting per brief,
zero rows when the team has moved a record on). It proves the page sends the right requests; the real rules are proven by
the back end's `npm run test:rls`.
Run in ONE command:  (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! > /tmp/srv.pid; sleep 1; python3 tools/portal-test.py; kill $(cat /tmp/srv.pid))"""
import json, re, sys, os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
BERLIN = ZoneInfo('Europe/Berlin'); CAIRO = ZoneInfo('Africa/Cairo')
calls = []; fails = []
os.makedirs('/home/claude/shots', exist_ok=True)
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def brief(status='submitted', **k): return {'id': 'b1', 'ref': 'CB-ABCD1234', 'status': status, 'answers': {}, 'selected_types': [], 'updated_at': '2026-11-20T10:00:00Z', 'submitted_at': None, **k}
ST = {}
def reset(**k):
    ST.clear(); ST.update({'role': 'client', 'status': 'active', 'briefs': [brief()], 'meetings': [], 'reqs': [], 'lock': False, 'soon': False, 'dup': False, 'noreq': False, 'seq': 0}); ST.update(k)
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
    if '/rest/v1/client_briefs' in u:
        if m == 'GET': return j(200, ST['briefs'])
        return j(200, [])
    if '/rest/v1/meetings' in u:
        if m == 'GET':
            rows = sorted(ST['meetings'], key=lambda x: x['starts_at'], reverse=True)
            if 'status=neq.cancelled' in u: rows = [x for x in rows if x['status'] != 'cancelled']
            return j(200, rows)
        if m == 'POST':
            if ST['dup']:
                ST['meetings'].append({'id': 'm0', 'brief_id': 'b1', 'starts_at': '2030-01-01T10:00:00+00:00', 'timezone': 'UTC', 'duration_min': 30, 'status': 'requested', 'note': None})
                return j(409, {'code': '23505', 'message': 'duplicate key value violates unique constraint "meetings_one_active_per_brief"'})
            if ST['soon']: return j(400, {'code': 'P0001', 'message': 'meeting must start at least one hour from now'})
            if body.get('client_id') != 'u1': return j(403, {'code': '42501', 'message': 'new row violates row-level security policy'})
            if any(x['status'] in ('requested', 'confirmed') for x in ST['meetings']): return j(409, {'code': '23505', 'message': 'duplicate key'})
            ST['seq'] += 1; row = {'id': 'm%d' % ST['seq'], **{k: body.get(k) for k in ('brief_id', 'starts_at', 'timezone', 'duration_min', 'status', 'note')}}
            ST['meetings'].append(row); return j(201, [row])
        if m == 'PATCH':
            if ST['soon']: return j(400, {'code': 'P0001', 'message': 'meeting must start at least one hour from now'})
            mid = re.search(r'id=eq\.([^&]+)', u).group(1); row = next((x for x in ST['meetings'] if x['id'] == mid), None)
            if ST['lock'] or not row or row['status'] not in ('requested', 'confirmed'): return j(200, [])
            row.update(body); return j(200, [row])
    if '/rest/v1/data_requests' in u:
        if ST['noreq']: return j(404, {'code': '42P01', 'message': 'relation "public.data_requests" does not exist'})
        if m == 'GET': return j(200, ST['reqs'])
        if m == 'POST':
            if any(x['kind'] == body.get('kind') and x['status'] in ('open', 'in_progress') for x in ST['reqs']): return j(409, {'code': '23505', 'message': 'duplicate'})
            row = {'id': 'r%d' % (len(ST['reqs']) + 1), 'kind': body.get('kind'), 'status': 'open', 'created_at': '2026-11-21T10:00:00Z'}
            ST['reqs'].append(row); return j(201, [row])
    return j(200, [])
SESSION = {'access_token': 'at', 'refresh_token': 'rt', 'expires_at': 4102444800, 'user': {'id': 'u1', 'email': 't@example.com'}}
TS = "window.turnstile={render:function(){return 1},getResponse:function(){return 'T'},reset:function(){}};"
def writes(since, table): return [c for c in calls[since:] if c[0] in ('POST', 'PATCH') and '/' + table in c[1]]
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 800}, timezone_id='Europe/Berlin', locale='en-GB'); errs = []
    ctx.route(re.compile(r'https://[a-z0-9]+\.supabase\.co/.*'), sb)
    ctx.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r, q: r.fulfill(status=200, content_type='application/javascript', body=TS))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:150]))
    w = lambda ms=400: pg.wait_for_timeout(ms)
    def sign_in(): pg.goto(BASE); pg.evaluate("s=>localStorage.setItem('culmera.session',JSON.stringify(s))", SESSION)
    def open_meeting(sel='#mth'): pg.goto(BASE + '#/meeting'); pg.reload(); pg.wait_for_selector(sel, timeout=5000); w(200)
    def open_account(): pg.goto(BASE + '#/account'); pg.reload(); pg.wait_for_selector('#acct h2', timeout=5000); w(500)
    now = datetime.now(timezone.utc).astimezone(BERLIN); nm = (now.replace(day=1) + timedelta(days=32)).replace(day=1)

    # 1 signed out -> sign-in page, never a booking
    reset(); pg.goto(BASE); pg.evaluate("localStorage.clear()"); pg.goto(BASE + '#/meeting'); pg.reload(); w(800)
    ok(pg.locator('#fin').count() == 1, 'visitor opening #/meeting is sent to sign in')
    ok(not any('/meetings' in c[1] for c in calls), 'visitor never touches meetings')
    ok(pg.locator('meta[name=robots][content*=noindex]').count() == 0, 'sign-in page itself stays indexable')

    # 2 gates
    sign_in(); reset(briefs=[]); open_meeting()
    ok('Start your brief first' in pg.inner_text('#mt') and pg.locator('.cal').count() == 0, 'no brief: asked to start one, no calendar')
    ok(pg.locator('meta[name=robots][content*=noindex]').count() == 1, '#/meeting is noindex')
    reset(briefs=[brief('draft')]); open_meeting(); ok('Submit your brief first' in pg.inner_text('#mt') and pg.locator('.cal').count() == 0, 'draft brief: asked to submit first, no calendar')
    reset(briefs=[brief('lost')]); open_meeting(); ok('Booking is closed' in pg.inner_text('#mt') and 'Closed' in pg.inner_text('#mt') and 'CB-ABCD1234' in pg.inner_text('#mt'), 'closed brief: friendly message with status and reference')
    reset(role='director'); open_meeting(); ok('Booking is for client accounts' in pg.inner_text('#mt') and pg.locator('.cal').count() == 0, 'staff roles get no booking page')
    reset(status='suspended'); pg.goto(BASE + '#/meeting'); pg.reload(); w(1200); ok(pg.locator('#fin').count() == 1, 'suspended account is signed out')
    sign_in()

    # 3 the picker: accessible grid, both time zones, past days not available
    reset(); open_meeting('.cal')
    ok(pg.locator('table[role=grid]').count() == 1 and pg.locator('th[scope=col]').count() == 7, 'calendar is a labelled grid with 7 weekday headers')
    ok(pg.locator('.cd[tabindex="0"]').count() == 1, 'exactly one day is in the tab order (roving focus)')
    t = pg.inner_text('#mt'); ok('Europe/Berlin' in t and 'Africa/Cairo' in t, 'client and studio time zones are both shown')
    ok(pg.locator('.cd.off[aria-disabled=true]').count() >= (now.day - 1), 'days before today are marked not available')
    ok(pg.locator('button[data-mt=prev][disabled]').count() == 1, 'cannot browse to months in the past')
    pg.click('button[data-mt=next]'); w(150)
    ok(pg.locator('#calh').inner_text().startswith(nm.strftime('%B')), 'next month opens')
    # no time yet -> friendly message, nothing sent
    pg.click('button.cd[data-day$="-15"]'); n = len(calls); pg.click('#mtbtn'); w(200)
    ok('Please choose a time' in pg.inner_text('#mterr') and not writes(n, 'meetings'), 'missing time shows a friendly message and sends nothing')
    # choose 14:30 and 60 minutes, add a note
    pg.select_option('#mth2', '14'); ok(pg.input_value('#mtm') == '0', 'choosing an hour defaults the minutes to 00')
    pg.select_option('#mtm', '30'); pg.click('[data-dur="60"]'); pg.fill('#mtnote', 'Please call about the shop <b>launch</b>'); w(150)
    s = pg.inner_text('#mtsum'); want = nm.replace(day=15, hour=14, minute=30, second=0, microsecond=0)
    ok('Your time' in s and 'Studio time' in s and 'Europe/Berlin' in s and 'Africa/Cairo' in s, 'summary shows both zones side by side')
    cairo = want.astimezone(CAIRO); ok(re.search(r'14:30', s) and re.search(cairo.strftime('%H:%M'), s), 'summary shows the same moment in both zones (14:30 Berlin = %s Cairo)' % cairo.strftime('%H:%M'))
    ok(pg.get_attribute('[data-dur="60"]', 'aria-pressed') == 'true', 'chosen length is announced as pressed')
    pg.screenshot(path='/home/claude/shots/meeting-picker-1280.png')
    n = len(calls); pg.click('#mtbtn'); pg.wait_for_selector('.pill.requested', timeout=4000); wr = writes(n, 'meetings')
    ok(len(wr) == 1 and wr[0][0] == 'POST', 'booking sends one POST')
    c = wr[0]; bd = c[2]
    ok(c[3] == 'Bearer at' and c[4] == 'return=representation', 'booking uses the user token')
    ok(bd['brief_id'] == 'b1' and bd['client_id'] == 'u1' and bd['status'] == 'requested' and bd['duration_min'] == 60 and bd['timezone'] == 'Europe/Berlin', 'body: own brief and client, status requested, 60 min, client time zone')
    ok(datetime.fromisoformat(bd['starts_at'].replace('Z', '+00:00')) == want, 'starts_at is the exact instant 14:30 Europe/Berlin in UTC')
    ok(set(bd) <= {'brief_id', 'client_id', 'starts_at', 'timezone', 'duration_min', 'status', 'note'} and 'role' not in bd, 'only the expected columns are sent')
    t = pg.inner_text('#mt'); ok('Your request is saved' in t and 'Requested' in t and 'not confirmed' in t.lower() or 'has not confirmed' in t, 'confirmation says Requested and that the team has not confirmed yet')
    ok('<b>launch</b>' in t and pg.locator('#mt b:text-is("launch")').count() == 0, 'client note is shown as text, never as HTML')
    ok('email' not in pg.inner_text('#mtmsg').lower(), 'no promise of an email (none is sent until Phase 5)')

    # 4 account page shows it; timeline and pricing
    open_account()
    t = pg.inner_text('#acct')
    ok('Your meeting' in t and 'Europe/Berlin' in t and 'Africa/Cairo' in t and 'Requested' in t and 'Manage your meeting' in t, 'account shows the meeting in both zones with status and a manage link')
    ok(pg.locator('.tl li').count() == 6 and pg.locator('.tl li.nw').count() == 1 and 'Submitted' in pg.inner_text('.tl li.nw'), 'timeline: six steps, current step is Submitted')
    ok(pg.locator('.tl li.nw[aria-current=step]').count() == 1 and pg.locator('.tl li.dn').count() == 1, 'timeline marks current step and the completed one for screen readers')
    ok('How pricing works' in t and 'Your first call is free' in t and 'written quote' in t.lower(), 'account has the "How pricing works" block')
    ok(not re.search(r'[$€£]|\bUSD\b|\bEGP\b|best price|cheapest', t), 'no prices or price claims anywhere on the account page')
    ok('Your data' in t and pg.locator('[data-dr=export]').count() == 1 and pg.locator('[data-dr=deletion]').count() == 1, 'account offers export and deletion requests')
    pg.screenshot(path='/home/claude/shots/account-1280.png', full_page=True)

    # 5 reschedule: same row, status stays requested, prefilled
    open_meeting('.pill'); pg.click('[data-mt=edit]'); pg.wait_for_selector('.cal'); w(200)
    ok(pg.input_value('#mth2') == '14' and pg.input_value('#mtm') == '30' and pg.get_attribute('[data-dur="60"]', 'aria-pressed') == 'true' and 'Please call about' in pg.input_value('#mtnote'), 'reschedule opens with the current time, length and note')
    pg.select_option('#mth2', '16'); n = len(calls); pg.click('#mtbtn'); pg.wait_for_selector('text=Your new time is saved', timeout=4000); wr = writes(n, 'meetings')
    ok(len(wr) == 1 and wr[0][0] == 'PATCH' and 'id=eq.m1' in wr[0][1] and wr[0][2]['status'] == 'requested' and wr[0][2]['starts_at'].startswith(want.replace(hour=16).astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M')), 'reschedule PATCHes the same meeting, status stays requested')
    ok(len(ST['meetings']) == 1, 'rescheduling never creates a second meeting')
    # staff confirmed it meanwhile: client change sends it back to requested and says so
    ST['meetings'][0]['status'] = 'confirmed'; open_meeting('.pill'); ok('Confirmed' in pg.inner_text('#mt') and 'confirm again' in pg.inner_text('#mt'), 'confirmed meeting explains that a change needs a new confirmation')
    # zero rows (the team moved it on) -> friendly message, latest state, no raw error
    pg.click('[data-mt=edit]'); pg.wait_for_selector('.cal'); ST['lock'] = True; pg.select_option('#mth2', '17'); pg.click('#mtbtn'); pg.wait_for_selector('#mtmsg', timeout=4000)
    ok('updated this meeting' in pg.inner_text('#mtmsg'), 'a change the database rejects (0 rows) is explained, not hidden')
    ST['lock'] = False

    # 6 cancel with confirmation
    ST['meetings'][0]['status'] = 'requested'; open_meeting('.pill'); pg.click('[data-mt=cancel]'); w(150)
    ok(pg.locator('[data-mt=cancel-yes]').count() == 1 and pg.evaluate("document.activeElement.id") == 'mtkeep', 'cancel asks first and focus lands on the safe button')
    n = len(calls); pg.click('[data-mt=cancel-no]'); w(150); ok(not writes(n, 'meetings') and pg.locator('[data-mt=cancel]').count() == 1, '"Keep it" changes nothing')
    pg.click('[data-mt=cancel]'); pg.click('[data-mt=cancel-yes]'); pg.wait_for_selector('text=is cancelled', timeout=4000); wr = writes(n, 'meetings')
    ok(len(wr) == 1 and wr[0][0] == 'PATCH' and wr[0][2] == {'status': 'cancelled'}, 'cancel sends only status = cancelled')
    ok(pg.locator('.cal').count() == 1, 'after cancelling the client can pick a new time')
    open_account(); ok('No meeting requested yet' in pg.inner_text('#acct') and pg.locator('a[href="#/meeting"]').count() >= 1, 'account shows no active meeting and a Book link after cancelling')

    # 7 server-side one-hour rule is shown as a friendly sentence
    reset(); open_meeting('.cal'); pg.click('button[data-mt=next]'); pg.click('button.cd[data-day$="-20"]'); pg.select_option('#mth2', '10'); ST['soon'] = True; pg.click('#mtbtn'); w(500)
    t = pg.inner_text('#mterr'); ok('at least one hour from now' in t and 'P0001' not in t and 'meeting must start' not in t, 'database one-hour rule appears as a friendly message')
    ST['soon'] = False
    # client-side rule: hours that are too soon today are disabled
    pg.reload(); pg.wait_for_selector('.cal'); td = pg.locator('.cd.tdy')
    if td.get_attribute('aria-disabled') == 'true': ok(True, 'today has no time left at least one hour ahead: day is marked not available')
    else:
        td.click(); hh = now.hour; ok(pg.locator('#mth2 option[value="%d"][disabled]' % hh).count() == 1, 'today: the current hour is disabled (needs at least one hour ahead)')
    # a second active request is refused by the database: shown friendly, existing meeting loaded
    reset(dup=True); open_meeting('.cal'); pg.click('button[data-mt=next]'); pg.click('button.cd[data-day$="-18"]'); pg.select_option('#mth2', '11'); pg.click('#mtbtn'); pg.wait_for_selector('.pill', timeout=4000)
    ok('already have an active meeting request' in pg.inner_text('#mt'), 'duplicate active request: friendly message and the existing one is shown')
    # offline
    reset(); open_meeting('.cal'); pg.click('button[data-mt=next]'); pg.click('button.cd[data-day$="-18"]'); pg.select_option('#mth2', '11'); ctx.route(re.compile(r'https://[a-z0-9]+\.supabase\.co/rest/v1/meetings'), lambda r, q: r.abort())
    pg.click('#mtbtn'); w(800); ok('No connection' in pg.inner_text('#mterr') and not pg.locator('#mtbtn').is_disabled(), 'offline: honest message and the button works again')
    ctx.unroute(re.compile(r'https://[a-z0-9]+\.supabase\.co/rest/v1/meetings')); 

    # 8 keyboard: roving focus in the calendar
    reset(); open_meeting('.cal'); pg.click('button[data-mt=next]'); w(100); pg.locator('.cd[tabindex="0"]').focus(); d0 = pg.evaluate("document.activeElement.dataset.day")
    pg.keyboard.press('ArrowRight'); d1 = pg.evaluate("document.activeElement.dataset.day"); ok(datetime.fromisoformat(d1) - datetime.fromisoformat(d0) == timedelta(days=1), 'ArrowRight moves to the next day')
    pg.keyboard.press('ArrowDown'); d2 = pg.evaluate("document.activeElement.dataset.day"); ok(datetime.fromisoformat(d2) - datetime.fromisoformat(d1) == timedelta(days=7), 'ArrowDown moves one week')
    pg.keyboard.press('PageDown'); d3 = pg.evaluate("document.activeElement.dataset.day"); ok(d3[:7] != d2[:7] and pg.locator('.cd[tabindex="0"]').count() == 1, 'PageDown moves to the next month and keeps one tab stop')
    pg.keyboard.press('PageUp'); pg.keyboard.press('Home'); d4 = pg.evaluate("document.activeElement.dataset.day"); ok(datetime.fromisoformat(d4).weekday() == 0, 'Home goes to the start of the week (Monday)')
    pg.keyboard.press('Enter'); w(150); ok(pg.get_attribute('.cd[data-day="%s"]' % d4, 'aria-pressed') == 'true' and pg.evaluate("document.activeElement.dataset.day") == d4, 'Enter selects the day and focus stays on it')
    pg.keyboard.press('Tab'); ok(pg.evaluate("document.activeElement.id") == 'mth2', 'Tab leaves the grid for the hour field')
    pg.keyboard.press('ArrowLeft') if False else None

    # 9 layout at 360 px
    pg.set_viewport_size({'width': 360, 'height': 740}); reset(); open_meeting('.cal')
    ok(pg.evaluate('document.documentElement.scrollWidth') <= 360, 'booking page has no horizontal scroll at 360px')
    ok(min(pg.evaluate("[...document.querySelectorAll('.cd')].map(e=>e.getBoundingClientRect().width)")) >= 34, 'day buttons stay at least 34px wide at 360px')
    pg.screenshot(path='/home/claude/shots/meeting-picker-360.png', full_page=True)
    open_account(); ok(pg.evaluate('document.documentElement.scrollWidth') <= 360, 'account page has no horizontal scroll at 360px'); pg.screenshot(path='/home/claude/shots/account-360.png', full_page=True)
    pg.set_viewport_size({'width': 1280, 'height': 800})

    # 10 account states
    reset(); open_account(); ok('Book your free call' in pg.inner_text('#acct') and pg.locator('#acct a[href="#/meeting"]').count() == 1, 'submitted brief, no meeting: account offers to book')
    reset(briefs=[brief('draft')]); open_account(); ok('Submit your brief to choose a time' in pg.inner_text('#acct') and pg.locator('#acct a[href="#/meeting"]').count() == 0 and pg.locator('.tl li.nw').inner_text().startswith('1'), 'draft brief: account asks to submit first, timeline starts at Draft')
    reset(briefs=[]); open_account(); ok('Start your brief to choose a time' in pg.inner_text('#acct') and pg.locator('.tl').count() == 0, 'no brief: no timeline, asks to start')
    reset(briefs=[brief('lost')]); open_account(); ok(pg.locator('.tl').count() == 0 and 'closed' in pg.inner_text('#acct').lower(), 'closed brief: shows the closed note instead of the timeline')
    reset(briefs=[brief('in_review')]); open_account(); ok(pg.locator('.tl li.dn').count() == 2 and 'In review' in pg.inner_text('.tl li.nw'), 'in review: two completed steps, current is In review')
    reset(meetings=[{'id': 'm9', 'brief_id': 'b1', 'starts_at': '2030-01-01T10:00:00+00:00', 'timezone': 'UTC', 'duration_min': 30, 'status': 'done', 'note': None}]); open_account(); ok(pg.locator('#acct a[href="#/meeting"]').count() == 0 and 'Done' in pg.inner_text('#acct'), 'a done meeting has no manage button')
    reset(meetings=[{'id': 'm9', 'brief_id': 'b1', 'starts_at': '2030-01-01T10:00:00+00:00', 'timezone': 'UTC', 'duration_min': 30, 'status': 'done', 'note': None}]); open_meeting(); ok('This call has taken place' in pg.inner_text('#mt') and pg.locator('.cal').count() == 0, 'after a done call the page does not offer another booking')
    reset(role='partner'); pg.goto(BASE + '#/account'); pg.reload(); w(1200); ok('#/team' in pg.url and pg.locator('.tl').count() == 0 and pg.locator('#dr').count() == 0, 'staff opening the account page go to their dashboard (no client timeline or data requests)')

    # 11 data requests
    reset(); open_account(); n = len(calls); pg.click('[data-dr=export]'); pg.wait_for_selector('text=Your request is recorded', timeout=4000); wr = writes(n, 'data_requests')
    ok(len(wr) == 1 and wr[0][2] == {'client_id': 'u1', 'kind': 'export'} and wr[0][3] == 'Bearer at', 'export request sends exactly client_id and kind with the user token')
    ok(pg.locator('[data-dr=export]').count() == 0 and 'Waiting for our team' in pg.inner_text('#dr') and 'Received' in pg.inner_text('#dr'), 'pending export is shown with its date and cannot be filed twice')
    n = len(calls); pg.click('[data-dr=deletion]'); w(150)
    ok(pg.locator('[data-dr=deletion-yes]').count() == 1 and 'before anything is deleted' in pg.inner_text('#dr') and not writes(n, 'data_requests'), 'deletion asks for confirmation first and sends nothing yet')
    pg.click('[data-dr=deletion-no]'); w(150); ok(not writes(n, 'data_requests') and pg.locator('[data-dr=deletion]').count() == 1, '"Keep my account" sends nothing')
    pg.click('[data-dr=deletion]'); pg.click('[data-dr=deletion-yes]'); pg.wait_for_selector('text=Your request is recorded', timeout=4000); wr = writes(n, 'data_requests')
    ok(len(wr) == 1 and wr[0][2] == {'client_id': 'u1', 'kind': 'deletion'}, 'deletion request is recorded only after confirmation')
    ok(not any(c[0] == 'DELETE' for c in calls), 'the page never sends a DELETE: nothing is deleted automatically')
    reset(); open_account(); ST['reqs'].append({'id': 'rx', 'kind': 'export', 'status': 'open', 'created_at': '2026-11-21T10:00:00Z'}); pg.click('[data-dr=export]'); w(600)
    ok('already have an open request' in pg.inner_text('#dr'), 'a duplicate request is explained politely')
    reset(noreq=True); open_account(); ok('could not load your requests' in pg.inner_text('#dr') and 'info@culmera-solutions.com' in pg.inner_text('#dr') and pg.locator('[data-dr]').count() == 0, 'if the table is missing the page says so and offers the email, no broken buttons')
    reset(reqs=[{'id': 'r1', 'kind': 'deletion', 'status': 'done', 'created_at': '2026-11-01T10:00:00Z'}]); open_account(); ok('Done' in pg.inner_text('#dr') and pg.locator('[data-dr=deletion]').count() == 1, 'a finished request is listed and a new one can be filed')

    # 12 brief screen points to booking
    reset(briefs=[brief('submitted', submitted_at='2026-11-20T10:00:00Z', answers={'v': 1, 'project': {'intent': 'sell', 'goal': 'Rugs'}, 'refine': {}, 'items': {'online-store': {}}})])
    pg.goto(BASE + '#/brief'); pg.reload(); pg.wait_for_selector('[data-goal="sell"]', timeout=5000); w(300); pg.click('[data-step="5"]'); w(300)
    ok(pg.locator('#bp a[href="#/meeting"]').count() == 1 and 'Book your free call' in pg.inner_text('#bp'), 'submitted brief review has a "Book your free call" button')
    ok('email you' not in pg.inner_text('#bp').lower(), 'no old "we will email you" promise on the brief screen')

    ok(not any('service_role' in json.dumps(c) or 'sb_secret' in json.dumps(c) for c in calls), 'no secret key in any request')
    ok(not errs, 'no JavaScript errors ' + str(errs))
    b.close()
print('\n%d failed' % len(fails)); sys.exit(1 if fails else 0)
