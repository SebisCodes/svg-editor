"""The example view and the template view of template placeholders on the canvas, through the real
postMessage path of a page around the editor.

Start the editor first (php -S 127.0.0.1:8093), then:
    python3 tests/template_view_test.py

A page on its own port embeds the editor with ?embed=1&template=mustache and loads a label with
`template` (placeholders, examples, one example picture):
  - the example view is the default: no tag shown, examples, sections and list rows applied, the
    label in brackets for a placeholder without an example, the example picture from memory;
  - an address that held a placeholder is never requested, in both views: a picture shows the
    placeholder picture, a link goes, CSS keeps only local references;
  - the switch (two buttons of one width, the focus kept) shows the template view: the tags as their
    text, no error;
  - a click on a shape of the example view selects its element of the code, also for a list row;
    a text with an example is edited in the code, a text of the code on the canvas; a shape moved
    with the keys changes its element of the code, whose tags stay as written;
  - "get" and "change" carry the template as written;
  - the "Placeholders" box is closed at the start, opens over the code without moving it, and puts
    a tag at the cursor (a section around the selection) as one undo step;
  - the side panel is closed at the start and its button stays in its place;
  - "svgeditor:template" from a window other than the page is ignored, a later message replaces the
    list, clear ends it; without ?template= nothing of this is there.
Needs Playwright for Python and Google Chrome.
"""
import base64
import json
import os
import re
import struct
import subprocess
import sys
import tempfile
import time
import zlib
from pathlib import Path

from playwright.sync_api import sync_playwright

EDITOR_URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8093/')
HOST_PORT = 8193
CODE = """<svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
  <style>.remote { fill: url(https://x.invalid/css/{{id}}); }</style>
  <style>[data-key^="4"] { fill: url(https://x.invalid/selector/4); }</style>
  <title>Order {{orderNumber}}</title>
  <rect id="frame" x="0" y="0" width="400" height="260" fill="#ffffff" stroke="#333333"/>
  <image id="logo" href="{{logo}}" x="300" y="16" width="80" height="40"/>
  <image id="remote" href="https://x.invalid/pic/{{id}}.png" x="300" y="70" width="20" height="20"/>
  <a id="track" href="https://x.invalid/go/{{id}}"><text x="300" y="120">Track</text></a>
  <rect id="styled" style="fill: url(https://x.invalid/style/{{id}})" x="300" y="130" width="10" height="10"/>
  <rect id="escaped" style="fill: u\\72l(https://x.invalid/escaped/{{id}})" data-key="{{id}}" x="320" y="130" width="10" height="10"/>
  <use id="mark" href="#{{ref}}" x="2"/>
  <script><g/></script>
  <text id="name" x="20" y="40" font-size="20">Dear {{name}}</text>
  <text id="city" x="20" y="70">{{city}}</text>
  <g id="items">
    {{#items}}
    <text class="item" x="20" y="{{y}}">{{label}}: {{quantity}}</text>
    {{/items}}
  </g>
  {{#hasNote}}<text id="note" x="20" y="200">Note: {{note}}</text>{{/hasNote}}
  {{^hasNote}}<text id="no-note" x="20" y="200">No note.</text>{{/hasNote}}
  <text id="total" x="20" y="220">Total {{total}}</text>
  <text id="plain" x="20" y="245">Plain words here.</text>
  <style>.hex { background-image: url(https://x.invalid/hex/\\7b\\7bid\\7d\\7d); }</style>
  <style>.named { background-image: \\75rl(https://x.invalid/named/{{id}}); } .quoted { background-image: url("https://x.invalid/quoted/\\"{{id}}"); }</style>
  <style>@import url(https://x.invalid/import-url/{{id}}); .set { background-image: image-set('https://x.invalid/image-set/{{id}}' 1x); } .open { background-image: url(https://x.invalid/open/{{id}}</style>
  <rect id="fill-escaped" fill="u\\72l(https://x.invalid/fill/{{id}})" x="340" y="130" width="10" height="10"/>
  <rect id="animated" x="360" y="130" width="10" height="10"><set attributeName="fill" to="url(https://x.invalid/animated/{{id}})"/></rect>
  <foreignObject x="300" y="150" width="90" height="20"><div xmlns="http://www.w3.org/1999/xhtml" style="display:flex"><div class="hex" style="width:10px;height:10px"></div><div class="named" style="width:10px;height:10px"></div><div class="quoted" style="width:10px;height:10px"></div><div class="set" style="width:10px;height:10px"></div><div class="open" style="width:10px;height:10px"></div><div style="width:10px;height:10px;background-image:url(https://x.invalid/style-open/{{id}}"></div></div></foreignObject>
</svg>
"""
failed = []


