/**
 * The example view of the SVG editor: the drawing filled with the page's examples
 * (template-expansion.js), each example written as text for its place, and the way back from
 * every element of the filled drawing to its element in the code.
 *
 * buildExampleDrawing() runs these steps:
 *   1. find the place of every tag (template-xml.js) and fill the template: text and attribute
 *      values get the example with XML's escapes, CSS (a style element or style attribute) only
 *      plain words and numbers, an event attribute, a script and the markup itself nothing;
 *   2. parse the filled text; an error ends the example view (the editor shows the template view
 *      with a note);
 *   3. lead every element of the filled drawing back to its element in the code: its "<" is
 *      copied text, which the map leads to the start of that element's start tag; an element of
 *      a list stands once per example row, an element of a hidden section not at all;
 *   4. hold back the references that held a placeholder in the code or differ from it
 *      (view-safety.js): only example pictures, the placeholder picture and local references show.
 * The filled drawing only goes to the canvas; edits on the canvas change the elements of the code.
 */

import { expandTemplate, findViewSegment } from './template-expansion.js?v=2';
import { getXmlTagPlaces, escapeXmlFill } from './template-xml.js?v=1';
import { parseTags, escapeText, escapeAttribute } from './xml.js?v=6';
import { parse } from './export.js?v=7';
import { setExampleReferences } from './view-safety.js?v=3';

/** What CSS keeps of an example: letters, digits, spaces and # % . , _ + -. */
const CSS_UNSAFE = /[^\p{L}\p{N} #%.,_+-]/gu;
/** An attribute that holds a script. */
const EVENT_ATTRIBUTE = /^(?:.*:)?on/i;
/** XML's escapes for text and attribute values. */
const XML_ESCAPES = { text: escapeText, attribute: escapeAttribute };

/**
 * The example view of a drawing.
 * @typedef {object} ExampleDrawing
 * @property {Element} root - the root of the filled drawing, its references held back.
 * @property {number[]} codeIndexes - for every element of the filled drawing (root first, document order),
 *     the index of its element in the code.
 */

/**
 * Builds the example view of a drawing (the steps in the header).
 * @param {string} code - the template.
 * @param {import('./template-tags.js').TemplateSyntax} syntax - the syntax.
 * @param {?import('./template-examples.js').TemplateExamples} examples - the page's examples, or null.
 * @param {Element[]} writtenElements - the elements of the code as the editor read them (tags as written), root first.
 * @param {import('./xml.js').TagRange[]} writtenTags - the places of those elements in the code.
 * @returns {ExampleDrawing} the filled drawing.
 * @throws {Error} when the filling goes past its limits, the filled text does not parse or an element has no way back.
 */
export function buildExampleDrawing(code, syntax, examples, writtenElements, writtenTags) {
    if (writtenTags.length !== writtenElements.length) throw new Error('The elements of the code and of the drawing differ');
    const view = buildExampleText(code, syntax, examples);
    const result = parse(view.text);
    if (result.error) throw new Error(`The filled drawing does not parse: ${result.error.msg}`);
    const root = result.doc.documentElement;
    const filledElements = [root, ...root.getElementsByTagName('*')];
    const codeIndexes = getCodeIndexes(view, filledElements.length, writtenTags);
    /**
     * Returns the data address of an example picture by name.
     * @param {string} name - the picture's name.
     * @returns {?string} the address, null for an unknown name.
     */
    const getExamplePicture = name => (examples && examples.pictures.has(name) ? examples.pictures.get(name).dataUrl : null);
    filledElements.forEach((element, index) => setExampleReferences(element, writtenElements[codeIndexes[index]] || null, getExamplePicture));
    return { root, codeIndexes };
}

/**
 * Fills the template with the examples, each written for its place in SVG (step 1 of the header).
 * @param {string} code - the template.
 * @param {import('./template-tags.js').TemplateSyntax} syntax - the syntax.
 * @param {?import('./template-examples.js').TemplateExamples} examples - the page's examples, or null.
 * @returns {import('./template-expansion.js').TemplateView} the filled text and its map.
 * @throws {import('./template-expansion.js').TemplateExpansionError} when the filling goes past its limits.
 */
export function buildExampleText(code, syntax, examples) {
    const places = getXmlTagPlaces(code, syntax);
    return expandTemplate(code, syntax, { examples, writeFill: (tag, fill, before) => escapeSvgFill(places.get(tag.start), fill.text, before) });
}

/**
 * Writes an example for its place in SVG.
 * @param {import('./template-xml.js').XmlTagPlace} place - where the tag stands.
 * @param {string} text - the example text, a picture's name or the label in brackets.
 * @param {string} before - the filled text just before the fill.
 * @returns {string} the text for the place.
 */
function escapeSvgFill(place, text, before) {
    const element = getLocalName(place.element);
    const isContent = place.kind === 'text' || place.kind === 'cdata';
    if ((place.kind === 'attribute' && EVENT_ATTRIBUTE.test(place.attribute)) || (isContent && element === 'script')) return '';
    if ((place.kind === 'attribute' && getLocalName(place.attribute) === 'style') || (isContent && element === 'style')) return text.replace(CSS_UNSAFE, '');
    return escapeXmlFill(place, text, XML_ESCAPES, before);
}

/**
 * Returns a name without its namespace prefix, in lower case.
 * @param {string} name - the name as written, e.g. "svg:style".
 * @returns {string} the local name, e.g. "style".
 */
function getLocalName(name) {
    return name.slice(name.indexOf(':') + 1).toLowerCase();
}

/**
 * Returns, for every element of the filled text, the index of its element in the code.
 * @param {import('./template-expansion.js').TemplateView} view - the filled text and its map.
 * @param {number} count - how many elements the parsed filled drawing has.
 * @param {import('./xml.js').TagRange[]} writtenTags - the places of the elements in the code.
 * @returns {number[]} the indexes in the code, in the order of the filled elements.
 * @throws {Error} when the elements of the filled text and of the parsed drawing differ, or one has no element in the code.
 */
function getCodeIndexes(view, count, writtenTags) {
    const filledTags = parseTags(view.text);
    if (filledTags.length !== count) throw new Error('The filled drawing and its text differ');
    const indexByStart = new Map(writtenTags.map(tag => [tag.start, tag.index]));
    return filledTags.map(tag => getCodeIndex(view, tag.start, indexByStart));
}

/**
 * Returns the index of the element of the code a start tag of the filled text comes from.
 * @param {import('./template-expansion.js').TemplateView} view - the filled text and its map.
 * @param {number} viewStart - where the start tag ("<") stands in the filled text.
 * @param {Map<number, number>} indexByStart - the elements of the code by the start of their start tag.
 * @returns {number} the index of the element in the code.
 * @throws {Error} when the "<" is no copied text or the code has no element there.
 */
function getCodeIndex(view, viewStart, indexByStart) {
    const segment = view.map[findViewSegment(view.map, viewStart)];
    const codeIndex = segment && segment.kind === 'copy' ? indexByStart.get(segment.codeStart + viewStart - segment.viewStart) : undefined;
    if (codeIndex === undefined) throw new Error('An element of the filled drawing has no element in the code');
    return codeIndex;
}
