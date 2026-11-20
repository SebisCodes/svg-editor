/**
 * "My drawings": several drawings kept in this browser (localStorage), no server.
 * svgeditor.files holds the list [{ id, name, created, updated, size }], svgeditor.file.<id>
 * the code of each drawing.
 *
 * Documents from a page around the editor are kept in memory only (temp): they are in the
 * list like the others but never written to the browser's storage, and are gone when the
 * editor closes. An entry of such a document found in storage is removed with its content
 * when this file loads, before anything reads the list.
 */

const LIST_KEY = 'svgeditor.files';
const FILE_KEY = 'svgeditor.file.';
const DEFAULT_NAME = 'Drawing';
const NAME_LIMIT = 80;
const ID_RANDOM_LENGTH = 4;
const ID_BASE = 36;

/**
 * The entry of a drawing in the list.
 * @typedef {Object} DocumentEntry
 * @property {string} id - the drawing's id.
 * @property {string} name - its name.
 * @property {number} created - when it was made (milliseconds since the epoch).
 * @property {number} updated - when it last changed (milliseconds since the epoch).
 * @property {number} [size] - the size of its code in bytes.
 * @property {boolean} [temp] - true for a page's drawing kept in memory only.
 * @property {string} [page] - the origin of the page the drawing came from.
 * @property {Object} [hook] - the drawing's own webhook (sync.js).
 */

/** In-memory drawings of a page: id -> { meta, code }. */
const temporary = new Map();

/** The storage key of the list; the storage event of another tab names it. */
export { LIST_KEY };

/**
 * The drawings of this browser. The tests call list, code, create and remove by these names.
 */
