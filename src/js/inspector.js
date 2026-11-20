/**
 * The properties panel. Without a selection it shows the document (size, viewBox) and the
 * colors for new shapes; with one: fill and outline, line style, opacity, text, position and
 * size, rotate and flip, the drawing order, and all attributes.
 *
 * While a field of the panel has focus, the panel is not drawn anew (that would take the
 * focus away); only the values of the other fields follow. setInspectorRebuild() draws it
 * anew all the same at the next renderInspector().
 */

import { state, elements } from './state.js?v=2';
import { formatNumber } from './svg-values.js?v=3';
import { findElements, getHexColor } from './util.js?v=3';
import { getBox } from './canvas.js?v=3';
import { getProperty, getComputedValue } from './edits.js?v=3';
import { LABELS, PAINTABLE, GEOMETRY, escapeHtml } from './labels.js?v=2';

const PERCENT = 100;
const DEFAULT_STROKE_WIDTH = 1;
const DEFAULT_FONT_SIZE = 16;
const BLACK = '#000000';
const WHITE = '#ffffff';
/** Line styles: stroke-dasharray value and name. */
const DASHES = [['', 'solid'], ['8 6', 'dashed'], ['2 4', 'dotted'], ['14 6 2 6', 'dash-dot']];
const LINE_ENDS = [['', 'default'], ['butt', 'flat'], ['round', 'round'], ['square', 'square']];
const CORNERS = [['', 'default'], ['miter', 'sharp'], ['round', 'round'], ['bevel', 'beveled']];
const WEIGHTS = [['', 'default'], ['300', 'light'], ['normal', 'normal'], ['600', 'semi-bold'], ['bold', 'bold'], ['900', 'black']];
const ALIGNMENTS = [['', 'left'], ['middle', 'center'], ['end', 'right']];

let isRebuildRequested = false;

/**
 * Has the next renderInspector() draw the panel anew, even while one of its fields has focus.
 * @returns {void}
 */
export function setInspectorRebuild() {
    isRebuildRequested = true;
}

/**
 * Draws the panel anew now, even while one of its fields has focus.
 * @returns {void}
 */
export function buildInspector() {
    setInspectorRebuild();
    renderInspector();
}

/**
 * Returns the options of a select.
 * @param {string[][]} options - [value, name] pairs.
 * @param {string} selected - the selected value.
 * @returns {string} the HTML of the options.
 */
