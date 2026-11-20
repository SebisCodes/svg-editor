/**
 * Connects the editor to what works with it from outside, in this order:
 *   1. the AI Assistant: prompt and links (ai.js);
 *   2. WebMCP tools for an AI agent in the browser (mcp.js);
 *   3. the AI status at the AI button (aistatus.js);
 *   4. saving to the user's server and the page around the editor (sync.js).
 * Each gets the editor's functions as callbacks; sync.js is set up last and the others reach
 * it through services.sync.
 */

import { state, services } from './state.js?v=2';
import { store } from './document-store.js?v=2';
import { createAi } from './ai.js?v=19';
import { createMcp } from './mcp.js?v=7';
import { createAiStatus } from './aistatus.js?v=8';
import { createSync } from './sync.js?v=23';
import { parse } from './export.js?v=6';
import { formatSvg } from './xml-write.js?v=2';
import { showToast } from './util.js?v=3';
import { undo } from './history.js?v=3';
import { selectElement } from './selection.js?v=3';
import { setAttributes, applyChange, writeChangedTags } from './edits.js?v=3';
import { removeSelection } from './structure.js?v=3';
import { openDocument, createDocument, getBlankCode } from './documents.js?v=3';
import { receiveDrawing, importPageDocument, AI_NAME } from './incoming.js?v=3';

const PREFIX = 'svgeditor';

/**
 * The open drawing as the AI prompt and the WebMCP tools see it.
 * @typedef {Object} AiDrawingState
 * @property {string} svg - the code.
 * @property {string} sel - the start tag of the selected shape, "" for none.
 * @property {string} name - the drawing's name.
 * @property {string[]} [files] - the names of all drawings (AI prompt).
 * @property {?Object} [context] - what the page around the editor tells the AI (AI prompt).
 */

/**
 * Sets up the AI Assistant, WebMCP, the AI status and sync.js.
 * @returns {void}
 */
export function startAssistants() {
    let aiStatus = null;
    services.aiDialog = createAi({
        remote: () => services.sync?.getAiSettings() || null,
        fetchKey: () => (services.sync ? services.sync.fetchKey() : Promise.resolve(null)),
        keyValid: () => !!services.sync?.hasValidKey(),
        getState: getAiPromptState,
        receive: async (...drawing) => { setTimeout(() => aiStatus.addDelivery('link')); await receiveDrawing(...drawing); return state.fileId; },
        open: openStoredDocument,
        toast: showToast,
    });
    const agent = createMcp(createMcpEditor(() => aiStatus.addDelivery('agent')));
    aiStatus = createAiStatus({
        prefix: PREFIX, btn: document.getElementById('btn-ai'), box: document.getElementById('ai-status'),
        remote: () => services.sync?.getAiSettings() || null, agent: () => agent,
    });
    services.sync = createSync(createSyncEditor(aiStatus));
}

/**
 * Returns what the AI prompt needs: the open drawing, the names of all drawings and what the
 * page around the editor tells the AI.
 * @returns {AiDrawingState} the state for the prompt.
 */
function getAiPromptState() {
    return { ...getAiDrawingState(), files: store.getSorted().map(entry => entry.name), context: services.sync?.getContext() || null };
}

/**
 * Opens a stored drawing in this tab, for "Open it here" after a link went to another tab.
 * @param {string} id - the drawing's id.
 * @returns {boolean} false when there is no such drawing (a command that tells whether it took place).
 */
function openStoredDocument(id) {
    if (!store.getMeta(id)) return false;
    openDocument(id);
    return true;
}

/**
 * Returns the open drawing for the AI. Edits still waiting for their start tags are written
 * into the code first, so the AI gets what the user sees (no caller can see the difference).
 * @returns {AiDrawingState} the code, the selected start tag and the name.
 */
function getAiDrawingState() {
    writeChangedTags();
    return { svg: state.code, sel: state.sel > 0 ? getStartTagText(state.sel) : '', name: state.name };
}

