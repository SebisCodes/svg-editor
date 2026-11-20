/**
 * The WebMCP tools of the editor (mcp.js registers them): reading the open drawing, changing
 * it or its selection, the user's other drawings, and Undo. Shapes are addressed by id or by
 * their number from list_shapes (element index, root = 0). Every change goes through the same
 * functions as the canvas, so each one is an undo step.
 *
 * Each handler takes the editor of its tool set, then what WebMCP gives execute(): it does what
 * the tool says and returns the answer text for the agent (a shape an API dictates).
 *
 * The file is a little longer than the guide value of 300 lines: the tool list and the
 * handlers of its tools are one topic.
 */

/** The parameter that names a shape. */
const SHAPE = {
    type: 'string',
    description: 'The shape: its id, or its number from list_shapes (1 = first element after <svg>).',
};
const ATTRIBUTE_PREVIEW = 60;
const ATTRIBUTE_CUT = 57;
const TIME_LENGTH = 16;                     // "YYYY-MM-DDTHH:MM" of an ISO time
const ATTRIBUTE_NAME = /^[A-Za-z_:][\w:.-]*$/;
const SVG_ROOT = /<svg[\s>]/i;

/**
 * What the tools ask of the editor.
 * @typedef {Object} McpEditor
 * @property {function(): void} [onUse] - called on every tool call (AI status).
 * @property {function(): {svg: string, sel: string, name: string}} getState - the open drawing.
 * @property {function(): {name: string, updated: number, open: boolean}[]} files - the user's drawings, most recent first.
 * @property {function(string): boolean} openFile - opens a drawing by name, false when there is none.
 * @property {function(string, string): (string|null)} newFile - makes and opens a drawing, returns its name or null.
 * @property {function(): Element[]} elements - the elements of the drawing, root first.
 * @property {function(): boolean} error - true when the code has an error.
 * @property {function(string, string, Object): Promise<void>} receive - takes a drawing (svg, mode, target).
 * @property {function(number, Object<string, string>): void} editShape - sets attributes of a shape.
 * @property {function(number): void} deleteShape - deletes a shape.
 * @property {function(number): void} select - selects a shape.
 * @property {function(): void} undo - undoes the last change.
 */

/** The undo tool without its handler, registered last. */
const UNDO_TOOL = {
    name: 'undo',
    description: 'Undoes the last change in the editor.',
    inputSchema: { type: 'object', properties: {} },
};

/**
 * Returns the element number of a shape given by id or number.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @param {*} shape - an id (with or without #) or a number.
 * @returns {number} the element index.
 * @throws {Error} when there is no such shape.
 */
