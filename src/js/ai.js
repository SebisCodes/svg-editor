/**
 * AI Assistant without any server: any AI sends a drawing as a link.
 *
 * "Copy prompt" puts instructions and the current drawing on the clipboard (ai-prompt.js).
 * The AI answers with a link that carries the SVG after the # (ai-links.js). A tab opened with
 * such a link:
 *   1. collects the part, when the drawing comes in several links;
 *   2. hands the drawing to the editor tab that is already open (ai-tabs.js) and shows that it
 *      was taken over (the drawing can be opened there too);
 *   3. without an open editor, loads the drawing itself.
 * The AI's whole answer can also be pasted into the editor (Ctrl+V anywhere, or the field in
 * the dialog): the links are found and their broken lines joined.
 *
 * When the page around the editor takes the AI's result on its own server, the dialog says
 * so and the prompt asks the AI to send it there (sync.js holds those settings).
 */

import { openDialog } from './dialogs.js?v=5';
import { isKeyInPrompt, isAnswerFromPage, getPageTexts } from './prompt-parts.js?v=1';
import { getPrompt } from './ai-prompt.js?v=3';
import { parseLinkHash, findLinks, readLink } from './ai-links.js?v=3';
import { startTabs, findEditorTab, sendToTab } from './ai-tabs.js?v=3';

const RANDOM_BASE = 36;
const BROKEN = 'The drawing in this link is incomplete or damaged. If the AI\'s link was split over several lines (as in a terminal), copy the whole answer and paste it into the editor with Ctrl+V - the editor joins the lines.';
const FIELDS = 'textarea, input, select, [contenteditable]';

/**
 * What the AI Assistant asks of the editor.
 * @typedef {Object} AiEditor
 * @property {function(): Object} getState - the open drawing: svg, sel, name, files, context.
 * @property {function(string, string, Object): Promise<string>} receive - takes a drawing (svg, mode, target), resolves with the id of its document.
 * @property {function(string): void} toast - shows a short message.
 * @property {function(): ?Object} [remote] - the page's AI settings, or null.
 * @property {function(): Promise<?Object>} [fetchKey] - asks the page for the session's key while there is none.
 * @property {function(): boolean} [keyValid] - true when the session has its key.
 * @property {function(string): boolean} [open] - opens a stored document in this tab, false when there is none.
 * @property {function(function(): void): void} [handleAiClick] - a press on the AI button: the page's own dialog when it shows one, else the function given (the editor's dialog).
 * @property {function(): string} [getKeyDecline] - the page's text for a declined key request, "" without.
 */

/**
 * The parts of the dialog and the notice.
 * @typedef {Object} AiElements
 * @property {HTMLDialogElement} dialog - the AI Assistant dialog.
 * @property {HTMLElement} notice - the notice a tab opened by a link shows.
 * @property {HTMLTextAreaElement} handCopy - the prompt to copy by hand where copying is not allowed.
 * @property {HTMLElement} remoteBox - what the page around the editor says.
 * @property {HTMLElement} stepLink - the step about the link.
 * @property {string} stepHtml - its HTML as the page brings it.
 * @property {HTMLElement} privacy - the privacy note.
 * @property {string} privacyText - its text as the page brings it.
 * @property {HTMLElement} keyNote - whether the session has its key.
 * @property {HTMLTextAreaElement} pasteField - the field for the AI's answer.
 */

/** @type {AiEditor} */
let aiEditor = null;
/** @type {AiElements} */
const parts = {};
/** Inside another website the editor may not use the clipboard API, and a clicked link opens a separate editor. */
const isFramed = window.parent !== window;
/** Links being taken now: one paste can fire several input events, each with the whole answer. */
const linksInFlight = new Set();

/**
 * Sets up the AI Assistant: the dialog, links that arrive, pasted answers and the other tabs.
 * @param {AiEditor} editor - what the AI Assistant asks of the editor.
 * @returns {{refresh: function(): void}} refresh() shows the page's AI settings anew.
 */
export function createAi({ getState, receive, toast, remote = () => null, fetchKey = () => Promise.resolve(null), keyValid = () => false, open = () => false, handleAiClick = openEditorDialog => openEditorDialog(), getKeyDecline = () => '' }) {
    aiEditor = { getState, receive, toast, remote, fetchKey, keyValid, open, handleAiClick, getKeyDecline };
    startTabs(receive);
    startParts();
    document.getElementById('btn-ai').addEventListener('click', () => aiEditor.handleAiClick(openAiDialog));
    if (isFramed) {
        parts.stepLink.innerHTML = 'The AI answers with a link: <b>paste its whole answer below</b> (a clicked link opens a separate editor). <b>Undo</b> takes it back.';
    }
    parts.stepHtml = parts.stepLink.innerHTML;
    document.getElementById('ai-copy').addEventListener('click', copyPrompt);
    addEventListener('paste', receivePastedAnswer);
    parts.pasteField.addEventListener('input', () => { if (findLinks(parts.pasteField.value).length) receiveAnswerText(parts.pasteField.value).then(() => { parts.pasteField.value = ''; }); });
    addEventListener('hashchange', receiveLinkFromAddress);
    receiveLinkFromAddress();
    return { refresh: showRemote };
}

