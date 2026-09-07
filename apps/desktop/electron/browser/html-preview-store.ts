import { randomUUID } from "node:crypto";

export const HTML_PREVIEW_SCHEME = "cocurdex-html";
export const HTML_PREVIEW_URL_PATTERN =
  /^cocurdex-html:\/\/preview\/[0-9a-f-]{36}(?:#[^\s]*)?$/;

const MAX_PREVIEW_BYTES = 16 * 1024 * 1024;
const MAX_PREVIEWS = 32;

export class HtmlPreviewStore {
  private readonly documents = new Map<string, string>();
  private totalBytes = 0;

  add(html: string): string {
    const bytes = Buffer.byteLength(html, "utf8");
    if (bytes > MAX_PREVIEW_BYTES) {
      throw new Error("HTML preview is too large");
    }
    if (
      this.totalBytes + bytes > MAX_PREVIEW_BYTES ||
      this.documents.size >= MAX_PREVIEWS
    ) {
      throw new Error("Close a browser preview before opening another");
    }
    const url = `${HTML_PREVIEW_SCHEME}://preview/${randomUUID()}`;
    this.documents.set(url, html);
    this.totalBytes += bytes;

    return url;
  }

  read(url: string): string | undefined {
    if (!HTML_PREVIEW_URL_PATTERN.test(url)) {
      return;
    }
    return this.documents.get(url.split("#", 1)[0]);
  }

  remove(url: string) {
    const html = this.documents.get(url);
    if (html === undefined) return;
    this.documents.delete(url);
    this.totalBytes -= Buffer.byteLength(html, "utf8");
  }

  update(url: string, html: string) {
    const previous = this.documents.get(url);
    if (previous === undefined) throw new Error("HTML preview not found");
    const bytes = Buffer.byteLength(html, "utf8");
    const total = this.totalBytes - Buffer.byteLength(previous, "utf8") + bytes;
    if (total > MAX_PREVIEW_BYTES) throw new Error("HTML preview is too large");
    this.documents.set(url, html);
    this.totalBytes = total;
  }
}
