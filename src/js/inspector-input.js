/**
 * What the fields and buttons of the properties panel do. Typing and sliding change the
 * drawing at once; leaving a field (change) makes the change an undo step. The colors for new
 * shapes are settings and are stored, not written into the drawing.
 */

import { state, elements } from './state.js?v=2';
import { findElement, showToast, getHexColor } from './util.js?v=3';
import { setCode } from './history.js?v=3';
import { drawOverlay } from './overlay.js?v=3';
import { saveState } from './autosave.js?v=3';
import { selectElement } from './selection.js?v=3';
import { getSnapshot, getMovedAttributes, getParentDelta } from './geometry.js?v=3';
import { setAttributes, writeChangedTags, applyChange, setBox, setProperty, getProperty, getComputedValue, setText, addRotation, addMirror } from './edits.js?v=3';
import { removeSelection, copySelection, moveInDrawingOrder, FORWARD, BACKWARD, TO_FRONT, TO_BACK } from './structure.js?v=3';
import { buildInspector, setInspectorRebuild } from './inspector.js?v=3';

const PERCENT = 100;
const ROTATION_STEP = 15;
const MIN_BOX_SIZE = 0.01;
const ATTRIBUTE_NAME = /^[A-Za-z_:][\w:.-]*$/;
const NONE_SUFFIX = '-none';
const TEXT_SUFFIX = '-text';

/** What the buttons with data-act do. */
const ACTIONS = {
    'rot-': () => addRotation(-ROTATION_STEP), 'rot+': () => addRotation(ROTATION_STEP),
    'flip-h': () => addMirror(true), 'flip-v': () => addMirror(false),
    front: () => moveInDrawingOrder(TO_FRONT), up: () => moveInDrawingOrder(FORWARD), down: () => moveInDrawingOrder(BACKWARD), back: () => moveInDrawingOrder(TO_BACK),
    dup: copySelection, del: removeSelection,
};

/**
 * Listens for the fields and buttons of the panel.
 * @returns {void}
 */
export function startInspectorInput() {
    const panel = elements.inspector;
    panel.addEventListener('input', updateFromInput);
    panel.addEventListener('change', applyFieldChange);
    panel.addEventListener('click', runButton);
    panel.addEventListener('toggle', event => { if (event.target.matches('details.attribute')) state.isAttributeListOpen = event.target.open; }, true);
    panel.addEventListener('submit', addAttributeFromForm);
}

/**
 * Returns the element the panel shows: the selection, else the root.
 * @returns {number} the element.
 */
function getPanelIndex() {
    return state.sel > 0 ? state.sel : 0;
}

/**
 * Changes the drawing while a field is typed in or a slider moves.
 * @param {InputEvent} event - the input event.
 * @returns {void}
 */
function updateFromInput(event) {
    const field = event.target;
    const index = getPanelIndex();
    if (!state.doc) return;
    if (field.dataset.k) { updatePropertyField(field, index); drawOverlay(); return; }
    if (field.dataset.attr != null) { setAttributes(index, { [field.dataset.attr]: field.value }); drawOverlay(); return; }
    if (field.dataset.text != null) { setText(index, field.value); drawOverlay(); return; }
    if (field.dataset.def) updateDefaultField(field);
}

/**
 * Sets a property from its field: an opacity slider (1 removes it), a color, a color as text,
 * or another field (empty removes it); selects wait for change.
 * @param {HTMLInputElement|HTMLSelectElement} field - the field with data-k.
 * @param {number} index - the element.
 * @returns {void}
 */
function updatePropertyField(field, index) {
    const key = field.dataset.k;
    if (field.type === 'range') {
        const output = field.parentNode.querySelector('output');
        if (output) output.textContent = Math.round(field.value * PERCENT) + '%';
        setProperty(index, key, field.value === '1' ? null : field.value);
    } else if (field.type === 'color') {
        setProperty(index, key, field.value);
        showPickedColor(field);
    } else if (key.endsWith(TEXT_SUFFIX)) {
        setProperty(index, key.slice(0, -TEXT_SUFFIX.length), field.value.trim() || null);
    } else if (field.tagName !== 'SELECT') {
        setProperty(index, key, field.value.trim() === '' ? null : field.value.trim());
    }
}

/**
 * Shows a picked color in its row: not None, the color as text.
 * @param {HTMLInputElement} field - the color field.
 * @returns {void}
 */
function showPickedColor(field) {
    const row = field.closest('.color');
    row.querySelector('.color-field').classList.remove('none');
    const noneButton = row.querySelector('[data-k$="-none"]');
    noneButton.classList.remove('on'); noneButton.setAttribute('aria-pressed', 'false');
    row.querySelector('.hex-value').value = field.value;
}

/**
 * Sets a color or the outline width for new shapes and stores it.
 * @param {HTMLInputElement} field - the field with data-def.
 * @returns {void}
 */
