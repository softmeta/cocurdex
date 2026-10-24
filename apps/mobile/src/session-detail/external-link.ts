const EXTERNAL_LINK_SCHEMES = new Set(["http", "https", "mailto"]);
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

export function externalLinkUrl(url: string): string | null {
  const trimmed = url.trim();
  const scheme = SCHEME.exec(trimmed)?.[1]?.toLowerCase();
  return scheme && EXTERNAL_LINK_SCHEMES.has(scheme) ? trimmed : null;
}
