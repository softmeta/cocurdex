/**
 * Resolve the userData directory so local development never shares persisted
 * state (SQLite database, attachments, workspace checkpoints, IndexedDB,
 * cookies) with an installed/packaged build.
 *
 * Both dev and packaged builds resolve `app.getName()` to the same value, so
 * Electron's default userData path collides. Dev runs get a dedicated `-dev`
 * directory; packaged builds keep the default path untouched.
 */
export function resolveUserDataPath(
  defaultUserDataPath: string,
  isPackaged: boolean,
): string {
  if (isPackaged) {
    return defaultUserDataPath;
  }
  return `${defaultUserDataPath}-dev`;
}
