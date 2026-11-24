# Using the SVG Editor

The SVG Editor shows your drawing and its code side by side. Whatever you change in the code
appears in the preview right away, and whatever you move, resize or recolor on the canvas
shows up in the code. That makes it quick to adjust icons, logos, charts and illustrations
without opening a large graphics program.

Open it at https://svg.giit.ch/. It is free, needs no sign-up, and runs in your browser:
your drawings stay there unless you send them somewhere yourself.

## What it can do

- Code with highlighting: tags, attributes and values in their own colors, line numbers,
  indenting with Tab, automatic closing of tags and a clear error message with the line.
- Edit shapes directly: select, drag, resize with the handles, rotate in 15° steps, flip,
  duplicate, bring forward or send backward, delete; rectangles, circles, paths, polygons,
  text and groups. A selected picture shows an X at its top right corner that removes it.
- Colors and outlines: fill and outline with a color picker or as a value, opacity, outline
  width, dashed lines, line ends and corners.
- Drawing tools: rectangle, ellipse and circle, line, freehand and text.
- A grid with any spacing in the drawing's own coordinates; shapes snap onto it, or uncheck
  **Snap** to move them freely while the grid stays visible.
- Layers, and Undo for every step.
- Tidy up and shrink the SVG code.

## Getting started

1. **Open** an SVG: choose a file, drag it into the window or paste the code, or start with
   **New**.
2. **Edit**: type in the code, or click shapes on the canvas, drag them and set their colors
   under **Properties** on the right. Draw new shapes with the tools above the canvas.
3. **Export**: choose a format, set the size for pictures, then download or copy.

## Working on the canvas

Click a shape to select it; drag it to move it and drag the small squares to resize it.
Colors, size and position are under **Properties** in the side panel. **Alt+click** selects the
surrounding group. In the code, clicking into a tag selects that shape on the canvas. The
preview never runs scripts or `on…` attributes of a drawing.

## Side panel

The side panel holds **Properties** and **Layers**. The button at the top right of the work area
opens it as a column right of the canvas, which gets narrower, and closes it again; it is closed
when the editor opens. On a phone it is the view **Edit**.

## Templates with placeholders

A website that edits templates opens the editor with `?template=mustache` or `?template=angle`.
The canvas then shows the drawing filled with the website's examples; **Template** in the canvas
bar shows the placeholders as written, **Examples** brings the examples back. A placeholder without
an example shows its label in brackets. The **Placeholders** box below the code lists them: a click
puts one at the cursor, a section around the selected text. A text that shows an example is edited
in the code or in the template view; moving and resizing shapes change the template. Saving,
downloading and exporting keep the placeholders.

## Your drawings

Your drawings are kept only in your browser (in `localStorage`), not on a server, and stay
there after you close the page. **My drawings** (the folder button at the top left) lists
every drawing of this browser: open, rename, duplicate, download (one `.svg`, or all of them
as one ZIP) and delete them.

