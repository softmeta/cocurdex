import type { HostAddress } from "@cocurdex/shared";

export interface NetworkInterfaceAddress {
  address: string;
  family: string | number;
  internal: boolean;
}

function isTailscaleIpv4(address: string) {
  const [first, second] = address.split(".").map(Number);
  return first === 100 && second !== undefined && second >= 64 && second < 128;
}

function isTailscaleIpv6(address: string) {
  return address.toLowerCase().startsWith("fd7a:115c:a1e0:");
}

function isLinkLocal(address: string) {
  return (
    address.startsWith("169.254.") || address.toLowerCase().startsWith("fe80:")
  );
}

function isBenchmarkingRange(address: string) {
  const [first, second] = address.split(".").map(Number);
  return first === 198 && (second === 18 || second === 19);
}

function formatUrl(address: string, family: "IPv4" | "IPv6", port: number) {
  return family === "IPv6"
    ? `http://[${address}]:${port}`
    : `http://${address}:${port}`;
}

function familyOf(entry: NetworkInterfaceAddress) {
  return entry.family === "IPv6" || entry.family === 6 ? "IPv6" : "IPv4";
}

export function listHostAddresses(
  interfaces: Record<string, NetworkInterfaceAddress[] | undefined>,
  port: number,
): HostAddress[] {
  const addresses: HostAddress[] = [];
  const seen = new Set<string>();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal || isLinkLocal(entry.address)) continue;
      if (isBenchmarkingRange(entry.address)) continue;
      if (seen.has(entry.address)) continue;
      seen.add(entry.address);
      const family = familyOf(entry);
      const tailscale =
        family === "IPv4"
          ? isTailscaleIpv4(entry.address)
          : isTailscaleIpv6(entry.address);
      if (family === "IPv6" && !tailscale) continue;
      addresses.push({
        address: entry.address,
        kind: tailscale ? "tailscale" : "lan",
        url: formatUrl(entry.address, family, port),
      });
    }
  }
  return addresses.sort((left, right) =>
    left.kind === right.kind ? 0 : left.kind === "tailscale" ? -1 : 1,
  );
}
