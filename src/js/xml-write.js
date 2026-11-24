/**
 * A parsed SVG written back as code: a single start tag (the canvas rewrites only the start
 * tags it changes), a node as it is, the whole drawing tidied (one element per line,
 * indented) and the whole drawing shrunk (no comments, no white space between tags).
 */

import { escapeText, escapeAttribute } from './xml.js?v=6';
import { escapeTextOutsideTemplateTags } from './template-tags.js?v=2';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;
const INSTRUCTION_NODE = 7;
const COMMENT_NODE = 8;
const DOCTYPE_NODE = 10;
const INDENT_UNIT = '  ';
/** Elements whose content is code of its own (CSS, script): reindented as a block. */
const RAW_CONTENT = new Set(['style', 'script']);
/** Attributes whose runs of white space are shortened when shrinking. */
const SPACED_ATTRIBUTES = new Set(['d', 'points', 'transform', 'viewBox', 'stroke-dasharray', 'style', 'class']);

/**
 * Writes the start tag of an element; with an indent and more than one attribute, each
 * attribute stands on a line of its own.
 * @param {Element} element - the element.
 * @param {boolean} selfClose - true for <tag/>.
 * @param {?string} [indent] - the indent of the attribute lines, null for one line.
 * @param {?import('./template-tags.js').TemplateSyntax} [syntax=null] - the template syntax, whose tags in the
 *     values are written as they are; null for plain SVG.
 * @returns {string} the start tag.
 */
export function getStartTag(element, selfClose, indent, syntax = null) {
    const attributes = [...element.attributes].map(attribute => `${attribute.name}="${escapeTextOutsideTemplateTags(attribute.value, syntax, escapeAttribute)}"`);
    const close = selfClose ? '/>' : '>';
    if (indent != null && attributes.length > 1) {
        return `<${element.tagName}\n` + attributes.map(attribute => indent + attribute).join('\n') + close;
    }
    return `<${element.tagName}${attributes.length ? ' ' + attributes.join(' ') : ''}${close}`;
}

/**
 * Writes a node as text, unchanged apart from how attributes are written.
 * @param {Node} node - the node.
 * @returns {string} the code.
 */
export function convertToXml(node) {
    switch (node.nodeType) {
        case ELEMENT_NODE: {
            if (!node.childNodes.length) return getStartTag(node, true);
            let xml = getStartTag(node, false);
            for (const child of node.childNodes) xml += convertToXml(child);
            return xml + `</${node.tagName}>`;
        }
        case TEXT_NODE: return escapeText(node.data);
        case CDATA_NODE: return `<![CDATA[${node.data}]]>`;
        case INSTRUCTION_NODE: return `<?${node.target} ${node.data}?>`;
        case COMMENT_NODE: return `<!--${node.data}-->`;
        case DOCTYPE_NODE: return new XMLSerializer().serializeToString(node);
        default: return '';
    }
}

/**
 * Tells whether a node is text of white space only.
 * @param {Node} node - the node.
 * @returns {boolean} true for blank text.
 */
export function isBlank(node) {
    return node.nodeType === TEXT_NODE && !node.data.trim();
}

/**
 * Indents a block of text anew: its common indent is replaced, blank lines at the start and
 * end are dropped.
 * @param {string} text - the text.
 * @param {string} indent - the new indent of every line.
 * @returns {string} the reindented text.
 */
function getReindented(text, indent) {
    const lines = text.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n');
    const least = Math.min(...lines.filter(line => line.trim()).map(line => /^\s*/.exec(line)[0].length));
    return lines.map(line => (line.trim() ? indent + line.slice(isFinite(least) ? least : 0) : '')).join('\n');
}

/**
 * Writes a node tidied into lines.
 * @param {Node} node - the node.
 * @param {number} level - its depth.
 * @param {string[]} lines - the lines written so far; the node's lines are added.
 * @param {string} unit - one level of indent.
 * @returns {void}
 */
