/**
 * The editor's own color picker, in place of the browser's color dialog, so that it is
 * translated like the rest of the interface, says what is being colored and never opens
 * twice. Every <input type="color"> on the page opens it; the picker writes the chosen color
 * into that input and fires its input and change events, so the input keeps working like a
 * normal color field. data-title on the input names what is being colored.
 */

import { getRgbFromHex, getHexFromRgb, getHsvFromRgb, getRgbFromHsv } from './colors.js?v=2';
import { getClamped, NARROW } from './util.js?v=3';
import { addDialogOpenListener } from './dialogs.js?v=5';

/** The basic colors offered below the colors of the drawing. */
const BASIC = ['#000000', '#444444', '#888888', '#cccccc', '#ffffff', '#e63946', '#f4a261', '#e9c46a',
    '#2a9d8f', '#0f8f6f', '#457b9d', '#1d3557', '#7b2cbf', '#ff70a6', '#8d5524', '#a7c957'];
const BLACK = '#000000';
const DOCUMENT_COLOR_LIMIT = 16;
const FINE_STEP = 0.02;
const COARSE_STEP = 0.1;
const MARGIN = 8;
const GAP = 6;
const PERCENT = 100;
const COLOR_FIELD = 'input[type=color]';

let picker = null, input = null, startColor = '', hsv = [0, 0, 0];
/**
 * Returns the colors used in the drawing; set by startColorPicker().
 * @returns {string[]} the colors as written.
 */
let getDocumentColors = () => [];

/**
 * Returns the HTML of a row of color buttons.
 * @param {string[]} colors - the colors.
 * @returns {string} the HTML.
 */
function getSwatchesHtml(colors) {
    return colors.map(color => `<button type="button" style="background:${color}" data-color="${color}" title="${color}" aria-label="${color}"></button>`).join('');
}

/**
 * Builds the picker and its listeners; runs when it opens the first time.
 * @returns {void}
 */
function buildPicker() {
    picker = document.createElement('div');
    picker.className = 'color-picker';
    picker.hidden = true;
    picker.setAttribute('role', 'dialog');
    picker.setAttribute('aria-labelledby', 'cp-title');
    picker.innerHTML = `
        <div class="cp-header"><b id="cp-title"></b><button type="button" class="close" data-cp="close" aria-label="Close" title="Close">✕</button></div>
        <div class="cp-field" tabindex="0" role="slider" aria-label="Saturation and brightness (arrow keys)"><i class="cp-dot"></i></div>
        <input type="range" class="cp-hue" min="0" max="359" step="1" aria-label="Hue">
        <div class="cp-row">
            <span class="cp-before" title="Before - click to go back"></span><span class="cp-now" title="New color"></span>
            <input class="cp-hex" maxlength="7" spellcheck="false" autocomplete="off" aria-label="Color as hex code, e.g. #ff0000">
            <button type="button" class="button primary small" data-cp="done">Done</button>
        </div>
        <div class="cp-colors cp-doc"><span>Colors in this drawing</span><div></div></div>
        <div class="cp-colors"><span>Basic colors</span><div>${getSwatchesHtml(BASIC)}</div></div>`;
    document.body.append(picker);
    addFieldListeners(picker.querySelector('.cp-field'));
    picker.querySelector('.cp-hue').addEventListener('input', event => { hsv[0] = +event.target.value; updatePicker(true); });
    const hexField = picker.querySelector('.cp-hex');
    hexField.addEventListener('input', () => { const rgb = getRgbFromHex(hexField.value); if (rgb) { hsv = getHsvFromRgb(rgb); updatePicker(true, true); } });
    hexField.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); closePicker(); } });
    picker.addEventListener('click', handlePickerClick);
    picker.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); closePicker(); input && input.focus(); }
    });
}

/**
 * Listens for the saturation and brightness field: dragging and the arrow keys (Shift: big
 * steps).
 * @param {HTMLElement} field - the field.
 * @returns {void}
 */
function addFieldListeners(field) {
    /**
     * Sets saturation and brightness from a pointer on the field.
     * @param {PointerEvent} event - the pointer event.
     * @returns {void}
     */
    const setFromPointer = event => {
        const bounds = field.getBoundingClientRect();
        hsv[1] = getClamped((event.clientX - bounds.left) / bounds.width, 0, 1);
        hsv[2] = 1 - getClamped((event.clientY - bounds.top) / bounds.height, 0, 1);
        updatePicker(true);
    };
    field.addEventListener('pointerdown', event => { field.setPointerCapture(event.pointerId); setFromPointer(event); });
    field.addEventListener('pointermove', event => { if (field.hasPointerCapture(event.pointerId)) setFromPointer(event); });
    field.addEventListener('keydown', event => moveWithArrowKey(event));
}

/**
 * Moves saturation and brightness with the arrow keys (Shift: big steps).
 * @param {KeyboardEvent} event - the keydown event on the field.
 * @returns {void}
 */
function moveWithArrowKey(event) {
    const step = event.shiftKey ? COARSE_STEP : FINE_STEP;
    const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[event.key];
    if (!delta) return;
    event.preventDefault();
    hsv[1] = getClamped(hsv[1] + delta[0], 0, 1);
    hsv[2] = getClamped(hsv[2] + delta[1], 0, 1);
    updatePicker(true);
}

/**
 * Handles a click in the picker: a color button, the color before, Close and Done.
 * @param {MouseEvent} event - the click.
 * @returns {void}
 */
