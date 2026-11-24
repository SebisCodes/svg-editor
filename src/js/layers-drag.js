/**
 * Reordering by dragging a row of the Layers list. Dropping on the upper half of a row puts
 * the element in front of that one (drawn on top), on the lower half behind it; dropping in
 * the middle of a group row puts it inside the group, as its front-most child. The move is
 * made in the code, one undo step.
 */

import { state, elements } from './state.js?v=2';
import { findElements, showToast } from './util.js?v=3';
import { setCode, addHistoryStep } from './history.js?v=5';
import { selectElement } from './selection.js?v=5';
import { hasCodeError, showFixErrorFirst, writeChangedTags } from './edits.js?v=5';
import { getBlock, getIndent, getIndexAt } from './structure.js?v=5';
import { GROUPS } from './labels.js?v=3';

const GROUP_ZONE_START = 0.3;               // share of a group row's height where "into" starts
const GROUP_ZONE_END = 0.7;
const HALF = 0.5;
const CHILD_INDENT = '  ';
const DROP_CLASSES = ['drop-front', 'drop-back', 'drop-into'];

/**
 * Where a moved element goes in the code.
 * @typedef {Object} DropTarget
 * @property {number} at - the offset it is inserted at.
 * @property {?TagRange} ref - the element it goes next to, null for an empty group.
 */

/** The element whose row is dragged, -1 while none is. */
let draggedIndex = -1;

/**
 * Listens for dragging rows of the list.
 * @returns {void}
 */
export function startLayerDrag() {
    const tree = elements.tree;
    tree.addEventListener('dragstart', startRowDrag);
    tree.addEventListener('dragover', showDropPlace);
    tree.addEventListener('dragleave', event => { if (!tree.contains(event.relatedTarget)) clearDropMarks(); });
    tree.addEventListener('drop', moveRowOnDrop);
    tree.addEventListener('dragend', () => { clearDropMarks(); draggedIndex = -1; findElements('li.dragged', tree).forEach(row => row.classList.remove('dragged')); });
}

/**
 * Returns where a dragged row would go on a row.
 * @param {DragEvent} event - the drag event.
 * @param {HTMLLIElement} row - the row under the pointer.
 * @returns {string} "front", "back" or "into".
 */
function getDropPlace(event, row) {
    const index = +row.dataset.i;
    const bounds = row.getBoundingClientRect();
    const share = (event.clientY - bounds.top) / bounds.height;
    const isGroup = state.scanEls[index] && !state.scanEls[index].selfClose && GROUPS.has(state.modelEls[index].localName);
    if (index === 0) return 'into';
    if (isGroup && share > GROUP_ZONE_START && share < GROUP_ZONE_END) return 'into';
    return share < HALF ? 'front' : 'back';
}

/**
 * Removes the drop marks from the rows.
 * @returns {void}
 */
function clearDropMarks() {
    findElements('li.drop-front, li.drop-back, li.drop-into', elements.tree).forEach(row => row.classList.remove(...DROP_CLASSES));
}

/**
 * Starts dragging a row; not while the code has an error.
 * @param {DragEvent} event - the dragstart event.
 * @returns {void}
 */
function startRowDrag(event) {
    const row = event.target.closest('li[data-i]');
    if (!row || state.error) { event.preventDefault(); return; }
    draggedIndex = +row.dataset.i;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(draggedIndex));
    row.classList.add('dragged');
}

/**
 * Marks where the dragged row would go.
 * @param {DragEvent} event - the dragover event.
 * @returns {void}
 */
function showDropPlace(event) {
    const row = event.target.closest('li[data-i]');
    if (draggedIndex < 0 || !row) return;
    event.preventDefault();
    clearDropMarks();
    if (+row.dataset.i !== draggedIndex) row.classList.add('drop-' + getDropPlace(event, row));
}

/**
 * Moves the dragged element where its row was dropped.
 * @param {DragEvent} event - the drop event.
 * @returns {void}
 */
function moveRowOnDrop(event) {
    const row = event.target.closest('li[data-i]');
    event.preventDefault();
    clearDropMarks();
    if (row && draggedIndex > 0) moveLayer(draggedIndex, +row.dataset.i, getDropPlace(event, row));
    draggedIndex = -1;
}

