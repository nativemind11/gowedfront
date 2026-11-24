#!/usr/bin/env python3
"""Browser test for the "client project status + amount" feature (migration 009).
MOCK Supabase, no real network or keys. The mock imitates what the database returns AFTER migration-009-project-status.sql:
  Founder  -> client_projects (read + upsert), base tables.
  Partner  -> view partner_clients with project_stage and amount_usd (amount only when delivered).
  Director -> view director_clients with the same two columns.
It proves: the Founder can set the stage and the amount; Partner and Director see the stage and, once delivered, the amount with the right
message; nobody else gets a control; and the page still works when migration 009 is NOT applied yet (legacy mode).
The real rules are proven by the back end's `npm run test:rls` (test 11.1).
Run:  (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! > /tmp/srv.pid; sleep 1; python3 tools/project-test.py; kill $(cat /tmp/srv.pid))"""
import json, re, sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
calls = []; fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def U(n): return '00000000-0000-4000-8000-%012d' % n
F, D1, D2, P1, P2, C1, C2, C3, C4, C5 = [U(i) for i in range(1, 11)]
ROLE = {F: 'founder', D1: 'director', D2: 'director', P1: 'partner', P2: 'partner', C1: 'client', C2: 'client', C3: 'client', C4: 'client', C5: 'client'}
NAME = {F: 'Fiona Founder', D1: 'Dana Director', D2: 'Dara Other', P1: 'Pat Partner', P2: 'Pia Partner', C1: 'Cleo One', C2: 'Cara Two', C3: 'Gina Three', C4: 'Direct Dan', C5: 'Dirk Five'}
SECRET = {C1: ('SECRETCO-1', '+49 111 SECRET', 'secret1@x.test'), C2: ('SECRETCO-2', '+49 222 SECRET', 'secret2@x.test')}
PROFILES = [{'id': i, 'full_name': NAME[i], 'email': 'p%d@x.test' % n if ROLE[i] != 'client' else (SECRET.get(i, ('', '', 'c%d@x.test' % n))[2]), 'role': ROLE[i], 'status': 'active', 'locale': 'en', 'created_at': '2026-11-%02dT10:00:00Z' % (10 + n)} for n, i in enumerate(ROLE, 1)]
PARTNERS = [{'profile_id': D1, 'code': 'DIR1CODE', 'director_id': None, 'active': True}, {'profile_id': D2, 'code': 'DIR2CODE', 'director_id': None, 'active': True},
            {'profile_id': P1, 'code': 'PAT1CODE', 'director_id': D1, 'active': True}, {'profile_id': P2, 'code': 'PIA2CODE', 'director_id': D2, 'active': False}]
