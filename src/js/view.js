/**
 * Reading the code and showing the drawing:
 *   1. parse the code (export.js) and find the places of its tags (xml.js);
 *   2. with an error: show it above the code and keep the last working view, marked stale;
 *   3. without: copy the parsed drawing, make the copy harmless (view-safety.js) and show it
 *      in the shadow root of the canvas;
 *   4. fit the drawing when its size changed, then draw the code, the overlay, the properties
 *      and the layers.
 */

import { state, elements } from './state.js?v=2';
import { parseTags, escapeText } from './xml.js?v=5';
import { parse, getNaturalSize } from './export.js?v=6';
import { disableActiveContent } from './view-safety.js?v=2';
import { renderCode } from './code-view.js?v=3';
import { resizeToFit, updatePaper } from './canvas.js?v=3';
import { drawOverlay } from './overlay.js?v=3';
import { updateHint } from './hint.js?v=3';
import { renderInspector, setInspectorRebuild } from './inspector.js?v=3';
import { renderTree } from './layers.js?v=3';

const SIZE_TOLERANCE = 0.01;
const STALE_CLASS = 'stale';
/** The view fills the paper, whatever size or position the drawing's root asks for. */
const SHADOW_CSS = `:host{all:initial;display:block;width:100%;height:100%}
.root{display:block;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;position:static!important;transform:none!important}`;

/**
 * Reads the code and shows the drawing, or the error in the code.
 * @param {number} [select] - the element to select afterwards, -1 for none; the selection stays when left out.
 * @returns {void}
 */
export function renderDrawing(select) {
    const result = parse(state.code);
    state.scanEls = parseTags(state.code);
    if (result.error) { showStaleDrawing(result.error); return; }
    state.error = null;
    showCodeError();
    updateHint();
    elements.stage.classList.remove(STALE_CLASS);
    state.doc = result.doc;
    const root = result.doc.documentElement;
    state.modelEls = [root, ...root.getElementsByTagName('*')];
    state.isMapped = state.modelEls.length === state.scanEls.length;
    showView(root);
    resizeToFitChanged(root);
    if (select !== undefined) state.sel = select;
    if (state.sel >= state.modelEls.length || state.sel === 0) state.sel = -1;
    state.hoverIndex = -1;
    renderCode();
    drawOverlay();
    renderInspector();
    renderTree();
}

/**
 * Shows an error in the code; the canvas keeps the last working view, marked stale.
 * @param {CodeError} error - the error.
 * @returns {void}
 */
function showStaleDrawing(error) {
    state.error = error;
    showCodeError();
    renderCode();
    elements.stage.classList.add(STALE_CLASS);
    setInspectorRebuild();
    renderInspector();
    drawOverlay();
    updateHint();
}

/**
 * Shows a harmless copy of the parsed drawing in the shadow root. The copy is cleaned in the
 * parsed document, which loads and runs nothing; only then it goes into the page.
 * @param {Element} root - the root of the parsed drawing.
 * @returns {void}
 */
function showView(root) {
    const copy = root.cloneNode(true);
    disableActiveContent(copy);
    const view = document.importNode(copy, true);
    view.classList.add('root');
    const style = document.createElement('style');
    style.textContent = SHADOW_CSS;
    elements.shadowRoot.replaceChildren(style, view);
    state.viewRoot = view;
    state.viewEls = [view, ...view.querySelectorAll('*')];
    state.viewIndex = new WeakMap(state.viewEls.map((element, index) => [element, index]));
}

/**
 * Fits the drawing into the stage when it was not fitted yet, its size changed or it stays
 * fitted; otherwise only lays out the paper.
 * @param {Element} root - the root of the parsed drawing.
 * @returns {void}
 */
function resizeToFitChanged(root) {
    const natural = getNaturalSize(root);
    const isChanged = Math.abs(natural.w - state.naturalSize.w) > SIZE_TOLERANCE || Math.abs(natural.h - state.naturalSize.h) > SIZE_TOLERANCE;
    state.naturalSize = natural;
    if (!state.isFitted || isChanged || state.autoFit) { resizeToFit(); state.isFitted = true; } else updatePaper();
}

/**
 * Shows the error in the code above the code field, or hides the message.
 * @returns {void}
 */
export function showCodeError() {
    const error = state.error;
    elements.error.hidden = !error;
    if (!error) return;
    const where = error.line ? `Line ${error.line}${error.col ? ', column ' + error.col : ''}: ` : '';
    elements.error.innerHTML = `<b>Error in the code.</b> ${escapeText(where + error.msg)} <span class="muted">The preview shows the last working version.</span>`
        + (error.fix === 'xmlns' ? ' <button type="button" class="button small" data-fix="xmlns">Add xmlns</button>' : '');
}
