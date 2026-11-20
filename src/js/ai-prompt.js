/**
 * The prompt "Copy prompt" puts on the clipboard: how to answer (a link the editor reads, or
 * a request to the page's server when the page around the editor takes the AI's result), the
 * user's drawings, the open drawing with its selection, and "My request:" at the end for the
 * user to fill in. The prompt is always English.
 *
 * Text from the page around the editor is marked as such: where it comes from (the real
 * origin) and fenced, so the AI can tell it apart from what the user writes.
 */

const SITE = 'https://svg.giit.ch/';
const OTHER_NAMES_LIMIT = 40;

/** How to answer with a link. */
export const PROMPT_BASE = `You draw SVG for my editor ${SITE}. It runs in my browser.

HOW TO ANSWER
Write the complete SVG: <svg xmlns="http://www.w3.org/2000/svg" viewBox="…">, well-formed XML, shapes with an id. Keep my work unless I ask otherwise.
Send it as a link: ${SITE}#b64=<base64url of the UTF-8 SVG> (shorter: zlib-compress first and use #z=; without code: #svg=<URL-encoded SVG>). Open the link yourself if you can; otherwise give it to me - I click it or paste your whole answer into the editor.
- New drawing: add &file=new&name=<short name>. Change one of my drawings: add &file=<its exact name>.
- Only add shapes on top: send just them and add &mode=add.
- Longer than about 8000 characters: one link per part with &part=N&of=M&id=<short name>.`;

/** Saving on the user's own server; left out when a page that holds the drawing opened the editor (it saves there by itself). */
export const PROMPT_SAVING = `MY OWN SERVER (only if I ask about it)
The editor can POST every saved version as JSON {editor, event:"save", id, name, content, updated} to my server (webhook, optional Bearer token, CORS from ${SITE.replace(/\/$/, '')}). It can be embedded with <iframe src="${SITE}?embed=1"> or opened with window.open("${SITE}?embed=window") and then talks with postMessage (svgeditor:ready, load, loaded, change, save, get, ai, key-request). If I ask you to build that, follow ${SITE}llms.txt exactly.`;
export const PROMPT_HEAD = `${PROMPT_BASE}\n\n${PROMPT_SAVING}`;

/**
 * What the page around the editor tells the AI (plain text from that page).
 * @typedef {Object} PageContext
 * @property {string} [host] - the page's name for itself.
 * @property {string} [title] - the title of its document.
 * @property {string} [rules] - its rules for the drawing.
 * @property {string} [site] - the host of its real origin.
 */

/**
 * The open drawing and the user's other drawings, as the prompt needs them.
 * @typedef {Object} PromptState
 * @property {string} svg - the code.
 * @property {string} sel - the start tag of the selected shape, "" for none.
 * @property {string} name - the drawing's name.
 * @property {string[]} files - the names of all drawings.
 * @property {?PageContext} context - what the page around the editor tells the AI.
 * @property {boolean} framed - true inside another website: a clicked link does not reach the editor.
 * @property {?Object} remote - the page's AI settings (sync.js), null without.
 */

/**
 * Returns text from the website, marked with where it comes from and fenced.
 * @param {string} head - the heading, e.g. "RULES".
 * @param {string} [site] - the host of the page's real origin.
 * @param {string} [label] - the page's name for itself.
 * @param {string} text - the text.
 * @returns {string} the marked text.
 */
function getSiteText(head, site, label, text) {
    return `${head} ${site ? `FROM THE WEBSITE ${site}` : 'FROM THE WEBSITE'}${label && label !== site ? ` ("${label}")` : ''}\n\`\`\`text\n${text.replace(/`{3,}/g, "'''")}\n\`\`\``;
}

/**
 * Returns the part about the page that opened the editor and saves the drawing.
 * @param {PageContext} context - what the page tells the AI.
 * @returns {string} the text.
 */
function getContextText(context) {
    return `THIS DRAWING BELONGS TO ${context.host ? `"${context.host}"` : 'a website'}${context.title ? ` ("${context.title}")` : ''}
That page opened the editor and gets every saved version back by itself when I click Save (or press Ctrl+S) - nothing to set up and no server to build. Keep the drawing working with that page.${context.rules ? `\n\n${getSiteText('RULES', context.site, context.host, context.rules)}` : ''}`;
}