function handlePickerClick(event) {
    const swatch = event.target.closest('[data-color]');
    if (swatch) { hsv = getHsvFromRgb(getRgbFromHex(swatch.dataset.color)); updatePicker(true); return; }
    if (event.target.closest('.cp-before')) { hsv = getHsvFromRgb(getRgbFromHex(startColor)); updatePicker(true); return; }
    if (event.target.closest('[data-cp]')) closePicker();
}

/**
 * Shows the current color and, when live, writes it into the input. A field that left the
 * page (the panel was drawn anew) closes the picker: there is nothing left to color.
 * @param {boolean} isLive - true to write the color into the input.
 * @param {boolean} [isFromText] - true when the hex field is being typed in: it is left as it is.
 * @returns {void}
 */
function updatePicker(isLive, isFromText = false) {
    if (input && !input.isConnected) { picker.hidden = true; input = null; return; }
    const hex = getHexFromRgb(getRgbFromHsv(hsv));
    const field = picker.querySelector('.cp-field');
    field.style.setProperty('--hue', `hsl(${hsv[0]} 100% 50%)`);
    const dot = picker.querySelector('.cp-dot');
    dot.style.left = hsv[1] * PERCENT + '%';
    dot.style.top = (1 - hsv[2]) * PERCENT + '%';
    dot.style.background = hex;
    field.setAttribute('aria-valuetext', hex);
    picker.querySelector('.cp-hue').value = Math.round(hsv[0]);
    picker.querySelector('.cp-now').style.background = hex;
    if (!isFromText) picker.querySelector('.cp-hex').value = hex;
    if (isLive && input && input.value !== hex) {
        input.value = hex;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

/**
 * Places the picker below its input (above it when there is no room); on narrow screens it is
 * a sheet at the bottom.
 * @returns {void}
 */
function setPickerPosition() {
    if (!input || picker.hidden) return;
    const isNarrow = NARROW.matches;
    picker.classList.toggle('sheet', isNarrow);
    if (isNarrow) { picker.style.left = picker.style.top = ''; return; }
    const bounds = input.getBoundingClientRect();
    const width = picker.offsetWidth, height = picker.offsetHeight;
    const x = getClamped(bounds.left, MARGIN, innerWidth - width - MARGIN);
    let y = bounds.bottom + GAP;
    if (y + height > innerHeight - MARGIN) y = Math.max(MARGIN, bounds.top - height - GAP);
    picker.style.left = x + 'px';
    picker.style.top = y + 'px';
}

/**
 * Opens the picker for a color input; another open picker is closed first.
 * @param {HTMLInputElement} element - the color input.
 * @returns {void}
 */
export function openPicker(element) {
    if (!picker) buildPicker();
    if (input === element && !picker.hidden) return;
    closePicker();
    if (element.disabled) return;
    input = element;
    startColor = element.value || BLACK;
    hsv = getHsvFromRgb(getRgbFromHex(startColor) || [0, 0, 0]);
    picker.querySelector('#cp-title').textContent = element.dataset.title || element.getAttribute('aria-label') || 'Color';
    picker.querySelector('.cp-before').style.background = startColor;
    const used = [...new Set(getDocumentColors().map(color => color.toLowerCase()))].slice(0, DOCUMENT_COLOR_LIMIT);
    const documentColors = picker.querySelector('.cp-doc');
    documentColors.hidden = !used.length;
    documentColors.querySelector('div').innerHTML = getSwatchesHtml(used);
    // Inside a modal dialog the picker has to live in that dialog to be usable.
    (element.closest('dialog[open]') || document.body).append(picker);
    picker.hidden = false;
    updatePicker(false);
    setPickerPosition();
    picker.querySelector('.cp-field').focus({ preventScroll: true });
}

/**
 * Closes the picker; a changed color fires the input's change event.
 * @returns {void}
 */
export function closePicker() {
    if (!picker || picker.hidden) return;
    picker.hidden = true;
    const element = input;
    input = null;
    if (element && element.value !== startColor) element.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Tells whether the picker is open.
 * @returns {boolean} true while it is shown.
 */
export function isPickerOpen() {
    return !!picker && !picker.hidden;
}

/**
 * Opens the picker for a clicked color field in place of the browser's dialog (a click handler).
 * @param {MouseEvent} event - a click anywhere on the page.
 * @returns {void}
 */
function openPickerOnClick(event) {
    const element = event.target.closest && event.target.closest(COLOR_FIELD);
    if (!element) return;
    event.preventDefault();
    openPicker(element);
}

/**
 * Makes every color field open this picker in place of the browser's dialog; the picker
 * closes when a dialog opens.
 * @param {Object} options - the picker's options.
 * @param {function(): string[]} options.colors - returns the colors used in the drawing.
 * @returns {void}
 */
export function startColorPicker({ colors }) {
    getDocumentColors = colors;
    addDialogOpenListener(closePicker);
    document.addEventListener('click', openPickerOnClick, true);
    document.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && event.target.matches && event.target.matches(COLOR_FIELD)) { event.preventDefault(); openPicker(event.target); }
    }, true);
    document.addEventListener('pointerdown', event => {
        if (!isPickerOpen() || picker.contains(event.target) || (event.target.closest && event.target.closest(COLOR_FIELD) === input)) return;
        closePicker();
    }, true);
    addEventListener('resize', setPickerPosition);
    addEventListener('scroll', setPickerPosition, true);
}
