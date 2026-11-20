/**
 * The state every area of the SVG editor shares: the open drawing with its three lists of
 * elements, the view, the tool, the grid and the undo history (state), the elements of the
 * page the areas draw into (elements), and the services app.js sets up at the start
 * (services).
 *
 * Element i of the drawing is the i-th start tag in the code (state.scanEls, from
 * parseTags() in xml.js), the i-th element of the parsed document (state.modelEls) and the
 * i-th element of the view on the canvas (state.viewEls); the root <svg> is 0.
 *
 * The test hook window.svgEditor hands out `state`; the tests read code, sel, name, fileId,
 * grid, zoom, panX, panY, autoFit, tool, bg, history and the element lists from it, so these
 * fields keep their names.
 */

/**
 * The grid on the canvas; stored with the settings.
 * @typedef {Object} GridSettings
 * @property {boolean} show - true when the grid is shown.
 * @property {number} size - the spacing in the drawing's own units.
 * @property {boolean} snap - true when shapes snap to the grid.
 */

/**
 * The colors of new shapes; stored with the settings.
 * @typedef {Object} ShapeDefaults
 * @property {string} fill - the fill color, or "none".
 * @property {string} stroke - the outline color, or "none".
 * @property {number} sw - the outline width.
 */

/**
 * An error in the code, as the browser's XML parser reports it.
 * @typedef {Object} CodeError
 * @property {?number} [line] - the line, 1-based, when known.
 * @property {?number} [col] - the column, 1-based, when known.
 * @property {string} msg - the message.
 * @property {string} [fix] - "xmlns" when a button can add the missing namespace.
 */

/**
 * What a drag on the stage is doing. `type` says which of the fields are set:
 * pan (x, y, px, py, empty), tap (index, sx, sy, moved), move (snapshot, p0, sx, sy, moved,
 * leaf, grip), resize (handle, snapshot, p0, moved), draw (tag, el, x0, y0, pts, last, shift).
 * @typedef {Object} StageDrag
 * @property {string} type - "pan", "tap", "move", "resize" or "draw".
 * @property {number} [x] - pan: the pointer's screen x at the start.
 * @property {number} [y] - pan: the pointer's screen y at the start.
 * @property {number} [px] - pan: the view's horizontal shift at the start.
 * @property {number} [py] - pan: the view's vertical shift at the start.
 * @property {boolean} [empty] - pan: true when it started on an empty spot.
 * @property {number} [index] - tap: the element under the finger.
 * @property {number} [sx] - tap, move: the pointer's screen x at the start.
 * @property {number} [sy] - tap, move: the pointer's screen y at the start.
 * @property {boolean} [moved] - tap, move, resize: true once the pointer moved far enough.
 * @property {ShapeSnapshot} [snapshot] - move, resize: the element as it was at the start.
 * @property {DOMPoint} [p0] - move, resize: the start point in root coordinates.
 * @property {number} [leaf] - move: the element inside the selected group that was hit, or -1.
 * @property {boolean} [grip] - move: true when it started on the touch grip.
 * @property {string} [handle] - resize: the handle (nw, n, ne, e, se, s, sw, w, p1, p2).
 * @property {string} [tag] - draw: the tag of the new shape.
 * @property {SVGElement} [el] - draw: the shape shown while drawing.
 * @property {number} [x0] - draw: the start x in root coordinates, snapped.
 * @property {number} [y0] - draw: the start y in root coordinates, snapped.
 * @property {number[][]} [pts] - draw: the points of a freehand line.
 * @property {{x: number, y: number}} [last] - draw: the last pointer position.
 * @property {boolean} [shift] - draw: true when Shift was held at the last move.
 */

/**
 * An element as it was when a change started (geometry.js).
 * @typedef {Object} ShapeSnapshot
 * @property {number} index - the element's index.
 * @property {string} tag - the element's local name.
 * @property {Object<string, string>} attributes - its attributes by name.
 * @property {DOMMatrix} matrix - its own transform.
 * @property {DOMMatrix} parentMatrix - from its parent's coordinates to the root's.
 * @property {?ShapeBox} box - its bounding box in root coordinates.
 */

/**
 * A box in root coordinates.
 * @typedef {Object} ShapeBox
 * @property {number} x - the left edge.
 * @property {number} y - the top edge.
 * @property {number} w - the width.
 * @property {number} h - the height.
 */

/**
 * One undo step.
 * @typedef {Object} HistoryStep
 * @property {string} code - the code.
 * @property {number} sel - the selected element at that step.
 */

