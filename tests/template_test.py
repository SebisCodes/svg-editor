"""Template placeholders (?template=mustache, ?template=angle): how the SVG editor reads them.

    python3 tests/template_test.py

Node part (always):
  label     a shipping label template with {{name}} in text, a comment and attribute values,
            sections around the root element and inside it and an inverted section
            (tests/label-template.svg): the browser reads a text as long as the code, each tag
            inside the root as a marker that carries its number, the sections around the root as
            spaces; the elements are found at the same places as in the code
  angle     the same in the syntax "angle" (tests/label-template-angle.svg): no "<<" reaches the browser
  off       with the option off the browser reads the code as it is
  errors    a section left open and a stray end tag are the code's error, with line and column
  view      the code view shows every tag as written, without a color of its own; option off: the
            plain highlighting
  write     a value written into a start tag keeps its tags as written and escapes the rest
  examples  the filled text of the example view: examples as text in text and attribute values
            with XML's escapes, only plain words in CSS, nothing in event attributes and scripts,
            comments kept closed, list rows repeated, sections by example state, the label in
            brackets without an example
Browser part (with a server at EDITOR_URL, default http://127.0.0.1:8093/):
  both templates show without error; the example view (the default) shows the labels in brackets
  and the placeholder picture for the logo; the template view holds the tags as written; moving
  shapes keeps every tag of the rewritten start tags and leaves a coordinate with a placeholder as
  written; Tidy up keeps the code; the properties show a value with a placeholder as text;
  references with placeholders stay unrequested, with and without the option; option off and
  another value give the old error.
Needs Node; the browser part needs Playwright and Google Chrome."""
import html
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(os.path.dirname(HERE), 'src', 'js')
URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8093/')
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


def run_report(cases):
    """Runs tests/template/report.mjs in Node on the cases.

    Args:
        cases (list[dict]): each with `code` (str), `template` (str or None) and optionally `value` (str).

    Returns:
        list[dict]: one result per case, in order.
    """
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as file:
        json.dump(cases, file)
    try:
        run = subprocess.run(['node', os.path.join(HERE, 'template', 'report.mjs'), SCRIPTS, file.name],
                             capture_output=True, text=True, timeout=120)
    finally:
        os.unlink(file.name)
    if run.returncode:
        print(run.stderr)
        sys.exit('report.mjs failed')
    return json.loads(run.stdout)


def get_plain_text(highlighted):
    """Returns the plain text of highlighted HTML.

    Args:
        highlighted (str): the HTML of the code view.

    Returns:
        str: the text with the tags removed and the entities decoded.
    """
    return html.unescape(re.sub(r'<[^>]+>', '', highlighted))


def read_fixture(name):
    """Reads a fixture file of the tests folder.

    Args:
        name (str): the file name.

    Returns:
        str: its text.
    """
    with open(os.path.join(HERE, name), encoding='utf-8') as fixture:
        return fixture.read()


LABEL = read_fixture('label-template.svg')
ANGLE = read_fixture('label-template-angle.svg')
BROKEN = '<svg xmlns="http://www.w3.org/2000/svg">\n  {{#items}}<text>{{title}}</text>\n  {{/total}}\n</svg>\n'
EXAMPLES = """<svg xmlns="http://www.w3.org/2000/svg">
  <style>.a { fill: {{color}} }</style>
  <!-- for {{comment}} -->
  <text>Dear {{name}}</text>
  <rect title="{{title}}" data-single='{{single}}' style="fill: {{color}}" onclick="{{name}}" width="1" height="1"/>
  <script>{{name}}</script>
  {{#items}}
  <text class="row">{{label}}: {{quantity}}</text>
  {{/items}}
  {{#hasNote}}<text>Note: {{note}}</text>{{/hasNote}}{{^hasNote}}<text>No note</text>{{/hasNote}}
  <text>{{total}}</text>
</svg>
"""
EXAMPLE_MESSAGE = {'placeholders': [
    {'name': 'name', 'example': 'John Doe & Co <Ltd>'}, {'name': 'title', 'example': 'A "quoted" <value>'},
    {'name': 'single', 'example': "it's"}, {'name': 'color', 'example': 'red; } body { x: url(a)'},
    {'name': 'comment', 'example': 'John Doe -- x -'}, {'name': 'total', 'label': 'Total'},
    {'name': 'hasNote', 'kind': 'section', 'shown': False},
    {'name': 'items', 'kind': 'list', 'fields': [{'name': 'label'}, {'name': 'quantity'}],
     'rows': [{'label': 'Chair', 'quantity': '2'}, {'label': 'Table', 'quantity': '1'}]}]}
