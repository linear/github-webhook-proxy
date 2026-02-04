/**
 * HMAC signature verification and signing for GitHub webhooks.
 * - Verification uses SHA-1 (GitHub's x-hub-signature format)
 * - Signing uses SHA-256 (Linear's x-hub-signature-256 format)
 */

/**
 * Verifies a GitHub webhook signature using HMAC-SHA1.
 * GitHub sends signatures in the x-hub-signature header using SHA-1.
 *
 * @param payload - The raw request body as a string
 * @param signature - The signature from the x-hub-signature header
 * @param secret - The webhook secret
 * @returns True if the signature is valid
 */
export async function verifySignature(
  payload: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) {
    return false;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  const expected =
    "sha1=" +
    [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");

  // Use constant-time comparison to prevent timing attacks
  return timingSafeEqual(signature, expected);
}

/**
 * Signs a payload using HMAC-SHA256 for forwarding to Linear.
 * Linear expects signatures in the x-hub-signature-256 header using SHA-256.
 *
 * @param payload - The JSON payload string to sign
 * @param secret - The webhook secret
 * @returns The signature in the format "sha256=<hex>"
 */
export async function signPayload(
  payload: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return (
    "sha256=" +
    [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("")
  );
}

/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * @param a - First string
 * @param b - Second string
 * @returns True if strings are equal
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
