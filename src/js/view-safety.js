/**
 * The drawing is shown inline in the editor's page, so everything that could run code,
 * navigate, submit or load a page is made harmless in the copy that is shown (the code stays
 * as it is). Elements are kept, emptied of their attributes, so the shapes still match the
 * code one to one. The CSP (no inline script) is the second line of defense.
 *
 * A reference that holds a template placeholder ({{…}} or <<…>>, raw or percent-encoded) is part
 * of a template: a picture shows a placeholder picture, any other reference is taken out, and a
 * CSS url() shows the placeholder picture, with and without ?template=. The canvas and the
 * exported pictures request nothing for it. In the example view (the drawing filled with a
 * page's examples) the same holds for every reference that held a placeholder in the code or
 * differs from the code: a picture shows only an example picture or the placeholder picture, and
 * every CSS keeps only references inside the drawing and data pictures (setExampleReferences()).
 * CSS is read as css-references.js reads it: a declaration or attribute value with an escape that
 * could spell an address is left out in both views, so no escape names an address past the rule.
 */

import { VIEWER } from './sync.js?v=25';
import { hasTemplatePlaceholder, buildTemplatePicture } from './template-tags.js?v=2';
import { buildEscapeSafeCss, buildCssWithAddresses, isEscapedCssValue, IMPORT_ADDRESS } from './css-references.js?v=2';

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
/** Elements that show the picture their address names (img inside a foreignObject). */
const PICTURE_ELEMENTS = new Set(['image', 'feImage', 'img']);
/** A value that can name an address as CSS: a function that takes one, or @import. */
const CSS_REFERENCE = /url\(|image-set\(|image\(|cross-fade\(|@import/i;
/** An address the example view keeps in CSS: a place inside the drawing or a data picture. */
const LOCAL_CSS_ADDRESS = /^\s*(#|data:image\/(png|jpe?g|gif|webp)[;,])/i;
/** A reference inside the drawing: an address made of a fragment only. */
const LOCAL_REFERENCE = /^\s*#[^\s]*$/;

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
        setPlaceholderReferences(element);
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
 * Shows the references of an element that hold a placeholder as a placeholder picture (pictures
 * and CSS url()) or takes them out (every other address and CSS @import); CSS with an escape that
 * could spell an address is left out.
 * @param {Element} element - an element of the copy; changed.
 * @returns {void}
 */
export function setPlaceholderReferences(element) {
    for (const attribute of [...element.attributes]) {
        const shown = getPlaceholderViewValue(element, attribute.name, attribute.value);
        if (shown === null) element.removeAttributeNode(attribute);
        else if (shown !== attribute.value) attribute.value = shown;
    }
    if (element.localName !== 'style') return;
    const css = buildPlaceholderCss(element.textContent);
    if (css !== element.textContent) element.textContent = css;
}

/**
 * Returns the value an attribute shows in the view: a reference that holds a placeholder becomes
 * the placeholder picture (pictures, CSS url() and the strings of image-set()) or goes (every
 * other address); a value read as CSS that holds an escape with a function or a string goes.
 * @param {Element} element - the element of the view.
 * @param {string} name - the attribute's name.
 * @param {string} value - the value as written.
 * @returns {?string} the value for the view, null to leave the attribute out; the value itself when nothing is held.
 */
export function getPlaceholderViewValue(element, name, value) {
    if (URL_ATTRIBUTE.test(name)) {
        if (!hasTemplatePlaceholder(value)) return value;
        return PICTURE_ELEMENTS.has(element.localName) ? buildTemplatePicture(value) : null;
    }
    if (/^style$/i.test(name)) return buildPlaceholderCss(value);
    if (isEscapedCssValue(value)) return null;
    return hasTemplatePlaceholder(value) && CSS_REFERENCE.test(value) ? buildPlaceholderCss(value) : value;
}

/**
 * Builds a CSS text for the view: pieces with an escape that could spell an address are left out,
 * and in a text that holds a placeholder every address that holds one shows the placeholder
 * picture (an @import of one is left out).
 * @param {string} css - the CSS text as written.
 * @returns {string} the CSS text for the canvas; the text itself when nothing is held.
 */
function buildPlaceholderCss(css) {
    const safe = buildEscapeSafeCss(css);
    return hasTemplatePlaceholder(safe) ? buildCssWithAddresses(safe, getPlaceholderAddress) : safe;
}

/**
 * Returns the address CSS shows for an address that holds a placeholder: the placeholder picture,
 * or nothing for an @import.
 * @param {string} address - the address as written.
 * @param {string} kind - IMPORT_ADDRESS or RESOURCE_ADDRESS (css-references.js).
 * @returns {?string} the address to show, "" to leave an @import out, null to keep the address (no placeholder, or a data picture).
 */
function getPlaceholderAddress(address, kind) {
    if (!hasTemplatePlaceholder(address)) return null;
    if (kind === IMPORT_ADDRESS) return '';
    return /^\s*data:/i.test(address) ? null : buildTemplatePicture(address);
}

/**
 * Holds back the references of an element of the example view, compared with its element in the
 * code (tags as written). An address that held a placeholder there, or differs from it, is held:
 * a reference inside the drawing (#…) stays, a picture element shows an example picture (its
 * filled address is the name of one) or else the placeholder picture, every other element loses
 * it. Every CSS of the example view (style elements, style attributes, values with a CSS
 * reference) keeps only references inside the drawing and data pictures, so no selector over
 * filled values can make a request; a value with an escape that could spell an address goes.
 * @param {Element} element - an element of the filled drawing; changed.
 * @param {?Element} written - its element in the code, null when it has none.
 * @param {function(string): ?string} getExamplePicture - the data address of an example picture by name, null for an unknown name.
 * @returns {void}
 */
export function setExampleReferences(element, written, getExamplePicture) {
    for (const attribute of [...element.attributes]) {
        const shown = getExampleValue(element, attribute.name, attribute.value, written ? written.getAttribute(attribute.name) : null, getExamplePicture);
        if (shown === null) element.removeAttributeNode(attribute);
        else if (shown !== attribute.value) attribute.value = shown;
    }
    if (element.localName === 'style') element.textContent = buildHeldCss(element.textContent);
}

/**
 * Returns what an attribute of the example view shows: a held address an example picture, the
 * placeholder picture, its local reference or nothing; CSS only its local references; any other
 * value as it is.
 * @param {Element} element - the element of the filled drawing.
 * @param {string} name - the attribute's name.
 * @param {string} value - its filled value.
 * @param {?string} writtenValue - its value in the code, null when the code has none.
 * @param {function(string): ?string} getExamplePicture - the data address of an example picture by name.
 * @returns {?string} the value to show, null to leave the attribute out.
 */
function getExampleValue(element, name, value, writtenValue, getExamplePicture) {
    if (URL_ATTRIBUTE.test(name)) {
        if (!isHeldValue(value, writtenValue) || LOCAL_REFERENCE.test(value)) return value;
        return PICTURE_ELEMENTS.has(element.localName) ? getExamplePicture(value.trim()) || buildTemplatePicture(writtenValue ?? value) : null;
    }
    if (/^style$/i.test(name)) return buildHeldCss(value);
    if (isEscapedCssValue(value)) return null;
    return CSS_REFERENCE.test(value) ? buildHeldCss(value) : value;
}

/**
 * Tells whether a value of the example view is held back: it held a placeholder in the code,
 * differs from the code, or the code has no such value.
 * @param {string} value - the value in the filled drawing.
 * @param {?string} writtenValue - the value in the code, null when the code has none.
 * @returns {boolean} true when it is held.
 */
function isHeldValue(value, writtenValue) {
    return writtenValue === null || writtenValue !== value || hasTemplatePlaceholder(writtenValue);
}

/**
 * Builds a CSS text that keeps only references inside the drawing (#…) and data pictures: every
 * other address of url() and image-set() shows the placeholder picture, every @import and every
 * piece with an escape that could spell an address is left out.
 * @param {string} css - the CSS text.
 * @returns {string} the CSS text for the canvas.
 */
function buildHeldCss(css) {
    return buildCssWithAddresses(css, getLocalAddress);
}

/**
 * Returns the address held CSS shows: a local reference or data picture as it is, the
 * placeholder picture for any other picture, nothing for an @import.
 * @param {string} address - the address as written.
 * @param {string} kind - IMPORT_ADDRESS or RESOURCE_ADDRESS (css-references.js).
 * @returns {?string} the address to show, "" to leave an @import out, null to keep a local address.
 */
function getLocalAddress(address, kind) {
    if (kind === IMPORT_ADDRESS) return '';
    return LOCAL_CSS_ADDRESS.test(address) ? null : buildTemplatePicture(address);
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
