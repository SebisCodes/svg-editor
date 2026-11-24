/**
 * The Export dialog: the drawing as SVG (as written, tidied, shrunk), data URI, base64, CSS,
 * HTML <img>, React, or as a PNG, JPEG or WebP picture at a scale or size; download, copy, or
 * every format at once in a ZIP. The list of formats beside the select is export-menu.js.
 */

import { state } from './state.js?v=2';
import { findElement, getClamped, showToast, getSafeFileName, FIX_ERROR_FIRST, SVG_TYPE } from './util.js?v=3';
import { getExportVariants, convertToImage, saveDownload } from './export.js?v=7';
import { TEMPLATE_SYNTAX } from './svg-template.js?v=1';
import { createZip } from './zip.js?v=4';
import { openDialog } from './dialogs.js?v=5';
import { writeChangedTags } from './edits.js?v=4';

const RASTER_FORMAT = /^(png|jpeg|webp)$/;
const MAX_PIXELS = 16384;
const DEFAULT_NAME = 'drawing';
const WHITE = '#ffffff';
/** The text formats: name in the dialog and file extension. */
const TEXT_FORMATS = {
    svg: ['SVG as in the editor', 'svg'], pretty: ['SVG tidied up', 'svg'], mini: ['SVG shrunk', 'svg'],
    uri: ['Data URI', 'txt'], b64: ['Base64 data URI', 'txt'], css: ['CSS background-image', 'css'],
    img: ['HTML <img>', 'html'], jsx: ['React component (JSX)', 'jsx'],
};

/**
 * The fields of the dialog.
 * @typedef {Object} ExportFields
 * @property {HTMLDialogElement} dialog - the dialog.
 * @property {HTMLInputElement} name - the file name.
 * @property {HTMLSelectElement} format - the format.
 * @property {HTMLSelectElement} scale - the scale of a picture, "" for a size of its own.
 * @property {HTMLInputElement} width - the width of a picture.
 * @property {HTMLInputElement} height - the height of a picture.
 * @property {HTMLInputElement} background - "Background" of a picture.
 * @property {HTMLInputElement} backgroundColor - its color.
 * @property {HTMLTextAreaElement} text - the code of a text format.
 * @property {HTMLElement} info - the size of the result.
 */

/** @type {ExportFields} */
const fields = {};

/**
 * Listens for the fields and buttons of the dialog.
 * @returns {void}
 */
export function startExportDialog() {
    Object.assign(fields, {
        dialog: findElement('#export'), name: findElement('#ex-name'), format: findElement('#ex-format'), scale: findElement('#ex-scale'),
        width: findElement('#ex-w'), height: findElement('#ex-h'), background: findElement('#ex-bg'), backgroundColor: findElement('#ex-bg-color'),
        text: findElement('#ex-text'), info: findElement('#ex-info'),
    });
    fields.format.addEventListener('change', updateExportPreview);
    fields.name.addEventListener('input', () => { if (fields.format.value === 'jsx' || fields.format.value === 'img') updateExportPreview(); });
    fields.scale.addEventListener('change', () => { setScaledSize(); updateExportPreview(); });
    fields.width.addEventListener('input', () => { fields.height.value = Math.max(1, Math.round(+fields.width.value * state.naturalSize.h / state.naturalSize.w)); fields.scale.value = ''; updateExportPreview(); });
    fields.height.addEventListener('input', () => { fields.width.value = Math.max(1, Math.round(+fields.height.value * state.naturalSize.w / state.naturalSize.h)); fields.scale.value = ''; updateExportPreview(); });
    fields.background.addEventListener('change', updateExportPreview);
    findElement('#ex-download').addEventListener('click', exportChosenFormat);
    findElement('#ex-zip').addEventListener('click', exportAllFormats);
    findElement('#ex-copy').addEventListener('click', copyExport);
}

/**
 * Opens the dialog for the open drawing; not while the code has an error.
 * @returns {void}
 */
export function openExportDialog() {
    writeChangedTags();
    if (state.error || !state.doc) { showToast(FIX_ERROR_FIRST); return; }
    fields.name.value = state.name;
    setScaledSize();
    updateExportPreview();
    openDialog(fields.dialog);
}

/**
 * Sets the picture size from the natural size and the scale.
 * @returns {void}
 */
function setScaledSize() {
    fields.width.value = Math.round(state.naturalSize.w * +fields.scale.value);
    fields.height.value = Math.round(state.naturalSize.h * +fields.scale.value);
}

/**
 * Shows the result of the chosen format: the size of a picture, or the code of a text format
 * with its size.
 * @returns {void}
 */