function formatNode(node, level, lines, unit) {
    const indent = unit.repeat(level);
    if (node.nodeType === COMMENT_NODE) { lines.push(indent + `<!--${node.data}-->`); return; }
    if (node.nodeType === INSTRUCTION_NODE || node.nodeType === DOCTYPE_NODE) { lines.push(indent + convertToXml(node)); return; }
    if (node.nodeType === TEXT_NODE) { if (node.data.trim()) lines.push(indent + escapeText(node.data.trim())); return; }
    if (node.nodeType === CDATA_NODE) { lines.push(indent + convertToXml(node)); return; }
    if (node.nodeType !== ELEMENT_NODE) return;
    const children = [...node.childNodes].filter(child => !isBlank(child));
    if (!children.length) { lines.push(indent + getStartTag(node, true)); return; }
    if (RAW_CONTENT.has(node.localName)) { formatRawElement(node, children, indent, lines, unit); return; }
    if (children.some(child => child.nodeType === TEXT_NODE || child.nodeType === CDATA_NODE)) {
        // Mixed content (text, tspan): white space is part of the content and is kept.
        let line = indent + getStartTag(node, false);
        for (const child of node.childNodes) line += convertToXml(child);
        lines.push(line + `</${node.tagName}>`);
        return;
    }
    lines.push(indent + getStartTag(node, false));
    for (const child of children) formatNode(child, level + 1, lines, unit);
    lines.push(indent + `</${node.tagName}>`);
}

/**
 * Writes a <style> or <script> tidied: its content is reindented one level deeper.
 * @param {Element} node - the element.
 * @param {Node[]} children - its children without blank text.
 * @param {string} indent - the element's indent.
 * @param {string[]} lines - the lines written so far; the element's lines are added.
 * @param {string} unit - one level of indent.
 * @returns {void}
 */
function formatRawElement(node, children, indent, lines, unit) {
    let body = '';
    for (const child of children) {
        body += child.nodeType === CDATA_NODE ? `<![CDATA[\n${getReindented(child.data, indent + unit)}\n${indent + unit}]]>`
                                              : getReindented(child.nodeType === TEXT_NODE ? escapeText(child.data) : convertToXml(child), indent + unit);
    }
    if (children.length === 1 && children[0].nodeType === CDATA_NODE) body = indent + unit + body;
    lines.push(indent + getStartTag(node, false), body, indent + `</${node.tagName}>`);
}

/**
 * Returns the XML declaration at the start of the code.
 * @param {string} source - the code.
 * @returns {string} the declaration, "" when there is none.
 */
export function getXmlDeclaration(source) {
    const match = /^\s*(<\?xml[\s\S]*?\?>)/.exec(source);
    return match ? match[1] : '';
}

/**
 * Writes a drawing tidied: one element per line, indented; the XML declaration of the code
 * stays.
 * @param {XMLDocument} doc - the parsed drawing.
 * @param {string} [source] - its code, for the XML declaration.
 * @param {string} [unit] - one level of indent.
 * @returns {string} the tidied code, ending with a line break.
 */
export function formatSvg(doc, source = '', unit = INDENT_UNIT) {
    const lines = [];
    const declaration = getXmlDeclaration(source);
    if (declaration) lines.push(declaration);
    for (const child of doc.childNodes) formatNode(child, 0, lines, unit);
    return lines.join('\n') + '\n';
}

/**
 * Writes a node shrunk: no comments, no white space between tags.
 * @param {Node} node - the node.
 * @param {boolean} inText - true inside text, <style> or <script>, where white space counts.
 * @returns {string} the code.
 */
function compressNode(node, inText) {
    switch (node.nodeType) {
        case ELEMENT_NODE: return compressElement(node, inText);
        case TEXT_NODE:
            if (!inText) return node.data.trim() ? escapeText(node.data.trim()) : '';
            return escapeText(node.data.replace(/\s+/g, ' '));
        case CDATA_NODE: return `<![CDATA[${node.data}]]>`;
        default: return '';
    }
}

/**
 * Writes an element shrunk.
 * @param {Element} node - the element.
 * @param {boolean} inText - true inside text, <style> or <script>.
 * @returns {string} the code.
 */
function compressElement(node, inText) {
    const tag = node.tagName;
    const attributes = [...node.attributes].map(attribute => {
        let value = attribute.value;
        if (SPACED_ATTRIBUTES.has(attribute.name)) value = value.replace(/\s+/g, ' ').trim();
        return `${attribute.name}="${escapeAttribute(value)}"`;
    }).join(' ');
    const open = `<${tag}${attributes ? ' ' + attributes : ''}`;
    const textLike = inText || node.localName === 'text' || node.localName === 'style' || node.localName === 'script';
    let inner = '';
    for (const child of node.childNodes) inner += compressNode(child, textLike);
    return inner ? `${open}>${inner}</${tag}>` : `${open}/>`;
}

/**
 * Writes a drawing shrunk: no comments, no white space between tags.
 * @param {XMLDocument} doc - the parsed drawing.
 * @returns {string} the code of its root element.
 */
export function compressSvg(doc) {
    return compressNode(doc.documentElement, false);
}
