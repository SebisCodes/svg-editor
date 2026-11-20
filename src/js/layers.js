/**
 * The Layers list: the front-most shape at the top, like the layers of a graphics program;
 * children follow their group, also front-most first. Each row selects its element and can
 * hide or show it (display="none"), move it one step forward or backward, duplicate or delete
 * it; a double-click renames it (sets its id). Dragging a row is in layers-drag.js.
 */

import { state, elements } from './state.js?v=2';
import { parseStyle, formatStyle } from './svg-values.js?v=3';
import { findElement, findElements, showToast, getHexColor } from './util.js?v=3';
import { addHistoryStep } from './history.js?v=3';
import { drawOverlay } from './overlay.js?v=3';
import { selectElement } from './selection.js?v=3';
import { hasCodeError, showFixErrorFirst, setAttributes, writeChangedTags, getComputedValue } from './edits.js?v=3';
import { removeSelection, copySelection, moveInDrawingOrder, FORWARD, BACKWARD } from './structure.js?v=3';
import { buildInspector } from './inspector.js?v=3';
import { LABELS, PAINTABLE, escapeHtml } from './labels.js?v=2';

const TEXT_PREVIEW_LENGTH = 24;
const ID_PATTERN = /^[A-Za-z_][\w.-]*$/;
const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7c2 0 3.7.7 5.1 1.6M22 12s-3.6 7-10 7c-2 0-3.7-.7-5.1-1.6"/><path d="m3 3 18 18"/></svg>';

/** What the buttons of a row do (the eye is handled apart). */
const ROW_ACTIONS = { up: () => moveInDrawingOrder(FORWARD), down: () => moveInDrawingOrder(BACKWARD), dup: copySelection, del: removeSelection };

/**
 * Listens for clicks, double-clicks and the pointer on the list.
 * @returns {void}
 */
export function startLayers() {
    const tree = elements.tree;
    tree.addEventListener('click', handleRowClick);
    tree.addEventListener('dblclick', event => {
        const row = event.target.closest('li[data-i]');
        if (row && event.target.closest('.choice')) renameLayer(row);
    });
}

/**
 * Listens for the pointer over the list: the row under it outlines its shape on the canvas.
 * Registered after the drag listeners of the rows.
 * @returns {void}
 */
export function startLayerHover() {
    const tree = elements.tree;
    tree.addEventListener('pointerover', event => {
        const row = event.target.closest('li[data-i]');
        const index = row ? +row.dataset.i : -1;
        if (index !== state.hoverIndex) { state.hoverIndex = index; drawOverlay(); }
    });
    tree.addEventListener('pointerleave', () => { state.hoverIndex = -1; drawOverlay(); });
}

/**
 * Returns the elements in the order of the list: front-most first, children after their group.
 * @returns {number[]} the element indexes.
 */
function getLayerOrder() {
    const indexes = new Map(state.modelEls.map((model, index) => [model, index]));
    const order = [];
    /**
     * Adds an element and, front-most first, its children.
     * @param {number} index - the element.
     * @returns {void}
     */
    const addWithChildren = index => {
        order.push(index);
        [...state.modelEls[index].children].reverse().forEach(child => { if (indexes.has(child)) addWithChildren(indexes.get(child)); });
    };
    if (state.modelEls.length) addWithChildren(0);
    return order;
}

/**
 * Returns how deep an element lies below the root.
 * @param {number} index - the element.
 * @returns {number} 0 for the root.
 */
function getDepth(index) {
    let depth = 0;
    for (let model = state.modelEls[index]; model && model !== state.doc.documentElement; model = model.parentElement) depth++;
    return depth;
}

/**
 * Tells whether an element is hidden with display="none", as attribute or style.
 * @param {number} index - the element.
 * @returns {boolean} true when hidden.
 */
function isHidden(index) {
    const model = state.modelEls[index];
    return model.getAttribute('display') === 'none' || parseStyle(model.getAttribute('style')).get('display') === 'none';
}

/**
 * Draws the list.
 * @returns {void}
 */
export function renderTree() {
    if (!state.doc) { elements.tree.innerHTML = ''; return; }
    elements.tree.innerHTML = getLayerOrder().map(getRowHtml).join('');
}

/**
 * Returns the row of an element: its color, name, id or class, and for shapes the buttons.
 * @param {number} index - the element.
 * @returns {string} the HTML.
 */
function getRowHtml(index) {
    const model = state.modelEls[index];
    const extra = model.id ? `#${model.id}` : model.getAttribute('class') ? '.' + model.getAttribute('class').split(/\s+/)[0] : '';
    const text = model.localName === 'text' || model.localName === 'title' ? ' “' + model.textContent.trim().slice(0, TEXT_PREVIEW_LENGTH) + '”' : '';
    const name = index === 0 ? 'Drawing' : LABELS[model.localName] || model.localName;
    const paint = index > 0 && PAINTABLE.has(model.localName) ? getHexColor(getComputedValue(index, 'fill')) || getHexColor(getComputedValue(index, 'stroke')) : null;
    const swatch = paint ? `<i class="swatch" style="background:${paint}"></i>` : '<i class="swatch empty"></i>';
    const hidden = index > 0 && isHidden(index);
    const className = [index === state.sel ? 'active' : '', hidden ? 'is-hidden' : ''].join(' ').trim();
    let html = `<li data-i="${index}" class="${className}" style="--t:${getDepth(index)}"${index > 0 ? ' draggable="true"' : ''}>`
       + `<button type="button" class="choice" data-i="${index}" title="&lt;${escapeHtml(model.tagName)}&gt; - click to select${index > 0 ? ', double-click to rename, drag to reorder' : ''}">${swatch}<b>${escapeHtml(name)}</b><span data-no-i18n>${escapeHtml(extra + text)}</span></button>`;
    if (index > 0) html += getRowButtonsHtml(name, hidden);
    return html + '</li>';
}

