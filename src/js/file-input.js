/**
 * Drawings that come in from the user's computer: "Open file…" and dropped files become new
 * drawings in "My drawings"; SVG code pasted outside a field replaces the open drawing (Undo
 * takes it back). On Linux a click on the mouse wheel pastes the selected text; on the stage
 * it only pans, so that paste is ignored. The "Add xmlns" button of the error message adds the
 * missing namespace.
 */

import { state, elements } from './state.js?v=2';
import { findElement, showToast } from './util.js?v=3';
import { setCode } from './history.js?v=6';
import { createDocument } from './documents.js?v=6';

const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MIDDLE_BUTTON = 1;
const WHEEL_PASTE_TIME = 1500;              // milliseconds after a press of the wheel a paste is ignored
const DROP_CLASS = 'drop';
const DEFAULT_NAME = 'Drawing';
const PASTED_SVG = /^\s*(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i;
/** Fields where keys and paste belong to the field: a focused checkbox, slider or color picker does not count. */
export const TYPING = 'textarea, select, [contenteditable], input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=button])';

let fileInput = null;
/** How many drag enters wait for their leave while files are dragged over the page. */
let dragDepth = 0;

/**
 * Listens for the open button, dropped files, paste and the "Add xmlns" button.
 * @returns {void}
 */
export function startFileInput() {
    fileInput = findElement('#file');
    findElement('#btn-open').addEventListener('click', openFileDialog);
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) openFile(fileInput.files[0]); fileInput.value = ''; });
    window.addEventListener('dragenter', event => { if (event.dataTransfer.types.includes('Files')) { dragDepth++; document.body.classList.add(DROP_CLASS); event.preventDefault(); } });
    window.addEventListener('dragover', event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); });
    window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove(DROP_CLASS); } });
    window.addEventListener('drop', openDroppedFile);
    elements.stage.addEventListener('auxclick', event => { if (event.button === MIDDLE_BUTTON) event.preventDefault(); });
    window.addEventListener('paste', importPastedSvg);
    elements.error.addEventListener('click', event => {
        if (event.target.dataset.fix === 'xmlns') setCode(state.code.replace(/<svg(?=[\s>/])/, '<svg xmlns="http://www.w3.org/2000/svg"'));
    });
}

/**
 * Opens the browser's file chooser.
 * @returns {void}
 */
export function openFileDialog() {
    fileInput.click();
}

/**
 * Opens an SVG file as a new drawing; other files and files over 8 MB are refused.
 * @param {File} file - the file.
 * @returns {void}
 */
function openFile(file) {
    if (!/svg|xml|text/.test(file.type) && !/\.svgz?$|\.xml$|\.txt$/i.test(file.name)) { showToast('Please choose an SVG file'); return; }
    if (file.size > MAX_FILE_SIZE) { showToast('The file is larger than 8 MB'); return; }
    file.text().then(text => {
        if (createDocument(file.name.replace(/\.[^.]+$/, '') || DEFAULT_NAME, text)) showToast(`Opened "${file.name}" - it is now in "My drawings"`);
    });
}

/**
 * Opens a file dropped on the page.
 * @param {DragEvent} event - the drop event.
 * @returns {void}
 */
function openDroppedFile(event) {
    dragDepth = 0;
    document.body.classList.remove(DROP_CLASS);
    const file = event.dataTransfer.files[0];
    if (file) { event.preventDefault(); openFile(file); }
}

/**
 * Tells whether a paste comes from a press of the mouse wheel on the stage (Linux).
 * @returns {boolean} true shortly after such a press.
 */
function isWheelPaste() {
    return !!state.wheelClick && performance.now() - state.wheelClick.t < WHEEL_PASTE_TIME;
}

/**
 * Replaces the open drawing with SVG code pasted outside a field; a paste of the mouse wheel
 * is ignored and kept from other listeners.
 * @param {ClipboardEvent} event - the paste event.
 * @returns {void}
 */
function importPastedSvg(event) {
    if (isWheelPaste()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
    const active = document.activeElement;
    if (active && active.matches(TYPING)) return;
    const text = event.clipboardData.getData('text');
    if (!PASTED_SVG.test(text)) return;
    event.preventDefault();
    state.isFitted = false;
    setCode(text, { select: -1 });
    showToast('SVG pasted from the clipboard');
}
