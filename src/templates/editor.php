<?php
/**
 * The editor page: markup and keys of the shared language packs (src/php/page.php).
 */
?>
<!DOCTYPE html>
<html <?= build_html_attributes() ?>>
<head>
<meta charset="utf-8">
<!-- The same policy as the server header (.htaccess), in case the header is ever missing; frame-ancestors only works as a header. -->
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' data: blob: https: http://localhost:* http://127.0.0.1:*; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'self'; form-action 'self'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= get_text('title') ?></title>
<meta name="description" content="<?= get_text('description') ?>">
<meta name="author" content="Sebastian Grünwald, Grünwald Innovation">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#0f8f6f">
<link rel="canonical" href="<?= escape_html(get_page_url()) ?>">
<?= build_hreflang_links() ?>
<meta property="og:type" content="website">
<meta property="og:locale" content="<?= get_page_locale() ?>">
<meta property="og:site_name" content="SVG Editor">
<meta property="og:title" content="<?= get_text('og_title') ?>">
<meta property="og:description" content="<?= get_text('og_description') ?>">
<meta property="og:url" content="<?= escape_html(get_page_url()) ?>">
<meta property="og:image" content="https://svg.giit.ch/img/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="/img/logo.svg">
<link rel="stylesheet" href="/css/style.css?v=43">
<script src="/js/lang-menu.js?v=1" defer></script>
<script src="/js/theme.js?v=11" data-editor-page></script>
<script type="application/ld+json"><?= get_json_ld('jsonld') ?></script>
</head>
<body>

<header class="header">
    <div class="header-brand">
        <a class="back-to-editors" href="<?= escape_html(get_site_url('https://editors.giit.ch/')) ?>" title="All giit editors" aria-label="All giit editors"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg></a>
        <a class="brand" href="<?= escape_html(get_language_path(get_template_language(), '')) ?>" aria-label="SVG Editor - home">
            <img src="/img/logo.svg" alt="" width="28" height="28">
            <h1>SVG Editor <span>online</span></h1>
        </a>
        <a class="by-giit" href="https://giit.ch/"><img src="/img/giit.svg" alt="" width="16" height="18">by giit.ch</a>
    </div>
    <div class="toolbar file" role="toolbar" aria-label="File">
        <button type="button" class="button with-symbol file-button" id="btn-files" title="My drawings (Ctrl+O)" aria-label="My drawings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg><span id="file-name" class="file-title" data-no-i18n></span><svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
        <span class="menu-anchor">
            <button type="button" class="button with-symbol" id="btn-new" title="New drawing, or start this one over" aria-haspopup="menu" aria-expanded="false" aria-controls="new-menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span class="txt">New</span></button>
            <span id="new-menu" class="menu" role="menu" aria-label="New" hidden>
                <button type="button" role="menuitem" data-new="blank"><b>New blank drawing</b><span>Your other drawings stay as they are</span></button>
                <button type="button" role="menuitem" data-new="example"><b>New from the example</b><span>A copy of the editor logo to try things out</span></button>
                <button type="button" role="menuitem" data-new="restart" id="new-restart"><b>Start this drawing over</b><span>Empties it but keeps its size - "Undo" brings it back</span></button>
            </span>
        </span>
        <button type="button" class="button" id="btn-open" title="Open an SVG file from your computer as a new drawing (you can also drag a file into the window)">Open file…</button>
        <input type="file" id="file" accept=".svg,image/svg+xml" hidden>
        <span class="divider" aria-hidden="true"></span>
        <button type="button" class="button with-symbol" id="btn-undo" title="Undo the last change (Ctrl+Z)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg><span class="txt">Undo</span></button>
        <button type="button" class="button with-symbol" id="btn-redo" title="Redo the change you just undid (Ctrl+Y)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg><span class="txt">Redo</span></button>
    </div>
    <div class="toolbar output" role="toolbar" aria-label="Output">
        <span class="languages" data-languages><?= build_language_menu(get_text('language')) ?></span>
        <div class="schema" role="radiogroup" aria-label="Color theme">
            <button type="button" role="radio" data-theme-set="light" aria-checked="false" title="Light theme" aria-label="Light theme"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
            <button type="button" role="radio" data-theme-set="dark" aria-checked="false" title="Dark theme" aria-label="Dark theme"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/></svg></button>
            <button type="button" role="radio" data-theme-set="auto" aria-checked="true" title="Same as your system setting" aria-label="Automatic theme (system setting)"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></button>
        </div>
        <button type="button" class="button with-symbol ai-button" id="btn-ai" title="Let any AI draw in this editor"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.9L19 9.5l-5.2 1.7L12 16l-1.8-4.8L5 9.5l5.2-1.6z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg><span class="txt">AI Assistant</span></button>
        <button type="button" class="button symbol" id="btn-sync" title="Save to your own server and embed the editor in your website" aria-label="Save to server"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5"/><path d="M12 12v8m-3-3 3 3 3-3"/></svg></button>
        <button type="button" class="button" id="btn-help" title="How it works and keyboard shortcuts (?)">Help</button>
        <button type="button" class="button" id="btn-download" title="Save the drawing as an .svg file (Ctrl+S)">Download SVG</button>
        <button type="button" class="button primary save" id="btn-save" hidden>Save</button>
        <button type="button" class="button primary" id="btn-export" title="Save as PNG, JPG, WebP, data URI, React and more (Ctrl+E)">Export…</button>
    </div>
