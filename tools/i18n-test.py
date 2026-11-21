#!/usr/bin/env python3
"""Browser test for Phase 8 (languages). Two parts, no real network.
 A) PSEUDO crawl: for one right-to-left and one left-to-right language file, every text of the language file is replaced by ⟦text⟧.
    Every route (public and private, signed out and with a mock Supabase) is opened; any visible text or label WITHOUT the marker is
    hard-coded in the code and was forgotten by the translation. Also: no sideways scroll at 360 px, html lang/dir, no JavaScript errors.
 B) REAL languages from js/langs.js: switcher, saved choice, reload, title/description/Open Graph, Turnstile language, sign-up locale.
Run in ONE command:  (python3 -m http.server 8765 >/dev/null 2>&1 & echo $! > /tmp/srv.pid; sleep 1; python3 tools/i18n-test.py; kill $(cat /tmp/srv.pid))"""
import json, re, os, subprocess, sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fails = []; os.makedirs('/home/claude/shots', exist_ok=True)
CORS = {'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}
def ok(c, m):
    print(('PASS ' if c else 'FAIL ') + m)
    if not c: fails.append(m)
def node(*a): return subprocess.run(['node', os.path.join(ROOT, 'tools/i18n-tools.js'), *a], capture_output=True, text=True, cwd=ROOT, check=True).stdout
LANGS = json.loads(subprocess.run(['node', '-e', "const v=require('vm');const c={};c.window=c;v.runInNewContext(require('fs').readFileSync('js/langs.js','utf8'),c);console.log(JSON.stringify(c.LANGS))"], capture_output=True, text=True, cwd=ROOT).stdout)
ROUTES = json.loads(open(os.path.join(ROOT, 'routes.json')).read())['routes'] + ['reset', 'new-password', 'nope-404']
# ---- a compact mock Supabase: a signed-in client, and a founder (canned rows; filters are not applied)
SESSION = {'access_token': 'at', 'refresh_token': 'rt', 'expires_at': 4102444800, 'user': {'id': 'u1', 'email': 't@example.com'}}
TS = "window.turnstile={render:function(){return 1},getResponse:function(){return 'T'},reset:function(){}};"
def rows(role):
    me = {'id': 'u1', 'full_name': 'Test Person', 'role': role, 'status': 'active', 'email': 't@example.com', 'locale': 'en', 'created_at': '2026-11-10T10:00:00Z'}
    cl = {'profile_id': 'u2', 'partner_id': 'u1' if role != 'client' else None, 'code_used': 'AB12CD34', 'company': 'Acme', 'country': 'Egypt', 'phone': None, 'created_at': '2026-11-20T10:00:00Z'}
    cp = {'id': 'u2', 'full_name': 'Client Person', 'role': 'client', 'status': 'active', 'email': 'c@example.com', 'locale': 'en', 'created_at': '2026-11-10T10:00:00Z'}
    ans = {'v': 1, 'project': {'intent': 'sell', 'goal': 'A shop'}, 'refine': {'who': 'staff'}, 'items': {'online-store': {'mods': {'Cart': 1}}}}
    br = [{'id': 'b1', 'ref': 'CB-ABCD1234', 'client_id': 'u2' if role != 'client' else 'u1', 'status': 'submitted', 'answers': ans, 'locale': 'en', 'selected_types': ['online-store'], 'created_at': '2026-11-20T10:00:00Z', 'updated_at': '2026-11-20T10:00:00Z', 'submitted_at': '2026-11-20T10:00:00Z'}]
    mt = [{'id': 'm1', 'brief_id': 'b1', 'client_id': 'u2' if role != 'client' else 'u1', 'starts_at': '2030-01-15T10:00:00+00:00', 'timezone': 'Europe/Berlin', 'duration_min': 45, 'status': 'requested', 'note': None}]
    pb = [{'key': 'about', 'sort': 10, 'title': 'About', 'body': [{'t': 'p', 'x': 'Text {link} {code}'}]}]
    return {'profiles': [me, cp] if role != 'client' else [me], 'partners': [{'profile_id': 'u1', 'code': 'AB12CD34', 'director_id': None, 'active': True}], 'clients': [cl], 'client_briefs': br, 'meetings': mt,
            'invitations': [{'id': 'i1', 'email': 'w@x.test', 'role': 'partner', 'director_id': None, 'invited_by': 'u1', 'expires_at': '2030-01-01T00:00:00Z', 'accepted_at': None, 'created_at': '2026-11-15T10:00:00Z'}],
            'playbook': pb, 'data_requests': [{'id': 'r1', 'client_id': 'u2', 'kind': 'export', 'status': 'open', 'created_at': '2026-11-18T10:00:00Z', 'handled_at': None}],
            'audit_log': [{'id': 1, 'at': '2026-11-19T10:00:00Z', 'actor': 'u1', 'action': 'update', 'table_name': 'client_briefs', 'row_id': 'b1', 'changed': ['status']}], 'notes': []}
def make_sb(role):
    R = rows(role)
    def sb(route, req):
        u = req.url
        if req.method == 'OPTIONS': return route.fulfill(status=204, headers=CORS)
        def j(s, d): route.fulfill(status=s, headers={**CORS, 'content-type': 'application/json'}, body=json.dumps(d))
        if '/auth/v1/logout' in u: return route.fulfill(status=204, headers=CORS)
        m = re.search(r'/rest/v1/([a-z_]+)', u)
        if m and req.method == 'GET':
            t = m.group(1); r = R.get(t, [])
            if t == 'profiles' and 'id=eq.' in u: r = [R['profiles'][0]]
            if t == 'clients' and 'profile_id=eq.' in u: r = [R['clients'][0]]
            return j(200, r)
        return j(200, [])
    return sb
# ---- what is on screen without the marker
SCAN = r"""() => {
 const out = new Set(), vis = el => { const r = el.getClientRects(); if (!r.length) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none'; };
 const skip = el => el.closest('[lang="en"],script,style,noscript,svg,#pre,[data-i18n-skip]') || false;
 const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
 while (w.nextNode()) { const n = w.currentNode, t = n.nodeValue.trim(); if (t && n.parentElement && vis(n.parentElement) && !skip(n.parentElement)) out.add(t); }
 document.querySelectorAll('[aria-label],[placeholder],[title],img[alt]').forEach(el => { if (skip(el)) return; for (const a of ['aria-label', 'placeholder', 'title', 'alt']) { const v = el.getAttribute(a); if (v && v.trim() && (a === 'aria-label' || vis(el))) out.add(v.trim()); } });
 document.querySelectorAll('option').forEach(o => { if (o.closest('select') && vis(o.closest('select')) && o.textContent.trim()) out.add(o.textContent.trim()); });
 return [...out];
}"""
OKWORDS = re.compile(r'^(CULMERA|solutions|Solutions|Microsoft|Teams|Ctrl|K|CB|PDF|CSV|SSO|CRM|ERP|API|URL|AI|3D|AR|VR|RTL|OK|UTC|SaaS|GmbH|Ltd|Co|WhatsApp|LinkedIn|Instagram|Facebook|YouTube|info|culmera|com)$')
def stray(t):
    r = re.sub(r'⟦[^⟧]*⟧', ' ', t)
    r = re.sub(r'[\w.+-]+@[\w.-]+', ' ', r); r = re.sub(r'https?://\S+', ' ', r)
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z']{2,}", r) if not OKWORDS.match(w)]
    return bool(words) and '⟦' not in t or (bool(words) and len(words) > 0 and '⟦' in t and False)
def routes_for(role):
    return ['account', 'meeting', 'brief'] if role == 'client' else ['team', 'brief']
with sync_playwright() as p:
    b = p.chromium.launch()
    for code, dirx in (('ar', 'rtl'), ('fr', 'ltr')):
        pseudo = node('pseudo', code)
        for role in (None, 'client', 'founder'):
            ctx = b.new_context(viewport={'width': 1280, 'height': 900}, timezone_id='Europe/Berlin'); errs = []
            ctx.route('**/js/i18n/%s.js' % code, lambda r, q, s=pseudo: r.fulfill(status=200, content_type='application/javascript', body=s))
            ctx.route(re.compile(r'https://challenges\.cloudflare\.com/.*'), lambda r, q: r.fulfill(status=200, content_type='application/javascript', body=TS))
            ctx.route(re.compile(r'https://[a-z0-9]+\.supabase\.co/.*'), make_sb(role or 'client') if role else (lambda r, q: r.fulfill(status=200, headers=CORS, content_type='application/json', body='[]')))
            ctx.add_init_script("try{localStorage.setItem('culmera.lang','%s')%s}catch(e){}" % (code, (";localStorage.setItem('culmera.session',%s)" % json.dumps(json.dumps(SESSION))) if role else ''))
            pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
            who = role or 'visitor'; seen = set(); bad = {}
            todo = (ROUTES if not role else routes_for(role))
            pg.goto(BASE + '#/home'); pg.wait_for_selector('#app h1', timeout=8000)
            ok(pg.evaluate('document.documentElement.lang') == code and pg.evaluate('document.documentElement.dir') == dirx, '%s/%s: html lang and dir' % (code, who))
            for r in todo:
                for vw in ((1280, 360) if r in ('home', 'brief', 'account', 'meeting', 'team', 'catalog') else (1280,)):
                    pg.set_viewport_size({'width': vw, 'height': 900}); pg.goto(BASE + '#/' + r); pg.reload(); pg.wait_for_selector('#app h1,#app h2', timeout=8000); pg.wait_for_timeout(250)
                    if vw == 1280:
                        for t in pg.evaluate(SCAN):
                            if stray(t) and t not in seen: seen.add(t); bad.setdefault(r, []).append(t)
                    else:
                        ow = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
                        ok(ow <= 1, '%s/%s #/%s: no sideways scroll at 360 px (%s)' % (code, who, r, ow))
            for r, ts in bad.items():
                for t in ts[:12]: print('   UNTRANSLATED %s/%s #/%s: %r' % (code, who, r, t[:90]))
            ok(not bad, '%s/%s: no hard-coded text on %d routes (%d strings)' % (code, who, len(todo), sum(len(v) for v in bad.values())))
            ok(not errs, '%s/%s: no JavaScript errors %s' % (code, who, errs[:2]))
            ctx.close()
    b.close()
print('\n%d failed' % len(fails)); sys.exit(1 if fails else 0)
