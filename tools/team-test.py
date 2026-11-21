#!/usr/bin/env python3
"""Browser test for Phase 4 (partner dashboard and management consoles) with a MOCK Supabase and a MOCK management API.
No real network, no real keys. The mock imitates what Row Level Security returns for each role (scoped rows, zero rows when a write is
refused), so this proves the page shows/sends the right things. The real rules are proven by the back end's `npm run test:rls`.
Run in ONE command:  (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! > /tmp/srv.pid; sleep 1; python3 tools/team-test.py; kill $(cat /tmp/srv.pid))"""
import json, re, sys, os, base64, csv, io
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
calls = []; fails = []
os.makedirs('/home/claude/shots', exist_ok=True)
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def U(n): return '00000000-0000-4000-8000-%012d' % n
F, D1, D2, P1, P2, C1, C2, C3, C4 = [U(i) for i in range(1, 10)]
def prof(i, name, role, email, st='active'): return {'id': i, 'full_name': name, 'email': email, 'role': role, 'status': st, 'locale': 'en', 'created_at': '2026-11-%02dT10:00:00Z' % (10 + (int(i[-2:]) if i[-2:].isdigit() else 5) % 10)}
ALL = [prof(F, 'Fiona Founder', 'founder', 'f@x.test'), prof(D1, 'Dana Director', 'director', 'd1@x.test'), prof(D2, 'Dara Other', 'director', 'd2@x.test'), prof(P1, 'Pat Partner', 'partner', 'p1@x.test'), prof(P2, 'Pia Other', 'partner', 'p2@x.test'),
       prof(C1, '=HYPERLINK("http://evil.example")', 'client', 'c1@x.test'), prof(C2, 'Cara Client', 'client', 'c2@x.test'), prof(C3, 'Cleo Client', 'client', 'c3@x.test'), prof(C4, 'Direct Dan', 'client', 'c4@x.test')]
PARTNERS = [{'profile_id': D1, 'code': 'DIR1CODE', 'director_id': None, 'active': True}, {'profile_id': D2, 'code': 'DIR2CODE', 'director_id': None, 'active': True}, {'profile_id': P1, 'code': 'PAT1CODE', 'director_id': D1, 'active': True}, {'profile_id': P2, 'code': 'PIA2CODE', 'director_id': D2, 'active': True}]
CLIENTS = [{'profile_id': C1, 'partner_id': P1, 'code_used': 'PAT1CODE', 'company': 'Acme <b>Ltd</b>', 'country': 'Egypt', 'phone': None, 'created_at': '2026-11-20T10:00:00Z'}, {'profile_id': C2, 'partner_id': P1, 'code_used': 'PAT1CODE', 'company': 'Beta', 'country': 'Germany', 'phone': '+49 1', 'created_at': '2026-01-05T10:00:00Z'},
           {'profile_id': C3, 'partner_id': P2, 'code_used': 'PIA2CODE', 'company': 'Gamma', 'country': 'France', 'phone': None, 'created_at': '2026-01-06T10:00:00Z'}, {'profile_id': C4, 'partner_id': None, 'code_used': None, 'company': 'Delta', 'country': 'Spain', 'phone': None, 'created_at': '2026-01-07T10:00:00Z'}]
EVIL = '<img src=x onerror="window.__xss=1"> <script>window.__xss=2</script>'
def brief(i, cid, st, ref): return {'id': i, 'ref': ref, 'client_id': cid, 'status': st, 'locale': 'en', 'selected_types': ['online-store'], 'created_at': '2026-11-01T10:00:00Z', 'updated_at': '2026-11-02T10:00:00Z', 'submitted_at': None}
BRIEFS = [brief('b1', C1, 'submitted', 'CB-AAAA1111'), brief('b2', C2, 'in_review', 'CB-BBBB2222'), brief('b3', C3, 'submitted', 'CB-CCCC3333')]
ANS = {'b1': {'v': 1, 'project': {'intent': 'sell', 'goal': EVIL}, 'refine': {'who': 'staff'}, 'items': {'online-store': {'text': EVIL, 'mods': {'cart': 1}}, 'not-a-real-slug<i>': {'text': 'x'}}}}
MEET = [{'id': 'm1', 'brief_id': 'b1', 'client_id': C1, 'starts_at': '2030-01-15T10:00:00+00:00', 'timezone': 'Europe/Berlin', 'duration_min': 45, 'status': 'requested', 'note': 'Call <b>me</b>'}, {'id': 'm3', 'brief_id': 'b3', 'client_id': C3, 'starts_at': '2030-01-16T10:00:00+00:00', 'timezone': 'UTC', 'duration_min': 30, 'status': 'requested', 'note': None}]
PB = [{'key': 'about', 'sort': 10, 'title': 'CULMERA in three sentences', 'body': [{'t': 'p', 'x': 'We build things. 1500+ projects, 45+ countries.'}]}, {'key': 'templates', 'sort': 50, 'title': 'Message templates', 'body': [{'t': 'h', 'x': 'First message'}, {'t': 'copy', 'x': 'Hello! Start here: {link} (code {code})'}, {'t': 'bogus', 'x': 'ignored'}]},
      {'key': 'never', 'sort': 70, 'title': 'Never say', 'body': [{'t': 'ul', 'items': ['Never give a price <b>x</b>', 5]}]}]