/**
 * Moves an element next to another in the code: in front of it (drawn on top) or behind it;
 * "into" makes it the front-most child of a group.
 * @param {number} index - the element to move.
 * @param {number} targetIndex - the element it goes next to or into.
 * @param {string} place - "front", "back" or "into".
 * @returns {void}
 */
function moveLayer(index, targetIndex, place) {
    if (index <= 0 || targetIndex < 0 || index === targetIndex) return;
    if (hasCodeError()) { showFixErrorFirst(); return; }
    if (targetIndex === 0 && place !== 'into') return;
    for (let step = targetIndex; step >= 0; step = state.scanEls[step].parent) if (step === index) { showToast('A group cannot be moved into itself'); return; }
    writeChangedTags();
    const own = getBlock(state.scanEls[index]);
    const target = getTargetPlace(targetIndex, place, own);
    if (!target) { showToast('This element cannot hold other shapes'); return; }
    const piece = getMovedPiece(index, targetIndex, own, target);
    const at = target.at;
    if (at > own.a && at < own.b) return;
    const code = at >= own.b ? state.code.slice(0, own.a) + state.code.slice(own.b, at) + piece + state.code.slice(at)
                             : state.code.slice(0, at) + piece + state.code.slice(at, own.a) + state.code.slice(own.b);
    const offset = (at >= own.b ? at - (own.b - own.a) : at) + (piece.length - piece.trimStart().length);
    setCode(code, { history: false });
    selectElement(getIndexAt(offset));
    addHistoryStep();
}

/**
 * Returns where in the code a moved element goes, and the element it goes next to.
 * @param {number} targetIndex - the element it goes next to or into.
 * @param {string} place - "front", "back" or "into".
 * @param {CodeBlock} own - the moved element's range.
 * @returns {?DropTarget} where it goes, null when it cannot go there.
 */
function getTargetPlace(targetIndex, place, own) {
    let ref = null;
    if (place === 'into') {
        const children = state.scanEls.filter(tag => tag.parent === targetIndex);
        if (!children.length) return getEmptyGroupPlace(targetIndex);
        ref = children[children.length - 1];
        place = 'front';
    } else ref = state.scanEls[targetIndex];
    const refBlock = getBlock(ref);
    let at = place === 'front' ? (own.lines ? refBlock.b : ref.end) : (own.lines ? refBlock.a : ref.start);
    if (own.lines && !refBlock.lines) at = place === 'front' ? ref.end : ref.start;
    return { at, ref };
}

/**
 * Returns where an element goes into a group without children: before its end tag, on a line
 * of its own when the end tag stands on one.
 * @param {number} targetIndex - the group.
 * @returns {?DropTarget} where it goes, null when the element closes itself.
 */
function getEmptyGroupPlace(targetIndex) {
    const group = state.scanEls[targetIndex];
    if (group.selfClose) return null;
    const close = group.inner[1];
    const lineStart = state.code.lastIndexOf('\n', close - 1) + 1;
    return { at: state.code.slice(lineStart, close).trim() ? close : lineStart, ref: null };
}

/**
 * Returns the code of the moved element, reindented for its new place when it stands on
 * lines of its own.
 * @param {number} index - the moved element.
 * @param {number} targetIndex - the element it goes next to or into.
 * @param {CodeBlock} own - the moved element's range.
 * @param {DropTarget} target - where it goes.
 * @returns {string} the code to insert.
 */
function getMovedPiece(index, targetIndex, own, target) {
    let piece = state.code.slice(own.a, own.b);
    if (!own.lines) return piece;
    const from = getIndent(state.scanEls[index].start);
    const to = target.ref ? getIndent(target.ref.start) : getIndent(state.scanEls[targetIndex].start) + CHILD_INDENT;
    if (from !== to) piece = piece.replace(/\n$/, '').replace(new RegExp('^' + from, 'gm'), to) + (piece.endsWith('\n') ? '\n' : '');
    const lineStart = state.code.lastIndexOf('\n', target.at - 1) + 1;
    if (state.code.slice(lineStart, target.at).trim()) piece = '\n' + piece.replace(/\n$/, '');
    return piece;
}
