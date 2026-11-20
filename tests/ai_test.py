"""AI Assistant: prompt and drawings that arrive as links (no server).

    php -S 127.0.0.1:8093 -t src src/php/router.php &
    python tests/ai_test.py
"""
import base64
import os
import sys
import urllib.parse
import zlib

from playwright.sync_api import sync_playwright

URL = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8093/')
ok = fail = 0


def check_that(name, cond, info=''):
    """Count and print the result of one check.

    Args:
        name (str): what is checked.
        cond (object): the outcome; truthy passes.
        info (object): shown next to a failed check.

    Returns:
        None: the result goes into ok and fail.
    """
    global ok, fail
    if cond:
        ok += 1; print('PASS', name)
    else:
        fail += 1; print('FAIL', name, ('-- ' + str(info)) if info else '')


def convert_to_base64(s):
    """Return text as base64url without padding, as an AI writes it into a link.

    Args:
        s (str): the text.

    Returns:
        str: the encoded text.
    """
    return base64.urlsafe_b64encode(s.encode()).decode().rstrip('=')



HOUSE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect id="wall" x="40" y="90" width="120" height="90" fill="#d62828"/><polygon id="roof" points="30,95 100,30 170,95" fill="#8d1b1b"/><text x="10" y="20">Häuschen ✓</text></svg>'

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    ctx = b.new_context(viewport={'width': 1300, 'height': 850})
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=URL.rstrip('/'))
    errors = []
    ed = ctx.new_page()
    ed.on('pageerror', lambda e: errors.append(str(e)))
    ed.goto(URL); ed.evaluate('localStorage.clear()'); ed.reload(); ed.wait_for_timeout(400)
    def get_code(pg=ed):
        """Return the code in an editor page's code field.

        Args:
            pg (Page): the page, the open editor by default.

        Returns:
            str: the code.
        """
        return pg.input_value('#code')

    # Prompt
    ed.evaluate('svgEditor.select(3)')
    ed.click('#btn-ai')
    check_that('Dialog explains the three steps', ed.is_visible('#ai') and 'Copy prompt' in ed.inner_text('#ai'))
    ed.click('#ai-copy'); ed.wait_for_timeout(200)
    prompt = ed.evaluate('navigator.clipboard.readText()')
    check_that('Prompt has instructions, the drawing and the selection',
          '#b64=' in prompt and 'part=N&of=M' in prompt and 'mode=add' in prompt and '<rect x="58"' in prompt and 'I have selected: <rect' in prompt and prompt.rstrip().endswith('My request:'), prompt[-300:])
    check_that('Dialog closes after copying', not ed.is_visible('#ai'))

    def open_link(link):
        """Open a link in a new tab, as a click on the AI's link does.

        Args:
            link (str): the address.

        Returns:
            Page: the new tab.
        """
        t = ctx.new_page()
        t.on('pageerror', lambda e: errors.append(str(e)))
        t.goto(link); t.wait_for_timeout(900)
        return t

    # b64 link goes to the open editor tab
    t = open_link(URL + '#b64=' + convert_to_base64(HOUSE))
    check_that('b64 link: drawing appears in the open editor', 'id="roof"' in get_code() and 'Häuschen ✓' in get_code(), get_code()[:120])
    check_that('Link tab says it was taken over', t.is_visible('#ai-receive') and 'Taken over by your editor' in t.inner_text('#ai-receive') and 'loading' not in (t.get_attribute('#ai-receive', 'class') or ''))
    check_that('Link tab keeps its own drawing', 'id="roof"' not in get_code(t))
    check_that('Hash removed from the address', '#' not in t.url, t.url)
    check_that('The link changes the drawing without a question', not ed.is_visible('#ask'))
    t.wait_for_timeout(2000)
    check_that('The link tab stays open', not t.is_closed())
    t.click('[data-here]'); t.wait_for_timeout(200)
    check_that('"Open it here" opens it there, without a question', 'id="roof"' in get_code(t) and not t.is_visible('#ai-receive') and not t.is_visible('#ask'))
    t.close()
    ed.bring_to_front(); ed.click('#btn-undo'); ed.wait_for_timeout(150)
    check_that('Undo takes the AI drawing back', 'id="roof"' not in get_code())

    # svg= (URL-encoded) and z= (zlib)
    open_link(URL + '#svg=' + urllib.parse.quote(HOUSE.replace('wall', 'wall2'), safe='')).close()
    check_that('svg= link (URL-encoded)', 'id="wall2"' in get_code())
    z = base64.urlsafe_b64encode(zlib.compress(HOUSE.replace('wall', 'wall3').encode())).decode()
    open_link(URL + '#z=' + z).close()
    check_that('z= link (zlib-compressed)', 'id="wall3"' in get_code())

    open_link(URL + '#b64=' + base64.b64encode(HOUSE.replace('wall', 'wall5').replace('Häuschen', 'H?>>~').encode()).decode()).close()
    check_that('Standard base64 with + and / works too', 'id="wall5"' in get_code())
    # mode=add
    open_link(URL + '#svg=' + urllib.parse.quote('<circle id="sun" cx="170" cy="30" r="15" fill="gold"/>', safe='') + '&mode=add').close()
    check_that('mode=add adds on top', 'id="sun"' in get_code() and 'id="wall5"' in get_code() and get_code().index('id="sun"') > get_code().index('id="roof"'))

    # file=new and file=NAME: new drawings next to the open one, or a named one
    ed.bring_to_front()
    def get_names():
        """Return the names of the drawings in "My drawings".

        Returns:
            list[str]: the names.
        """
        return ed.evaluate('svgEditor.store.list().map(f => f.name)')

    cur, n0, keep = ed.evaluate('svgEditor.state.name'), len(get_names()), get_code()
    open_link(URL + '#b64=' + convert_to_base64(HOUSE.replace('wall', 'newwall')) + '&file=new&name=' + urllib.parse.quote('My house', safe='')).close()
    check_that('file=new makes a new drawing and opens it', len(get_names()) == n0 + 1 and 'My house' in get_names() and 'id="newwall"' in get_code() and ed.inner_text('#file-name') == 'My house')
    check_that('file=new leaves the other drawing unchanged', ed.evaluate('(n) => svgEditor.store.code(svgEditor.store.findByName(n).id)', cur) == keep)
    open_link(URL + '#b64=' + convert_to_base64(HOUSE.replace('wall', 'newwall2')) + '&file=new&name=' + urllib.parse.quote('My house', safe='')).close()
    check_that('file=new with a taken name gets a number', 'My house 2' in get_names())
    open_link(URL + '#svg=' + urllib.parse.quote('<circle id="moon" r="5"/>', safe='') + '&mode=add&file=' + urllib.parse.quote(cur, safe='')).close()
    check_that('file=NAME opens that drawing and changes it', ed.evaluate('svgEditor.state.name') == cur and 'id="moon"' in get_code() and 'id="sun"' in get_code() and len(get_names()) == n0 + 2)
    ed.click('#btn-ai'); ed.wait_for_timeout(100)
    check_that('Dialog names the open drawing', cur in ed.inner_text('.ai-target'))
    ed.click('.ai-target label:has([value=new])'); ed.click('#ai-copy'); ed.wait_for_timeout(200)
    p2 = ed.evaluate('navigator.clipboard.readText()')
    check_that('Prompt for a new drawing lists the drawings and asks for file=new', 'make a NEW drawing (&file=new' in p2 and '"My house 2"' in p2 and 'do not change it' in p2, p2[-600:])
    ed.click('#btn-ai'); ed.click('.ai-target label:has([value=change])'); ed.click('#ai-copy'); ed.wait_for_timeout(200)
    check_that('Prompt for a change names the open drawing', f'change "{cur}"' in ed.evaluate('navigator.clipboard.readText()'))

    # Parts
    enc = convert_to_base64(HOUSE.replace('wall', 'wall4'))
    n = len(enc) // 3 + 1
    chunks = [enc[i:i + n] for i in range(0, len(enc), n)]
    t1 = open_link(URL + f'#b64={chunks[2]}&part=3&of=3&id=house')
    check_that('Part 3 of 3: waits for the others', 'Part 3 of 3 received' in t1.inner_text('#ai-receive') and '1, 2' in t1.inner_text('#ai-receive') and 'wall4' not in get_code())
    t1.close()
    open_link(URL + f'#b64={chunks[0]}&part=1&of=3&id=house').close()
    check_that('Part 1: still incomplete', 'wall4' not in get_code())
    open_link(URL + f'#b64={chunks[1]}&part=2&of=3&id=house').close()
    check_that('All parts: drawing assembled', 'id="wall4"' in get_code() and 'Häuschen ✓' in get_code())

    # An answer from a terminal that broke the link over several lines
    ans = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'terminal-answer.txt'), encoding='utf-8').read()
    paste = "(t) => { const d = new DataTransfer(); d.setData('text/plain', t); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true })); }"
    ed.bring_to_front(); ed.click('#stage', position={'x': 5, 'y': 5}); ed.evaluate(paste, ans); ed.wait_for_timeout(400)
    check_that('Pasting a terminal answer with a wrapped link loads the drawing', 'id="himmel"' in get_code() and 'id="sonne"' in get_code(), get_code()[:100])
    ed.click('#btn-ai'); ed.fill('#ai-paste', ans.replace('himmel', 'x')); ed.wait_for_timeout(400)
    check_that('Paste field in the dialog accepts the answer too', not ed.is_visible('#ai') and 'id="himmel"' in get_code())
    w = URL + '#b64=' + convert_to_base64(HOUSE.replace('wall', 'wrapped'))
    wrapped = 'Here you go:\n\n  ' + '\n  '.join(w[i:i + 90] for i in range(0, len(w), 90)) + '\n\nEnjoy.'
    ed.evaluate(paste, wrapped); ed.wait_for_timeout(400)
    check_that('Wrapped b64 link with prose around it', 'id="wrapped"' in get_code())
    parts = [URL + f'#b64={c}&part={k + 1}&of=3&id=multi' for k, c in enumerate(chunks)]
    ed.evaluate(paste, 'Part one: ' + parts[0] + '\nPart two: ' + parts[1] + '\nPart three: ' + parts[2])
    ed.wait_for_timeout(400)
    check_that('Several part links pasted at once', 'id="wall4"' in get_code())

    # WebMCP tools, with a stand-in for document.modelContext
    m = ctx.new_page()
    m.add_init_script("document.modelContext = { tools: {}, registerTool(t) { this.tools[t.name] = t; return Promise.resolve(); } };")
    m.goto(URL); m.wait_for_timeout(700)
    def run_tool(n, a={}):
        """Run a WebMCP tool of the stand-in.

        Args:
            n (str): the tool's name.
            a (dict): its input.

        Returns:
            str: the tool's answer, or "ERR " and the error message.
        """
        return m.evaluate("([n, a]) => document.modelContext.tools[n].execute(a).catch(e => 'ERR ' + e.message)", [n, a])

    check_that('WebMCP: all tools registered', m.evaluate('Object.keys(document.modelContext.tools).sort().join()') == 'add_shapes,delete_shape,edit_shape,get_drawing,list_files,list_shapes,new_file,open_file,select_shape,set_drawing,undo')
    run_tool('set_drawing', {'svg': HOUSE})
    check_that('WebMCP: set_drawing and get_drawing', 'id="wall"' in run_tool('get_drawing'))
    check_that('WebMCP: list_shapes', '<rect id="wall"' in run_tool('list_shapes'))
    run_tool('edit_shape', {'shape': 'wall', 'attributes': {'fill': '#123456'}})
    check_that('WebMCP: edit_shape', '#123456' in get_code(m))
    run_tool('add_shapes', {'svg': '<circle id="mcpdot" cx="5" cy="5" r="3"/>'})
    run_tool('select_shape', {'shape': 'mcpdot'})
    check_that('WebMCP: add_shapes and select_shape', 'id="mcpdot"' in get_code(m) and m.evaluate('svgEditor.state.modelEls[svgEditor.state.sel].id') == 'mcpdot')
    run_tool('delete_shape', {'shape': 'mcpdot'})
    check_that('WebMCP: delete_shape', 'mcpdot' not in get_code(m))
    run_tool('undo')
    check_that('WebMCP: undo', 'id="mcpdot"' in get_code(m))
    before = m.evaluate('svgEditor.store.list().length')
    first = m.evaluate('svgEditor.state.name')
    r = run_tool('new_file', {'name': 'MCP star', 'svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path id="star" d="M5 0 6 4 10 5 6 6 5 10 4 6 0 5 4 4z"/></svg>'})
    check_that('WebMCP: new_file makes and opens a new drawing', 'MCP star' in r and m.evaluate('svgEditor.store.list().length') == before + 1 and 'id="star"' in get_code(m))
    check_that('WebMCP: list_files', '* "MCP star"' in run_tool('list_files') and f'"{first}"' in run_tool('list_files'))
    run_tool('open_file', {'name': first})
    check_that('WebMCP: open_file', m.evaluate('svgEditor.state.name') == first and 'id="star"' not in get_code(m) and run_tool('open_file', {'name': 'nope'}).startswith('ERR'))
    check_that('WebMCP: unknown shape and on... attributes are refused', run_tool('edit_shape', {'shape': 'nope', 'attributes': {}}).startswith('ERR') and run_tool('edit_shape', {'shape': 'wall', 'attributes': {'onclick': 'x'}}).startswith('ERR'))
    m.close()

    # Broken link
    t = open_link(URL + '#b64=%%%notbase64')
    check_that('Broken link: clear message', 'could not be read' in t.inner_text('#ai-receive'))
    t.close()

    # Without an open editor the link tab becomes the editor
    ed.close()
    t = open_link(URL + '#b64=' + convert_to_base64(HOUSE.replace('wall', 'alone')))
    check_that('No open editor: the link tab shows the drawing', 'id="alone"' in get_code(t) and not t.is_visible('#ai-receive'))
    check_that('No page errors', not errors, errors)
    b.close()

print(f'{ok}/{ok + fail} passed')
sys.exit(1 if fail else 0)