</header>

<nav class="views" role="tablist" aria-label="View">
    <button type="button" role="tab" data-pane="code" aria-selected="false">Code</button>
    <button type="button" role="tab" data-pane="draw" aria-selected="true">Canvas</button>
    <button type="button" role="tab" data-pane="properties" aria-selected="false">Edit</button>
</nav>

<main id="work" class="workspace" data-show="draw">
    <section class="pane code-pane" aria-label="SVG code">
        <div class="pane-header">
            <b>Code</b>
            <span id="code-status" class="muted"></span>
            <span class="right">
                <button type="button" class="button small" id="btn-wrap" aria-pressed="false" title="Wrap long lines in the view - each line of the code stays one line (Alt+Z)">Wrap</button>
                <button type="button" class="button small with-symbol" id="btn-copy" title="Copy the SVG code to the clipboard" aria-label="Copy code"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg><span class="txt">Copy</span></button>
                <button type="button" class="button small" id="btn-format" title="Indent and arrange the code neatly">Tidy up</button>
                <button type="button" class="button small" id="btn-minify" title="Remove comments and spaces to make the file smaller">Shrink</button>
            </span>
        </div>
        <div id="code-error" class="error" hidden role="status"></div>
        <div class="editor">
            <div class="gutter" aria-hidden="true"><div id="gutter"></div></div>
            <div class="code-field" id="code-layers">
                <pre class="layer marks" id="marks" aria-hidden="true"></pre>
                <pre class="layer hl" id="hl" aria-hidden="true"></pre>
                <textarea id="code" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" aria-label="SVG code"></textarea>
            </div>
        </div>
        <div id="placeholder-box" class="placeholder-box template-control">
            <div id="placeholder-list" class="placeholder-list" data-placeholder-list role="group" aria-label="Placeholders" hidden></div>
            <button type="button" class="placeholder-header" data-placeholder-toggle aria-expanded="false" aria-controls="placeholder-list" title="The placeholders of the template - a click on one puts its tag at the cursor"><svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg><span>Placeholders</span><span class="placeholder-count" data-placeholder-count data-no-i18n></span></button>
        </div>
    </section>

    <div id="splitter" class="splitter" role="separator" aria-orientation="vertical" aria-label="Drag to change the width of the code area" title="Drag to change the width" tabindex="0"></div>

    <section class="pane draw-pane" aria-label="Canvas">
        <div class="pane-header tools" role="toolbar" aria-label="Tools">
            <div class="group">
                <button type="button" class="tool" data-tool="select" title="Select and move shapes (V)" aria-label="Select"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 1.5L10 19z"/></svg></button>
                <button type="button" class="tool" data-tool="hand" title="Move the view (H, or hold the space bar)" aria-label="Move the view"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-7.5v-1a1.5 1.5 0 0 1 3 0V12m0-7a1.5 1.5 0 0 1 3 0v7m0-4.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-2.7l-3-4.6a1.6 1.6 0 0 1 2.6-1.8L8 14"/></svg></button>
                <span class="divider" aria-hidden="true"></span>
                <button type="button" class="tool" data-tool="rect" title="Draw a rectangle (R)" aria-label="Rectangle"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="12" rx="1"/></svg></button>
                <button type="button" class="tool" data-tool="ellipse" title="Draw an ellipse or circle (E)" aria-label="Ellipse"><svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="8.5" ry="6.5"/></svg></button>
                <button type="button" class="tool" data-tool="line" title="Draw a line (L)" aria-label="Line"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19 19 5"/></svg></button>
                <button type="button" class="tool" data-tool="pen" title="Draw freehand (P)" aria-label="Freehand"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17c3-6 5-9 7-9s1 7 4 7 3-5 7-8"/></svg></button>
                <button type="button" class="tool" data-tool="text" title="Add text (T)" aria-label="Text"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg></button>
            </div>
            <div class="group grid-group">
                <button type="button" class="tool with-text" id="grid-show" title="Show the grid and snap shapes to it (#)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg><span>Grid</span></button>
                <label class="grid-size" title="Distance between grid lines, in the drawing's units"><span>Spacing</span><input id="grid-size" type="number" min="0.1" step="0.1" value="10" inputmode="decimal"></label>
                <label class="snap" title="Shapes jump onto the grid lines when moved or drawn (G)"><input type="checkbox" id="grid-snap"> Snap</label>
            </div>
            <div id="view-switch" class="view-switch template-control" role="radiogroup" aria-label="View of the drawing">
                <button type="button" role="radio" data-view-set="example" aria-checked="true" title="The drawing filled with the examples">Examples</button>
                <button type="button" role="radio" data-view-set="template" aria-checked="false" tabindex="-1" title="The template with its placeholders as written">Template</button>
            </div>
        </div>
        <div id="stage" class="stage" tabindex="0" aria-label="Canvas: click shapes, drag them, resize them with the handles">
            <div id="paper" class="paper"><div id="host"></div></div>
            <div id="grip" class="grip" hidden></div>
            <svg id="overlay" class="overlay" aria-hidden="true"></svg>
            <div id="hint" class="hint-line" aria-live="polite"></div>
            <div class="group zoom" role="toolbar" aria-label="View">
                <label class="sr" for="bg">Background of the preview</label>
                <select id="bg" class="button small" title="Background behind the drawing (only for viewing, not saved in the file)">
                    <option value="checker">Checkered background</option>
                    <option value="light">White background</option>
                    <option value="dark">Dark background</option>
                    <option value="none">No background</option>
                </select>
                <span class="divider" aria-hidden="true"></span>
                <button type="button" class="tool" id="zoom-out" title="Zoom out (-)" aria-label="Zoom out"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg></button>
                <button type="button" class="button small zoom-value" id="zoom-100" title="Show at actual size (1)"><span id="zoom-label">100%</span></button>
                <button type="button" class="tool" id="zoom-in" title="Zoom in (+)" aria-label="Zoom in"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12M12 6v12"/></svg></button>
                <button type="button" class="tool" id="zoom-fit" title="Fit the drawing into the window (0)" aria-label="Fit to window"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg></button>
            </div>
            <div class="stale-hint" aria-hidden="true">The preview shows the last working version</div>
            <div id="view-note" class="view-note template-control" role="status" hidden>The examples could not be filled in - the canvas shows the template</div>
        </div>
    </section>

    <button type="button" class="tool panel-toggle" id="btn-panel" aria-controls="side-panel" aria-expanded="false" title="Show or hide the side panel" aria-label="Side panel"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg></button>

    <aside class="pane inspector" id="side-panel" aria-label="Side panel">
        <div class="pane-header tabs" role="tablist">
            <button type="button" role="tab" data-itab="properties" aria-selected="true" title="Colors, size and position of the selected shape">Properties</button>
            <button type="button" role="tab" data-itab="structure" aria-selected="false" title="All elements of the drawing as a list">Layers</button>
        </div>
        <div id="inspector-body" class="inspector-body"></div>
        <div id="tree-wrap" class="inspector-body" hidden><p class="hint">Every element of the drawing. Shapes higher in the list are drawn on top. Click to select, drag to reorder (drop onto a group to put it inside), double-click to rename. The eye hides a shape.</p><ul id="tree" class="tree"></ul></div>
    </aside>