/**
 * Returns the start tag of an element as written in the code.
 * @param {number} index - the element.
 * @returns {string} the start tag, or a bare tag when the code and the drawing do not match.
 */
function getStartTagText(index) {
    return state.isMapped && state.scanEls[index] ? state.code.slice(state.scanEls[index].start, state.scanEls[index].tagEnd) : `<${state.modelEls[index].tagName}>`;
}

/**
 * Creates what the WebMCP tools ask of the editor.
 * @param {function(): void} onUse - called on every tool call (AI status).
 * @returns {Object} the callbacks of mcp.js.
 */
function createMcpEditor(onUse) {
    return {
        onUse,
        getState: getAiDrawingState,
        files: () => store.getSorted().map(entry => ({ name: entry.name, updated: entry.updated, open: entry.id === state.fileId })),
        openFile: openNamedDocument,
        newFile: (name, svg) => createDocument(name || AI_NAME, svg || getBlankCode()) && state.name,
        elements: () => (state.doc ? state.modelEls : []),
        error: () => !!state.error,
        receive: receiveDrawing,
        editShape: editShapeForAgent,
        deleteShape: removeShapeForAgent,
        select: selectElement,
        undo,
    };
}

/**
 * Opens a drawing by name for an agent; the open one stays as it is.
 * @param {string} name - the drawing's name.
 * @returns {boolean} false when there is no such drawing (a command that tells whether it took place).
 */
function openNamedDocument(name) {
    const entry = store.findByName(name);
    if (entry && entry.id !== state.fileId) openDocument(entry.id);
    return !!entry;
}

/**
 * Sets attributes of a shape for an agent as one undo step and selects it.
 * @param {number} index - the shape.
 * @param {Object<string, string>} attributes - name -> value, "" removes.
 * @returns {void}
 */
function editShapeForAgent(index, attributes) {
    setAttributes(index, attributes);
    applyChange();
    selectElement(index);
}

/**
 * Deletes a shape for an agent.
 * @param {number} index - the shape.
 * @returns {void}
 */
function removeShapeForAgent(index) {
    selectElement(index);
    removeSelection();
}

/**
 * Creates the adapter sync.js works with (its property names are the shared contract).
 * @param {Object} aiStatus - the AI status (aistatus.js).
 * @returns {Object} the SyncEditor of sync.js.
 */
function createSyncEditor(aiStatus) {
    return {
        onAiResult: () => aiStatus.addDelivery('page'),
        onAiEnd: () => aiStatus.resetDelivery(),
        prefix: PREFIX, editor: 'svg', word: 'drawing',
        tidy: getTidiedCode,
        current: getCurrentDocument,
        load: importPageDocument,
        toast: showToast,
        hookFor: id => store.getMeta(id)?.hook || null,
        setHookFor: setDocumentHook,
        onAi: () => services.aiDialog?.refresh(),
    };
}

/**
 * Returns code tidied for sync.js (?tidy=1, tidy in load); code that does not parse comes back
 * as it is.
 * @param {string} code - the code.
 * @returns {string} the tidied code.
 */
function getTidiedCode(code) {
    const result = parse(code);
    return result.error || !result.doc ? code : formatSvg(result.doc, code);
}

/**
 * Returns the open drawing for sync.js; edits still waiting for their start tags are written
 * into the code first (no caller can see the difference).
 * @returns {{id: string, name: string, content: string, assets: Object}} the drawing, without pictures.
 */
function getCurrentDocument() {
    writeChangedTags();
    return { id: state.fileId, name: state.name, content: state.code, assets: {} };
}

/**
 * Stores or removes the webhook of one drawing.
 * @param {string} id - the drawing's id.
 * @param {?Object} hook - the webhook, null to remove it.
 * @returns {void}
 */
function setDocumentHook(id, hook) {
    try { store.setMeta(id, { hook }); } catch (error) { showToast('The browser storage is full'); }
}
