/**
 * The layout of the work area: the splitter between code and canvas (dragged or moved with
 * the arrow keys; stored as split), the panes on narrow screens, the side panel (a column on
 * the desktop, closed at the start) and its tabs, and the canvas that keeps the drawing fitted
 * whenever the stage changes size.
 */

import { state, elements } from './state.js?v=2';
import { findElement, findElements, getClamped } from './util.js?v=3';
import { resizeToFit, updatePaper } from './canvas.js?v=7';
import { saveState } from './autosave.js?v=7';

const MIN_SPLIT = 0.15;
const MAX_SPLIT = 0.85;
const SPLIT_STEP = 0.03;
const SPLIT_DIGITS = 4;

/**
 * Listens for the splitter, the pane and panel tabs, the side panel's button and the size of the stage.
 * @returns {void}
 */
export function startLayout() {
    const splitter = findElement('#splitter');
    splitter.addEventListener('pointerdown', event => startSplitDrag(splitter, event));
    splitter.addEventListener('keydown', event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        state.split = getClamped(state.split + (event.key === 'ArrowLeft' ? -SPLIT_STEP : SPLIT_STEP), MIN_SPLIT, MAX_SPLIT);
        updateSplit(); saveState();
    });
    findElements('[data-pane]').forEach(button => button.addEventListener('click', () => showPane(button)));
    findElements('[data-itab]').forEach(button => button.addEventListener('click', () => showPanelTab(button)));
    showSidePanel(false);
    findElement('#btn-panel').addEventListener('click', () => showSidePanel(elements.work.dataset.panel !== 'open'));
    new ResizeObserver(() => { if (state.viewRoot) { if (state.autoFit) resizeToFit(); else updatePaper(); } }).observe(elements.stage);
}

/**
 * Opens or closes the side panel's column.
 * @param {boolean} isOpen - true to open it.
 * @returns {void}
 */
export function showSidePanel(isOpen) {
    elements.work.dataset.panel = isOpen ? 'open' : 'closed';
    findElement('#btn-panel').setAttribute('aria-expanded', String(isOpen));
}

/**
 * Sets the share of the code in the space beside the canvas; the canvas gets the rest.
 * @returns {void}
 */
export function updateSplit() {
    elements.work.style.setProperty('--code-fr', state.split.toFixed(SPLIT_DIGITS) + 'fr');
    elements.work.style.setProperty('--view-fr', (1 - state.split).toFixed(SPLIT_DIGITS) + 'fr');
}

/**
 * Drags the splitter; the split is stored when it is let go.
 * @param {HTMLElement} splitter - the splitter.
 * @param {PointerEvent} event - the pointerdown event.
 * @returns {void}
 */
function startSplitDrag(splitter, event) {
    splitter.setPointerCapture(event.pointerId);
    const work = elements.work.getBoundingClientRect();
    const available = work.width - findElement('.inspector').offsetWidth - splitter.offsetWidth;
    /**
     * Moves the split to the pointer.
     * @param {PointerEvent} moveEvent - the pointermove event.
     * @returns {void}
     */
    const move = moveEvent => {
        state.split = getClamped((moveEvent.clientX - work.left) / available, MIN_SPLIT, MAX_SPLIT);
        updateSplit();
    };
    /**
     * Ends the drag and stores the split.
     * @returns {void}
     */
    const stop = () => { splitter.removeEventListener('pointermove', move); splitter.removeEventListener('pointerup', stop); saveState(); };
    splitter.addEventListener('pointermove', move);
    splitter.addEventListener('pointerup', stop);
}

/**
 * Shows a pane on narrow screens; the drawing pane fits the drawing.
 * @param {HTMLElement} button - the pane's tab.
 * @returns {void}
 */
function showPane(button) {
    elements.work.dataset.show = button.dataset.pane;
    findElements('[data-pane]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
    requestAnimationFrame(() => { if (button.dataset.pane === 'draw') { resizeToFit(); } });
}

/**
 * Shows a tab of the properties panel: Properties or Layers.
 * @param {HTMLElement} button - the tab.
 * @returns {void}
 */
function showPanelTab(button) {
    findElements('[data-itab]').forEach(tab => tab.setAttribute('aria-selected', String(tab === button)));
    findElement('#inspector-body').hidden = button.dataset.itab !== 'properties';
    findElement('#tree-wrap').hidden = button.dataset.itab !== 'structure';
}