</main>

<datalist id="fonts">
    <option value="system-ui, sans-serif"></option>
    <option value="Arial, Helvetica, sans-serif"></option>
    <option value="Georgia, serif"></option>
    <option value="'Times New Roman', serif"></option>
    <option value="'Courier New', monospace"></option>
    <option value="Verdana, sans-serif"></option>
</datalist>

<div id="ai-receive" class="receive" role="status" hidden>
    <div class="receive-box"><img src="/img/logo.svg" alt="" width="40" height="40"><h2></h2><p></p>
        <div class="receive-buttons"><button type="button" class="button primary" data-here>Open it here</button></div>
    </div>
</div>

<div id="toast" class="toast" role="status" aria-live="polite"></div>
<div class="storage-hint" aria-hidden="true"><span>Drop the SVG file here</span></div>

<dialog id="export" class="dialog" aria-labelledby="ex-title">
    <form method="dialog" class="dialog-header"><h2 id="ex-title">Export</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <div class="ex-row">
            <label class="field"><span>File name</span><input id="ex-name" spellcheck="false"></label>
            <label class="field"><span>Format</span>
                <select id="ex-format">
                    <optgroup label="Vector (sharp at any size)">
                        <option value="svg">SVG as in the editor</option>
                        <option value="pretty">SVG tidied up</option>
                        <option value="mini">SVG shrunk (smallest file)</option>
                    </optgroup>
                    <optgroup label="Picture">
                        <option value="png">PNG (transparent background)</option>
                        <option value="jpeg">JPG</option>
                        <option value="webp">WebP</option>
                    </optgroup>
                    <optgroup label="Code for websites">
                        <option value="uri">Data URI</option>
                        <option value="b64">Base64 data URI</option>
                        <option value="css">CSS background-image</option>
                        <option value="img">HTML &lt;img&gt; tag</option>
                        <option value="jsx">React component (JSX)</option>
                    </optgroup>
                </select>
            </label>
        </div>
        <div class="only-picture">
            <div class="ex-row four">
                <label class="field"><span>Size</span>
                    <select id="ex-scale"><option value="1">1× (actual size)</option><option value="2" selected>2×</option><option value="3">3×</option><option value="4">4×</option><option value="8">8×</option><option value="">custom</option></select>
                </label>
                <label class="field"><span>Width (px)</span><input id="ex-w" type="number" min="1" max="16384"></label>
                <label class="field"><span>Height (px)</span><input id="ex-h" type="number" min="1" max="16384"></label>
                <label class="field"><span>Background</span><span class="with-none"><label class="box"><input type="checkbox" id="ex-bg"> Fill</label><input type="color" id="ex-bg-color" value="#ffffff" aria-label="Background color" data-title="Background color · exported image" disabled></span></label>
            </div>
            <p class="hint">Width and height stay in proportion. JPG has no transparency, so it always gets a background.</p>
        </div>
        <textarea id="ex-text" class="only-text ex-text" readonly spellcheck="false" aria-label="Result"></textarea>
        <div class="dialog-footer">
            <span id="ex-info" class="muted"></span>
            <button type="button" class="button" id="ex-zip" title="Download every format at once: SVG (3 variants), PNG, JPG, WebP, React, data URI, Base64, CSS and HTML">All formats (ZIP)</button>
            <button type="button" class="button" id="ex-copy">Copy</button>
            <button type="button" class="button primary" id="ex-download">Download</button>
        </div>
    </div>
