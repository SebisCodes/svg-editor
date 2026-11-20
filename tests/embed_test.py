"""Embedding (iframe + postMessage) and the webhook.

    php -S 127.0.0.1:8093 -t src src/php/router.php          (in the project folder)
    python tests/embed_test.py

A host page on another port embeds the editor, loads a drawing, and gets
"change" and "save" messages; a small PHP webhook on the
same port records what the editor sends."""

import json
import os
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8093/')
HERE = os.path.dirname(os.path.abspath(__file__))
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


HOST = """<!doctype html><meta charset="utf-8"><title>host</title>
<iframe id="f" src="EDITOR?embed=1" style="width:1300px;height:820px;border:0"></iframe>
<script>
window.log = [];
const frame = document.getElementById('f');
addEventListener('message', async e => {
  if (e.source !== frame.contentWindow) return;
  log.push(e.data);
  if (e.data.type === 'svgeditor:ready') {
    frame.contentWindow.postMessage({ type: 'svgeditor:load', name: 'Badge',
      content: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle id="c" cx="50" cy="50" r="40" fill="#e33"/></svg>' },
      new URL(frame.src).origin);
  }
});
</script>"""

HOOK = """<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');
// Chrome asks before a public page (the live editor) talks to this local test server.
header('Access-Control-Allow-Private-Network: true');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;
file_put_contents(__DIR__ . '/hook.json', json_encode(['auth' => $_SERVER['HTTP_AUTHORIZATION'] ?? '', 'body' => json_decode(file_get_contents('php://input'), true)]));
echo '{"ok":true}';
"""

with tempfile.TemporaryDirectory() as d:
    with open(os.path.join(d, 'host.html'), 'w') as f:
        f.write(HOST.replace('EDITOR', EDITOR))
    with open(os.path.join(d, 'hook.php'), 'w') as f:
        f.write(HOOK)
    server = subprocess.Popen(['php', '-S', '127.0.0.1:8096', '-t', d], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    try:
        with sync_playwright() as pw:
            # The live editor (a public page) may not talk to a local test server without these flags.
            browser = pw.chromium.launch(channel='chrome', headless=True, args=['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights'])
            page = browser.new_page(viewport={'width': 1360, 'height': 860})
            errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.goto('http://127.0.0.1:8096/host.html', wait_until='networkidle')
            page.wait_for_timeout(2500)
            frame = next(fr for fr in page.frames if fr.url.startswith(EDITOR))
            def get_types():
                """Return the types of the messages the page got.

                Returns:
                    list[str]: the types in order.
                """
                return page.evaluate('log.map(m => m.type)')

            check_that(get_types()[:2] == ['svgeditor:ready', 'svgeditor:loaded'], 'ready, then loaded')
            check_that(frame.evaluate('svgEditor.state.name') == 'Badge', 'the drawing from the page is open')
            check_that('<circle id="c"' in frame.evaluate('svgEditor.state.code'), 'its code is in the editor')
            check_that('svgeditor:change' not in get_types(), 'loading is not reported as a change')
            check_that(frame.evaluate('document.documentElement.classList.contains("embedded")'), 'embedded mode')
            check_that(frame.locator('#btn-save').is_visible() and not frame.locator('.page-text').is_visible(), 'Save button, no page text')
            frame.evaluate('() => { const i = svgEditor.state.modelEls.findIndex(m => m.id === "c"); svgEditor.select(i); }')
            frame.evaluate('() => { const t = document.querySelector("#code"); t.focus(); const i = t.value.indexOf("#e33"); t.setSelectionRange(i, i + 4); document.execCommand("insertText", false, "#33e"); }')
            page.wait_for_timeout(900)
            check_that('svgeditor:change' in get_types(), 'an edit is reported')
            frame.click('#btn-save')
            page.wait_for_timeout(400)
            last = page.evaluate('log[log.length - 1]')
            check_that(last['type'] == 'svgeditor:save' and '#33e' in last['content'], 'Save hands the drawing to the page')
            def has_no_files(x):
                """Tell whether a message carries no fields of pictures and files.

                Args:
                    x (dict): the message.

                Returns:
                    bool: True without assets, assetsChanged and assetsRemoved.
                """
                return not ({'assets', 'assetsChanged', 'assetsRemoved'} & set(x))

            check_that(all(has_no_files(x) for x in page.evaluate('log') if x['type'] in ('svgeditor:save', 'svgeditor:change')), 'save and change carry no assets fields (drawings have no separate files)')

            # Webhook
            frame.click('#btn-sync')
            frame.fill('#sync-url', 'http://127.0.0.1:8096/hook.php')
            frame.fill('#sync-token', 'secret')
            frame.click('#sync-test')
            page.wait_for_timeout(1500)
            status = frame.inner_text('#sync-status')
            try:
                with open(os.path.join(d, 'hook.json')) as f:
                    got = json.load(f)
            except FileNotFoundError:
                got = {'auth': '', 'body': {}}
                print('      webhook not reached: ' + status)
            check_that(got['auth'] == 'Bearer secret', 'webhook: token as Bearer')
            check_that(got['body'].get('editor') == 'svg' and got['body']['name'] == 'Badge' and '#33e' in got['body']['content'], 'webhook: the drawing as JSON')
            check_that('assets' not in got['body'] and 'assetsChanged' not in got['body'], 'webhook: no assets fields')
            check_that('Saved on' in status, 'webhook: status shows it was saved')
            check_that(not errors, 'no script errors' + (': ' + '; '.join(errors) if errors else ''))
            browser.close()
    finally:
        server.terminate()

print(f'\n{len(failures)} failed' if failures else '\nall passed')
sys.exit(1 if failures else 0)
