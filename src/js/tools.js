/**
 * The tools of the canvas and drawing new shapes. A drawing tool shows the shape while the
 * pointer moves, then writes it into the code with the colors for new shapes and goes back
 * to the select tool:
 *   1. rectangle and ellipse from corner to corner (Shift: square, circle), line from end to
 *      end (Shift: steps of 45°), pen a freehand line, smoothed at the end;
 *   2. a click without dragging gives a shape of a fifth of the drawing (at least four grid steps);
 *   3. an ellipse with equal radii becomes a circle;
 *   4. the text tool writes "Text" where it is clicked and puts the cursor in its text field.
 */

import { state, elements } from './state.js?v=2';
import { SVGNS } from './xml.js?v=6';
import { formatNumber } from './svg-values.js?v=3';
import { findElement, findElements } from './util.js?v=3';
import { getSnapped } from './canvas.js?v=4';
import { drawOverlay } from './overlay.js?v=4';
import { updateHint } from './hint.js?v=3';
import { addMarkup } from './structure.js?v=4';
import { showSidePanel } from './layout.js?v=4';

/** The tag each drawing tool makes. */
const TOOL_TAGS = { rect: 'rect', ellipse: 'ellipse', line: 'line', pen: 'path', text: 'text' };
const FALLBACK_COLOR = '#1d2b53';
const DEFAULT_STROKE_WIDTH = 2;
const PREVIEW_OPACITY = '0.85';
const TEXT_SIZE_SHARE = 12;                 // a new text is a twelfth of the drawing's height
const MIN_TEXT_SIZE = 8;
const TEXT_FOCUS_DELAY = 30;
const PEN_STEP = 2;                         // screen pixels between points of a freehand line
const PEN_TOLERANCE = 0.8;                  // screen pixels a smoothed line may deviate
const PEN_DIGITS = 1;
const TINY_DRAG = 4;                        // screen pixels below which a drag counts as a click
const CLICK_SIZE_SHARE = 5;
const CLICK_SIZE_GRID_STEPS = 4;
const ANGLE_STEP = Math.PI / 4;
const TEXT_FONT = 'system-ui, sans-serif';

/**
 * Returns the colors of a new shape from the colors for new shapes; lines and freehand lines
 * get an outline, text a fill.
 * @param {string} tag - the shape's tag.
 * @returns {Object<string, (string|number)>} the attributes.
 */
