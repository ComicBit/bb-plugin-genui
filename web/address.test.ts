import { describe, expect, it } from "vitest";
import { isConnectableAddress, isPublicAddress, isUnlistableRange, parseRanges, rangesKey, STANDARD_FAKE_RANGES, type AllowedRange } from "./address";
import { refusal } from "./net";

const range = (network: string, prefix: number, family: 4 | 6): AllowedRange => ({ network, prefix, family });
const SURGE = STANDARD_FAKE_RANGES;
const CLASH_CHANGED = [range("28.0.0.0", 8, 4)];
const V6 = [range("fd00:6152::", 48, 6)];

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.251",
    "255.255.255.255",
    "198.18.0.1",
    "::1",
    "::",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::7f00:1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe80::1%en0",
    "ff02::1",
    "2001:db8::1",
    "2002:7f00:1::1",
    "2001::1",
    "localhost",
    "",
  ])("refuses %s", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each(["8.8.8.8", "208.80.154.224", "172.32.0.1", "100.128.0.1", "2a02:ec80:300:ed1a::1", "[2606:4700::1111]"])(
    "allows %s",
    (address) => {
      expect(isPublicAddress(address)).toBe(true);
    },
  );
});

describe("parseRanges", () => {
  it("reads the setting's CIDRs, however they are separated", () => {
    const { ranges, rejected } = parseRanges("28.0.0.0/8, fd00:6152::/48\n198.19.0.0/16  198.18.0.0/15;");
    expect(ranges).toEqual([
      { network: "28.0.0.0", prefix: 8, family: 4 },
      { network: "fd00:6152::", prefix: 48, family: 6 },
      { network: "198.19.0.0", prefix: 16, family: 4 },
      { network: "198.18.0.0", prefix: 15, family: 4 },
    ]);
    expect(rejected).toEqual([]);
  });

  it("reads a bare address as a single host", () => {
    expect(parseRanges("28.0.0.1").ranges).toEqual([{ network: "28.0.0.1", prefix: 32, family: 4 }]);
    expect(parseRanges("fd00:6152::1").ranges).toEqual([{ network: "fd00:6152::1", prefix: 128, family: 6 }]);
  });

  it("refuses what is not a range at all", () => {
    const { ranges, rejected } = parseRanges("example.com 28.0.0.0/33 28.0.0.0/8/8 ,28.0.0.0/x ffff::gg");
    expect(ranges).toEqual([]);
    expect(rejected).toEqual(["example.com", "28.0.0.0/33", "28.0.0.0/8/8", "28.0.0.0/x", "ffff::gg"]);
  });

  it("refuses the ranges that must never open, and anything reaching into them", () => {
    const { ranges, rejected } = parseRanges("127.0.0.1/32, 10.0.0.0/8, 169.254.0.0/16, ::1/128, fe80::/10, ::ffff:10.0.0.0/104, 0.0.0.0/0");
    expect(ranges).toEqual([]);
    expect(rejected).toHaveLength(7);
    // A wider range that contains one of them is refused whole, not trimmed.
    expect(parseRanges("8.0.0.0/6").rejected).toEqual(["8.0.0.0/6"]);
    expect(isUnlistableRange(range("192.168.0.0", 8, 4))).toBe(true);
    expect(isUnlistableRange(range("28.0.0.0", 8, 4))).toBe(false);
    expect(isUnlistableRange(range("fd00:6152::", 48, 6))).toBe(false);
  });

  it("leaves the standard fake pool alone", () => {
    expect(parseRanges("198.18.0.0/15").ranges).toEqual([{ network: "198.18.0.0", prefix: 15, family: 4 }]);
    expect(isUnlistableRange(range("198.18.0.0", 15, 4))).toBe(false);
  });
});

describe("isConnectableAddress", () => {
  it("allows only public addresses when nothing is listed", () => {
    expect(isConnectableAddress("8.8.8.8")).toBe(true);
    expect(isConnectableAddress("198.18.44.124")).toBe(false);
    expect(isConnectableAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("allows the standard pool when it is listed", () => {
    for (const address of ["198.18.0.1", "198.18.44.124", "198.19.255.254", "[198.18.44.124]"]) {
      expect(isConnectableAddress(address, SURGE)).toBe(true);
      expect(isConnectableAddress(address, [])).toBe(false);
    }
    // A non-public address outside the listed range stays refused (192.0.2.0/24 is documentation).
    expect(isConnectableAddress("192.0.2.1", SURGE)).toBe(false);
    expect(isConnectableAddress("192.0.2.1", [])).toBe(false);
  });

  it("allows a changed pool, and an IPv6 one", () => {
    expect(isConnectableAddress("28.1.2.3", CLASH_CHANGED)).toBe(true);
    expect(isConnectableAddress("29.1.2.3", CLASH_CHANGED)).toBe(true); // public, so listed ranges are not what allows it
    expect(isConnectableAddress("192.0.2.1", CLASH_CHANGED)).toBe(false);
    expect(isConnectableAddress("fd00:6152::7", V6)).toBe(true);
    expect(isConnectableAddress("fd00:6153::7", V6)).toBe(false);
    expect(isConnectableAddress("2001:4860::1", V6)).toBe(true);
  });

  it("keeps this machine and its network out, whatever is listed", () => {
    const everything = [range("0.0.0.0", 0, 4), range("::", 0, 6)];
    for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "64:ff9b::7f00:1", "2001::1", "2002:7f00:1::1"]) {
      expect(isConnectableAddress(address, everything)).toBe(false);
    }
    expect(isConnectableAddress("198.18.44.124%en0", SURGE)).toBe(false);
  });
});

describe("rangesKey", () => {
  it("names the same set the same way", () => {
    expect(rangesKey(SURGE)).toBe("198.18.0.0/15");
    expect(rangesKey([...SURGE, ...V6])).toBe("198.18.0.0/15,fd00:6152::/48");
  });
});

describe("refusal", () => {
  it.each([
    ["http://example.com/a.png", "only https links can be fetched"],
    ["https://user:pw@example.com/a.png", "links with credentials can't be fetched"],
    ["https://example.com:8443/a.png", "only the standard https port is allowed"],
    ["https://127.0.0.1/a.png", "127.0.0.1 is not on the public internet"],
    ["https://[::1]/a.png", "::1 is not on the public internet"],
    ["https://2130706433/a.png", "127.0.0.1 is not on the public internet"],
  ])("refuses %s", (url, reason) => {
    expect(refusal(new URL(url))).toBe(reason);
  });

  it("allows public https hosts on the default port", () => {
    expect(refusal(new URL("https://upload.wikimedia.org/a.jpg"))).toBeNull();
    expect(refusal(new URL("https://example.com:443/a.jpg"))).toBeNull();
  });

  it("refuses a fake-IP address unless the caller lists it", () => {
    expect(refusal(new URL("https://198.18.44.124/a.png"))).toBe("198.18.44.124 is not on the public internet");
    expect(refusal(new URL("https://198.18.44.124/a.png"), SURGE)).toBeNull();
    // The rest of the guard is not a setting.
    expect(refusal(new URL("https://127.0.0.1/a.png"), SURGE)).toBe("127.0.0.1 is not on the public internet");
    expect(refusal(new URL("http://198.18.44.124/a.png"), SURGE)).toBe("only https links can be fetched");
  });
});
