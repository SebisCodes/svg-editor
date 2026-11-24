/**
 * Template placeholders in SVG (?template=mustache or ?template=angle): a tag is text or part of a
 * quoted attribute value, and the server fills it in before the drawing is used.
 *
 * The drawing is read in these steps (view.js):
 *   1. buildCheckedCode() gives the text the browser parses, as long as the code: each tag inside
 *      the root element becomes a marker that carries the tag's number (template-markers.js), a
 *      tag inside a comment its safe brace form (so "--" in a name stays the comment's error), and
 *      each section tag outside the root element spaces, so the text around the root stays white
 *      space;
 *   2. the browser parses that text; its errors point to the same lines and columns as the code;
 *   3. setMarkedTags() (template-markers.js) writes every marker back as its tag, so the canvas, the properties and
 *      every start tag the canvas rewrites hold the tags as the syntax writes them;
 *   4. getTemplateError() adds the first placeholder error (sections, signs) as the code's error.
 * Without a syntax the code is parsed as it is.
 */

import { getTemplateSyntax, getTemplateNameByAddress, getTemplateTags, checkTemplateSections, convertTemplateTagsToBraces } from './template-tags.js?v=2';
import { createTemplateMarking, buildTemplateMarker } from './template-markers.js?v=1';
import { parseTags, getTagEnd, getMarkEnd, getDoctypeEnd, COMMENT_START, COMMENT_END, CDATA_START, CDATA_END, INSTRUCTION_START, INSTRUCTION_END, DECLARATION_START } from './xml.js?v=6';

/** The template syntax of the placeholders the address asks for with ?template=, or null. */
export const TEMPLATE_SYNTAX = getTemplateSyntax(getTemplateNameByAddress(globalThis.location ? globalThis.location.search : ''));
/** What Tidy up and Shrink say about a drawing with placeholders: they keep its code as written. */
export const TEMPLATE_FORMAT_NOTE = 'The drawing holds placeholders - its code stays as written';
/** What a change of a property says when the style attribute that holds it also holds placeholders. */
export const TEMPLATE_STYLE_NOTE = 'The style holds placeholders - edit it in the code';

/**
 * The text the browser parses and how its markers are written back.
 * @typedef {Object} CheckedCode
 * @property {string} text - the text, as long as the code.
 * @property {?import('./template-markers.js').TemplateMarking} marking - the markers' start character and the
 *     tags as written; null without a syntax.
 */

/**
 * Builds the text the browser parses (step 1 in the header).
 * @param {string} code - the code as written.
 * @param {?import('./template-tags.js').TemplateSyntax} syntax - the template syntax, or null for plain SVG.
 * @returns {CheckedCode} the text and the marking; the code itself without a syntax.
 */
export function buildCheckedCode(code, syntax) {
    if (!syntax) return { text: code, marking: null };
    const braced = convertTemplateTagsToBraces(code, syntax);
    const tags = getTemplateTags(code, syntax);
    const marking = createTemplateMarking(code, tags);
    const root = parseTags(braced)[0];
    const comments = findCommentRanges(braced);
    /**
     * Tells whether a tag stands outside the root element.
     * @param {import('./template-tags.js').TemplateTag} tag - the tag.
     * @returns {boolean} true before the root's start tag or after its end.
     */
    const isOutsideRoot = tag => !root || tag.start < root.start || tag.start >= root.end;
    let text = '', last = 0;
    tags.forEach((tag, index) => {
        const isInComment = comments.some(([from, to]) => from <= tag.start && tag.start < to);
        let standIn = braced.slice(tag.start, tag.end);
        if (tag.kind !== 'value' && !isInComment && isOutsideRoot(tag)) standIn = ' '.repeat(tag.end - tag.start);
        else if (!isInComment && marking) standIn = buildTemplateMarker(marking, index);
        text += code.slice(last, tag.start) + standIn;
        last = tag.end;
    });
    return { text: text + code.slice(last), marking };
}

/**
 * Finds the comments of a code; CDATA sections, processing instructions, declarations and quoted
 * attribute values are skipped.
 * @param {string} code - the code (tags in brace form).
 * @returns {number[][]} [from, to] of every comment, in order.
 */
function findCommentRanges(code) {
    const ranges = [];
    for (let at = code.indexOf('<'); at >= 0; at = code.indexOf('<', at + 1)) {
        if (code.startsWith(COMMENT_START, at)) {
            const end = getMarkEnd(code, COMMENT_END, at + COMMENT_START.length, code.length);
            ranges.push([at, end]);
            at = end - 1;
        } else if (code.startsWith(CDATA_START, at)) at = getMarkEnd(code, CDATA_END, at + CDATA_START.length, code.length) - 1;
        else if (code.startsWith(INSTRUCTION_START, at)) at = getMarkEnd(code, INSTRUCTION_END, at + INSTRUCTION_START.length, code.length) - 1;
        else if (code.startsWith(DECLARATION_START, at)) at = getDoctypeEnd(code, at);
        else if (/[A-Za-z_]/.test(code[at + 1] || '')) at = getTagEnd(code, at);
    }
    return ranges;
}

/**
 * Returns the first placeholder error of the code, in the shape of the code's errors: a section
 * left open, a stray or misplaced end tag, or a tag with a sign outside the syntax (step 4).
 * @param {string} code - the code as written.
 * @param {?import('./template-tags.js').TemplateSyntax} syntax - the template syntax, or null for plain SVG.
 * @returns {?import('./export.js').ParseError} the error with its line and column, or null.
 */
export function getTemplateError(code, syntax) {
    const problem = syntax ? checkTemplateSections(code, syntax)[0] : null;
    if (!problem) return null;
    const before = code.slice(0, problem.pos);
    const lineStart = before.lastIndexOf('\n') + 1;
    return { line: before.split('\n').length, col: problem.pos - lineStart + 1, msg: problem.msg, isTemplate: true };
}

/**
 * Finds the elements of the code as the editor reads them: with a template syntax in the text the
 * browser parses, so a tag reads as text.
 * @param {string} code - the code as written.
 * @param {?import('./template-tags.js').TemplateSyntax} syntax - the template syntax, or null for plain SVG.
 * @returns {import('./xml.js').TagRange[]} the elements in document order.
 */
export function parseCodeTags(code, syntax) {
    return parseTags(buildCheckedCode(code, syntax).text);
}

/**
 * Tells whether a text holds a template tag.
 * @param {?string} text - the text, e.g. an attribute value or the code.
 * @param {?import('./template-tags.js').TemplateSyntax} syntax - the template syntax, or null for plain SVG.
 * @returns {boolean} true when the syntax is set and the text holds a tag.
 */
export function hasTemplateTags(text, syntax) {
    return !!syntax && text != null && getTemplateTags(String(text), syntax).length > 0;
}

