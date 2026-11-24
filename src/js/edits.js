/**
 * Changing an element's attributes and text. A change goes into the parsed element and the
 * view at once; its start tag is written into the code a moment later (writeChangedTags()),
 * so a drag rewrites the code once per frame and not once per attribute. Only the start tags
 * that changed are rewritten: the rest of the code keeps its formatting. Template tags in values
 * and texts are written as they are (svg-template.js).
 */

import { state } from './state.js?v=2';
import { escapeText } from './xml.js?v=6';
import { escapeTextOutsideTemplateTags } from './template-tags.js?v=2';
import { parseStyle, formatStyle, formatMatrix } from './svg-values.js?v=3';
import { getStartTag, formatSvg } from './xml-write.js?v=3';
import { hasTemplateTags, TEMPLATE_SYNTAX, TEMPLATE_FORMAT_NOTE, TEMPLATE_STYLE_NOTE } from './svg-template.js?v=1';
import { showToast, FIX_ERROR_FIRST } from './util.js?v=3';
import { isSafeForView, getPlaceholderViewValue } from './view-safety.js?v=4';
import { setCode, addHistoryStep } from './history.js?v=5';
import { drawOverlay } from './overlay.js?v=5';
import { renderInspector } from './inspector.js?v=5';
import { getSnapshot, getMovedAttributes, getScaledAttributes, getParentMapping, getParentDelta, getChangeableAttributes } from './geometry.js?v=5';
import { isExampleViewShown } from './drawing-views.js?v=2';
import { renderDrawing } from './view.js?v=5';

const WRITE_DELAY = 50;                     // milliseconds before changed start tags go into the code
const MOVE_HISTORY_DELAY = 400;             // milliseconds of rest before key moves become an undo step
const TEXT_HISTORY_DELAY = 500;             // milliseconds of rest before typed text becomes an undo step

/**
 * Tells whether the code has an error, which stops every change on the canvas.
 * @returns {boolean} true when the code does not parse.
 */
export function hasCodeError() {
    return !!state.error;
}

/**
 * Tells the user that the error in the code has to be fixed first.
 * @returns {void}
 */
export function showFixErrorFirst() {
    showToast(FIX_ERROR_FIRST);
}

/**
 * Sets attributes of an element in the parsed drawing and the view; the start tag follows in
 * the code shortly. An event handler or javascript: address is not copied into the view, and a
 * reference that holds a template placeholder shows in the view as view-safety.js shows it.
 * @param {number} index - the element.
 * @param {Object<string, ?string>} attributes - name -> value; null or "" removes the attribute.
 * @returns {void}
 */
export function setAttributes(index, attributes) {
    const model = state.modelEls[index], view = state.viewEls[index];
    if (!model || state.error) return;
    for (const [name, value] of Object.entries(attributes)) {
        if (value == null || value === '') { model.removeAttribute(name); view && view.removeAttribute(name); continue; }
        model.setAttribute(name, value);
        if (!view) continue;
        const shown = getPlaceholderViewValue(view, name, value);
        if (shown !== null && isSafeForView(name, shown)) view.setAttribute(name, shown); else view.removeAttribute(name);
    }
    state.changedIndexes.add(index);
    if (!state.writeTimer) state.writeTimer = setTimeout(writeChangedTags, WRITE_DELAY);
}

/**
 * Writes the changed start tags into the code now. When the code and the parsed drawing do
 * not match one to one, the whole drawing is written tidied.
 * @returns {void}
 */
export function writeChangedTags() {
    clearTimeout(state.writeTimer);
    state.writeTimer = 0;
    if (!state.changedIndexes.size) return;
    const indexes = [...state.changedIndexes];
    state.changedIndexes.clear();
    if (!state.isMapped) { writeTidiedDrawing(); return; }
    let code = state.code;
    const bottomUp = indexes.map(index => state.scanEls[index]).filter(Boolean).sort((first, second) => second.start - first.start);
    for (const tag of bottomUp) {
        const written = code.slice(tag.start, tag.tagEnd);
        const lineIndent = /\n([ \t]+)\S/.exec(written);
        const newTag = getStartTag(state.modelEls[tag.index], tag.selfClose, lineIndent ? lineIndent[1] : null, TEMPLATE_SYNTAX);
        code = code.slice(0, tag.start) + newTag + code.slice(tag.tagEnd);
    }
    setCode(code, { reparse: false, history: false });
}

/**
 * Writes the whole drawing tidied, when the code and the parsed drawing do not match one to one;
 * a template keeps its code as written and the change stays on the canvas until the next reading.
 * @returns {void}
 */
function writeTidiedDrawing() {
    if (hasTemplateTags(state.code, TEMPLATE_SYNTAX)) { showToast(TEMPLATE_FORMAT_NOTE); return; }
    setCode(formatSvg(state.doc, state.code), { reparse: false, history: false });
}

/**
 * Ends a change: the code at once, an undo step, the properties anew. In the example view the
 * drawing is read again, so every element that stands for the changed one (a list repeats it)
 * shows the change.
 * @returns {void}
 */
export function applyChange() {
    writeChangedTags();
    addHistoryStep();
    if (isExampleViewShown()) renderDrawing();
    else renderInspector();
}

/**
 * Gives a shape a new box by scaling and shifting it.
 * @param {ShapeSnapshot} snapshot - the shape at the start.
 * @param {ShapeBox} box - the new box in root coordinates.
 * @param {string} [mode] - "resize" or "flip".
 * @returns {void}
 */
