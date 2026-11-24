/**
 * The "My drawings" dialog: the drawings of this browser (document-store.js) as cards with a
 * picture, to search, open, rename, duplicate, download and delete, and all of them as a ZIP.
 * The editor works on one drawing at a time; createFiles() takes what the editor does
 * (filesEditor) and returns open() and render() for the editor.
 */

import { openDialog, openConfirmation } from './dialogs.js?v=5';
import { createZip } from './zip.js?v=4';
import { saveDownload } from './export.js?v=7';
import { store, LIST_KEY } from './document-store.js?v=2';
import { getSafeFileName, SVG_TYPE } from './util.js?v=3';

/** The drawings of this browser, also reachable through this file (the review test imports it from here). */
export { store };

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;
const SECONDS_PER_TWO_DAYS = 172800;
const BYTES_PER_KB = 1024;
const ONE_DECIMAL_LIMIT = 10240;            // bytes up to which sizes show one decimal
const ZIP_NAME = 'svg-drawings.zip';

/** The paths of the icons on the cards' buttons. */
const ICONS = {
    rename: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    download: '<path d="M12 4v11m-5-5 5 5 5-5M5 20h14"/>',
    delete: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
};

/**
 * What the dialog asks of the editor.
 * @typedef {Object} FilesEditor
 * @property {function(): {id: string, name: string, code: string}} current - the open drawing, with its edits.
 * @property {function(string): void} open - opens a drawing.
 * @property {function(string): void} create - "blank" makes a new drawing.
 * @property {function(string, string): void} rename - renames a drawing.
 * @property {function(string): void} removed - a drawing was deleted.
 * @property {function(): void} importFile - opens the file chooser.
 * @property {function(string): void} toast - shows a short message.
 */

/**
 * What createFiles() returns.
 * @typedef {Object} FilesDialog
 * @property {function(): void} open - opens the dialog.
 * @property {function(): void} render - redraws the cards while the dialog is open.
 */

/** @type {FilesEditor} */
let filesEditor = null;
let dialog = null, grid = null, search = null, info = null;

/**
 * Returns how long ago a time was, for the cards.
 * @param {number} time - the time in milliseconds since the epoch.
 * @returns {string} e.g. "5 min ago", "yesterday" or a date.
 */