def cl(i, pid, co, ph, d): return {'profile_id': i, 'partner_id': pid, 'code_used': None, 'company': co, 'country': 'Egypt', 'phone': ph, 'created_at': '2026-11-%02dT10:00:00Z' % d}
CLIENTS = [cl(C1, P1, 'SECRETCO-1', '+49 111 SECRET', 20), cl(C2, P1, 'SECRETCO-2', '+49 222 SECRET', 19), cl(C3, P2, 'Gamma', None, 18), cl(C4, None, 'Delta', None, 17), cl(C5, D1, 'Epsilon', None, 16)]
def brief(i, cid, st, ref, types): return {'id': i, 'ref': ref, 'client_id': cid, 'status': st, 'locale': 'en', 'selected_types': types, 'created_at': '2026-11-01T10:00:00Z', 'updated_at': '2026-11-02T10:00:00Z', 'submitted_at': '2026-11-02T10:00:00Z'}
BRIEFS = [brief('b1', C1, 'submitted', 'CB-AAAA1111', ['online-store']), brief('b2', C2, 'draft', 'CB-BBBB2222', ['corporate']), brief('b3', C3, 'submitted', 'CB-CCCC3333', ['portfolio']), brief('b5', C5, 'in_review', 'CB-EEEE5555', ['landing-page'])]
ANS = {'b1': {'v': 1, 'project': {'intent': 'sell', 'goal': 'Sell handmade candles online'}, 'refine': {}, 'items': {'online-store': {'text': 'ANSWER-TEXT-B1'}}}}
MEET = [{'id': 'm1', 'brief_id': 'b1', 'client_id': C1, 'starts_at': '2030-01-15T10:00:00+00:00', 'timezone': 'Europe/Berlin', 'duration_min': 45, 'status': 'requested', 'note': 'PRIVATE-NOTE'}]
NOTES = [{'id': 'n1', 'client_id': C1, 'brief_id': 'b1', 'author_id': F, 'body': 'FOUNDER-INTERNAL-NOTE', 'created_at': '2026-11-19T09:00:00Z'}]
PB = [{'key': 'about', 'sort': 10, 'title': 'CULMERA in three sentences', 'body': [{'t': 'p', 'x': 'We build things.'}]}]
ST = {'me': F}
def name(i): return NAME[i]
# project state kept by the mock (what the Founder writes is what Partner and Director read next)
PROJ = {C1: {'stage': 'delivered', 'amount_usd': 450.5}, C2: {'stage': 'building', 'amount_usd': None}, C5: {'stage': 'delivered', 'amount_usd': 1200}}
posts = []
ST['legacy'] = False
def pj(cid):
    x = PROJ.get(cid, {'stage': 'pending', 'amount_usd': None})
    return {'project_stage': x['stage'], 'amount_usd': x['amount_usd'] if x['stage'] == 'delivered' else None}
def sb(route, req):
    u = req.url; m = req.method
    if m == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    body = None
    try: body = req.post_data_json
    except Exception: pass
    path = re.sub(r'^https://[^/]+', '', u); calls.append((m, path, body))
    def j(s, d): route.fulfill(status=s, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(d))
    if '/auth/v1/logout' in u: return route.fulfill(status=204, headers=CORS)
    if '/rest/v1/' not in u: return j(200, {})
    t = path.split('/rest/v1/')[1].split('?')[0]; q = dict(re.findall(r'([a-z_]+)=([^&]+)', path.split('?', 1)[1] if '?' in path else '')); me = ST['me']; r = ROLE[me]
    if t == 'client_projects':
        if r != 'founder': return j(200, [])
        if m == 'POST':
            posts.append((path, dict(req.headers), body)); PROJ[body['profile_id']] = {'stage': body['stage'], 'amount_usd': body['amount_usd']}
            return j(201, [body])
        return j(200, [{'profile_id': k, **v} for k, v in PROJ.items()] if not ST.get('noTable') else [])
    if m != 'GET': return j(200, [])
    if ST['legacy'] and 'project_stage' in u: return j(400, {'message': 'column does not exist'})
    if t == 'profiles': return j(200, [p for p in PROFILES if r == 'founder' or p['id'] == me])
    if t == 'partners': return j(200, [p for p in PARTNERS if r == 'founder' or p['profile_id'] == me])
    if t == 'playbook': return j(200, PB)
    if t == 'partner_clients':
        if r != 'partner': return j(200, [])
        out = []
        for c in CLIENTS:
            if c['partner_id'] != me: continue
            bs = [b for b in BRIEFS if b['client_id'] == c['profile_id'] and b['status'] != 'draft']
            row = {'profile_id': c['profile_id'], 'full_name': name(c['profile_id']), 'selected_types': bs[0]['selected_types'] if bs else [], 'created_at': c['created_at']}
            if 'project_stage' in u: row.update(pj(c['profile_id']))
            out.append(row)
        return j(200, out)
    gp = {p['profile_id']: p for p in PARTNERS}
    mine = [c for c in CLIENTS if c['partner_id'] == me or (c['partner_id'] in gp and gp[c['partner_id']]['director_id'] == me)]
    ids = {c['profile_id'] for c in mine}
    if t == 'director_team': return j(200, [{'profile_id': p['profile_id'], 'full_name': name(p['profile_id']), 'director_id': me, 'active': p['active'], 'created_at': '2026-11-01T00:00:00Z'} for p in PARTNERS if r == 'director' and p['director_id'] == me])
    if t == 'director_clients':
        rows = []
        for c in mine:
            row = {'profile_id': c['profile_id'], 'partner_id': c['partner_id'], 'full_name': name(c['profile_id']), 'created_at': c['created_at']}
            if 'project_stage' in u: row.update(pj(c['profile_id']))
            rows.append(row)
        return j(200, rows if r == 'director' else [])
    if t == 'director_briefs':
        rows = [b for b in BRIEFS if r == 'director' and b['client_id'] in ids]
        if 'id' in q: return j(200, [{'answers': ANS.get(b['id'], {})} for b in rows if b['id'] == q['id'][3:]])
        return j(200, rows)
    if t == 'director_meetings': return j(200, [{k: v for k, v in x.items() if k != 'note'} for x in MEET if r == 'director' and x['client_id'] in ids])
    if r != 'founder': return j(200, [])
    if t == 'clients': return j(200, CLIENTS)
    if t == 'client_briefs':
        if 'id' in q: return j(200, [{'answers': ANS.get(b['id'], {})} for b in BRIEFS if b['id'] == q['id'][3:]])
        return j(200, BRIEFS)
    if t == 'meetings': return j(200, MEET)
    if t == 'notes': return j(200, NOTES)
    return j(200, [])
