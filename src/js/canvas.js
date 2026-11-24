/**
 * The canvas: where the drawing lies on the stage (zoom and shift), fitting it into the
 * stage, and the coordinates between the screen, the root of the drawing and its elements.
 * Boxes are in root coordinates (the drawing's own units) unless the name says screen.
 */

import { state, elements } from './state.js?v=2';
import { getClamped, createMatrix, NARROW } from './util.js?v=3';
import { drawOverlay } from './overlay.js?v=7';

/** The factor of one zoom step (buttons and keys). */
export const ZOOM_STEP = 1.25;
const MIN_ZOOM = 0.02;
const MAX_FIT_ZOOM = 32;
const MAX_ZOOM = 64;
const PERCENT = 100;
/** Margins around a fitted drawing: they keep selection handles at its edge visible. */
const FIT_MARGIN = 16;
const FIT_MARGIN_SMALL = 10;
const FIT_MARGIN_NARROW = 18;
const SMALL_STAGE = 500;
/** On narrow screens the hint line (top) and the zoom bar (bottom) lie over the canvas. */
const NARROW_TOP = 46;
const NARROW_BOTTOM = 56;

/**
 * Lays out the paper at the zoom and shift, shows the zoom and draws the overlay.
 * @returns {void}
 */
export function updatePaper() {
    const width = state.naturalSize.w * state.zoom, height = state.naturalSize.h * state.zoom;
    Object.assign(elements.paper.style, { width: width + 'px', height: height + 'px', transform: `translate(${state.panX}px, ${state.panY}px)` });
    elements.zoomLabel.textContent = Math.round(state.zoom * PERCENT) + '%';
    drawOverlay();
}

/**
 * Fits the drawing into the whole stage. Until the next zoom or pan it stays fitted whenever
 * the panel changes size; the narrow margin keeps selection handles at the edge visible.
 * @returns {void}
 */
export function resizeToFit() {
    state.autoFit = true;
    const stage = elements.stage.getBoundingClientRect();
    const isNarrow = NARROW.matches;
    const margin = isNarrow ? FIT_MARGIN_NARROW : stage.width < SMALL_STAGE ? FIT_MARGIN_SMALL : FIT_MARGIN;
    const top = isNarrow ? NARROW_TOP : margin, bottom = isNarrow ? NARROW_BOTTOM : margin;
    const zoom = Math.min((stage.width - margin * 2) / state.naturalSize.w, (stage.height - top - bottom) / state.naturalSize.h);
    state.zoom = getClamped(isFinite(zoom) && zoom > 0 ? zoom : 1, MIN_ZOOM, MAX_FIT_ZOOM);
    state.panX = (stage.width - state.naturalSize.w * state.zoom) / 2;
    state.panY = top + (stage.height - top - bottom - state.naturalSize.h * state.zoom) / 2;
    updatePaper();
}

/**
 * Zooms around a point of the stage; the point stays where it is.
 * @param {number} zoom - the new zoom.
 * @param {number} [stageX] - the point's x on the stage, the center when left out.
 * @param {number} [stageY] - the point's y on the stage.
 * @returns {void}
 */
export function setZoom(zoom, stageX, stageY) {
    const stage = elements.stage.getBoundingClientRect();
    if (stageX == null) { stageX = stage.width / 2; stageY = stage.height / 2; }
    const newZoom = getClamped(zoom, MIN_ZOOM, MAX_ZOOM);
    state.autoFit = false;
    state.panX = stageX - (stageX - state.panX) * (newZoom / state.zoom);
    state.panY = stageY - (stageY - state.panY) * (newZoom / state.zoom);
    state.zoom = newZoom;
    updatePaper();
}

/**
 * Returns the matrix from root coordinates to the screen.
 * @returns {DOMMatrix} the matrix.
 */
export function getRootMatrix() {
    return createMatrix(state.viewRoot.getScreenCTM());
}

/**
 * Returns a screen point in root coordinates.
 * @param {number} x - the screen x.
 * @param {number} y - the screen y.
 * @returns {DOMPoint} the point.
 */
export function getRootPoint(x, y) {
    return new DOMPoint(x, y).matrixTransform(getRootMatrix().inverse());
}

/**
 * Returns the matrix from an element's coordinates to those of the root.
 * @param {?Element} element - an element of the view.
 * @returns {DOMMatrix} the matrix, the identity for the root or an element without one.
 */
export function getElementToRootMatrix(element) {
    if (!element || element === state.viewRoot) return new DOMMatrix();
    const matrix = element.getScreenCTM && element.getScreenCTM();
    return matrix ? getRootMatrix().inverse().multiply(createMatrix(matrix)) : new DOMMatrix();
}

/**
 * Returns the bounding box of an element in root coordinates.
 * @param {number} index - the element.
 * @returns {?ShapeBox} the box, null when the element has none.
 */
export function getBox(index) {
    const element = state.viewEls[index];
    if (!element || !element.getBBox) return null;
    let bounds;
    try { bounds = element.getBBox(); } catch (error) { return null; }
    const matrix = getElementToRootMatrix(element);
    const corners = [[bounds.x, bounds.y], [bounds.x + bounds.width, bounds.y], [bounds.x, bounds.y + bounds.height], [bounds.x + bounds.width, bounds.y + bounds.height]]
        .map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
    const xs = corners.map(point => point.x), ys = corners.map(point => point.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * Returns a value on the grid while snapping is on.
 * @param {number} value - a coordinate in root units.
 * @returns {number} the nearest grid line, or the value when snapping is off.
 */
export function getSnapped(value) {
    return state.grid.snap ? Math.round(value / state.grid.size) * state.grid.size : value;
}

/**
 * Returns a box in root coordinates as a box on the stage, in screen pixels.
 * @param {ShapeBox} box - the box.
 * @returns {ShapeBox} the box relative to the stage.
 */
export function getScreenBox(box) {
    const matrix = getRootMatrix();
    const stage = elements.stage.getBoundingClientRect();
    const first = new DOMPoint(box.x, box.y).matrixTransform(matrix), second = new DOMPoint(box.x + box.w, box.y + box.h).matrixTransform(matrix);
    return { x: Math.min(first.x, second.x) - stage.left, y: Math.min(first.y, second.y) - stage.top, w: Math.abs(second.x - first.x), h: Math.abs(second.y - first.y) };
}
