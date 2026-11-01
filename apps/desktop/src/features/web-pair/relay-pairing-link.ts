import { isRelayEndpoint, parseHostPairingLink } from "@cocurdex/shared";

export type RelayPairingLinkProblem = "invalid" | "notRelay" | "insecure";

export type RelayPairingLink =
  | {
      ok: true;
      link: NonNullable<ReturnType<typeof parseHostPairingLink>>;
    }
  | { ok: false; problem: RelayPairingLinkProblem };

export function readRelayPairingLink(
  text: string,
  pageProtocol: string,
): RelayPairingLink {
  const link = parseHostPairingLink(text);
  if (!link) return { ok: false, problem: "invalid" };
  if (!isRelayEndpoint(link.baseUrl)) return { ok: false, problem: "notRelay" };
  const secure = new URL(link.baseUrl).protocol === "https:";
  if (pageProtocol === "https:" && !secure) {
    return { ok: false, problem: "insecure" };
  }
  return { ok: true, link };
}
