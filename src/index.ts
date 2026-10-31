/**
 * mailkey — embeddable OTP + transactional email for Node.js.
 *
 * Quick start:
 *
 *   import { createEmail } from "mailkey";
 *
 *   const email = createEmail({
 *     transport: { type: "resend", apiKey: process.env.RESEND_API_KEY },
 *     from: "MyApp <no-reply@myapp.com>",
 *     appName: "MyApp",
 *     otp: { secret: process.env.OTP_SECRET },
 *   });
 *
 *   // Transactional send (never throws; returns a structured result)
 *   const result = await email.send({
 *     to: "user@example.com",
 *     subject: "Welcome",
 *     template: "welcome",
 *     data: { name: "Aisha", action_url: "https://myapp.com/start" },
 *   });
 *
 *   // OTP flow
 *   await email.otp.send({ to: "user@example.com" });
 *   const check = await email.otp.verify({ to: "user@example.com", code: "481920" });
 *
 * Transports: "console" (dev, prints to terminal), "smtp" (Nodemailer),
 * "resend" (HTTP API via fetch), or any { type: "custom", adapter }.
 */

export { createEmail, createTransport } from "./core/mailer.js";
export { QuotaGuard } from "./core/quota-guard.js";
export { ConsoleTransport } from "./transport/console.js";
export { SmtpTransport } from "./transport/smtp.js";
export { ResendTransport } from "./transport/resend.js";
export { OtpEngine, normalize as normalizeEmail } from "./otp/otp.js";
export { generateOtpCode, hashOtp, otpHashesMatch } from "./otp/hash.js";
export { InMemoryOtpStore } from "./otp/store/in-memory.js";
export { RedisOtpStore, type RedisLikeClient } from "./otp/store/redis.js";
export { TemplateEngine } from "./templates/engine.js";
export { builtinTemplates, type BuiltInTemplateName } from "./templates/builtin.js";
export { htmlToText } from "./templates/html-to-text.js";

export type {
  ClientConfig,
  EmailClient,
  EmailError,
  MessageInput,
  OTPStore,
  OtpApi,
  OtpConfig,
  OtpRecord,
  OtpSendInput,
  OtpVerifyInput,
  OutgoingMessage,
  QuotaGuardConfig,
  SendResult,
  TransportAdapter,
  TransportConfig,
  TransportSendResult,
  VerifyResult,
} from "./core/types.js";