export const store = {
    /**
     * Returns the drawings stored in this browser.
     * @returns {DocumentEntry[]} the stored entries, without in-memory ones.
     */
    getSaved() {
        try {
            const entries = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
            return Array.isArray(entries) ? entries.filter(entry => entry && entry.id && !entry.temp) : [];
        } catch (error) { return []; }
    },
    /**
     * Returns every drawing: the stored ones and the page's in memory.
     * @returns {DocumentEntry[]} the entries.
     */
    list() { return [...this.getSaved(), ...[...temporary.values()].map(held => held.meta)]; },
    /**
     * Returns every drawing, most recently changed first.
     * @returns {DocumentEntry[]} the entries.
     */
    getSorted() { return this.list().sort((first, second) => second.updated - first.updated); },
    /**
     * Returns the entry of a drawing.
     * @param {string} id - the drawing's id.
     * @returns {?DocumentEntry} the entry, or null.
     */
    getMeta(id) { return this.list().find(entry => entry.id === id) || null; },
    /**
     * Tells whether a drawing is kept in memory only.
     * @param {string} id - the drawing's id.
     * @returns {boolean} true for a page's drawing.
     */
    isTemp(id) { return temporary.has(id); },
    /**
     * Returns the code of a drawing.
     * @param {string} id - the drawing's id.
     * @returns {?string} the code, or null when there is none or storage is blocked.
     */
    code(id) {
        if (temporary.has(id)) return temporary.get(id).code;
        try { return localStorage.getItem(FILE_KEY + id); } catch (error) { return null; }
    },
    /**
     * Writes the code and/or name of a drawing; adds it to the list if it is missing (for
     * example deleted in another tab meanwhile).
     * @param {string} id - the drawing's id.
     * @param {Object} fields - what changes.
     * @param {string} [fields.name] - the new name.
     * @param {string} [fields.code] - the new code.
     * @returns {void}
     * @throws {DOMException} when the storage is full.
     */
    write(id, { name, code }) {
        const held = temporary.get(id);
        if (held) {
            if (code != null) { held.code = code; held.meta.updated = Date.now(); held.meta.size = new Blob([code]).size; }
            if (name) held.meta.name = name;
            return;
        }
        const entries = this.getSaved();
        let entry = entries.find(saved => saved.id === id);
        if (!entry) { entry = { id, name: name || DEFAULT_NAME, created: Date.now(), updated: Date.now() }; entries.push(entry); }
        if (code != null) { localStorage.setItem(FILE_KEY + id, code); entry.updated = Date.now(); entry.size = new Blob([code]).size; }
        if (name) entry.name = name;
        localStorage.setItem(LIST_KEY, JSON.stringify(entries));
    },
    /**
     * Sets other fields of a drawing's entry, for example its own webhook; null removes a field.
     * @param {string} id - the drawing's id.
     * @param {Object} fields - field -> value.
     * @returns {void}
     * @throws {DOMException} when the storage is full.
     */
    setMeta(id, fields) {
        const held = temporary.get(id);
        const entries = held ? null : this.getSaved();
        const entry = held ? held.meta : entries.find(saved => saved.id === id);
        if (!entry) return;
        for (const [key, value] of Object.entries(fields)) { if (value == null) delete entry[key]; else entry[key] = value; }
        if (entries) localStorage.setItem(LIST_KEY, JSON.stringify(entries));
    },
    /**
     * Creates a drawing with a free name.
     * @param {string} name - the wanted name.
     * @param {string} code - its code.
     * @param {boolean} [inMemory] - keep it in memory only (a page's drawing), never stored.
     * @returns {string} the new drawing's id.
     * @throws {DOMException} when the storage is full.
     */
    create(name, code, inMemory = false) {
        const id = Date.now().toString(ID_BASE) + Math.random().toString(ID_BASE).slice(2, 2 + ID_RANDOM_LENGTH);
        if (inMemory) {
            const now = Date.now();
            temporary.set(id, { meta: { id, name: this.getUniqueName(name), created: now, updated: now, size: new Blob([code || '']).size, temp: true }, code: code || '' });
        } else this.write(id, { name: this.getUniqueName(name), code });
        return id;
    },
    /**
     * Removes a drawing and its code.
     * @param {string} id - the drawing's id.
     * @returns {void}
     */
    remove(id) {
        if (temporary.delete(id)) return;
        try {
            localStorage.removeItem(FILE_KEY + id);
            localStorage.setItem(LIST_KEY, JSON.stringify(this.getSaved().filter(entry => entry.id !== id)));
        } catch (error) { /* storage blocked */ }
    },
    /**
     * Finds the drawing with a name, ignoring case and spaces around it.
     * @param {*} name - the name.
     * @returns {?DocumentEntry} the entry, or null.
     */
    findByName(name) {
        const wanted = String(name || '').trim().toLowerCase();
        return wanted ? this.list().find(entry => entry.name.trim().toLowerCase() === wanted) || null : null;
    },
    /**
     * Returns a name no other drawing has: "House", or "House 2", "House 3" … when it is taken.
     * @param {*} name - the wanted name.
     * @param {string} [exceptId] - a drawing whose own name does not count.
     * @returns {string} the free name.
     */
    getUniqueName(name, exceptId) {
        const base = String(name || DEFAULT_NAME).trim().slice(0, NAME_LIMIT) || DEFAULT_NAME;
        const taken = new Set(this.list().filter(entry => entry.id !== exceptId).map(entry => entry.name.trim().toLowerCase()));
        if (!taken.has(base.toLowerCase())) return base;
        const stem = base.replace(/\s+\d+$/, '');
        for (let number = 2; ; number++) if (!taken.has(`${stem} ${number}`.toLowerCase())) return `${stem} ${number}`;
    },
};

/**
 * Removes every entry of a page's in-memory drawing from storage, with its content: such a
 * drawing never belongs there.
 * @returns {void}
 */
function removeStoredTemporary() {
    try {
        const entries = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
        if (!Array.isArray(entries) || !entries.some(entry => entry && entry.temp)) return;
        for (const entry of entries) {
            if (entry && entry.temp && entry.id) localStorage.removeItem(FILE_KEY + entry.id);
        }
        localStorage.setItem(LIST_KEY, JSON.stringify(entries.filter(entry => entry && !entry.temp)));
    } catch (error) { /* storage blocked */ }
}

removeStoredTemporary();