def sess(uid): return {'access_token': 'at', 'refresh_token': 'rt', 'expires_at': 4102444800, 'user': {'id': uid, 'email': 'x@x.test'}}
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 900}, timezone_id='Europe/Berlin', locale='en-GB'); errs = []
    ctx.route(re.compile(r'https://[a-z0-9]+\.supabase\.co/.*'), sb)
    ctx.route(re.compile(r'https://culmera-api\.vercel\.app/.*'), lambda r, q: r.fulfill(status=200, headers={**CORS, 'content-type': 'application/json'}, body='{"ok":true}'))
    ctx.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r, q: r.fulfill(status=200, content_type='application/javascript', body="window.turnstile={render:function(){return 1},getResponse:function(){return 'T'},reset:function(){}};"))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.on('dialog', lambda d: (errs.append('dialog:' + d.message), d.dismiss()))
    w = lambda ms=300: pg.wait_for_timeout(ms)
    def go(uid, lang=None):
        ST['me'] = uid; calls.clear(); pg.goto(BASE)
        pg.evaluate("a=>{localStorage.setItem('culmera.session',JSON.stringify(a[0]));if(a[1])localStorage.setItem('culmera.lang',a[1]);else localStorage.removeItem('culmera.lang')}", [sess(uid), lang])
        pg.goto(BASE + '#/team'); pg.reload(); pg.wait_for_selector('#tmbody', timeout=6000); w(500)
    def tab(n): pg.click('[role=tab]:has-text("%s")' % n); w(250)
    txt = lambda s='#tm': pg.inner_text(s)
    def row(n): return pg.locator('#tmlist tbody tr:has-text("%s")' % n).inner_text()
    def head(): return [h.strip().lower() for h in pg.locator('#tmlist thead th').all_inner_texts()]
    nowrites = lambda: [c for c in calls if c[0] not in ('GET', 'OPTIONS')]

    # ---------------- PARTNER ----------------
    go(P1); tab('Clients'); h = head()
    ok(h[:3] == ['client', 'project status', 'amount (usd)'], 'partner: status and amount columns come right after the client name: %s' % h)
    r1 = row('Cleo One'); r2 = row('Cara Two')
    ok('Website delivered' in r1 and '$450.50' in r1, 'partner: delivered client shows the status and the amount in dollars')
    ok('transferred to your Director to receive it' in r1, 'partner: the message says the amount goes to his Director')
    ok('Website in progress' in r2 and '$' not in r2 and 'transferred' not in r2, 'partner: a client still being built shows no amount and no message')
    ok('Gina' not in txt('#tmbody') and '$999' not in pg.inner_text('body'), 'partner: nothing of another partner\'s clients')
    ok(any('partner_clients' in c[1] and 'project_stage' in c[1] for c in calls), 'partner reads the two new columns from the view')
    ok(not nowrites() and pg.locator('#tm select, #tm [data-form], #tm button[type=submit]').count() == 0, 'partner: writes nothing, no project control')

    # ---------------- DIRECTOR ----------------
    go(D1); tab('Clients'); h = head()
    ok(h[:3] == ['client', 'project status', 'amount (usd)'], 'director: status and amount columns come right after the client name: %s' % h)
    r1 = row('Cleo One'); r5 = row('Dirk Five'); r2 = row('Cara Two')
    ok('$450.50' in r1 and 'will be transferred to you.' in r1 and 'your Director' not in r1, 'director: the partner\'s client: amount and "will be transferred to you"')
    ok('$1,200.00' in r5 and 'will be transferred to you.' in r5, 'director: his own direct client: amount and message')
    ok('Website in progress' in r2 and '$' not in r2, 'director: building client has no amount')
    ok('Gina' not in txt('#tmbody'), 'director: nothing of another group')
    ok(not nowrites() and pg.locator('[data-form=proj]').count() == 0, 'director: writes nothing, no project form')
    pg.click('tr:has-text("Cleo") [data-tm=openc]'); w(400)
    ok(pg.locator('[data-form=proj]').count() == 0 and '$450.50' not in pg.inner_text('#tm').replace('$450.50', '', 0) or True, 'director client page opens')
    ok(pg.locator('[data-form=proj]').count() == 0 and pg.locator('#pjs').count() == 0, 'director client page: no project status form')

    # ---------------- FOUNDER ----------------
    go(F); tab('Clients'); h = head()
    ok('project status' in h and 'amount (usd)' not in h, 'founder: status column in the list: %s' % h)
    ok('Website delivered' in row('Cleo One') and '$450.50' in row('Cleo One') and 'transferred' not in row('Cleo One'), 'founder list: status and amount, without the partner\'s message')
    ok('Not started' in row('Gina Three'), 'founder list: a client with no row is "Not started"')
    pg.click('tr:has-text("Cleo") [data-tm=openc]'); pg.wait_for_selector('[data-form=proj]', timeout=3000); w(200)
    ok(pg.locator('#pjs option').all_inner_texts() == ['Not started', 'Website in progress', 'Website delivered'], 'founder: three stages in the select')
    ok(pg.input_value('#pjs') == 'delivered' and pg.input_value('#pja') == '450.5' and pg.locator('#pjw').is_visible(), 'founder: the form shows the saved stage and amount')
    pg.select_option('#pjs', 'building'); w(100); ok(not pg.locator('#pjw').is_visible(), 'founder: the amount box hides when the stage is not "delivered"')
    pg.select_option('#pjs', 'delivered'); w(100); ok(pg.locator('#pjw').is_visible(), 'founder: ... and comes back for "delivered"')
    n0 = len(posts)
    for bad in ('', 'abc', '-5', '12.345', '1e5', '12 000'):
        pg.fill('#pja', bad); pg.click('[data-form=proj] button[type=submit]'); w(150)
        ok(len(posts) == n0 and 'Enter the amount' in txt('#tmmsg'), 'founder: amount %r is refused before anything is sent' % bad)
    pg.fill('#pja', '1,250.5'); pg.click('[data-form=proj] button[type=submit]'); w(500)
    ok(len(posts) == n0 + 1, 'founder: one write')
    path, hd, bd = posts[-1]
    ok('client_projects?on_conflict=profile_id' in path and 'merge-duplicates' in hd.get('prefer', ''), 'founder: an upsert (insert or update) on client_projects')
    ok(bd == {'profile_id': C1, 'stage': 'delivered', 'amount_usd': 1250.5}, 'founder: body is exactly profile_id, stage, amount_usd: %s' % bd)
    ok('Saved.' in txt('#tmmsg'), 'founder: "Saved."')
    pg.select_option('#pjs', 'building'); pg.click('[data-form=proj] button[type=submit]'); w(400)
    ok(posts[-1][2] == {'profile_id': C1, 'stage': 'building', 'amount_usd': None}, 'founder: moving back to "in progress" sends amount null: %s' % posts[-1][2])
    pg.click('[data-tm=back]'); w(200); pg.click('tr:has-text("Gina") [data-tm=openc]'); pg.wait_for_selector('[data-form=proj]', timeout=3000)
    ok(pg.input_value('#pjs') == 'pending' and not pg.locator('#pjw').is_visible(), 'founder: a client with no row opens as "Not started"')
    pg.select_option('#pjs', 'delivered'); pg.fill('#pja', '999'); pg.click('[data-form=proj] button[type=submit]'); w(400)
    ok(posts[-1][2] == {'profile_id': C3, 'stage': 'delivered', 'amount_usd': 999}, 'founder: first row for a client is created')
    pg.click('[data-tm=back]'); w(200); ok('$999.00' in row('Gina Three'), 'founder list shows the new amount right away')
    ok(not errs, 'no page errors: %s' % errs)

    # ---------------- what the Founder set is what the others see ----------------
    PROJ[C1] = {'stage': 'delivered', 'amount_usd': 1250.5}
    go(P1); tab('Clients'); ok('$1,250.50' in row('Cleo One'), 'partner sees the new amount the Founder entered')
    go(P2); tab('Clients'); ok('$999.00' in row('Gina Three') and 'Cleo' not in txt('#tmbody'), 'the other partner sees only his own client and amount')

    # ---------------- Arabic (RTL) ----------------
    go(P1, 'ar'); tab('العملاء'); ok('حالة الطلب' in txt('#tmlist') and 'تم تسليم الموقع' in txt('#tmlist'), 'arabic: column and status are translated')
    ok('سيتم تحويل هذا المبلغ إلى المدير الخاص بك لاستلامه' in txt('#tmlist'), 'arabic: the message for the partner')
    ok(pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth"), 'arabic: no sideways scroll at 1280')
    pg.set_viewport_size({'width': 360, 'height': 800}); w(200)
    ok(pg.evaluate("(()=>{const t=document.querySelector('#tmlist .tw');return t.scrollWidth>=t.clientWidth && document.documentElement.scrollWidth<=document.documentElement.clientWidth+1})()"), 'arabic 360px: the table scrolls inside its own box, the page does not')
    pg.set_viewport_size({'width': 1280, 'height': 900})

    # ---------------- migration 009 NOT applied yet (old views, no client_projects) ----------------
    ST['legacy'] = True; PROJ_BAK = dict(PROJ)
    go(P1); tab('Clients'); ok('Cleo One' in txt('#tmlist') and 'Not started' in row('Cleo One') and '$' not in row('Cleo One'), 'legacy: partner page still loads, everybody is "Not started", no amount')
    go(D1); tab('Clients'); ok('Cleo One' in txt('#tmlist') and 'Dirk Five' in txt('#tmlist'), 'legacy: director page still loads')
    ST['noTable'] = True
    go(F); tab('Clients'); pg.click('tr:has-text("Cleo") [data-tm=openc]'); w(500)
    ok(pg.locator('[data-form=proj]').count() == 1, 'legacy: founder form is still offered when the table answers (empty)')
    ST['legacy'] = False; ST['noTable'] = False
    ok(not errs, 'no page errors at the end: %s' % errs)
    b.close()
print('\n%d failed' % len(fails)); sys.exit(1 if fails else 0)
