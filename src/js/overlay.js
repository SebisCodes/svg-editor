/**
 * The overlay over the canvas, in screen coordinates relative to the stage: the grid (minor
 * and major lines), the outline of the shape under the pointer, the selection with its
 * handles, and on touch screens the grip that drags the selected shape.
 */

import { state, elements } from './state.js?v=2';
import { SVGNS } from './xml.js?v=6';
import { createMatrix, TOUCH } from './util.js?v=3';
import { getRootMatrix, getBox, getScreenBox } from './canvas.js?v=4';
import { getLength } from './export.js?v=7';

const MAJOR_EVERY = 5;                      // a major grid line every this many minor ones
const MIN_MINOR_STEP = 5;                   // screen pixels below which a grid level is hidden
const MIN_MAJOR_STEP = 8;
const GRIP_SIZE = 14;
const HANDLE_SIZE = 9;
const HANDLE_SIZE_TOUCH = 18;
const LINE_HANDLE_RADIUS = 6;
const LINE_HANDLE_RADIUS_TOUCH = 10;
const SIDE_HANDLE_ROOM = 2.7;
const HANDLE_CORNER_RADIUS = 2;
/** Moves the grid lines onto whole screen pixels. */
const GRID_PIXEL_SHIFT = 'translate(-0.5 -0.5)';               // handle sizes a side needs for its middle handle
/** The handles of a box: name -> [share of the width, share of the height]. */
const BOX_HANDLES = { nw: [0, 0], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1], s: [0.5, 1], sw: [0, 1], w: [0, 0.5] };

/**
 * The parts of the overlay.
 * @typedef {Object} OverlayParts
 * @property {SVGRectElement} min - the rectangle filled with the minor grid.
 * @property {SVGRectElement} maj - the rectangle filled with the major grid.
 * @property {SVGPatternElement} pMin - the pattern of the minor grid.
 * @property {SVGPatternElement} pMaj - the pattern of the major grid.
 * @property {SVGRectElement} hover - the outline of the shape under the pointer.
 * @property {SVGGElement} sel - the selection frame and its handles.
 */

/** @type {OverlayParts} */
let overlayParts = null;

/**
 * Builds the parts of the overlay. Runs once at the start.
 * @returns {void}
 */
export function startOverlay() {
    const overlay = elements.overlay;
    overlay.innerHTML = `<defs>
        <pattern id="g-min" patternUnits="userSpaceOnUse"><path fill="none" stroke="var(--grid)" stroke-width="1"/></pattern>
        <pattern id="g-maj" patternUnits="userSpaceOnUse"><path fill="none" stroke="var(--grid-strong)" stroke-width="1"/></pattern>
      </defs>
      <rect class="g-min" fill="url(#g-min)"/><rect class="g-maj" fill="url(#g-maj)"/>
      <rect class="hover"/><g class="sel"></g><rect class="marquee"/>`;
    overlayParts = {
        min: overlay.querySelector('.g-min'), maj: overlay.querySelector('.g-maj'),
        pMin: overlay.querySelector('#g-min'), pMaj: overlay.querySelector('#g-maj'),
        hover: overlay.querySelector('.hover'), sel: overlay.querySelector('.sel'),
    };
}

/**
 * Draws the overlay: grid, hover outline, selection with handles.
 * @returns {void}
 */
export function drawOverlay() {
    if (!state.viewRoot) return;
    const stage = elements.stage.getBoundingClientRect();
    const matrix = getRootMatrix();
    drawGrid(stage, matrix);
    drawHover();
    drawSelection(stage);
}

/**
 * Draws the minor and major grid over the paper; a level whose lines would lie too close is
 * hidden.
 * @param {DOMRect} stage - the stage on the screen.
 * @param {DOMMatrix} matrix - root coordinates to the screen.
 * @returns {void}
 */
function drawGrid(stage, matrix) {
    const paper = elements.paper.getBoundingClientRect();
    const isShown = state.grid.show && !state.error;
    const step = state.grid.size * matrix.a;
    const levels = [[overlayParts.min, overlayParts.pMin, step], [overlayParts.maj, overlayParts.pMaj, step * MAJOR_EVERY]];
    for (const [level, [rect, pattern, levelStep]] of levels.entries()) {
        const isVisible = isShown && levelStep >= (level ? MIN_MAJOR_STEP : MIN_MINOR_STEP);
        rect.style.display = isVisible ? '' : 'none';
        if (!isVisible) continue;
        const originX = matrix.e - stage.left, originY = matrix.f - stage.top;
        pattern.setAttribute('width', levelStep); pattern.setAttribute('height', levelStep);
        pattern.setAttribute('x', originX % levelStep); pattern.setAttribute('y', originY % levelStep);
        pattern.firstElementChild.setAttribute('d', `M ${levelStep} 0 V ${levelStep} H 0`);
        pattern.setAttribute('patternTransform', GRID_PIXEL_SHIFT);
        rect.setAttribute('x', paper.left - stage.left); rect.setAttribute('y', paper.top - stage.top);
        rect.setAttribute('width', Math.max(0, paper.width)); rect.setAttribute('height', Math.max(0, paper.height));
    }
}