REFERENCES = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">\n'
              '  <style>@import "https://example.com/{{font}}.css"; rect { fill: url(https://example.com/{{fill}}.png); }</style>\n'
              '  <image href="https://example.com/{{logo}}.png" width="50" height="50"/>\n'
              '  <image xlink:href="https://example.com/%7B%7Bpicture%7D%7D.png" x="50" width="50" height="50"/>\n'
              '  <use href="https://example.com/{{symbols}}.svg#a"/>\n'
              '  <rect style="fill: url(\'https://example.com/{{pattern}}.png\')" y="50" width="50" height="50"/>\n'
              '  <rect style="fill: URL(https://example.com/{{upper}}.png)" x="50" y="50" width="50" height="50"/>\n'
              '  <rect style="background: image-set(\'https://example.com/{{set}}.png\' 1x)" width="10" height="10"/>\n'
              '  <rect style="background: image-set(url(\'safe.png\') 1x, \'https://example.com/{{nested}}.png\' 2x); fill: url(&quot;https://example.com/a\\&quot;{{escaped}}.png&quot;)" width="10" height="10"/>\n'
              '  <foreignObject width="10" height="10"><img xmlns="http://www.w3.org/1999/xhtml" src="https://example.com/{{photo}}.png"/></foreignObject>\n'
              '  <image id="live" width="10" height="10"/>\n'
              '</svg>\n')


def run_node_part():
    """Runs the checks of the Node part and prints their results.

    Returns:
        None: the results are printed and failures noted.
    """
    label, angle, label_off, broken, written, literal, filled, filled_angle = run_report([
        {'code': LABEL, 'template': 'mustache'}, {'code': ANGLE, 'template': 'angle'}, {'code': LABEL, 'template': None},
        {'code': BROKEN, 'template': 'mustache'}, {'code': '', 'template': 'angle', 'value': 'a < b <<name>> & "c"'},
        {'code': '<svg xmlns="http://www.w3.org/2000/svg"><text>\uE000 &#xE001; {{name}}</text></svg>', 'template': 'mustache'},
        {'code': EXAMPLES, 'template': 'mustache', 'examples': EXAMPLE_MESSAGE},
        {'code': EXAMPLES.replace('{{#', '<<?').replace('{{^hasNote}}', '').replace('{{/', '<</?').replace('{{', '<<').replace('}}', '>>'), 'template': 'angle', 'examples': EXAMPLE_MESSAGE}])

    print('-- the label template (mustache)')
    browser = label['browserText']
    check_that(len(browser) == len(LABEL) and browser.count('\n') == LABEL.count('\n'), 'the browser reads a text as long as the code, with the same lines')
    check_that(browser[:13].strip() == '' and browser.rstrip().endswith('</svg>'), 'the sections around the root read as spaces')
    comment = LABEL.index('{{name}}')
    check_that(browser[comment:comment + 8] == '{{name}}', 'a tag inside a comment reads in brace form')
    check_that(browser.count('{{') == 1 and label['markerStart'] == '\uE000' and browser.count('\uE000') == 20,
               'every other tag inside the root reads as a marker')
    check_that(len(label['labels']) == 23 and label['labels'][1] == '{{width}}', f'the markers stand for the tags as written ({len(label["labels"])})')
    plain_count = len(label_off['plainElements'])
    check_that(len(label['elements']) == plain_count == 12, f'the elements are found at the same places ({len(label["elements"])}, {plain_count})')
    check_that(label['error'] is None, 'mustache: no placeholder error')

    print('-- angle')
    check_that('<<' not in angle['browserText'] and len(angle['browserText']) == len(ANGLE), 'angle: the browser reads a text free of "<<"')
    check_that(len(angle['elements']) == 11 and angle['error'] is None, f'angle: every element is found, no placeholder error ({len(angle["elements"])})')
    check_that(len(angle['plainElements']) > len(angle['elements']), 'angle: read as plain SVG the tags would count as elements')

    check_that(literal['markerStart'] == '\uE002', f'a marker starts with a character the code leaves free ({literal["markerStart"]!r})')

    print('-- option off')
    check_that(label_off['browserText'] == LABEL and label_off['labels'] == [] and not label_off['hasTags'], 'option off: the browser reads the code as it is')

    print('-- placeholder errors')
    check_that(broken['error'] == {'line': 2, 'col': 3, 'msg': 'The section {{#items}} stays open - add {{/items}}', 'isTemplate': True},
               f'the first placeholder error with line and column: {broken["error"]}')

    print('-- code view')
    check_that(get_plain_text(label['highlighted']) == LABEL and 'class="tp"' not in label['highlighted'],
               'mustache: the highlighted text is the code, the tags without a color of their own')
    check_that(get_plain_text(angle['highlighted']) == ANGLE and 'class="tp"' not in angle['highlighted'],
               'angle: the code view shows every tag as written, without a color of its own')
    check_that(label_off['highlighted'] == label_off['plainHighlighted'], 'option off: the plain highlighting')

    print('-- writing values')
    check_that(written['writtenValue'] == 'a &lt; b <<name>> &amp; &quot;c&quot;', f'a written value keeps its tag and escapes the rest ({written["writtenValue"]})')

    print('-- example view')
    text = filled['exampleText']
    check_that('<text>Dear John Doe &amp; Co &lt;Ltd&gt;</text>' in text, 'an example in text gets XML\'s escapes')
    check_that('title="A &quot;quoted&quot; &lt;value>"' in text and "data-single='it&apos;s'" in text, 'an example in an attribute value gets the escapes of its quote')
    check_that('<style>.a { fill: red  body  x urla }</style>' in text and 'style="fill: red  body  x urla"' in text, 'CSS keeps only plain words of an example')
    check_that('onclick=""' in text and '<script></script>' in text, 'an event attribute and a script get nothing')
    check_that('<!-- for John Doe - - x -  -->' in text and text.count('--') == 2, 'an example in a comment keeps the comment closed')
    check_that(text.count('<text class="row">') == 2 and 'Chair: 2' in text and 'Table: 1' in text and '{{' not in text, 'a list repeats its body per example row')
    check_that('No note' in text and 'Note:' not in text and '[Total]' in text, 'sections by example state, the label in brackets without an example')
    check_that('{{' not in filled_angle['exampleText'] and '<<' not in filled_angle['exampleText'] and 'Chair: 2' in filled_angle['exampleText'], 'angle: the example view fills the same way')


