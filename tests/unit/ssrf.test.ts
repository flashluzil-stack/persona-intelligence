import { describe, expect, it } from "vitest";
import { publicOnlyLookup } from "@/lib/providers/content/safe-fetch";
import { assertPublicUrl, isPublicAddress, SsrfError, validatePublicUrl } from "@/lib/security/ssrf";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::a9fe:a9fe",
    "2001:db8::1",
    "ff02::1",
  ])("blocks %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("allows %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it("rejects non-IP strings", () => {
    expect(isPublicAddress("example.com")).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  it.each([
    "file:///etc/passwd",
    "gopher://example.com",
    "http://localhost:80/",
    "http://LOCALHOST/",
    "http://foo.localhost/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://2130706433/",
    "http://0x7f.0.0.1/",
    "http://127.1/",
    "http://intranet/",
    "http://printer.local/",
    "http://admin:secret@example.com/",
    "https://example.com:22/",
  ])("rejects %s", (url) => {
    expect(() => assertPublicUrl(url)).toThrow(SsrfError);
  });

  it("accepts ordinary public URLs", () => {
    expect(assertPublicUrl("https://example.com/path?q=1").hostname).toBe("example.com");
    expect(assertPublicUrl("http://example.org:80/").hostname).toBe("example.org");
  });
});

describe("validatePublicUrl (DNS)", () => {
  it("rejects hostnames that resolve to private addresses (DNS rebinding)", async () => {
    const resolver = async () => [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.7", family: 4 }];
    await expect(validatePublicUrl("https://evil.example.com/", resolver)).rejects.toThrow(/private/);
  });

  it("rejects hostnames that resolve to cloud metadata", async () => {
    const resolver = async () => [{ address: "169.254.169.254", family: 4 }];
    await expect(validatePublicUrl("https://meta.example.com/", resolver)).rejects.toThrow(SsrfError);
  });

  it("rejects unresolvable hostnames", async () => {
    const resolver = async () => {
      throw new Error("ENOTFOUND");
    };
    await expect(validatePublicUrl("https://nope.example.com/", resolver)).rejects.toThrow(/resolved/);
  });

  it("accepts hostnames resolving only to public addresses", async () => {
    const resolver = async () => [{ address: "93.184.216.34", family: 4 }];
    await expect(validatePublicUrl("https://example.com/", resolver)).resolves.toBeInstanceOf(URL);
  });
});

describe("connect-time lookup guard", () => {
  it("refuses to connect to loopback", async () => {
    const err = await new Promise<Error | null>((resolve) => {
      publicOnlyLookup("localhost", { all: true }, (e) => resolve(e as Error | null));
    });
    expect(err).toBeInstanceOf(SsrfError);
  });
});