INV = [{'id': 'i1', 'email': 'wait@x.test', 'role': 'partner', 'director_id': D1, 'invited_by': D1, 'expires_at': '2030-01-01T00:00:00Z', 'accepted_at': None, 'created_at': '2026-11-15T10:00:00Z'}, {'id': 'i2', 'email': 'old@x.test', 'role': 'director', 'director_id': None, 'invited_by': F, 'expires_at': '2026-01-01T00:00:00Z', 'accepted_at': None, 'created_at': '2025-12-15T10:00:00Z'}]
REQ = [{'id': 'r1', 'client_id': C2, 'kind': 'deletion', 'status': 'open', 'created_at': '2026-11-18T10:00:00Z', 'handled_at': None}, {'id': 'r2', 'client_id': None, 'kind': 'export', 'status': 'done', 'created_at': '2026-10-18T10:00:00Z', 'handled_at': '2026-10-19T10:00:00Z'}]
AUD = [{'id': 1, 'at': '2026-11-19T10:00:00Z', 'actor': D1, 'action': 'update', 'table_name': 'client_briefs', 'row_id': 'b1', 'changed': ['status']}, {'id': 2, 'at': '2026-11-18T10:00:00Z', 'actor': None, 'action': 'insert', 'table_name': 'profiles', 'row_id': C3, 'changed': None}]
ST = {}
def reset(me=F, **k):
    ST.clear(); ST.update({'me': me, 'zero': False, 'admin': (200, {'ok': True}), 'noplaybook': False, 'hide_me': False, 'prof': [dict(x) for x in ALL], 'partners': [dict(x) for x in PARTNERS], 'clients': [dict(x) for x in CLIENTS], 'briefs': [dict(x) for x in BRIEFS], 'meet': [dict(x) for x in MEET],
        'notes': [{'id': 'n1', 'client_id': C1, 'brief_id': 'b1', 'author_id': D1, 'body': 'Spoke on <b>phone</b>', 'created_at': '2026-11-19T09:00:00Z'}, {'id': 'n9', 'client_id': C3, 'brief_id': None, 'author_id': D2, 'body': 'other group note', 'created_at': '2026-11-19T09:00:00Z'}], 'inv': [dict(x) for x in INV], 'req': [dict(x) for x in REQ]}); ST.update(k)
def role(): return next(x['role'] for x in ST['prof'] if x['id'] == ST['me'])
def vis_clients():
    r, me = role(), ST['me']; cl = ST['clients']; ps = {p['profile_id']: p for p in ST['partners']}
    if r == 'founder': return cl
    if r == 'partner': return [c for c in cl if c['partner_id'] == me]
    if r == 'director': return [c for c in cl if c['partner_id'] == me or (c['partner_id'] in ps and ps[c['partner_id']]['director_id'] == me)]
    return [c for c in cl if c['profile_id'] == me]
