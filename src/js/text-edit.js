/**
 * Editing a text in place: a double-click on a text puts a field over it on the canvas, the
 * cursor on the clicked character. Enter or leaving the field writes the text into the code
 * (one undo step), Escape cancels. A text made of several parts (tspan) is edited part by
 * part; one with further elements inside goes to the text field of the properties.
 */

import { state } from './state.js?v=2';
import { findElement } from './util.js?v=3';
import { setCode, addHistoryStep } from './history.js?v=3';
import { setText } from './edits.js?v=3';
import { setInspectorRebuild } from './inspector.js?v=3';
import { selectElement, getSelectableIndex, getViewElementAt } from './selection.js?v=3';

const FIELD_LEFT_SHIFT = 8;
const MIN_FIELD_WIDTH = 60;
const FIELD_EXTRA_WIDTH = 24;
const MIN_FIELD_HEIGHT = 24;
const MIN_FONT_SIZE = 8;

/**
 * Edits the text under a double-click (step list at the top).
 * @param {MouseEvent} event - the dblclick event on the stage.
 * @returns {void}
 */
export function editTextOnDoubleClick(event) {
    const node = getViewElementAt(event.clientX, event.clientY);
    const index = node ? getSelectableIndex(node) : -1;
    if (index <= 0 || state.modelEls[index].localName !== 'text') return;
    const part = node && node.localName === 'tspan' ? state.viewEls.indexOf(node) : -1;
    const target = part > 0 && !state.modelEls[part].children.length ? part : index;
    selectElement(target);
    if (!state.modelEls[target].children.length) { editTextInPlace(target, event.clientX, event.clientY); return; }
    const field = findElement('#f-text');
    if (field) { field.focus(); field.select(); }
}

/**
 * Returns the character of an SVG text under a screen point: before it, or after it on its
 * right half.
 * @param {SVGTextContentElement} text - the text in the view.
 * @param {number} x - the screen x.
 * @param {number} y - the screen y.
 * @returns {?number} the cursor position in the text, null when it cannot be found.
 */
function getCharIndexAt(text, x, y) {
    try {
        const matrix = text.getScreenCTM();
        if (!matrix || !text.getNumberOfChars()) return null;
        const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
        const index = text.getCharNumAtPosition(point);
        if (index < 0) return x < text.getBoundingClientRect().left + 1 ? 0 : text.getNumberOfChars();
        const extent = text.getExtentOfChar(index);
        return point.x > extent.x + extent.width / 2 ? index + 1 : index;
    } catch (error) { return null; }
}

/**
 * Creates the field that lies over a text: its font, size on screen, weight, style and color.
 * @param {SVGTextContentElement} view - the text in the view.
 * @param {string} text - the text to edit.
 * @returns {HTMLInputElement} the field.
 */
function createTextField(view, text) {
    const field = document.createElement('input');
    field.type = 'text';
    field.className = 'text-in-place';
    field.value = text;
    field.setAttribute('aria-label', 'Text');
    const bounds = view.getBoundingClientRect();
    const style = getComputedStyle(view), matrix = view.getScreenCTM();
    const size = parseFloat(style.fontSize) * (matrix ? Math.hypot(matrix.a, matrix.b) : 1);
    Object.assign(field.style, {
        left: bounds.left - FIELD_LEFT_SHIFT + 'px', top: bounds.top + 'px', minWidth: Math.max(MIN_FIELD_WIDTH, bounds.width + FIELD_EXTRA_WIDTH) + 'px', height: Math.max(MIN_FIELD_HEIGHT, bounds.height) + 'px',
        fontFamily: style.fontFamily, fontSize: Math.max(MIN_FONT_SIZE, size) + 'px', fontWeight: style.fontWeight, fontStyle: style.fontStyle,
        letterSpacing: style.letterSpacing, textDecoration: style.textDecorationLine,
    });
    if (/^(rgb|#)/.test(style.fill)) field.style.color = style.fill;
    return field;
}

/**
 * Puts a field over a text on the canvas to edit it there.
 * @param {number} index - the text element (without child elements).
 * @param {?number} x - the screen x of the click, null to select the whole text.
 * @param {?number} y - the screen y of the click.
 * @returns {void}
 */
export function editTextInPlace(index, x, y) {
    const view = state.viewEls[index], model = state.modelEls[index];
    if (!view || !model) return;
    const field = createTextField(view, model.textContent);
    const visibility = view.style.visibility;
    view.style.visibility = 'hidden';
    let isDone = false;
    /**
     * Ends the edit once: shows the text again and writes a changed text into the code.
     * @param {boolean} keep - true to take the typed text.
     * @returns {void}
     */
    const stopRenameEdit = keep => {
        if (isDone) return;
        isDone = true;
        view.style.visibility = visibility;
        const text = field.value;
        field.remove();
        removeEventListener('wheel', stopEditOnLeave, true);
        if (keep && text !== model.textContent) writeText(index, text);
    };
    /**
     * Ends the edit and keeps the text.
     * @returns {void}
     */
    const stopEditOnLeave = () => stopRenameEdit(true);
    field.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); stopRenameEdit(true); }
        else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stopRenameEdit(false); }
        event.stopPropagation();
    });
    field.addEventListener('blur', stopEditOnLeave);
    addEventListener('wheel', stopEditOnLeave, true);
    document.body.append(field);
    field.focus();
    const cursor = x == null ? null : getCharIndexAt(view, x, y);
    if (cursor == null) field.select(); else field.setSelectionRange(cursor, cursor);
}

/**
 * Writes an edited text into the code as one undo step and keeps the text selected.
 * @param {number} index - the text element.
 * @param {string} text - the new text.
 * @returns {void}
 */
function writeText(index, text) {
    setText(index, text);
    clearTimeout(state.historyTimer);
    addHistoryStep();
    setInspectorRebuild();
    setCode(state.code, { select: index, history: false });
}
