"""Editing text in place on the canvas: a double-click on a <text> or
<tspan> opens a field over it; Enter writes the text into the code
(special characters escaped, one undo step), Escape cancels.

Start the editor first (php -S 127.0.0.1:8093 -t src src/php/router.php), then run this file."""
import os
import sys

from playwright.sync_api import sync_playwright

EDITOR = os.environ.get('EDITOR_URL', 'http://127.0.0.1:8093/')
CODE = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120" width="300" height="120">\n'
        '  <rect id="r" x="0" y="0" width="300" height="120" fill="#eef"/>\n'
        '  <text id="t" x="20" y="45" font-size="28">Hello</text>\n'
        '  <text id="g" x="20" y="95" font-size="24"><tspan>One</tspan><tspan dx="12">Two</tspan></text>\n'
        '</svg>\n')
failed = []


def check_that(ok, text):
    """Print the result of one check and remember a failure.

    Args:
        ok (bool): the outcome.
        text (str): what is checked.

    Returns:
        None: a failure goes into failed.
    """
    print(('ok    ' if ok else 'FAIL  ') + text)
    if not ok:
        failed.append(text)


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1360, 'height': 860})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(EDITOR + '?lang=en', wait_until='load')
    page.wait_for_timeout(1200)
    page.evaluate('c => svgEditor.setCode(c)', CODE)
    page.wait_for_timeout(500)
    def get_code():
        """Return the code of the open drawing.

        Returns:
            str: the editor's code.
        """
        return page.evaluate('svgEditor.state.code')

    field = page.locator('input.text-in-place')

    page.locator('#host text#t').dblclick()
    page.wait_for_timeout(200)
    check_that(field.count() == 1 and field.input_value() == 'Hello', 'a double-click on a text opens a field with its text')
    check_that(page.evaluate("document.activeElement.classList.contains('text-in-place')"), 'the field has the focus')
    look = page.locator('#host text#t').evaluate('''t => { const s = getComputedStyle(document.querySelector('.text-in-place'));
        const ts = getComputedStyle(t), m = t.getScreenCTM(); return [s.fontFamily === ts.fontFamily, s.color === ts.fill, s.fontWeight === ts.fontWeight,
        Math.abs(parseFloat(s.fontSize) - parseFloat(ts.fontSize) * Math.hypot(m.a, m.b)) < 1, s.backgroundColor]; }''')
    check_that(look[:4] == [True, True, True, True] and look[4] == 'rgba(0, 0, 0, 0)', 'the field looks like the text: font, color, weight, size on screen, no background: ' + str(look))
    field.fill('Hi <you> & "co"')
    field.press('Enter')
    page.wait_for_timeout(400)
    check_that(field.count() == 0, 'Enter closes the field')
    check_that('>Hi &lt;you&gt; &amp; "co"</text>' in get_code(), 'the text is in the code, escaped: ' + get_code().split('\n')[2])
    check_that(get_code().count('<rect id="r"') == 1 and 'font-size="28"' in get_code(), 'the rest of the code stays as it was')
    page.evaluate('svgEditor.undo()')
    page.wait_for_timeout(300)
    check_that('>Hello</text>' in get_code(), 'one Undo brings the old text back')

    page.locator('#host text#t').dblclick()
    page.wait_for_timeout(200)
    field.fill('Not this')
    field.press('Escape')
    page.wait_for_timeout(300)
    check_that(field.count() == 0 and '>Hello</text>' in get_code(), 'Escape cancels')

    page.locator('#host text#g tspan:nth-of-type(2)').dblclick()
    page.wait_for_timeout(200)
    check_that(field.count() == 1 and field.input_value() == 'Two', 'in a text made of tspans, the tspan under the pointer is edited')
    field.fill('Three')
    page.mouse.click(5, 5)
    page.wait_for_timeout(400)
    check_that('<tspan>One</tspan><tspan dx="12">Three</tspan>' in get_code(), 'leaving the field also writes the text')

    page.goto(EDITOR + '?lang=de', wait_until='load')
    page.wait_for_timeout(1500)
    page.evaluate('c => svgEditor.setCode(c)', CODE)
    page.wait_for_timeout(500)
    page.locator('#host text#t').dblclick()
    page.wait_for_timeout(200)
    check_that(field.count() == 1 and field.input_value() == 'Hello', 'also in the German interface, and the text itself is not translated')
    field.press('Escape')
    page.goto(EDITOR + '?lang=en', wait_until='load')
    check_that(not errors, 'no script errors: ' + '; '.join(errors))
    browser.close()

print()
print('all passed' if not failed else f'{len(failed)} failed')
sys.exit(1 if failed else 0)