function getTimeAgo(time) {
    const seconds = (Date.now() - time) / MS_PER_SECOND;
    if (seconds < SECONDS_PER_MINUTE) return 'just now';
    if (seconds < SECONDS_PER_HOUR) return `${Math.floor(seconds / SECONDS_PER_MINUTE)} min ago`;
    if (seconds < SECONDS_PER_DAY) return `${Math.floor(seconds / SECONDS_PER_HOUR)} h ago`;
    if (seconds < SECONDS_PER_TWO_DAYS) return 'yesterday';
    return new Date(time).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Returns a size in bytes or KB.
 * @param {number} bytes - the size.
 * @returns {string} e.g. "512 bytes" or "3.4 KB".
 */
function getSizeText(bytes) {
    return bytes < BYTES_PER_KB ? `${bytes} bytes` : `${(bytes / BYTES_PER_KB).toFixed(bytes < ONE_DECIMAL_LIMIT ? 1 : 0)} KB`;
}

/**
 * Returns the HTML of an icon.
 * @param {string} key - the icon's key in ICONS.
 * @returns {string} the SVG.
 */
function getIconHtml(key) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[key]}</svg>`;
}

/**
 * Returns the code of a drawing; the open one with its edits.
 * @param {string} id - the drawing's id.
 * @returns {string} the code, "" when there is none.
 */
function getDrawingCode(id) {
    const current = filesEditor.current();
    return id === current.id ? current.code : store.code(id) || '';
}

/**
 * Draws the cards of the drawings that match the search, and the count below.
 * @returns {void}
 */
function renderCards() {
    const current = filesEditor.current();
    const all = store.getSorted();
    const query = search.value.trim().toLowerCase();
    const shown = query ? all.filter(entry => entry.name.toLowerCase().includes(query)) : all;
    grid.replaceChildren(...shown.map(entry => createCard(entry, entry.id === current.id ? current.code : store.code(entry.id) || '', entry.id === current.id)));
    if (!shown.length) {
        const empty = document.createElement('p');
        empty.className = 'muted file-empty';
        empty.textContent = query ? `No drawing named "${search.value.trim()}".` : 'No drawings yet.';
        grid.append(empty);
    }
    const total = all.reduce((sum, entry) => sum + (entry.size || 0), 0);
    info.textContent = `${all.length} ${all.length === 1 ? 'drawing' : 'drawings'} · ${getSizeText(total)} in this browser`;
}

/**
 * Creates the card of a drawing.
 * @param {DocumentEntry} entry - the drawing.
 * @param {string} code - its code, for the picture.
 * @param {boolean} isCurrent - true for the open drawing.
 * @returns {HTMLLIElement} the card.
 */
function createCard(entry, code, isCurrent) {
    const card = document.createElement('li');
    card.className = 'file-card' + (isCurrent ? ' current' : '');
    card.dataset.id = entry.id;
    card.innerHTML = `<button type="button" class="file-open"><span class="file-picture"><img alt="" loading="lazy"></span></button>
            <div class="file-text"><span class="file-name" data-no-i18n></span><span class="file-info muted"></span></div>
            <div class="file-buttons">
                <button type="button" class="item-button" data-act="rename" title="Rename" aria-label="Rename">${getIconHtml('rename')}</button>
                <button type="button" class="item-button" data-act="copy" title="Duplicate" aria-label="Duplicate">${getIconHtml('copy')}</button>
                <button type="button" class="item-button" data-act="download" title="Download as .svg" aria-label="Download">${getIconHtml('download')}</button>
                <button type="button" class="item-button danger" data-act="delete" title="Delete" aria-label="Delete">${getIconHtml('delete')}</button>
            </div>`;
    card.title = isCurrent ? 'This drawing is open' : 'Click to open this drawing';
    const picture = card.querySelector('img');
    picture.addEventListener('error', () => card.querySelector('.file-picture').classList.add('broken'));
    picture.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(code);
    card.querySelector('.file-name').textContent = entry.name;
    card.querySelector('.file-open').setAttribute('aria-label', isCurrent ? `${entry.name} (open now)` : `Open ${entry.name}`);
    card.querySelector('.file-info').textContent = isCurrent ? `Open now · ${getSizeText(entry.size || 0)}` : `${getTimeAgo(entry.updated)} · ${getSizeText(entry.size || 0)}`;
    return card;
}

/**
 * Turns the name of a card into a field to rename the drawing: Enter or leaving it renames,
 * Escape keeps the name.
 * @param {HTMLLIElement} card - the card.
 * @returns {void}
 */
function startRename(card) {
    const id = card.dataset.id;
    const field = document.createElement('input');
    field.className = 'file-rename';
    field.value = store.getMeta(id)?.name || '';
    field.setAttribute('aria-label', 'New name');
    card.querySelector('.file-name').replaceWith(field);
    field.focus();
    field.select();
    let isDone = false;
    /**
     * Ends the renaming once.
     * @param {boolean} keep - true to take the new name.
     * @returns {void}
     */
    const stopRenameEdit = keep => {
        if (isDone) return;
        isDone = true;
        const name = field.value.trim();
        if (keep && name) filesEditor.rename(id, store.getUniqueName(name, id));
        renderCards();
        grid.querySelector(`[data-id="${id}"] .file-open`)?.focus();
    };
    field.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); stopRenameEdit(true); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stopRenameEdit(false); }
    });
    field.addEventListener('blur', () => stopRenameEdit(true));
}

/**
 * Handles a click on a card: open, rename, duplicate, download or delete.
 * @param {MouseEvent} event - the click.
 * @returns {Promise<void>} resolves when the action is done.
 */
async function handleCardClick(event) {
    const card = event.target.closest('.file-card');
    if (!card) return;
    const id = card.dataset.id;
    const entry = store.getMeta(id);
    if (!entry) { renderCards(); return; }
    const action = event.target.closest('[data-act]')?.dataset.act;
    if (!action && !event.target.closest('input')) {
        dialog.close();
        if (id !== filesEditor.current().id) filesEditor.open(id);
    } else if (action === 'rename') startRename(card);
    else if (action === 'copy') copyDrawing(entry);
    else if (action === 'download') saveDownload(getDrawingCode(id), `${getSafeFileName(entry.name)}.svg`, SVG_TYPE);
    else if (action === 'delete') await removeDrawing(entry);
}

/**
 * Makes a copy of a drawing under a free name.
 * @param {DocumentEntry} entry - the drawing.
 * @returns {void}
 */
function copyDrawing(entry) {
    try {
        store.create(store.getUniqueName(entry.name + ' copy'), getDrawingCode(entry.id));
        filesEditor.toast(`"${entry.name}" duplicated`);
    } catch (error) { filesEditor.toast('The browser storage is full - delete or download some drawings first'); }
    renderCards();
}

/**
 * Deletes a drawing after asking.
 * @param {DocumentEntry} entry - the drawing.
 * @returns {Promise<void>} resolves when it is deleted or the user said no.
 */
async function removeDrawing(entry) {
    const isConfirmed = await openConfirmation({
        title: `Delete "${entry.name}"?`,
        text: 'The drawing is removed from this browser for good. Download it first if you want to keep a copy.',
        ok: 'Delete',
    });
    openDialog(dialog);
    if (!isConfirmed) return;
    store.remove(entry.id);
    filesEditor.removed(entry.id);
    filesEditor.toast(`"${entry.name}" deleted`);
    renderCards();
}

/**
 * Downloads every drawing in one ZIP; equal file names get a number.
 * @returns {Promise<void>} resolves when the download started.
 */
async function saveAllAsZip() {
    const current = filesEditor.current();
    const used = new Set();
    const zipFiles = [];
    for (const entry of store.getSorted()) {
        let name = getSafeFileName(entry.name);
        for (let number = 2; used.has(name.toLowerCase()); number++) name = `${getSafeFileName(entry.name)}-${number}`;
        used.add(name.toLowerCase());
        zipFiles.push({ name: `${name}.svg`, data: entry.id === current.id ? current.code : store.code(entry.id) || '' });
    }
    saveDownload(await createZip(zipFiles), ZIP_NAME);
    filesEditor.toast(`ZIP with ${zipFiles.length} ${zipFiles.length === 1 ? 'drawing' : 'drawings'} downloaded`);
}

/**
 * Opens the dialog with all drawings and the open one focused.
 * @returns {void}
 */
function openFilesDialog() {
    search.value = '';
    renderCards();
    openDialog(dialog);
    grid.querySelector('.current .file-open')?.focus();
}

/**
 * Draws the cards anew while the dialog is open.
 * @returns {void}
 */
function renderIfOpen() {
    if (dialog.open) renderCards();
}

/**
 * Sets up the "My drawings" dialog.
 * @param {FilesEditor} editor - what the dialog asks of the editor.
 * @returns {FilesDialog} open() and render() for the editor.
 */
export function createFiles(editor) {
    filesEditor = editor;
    dialog = document.getElementById('files');
    grid = document.getElementById('files-grid');
    search = document.getElementById('files-search');
    info = document.getElementById('files-info');
    grid.addEventListener('click', handleCardClick);
    search.addEventListener('input', renderCards);
    document.getElementById('files-new').addEventListener('click', () => { dialog.close(); filesEditor.create('blank'); });
    document.getElementById('files-import').addEventListener('click', () => { dialog.close(); filesEditor.importFile(); });
    document.getElementById('files-zip').addEventListener('click', saveAllAsZip);
    // Another editor tab changed the list.
    addEventListener('storage', event => { if (event.key === LIST_KEY && dialog.open) renderCards(); });
    return { open: openFilesDialog, render: renderIfOpen };
}