function getShapeIndex(editor, shape) {
    const wanted = String(shape ?? '').trim().replace(/^#/, '');
    const elements = editor.elements();
    const index = /^\d+$/.test(wanted) ? +wanted : elements.findIndex(model => model.getAttribute('id') === wanted);
    if (!(index > 0 && index < elements.length)) throw new Error(`No shape "${wanted}" - call list_shapes to see the shapes.`);
    return index;
}

/**
 * Stops a tool that changes shapes while the code has an error.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @returns {void}
 * @throws {Error} when the code has an error.
 */
function checkEditable(editor) {
    if (editor.error()) throw new Error('The SVG code has an error - fix it with set_drawing first.');
}

/**
 * Returns the tools, in the order they are registered. Each tool's execute() is its handler
 * bound to this editor, so every set of tools keeps the editor it was made for.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @returns {Object[]} the tools with name, description, input schema and execute().
 */
export function createTools(editor) {
    return [...createReadTools(editor), ...createChangeTools(editor), ...createFileTools(editor), { ...UNDO_TOOL, execute: undoChange.bind(null, editor) }];
}

/**
 * Returns the tools that read the open drawing.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @returns {Object[]} get_drawing and list_shapes.
 */
function createReadTools(editor) {
    return [
        {
            name: 'get_drawing',
            description: 'Returns the name and SVG code of the drawing open in the editor, and the selected shape.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getDrawing.bind(null, editor),
        },
        {
            name: 'list_shapes',
            description: 'Lists the shapes of the drawing with number, tag, id and attributes, in document order (later shapes lie on top).',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getShapeList.bind(null, editor),
        },
    ];
}

/**
 * Returns the tools that change the open drawing or its selection.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @returns {Object[]} set_drawing, add_shapes, edit_shape, delete_shape and select_shape.
 */
function createChangeTools(editor) {
    return [
        {
            name: 'set_drawing',
            description: 'Replaces the whole open drawing with new SVG code (root <svg xmlns="http://www.w3.org/2000/svg" viewBox="...">, well-formed XML). Keep the user\'s existing work unless asked otherwise.',
            inputSchema: { type: 'object', properties: { svg: { type: 'string', description: 'The complete SVG code.' } }, required: ['svg'] },
            execute: setDrawing.bind(null, editor),
        },
        {
            name: 'add_shapes',
            description: 'Adds SVG elements on top of the drawing, e.g. <circle cx="50" cy="50" r="20" fill="red"/>. Send only the elements, without <svg>.',
            inputSchema: { type: 'object', properties: { svg: { type: 'string', description: 'One or more SVG elements.' } }, required: ['svg'] },
            execute: addShapes.bind(null, editor),
        },
        {
            name: 'edit_shape',
            description: 'Changes attributes of one shape, e.g. {"fill": "#e11", "x": "20"}. An empty string or null removes the attribute.',
            inputSchema: {
                type: 'object',
                properties: {
                    shape: SHAPE,
                    attributes: { type: 'object', description: 'Attribute names and new values.', additionalProperties: { type: ['string', 'number', 'null'] } },
                },
                required: ['shape', 'attributes'],
            },
            execute: editShape.bind(null, editor),
        },
        {
            name: 'delete_shape',
            description: 'Deletes one shape (with everything inside it).',
            inputSchema: { type: 'object', properties: { shape: SHAPE }, required: ['shape'] },
            execute: removeShape.bind(null, editor),
        },
        {
            name: 'select_shape',
            description: 'Selects a shape in the editor so the user sees it highlighted.',
            inputSchema: { type: 'object', properties: { shape: SHAPE }, required: ['shape'] },
            execute: selectShape.bind(null, editor),
        },
    ];
}

/**
 * Returns the tools that reach the user's other drawings.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @returns {Object[]} list_files, open_file and new_file.
 */
function createFileTools(editor) {
    return [
        {
            name: 'list_files',
            description: 'Lists the user\'s drawings stored in the editor ("My drawings"), most recently changed first, and which one is open.',
            inputSchema: { type: 'object', properties: {} },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: getFileList.bind(null, editor),
        },
        {
            name: 'open_file',
            description: 'Opens one of the user\'s drawings by name; the other tools then work on it.',
            inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'The name from list_files.' } }, required: ['name'] },
            execute: openFile.bind(null, editor),
        },
        {
            name: 'new_file',
            description: 'Creates a new drawing and opens it; the user\'s other drawings stay unchanged. Without svg it starts empty (256 x 256).',
            inputSchema: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'A short name for the drawing.' },
                    svg: { type: 'string', description: 'Optional: the complete SVG code.' },
                },
                required: ['name'],
            },
            execute: addFile.bind(null, editor),
        },
    ];
}

/**
 * undo: undoes the last change.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @returns {Promise<string>} the answer.
 */
async function undoChange(editor) {
    editor.undo();
    return 'Undone.';
}

/**
 * get_drawing: the name, the selected shape and the code of the open drawing.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @returns {Promise<string>} the answer.
 */
async function getDrawing(editor) {
    const drawing = editor.getState();
    return `Drawing: "${drawing.name}"\n${drawing.sel ? `Selected: ${drawing.sel}\n` : ''}\n${drawing.svg}`;
}

/**
 * list_shapes: every shape with its number, tag and attributes (long values cut).
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @returns {Promise<string>} the answer.
 */
async function getShapeList(editor) {
    const elements = editor.elements();
    if (elements.length < 2) return 'The drawing is empty.';
    return elements.slice(1).map((model, position) => {
        const attributes = [...model.attributes].map(attribute => `${attribute.name}="${attribute.value.length > ATTRIBUTE_PREVIEW ? attribute.value.slice(0, ATTRIBUTE_CUT) + '...' : attribute.value}"`).join(' ');
        return `${position + 1}: <${model.localName}${attributes ? ' ' + attributes : ''}>`;
    }).join('\n');
}

