/**
 * Path data and point lists: reading path data into commands, moving a path, scaling and
 * flipping it (the result in absolute commands, arcs with new radii and rotation), and
 * mapping the points of a polygon or polyline.
 */

import { formatNumber, getNumbers } from './svg-values.js?v=3';

const PATH_DIGITS = 3;
const ZERO_ANGLE = 1e-12;
const ANGLE_PRECISION = 1e6;
const FULL_TURN = 360;
/** Degrees in half a turn (π radians). */
const HALF_TURN = 180;
/** The places of the sweep flag and the end point among the values of an arc (A). */
const ARC_SWEEP = 4;
const ARC_X = 5;
const ARC_Y = 6;
const PATH_TOKEN = /([MLHVCSQTAZmlhvcsqtaz])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)|([\s,]+)|(.)/g;
/** How many numbers each path command takes. */
const PATH_PARAMETERS = { M: 2, L: 2, T: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, A: 7, Z: 0 };
/** The places of the two flags in the numbers of an arc. */
const ARC_FLAGS = [3, 4];

/**
 * One command of path data.
 * @typedef {Object} PathSegment
 * @property {string} c - the command letter as written (upper case absolute, lower case relative).
 * @property {number[]} v - its numbers.
 */

/**
 * A scale and shift of path coordinates: x' = scaleX·x + shiftX, y' = scaleY·y + shiftY.
 * @typedef {Object} PathMapping
 * @property {number} scaleX - the horizontal scale.
 * @property {number} scaleY - the vertical scale.
 * @property {number} shiftX - the shift to the right.
 * @property {number} shiftY - the shift down.
 */

/**
 * Where the pen of a path is while its commands are read.
 * @typedef {Object} PathPen
 * @property {number} x - the current x.
 * @property {number} y - the current y.
 * @property {number} startX - the x where the subpath started.
 * @property {number} startY - the y where the subpath started.
 */
/**
 * Splits path data into its commands and numbers.
 * @param {string} pathData - the d attribute.
 * @returns {string[]} the command letters and numbers in order.
 */
function getPathTokens(pathData) {
    const tokens = [];
    PATH_TOKEN.lastIndex = 0;
    let match;
    while ((match = PATH_TOKEN.exec(pathData))) {
        if (match[1]) tokens.push(match[1]);
        else if (match[2]) tokens.push(match[2]);
    }
    return tokens;
}

/**
 * Tells whether a path token is a command letter.
 * @param {string} token - the token.
 * @returns {boolean} true for a letter.
 */
function isCommand(token) {
    return /[a-z]/i.test(token) && isNaN(token);
}

/**
 * Reads path data into its commands. Arc flags may be written without separators
 * ("a1 1 0 01 10 10"); numbers after a move command count as lines.
 * @param {string} pathData - the d attribute.
 * @returns {PathSegment[]} the commands; reading stops at the first incomplete one.
 */
export function parsePath(pathData) {
    const segments = [];
    const tokens = getPathTokens(pathData);
    let position = 0, command = null;
    while (position < tokens.length) {
        const token = tokens[position];
        if (isCommand(token) && token.length === 1) {
            command = token;
            position++;
            if (command === 'z' || command === 'Z') segments.push({ c: command, v: [] });
            continue;
        }
        if (!command) { position++; continue; }
        const count = PATH_PARAMETERS[command.toUpperCase()];
        if (!count) { position++; continue; }
        const read = readPathNumbers(tokens, position, command, count);
        position = read.position;
        if (read.values.length < count) break;
        segments.push({ c: command, v: read.values });
        if (command === 'M') command = 'L';
        else if (command === 'm') command = 'l';
    }
    return segments;
}

/**
 * Reads the numbers of one path command; consumes the tokens it reads (a joined pair of arc
 * flags is split in the token list).
 * @param {string[]} tokens - the path tokens.
 * @param {number} position - where the numbers start.
 * @param {string} command - the command letter.
 * @param {number} count - how many numbers the command takes.
 * @returns {{values: number[], position: number}} the numbers and the position after them.
 */
