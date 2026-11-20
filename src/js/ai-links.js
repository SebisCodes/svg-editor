/**
 * Reading the links an AI answers with. The drawing travels after the # (that part never
 * reaches a server):
 *   #b64=<base64url of the UTF-8 SVG>   #svg=<URL-encoded SVG>   #z=<base64url of zlib-compressed SVG>
 * optionally with &mode=add (only elements, added on top), &file=new&name=NAME (a new
 * drawing) or &file=NAME (that drawing), and for long drawings &part=N&of=M&id=NAME on each of
 * M links; the parts are collected in localStorage (svgeditor.parts.*) until all have arrived.
 *
 * Terminals break long links over several lines, so links are also found in a pasted answer
 * and their lines joined (findLinks()).
 */

const PARTS_KEY = 'svgeditor.parts.';
const LINK_KINDS = ['b64', 'z', 'svg'];
/** A link never carries more than this many characters (also unpacked). */
const MAX_TEXT = 5e6;
/** Base64 is about 4/3 of the text; the allowance for a link's data. */
const MAX_DATA = MAX_TEXT * 1.4;
const MAX_PARTS = 200;
const PART_LIFETIME = 30 * 60e3;            // milliseconds parts of one drawing belong together
const ID_LIMIT = 60;
const NAME_LIMIT = 80;
const DECOMPRESSION_FORMATS = ['deflate', 'deflate-raw', 'gzip'];
/** The characters of one base64 group; a text without its = padding is filled up to whole groups. */
const BASE64_GROUP = 4;
const LINK_START = /#((?:b64|z|svg)=)/g;
const LINK_CHARACTERS = /^[A-Za-z0-9\-_=&%+/.~]+$/;
const LINK_END_PUNCTUATION = /[)>\].,`*'"]+$/;

/**
 * What a link after the # says.
 * @typedef {Object} LinkData
 * @property {string} kind - "b64", "z" or "svg".
 * @property {string} data - the encoded drawing (or this part of it).
 * @property {string} mode - "add" or "set".
 * @property {number} part - this part's number, 0 for a single link.
 * @property {number} of - the number of parts, 0 for a single link.
 * @property {string} id - the name that ties the parts together.
 * @property {{file: string, name: string}} target - which drawing it goes to.
 */

/**
 * What reading a link gives.
 * @typedef {Object} LinkResult
 * @property {string} [svg] - the drawing, when complete.
 * @property {string} [mode] - "add" or "set".
 * @property {{file: string, name: string}} [target] - which drawing it goes to.
 * @property {number[]} [missing] - the parts still missing.
 * @property {number} [part] - the part that arrived.
 * @property {number} [of] - the number of parts.
 * @property {boolean} [error] - true when the link is incomplete or damaged.
 */

/**
 * Returns the bytes of base64 or base64url text; spaces count as "+".
 * @param {string} text - the text.
 * @returns {Uint8Array} the bytes.
 */
function getBase64Bytes(text) {
    const base64 = text.replace(/ /g, '+').replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    const binary = atob(base64 + '='.repeat((BASE64_GROUP - base64.length % BASE64_GROUP) % BASE64_GROUP));
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

/**
 * Unpacks compressed bytes (zlib, raw deflate or gzip). A small link that unpacks to a huge
 * text is no document and is refused.
 * @param {Uint8Array} bytes - the compressed bytes.
 * @returns {Promise<string>} the text.
 * @throws {Error} when the bytes cannot be unpacked or unpack to more than 5 MB.
 */
async function getInflatedText(bytes) {
    for (const format of DECOMPRESSION_FORMATS) {
        try {
            return await readDecompressed(bytes, format);
        } catch (error) { if (error instanceof RangeError) throw new Error('The link unpacks to more than 5 MB - it is not opened.'); }
    }
    throw new Error('The compressed drawing could not be unpacked.');
}

/**
 * Reads bytes through the browser's decompression, up to the size limit.
 * @param {Uint8Array} bytes - the compressed bytes.
 * @param {string} format - "deflate", "deflate-raw" or "gzip".
 * @returns {Promise<string>} the text.
 * @throws {RangeError} when the text grows past the limit.
 */
async function readDecompressed(bytes, format) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)).getReader();
    const chunks = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_TEXT) { reader.cancel(); throw new RangeError('too big'); }
        chunks.push(value);
    }
    return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}

/**
 * Reads the link after the #. Split by hand: URLSearchParams would turn the "+" of normal
 * base64 into spaces.
 * @param {string} hash - the part after the # (with or without it).
 * @returns {?LinkData} what the link says, null when it carries no drawing.
 */
export function parseLinkHash(hash) {
    const values = new Map();
    for (const pair of hash.replace(/^#/, '').split('&')) {
        const equals = pair.indexOf('=');
        if (equals < 0) continue;
        let value = pair.slice(equals + 1);
        try { value = decodeURIComponent(value); } catch (error) { /* keep it as it is */ }
        values.set(pair.slice(0, equals), value);
    }
    const kind = LINK_KINDS.find(key => values.has(key));
    if (!kind) return null;
    return {
        kind, data: values.get(kind),
        mode: values.get('mode') === 'add' ? 'add' : 'set',
        part: +values.get('part') || 0, of: +values.get('of') || 0, id: (values.get('id') || 'drawing').slice(0, ID_LIMIT),
        target: { file: (values.get('file') || '').slice(0, NAME_LIMIT), name: (values.get('name') || '').replace(/\+/g, ' ').slice(0, NAME_LIMIT) },
    };
}

/**
 * Finds the links (the part after the #) in a pasted text. A link that a terminal broke over
 * several lines continues on the following lines as long as they consist of link characters
 * only.
 * @param {string} text - the pasted text.
 * @returns {string[]} the links without the #, in order.
 */
export function findLinks(text) {
    const links = [];
    LINK_START.lastIndex = 0;
    let match;
    while ((match = LINK_START.exec(text))) {
        let position = match.index + 1, link = '';
        while (position < text.length && !/\s/.test(text[position])) link += text[position++];
        for (;;) {
            const nextLine = text.slice(position).match(/^[ \t]*\r?\n[ \t]*([^\s]+)[ \t]*(?=\r?\n|$)/);
            if (!nextLine || !LINK_CHARACTERS.test(nextLine[1]) || /#(?:b64|z|svg)=/.test(nextLine[1])) break;
            link += nextLine[1];
            position += nextLine[0].length;
        }
        links.push(link.replace(LINK_END_PUNCTUATION, ''));
        LINK_START.lastIndex = position;
    }
    return links;
}

/**
 * Decodes the data of a link.
 * @param {string} kind - "b64", "z" or "svg".
 * @param {string} data - the encoded drawing.
 * @returns {Promise<string>} the drawing.
 * @throws {Error} when the link is too long or the data cannot be decoded.
 */
async function convertFromLinkData(kind, data) {
    if (data.length > MAX_DATA) throw new Error('The link is too long.');
    if (kind === 'svg') return data;
    const bytes = getBase64Bytes(data);
    return kind === 'z' ? getInflatedText(bytes) : new TextDecoder().decode(bytes);
}

/**
 * Collects one part of a drawing in localStorage. Parts belong together only within half an
 * hour and up to the size limit; the stored parts are removed once all are there. A reader
 * that consumes its input: each part is taken into storage as it arrives, and the
 * joined data comes back once the last one is there.
 * @param {LinkData} link - the part.
 * @returns {{data: string}|{missing: number[]}|{error: boolean}} the joined data, the parts still missing, or an error.
 */
function readPart(link) {
    const key = PARTS_KEY + link.kind + '.' + link.id;
    let parts = {};
    try { parts = JSON.parse(localStorage.getItem(key) || '{}'); } catch (error) { /* storage blocked */ }
    if (parts.of !== link.of || !(Date.now() - (parts.t || 0) < PART_LIFETIME)) parts = { of: link.of, p: {}, t: Date.now() };
    parts.p[link.part] = link.data;
    if (link.of > MAX_PARTS || Object.values(parts.p).reduce((sum, value) => sum + value.length, 0) > MAX_DATA) {
        try { localStorage.removeItem(key); } catch (error) { /* storage blocked */ }
        return { error: true };
    }
    const missing = [];
    for (let number = 1; number <= link.of; number++) if (!(number in parts.p)) missing.push(number);
    try {
        if (missing.length) localStorage.setItem(key, JSON.stringify(parts));
        else localStorage.removeItem(key);
    } catch (error) { /* storage blocked: parts cannot be collected */ }
    return missing.length ? { missing } : { data: Array.from({ length: link.of }, (unused, number) => parts.p[number + 1]).join('') };
}

/**
 * Reads one link: the drawing, the parts still missing, or an error. A part is collected
 * (a reader that consumes its input).
 * @param {string} hash - the part after the #.
 * @returns {Promise<?LinkResult>} the result, null when the link carries no drawing.
 */
export async function readLink(hash) {
    const link = parseLinkHash(hash);
    if (!link) return null;
    let data = link.data;
    if (link.of > 1) {
        const collected = readPart(link);
        if (collected.error) return { error: true };
        if (collected.missing) return { missing: collected.missing, part: link.part, of: link.of };
        data = collected.data;
    }
    try {
        const svg = await convertFromLinkData(link.kind, data);
        if (!/<[a-z]/i.test(svg)) throw new Error('no markup');
        return { svg, mode: link.mode, target: link.target };
    } catch (error) { return { error: true }; }
}
