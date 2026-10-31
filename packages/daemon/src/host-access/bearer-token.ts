export function readBearerToken(header: string | undefined) {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return match?.[1] ?? null;
}