function readPathNumbers(tokens, position, command, count) {
    const values = [];
    const isArc = command.toUpperCase() === 'A';
    while (values.length < count && position < tokens.length && !isCommand(tokens[position])) {
        const token = tokens[position];
        if (isArc && ARC_FLAGS.includes(values.length) && /^[01]{2,}/.test(token)) {
            values.push(+token[0]);
            tokens[position] = token.slice(1);
            continue;
        }
        values.push(+token);
        position++;
    }
    return { values, position };
}

/**
 * Writes path commands as path data.
 * @param {PathSegment[]} segments - the commands.
 * @returns {string} the d attribute.
 */
export function formatPath(segments) {
    return segments.map(segment => segment.c + segment.v.map(value => formatNumber(value, PATH_DIGITS)).join(' ')).join(' ');
}

/**
 * Moves a path; relative commands stay relative.
 * @param {string} pathData - the d attribute.
 * @param {number} dx - the shift to the right.
 * @param {number} dy - the shift down.
 * @returns {string} the moved path data.
 */
export function movePath(pathData, dx, dy) {
    const segments = parsePath(pathData);
    for (const [index, segment] of segments.entries()) {
        const upper = segment.c.toUpperCase();
        const absolute = segment.c === upper || (index === 0 && segment.c === 'm');
        if (!absolute) continue;
        if (index === 0 && segment.c === 'm') { segment.v[0] += dx; segment.v[1] += dy; continue; }
        if (upper === 'H') segment.v[0] += dx;
        else if (upper === 'V') segment.v[0] += dy;
        else if (upper === 'A') { segment.v[ARC_X] += dx; segment.v[ARC_Y] += dy; }
        else for (let k = 0; k < segment.v.length; k += 2) { segment.v[k] += dx; segment.v[k + 1] += dy; }
    }
    return formatPath(segments);
}

/**
 * Rounds an angle to six digits after the point.
 * @param {number} angle - the angle.
 * @returns {number} the rounded angle.
 */
function getRoundedAngle(angle) {
    return Math.round(angle * ANGLE_PRECISION) / ANGLE_PRECISION;
}

/**
 * Returns the radii and axis rotation of an arc's ellipse after scaling by scaleX and scaleY:
 * a flip mirrors the rotation, stretching a rotated ellipse gives new axes (from the
 * eigenvalues of A·Aᵀ, A the scaled ellipse matrix).
 * @param {number} rx - the radius along the ellipse's first axis.
 * @param {number} ry - the radius along its second axis.
 * @param {number} degrees - the rotation of its axes.
 * @param {number} scaleX - the horizontal scale.
 * @param {number} scaleY - the vertical scale.
 * @returns {number[]} [rx, ry, rotation in degrees].
 */
function getScaledArc(rx, ry, degrees, scaleX, scaleY) {
    const turn = degrees * Math.PI / HALF_TURN, cos = Math.cos(turn), sin = Math.sin(turn);
    if (Math.abs(sin) < ZERO_ANGLE || Math.abs(cos) < ZERO_ANGLE || Math.abs(scaleX) === Math.abs(scaleY)) {
        // Axes along x / y, or the same scale both ways: the radii scale, a flip mirrors the angle.
        const kx = Math.abs(scaleX), ky = Math.abs(scaleY);
        const radii = Math.abs(sin) < ZERO_ANGLE ? [rx * kx, ry * ky] : Math.abs(cos) < ZERO_ANGLE ? [rx * ky, ry * kx] : [rx * kx, ry * kx];
        return [...radii, scaleX * scaleY < 0 ? getRoundedAngle((FULL_TURN - degrees) % FULL_TURN) : degrees];
    }
    const m11 = scaleX * rx * cos, m12 = -scaleX * ry * sin, m21 = scaleY * rx * sin, m22 = scaleY * ry * cos;
    const p = m11 * m11 + m12 * m12, q = m11 * m21 + m12 * m22, r = m21 * m21 + m22 * m22;
    const mid = (p + r) / 2, deviation = Math.sqrt(((p - r) / 2) ** 2 + q * q);
    const angle = 0.5 * Math.atan2(2 * q, p - r) * HALF_TURN / Math.PI;
    return [Math.sqrt(mid + deviation), Math.sqrt(Math.max(0, mid - deviation)), getRoundedAngle((angle + FULL_TURN) % FULL_TURN)];
}