/**
 * The open drawing and what is shown of it.
 * @typedef {Object} EditorState
 * @property {string} code - the code of the open drawing, the single source of truth.
 * @property {?XMLDocument} doc - the last parsed document without errors.
 * @property {?CodeError} error - the error in the code, null when it parses.
 * @property {boolean} isMapped - true when the start tags and the parsed elements match one to one.
 * @property {Object[]} scanEls - the start tags in the code (parseTags() in xml.js).
 * @property {Element[]} modelEls - the elements of the parsed document, root first.
 * @property {Element[]} viewEls - the elements of the view on the canvas, root first.
 * @property {?SVGSVGElement} viewRoot - the root of the view.
 * @property {WeakMap<Element, number>} viewIndex - the index of each element of the view.
 * @property {number} sel - the selected element, -1 for none (the root is never selected).
 * @property {number} hoverIndex - the element under the pointer, -1 for none.
 * @property {number} zoom - screen pixels per unit of the drawing.
 * @property {number} panX - the left edge of the drawing on the stage, in screen pixels.
 * @property {number} panY - the top edge of the drawing on the stage, in screen pixels.
 * @property {{w: number, h: number}} naturalSize - the drawing's size in pixels.
 * @property {boolean} isFitted - true once the drawing was fitted into the stage.
 * @property {boolean} autoFit - true while the drawing stays fitted when the stage changes size.
 * @property {string} tool - the chosen tool: select, hand, rect, ellipse, line, pen or text.
 * @property {boolean} isSpaceDown - true while the space bar is held (panning).
 * @property {GridSettings} grid - the grid.
 * @property {string} bg - the canvas background: checker, light, dark or none.
 * @property {ShapeDefaults} defaults - the colors of new shapes.
 * @property {number} split - the share of the code in the space next to the properties.
 * @property {string} name - the name of the open drawing.
 * @property {string} fileId - the id of the open drawing in "My drawings", "" when it is not stored.
 * @property {Set<number>} changedIndexes - elements whose start tags wait to be written into the code.
 * @property {number} writeTimer - the timer that writes the changed start tags.
 * @property {?StageDrag} drag - what a drag on the stage is doing, null when none.
 * @property {Map<string, string>} lastPaints - the color before "None", by tag and property.
 * @property {boolean} isAttributeListOpen - true while "All attributes" is open in the properties.
 * @property {HistoryStep[]} history - the undo steps; the last one is the current code.
 * @property {HistoryStep[]} future - the redo steps.
 * @property {number} historyTimer - the timer that makes an edit an undo step after a pause.
 * @property {{t: number, x: number, y: number}} [wheelClick] - the last press of the mouse wheel on the stage.
 * @property {Object} [pinch] - a two-finger zoom: start distance, zoom, center and shift.
 */

/** @type {EditorState} */
export const state = {
    code: '', doc: null, error: null, isMapped: true,
    scanEls: [], modelEls: [], viewEls: [], viewRoot: null, viewIndex: new WeakMap(),
    sel: -1, hoverIndex: -1,
    zoom: 1, panX: 0, panY: 0, naturalSize: { w: 300, h: 150 }, isFitted: false, autoFit: true,
    tool: 'select', isSpaceDown: false,
    grid: { show: true, size: 10, snap: true },
    bg: 'checker',
    defaults: { fill: '#5b8def', stroke: '#1d2b53', sw: 2 },
    split: 0.5,
    name: 'drawing', fileId: '',
    changedIndexes: new Set(), writeTimer: 0, drag: null,
    lastPaints: new Map(), isAttributeListOpen: false,
    history: [], future: [], historyTimer: 0,
};

/**
 * The elements of the page the areas draw into.
 * @typedef {Object} EditorElements
 * @property {HTMLTextAreaElement} ta - the code field.
 * @property {HTMLElement} hl - the highlighted code behind the field.
 * @property {HTMLElement} marks - the marked ranges (selection, error) behind the field.
 * @property {HTMLElement} gutter - the line numbers.
 * @property {HTMLElement} layers - the box around the code layers.
 * @property {HTMLElement} status - the line and size count above the code.
 * @property {HTMLElement} error - the error message above the code.
 * @property {HTMLElement} stage - the canvas area.
 * @property {HTMLElement} paper - the drawing's sheet on the stage.
 * @property {HTMLElement} host - the element that holds the view in its shadow root.
 * @property {SVGSVGElement} overlay - grid, hover outline and selection handles.
 * @property {HTMLElement} grip - the touch grip over the selected shape.
 * @property {HTMLElement} zoomLabel - the zoom in percent.
 * @property {HTMLElement} inspector - the properties panel.
 * @property {HTMLElement} tree - the list of layers.
 * @property {HTMLElement} work - the work area.
 * @property {HTMLElement} toast - the short message at the bottom.
 * @property {ShadowRoot} shadowRoot - where the view of the drawing lives.
 */

/** @type {EditorElements} */
export const elements = {};

/**
 * The services the areas set up at the start (app.js, documents.js, assistants.js); null until then.
 * @typedef {Object} EditorServices
 * @property {?Object} lineWrap - the wrapped rows of the code view (wrap.js).
 * @property {?Object} files - the "My drawings" dialog (files.js): open(), render().
 * @property {?Object} sync - webhook and embedding (sync.js), null until the start is done.
 * @property {?Object} aiDialog - the AI Assistant dialog (ai.js): refresh().
 */

/** @type {EditorServices} */
export const services = { lineWrap: null, files: null, sync: null, aiDialog: null };

/**
 * Finds the elements of the page. Runs once at the start, before any area is set up.
 * @returns {void}
 */
export function startElements() {
    /**
     * Returns the element with an id.
     * @param {string} id - the element's id.
     * @returns {?HTMLElement} the element, or null.
     */
    const getById = id => document.getElementById(id);
    Object.assign(elements, {
        ta: getById('code'), hl: getById('hl'), marks: getById('marks'), gutter: getById('gutter'), layers: getById('code-layers'),
        status: getById('code-status'), error: getById('code-error'),
        stage: getById('stage'), paper: getById('paper'), host: getById('host'), overlay: getById('overlay'), grip: getById('grip'),
        zoomLabel: getById('zoom-label'), inspector: getById('inspector-body'), tree: getById('tree'),
        work: getById('work'), toast: getById('toast'),
    });
}

/**
 * Opens the shadow root that holds the view of the drawing, so styles inside the drawing do
 * not reach the page.
 * @returns {void}
 */
export function startShadowRoot() {
    elements.shadowRoot = elements.host.attachShadow({ mode: 'open' });
}
