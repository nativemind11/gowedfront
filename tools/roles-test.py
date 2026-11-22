#!/usr/bin/env python3
"""Browser test for Phase 9, step 1 (roles): what a Partner, a Director and the Founder see and can do on #/team.
MOCK Supabase, no real network or keys. The mock imitates what the database returns AFTER migration-007-roles.sql:
  Partner  -> own profile, own partner row, view partner_clients, playbook; every base table returns zero rows.
  Director -> own profile, own partner row, views director_*, playbook; every base table returns zero rows.
  Founder  -> the base tables.
So this proves the page asks only for what each role may read, shows only that, and offers no write control.
The real rules are proven by the back end's `npm run test:rls` (test 9.1).
Run:  (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! > /tmp/srv.pid; sleep 1; python3 tools/roles-test.py; kill $(cat /tmp/srv.pid))"""
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
    if m != 'GET': return j(200, [])                       # nothing may be written by Partner or Director; the Founder test does not write
    if t == 'profiles': return j(200, [p for p in PROFILES if r == 'founder' or p['id'] == me])
    if t == 'partners': return j(200, [p for p in PARTNERS if r == 'founder' or p['profile_id'] == me])
    if t == 'playbook': return j(200, PB if r in ('founder', 'director', 'partner') else [])
    if t == 'partner_clients':
        if r != 'partner': return j(200, [])
        out = []
        for c in CLIENTS:
            if c['partner_id'] != me: continue
            bs = [b for b in BRIEFS if b['client_id'] == c['profile_id'] and b['status'] != 'draft']
            out.append({'profile_id': c['profile_id'], 'full_name': name(c['profile_id']), 'selected_types': bs[0]['selected_types'] if bs else [], 'created_at': c['created_at']})
        return j(200, out)
    gp = {p['profile_id']: p for p in PARTNERS}
    mine = [c for c in CLIENTS if c['partner_id'] == me or (c['partner_id'] in gp and gp[c['partner_id']]['director_id'] == me)]
    ids = {c['profile_id'] for c in mine}
    if t == 'director_team': return j(200, [{'profile_id': p['profile_id'], 'full_name': name(p['profile_id']), 'director_id': me, 'active': p['active'], 'created_at': '2026-11-01T00:00:00Z'} for p in PARTNERS if r == 'director' and p['director_id'] == me])
    if t == 'director_clients': return j(200, [{'profile_id': c['profile_id'], 'partner_id': c['partner_id'], 'full_name': name(c['profile_id']), 'created_at': c['created_at']} for c in mine] if r == 'director' else [])
    if t == 'director_briefs':
        rows = [b for b in BRIEFS if r == 'director' and b['client_id'] in ids]
        if 'id' in q: return j(200, [{'answers': ANS.get(b['id'], {})} for b in rows if b['id'] == q['id'][3:]])
        return j(200, rows)
    if t == 'director_meetings': return j(200, [{k: v for k, v in x.items() if k != 'note'} for x in MEET if r == 'director' and x['client_id'] in ids])
    # base tables: the Founder reads them; nobody else (Row Level Security)
    if r != 'founder': return j(200, [])
    if t == 'clients': return j(200, CLIENTS)
    if t == 'client_briefs':
        if 'id' in q: return j(200, [{'answers': ANS.get(b['id'], {})} for b in BRIEFS if b['id'] == q['id'][3:]])
        return j(200, BRIEFS)
    if t == 'meetings': return j(200, MEET)
    if t == 'notes': return j(200, NOTES)
    return j(200, [])
