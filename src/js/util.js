/**
 * Small helpers every area uses: finding page elements, keeping a number within limits,
 * reading a color as a hex code, a matrix from an SVG matrix, the short message at the
 * bottom (the toast) and whether the screen is a touch screen or narrow.
 */

import { elements } from './state.js?v=2';
import { getNumbers } from './svg-values.js?v=3';

const SHOWN_CLASS = 'shown';
const TOAST_DURATION = 2200;                // milliseconds a message stays
const BLACK = '#000000';
const RGB_PARTS = 3;
const RGBA_PARTS = 4;
const HEX_BASE = 16;

/** Phones and tablets: a swipe on the canvas scrolls the page, a tap selects. */
export const TOUCH = matchMedia('(pointer: coarse)');
/** The narrow layout: one pane at a time, the hint line and the zoom bar over the canvas. */
export const NARROW = matchMedia('(max-width: 860px)');

/** The media type of SVG files. */
export const SVG_TYPE = 'image/svg+xml';
const UNSAFE_FILE_CHARACTERS = /[\\/:*?"<>|]+/g;
const DEFAULT_FILE_NAME = 'drawing';

/** The message that a change needs code without errors. */
export const FIX_ERROR_FIRST = 'Please fix the error in the code first';

let toastTimer = 0;
const colorContext = document.createElement('canvas').getContext('2d');

/**
 * Returns the first element that matches a selector.
 * @param {string} selector - a CSS selector.
 * @param {ParentNode} [root] - where to look.
 * @returns {?Element} the element, or null.
 */
export function findElement(selector, root = document) {
    return root.querySelector(selector);
}

/**
 * Returns every element that matches a selector.
 * @param {string} selector - a CSS selector.
 * @param {ParentNode} [root] - where to look.
 * @returns {Element[]} the elements in document order.
 */
export function findElements(selector, root = document) {
    return [...root.querySelectorAll(selector)];
}

/**
 * Returns a number kept within limits.
 * @param {number} value - the number.
 * @param {number} min - the lower limit.
 * @param {number} max - the upper limit.
 * @returns {number} the number, or the limit it passed.
 */
export function getClamped(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

/**
 * Returns a DOMMatrix with the values of an SVG or DOM matrix.
 * @param {DOMMatrixReadOnly|SVGMatrix} matrix - the matrix.
 * @returns {DOMMatrix} a new matrix.
 */
export function createMatrix(matrix) {
    return new DOMMatrix([matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]);
}

/**
 * Tells whether a pointer event comes from a finger on a touch screen.
 * @param {PointerEvent} event - the event.
 * @returns {boolean} true for touch on a touch screen.
 */
export function isTouchPointer(event) {
    return event.pointerType === 'touch' && TOUCH.matches;
}

/**
 * Returns a CSS color as a hex code; the browser reads every way of writing a color.
 * @param {?string} color - the color as written.
 * @returns {?string} "#rrggbb", or null for none, a reference (url(...)), a transparent color or no color.
 */
export function getHexColor(color) {
    if (!color || color === 'none' || /^url/i.test(color)) return null;
    colorContext.fillStyle = BLACK;
    colorContext.fillStyle = color;
    const value = colorContext.fillStyle;
    if (value.startsWith('#')) return value;
    const parts = getNumbers(value);
    if (parts.length < RGB_PARTS) return null;
    if (parts.length === RGBA_PARTS && parts[3] === 0) return null;
    return '#' + parts.slice(0, RGB_PARTS).map(part => Math.round(part).toString(HEX_BASE).padStart(2, '0')).join('');
}

/**
 * Returns a name that can be a file name.
 * @param {?string} name - the drawing's name.
 * @returns {string} the name ("drawing" when empty) with "-" for every run of characters a file name cannot hold.
 */
export function getSafeFileName(name) {
    return (name || DEFAULT_FILE_NAME).replace(UNSAFE_FILE_CHARACTERS, '-');
}

/**
 * Shows a short message at the bottom of the editor.
 * @param {string} message - the message (translated by i18n.js on the page).
 * @returns {void}
 */
export function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add(SHOWN_CLASS);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => elements.toast.classList.remove(SHOWN_CLASS), TOAST_DURATION);
}
