/**
 * The highlighting of the code view: tag names, attributes, values, entities, comments and
 * declarations each in a span with its class.
 */

import { escapeText, getTagEnd, getDoctypeEnd, getMarkEnd, COMMENT_START, COMMENT_END, CDATA_START, CDATA_END,
         INSTRUCTION_START, INSTRUCTION_END, DECLARATION_START } from './xml.js?v=6';

const ENTITY = /&#?[\w.-]+;/g;
const ATTRIBUTE_TOKEN = /(\s+)|([^\s=/>"']+)|(=)|("[^"]*"?|'[^']*'?)|(\/?>)|([\s\S])/g;

/**
 * Returns text in a span with a class.
 * @param {string} className - the class: p punctuation, k tag name, a attribute, s value, e entity, c comment, d declaration.
 * @param {string} text - the text.
 * @returns {string} the HTML.
 */
function getSpanHtml(className, text) {
    return `<span class="${className}">${escapeText(text)}</span>`;
}

/**
 * Highlights text between tags: entities stand out.
 * @param {string} text - the text.
 * @returns {string} the HTML.
 */
function highlightText(text) {
    let html = '', last = 0;
    text.replace(ENTITY, (entity, at) => {
        html += escapeText(text.slice(last, at)) + getSpanHtml('e', entity);
        last = at + entity.length;
        return entity;
    });
    return html + escapeText(text.slice(last));
}

/**
 * Highlights a start tag: name, attributes, values and punctuation.
 * @param {string} tagText - the start tag, starting with "<".
 * @returns {string} the HTML.
 */
function highlightTag(tagText) {
    const name = /^<([^\s/>]*)/.exec(tagText);
    let html = getSpanHtml('p', '<') + getSpanHtml('k', name[1]);
    const rest = tagText.slice(name[0].length);
    ATTRIBUTE_TOKEN.lastIndex = 0;
    let token;
    while ((token = ATTRIBUTE_TOKEN.exec(rest))) {
        if (token[1]) html += token[1];
        else if (token[2]) html += getSpanHtml('a', token[2]);
        else if (token[3]) html += getSpanHtml('p', '=');
        else if (token[4]) html += getSpanHtml('s', token[4]);
        else if (token[5]) html += getSpanHtml('p', token[5]);
        else html += escapeText(token[6]);
    }
    return html;
}

/**
 * Highlights an end tag.
 * @param {string} tagText - the end tag, starting with "</".
 * @returns {string} the HTML.
 */
function highlightEndTag(tagText) {
    const parts = /^<\/([^\s>]*)([\s\S]*)$/.exec(tagText);
    return getSpanHtml('p', '</') + getSpanHtml('k', parts[1]) + (parts[2] ? getSpanHtml('p', parts[2]) : '');
}

/**
 * Highlights the part of the code that starts with "<" at an offset.
 * @param {string} source - the code.
 * @param {number} lt - the offset of the "<".
 * @returns {{html: string, end: number}} the HTML and the offset after the part.
 */
function highlightMarkup(source, lt) {
    const length = source.length;
    let end;
    if (source.startsWith(COMMENT_START, lt)) {
        end = getMarkEnd(source, COMMENT_END, lt + COMMENT_START.length, length);
        return { html: getSpanHtml('c', source.slice(lt, end)), end };
    }
    if (source.startsWith(CDATA_START, lt)) end = getMarkEnd(source, CDATA_END, lt + CDATA_START.length, length);
    else if (source.startsWith(INSTRUCTION_START, lt)) end = getMarkEnd(source, INSTRUCTION_END, lt + INSTRUCTION_START.length, length);
    else if (source.startsWith(DECLARATION_START, lt)) end = getDoctypeEnd(source, lt) + 1;
    if (end !== undefined) return { html: getSpanHtml('d', source.slice(lt, end)), end };
    if (source[lt + 1] === '/') {
        const gt = source.indexOf('>', lt);
        end = gt < 0 ? length : gt + 1;
        return { html: highlightEndTag(source.slice(lt, end)), end };
    }
    end = Math.min(getTagEnd(source, lt) + 1, length);
    return { html: highlightTag(source.slice(lt, end)), end };
}

/**
 * Highlights the code for the code view.
 * @param {string} source - the code.
 * @returns {string} the HTML.
 */
export function highlight(source) {
    let html = '', offset = 0;
    const length = source.length;
    while (offset < length) {
        const lt = source.indexOf('<', offset);
        const textEnd = lt < 0 ? length : lt;
        if (textEnd > offset) html += highlightText(source.slice(offset, textEnd));
        if (lt < 0) break;
        const part = highlightMarkup(source, lt);
        html += part.html;
        offset = part.end;
    }
    return html;
}