def sess(uid): return {'access_token': 'at', 'refresh_token': 'rt', 'expires_at': 4102444800, 'user': {'id': uid, 'email': 'x@x.test'}}
FORBIDDEN = {'partner': ['/clients?', '/client_briefs', '/meetings', '/notes', '/invitations', '/data_requests', '/audit_log', '/director_', '/brief_messages', '/visitor_replies', '/briefs?'],
             'director': ['/clients?', '/client_briefs', '/meetings?', '/notes', '/invitations', '/data_requests', '/audit_log', '/partner_clients', '/brief_messages', '/visitor_replies', '/briefs?']}
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 900}, timezone_id='Europe/Berlin', locale='en-GB'); errs = []
    ctx.route(re.compile(r'https://[a-z0-9]+\.supabase\.co/.*'), sb)
    ctx.route(re.compile(r'https://culmera-api\.vercel\.app/.*'), lambda r, q: r.fulfill(status=200, headers={**CORS, 'content-type': 'application/json'}, body='{"ok":true}'))
    ctx.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r, q: r.fulfill(status=200, content_type='application/javascript', body="window.turnstile={render:function(){return 1},getResponse:function(){return 'T'},reset:function(){}};"))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.on('dialog', lambda d: (errs.append('dialog:' + d.message), d.dismiss()))
    w = lambda ms=300: pg.wait_for_timeout(ms)
    def go(uid):
        ST['me'] = uid; calls.clear(); pg.goto(BASE); pg.evaluate("s=>localStorage.setItem('culmera.session',JSON.stringify(s))", sess(uid)); pg.goto(BASE + '#/team'); pg.reload(); pg.wait_for_selector('#tmbody', timeout=6000); w(400)
    def tab(n): pg.click('[role=tab]:has-text("%s")' % n); w(250)
    txt = lambda s='#tm': pg.inner_text(s)
    def tabs(): return [t.strip().split('\n')[0].strip() for t in pg.locator('.tm-tabs [role=tab]').all_inner_texts()]
    def reads(role): return [c for c in calls if c[0] == 'GET' and any(x in c[1] for x in FORBIDDEN[role])]
    def nowrites(): return [c for c in calls if c[0] != 'GET' and c[0] != 'OPTIONS']
    NOPH2 = ['Public briefs', 'Teams link', 'Reply to the client', 'Send reply', 'Suggest a meeting', 'Confirm the call']
    NOPII = ['SECRETCO', 'SECRET', 'secret1@x.test', 'secret2@x.test', 'PRIVATE-NOTE', 'FOUNDER-INTERNAL-NOTE', 'p1@x.test', 'p2@x.test']

    # ---------------- PARTNER ----------------
    go(P1); ok(tabs() == ['Overview', 'Clients', 'Playbook'], 'partner tabs: %s' % tabs())
    ok('PAT1CODE' in txt(), 'partner sees his own code')
    ok(pg.locator('.tm-cards b').first.inner_text() == '2' and pg.locator('.tm-cards b').count() == 1, 'overview: only the client count (2), no status numbers')
    tab('Clients'); t = txt('#tmbody')
    ok(pg.locator('#tmlist tbody tr').count() == 2 and 'Cleo One' in t and 'Cara Two' in t, 'client list: the two names')
    ok('Online store' in t and 'Corporate' not in t, 'project shown for a sent brief; a draft brief shows no project')
    ok(pg.locator('#tmlist th:has-text("Brief")').count() == 0 and pg.locator('#tmlist th:has-text("Call")').count() == 0 and pg.locator('#tmlist th:has-text("Owner")').count() == 0 and pg.locator('[data-f=st]').count() == 0, 'no Brief, Call, Owner column and no status filter')
    ok(pg.locator('[data-tm=openc]').count() == 0, 'no way to open a client page')
    ok('Gina' not in t and 'Direct Dan' not in t, 'only his own clients')
    pg.fill('[data-f=q]', 'cara'); w(100); ok(pg.locator('#tmlist tbody tr').count() == 1, 'search by name works')
    tab('Playbook'); ok('CULMERA in three sentences' in txt('#tmbody'), 'playbook is there')
    whole = pg.inner_text('body')
    ok(not any(x in whole for x in NOPII), 'no email, phone, company, answers, call note or internal note anywhere on the page')
    ok(not any(x in pg.inner_text('body') for x in NOPH2) and pg.locator('[data-form=reply],[data-form=confirm],[data-form=vreply]').count() == 0, 'partner: no reply form, no price, no Teams link, no public briefs tab')
    ok(not reads('partner') and not nowrites(), 'partner page reads only profiles, partners, partner_clients, playbook; writes nothing: %s' % [c[1][:50] for c in reads('partner')])

    # ---------------- DIRECTOR ----------------
    go(D1); ok(tabs() == ['Overview', 'Clients', 'Calls', 'Team', 'Playbook'], 'director tabs: %s' % tabs())
    ok('DIR1CODE' in txt(), 'director sees his own code')
    tab('Clients'); t = txt('#tmbody')
    ok(pg.locator('#tmlist tbody tr').count() == 3 and all(n in t for n in ('Cleo One', 'Cara Two', 'Dirk Five')) and 'Gina' not in t and 'Direct Dan' not in t, 'clients of his group (Cleo, Cara, his own Dirk); not other groups, not direct')
    ok(pg.locator('#tmlist th:has-text("Owner")').count() == 1 and 'Pat Partner' in t and 'selected services' in t.lower(), 'Owner (partner name) and project columns are shown')
    ok('Online store' in t and 'Corporate' in t and 'Landing page' in t, 'project of each client is shown')
    ok(pg.locator('[data-tm=csv]').count() == 0, 'no CSV export')
    pg.click('tr:has-text("Cleo") [data-tm=openc]'); pg.wait_for_selector('#tmans dl', timeout=3000); w(200); t = txt()
    ok('ANSWER-TEXT-B1' in txt('#tmans') and 'Sell handmade candles online' in txt('#tmans'), 'brief answers are visible (read only)')
    ok('CB-AAAA1111' in t and 'Submitted' in t, 'brief reference and status are visible')
    ok('Calls' in t and '45 min' in t, 'the call is visible')
    ok(not any(x in pg.inner_text('body') for x in NOPII), 'no contact details, no call note, no internal notes')
    ok(pg.locator('#tm form').count() == 0 and pg.locator('[data-tm=mset]').count() == 0 and pg.locator('[data-tm=suspend]').count() == 0 and pg.locator('textarea').count() == 0, 'client page has no form, no status, call, notes or account control')
    ok(pg.locator('dt:has-text("Email")').count() == 0 and pg.locator('dt:has-text("Phone")').count() == 0 and pg.locator('dt:has-text("Company")').count() == 0, 'no Email, Phone, Company, Country rows')
    pg.click('[data-tm=back]'); tab('Calls'); t = txt('#tmbody')
    ok('Cleo One' in t and pg.locator('[data-tm=mset]').count() == 0 and pg.locator('.tm-tabs .pill').count() == 0, 'calls are listed with no confirm, finish or cancel button and no "to confirm" badge')
    tab('Team'); t = txt('#tmbody')
    ok('Pat Partner' in t and 'Cleo One' in t and 'Cara Two' in t and 'Pia Partner' not in t, 'team: his partner and that partner\'s clients (not other groups)')
    ok(pg.locator('form').count() == 0 and pg.locator('[data-tm=toggle]').count() == 0 and pg.locator('[data-tm=openu]').count() == 0 and 'Invite' not in t, 'team: no invite form, no activate / deactivate, no person page')
    tab('Overview'); ok('Calls to confirm' not in txt('#tmbody') and 'Open invitations' not in txt('#tmbody') and 'Needs attention' not in txt('#tmbody'), 'overview has no to-do, no invitations, no calls to confirm')
    tab('Playbook'); ok('CULMERA in three sentences' in txt('#tmbody'), 'playbook is there')
    ok(not any(x in pg.inner_text('body') for x in NOPH2) and pg.locator('[data-form=reply],[data-form=confirm],[data-form=vreply]').count() == 0, 'director: no reply form, no price, no Teams link, no public briefs tab')
    ok(not reads('director') and not nowrites(), 'director page reads only profiles, partners, director_* views, playbook; writes nothing: %s' % [c[1][:50] for c in reads('director')])

    # ---------------- FOUNDER (unchanged) ----------------
    go(F); ok([x.rstrip(' 0123456789') for x in tabs()] == ['Overview', 'Clients', 'Public briefs', 'Calls', 'Team', 'Data requests', 'Activity log', 'Playbook'], 'founder tabs: %s' % tabs())
    tab('Clients'); t = txt('#tmbody'); ok('SECRETCO-1' in t and pg.locator('#tmlist tbody tr').count() == 5, 'founder sees every client with the company')
    pg.click('tr:has-text("Cleo") [data-tm=openc]'); pg.wait_for_selector('#tmans dl', timeout=3000); w(300); t = txt()
    ok('secret1@x.test' in t and '+49 111 SECRET' in t and 'SECRETCO-1' in t, 'founder sees email, phone, company')
    ok(pg.locator('form[data-form=bstatus]').count() == 1 and pg.locator('[data-tm=mset]').count() >= 1 and pg.locator('form[data-form=note]').count() == 1 and pg.locator('form[data-form=reassign]').count() == 1 and pg.locator('[data-tm=suspend]').count() == 1, 'founder keeps status, call, note, reassign and account controls')
    ok('FOUNDER-INTERNAL-NOTE' in txt('#tmnotes') and 'PRIVATE-NOTE' in t, 'founder sees internal notes and the call note')
    pg.click('[data-tm=back]'); tab('Team'); ok(pg.locator('form[data-form=invite]').count() == 1, 'founder keeps the invitation form')
    ok(not errs, 'no page errors: %s' % errs)
    b.close()
print('\n%d failed' % len(fails) if fails else '\nALL PASSED'); sys.exit(1 if fails else 0)
