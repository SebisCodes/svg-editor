/**
 * Changing the structure of the drawing on the text: adding markup, deleting, duplicating
 * and moving elements in the drawing order (into a group: layers-drag.js). An element that stands on lines of
 * its own moves with its whole lines and takes the indent of its new place; the code is then
 * read again and the moved element selected.
 */

import { state } from './state.js?v=2';
import { parseCodeTags, TEMPLATE_SYNTAX } from './svg-template.js?v=1';
import { showToast } from './util.js?v=3';
import { setCode, addHistoryStep } from './history.js?v=4';
import { selectElement } from './selection.js?v=4';
import { hasCodeError, showFixErrorFirst, writeChangedTags, setAttributes } from './edits.js?v=4';
import { getSnapshot, getMovedAttributes, getParentDelta } from './geometry.js?v=4';

const DEFAULT_INDENT = '  ';
const COPY_OFFSET = 10;                     // root units a copy lies off its original without a grid
/** Directions of moveInDrawingOrder(): one step, or all the way. */
export const FORWARD = 1;
export const BACKWARD = -1;
export const TO_FRONT = 2;
export const TO_BACK = -2;

/**
 * The range an element takes in the code.
 * @typedef {Object} CodeBlock
 * @property {number} a - the start.
 * @property {number} b - the end.
 * @property {boolean} lines - true when the element stands on lines of its own and the range covers them.
 */

/**
 * Returns the range of an element, extended to whole lines when it stands on its own lines.
 * @param {TagRange} tag - the element.
 * @returns {CodeBlock} the range.
 */
export function getBlock(tag) {
    const code = state.code;
    const lineStart = code.lastIndexOf('\n', tag.start - 1) + 1;
    let lineEnd = code.indexOf('\n', tag.end);
    if (lineEnd < 0) lineEnd = code.length;
    if (!code.slice(lineStart, tag.start).trim() && !code.slice(tag.end, lineEnd).trim()) return { a: lineStart, b: Math.min(lineEnd + 1, code.length), lines: true };
    return { a: tag.start, b: tag.end, lines: false };
}

/**
 * Returns the indent of the line an offset lies on.
 * @param {number} offset - the offset.
 * @returns {string} the spaces and tabs at the start of the line.
 */
export function getIndent(offset) {
    const lineStart = state.code.lastIndexOf('\n', offset - 1) + 1;
    return /^[ \t]*/.exec(state.code.slice(lineStart))[0];
}

/**
 * Returns the element whose start tag begins at an offset.
 * @param {number} offset - the offset of its "<".
 * @returns {number} the element, -1 when none begins there.
 */
export function getIndexAt(offset) {
    const tag = state.scanEls.find(scanned => scanned.start === offset);
    return tag ? tag.index : -1;
}

/**
 * Adds markup as the front-most child of the root and selects it; a root that closes itself
 * is opened first. A command that adds an item and returns the new element, -1 when nothing
 * was added, so the caller can go on with it.
 * @param {string} markup - one element.
 * @returns {number} the new element, -1 when nothing was added.
 */
export function addMarkup(markup) {
    if (hasCodeError()) { showFixErrorFirst(); return -1; }
    writeChangedTags();
    const root = state.scanEls[0];
    if (!root) return -1;
    let code = state.code;
    if (root.selfClose) {
        const close = root.tagEnd - 2;
        code = code.slice(0, close).replace(/\s*$/, '') + '>\n</svg>' + code.slice(root.tagEnd);
        state.code = code;
        state.scanEls = parseCodeTags(code, TEMPLATE_SYNTAX);
    }
    const openRoot = state.scanEls[0];
    const children = state.scanEls.filter(tag => tag.parent === 0);
    const indent = children.length ? getIndent(children[children.length - 1].start) : DEFAULT_INDENT;
    const closeStart = openRoot.inner[1];
    const lineStart = code.lastIndexOf('\n', closeStart - 1) + 1;
    const isOwnLine = !code.slice(lineStart, closeStart).trim();
    const at = isOwnLine ? lineStart : closeStart;
    const text = isOwnLine ? indent + markup + '\n' : '\n' + indent + markup + '\n';
    const offset = at + text.indexOf('<');
    setCode(code.slice(0, at) + text + code.slice(at), { reparse: true, history: false });
    const index = getIndexAt(offset);
    selectElement(index);
    addHistoryStep();
    return index;
}

/**
 * Deletes the selected element with everything inside it.
 * @returns {void}
 */
export function removeSelection() {
    if (state.sel <= 0) return;
    if (hasCodeError()) { showFixErrorFirst(); return; }
    writeChangedTags();
    const block = getBlock(state.scanEls[state.sel]);
    setCode(state.code.slice(0, block.a) + state.code.slice(block.b), { select: -1 });
    showToast('Deleted - Undo brings it back');
}

/**
 * Returns a copy of markup whose ids are free in the drawing; references inside the copy go to
 * the copied elements: url(#a), href="#a", xlink:href="#a".
 * @param {string} text - the markup.
 * @returns {string} the markup with new ids.
 */
