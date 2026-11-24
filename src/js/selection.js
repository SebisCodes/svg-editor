/**
 * The selection: choosing an element (the canvas, the code and the layers show it) and
 * finding the element a pointer hits. A tspan belongs to its text and content in other
 * namespaces (HTML in a foreignObject) to its foreignObject; the root is never selected.
 */

import { state, elements } from './state.js?v=2';
import { SVGNS } from './xml.js?v=6';
import { updateHint } from './hint.js?v=3';
import { renderMarks, showInCode } from './code-view.js?v=7';
import { drawOverlay } from './overlay.js?v=7';
import { renderInspector } from './inspector.js?v=7';
import { showTreeSelection } from './layers.js?v=7';

/**
 * Selects an element and shows it everywhere; the current undo step remembers it.
 * @param {number} index - the element, -1 (or 0, the root) for none.
 * @param {Object} [options] - how to select.
 * @param {boolean} [options.reveal] - false keeps the code field where it is.
 * @returns {void}
 */
export function selectElement(index, { reveal = true } = {}) {
    if (index === 0) index = -1;
    state.sel = index;
    updateHint();
    renderMarks();
    drawOverlay();
    renderInspector();
    showTreeSelection();
    if (reveal && index > 0) showInCode(index);
    const step = state.history[state.history.length - 1];
    if (step && step.code === state.code) step.sel = index;
}

/**
 * Returns the selectable element for a node of the view: the nearest SVG element that is not
 * a tspan or textPath.
 * @param {Node} node - a node of the view.
 * @returns {number} the element's index, -1 when there is none.
 */
export function getSelectableIndex(node) {
    let element = node;
    while (element && element !== state.viewRoot) {
        if (element.namespaceURI === SVGNS && !/^(tspan|textPath)$/.test(element.localName)) break;
        element = element.parentNode;
    }
    if (!element || element === state.viewRoot || !state.viewIndex.has(element)) return -1;
    return state.viewIndex.get(element);
}

/**
 * Tells whether an element lies inside another.
 * @param {number} index - the element.
 * @param {number} ancestorIndex - the possible ancestor.
 * @returns {boolean} true when it lies inside.
 */
export function isInsideElement(index, ancestorIndex) {
    for (let parent = state.scanEls[index] ? state.scanEls[index].parent : -1; parent >= 0; parent = state.scanEls[parent].parent) if (parent === ancestorIndex) return true;
    return false;
}

/**
 * Returns the element a pointer event hit.
 * @param {Event} event - the pointer event.
 * @returns {number} the selectable element, -1 for none.
 */
export function getHitIndex(event) {
    for (const node of event.composedPath()) {
        if (node === elements.stage) break;
        if (node.nodeType === 1 && state.viewIndex.has(node)) return getSelectableIndex(node);
    }
    return -1;
}

/**
 * Returns the node of the view at a screen point, below the touch grip (a tspan, if the text
 * is made of several). The grip is hidden while looking and shown again afterwards.
 * @param {number} x - the screen x.
 * @param {number} y - the screen y.
 * @returns {?Element} the node of the view, or null.
 */
export function getViewElementAt(x, y) {
    elements.grip.hidden = true;
    const node = elements.shadowRoot.elementFromPoint(x, y);
    elements.grip.hidden = false;
    return node;
}