</dialog>

<dialog id="files" class="dialog files" aria-labelledby="files-title">
    <form method="dialog" class="dialog-header"><h2 id="files-title">My drawings</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <div class="files-toolbar">
            <input id="files-search" type="search" placeholder="Search by name" aria-label="Search your drawings" spellcheck="false">
            <button type="button" class="button" id="files-import" title="Open an SVG file from your computer as a new drawing">Open file…</button>
            <button type="button" class="button primary" id="files-new">New drawing</button>
        </div>
        <ul id="files-grid" class="file-grid"></ul>
        <p class="muted">Click a drawing to open it. They are stored only in this browser - nothing is uploaded. Clearing the browser's site data removes them, so download the ones you want to keep.</p>
        <div class="dialog-footer"><span id="files-info" class="muted"></span><button type="button" class="button" id="files-zip" title="Download every drawing as an .svg file in one ZIP">Download all (ZIP)</button></div>
    </div>
</dialog>

<dialog id="ask" class="dialog question" aria-labelledby="ask-title">
    <div class="dialog-header"><h2 id="ask-title"></h2></div>
    <div class="dialog-content"><p id="ask-text"></p>
        <div class="dialog-footer"><span class="muted"></span><button type="button" class="button" id="ask-cancel">Cancel</button><button type="button" class="button primary" id="ask-ok">OK</button></div>
    </div>
</dialog>

