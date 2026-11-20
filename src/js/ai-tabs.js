/**
 * Editor tabs talk over the BroadcastChannel "svgeditor": a tab opened with an AI link hands
 * the drawing to the editor tab that was used last.
 *   1. the new tab asks "ping"; every open editor tab answers "pong" with when it last had focus;
 *   2. the new tab sends the drawing ("drawing") to the tab used last;
 *   3. that tab takes it and answers "got" with the id of the document it is now in.
 * The viewer shows its own document: it neither hands a link on nor takes one.
 */

const CHANNEL_NAME = 'svgeditor';
const RANDOM_BASE = 36;
/** The characters "0." at the start of a random number written in RANDOM_BASE, left out of an id. */
const RANDOM_PREFIX_LENGTH = 2;
const ANSWER_WAIT = 350;                    // milliseconds to collect the answers of open tabs
const DELIVERY_WAIT = 4000;                 // milliseconds to wait for a tab to take a drawing

/**
 * An open editor tab as it answered.
 * @typedef {Object} EditorTab
 * @property {string} tab - its id.
 * @property {number} focus - when it last had focus (milliseconds since the epoch, 0 for never).
 */

const tabId = Math.random().toString(RANDOM_BASE).slice(RANDOM_PREFIX_LENGTH);
let lastFocus = document.hasFocus() ? Date.now() : 0;
addEventListener('focus', () => { lastFocus = Date.now(); });

/** @type {?BroadcastChannel} */
let channel = null;

/**
 * Opens the channel and answers other tabs: says that this tab is open and takes drawings
 * meant for it. Nothing happens in the viewer or without BroadcastChannel.
 * @param {function(string, string, Object): (Promise<string>|string|void)} receive - takes a drawing (svg, mode, target) and returns the id of the document it is now in.
 * @returns {void}
 */
export function startTabs(receive) {
    const isViewer = new URLSearchParams(location.search).get('viewer') === '1';
    channel = !isViewer && 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
    if (!channel) return;
    channel.addEventListener('message', event => sendTabAnswer(event.data || {}, receive));
}

/**
 * Answers a message of another tab: a ping with when this tab last had focus, a drawing meant
 * for this tab with the id of the document that holds it.
 * @param {Object} message - the message on the channel.
 * @param {function(string, string, Object): (Promise<string>|string|void)} receive - takes a drawing (svg, mode, target) and returns the id of the document that holds it.
 * @returns {void}
 */
function sendTabAnswer(message, receive) {
    if (message.type === 'ping') channel.postMessage({ type: 'pong', ask: message.ask, tab: tabId, focus: lastFocus });
    if (message.type === 'drawing' && message.to === tabId) {
        // got carries the id of the document that holds it, for "Open it here" in the other tab
        Promise.resolve(receive(message.svg, message.mode, message.target)).catch(() => null).then(id => channel.postMessage({ type: 'got', ask: message.ask, id }));
    }
}

/**
 * Finds the open editor tab that was used last.
 * @param {string} ask - the id of this request.
 * @returns {Promise<?EditorTab>} the tab, null when none answered.
 */
export function findEditorTab(ask) {
    if (!channel) return Promise.resolve(null);
    return new Promise(resolve => collectTabAnswers(ask, resolve));
}

/**
 * Pings the editor tabs, collects their answers for a moment and hands on the tab used last.
 * @param {string} ask - the id of this request.
 * @param {function(?EditorTab): void} resolve - takes the tab, null when none answered.
 * @returns {void}
 */
function collectTabAnswers(ask, resolve) {
    const tabs = [];
    /**
     * Adds an answer to this request to the list of tabs.
     * @param {MessageEvent} event - a message of the channel.
     * @returns {void}
     */
    const addAnswer = event => { if (event.data && event.data.type === 'pong' && event.data.ask === ask) tabs.push(event.data); };
    channel.addEventListener('message', addAnswer);
    channel.postMessage({ type: 'ping', ask });
    setTimeout(() => {
        channel.removeEventListener('message', addAnswer);
        tabs.sort((first, second) => second.focus - first.focus);
        resolve(tabs[0] || null);
    }, ANSWER_WAIT);
}

/**
 * Hands a drawing to another editor tab.
 * @param {EditorTab} tab - the tab.
 * @param {string} svg - the drawing.
 * @param {string} mode - "add" or "set".
 * @param {Object} target - which drawing it goes to.
 * @param {string} ask - the id of this request.
 * @returns {Promise<?{id: string}>} the id of the document it is in there, null when the tab did not take it in time.
 */
export function sendToTab(tab, svg, mode, target, ask) {
    return new Promise(resolve => sendHandover({ type: 'drawing', to: tab.tab, svg, mode, target, ask }, resolve));
}

/**
 * Sends a drawing to another tab and hands on the id of the document it is in there.
 * @param {Object} message - the drawing message for the tab, with the id of this request in `ask`.
 * @param {function(?Object): void} resolve - takes {id} of the document there, null when the tab did not take it in time.
 * @returns {void}
 */
function sendHandover(message, resolve) {
    /**
     * Waits for the tab's answer to this request.
     * @param {MessageEvent} event - a message of the channel.
     * @returns {void}
     */
    const handleTabAnswer = event => { if (event.data && event.data.type === 'got' && event.data.ask === message.ask) { channel.removeEventListener('message', handleTabAnswer); resolve({ id: event.data.id }); } };
    channel.addEventListener('message', handleTabAnswer);
    channel.postMessage(message);
    setTimeout(() => { channel.removeEventListener('message', handleTabAnswer); resolve(null); }, DELIVERY_WAIT);
}