/**
 * Finds the parts of the dialog and the notice and keeps them for this file.
 * @returns {void}
 */
function startParts() {
    /**
     * Returns the element with an id.
     * @param {string} id - the element's id.
     * @returns {?HTMLElement} the element, or null.
     */
    const getById = id => document.getElementById(id);
    Object.assign(parts, {
        dialog: getById('ai'), notice: getById('ai-receive'), handCopy: getById('ai-prompt-text'),
        remoteBox: getById('ai-remote'), stepLink: getById('ai-step-link'), privacy: getById('ai-privacy'),
        keyNote: getById('ai-key-exp'), pasteField: getById('ai-paste'),
    });
    parts.privacyText = parts.privacy.textContent;
}

/**
 * Opens the dialog with the name of the open drawing and the page's AI settings.
 * @returns {void}
 */
function openAiDialog() {
    document.getElementById('ai-cur').textContent = aiEditor.getState().name;
    showRemote();
    openDialog(parts.dialog);
}

/**
 * Shows the notice of a tab opened by a link.
 * @param {string} title - its heading.
 * @param {string} text - its text.
 * @param {?function(): void} [openHere] - what "Open it here" does, null to hide that button.
 * @param {boolean} [isLoading] - true while the link is read: the notice is the loading screen, without buttons.
 * @returns {void}
 */
function showNotice(title, text, openHere = null, isLoading = false) {
    const notice = parts.notice;
    notice.classList.toggle('loading', isLoading);
    notice.querySelector('h2').textContent = title;
    notice.querySelector('p').textContent = text;
    const button = notice.querySelector('[data-here]');
    button.hidden = !openHere;
    /**
     * Hides the notice and opens the drawing here (the button's click handler).
     * @returns {void}
     */
    button.onclick = () => { notice.hidden = true; openHere(); };
    notice.hidden = false;
}

/**
 * Takes the drawing of a link in the page's address (the steps at the top).
 * @returns {Promise<void>} resolves when the drawing is handed on or loaded, or the notice says why not.
 */
async function receiveLinkFromAddress() {
    if (!parseLinkHash(location.hash)) return;
    const hash = location.hash;
    history.replaceState(null, '', location.pathname + location.search);
    showNotice('Loading…', '', null, true);
    const result = await readLink(hash);
    if (result.missing) {
        showNotice(`Part ${result.part} of ${result.of} received`, `Open the other ${result.missing.length === 1 ? 'link' : 'links'} from the AI too (still missing: part ${result.missing.join(', ')}).`);
        return;
    }
    if (result.error) { showNotice('The link could not be read', BROKEN); return; }
    const { svg, mode, target } = result;
    const ask = Math.random().toString(RANDOM_BASE).slice(2);
    const tab = await findEditorTab(ask);
    const sent = tab && await sendToTab(tab, svg, mode, target, ask);
    if (sent) {
        // "Open it here" opens the document the other tab saved; one that is not stored there (kept in memory) comes from the link again.
        showNotice('Taken over by your editor', 'The drawing is now in the SVG Editor tab you already had open. Switch to that tab, or open it here.', () => { if (!sent.id || !aiEditor.open(sent.id)) aiEditor.receive(svg, mode, target); });
        return;
    }
    parts.notice.hidden = true;
    aiEditor.receive(svg, mode, target);
}

/**
 * Copies text with the old copy command, from a hidden field inside the open dialog (the only
 * place that can take focus).
 * @param {string} text - the text.
 * @returns {boolean} true when it was copied (a command that tells whether it took place).
 */
function copyWithCommand(text) {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    parts.dialog.append(field);
    field.select();
    let isCopied = false;
    try { isCopied = document.execCommand('copy'); } catch (error) { /* not allowed */ }
    field.remove();
    return isCopied;
}

/**
 * Copies text: the clipboard, else the old copy command, else the text selected to copy by
 * hand (a page that embeds the editor has to allow the clipboard with allow="clipboard-write").
 * @param {string} text - the text.
 * @param {function(): void} onCopied - called when it was copied.
 * @returns {Promise<void>} resolves when copied or shown to copy by hand.
 */
async function copyText(text, onCopied) {
    /**
     * Hides the field to copy by hand and reports the copy.
     * @returns {void}
     */
    const showCopyDone = () => { parts.handCopy.hidden = true; onCopied(); };
    try { await navigator.clipboard.writeText(text); showCopyDone(); return; } catch (error) { /* not allowed here */ }
    if (copyWithCommand(text)) { showCopyDone(); return; }
    parts.handCopy.value = text;
    parts.handCopy.hidden = false;
    parts.handCopy.focus();
    parts.handCopy.select();
    aiEditor.toast('Copying is not allowed here - it is selected below: press Ctrl+C (⌘C)');
}

