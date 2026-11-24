/**
 * The open drawing among "My drawings": opening one (each keeps its own undo history while the
 * page is open), making a new one, starting the open one over, renaming and deleting, and the
 * New menu (a blank drawing, one from the example, or start over).
 */

import { state, services } from './state.js?v=2';
import { store } from './document-store.js?v=2';
import { createFiles } from './files.js?v=13';
import { START } from './samples.js?v=6';
import { openConfirmation } from './dialogs.js?v=5';
import { findElement, findElements, showToast } from './util.js?v=3';
import { setCode, addHistoryStep, updateHistoryUi } from './history.js?v=5';
import { resizeToFit } from './canvas.js?v=5';
import { saveState, setSavedCode } from './autosave.js?v=5';
import { writeChangedTags } from './edits.js?v=5';
import { hasParseTimer, stopParseTimer } from './code-input.js?v=5';
import { openFileDialog } from './file-input.js?v=5';

/** The <svg> tag of a new blank drawing. */
export const BLANK_ROOT = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">';
const DEFAULT_NAME = 'Drawing';
const STORAGE_FULL = 'The browser storage is full - delete or download drawings under "My drawings" first';

/** The undo history of each drawing opened in this page: id -> { history, future }. */
const fileHistories = new Map();

/**
 * Returns the code of an empty drawing.
 * @param {string} [root] - its <svg> start tag.
 * @returns {string} the code.
 */
export function getBlankCode(root = BLANK_ROOT) {
    return `${root}\n</svg>\n`;
}

/**
 * Sets up "My drawings" and the New menu.
 * @returns {void}
 */
export function startDocuments() {
    services.files = createFiles({
        current: () => { writeChangedTags(); return { id: state.fileId, name: state.name, code: state.code }; },
        open: openChosenDocument,
        create: addFromMenu,
        rename: renameDocument,
        removed: closeDeletedDocument,
        importFile: openFileDialog,
        toast: showToast,
    });
    startNewMenu();
}

/**
 * Shows the name of the open drawing at the folder button and in the New menu.
 * @returns {void}
 */
export function showFileName() {
    findElement('#file-name').textContent = state.name;
    findElement('#btn-files').title = `"${state.name}" is open. My drawings: open, rename, duplicate or delete your drawings (Ctrl+O)`;
    findElement('#new-restart b').textContent = `Start "${state.name}" over`;
}

/**
 * Opens a drawing from "My drawings". The drawing that is closed keeps its undo history and
 * the edits still waiting to be stored.
 * @param {string} id - the drawing's id.
 * @param {string} [code] - its code, read from the store when left out.
 * @returns {void}
 */
export function openDocument(id, code) {
    writeChangedTags();
    clearTimeout(state.historyTimer);
    if (hasParseTimer()) { stopParseTimer(); saveState(); }
    if (state.fileId) { addHistoryStep(); fileHistories.set(state.fileId, { history: state.history, future: state.future }); }
    code ??= store.code(id) ?? getBlankCode();
    state.fileId = id;
    state.name = store.getMeta(id)?.name || DEFAULT_NAME;
    setSavedCode(code);
    const kept = fileHistories.get(id);
    state.history = kept ? kept.history : [];
    state.future = kept ? kept.future : [];
    state.isFitted = false;
    setCode(code, { history: false, select: -1 });
    addHistoryStep();
    updateHistoryUi();
    state.autoFit = true;
    resizeToFit();
    showFileName();
    services.files.render();
}

/**
 * Creates a drawing in "My drawings" and opens it right away. A command that creates an item
 * and returns its id so the caller can go on with it.
 * @param {string} name - the wanted name.
 * @param {string} code - its code.
 * @param {boolean} [inMemory] - keep it in memory only (a page's drawing), never stored.
 * @returns {?string} the new drawing's id, null when the storage is full.
 */
export function createDocument(name, code, inMemory = false) {
    let id;
    try { id = store.create(name, code, inMemory); } catch (error) {
        showToast(STORAGE_FULL);
        return null;
    }
    openDocument(id, code);
    return id;
}

/**
 * Empties the open drawing after asking but keeps its <svg> tag (size, viewBox); Undo brings
 * it back.
 * @returns {Promise<void>} resolves when done or declined.
 */