/**
 * set_drawing: replaces the open drawing.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @param {Object} input - the tool's input.
 * @param {string} input.svg - the complete SVG code.
 * @returns {Promise<string>} the answer.
 * @throws {Error} when the code has no <svg> root.
 */
async function setDrawing(editor, { svg }) {
    if (!SVG_ROOT.test(svg || '')) throw new Error('The code needs an <svg> root element.');
    editor.receive(svg, 'replace', { direct: true });
    return editor.error() ? 'Loaded, but the SVG has an error - see get_drawing and send a fixed version.' : 'The drawing is in the editor.';
}

/**
 * add_shapes: adds elements on top of the drawing.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @param {Object} input - the tool's input.
 * @param {string} input.svg - the elements.
 * @returns {Promise<string>} the answer.
 * @throws {Error} when the code has an error.
 */
async function addShapes(editor, { svg }) {
    checkEditable(editor);
    editor.receive(svg, 'add', { direct: true });
    return editor.error() ? 'Added, but the SVG now has an error - check get_drawing.' : 'The shapes were added.';
}

/**
 * edit_shape: sets attributes of a shape; event handlers and invalid names are refused.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @param {Object} input - the tool's input.
 * @param {string} input.shape - the shape.
 * @param {Object} input.attributes - its new attributes.
 * @returns {Promise<string>} the answer.
 * @throws {Error} when the code has an error, the shape is unknown or an attribute cannot be set.
 */
async function editShape(editor, { shape, attributes }) {
    checkEditable(editor);
    const index = getShapeIndex(editor, shape);
    const refused = Object.keys(attributes || {}).find(name => !ATTRIBUTE_NAME.test(name) || /^on/i.test(name));
    if (refused) throw new Error(`The attribute "${refused}" cannot be set.`);
    editor.editShape(index, Object.fromEntries(Object.entries(attributes || {}).map(([name, value]) => [name, value == null ? '' : String(value)])));
    return `Changed shape ${shape}.`;
}

/**
 * delete_shape: deletes a shape with everything inside it.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @param {Object} input - the tool's input.
 * @param {string} input.shape - the shape.
 * @returns {Promise<string>} the answer.
 * @throws {Error} when the code has an error or the shape is unknown.
 */
async function removeShape(editor, { shape }) {
    checkEditable(editor);
    editor.deleteShape(getShapeIndex(editor, shape));
    return `Deleted shape ${shape}.`;
}

/**
 * select_shape: selects a shape so the user sees it.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @param {Object} input - the tool's input.
 * @param {string} input.shape - the shape.
 * @returns {Promise<string>} the answer.
 * @throws {Error} when the code has an error or the shape is unknown.
 */
async function selectShape(editor, { shape }) {
    checkEditable(editor);
    editor.select(getShapeIndex(editor, shape));
    return `Selected shape ${shape}.`;
}

/**
 * list_files: the user's drawings with when they changed; * marks the open one.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @returns {Promise<string>} the answer.
 */
async function getFileList(editor) {
    return editor.files().map(file => `${file.open ? '* ' : '  '}"${file.name}" (changed ${new Date(file.updated).toISOString().slice(0, TIME_LENGTH).replace('T', ' ')})`).join('\n') + '\n(* = open now)';
}

/**
 * open_file: opens a drawing by name.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @param {Object} input - the tool's input.
 * @param {string} input.name - the name.
 * @returns {Promise<string>} the answer.
 * @throws {Error} when there is no such drawing.
 */
async function openFile(editor, { name }) {
    if (!editor.openFile(name)) throw new Error(`No drawing "${name}" - call list_files.`);
    return `"${name}" is open.`;
}

/**
 * new_file: makes and opens a drawing.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @param {Object} input - the tool's input.
 * @param {string} input.name - the drawing's name.
 * @param {string} [input.svg] - its code.
 * @returns {Promise<string>} the answer.
 * @throws {Error} when the code has no <svg> root or the storage is full.
 */
async function addFile(editor, { name, svg }) {
    if (svg && !SVG_ROOT.test(svg)) throw new Error('The code needs an <svg> root element.');
    const madeName = editor.newFile(name, svg);
    if (!madeName) throw new Error('The browser storage is full.');
    return `New drawing "${madeName}" is open.`;
}
