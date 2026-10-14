// Which IP addresses the plugin may connect to. A URL in a spec is model
// output, so fetching it must never reach this machine, its network or any
// address that isn't on the public internet.
import { BlockList, isIP } from "node:net";

/** A CIDR a local resolver's fake addresses may come from. */
export interface AllowedRange {
  readonly network: string;
  readonly prefix: number;
  readonly family: 4 | 6;
}

/** IPv4 ranges that are not public unicast (RFC 6890 and friends). */
const PRIVATE_V4: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata lives here)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, broadcast
];

/**
 * IPv6 is allowed only inside global unicast (2000::/3), which already
 * excludes loopback, unspecified, IPv4-mapped, NAT64, unique-local,
 * link-local and multicast; these special blocks inside it are refused too.
 */
const SPECIAL_V6: readonly (readonly [string, number])[] = [
  ["2001::", 23], // IETF protocol assignments (Teredo, benchmarking, ORCHID)
  ["2001:db8::", 32], // documentation
  ["2002::", 16], // 6to4: tunnels to an embedded IPv4 address
  ["3fff::", 20], // documentation
];

/**
 * Ranges a fake-IP pool can never live in, whatever a user lists: an address
 * here names this machine or something on its network, so allowing one would
 * open the end of the guard the `webLookupsFakeIp` setting must not touch.
 * The standard pool, `198.18.0.0/15`, is deliberately not on this list.
 */
const NEVER_V4: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata lives here)
  ["172.16.0.0", 12], // private
  ["192.168.0.0", 16], // private
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, broadcast
];

const NEVER_V6: readonly (readonly [string, number])[] = [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["::ffff:0:0", 96], // IPv4-mapped: would name an IPv4 address under another spelling
  ["64:ff9b::", 96], // NAT64 well-known prefix: an embedded IPv4 address
  ["64:ff9b:1::", 48], // RFC 8215 local-use NAT64, which exists to reach private IPv4 addresses
  ["fc00::", 7], // unique-local: RFC 4193 addresses name hosts on this network, like RFC1918 does
  ["2001::", 23], // IETF protocol assignments (Teredo tunnels to an embedded IPv4 address)
  ["2002::", 16], // 6to4: the same
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
];

/**
 * The range Surge's fake-IP responder answers from, and the default of the
 * tools that let it be changed (Clash, sing-box). Unroutable on the public
 * internet, so a connection to one goes to the local resolver, which maps it
 * back to the hostname and connects itself.
 *
 * A resolver whose fake pool sits in a range `NEVER_V4`/`NEVER_V6` names — a
 * unique-local range, say — cannot be supported: those ranges also name hosts
 * on this network, and the setting may not open them.
 */
export const STANDARD_FAKE_RANGES: readonly AllowedRange[] = [{ network: "198.18.0.0", prefix: 15, family: 4 }];

const privateV4 = new BlockList();
for (const [network, prefix] of PRIVATE_V4) privateV4.addSubnet(network, prefix, "ipv4");
const neverV4 = new BlockList();
for (const [network, prefix] of NEVER_V4) neverV4.addSubnet(network, prefix, "ipv4");
const neverV6 = new BlockList();
for (const [network, prefix] of NEVER_V6) neverV6.addSubnet(network, prefix, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
const specialV6 = new BlockList();
for (const [network, prefix] of SPECIAL_V6) specialV6.addSubnet(network, prefix, "ipv6");

/** The address without the brackets an IPv6 URL wraps it in. */
function bareAddress(address: string): string {
  return address.startsWith("[") && address.endsWith("]") ? address.slice(1, -1) : address;
}

/** True only for a literal IP address on the public internet. */
export function isPublicAddress(address: string): boolean {
  const bare = bareAddress(address);
  // A scoped address (fe80::1%en0) names an interface on this machine, wherever it sits.
  if (bare.includes("%")) return false;
  switch (isIP(bare)) {
    case 4:
      return !privateV4.check(bare, "ipv4");
    case 6:
      return globalV6.check(bare, "ipv6") && !specialV6.check(bare, "ipv6");
    default:
      return false;
  }
}

/** True when an address inside `range` could also name a host on this machine or its network. */
export function isUnlistableRange(range: AllowedRange): boolean {
  const span = spanOf(range);
  // An entry this code cannot place is not vouched for: the parser has already refused it.
  if (span === null) return true;
  return neverSpans.some((never) => never.family === range.family && span.start <= never.end && never.start <= span.end);
}

/** One CIDR as a first and last address; null when the text is not one this code can place. */
function spanOf(range: AllowedRange): { readonly start: bigint; readonly end: bigint } | null {
  const start = range.family === 4 ? number4(range.network) : number6(range.network);
  if (start === null) return null;
  const width = range.family === 4 ? 32 : 128;
  const mask = range.prefix === 0 ? 0n : ((1n << BigInt(width)) - 1n) ^ ((1n << BigInt(width - range.prefix)) - 1n);
  const base = start & mask;
  return { start: base, end: base | (((1n << BigInt(width)) - 1n) ^ mask) };
}

function number4(address: string): bigint | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255 || `${octet}` !== part) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