function updateExportPreview() {
    const format = fields.format.value;
    const isRaster = RASTER_FORMAT.test(format);
    fields.dialog.dataset.raster = isRaster;
    if (isRaster) {
        fields.info.textContent = `${fields.width.value} × ${fields.height.value} pixels`;
        fields.background.disabled = format === 'jpeg';
        if (format === 'jpeg') fields.background.checked = true;
        fields.backgroundColor.disabled = !fields.background.checked;
        return;
    }
    const variants = getExportVariants(state.doc, state.code, fields.name.value || DEFAULT_NAME, TEMPLATE_SYNTAX);
    fields.text.value = variants[format];
    fields.info.textContent = `${new Blob([variants[format]]).size.toLocaleString('en')} bytes`;
}

/**
 * Returns the file name for the download.
 * @returns {string} the name without extension, without characters a file name cannot hold.
 */
function getExportFileName() {
    return getSafeFileName(fields.name.value.trim());
}

/**
 * Returns the picture size from the dialog, within 1 and 16384 pixels.
 * @returns {{width: number, height: number}} the size.
 */
function getPictureSize() {
    return {
        width: getClamped(Math.round(+fields.width.value) || 1, 1, MAX_PIXELS),
        height: getClamped(Math.round(+fields.height.value) || 1, 1, MAX_PIXELS),
    };
}

/**
 * Returns the picture of the chosen raster format.
 * @returns {Promise<Blob>} the picture.
 */
function getRasterBlob() {
    const { width, height } = getPictureSize();
    return convertToImage(state.doc, width, height, 'image/' + fields.format.value, fields.background.checked ? fields.backgroundColor.value : null);
}

/**
 * Downloads the chosen format.
 * @returns {Promise<void>} resolves when the download started or failed with a message.
 */
async function exportChosenFormat() {
    const format = fields.format.value;
    try {
        if (RASTER_FORMAT.test(format)) {
            const picture = await getRasterBlob();
            saveDownload(picture, `${getExportFileName()}.${format === 'jpeg' ? 'jpg' : format}`);
        } else {
            const [, extension] = TEXT_FORMATS[format];
            saveDownload(fields.text.value, `${getExportFileName()}.${extension}`, extension === 'svg' ? SVG_TYPE : 'text/plain');
        }
        showToast('Downloaded');
    } catch (error) { showToast(error.message); }
}

/**
 * Downloads every format at once: the three SVG variants, PNG, JPG and WebP at the size set in
 * the dialog, and the code formats.
 * @returns {Promise<void>} resolves when the download started or failed with a message.
 */
async function exportAllFormats() {
    const button = findElement('#ex-zip');
    const name = getExportFileName();
    const { width, height } = getPictureSize();
    const background = fields.background.checked ? fields.backgroundColor.value : null;
    button.disabled = true;
    try {
        const variants = getExportVariants(state.doc, state.code, fields.name.value || DEFAULT_NAME, TEMPLATE_SYNTAX);
        const zipFiles = [
            { name: `${name}.svg`, data: variants.svg },
            { name: `${name}-tidy.svg`, data: variants.pretty },
            { name: `${name}-min.svg`, data: variants.mini },
            { name: `${name}.png`, data: await convertToImage(state.doc, width, height, 'image/png', background) },
            { name: `${name}.jpg`, data: await convertToImage(state.doc, width, height, 'image/jpeg', background || WHITE) },
            { name: `${name}.webp`, data: await convertToImage(state.doc, width, height, 'image/webp', background) },
            { name: `${name}.jsx`, data: variants.jsx },
            { name: `${name}-data-uri.txt`, data: variants.uri },
            { name: `${name}-base64.txt`, data: variants.b64 },
            { name: `${name}-background.css`, data: variants.css },
            { name: `${name}-img.html`, data: variants.img },
        ];
        saveDownload(await createZip(zipFiles), `${name}.zip`);
        showToast(`ZIP with ${zipFiles.length} files downloaded (pictures ${width} × ${height} px)`);
    } catch (error) { showToast(error.message); } finally { button.disabled = false; }
}

/**
 * Copies the chosen format: a picture as PNG, a text format as text.
 * @returns {Promise<void>} resolves when copied or failed with a message.
 */
async function copyExport() {
    const format = fields.format.value;
    try {
        if (RASTER_FORMAT.test(format)) {
            fields.format.value = 'png';
            const picture = await getRasterBlob();
            fields.format.value = format;
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': picture })]);
        } else await navigator.clipboard.writeText(fields.text.value);
        showToast('Copied to the clipboard');
    } catch (error) {
        if (!RASTER_FORMAT.test(format)) { fields.text.select(); document.execCommand('copy'); showToast('Copied to the clipboard'); }
        else showToast('This browser does not allow copying images');
    }
}
