/**
 * XML as text: escaping and the place of every element in the code (the highlighting of the
 * code view is xml-highlight.js).
 *
 * parseTags() finds the elements in the same order as getElementsByTagName('*') after the
 * root, so element i of the code is element i of the parsed document; this is how a change on
 * the canvas finds the start tag it rewrites.
 */

export const SVGNS = 'http://www.w3.org/2000/svg';

export const COMMENT_START = '<!--';
export const COMMENT_END = '-->';
export const CDATA_START = '<![CDATA[';
export const CDATA_END = ']]>';
export const INSTRUCTION_START = '<?';
export const INSTRUCTION_END = '?>';
export const DECLARATION_START = '<!';
const NAME_LOOKAHEAD = 80;                  // characters read after "<" to find a tag name

/**
 * One element in the code.
 * @typedef {Object} TagRange
 * @property {number} index - its place in document order, the root is 0.
 * @property {string} name - its tag name.
 * @property {number} start - the offset of its "<".
 * @property {number} tagEnd - the offset after the ">" of its start tag.
 * @property {number} end - the offset after its end tag (after the start tag when it closes itself).
 * @property {boolean} selfClose - true for <tag/>.
 * @property {number} depth - how many elements it lies in.
 * @property {number} parent - the index of its parent, -1 for the root.
 * @property {number[]} inner - [start, end] of the content between its tags.
 */

/**
 * Escapes text for HTML or XML content.
 * @param {string} text - the text.
 * @returns {string} the text with &, < and > escaped.
 */
export function escapeText(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escapes text for an attribute value in quotes.
 * @param {string} text - the text.
 * @param {string} [quote] - the quote around the value, `"` or `'`.
 * @returns {string} the text with &, < and the quote escaped.
 */
export function escapeAttribute(text, quote = '"') {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(quote === "'" ? /'/g : /"/g, quote === "'" ? '&apos;' : '&quot;');
}

/**
 * Returns the end of a start tag, skipping quoted values.
 * @param {string} source - the code.
 * @param {number} offset - the offset of the "<".
 * @returns {number} the offset of the ">", or the length of the code.
 */
export function getTagEnd(source, offset) {
    let quote = null;
    for (let position = offset + 1; position < source.length; position++) {
        const char = source[position];
        if (quote) { if (char === quote) quote = null; }
        else if (char === '"' || char === "'") quote = char;
        else if (char === '>') return position;
    }
    return source.length;
}

/**
 * Returns the end of a DOCTYPE declaration, including an internal subset in square brackets.
 * @param {string} source - the code.
 * @param {number} offset - the offset of the "<!".
 * @returns {number} the offset of the ">", or the length of the code.
 */
export function getDoctypeEnd(source, offset) {
    let depth = 0;
    for (let position = offset + 2; position < source.length; position++) {
        const char = source[position];
        if (char === '"' || char === "'") {
            const quoteEnd = source.indexOf(char, position + 1);
            if (quoteEnd < 0) return source.length;
            position = quoteEnd;
        } else if (char === '[') depth++;
        else if (char === ']') depth--;
        else if (char === '>' && depth <= 0) return position;
    }
    return source.length;
}

/**
 * Returns the end of a comment, CDATA section, processing instruction or declaration that
 * starts at an offset.
 * @param {string} source - the code.
 * @param {number} offset - the offset of the "<".
 * @returns {number} the offset after it, or -1 when no such part starts there.
 */
function getSkippedPartEnd(source, offset) {
    const length = source.length;
    if (source.startsWith(COMMENT_START, offset)) return getMarkEnd(source, COMMENT_END, offset + COMMENT_START.length, length);
    if (source.startsWith(CDATA_START, offset)) return getMarkEnd(source, CDATA_END, offset + CDATA_START.length, length);
    if (source.startsWith(INSTRUCTION_START, offset)) return getMarkEnd(source, INSTRUCTION_END, offset + INSTRUCTION_START.length, length);
    if (source.startsWith(DECLARATION_START, offset)) return getDoctypeEnd(source, offset) + 1;
    return -1;
}

/**
 * Returns the offset after a closing mark.
 * @param {string} source - the code.
 * @param {string} mark - the closing mark, e.g. "-->".
 * @param {number} from - where to look from.
 * @param {number} length - the length of the code.
 * @returns {number} the offset after the mark, or the length of the code when it is missing.
 */
export function getMarkEnd(source, mark, from, length) {
    const found = source.indexOf(mark, from);
    return found < 0 ? length : found + mark.length;
}

/**
 * Finds every element in the code, in document order: the same order as the root followed by
 * getElementsByTagName('*').
 * @param {string} source - the code.
 * @returns {TagRange[]} the elements.
 */
export function parseTags(source) {
    const tags = [], open = [];
    const length = source.length;
    let offset = 0;
    while (offset < length) {
        const lt = source.indexOf('<', offset);
        if (lt < 0) break;
        const skippedEnd = getSkippedPartEnd(source, lt);
        if (skippedEnd >= 0) { offset = skippedEnd; continue; }
        if (source[lt + 1] === '/') { offset = readEndTag(source, lt, open); continue; }
        const tag = createTagRange(source, lt, tags.length, open);
        tags.push(tag);
        if (!tag.selfClose) open.push(tag);
        offset = tag.tagEnd;
    }
    for (const tag of open) tag.end = length;
    return tags;
}

/**
 * Reads an end tag: it closes the innermost open element (a reader that consumes its input:
 * the closed element leaves the open list and gets its end).
 * @param {string} source - the code.
 * @param {number} lt - the offset of the "</".
 * @param {TagRange[]} open - the open elements, innermost last; the closed one is removed.
 * @returns {number} the offset after the end tag.
 */
function readEndTag(source, lt, open) {
    const gt = source.indexOf('>', lt);
    const end = gt < 0 ? source.length : gt + 1;
    const tag = open.pop();
    if (tag) { tag.end = end; tag.inner[1] = lt; }
    return end;
}

/**
 * Returns the record of a start tag.
 * @param {string} source - the code.
 * @param {number} lt - the offset of the "<".
 * @param {number} index - the element's index.
 * @param {TagRange[]} open - the open elements, innermost last.
 * @returns {TagRange} the element.
 */
function createTagRange(source, lt, index, open) {
    const close = getTagEnd(source, lt);
    const tagEnd = Math.min(close + 1, source.length);
    const selfClose = source[close - 1] === '/';
    const name = /^[^\s/>]+/.exec(source.slice(lt + 1, lt + NAME_LOOKAHEAD));
    const parent = open.length ? open[open.length - 1].index : -1;
    return { index, name: name ? name[0] : '', start: lt, tagEnd, end: tagEnd, selfClose,
             depth: open.length, parent, inner: [tagEnd, tagEnd] };
}

/**
 * Returns the innermost element whose range holds an offset.
 * @param {TagRange[]} tags - the elements (parseTags()).
 * @param {number} offset - the offset in the code.
 * @returns {number} the element's index, -1 when none holds it.
 */
export function getElementIndexAt(tags, offset) {
    let best = -1;
    for (const tag of tags) {
        if (tag.start > offset) break;
        if (offset >= tag.start && offset < tag.end) best = tag.index;
    }
    return best;
}
