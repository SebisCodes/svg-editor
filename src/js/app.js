/**
 * SVG editor: code on the left, canvas in the middle, properties and layers on the right.
 *
 * The code is the single source of truth: every change on the canvas rewrites the affected
 * start tag in the text; adding, deleting and reordering work on the text as well. Element i
 * of the drawing matches the i-th start tag in the code and the i-th element of the view
 * (state.js).
 *
 * This file starts the editor and wires its areas:
 *   1. the interface language (i18n.js), the page elements, the wrapped rows of the code view
 *      (wrap.js) and the shadow root of the view;
 *   2. the areas: storage, overlay, pointer, properties, layers, code input, bars, "My
 *      drawings", files and paste, keyboard, layout, export, color picker;
 *   3. the settings and the drawing that was open last (the first visit gets the example);
 *   4. on the next frame: the drawing is read and shown, then AI Assistant, WebMCP, AI status
 *      and sync.js (assistants.js);
 *   5. the hook window.svgEditor for the automated tests.
 */

import { createI18n } from './i18n.js?v=21';
import { createWrap } from './wrap.js?v=5';
import { state, elements, services, startElements, startShadowRoot } from './state.js?v=2';
import { store } from './files.js?v=11';
import { START } from './samples.js?v=6';
import { getHexColor } from './util.js?v=3';
import { startAutosave, getStoredSettings, convertStoredSettings, setSavedCode } from './autosave.js?v=3';
import { renderCode, syncLayerScroll } from './code-view.js?v=3';
import { setCode, addHistoryStep, undo, redo } from './history.js?v=3';
import { renderDrawing } from './view.js?v=3';
import { resizeToFit, setZoom } from './canvas.js?v=3';
import { startOverlay } from './overlay.js?v=3';
import { selectElement } from './selection.js?v=3';
import { getProperty } from './edits.js?v=3';
import { startPointerInput } from './pointer.js?v=3';
import { setTool } from './tools.js?v=3';
import { startInspectorInput } from './inspector-input.js?v=3';
import { startLayers, startLayerHover } from './layers.js?v=3';
import { startLayerDrag } from './layers-drag.js?v=3';
import { startCodeInput } from './code-input.js?v=3';
import { startToolbar, startActionButtons, startDialogButtons, updateGridUi } from './toolbar.js?v=3';
import { startDocuments, showFileName } from './documents.js?v=3';
import { receiveDrawing } from './incoming.js?v=3';
import { startFileInput } from './file-input.js?v=3';
import { startKeyboard } from './keyboard.js?v=3';
import { startLayout, updateSplit } from './layout.js?v=3';
import { startExportDialog } from './export-dialog.js?v=3';
import { startColorPicker } from './colorpicker.js?v=5';
import { startAssistants } from './assistants.js?v=3';
import './export-menu.js?v=6';

const PREFIX = 'svgeditor';
const DEFAULT_NAME = 'Drawing';
/** The properties whose colors the color picker offers as "Colors in this drawing". */
const PAINT_PROPERTIES = ['fill', 'stroke', 'stop-color'];

/* The interface in the page's language (i18n.js); the AI prompt stays English. The call is
   written out in full: the language page builder reads it from this file. */
createI18n({
    prefix: 'svgeditor',
    roots: '.header, .views, #work, #ai-receive, #toast, .storage-hint, dialog, .color-picker',
    skip: '',
});
startEditor();

/**
 * Starts the editor (the steps at the top).
 * @returns {void}
 */
function startEditor() {
    startElements();
    services.lineWrap = createWrap({ prefix: PREFIX, ta: elements.ta, layers: [elements.hl, elements.marks], gutter: elements.gutter, button: document.getElementById('btn-wrap'), onChange: () => { renderCode(); syncLayerScroll(); } });
    startShadowRoot();
    startAreas();
    loadSettings();
    showStartDocument();
    requestAnimationFrame(startDrawingAndAssistants);
    window.svgEditor = createTestHook();
}

/**
 * Sets up the areas of the editor; each listens for its own elements.
 * @returns {void}
 */
function startAreas() {
    startAutosave();
    startOverlay();
    startPointerInput();
    startInspectorInput();
    startLayers();
    startLayerDrag();
    startLayerHover();
    startCodeInput();
    startToolbar();
    startDocuments();
    startActionButtons();
    startFileInput();
    startKeyboard();
    startLayout();
    startExportDialog();
    startDialogButtons();
    startColorPicker({ colors: getDrawingColors });
}

/**
 * Returns the colors used in the drawing, for the color picker.
 * @returns {string[]} hex codes of fills, outlines and gradient stops.
 */
function getDrawingColors() {
    if (!state.doc) return [];
    return state.modelEls.flatMap((model, index) => PAINT_PROPERTIES.map(property => getHexColor(getProperty(index, property) || ''))).filter(Boolean);
}

/**
 * Reads the stored settings (grid, background, colors of new shapes, split) and shows them,
 * with the select tool chosen.
 * @returns {void}
 */
function loadSettings() {
    convertStoredSettings();
    const settings = getStoredSettings();
    if (settings) {
        if (settings.grid) Object.assign(state.grid, settings.grid);
        if (settings.bg) state.bg = settings.bg;
        if (settings.defaults) Object.assign(state.defaults, settings.defaults);
        if (settings.split) state.split = settings.split;
    }
    updateGridUi();
    updateSplit();
    setTool('select');
}

/**
 * Puts the drawing that was open last into the code field. The first visit gets the example;
 * a drawing kept in the settings themselves (code, name) becomes the first drawing of "My
 * drawings". With the storage blocked, the example is open without being stored.
 * @returns {void}
 */
function showStartDocument() {
    const settings = getStoredSettings();
    let code = null;
    try {
        if (!store.list().length) {
            const settingsCode = settings && typeof settings.code === 'string' && settings.code.trim();
            store.create(settingsCode ? settings.name || DEFAULT_NAME : START.name, settingsCode ? settings.code : START.code);
        }
        const entry = store.getMeta(settings?.file) || store.getSorted()[0];
        code = store.code(entry.id);
        if (code != null) { state.fileId = entry.id; state.name = entry.name; setSavedCode(code); }
    } catch (error) { /* Storage blocked: one drawing without saving */ }
    if (code == null) { code = START.code; state.name = START.name; }
    state.code = code;
    elements.ta.value = code;
    showFileName();
}

/**
 * Reads and shows the drawing, makes it the first undo step, then sets up the AI Assistant,
 * WebMCP, the AI status and sync.js.
 * @returns {void}
 */
function startDrawingAndAssistants() {
    renderDrawing(-1);
    addHistoryStep();
    syncLayerScroll();
    startAssistants();
}

/**
 * Creates the hook for the automated tests (window.svgEditor); its names are what the tests call.
 * @returns {Object} the hook.
 */
function createTestHook() {
    return { state, store, select: selectElement, setCode, undo, redo, fit: resizeToFit, zoomAt: setZoom, setTool, scan: () => state.scanEls, sync: () => services.sync, receive: receiveDrawing };
}