<dialog id="ai" class="dialog ai-dialog" aria-labelledby="ai-title">
    <form method="dialog" class="dialog-header"><h2 id="ai-title">AI Assistant</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <p>Any AI can draw with you - ChatGPT, Claude, Gemini, Copilot.</p>
        <ul id="ai-status" class="ai-status" aria-label="Connected AI"></ul>
        <ol class="steps">
            <li>Click <b>Copy prompt</b>.</li>
            <li>Paste it into your AI and say what it should draw.</li>
            <li id="ai-step-link">The AI answers with a link: click it, or paste the whole answer below. <b>Undo</b> takes it back.</li>
        </ol>
        <div id="ai-remote" class="ai-remote" hidden>
            <p><b>Connected to <span id="ai-remote-host" data-no-i18n></span>:</b> the AI sends its result there, and it opens here. <span id="ai-key-exp" class="muted"></span></p>
            <details id="ai-remote-details" hidden><summary>What <span data-no-i18n></span> tells the AI</summary><pre id="ai-remote-prompt" class="ai-remote-prompt" data-no-i18n></pre></details>
        </div>
        <fieldset class="ai-target">
            <legend>The AI should</legend>
            <label><input type="radio" name="ai-target" value="change" checked><span><b>Change “<span id="ai-cur" data-no-i18n></span>”</b></span></label>
            <label><input type="radio" name="ai-target" value="new"><span><b>Make a new drawing</b></span></label>
        </fieldset>
        <label class="field ai-insert"><span id="ai-paste-label">The AI's answer (or press Ctrl+V anywhere):</span><textarea id="ai-paste" rows="2" spellcheck="false" placeholder="https://svg.giit.ch/#…"></textarea></label>
        <p class="muted" id="ai-privacy">The drawing travels in the link after the “#”, which no server sees. What you paste into your AI is handled by its provider.</p>
        <textarea id="ai-prompt-text" class="ai-prompt-text" rows="6" readonly hidden aria-label="The prompt - copy it with Ctrl+C"></textarea>
        <div class="dialog-footer"><span class="muted"></span><button type="button" class="button primary" id="ai-copy">Copy prompt</button></div>
    </div>
</dialog>