def is_server_up():
    """Tells whether the editor answers at EDITOR_URL.

    Returns:
        bool: True when the page loads.
    """
    try:
        with urllib.request.urlopen(URL, timeout=3) as response:
            return response.status == 200
    except OSError:
        return False


def open_editor(browser, query, requests):
    """Opens the editor with a query in a fresh page and notes every request it makes.

    Args:
        browser (Browser): the browser.
        query (str): the query string, e.g. "?template=mustache".
        requests (list[str]): the addresses of the requests; added to.

    Returns:
        Page: the editor page.
    """
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.on('request', lambda request: requests.append(request.url))
    page.goto(URL + query, wait_until='networkidle')
    page.evaluate('localStorage.clear()')
    return page


def set_code(page, code):
    """Sets the code of the editor through its test hook.

    Args:
        page (Page): the editor page.
        code (str): the code.

    Returns:
        None: the drawing is read.
    """
    page.evaluate('c => svgEditor.setCode(c, { select: -1 })', code)
    page.wait_for_timeout(300)


def move_element(page, element_id):
    """Selects an element by its id and moves it one step to the right with the arrow key.

    Args:
        page (Page): the editor page.
        element_id (str): the id of the element in the parsed drawing.

    Returns:
        None: the move is written into the code.
    """
    page.evaluate('id => svgEditor.select(svgEditor.state.modelEls.findIndex(element => element.id === id))', element_id)
    page.evaluate('document.activeElement && document.activeElement.blur()')
    page.keyboard.press('ArrowRight')
    page.wait_for_timeout(700)


def get_start_tag(code, marker):
    """Returns the line of the code that holds a text (each start tag of the templates stands on a line of its own).

    Args:
        code (str): the code.
        marker (str): a text inside the start tag.

    Returns:
        str: the line without its indent, empty when none holds the text.
    """
    match = re.search(r'^.*' + re.escape(marker) + r'.*$', code, re.M)
    return match.group(0).strip() if match else ''


