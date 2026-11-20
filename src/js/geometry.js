/**
 * The new attributes of a moved, resized or flipped shape. Where the shape's coordinates are
 * plain numbers, they change (rectangles, circles, ellipses, lines, point lists, paths, text,
 * images); otherwise, and for groups and shapes with a transform, the change goes into the
 * transform attribute. Every mapping works in the coordinates of the shape's parent.
 */

import { state } from './state.js?v=2';
import { createMatrix } from './util.js?v=3';
import { getBox, getElementToRootMatrix } from './canvas.js?v=3';
import { formatNumber, getNumbers, formatMatrix } from './svg-values.js?v=3';
import { movePath, resizePath, getMappedPoints } from './svg-path.js?v=3';

const AXIS_TOLERANCE = 1e-9;
const PLAIN_NUMBER = /^\s*[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?\s*(px)?\s*$/i;

/**
 * Returns an element as it is now, as the start of a change.
 * @param {number} index - the element.
 * @returns {ShapeSnapshot} the snapshot.
 */
export function getSnapshot(index) {
    const model = state.modelEls[index];
    const attributes = {};
    for (const attribute of model.attributes) attributes[attribute.name] = attribute.value;
    const view = state.viewEls[index];
    let matrix = new DOMMatrix();
    try { const transform = view.transform && view.transform.baseVal.consolidate(); if (transform) matrix = createMatrix(transform.matrix); } catch (error) { /* no transform */ }
    const parentMatrix = getElementToRootMatrix(view.parentNode && view.parentNode.nodeType === 1 ? view.parentNode : state.viewRoot);
    return { tag: model.localName, attributes, matrix, parentMatrix, box: getBox(index), index };
}

/**
 * Tells whether an attribute value is a plain number (px allowed).
 * @param {?string} value - the value.
 * @returns {boolean} true for a plain number.
 */
function isPlainNumber(value) {
    return value != null && PLAIN_NUMBER.test(value);
}

/**
 * Returns the number of an attribute value.
 * @param {?string} value - the value.
 * @returns {number} the number, 0 when the value is missing or empty.
 */
function getNumberValue(value) {
    return value == null || value === '' ? 0 : parseFloat(value);
}

/**
 * Tells whether attributes hold a transform.
 * @param {Object<string, string>} attributes - the attributes by name.
 * @returns {boolean} true when the transform attribute is not empty.
 */
function hasTransform(attributes) {
    return !!attributes.transform && attributes.transform.trim() !== '';
}

/**
 * Tells whether a shape's coordinates can change directly, without a transform.
 * @param {ShapeSnapshot} snapshot - the shape.
 * @param {string} mode - "move", "resize" or "flip".
 * @returns {boolean} true when its coordinates can change.
 */
function isGeometryEditable(snapshot, mode) {
    if (hasTransform(snapshot.attributes)) return false;
    const attributes = snapshot.attributes;
    /**
     * Tells whether the attributes with these names are missing or plain numbers.
     * @param {string[]} names - the attribute names.
     * @returns {boolean} true when all are.
     */
    const hasPlainValues = names => names.every(name => attributes[name] == null || isPlainNumber(attributes[name]));
    switch (snapshot.tag) {
        case 'rect': case 'image': case 'foreignObject': case 'svg':
            return mode === 'move' ? hasPlainValues(['x', 'y']) : hasPlainValues(['x', 'y']) && isPlainNumber(attributes.width) && isPlainNumber(attributes.height);
        case 'use': return mode === 'move' && hasPlainValues(['x', 'y']);
        case 'circle': return hasPlainValues(['cx', 'cy', 'r']);
        case 'ellipse': return hasPlainValues(['cx', 'cy', 'rx', 'ry']);
        case 'line': return hasPlainValues(['x1', 'y1', 'x2', 'y2']);
        case 'polygon': case 'polyline': return true;
        case 'path': return true;
        case 'text':
            // A tspan with its own position would stay put when the x/y values move.
            return mode === 'move' && !state.modelEls[snapshot.index].querySelector('[x],[y]');
        default: return false;
    }
}

/**
 * Returns the attributes of a shape moved by (dx, dy) in its parent's coordinates.
 * @param {ShapeSnapshot} snapshot - the shape at the start of the move.
 * @param {number} dx - the shift to the right.
 * @param {number} dy - the shift down.
 * @returns {Object<string, ?string>} the changed attributes.
 */
export function getMovedAttributes(snapshot, dx, dy) {
    const attributes = snapshot.attributes;
    if (!isGeometryEditable(snapshot, 'move')) {
        const transform = formatMatrix(new DOMMatrix().translate(dx, dy).multiply(snapshot.matrix));
        return { transform: transform || null };
    }
    /**
     * Returns an attribute shifted.
     * @param {string} name - the attribute.
     * @param {number} delta - the shift.
     * @returns {string} the new value.
     */
    const getShifted = (name, delta) => formatNumber(getNumberValue(attributes[name]) + delta);
    switch (snapshot.tag) {
        case 'circle': case 'ellipse': return { cx: getShifted('cx', dx), cy: getShifted('cy', dy) };
        case 'line': return { x1: getShifted('x1', dx), y1: getShifted('y1', dy), x2: getShifted('x2', dx), y2: getShifted('y2', dy) };
        case 'polygon': case 'polyline': return { points: getMappedPoints(attributes.points, (x, y) => [x + dx, y + dy]) };
        case 'path': return { d: movePath(attributes.d || '', dx, dy) };
        case 'text': {
            const xs = getNumbers(attributes.x), ys = getNumbers(attributes.y);
            return { x: (xs.length ? xs : [0]).map(value => formatNumber(value + dx)).join(' '), y: (ys.length ? ys : [0]).map(value => formatNumber(value + dy)).join(' ') };
        }
        default: return { x: getShifted('x', dx), y: getShifted('y', dy) };
    }
}

/**
 * Returns the attributes of a shape after a mapping that only scales and shifts, in its
 * parent's coordinates; a mapping with rotation or a shape that cannot change its coordinates
 * gets a transform.
 * @param {ShapeSnapshot} snapshot - the shape at the start.
 * @param {DOMMatrix} mapping - the mapping in parent coordinates.
 * @param {string} [mode] - "resize" or "flip".
 * @returns {Object<string, ?string>} the changed attributes.
 */
export function getScaledAttributes(snapshot, mapping, mode = 'resize') {
    const isAxisAligned = Math.abs(mapping.b) < AXIS_TOLERANCE && Math.abs(mapping.c) < AXIS_TOLERANCE;
    if (!isAxisAligned || !isGeometryEditable(snapshot, mode)) {
        return { transform: formatMatrix(mapping.multiply(snapshot.matrix)) || null };
    }
    const attributes = snapshot.attributes;
    /**
     * Maps an x coordinate.
     * @param {number} x - the x.
     * @returns {number} the new x.
     */
    const getMappedX = x => mapping.a * x + mapping.e;
    /**
     * Maps a y coordinate.
     * @param {number} y - the y.
     * @returns {number} the new y.
     */
    const getMappedY = y => mapping.d * y + mapping.f;
    /**
     * Returns the number of an attribute.
     * @param {string} name - the attribute.
     * @returns {number} its number, 0 when missing.
     */
    const read = name => getNumberValue(attributes[name]);
    switch (snapshot.tag) {
        case 'circle': return { cx: formatNumber(getMappedX(read('cx'))), cy: formatNumber(getMappedY(read('cy'))), r: formatNumber(read('r') * Math.abs(mapping.a)) };
        case 'ellipse': return { cx: formatNumber(getMappedX(read('cx'))), cy: formatNumber(getMappedY(read('cy'))), rx: formatNumber(read('rx') * Math.abs(mapping.a)), ry: formatNumber(read('ry') * Math.abs(mapping.d)) };
        case 'line': return { x1: formatNumber(getMappedX(read('x1'))), y1: formatNumber(getMappedY(read('y1'))), x2: formatNumber(getMappedX(read('x2'))), y2: formatNumber(getMappedY(read('y2'))) };
        case 'polygon': case 'polyline': return { points: getMappedPoints(attributes.points, (x, y) => [getMappedX(x), getMappedY(y)]) };
        case 'path': return { d: resizePath(attributes.d || '', mapping.a, mapping.d, mapping.e, mapping.f) };
        default: {
            let x = getMappedX(read('x')), y = getMappedY(read('y')), width = read('width') * mapping.a, height = read('height') * mapping.d;
            if (width < 0) { x += width; width = -width; }
            if (height < 0) { y += height; height = -height; }
            return { x: formatNumber(x), y: formatNumber(y), width: formatNumber(width), height: formatNumber(height) };
        }
    }
}

/**
 * Returns a mapping in root coordinates as a mapping in the shape's parent coordinates:
 * P⁻¹·R·P.
 * @param {ShapeSnapshot} snapshot - the shape.
 * @param {DOMMatrix} rootMapping - the mapping in root coordinates.
 * @returns {DOMMatrix} the mapping in parent coordinates.
 */
export function getParentMapping(snapshot, rootMapping) {
    return snapshot.parentMatrix.inverse().multiply(rootMapping).multiply(snapshot.parentMatrix);
}

/**
 * Returns a shift in root coordinates as a shift in the shape's parent coordinates.
 * @param {ShapeSnapshot} snapshot - the shape.
 * @param {number} dx - the shift to the right in root units.
 * @param {number} dy - the shift down in root units.
 * @returns {number[]} [dx, dy] in parent units.
 */
export function getParentDelta(snapshot, dx, dy) {
    const origin = new DOMPoint(0, 0).matrixTransform(snapshot.parentMatrix.inverse());
    const moved = new DOMPoint(dx, dy).matrixTransform(snapshot.parentMatrix.inverse());
    return [moved.x - origin.x, moved.y - origin.y];
}
