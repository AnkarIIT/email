/** Errors are data, not exceptions — senders never throw. */
export interface EmailError {
  /** Stable machine-readable code, e.g. "transport_failed", "rate_limited". */
  code: string;
  /** Human-readable description. */
  message: string;
  /** True when retrying the same request later is likely to work. */
  retryable: boolean;
}

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: EmailError };

export interface VerifyResult {
  valid: boolean;
  /** Why verification failed (only present when valid === false). */
  reason?: "not_found" | "expired" | "too_many_attempts" | "invalid_code" | "missing_code";
  /** Attempts remaining, when relevant. */
  attemptsLeft?: number;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface MessageInput {
  /** Recipient email (or list of emails). */
  to: string | string[];
  subject: string;
  /** Name of a builtin ("otp", "welcome", "password-reset") or custom template. */
  template?: string;
  /** Variables handed to the template engine. */
  data?: Record<string, unknown>;
  /** Raw HTML (used directly when provided; skips templates). */
  html?: string;
  /** Raw plain-text. Auto-generated from HTML when omitted. */
  text?: string;
  /** Override the configured default "From" address. */
  from?: string;
  replyTo?: string;
}

/** The single internal message format every ingress converts to. */
export interface OutgoingMessage {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

// ---------------------------------------------------------------------------
// Transports
// ---------------------------------------------------------------------------

export interface TransportSendResult {
  id?: string;
}

/**
 * The provider plug-point. Implement this to add SES, SendGrid, Postmark…
 * Adapters MAY throw; the mailer catches and converts failures into a
 * structured SendResult so hosts never see exceptions for a bad recipient
 * or a dead SMTP host.
 */
export interface TransportAdapter {
  readonly name: string;
  send(message: OutgoingMessage): Promise<TransportSendResult>;
  /** Optional cleanup (e.g. close SMTP pool). */
  close?(): Promise<void>;
}

export type TransportConfig =
  | { type: "console" }
  | {
      type: "smtp";
      host: string;
      /** Default 587. */
      port?: number;
      secure?: boolean;
      auth?: { user: string; pass: string };
    }
  | { type: "resend"; apiKey: string }
  /** Bring your own adapter (also lets hosts inject mock transports). */
  | { type: "custom"; adapter: TransportAdapter };

// ---------------------------------------------------------------------------
// Quota guard
// ---------------------------------------------------------------------------

export interface QuotaGuardConfig {
  /** Minimum seconds between two sends to the SAME recipient. Default 60. */
  perEmailCooldownSeconds?: number;
  /** Max sends per hour across all recipients on this client. Default: unlimited. */
  hourlyCap?: number;
}

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

export interface OtpConfig {
  /** HMAC secret used to hash codes at rest. Required when using otp. */
  secret: string;
  /** Code length in digits. Default 6. */
  length?: number;
  /** Code time-to-live in seconds. Default 300 (5 min). */
  ttlSeconds?: number;
  /** Failed verifications allowed before the code is invalidated. Default 3. */
  maxAttempts?: number;
  /** Minimum seconds between sends to the same email. Default 60. */
  cooldownSeconds?: number;
  /** Storage backend. Default: in-memory. Provide Redis in production. */
  store?: OTPStore;
}

export interface OtpSendInput {
  to: string;
  /** Shown in the default template ("Your MyApp code"). Falls back to client appName. */
  appName?: string;
  /** Extra variables for a custom OTP template. */
  data?: Record<string, unknown>;
}

export interface OtpVerifyInput {
  to: string;
  code: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface ClientConfig extends Pick<Partial<OtpConfig>, "store"> {
  transport: TransportConfig;
  /** Default sender, e.g. "MyApp <no-reply@myapp.com>". */
  from: string;
  appName?: string;
  otp?: OtpConfig;
  quotaGuard?: QuotaGuardConfig;
  /** Directory with *.hbs template files. Files with builtin names override builtins. */
  templatesDir?: string;
  /** Default base URL injected into templates ({{reset_url}} etc.). */
  baseUrl?: string;
}

/** Public client surface. */
export interface EmailClient {
  send(input: MessageInput): Promise<SendResult>;
  otp: OtpApi;
  transport: TransportAdapter;
  close(): Promise<void>;
}

export interface OtpApi {
  send(input: OtpSendInput): Promise<SendResult>;
  verify(input: OtpVerifyInput): Promise<VerifyResult>;
}

// ---------------------------------------------------------------------------
// OTP storage
// ---------------------------------------------------------------------------

/** What we persist: never the raw code — only its HMAC. */
export interface OtpRecord {
  hash: string;
  expiresAt: number;
  attemptsLeft: number;
}

/**
 * The OTP storage plug-point. InMemory for dev, Redis for production
 * (multi-worker / restart-safe). Values are stored per key; `ttlSeconds`
 * is a hint — implementations SHOULD expire entries, but the engine also
 * checks `expiresAt` defensively.
 */
export interface OTPStore {
  set(key: string, value: OtpRecord, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<OtpRecord | null>;
  delete(key: string): Promise<void>;
}
