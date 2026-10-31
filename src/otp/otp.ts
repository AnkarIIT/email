import type {
  OTPStore,
  OtpApi,
  OtpConfig,
  OtpRecord,
  OtpSendInput,
  OtpVerifyInput,
  SendResult,
  VerifyResult,
} from "../core/types.js";
import { generateOtpCode, hashOtp, otpHashesMatch } from "./hash.js";

export interface OtpEngineDeps {
  /** Delivery goes through the client's configured transport. */
  sendMail(input: { to: string; subject: string; html: string; text: string }): Promise<SendResult>;
  /** Render into email content. */
  templates: {
    render(input: { template: string; subject: string; data?: Record<string, unknown> }): {
      subject: string;
      html: string;
      text: string;
    };
  };
  /** Fallback store = the one passed via createEmail (defaults to in-memory). */
  defaultStore: OTPStore;
  /** Client-level default appName. */
  defaultAppName: string;
}

export const OTP_COOLDOWN_KEY_PREFIX = "mailkey:otp:cooldown:";

const DEFAULTS = {
  length: 6,
  ttlSeconds: 300,
  maxAttempts: 3,
  cooldownSeconds: 60,
} as const;

/**
 * The OTP engine: generation → hashed storage with TTL → delivery →
 * single-use verification with bounded attempts and resend cooldown.
 *
 * Security model:
 *  - Codes come from node:crypto's CSPRNG (randomInt).
 *  - Only HMAC-SHA256(secret, code) is persisted.
 *  - Verification compares hashes in constant time.
 *  - After `maxAttempts` failures the record is deleted (no retry).
 *  - Each code is deleted on first successful verification (single-use).
 */
export class OtpEngine implements OtpApi {
  private readonly store: OTPStore;
  private readonly config: Required<Omit<OtpConfig, "secret" | "store">> & { secret: string };

  constructor(
    config: OtpConfig & { store?: OTPStore },
    private readonly deps: OtpEngineDeps,
  ) {
    if (!config?.secret) {
      throw new Error("OtpEngine requires `otp.secret` (used to HMAC codes at rest).");
    }
    this.config = {
      length: config.length ?? DEFAULTS.length,
      ttlSeconds: config.ttlSeconds ?? DEFAULTS.ttlSeconds,
      maxAttempts: config.maxAttempts ?? DEFAULTS.maxAttempts,
      cooldownSeconds: config.cooldownSeconds ?? DEFAULTS.cooldownSeconds,
      secret: config.secret,
    };
    this.store = config.store ?? deps.defaultStore;
  }

  async send(input: OtpSendInput): Promise<SendResult> {
    const email = normalize(input.to);

    // Resend cooldown (protects the provider quota and the inbox from abuse).
    const cooldownKey = `${OTP_COOLDOWN_KEY_PREFIX}${email}`;
    const cooling = await this.store.get(cooldownKey);
    if (cooling) {
      return {
        ok: false,
        error: {
          code: "otp_cooldown_active",
          message: `An OTP was sent to ${email} recently. Wait ${this.config.cooldownSeconds}s before requesting again.`,
          retryable: true,
        },
      };
    }

    // 1) Generate (CSPRNG) + 2) store HMAC with TTL and attempt counter
    const code = generateOtpCode(this.config.length);
    const record: OtpRecord = {
      hash: hashOtp(code, this.config.secret),
      expiresAt: Date.now() + this.config.ttlSeconds * 1000,
      attemptsLeft: this.config.maxAttempts,
    };
    await this.store.set(email, record, this.config.ttlSeconds);
    await this.store.set(cooldownKey, record, this.config.cooldownSeconds);

    // 3) Render + deliver. The code is NOT returned to the caller.
    const rendered = this.deps.templates.render({
      template: "otp",
      subject: "Your verification code",
      data: {
        otp_code: code,
        ttl_minutes: Math.max(1, Math.round(this.config.ttlSeconds / 60)),
        app_name: input.appName ?? this.deps.defaultAppName,
        ...(input.data ?? {}),
      },
    });

    return this.deps.sendMail({
      to: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });
  }

  async verify(input: OtpVerifyInput): Promise<VerifyResult> {
    const email = normalize(input.to);
    if (!input.code) {
      return { valid: false, reason: "missing_code" };
    }

    const record = await this.store.get(email);
    if (!record) {
      return { valid: false, reason: "not_found" };
    }

    if (record.expiresAt <= Date.now()) {
      await this.store.delete(email);
      return { valid: false, reason: "expired" };
    }

    if (record.attemptsLeft <= 0) {
      await this.store.delete(email);
      return { valid: false, reason: "too_many_attempts" };
    }

    const providedHash = hashOtp(input.code.toString(), this.config.secret);
    if (!otpHashesMatch(record.hash, providedHash)) {
      const attemptsLeft = record.attemptsLeft - 1;
      if (attemptsLeft <= 0) {
        // Bounded attempts: burn the record entirely.
        await this.store.delete(email);
        return { valid: false, reason: "too_many_attempts", attemptsLeft: 0 };
      }
      await this.store.set(email, { ...record, attemptsLeft }, remainingTtlSeconds(record));
      return { valid: false, reason: "invalid_code", attemptsLeft };
    }

    // Single use: consume the code.
    await this.store.delete(email);
    return { valid: true };
  }
}

function remainingTtlSeconds(record: OtpRecord): number {
  return Math.max(1, Math.ceil((record.expiresAt - Date.now()) / 1000));
}

/** Emails are case-insensitive — normalize so storage keys can't be tricked. */
export function normalize(email: string): string {
  return email.trim().toLowerCase();
}
