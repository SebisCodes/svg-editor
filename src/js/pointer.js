/**
 * The pointer on the stage. A press starts one of these drags (state.drag):
 *   1. pan: the mouse wheel, the space bar, the hand tool, an empty spot, or any press while
 *      the code has an error;
 *   2. resize: a handle of the selection;
 *   3. tap (touch): selects on release; on the touch grip a move of the selected shape;
 *   4. move: a shape, which is selected first; a shape inside the selected group drags the
 *      group, and a click without moving then selects that shape;
 *   5. draw: the drawing tools (tools.js).
 * Two fingers zoom and pan (gestures.js). Dragging with the mouse never scrolls the page: the
 * press is cancelled for mice and the page position is held while a drag lasts.
 */

import { state, elements } from './state.js?v=2';
import { showToast, isTouchPointer, FIX_ERROR_FIRST } from './util.js?v=3';
import { resizeToFit, updatePaper, getRootPoint } from './canvas.js?v=7';
import { drawOverlay } from './overlay.js?v=7';
import { selectElement, getSelectableIndex, isInsideElement, getHitIndex, getViewElementAt } from './selection.js?v=7';
import { getSnapshot } from './geometry.js?v=7';
import { applyChange } from './edits.js?v=7';
import { renderInspector } from './inspector.js?v=7';
import { showTreeHover } from './layers.js?v=7';
import { startDraw, updateDrawPreview, stopDraw } from './tools.js?v=7';
import { startPinch, movePinch, moveViewOnWheel } from './gestures.js?v=7';
import { moveDraggedShape, resizeShape } from './shape-drag.js?v=7';
import { editTextOnDoubleClick } from './text-edit.js?v=7';

const LEFT_BUTTON = 0;
const MIDDLE_BUTTON = 1;
const WHEEL_DOUBLE_CLICK_TIME = 400;        // milliseconds between two presses of the wheel
const WHEEL_DOUBLE_CLICK_DISTANCE = 6;      // pixels the pointer may move between them
const TAP_DISTANCE = 10;                    // pixels a finger may move and still tap
const DRAG_CLASS = 'drag';

/** The pointers on the stage: id -> point on the stage. */
const pointers = new Map();
/** The page's scroll position while a mouse drag lasts, null otherwise. */
let pageScroll = null;

/**
 * Listens for the pointer, the wheel and double-clicks on the stage.
 * @returns {void}
 */
export function startPointerInput() {
    addEventListener('scroll', resetPagePosition, { passive: true });
    const stage = elements.stage;
    stage.addEventListener('pointerdown', startPointer);
    stage.addEventListener('pointermove', movePointer);
    stage.addEventListener('pointerup', stopPointer);
    stage.addEventListener('pointercancel', stopPointer);
    stage.addEventListener('pointerleave', clearHoverOnLeave);
    stage.addEventListener('click', event => { if (event.composedPath().some(node => node.localName === 'a')) event.preventDefault(); });
    stage.addEventListener('dblclick', editTextOnDoubleClick);
    stage.addEventListener('wheel', moveViewOnWheel, { passive: false });
}

/**
 * Returns the pointers on the stage.
 * @returns {Map<number, {x: number, y: number}>} pointer id -> point on the stage.
 */
export function getPointers() {
    return pointers;
}

/**
 * Holds the page where it was while something is dragged on the stage.
 * @returns {void}
 */
function resetPagePosition() {
    if (state.drag && pageScroll && (scrollX !== pageScroll[0] || scrollY !== pageScroll[1])) scrollTo(pageScroll[0], pageScroll[1]);
}

/**
 * Returns where a pointer event lies on the stage.
 * @param {MouseEvent} event - the event.
 * @returns {{x: number, y: number}} the point relative to the stage's top left corner.
 */
export function getStagePoint(event) {
    const stage = elements.stage.getBoundingClientRect();
    return { x: event.clientX - stage.left, y: event.clientY - stage.top };
}

/**
 * Starts a drag on the stage (see the steps at the top).
 * @param {PointerEvent} event - the pointerdown event.
 * @returns {void}
 */
