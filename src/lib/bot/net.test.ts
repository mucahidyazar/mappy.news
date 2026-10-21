import { describe, expect, it } from "vitest";

import { decodeBody, FetchBlockedError, isPrivateAddress, safeFetchText } from "./net";

describe("isPrivateAddress", () => {
  it("blocks loopback, private, link-local, CGNAT and multicast ranges", () => {
    for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
  });

  it("allows public addresses", () => {
    for (const address of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });
});

describe("safeFetchText", () => {
  const publicResolve = async () => ["93.184.216.34"];

  it("refuses private targets, including after a redirect", async () => {
    await expect(safeFetchText("http://127.0.0.1/feed")).rejects.toBeInstanceOf(FetchBlockedError);
    await expect(safeFetchText("file:///etc/passwd")).rejects.toBeInstanceOf(FetchBlockedError);
    const fetchImpl = (async () => new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } })) as typeof fetch;
    await expect(safeFetchText("https://feed.example/rss", { fetchImpl, resolve: publicResolve })).rejects.toThrow(/private address/);
  });

  it("stops reading oversized bodies", async () => {
    const fetchImpl = (async () => new Response("x".repeat(2048))) as typeof fetch;
    await expect(safeFetchText("https://feed.example/rss", { fetchImpl, resolve: publicResolve, maxBytes: 1024 })).rejects.toThrow(/larger than/);
  });
});

describe("decodeBody", () => {
  // "Kadıköy'de yangın" in ISO-8859-9.
  const latin5 = Uint8Array.from([0x4b, 0x61, 0x64, 0xfd, 0x6b, 0xf6, 0x79, 0x27, 0x64, 0x65, 0x20, 0x79, 0x61, 0x6e, 0x67, 0xfd, 0x6e]);

  it("uses the Content-Type charset", () => {
    expect(decodeBody(latin5, "text/xml; charset=ISO-8859-9")).toBe("Kadıköy'de yangın");
  });

  it("falls back to the XML declaration", () => {
    const prolog = new TextEncoder().encode('<?xml version="1.0" encoding="windows-1254"?><t>');
    const buffer = new Uint8Array([...prolog, ...latin5]);
    expect(decodeBody(buffer, "application/rss+xml")).toBe('<?xml version="1.0" encoding="windows-1254"?><t>Kadıköy\'de yangın');
  });

  it("defaults to UTF-8 and survives unknown labels", () => {
    expect(decodeBody(new TextEncoder().encode("Üsküdar"), null)).toBe("Üsküdar");
    expect(decodeBody(new TextEncoder().encode("Üsküdar"), "text/xml; charset=bogus")).toBe("Üsküdar");
  });
});
