/**
 * Color values for the color picker: hex codes, RGB and HSV (hue, saturation, value).
 */

const HEX_BASE = 16;
const DEGREES_PER_SECTOR = 60;
const SECTORS = 6;
const FULL_TURN = 360;
const CHANNEL_MAX = 255;

/**
 * Returns the RGB values of a hex code.
 * @param {string} hex - "#rgb" or "#rrggbb" (the # may be left out).
 * @returns {?number[]} [r, g, b] from 0 to 255, null when it is no hex code.
 */
export function getRgbFromHex(hex) {
    const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) return null;
    let digits = match[1];
    if (digits.length === 3) digits = digits.replace(/./g, digit => digit + digit);
    return [0, 2, 4].map(start => parseInt(digits.slice(start, start + 2), HEX_BASE));
}

/**
 * Returns the hex code of RGB values.
 * @param {number[]} rgb - [r, g, b] from 0 to 255.
 * @returns {string} "#rrggbb".
 */
export function getHexFromRgb(rgb) {
    return '#' + rgb.map(value => Math.round(value).toString(HEX_BASE).padStart(2, '0')).join('');
}

/**
 * Returns the HSV values of RGB values.
 * @param {number[]} rgb - [r, g, b] from 0 to 255.
 * @returns {number[]} [hue 0-360, saturation 0-1, value 0-1].
 */
export function getHsvFromRgb([red, green, blue]) {
    red /= CHANNEL_MAX; green /= CHANNEL_MAX; blue /= CHANNEL_MAX;
    const max = Math.max(red, green, blue), min = Math.min(red, green, blue), range = max - min;
    let hue = 0;
    if (range) hue = max === red ? ((green - blue) / range) % SECTORS : max === green ? (blue - red) / range + 2 : (red - green) / range + 4;
    return [(hue * DEGREES_PER_SECTOR + FULL_TURN) % FULL_TURN, max ? range / max : 0, max];
}

/**
 * Returns the RGB values of HSV values.
 * @param {number[]} hsv - [hue 0-360, saturation 0-1, value 0-1].
 * @returns {number[]} [r, g, b] from 0 to 255, not rounded.
 */
export function getRgbFromHsv([hue, saturation, value]) {
    /**
     * Returns one channel from 0 to 1.
     * @param {number} offset - 5 for red, 3 for green, 1 for blue.
     * @returns {number} the channel.
     */
    const getChannel = offset => { const sector = (offset + hue / DEGREES_PER_SECTOR) % SECTORS; return value - value * saturation * Math.max(0, Math.min(sector, 4 - sector, 1)); };
    return [getChannel(5) * CHANNEL_MAX, getChannel(3) * CHANNEL_MAX, getChannel(1) * CHANNEL_MAX];
}