def check_that(ok, text):
    """Prints one result line and notes a failure.

    Args:
        ok (bool): True when the check holds.
        text (str): what is checked.

    Returns:
        None: the result is printed and a failure is noted.
    """
    print(('ok    ' if ok else 'FAIL  ') + text, flush=True)
    if not ok:
        failed.append(text)


def build_png_address():
    """Returns a red 4 x 3 PNG as a data address.

    Returns:
        str: the data address.
    """
    def build_chunk(kind, data):
        """Returns one PNG chunk.

        Args:
            kind (bytes): the chunk type.
            data (bytes): its data.

        Returns:
            bytes: the chunk with length and checksum.
        """
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    rows = b''.join(b'\x00' + b'\xff\x00\x00' * 4 for _ in range(3))
    png = b'\x89PNG\r\n\x1a\n' + build_chunk(b'IHDR', struct.pack('>IIBBBBB', 4, 3, 8, 2, 0, 0, 0)) + build_chunk(b'IDAT', zlib.compress(rows)) + build_chunk(b'IEND', b'')
    return 'data:image/png;base64,' + base64.b64encode(png).decode()


TEMPLATE = {
    'placeholders': [
        {'name': 'name', 'kind': 'value', 'label': 'Name', 'example': 'John Doe'},
        {'name': 'orderNumber', 'kind': 'value', 'label': 'Order number', 'example': 'A-17'},
        {'name': 'id', 'kind': 'value', 'label': 'Id', 'example': '42'},
        {'name': 'ref', 'kind': 'value', 'label': 'Reference', 'example': 'frame'},
        {'name': 'city', 'kind': 'value', 'label': 'City', 'example': 'Springfield & Co <8000>'},
        {'name': 'total', 'kind': 'value', 'label': 'Total'},
        {'name': 'logo', 'kind': 'image', 'label': 'Logo', 'image': 'logo.png'},
        {'name': 'hasNote', 'kind': 'section', 'label': 'With a note', 'shown': False},
        {'name': 'items', 'kind': 'list', 'label': 'Items',
         'fields': [{'name': 'label', 'label': 'Item'}, {'name': 'quantity', 'label': 'Quantity'}, {'name': 'y', 'label': 'Line'}],
         'rows': [{'label': 'Chair', 'quantity': '2', 'y': '120'}, {'label': 'Table', 'quantity': '1', 'y': '140'}]},
    ],
    'assets': {'logo.png': build_png_address(), 'vector.svg': 'data:image/svg+xml;base64,' + base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg"/>').decode()},
}
HOST = """<!doctype html><meta charset="utf-8"><title>host</title>
<iframe id="f" src="EDITOR?embed=1QUERY" style="width:1300px;height:820px;border:0"></iframe>
<iframe id="other" srcdoc="<p>other</p>" style="width:10px;height:10px"></iframe>
<script>
window.log = [];
const frame = document.getElementById('f');
const target = new URL(frame.src).origin;
window.sendToEditor = message => frame.contentWindow.postMessage(message, target);
addEventListener('message', event => {
  if (event.source !== frame.contentWindow) return;
  log.push(event.data);
  if (event.data.type === 'svgeditor:ready') sendToEditor({ type: 'svgeditor:load', name: 'Label', content: CODE, template: TEMPLATE });
});
</script>"""


def get_canvas_text(frame):
    """Returns the text the canvas shows.

    Args:
        frame (Frame): the editor's frame.

    Returns:
        str: the text of the drawing on the canvas.
    """
    return frame.evaluate("() => document.querySelector('#host').shadowRoot.querySelector('svg').textContent")


def get_canvas_attribute(frame, selector, name):
    """Returns an attribute of an element on the canvas.

    Args:
        frame (Frame): the editor's frame.
        selector (str): the CSS selector of the element in the drawing.
        name (str): the attribute's name.

    Returns:
        str | None: the value, None when the element or the attribute is missing.
    """
    return frame.evaluate("([selector, name]) => { const e = document.querySelector('#host').shadowRoot.querySelector(selector); return e ? e.getAttribute(name) : null; }", [selector, name])


def wait_for_render(page):
    """Waits until the canvas is drawn again.

    Args:
        page (Page): the host page.

    Returns:
        None: the time has passed.
    """
    page.wait_for_timeout(700)


def check_views(page, frame, requests):
    """Checks the example view, the leak rule and the template view.

    Args:
        page (Page): the host page.
        frame (Frame): the editor's frame.
        requests (list[str]): the addresses requested so far.

    Returns:
        None: the results are printed.
    """
    text = get_canvas_text(frame)
    check_that('{{' not in text and 'Dear John Doe' in text and 'Order A-17' in text, 'the example view is the default, no tag shown')
    check_that('Chair: 2' in text and 'Table: 1' in text and 'No note.' in text and 'Note:' not in text, 'list rows and sections by example state')
    check_that('Total [Total]' in text and 'Springfield & Co <8000>' in text, 'a placeholder without an example shows its label in brackets, special characters as text')
    rows = frame.evaluate("() => [...document.querySelector('#host').shadowRoot.querySelectorAll('text.item')].map(t => t.getAttribute('y'))")
    check_that(rows == ['120', '140'], f'a list row fills its attribute values {rows}')
    check_that((get_canvas_attribute(frame, '#logo', 'href') or '').startswith('data:image/png;base64,'), 'the example picture comes from memory')
    check_that((get_canvas_attribute(frame, '#remote', 'href') or '').startswith('data:image/svg+xml'), 'a picture address that held a placeholder shows the placeholder picture')
    check_that(get_canvas_attribute(frame, '#track', 'href') is None, 'a link that held a placeholder goes')
    styled = (get_canvas_attribute(frame, '#styled', 'style') or '') + frame.evaluate("() => document.querySelector('#host').shadowRoot.querySelector('svg style').textContent")
    addresses = re.findall(r'url\(\s*["\']?([^"\')]*)', styled)
    check_that(addresses and all(address.startswith(('data:', '#')) for address in addresses), f'CSS that held a placeholder keeps only local references {[a[:20] for a in addresses]}')
    check_that(get_canvas_attribute(frame, '#mark', 'href') == '#frame', 'a reference inside the drawing filled with an example stays')
    check_that('x.invalid' not in (get_canvas_attribute(frame, '#escaped', 'style') or ''), 'CSS with an escape is left out')
    check_that(get_canvas_attribute(frame, '#fill-escaped', 'fill') is None, 'an SVG paint with an escape is left out')
    animated = frame.evaluate("() => document.querySelector('#host').shadowRoot.querySelector('#animated set')?.getAttribute('to') || ''")
    check_that(animated == '' or animated.startswith('url("data:'), f'an animation value that held a placeholder names only a picture in memory {animated[:30]}')
    check_that([url for url in requests if 'x.invalid' in url] == [], 'no address that held a placeholder is requested in the example view, nor one a selector over filled values picks')
    switch = frame.locator('#view-switch')
    widths = frame.evaluate("() => [...document.querySelectorAll('#view-switch [data-view-set]')].map(b => b.getBoundingClientRect().width)")
    box_before = switch.bounding_box()
    frame.locator('[data-view-set="template"]').click()
    wait_for_render(page)
    text = get_canvas_text(frame)
    check_that('Dear {{name}}' in text and '{{label}}: {{quantity}}' in text and 'John Doe' not in text, 'the template view shows the tags as their text')
    stale = frame.evaluate("() => document.querySelector('#stage').classList.contains('stale') || !document.querySelector('#code-error').hidden")
    check_that(not stale, 'the template view shows no error')
    check_that(len(set(round(width) for width in widths)) == 1 and switch.bounding_box() == box_before, f'the switch keeps one width and its place {widths}')
    state = frame.evaluate("() => [document.activeElement.dataset.viewSet, document.querySelector('[data-view-set=template]').getAttribute('aria-checked')]")
    check_that(state == ['template', 'true'], f'the focus stays on the switch, its state is announced {state}')
    leaked = [url for url in requests if 'x.invalid' in url]
    check_that(leaked == [], f'no address that held a placeholder is requested in the template view {leaked}')
    frame.locator('[data-view-set="example"]').click()
    wait_for_render(page)


def get_selected_start(frame):
    """Returns where the selected element starts in the code.

    Args:
        frame (Frame): the editor's frame.

    Returns:
        int: the offset of its start tag, -1 without a selection.
    """
    return frame.evaluate("() => { const e = window.svgEditor; const tag = e.scan()[e.state.sel]; return e.state.sel > 0 && tag ? tag.start : -1; }")


def check_map(page, frame):
    """Checks that a click on the canvas selects the element of the code and edits follow the map.

    Args:
        page (Page): the host page.
        frame (Frame): the editor's frame.

    Returns:
        None: the results are printed.
    """
    frame.locator('#host text#plain').click()
    page.wait_for_timeout(200)
    check_that(get_selected_start(frame) == CODE.index('<text id="plain"'), 'a click on a shape selects its element of the code')
    frame.locator('#host text.item', has_text='Table').click()
    page.wait_for_timeout(200)
    check_that(get_selected_start(frame) == CODE.index('<text class="item"'), 'a click on a list row selects the element of the code it repeats')
    frame.locator('#host text#name').dblclick()
    page.wait_for_timeout(300)
    field = frame.evaluate("() => !!document.querySelector('.text-in-place')")
    check_that(not field, 'a text with an example is edited in the code, not on the canvas')
    frame.locator('#host text#plain').dblclick()
    page.wait_for_timeout(300)
    value = frame.evaluate("() => { const f = document.querySelector('.text-in-place'); return f ? f.value : null; }")
    check_that(value == 'Plain words here.', f'a text of the code is edited on the canvas ({value!r})')
    frame.locator('.text-in-place').press('Escape')
    frame.locator('#host text#plain').click()
    frame.locator('#stage').press('ArrowRight')
    page.wait_for_timeout(900)
    code = frame.evaluate('() => window.svgEditor.state.code')
    check_that('<text id="plain" x="20"' not in code and code.count('<text id="plain" x="') == 1, 'a shape moved with the keys changes its element of the code')
    frame.evaluate('() => window.svgEditor.undo()')
    wait_for_render(page)
    frame.locator('#host text.item', has_text='Chair').click()
    frame.locator('#stage').press('ArrowRight')
    page.wait_for_timeout(900)
    code = frame.evaluate('() => window.svgEditor.state.code')
    start_tag = re.search(r'<text class="item"[^>]*>', code).group(0)
    check_that('y="{{y}}"' in start_tag and 'transform=' in start_tag and 'John Doe' not in code and 'Chair' not in code,
               f'a list row moved with the keys changes the element of the code it repeats, its tags stay as written ({start_tag})')
    moves = frame.evaluate("() => [...document.querySelector('#host').shadowRoot.querySelectorAll('text.item')].map(t => t.getAttribute('transform'))")
    check_that(len(moves) == 2 and moves[0] and len(set(moves)) == 1, f'every row of the list shows the change {moves}')
    frame.evaluate('() => window.svgEditor.undo()')
    wait_for_render(page)


def check_messages_out(page, frame):
    """Checks that get and change carry the template as written.

    Args:
        page (Page): the host page.
        frame (Frame): the editor's frame.

    Returns:
        None: the results are printed.
    """
    page.evaluate("() => sendToEditor({ type: 'svgeditor:get' })")
    page.wait_for_timeout(500)
    saves = page.evaluate("() => log.filter(m => m.type === 'svgeditor:save')")
    check_that(saves and saves[-1]['content'] == CODE, '"get" answers with the template as written')
    frame.locator('#code').click()
    frame.locator('#code').press('Control+End')
    frame.locator('#code').type(' ')
    page.wait_for_timeout(1200)
    changes = page.evaluate("() => log.filter(m => m.type === 'svgeditor:change')")
    check_that(changes and '{{name}}' in changes[-1]['content'] and 'John Doe' not in changes[-1]['content'], '"change" carries the template')
    frame.locator('#code').press('Backspace')
    page.wait_for_timeout(800)


def check_box(page, frame):
    """Checks the "Placeholders" box: closed at the start, opens without moving the code, inserts as one undo step.

    Args:
        page (Page): the host page.
        frame (Frame): the editor's frame.

    Returns:
        None: the results are printed.
    """
    check_that(frame.evaluate("() => document.querySelector('[data-placeholder-list]').hidden"), 'the box is closed at the start')
    code_box = frame.locator('#code').bounding_box()
    header_box = frame.locator('[data-placeholder-toggle]').bounding_box()
    frame.locator('[data-placeholder-toggle]').click()
    page.wait_for_timeout(200)
    check_that(frame.locator('#code').bounding_box() == code_box and frame.locator('[data-placeholder-toggle]').bounding_box() == header_box,
               'the box opens over the code without moving it')
    entries = frame.evaluate("() => [...document.querySelectorAll('.placeholder-entry')].map(e => [e.querySelector('.placeholder-label').textContent, e.querySelector('.placeholder-tag').textContent, e.getBoundingClientRect().height])")
    check_that(entries[0][:2] == ['Name', '{{name}}'] and len({round(entry[2]) for entry in entries}) == 1, f'label, tag and example, one height {entries[:2]}')
    before = frame.evaluate('() => document.querySelector("#code").value')
    word_start = before.index('Plain words')
    frame.evaluate(f"() => {{ const t = document.querySelector('#code'); t.focus(); t.setSelectionRange({word_start}, {word_start + 5}); }}")
    frame.locator('.placeholder-entry', has_text='{{#hasNote}}').click()
    page.wait_for_timeout(500)
    after = frame.evaluate('() => document.querySelector("#code").value')
    selection = frame.evaluate("() => { const t = document.querySelector('#code'); return t.value.slice(t.selectionStart, t.selectionEnd); }")
    check_that('{{#hasNote}}Plain{{/hasNote}} words' in after and selection == 'Plain', 'a section goes around the selection, which stays selected')
    frame.evaluate('() => window.svgEditor.undo()')
    page.wait_for_timeout(400)
    check_that(frame.evaluate('() => document.querySelector("#code").value') == before, 'one undo step takes it back')
    frame.locator('[data-placeholder-toggle]').click()


def check_panel(frame):
    """Checks that the side panel is closed at the start, that it opens as a column right of the
    canvas and that its button keeps its place.

    Args:
        frame (Frame): the editor's frame.

    Returns:
        None: the results are printed.
    """
    shown = frame.evaluate("() => getComputedStyle(document.querySelector('#side-panel')).display")
    button = frame.locator('#btn-panel')
    place = button.bounding_box()
    canvas_box = frame.locator('.draw-pane').bounding_box()
    button.click()
    opened = frame.evaluate("() => getComputedStyle(document.querySelector('#side-panel')).display")
    check_that(shown == 'none' and opened != 'none', f'the side panel is closed at the start and opens ({shown} -> {opened})')
    narrowed, panel = frame.locator('.draw-pane').bounding_box(), frame.locator('#side-panel').bounding_box()
    check_that(button.bounding_box() == place and narrowed['width'] < canvas_box['width']
               and abs(narrowed['x'] + narrowed['width'] - panel['x']) <= 1, 'the open panel is a column right of the canvas, which gets narrower; its button stays in its place')
    button.click()


def check_messages_in(page, frame):
    """Checks the template messages: another window ignored, a later list replaces, clear ends it.

    Args:
        page (Page): the host page.
        frame (Frame): the editor's frame.

    Returns:
        None: the results are printed.
    """
    other = {'type': 'svgeditor:template', 'placeholders': [{'name': 'name', 'kind': 'value', 'example': 'Mallory'}]}
    page.evaluate("message => document.getElementById('other').contentWindow.eval(`parent.frames[0].postMessage(${JSON.stringify(message)}, '*')`)", other)
    wait_for_render(page)
    check_that('Mallory' not in get_canvas_text(frame), 'a template message from another window is ignored')
    page.evaluate("message => sendToEditor(message)", {'type': 'svgeditor:template', 'placeholders': [{'name': 'name', 'kind': 'value', 'label': 'Name', 'example': 'Jane Roe'}]})
    wait_for_render(page)
    text = get_canvas_text(frame)
    check_that('Jane Roe' in text and 'Order A-17' not in text and '[orderNumber]' in text, 'a later message replaces the list')
    page.evaluate("message => sendToEditor(message)", {'type': 'svgeditor:template', 'clear': True})
    wait_for_render(page)
    text = get_canvas_text(frame)
    check_that('Jane Roe' not in text and '[name]' in text, 'clear ends the examples; the tags of the drawing stay as labels')


def check_option_off(page):
    """Checks that without ?template= the controls are missing and the canvas shows the code as written.

    Args:
        page (Page): the host page.

    Returns:
        None: the results are printed.
    """
    page.goto(f'http://127.0.0.1:{HOST_PORT}/svg-off.html')
    page.wait_for_timeout(3000)
    frame = page.frames[1]
    visible = frame.evaluate("() => ['#view-switch', '#placeholder-box', '#view-note'].map(s => getComputedStyle(document.querySelector(s)).display)")
    check_that(visible == ['none', 'none', 'none'], f'option off: no switch, no box, no note {visible}')
    check_that('Dear {{name}}' in get_canvas_text(frame), 'option off: the canvas as before')


def main():
    """Runs the checks.

    Returns:
        None: the process ends with 1 when a check failed.
    """
    with tempfile.TemporaryDirectory() as folder:
        for query, name in (('&template=mustache', 'svg.html'), ('', 'svg-off.html')):
            html = HOST.replace('EDITOR', EDITOR_URL).replace('QUERY', query)
            html = html.replace('CODE', json.dumps(CODE).replace('</', '<\\/')).replace('TEMPLATE', json.dumps(TEMPLATE))
            Path(folder, name).write_text(html, encoding='utf-8')
        server = subprocess.Popen([sys.executable, '-m', 'http.server', str(HOST_PORT), '--bind', '127.0.0.1', '-d', folder],
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(0.8)
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(executable_path=os.environ.get('CHROME', '/usr/bin/google-chrome'), headless=True)
                context = browser.new_context(viewport={'width': 1400, 'height': 900})
                requests = []
                context.on('request', lambda request: requests.append(request.url))
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.goto(f'http://127.0.0.1:{HOST_PORT}/svg.html')
                page.wait_for_timeout(3500)
                frame = page.frames[1]
                check_views(page, frame, requests)
                check_map(page, frame)
                check_box(page, frame)
                check_panel(frame)
                check_messages_out(page, frame)
                check_messages_in(page, frame)
                check_that(errors == [], f'no script errors {errors}')
                check_option_off(page)
                leaked = [url for url in requests if 'x.invalid' in url]
                check_that(leaked == [], f'no address that holds a placeholder is requested at all {leaked}')
                browser.close()
        finally:
            server.terminate()
    print('FAILED: ' + str(len(failed)) if failed else 'all passed')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
