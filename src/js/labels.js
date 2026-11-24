/**
 * The kinds of SVG elements as the properties and the layers show them: a readable name for
 * each tag, which elements hold others, which take colors and which have a position and
 * size.
 */

import { escapeText } from './xml.js?v=6';

/** A readable name for each tag. */
export const LABELS = {
    rect: 'Rectangle', circle: 'Circle', ellipse: 'Ellipse', line: 'Line', polyline: 'Polyline', polygon: 'Polygon',
    path: 'Path', text: 'Text', g: 'Group', image: 'Image', use: 'Reused element', svg: 'Nested SVG',
    a: 'Link', foreignObject: 'Embedded content', defs: 'Definitions', linearGradient: 'Linear gradient',
    radialGradient: 'Radial gradient', stop: 'Gradient stop', clipPath: 'Clip path', mask: 'Mask',
    pattern: 'Pattern', symbol: 'Symbol', style: 'Style sheet', title: 'Title', desc: 'Description', filter: 'Filter',
    marker: 'Marker', switch: 'Switch', metadata: 'Metadata', script: 'Script',
};
/** Elements that hold other elements: a dragged layer can be dropped into them. */
export const GROUPS = new Set(['g', 'a', 'svg', 'switch', 'defs', 'symbol', 'mask', 'clipPath', 'pattern', 'marker']);
/** Elements that take a fill and an outline. */
export const PAINTABLE = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'g', 'use', 'a', 'svg', 'tspan', 'symbol']);
/** Elements with a position and size. */
export const GEOMETRY = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'text', 'g', 'image', 'use', 'svg', 'a', 'foreignObject', 'switch']);

/**
 * Escapes a value for HTML text and attribute values in double quotes.
 * @param {*} value - the value; null and undefined give "".
 * @returns {string} the escaped text.
 */
export function escapeHtml(value) {
    return escapeText(String(value ?? '')).replace(/"/g, '&quot;');
}
