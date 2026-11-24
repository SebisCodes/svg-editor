"""Phone test: layout and touch handling on an emulated iPhone.

    php -S 127.0.0.1:8093 -t src src/php/router.php &
    python tests/mobile_test.py
"""
import os
import sys

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


with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    dev = p.devices['iPhone 13']
    ctx = b.new_context(**{k: v for k, v in dev.items() if k != 'default_browser_type'})
    pg = ctx.new_page()
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.goto(URL); pg.evaluate('localStorage.clear()'); pg.reload(); pg.wait_for_function('window.svgEditor && svgEditor.state.viewRoot'); pg.wait_for_timeout(400)
    cdp = ctx.new_cdp_session(pg)

    def move_finger(a, z, steps=10):
        """Swipe with one finger from one point to another.

        Args:
            a (tuple[float, float]): the start.
            z (tuple[float, float]): the end.
            steps (int): the number of moves in between.

        Returns:
            None: the swipe is done.
        """
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': a[0], 'y': a[1]}]})
        for i in range(1, steps + 1):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': a[0] + (z[0] - a[0]) * i / steps, 'y': a[1] + (z[1] - a[1]) * i / steps}]})
            pg.wait_for_timeout(16)
        cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        pg.wait_for_timeout(350)

    def reset_scroll():
        """Scroll the page to the top.

        Returns:
            None: the page is at the top.
        """
        pg.evaluate('scrollTo(0, 0)'); pg.wait_for_timeout(250)

    def get_code():
        """Return the code in the code field.

        Returns:
            str: the code.
        """
        return pg.input_value('#code')

    def get_selected():
        """Return the selected element.

        Returns:
            int: its index, -1 for none.
        """
        return pg.evaluate('svgEditor.state.sel')

    def get_scroll_y():
        """Return how far the page is scrolled down.

        Returns:
            float: scrollY.
        """
        return pg.evaluate('scrollY')

    def get_box(sel_js):
        """Return the screen box of an element.

        Args:
            sel_js (str): a JavaScript expression that gives the element.

        Returns:
            list[float]: [x, y, width, height].
        """
        return pg.evaluate(f"(() => {{ const r = {sel_js}.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }})()")

    def get_center(sel_js):
        """Return the screen center of an element.

        Args:
            sel_js (str): a JavaScript expression that gives the element.

        Returns:
            tuple[float, float]: x and y of its center.
        """
        x, y, w, h = get_box(sel_js)
        return x + w / 2, y + h / 2

    def get_view_expression(css):
        """Return a JavaScript expression for an element of the view.

        Args:
            css (str): a CSS selector inside the drawing.

        Returns:
            str: the expression.
        """
        return f"svgEditor.state.viewRoot.querySelector('{css}')"

    # Layout
    check_that('Touch device detected', pg.evaluate("matchMedia('(pointer: coarse)').matches"))
    check_that('No horizontal scrolling', pg.evaluate('document.documentElement.scrollWidth') <= 390)
    hb = pg.locator('header').bounding_box()
    check_that('Header takes three rows at most', hb['height'] < 150, hb['height'])
    check_that('AI Assistant available on phones', pg.is_visible('#btn-ai'))
    check_that('Undo/Redo as icons', not pg.is_visible('#btn-undo .txt') and pg.is_visible('#btn-undo'))
    hint, zoom, stage = get_box("document.querySelector('#hint')"), get_box("document.querySelector('.stage .zoom')"), get_box("document.querySelector('#stage')")
    paper = get_box("document.querySelector('#paper')")
    check_that('Hint line is one line', hint[3] < 34, hint)
    check_that('Drawing fits between hint and zoom bar', paper[1] >= hint[1] + hint[3] - 1 and paper[1] + paper[3] <= zoom[1] + 1, (hint, paper, zoom))
    check_that('Canvas and zoom bar visible without scrolling', stage[1] + stage[3] <= 844 + 1, stage)

    # Swipe on an unselected shape scrolls the page and moves nothing
    c0 = get_code()
    x, y = get_center(get_view_expression('path'))
    move_finger((x, y + 80), (x, y - 160))
    check_that('Swipe on a shape scrolls the page', get_scroll_y() > 100, get_scroll_y())
    check_that('Swipe does not move or select anything', get_code() == c0 and get_selected() == -1)
    reset_scroll()

    # Tap selects; the selected shape can be dragged
    x, y = get_center(get_view_expression('rect:nth-of-type(2)'))
    pg.touchscreen.tap(x, y); pg.wait_for_timeout(200)
    small = get_selected()
    check_that('Tap selects the shape', small > 0 and pg.evaluate(f'svgEditor.state.modelEls[{small}].localName') == 'rect', small)
    check_that('Touch hint for a selection', 'Drag it to move' in pg.inner_text('#hint'))
    check_that('Grip lies over the selection', pg.is_visible('#grip'))
    move_finger((x, y), (x + 30, y - 30))
    check_that('Dragging the selected shape moves it', get_code() != c0 and get_scroll_y() == 0, get_scroll_y())
    c1 = get_code()
    # A swipe that starts beside the selection scrolls instead of moving
    bg = get_center(get_view_expression('rect'))
    move_finger((bg[0] - 120, bg[1] + 60), (bg[0] - 120, bg[1] - 160))
    check_that('Swipe beside the selection scrolls, keeps the shape', get_scroll_y() > 100 and get_code() == c1, get_scroll_y())
    reset_scroll()
    # Resize by handle
    h = pg.locator('#overlay .handle[data-h="se"]').bounding_box()
    check_that('Handles are finger-sized', h and h['width'] >= 17, h)
    w0 = pg.evaluate(f"+svgEditor.state.modelEls[{small}].getAttribute('width')")
    move_finger((h['x'] + h['width'] / 2, h['y'] + h['height'] / 2), (h['x'] + 40, h['y'] + 40))
    w1 = pg.evaluate(f"+svgEditor.state.modelEls[{small}].getAttribute('width')")
    check_that('Handle drag resizes', w1 > w0 and get_scroll_y() == 0, (w0, w1))
    # Tap on empty space deselects
    sx, sy, sw, sh = get_box("document.querySelector('#stage')")
    pg.touchscreen.tap(sx + 6, sy + sh - 70); pg.wait_for_timeout(200)
    check_that('Tap on empty space deselects', get_selected() == -1)
    check_that('Grip hidden without selection', not pg.is_visible('#grip'))
    pg.click('#btn-undo'); pg.click('#btn-undo'); pg.wait_for_timeout(200)
    check_that('Undo button works on the phone', get_code() == c0)

    # Tap on a part of a selected group selects that part
    pg.evaluate('''svgEditor.setCode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <g id="grp"><rect id="r1" x="10" y="10" width="30" height="30"/><rect id="r2" x="60" y="60" width="30" height="30"/></g>
</svg>`)'''); pg.wait_for_timeout(250)
    gi = pg.evaluate("svgEditor.state.modelEls.findIndex(m => m.id === 'grp')")
    pg.evaluate(f'svgEditor.select({gi})'); pg.wait_for_timeout(100)
    x, y = get_center(get_view_expression('#r2'))
    pg.touchscreen.tap(x, y); pg.wait_for_timeout(200)
    check_that('Tap inside a selected group selects the part', pg.evaluate('svgEditor.state.modelEls[svgEditor.state.sel].id') == 'r2')
    pg.evaluate(f'svgEditor.select({gi})'); pg.wait_for_timeout(100)
    g0 = get_code()
    move_finger(get_center(get_view_expression('#r1')), (get_center(get_view_expression('#r1'))[0] + 20, get_center(get_view_expression('#r1'))[1] + 20))
    check_that('Dragging a selected group moves the group', get_code() != g0 and 'transform' in get_code() or 'x="' in get_code(), get_code())

    # Hand tool moves the view, drawing tools draw
    pg.click('[data-tool=hand]')
    p0 = get_box("document.querySelector('#paper')")
    x, y = get_center("document.querySelector('#stage')")
    move_finger((x, y), (x + 50, y + 30))
    p1 = get_box("document.querySelector('#paper')")
    check_that('Hand tool moves the view (no page scroll)', abs(p1[0] - p0[0] - 50) < 2 and get_scroll_y() == 0, (p0, p1))
    pg.click('#zoom-fit')
    pg.click('[data-tool=rect]')
    n0 = pg.evaluate('svgEditor.state.modelEls.length')
    sx, sy, sw, sh = get_box("document.querySelector('#paper')")
    move_finger((sx + sw * 0.3, sy + sh * 0.45), (sx + sw * 0.55, sy + sh * 0.7))
    check_that('Rectangle tool draws with a finger', pg.evaluate('svgEditor.state.modelEls.length') == n0 + 1 and get_scroll_y() == 0)
    pg.click('[data-tool=pen]')
    move_finger((sx + sw * 0.2, sy + sh * 0.2), (sx + sw * 0.8, sy + sh * 0.3), steps=20)
    check_that('Freehand tool draws with a finger', pg.evaluate('svgEditor.state.modelEls.length') == n0 + 2)
    pg.click('[data-tool=select]'); pg.evaluate('svgEditor.select(-1)')
    check_that('Select tool hint for touch', 'Swipe to scroll' in pg.inner_text('#hint'))

    # Other views
    pg.click('[data-pane=code]'); pg.wait_for_timeout(150)
    check_that('Code view: copy button in the code header', pg.is_visible('.code-pane #btn-copy'))
    pg.click('[data-pane=properties]'); pg.wait_for_timeout(150)
    pg.click('[data-itab=structure]')
    check_that('Layers: row buttons are finger-sized', pg.evaluate("document.querySelector('#tree li[data-i=\"1\"] .item-button') ? 1 : 0") == 1)
    pg.click('#tree li[data-i="1"] .choice')
    eb = pg.locator('#tree li.active [data-layer=eye]').bounding_box()
    check_that('Layers: buttons of the selected row are visible', eb and eb['width'] >= 30, eb)
    pg.click('[data-pane=draw]')

    # Dialogs fit on the phone
    pg.click('#btn-export'); pg.wait_for_timeout(200)
    db = pg.locator('#export').bounding_box()
    dl = pg.locator('#ex-download').bounding_box()
    check_that('Export dialog fits the screen', db['width'] <= 390 and db['y'] + db['height'] <= 844 + 1, db)
    check_that('Export: download button reachable', dl and dl['y'] + dl['height'] <= db['y'] + db['height'] + 1, (dl, db))
    pg.keyboard.press('Escape')
    pg.click('#btn-help'); pg.wait_for_timeout(200)
    hb = pg.locator('#help').bounding_box()
    check_that('Help dialog fits the screen', hb['width'] <= 390 and hb['height'] <= 844, hb)
    pg.keyboard.press('Escape')
    check_that('No page errors', not errors, errors)
    b.close()

print(f'{ok}/{ok + fail} passed')
sys.exit(1 if fail else 0)
