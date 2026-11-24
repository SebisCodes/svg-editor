/**
 * Reading the code as SVG and everything the editor writes out of a drawing: its natural
 * size, the export variants (SVG as written, tidied and shrunk, data URI, base64, CSS, HTML
 * <img>, React), a raster image (PNG, JPEG, WebP) and a file to download. A template with
 * placeholders keeps its code as written in the text formats, and a reference that holds a
 * placeholder shows the placeholder picture in a raster image (view-safety.js).
 */

import { SVGNS, escapeAttribute } from './xml.js?v=6';
import { formatSvg, compressSvg, convertToXml } from './xml-write.js?v=3';
import { convertToJsx } from './jsx.js?v=4';
import { formatNumber } from './svg-values.js?v=3';
import { setPlaceholderReferences } from './view-safety.js?v=5';
import { hasTemplateTags } from './svg-template.js?v=1';

/** Pixels per unit of the CSS units a width or height can have. */
const UNITS = { px: 1, pt: 4 / 3, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, em: 16, rem: 16 };
/** The size of an SVG without width, height or viewBox, as browsers draw it. */
const DEFAULT_SIZE = { w: 300, h: 150 };
const VIEW_BOX_VALUES = 4;
const RASTER_QUALITY = 0.92;
const URL_RELEASE_DELAY = 2000;             // milliseconds before a download's address is released
/** Characters a data URI writes percent-encoded. */
const URI_UNSAFE = /[\r\n%#()<>?[\\\]^`{|}]/g;

/**
 * An error in the code, as parse() reports it.
 * @typedef {Object} ParseError
 * @property {?number} [line] - the line, 1-based.
 * @property {?number} [col] - the column, 1-based.
 * @property {string} msg - the message.
 * @property {string} [fix] - "xmlns" when the namespace is missing.
 * @property {boolean} [isTemplate] - true for a placeholder error of a template, whose message the interface translates.
 */

/**
 * The text formats of a drawing for the Export dialog.
 * @typedef {Object} ExportVariants
 * @property {string} svg - the code as in the editor.
 * @property {string} pretty - the code tidied.
 * @property {string} mini - the code shrunk.
 * @property {string} uri - a data URI of the shrunk code.
 * @property {string} b64 - a base64 data URI.
 * @property {string} css - a CSS background-image declaration.
 * @property {string} img - an HTML <img> with the base64 data URI.
 * @property {string} jsx - a React component.
 */

/**
 * Returns a length in pixels.
 * @param {?string} value - a length with an optional CSS unit, e.g. "10mm".
 * @returns {?number} the pixels, null for a percentage, an unknown unit or no length.
 */
export function getLength(value) {
    const match = /^\s*([-+]?(?:\d*\.\d+|\d+\.?))\s*([a-z%]*)\s*$/i.exec(value || '');
    if (!match || match[2] === '%') return null;
    const factor = UNITS[match[2].toLowerCase() || 'px'];
    return factor ? +match[1] * factor : null;
}

/**
 * Returns the viewBox of a root element.
 * @param {Element} root - the <svg> element.
 * @returns {?number[]} [x, y, width, height], null when missing or not usable.
 */
export function getViewBox(root) {
    const values = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    return values.length === VIEW_BOX_VALUES && values.every(isFinite) && values[2] > 0 && values[3] > 0 ? values : null;
}

/**
 * Returns the natural size of a drawing in pixels: from width and height, a missing one from
 * the viewBox's aspect ratio, both from the viewBox when neither is set.
 * @param {Element} root - the <svg> element.
 * @returns {{w: number, h: number}} the size.
 */
export function getNaturalSize(root) {
    const viewBox = getViewBox(root);
    let width = getLength(root.getAttribute('width'));
    let height = getLength(root.getAttribute('height'));
    if (viewBox) {
        if (width && !height) height = width * viewBox[3] / viewBox[2];
        if (height && !width) width = height * viewBox[2] / viewBox[3];
        if (!width) { width = viewBox[2]; height = viewBox[3]; }
    }
    return { w: width || DEFAULT_SIZE.w, h: height || DEFAULT_SIZE.h };
}

/**
 * Reads code as SVG with the browser's XML parser.
 * @param {string} code - the code.
 * @returns {{doc: XMLDocument}|{error: ParseError}} the document, or the first error.
 */
export function parse(code) {
    const doc = new DOMParser().parseFromString(code, 'image/svg+xml');
    const parserError = doc.getElementsByTagName('parsererror')[0];
    if (parserError) return { error: getParseError(parserError.textContent || '') };
    const root = doc.documentElement;
    if (root.localName !== 'svg') return { error: { msg: 'The outermost element must be <svg>.' } };
    if (root.namespaceURI !== SVGNS) return { error: { msg: 'The <svg> element is missing xmlns="http://www.w3.org/2000/svg".', fix: 'xmlns' } };
    return { doc };
}

/**
 * Returns line, column and message from the browser's parser error.
 * @param {string} text - the text of the <parsererror> element.
 * @returns {ParseError} the error.
 */
function getParseError(text) {
    const line = /line(?: number)?[^\d]*(\d+)/i.exec(text);
    const column = /column[^\d]*(\d+)/i.exec(text);
    // The browser's message without its framing sentences ("This page contains the following errors", "Below is a rendering ...").
    const clean = text.replace(/This page contains the following errors:?/i, '').replace(/Below is a rendering of the page up to the first error\.?/i, '').trim();
    const first = clean.split('\n').find(row => row.trim()) || clean;
    const message = (/(?:error on line \d+ at column \d+|line number \d+, column \d+):\s*(.+)$/i.exec(first) || [])[1] || first;
    return { line: line ? +line[1] : null, col: column ? +column[1] : null, msg: message.trim() };
}

/**
 * Returns the text formats of a drawing.
 * @param {XMLDocument} doc - the parsed drawing.
 * @param {string} code - its code as in the editor.
 * @param {string} name - its name, for the alt text and the component's name.
 * @param {?import('./template-tags.js').TemplateSyntax} [syntax=null] - the template syntax; a code with
 *     its tags stays as written in the tidied and shrunk formats. Null for plain SVG.
 * @returns {ExportVariants} the formats.
 */
export function getExportVariants(doc, code, name, syntax = null) {
    const isTemplate = hasTemplateTags(code, syntax);
    const mini = isTemplate ? code.trim() : compressSvg(doc);
    // " becomes ' (shorter) only when the drawing has no ' of its own; otherwise it is percent-encoded, so nothing changes.
    const encoded = mini.replace(URI_UNSAFE, encodeURIComponent);
    const uri = 'data:image/svg+xml,' + (mini.includes("'") ? encoded.replace(/"/g, '%22') : encoded.replace(/"/g, "'"));
    const b64 = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(mini)));
    const natural = getNaturalSize(doc.documentElement);
    return {
        svg: code,
        pretty: isTemplate ? code : formatSvg(doc, code),
        mini,
        uri,
        b64,
        css: `background-image: url("${uri}");`,
        img: `<img src="${b64}" alt="${escapeAttribute(String(name))}" width="${formatNumber(natural.w)}" height="${formatNumber(natural.h)}">`,
        jsx: convertToJsx(doc, name),
    };
}