function getUniqueIdCopy(text) {
    const taken = new Set(state.modelEls.map(model => model.getAttribute('id')).filter(Boolean));
    const renamed = new Map();
    /**
     * Returns an id attribute with a free id and notes the new id (a replace callback).
     * @param {string} all - the whole attribute.
     * @param {string} prefix - the space, name and = before the value.
     * @param {string} quote - the quote around the value.
     * @param {string} id - the id in the original.
     * @returns {string} the attribute with the new id.
     */
    const renameId = (all, prefix, quote, id) => {
        let number = 2, candidate;
        do { candidate = `${id.replace(/-\d+$/, '')}-${number++}`; } while (taken.has(candidate));
        taken.add(candidate);
        renamed.set(id, candidate);
        return prefix + quote + candidate + quote;
    };
    let copy = text.replace(/(\sid\s*=\s*)(["'])(.*?)\2/g, renameId);
    if (!renamed.size) return copy;
    /**
     * Returns the new id of a copied element.
     * @param {string} id - the id in the original.
     * @returns {string} the id in the copy, or the id itself when it points outside the copy.
     */
    const getNewId = id => renamed.get(id) ?? id;
    copy = copy.replace(/url\(\s*(["']?)#([^)"'\s]+)\1\s*\)/g, (all, quote, id) => `url(${quote}#${getNewId(id)}${quote})`)
        .replace(/(\s(?:xlink:)?href\s*=\s*)(["'])#(.*?)\2/g, (all, prefix, quote, id) => `${prefix}${quote}#${getNewId(id)}${quote}`);
    return copy;
}

/**
 * Duplicates the selected element right after it, one grid step (or 10 units) further, and
 * selects the copy.
 * @returns {void}
 */
export function copySelection() {
    if (state.sel <= 0) return;
    if (hasCodeError()) { showFixErrorFirst(); return; }
    writeChangedTags();
    const tag = state.scanEls[state.sel];
    const block = getBlock(tag);
    const copy = getUniqueIdCopy(state.code.slice(tag.start, tag.end));
    let code, offset;
    if (block.lines) {
        const indent = getIndent(tag.start);
        code = state.code.slice(0, block.b) + indent + copy + '\n' + state.code.slice(block.b);
        offset = block.b + indent.length;
    } else {
        code = state.code.slice(0, tag.end) + copy + state.code.slice(tag.end);
        offset = tag.end;
    }
    setCode(code, { history: false });
    const index = getIndexAt(offset);
    if (index > 0) moveCopy(index);
    addHistoryStep();
}

/**
 * Moves a fresh copy one grid step (or 10 units) right and down and selects it.
 * @param {number} index - the copy.
 * @returns {void}
 */
function moveCopy(index) {
    state.sel = index;
    const step = state.grid.snap ? state.grid.size : COPY_OFFSET;
    const snapshot = getSnapshot(index);
    const [parentDx, parentDy] = getParentDelta(snapshot, step, step);
    setAttributes(index, getMovedAttributes(snapshot, parentDx, parentDy));
    writeChangedTags();
    selectElement(index);
}

/**
 * Returns the elements with the same parent as an element, itself included.
 * @param {number} index - the element.
 * @returns {TagRange[]} the siblings in document order.
 */
function getSiblings(index) {
    const parent = state.scanEls[index].parent;
    return state.scanEls.filter(tag => tag.parent === parent);
}

/**
 * Moves the selected element in the drawing order. Shapes further down in the code are drawn
 * on top.
 * @param {number} direction - 1 one step forward, -1 one step back, 2 to the front, -2 to the back.
 * @returns {void}
 */
export function moveInDrawingOrder(direction) {
    if (state.sel <= 0) return;
    if (hasCodeError()) { showFixErrorFirst(); return; }
    writeChangedTags();
    const siblings = getSiblings(state.sel);
    const position = siblings.findIndex(tag => tag.index === state.sel);
    const target = direction === TO_FRONT ? siblings[siblings.length - 1] : direction === TO_BACK ? siblings[0] : siblings[position + direction];
    if (!target || target.index === state.sel) { showToast(direction > 0 ? 'Already at the front' : 'Already at the back'); return; }
    const own = getBlock(state.scanEls[state.sel]);
    const targetBlock = getBlock(target);
    const piece = state.code.slice(own.a, own.b);
    let code = state.code.slice(0, own.a) + state.code.slice(own.b);
    let at = direction > 0 ? targetBlock.b - (own.b - own.a) : targetBlock.a;
    if (!own.lines && direction > 0) at = target.end - (own.b - own.a);
    if (!own.lines && direction < 0) at = target.start;
    code = code.slice(0, at) + piece + code.slice(at);
    const offset = at + (piece.length - piece.trimStart().length);
    setCode(code, { history: false });
    selectElement(getIndexAt(offset));
    addHistoryStep();
}
