/**
 * The two views of a template on the canvas (?template=): the example view, the drawing filled
 * with the page's examples (the default), and the template view, the drawing with its tags shown
 * as their text.
 *
 * buildShownDrawing() runs these steps:
 *   1. without a template syntax, or in the template view, the drawing as the editor read it
 *      from the code (svg-template.js);
 *   2. in the example view, the filled drawing (svg-examples.js) with the way back from each of
 *      its elements to its element in the code; when filling fails, the template view is shown
 *      with a note.
 * The code, the exports and what is sent to the page are the template as written.
 */

import { services } from './state.js?v=2';
import { TEMPLATE_SYNTAX } from './svg-template.js?v=1';
import { buildExampleDrawing } from './svg-examples.js?v=3';

/** The view that shows the drawing filled with the examples. */
export const EXAMPLE_VIEW = 'example';
/** The view that shows the tags as their text. */
export const TEMPLATE_VIEW = 'template';

/** The state of the views: the view chosen and whether the example view could not be made. */
const views = { mode: EXAMPLE_VIEW, failed: false };

/**
 * What the canvas shows.
 * @typedef {object} ShownDrawing
 * @property {Element} root - the root of the drawing to show.
 * @property {?number[]} codeIndexes - for every element shown (root first), the index of its element in
 *     the code; null when element i of the drawing shown is element i of the code.
 */

/**
 * Returns the view chosen.
 * @returns {string} EXAMPLE_VIEW or TEMPLATE_VIEW.
 */
export function getViewMode() {
    return views.mode;
}

/**
 * Sets the view chosen.
 * @param {string} mode - EXAMPLE_VIEW or TEMPLATE_VIEW.
 * @returns {void}
 */
export function setViewMode(mode) {
    views.mode = mode === TEMPLATE_VIEW ? TEMPLATE_VIEW : EXAMPLE_VIEW;
}

/**
 * Tells whether the canvas shows the example view.
 * @returns {boolean} true with a template syntax, the example view chosen and made.
 */
export function isExampleViewShown() {
    return Boolean(TEMPLATE_SYNTAX) && views.mode === EXAMPLE_VIEW && !views.failed;
}

/**
 * Tells whether the example view was chosen but could not be made.
 * @returns {boolean} true while the template view stands in for it.
 */
export function isExampleViewFailed() {
    return Boolean(TEMPLATE_SYNTAX) && views.mode === EXAMPLE_VIEW && views.failed;
}

/**
 * Returns the page's examples for the open drawing.
 * @returns {?import('./template-examples.js').TemplateExamples} the examples, null without a page or away from its drawing.
 */
export function getTemplateExamples() {
    return services.sync?.getTemplate() || null;
}

/**
 * Returns what the canvas shows (the steps in the header).
 * @param {string} code - the code.
 * @param {Element} writtenRoot - the root of the drawing as read from the code, tags as written.
 * @param {Element[]} writtenElements - its elements, root first.
 * @param {import('./xml.js').TagRange[]} writtenTags - the places of its elements in the code.
 * @returns {ShownDrawing} the drawing to show.
 */
export function buildShownDrawing(code, writtenRoot, writtenElements, writtenTags) {
    views.failed = false;
    if (!TEMPLATE_SYNTAX || views.mode === TEMPLATE_VIEW) return { root: writtenRoot, codeIndexes: null };
    try {
        return buildExampleDrawing(code, TEMPLATE_SYNTAX, getTemplateExamples(), writtenElements, writtenTags);
    } catch (error) {
        console.error(error);
        views.failed = true;
        return { root: writtenRoot, codeIndexes: null };
    }
}