function startPointer(event) {
    if (!state.viewRoot || event.target.closest('.zoom')) return;
    // No text selection, no middle-button autoscroll: dragging with the mouse
    // must not scroll the page when the pointer leaves the window.
    if (event.pointerType === 'mouse') event.preventDefault();
    elements.stage.focus({ preventScroll: true });
    pageScroll = event.pointerType === 'mouse' ? [scrollX, scrollY] : null;
    pointers.set(event.pointerId, getStagePoint(event));
    if (pointers.size === 2) { startPinch(); return; }
    if (pointers.size > 2) return;
    elements.stage.setPointerCapture(event.pointerId);
    const point = getRootPoint(event.clientX, event.clientY);
    const handle = event.target.closest && event.target.closest('[data-h]');
    if (event.button === MIDDLE_BUTTON && handleWheelDoubleClick(event)) return;
    if (event.button === MIDDLE_BUTTON || state.isSpaceDown || state.tool === 'hand' || (event.button === LEFT_BUTTON && state.error)) { startPan(event); return; }
    if (event.button !== LEFT_BUTTON) return;
    if (handle && state.sel > 0) {
        state.drag = { type: 'resize', handle: handle.dataset.h, snapshot: getSnapshot(state.sel), p0: point, moved: false };
        return;
    }
    if (state.tool === 'select' && isTouchPointer(event)) { startTap(event, point); return; }
    if (state.tool === 'select') { startSelectDrag(event, point); return; }
    startDraw(event, point);
}

/**
 * Fits the drawing on a double-click of the mouse wheel; a single press only pans. Remembers
 * each press to find the second one (a command that tells whether it took place).
 * @param {PointerEvent} event - the press of the wheel.
 * @returns {boolean} true when the drawing was fitted.
 */
function handleWheelDoubleClick(event) {
    const last = state.wheelClick;
    state.wheelClick = { t: event.timeStamp, x: event.clientX, y: event.clientY };
    if (!last || event.timeStamp - last.t >= WHEEL_DOUBLE_CLICK_TIME || Math.hypot(event.clientX - last.x, event.clientY - last.y) >= WHEEL_DOUBLE_CLICK_DISTANCE) return false;
    state.wheelClick = null;
    resizeToFit();
    return true;
}

/**
 * Starts moving the view; with an error in the code a press tells to fix it first.
 * @param {PointerEvent} event - the press.
 * @returns {void}
 */
function startPan(event) {
    if (state.error && state.tool !== 'hand') showToast(FIX_ERROR_FIRST);
    state.drag = { type: 'pan', x: event.clientX, y: event.clientY, px: state.panX, py: state.panY };
    elements.stage.classList.add(DRAG_CLASS);
}

/**
 * Starts a touch on the select tool: on the grip a move of the selected shape, elsewhere a
 * tap that selects on release.
 * @param {PointerEvent} event - the touch.
 * @param {DOMPoint} point - the touch in root coordinates.
 * @returns {void}
 */
function startTap(event, point) {
    if (event.target === elements.grip && state.sel > 0) {
        state.drag = { type: 'move', snapshot: getSnapshot(state.sel), p0: point, sx: event.clientX, sy: event.clientY, moved: false, leaf: -1, grip: true };
        return;
    }
    state.drag = { type: 'tap', index: getHitIndex(event), sx: event.clientX, sy: event.clientY, moved: false };
}

/**
 * Starts a press of the select tool: a shape is selected and dragged (Alt takes its group, a
 * shape inside the selected group drags the group), an empty spot clears the selection and
 * moves the view.
 * @param {PointerEvent} event - the press.
 * @param {DOMPoint} point - the press in root coordinates.
 * @returns {void}
 */
function startSelectDrag(event, point) {
    let index = getHitIndex(event);
    if (index > 0 && event.altKey) {
        const parent = state.scanEls[index].parent;
        if (parent > 0) index = parent;
    }
    // A hit inside the selected group drags the group;
    // a click without dragging then selects the element that was hit.
    let leaf = -1;
    if (index > 0 && state.sel > 0 && index !== state.sel && isInsideElement(index, state.sel)) { leaf = index; index = state.sel; }
    if (index > 0) {
        if (index !== state.sel) selectElement(index);
        state.drag = { type: 'move', snapshot: getSnapshot(index), p0: point, sx: event.clientX, sy: event.clientY, moved: false, leaf };
        return;
    }
    if (state.sel > 0) selectElement(-1);
    state.drag = { type: 'pan', x: event.clientX, y: event.clientY, px: state.panX, py: state.panY, empty: true };
    elements.stage.classList.add(DRAG_CLASS);
}

