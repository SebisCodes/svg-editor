/**
 * The hint line at the bottom left of the canvas: what the chosen tool does, and whether
 * shapes snap to the grid. Touch screens get shorter texts.
 */

import { state } from './state.js?v=2';
import { findElement, TOUCH } from './util.js?v=3';
import { formatNumber } from './svg-values.js?v=3';

/** What each tool does, with a mouse; "selected" while a shape is selected. */
const HINTS = {
    select: 'Click a shape to select it. Drag an empty spot to move the view.',
    selected: 'Drag the shape to move it, or a small square to resize it. Delete key removes it.',
    hand: 'Drag to move the view. Use the mouse wheel to zoom.',
    rect: 'Drag to draw a rectangle. Hold Shift for a square.',
    ellipse: 'Drag to draw an ellipse. Hold Shift for a circle.',
    line: 'Drag to draw a line. Hold Shift for straight angles.',
    pen: 'Hold the mouse button down and draw.',
    text: 'Click where the text should start.',
};
/** What each tool does, on a touch screen. */
const TOUCH_HINTS = {
    select: 'Tap a shape to select it. Swipe to scroll.',
    selected: 'Drag it to move, drag a square to resize.',
    hand: 'Drag to move the view, pinch to zoom.',
    rect: 'Drag to draw a rectangle.',
    ellipse: 'Drag to draw an ellipse.',
    line: 'Drag to draw a line.',
    pen: 'Draw with your finger.',
    text: 'Tap where the text should start.',
};

/**
 * Shows what the chosen tool does and whether shapes snap to the grid.
 * @returns {void}
 */
export function updateHint() {
    const line = findElement('#hint');
    if (!line) return;
    line.textContent = getHintText();
}

/**
 * Returns the text of the hint line.
 * @returns {string} the hint.
 */
function getHintText() {
    const hints = TOUCH.matches ? TOUCH_HINTS : HINTS;
    let text = state.error ? 'Fix the error in the code to edit the shapes again.'
        : state.tool === 'select' && state.sel > 0 ? hints.selected : hints[state.tool] || '';
    if (!state.error && state.grid.show && state.grid.snap && state.tool !== 'hand') {
        text += TOUCH.matches ? ` Snap: ${formatNumber(state.grid.size)}.` : ` Snapping to a ${formatNumber(state.grid.size)} grid.`;
    }
    return text;
}
