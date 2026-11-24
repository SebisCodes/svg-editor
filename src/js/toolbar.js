/**
 * The bars of the editor: tools and zoom above the canvas, grid, snapping and background,
 * Tidy and Shrink above the code, Undo and Redo, Save, Copy, Help and the close buttons of the
 * dialogs.
 *
 * The grid button shows the grid and turns snapping on with it; the Snap checkbox next to it
 * turns snapping off without hiding the grid. No grid means no snapping.
 */

import { state, elements, services } from './state.js?v=2';
import { findElement, findElements, showToast, getSafeFileName, FIX_ERROR_FIRST, SVG_TYPE } from './util.js?v=3';
import { formatSvg, compressSvg } from './xml-write.js?v=3';
import { hasTemplateTags, TEMPLATE_SYNTAX, TEMPLATE_FORMAT_NOTE } from './svg-template.js?v=1';
import { saveDownload } from './export.js?v=8';
import { openDialog } from './dialogs.js?v=5';
import { setCode, undo, redo } from './history.js?v=5';
import { resizeToFit, setZoom, ZOOM_STEP } from './canvas.js?v=5';
import { drawOverlay } from './overlay.js?v=5';
import { updateHint } from './hint.js?v=3';
import { saveState } from './autosave.js?v=5';
import { writeChangedTags } from './edits.js?v=5';
import { setTool } from './tools.js?v=5';
import { openExportDialog } from './export-dialog.js?v=5';


let gridShow = null, gridSize = null, gridSnap = null, backgroundSelect = null;

/**
 * Listens for the buttons and fields of the bars above the canvas and the code.
 * @returns {void}
 */
export function startToolbar() {
    findElements('[data-tool]').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
    findElement('#zoom-in').addEventListener('click', () => setZoom(state.zoom * ZOOM_STEP));
    findElement('#zoom-out').addEventListener('click', () => setZoom(state.zoom / ZOOM_STEP));
    findElement('#zoom-fit').addEventListener('click', resizeToFit);
    findElement('#zoom-100').addEventListener('click', () => setZoom(1));
    startGrid();
    findElement('#btn-format').addEventListener('click', formatCode);
    findElement('#btn-minify').addEventListener('click', compressCode);
}

/**
 * Listens for the grid button, the Snap checkbox, the spacing and the background.
 * @returns {void}
 */
function startGrid() {
    gridShow = findElement('#grid-show');
    gridSize = findElement('#grid-size');
    gridSnap = findElement('#grid-snap');
    backgroundSelect = findElement('#bg');
    gridShow.addEventListener('click', applyGridSwitch);
    gridSnap.addEventListener('change', () => {
        state.grid.snap = gridSnap.checked;
        updateGridUi(); saveState(); updateHint();
        showToast(state.grid.snap ? 'Snap to grid: on' : 'Snap to grid: off - shapes move freely');
    });
    gridSize.addEventListener('input', () => {
        const size = parseFloat(gridSize.value);
        if (size > 0) { state.grid.size = size; drawOverlay(); saveState(); updateHint(); }
    });
    backgroundSelect.addEventListener('change', () => { state.bg = backgroundSelect.value; updateGridUi(); saveState(); });
}

/**
 * Shows or hides the grid; snapping follows it.
 * @returns {void}
 */
function applyGridSwitch() {
    state.grid.show = !state.grid.show;
    state.grid.snap = state.grid.show;
    updateGridUi(); drawOverlay(); saveState(); updateHint();
    showToast(state.grid.show ? 'Grid on - shapes snap to the grid' : 'Grid off');
}

/**
 * Turns snapping on or off like the Snap checkbox; without a grid the grid comes on (with
 * snapping). Key G.
 * @returns {void}
 */
export function applySnapSwitch() {
    if (!state.grid.show) { gridShow.click(); return; }
    gridSnap.checked = !gridSnap.checked;
    gridSnap.dispatchEvent(new Event('change'));
}

/**
 * Shows or hides the grid like its button. Key ' or #.
 * @returns {void}
 */
export function runGridButton() {
    gridShow.click();
}

/**
 * Shows the grid, snapping, spacing and background as they are set.
 * @returns {void}
 */
export function updateGridUi() {
    gridShow.setAttribute('aria-pressed', String(state.grid.show));
    gridSnap.checked = state.grid.show && state.grid.snap;
    gridSnap.disabled = !state.grid.show;
    gridSnap.closest('label').classList.toggle('off', !state.grid.show);
    gridSize.value = state.grid.size;
    backgroundSelect.value = state.bg;
    elements.paper.dataset.bg = state.bg;
}

/**
 * Tidies the code: one element per line, indented. A drawing with template placeholders keeps
 * its code as written.
 * @returns {void}
 */
function formatCode() {
    if (state.error) { showToast(FIX_ERROR_FIRST); return; }
    if (hasTemplateTags(state.code, TEMPLATE_SYNTAX)) { showToast(TEMPLATE_FORMAT_NOTE); return; }
    writeChangedTags();
    setCode(formatSvg(state.doc, state.code), { select: state.sel });
    showToast('Code tidied up');
}

/**
 * Shrinks the code: no comments, no white space between tags. A drawing with template
 * placeholders keeps its code as written.
 * @returns {void}
 */
function compressCode() {
    if (state.error) { showToast(FIX_ERROR_FIRST); return; }
    if (hasTemplateTags(state.code, TEMPLATE_SYNTAX)) { showToast(TEMPLATE_FORMAT_NOTE); return; }
    writeChangedTags();
    const before = new Blob([state.code]).size;
    const compressed = compressSvg(state.doc);
    setCode(compressed, { select: -1 });
    showToast(`File shrunk: ${before} → ${new Blob([compressed]).size} bytes`);
}

/**
 * Listens for "My drawings", Undo and Redo.
 * @returns {void}
 */
export function startActionButtons() {
    findElement('#btn-files').addEventListener('click', () => services.files.open());
    findElement('#btn-undo').addEventListener('click', undo);
    findElement('#btn-redo').addEventListener('click', redo);
}

/**
 * Listens for Export, Copy, Save, Help and the close buttons of the dialogs.
 * @returns {void}
 */
export function startDialogButtons() {
    findElement('#btn-export').addEventListener('click', openExportDialog);
    findElement('#btn-copy').addEventListener('click', copyCode);
    findElement('#btn-download').addEventListener('click', saveOrDownload);
    findElements('dialog [data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
    findElements('dialog').forEach(dialog => dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); }));
    findElement('#btn-help').addEventListener('click', () => openDialog(findElement('#help')));
}

/**
 * Copies the code to the clipboard; where the clipboard is not allowed, with the copy command.
 * @returns {Promise<void>} resolves when copied.
 */
async function copyCode() {
    writeChangedTags();
    try { await navigator.clipboard.writeText(state.code); } catch (error) { elements.ta.select(); document.execCommand('copy'); }
    showToast('Code copied');
}

/**
 * Saves the drawing: to the user's server or the page around the editor when one is set up,
 * else as a download. Save button and Ctrl+S.
 * @returns {void}
 */
export function saveOrDownload() {
    writeChangedTags();
    if (services.sync && services.sync.isActive()) { services.sync.save(); return; }
    saveDownload(state.code, `${getSafeFileName(state.name)}.svg`, SVG_TYPE);
    showToast('SVG downloaded');
}
