/**
 * The example drawing: the editor's logo (src/img/logo.svg with a hint comment). It is the
 * first drawing on the first visit, and "New from the example" makes a copy of it.
 */

export const START = {
    name: 'Editor logo',
    file: 'svg-editor-logo',
    code: `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <!-- Click a shape to move it, resize it or change its color. -->
  <rect width="256" height="256" rx="56" fill="#0f8f6f"/>
  <path d="M76 180 C76 112 180 144 180 76" fill="none" stroke="#ffffff" stroke-width="14" stroke-linecap="round"/>
  <rect x="58" y="162" width="36" height="36" rx="8" fill="#0f8f6f" stroke="#ffffff" stroke-width="10"/>
  <rect x="162" y="58" width="36" height="36" rx="8" fill="#0f8f6f" stroke="#ffffff" stroke-width="10"/>
</svg>
`,
};
