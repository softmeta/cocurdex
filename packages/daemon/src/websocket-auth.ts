import { timingSafeEqual } from "node:crypto";
import { readDaemonWebSocketToken } from "@cocurdex/rpc";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const APP_ORIGIN_PROTOCOLS = new Set(["file:", "app:"]);

export function isAllowedWebSocketOrigin(origin: string | undefined) {
  if (origin === undefined || origin.length === 0) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (APP_ORIGIN_PROTOCOLS.has(url.protocol)) return true;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return LOOPBACK_HOSTS.has(url.hostname);
}

function tokensMatch(offered: string, expected: string) {
  const left = Buffer.from(offered);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function authorizeDaemonWebSocket(input: {
  origin: string | undefined;
  protocols: Iterable<string>;
  token: string;
}) {
  if (!isAllowedWebSocketOrigin(input.origin)) return false;
  const offered = readDaemonWebSocketToken(input.protocols);
  return offered !== null && tokensMatch(offered, input.token);
}

export function parseWebSocketProtocolHeader(header: string | undefined) {
  if (!header) return [];
  return header
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
