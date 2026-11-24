/**
 * Drawings that arrive from outside: from an AI (a link, a pasted answer, a WebMCP tool) and
 * from the page around the editor or ?src= (sync.js). A page's drawing never takes the place
 * of one of the user's own drawings; every change is a normal undo step.
 */

import { state } from './state.js?v=2';
import { store } from './document-store.js?v=2';
import { VIEWER } from './sync.js?v=24';
import { showToast } from './util.js?v=3';
import { setCode } from './history.js?v=4';
import { resizeToFit } from './canvas.js?v=4';
import { writeChangedTags } from './edits.js?v=4';
import { openDocument, createDocument, getBlankCode } from './documents.js?v=4';

/** The name of an AI's drawing that comes without one. */
export const AI_NAME = 'AI drawing';
const SVG_END = '</svg>';

/**
 * Which drawing an AI's result goes to.
 * @typedef {Object} DrawingTarget
 * @property {string} [file] - "new" for a new drawing, a name for that drawing, empty for the open one.
 * @property {string} [name] - the name of a new drawing.
 */

/**
 * A document from the page around the editor or from ?src= (sync.js).
 * @typedef {Object} PageDocument
 * @property {string} name - its name.
 * @property {string} content - its code.
 * @property {string} [into] - the id of the drawing it replaces (the page's drawing).
 * @property {boolean} [asNew] - true to always make a new drawing.
 * @property {string} [page] - the origin of the page.
 * @property {boolean} [temp] - true to keep it in memory only, never stored.
 */

/**
 * Takes a drawing from an AI. target.file "new" makes a new drawing (named target.name), a
 * name opens that drawing (or makes it if there is none), empty means the open one. The link
 * says which drawing, so there is no question; Undo takes the change back.
 * @param {string} svg - the drawing, or only elements with mode "add".
 * @param {string} mode - "add" puts the elements on top, anything else replaces the drawing.
 * @param {DrawingTarget} [target] - which drawing.
 * @returns {Promise<void>} resolves when the drawing is in the editor.
 */
export async function receiveDrawing(svg, mode, target = {}) {
    writeChangedTags();
    const wanted = String(target.file || '').trim();
    const isNew = wanted.toLowerCase() === 'new';
    const entry = isNew ? null : wanted ? store.findByName(wanted) : store.getMeta(state.fileId);
    if (!entry) {
        const code = mode === 'add' ? getBlankCode().replace(SVG_END, '  ' + svg.trim() + '\n' + SVG_END) : svg;
        if (createDocument(isNew ? target.name || AI_NAME : wanted || AI_NAME, code)) VIEWER || showToast(`New drawing "${state.name}" from the AI - your other drawings are unchanged`);
        return;
    }
    writeChangedTags();
    if (entry.id !== state.fileId) openDocument(entry.id);
    if (mode === 'add') {
        const at = state.code.lastIndexOf(SVG_END);
        if (at < 0) { showToast('The drawing has no closing </svg> - the new shapes could not be added'); return; }
        setCode(state.code.slice(0, at) + '  ' + svg.trim() + '\n' + state.code.slice(at), { select: -1 });
    } else {
        setCode(svg, { select: -1 });
        state.autoFit = true;
        resizeToFit();
    }
    VIEWER || showToast(state.error ? 'Drawing received - it has an error, see the code' : `"${state.name}" changed by the AI - "Undo" takes it back`);
}

/**
 * Opens a drawing from the page around the editor or from ?src=. It replaces the drawing that
 * came from the same page under that name before, or becomes a new drawing; a page's drawing
 * kept in memory (temp) is never stored.
 * @param {PageDocument} pageDocument - the drawing and where it goes.
 * @returns {void}
 */
export function importPageDocument({ name, content, into, asNew, page, temp }) {
    writeChangedTags();
    const entry = asNew ? null : (into && store.getMeta(into)) || store.list().find(listed => listed.name === name && listed.page && listed.page === page && !!listed.temp === !!temp);
    if (!entry) {
        const id = createDocument(name, content, !!temp);
        if (id && page) try { store.setMeta(id, { page }); } catch (error) { /* storage full */ }
        return;
    }
    if (entry.id !== state.fileId) openDocument(entry.id);
    if (content !== state.code) { setCode(content, { select: -1 }); state.autoFit = true; resizeToFit(); }
}
