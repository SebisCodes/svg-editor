/**
 * A drawing as a React component (JSX): attribute names in React's spelling, style as an
 * object, comments as JSX comments, scripts left out. Nothing of the drawing becomes a
 * JavaScript expression: braces in text and the content of <style> are written as strings.
 */

import { escapeAttribute } from './xml.js?v=5';
import { parseStyle } from './svg-values.js?v=3';
import { isBlank } from './xml-write.js?v=2';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_NODE = 4;
const COMMENT_NODE = 8;
const ROOT_LEVEL = 2;
const INDENT_UNIT = '  ';
const DEFAULT_NAME = 'Drawing';
/** Attribute names React spells differently than the camel case rule gives. */
const JSX_NAMES = { 'class': 'className', 'xlink:href': 'xlinkHref', 'xml:space': 'xmlSpace', 'xmlns:xlink': 'xmlnsXlink', 'xml:lang': 'xmlLang' };
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Writes a name with dashes or colons in camel case.
 * @param {string} name - e.g. "stroke-width".
 * @returns {string} e.g. "strokeWidth".
 */
function convertToCamelCase(name) {
    return name.replace(/[-:]([a-z])/g, (match, letter) => letter.toUpperCase());
}

/**
 * Writes one attribute in JSX.
 * @param {string} name - the attribute's name.
 * @param {string} value - its value.
 * @returns {string} the JSX attribute; style becomes an object.
 */
function convertAttributeToJsx(name, value) {
    if (name === 'style') {
        const entries = [...parseStyle(value)].map(([property, propertyValue]) => {
            const key = convertToCamelCase(property);
            return `${IDENTIFIER.test(key) ? key : JSON.stringify(property)}: ${JSON.stringify(propertyValue)}`;
        }).join(', ');
        return `style={{ ${entries} }}`;
    }
    let jsxName = JSX_NAMES[name] || name;
    if (!JSX_NAMES[name] && !/^(data|aria)-/.test(name)) jsxName = convertToCamelCase(name);
    return `${jsxName}="${escapeAttribute(value)}"`;
}

/**
 * Writes a node in JSX.
 * @param {Node} node - the node.
 * @param {number} level - its depth in the component's code.
 * @param {string[]} lines - the lines written so far; the node's lines are added.
 * @param {boolean} isRoot - true for the <svg>, which also takes the component's props.
 * @returns {void}
 */
function convertNodeToJsx(node, level, lines, isRoot) {
    const indent = INDENT_UNIT.repeat(level);
    if (node.nodeType === COMMENT_NODE) { lines.push(`${indent}{/*${node.data.replace(/\*\//g, '* /')}*/}`); return; }
    if (node.nodeType === TEXT_NODE || node.nodeType === CDATA_NODE) {
        const text = node.data.trim();
        if (text) lines.push(indent + text.replace(/[{}<>]/g, char => `{'${char}'}`));
        return;
    }
    if (node.nodeType !== ELEMENT_NODE || node.localName === 'script') return;
    const attributes = [...node.attributes].map(attribute => convertAttributeToJsx(attribute.name, attribute.value));
    if (isRoot) attributes.push('{...props}');
    const open = `<${node.tagName}${attributes.length ? ' ' + attributes.join(' ') : ''}`;
    const children = [...node.childNodes].filter(child => !isBlank(child));
    if (node.localName === 'style') {
        lines.push(`${indent}${open}>{${JSON.stringify(node.textContent.trim())}}</${node.tagName}>`);
        return;
    }
    if (!children.length) { lines.push(`${indent}${open} />`); return; }
    lines.push(`${indent}${open}>`);
    for (const child of children) convertNodeToJsx(child, level + 1, lines, false);
    lines.push(`${indent}</${node.tagName}>`);
}

/**
 * Writes a drawing as a React function component.
 * @param {XMLDocument} doc - the parsed drawing.
 * @param {string} [name] - the drawing's name, made into the component's name.
 * @returns {string} the module code with a default export.
 */
export function convertToJsx(doc, name = DEFAULT_NAME) {
    const lines = [];
    convertNodeToJsx(doc.documentElement, ROOT_LEVEL, lines, true);
    const component = name.replace(/[^A-Za-z0-9]/g, ' ').replace(/(?:^|\s)(\w)/g, (match, letter) => letter.toUpperCase()).replace(/\s/g, '') || DEFAULT_NAME;
    const safeName = /^[A-Z]/.test(component) ? component : 'Svg' + component;
    return `export default function ${safeName}(props) {\n  return (\n${lines.join('\n')}\n  );\n}\n`;
}
