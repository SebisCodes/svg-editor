/**
 * The drawing is shown inline in the editor's page, so everything that could run code,
 * navigate, submit or load a page is made harmless in the copy that is shown (the code stays
 * as it is). Elements are kept, emptied of their attributes, so the shapes still match the
 * code one to one. The CSP (no inline script) is the second line of defense.
 */

import { VIEWER } from './sync.js?v=23';

/** Elements that could run code, load a page or submit: kept, but emptied of their attributes. */
const INERT = /^(script|iframe|frame|frameset|embed|object|applet|meta|link|base|form|portal|noscript|template|handler|listener)$/i;
/** Elements whose text content is dropped as well. */
const EMPTIED = new Set(['script', 'meta', 'noscript', 'template']);
/** Attributes that hold an address. */
const URL_ATTRIBUTE = /^(?:.*:)?(href|src|srcset|action|formaction|data|poster|background|ping|codebase|cite)$/i;
/** Animation elements, which can set an attribute later (<set attributeName="href" to="javascript:…">). */
const ANIMATION = /^(set|animate|animateTransform|animateMotion|animateColor|discard)$/;
const ANIMATED_UNSAFE = /(^|:)(href|src|action|on\w*|style|target|data)$/i;
const ANIMATION_VALUES = ['to', 'from', 'by', 'values'];
const ALWAYS_REMOVED = /^(formtarget|target|download|http-equiv)$/i;
const CONTROL_CHARACTERS = /[\u0000-\u0020\u007f-\u009f]/g;
const PICTURE_DATA = /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i;

/**
 * Tells whether an address may stay in the view: references inside the drawing, https
 * pictures and data pictures; links never navigate the editor. In the viewer, links to
 * #places, https: and mailto: stay (sync.js follows them safely).
 * @param {Element} element - the element with the address.
 * @param {string} value - the address.
 * @returns {boolean} true when it may stay.
 */
function isSafeUrl(element, value) {
    const address = value.replace(CONTROL_CHARACTERS, '');      // "jav&#9;ascript:" arrives decoded, with the tab
    if (element.localName === 'a') return VIEWER && (address.startsWith('#') || /^(https:|mailto:)/i.test(address));
    if (address.startsWith('#')) return true;
    return /^https:\/\//i.test(address) || PICTURE_DATA.test(address);
}

/**
 * Makes a copy of the drawing harmless to show: inert elements lose their attributes, scripts
 * their text, animations of unsafe attributes their target, every element its event handlers,
 * targets and unsafe addresses.
 * @param {Element} root - the root of the copy; changed.
 * @returns {void}
 */
export function disableActiveContent(root) {
    for (const element of [root, ...root.querySelectorAll('*')]) {
        if (INERT.test(element.localName)) { disableInertElement(element); continue; }
        if (ANIMATION.test(element.localName) && ANIMATED_UNSAFE.test(element.getAttribute('attributeName') || '')) {
            element.removeAttribute('attributeName');
            ANIMATION_VALUES.forEach(name => element.removeAttribute(name));
        }
        for (const attribute of [...element.attributes]) {
            if (/^on/i.test(attribute.localName) || ALWAYS_REMOVED.test(attribute.localName) || (URL_ATTRIBUTE.test(attribute.name) && !isSafeUrl(element, attribute.value))) element.removeAttributeNode(attribute);
        }
    }
}

/**
 * Empties an inert element: every attribute but id and class goes, scripts become plain text
 * without content.
 * @param {Element} element - the element; changed.
 * @returns {void}
 */
function disableInertElement(element) {
    for (const attribute of [...element.attributes]) if (!/^(id|class)$/.test(attribute.name)) element.removeAttributeNode(attribute);
    if (EMPTIED.has(element.localName)) element.textContent = '';
    if (element.localName === 'script') element.setAttribute('type', 'text/plain');
}

/**
 * Tells whether an attribute set on the canvas may be copied into the view.
 * @param {string} name - the attribute's name.
 * @param {string} value - its value.
 * @returns {boolean} false for event handlers and javascript: addresses.
 */
export function isSafeForView(name, value) {
    return !/^on/i.test(name) && !/^\s*javascript:/i.test(value);
}