export function setBox(snapshot, box, mode = 'resize') {
    const start = snapshot.box;
    const scaleX = start.w ? box.w / start.w : 1, scaleY = start.h ? box.h / start.h : 1;
    const rootMapping = new DOMMatrix().translate(box.x, box.y).scale(scaleX, scaleY).translate(-start.x, -start.y);
    setAttributes(snapshot.index, getScaledAttributes(snapshot, getParentMapping(snapshot, rootMapping), mode));
}

/**
 * Moves the selected shape by a step (arrow keys); a pause makes the steps one undo step.
 * @param {number} dx - the step to the right in root units.
 * @param {number} dy - the step down in root units.
 * @returns {void}
 */
export function moveSelection(dx, dy) {
    if (state.sel <= 0) return;
    if (hasCodeError()) { showFixErrorFirst(); return; }
    const snapshot = getSnapshot(state.sel);
    const [parentDx, parentDy] = getParentDelta(snapshot, dx, dy);
    setAttributes(state.sel, getMovedAttributes(snapshot, parentDx, parentDy));
    drawOverlay();
    clearTimeout(state.historyTimer);
    state.historyTimer = setTimeout(applyChange, MOVE_HISTORY_DELAY);
}

/**
 * Rotates the selected shape around the center of its box.
 * @param {number} degrees - the angle, clockwise.
 * @returns {void}
 */
export function addRotation(degrees) {
    if (state.sel <= 0) return;
    if (hasCodeError()) { showFixErrorFirst(); return; }
    const snapshot = getSnapshot(state.sel);
    const box = snapshot.box;
    if (!box) return;
    const centerX = box.x + box.w / 2, centerY = box.y + box.h / 2;
    const rotation = new DOMMatrix().translate(centerX, centerY).rotate(degrees).translate(-centerX, -centerY);
    setAttributes(state.sel, getChangeableAttributes(snapshot, { transform: formatMatrix(getParentMapping(snapshot, rotation).multiply(snapshot.matrix)) || null }));
    applyChange();
    drawOverlay();
}

/**
 * Mirrors the selected shape at the center of its box.
 * @param {boolean} isHorizontal - true for left to right, false for top to bottom.
 * @returns {void}
 */
export function addMirror(isHorizontal) {
    if (state.sel <= 0) return;
    if (hasCodeError()) { showFixErrorFirst(); return; }
    const snapshot = getSnapshot(state.sel);
    const box = snapshot.box;
    if (!box) return;
    const centerX = box.x + box.w / 2, centerY = box.y + box.h / 2;
    const mirror = new DOMMatrix().translate(centerX, centerY).scale(isHorizontal ? -1 : 1, isHorizontal ? 1 : -1).translate(-centerX, -centerY);
    setAttributes(state.sel, getScaledAttributes(snapshot, getParentMapping(snapshot, mirror), 'flip'));
    applyChange();
    drawOverlay();
}

/* ---------- Colors and style ---------- */

/**
 * Returns a presentation property of an element as written: from its style attribute, else
 * from the attribute of that name.
 * @param {number} index - the element.
 * @param {string} property - e.g. "fill".
 * @returns {?string} the value, null when it is not set.
 */
export function getProperty(index, property) {
    const model = state.modelEls[index];
    const style = parseStyle(model.getAttribute('style'));
    if (style.has(property)) return style.get(property);
    return model.getAttribute(property);
}

/**
 * Returns the computed value of a property in the view.
 * @param {number} index - the element.
 * @param {string} property - e.g. "fill".
 * @returns {string} the value, "" when the element is not in the view.
 */
export function getComputedValue(index, property) {
    const view = state.viewEls[index];
    return view ? getComputedStyle(view).getPropertyValue(property) : '';
}

/**
 * Sets a presentation property where it is written: in the style attribute when it is set
 * there, else as an attribute. A style attribute that holds template placeholders stays as
 * written, and the editor says so.
 * @param {number} index - the element.
 * @param {string} property - e.g. "fill".
 * @param {?string} value - the value, null to remove it.
 * @returns {void}
 */
export function setProperty(index, property, value) {
    const written = state.modelEls[index].getAttribute('style');
    const style = parseStyle(written);
    if (!style.has(property)) { setAttributes(index, { [property]: value }); return; }
    if (hasTemplateTags(written, TEMPLATE_SYNTAX)) { showToast(TEMPLATE_STYLE_NOTE); return; }
    if (value == null) style.delete(property); else style.set(property, value);
    setAttributes(index, { style: style.size ? formatStyle(style) : null });
}

/**
 * Sets the text of an element without child elements, in the drawing, the view and the code;
 * a pause makes the typing one undo step.
 * @param {number} index - the element.
 * @param {string} text - the new text.
 * @returns {void}
 */
export function setText(index, text) {
    const model = state.modelEls[index], view = state.viewEls[index], tag = state.scanEls[index];
    if (!tag || model.children.length) return;
    writeChangedTags();
    model.textContent = text;
    if (view) view.textContent = text;
    let code = state.code;
    const written = escapeTextOutsideTemplateTags(text, TEMPLATE_SYNTAX, escapeText);
    if (tag.selfClose) code = code.slice(0, tag.start) + getStartTag(model, false, null, TEMPLATE_SYNTAX) + written + `</${model.tagName}>` + code.slice(tag.end);
    else code = code.slice(0, tag.inner[0]) + written + code.slice(tag.inner[1]);
    setCode(code, { reparse: false, history: false });
    clearTimeout(state.historyTimer);
    state.historyTimer = setTimeout(addHistoryStep, TEXT_HISTORY_DELAY);
}
