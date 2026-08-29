// Routes the editor view by file type. Kept tiny and pure so the extension
// branch in the editor body can be unit-tested in isolation.
export function isPdfPath(filePath: string): boolean {
  return /\.pdf$/i.test(filePath);
}
