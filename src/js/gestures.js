/**
 * Zooming and panning the canvas with gestures: two fingers zoom and pan; the mouse wheel
 * zooms, two fingers on a trackpad pan, Ctrl (also pinching on a trackpad) zooms, Shift with
 * the wheel pans sideways.
 */

import { state } from './state.js?v=2';
import { getClamped } from './util.js?v=3';
import { setZoom, updatePaper } from './canvas.js?v=5';
import { getPointers, getStagePoint } from './pointer.js?v=5';

const MIN_ZOOM = 0.02;
const MAX_ZOOM = 64;
const PIXEL_MODE = 0;                       // WheelEvent.deltaMode in pixels
const MOUSE_WHEEL_STEP = 40;                // a smaller step in pixels comes from a trackpad
const CTRL_ZOOM_SPEED = 0.01;
const WHEEL_ZOOM_SPEED = 0.0015;

/**
 * Starts a two-finger zoom: ends a running drag and remembers distance, zoom, center and shift.
 * @returns {void}
 */
export function startPinch() {
    state.drag = null;
    const [first, second] = [...getPointers().values()];
    state.pinch = { d: Math.hypot(first.x - second.x, first.y - second.y), z: state.zoom, cx: (first.x + second.x) / 2, cy: (first.y + second.y) / 2, px: state.panX, py: state.panY };
}

/**
 * Zooms and pans with two fingers: the distance sets the zoom, the center moves the view.
 * @returns {void}
 */
export function movePinch() {
    const [first, second] = [...getPointers().values()];
    const pinch = state.pinch;
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    const centerX = (first.x + second.x) / 2, centerY = (first.y + second.y) / 2;
    const zoom = getClamped(pinch.z * distance / pinch.d, MIN_ZOOM, MAX_ZOOM);
    state.autoFit = false;
    state.panX = centerX - (pinch.cx - pinch.px) * (zoom / pinch.z);
    state.panY = centerY - (pinch.cy - pinch.py) * (zoom / pinch.z);
    state.zoom = zoom;
    updatePaper();
}

/**
 * Zooms or pans the view with the wheel or a trackpad.
 * @param {WheelEvent} event - the wheel event.
 * @returns {void}
 */
export function moveViewOnWheel(event) {
    event.preventDefault();
    const point = getStagePoint(event);
    const isTrackpad = event.deltaMode === PIXEL_MODE && (Math.abs(event.deltaX) > 0 || !Number.isInteger(event.deltaY) || Math.abs(event.deltaY) < MOUSE_WHEEL_STEP);
    if (event.ctrlKey || event.metaKey || (!isTrackpad && !event.shiftKey)) {
        const factor = Math.exp(-event.deltaY * (event.ctrlKey ? CTRL_ZOOM_SPEED : WHEEL_ZOOM_SPEED));
        setZoom(state.zoom * factor, point.x, point.y);
        return;
    }
    state.autoFit = false;
    state.panX -= event.shiftKey ? event.deltaY : event.deltaX;
    state.panY -= event.shiftKey ? 0 : event.deltaY;
    updatePaper();
}
