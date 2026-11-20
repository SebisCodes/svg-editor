/**
 * The values inside SVG attributes, read and written: numbers, transforms and style
 * declarations. Moving and resizing a shape on the canvas writes its new coordinates with
 * these functions and with those of svg-path.js.
 */

const DEFAULT_DIGITS = 2;
const SCALE_DIGITS = 4;
const ANGLE_DIGITS = 2;
const NEAR = 1e-6;
/** Degrees in half a turn (π radians). */
const HALF_TURN = 180;
const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi;

/* ---------- Numbers ---------- */

/**
 * Writes a number short: rounded, without trailing zeros, never "-0".
 * @param {number} value - the number.
 * @param {number} [digits] - the digits after the point at most.
 * @returns {string} the number as text.
 */
export function formatNumber(value, digits = DEFAULT_DIGITS) {
    const factor = 10 ** digits;
    let rounded = Math.round(value * factor) / factor;
    if (Object.is(rounded, -0)) rounded = 0;
    return String(rounded);
}

/**
 * Returns the numbers written in a text.
 * @param {*} text - the text, e.g. "10, 20 30" or "rgb(1, 2, 3)".
 * @returns {number[]} the numbers in order.
 */
export function getNumbers(text) {
    return (String(text || '').match(NUMBER) || []).map(Number);
}
/* ---------- Transforms ---------- */

/**
 * Tells whether two numbers are equal up to rounding.
 * @param {number} first - one number.
 * @param {number} second - the other.
 * @returns {boolean} true when they differ by less than a millionth.
 */
function isNear(first, second) {
    return Math.abs(first - second) < NEAR;
}

/**
 * Writes a 2D matrix as readably as possible: translate, scale, rotate(a cx cy), and only as
 * a last resort matrix(...).
 * @param {DOMMatrixReadOnly} matrix - the matrix.
 * @returns {string} the transform attribute, "" for the identity.
 */
export function formatMatrix(matrix) {
    const { a, b, c, d, e, f } = matrix;
    if (isNear(b, 0) && isNear(c, 0)) return formatScaleMatrix(matrix);
    if (isNear(a, d) && isNear(b, -c) && isNear(a * a + b * b, 1)) {
        const rotation = formatRotationMatrix(matrix);
        if (rotation) return rotation;
    }
    return `matrix(${[a, b, c, d].map(value => formatNumber(value, SCALE_DIGITS)).join(' ')} ${formatNumber(e)} ${formatNumber(f)})`;
}

/**
 * Writes a matrix without rotation or skew as translate and scale.
 * @param {DOMMatrixReadOnly} matrix - the matrix.
 * @returns {string} the transform, "" for the identity.
 */
function formatScaleMatrix({ a, d, e, f }) {
    const translate = isNear(e, 0) && isNear(f, 0) ? '' : `translate(${formatNumber(e)} ${formatNumber(f)})`;
    if (isNear(a, 1) && isNear(d, 1)) return translate;
    const scale = isNear(a, d) ? `scale(${formatNumber(a, SCALE_DIGITS)})` : `scale(${formatNumber(a, SCALE_DIGITS)} ${formatNumber(d, SCALE_DIGITS)})`;
    return translate ? `${translate} ${scale}` : scale;
}

/**
 * Writes a rotation matrix as rotate(angle) or rotate(angle cx cy); the center comes from
 * (I - R)·p = (e, f).
 * @param {DOMMatrixReadOnly} matrix - a rotation.
 * @returns {string} the transform, "" when the center cannot be found.
 */
function formatRotationMatrix({ a, b, c, d, e, f }) {
    const angle = Math.atan2(b, a) * HALF_TURN / Math.PI;
    if (isNear(e, 0) && isNear(f, 0)) return `rotate(${formatNumber(angle, ANGLE_DIGITS)})`;
    const determinant = (1 - a) * (1 - d) - (-c) * (-b);
    if (Math.abs(determinant) <= NEAR) return '';
    const centerX = ((1 - d) * e + c * f) / determinant;
    const centerY = (b * e + (1 - a) * f) / determinant;
    return `rotate(${formatNumber(angle, ANGLE_DIGITS)} ${formatNumber(centerX)} ${formatNumber(centerY)})`;
}

/* ---------- Style declarations ---------- */

/**
 * Reads a style attribute.
 * @param {?string} style - the style attribute, e.g. "fill:red;stroke:blue".
 * @returns {Map<string, string>} property -> value, in order.
 */
export function parseStyle(style) {
    const declarations = new Map();
    for (const part of String(style || '').split(';')) {
        const colon = part.indexOf(':');
        if (colon < 0) continue;
        const name = part.slice(0, colon).trim();
        if (name) declarations.set(name, part.slice(colon + 1).trim());
    }
    return declarations;
}

/**
 * Writes style declarations as a style attribute.
 * @param {Map<string, string>} declarations - property -> value.
 * @returns {string} the style attribute.
 */
export function formatStyle(declarations) {
    return [...declarations].map(([name, value]) => `${name}:${value}`).join(';');
}