function getOptionsHtml(options, selected) {
    return options.map(([value, name]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${name}</option>`).join('');
}

/**
 * Returns the row of a paint (fill or outline): color, color as text, None, opacity.
 * @param {number} index - the element.
 * @param {string} property - "fill" or "stroke".
 * @param {string} label - "Fill" or "Outline".
 * @returns {string} the HTML.
 */
function getPaintRowHtml(index, property, label) {
    const raw = getProperty(index, property);
    const computed = getComputedValue(index, property);
    const none = (raw ?? computed).trim() === 'none';
    const isUrl = /^url/i.test(raw || computed);
    const hex = getHexColor(raw && raw !== 'none' ? raw : computed) || state.lastPaints.get(state.modelEls[index].localName + property) || BLACK;
    const opacity = getProperty(index, property + '-opacity');
    const isInherited = raw == null;
    const model = state.modelEls[index];
    return `<div class="color" data-paint="${property}">
        <span class="field-title">${label}</span>
        <label class="color-field ${none ? 'none' : ''}" title="Pick the ${label.toLowerCase()} color"><input type="color" data-k="${property}" value="${hex}" aria-label="${label} color" data-title="${escapeHtml(label)} color · ${escapeHtml(index === 0 ? 'whole drawing' : LABELS[model.localName] || model.localName)}${model.id ? ' #' + escapeHtml(model.id) : ''}"><span></span></label>
        <input class="hex-value" data-k="${property}-text" value="${escapeHtml(raw ?? '')}" placeholder="${escapeHtml(isInherited ? (none ? 'none' : (getHexColor(computed) || computed)) + ' (inherited)' : '')}" spellcheck="false" aria-label="${label} color as text" title="Color as text, e.g. #ff0000, red or none">
        <button type="button" class="button small ${none ? 'on' : ''}" data-k="${property}-none" aria-pressed="${none}" title="No ${label.toLowerCase()}">None</button>
        ${isUrl ? '<span class="hint">Uses a gradient or pattern - picking a color replaces it.</span>' : ''}
        <label class="slider"><span>Opacity</span><input type="range" min="0" max="1" step="0.05" data-k="${property}-opacity" value="${opacity == null ? 1 : escapeHtml(opacity)}"><output>${Math.round((opacity == null ? 1 : +opacity) * PERCENT)}%</output></label>
    </div>`;
}

/**
 * Draws the panel for the selection, or for the document without one.
 * @returns {void}
 */
export function renderInspector() {
    const body = elements.inspector;
    const active = document.activeElement;
    if (body.contains(active) && active.matches('input, textarea, select') && state.drag == null && !isRebuildRequested) {
        updateInspectorValues();
        return;
    }
    isRebuildRequested = false;
    if (state.error) { body.innerHTML = '<p class="hint">The code contains an error. Once it is fixed, the shapes can be edited here again.</p>'; return; }
    if (!state.doc) { body.innerHTML = '<p class="muted">No valid SVG loaded.</p>'; return; }
    const index = state.sel > 0 ? state.sel : 0;
    const model = state.modelEls[index];
    let html = getPathHtml(index);
    html += index === 0 ? getDocumentHtml(model) : getShapeHtml(index, model);
    body.innerHTML = html + getAttributeListHtml(model);
}

/**
 * Returns the path from the root to the element, each step a button that selects it.
 * @param {number} index - the element.
 * @returns {string} the HTML.
 */
function getPathHtml(index) {
    const chain = [];
    for (let step = index; step >= 0; step = state.scanEls[step] ? state.scanEls[step].parent : -1) chain.unshift(step);
    return `<nav class="path" aria-label="Position in the document">${chain.map(step => {
        const model = state.modelEls[step];
        const label = step === 0 ? 'svg' : model.localName + (model.id ? '#' + model.id : '');
        return step === index ? `<b data-no-i18n>${escapeHtml(label)}</b>` : `<button type="button" data-select="${step}" data-no-i18n>${escapeHtml(label)}</button>`;
    }).join('<span>›</span>')}</nav>`;
}

/**
 * Returns the panel of the document: size, viewBox and the colors for new shapes.
 * @param {Element} model - the root element.
 * @returns {string} the HTML.
 */
function getDocumentHtml(model) {
    const viewBox = model.getAttribute('viewBox') || '';
    return `<h3>Document</h3>
        <div class="row3">
          <label class="field"><span>Width</span><input data-root="width" value="${escapeHtml(model.getAttribute('width') ?? '')}" placeholder="${formatNumber(state.naturalSize.w)}"></label>
          <label class="field"><span>Height</span><input data-root="height" value="${escapeHtml(model.getAttribute('height') ?? '')}" placeholder="${formatNumber(state.naturalSize.h)}"></label>
        </div>
        <label class="field"><span>viewBox <small>x y width height</small></span><input data-root="viewBox" value="${escapeHtml(viewBox)}" placeholder="0 0 ${formatNumber(state.naturalSize.w)} ${formatNumber(state.naturalSize.h)}" spellcheck="false"></label>
        <p class="hint">Click a shape on the canvas or in the Layers list to edit it. Alt+click selects the surrounding group.</p>
        <h3>Colors for new shapes</h3>
        <div class="defaults">
          <span>Fill</span><input type="color" data-def="fill" value="${state.defaults.fill === 'none' ? WHITE : state.defaults.fill}" aria-label="Fill color of new shapes" data-title="Fill color · new shapes"><label class="box"><input type="checkbox" data-def="fill-none" ${state.defaults.fill === 'none' ? 'checked' : ''}> None</label>
          <span>Outline</span><input type="color" data-def="stroke" value="${state.defaults.stroke === 'none' ? BLACK : state.defaults.stroke}" aria-label="Outline color of new shapes" data-title="Outline color · new shapes"><label class="box"><input type="checkbox" data-def="stroke-none" ${state.defaults.stroke === 'none' ? 'checked' : ''}> None</label>
          <span>Outline width</span><input type="number" min="0" step="0.5" data-def="sw" value="${state.defaults.sw}" aria-label="Outline width of new shapes">
        </div>`;
}

/**
 * Returns the panel of a selected shape.
 * @param {number} index - the element.
 * @param {Element} model - the element in the parsed drawing.
 * @returns {string} the HTML.
 */
function getShapeHtml(index, model) {
    const tag = model.localName;
    let html = `<h3>${escapeHtml(LABELS[tag] || tag)} <code>&lt;${escapeHtml(model.tagName)}&gt;</code></h3>`;
    if (PAINTABLE.has(tag)) html += getPaintHtml(index);
    const opacity = getProperty(index, 'opacity');
    html += `<label class="slider total"><span>Overall opacity</span><input type="range" min="0" max="1" step="0.05" data-k="opacity" value="${opacity == null ? 1 : escapeHtml(opacity)}"><output>${Math.round((opacity == null ? 1 : +opacity) * PERCENT)}%</output></label>`;
    if (tag === 'text') html += getTextHtml(index, model);
    if (GEOMETRY.has(tag)) html += getGeometryHtml(index);
    return html + getArrangeHtml();
}

/**
 * Returns fill, outline and line style of a shape.
 * @param {number} index - the element.
 * @returns {string} the HTML.
 */
function getPaintHtml(index) {
    const strokeWidth = getProperty(index, 'stroke-width');
    const dash = getProperty(index, 'stroke-dasharray') || '';
    const cap = getProperty(index, 'stroke-linecap') || '';
    const join = getProperty(index, 'stroke-linejoin') || '';
    return getPaintRowHtml(index, 'fill', 'Fill') + getPaintRowHtml(index, 'stroke', 'Outline') + `<div class="row3">
              <label class="field"><span>Outline width</span><input type="number" min="0" step="0.5" data-k="stroke-width" value="${escapeHtml(strokeWidth ?? '')}" placeholder="${escapeHtml(parseFloat(getComputedValue(index, 'stroke-width')) || DEFAULT_STROKE_WIDTH)}"></label>
              <label class="field"><span>Line style</span><select data-k="stroke-dasharray">${getOptionsHtml(DASHES, dash)}${dash && !DASHES.some(entry => entry[0] === dash) ? `<option selected value="${escapeHtml(dash)}">${escapeHtml(dash)}</option>` : ''}</select></label>
            </div>
            <div class="row3">
              <label class="field"><span>Line ends</span><select data-k="stroke-linecap">${getOptionsHtml(LINE_ENDS, cap)}</select></label>
              <label class="field"><span>Corners</span><select data-k="stroke-linejoin">${getOptionsHtml(CORNERS, join)}</select></label>
            </div>`;
}

/**
 * Returns the text, size, weight, font and alignment of a text.
 * @param {number} index - the element.
 * @param {Element} model - the text in the parsed drawing.
 * @returns {string} the HTML.
 */
function getTextHtml(index, model) {
    const hasChildren = model.children.length > 0;
    const fontSize = getProperty(index, 'font-size');
    const fontFamily = getProperty(index, 'font-family');
    const fontWeight = getProperty(index, 'font-weight') || '';
    const anchor = getProperty(index, 'text-anchor') || '';
    return `<h3>Text</h3>` + (hasChildren
        ? '<p class="hint">This text contains further elements (e.g. tspan) - please edit it in the code.</p>'
        : `<textarea id="f-text" rows="2" data-text>${escapeHtml(model.textContent)}</textarea>`) + `<div class="row3">
              <label class="field"><span>Size</span><input type="number" min="1" step="1" data-k="font-size" value="${escapeHtml(fontSize != null ? parseFloat(fontSize) : '')}" placeholder="${escapeHtml(parseFloat(getComputedValue(index, 'font-size')) || DEFAULT_FONT_SIZE)}"></label>
              <label class="field"><span>Weight</span><select data-k="font-weight">${getOptionsHtml(WEIGHTS, fontWeight)}</select></label>
            </div>
            <div class="row3">
              <label class="field"><span>Font</span><input data-k="font-family" value="${escapeHtml(fontFamily ?? '')}" placeholder="system-ui, sans-serif" list="fonts"></label>
              <label class="field"><span>Alignment</span><select data-k="text-anchor">${getOptionsHtml(ALIGNMENTS, anchor)}</select></label>
            </div>`;
}

/**
 * Returns position, size, rotate and flip of a shape.
 * @param {number} index - the element.
 * @returns {string} the HTML, "" when the shape has no box.
 */
function getGeometryHtml(index) {
    const box = getBox(index);
    if (!box) return '';
    return `<h3>Position and size</h3><div class="geo">
                  <label class="field" title="Left edge"><span>X</span><input type="number" step="any" data-box="x" value="${formatNumber(box.x)}"></label>
                  <label class="field" title="Top edge"><span>Y</span><input type="number" step="any" data-box="y" value="${formatNumber(box.y)}"></label>
                  <label class="field" title="Width"><span>W</span><input type="number" step="any" min="0" data-box="w" value="${formatNumber(box.w)}"></label>
                  <label class="field" title="Height"><span>H</span><input type="number" step="any" min="0" data-box="h" value="${formatNumber(box.h)}"></label>
                </div>
                <div class="button-row two">
                  <button type="button" class="button small" data-act="rot-" title="Rotate 15° to the left">⟲ Rotate left</button>
                  <button type="button" class="button small" data-act="rot+" title="Rotate 15° to the right">⟳ Rotate right</button>
                  <button type="button" class="button small" data-act="flip-h" title="Mirror left to right">⇆ Flip horizontal</button>
                  <button type="button" class="button small" data-act="flip-v" title="Mirror top to bottom">⇅ Flip vertical</button>
                </div>`;
}

/**
 * Returns the buttons of the drawing order, duplicate and delete.
 * @returns {string} the HTML.
 */
function getArrangeHtml() {
    return `<h3>Arrange</h3><p class="hint">Shapes further down in the code are drawn on top.</p><div class="button-row two">
            <button type="button" class="button small" data-act="up" title="One step forward (Ctrl+↑)">↑ Forward</button>
            <button type="button" class="button small" data-act="down" title="One step backward (Ctrl+↓)">↓ Backward</button>
            <button type="button" class="button small" data-act="front" title="Bring to front (Ctrl+Shift+↑)">⤒ To front</button>
            <button type="button" class="button small" data-act="back" title="Send to back (Ctrl+Shift+↓)">⤓ To back</button>
          </div>
          <div class="button-row two">
            <button type="button" class="button small" data-act="dup" title="Make a copy (Ctrl+D)">⧉ Duplicate</button>
            <button type="button" class="button small danger" data-act="del" title="Remove this shape (Delete key)">✕ Delete</button>
          </div>`;
}

/**
 * Returns the list of all attributes with a field each and the form to add one.
 * @param {Element} model - the element.
 * @returns {string} the HTML.
 */
function getAttributeListHtml(model) {
    let html = `<details class="attribute" ${state.isAttributeListOpen ? 'open' : ''}><summary>All attributes (advanced)</summary><div class="attr-list">`;
    for (const attribute of model.attributes) {
        html += `<div class="attr"><span title="${escapeHtml(attribute.name)}" data-no-i18n>${escapeHtml(attribute.name)}</span><input data-attr="${escapeHtml(attribute.name)}" value="${escapeHtml(attribute.value)}" spellcheck="false"><button type="button" class="remove" data-del-attr="${escapeHtml(attribute.name)}" title="Remove attribute" aria-label="Remove ${escapeHtml(attribute.name)}">✕</button></div>`;
    }
    html += `<form class="attr new" data-new-attr><input name="n" placeholder="Name" spellcheck="false" aria-label="New attribute: name"><input name="v" placeholder="Value" spellcheck="false" aria-label="New attribute: value"><button type="submit" class="remove" title="Add attribute" aria-label="Add attribute">+</button></form>`;
    return html + '</div></details>';
}

/**
 * Keeps the values of the panel current without overwriting the field that has focus.
 * @returns {void}
 */
function updateInspectorValues() {
    const index = state.sel > 0 ? state.sel : 0;
    const box = index > 0 ? getBox(index) : null;
    findElements('[data-box]', elements.inspector).forEach(field => {
        if (field === document.activeElement || !box) return;
        field.value = formatNumber(box[field.dataset.box]);
    });
    findElements('[data-attr]', elements.inspector).forEach(field => {
        if (field === document.activeElement) return;
        const value = state.modelEls[index]?.getAttribute(field.dataset.attr);
        if (value != null) field.value = value;
    });
}
