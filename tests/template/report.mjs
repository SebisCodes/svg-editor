/**
 * Reads a JSON list of cases (argv[3]) and runs each through the SVG editor's modules in src/js
 * (argv[2]) as the editor runs them: the text the browser parses (svg-template.js), the
 * placeholder error, the elements of the code, the highlighting, the writing of values that
 * hold tags and the filled text of the example view (svg-examples.js). Prints one JSON result
 * per case for template_test.py.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.location = { search: '', hash: '', origin: 'http://localhost' };
const scriptFolder = process.argv[2];
const cases = JSON.parse(readFileSync(process.argv[3], 'utf8'));
const { buildCheckedCode, getTemplateError, parseCodeTags, hasTemplateTags } = await importModule('svg-template.js');
const { highlight } = await importModule('xml-highlight.js');
const { parseTags, escapeAttribute } = await importModule('xml.js');
const template = await importModule('template-tags.js');
const { buildExampleText } = await importModule('svg-examples.js');
const { createTemplateExamples } = await importModule('template-examples.js');

/**
 * Imports a module of the editor by its file name.
 * @param {string} fileName - the file in src/js, e.g. "xml.js".
 * @returns {Promise<object>} the module's exports.
 */
function importModule(fileName) {
    return import(pathToFileURL(join(scriptFolder, fileName)).href);
}

/**
 * One case of template_test.py.
 * @typedef {object} TemplateCase
 * @property {string} code - the SVG code.
 * @property {?string} template - the template syntax, or null for plain SVG.
 * @property {string} [value] - an attribute value to write as the canvas writes it.
 * @property {object} [examples] - a page's template message, whose examples fill the code.
 */

/**
 * Builds the result of one case: what the editor makes of its code with its template syntax.
 * @param {TemplateCase} testCase - the code and the template syntax.
 * @returns {Promise<object>} the text the browser parses, the tags it stands for, the error, the elements,
 *     the highlighted HTML, the written value and the filled text.
 */
async function buildCaseResult(testCase) {
    const syntax = template.getTemplateSyntax(testCase.template);
    const checked = buildCheckedCode(testCase.code, syntax);
    const examples = testCase.examples ? await createTemplateExamples(testCase.examples, { decodePicture: async () => ({ width: 1, height: 1 }) }) : null;
    return {
        browserText: checked.text,
        labels: checked.marking ? checked.marking.labels : [],
        markerStart: checked.marking ? checked.marking.start : null,
        error: getTemplateError(testCase.code, syntax),
        elements: parseCodeTags(testCase.code, syntax).map(tag => [tag.name, tag.start, tag.tagEnd]),
        plainElements: parseTags(testCase.code).map(tag => [tag.name, tag.start, tag.tagEnd]),
        hasTags: hasTemplateTags(testCase.code, syntax),
        plainHighlighted: highlight(testCase.code),
        highlighted: template.buildHighlightWithTemplateTags(highlight(template.convertTemplateTagsToBraces(testCase.code, syntax)), syntax, testCase.code),
        writtenValue: testCase.value === undefined ? null : template.escapeTextOutsideTemplateTags(testCase.value, syntax, escapeAttribute),
        exampleText: syntax ? buildExampleText(testCase.code, syntax, examples).text : null,
    };
}

console.log(JSON.stringify(await Promise.all(cases.map(buildCaseResult))));