function getDrawStyle(tag) {
    const defaults = state.defaults;
    if (tag === 'line' || tag === 'path') return { fill: 'none', stroke: defaults.stroke === 'none' ? FALLBACK_COLOR : defaults.stroke, 'stroke-width': defaults.sw || DEFAULT_STROKE_WIDTH, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    if (tag === 'text') return { fill: defaults.fill === 'none' ? FALLBACK_COLOR : defaults.fill };
    const style = { fill: defaults.fill };
    if (defaults.stroke !== 'none' && defaults.sw > 0) { style.stroke = defaults.stroke; style['stroke-width'] = defaults.sw; }
    return style;
}

/**
 * Writes attributes as the attribute part of a tag.
 * @param {Object<string, (string|number)>} attributes - name -> value.
 * @returns {string} e.g. 'x="1" y="2"'.
 */
function getAttributeText(attributes) {
    return Object.entries(attributes).map(([name, value]) => `${name}="${value}"`).join(' ');
}

/**
 * Starts drawing with the chosen tool at a point.
 * @param {PointerEvent} event - the press.
 * @param {DOMPoint} point - the press in root coordinates.
 * @returns {void}
 */
export function startDraw(event, point) {
    const tag = TOOL_TAGS[state.tool];
    if (!tag) return;
    const x = getSnapped(point.x), y = getSnapped(point.y);
    if (tag === 'text') { addText(x, y); return; }
    const preview = document.createElementNS(SVGNS, tag);
    const style = getDrawStyle(tag);
    for (const name in style) preview.setAttribute(name, style[name]);
    preview.setAttribute('opacity', PREVIEW_OPACITY);
    state.viewRoot.appendChild(preview);
    state.drag = { type: 'draw', tag, el: preview, x0: x, y0: y, pts: [[point.x, point.y]], last: { x, y } };
    updateDrawPreview(state.drag, point, event);
}

/**
 * Adds a text at a point and puts the cursor in its text field (the side panel opens for it).
 * @param {number} x - the x in root coordinates, snapped.
 * @param {number} y - the y, snapped.
 * @returns {void}
 */
function addText(x, y) {
    const fontSize = Math.max(MIN_TEXT_SIZE, Math.round(state.naturalSize.h / TEXT_SIZE_SHARE));
    const attributes = { x: formatNumber(x), y: formatNumber(y), 'font-family': TEXT_FONT, 'font-size': fontSize, ...getDrawStyle('text') };
    const index = addMarkup(`<text ${getAttributeText(attributes)}>Text</text>`);
    setTool('select');
    if (index > 0) setTimeout(showTextField, TEXT_FOCUS_DELAY);
}

/**
 * Opens the side panel and puts the cursor in the text field of the selected text.
 * @returns {void}
 */
function showTextField() {
    const field = findElement('#f-text');
    if (!field) return;
    showSidePanel(true);
    field.focus();
    field.select();
}

/**
 * Returns the geometry of the shape being drawn from its start to a point.
 * @param {StageDrag} drag - the draw drag.
 * @param {DOMPoint} point - the pointer in root coordinates.
 * @param {?(PointerEvent|Object)} event - the event, or an object with shiftKey, for Shift.
 * @returns {Object<string, string>} the geometry attributes.
 */
function getDrawGeometry(drag, point, event) {
    let x = getSnapped(point.x), y = getSnapped(point.y);
    const { x0, y0, tag } = drag;
    if (tag === 'line') {
        if (event && event.shiftKey) {
            const angle = Math.round(Math.atan2(y - y0, x - x0) / ANGLE_STEP) * ANGLE_STEP;
            const length = Math.hypot(x - x0, y - y0);
            x = x0 + Math.cos(angle) * length; y = y0 + Math.sin(angle) * length;
        }
        return { x1: formatNumber(x0), y1: formatNumber(y0), x2: formatNumber(x), y2: formatNumber(y) };
    }
    let width = x - x0, height = y - y0;
    if (event && event.shiftKey) { const side = Math.max(Math.abs(width), Math.abs(height)); width = Math.sign(width || 1) * side; height = Math.sign(height || 1) * side; }
    const left = Math.min(x0, x0 + width), top = Math.min(y0, y0 + height);
    if (tag === 'rect') return { x: formatNumber(left), y: formatNumber(top), width: formatNumber(Math.abs(width)), height: formatNumber(Math.abs(height)) };
    return { cx: formatNumber(left + Math.abs(width) / 2), cy: formatNumber(top + Math.abs(height) / 2), rx: formatNumber(Math.abs(width) / 2), ry: formatNumber(Math.abs(height) / 2) };
}

/**
 * Returns path data through points.
 * @param {number[][]} points - [x, y] pairs.
 * @returns {string} the d attribute.
 */
function getPolylinePath(points) {
    return 'M' + points.map(point => formatNumber(point[0], PEN_DIGITS) + ' ' + formatNumber(point[1], PEN_DIGITS)).join(' L');
}

/**
 * Shows the shape being drawn up to the pointer.
 * @param {StageDrag} drag - the draw drag.
 * @param {DOMPoint} point - the pointer in root coordinates.
 * @param {PointerEvent} event - the event, for Shift.
 * @returns {void}
 */
export function updateDrawPreview(drag, point, event) {
    drag.last = point;
    if (drag.tag === 'path') {
        const [lastX, lastY] = drag.pts[drag.pts.length - 1];
        if (Math.hypot(point.x - lastX, point.y - lastY) * state.zoom >= PEN_STEP) drag.pts.push([point.x, point.y]);
        drag.el.setAttribute('d', getPolylinePath(drag.pts));
        return;
    }
    const geometry = getDrawGeometry(drag, point, event);
    for (const name in geometry) drag.el.setAttribute(name, geometry[name]);
    drag.shift = event && event.shiftKey;
}

/**
 * Smooths a freehand line: points that barely deviate from the straight line are dropped
 * (Douglas-Peucker).
 * @param {number[][]} points - [x, y] pairs.
 * @param {number} tolerance - the deviation that is dropped, in root units.
 * @returns {number[][]} the kept points.
 */
function getSmoothedPoints(points, tolerance) {
    if (points.length < 3) return points;
    let farthest = 0, farthestIndex = 0;
    const [ax, ay] = points[0], [bx, by] = points[points.length - 1];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    for (let index = 1; index < points.length - 1; index++) {
        const [px, py] = points[index];
        const distance = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / length;
        if (distance > farthest) { farthest = distance; farthestIndex = index; }
    }
    if (farthest <= tolerance) return [points[0], points[points.length - 1]];
    return getSmoothedPoints(points.slice(0, farthestIndex + 1), tolerance).slice(0, -1).concat(getSmoothedPoints(points.slice(farthestIndex), tolerance));
}

/**
 * Ends drawing: the shape goes into the code (step list at the top) and the select tool is
 * chosen again.
 * @param {StageDrag} drag - the draw drag.
 * @returns {void}
 */
export function stopDraw(drag) {
    drag.el.remove();
    const attributes = getFinalGeometry(drag);
    if (!attributes) { setTool('select'); return; }
    let tag = drag.tag, geometry = attributes;
    if (tag === 'ellipse' && geometry.rx === geometry.ry) { tag = 'circle'; geometry = { cx: geometry.cx, cy: geometry.cy, r: geometry.rx }; }
    addMarkup(`<${tag} ${getAttributeText({ ...geometry, ...getDrawStyle(drag.tag) })}/>`);
    setTool('select');
}

/**
 * Returns the geometry of the finished shape: the smoothed freehand line, the shape of a
 * click, or the dragged shape.
 * @param {StageDrag} drag - the draw drag.
 * @returns {?Object<string, (string|number)>} the attributes, null for a freehand line of one point.
 */
function getFinalGeometry(drag) {
    const isTiny = Math.hypot(drag.last.x - drag.x0, drag.last.y - drag.y0) * state.zoom < TINY_DRAG;
    if (drag.tag === 'path') {
        if (drag.pts.length < 2) return null;
        return { d: getPolylinePath(getSmoothedPoints(drag.pts, PEN_TOLERANCE / state.zoom)) };
    }
    if (!isTiny) return getDrawGeometry(drag, drag.last, { shiftKey: drag.shift });
    const size = Math.max(state.grid.size * CLICK_SIZE_GRID_STEPS, Math.round(Math.min(state.naturalSize.w, state.naturalSize.h) / CLICK_SIZE_SHARE));
    const { x0, y0 } = drag;
    if (drag.tag === 'rect') return { x: formatNumber(x0), y: formatNumber(y0), width: size, height: size };
    if (drag.tag === 'ellipse') return { cx: formatNumber(x0), cy: formatNumber(y0), rx: size / 2, ry: size / 2 };
    return { x1: formatNumber(x0), y1: formatNumber(y0), x2: formatNumber(x0 + size), y2: formatNumber(y0) };
}

/**
 * Chooses a tool: its button is pressed, the stage shows its cursor and the hint line says
 * what it does.
 * @param {string} tool - select, hand, rect, ellipse, line, pen or text.
 * @returns {void}
 */
export function setTool(tool) {
    state.tool = tool;
    findElements('[data-tool]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tool === tool)));
    elements.stage.dataset.tool = tool;
    if (tool !== 'select' && state.hoverIndex !== -1) state.hoverIndex = -1;
    drawOverlay();
    updateHint();
}
