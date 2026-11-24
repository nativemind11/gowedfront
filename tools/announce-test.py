#!/usr/bin/env python3
"""Browser test for announcements (migration 010). MOCK Supabase, no real network.
Visitor: sees live notices top right, can close one (kept after reload), sees nothing when there are none.
Founder: new tab, publish (title, message, days), live and ended lists, delete with confirm, validation, page works without the table.
The real rules (who can read / write) are in migration-010-announcements.sql.
Run:  (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! > /tmp/srv.pid; sleep 1; python3 tools/announce-test.py; kill $(cat /tmp/srv.pid))"""
import json, re, sys, datetime as dt
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
fails = []
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def U(n): return '00000000-0000-4000-8000-%012d' % n
F = U(1)
now = dt.datetime.now(dt.timezone.utc)
def iso(d): return d.strftime('%Y-%m-%dT%H:%M:%S+00:00')
ANN = [
    {'id': U(101), 'title': 'Office closed on Friday', 'body': 'We are closed on Friday.\nWe reply on Saturday.', 'starts_at': iso(now - dt.timedelta(days=1)), 'expires_at': iso(now + dt.timedelta(days=3)), 'created_at': iso(now - dt.timedelta(days=1))},
    {'id': U(102), 'title': 'We are hiring partners', 'body': 'Apply by email.', 'starts_at': iso(now - dt.timedelta(days=2)), 'expires_at': iso(now + dt.timedelta(days=9)), 'created_at': iso(now - dt.timedelta(days=2))},
    {'id': U(103), 'title': 'Old news', 'body': 'Ended notice.', 'starts_at': iso(now - dt.timedelta(days=20)), 'expires_at': iso(now - dt.timedelta(days=5)), 'created_at': iso(now - dt.timedelta(days=20))},
]
ST = {'founder': False, 'noTable': False}; posts = []; dels = []
def live(a): return a['starts_at'] <= iso(now) < a['expires_at']
def sb(route, req):
    u = req.url; m = req.method
    if m == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
    body = None
    try: body = req.post_data_json
    except Exception: pass
    def j(s, d): route.fulfill(status=s, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(d))
    if '/rest/v1/' not in u: return j(200, {})
    t = u.split('/rest/v1/')[1].split('?')[0]
    hdr = req.headers.get('authorization', '')
    isF = ST['founder'] and 'Bearer FOUNDERTOKEN' in hdr
    if t == 'announcements':
        if ST['noTable']: return j(404, {'message': 'relation does not exist'})
        if m == 'POST':
            if not isF: return j(401, {})
            posts.append(body); row = {'id': U(200 + len(posts)), 'created_at': iso(now), **body}; ANN.insert(0, row); return j(201, [row])
        if m == 'DELETE':
            if not isF: return j(200, [])
            i = re.search(r'id=eq\.([^&]+)', u).group(1); dels.append(i); n = [a for a in ANN if a['id'] == i]
            for a in n: ANN.remove(a)
            return j(200, n)
        rows = ANN if isF else [a for a in ANN if live(a)]
        return j(200, rows)
    if t == 'profiles': return j(200, [{'id': F, 'full_name': 'Fiona Founder', 'email': 'f@x.test', 'role': 'founder', 'status': 'active', 'locale': 'en', 'created_at': '2026-11-01T10:00:00Z'}])
    if m != 'GET': return j(200, [])
    return j(200, [])