/**
 * Returns the buttons of a row: hide or show, forward, backward, duplicate, delete.
 * @param {string} name - the element's readable name.
 * @param {boolean} hidden - true when it is hidden.
 * @returns {string} the HTML.
 */
function getRowButtonsHtml(name, hidden) {
    return `<span class="layer-buttons">`
       + `<button type="button" class="item-button visibility" data-layer="eye" title="${hidden ? 'Show' : 'Hide'}" aria-label="${hidden ? 'Show' : 'Hide'} ${escapeHtml(name)}" aria-pressed="${hidden}">${hidden ? EYE_OFF : EYE}</button>`
       + `<button type="button" class="item-button" data-layer="up" title="One step forward" aria-label="Move ${escapeHtml(name)} forward">↑</button>`
       + `<button type="button" class="item-button" data-layer="down" title="One step backward" aria-label="Move ${escapeHtml(name)} backward">↓</button>`
       + `<button type="button" class="item-button" data-layer="dup" title="Duplicate" aria-label="Duplicate ${escapeHtml(name)}">⧉</button>`
       + `<button type="button" class="item-button danger" data-layer="del" title="Delete" aria-label="Delete ${escapeHtml(name)}">✕</button>`
       + `</span>`;
}

/**
 * Marks the row of the selection and scrolls it into view.
 * @returns {void}
 */
export function showTreeSelection() {
    findElements('li.active', elements.tree).forEach(row => row.classList.remove('active'));
    const row = findElement(`li[data-i="${state.sel}"]`, elements.tree);
    if (row) { row.classList.add('active'); row.scrollIntoView({ block: 'nearest' }); }
}

/**
 * Marks the row of the shape under the pointer on the canvas.
 * @param {number} index - the element, -1 for none.
 * @returns {void}
 */
export function showTreeHover(index) {
    findElements('li.hover', elements.tree).forEach(row => row.classList.remove('hover'));
    const row = index > 0 && findElement(`li[data-i="${index}"]`, elements.tree);
    if (row) row.classList.add('hover');
}

/**
 * Handles a click in the list: the name selects, a button runs its action.
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function handleRowClick(event) {
    const button = event.target.closest('[data-layer]');
    const row = event.target.closest('li[data-i]');
    if (!row) return;
    const index = +row.dataset.i;
    if (!button) { if (event.target.closest('.choice')) selectElement(index); return; }
    if (button.dataset.layer === 'eye') { applyHiddenSwitch(index); return; }
    if (state.sel !== index) selectElement(index);
    ROW_ACTIONS[button.dataset.layer]();
}

/**
 * Hides a shown element (display="none") or shows a hidden one, as one undo step.
 * @param {number} index - the element.
 * @returns {void}
 */
function applyHiddenSwitch(index) {
    if (index <= 0) return;
    if (hasCodeError()) { showFixErrorFirst(); return; }
    const model = state.modelEls[index];
    if (isHidden(index)) {
        if (model.getAttribute('display') === 'none') setAttributes(index, { display: null });
        const style = parseStyle(model.getAttribute('style'));
        if (style.get('display') === 'none') { style.delete('display'); setAttributes(index, { style: style.size ? formatStyle(style) : null }); }
    } else setAttributes(index, { display: 'none' });
    writeChangedTags();
    addHistoryStep();
    renderTree();
    drawOverlay();
    buildInspector();
}

/**
 * Turns the id of a row into a field to rename the element: Enter or leaving it sets the id,
 * Escape keeps it.
 * @param {HTMLLIElement} row - the row.
 * @returns {void}
 */
function renameLayer(row) {
    const index = +row.dataset.i;
    if (index <= 0 || state.error) return;
    const field = document.createElement('input');
    field.className = 'rename';
    field.value = state.modelEls[index].getAttribute('id') || '';
    field.placeholder = 'Name (id)';
    field.setAttribute('aria-label', 'Name of the element (id)');
    field.spellcheck = false;
    findElement('.choice span', row).replaceWith(field);
    row.draggable = false;
    field.focus();
    field.select();
    let isDone = false;
    /**
     * Ends the renaming once.
     * @param {boolean} keep - true to take the new id.
     * @returns {void}
     */
    const stopRenameEdit = keep => {
        if (isDone) return;
        isDone = true;
        if (keep) setLayerId(index, field.value.trim());
        renderTree();
    };
    field.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Enter') { event.preventDefault(); stopRenameEdit(true); }
        if (event.key === 'Escape') { event.preventDefault(); stopRenameEdit(false); }
    });
    field.addEventListener('blur', () => stopRenameEdit(true));
}

/**
 * Sets the id of an element as one undo step, when it changed and is valid and free.
 * @param {number} index - the element.
 * @param {string} id - the new id, "" to remove it.
 * @returns {void}
 */
function setLayerId(index, id) {
    if (id === (state.modelEls[index].getAttribute('id') || '')) return;
    if (id && !ID_PATTERN.test(id)) { showToast('Use letters, digits, - and _ only, starting with a letter'); return; }
    if (id && state.modelEls.some((model, other) => other !== index && model.getAttribute('id') === id)) { showToast(`The name “${id}” is already used`); return; }
    setAttributes(index, { id: id || null });
    writeChangedTags();
    addHistoryStep();
    buildInspector();
}
