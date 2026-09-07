import { createPreviewScrollScript } from "./scroll-script";

interface HtmlPreviewDocumentOptions {
  nonce?: string;
  scrollToEnd?: boolean;
}

export function createHtmlPreviewDocument(
  code: string,
  isIncomplete: boolean,
  {
    nonce = crypto.randomUUID(),
    scrollToEnd = isIncomplete,
  }: HtmlPreviewDocumentOptions = {},
) {
  let scriptPolicy = "'unsafe-inline'";
  if (isIncomplete) {
    scriptPolicy = scrollToEnd ? `'nonce-${nonce}'` : "'none'";
  }
  const policy = [
    "default-src 'none'",
    `script-src ${scriptPolicy}`,
    "style-src 'unsafe-inline'",
    "img-src data: blob:",
    "font-src data:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");

  const scrollScript = scrollToEnd
    ? `<script nonce="${nonce}">${createPreviewScrollScript(isIncomplete)}</script>`
    : "";

  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><meta charset="utf-8">${scrollScript}${code}`;
}
