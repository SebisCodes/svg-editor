/**
 * Typing in the code field. The code view follows each key at once; the drawing is read again
 * after a short pause, and a longer pause makes the typing an undo step. The cursor selects the
 * element it stands in. Typing help: Tab and Shift+Tab indent, Enter keeps the indent (one
 * level deeper after a start tag, between a start and its end tag on a line of its own), and
 * ">" at the end of a start tag adds its end tag.
 */

import { state, elements } from './state.js?v=2';
import { getElementIndexAt } from './xml.js?v=6';
import { parseCodeTags, TEMPLATE_SYNTAX } from './svg-template.js?v=1';
import { renderCode, syncLayerScroll } from './code-view.js?v=6';
import { renderDrawing } from './view.js?v=6';
import { saveState } from './autosave.js?v=6';
import { addHistoryStep, undo, redo } from './history.js?v=6';
import { selectElement } from './selection.js?v=6';

const PARSE_DELAY = 250;                    // milliseconds of rest before the drawing is read again
const HISTORY_DELAY = 600;                  // milliseconds of rest before typing becomes an undo step
const INDENT = '  ';
const MOVING_KEY = /Arrow|Home|End|Page/;
const OPEN_TAG_AT_END = /<([\w:.-]+)(?:\s[^<>]*)?(?<!\/)>$/;
const TYPED_START_TAG = /^<([A-Za-z][\w:.-]*)(?:\s[^<>]*)?$/;

/** The timer that reads the drawing after typing; its id stays after it ran. */
let parseTimer = 0;

/**
 * Listens for typing, scrolling, clicks and keys in the code field.
 * @returns {void}
 */
export function startCodeInput() {
    const field = elements.ta;
    field.addEventListener('input', updateFromTyping);
    field.addEventListener('scroll', syncLayerScroll);
    field.addEventListener('click', selectAtCursor);
    field.addEventListener('keyup', event => { if (MOVING_KEY.test(event.key)) selectAtCursor(); });
    field.addEventListener('keydown', handleCodeKey);
}

/**
 * Tells whether typing has started a timer to read the drawing in this page; once true, it
 * stays true.
 * @returns {boolean} true after the first typing.
 */
export function hasParseTimer() {
    return parseTimer !== 0;
}

/**
 * Stops the timer that reads the drawing after typing.
 * @returns {void}
 */
export function stopParseTimer() {
    clearTimeout(parseTimer);
}

/**
 * Takes typed code: the code view at once, the drawing and the storage after a pause, an
 * undo step after a longer pause.
 * @returns {void}
 */
function updateFromTyping() {
    state.code = elements.ta.value;
    state.scanEls = parseCodeTags(state.code, TEMPLATE_SYNTAX);
    renderCode();
    clearTimeout(parseTimer);
    parseTimer = setTimeout(() => { renderDrawing(); saveState(); }, PARSE_DELAY);
    clearTimeout(state.historyTimer);
    state.historyTimer = setTimeout(addHistoryStep, HISTORY_DELAY);
}

/**
 * Selects the element the cursor stands in, when nothing is marked in the field.
 * @returns {void}
 */
function selectAtCursor() {
    if (state.error || !state.isMapped) return;
    const position = elements.ta.selectionStart;
    if (elements.ta.selectionEnd !== position) return;
    const index = getElementIndexAt(state.scanEls, position);
    if (index !== state.sel && !(index <= 0 && state.sel <= 0)) selectElement(index, { reveal: false });
}

/**
 * Replaces a range of the code field as if typed, so the browser's own undo and assistive
 * technology see it; the fallback sets the text directly.
 * @param {number} start - the start of the range.
 * @param {number} end - the end of the range.
 * @param {string} text - the new text.
 * @param {number} [selectionStart] - where the cursor goes, the end of the text when left out.
 * @param {number} [selectionEnd] - the end of a selection, the cursor alone when left out.
 * @returns {void}
 */
export function editCodeRange(start, end, text, selectionStart, selectionEnd) {
    const field = elements.ta;
    field.setSelectionRange(start, end);
    if (!document.execCommand || !document.execCommand('insertText', false, text)) {
        field.setRangeText(text, start, end, 'end');
        field.dispatchEvent(new Event('input'));
    }
    if (selectionStart != null) field.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
}

/**
 * Handles a key in the code field: undo and redo, Escape, and the typing help.
 * @param {KeyboardEvent} event - the keydown event.
 * @returns {void}
 */
function handleCodeKey(event) {
    const withModifier = event.ctrlKey || event.metaKey;
    if (withModifier && !event.altKey && (event.key === 'z' || event.key === 'Z')) { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
    if (withModifier && event.key === 'y') { event.preventDefault(); redo(); return; }
    if (event.key === 'Escape') { elements.ta.blur(); return; }
    if (event.key === 'Tab') { event.preventDefault(); editLineIndent(event.shiftKey); return; }
    if (event.key === 'Enter' && !withModifier) { event.preventDefault(); addNewLine(); return; }
    if (event.key === '>' && elements.ta.selectionStart === elements.ta.selectionEnd) closeTypedTag(event);
}

/**
 * Indents: Tab without a selection adds two spaces, with one indents its lines; Shift+Tab
 * removes one level from them.
 * @param {boolean} isOutdent - true for Shift+Tab.
 * @returns {void}
 */
function editLineIndent(isOutdent) {
    const value = elements.ta.value, start = elements.ta.selectionStart, end = elements.ta.selectionEnd;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    if (start === end && !isOutdent) { editCodeRange(start, end, INDENT); return; }
    const lineEnd = value.indexOf('\n', end - (end > start && value[end - 1] === '\n' ? 1 : 0));
    const blockEnd = lineEnd < 0 ? value.length : lineEnd;
    const lines = value.slice(lineStart, blockEnd).split('\n');
    const indented = lines.map(line => (isOutdent ? line.replace(/^ {1,2}|^\t/, '') : INDENT + line)).join('\n');
    editCodeRange(lineStart, blockEnd, indented, lineStart, lineStart + indented.length);
}

/**
 * Starts a new line with the indent of the current one; after a start tag one level deeper,
 * and between a start tag and its end tag on a line of its own between them.
 * @returns {void}
 */
function addNewLine() {
    const value = elements.ta.value, start = elements.ta.selectionStart, end = elements.ta.selectionEnd;
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let indent = /^[ \t]*/.exec(value.slice(lineStart))[0];
    const before = value.slice(lineStart, start).trimEnd();
    const after = value.slice(end);
    const opens = OPEN_TAG_AT_END.exec(before);
    if (opens && !/^\s*<\//.test(after)) indent += INDENT;
    if (opens && new RegExp('^</' + opens[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '>').test(after)) {
        editCodeRange(start, end, '\n' + indent + INDENT + '\n' + indent, start + '\n'.length + indent.length + INDENT.length);
        return;
    }
    editCodeRange(start, end, '\n' + indent);
}

/**
 * Adds the end tag of a start tag that was just typed.
 * @param {KeyboardEvent} event - the keydown event of ">".
 * @returns {void}
 */
function closeTypedTag(event) {
    const value = elements.ta.value, position = elements.ta.selectionStart;
    const tagStart = value.lastIndexOf('<', position - 1);
    const typed = value.slice(tagStart, position);
    const tag = TYPED_START_TAG.exec(typed);
    if (!tag || typed.endsWith('/') || value.slice(position).startsWith(`</${tag[1]}>`) || event.isComposing) return;
    event.preventDefault();
    editCodeRange(position, position, `></${tag[1]}>`, position + 1);
}