/**
 * Follows the pointer: the hover outline without a drag, else the running drag.
 * @param {PointerEvent} event - the pointermove event.
 * @returns {void}
 */
function movePointer(event) {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, getStagePoint(event));
    if (state.pinch) { movePinch(); return; }
    const drag = state.drag;
    if (!drag) { updateHover(event); return; }
    if (drag.type === 'tap') {
        if (Math.hypot(event.clientX - drag.sx, event.clientY - drag.sy) > TAP_DISTANCE) drag.moved = true;
        return;
    }
    if (drag.type === 'pan') { movePan(drag, event); return; }
    const point = getRootPoint(event.clientX, event.clientY);
    if (drag.type === 'move') { moveDraggedShape(drag, point, event); return; }
    if (drag.type === 'resize') {
        drag.moved = true;
        resizeShape(drag, point, event.shiftKey);
        drawOverlay();
        return;
    }
    if (drag.type === 'draw') updateDrawPreview(drag, point, event);
}

/**
 * Outlines the shape under the mouse (Alt: its group) on the canvas and in the layers.
 * @param {PointerEvent} event - the pointermove event.
 * @returns {void}
 */
function updateHover(event) {
    if (state.tool !== 'select' || !state.viewRoot || state.error || event.pointerType !== 'mouse') return;
    const index = getHitIndex(event);
    const hover = event.altKey && index > 0 && state.scanEls[index].parent > 0 ? state.scanEls[index].parent : index;
    if (hover === state.hoverIndex) return;
    state.hoverIndex = hover;
    drawOverlay();
    showTreeHover(hover);
}

/**
 * Moves the view with a pan drag.
 * @param {StageDrag} drag - the pan.
 * @param {PointerEvent} event - the pointermove event.
 * @returns {void}
 */
function movePan(drag, event) {
    if (event.clientX !== drag.x || event.clientY !== drag.y) state.autoFit = false;
    state.panX = drag.px + event.clientX - drag.x;
    state.panY = drag.py + event.clientY - drag.y;
    updatePaper();
}

/**
 * Ends a drag: a tap selects, a move or resize becomes an undo step, a drawn shape goes into
 * the code.
 * @param {PointerEvent} event - the pointerup or pointercancel event.
 * @returns {void}
 */
function stopPointer(event) {
    pointers.delete(event.pointerId);
    if (state.pinch) { if (pointers.size < 2) state.pinch = null; return; }
    const drag = state.drag;
    state.drag = null;
    elements.stage.classList.remove(DRAG_CLASS);
    if (!drag) return;
    const isRelease = event.type === 'pointerup';
    if (drag.type === 'tap') { if (isRelease && !drag.moved) selectElement(drag.index > 0 ? drag.index : -1); return; }
    if (drag.type === 'move' && drag.grip && !drag.moved && isRelease) { selectElement(getTapTarget(event)); return; }
    if (drag.type === 'move' && !drag.moved && drag.leaf > 0) { selectElement(drag.leaf); return; }
    if (drag.type === 'move' || drag.type === 'resize') {
        if (drag.moved) applyChange();
        drawOverlay();
        renderInspector();
    } else if (drag.type === 'draw') stopDraw(drag);
}

/**
 * Returns what a tap on the selection grip means: the shape under the finger - a part of the
 * selected group, or a shape lying on top - otherwise the selection stays.
 * @param {PointerEvent} event - the tap.
 * @returns {number} the element to select.
 */
function getTapTarget(event) {
    const node = getViewElementAt(event.clientX, event.clientY);
    const index = node ? getSelectableIndex(node) : -1;
    return index > 0 ? index : state.sel;
}

/**
 * Clears the hover outline when the pointer leaves the stage without a drag.
 * @returns {void}
 */
function clearHoverOnLeave() {
    if (state.drag || state.hoverIndex === -1) return;
    state.hoverIndex = -1;
    drawOverlay();
    showTreeHover(-1);
}