def run_template_checks(page, code, syntax, tag, count):
    """Runs the checks of one template syntax in an open editor page.

    Args:
        page (Page): the editor page with the syntax.
        code (str): the template.
        syntax (str): "mustache" or "angle".
        tag (callable): writes a tag of the syntax from a name.
        count (int): the number of elements of the template.

    Returns:
        None: the results are printed and failures noted.
    """
    set_code(page, code)
    read_state = '''() => { const S = svgEditor.state; return { error: S.error, count: S.modelEls.length,
        width: S.modelEls[0].getAttribute('width'), size: S.naturalSize, text: S.viewRoot.querySelector('text').textContent,
        picture: S.viewRoot.querySelector('image').getAttribute('href') }; }'''
    state = page.evaluate(read_state)
    check_that(state['error'] is None and state['count'] == count, f'{syntax}: the template shows without error ({state["error"]})')
    check_that(state['width'] == tag('width') and state['text'] == '[name]', f'{syntax}: the example view shows the label in brackets, the drawing keeps its tags ({state["text"]})')
    check_that((state['picture'] or '').startswith('data:image/svg+xml'), f'{syntax}: the logo shows the placeholder picture')
    page.click('[data-view-set="template"]')
    page.wait_for_timeout(300)
    state = page.evaluate(read_state)
    check_that(state['text'] == tag('name'), f'{syntax}: the template view holds the tags as written')
    check_that(state['size'] == {'w': 400, 'h': 200}, f'{syntax}: a width with a placeholder falls back to the viewBox ({state["size"]})')
    check_that((state['picture'] or '').startswith('data:image/svg+xml'), f'{syntax}: the template view shows the placeholder picture for the logo')
    move_element(page, 'stamp')
    stamp = get_start_tag(page.evaluate('svgEditor.state.code'), 'id="stamp"')
    check_that(f'x="{tag("stampX")}"' in stamp and 'transform="translate(' in stamp, f'{syntax}: moving keeps a coordinate with a placeholder ({stamp})')
    move_element(page, 'frame-' + tag('orderId'))
    frame = get_start_tag(page.evaluate('svgEditor.state.code'), 'stroke="#333333"')
    check_that(f'id="frame-{tag("orderId")}"' in frame and f'fill="{tag("background")}"' in frame and 'x="' in frame and 'x="0"' not in frame,
               f'{syntax}: a rewritten start tag keeps every tag byte for byte ({frame})')
    before = page.evaluate('svgEditor.state.code')
    page.click('#btn-format')
    page.wait_for_timeout(300)
    check_that(page.evaluate('svgEditor.state.code') == before, f'{syntax}: Tidy up keeps the code as written')
    page.evaluate("svgEditor.select(svgEditor.state.modelEls.findIndex(element => element.localName === 'g'))")
    page.wait_for_timeout(200)
    field = page.evaluate("(document.querySelector('.template-value[data-k=\"opacity\"]') || {}).value")
    check_that(field == tag('opacity'), f'{syntax}: the properties show a value with a placeholder as text ({field})')


def run_browser_part():
    """Runs the checks of the browser part and prints their results.

    Returns:
        None: the results are printed and failures noted.
    """
    from playwright.sync_api import sync_playwright
    requests = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
        page = open_editor(browser, '?lang=en&template=mustache', requests)
        run_template_checks(page, LABEL, 'mustache', lambda name: '{{' + name + '}}', 12)
        set_code(page, BROKEN)
        error = page.evaluate('svgEditor.state.error')
        check_that(error and error['line'] == 2 and 'stays open' in error['msg'], f'mustache: a section left open is the error in the code ({error})')
        set_code(page, REFERENCES)
        page.evaluate("svgEditor.select(svgEditor.state.modelEls.findIndex(element => element.id === 'live'))")
        page.wait_for_timeout(200)
        page.evaluate('''() => { document.querySelector('details.attribute').open = true;
            const form = document.querySelector('[data-new-attr]'); form.n.value = 'href'; form.v.value = 'https://example.com/{{typed}}.png';
            form.requestSubmit(); }''')
        page.wait_for_timeout(500)
        shown = page.evaluate("svgEditor.state.viewRoot.querySelector('#live').getAttribute('href') || ''")
        check_that(shown.startswith('data:image/svg+xml'), f'an address with a placeholder typed into the properties shows the placeholder picture ({shown[:30]})')
        page = open_editor(browser, '?lang=en&template=angle', requests)
        run_template_checks(page, ANGLE, 'angle', lambda name: '<<' + name + '>>', 11)
        page = open_editor(browser, '?lang=en', requests)
        set_code(page, REFERENCES)
        page.wait_for_timeout(500)
        set_code(page, LABEL)
        plain_error = page.evaluate('svgEditor.state.error')
        set_code(page, ANGLE)
        angle_error = page.evaluate('svgEditor.state.error')
        page = open_editor(browser, '?lang=en&template=other', requests)
        set_code(page, LABEL)
        other_error = page.evaluate('svgEditor.state.error')
        check_that(plain_error is not None and plain_error == other_error and angle_error is not None,
                   'option off or another value: the old errors (text around the root, "<" in values)')
        browser.close()
    check_that(not any('example.com' in address for address in requests), 'references with placeholders stay unrequested, with and without the option')


run_node_part()
print('-- browser')
if is_server_up():
    run_browser_part()
else:
    print(f'not run: no editor at {URL}')

print(f'\n{len(failed)} failed' if failed else '\nall passed')
sys.exit(1 if failed else 0)