/**
 * Returns the prompt when the page around the editor takes the AI's result on its own server
 * (remote: prompt, endpoint, key, label, base - see sync.js). The AI sends the result there
 * itself; the page then opens it here.
 * @param {PromptState} promptState - the drawings.
 * @param {Object} remote - the page's AI settings.
 * @param {boolean} makeNew - true for a new drawing.
 * @returns {string} the head of the prompt.
 */
function getRemotePrompt(promptState, remote, makeNew) {
    const target = makeNew ? 'new' : 'current';
    const parts = [];
    if (remote.base) {
        parts.push(`You write for my SVG editor ${SITE}, inside the website "${remote.label}".\nWrite the complete SVG: <svg xmlns="http://www.w3.org/2000/svg" viewBox="…">, well-formed XML, shapes with an id. Keep my work unless I ask otherwise.`);
    }
    if (remote.prompt) parts.push(getSiteText('INSTRUCTIONS', remote.site, remote.label, remote.prompt));
    if (promptState.context && promptState.context.rules) parts.push(getSiteText('RULES', remote.site, remote.label, promptState.context.rules));
    const what = makeNew ? `Make a NEW drawing; leave "${promptState.name}" as it is.` : `Change my drawing "${promptState.name}".`;
    const link = `${SITE}#b64=<base64url of the UTF-8 SVG>${makeNew ? '&file=new&name=<short name>' : ''}`;
    if (remote.endpoint && remote.key) parts.push(`HOW TO ANSWER
${what} Send the result with one HTTP request (run it, do not only show it):
  POST ${remote.endpoint}
  Authorization: Bearer ${remote.key}
  Content-Type: application/json
  {"editor":"svg","target":"${target}","name":"<short name>","content":"<the complete SVG>"}
Build the JSON with a JSON library. The result then opens in my editor; tell me briefly what you did, or the server's error message.
If you cannot send HTTP requests, give me the link ${link} and I paste your answer into the editor.`);
    else parts.push(`HOW TO ANSWER\n${what} Give me the link ${link}; I paste your answer into the editor (a clicked link does not reach it).`);
    return parts.join('\n\n');
}

/**
 * Returns the head of the prompt: the page's server, the page that holds the drawing, or the
 * links; inside another website the AI is told not to open the link itself.
 * @param {PromptState} promptState - the drawings.
 * @param {boolean} makeNew - true for a new drawing.
 * @returns {string} the head.
 */
function getPromptHead(promptState, makeNew) {
    let head = promptState.remote ? getRemotePrompt(promptState, promptState.remote, makeNew)
        : promptState.context ? `${PROMPT_BASE}\n\n${getContextText(promptState.context)}` : PROMPT_HEAD;
    if (promptState.framed && !promptState.remote) head += `\n\nMy editor is inside another website, so a clicked link does not reach it: do not open the link yourself - give it to me and I paste your answer.`;
    return head;
}

/**
 * Returns the prompt for the AI: the head, the user's drawings and what to change, the open
 * drawing with its selection, and "My request: " at the end.
 * @param {PromptState} promptState - the drawings.
 * @param {boolean} makeNew - true when the AI makes a new drawing, false when it changes the open one.
 * @returns {string} the prompt.
 */
export function getPrompt(promptState, makeNew) {
    const name = promptState.name;
    const others = promptState.files.filter(fileName => fileName !== name);
    const list = `Open now: "${name}"${others.length ? `. Others: ${others.slice(0, OTHER_NAMES_LIMIT).map(fileName => `"${fileName}"`).join(', ')}${others.length > OTHER_NAMES_LIMIT ? ' …' : ''}` : ''}.`;
    const goal = makeNew
        ? 'Unless I say otherwise in my request, make a NEW drawing (&file=new&name=<short name>) and leave my drawings as they are.'
        : `Unless I say otherwise in my request, change "${name}" (&file=${encodeURIComponent(name)}).`;
    let drawingHead = makeNew ? `MY OPEN DRAWING "${name}" (for reference only - do not change it)` : `MY CURRENT DRAWING "${name}"`;
    if (promptState.remote) drawingHead = `MY ${makeNew ? 'CURRENT' : ''} DRAWING "${name}"`.replace('  ', ' ');
    return `${getPromptHead(promptState, makeNew)}\n\n${promptState.remote ? '' : `${list}\n${goal}\n\n`}${drawingHead}${promptState.sel ? ` (I have selected: ${promptState.sel})` : ''}\n\`\`\`svg\n${promptState.svg.trim()}\n\`\`\`\n\nMy request: `;
}