async function resetDocument() {
    writeChangedTags();
    const rootTag = state.scanEls[0];
    const written = rootTag ? state.code.slice(rootTag.start, rootTag.tagEnd) : '';
    const root = rootTag && /^<svg[\s>]/i.test(written) ? written.replace(/\s*\/>$/, '>') : BLANK_ROOT;
    if (state.code === getBlankCode(root)) { showToast('This drawing is empty already'); return; }
    const askedForId = state.fileId;
    if (!await openConfirmation({
        title: `Start "${state.name}" over?`,
        text: 'Everything in this drawing is removed; its size stays. "Undo" brings it back as long as the page is open.',
        ok: 'Start over',
    })) return;
    if (state.fileId !== askedForId) return;                 // another document was opened while the question was open
    writeChangedTags();
    setCode(getBlankCode(root), { select: -1 });
    showToast(`"${state.name}" is empty now - "Undo" brings it back`);
}

/**
 * Opens the drawing chosen in "My drawings".
 * @param {string} id - the drawing's id.
 * @returns {void}
 */
function openChosenDocument(id) {
    openDocument(id);
    showToast(`"${state.name}" opened`);
}

/**
 * Renames a drawing; the open one shows its new name.
 * @param {string} id - the drawing's id.
 * @param {string} name - the new name.
 * @returns {void}
 */
function renameDocument(id, name) {
    try { store.write(id, { name }); } catch (error) { showToast('The browser storage is full'); return; }
    if (id !== state.fileId) return;
    state.name = name;
    showFileName();
    services.sync?.handleChange();
}

/**
 * Closes a deleted drawing when it is the open one: the most recent other drawing opens, or a
 * new blank one.
 * @param {string} id - the deleted drawing's id.
 * @returns {void}
 */
function closeDeletedDocument(id) {
    fileHistories.delete(id);
    if (id !== state.fileId) return;
    state.fileId = '';
    const next = store.getSorted()[0];
    if (next) openDocument(next.id);
    else createDocument(DEFAULT_NAME, getBlankCode());
}

/**
 * Runs an entry of the New menu.
 * @param {string} kind - "blank", "example" or "restart".
 * @returns {void}
 */
function addFromMenu(kind) {
    if (kind === 'restart') { resetDocument(); return; }
    const isExample = kind === 'example';
    if (createDocument(isExample ? START.name : DEFAULT_NAME, isExample ? START.code : getBlankCode())) showToast(`New drawing "${state.name}" - your other drawings are under "My drawings"`);
}

/**
 * Adds the drawing of the New menu entry that was clicked and closes the menu (a click handler).
 * @param {MouseEvent} event - the click in the menu.
 * @returns {void}
 */
function addFromMenuClick(event) {
    const entry = event.target.closest('[data-new]');
    if (!entry) return;
    applyNewMenuSwitch(false);
    addFromMenu(entry.dataset.new);
}

/**
 * Listens for the New button and its menu: the arrow keys move through it, Escape and a
 * click outside close it.
 * @returns {void}
 */
function startNewMenu() {
    const button = findElement('#btn-new'), menu = findElement('#new-menu');
    button.addEventListener('click', () => applyNewMenuSwitch());
    menu.addEventListener('click', addFromMenuClick);
    menu.addEventListener('keydown', event => {
        const entries = findElements('button', menu), position = entries.indexOf(document.activeElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); entries[(position + (event.key === 'ArrowDown' ? 1 : entries.length - 1)) % entries.length].focus(); }
        if (event.key === 'Escape') { event.stopPropagation(); applyNewMenuSwitch(false); button.focus(); }
    });
    document.addEventListener('pointerdown', event => { if (!menu.hidden && !event.target.closest('#new-menu, #btn-new')) applyNewMenuSwitch(false); });
}

/**
 * Opens or closes the New menu.
 * @param {boolean} [open] - true to open, false to close; switches when left out.
 * @returns {void}
 */
export function applyNewMenuSwitch(open = findElement('#new-menu').hidden) {
    const menu = findElement('#new-menu');
    menu.hidden = !open;
    findElement('#btn-new').setAttribute('aria-expanded', open);
    if (open) menu.querySelector('button').focus();
}

/**
 * Tells whether the New menu is open.
 * @returns {boolean} true while it is open.
 */
export function isNewMenuOpen() {
    return !findElement('#new-menu').hidden;
}