function number6(address: string): bigint | null {
  const [head, tail] = address.split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  if (address.includes("::") && left.length + right.length > 7) return null;
  const fill = address.includes("::") ? new Array<string>(8 - left.length - right.length).fill("0") : [];
  const groups = [...left, ...fill, ...right];
  if (groups.length !== 8) return null;
  let value = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    value = (value << 16n) | BigInt(`0x${group}`);
  }
  return value;
}

/** Every range a listed range may not reach into, as spans. */
const neverSpans: readonly { readonly family: 4 | 6; readonly start: bigint; readonly end: bigint }[] = [
  ...NEVER_V4.map(([network, prefix]) => ({ network, prefix, family: 4 as const })),
  ...NEVER_V6.map(([network, prefix]) => ({ network, prefix, family: 6 as const })),
].flatMap((range) => {
  const span = spanOf(range);
  return span === null ? [] : [{ ...span, family: range.family }];
});

/**
 * Reads the `webLookupsFakeIpRanges` setting: comma-, space- or newline-separated
 * CIDRs (`28.0.0.0/8`), or a single address (`28.0.0.1`), which is read as one
 * host. Entries that are not a range, or that reach into `NEVER_V4`/`NEVER_V6`,
 * come back in `rejected` and are never allowed.
 */
export function parseRanges(text: string): { readonly ranges: readonly AllowedRange[]; readonly rejected: readonly string[] } {
  const ranges: AllowedRange[] = [];
  const rejected: string[] = [];
  for (const piece of text.split(/[\s,;]+/)) {
    if (piece === "") continue;
    const range = readRange(piece);
    if (range === null || isUnlistableRange(range)) rejected.push(piece);
    else ranges.push(range);
  }
  return { ranges, rejected };
}

function readRange(piece: string): AllowedRange | null {
  const parts = piece.split("/");
  if (parts.length > 2) return null;
  const network = parts[0];
  const family = isIP(network);
  if (family !== 4 && family !== 6) return null;
  const prefix = parts.length === 1 ? (family === 4 ? 32 : 128) : Number(parts[1]);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128)) return null;
  return { network, prefix, family };
}

/**
 * True for an address a fetch may connect to: the public internet, plus — only
 * when the user has listed it — a range a local resolver answers its fake
 * addresses from. `NEVER_V4`/`NEVER_V6` are checked too, so no listing opens
 * this machine, its network or its router.
 */
export function isConnectableAddress(address: string, extra: readonly AllowedRange[] = []): boolean {
  if (isPublicAddress(address)) return true;
  if (extra.length === 0) return false;
  const bare = bareAddress(address);
  // A scoped address (fe80::1%en0) names an interface on this machine, wherever it sits.
  if (bare.includes("%")) return false;
  return evaluatorFor(extra)(bare);
}

/** The evaluator for one set of listed ranges; a settings change makes a new one. */
const evaluators = new Map<string, (address: string) => boolean>();

function evaluatorFor(extra: readonly AllowedRange[]): (address: string) => boolean {
  const key = rangesKey(extra);
  const known = evaluators.get(key);
  if (known !== undefined) return known;
  const listedV4 = new BlockList();
  const listedV6 = new BlockList();
  for (const range of extra) {
    if (range.family === 4) listedV4.addSubnet(range.network, range.prefix, "ipv4");
    else listedV6.addSubnet(range.network, range.prefix, "ipv6");
  }
  const allows = (address: string): boolean => {
    switch (isIP(address)) {
      case 4:
        return listedV4.check(address, "ipv4") && !neverV4.check(address, "ipv4");
      case 6:
        return listedV6.check(address, "ipv6") && !neverV6.check(address, "ipv6");
      default:
        return false;
    }
  };
  // Only a settings change makes a new set, so this stays tiny.
  if (evaluators.size > 8) evaluators.clear();
  evaluators.set(key, allows);
  return allows;
}

/**
 * A stable name for a set of ranges, for the cache above and for connection
 * pools. Two policies never share a pool, so a set that differs in any way -
 * order, repeats, spelling - is a different key and gets its own.
 */
export function rangesKey(extra: readonly AllowedRange[]): string {
  return extra.map((range) => `${range.network}/${range.prefix}`).join(",");
}
