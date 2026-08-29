// Zoom bounds shared by the toolbar and the pdf.js renderer. Kept in a
// dependency-free module so the toolbar can read them without eagerly
// importing the heavy pdf.js chunk.
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 5;
export const ZOOM_STEP = 1.25;