Clearing the browser's site data removes them, so download the ones you want to keep, or let
the editor send them to your own server: **Save to server** (the cloud button) sets up a
webhook, an address that gets every saved version (see [EMBEDDING.md](EMBEDDING.md#webhook)
for what it receives). Nothing is sent until you enter an address there.

**Opening files:** Open an `.svg` file with the button, drop it into the window or paste SVG
code.

## Export

**Export** offers SVG (as written, tidied up or shrunk), **PNG** with a transparent
background, **JPG** and **WebP** in any size (1×, 2×, 4× or your own), and code for
websites: a **data URI**, **Base64**, a **CSS** `background-image`, an **HTML** `<img>` and
a **React component (JSX)**, where attributes such as `stroke-width` become `strokeWidth`
and `class` becomes `className`. All formats can be downloaded as one ZIP.

**Download SVG** in the bar saves the file; without a server, **Ctrl+S** does the same.

## AI Assistant

Any AI can work with you: ChatGPT, Claude, Gemini, Copilot or the AI in your coding tool.
Nothing to install and no key needed. Click **AI Assistant**, then **Copy prompt**, paste it
into your AI and say what it should do. The prompt holds the instructions and the current
drawing.

The root must be `<svg xmlns="http://www.w3.org/2000/svg" viewBox="...">`.

The AI answers with a link that carries the drawing after the `#`; click it and the drawing
appears in your editor. **Undo** takes every change back. The links look like this:

- `https://svg.giit.ch/#b64=<base64url of the UTF-8 text>`
- `https://svg.giit.ch/#svg=<URL-encoded text>`
- `https://svg.giit.ch/#z=<base64url of the zlib-compressed text>` (shortest)
- `&mode=add` adds only elements on top of the current drawing.
- `&file=new&name=<name>` makes a new drawing next to your others, `&file=<name>` changes
  that one; without `&file=` the open drawing changes.
- `&part=N&of=M&id=<name>` sends a long drawing in several links; the editor collects the
  parts.

A tab opened with such a link hands the drawing to the editor tab you used last. You can
also paste the AI's whole answer into the editor (Ctrl+V outside the code); links that a
terminal broke over several lines are joined. When the editor is embedded in another
website, links cannot reach it, so paste the answer there. A website that embeds the
editor may give its own instructions for how the AI answers, or show its own AI dialog
when you press the button; the dialog names the website and shows its instructions.

**Browser agents (WebMCP):** in browsers that offer WebMCP, the page registers tools for AI
agents that run in the page itself: `get_drawing`, `list_shapes`, `set_drawing`,
`add_shapes`, `edit_shape`, `delete_shape`, `select_shape`, `undo`, and `list_files`,
`open_file`, `new_file` for your other drawings (shapes are named by id or by their number
from `list_shapes`). Every change is one step for Undo.

## Languages

The editor speaks English at `/`, German `/de/`, French `/fr/`, Italian `/it/`, Spanish
`/es/`, Portuguese `/pt/`, Dutch `/nl/`, Polish `/pl/`, Turkish `/tr/`, Russian `/ru/`,
Ukrainian `/uk/`, Chinese `/zh/`, Japanese `/ja/` and Korean `/ko/`. Opening
`https://svg.giit.ch/` leads to the language you picked before in a language menu, or else
to your browser's language. A language picked in the menu holds for every giit.ch site. The
prompt for the AI is always in English.

## Color theme

Light, dark or automatic (following your system): the theme switch in the bar sets it, and
the editor remembers your choice.

## Keyboard shortcuts

On macOS use Cmd instead of Ctrl. The **Help** dialog in the editor lists them as well.

| Keys | Action |
|---|---|
| V | Select and move |
| R E L P T | Rectangle, ellipse, line, freehand, text |
| H / hold Space | Move the view |
| Mouse wheel, + / - | Zoom |
| Drag with the mouse wheel pressed | Move the view |
| Double-click the mouse wheel | Fit to window |
| 0 / 1 | Fit to window / actual size |
| # / G | Grid on or off / snap on or off |
| Arrow keys | Move the selection by 1, with Shift by 10 |
| Shift while dragging | Only horizontal or vertical, keep proportions |
| Alt + click | Select the surrounding group |
| Delete | Remove the selection |
| Ctrl + D | Duplicate |
| Ctrl + ↑ / ↓ | Forward / backward (with Shift: to front / to back) |
| Ctrl + Z / Y | Undo / redo |
| Ctrl + S | Download SVG (or save to your server) |
| Ctrl + E | Export |
| Ctrl + O | My drawings |
| Esc | Deselect |

In the code, Tab indents and Shift+Tab outdents.

## On your own website

The editor can be embedded in other websites with an iframe, opened in a window of its own
or used as a read-only viewer. See [EMBEDDING.md](EMBEDDING.md).
