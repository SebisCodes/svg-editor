/**
 * The addresses a CSS text names, read as the browser reads them, for a preview that holds some
 * of them back.
 *
 * CSS can spell an address with escapes ("u\72l(", "\75rl(", "\7b\7b" for "{{", an escaped
 * quote), which a pattern over the text as written reads differently from the browser. The CSS
 * is therefore held, not decoded:
 *   1. buildEscapeSafeCss() splits the CSS into declarations and rule heads (at ";", "{" and "}"
 *      outside strings, comments, escapes and parentheses) and leaves out each piece that holds a
 *      backslash and could name an address: it holds a function (a "(" outside its strings and
 *      escapes), a string, or is an at-rule. Escapes stay only where no address can stand
 *      (selectors and plain values such as `.md\:flex`).
 *   2. buildCssWithAddresses() reads the CSS left with each comment as a space (a comment between
 *      "u" and "rl(" keeps them two tokens, as the browser reads them; a bare url( keeps its text,
 *      where "/*" is part of the address) and lets the caller choose each address: url() quoted or
 *      bare, also left open at the end, every string of a CSS that holds image-set(),
 *      -webkit-image-set(), image() or cross-fade() (a custom property can hand one over), and
 *      @import at the start of a rule as a string or url(). An @import of another form is left out.
 * isEscapedCssValue() tells the same for an attribute an SVG reads as CSS (fill, filter, mask).
 * The module imports nothing, so every editor with a preview of CSS shares it as it is.
 */

/** The kind of address getAddress is asked for: a stylesheet of @import. */
export const IMPORT_ADDRESS = 'import';
/** The kind of address getAddress is asked for: a picture, font or other resource of url() and image-set(). */
export const RESOURCE_ADDRESS = 'resource';