/**
 * Draws the outline of the shape under the pointer, unless it is selected or a drag runs.
 * @returns {void}
 */
function drawHover() {
    const hoverBox = state.hoverIndex > 0 && state.hoverIndex !== state.sel && !state.drag ? getBox(state.hoverIndex) : null;
    overlayParts.hover.style.display = hoverBox ? '' : 'none';
    if (!hoverBox) return;
    const box = getScreenBox(hoverBox);
    setRectangle(overlayParts.hover, box.x, box.y, box.w, box.h);
}

/**
 * Draws the frame and handles of the selection and places the touch grip over it.
 * @param {DOMRect} stage - the stage on the screen.
 * @returns {void}
 */
function drawSelection(stage) {
    overlayParts.sel.innerHTML = '';
    elements.grip.hidden = true;
    if (state.sel <= 0 || state.error) return;
    const element = state.viewEls[state.sel];
    const rootBox = getBox(state.sel);
    if (!rootBox) return;
    const box = getScreenBox(rootBox);
    if (TOUCH.matches && state.tool === 'select') showGrip(box);
    addOverlayElement('rect', { class: 'frame', x: box.x, y: box.y, width: box.w, height: box.h });
    if (element.localName === 'line') drawLineHandles(element, stage);
    else drawBoxHandles(box);
}

/**
 * Places the touch grip over the selected shape, at least a finger wide.
 * @param {ShapeBox} box - the shape on the stage.
 * @returns {void}
 */
function showGrip(box) {
    const grow = Math.max(0, GRIP_SIZE - Math.min(box.w, box.h) / 2);
    Object.assign(elements.grip.style, { left: box.x - grow + 'px', top: box.y - grow + 'px', width: box.w + 2 * grow + 'px', height: box.h + 2 * grow + 'px' });
    elements.grip.hidden = false;
}

/**
 * Adds an element to the selection layer.
 * @param {string} tag - the SVG tag.
 * @param {Object<string, (string|number)>} attributes - its attributes.
 * @returns {void}
 */
function addOverlayElement(tag, attributes) {
    const element = document.createElementNS(SVGNS, tag);
    for (const name in attributes) element.setAttribute(name, attributes[name]);
    overlayParts.sel.appendChild(element);
}

/**
 * Draws the two end handles of a line.
 * @param {SVGLineElement} line - the line in the view.
 * @param {DOMRect} stage - the stage on the screen.
 * @returns {void}
 */
function drawLineHandles(line, stage) {
    const matrix = createMatrix(line.getScreenCTM());
    /**
     * Returns a coordinate of the line in pixels.
     * @param {string} name - the attribute.
     * @returns {number} its length, 0 when missing or unreadable.
     */
    const getCoordinate = name => { const value = line.getAttribute(name); return value == null ? 0 : (getLength(value) ?? 0); };
    [[getCoordinate('x1'), getCoordinate('y1'), 'p1'], [getCoordinate('x2'), getCoordinate('y2'), 'p2']].forEach(([x, y, handle]) => {
        const point = new DOMPoint(x, y).matrixTransform(matrix);
        addOverlayElement('circle', { class: 'handle', 'data-h': handle, cx: point.x - stage.left, cy: point.y - stage.top, r: TOUCH.matches ? LINE_HANDLE_RADIUS_TOUCH : LINE_HANDLE_RADIUS });
    });
}

/**
 * Draws the eight handles of a box; a side too short for its middle handle goes without.
 * @param {ShapeBox} box - the box on the stage.
 * @returns {void}
 */
function drawBoxHandles(box) {
    const size = TOUCH.matches ? HANDLE_SIZE_TOUCH : HANDLE_SIZE;
    for (const [handle, [shareX, shareY]] of Object.entries(BOX_HANDLES)) {
        if ((handle === 'n' || handle === 's') && box.w < size * SIDE_HANDLE_ROOM) continue;
        if ((handle === 'e' || handle === 'w') && box.h < size * SIDE_HANDLE_ROOM) continue;
        addOverlayElement('rect', { class: 'handle', 'data-h': handle, x: box.x + box.w * shareX - size / 2, y: box.y + box.h * shareY - size / 2, width: size, height: size, rx: HANDLE_CORNER_RADIUS });
    }
}

/**
 * Sets the position and size of a rectangle.
 * @param {SVGRectElement} rect - the rectangle.
 * @param {number} x - the left edge.
 * @param {number} y - the top edge.
 * @param {number} width - the width; below 0 counts as 0.
 * @param {number} height - the height; below 0 counts as 0.
 * @returns {void}
 */
function setRectangle(rect, x, y, width, height) {
    rect.setAttribute('x', x); rect.setAttribute('y', y);
    rect.setAttribute('width', Math.max(0, width)); rect.setAttribute('height', Math.max(0, height));
}