<dialog id="sync" class="dialog" aria-labelledby="sync-title">
    <form method="dialog" class="dialog-header"><h2 id="sync-title">Save to your server</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content">
        <p>The editor can send each saved version to your own server (a <b>webhook</b>), so your drawings are kept where you want them. Nothing is sent until you enter an address here.</p>
        <div class="sync-fields">
            <label class="field"><span>Webhook address</span><input id="sync-url" type="url" placeholder="https://example.com/api/svg" spellcheck="false" autocomplete="off"></label>
            <label class="field"><span>Token <small>(optional, sent as "Authorization: Bearer …"; kept until this tab is closed)</small></span><input id="sync-token" type="password" spellcheck="false" autocomplete="off"></label>
        </div>
        <label class="box sync-choice"><input type="checkbox" id="sync-auto"> Send automatically a few seconds after each change (otherwise only when you click <b>Save</b> or press Ctrl+S)</label>
        <label class="box sync-choice"><input type="checkbox" id="sync-doc"> Only for “<span id="sync-docname" data-no-i18n></span>” (other drawings use the general address)</label>
        <details class="sync-help">
            <summary>What your server receives</summary>
            <p class="muted">A POST request with JSON (your server must allow CORS from https://svg.giit.ch):</p>
            <pre class="code-example">{ "editor": "svg", "event": "save", "id": "…", "name": "Logo",
  "content": "&lt;svg xmlns=\"http://www.w3.org/2000/svg\" …&gt;…&lt;/svg&gt;",
  "updated": "2026-01-15T09:30:00.000Z" }</pre>
        </details>
        <details class="sync-help">
            <summary>Embed the editor in your website</summary>
            <pre class="code-example">&lt;iframe src="https://svg.giit.ch/?embed=1" style="width:100%;height:80vh;border:0"&gt;&lt;/iframe&gt;
&lt;script&gt;
const frame = document.querySelector('iframe');
addEventListener('message', e =&gt; {
  if (e.origin !== 'https://svg.giit.ch' || e.source !== frame.contentWindow) return;
  if (e.data.type === 'svgeditor:ready')
    frame.contentWindow.postMessage({ type: 'svgeditor:load', name: 'Logo',
      content: '&lt;svg …&gt;…&lt;/svg&gt;' }, 'https://svg.giit.ch');
  if (e.data.type === 'svgeditor:save') saveOnYourServer(e.data.content);
});
&lt;/script&gt;</pre>
            <p class="muted">Also possible: <code>?src=&lt;URL of an .svg file&gt;</code> opens a file, <code>&amp;webhook=&lt;URL&gt;</code> saves this drawing there. The editor can also open in a window of its own (<code>?embed=window</code>), and your page can hand it its own AI prompt and a session key so the AI sends its result to your server (<code>svgeditor:ai</code>, <code>svgeditor:key-request</code>) - see "Use the editor on your own website" below the editor. Details are in <a href="/llms.txt">llms.txt</a>.</p>
        </details>
        <div class="dialog-footer"><span id="sync-status" class="muted"></span><button type="button" class="button" id="sync-test">Send now</button><button type="button" class="button primary" id="sync-ok">Save setting</button></div>
    </div>
</dialog>

<dialog id="help" class="dialog" aria-labelledby="help-title">
    <form method="dialog" class="dialog-header"><h2 id="help-title">Help</h2><button class="close" data-close aria-label="Close" title="Close">✕</button></form>
    <div class="dialog-content shortcuts">
        <h3>How it works</h3>
        <ol class="steps">
            <li><b>Open</b> an SVG file, drag it into the window or paste SVG code - or start with <b>New</b>.</li>
            <li><b>My drawings</b> (the folder button at the top left) lists every drawing kept in this browser: open, rename, duplicate, download or delete them.</li>
            <li><b>Click a shape</b> on the canvas. Drag it to move it, drag the small squares to resize it. Colors, size and position are under <b>Properties</b> on the right.</li>
            <li><b>Draw</b> new shapes with the tools above the canvas.</li>
            <li>The <b>code</b> on the left always shows the current drawing and can be edited directly.</li>
            <li><b>Download SVG</b> saves the file, <b>Export</b> offers pictures (PNG, JPG) and code for websites.</li>
        </ol>
        <p class="muted">Made a mistake? <b>Undo</b> takes back every step. Your drawings are kept in this browser, even after closing the page.</p>
        <h3>Keyboard shortcuts</h3>
        <dl>
            <dt><kbd>V</kbd></dt><dd>Select and move</dd>
            <dt><kbd>R</kbd> <kbd>E</kbd> <kbd>L</kbd> <kbd>P</kbd> <kbd>T</kbd></dt><dd>Rectangle, ellipse, line, freehand, text</dd>
            <dt><kbd>H</kbd> / hold <kbd>Space</kbd></dt><dd>Move the view</dd>
            <dt>Mouse wheel, <kbd>+</kbd> <kbd>-</kbd></dt><dd>Zoom</dd>
            <dt>Drag with the mouse wheel pressed</dt><dd>Move the view</dd>
            <dt>Double-click the mouse wheel</dt><dd>Fit to window</dd>
            <dt><kbd>0</kbd> / <kbd>1</kbd></dt><dd>Fit to window / actual size</dd>
            <dt><kbd>#</kbd> / <kbd>G</kbd></dt><dd>Grid on/off / snap on/off</dd>
            <dt>Arrow keys</dt><dd>Move the selection by 1, with <kbd>Shift</kbd> by 10</dd>
            <dt><kbd>Shift</kbd> while dragging</dt><dd>Only horizontal/vertical, keep proportions</dd>
            <dt><kbd>Alt</kbd> + click</dt><dd>Select the surrounding group</dd>
            <dt><kbd>Delete</kbd></dt><dd>Remove the selection</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>D</kbd></dt><dd>Duplicate</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd></dt><dd>Forward / backward (with <kbd>Shift</kbd>: to front / to back)</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>Z</kbd> / <kbd>Y</kbd></dt><dd>Undo / redo</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>S</kbd> / <kbd>E</kbd></dt><dd>Download SVG (or save to your server) / export</dd>
            <dt><kbd>Ctrl</kbd> + <kbd>O</kbd></dt><dd>My drawings</dd>
            <dt><kbd>Esc</kbd></dt><dd>Deselect</dd>
        </dl>
        <p class="muted">In the code: <kbd>Tab</kbd> indents, <kbd>Shift</kbd>+<kbd>Tab</kbd> outdents, clicking into a tag selects that shape on the canvas.</p>
    </div>
</dialog>

<div class="page-text">
<?= get_html('page_text') ?>
</div>

<?php include __DIR__ . '/footer.php'; ?>

<script type="module" src="/js/app.js?v=66"></script>
</body>
</html>
