/**
 * Storing the work in the browser: the settings (grid, background, colors of new shapes,
 * split, open drawing) under svgeditor.v1, the open drawing in "My drawings" (document-store.js).
 *
 * Two tabs can have the same drawing open:
 *   1. a tab that saves while the other tab changed the drawing keeps its own version as a
 *      drawing of its own; the other tab's version stays as it is;
 *   2. a hidden tab without edits of its own shows the version another tab saved.
 */

import { state, services } from './state.js?v=2';
import { store } from './document-store.js?v=2';
import { showToast } from './util.js?v=3';
import { setCode } from './history.js?v=6';
import { showFileName } from './documents.js?v=6';

/** The storage key of the settings and the id of the open drawing. */
export const SETTINGS_KEY = 'svgeditor.v1';
const STORAGE_FULL = 'The browser storage is full - download and delete drawings under "My drawings"';
/** German background names that settings stored in this browser can hold, with their English names. */
const GERMAN_BACKGROUNDS = { karo: 'checker', hell: 'light', dunkel: 'dark', keiner: 'none' };

/**
 * The settings as stored.
 * @typedef {Object} StoredSettings
 * @property {string} [file] - the id of the open drawing.
 * @property {GridSettings} [grid] - the grid.
 * @property {string} [bg] - the canvas background.
 * @property {ShapeDefaults} [defaults] - the colors of new shapes.
 * @property {number} [split] - the share of the code beside the canvas.
 * @property {string} [code] - a drawing kept in the settings themselves.
 * @property {string} [name] - the name of that drawing.
 */

/** The code of the open drawing as this tab last read or stored it. */
let savedCode = null;
let isFullWarned = false;

/**
 * Sets the code of the open drawing as this tab last read or stored it.
 * @param {?string} code - the code.
 * @returns {void}
 */
export function setSavedCode(code) {
    savedCode = code;
}

/**
 * Stores the settings and, when it changed, the open drawing; tells sync.js about the change.
 * When another tab changed the drawing meanwhile, this tab's version becomes a drawing of
 * its own.
 * @returns {void}
 */
export function saveState() {
    saveSettings();
    if (!state.fileId || state.code === savedCode) return;
    services.sync?.handleChange();
    try {
        const stored = store.code(state.fileId);
        if (stored != null && stored !== savedCode && stored !== state.code) { saveOwnVersionAsCopy(); return; }
        store.write(state.fileId, { code: state.code });
        savedCode = state.code;
    } catch (error) {
        if (!isFullWarned) showToast(STORAGE_FULL);
        isFullWarned = true;
    }
}

/**
 * Stores the settings and the id of the open drawing.
 * @returns {void}
 */
function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
            file: state.fileId, grid: state.grid, bg: state.bg, defaults: state.defaults, split: state.split,
        }));
    } catch (error) { /* Storage blocked or full: the editor keeps working without a saved draft. */ }
}

/**
 * Keeps this tab's version of the open drawing as a drawing of its own (with a free name),
 * because another tab changed the drawing while this tab had edits of its own.
 * @returns {void}
 */
function saveOwnVersionAsCopy() {
    const otherName = state.name;
    let id;
    try { id = store.create(otherName, state.code); } catch (error) { showToast(STORAGE_FULL); return; }
    state.fileId = id;
    state.name = store.getMeta(id)?.name || otherName;
    savedCode = state.code;
    showFileName();
    services.files.render();
    services.sync?.updateUi();
    saveState();
    showToast(`"${otherName}" was changed in another tab - your version here is kept as "${state.name}"`);
}

/**
 * Shows the version of the open drawing that another tab saved, in a hidden tab without
 * edits of its own: what the user is looking at never changes by itself.
 * @param {StorageEvent} event - the storage event.
 * @returns {void}
 */
function showOtherTabVersion(event) {
    if (!state.fileId || !event.key || !event.key.endsWith(state.fileId) || event.newValue == null || store.isTemp(state.fileId)) return;
    const stored = store.code(state.fileId);
    if (stored == null || stored === state.code || state.code !== savedCode || document.visibilityState !== 'hidden') return;
    savedCode = stored;
    setCode(stored);
}

/**
 * Listens for the drawings other tabs save.
 * @returns {void}
 */
export function startAutosave() {
    addEventListener('storage', showOtherTabVersion);
}

/**
 * Returns the stored settings.
 * @returns {?StoredSettings} the settings, null when none are stored or storage is blocked.
 */
export function getStoredSettings() {
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (error) { return null; }
}

/**
 * Turns a German background name in the stored settings into its English name and stores the
 * settings again under it, so the background chosen in this browser stays. Runs once at the
 * start, before the settings are read; the only place that knows the German names.
 * @returns {void}
 */
export function convertStoredSettings() {
    try {
        const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
        if (!settings || !Object.hasOwn(GERMAN_BACKGROUNDS, settings.bg)) return;
        settings.bg = GERMAN_BACKGROUNDS[settings.bg];
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) { /* storage blocked or unreadable: nothing to turn */ }
}
