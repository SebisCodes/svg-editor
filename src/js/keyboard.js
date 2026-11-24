/**
 * The keyboard shortcuts of the editor. Ctrl+S, Ctrl+E (outside fields) and Ctrl+O work
 * everywhere; the others pause while typing into a field or while a dialog is open:
 *   Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo, Ctrl+D duplicates, Ctrl+↑/↓ (with Shift: all
 *   the way) change the drawing order, Delete removes, the arrows move (Shift: 10 units, else
 *   a grid step or 1), Escape goes back to the select tool or clears the selection, + - 0 1
 *   zoom, ' or # the grid, G snapping, ? the help, V H R E L P T the tools, and the space bar
 *   held pans.
 */

import { state, elements, services } from './state.js?v=2';
import { findElement } from './util.js?v=3';
import { openDialog } from './dialogs.js?v=5';
import { undo, redo } from './history.js?v=5';
import { resizeToFit, setZoom, ZOOM_STEP } from './canvas.js?v=5';
import { moveSelection } from './edits.js?v=5';
import { removeSelection, copySelection, moveInDrawingOrder, FORWARD, BACKWARD, TO_FRONT, TO_BACK } from './structure.js?v=5';
import { selectElement } from './selection.js?v=5';
import { setTool } from './tools.js?v=5';
import { saveOrDownload, applySnapSwitch, runGridButton } from './toolbar.js?v=5';
import { openExportDialog } from './export-dialog.js?v=5';
import { applyNewMenuSwitch, isNewMenuOpen } from './documents.js?v=5';
import { TYPING } from './file-input.js?v=5';

const BIG_STEP = 10;
const HAND_CLASS = 'hand';
/** The tool of each tool key. */
const TOOL_KEYS = { v: 'select', h: 'hand', r: 'rect', e: 'ellipse', l: 'line', p: 'pen', t: 'text' };

/**
 * Listens for the keys of the editor and the space bar.
 * @returns {void}
 */
export function startKeyboard() {
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', event => { if (event.key === ' ') stopSpacePan(); });
    window.addEventListener('blur', stopSpacePan);
}

/**
 * Ends panning with the space bar.
 * @returns {void}
 */
function stopSpacePan() {
    state.isSpaceDown = false;
    elements.stage.classList.remove(HAND_CLASS);
}

/**
 * Routes a key to its shortcut (the list at the top).
 * @param {KeyboardEvent} event - the keydown event.
 * @returns {void}
 */
function handleKey(event) {
    const active = document.activeElement;
    const isTyping = active && active.matches(TYPING);
    const withModifier = event.ctrlKey || event.metaKey;
    if (withModifier && event.key === 's') { event.preventDefault(); saveOrDownload(); return; }
    if (withModifier && event.key === 'e' && !isTyping) { event.preventDefault(); openExportDialog(); return; }
    if (withModifier && event.key === 'o') { event.preventDefault(); services.files.open(); return; }
    if (event.key === 'Escape' && isNewMenuOpen()) { applyNewMenuSwitch(false); return; }
    if (isTyping || findElement('dialog[open]')) return;
    if (withModifier) { runModifierKey(event); return; }
    runPlainKey(event);
}

/**
 * Runs a shortcut with Ctrl (or ⌘): undo, redo, duplicate, drawing order.
 * @param {KeyboardEvent} event - the keydown event.
 * @returns {void}
 */
function runModifierKey(event) {
    if (event.key === 'z' || event.key === 'Z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (event.key === 'y') { event.preventDefault(); redo(); return; }
    if (event.key === 'd') { event.preventDefault(); copySelection(); return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); moveInDrawingOrder(event.shiftKey ? TO_FRONT : FORWARD); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); moveInDrawingOrder(event.shiftKey ? TO_BACK : BACKWARD); }
}

/**
 * Runs a shortcut without Ctrl: pan, delete, Escape, move, zoom, grid, help, tools.
 * @param {KeyboardEvent} event - the keydown event.
 * @returns {void}
 */
function runPlainKey(event) {
    const key = event.key;
    if (key === ' ' && !state.isSpaceDown) { state.isSpaceDown = true; elements.stage.classList.add(HAND_CLASS); event.preventDefault(); return; }
    if ((key === 'Delete' || key === 'Backspace') && state.sel > 0) { event.preventDefault(); removeSelection(); return; }
    if (key === 'Escape') { if (state.tool !== 'select') setTool('select'); else selectElement(-1); return; }
    if (key.startsWith('Arrow') && state.sel > 0) { event.preventDefault(); moveWithArrow(event); return; }
    if (key === '+' || key === '=') { setZoom(state.zoom * ZOOM_STEP); return; }
    if (key === '-') { setZoom(state.zoom / ZOOM_STEP); return; }
    if (key === '0') { resizeToFit(); return; }
    if (key === '1') { setZoom(1); return; }
    if (key === "'" || key === '#') { runGridButton(); return; }
    if (key === 'g' || key === 'G') { applySnapSwitch(); return; }
    if (key === '?') { openDialog(findElement('#help')); return; }
    const tool = TOOL_KEYS[key.toLowerCase()];
    if (tool && !event.altKey) setTool(tool);
}

/**
 * Moves the selected shape with an arrow key: Shift 10 units, else a grid step while snapping,
 * else 1.
 * @param {KeyboardEvent} event - the keydown event of an arrow.
 * @returns {void}
 */
function moveWithArrow(event) {
    const step = event.shiftKey ? BIG_STEP : state.grid.snap ? state.grid.size : 1;
    const key = event.key;
    moveSelection(key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : 0, key === 'ArrowUp' ? -step : key === 'ArrowDown' ? step : 0);
}