function updateDefaultField(field) {
    const key = field.dataset.def;
    if (key === 'fill' || key === 'stroke') {
        state.defaults[key] = field.value;
        const noneBox = findElement(`[data-def="${key}-none"]`, elements.inspector);
        if (noneBox) noneBox.checked = false;
    } else if (key === 'sw') state.defaults.sw = Math.max(0, +field.value || 0);
    else if (key.endsWith(NONE_SUFFIX)) {
        const paint = key.slice(0, -NONE_SUFFIX.length);
        state.defaults[paint] = field.checked ? 'none' : findElement(`[data-def="${paint}"]`, elements.inspector).value;
    }
    saveState();
}

/**
 * Ends the change of a field: a select, a box value, a size of the document, or any other
 * field becomes an undo step.
 * @param {Event} event - the change event.
 * @returns {void}
 */
function applyFieldChange(event) {
    const field = event.target;
    const index = getPanelIndex();
    if (!state.doc) return;
    if (field.tagName === 'SELECT' && field.dataset.k) {
        setProperty(index, field.dataset.k, field.value || null);
        applyChange();
        drawOverlay();
        return;
    }
    if (field.dataset.box) { setBoxValue(field, index); return; }
    if (field.dataset.root) {
        setAttributes(0, { [field.dataset.root]: field.value.trim() || null });
        writeChangedTags();
        setCode(state.code);
        return;
    }
    if (field.dataset.k || field.dataset.attr != null || field.dataset.text != null) {
        applyChange();
        if (field.dataset.attr != null) setCode(state.code, { select: state.sel });
    }
}

/**
 * Moves or resizes the shape to a value of its box (X, Y, W, H); a circle keeps its aspect
 * ratio.
 * @param {HTMLInputElement} field - the field with data-box.
 * @param {number} index - the element.
 * @returns {void}
 */
function setBoxValue(field, index) {
    const snapshot = getSnapshot(index);
    if (!snapshot.box) return;
    const box = { ...snapshot.box };
    const value = parseFloat(field.value);
    if (!isFinite(value)) return;
    const key = field.dataset.box;
    if (key === 'x' || key === 'y') {
        const delta = value - snapshot.box[key];
        const [parentDx, parentDy] = getParentDelta(snapshot, key === 'x' ? delta : 0, key === 'y' ? delta : 0);
        setAttributes(index, getMovedAttributes(snapshot, parentDx, parentDy));
    } else {
        box[key] = Math.max(MIN_BOX_SIZE, value);
        if (snapshot.tag === 'circle') { box.w = box.h = box[key]; }
        setBox(snapshot, box);
    }
    applyChange();
    drawOverlay();
}

/**
 * Runs a button of the panel: a step of the path, None, removing an attribute, or an action.
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function runButton(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const index = getPanelIndex();
    if (button.dataset.select) { selectElement(+button.dataset.select); return; }
    if (button.dataset.k && button.dataset.k.endsWith(NONE_SUFFIX)) { applyNoneSwitch(button, index); return; }
    if (button.dataset.delAttr) {
        setAttributes(index, { [button.dataset.delAttr]: null });
        writeChangedTags();
        setCode(state.code, { select: state.sel });
        return;
    }
    const action = button.dataset.act;
    if (!action) return;
    ACTIONS[action]();
    buildInspector();
}

/**
 * Switches a paint between None and a color; the color before None is remembered and comes
 * back when switching back.
 * @param {HTMLButtonElement} button - the None button.
 * @param {number} index - the element.
 * @returns {void}
 */
function applyNoneSwitch(button, index) {
    const property = button.dataset.k.slice(0, -NONE_SUFFIX.length);
    const isNone = button.getAttribute('aria-pressed') === 'true';
    const key = state.modelEls[index].localName + property;
    if (isNone) setProperty(index, property, state.lastPaints.get(key) || findElement(`input[type=color][data-k="${property}"]`, elements.inspector).value);
    else {
        const before = getHexColor(getProperty(index, property) || getComputedValue(index, property));
        if (before) state.lastPaints.set(key, before);
        setProperty(index, property, 'none');
    }
    applyChange();
    buildInspector();
    drawOverlay();
}

/**
 * Adds an attribute from the form at the end of the attribute list.
 * @param {SubmitEvent} event - the submit event.
 * @returns {void}
 */
function addAttributeFromForm(event) {
    event.preventDefault();
    const form = event.target;
    const name = form.n.value.trim(), value = form.v.value;
    if (!ATTRIBUTE_NAME.test(name)) { showToast('Invalid attribute name'); form.n.focus(); return; }
    try { setAttributes(getPanelIndex(), { [name]: value }); } catch (error) { showToast('The attribute could not be set'); return; }
    writeChangedTags();
    setInspectorRebuild();
    setCode(state.code, { select: state.sel });
    const nameField = findElement('[data-new-attr] input', elements.inspector);
    if (nameField) nameField.focus();
}
