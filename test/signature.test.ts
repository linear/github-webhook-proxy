import { describe, expect, test } from "bun:test";
import { verifySignature, signPayload } from "../src/signature";

const TEST_SECRET = "test-webhook-secret";

describe("signPayload", () => {
  test("generates sha256 signature", async () => {
    const payload = '{"test": "data"}';
    const signature = await signPayload(payload, TEST_SECRET);

    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  test("generates consistent signatures", async () => {
    const payload = '{"test": "data"}';
    const sig1 = await signPayload(payload, TEST_SECRET);
    const sig2 = await signPayload(payload, TEST_SECRET);

    expect(sig1).toBe(sig2);
  });

  test("generates different signatures for different payloads", async () => {
    const sig1 = await signPayload('{"a": 1}', TEST_SECRET);
    const sig2 = await signPayload('{"b": 2}', TEST_SECRET);

    expect(sig1).not.toBe(sig2);
  });

  test("generates different signatures for different secrets", async () => {
    const payload = '{"test": "data"}';
    const sig1 = await signPayload(payload, "secret1");
    const sig2 = await signPayload(payload, "secret2");

    expect(sig1).not.toBe(sig2);
  });
});

// Helper to generate SHA-1 signatures (matching GitHub's format) for testing verifySignature
async function signPayloadSha1(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return "sha1=" + [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifySignature", () => {
  test("verifies valid sha1 signature", async () => {
    const payload = '{"test": "data"}';
    // verifySignature expects SHA-1 (GitHub's format)
    const signature = await signPayloadSha1(payload, TEST_SECRET);

    const isValid = await verifySignature(payload, signature, TEST_SECRET);
    expect(isValid).toBe(true);
  });

  test("rejects invalid signature", async () => {
    const payload = '{"test": "data"}';

    const isValid = await verifySignature(
      payload,
      "sha1=invalid",
      TEST_SECRET
    );
    expect(isValid).toBe(false);
  });

  test("rejects null signature", async () => {
    const payload = '{"test": "data"}';

    const isValid = await verifySignature(payload, null, TEST_SECRET);
    expect(isValid).toBe(false);
  });

  test("rejects tampered payload", async () => {
    const originalPayload = '{"test": "data"}';
    const signature = await signPayloadSha1(originalPayload, TEST_SECRET);

    const tamperedPayload = '{"test": "tampered"}';
    const isValid = await verifySignature(
      tamperedPayload,
      signature,
      TEST_SECRET
    );
    expect(isValid).toBe(false);
  });

  test("rejects wrong secret", async () => {
    const payload = '{"test": "data"}';
    const signature = await signPayloadSha1(payload, TEST_SECRET);

    const isValid = await verifySignature(payload, signature, "wrong-secret");
    expect(isValid).toBe(false);
  });
});
