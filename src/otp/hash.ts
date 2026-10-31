import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

/**
 * OTP codes are never stored in plain text. We store HMAC-SHA256(secret, code)
 * — even if the store leaks, codes are not recoverable (the secret stays on
 * the server). HMAC is used over plain SHA-256 so a leaked 6-digit hash
 * cannot be brute-forced offline without the secret.
 */
export function hashOtp(code: string, secret: string): string {
  return createHmac("sha256", secret).update(code).digest("hex");
}

/** Constant-time comparison — safe against timing attacks. */
export function otpHashesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) {
    // Burn a comparison anyway so timing does not reveal length mismatch.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Cryptographically secure numeric code (CSPRNG — node:crypto randomInt). */
export function generateOtpCode(length: number): string {
  const digits = Array.from({ length }, () => randomInt(0, 10).toString());
  return digits.join("");
}