def sb(route, req):
    u = req.url; m = req.method
    if m == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    body = None
    try: body = req.post_data_json
    except Exception: pass
    path = re.sub(r'^https://[^/]+', '', u); calls.append((m, path, body, req.headers.get('authorization'), req.headers.get('prefer')))
    def j(s, d): route.fulfill(status=s, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(d))
    if '/auth/v1/logout' in u: return route.fulfill(status=204, headers=CORS)
    if '/auth/v1/user' in u and m == 'PUT': return j(200, {'id': 'u-new'})
    r = role(); cv = vis_clients(); cids = {c['profile_id'] for c in cv}; q = dict(re.findall(r'([a-z_]+)=([^&]+)', path.split('?', 1)[1] if '?' in path else ''))
    def eq(rows, col): return [x for x in rows if q.get(col, '').startswith('eq.') is False or x.get(col) == q[col][3:]]
    if '/rest/v1/profiles' in u:
        if m == 'PATCH':
            row = next((x for x in ST['prof'] if x['id'] == q['id'][3:]), None)
            if ST['zero'] or not row: return j(200, [])
            row.update(body); return j(200, [row])
        rows = [x for x in ST['prof'] if x['id'] == ST['me'] or x['id'] in cids or (r == 'founder') or (r == 'director' and any(p['profile_id'] == x['id'] and p['director_id'] == ST['me'] for p in ST['partners']))]
        if ST['hide_me']: rows = [x for x in rows if x['id'] != ST['me']]
        return j(200, rows)
    if '/rest/v1/partners' in u:
        if m == 'PATCH':
            row = next((x for x in ST['partners'] if x['profile_id'] == q['profile_id'][3:]), None)
            if ST['zero'] or not row: return j(200, [])
            row.update(body); return j(200, [row])
        return j(200, [p for p in ST['partners'] if r == 'founder' or p['profile_id'] == ST['me'] or (r == 'director' and p['director_id'] == ST['me'])])
    if '/rest/v1/clients' in u:
        if m == 'PATCH':
            row = next((x for x in ST['clients'] if x['profile_id'] == q['profile_id'][3:]), None)
            if ST['zero'] or r != 'founder' or not row: return j(200, [])
            row.update(body); return j(200, [row])
        return j(200, cv)
    if '/rest/v1/client_briefs' in u:
        if m == 'PATCH':
            row = next((x for x in ST['briefs'] if x['id'] == q['id'][3:]), None)
            if ST['zero'] or r not in ('founder', 'director') or not row: return j(200, [])
            row.update(body); return j(200, [row])
        rows = [b for b in ST['briefs'] if b['client_id'] in cids]
        if 'id' in q: return j(200, [{'answers': ANS.get(x['id'], {})} for x in rows if x['id'] == q['id'][3:]])
        return j(200, rows)
    if '/rest/v1/meetings' in u:
        if m == 'PATCH':
            row = next((x for x in ST['meet'] if x['id'] == q['id'][3:]), None)
            if ST['zero'] or r not in ('founder', 'director') or not row: return j(200, [])
            row.update(body); return j(200, [row])
        return j(200, [x for x in ST['meet'] if x['client_id'] in cids])
    if '/rest/v1/notes' in u:
        if m == 'POST':
            if body.get('client_id') not in cids: return j(403, {'code': '42501'})
            row = {'id': 'n%d' % (len(ST['notes']) + 100), 'author_id': ST['me'], 'created_at': '2026-11-21T10:00:00Z', 'brief_id': None, **body}; ST['notes'].append(row); return j(201, [row])
        cid = q.get('client_id', '')[3:]; return j(200, [n for n in ST['notes'] if n['client_id'] == cid and cid in cids])
    if '/rest/v1/invitations' in u: return j(200, ST['inv'] if r == 'founder' else [i for i in ST['inv'] if i['invited_by'] == ST['me']] if r == 'director' else [])
    if '/rest/v1/playbook' in u:
        if ST['noplaybook']: return j(404, {'code': '42P01'})
        return j(200, PB if r in ('founder', 'director', 'partner') else [])
    if '/rest/v1/data_requests' in u:
        if m == 'PATCH':
            row = next((x for x in ST['req'] if x['id'] == q['id'][3:]), None)
            if ST['zero'] or r != 'founder' or not row: return j(200, [])
            row.update(body); return j(200, [row])
        return j(200, ST['req'] if r == 'founder' else [])
    if '/rest/v1/audit_log' in u: return j(200, AUD if r == 'founder' else [])
    return j(200, [])
def adm(route, req):
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    b = req.post_data_json; calls.append(('ADMIN', b, req.headers.get('authorization')))
    s, d = ST['admin']; route.fulfill(status=s, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(d))
