/**
 * WebMCP: the editor offers its functions as tools to an AI agent that runs in the browser
 * (document.modelContext, in Chrome as an early preview). The tools run in this page only - no
 * server, no connector. Browsers without WebMCP skip this. Every change is a normal undo step.
 *
 * The shape tools work on the open drawing; list_files, open_file and new_file reach the
 * user's other drawings ("My drawings"); no tool deletes a drawing (mcp-tools.js).
 */

import { createTools } from './mcp-tools.js?v=3';

/**
 * Registers the tools when the browser offers WebMCP; each call is noted for the AI status.
 * @param {McpEditor} editor - what the tools ask of the editor.
 * @returns {?{last: function(): number}} last() tells when an agent last used a tool; null without WebMCP.
 */
export function createMcp(editor) {
    const modelContext = document.modelContext || navigator.modelContext;
    if (!modelContext || typeof modelContext.registerTool !== 'function') return null;
    let lastCall = 0;
    for (const tool of createTools(editor)) {
        const run = tool.execute;
        /**
         * Runs the tool after noting the time of the call and telling the editor.
         * @param {...*} args - the arguments WebMCP passes to the tool.
         * @returns {Promise<string>} the tool's answer for the agent.
         */
        tool.execute = async (...args) => { lastCall = Date.now(); editor.onUse?.(); return run(...args); };
        addTool(modelContext, tool);
    }
    return {
        /**
         * Returns when an agent last used a tool.
         * @returns {number} milliseconds since 1970, 0 for never.
         */
        last: () => lastCall,
    };
}

/**
 * Registers one tool; a tool the browser refuses is left out.
 * @param {Object} modelContext - the browser's WebMCP.
 * @param {Object} tool - the tool.
 * @returns {void}
 */
function addTool(modelContext, tool) {
    try {
        const registration = modelContext.registerTool(tool);
        if (registration && typeof registration.catch === 'function') registration.catch(() => { /* not available on this page */ });
    } catch (error) { /* the browser refused this tool */ }
}
