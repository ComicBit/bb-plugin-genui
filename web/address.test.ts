import { describe, expect, it } from "vitest";
import { isConnectableAddress, isPublicAddress } from "./address";
import { refusal } from "./net";

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

describe("isConnectableAddress", () => {
  it.each(["198.18.0.0", "198.18.0.1", "198.18.44.124", "198.19.255.255", "[198.18.44.124]"])(
    "allows the fake-IP range %s only when the caller allows it",
    (address) => {
      expect(isConnectableAddress(address, true)).toBe(true);
      expect(isConnectableAddress(address, false)).toBe(false);
    },
  );

  it("opens up that range and nothing else", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "169.254.169.254", "::1", "fd00::1", "::ffff:198.18.44.124"]) {
      expect(isConnectableAddress(address, true)).toBe(false);
    }
    expect(isConnectableAddress("198.18.44.124%en0", true)).toBe(false);
    expect(isConnectableAddress("8.8.8.8", false)).toBe(true);
    expect(isConnectableAddress("8.8.8.8", true)).toBe(true);
    // Outside the range, the public-address answer stands on its own.
    expect(isConnectableAddress("198.20.0.1", false)).toBe(true);
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

  it("refuses a fake-IP address unless the caller allows it", () => {
    expect(refusal(new URL("https://198.18.44.124/a.png"))).toBe("198.18.44.124 is not on the public internet");
    expect(refusal(new URL("https://198.18.44.124/a.png"), true)).toBeNull();
    // The rest of the guard is not a setting.
    expect(refusal(new URL("https://127.0.0.1/a.png"), true)).toBe("127.0.0.1 is not on the public internet");
    expect(refusal(new URL("http://198.18.44.124/a.png"), true)).toBe("only https links can be fetched");
  });
});