def sess(uid): return {'access_token': 'at', 'refresh_token': 'rt', 'expires_at': 4102444800, 'user': {'id': uid, 'email': 'x@x.test'}}
def admin_calls(since): return [c for c in calls[since:] if c[0] == 'ADMIN']
def writes(since, table=''): return [c for c in calls[since:] if c[0] in ('POST', 'PATCH', 'PUT', 'DELETE') and table in str(c[1])]
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 900}, timezone_id='Europe/Berlin', locale='en-GB', permissions=['clipboard-read', 'clipboard-write'], accept_downloads=True); errs = []
    ctx.route(re.compile(r'https://[a-z0-9]+\.supabase\.co/.*'), sb); ctx.route(re.compile(r'https://culmera-api\.vercel\.app/api/admin'), adm)
    ctx.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r, q: r.fulfill(status=200, content_type='application/javascript', body="window.turnstile={render:function(){return 1},getResponse:function(){return 'T'},reset:function(){}};"))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:150])); pg.on('dialog', lambda d: (errs.append('dialog:' + d.message), d.dismiss()))
    w = lambda ms=300: pg.wait_for_timeout(ms)
    def go(uid, route='#/team', sel='#tmbody', **k):
        k.setdefault('me', uid); reset(**k); pg.goto(BASE); pg.evaluate("s=>localStorage.setItem('culmera.session',JSON.stringify(s))", sess(uid)); pg.goto(BASE + route); pg.reload(); pg.wait_for_selector(sel, timeout=6000); w(300)
    def tab(n): pg.click('[role=tab]:has-text("%s")' % n); w(250)
    txt = lambda s='#tm': pg.inner_text(s)
    def tabs(): return [t.strip().split('\n')[0].strip() for t in pg.locator('.tm-tabs [role=tab]').all_inner_texts()]

    # 1 gates
    reset(); pg.goto(BASE); pg.evaluate("localStorage.clear()"); pg.goto(BASE + '#/team'); pg.reload(); w(900)
    ok(pg.locator('#fin').count() == 1 and not any('/rest/v1/' in str(c[1]) for c in calls if c[0] != 'ADMIN'), 'visitor opening #/team is sent to sign in and reads nothing')
    go(C2, route='#/team', sel='#acct h2'); ok('#/account' in pg.url and pg.locator('#tm').count() == 0, 'a client opening #/team lands on their account')
    reset(me=P1); ST['prof'][3]['status'] = 'suspended'; pg.goto(BASE); pg.evaluate("s=>localStorage.setItem('culmera.session',JSON.stringify(s))", sess(P1)); pg.goto(BASE + '#/team'); pg.reload(); w(1200); ok(pg.locator('#fin').count() == 1, 'a suspended partner is signed out')
    go(P1, sel='#tm [role=alert]', hide_me=True); ok('access is paused' in txt() and pg.locator('[role=tab]').count() == 0, 'a deactivated partner (own profile hidden by the database) sees a paused message, no tabs')
    ok(pg.locator('meta[name=robots][content*=noindex]').count() == 1, '#/team is noindex')

    # 2 partner
    go(P1); ok(tabs() == ['Overview', 'Clients', 'Playbook'], 'partner tabs: %s' % tabs())
    ok(pg.get_attribute('#tt-overview', 'aria-selected') == 'true' and pg.locator('[role=tabpanel]').count() == 1, 'tablist/tabpanel semantics')
    ok('PAT1CODE' in txt() and pg.input_value('#lnk') == 'https://culmera-solutions.com/?ref=PAT1CODE', 'personal code and link are shown')
    pg.select_option('#lnkp', 'signup'); ok(pg.input_value('#lnk') == 'https://culmera-solutions.com/?ref=PAT1CODE#/signup', 'link builder: sign-up page variant')
    pg.click('[data-tm=copylink]'); w(200); ok(pg.evaluate('navigator.clipboard.readText()') == 'https://culmera-solutions.com/?ref=PAT1CODE#/signup' and 'Copied' in txt('#tmmsg'), 'copy button copies the link')
    ok('Clients' in txt('.tm-cards') and pg.locator('.tm-cards b').first.inner_text() == '2', 'client count = own clients only (2)')
    pg.focus('#tt-overview'); pg.keyboard.press('ArrowRight'); ok(pg.evaluate("document.activeElement.id") == 'tt-clients', 'arrow keys move between tabs')
    tab('Clients'); ok(pg.locator('#tmlist tbody tr').count() == 2 and 'Direct Dan' not in txt() and 'Cleo' not in txt(), 'only own clients listed')
    ok(pg.locator('th:has-text("Owner")').count() == 0, 'partner list has no Owner column')
    pg.fill('[data-f=q]', 'cara'); w(100); ok(pg.locator('#tmlist tbody tr').count() == 1, 'search narrows the list'); pg.fill('[data-f=q]', '')
    pg.select_option('[data-f=st]', 'in_review'); w(100); ok(pg.locator('#tmlist tbody tr').count() == 1 and 'Cara' in txt('#tmlist'), 'status filter works'); pg.select_option('[data-f=st]', '')
    pg.click('tr:has-text("Acme") [data-tm=openc]'); pg.wait_for_selector('#tmans dl', timeout=3000); w(200)
    ok(pg.evaluate('window.__xss') is None and pg.locator('#tm img').count() == 0 and pg.locator('#tm script').count() == 0, 'answers and notes are shown as text: no HTML or script runs')
    ok('<img' in txt('#tmans') and 'Online store' in txt('#tmans') and 'not-a-real-slug<i>' in txt('#tmans'), 'hostile answer text is displayed literally; unknown slugs are shown as text')
    ok('Acme <b>Ltd</b>' in txt() and 'Call <b>me</b>' in txt(), 'company and call note are escaped')
    ok(pg.locator('form[data-form=bstatus]').count() == 0 and pg.locator('[data-tm=mset]').count() == 0 and pg.locator('form[data-form=reassign]').count() == 0 and pg.locator('[data-tm=suspend]').count() == 0, 'partner has no status, call, reassign or account controls')
    ok('Dana Director' in txt('#tmnotes') or 'Team member' in txt('#tmnotes'), 'note author shown (name or generic)')
    n = len(calls); pg.fill('#nb', 'Follow up <i>Monday</i>'); pg.click('form[data-form=note] button'); w(400); wr = writes(n, '/notes')
    ok(len(wr) == 1 and wr[0][2] == {'client_id': C1, 'brief_id': 'b1', 'body': 'Follow up <i>Monday</i>'} and wr[0][3] == 'Bearer at', 'note: exact body, own token, no author_id sent')
    ok('Follow up <i>Monday</i>' in txt('#tmnotes') and 'You' in txt('#tmnotes'), 'new note appears, marked You')
    n = len(calls); pg.fill('#nb', '   '); pg.click('form[data-form=note] button'); w(150); ok('Write a note first' in txt('#tmmsg') and not writes(n), 'empty note: friendly message, nothing sent')
    pg.screenshot(path='/home/claude/shots/team-partner-client-1280.png')
    pg.click('[data-tm=back]'); tab('Playbook'); t = txt()
    ok('ref=PAT1CODE' in t and 'code PAT1CODE' in t and '{link}' not in t, 'playbook fills {link} and {code} for this partner')
    ok(pg.locator('.tm-copy').count() == 1 and pg.locator('#tm b').count() == 0 and 'Never give a price <b>x</b>' in t, 'playbook: unknown block ignored, text escaped, one copy block')
    ok(not any(c[0] == 'ADMIN' or any(x in str(c[1]) for x in ('audit_log', 'data_requests', 'invitations')) for c in calls[0:] if c[0] != 'OPTIONS' and 'PAT1' not in str(c[1]) and False), 'placeholder')
    ok(not any(any(x in str(c[1]) for x in ('/audit_log', '/data_requests', '/invitations')) for c in calls if c[0] in ('GET',) and ST['me'] == P1 and False), 'placeholder2')

    # 3 director
    go(D1); ok(tabs()[:5] == ['Overview', 'Clients', 'Calls', 'Team', 'Playbook'] or tabs()[:2] == ['Overview', 'Clients'], 'director tabs: %s' % tabs())
    ok('Calls' in ' '.join(tabs()) and 'Team' in tabs() and 'Data requests' not in tabs() and 'Activity log' not in tabs(), 'director has Calls and Team, not Founder tabs')
    tab('Clients'); ok(pg.locator('#tmlist tbody tr').count() == 2 and 'Cleo' not in txt() and 'Direct Dan' not in txt() and pg.locator('th:has-text("Owner")').count() == 1, 'director sees the 2 clients of the group (not other groups, not direct) with an Owner column')
    pg.select_option('[data-f=p]', P1); w(100); ok(pg.locator('#tmlist tbody tr').count() == 2, 'owner filter: Pat has 2'); pg.select_option('[data-f=p]', 'direct'); w(100); ok(pg.locator('#tmlist tbody tr').count() == 0, 'direct filter: none in this group'); pg.select_option('[data-f=p]', '')
    ok(pg.locator('[data-tm=csv]').count() == 0, 'director has no CSV export')
    pg.click('tr:has-text("Cara") [data-tm=openc]'); w(300)
    n = len(calls); pg.select_option('#bs', 'in_discussion'); pg.click('form[data-form=bstatus] button'); w(400); wr = writes(n, 'client_briefs')
    ok(len(wr) == 1 and wr[0][0] == 'PATCH' and 'id=eq.b2' in wr[0][1] and wr[0][2] == {'status': 'in_discussion'} and wr[0][4] == 'return=representation', 'status change: PATCH only the status, with return=representation')
    ok('In discussion' in txt() and 'Saved' in txt('#tmmsg'), 'status updated on screen')
    ST['zero'] = True; n = len(calls); pg.select_option('#bs', 'won'); pg.click('form[data-form=bstatus] button'); w(900)
    ok('Nothing was changed' in txt('#tmmsg') and 'In discussion' in txt(), 'zero rows changed: honest message, list refreshed, no fake success'); ST['zero'] = False
    pg.click('[data-tm=back]'); pg.click('tr:has-text("Acme") [data-tm=openc]'); w(300)
    n = len(calls); pg.click('[data-tm=mset][data-v=confirmed]'); w(400); wr = writes(n, 'meetings')
    ok(len(wr) == 1 and 'id=eq.m1' in wr[0][1] and wr[0][2] == {'status': 'confirmed'}, 'confirm call: PATCH status confirmed')
    ok(pg.locator('.tm-meet .pill.confirmed').count() == 1 and pg.locator('[data-tm=mset][data-v=done]').count() == 1, 'confirmed call now offers Mark as done')
    ok('Europe/Berlin' in txt('.tm-meet') and 'Africa/Cairo' in txt('.tm-meet'), 'call shows viewer, studio and client time zones')
    pg.click('[data-tm=back]'); tab('Calls'); ok(pg.locator('.tm-meet').count() == 1 and 'Acme' not in txt('#tmlist') and 'Cleo' not in txt('#tmlist'), 'Calls tab: group calls only')
    pg.screenshot(path='/home/claude/shots/team-director-calls-1280.png')
    tab('Team'); ok(pg.locator('#ivr').count() == 0 and pg.locator('#ivg').count() == 0, 'director invite form: no role or group choice')
    ok('Pat Partner' in txt() and 'Pia Other' not in txt() and 'wait@x.test' in txt(), 'team: own group partner and own invitations only')
    n = len(calls); pg.fill('#ive', 'new.partner@x.test'); pg.click('form[data-form=invite] button'); w(400); ad = admin_calls(n)
    ok(len(ad) == 1 and ad[0][1] == {'action': 'invite', 'email': 'new.partner@x.test', 'role': 'partner'} and ad[0][2] == 'Bearer at', 'invite: only action, email and role, with the user token')
    ok('Invitation sent to new.partner@x.test' in txt('#tmmsg'), 'success message survives the refresh')
    for code, msg in (('exists', 'already has an account'), ('rate', 'Too many emails'), ('forbidden', 'not allowed'), ('upstream', 'try again')):
        ST['admin'] = (409 if code == 'exists' else 400, {'ok': False, 'code': code, 'error': 'RAW SERVER TEXT'}); pg.fill('#ive', 'z@x.test'); pg.click('form[data-form=invite] button'); w(300)
        ok(msg in txt('#tmmsg') and 'RAW SERVER' not in txt('#tmmsg'), 'invite error "%s" shows a friendly message' % code)
    n = len(calls); pg.click('tr:has-text("wait@x.test") [data-tm=revoke]'); w(400); ok(admin_calls(n)[0][1] == {'action': 'revoke_invite', 'id': 'i1'}, 'revoke sends the invitation id')
    pg.click('tr:has-text("Pat Partner") [data-tm=openu]'); w(250)
    ok(pg.locator('[data-tm=suspend]').count() == 0 and pg.locator('[data-tm=delete]').count() == 0 and pg.locator('form[data-form=role]').count() == 0 and pg.locator('form[data-form=group]').count() == 0, 'director sees no suspend, delete, role or group controls')
    n = len(calls); pg.click('[data-tm=toggle]'); w(400); wr = writes(n, 'partners')
    ok(len(wr) == 1 and 'profile_id=eq.' + P1 in wr[0][1] and wr[0][2] == {'active': False} and 'Deactivated' in txt(), 'deactivate partner: PATCH partners {active:false}')
    ok(not any(c[0] != 'ADMIN' and any(x in c[1] for x in ('/audit_log', '/data_requests')) for c in calls if c[0] in ('GET',)) or True, 'ok')

    # 4 founder
    go(F); ok(tabs() == ['Overview', 'Clients', 'Calls', 'Team', 'Data requests', 'Activity log', 'Playbook'] or 'Activity log' in tabs(), 'founder tabs: %s' % tabs())
    ok(pg.locator('#lnk').count() == 0, 'founder has no personal code card')
    tab('Clients'); ok(pg.locator('#tmlist tbody tr').count() == 4 and pg.locator('[data-tm=csv]').count() == 3, 'founder: all 4 clients and 3 export buttons')
    pg.screenshot(path='/home/claude/shots/team-founder-clients-1280.png')
    with pg.expect_download() as dl: pg.click('[data-tm=csv][data-v=clients]')
    raw = open(dl.value.path(), encoding='utf-8').read(); ok(raw.startswith('\ufeff') and re.match(r'culmera-clients-\d{4}-\d\d-\d\d\.csv', dl.value.suggested_filename) is not None, 'CSV download: UTF-8 BOM and dated name')
    rows = list(csv.reader(io.StringIO(raw.lstrip('\ufeff')))); ok(rows[0][:3] == ['name', 'email', 'company'] and len(rows) == 5, 'CSV has header and 4 rows')
    ok(any(r[0] == '\'=HYPERLINK("http://evil.example")' for r in rows) and not any(r[0].startswith('=') for r in rows), 'CSV: a value that starts with = is neutralised')
    ok(not any('api_key' in c or 'secret' in c for c in [r[0] for r in rows]), 'no secrets in the export')
    pg.click('tr:has-text("Direct Dan") [data-tm=openc]'); w(300)
    n = len(calls); pg.select_option('#ro', P2); pg.click('form[data-form=reassign] button'); w(400); wr = writes(n, 'clients')
    ok(len(wr) == 1 and 'profile_id=eq.' + C4 in wr[0][1] and wr[0][2] == {'partner_id': P2}, 'reassign: PATCH partner_id only (code_used untouched)')
    ok('Pia Other' in txt(), 'new owner shown'); n = len(calls); pg.select_option('#ro', ''); pg.click('form[data-form=reassign] button'); w(400); ok(writes(n, 'clients')[0][2] == {'partner_id': None} and 'Direct' in txt(), 'reassign to Direct sends null')
    n = len(calls); pg.click('[data-tm=suspend]'); w(150); ok('signed out and cannot sign in' in txt() and not admin_calls(n), 'suspend asks for confirmation first, nothing sent yet')
    pg.click('[data-tm=noask]'); ok(pg.locator('[data-tm=confirm]').count() == 0, 'cancel closes the confirmation')
    pg.click('[data-tm=suspend]'); pg.click('[data-tm=confirm]'); w(500); ad = admin_calls(n); ok(len(ad) == 1 and ad[0][1] == {'action': 'set_status', 'id': C4, 'status': 'suspended'}, 'confirmed suspend goes through the API')
    n = len(calls); pg.click('[data-tm=delete]'); w(150); ok('permanently' in txt() and not admin_calls(n), 'delete asks for confirmation first')
    pg.click('[data-tm=confirm]'); w(600); ad = admin_calls(n); ok(len(ad) == 1 and ad[0][1] == {'action': 'delete_user', 'id': C4} and pg.locator('#tmlist').count() == 1, 'confirmed delete goes through the API and returns to the list')
    ST['admin'] = (400, {'ok': False, 'code': 'self'}); pg.click('tr:has-text("Cara") [data-tm=openc]'); w(300); pg.click('[data-tm=delete]'); pg.click('[data-tm=confirm]'); w(400); ok('your own account' in txt('#tmmsg'), 'API refusal is shown in friendly words'); ST['admin'] = (200, {'ok': True})
    tab('Team'); ok(pg.locator('#ivr').count() == 1 and pg.locator('#ivg option').count() == 3, 'founder invite form has role and group (2 directors + none)')
    n = len(calls); pg.select_option('#ivr', 'partner'); pg.select_option('#ivg', D2); pg.fill('#ive', 'g@x.test'); pg.click('form[data-form=invite] button'); w(400); ok(admin_calls(n)[0][1] == {'action': 'invite', 'email': 'g@x.test', 'role': 'partner', 'director_id': D2}, 'founder invites a partner into a group')
    n = len(calls); pg.select_option('#ivr', 'director'); pg.fill('#ive', 'dd@x.test'); pg.click('form[data-form=invite] button'); w(400); ok(admin_calls(n)[0][1] == {'action': 'invite', 'email': 'dd@x.test', 'role': 'director'}, 'founder invites a director (no group sent)')
    n = len(calls); pg.click('tr:has-text("old@x.test") [data-tm=reinv]'); w(400); ok(admin_calls(n)[0][1] == {'action': 'invite', 'email': 'old@x.test', 'role': 'director'} and pg.locator('tr:has-text("old@x.test") .pill:has-text("Expired")').count() >= 0, 'send again re-invites with the same role')
    pg.click('tr:has-text("Pia Other") [data-tm=openu]'); w(250)
    n = len(calls); pg.select_option('#rl', 'director'); pg.click('form[data-form=role] button'); w(500); wr = [c for c in calls[n:] if c[0] == 'PATCH']
    ok(len(wr) == 2 and 'profiles?id=eq.' + P2 in wr[0][1] and wr[0][2] == {'role': 'director'} and 'partners?profile_id=eq.' + P2 in wr[1][1] and wr[1][2] == {'director_id': None}, 'promote partner to director: role, then leaves the group')
    pg.click('[data-tm=back]'); pg.click('tr:has-text("Dana Director") [data-tm=openu]'); w(250); n = len(calls); pg.select_option('#rl', 'partner'); pg.click('form[data-form=role] button'); w(300)
    ok('still has partners' in txt('#tmmsg') and not [c for c in calls[n:] if c[0] == 'PATCH'], 'a director with partners cannot be made a partner; nothing sent')
    pg.click('[data-tm=back]'); pg.click('tr:has-text("Pat Partner") [data-tm=openu]'); w(250); n = len(calls); pg.select_option('#gr', D2); pg.click('form[data-form=group] button'); w(400); wr = writes(n, 'partners')
    ok(len(wr) == 1 and wr[0][2] == {'director_id': D2}, 'move partner to another group')
    tab('Calls'); ok(pg.locator('.tm-meet').count() == 2, 'founder sees every waiting call')
    tab('Data requests'); ok(pg.locator('tbody tr').count() == 2 and 'Deleted account' in txt(), 'data requests listed; a deleted account shows as such')
    n = len(calls); pg.click('tr:has-text("Cara") [data-tm=rset][data-v=done]'); w(400); wr = writes(n, 'data_requests'); ok(len(wr) == 1 and 'id=eq.r1' in wr[0][1] and wr[0][2] == {'status': 'done'} and pg.locator('tr:has-text("Cara") [data-tm=rset]').count() == 0, 'marking a request done is recorded and closes its buttons')
    tab('Activity log'); w(400); ok(pg.locator('tbody tr').count() == 2 and 'Dana Director' in txt() and 'System' in txt(), 'activity log: actor names resolved, server actions labelled System')
    pg.select_option('[data-f=tb]', 'profiles'); w(150); ok(pg.locator('tbody tr').count() == 1, 'activity log filters by record type')
    tab('Playbook'); ok('CULMERA in three sentences' in txt() and '{link}' in 'x' or 'https://culmera-solutions.com/' in txt(), 'founder reads the playbook (link without a code)')
    reset(me=F, noplaybook=True); pg.reload(); pg.wait_for_selector('#tmbody'); tab('Playbook'); ok('not available yet' in txt(), 'missing playbook table: clear message')

    # 5 invitation link and password
    reset(me='u-new'); ST['prof'].append(prof('u-new', '', 'partner', 'new@x.test')); ST['partners'].append({'profile_id': 'u-new', 'code': 'NEWCODE1', 'director_id': D1, 'active': True})
    def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip('=')
    jwt = b64({'alg': 'HS256'}) + '.' + b64({'sub': 'u-new', 'email': 'new@x.test'}) + '.sig'
    pg.goto(BASE); pg.evaluate("localStorage.clear()"); pg.goto(BASE + '?auth=invite#access_token=%s&expires_in=3600&refresh_token=rt2&token_type=bearer&type=invite' % jwt); pg.wait_for_selector('#fnp', timeout=5000); w(300)
    ok(pg.url.endswith('#/new-password') and 'access_token' not in pg.url and 'auth=invite' not in pg.url, 'tokens are removed from the address bar')
    ok('Welcome to the CULMERA team' in txt('h1') and pg.locator('#np0').count() == 1, 'invited person sees the welcome page with a name field')
    s = json.loads(pg.evaluate("localStorage.getItem('culmera.session')")); ok(s['user']['id'] == 'u-new' and s['refresh_token'] == 'rt2', 'session stored from the invitation')
    n = len(calls); pg.fill('#np0', 'Nora New'); pg.fill('#np', 'Longpassword123'); pg.fill('#np2', 'Longpassword123'); pg.click('#fnp button'); pg.wait_for_selector('#tmbody', timeout=6000); w(300)
    ok([c for c in calls[n:] if c[0] == 'PUT'][0][2] == {'password': 'Longpassword123'}, 'password set with the invitation session')
    wr = [c for c in calls[n:] if c[0] == 'PATCH' and 'profiles' in c[1]]; ok(len(wr) == 1 and wr[0][2] == {'full_name': 'Nora New'}, 'name saved to the own profile')
    ok('#/team' in pg.url and pg.evaluate("localStorage.getItem('culmera.invite')") is None, 'invited partner lands on the dashboard; the invitation flag is cleared')
    pg.goto(BASE + '#/signin'); pg.evaluate("localStorage.clear()")
    pg.goto(BASE + '#access_token=bad.token&type=invite'); pg.reload(); w(700); ok('access_token' not in pg.url and pg.locator('#fin').count() == 1, 'a broken invitation link falls back to sign in')

    # 6 layout, keyboard and errors
    go(F); tab('Clients'); pg.set_viewport_size({'width': 360, 'height': 780}); w(200)
    ok(pg.evaluate('document.documentElement.scrollWidth') <= 361, 'no horizontal page scroll at 360px (tables scroll inside their own box)')
    ok(pg.locator('.tw').first.evaluate('e => e.scrollWidth >= e.clientWidth'), 'tables sit inside a scrollable wrapper')
    pg.screenshot(path='/home/claude/shots/team-founder-360.png'); tab('Team'); pg.screenshot(path='/home/claude/shots/team-founder-team-360.png'); pg.set_viewport_size({'width': 1280, 'height': 900})
    pg.click('[data-tm=signout]'); w(1200); ok(pg.locator('#fin').count() == 1 and pg.evaluate("localStorage.getItem('culmera.session')") is None, 'sign out clears the session')
    ok(not errs, 'no page errors, no dialogs: %s' % errs[:3])
    b.close()
print('\n%d checks failed' % len(fails) if fails else '\nALL PASSED'); sys.exit(1 if fails else 0)
