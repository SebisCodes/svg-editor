"""Tests the editor in a real browser: selection, dragging, handles, colors,
grid, drawing tools, code input, export, storage, theme, mobile view.

    php -S 127.0.0.1:8093 -t src src/php/router.php          (in the project folder)
    python tests/gui_test.py [output folder]

Needs Playwright for Python and Google Chrome at /usr/bin/google-chrome.
"""
import os
import re
import sys
import tempfile

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SP = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
URL = os.environ.get('SVG_URL', 'http://127.0.0.1:8093/')
results = []


def check_that(name, cond, info=''):
    """Record and print the result of one check.

    Args:
        name (str): what is checked.
        cond (object): the outcome; truthy passes.
        info (object): shown next to a failed check.

    Returns:
        None: the result goes into results.
    """
    results.append((name, bool(cond), info))
    print(('PASS ' if cond else 'FAIL ') + name + (('  -- ' + str(info)) if (info and not cond) else ''))


# The parts of the side panel: a step that uses one opens the drawer first.
PANEL_PARTS = ('#inspector-body', '[data-itab', '#tree', '#f-text', '#side-panel')

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    ctx = b.new_context(viewport={'width':1440,'height':900}, accept_downloads=True, permissions=['clipboard-read','clipboard-write'])
    pg = ctx.new_page()
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(URL); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_timeout(600)
    check_that('Side panel closed at start', pg.get_attribute('#btn-panel', 'aria-expanded') == 'false' and not pg.is_visible('#side-panel'))
    pg.click('#btn-panel'); pg.wait_for_timeout(100)
    check_that('Side panel opens with its button', pg.is_visible('#side-panel'))
    pg.click('#btn-panel'); pg.wait_for_timeout(100)

    def show_side_panel(is_open):
        """Opens or closes the side panel's drawer, which lies over the right of the canvas.

        Args:
            is_open (bool): True to open it, False to close it.

        Returns:
            None: the drawer is open or closed.
        """
        if pg.is_visible('#btn-panel') and (pg.get_attribute('#btn-panel', 'aria-expanded') == 'true') != is_open:
            pg.locator('#btn-panel').click(); pg.wait_for_timeout(100)

    def open_panel_for(method):
        """Wraps a page method so a selector inside the side panel opens the drawer first.

        Args:
            method (callable): the page method, called with a selector first.

        Returns:
            callable: the wrapped method.
        """
        def run(selector, *args, **kwargs):
            """Opens the drawer for a selector inside the side panel, then runs the method.

            Args:
                selector (str): the selector.
                args (tuple): further arguments of the method.
                kwargs (dict): further keyword arguments of the method.

            Returns:
                object: what the method returns.
            """
            if isinstance(selector, str) and any(part in selector for part in PANEL_PARTS):
                show_side_panel(True)
            return method(selector, *args, **kwargs)
        return run

    for method_name in ('click', 'dblclick', 'fill', 'select_option', 'inner_text', 'is_visible', 'focus', 'press', 'input_value', 'get_attribute'):
        setattr(pg, method_name, open_panel_for(getattr(pg, method_name)))

    def get_code():
        """Return the code of the open drawing.

        Returns:
            str: the editor's code.
        """
        return pg.evaluate('svgEditor.state.code')

    def get_selected():
        """Return the selected element.

        Returns:
            int: its index, -1 for none.
        """
        return pg.evaluate('svgEditor.state.sel')

    def get_tag(i):
        """Return the tag of an element of the drawing.

        Args:
            i (int): the element's index.

        Returns:
            str | None: its local name.
        """
        return pg.evaluate(f'svgEditor.state.modelEls[{i}]?.localName')

    def get_center(selector_js):
        """Return the screen center of an element.

        Args:
            selector_js (str): a JavaScript expression that gives the element.

        Returns:
            list[float]: [x, y] of its center.
        """
        show_side_panel(False)
        return pg.evaluate(f'''(() => {{ const el = {selector_js}; const r = el.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; }})()''')

    def import_drawing(fn):
        """Load a drawing from the tests folder into the editor.

        Args:
            fn (str): the file name.

        Returns:
            None: the drawing is open.
        """
        pg.evaluate("(c) => svgEditor.setCode(c, { select: -1 })", open(os.path.join(HERE, fn)).read())
        pg.wait_for_timeout(200)

    def get_view_expression(q):
        """Return a JavaScript expression for an element of the view.

        Args:
            q (str): a CSS selector inside the drawing.

        Returns:
            str: the expression.
        """
        return f"svgEditor.state.viewRoot.querySelector('{q}')"

    def get_zoom():
        """Return the zoom of the canvas.

        Returns:
            float: screen pixels per unit of the drawing.
        """
        return pg.evaluate('svgEditor.state.zoom')

    # 1 Loading: default drawing, split, fit
    check_that('Loads without errors', not errs, errs)
    check_that('No samples menu', pg.locator('#samples').count() == 0)
    check_that('No error notice for valid code', not pg.is_visible('.stale-hint') and not pg.is_visible('#code-error'))
    check_that('Default drawing is the editor logo', 'M76 180 C76 112 180 144 180 76' in get_code() and 'width="256"' in get_code())
    cw = pg.evaluate("document.querySelector('.code-pane').getBoundingClientRect().width")
    vw = pg.evaluate("document.querySelector('.draw-pane').getBoundingClientRect().width")
    check_that('Code and canvas split 50/50', abs(cw - vw) < 2, (cw, vw))
    def is_filled():
        """Tell whether the drawing fills the canvas apart from its margin.

        Returns:
            tuple[bool, list[float]]: the answer and the measured stage and paper.
        """
        st = pg.evaluate("(() => { const s = document.querySelector('#stage').getBoundingClientRect(), p = document.querySelector('#paper').getBoundingClientRect(); return [s.width, s.height, p.width, p.height, p.left - s.left, p.top - s.top]; })()")
        sw, sh, pw, ph, px, py = st
        pad = 10 if sw < 500 else 16
        return (abs(pw - (sw - 2 * pad)) < 1 or abs(ph - (sh - 2 * pad)) < 1) and px >= pad - 1 and py >= pad - 1, st
    ok, st = is_filled(); check_that('Drawing fills the panel', ok, st)
    sp = pg.evaluate("(() => { const r = document.querySelector('#splitter').getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; })()")
    pg.mouse.move(*sp); pg.mouse.down(); pg.mouse.move(sp[0] - 150, sp[1], steps=4); pg.mouse.up(); pg.wait_for_timeout(150)
    ok, st = is_filled(); check_that('Drawing fills panel after moving the splitter', ok, st)
    pg.mouse.move(sp[0] - 150, sp[1]); pg.mouse.down(); pg.mouse.move(*sp, steps=4); pg.mouse.up(); pg.wait_for_timeout(150)
    pg.set_viewport_size({'width': 1280, 'height': 800}); pg.wait_for_timeout(200)
    ok, st = is_filled(); check_that('Drawing fills panel after window resize', ok, st)
    pg.set_viewport_size({'width': 1440, 'height': 900}); pg.wait_for_timeout(200)
    # Grid and snapping are on at start; the first checks drag freely.
    check_that('Grid and snap on at start', pg.evaluate('svgEditor.state.grid.show') and pg.is_checked('#grid-snap'))
    check_that('Hint line names tool and grid', 'Click a shape' in pg.inner_text('#hint') and '10 grid' in pg.inner_text('#hint'), pg.inner_text('#hint'))
    pg.uncheck('#grid-snap'); pg.wait_for_timeout(50)
    check_that('Snap can be unticked, grid stays', not pg.evaluate('svgEditor.state.grid.snap') and pg.evaluate('svgEditor.state.grid.show'))
    check_that('Hint line without grid sentence', 'grid' not in pg.inner_text('#hint'))
    check_that('Undo greyed out at start', pg.is_disabled('#btn-undo') and pg.is_disabled('#btn-redo'))
    import_drawing('landscape.svg')
    check_that('Undo enabled after a change', pg.is_enabled('#btn-undo'))
    check_that('View built', pg.evaluate('svgEditor.state.viewEls.length') == pg.evaluate('svgEditor.state.scanEls.length'))
    check_that('Syntax highlighting present', pg.locator('#hl .k').count() > 5 and pg.locator('#hl .a').count() > 5 and pg.locator('#hl .s').count() > 5 and pg.locator('#hl .c').count() == 1)

    # 2 Selecting by click
    x, y = get_center(get_view_expression('circle'))
    pg.mouse.click(x, y)
    check_that('Click selects circle', get_tag(get_selected()) == 'circle', get_tag(get_selected()))
    check_that('Properties show circle', 'circle' in pg.inner_text('#inspector-body').lower())
    check_that('Code marks start tag', '<circle' in pg.inner_text('#marks mark.sel'))

    # 3 Moving
    z = get_zoom()
    show_side_panel(False)
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 50, y + 20, steps=6); pg.mouse.up()
    pg.wait_for_timeout(120)
    m = re.search(r'<circle cx="([\d.]+)" cy="([\d.]+)"', get_code())
    check_that('Dragging moves circle in the code', m and abs(float(m.group(1)) - (370 + 50/z)) < 1.0 and abs(float(m.group(2)) - (80 + 20/z)) < 1.0, (m and m.groups(), z))

    # 4 Resizing (house rectangle, se handle)
    hx, hy = get_center(get_view_expression('rect[x="80"]'))
    pg.mouse.click(hx, hy)
    check_that('Click selects house rectangle', get_tag(get_selected()) == 'rect')
    gx, gy = get_center("document.querySelector('#overlay [data-h=\"se\"]')")
    pg.mouse.move(gx, gy); pg.mouse.down(); pg.mouse.move(gx + 30, gy + 15, steps=5); pg.mouse.up()
    pg.wait_for_timeout(120)
    m = re.search(r'<rect x="80" y="225" width="([\d.]+)" height="([\d.]+)"', get_code())
    check_that('Handle changes width/height', m and abs(float(m.group(1)) - (60 + 30/z)) < 1.5 and abs(float(m.group(2)) - (45 + 15/z)) < 1.5, m and m.groups())

    # 5 Fill color with the editor's own color picker
    pg.click('#inspector-body .color[data-paint=fill] .color-field'); pg.wait_for_timeout(150)
    check_that('Color picker opens (not the browser dialog)', pg.is_visible('.color-picker'))
    check_that('Picker title says what is colored', pg.inner_text('#cp-title') == 'Fill color · Rectangle', pg.inner_text('#cp-title'))
    pg.click('#inspector-body .color[data-paint=stroke] .color-field'); pg.wait_for_timeout(150)
    check_that('Only one picker at a time', pg.locator('.color-picker:not([hidden])').count() == 1 and pg.inner_text('#cp-title') == 'Outline color · Rectangle')
    pg.click('#inspector-body .color[data-paint=fill] .color-field'); pg.wait_for_timeout(150)
    pg.fill('.cp-hex', '#ff0000'); pg.wait_for_timeout(100)
    check_that('Typing a hex code colors live', pg.evaluate(f"{get_view_expression('rect[x=\"80\"]')}.getAttribute('fill')") == '#ff0000')
    pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    check_that('Enter closes the picker', not pg.is_visible('.color-picker'))
    fb = pg.locator('.color[data-paint=fill] .color-field').bounding_box()
    pg.click('#inspector-body .color[data-paint=fill] .color-field'); pg.wait_for_timeout(150)
    f = pg.locator('.cp-field').bounding_box()
    pg.mouse.click(f['x'] + f['width'] - 2, f['y'] + 2); pg.wait_for_timeout(100)
    hexnow = pg.input_value('.cp-hex')
    check_that('Clicking the color field picks a color', hexnow.startswith('#') and hexnow != '#ff0000', hexnow)
    pg.click('.cp-before'); pg.wait_for_timeout(100)
    check_that('"Before" swatch goes back', pg.input_value('.cp-hex') == '#ff0000')
    pg.click('.cp-colors:not(.cp-doc) [data-color="#000000"]'); pg.click('.cp-before')
    pg.mouse.click(5, 5); pg.wait_for_timeout(150)
    check_that('Click outside closes the picker', not pg.is_visible('.color-picker'))
    pg.click('#btn-help'); pg.wait_for_timeout(100)
    check_that('Opening a dialog leaves no picker open', not pg.is_visible('.color-picker'))
    pg.keyboard.press('Escape')
    pg.click('#inspector-body .color[data-paint=fill] .color-field'); pg.wait_for_timeout(150)
    pg.evaluate("document.getElementById('btn-help').click()"); pg.wait_for_timeout(100)   # no pointer outside the picker
    check_that('A dialog that opens closes the open picker', pg.is_visible('#help') and not pg.is_visible('.color-picker'))
    pg.keyboard.press('Escape')
    check_that('Fill color set', re.search(r'<rect x="80"[^>]*fill="#ff0000"', get_code()), get_code()[:0])
    check_that('View takes over fill', pg.evaluate(f"{get_view_expression('rect[x=\"80\"]')}.getAttribute('fill')") == '#ff0000')

    # 6 Outline color and "None"
    pg.evaluate("""(() => { const i = document.querySelector('#inspector-body input[type=color][data-k=stroke]'); i.value = '#00aa00'; i.dispatchEvent(new Event('input', {bubbles:true})); i.dispatchEvent(new Event('change', {bubbles:true})); })()""")
    pg.wait_for_timeout(100)
    check_that('Outline color set', re.search(r'<rect x="80"[^>]*stroke="#00aa00"', get_code()))
    pg.click('#inspector-body [data-k="stroke-none"]')
    pg.wait_for_timeout(100)
    check_that('Outline "None"', re.search(r'<rect x="80"[^>]*stroke="none"', get_code()))
    pg.click('#inspector-body [data-k="stroke-none"]')
    pg.wait_for_timeout(100)
    check_that('Outline back on', re.search(r'<rect x="80"[^>]*stroke="#00aa00"', get_code()))

    # 7 Outline width, line style, opacity
    pg.fill('#inspector-body input[data-k="stroke-width"]', '5'); pg.keyboard.press('Tab')
    pg.select_option('#inspector-body select[data-k="stroke-dasharray"]', '8 6')
    pg.evaluate("""(() => { const i = document.querySelector('#inspector-body input[data-k=opacity]'); i.value = '0.5'; i.dispatchEvent(new Event('input', {bubbles:true})); i.dispatchEvent(new Event('change', {bubbles:true})); })()""")
    pg.wait_for_timeout(120)
    c = get_code()
    check_that('Outline width 5', re.search(r'<rect x="80"[^>]*stroke-width="5"', c))
    check_that('Line style dashed', re.search(r'<rect x="80"[^>]*stroke-dasharray="8 6"', c))
    check_that('Opacity 0.5', re.search(r'<rect x="80"[^>]*opacity="0.5"', c))

    # 8 Undo / redo
    before = get_code()
    pg.click('#stage', position={'x': 5, 'y': 5})
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(80)
    check_that('Undo reverts opacity', 'opacity="0.5"' not in get_code())
    pg.keyboard.press('Control+y'); pg.wait_for_timeout(80)
    check_that('Redo restores', get_code() == before)

    # 9 Grid
    pg.click('#grid-show')
    check_that('Grid off', pg.evaluate("getComputedStyle(document.querySelector('#overlay .g-min')).display") == 'none')
    check_that('Without grid, snap is off and disabled', not pg.is_checked('#grid-snap') and pg.is_disabled('#grid-snap') and not pg.evaluate('svgEditor.state.grid.snap'))
    pg.click('#grid-show')
    check_that('Grid on', pg.evaluate("getComputedStyle(document.querySelector('#overlay .g-min')).display") != 'none')
    check_that('Turning grid on turns snap on', pg.is_checked('#grid-snap') and pg.evaluate('svgEditor.state.grid.snap'))
    check_that('Button is labelled Grid', pg.inner_text('#grid-show').strip() == 'Grid' and 'Snap' in pg.inner_text('label.snap'))
    pg.fill('#grid-size', '10'); pg.focus('#grid-size')
    pg.keyboard.press('ArrowUp'); pg.keyboard.press('ArrowUp'); pg.keyboard.press('ArrowDown')
    check_that('Arrow keys step the spacing by 0.1', pg.input_value('#grid-size') == '10.1' and pg.evaluate('svgEditor.state.grid.size') == 10.1, pg.input_value('#grid-size'))
    pg.fill('#grid-size', '0.1'); pg.focus('#grid-size'); pg.keyboard.press('ArrowDown')
    check_that('Spacing does not go below 0.1', pg.input_value('#grid-size') == '0.1' and pg.evaluate('svgEditor.state.grid.size') == 0.1, pg.input_value('#grid-size'))
    pg.fill('#grid-size', '20'); pg.wait_for_timeout(50)
    pg.locator('#grid-size').blur()
    check_that('Grid spacing 20 in state', pg.evaluate('svgEditor.state.grid.size') == 20)
    step = pg.evaluate("+document.querySelector('#g-min').getAttribute('width')")
    check_that('Grid pattern follows zoom', abs(step - 20 * get_zoom()) < 0.01, (step, get_zoom()))
    check_that('Snapping on', pg.evaluate('svgEditor.state.grid.snap') and '20 grid' in pg.inner_text('#hint'))
    x, y = get_center(get_view_expression('circle'))
    pg.mouse.click(x, y)
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 37, y + 23, steps=5); pg.mouse.up(); pg.wait_for_timeout(100)
    bx = pg.evaluate("(() => { const b = svgEditor.state.viewRoot.querySelector('circle').getBBox(); return [b.x, b.y]; })()")
    check_that('Snapped to grid 20', abs(bx[0] / 20 - round(bx[0] / 20)) < 0.01 and abs(bx[1] / 20 - round(bx[1] / 20)) < 0.01, bx)

    # 10 Drawing
    n0 = pg.evaluate('svgEditor.state.modelEls.length')
    sb = pg.evaluate("(() => { const r = document.querySelector('#paper').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
    pg.click('[data-tool=rect]')
    pg.mouse.move(sb[0] + 30, sb[1] + 30); pg.mouse.down(); pg.mouse.move(sb[0] + 120, sb[1] + 90, steps=5); pg.mouse.up(); pg.wait_for_timeout(100)
    check_that('Rectangle drawn', pg.evaluate('svgEditor.state.modelEls.length') == n0 + 1 and get_tag(get_selected()) == 'rect')
    last = re.findall(r'<rect [^>]*/>', get_code())[-1]
    nums = [float(v) for v in re.findall(r'\s(?:x|y|width|height)="([\d.]+)"', last)]
    check_that('Drawn rectangle snaps', all(abs(v / 20 - round(v / 20)) < 0.01 for v in nums), last)
    check_that('Tool back to select', pg.evaluate('svgEditor.state.tool') == 'select')
    pg.uncheck('#grid-snap')
    pg.keyboard.press('e')
    pg.mouse.move(sb[0] + 200, sb[1] + 40); pg.mouse.down(); pg.mouse.move(sb[0] + 260, sb[1] + 100, steps=5); pg.mouse.up(); pg.wait_for_timeout(100)
    check_that('Ellipse drawn (key E)', get_tag(get_selected()) in ('ellipse', 'circle'), get_tag(get_selected()))
    pg.keyboard.press('l')
    pg.mouse.move(sb[0] + 40, sb[1] + 200); pg.mouse.down(); pg.mouse.move(sb[0] + 160, sb[1] + 210, steps=5); pg.mouse.up(); pg.wait_for_timeout(100)
    check_that('Line drawn', get_tag(get_selected()) == 'line')
    # Drag a line end
    g = get_center("document.querySelector('#overlay [data-h=\"p2\"]')")
    pg.mouse.move(*g); pg.mouse.down(); pg.mouse.move(g[0] + 20, g[1] + 40, steps=4); pg.mouse.up(); pg.wait_for_timeout(100)
    lm = re.findall(r'<line [^>]*/>', get_code())[-1]
    y2 = float(re.search(r'y2="([\d.]+)"', lm).group(1)); y1 = float(re.search(r'y1="([\d.]+)"', lm).group(1))
    check_that('Line end moved', y2 - y1 > 30 / get_zoom(), lm)
    pg.keyboard.press('p')
    pg.mouse.move(sb[0] + 300, sb[1] + 200); pg.mouse.down()
    for k in range(20): pg.mouse.move(sb[0] + 300 + k * 5, sb[1] + 200 + (k % 5) * 6)
    pg.mouse.up(); pg.wait_for_timeout(100)
    check_that('Freehand path drawn', get_tag(get_selected()) == 'path' and 'fill="none"' in re.findall(r'<path [^>]*/>', get_code())[-1])
    pg.keyboard.press('t')
    pg.mouse.click(sb[0] + 60, sb[1] + 60); pg.wait_for_timeout(150)
    check_that('Text placed', get_tag(get_selected()) == 'text')
    check_that('Text field has focus', pg.evaluate("document.activeElement.id") == 'f-text')
    pg.keyboard.type('Neuer Titel'); pg.wait_for_timeout(100)
    check_that('Text changed in the code', '>Neuer Titel</text>' in get_code())
    pg.keyboard.press('Tab')

    # 11 Duplicate, arrange, delete
    pg.click('#stage', position={'x': 5, 'y': 5})
    x, y = get_center(get_view_expression('polygon'))
    pg.mouse.click(x, y)
    n0 = pg.evaluate('svgEditor.state.modelEls.length')
    pg.keyboard.press('Control+d'); pg.wait_for_timeout(100)
    check_that('Duplicate (Ctrl+D)', pg.evaluate('svgEditor.state.modelEls.length') == n0 + 1 and get_code().count('<polygon') == 2)
    pts = re.findall(r'<polygon points="([^"]+)"', get_code())
    check_that('Copy is offset', pts[0] != pts[1], pts)
    pg.keyboard.press('Delete'); pg.wait_for_timeout(100)
    check_that('Delete (Delete key)', get_code().count('<polygon') == 1 and get_selected() == -1)
    x, y = get_center(get_view_expression('polygon'))
    pg.mouse.click(x, y)
    def get_tag_order():
        """Return the tags of the code in order.

        Returns:
            list[str]: the tag names.
        """
        return [m.group(1) for m in re.finditer(r'^\s*<(\w+)', get_code(), re.M)]
    o1 = get_tag_order(); i1 = o1.index('polygon')
    pg.keyboard.press('Control+ArrowDown'); pg.wait_for_timeout(100)
    o2 = get_tag_order()
    check_that('One step backward', o2.index('polygon') == i1 - 1, (o1, o2))
    pg.keyboard.press('Control+Shift+ArrowUp'); pg.wait_for_timeout(100)
    kids = [e for e in pg.evaluate("svgEditor.scan().filter(e => e.parent === 0).map(e => e.name)")]
    check_that('To front', kids[-1] == 'polygon', kids)
    check_that('Selection kept after reordering', get_tag(get_selected()) == 'polygon')

    # 12 Rotate and flip
    pg.click('#inspector-body [data-act="rot+"]'); pg.wait_for_timeout(80)
    check_that('Rotate 15°', re.search(r'<polygon[^>]*transform="rotate\(15 [\d.]+ [\d.]+\)"', get_code()), re.findall(r'<polygon[^>]*>', get_code()))
    pg.click('#inspector-body [data-act="rot-"]'); pg.wait_for_timeout(80)
    check_that('Rotating back removes transform', 'transform' not in re.findall(r'<polygon[^>]*>', get_code())[0], re.findall(r'<polygon[^>]*>', get_code()))
    p_before = re.findall(r'<polygon points="([^"]+)"', get_code())[0]
    pg.click('#inspector-body [data-act="flip-h"]'); pg.wait_for_timeout(80)
    p_after = re.findall(r'<polygon points="([^"]+)"', get_code())[0]
    check_that('Flip changes points', p_before != p_after and 'transform' not in re.findall(r'<polygon[^>]*>', get_code())[0], (p_before, p_after))

    # 13 Arrow keys
    pg.click('#stage', position={'x': 5, 'y': 5})
    x, y = get_center(get_view_expression('circle'))
    pg.mouse.click(x, y)
    cx0 = float(re.search(r'<circle cx="([\d.]+)"', get_code()).group(1))
    pg.keyboard.press('ArrowRight'); pg.keyboard.press('Shift+ArrowRight'); pg.wait_for_timeout(500)
    cx1 = float(re.search(r'<circle cx="([\d.]+)"', get_code()).group(1))
    check_that('Arrow keys move (1 + 10)', abs(cx1 - cx0 - 11) < 0.01, (cx0, cx1))

    # 14 Move a path (mountains)
    x, y = get_center(get_view_expression('path:nth-of-type(2)'))
    pg.mouse.click(x, y)
    d0 = pg.evaluate("svgEditor.state.modelEls[svgEditor.state.sel].getAttribute('d')")
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 10, y, steps=3); pg.mouse.up(); pg.wait_for_timeout(100)
    d1 = pg.evaluate("svgEditor.state.modelEls[svgEditor.state.sel].getAttribute('d')")
    check_that('Path moved', d0 != d1 and d1.startswith('M'), (d0, d1))
    # Size of a path
    gx, gy = get_center("document.querySelector('#overlay [data-h=\"e\"]')")
    pg.mouse.move(gx, gy); pg.mouse.down(); pg.mouse.move(gx + 40, gy, steps=3); pg.mouse.up(); pg.wait_for_timeout(100)
    bw = pg.evaluate("svgEditor.state.viewEls[svgEditor.state.sel].getBBox().width")
    check_that('Path dragged wider', abs(bw - (480 + 40 / get_zoom())) < 2, bw)

    # 15 Properties X/Y/W/H
    x, y = get_center(get_view_expression('circle'))
    pg.mouse.click(x, y)
    pg.fill('#inspector-body input[data-box="x"]', '100'); pg.keyboard.press('Enter'); pg.wait_for_timeout(80)
    bb = pg.evaluate("svgEditor.state.viewRoot.querySelector('circle').getBBox().x")
    check_that('X field sets position', abs(bb - 100) < 0.01, bb)
    pg.fill('#inspector-body input[data-box="w"]', '50'); pg.keyboard.press('Enter'); pg.wait_for_timeout(80)
    check_that('W field sets circle size', re.search(r'<circle[^>]* r="25"', get_code()), re.findall(r'<circle[^>]*>', get_code()))

    # 16 Edit, add, remove attributes
    pg.click('#inspector-body details.attribute summary') if not pg.is_visible('#inspector-body .attr input') else None
    pg.fill('#inspector-body [data-new-attr] input[name=n]', 'id')
    pg.fill('#inspector-body [data-new-attr] input[name=v]', 'sonne')
    pg.click('#inspector-body [data-new-attr] button'); pg.wait_for_timeout(100)
    check_that('Attribute added', 'id="sonne"' in get_code())
    pg.fill('#inspector-body input[data-attr="id"]', 'sonne2'); pg.keyboard.press('Tab'); pg.wait_for_timeout(100)
    check_that('Attribute changed', 'id="sonne2"' in get_code())
    pg.click('#inspector-body [data-del-attr="id"]'); pg.wait_for_timeout(100)
    check_that('Attribute removed', 'id="sonne2"' not in get_code())

    # 17 Layers
    pg.click('[data-itab=structure]')
    pg.click('#tree button[data-i="3"]')
    check_that('Layers selects element', get_selected() == 3)
    before = get_code()
    pg.evaluate('''svgEditor.setCode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect id="a" x="0" y="0" width="10" height="10"/>
  <g id="grp">
    <circle id="b" cx="50" cy="50" r="5"/>
  </g>
  <ellipse id="c" cx="20" cy="20" rx="5" ry="3"/>
</svg>`, { reparse: true })''')
    pg.wait_for_timeout(150)
    def get_layer_ids():
        """Return the ids of the layer rows from top to bottom.

        Returns:
            list[str]: the ids, "root" for the drawing.
        """
        return pg.evaluate("[...document.querySelectorAll('#tree li')].map(l => svgEditor.state.modelEls[+l.dataset.i].id || 'root')")

    def get_id_order():
        """Return the ids in the code in order.

        Returns:
            list[str]: the ids.
        """
        return re.findall(r'id="([\w-]+)"', get_code())

    def get_layer_row(id):
        """Return the selector of the layer row of an element.

        Args:
            id (str): the element's id.

        Returns:
            str: the CSS selector of its row.
        """
        return f'#tree li[data-i="{pg.evaluate(f"svgEditor.state.modelEls.findIndex(m => m.id === {id!r})")}"]'
    check_that('Layers list front-most first', get_layer_ids() == ['root', 'c', 'grp', 'b', 'a'], get_layer_ids())
    check_that('Group child is indented', pg.evaluate(f"getComputedStyle(document.querySelector('{get_layer_row('b')}')).getPropertyValue('--t')").strip() == '2')
    pg.hover(get_layer_row('a')); pg.click(get_layer_row('a') + ' [data-layer=eye]'); pg.wait_for_timeout(100)
    check_that('Eye hides element', 'id="a" x="0" y="0" width="10" height="10" display="none"' in get_code() and pg.evaluate("getComputedStyle(svgEditor.state.viewRoot.querySelector('#a')).display") == 'none')
    check_that('Hidden row is marked and eye stays visible', 'is-hidden' in pg.get_attribute(get_layer_row('a'), 'class') and pg.is_visible(get_layer_row('a') + ' [data-layer=eye]'))
    pg.click(get_layer_row('a') + ' [data-layer=eye]'); pg.wait_for_timeout(100)
    check_that('Eye shows element again', 'display' not in get_code())
    pg.hover(get_layer_row('a')); pg.click(get_layer_row('a') + ' [data-layer=up]'); pg.wait_for_timeout(100)
    check_that('Row up moves forward', get_id_order() == ['grp', 'b', 'a', 'c'] and get_layer_ids()[1:] == ['c', 'a', 'grp', 'b'], get_id_order())
    pg.hover(get_layer_row('a')); pg.click(get_layer_row('a') + ' [data-layer=down]'); pg.wait_for_timeout(100)
    check_that('Row down moves backward', get_id_order() == ['a', 'grp', 'b', 'c'], get_id_order())
    pg.hover(get_layer_row('c')); pg.click(get_layer_row('c') + ' [data-layer=dup]'); pg.wait_for_timeout(100)
    check_that('Row duplicate', get_id_order() == ['a', 'grp', 'b', 'c', 'c-2'], get_id_order())
    pg.hover(get_layer_row('c-2')); pg.click(get_layer_row('c-2') + ' [data-layer=del]'); pg.wait_for_timeout(100)
    check_that('Row delete', get_id_order() == ['a', 'grp', 'b', 'c'], get_id_order())
    pg.dblclick(get_layer_row('c') + ' .choice'); pg.keyboard.press('Control+a'); pg.keyboard.type('sun'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    check_that('Double-click renames (id)', get_id_order() == ['a', 'grp', 'b', 'sun'], get_id_order())
    pg.dblclick(get_layer_row('sun') + ' .choice'); pg.keyboard.press('Control+a'); pg.keyboard.type('grp'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    check_that('Rename rejects a taken name', get_id_order() == ['a', 'grp', 'b', 'sun'] and 'already used' in pg.inner_text('#toast'), get_id_order())
    pg.dblclick(get_layer_row('sun') + ' .choice'); pg.keyboard.type('xyz'); pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    check_that('Escape cancels rename', get_id_order() == ['a', 'grp', 'b', 'sun'])
    box = pg.locator(get_layer_row('sun')).bounding_box()
    pg.drag_and_drop(get_layer_row('a'), get_layer_row('sun'), target_position={'x': 40, 'y': 2}); pg.wait_for_timeout(150)
    check_that('Drag above a row brings it in front', get_id_order() == ['grp', 'b', 'sun', 'a'] and get_selected() == pg.evaluate("svgEditor.state.modelEls.findIndex(m => m.id === 'a')"), get_id_order())
    pg.drag_and_drop(get_layer_row('a'), get_layer_row('grp'), target_position={'x': 40, 'y': box['height'] / 2}); pg.wait_for_timeout(150)
    check_that('Drag onto a group puts it inside', get_id_order() == ['grp', 'b', 'a', 'sun'] and pg.evaluate("svgEditor.state.modelEls.find(m => m.id === 'a').parentNode.id") == 'grp', get_id_order())
    check_that('Moved element is re-indented', '\n    <rect id="a"' in get_code(), get_code())
    pg.drag_and_drop(get_layer_row('a'), get_layer_row('sun'), target_position={'x': 40, 'y': box['height'] - 2}); pg.wait_for_timeout(150)
    check_that('Drag below a row puts it behind, out of the group', get_id_order() == ['grp', 'b', 'a', 'sun'] and pg.evaluate("svgEditor.state.modelEls.find(m => m.id === 'a').parentNode.id") == '' and '\n  <rect id="a"' in get_code(), get_code())
    pg.drag_and_drop(get_layer_row('grp'), get_layer_row('b'), target_position={'x': 40, 'y': 2}); pg.wait_for_timeout(150)
    check_that('A group cannot be dropped into itself', get_id_order() == ['grp', 'b', 'a', 'sun'] and 'itself' in pg.inner_text('#toast'))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(100)
    check_that('Undo reverts a layer move', get_id_order() == ['grp', 'b', 'a', 'sun'] and pg.evaluate("svgEditor.state.modelEls.find(m => m.id === 'a').parentNode.id") == 'grp', get_id_order())
    pg.evaluate('(c) => { svgEditor.setCode(c, { reparse: true }); const h = svgEditor.state.history; h.splice(0, h.length - 1); }', before); pg.wait_for_timeout(150)
    pg.click('[data-itab=properties]')

    # 18 Editing code
    pg.click('#stage', position={'x': 5, 'y': 5})
    pg.keyboard.press('Escape')
    new = get_code().replace('fill="#ffc94a"', 'fill="#123456"')
    pg.evaluate("(c) => { const t = document.querySelector('#code'); t.focus(); t.select(); }", new)
    pg.keyboard.insert_text(new); pg.wait_for_timeout(400)
    check_that('Code input changes preview', pg.evaluate(f"{get_view_expression('circle')}.getAttribute('fill')") == '#123456')
    # Error
    pg.evaluate("() => { const t = document.querySelector('#code'); t.focus(); t.setSelectionRange(t.value.indexOf('<circle'), t.value.indexOf('<circle')); }")
    pg.keyboard.insert_text('<foo '); pg.wait_for_timeout(400)
    check_that('Error is shown', pg.is_visible('#code-error') and 'Line' in pg.inner_text('#code-error'), pg.inner_text('#code-error'))
    check_that('Error line marked', pg.locator('#marks mark.err').count() == 1)
    check_that('Notice "last working version" on error', pg.is_visible('.stale-hint'))
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(400)
    check_that('Undo in code fixes error', not pg.is_visible('#code-error'), get_code()[:200])
    # Click in code selects element
    pos = get_code().index('<polygon') + 3
    pg.evaluate(f"() => {{ const t = document.querySelector('#code'); t.focus(); t.setSelectionRange({pos},{pos}); t.dispatchEvent(new MouseEvent('click', {{bubbles:true}})); }}")
    check_that('Caret in tag selects shape', get_tag(get_selected()) == 'polygon')
    # Auto-close and indent
    endpos = get_code().index('</svg>')
    pg.evaluate(f"() => {{ const t = document.querySelector('#code'); t.focus(); t.setSelectionRange({endpos},{endpos}); }}")
    pg.keyboard.type('<g>'); pg.wait_for_timeout(50)
    check_that('Tag gets closed', '<g></g></svg>' in get_code(), get_code()[-40:])
    pg.keyboard.press('Enter'); pg.wait_for_timeout(50)
    check_that('Enter indents between tags', re.search(r'<g>\n\s+\n\s*</g>', get_code()), repr(get_code()[-50:]))
    pg.keyboard.press('Control+z'); pg.keyboard.press('Control+z'); pg.wait_for_timeout(400)

    # 19 Tidy up / shrink
    pg.click('#stage', position={'x': 5, 'y': 5})
    pg.click('#btn-minify'); pg.wait_for_timeout(200)
    check_that('Shrink', '\n' not in get_code().strip() and '<!--' not in get_code())
    pg.click('#btn-format'); pg.wait_for_timeout(200)
    check_that('Tidy up', get_code().count('\n') > 10 and '\n  <rect' in get_code(), get_code())

    # 20 Zoom
    z0 = get_zoom()
    pg.click('#zoom-in'); check_that('Zoom +', get_zoom() > z0)
    pg.click('#zoom-100'); check_that('Zoom 100%', abs(get_zoom() - 1) < 1e-9 and pg.inner_text('#zoom-label') == '100%')
    pg.click('#zoom-fit'); check_that('Fit to window', abs(get_zoom() - z0) < 0.05, (get_zoom(), z0))
    pg.mouse.move(900, 500); pg.mouse.wheel(0, -100); pg.wait_for_timeout(50)
    check_that('Mouse wheel zooms', get_zoom() > z0)
    px0 = pg.evaluate('svgEditor.state.panX')
    pg.keyboard.press('h')
    stage_box = pg.locator('#stage').bounding_box()
    pg.mouse.move(stage_box['x'] + 100, stage_box['y'] + 200); pg.mouse.down(); pg.mouse.move(stage_box['x'] + 160, stage_box['y'] + 200, steps=3); pg.mouse.up()
    check_that('Hand tool pans the view', abs(pg.evaluate('svgEditor.state.panX') - px0 - 60) < 1)
    pg.keyboard.press('v')

    # 21 Move a group (chart)
    import_drawing('chart.svg')
    check_that('Chart loaded', 'Q1' in get_code())
    x, y = get_center(get_view_expression('g rect'))
    pg.keyboard.down('Alt'); pg.mouse.click(x, y); pg.keyboard.up('Alt')
    check_that('Alt+click selects group', get_tag(get_selected()) == 'g')
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x + 30, y, steps=3); pg.mouse.up(); pg.wait_for_timeout(100)
    check_that('Group moved via transform', re.search(r'<g fill="#6c8ebf" transform="translate\([\d.]+ 0\)">', get_code()), re.findall(r'<g[^>]*>', get_code()))
    # Element in a moved group
    x, y = get_center(get_view_expression('g rect'))
    pg.mouse.click(x, y)
    check_that('Click inside selected group selects child', get_tag(get_selected()) == 'rect')
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x, y - 20, steps=3); pg.mouse.up(); pg.wait_for_timeout(100)
    check_that('Rectangle in group moved', re.search(r'<rect x="50" y="1[0-3][\d.]*" width="50"', get_code()), re.findall(r'<rect[^>]*>', get_code())[:2])

    # 22 Missing xmlns
    pg.evaluate("svgEditor.setCode('<svg width=\"100\" height=\"100\"><rect width=\"50\" height=\"50\"/></svg>')")
    pg.wait_for_timeout(100)
    check_that('Notice about missing xmlns', pg.is_visible('[data-fix=xmlns]'))
    pg.click('[data-fix=xmlns]'); pg.wait_for_timeout(100)
    check_that('xmlns added', 'xmlns="http://www.w3.org/2000/svg"' in get_code() and not pg.is_visible('#code-error'))

    # 23 Open file
    pg.set_input_files('#file', os.path.join(HERE, 'test.svg')); pg.wait_for_timeout(300)
    check_that('File opened', 'test file' in get_code())
    check_that('File name taken over', pg.evaluate('svgEditor.state.name') == 'test' and pg.inner_text('#file-name') == 'test')
    check_that('Opened file is a new drawing', pg.evaluate('svgEditor.store.list().length') == 2)

    # 24 Export
    pg.click('#btn-export'); pg.wait_for_timeout(100)
    check_that('Export dialog open', pg.is_visible('#export'))
    pg.select_option('#ex-format', 'png'); pg.check('#ex-bg'); pg.click('#ex-bg-color'); pg.wait_for_timeout(150)
    check_that('Background color: picker opens inside the export dialog', pg.is_visible('#export .color-picker') and pg.inner_text('#cp-title') == 'Background color · exported image')
    pg.fill('.cp-hex', '#123456'); pg.keyboard.press('Enter'); pg.wait_for_timeout(100)
    check_that('Background color taken over', pg.input_value('#ex-bg-color') == '#123456' and pg.is_visible('#export'))
    pg.uncheck('#ex-bg'); pg.select_option('#ex-format', 'svg')
    pg.keyboard.press('?'); pg.wait_for_timeout(100)
    check_that('Only one dialog at a time', pg.locator('dialog[open]').count() == 1)
    pg.keyboard.press('Escape'); pg.click('#btn-export'); pg.wait_for_timeout(100)
    outs = {}
    for f in ['svg', 'pretty', 'mini', 'uri', 'b64', 'css', 'img', 'jsx']:
        pg.select_option('#ex-format', f); pg.wait_for_timeout(30)
        outs[f] = pg.input_value('#ex-text')
    check_that('Export SVG', outs['svg'] == get_code())
    check_that('Export shrunk', '\n' not in outs['mini'] and outs['mini'].startswith('<svg'))
    check_that('Export data URI', outs['uri'].startswith('data:image/svg+xml,') and '<' not in outs['uri'])
    check_that('Export Base64', outs['b64'].startswith('data:image/svg+xml;base64,'))
    check_that('Export CSS', outs['css'].startswith('background-image: url("data:image/svg+xml,'))
    check_that('Export img', outs['img'].startswith('<img src="data:image/svg+xml;base64,'))
    check_that('Export JSX', 'export default function Test(props)' in outs['jsx'] and 'strokeWidth=' in outs['jsx'] and '{...props}' in outs['jsx'], outs['jsx'])
    # Data URI loads as an image
    ok = pg.evaluate("(u) => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r(-1); i.src = u; })", outs['uri'])
    check_that('Data URI is a valid image', ok > 0, ok)
    with pg.expect_download() as dl:
        pg.select_option('#ex-format', 'svg'); pg.click('#ex-download')
    d = dl.value; path = os.path.join(SP, 'dl_' + d.suggested_filename); d.save_as(path)
    check_that('SVG download', d.suggested_filename == 'test.svg' and open(path).read() == get_code())
    pg.select_option('#ex-format', 'png'); pg.select_option('#ex-scale', '4'); pg.wait_for_timeout(50)
    check_that('PNG size from factor', pg.input_value('#ex-w') == '480' and pg.input_value('#ex-h') == '240', (pg.input_value('#ex-w'), pg.input_value('#ex-h')))
    pg.fill('#ex-w', '300'); pg.wait_for_timeout(30)
    check_that('Aspect ratio kept', pg.input_value('#ex-h') == '150')
    with pg.expect_download() as dl:
        pg.click('#ex-download')
    d = dl.value; path = os.path.join(SP, 'dl_' + d.suggested_filename); d.save_as(path)
    head = open(path, 'rb').read(24)
    import struct
    w, h = struct.unpack('>II', head[16:24])
    check_that('PNG download 300x150', d.suggested_filename == 'test.png' and head[:8] == b'\x89PNG\r\n\x1a\n' and (w, h) == (300, 150), (d.suggested_filename, w, h))
    pg.select_option('#ex-format', 'jpeg'); pg.wait_for_timeout(30)
    with pg.expect_download() as dl:
        pg.click('#ex-download')
    d = dl.value; path = os.path.join(SP, 'dl_' + d.suggested_filename); d.save_as(path)
    check_that('JPG download', d.suggested_filename == 'test.jpg' and open(path, 'rb').read(3) == b'\xff\xd8\xff')
    pg.select_option('#ex-format', 'webp'); pg.wait_for_timeout(30)
    with pg.expect_download() as dl:
        pg.click('#ex-download')
    d = dl.value; path = os.path.join(SP, 'dl_' + d.suggested_filename); d.save_as(path)
    check_that('WebP download', open(path, 'rb').read(12)[8:12] == b'WEBP')
    with pg.expect_download() as dl:
        pg.click('#ex-zip')
    d = dl.value; path = os.path.join(SP, 'dl_' + d.suggested_filename); d.save_as(path)
    import zipfile
    zf = zipfile.ZipFile(path)
    names = zf.namelist()
    check_that('ZIP with all formats', d.suggested_filename == 'test.zip' and zf.testzip() is None and names == ['test.svg', 'test-tidy.svg', 'test-min.svg', 'test.png', 'test.jpg', 'test.webp', 'test.jsx', 'test-data-uri.txt', 'test-base64.txt', 'test-background.css', 'test-img.html'], names)
    zpng = zf.read('test.png')
    check_that('ZIP contents are right', zf.read('test.svg').decode() == get_code() and zf.read('test.jsx').decode() == outs['jsx']
          and struct.unpack('>II', zpng[16:24]) == (300, 150) and zf.read('test.jpg')[:3] == b'\xff\xd8\xff' and zf.read('test.webp')[8:12] == b'WEBP', names)
    pg.select_option('#ex-format', 'jsx'); pg.click('#ex-copy'); pg.wait_for_timeout(100)
    check_that('Copy to clipboard', pg.evaluate('navigator.clipboard.readText()') == outs['jsx'])
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    check_that('Dialog closes with Esc', not pg.is_visible('#export'))

    # 25 Storage across reload, and a draft from before "My drawings"
    mctx = b.new_context(); mp = mctx.new_page(); mp.goto(URL)
    mp.evaluate("""localStorage.clear(); localStorage.setItem('svgeditor.v1', JSON.stringify({ code: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 9"><rect id="olddraft" width="4" height="4"/></svg>', name: 'old', grid: { show: true, size: 20, snap: true } }))""")
    mp.reload(); mp.wait_for_timeout(500)
    check_that('An old draft becomes the first drawing', 'olddraft' in mp.evaluate('svgEditor.state.code') and mp.inner_text('#file-name') == 'old' and mp.evaluate('svgEditor.store.list().length') == 1)
    mctx.close()
    pg.wait_for_timeout(300)
    keep = get_code()
    pg.reload(); pg.wait_for_timeout(600)
    check_that('Draft kept after reload', get_code() == keep)
    check_that('Grid setting kept', pg.evaluate('svgEditor.state.grid.size') == 20)

    # 26 New, help, harmful code in the preview
    native = []
    pg.on('dialog', lambda d: (native.append(d.message), d.dismiss()))
    # New menu: blank drawing, example, start over
    def get_drawing_count():
        """Return the number of drawings in "My drawings".

        Returns:
            int: the count.
        """
        return pg.evaluate('svgEditor.store.list().length')
    n0 = get_drawing_count()
    pg.click('#btn-new'); pg.wait_for_timeout(100)
    check_that('New opens its menu', pg.is_visible('#new-menu') and pg.get_attribute('#btn-new', 'aria-expanded') == 'true')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(100)
    check_that('Menu closes with Esc, nothing changed', not pg.is_visible('#new-menu') and get_code() == keep and get_drawing_count() == n0)
    pg.click('#btn-new'); pg.click('[data-new=blank]'); pg.wait_for_timeout(250)
    check_that('New blank drawing is another file', get_drawing_count() == n0 + 1 and pg.evaluate('svgEditor.state.modelEls.length') == 1 and pg.inner_text('#file-name') == 'Drawing' and not native)
    check_that('New drawing starts with its own empty undo', pg.is_disabled('#btn-undo'))
    pg.click('#btn-new'); pg.click('[data-new=example]'); pg.wait_for_timeout(250)
    check_that('New from the example (editor logo)', get_drawing_count() == n0 + 2 and 'Click a shape to move it' in get_code() and pg.inner_text('#file-name').startswith('Editor logo'))
    pg.click('#btn-new'); pg.click('[data-new=restart]'); pg.wait_for_timeout(150)
    check_that('Start over asks first', pg.is_visible('#ask') and 'Start "Editor logo' in pg.inner_text('#ask-title'))
    pg.click('#ask-cancel'); pg.wait_for_timeout(150)
    check_that('Start over can be cancelled', 'Click a shape to move it' in get_code())
    pg.click('#btn-new'); pg.click('[data-new=restart]'); pg.wait_for_timeout(150); pg.click('#ask-ok'); pg.wait_for_timeout(250)
    check_that('Start over empties the drawing, keeps its size', get_drawing_count() == n0 + 2 and pg.evaluate('svgEditor.state.modelEls.length') == 1 and 'viewBox="0 0 256 256"' in get_code())
    pg.keyboard.press('Control+z'); pg.wait_for_timeout(150)
    check_that('Start over undone', 'Click a shape to move it' in get_code())

    # My drawings
    pg.click('#btn-files'); pg.wait_for_timeout(300)
    check_that('My drawings lists every drawing', pg.is_visible('#files') and pg.locator('.file-card').count() == n0 + 2)
    check_that('The open drawing is marked and listed first', 'Open now' in pg.inner_text('.file-card.current') and pg.locator('.file-card').first.get_attribute('class').endswith('current'))
    check_that('Thumbnails show the drawings', pg.evaluate("[...document.querySelectorAll('.file-picture img')].every(i => i.complete && i.naturalWidth > 0)"))
    pg.click('.file-card:has-text("test")'); pg.wait_for_timeout(300)
    check_that('Click opens a drawing', not pg.is_visible('#files') and 'test file' in get_code() and pg.inner_text('#file-name') == 'test')
    pg.keyboard.press('Control+o'); pg.wait_for_timeout(200)
    check_that('Ctrl+O opens My drawings', pg.is_visible('#files'))
    pg.click('.file-card.current [data-act=rename]'); pg.keyboard.press('Control+a'); pg.keyboard.type('Renamed'); pg.keyboard.press('Enter'); pg.wait_for_timeout(150)
    check_that('Rename', pg.inner_text('#file-name') == 'Renamed' and 'Renamed' in pg.locator('.file-name').all_inner_texts())
    pg.click('.file-card.current [data-act=copy]'); pg.wait_for_timeout(150)
    check_that('Duplicate', 'Renamed copy' in pg.locator('.file-name').all_inner_texts() and get_drawing_count() == n0 + 3)
    with pg.expect_download() as dl: pg.click('.file-card.current [data-act=download]')
    check_that('Download one drawing', dl.value.suggested_filename == 'Renamed.svg')
    with pg.expect_download() as dl: pg.click('#files-zip')
    check_that('Download all as ZIP', dl.value.suggested_filename == 'svg-drawings.zip')
    pg.fill('#files-search', 'copy'); pg.wait_for_timeout(100)
    check_that('Search filters by name', pg.locator('.file-card').count() == 1)
    pg.click('.file-card [data-act=delete]'); pg.wait_for_timeout(150)
    check_that('Delete asks first', pg.is_visible('#ask') and 'Renamed copy' in pg.inner_text('#ask-title'))
    pg.click('#ask-cancel'); pg.wait_for_timeout(150)
    check_that('Delete can be cancelled', get_drawing_count() == n0 + 3 and pg.is_visible('#files'))
    pg.fill('#files-search', '')
    pg.click('.file-card.current [data-act=delete]'); pg.wait_for_timeout(150); pg.click('#ask-ok'); pg.wait_for_timeout(300)
    check_that('Deleting the open drawing opens another one', get_drawing_count() == n0 + 2 and pg.inner_text('#file-name') != 'Renamed' and pg.is_visible('#files'))
    pg.keyboard.press('Escape')
    cur = pg.inner_text('#file-name'); keep = get_code()
    pg.reload(); pg.wait_for_timeout(600)
    check_that('The open drawing is kept after reload', pg.inner_text('#file-name') == cur and get_code() == keep)
    pg.click('#btn-help'); check_that('Help open', pg.is_visible('#help') and 'How it works' in pg.inner_text('#help')); pg.keyboard.press('Escape')
    pg.evaluate("window.__boom = 0")
    pg.evaluate("""svgEditor.setCode('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>window.__boom=1</script><rect width="50" height="50" onload="window.__boom=2"/><image href="x" onerror="window.__boom=3"/></svg>')""")
    pg.wait_for_timeout(300)
    check_that('Scripts in the drawing do not run', pg.evaluate('window.__boom') == 0)
    check_that('onload stays in the code', 'onload=' in get_code())

    # The drawing with onload/onerror above makes the browser report that the CSP blocked them: expected.
    errs = [e for e in errs if 'Content Security Policy' not in e]
    check_that('No console errors', not errs, errs)
    pg.close()

    # 27 Color theme light / dark / auto
    tp = ctx.new_page()
    tp.goto(URL); tp.wait_for_timeout(400)
    def get_background(pg_):
        """Return the background color of a page.

        Args:
            pg_ (Page): the page.

        Returns:
            str: the computed background color.
        """
        return pg_.evaluate("getComputedStyle(document.body).backgroundColor")
    light_bg, dark_bg = 'rgb(243, 244, 247)', 'rgb(15, 17, 22)'
    tp.evaluate("localStorage.removeItem('svgeditor.theme')"); tp.reload(); tp.wait_for_timeout(300)
    check_that('Theme auto with light system: light', get_background(tp) == light_bg and tp.get_attribute('[data-theme-set=auto]', 'aria-checked') == 'true', get_background(tp))
    tp.click('[data-theme-set=dark]'); tp.wait_for_timeout(100)
    check_that('Theme dark', get_background(tp) == dark_bg and tp.get_attribute('[data-theme-set=dark]', 'aria-checked') == 'true', get_background(tp))
    check_that('Code colors follow the theme', tp.evaluate("getComputedStyle(document.querySelector('#hl .k')).color") == 'rgb(195, 155, 255)')
    tp.reload(); tp.wait_for_timeout(300)
    check_that('Theme dark kept after reload', get_background(tp) == dark_bg)
    tp.goto(URL + 'imprint.html'); tp.wait_for_timeout(200)
    check_that('Theme applies on imprint', get_background(tp) == dark_bg)
    tp.click('[data-theme-set=light]'); tp.wait_for_timeout(100)
    check_that('Switch on imprint', get_background(tp) == light_bg)
    tp.emulate_media(color_scheme='dark'); tp.goto(URL); tp.wait_for_timeout(300)
    check_that('Theme light applies despite dark system', get_background(tp) == light_bg, get_background(tp))
    tp.click('[data-theme-set=auto]'); tp.wait_for_timeout(100)
    check_that('Theme auto follows dark system', get_background(tp) == dark_bg, get_background(tp))
    tp.emulate_media(color_scheme='light'); tp.wait_for_timeout(100)
    check_that('Theme auto follows system change', get_background(tp) == light_bg, get_background(tp))
    tp.close()

    # 28 Narrow screen
    mp = ctx.new_page(); mp.set_viewport_size({'width': 390, 'height': 844})
    mp.goto(URL); mp.wait_for_timeout(600)
    check_that('Mobile: canvas visible', mp.is_visible('#stage') and not mp.is_visible('.code-pane'))
    sw = mp.evaluate('document.documentElement.scrollWidth')
    check_that('Mobile: no horizontal scrolling', sw <= 390, sw)
    mp.screenshot(path=SP + '/m_draw.png')
    mp.click('[data-pane=code]'); check_that('Mobile: code view', mp.is_visible('.code-pane') and not mp.is_visible('#stage'))
    mp.screenshot(path=SP + '/m_code.png')
    mp.click('[data-pane=draw]'); mp.wait_for_timeout(100)
    x, y = mp.evaluate("(() => { const r = svgEditor.state.viewRoot.querySelector('rect').getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; })()")
    mp.mouse.click(x, y)
    mp.click('[data-pane=properties]'); check_that('Mobile: properties of the selection', mp.is_visible('#inspector-body') and 'rectangle' in mp.inner_text('#inspector-body').lower())
    mp.screenshot(path=SP + '/m_insp.png')
    mp.close()

    # Dragging with the mouse keeps the page where it is
    sp = ctx.new_page(); sp.set_viewport_size({'width': 1366, 'height': 700})
    sp.goto(URL); sp.wait_for_timeout(600)
    x, y = sp.evaluate("(() => { const r = svgEditor.state.viewRoot.querySelector('rect').getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; })()")
    sp.mouse.move(x, y); sp.mouse.down(); sp.mouse.move(x, y + 40); sp.mouse.move(x, y + 900)
    sp.evaluate('scrollBy(0, 400)'); sp.wait_for_timeout(100)
    check_that('Mouse drag: the page does not scroll', sp.evaluate('scrollY') == 0, sp.evaluate('scrollY'))
    sp.mouse.up(); sp.evaluate('scrollBy(0, 400)'); sp.wait_for_timeout(100)
    check_that('After the drag the page scrolls again', sp.evaluate('scrollY') > 0)
    # Mouse wheel button: dragging pans without centering, a double-click fits
    sp.evaluate('scrollTo(0, 0)'); sp.wait_for_timeout(100)
    sp.mouse.move(700, 350); sp.mouse.down(button='middle'); sp.mouse.move(760, 390); sp.mouse.up(button='middle'); sp.wait_for_timeout(500)
    st = sp.evaluate('[svgEditor.state.panX, svgEditor.state.panY, svgEditor.state.autoFit]')
    sp.evaluate('''(() => { const d = new DataTransfer(); d.setData('text/plain', '<svg xmlns="http://www.w3.org/2000/svg"><rect id="wheelpaste"/></svg>'); window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d })); })()''')
    sp.wait_for_timeout(200)
    check_that('Wheel drag pans and the view stays there', st[2] is False and sp.evaluate('[svgEditor.state.panX, svgEditor.state.panY]') == st[:2] and 'wheelpaste' not in sp.evaluate('svgEditor.state.code'), st)
    sp.wait_for_timeout(500)
    for k in range(2): sp.mouse.down(button='middle'); sp.mouse.up(button='middle')
    sp.wait_for_timeout(200)
    check_that('Double-click on the mouse wheel fits the drawing', sp.evaluate('svgEditor.state.autoFit') and sp.evaluate('[svgEditor.state.panX, svgEditor.state.panY]') != st[:2])
    sp.close()

    # Stored settings with a German background name: read under its English name and stored again
    mp = ctx.new_page()
    mp.goto(URL); mp.evaluate("localStorage.setItem('svgeditor.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('svgeditor.v1') || '{}'), bg: 'dunkel' }))")
    mp.reload(); mp.wait_for_timeout(600)
    check_that('A stored German background name is read as its English name', mp.evaluate('svgEditor.state.bg') == 'dark' and mp.input_value('#bg') == 'dark' and mp.evaluate("document.getElementById('paper').dataset.bg") == 'dark')
    check_that('The settings are stored again with the English name', mp.evaluate("JSON.parse(localStorage.getItem('svgeditor.v1')).bg") == 'dark')
    mp.evaluate("localStorage.setItem('svgeditor.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('svgeditor.v1')), bg: 'checker' }))")
    mp.close()

    # Legal pages and dark mode
    lp = ctx.new_page()
    for u in ['imprint.html', 'privacy.html']:
        r = lp.goto(URL + u)
        check_that('Page ' + u, r.status == 200 and 'Grünwald' in lp.inner_text('main'))
    check_that('Privacy names lima-city', 'lima-city' in lp.inner_text('main'))
    check_that('Legal pages in English', lp.evaluate('document.documentElement.lang') == 'en' and 'Privacy policy' in lp.inner_text('h1'))
    lp.close()
    dp = b.new_page(viewport={'width':1440,'height':900}, color_scheme='dark')
    dp.goto(URL); dp.wait_for_timeout(600)
    dp.screenshot(path=SP + '/dark.png')
    dp.close()
    b.close()

fails = [r for r in results if not r[1]]
print(f'\n{len(results) - len(fails)}/{len(results)} passed')
sys.exit(1 if fails else 0)
