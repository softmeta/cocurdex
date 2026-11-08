export function isPdfPath(filePath: string): boolean {
  return /\.pdf$/i.test(filePath);
}