def sess(): return {'access_token': 'FOUNDERTOKEN', 'refresh_token': 'r', 'expires_at': 4102444800, 'user': {'id': F, 'email': 'f@x.test'}}
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 1280, 'height': 900}, locale='en-GB'); errs = []
    ctx.route(re.compile(r'https://[a-z0-9]+\.supabase\.co/.*'), sb)
    ctx.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r, q: r.fulfill(status=200, content_type='application/javascript', body="window.turnstile={render:function(){return 1},getResponse:function(){return 'T'},reset:function(){}};"))
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)[:200]))
    w = pg.wait_for_timeout
    # ---- visitor
    pg.goto(BASE); pg.wait_for_selector('#ann .ann', timeout=6000); w(700)
    cards = pg.locator('#ann .ann')
    ok(cards.count() == 2, 'visitor sees the 2 live notices, not the ended one')
    ok('Office closed on Friday' in pg.inner_text('#ann'), 'title shown')
    bb = pg.locator('#ann').bounding_box(); vw = pg.viewport_size['width']
    ok(bb['x'] + bb['width'] > vw - 40 and bb['y'] < 200, 'notice sits at the top right (x end %d of %d, y %d)' % (bb['x'] + bb['width'], vw, bb['y']))
    ok(pg.locator('#ann .ann-x').first.get_attribute('aria-label') == 'Close this announcement', 'close button has an accessible name')
    pg.screenshot(path='/tmp/ann-visitor.png')
    pg.locator('#ann .ann-x').first.click(); w(500)
    ok(pg.locator('#ann .ann').count() == 1, 'X closes one notice')
    pg.reload(); pg.wait_for_selector('#ann .ann', timeout=6000); w(500)
    ok(pg.locator('#ann .ann').count() == 1 and 'Office closed' not in pg.inner_text('#ann'), 'closed notice stays closed after reload')
    pg.locator('#ann .ann-x').first.click(); w(500)
    ok(pg.locator('#ann').count() == 0, 'no notices left: the box is removed')
    # XSS: text only
    ANN.insert(0, {'id': U(150), 'title': '<img src=x onerror=window.__x=1>', 'body': '<b>bold</b>', 'starts_at': iso(now - dt.timedelta(hours=1)), 'expires_at': iso(now + dt.timedelta(days=1)), 'created_at': iso(now)})
    pg.reload(); pg.wait_for_selector('#ann .ann', timeout=6000); w(300)
    ok(pg.evaluate('window.__x') is None and pg.locator('#ann img, #ann b').count() == 0, 'notice text is plain text, never HTML')
    ANN.pop(0)
    # ---- founder
    ST['founder'] = True
    pg.evaluate("s=>{localStorage.setItem('culmera.session',JSON.stringify(s));localStorage.removeItem('culmera.ann.hidden')}", sess())
    pg.goto(BASE + '#/team'); pg.reload(); pg.wait_for_selector('#tmbody', timeout=6000); w(400)
    ok(pg.locator('#tt-announcements').count() == 1, 'Founder has the Announcements tab')
    pg.locator('#tt-announcements').click(); w(300)
    txt = pg.inner_text('#tmbody')
    ok('Live now (2)' in txt and 'Ended (1)' in txt, 'lists: 2 live, 1 ended')
    pg.screenshot(path='/tmp/ann-founder.png', full_page=True)
    pg.click('#tmbody button[type=submit]'); w(200)
    ok('Write a title and a message.' in pg.inner_text('#tmmsg') and not posts, 'empty form refused, nothing sent')
    pg.fill('#ant', 'New office hours'); pg.fill('#anb', 'We open at 9.'); pg.fill('#and', '0'); pg.click('#tmbody button[type=submit]'); w(200)
    ok('1 to 365' in pg.inner_text('#tmmsg') and not posts, '0 days refused')
    pg.fill('#and', '12'); pg.click('#tmbody button[type=submit]'); w(800)
    ok(len(posts) == 1, 'one POST sent')
    if posts:
        d = (dt.datetime.fromisoformat(posts[0]['expires_at'].replace('Z', '+00:00')) - dt.datetime.fromisoformat(posts[0]['starts_at'].replace('Z', '+00:00'))).total_seconds() / 86400
        ok(abs(d - 12) < 0.01 and posts[0]['title'] == 'New office hours', 'duration is 12 days, title kept')
        ok(set(posts[0]) == {'title', 'body', 'starts_at', 'expires_at'}, 'only the 4 allowed fields are sent')
    ok('Live now (3)' in pg.inner_text('#tmbody'), 'new notice appears in the live list')
    # delete with confirm
    pg.locator('#tmbody [data-tm=anndel]').first.click(); w(200)
    ok('Delete this announcement?' in pg.inner_text('#tmbody') and not dels, 'asks before deleting')
    pg.click('#tmbody [data-tm=noask]'); w(200); ok(not dels, 'cancel deletes nothing')
    pg.locator('#tmbody [data-tm=anndel]').first.click(); w(200); pg.click('#tmbody [data-tm=confirm]'); w(800)
    ok(len(dels) == 1 and 'Live now (2)' in pg.inner_text('#tmbody'), 'delete removes it')
    # banner on the home page now shows live ones to the founder as well
    pg.goto(BASE); pg.reload(); pg.wait_for_selector('#ann .ann', timeout=6000)
    ok(pg.locator('#ann .ann').count() == 2, 'banner follows the database after the delete')
    # missing table
    ST['noTable'] = True; pg.goto(BASE + '#/team'); pg.reload(); pg.wait_for_selector('#tmbody', timeout=6000); w(300); pg.locator('#tt-announcements').click(); w(300)
    ok('migration-010' in pg.inner_text('#tmbody'), 'clear message when migration 010 is not applied')
    pg.goto(BASE); pg.reload(); w(900); ok(pg.locator('#ann').count() == 0, 'visitor page works without the table (no banner, no error)')
    ST['noTable'] = False; ST['founder'] = False
    # ---- Arabic + phone
    ctx2 = b.new_context(viewport={'width': 390, 'height': 800}, locale='ar-EG'); ctx2.route(re.compile(r'https://[a-z0-9]+\.supabase\.co/.*'), sb)
    q = ctx2.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:200])); q.goto(BASE + '?lang=ar'); q.wait_for_selector('#ann .ann', timeout=6000); q.wait_for_timeout(700)
    ok(q.locator('#ann .ann-x').first.get_attribute('aria-label') == 'إغلاق هذا الإعلان', 'Arabic close label')
    bb = q.locator('#ann').bounding_box(); ok(bb['x'] >= 0 and bb['x'] + bb['width'] <= 390, 'fits a 390 px phone (x %d..%d)' % (bb['x'], bb['x'] + bb['width']))
    ok(q.evaluate('document.documentElement.scrollWidth') <= 390, 'no sideways scroll on the phone')
    q.screenshot(path='/tmp/ann-ar-phone.png')
    ok(not errs, 'no page errors %s' % errs[:2])
    b.close()
print('\n%d failed' % len(fails)); sys.exit(1 if fails else 0)