/**
 * Applies x' = scaleX·x + shiftX, y' = scaleY·y + shiftY to a path; the result uses absolute
 * commands.
 * @param {string} pathData - the d attribute.
 * @param {number} scaleX - the horizontal scale (negative flips).
 * @param {number} scaleY - the vertical scale (negative flips).
 * @param {number} shiftX - the shift to the right after scaling.
 * @param {number} shiftY - the shift down after scaling.
 * @returns {string} the new path data.
 */
export function resizePath(pathData, scaleX, scaleY, shiftX, shiftY) {
    const mapping = { scaleX, scaleY, shiftX, shiftY };
    const pen = { x: 0, y: 0, startX: 0, startY: 0 };
    const out = parsePath(pathData).map(segment => readResizedSegment(segment, mapping, pen));
    return formatPath(out);
}

/**
 * Reads one path command resized and absolute and moves the pen to its end (a reader that
 * consumes its input: the pen is its position).
 * @param {PathSegment} segment - the command.
 * @param {PathMapping} mapping - the scale and shift.
 * @param {PathPen} pen - the current point and the start of the subpath; changed.
 * @returns {PathSegment} the new command.
 */
function readResizedSegment(segment, mapping, pen) {
    const { scaleX, scaleY, shiftX, shiftY } = mapping;
    /**
     * Maps an x coordinate.
     * @param {number} x - the x.
     * @returns {number} the new x.
     */
    const getMappedX = x => scaleX * x + shiftX;
    /**
     * Maps a y coordinate.
     * @param {number} y - the y.
     * @returns {number} the new y.
     */
    const getMappedY = y => scaleY * y + shiftY;
    const upper = segment.c.toUpperCase();
    const relative = segment.c !== upper;
    const values = segment.v.slice();
    if (upper === 'Z') { pen.x = pen.startX; pen.y = pen.startY; return { c: 'Z', v: [] }; }
    if (upper === 'H') { const x = relative ? pen.x + values[0] : values[0]; pen.x = x; return { c: 'H', v: [getMappedX(x)] }; }
    if (upper === 'V') { const y = relative ? pen.y + values[0] : values[0]; pen.y = y; return { c: 'V', v: [getMappedY(y)] }; }
    if (upper === 'A') {
        const x = relative ? pen.x + values[ARC_X] : values[ARC_X], y = relative ? pen.y + values[ARC_Y] : values[ARC_Y];
        const sweep = scaleX * scaleY < 0 ? 1 - values[ARC_SWEEP] : values[ARC_SWEEP];
        pen.x = x; pen.y = y;
        return { c: 'A', v: [...getScaledArc(values[0], values[1], values[2], scaleX, scaleY), values[3], sweep, getMappedX(x), getMappedY(y)] };
    }
    const points = [];
    for (let k = 0; k < values.length; k += 2) {
        const x = relative ? pen.x + values[k] : values[k], y = relative ? pen.y + values[k + 1] : values[k + 1];
        points.push(getMappedX(x), getMappedY(y));
        if (k === values.length - 2) { pen.x = x; pen.y = y; }
    }
    if (upper === 'M') { pen.startX = pen.x; pen.startY = pen.y; }
    return { c: upper, v: points };
}

/**
 * Maps every point of a point list (polygon, polyline).
 * @param {string} points - the points attribute.
 * @param {function(number, number): number[]} mapPoint - returns [x, y] for a point.
 * @returns {string} the new points attribute, "x,y" pairs.
 */
export function getMappedPoints(points, mapPoint) {
    const values = getNumbers(points);
    const out = [];
    for (let k = 0; k + 1 < values.length; k += 2) {
        const [x, y] = mapPoint(values[k], values[k + 1]);
        out.push(formatNumber(x) + ',' + formatNumber(y));
    }
    return out.join(' ');
}
