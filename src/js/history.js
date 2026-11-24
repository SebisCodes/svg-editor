/**
 * Setting the code and the undo history. Every change of the drawing ends in setCode(): it
 * writes the code into the field, reads it again (all of it, or only the places of the tags
 * when only start tags changed), adds an undo step and stores the drawing. Undo and redo keep
 * versions of the code (up to 300) with the element that was selected.
 */

import { state, elements } from './state.js?v=2';
import { parseCodeTags, TEMPLATE_SYNTAX } from './svg-template.js?v=1';
import { findElement, showToast } from './util.js?v=3';
import { renderCode } from './code-view.js?v=4';
import { renderDrawing } from './view.js?v=4';
import { saveState } from './autosave.js?v=4';
import { writeChangedTags } from './edits.js?v=4';

const HISTORY_LIMIT = 300;

/**
 * How setCode() handles the new code.
 * @typedef {Object} SetCodeOptions
 * @property {boolean} [reparse] - true (default) to read the whole drawing again; false when only start tags changed.
 * @property {boolean} [history] - true (default) to add an undo step.
 * @property {number} [select] - the element to select after reading, -1 for none.
 */

/**
 * Sets the code of the open drawing and shows it.
 * @param {string} code - the new code.
 * @param {SetCodeOptions} [options] - how to handle it.
 * @returns {void}
 */
export function setCode(code, { reparse = true, history = true, select } = {}) {
    // Typing still waiting for its undo step gets it first, so Undo after this change goes back to that text.
    if (history && state.historyTimer) { clearTimeout(state.historyTimer); state.historyTimer = 0; addHistoryStep(); }
    state.code = code;
    writeCodeField(code);
    if (reparse) renderDrawing(select);
    else { state.scanEls = parseCodeTags(code, TEMPLATE_SYNTAX); renderCode(); }
    if (history) addHistoryStep();
    saveState();
}

/**
 * Writes code into the code field and keeps its scroll position and, while it has focus, the
 * cursor.
 * @param {string} code - the code.
 * @returns {void}
 */
function writeCodeField(code) {
    const field = elements.ta;
    if (field.value === code) return;
    const scrollTop = field.scrollTop, scrollLeft = field.scrollLeft, selectionStart = field.selectionStart, selectionEnd = field.selectionEnd;
    field.value = code;
    field.scrollTop = scrollTop; field.scrollLeft = scrollLeft;
    if (document.activeElement === field) field.setSelectionRange(Math.min(selectionStart, code.length), Math.min(selectionEnd, code.length));
}

/**
 * Greys out Undo and Redo while there is nothing to undo or redo.
 * @returns {void}
 */
export function updateHistoryUi() {
    const last = state.history[state.history.length - 1];
    findElement('#btn-undo').disabled = !(state.history.length > 1 || (last && last.code !== state.code));
    findElement('#btn-redo').disabled = !state.future.length;
}

/**
 * Adds the current code as an undo step; the same code only updates the step's selection.
 * @returns {void}
 */
export function addHistoryStep() {
    const last = state.history[state.history.length - 1];
    if (last && last.code === state.code) { last.sel = state.sel; return; }
    state.history.push({ code: state.code, sel: state.sel });
    if (state.history.length > HISTORY_LIMIT) state.history.shift();
    state.future = [];
    updateHistoryUi();
}

/**
 * Goes back one step.
 * @returns {void}
 */
export function undo() {
    writeChangedTags();
    clearTimeout(state.historyTimer);
    if (state.history[state.history.length - 1]?.code !== state.code) addHistoryStep();
    if (state.history.length < 2) { showToast('Nothing to undo'); return; }
    state.future.push(state.history.pop());
    const step = state.history[state.history.length - 1];
    setCode(step.code, { history: false, select: step.sel });
}

/**
 * Goes forward one step.
 * @returns {void}
 */
export function redo() {
    const step = state.future.pop();
    if (!step) { showToast('Nothing to redo'); return; }
    state.history.push(step);
    setCode(step.code, { history: false, select: step.sel });
}