/**
 * Draws a drawing at a size onto a canvas and returns the picture.
 * @param {XMLDocument} doc - the parsed drawing.
 * @param {number} width - the width in pixels.
 * @param {number} height - the height in pixels.
 * @param {string} [type] - the picture type, e.g. "image/png".
 * @param {?string} [background] - a color to fill the background with, null for transparent.
 * @param {number} [quality] - the quality of JPEG and WebP, 0 to 1.
 * @returns {Promise<Blob>} the picture.
 */
export function convertToImage(doc, width, height, type = 'image/png', background = null, quality = RASTER_QUALITY) {
    const root = doc.documentElement.cloneNode(true);
    [root, ...root.querySelectorAll('*')].forEach(setPlaceholderReferences);
    const natural = getNaturalSize(doc.documentElement);
    if (!getViewBox(root)) root.setAttribute('viewBox', `0 0 ${formatNumber(natural.w)} ${formatNumber(natural.h)}`);
    root.setAttribute('width', width);
    root.setAttribute('height', height);
    const url = URL.createObjectURL(new Blob([convertToXml(root)], { type: 'image/svg+xml;charset=utf-8' }));
    const picture = { width, height, type, background, quality };
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.addEventListener('load', () => drawImageAsBlob(image, url, picture).then(resolve, reject));
        image.addEventListener('error', () => { URL.revokeObjectURL(url); reject(new Error('The drawing could not be rendered as an image.')); });
        image.src = url;
    });
}

/**
 * Draws a loaded image onto a canvas of the picture's size, frees the image's address and
 * returns the picture.
 * @param {HTMLImageElement} image - the drawing, loaded as an image.
 * @param {string} url - the object URL the image was loaded from; freed once it is drawn.
 * @param {Object} picture - width and height in pixels, picture type, background color (null for
 *   transparent) and quality of JPEG and WebP.
 * @returns {Promise<Blob>} the picture.
 * @throws {Error} when the canvas gives no picture (the Promise rejects).
 */
function drawImageAsBlob(image, url, picture) {
    const canvas = document.createElement('canvas');
    canvas.width = picture.width; canvas.height = picture.height;
    const context = canvas.getContext('2d');
    if (picture.background) { context.fillStyle = picture.background; context.fillRect(0, 0, picture.width, picture.height); }
    context.drawImage(image, 0, 0, picture.width, picture.height);
    URL.revokeObjectURL(url);
    return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The image came out empty.'))), picture.type, picture.quality));
}

/**
 * Hands data to the browser as a file to download.
 * @param {Blob|string} data - the content.
 * @param {string} filename - the file name.
 * @param {string} [type] - the media type of text content.
 * @returns {void}
 */
export function saveDownload(data, filename, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), URL_RELEASE_DELAY);
}