/**
 * Shows what the page around the editor says about the AI: its name, its own prompt, whether
 * the session has its key; without such a page the dialog's own texts.
 * @returns {void}
 */
function showRemote() {
    const settings = aiEditor.remote();
    parts.remoteBox.hidden = !settings;
    parts.privacy.textContent = !settings ? parts.privacyText : isAnswerFromPage(settings)
        ? `${settings.label} gives the AI its instructions for answering. What you paste into your AI is handled by its provider.`
        : `The AI sends the drawing to ${settings.label} with a key that only works for this session. What you paste into your AI is handled by its provider.`;
    if (!settings) { parts.stepLink.innerHTML = parts.stepHtml; return; }
    document.getElementById('ai-remote-host').textContent = settings.site && settings.site !== settings.label ? `${settings.label} (${settings.site})` : settings.label;
    const details = document.getElementById('ai-remote-details');
    const pageTexts = getPageTexts(settings);
    details.hidden = !pageTexts;
    details.querySelector('span').textContent = settings.site || settings.label;
    document.getElementById('ai-remote-prompt').textContent = pageTexts;
    parts.stepLink.textContent = isAnswerFromPage(settings)
        ? `The AI answers as ${settings.label} describes in the prompt. If it answers with a link, paste its answer below.`
        : `The AI sends its result to ${settings.label} by itself, and it opens here. If it answers with a link, paste its answer below.`;
    parts.keyNote.textContent = !isKeyInPrompt(settings) ? '' : !settings.key ? '(no key yet)' : '(key valid while the editor is open)';
}

/**
 * Copies the prompt; asks the page for the session's key first when the prompt posts to the
 * page's endpoint and the session has no key yet. A page that declines the key gives the
 * message shown after copying.
 * @returns {Promise<void>} resolves when copied.
 */
async function copyPrompt() {
    let settings = aiEditor.remote(), declined = '';
    if (isKeyInPrompt(settings) && !aiEditor.keyValid()) {
        await aiEditor.fetchKey();
        settings = aiEditor.remote();
        showRemote();
        if (settings && !aiEditor.keyValid()) { declined = aiEditor.getKeyDecline(); aiEditor.toast(declined || `No key from ${settings.label} - the prompt asks the AI for a link instead`); }
    }
    const makeNew = parts.dialog.querySelector('[name=ai-target]:checked').value === 'new';
    const remote = settings && settings.endpoint && !aiEditor.keyValid() ? { ...settings, key: '' } : settings;
    const text = getPrompt({ ...aiEditor.getState(), framed: isFramed, remote }, makeNew);
    copyText(text, () => {
        aiEditor.toast(declined || (settings && aiEditor.keyValid() && !isAnswerFromPage(settings) ? `Prompt copied - the AI sends its result to ${settings.label}` : 'Prompt copied - paste it into your AI and say what it should draw'));
        parts.dialog.close();
    });
}

/**
 * Takes an AI's answer pasted outside a field (the paste field of the dialog counts).
 * @param {ClipboardEvent} event - the paste event.
 * @returns {void}
 */
function receivePastedAnswer(event) {
    const active = document.activeElement;
    if (active && active !== parts.pasteField && active.matches(FIELDS)) return;
    const text = event.clipboardData.getData('text');
    if (!findLinks(text).length) return;
    event.preventDefault();
    parts.pasteField.value = '';
    receiveAnswerText(text);
}

/**
 * Takes every complete drawing in an AI's answer, in order (not only the last one); the same
 * link twice counts once. A link still being taken from an earlier event is skipped.
 * @param {string} text - the answer.
 * @returns {Promise<boolean>} true when the answer held a link (a command that tells whether it took place).
 */
async function receiveAnswerText(text) {
    const links = findLinks(text);
    if (!links.length) return false;
    let last = null;
    const complete = [], taken = [];
    try {
        for (const link of new Set(links)) {
            if (linksInFlight.has(link)) { last = last || { busy: true }; continue; }
            linksInFlight.add(link);
            taken.push(link);
            const result = await readLink('#' + link);
            if (!result) continue;
            last = result;
            if (!result.missing && !result.error) complete.push(result);
        }
        if (!last) return false;
        if (complete.length) {
            for (const result of complete) await aiEditor.receive(result.svg, result.mode, result.target);
            parts.dialog.close();
            return true;
        }
        if (last.busy) return true;
        if (last.missing) aiEditor.toast(`Part ${last.part} of ${last.of} received - paste the other ${last.missing.length === 1 ? 'link' : 'links'} too (missing: ${last.missing.join(', ')})`);
        else if (last.error) aiEditor.toast('This link is incomplete or damaged - please ask the AI to send it again');
        return true;
    } finally { for (const link of taken) linksInFlight.delete(link); }
}
