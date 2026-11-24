/**
 * The code view: the highlighted code and the marked ranges behind the text field (the
 * selected element's start tag, the line with an error), the line and size count, the
 * scrolling of the layers with the field, and scrolling an element's start tag into view.
 */

import { state, elements, services } from './state.js?v=2';
import { escapeText } from './xml.js?v=6';
import { highlight } from './xml-highlight.js?v=3';
import { buildHighlightWithTemplateTags, convertTemplateTagsToBraces } from './template-tags.js?v=2';
import { TEMPLATE_SYNTAX } from './svg-template.js?v=1';
import { updateHistoryUi } from './history.js?v=7';

const LINE_HEIGHT = 20;
const HIGHLIGHT_LIMIT = 600000;             // characters up to which the code is highlighted
const BYTES_PER_KB = 1024;
const MEASURE_LENGTH = 100;                 // characters measured to find the width of one
const LEFT_MARGIN = 40;
const RIGHT_MARGIN = 60;
const VISIBLE_TOP_SHARE = 3;                // a revealed line lands a third down the field

let charWidth = 0;

/**
 * Draws the code view: highlighting, marks, wrapped rows, the count, and the undo buttons. With
 * a template syntax the code is highlighted in brace form and every tag is put back as written, inside the highlighting around it.
 * @returns {void}
 */
export function renderCode() {
    const code = state.code;
    elements.hl.innerHTML = code.length < HIGHLIGHT_LIMIT ? buildHighlightWithTemplateTags(highlight(convertTemplateTagsToBraces(code, TEMPLATE_SYNTAX)), TEMPLATE_SYNTAX, code) + '\n' : escapeText(code) + '\n';
    renderMarks();
    const lineCount = code.split('\n').length;
    services.lineWrap.update(code);
    const bytes = new Blob([code]).size;
    elements.status.textContent = `${lineCount} lines · ${bytes < BYTES_PER_KB ? bytes + ' B' : (bytes / BYTES_PER_KB).toFixed(1) + ' KB'}`;
    updateHistoryUi();
}

/**
 * Returns the ranges to mark: the selected element's start tag and the line with an error.
 * @returns {Array<[number, number, string]>} [start, end, class] in order of start.
 */
function getMarkRanges() {
    const code = state.code;
    const ranges = [];
    const tag = state.scanEls[state.sel];
    if (tag && state.sel > 0 && state.isMapped) ranges.push([tag.start, tag.tagEnd, 'sel']);
    if (state.error && state.error.line) {
        let position = 0;
        for (let line = 1; line < state.error.line && position >= 0; line++) position = code.indexOf('\n', position) + 1;
        if (position >= 0) {
            let end = code.indexOf('\n', position);
            if (end < 0) end = code.length;
            ranges.push([position, Math.max(end, position + 1), 'err']);
        }
    }
    return ranges.sort((first, second) => first[0] - second[0]);
}

/**
 * Draws the marked ranges behind the code.
 * @returns {void}
 */
export function renderMarks() {
    const code = state.code;
    let html = '', last = 0;
    for (const [start, end, className] of getMarkRanges()) {
        if (start < last) continue;
        html += escapeText(code.slice(last, start)) + `<mark class="${className}">` + escapeText(code.slice(start, end) || ' ') + '</mark>';
        last = end;
    }
    elements.marks.innerHTML = html + escapeText(code.slice(last)) + '\n';
}

/**
 * Moves the highlighting, the marks and the line numbers with the scrolled code field.
 * @returns {void}
 */
export function syncLayerScroll() {
    const shift = `translate(${-elements.ta.scrollLeft}px, ${-elements.ta.scrollTop}px)`;
    elements.hl.style.transform = shift;
    elements.marks.style.transform = shift;
    elements.gutter.style.transform = `translateY(${-elements.ta.scrollTop}px)`;
}

/**
 * Returns the line of an offset in the code.
 * @param {number} offset - the offset.
 * @returns {number} the line, 0-based.
 */
function getLineIndex(offset) {
    let line = 0;
    for (let position = state.code.indexOf('\n'); position >= 0 && position < offset; position = state.code.indexOf('\n', position + 1)) line++;
    return line;
}

/**
 * Scrolls the start tag of an element into view in the code field.
 * @param {number} index - the element.
 * @returns {void}
 */
export function showInCode(index) {
    const tag = state.scanEls[index];
    if (!tag || !state.isMapped) return;
    const field = elements.ta;
    const top = services.lineWrap.getLineTop(getLineIndex(tag.start)), height = field.clientHeight;
    if (top < field.scrollTop + LINE_HEIGHT || top > field.scrollTop + height - LINE_HEIGHT * 2) {
        field.scrollTop = Math.max(0, top - height / VISIBLE_TOP_SHARE);
    }
    const column = tag.start - (state.code.lastIndexOf('\n', tag.start - 1) + 1);
    const x = column * getCharWidth();
    if (x < field.scrollLeft || x > field.scrollLeft + field.clientWidth - RIGHT_MARGIN) field.scrollLeft = Math.max(0, x - LEFT_MARGIN);
    syncLayerScroll();
}

/**
 * Returns the width of one character of the code font; measured once and kept.
 * @returns {number} the width in pixels.
 */
function getCharWidth() {
    if (!charWidth) {
        const probe = document.createElement('span');
        probe.textContent = 'x'.repeat(MEASURE_LENGTH);
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
        probe.style.font = getComputedStyle(elements.ta).font;
        document.body.appendChild(probe);
        charWidth = probe.getBoundingClientRect().width / MEASURE_LENGTH;
        probe.remove();
    }
    return charWidth;
}