const ESCAPE = '\\';
const QUOTES = new Set(['"', "'"]);
const PIECE_ENDS = new Set([';', '{', '}']);
/** Characters that end a string that is left open: CSS ends a string at a line break. */
const LINE_BREAKS = new Set(['\n', '\r', '\f']);
const WHITE_SPACE = /\s/;
/** A hexadecimal escape: up to six hex digits after the backslash and one white space character, CR LF counted as one. */
const HEX_ESCAPE = /^\\[0-9A-Fa-f]{1,6}(?:\r\n|[ \t\n\r\f])?/;
/** A function whose strings are addresses, anywhere in CSS. */
const STRING_ADDRESS_FUNCTION = /(?:image-set|image|cross-fade)\s*\(/i;
/** The text in front of a rule's start: nothing, or a ";", "{" or "}" and white space. */
const RULE_START = /(?:^|[;{}])\s*$/;
/** Functions whose strings are addresses. */
const STRING_ADDRESS_FUNCTIONS = new Set(['image-set', '-webkit-image-set', 'image', 'cross-fade', '-webkit-cross-fade']);
/** The characters of a name in front of "(". */
const NAME_CHARACTER = /[\w-]/;
/** @import at the place it starts. */
const IMPORT_RULE = /^@import(?![\w-])/i;
/** Characters of an address that a CSS string writes as a percent escape. */
const STRING_UNSAFE = /["\\\n\r\f]/g;

/**
 * A piece of CSS up to a ";", "{" or "}" outside strings, comments, escapes and parentheses.
 * @typedef {object} CssPiece
 * @property {string} text - the piece without the character that ends it.
 * @property {string} end - the character that ends it, empty at the end of the CSS.
 * @property {boolean} hasFunction - true when it holds "(" outside its strings, comments and escapes.
 * @property {boolean} hasString - true when it holds a string.
 */

/**
 * Builds the CSS a preview may read with patterns: each declaration or at-rule that holds a
 * backslash and could name an address is left out (header, step 1); the rest stays as written.
 * @param {string} css - the CSS as written.
 * @returns {string} the CSS with the held pieces left out; the CSS itself when it holds no backslash.
 */
export function buildEscapeSafeCss(css) {
    if (!css.includes(ESCAPE)) return css;
    return splitCssPieces(css).map(piece => (isHeldPiece(piece) ? '' : piece.text) + piece.end).join('');
}

/**
 * Tells whether an attribute value that an SVG reads as CSS holds a backslash together with a
 * function or a string, so an escape could spell an address in it.
 * @param {string} value - the attribute's value.
 * @returns {boolean} true when the value is held.
 */
export function isEscapedCssValue(value) {
    if (!value.includes(ESCAPE)) return false;
    return splitCssPieces(value).some(piece => piece.hasFunction || piece.hasString || piece.text.includes('@'));
}

/**
 * Builds a CSS text in which the caller chooses every address (header, step 2): the escape-safe
 * CSS with each comment as a space, each address replaced by what getAddress gives for it.
 * @param {string} css - the CSS as written.
 * @param {function(string, string): ?string} getAddress - gets an address and its kind
 *     (IMPORT_ADDRESS or RESOURCE_ADDRESS) and gives the address to write, null to keep it as
 *     written, or "" for an @import to leave the rule out.
 * @returns {string} the CSS with the chosen addresses.
 */
export function buildCssWithAddresses(css, getAddress) {
    const text = buildCssWithSpacedComments(buildEscapeSafeCss(css));
    const hasStringAddresses = STRING_ADDRESS_FUNCTION.test(text);
    const parts = [];
    const functions = [];
    let last = 0, index = 0;
    while (index < text.length) {
        const character = text[index];
        if (QUOTES.has(character)) {
            const end = findStringEnd(text, index);
            if (hasStringAddresses || functions.includes(true)) last = addAddress(parts, text, last, { start: index, end, address: getStringText(text, index, end), isImport: false, isString: true }, getAddress);
            index = end;
        } else if (character === ESCAPE) {
            index += getEscapeLength(text, index);
        } else if (character === '@' && IMPORT_RULE.test(text.slice(index, index + 8)) && RULE_START.test(text.slice(0, index))) {
            const rule = findImportRule(text, index);
            last = addAddress(parts, text, last, rule, getAddress);
            index = rule.end;
        } else if (character === '(' && getFunctionName(text, index).toLowerCase() === 'url') {
            const url = findUrl(text, index - 3);
            last = addAddress(parts, text, last, url, getAddress);
            index = url.end;
        } else {
            if (character === '(') functions.push(STRING_ADDRESS_FUNCTIONS.has(getFunctionName(text, index).toLowerCase()));
            if (character === ')') functions.pop();
            index++;
        }
    }
    return parts.join('') + text.slice(last);
}

/**
 * Builds CSS with each comment as one space; strings and escapes are read the way splitCssPieces
 * reads them, so a "/*" inside a string stays text.
 * @param {string} css - the CSS.
 * @returns {string} the CSS with its comments as spaces.
 */
function buildCssWithSpacedComments(css) {
    const parts = [];
    let last = 0, index = 0;
    while (index < css.length) {
        const character = css[index];
        if (QUOTES.has(character)) { index = findStringEnd(css, index); continue; }
        if (character === ESCAPE) { index += getEscapeLength(css, index); continue; }
        if (character === '(' && isBareUrl(css, index)) { index = findBareUrlEnd(css, index); continue; }
        if (character === '/' && css[index + 1] === '*') {
            parts.push(css.slice(last, index), ' ');
            index = findCommentEnd(css, index);
            last = index;
            continue;
        }
        index++;
    }
    return parts.join('') + css.slice(last);
}

/**
 * Tells whether a "(" opens a bare url(: the name "url" in front of it and no quote as the first
 * character after white space, so CSS reads the text up to ")" as one address.
 * @param {string} css - the CSS.
 * @param {number} parenthesis - where the "(" stands.
 * @returns {boolean} true for a bare url(.
 */
function isBareUrl(css, parenthesis) {
    return getFunctionName(css, parenthesis).toLowerCase() === 'url' && !QUOTES.has(css[findTokenStart(css, parenthesis + 1)]);
}

/**
 * Returns where a bare url( ends: after its ")", or at the end of the CSS.
 * @param {string} css - the CSS.
 * @param {number} parenthesis - where the "(" of url( stands.
 * @returns {number} the place after the address.
 */
function findBareUrlEnd(css, parenthesis) {
    const close = css.indexOf(')', parenthesis);
    return close < 0 ? css.length : close + 1;
}

/**
 * A place of an address in the CSS.
 * @typedef {object} CssAddress
 * @property {number} start - where the text to replace starts (the string, url( or @import).
 * @property {number} end - where it ends.
 * @property {?string} address - the address, null for an @import whose address cannot be read.
 * @property {boolean} isImport - true for an @import rule.
 * @property {boolean} [isString] - true for a string of image-set(), image() or cross-fade().
 * @property {string} [rest] - for an @import, what follows its address up to the end of the rule.
 */

/**
 * Adds the text before an address and the address the caller chose to the parts of the CSS; an
 * @import left out becomes a space, so the text around it stays apart as the browser reads it.
 * @param {string[]} parts - the parts written so far; changed.
 * @param {string} text - the CSS.
 * @param {number} last - where the text not yet written starts.
 * @param {CssAddress} place - the address and its place.
 * @param {function(string, string): ?string} getAddress - the caller's choice (buildCssWithAddresses).
 * @returns {number} where the text not yet written starts after the address.
 */
function addAddress(parts, text, last, place, getAddress) {
    const chosen = place.address === null ? '' : getAddress(place.address.trim(), place.isImport ? IMPORT_ADDRESS : RESOURCE_ADDRESS);
    if (chosen === null) return last;
    parts.push(text.slice(last, place.start));
    if (!place.isImport) parts.push(place.isString ? formatCssString(chosen) : `url(${formatCssString(chosen)})`);
    else parts.push(chosen === '' ? (text[place.end - 1] === ';' ? ' ;' : ' ') : `@import url(${formatCssString(chosen)})${place.rest}`);
    return place.end;
}

/**
 * Splits CSS into its declarations and rule heads (CssPiece), at ";", "{" and "}" outside
 * strings, comments, escapes and parentheses.
 * @param {string} css - the CSS.
 * @returns {CssPiece[]} the pieces in order; joined with their ends they give the CSS.
 */
function splitCssPieces(css) {
    const pieces = [];
    let start = 0, depth = 0, hasFunction = false, hasString = false, index = 0;
    while (index < css.length) {
        const character = css[index];
        if (character === '/' && css[index + 1] === '*') { index = findCommentEnd(css, index); continue; }
        if (QUOTES.has(character)) { hasString = true; index = findStringEnd(css, index); continue; }
        if (character === ESCAPE) { index += getEscapeLength(css, index); continue; }
        if (character === '(') { depth++; hasFunction = true; }
        else if (character === ')') depth = Math.max(0, depth - 1);
        else if (depth === 0 && PIECE_ENDS.has(character)) {
            pieces.push({ text: css.slice(start, index), end: character, hasFunction, hasString });
            start = index + 1;
            hasFunction = false;
            hasString = false;
        }
        index++;
    }
    pieces.push({ text: css.slice(start), end: '', hasFunction, hasString });
    return pieces;
}

/**
 * Tells whether a piece of CSS is held (header, step 1): it holds a backslash and a function,
 * is an at-rule, or holds a string while it is no plain declaration.
 * @param {CssPiece} piece - the piece.
 * @returns {boolean} true when the piece is left out.
 */
function isHeldPiece(piece) {
    if (!piece.text.includes(ESCAPE)) return false;
    return piece.hasFunction || piece.hasString || piece.text.trimStart().startsWith('@');
}

/**
 * Returns where a comment ends.
 * @param {string} css - the CSS.
 * @param {number} start - where the comment's "/*" stands.
 * @returns {number} the place after its end, or the end of the CSS for a comment left open.
 */
function findCommentEnd(css, start) {
    const end = css.indexOf('*/', start + 2);
    return end < 0 ? css.length : end + 2;
}

/**
 * Returns where a string ends: after its closing quote, before a line break, or at the end of
 * the CSS; a backslash takes the character after it into the string.
 * @param {string} css - the CSS.
 * @param {number} start - where the opening quote stands.
 * @returns {number} the place after the string.
 */
function findStringEnd(css, start) {
    const quote = css[start];
    let index = start + 1;
    while (index < css.length) {
        const character = css[index];
        if (character === ESCAPE) { index += getEscapeLength(css, index); continue; }
        if (character === quote) return index + 1;
        if (LINE_BREAKS.has(character)) return index;
        index++;
    }
    return css.length;
}

/**
 * Returns how many characters an escape takes: a hexadecimal escape with the one white space
 * character CSS reads with it, a backslash and a CR LF line break, or a backslash and the
 * character after it.
 * @param {string} css - the CSS.
 * @param {number} index - where the backslash stands.
 * @returns {number} the length of the escape, 2 or 3.
 */
function getEscapeLength(css, index) {
    const hex = HEX_ESCAPE.exec(css.slice(index, index + 9));
    if (hex) return hex[0].length;
    return css[index + 1] === '\r' && css[index + 2] === '\n' ? 3 : 2;
}

/**
 * Returns the text of a string without its quotes.
 * @param {string} css - the CSS.
 * @param {number} start - where the opening quote stands.
 * @param {number} end - the place after the string (findStringEnd).
 * @returns {string} the string's text.
 */
function getStringText(css, start, end) {
    const closed = end > start + 1 && css[end - 1] === css[start];
    return css.slice(start + 1, closed ? end - 1 : end);
}

/**
 * Returns the name of the function whose "(" stands at a place: the letters, digits, "_" and
 * "-" right in front of it.
 * @param {string} css - the CSS.
 * @param {number} parenthesis - where the "(" stands.
 * @returns {string} the name, empty for a "(" without one.
 */
function getFunctionName(css, parenthesis) {
    let start = parenthesis;
    while (start > 0 && NAME_CHARACTER.test(css[start - 1])) start--;
    return css.slice(start, parenthesis);
}

/**
 * Finds the address of a url(): a string, or the text up to ")" or the end of the CSS, so a
 * url( left open counts as well.
 * @param {string} css - the CSS.
 * @param {number} start - where "url(" starts.
 * @returns {CssAddress} the url() as a place to replace.
 */
function findUrl(css, start) {
    let index = findTokenStart(css, start + 4);
    let address;
    if (QUOTES.has(css[index])) {
        const stringEnd = findStringEnd(css, index);
        address = getStringText(css, index, stringEnd);
        index = stringEnd;
    } else {
        const close = css.indexOf(')', index);
        address = css.slice(index, close < 0 ? css.length : close);
        index = close < 0 ? css.length : close;
    }
    const close = css.indexOf(')', index);
    return { start, end: close < 0 ? css.length : close + 1, address, isImport: false };
}

/**
 * Finds the address of an @import rule: a string or a url(); a rule of another form has none.
 * The rule ends at the first ";" after its address outside strings, or at the end of the CSS.
 * @param {string} css - the CSS.
 * @param {number} start - where "@import" starts.
 * @returns {CssAddress} the rule as a place to replace.
 */
function findImportRule(css, start) {
    const index = findTokenStart(css, start + 7);
    if (QUOTES.has(css[index])) {
        const stringEnd = findStringEnd(css, index);
        const ruleEnd = findRuleEnd(css, stringEnd);
        return { start, end: ruleEnd, address: getStringText(css, index, stringEnd), isImport: true, rest: css.slice(stringEnd, ruleEnd) };
    }
    if (/^url\(/i.test(css.slice(index, index + 4))) {
        const url = findUrl(css, index);
        const ruleEnd = findRuleEnd(css, url.end);
        return { start, end: ruleEnd, address: url.address, isImport: true, rest: css.slice(url.end, ruleEnd) };
    }
    return { start, end: findRuleEnd(css, index), address: null, isImport: true, rest: '' };
}

/**
 * Returns where a rule ends: after its ";" outside strings, or at the end of the CSS.
 * @param {string} css - the CSS.
 * @param {number} start - where to start looking.
 * @returns {number} the place after the rule.
 */
function findRuleEnd(css, start) {
    let index = start;
    while (index < css.length) {
        const character = css[index];
        if (QUOTES.has(character)) { index = findStringEnd(css, index); continue; }
        if (character === ESCAPE) { index += getEscapeLength(css, index); continue; }
        if (character === ';') return index + 1;
        index++;
    }
    return css.length;
}

/**
 * Finds the first character at or after a place that is no white space.
 * @param {string} css - the CSS.
 * @param {number} start - where to start.
 * @returns {number} the place.
 */
function findTokenStart(css, start) {
    let index = start;
    while (index < css.length && WHITE_SPACE.test(css[index])) index++;
    return index;
}

/**
 * Formats an address as a CSS string in double quotes; quotes, backslashes and line breaks of
 * the address are written as percent escapes.
 * @param {string} address - the address.
 * @returns {string} the CSS string.
 */
function formatCssString(address) {
    return `"${String(address).replace(STRING_UNSAFE, character => encodeURIComponent(character))}"`;
}
