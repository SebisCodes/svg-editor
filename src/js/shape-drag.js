/**
 * Dragging a shape on the canvas: moving it (Shift keeps one axis, the grid snaps its box)
 * and resizing it with a handle (Shift and circles keep the aspect ratio, the end handles of
 * a line move one end). Each move sets the attributes; the drag's end makes them one undo
 * step (pointer.js).
 */

import { state } from './state.js?v=2';
import { formatNumber } from './svg-values.js?v=3';
import { getSnapped, getElementToRootMatrix } from './canvas.js?v=4';
import { drawOverlay } from './overlay.js?v=4';
import { setAttributes, setBox } from './edits.js?v=4';
import { getMovedAttributes, getParentDelta, getChangeableAttributes } from './geometry.js?v=4';

const MOVE_THRESHOLD = 3;                   // pixels the pointer moves before a shape moves

/**
 * Moves the dragged shape to follow the pointer.
 * @param {StageDrag} drag - the move drag.
 * @param {DOMPoint} point - the pointer in root coordinates.
 * @param {PointerEvent} event - the pointermove event (Shift keeps one axis).
 * @returns {void}
 */
export function moveDraggedShape(drag, point, event) {
    if (!drag.moved && Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy) < MOVE_THRESHOLD) return;
    drag.moved = true;
    let dx = point.x - drag.p0.x, dy = point.y - drag.p0.y;
    if (event.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    const box = drag.snapshot.box;
    if (state.grid.snap && box) {
        dx = getSnapped(box.x + dx) - box.x;
        dy = getSnapped(box.y + dy) - box.y;
    }
    const [parentDx, parentDy] = getParentDelta(drag.snapshot, dx, dy);
    setAttributes(drag.snapshot.index, getMovedAttributes(drag.snapshot, parentDx, parentDy));
    drawOverlay();
}

/**
 * Resizes the dragged shape to the pointer with the handle that was grabbed.
 * @param {StageDrag} drag - the resize drag.
 * @param {DOMPoint} point - the pointer in root coordinates.
 * @param {boolean} keepRatio - true to keep the aspect ratio (Shift).
 * @returns {void}
 */
export function resizeShape(drag, point, keepRatio) {
    const handle = drag.handle;
    if (handle === 'p1' || handle === 'p2') { moveLineEnd(drag, point); return; }
    const start = drag.snapshot.box;
    let left = start.x, top = start.y, right = start.x + start.w, bottom = start.y + start.h;
    const x = getSnapped(point.x), y = getSnapped(point.y);
    const least = 1 / state.zoom;
    if (handle.includes('w')) left = Math.min(x, right - least);
    if (handle.includes('e')) right = Math.max(x, left + least);
    if (handle.includes('n')) top = Math.min(y, bottom - least);
    if (handle.includes('s')) bottom = Math.max(y, top + least);
    let box = { x: left, y: top, w: right - left, h: bottom - top };
    if ((keepRatio || drag.snapshot.tag === 'circle') && start.w && start.h) box = getRatioBox(start, box, handle);
    setBox(drag.snapshot, box);
}

/**
 * Moves one end of a dragged line to the pointer, snapped.
 * @param {StageDrag} drag - the resize drag on an end handle.
 * @param {DOMPoint} point - the pointer in root coordinates.
 * @returns {void}
 */
function moveLineEnd(drag, point) {
    const [nameX, nameY] = drag.handle === 'p1' ? ['x1', 'y1'] : ['x2', 'y2'];
    const local = new DOMPoint(getSnapped(point.x), getSnapped(point.y)).matrixTransform(getElementToRootMatrix(state.viewEls[drag.snapshot.index]).inverse());
    setAttributes(drag.snapshot.index, getChangeableAttributes(drag.snapshot, { [nameX]: formatNumber(local.x), [nameY]: formatNumber(local.y) }));
}

/**
 * Returns a box that keeps the aspect ratio of the start box: a corner takes the larger
 * scale, a side its own; the opposite corner or side stays.
 * @param {ShapeBox} start - the box at the start.
 * @param {ShapeBox} box - the box the pointer asks for.
 * @param {string} handle - the handle (nw, n, ne, e, se, s, sw, w).
 * @returns {ShapeBox} the box with the start's aspect ratio.
 */
function getRatioBox(start, box, handle) {
    const scaleX = box.w / start.w, scaleY = box.h / start.h;
    const isCorner = handle.length === 2;
    const scale = isCorner ? Math.max(scaleX, scaleY) : (handle === 'e' || handle === 'w' ? scaleX : scaleY);
    const width = start.w * scale, height = start.h * scale;
    const x = handle.includes('w') ? start.x + start.w - width : handle.includes('e') ? start.x : start.x + (start.w - width) / 2;
    const y = handle.includes('n') ? start.y + start.h - height : handle.includes('s') ? start.y : start.y + (start.h - height) / 2;
    return { x, y, w: width, h: height };
}
