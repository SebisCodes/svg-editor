/**
 * Reading the code and showing the drawing:
 *   1. parse the code (export.js) and find the places of its tags (xml.js); with a template
 *      syntax the browser reads the tags as text and the parsed drawing gets them back as
 *      written (svg-template.js), and a placeholder error counts as an error in the code;
 *   2. with an error: show it above the code and keep the last working view, marked stale;
 *   3. without: take the drawing to show (with a template syntax the example view or the
 *      template view, drawing-views.js), copy it, make the copy harmless (view-safety.js) and
 *      show it in the shadow root of the canvas, each element of the view led to its element of
 *      the code;
 *   4. fit the drawing when its size changed, then draw the code, the overlay, the properties,
 *      the layers and the controls of template placeholders.
 */

import { state, elements } from './state.js?v=2';
import { parseTags, escapeText } from './xml.js?v=6';
import { buildCheckedCode, getTemplateError, TEMPLATE_SYNTAX } from './svg-template.js?v=1';
import { setMarkedTags } from './template-markers.js?v=1';
import { parse, getNaturalSize } from './export.js?v=8';
import { disableActiveContent } from './view-safety.js?v=4';
import { renderCode } from './code-view.js?v=6';
import { resizeToFit, updatePaper } from './canvas.js?v=6';
import { drawOverlay } from './overlay.js?v=6';
import { updateHint } from './hint.js?v=3';
import { renderInspector, setInspectorRebuild } from './inspector.js?v=6';
import { renderTree } from './layers.js?v=6';
import { buildShownDrawing } from './drawing-views.js?v=2';
import { renderTemplateControls } from './template-panel.js?v=3';

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
    const checked = buildCheckedCode(state.code, TEMPLATE_SYNTAX);
    const result = parse(checked.text);
    state.scanEls = parseTags(checked.text);
    const error = result.error || getTemplateError(state.code, TEMPLATE_SYNTAX);
    if (error) { showStaleDrawing(error); return; }
    setMarkedTags(result.doc, checked.marking);
    state.error = null;
    showCodeError();
    updateHint();
    elements.stage.classList.remove(STALE_CLASS);
    state.doc = result.doc;
    const root = result.doc.documentElement;
    state.modelEls = [root, ...root.getElementsByTagName('*')];
    state.isMapped = state.modelEls.length === state.scanEls.length;
    const shown = buildShownDrawing(state.code, root, state.modelEls, state.scanEls);
    showView(shown);
    resizeToFitChanged(shown.root);
    if (select !== undefined) state.sel = select;
    if (state.sel >= state.modelEls.length || state.sel === 0) state.sel = -1;
    state.hoverIndex = -1;
    renderCode();
    drawOverlay();
    renderInspector();
    renderTree();
    renderTemplateControls();
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
 * Shows a harmless copy of the drawing to show in the shadow root. The copy is cleaned in the
 * parsed document, which loads and runs nothing; only then it goes into the page. Element i of
 * the code gets the first element of the view that stands for it (state.viewEls, null when none
 * does), and every element of the view the index of its element of the code (state.viewIndex);
 * the indexes are taken before the cleaning, which can empty an element.
 * @param {import('./drawing-views.js').ShownDrawing} shown - the drawing to show.
 * @returns {void}
 */
function showView(shown) {
    const copy = shown.root.cloneNode(true);
    const codeIndexByCopy = new Map([copy, ...copy.querySelectorAll('*')].map((element, index) => [element, shown.codeIndexes ? shown.codeIndexes[index] : index]));
    disableActiveContent(copy);
    const codeIndexes = [copy, ...copy.querySelectorAll('*')].map(element => codeIndexByCopy.get(element));
    const view = document.importNode(copy, true);
    view.classList.add('root');
    const style = document.createElement('style');
    style.textContent = SHADOW_CSS;
    elements.shadowRoot.replaceChildren(style, view);
    state.viewRoot = view;
    state.viewEls = state.modelEls.map(() => null);
    state.viewIndex = new WeakMap();
    [view, ...view.querySelectorAll('*')].forEach((element, index) => {
        const codeIndex = codeIndexes[index];
        state.viewIndex.set(element, codeIndex);
        if (!state.viewEls[codeIndex]) state.viewEls[codeIndex] = element;
    });
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
    const message = error.isTemplate ? `${escapeText(where.trimEnd())} <span>${escapeText(error.msg)}</span>` : escapeText(where + error.msg);
    elements.error.innerHTML = `<b>Error in the code.</b> ${message} <span class="muted">The preview shows the last working version.</span>`
        + (error.fix === 'xmlns' ? ' <button type="button" class="button small" data-fix="xmlns">Add xmlns</button>' : '');
}
