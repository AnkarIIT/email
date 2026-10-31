import { QuotaGuard } from "./quota-guard.js";
import type {
  ClientConfig,
  EmailClient,
  MessageInput,
  OTPStore,
  OutgoingMessage,
  SendResult,
  TransportAdapter,
  TransportConfig,
} from "./types.js";
import { ConsoleTransport } from "../transport/console.js";
import { SmtpTransport } from "../transport/smtp.js";
import { ResendTransport } from "../transport/resend.js";
import { InMemoryOtpStore } from "../otp/store/in-memory.js";
import { OtpEngine } from "../otp/otp.js";
import { TemplateEngine } from "../templates/engine.js";

export function createTransport(config: TransportConfig): TransportAdapter {
  switch (config.type) {
    case "console":
      return new ConsoleTransport();
    case "smtp":
      return new SmtpTransport(config);
    case "resend":
      return new ResendTransport(config);
    case "custom":
      return config.adapter;
  }
}

const WARNING_NO_OTP =
  "[mailkey] No `otp` config provided — email.otp is disabled. Pass `otp: { secret }` to enable it.";

/**
 * Creates an embedded email client.
 *
 * Contract: `send()` never throws — failures come back as structured
 * SendResults so a bad recipient or a dead SMTP host never crashes the
 * host application.
 */
export function createEmail(config: ClientConfig): EmailClient {
  if (!config.from) {
    throw new Error('createEmail requires `from` (e.g. "MyApp <no-reply@myapp.com>").');
  }

  const transport = createTransport(config.transport);
  const templates = new TemplateEngine(
    { appName: config.appName, baseUrl: config.baseUrl },
    config.templatesDir,
  );
  const guard = new QuotaGuard(config.quotaGuard);
  const defaultStore: OTPStore = config.store ?? new InMemoryOtpStore();

  const recipientsOf = (to: string | string[]): string[] =>
    (Array.isArray(to) ? to : [to]).map((t) => t.trim()).filter((t) => t.length > 0);

  const sendInternal = async (input: MessageInput): Promise<SendResult> => {
    const recipients = recipientsOf(input.to);
    if (recipients.length === 0) {
      return {
        ok: false,
        error: { code: "invalid_input", message: "No valid recipient in `to`.", retryable: false },
      };
    }

    // Guardrail: structured failure instead of a crash for quota issues.
    const guardCheck = guard.check(recipients);
    if (!guardCheck.ok) {
      return {
        ok: false,
        error: { code: "rate_limited", message: guardCheck.reason, retryable: true },
      };
    }

    let content: { subject: string; html?: string; text?: string };
    try {
      content = templates.render(input);
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "template_error",
          message: err instanceof Error ? err.message : String(err),
          retryable: false,
        },
      };
    }

    const message: OutgoingMessage = {
      from: input.from ?? config.from,
      to: recipients,
      subject: content.subject,
      html: content.html,
      text: content.text,
      replyTo: input.replyTo,
    };

    try {
      const result = await transport.send(message);
      guard.recordSend(recipients);
      return { ok: true, id: result.id ?? "unknown" };
    } catch (err) {
      return {
        ok: false,
        error: {
          code: "transport_failed",
          message: err instanceof Error ? err.message : String(err),
          retryable: true,
        },
      };
    }
  };

  const send = async (input: MessageInput): Promise<SendResult> => {
    if (!input.template && !input.html) {
      return {
        ok: false,
        error: {
          code: "invalid_input",
          message: "send() needs a `template` name or raw `html`.",
          retryable: false,
        },
      };
    }
    if (!input.subject) {
      return {
        ok: false,
        error: { code: "invalid_input", message: "send() needs a `subject`.", retryable: false },
      };
    }
    return sendInternal(input);
  };

  let otp: OtpEngine | undefined;
  if (config.otp) {
    otp = new OtpEngine(config.otp, {
      sendMail: (mail) =>
        sendInternal({ to: mail.to, subject: mail.subject, html: mail.html, text: mail.text }),
      templates,
      defaultStore,
      defaultAppName: config.appName ?? "MyApp",
    });
  } else {
    console.warn(WARNING_NO_OTP);
  }

  return {
    transport,
    send,
    otp: otp ?? disabledOtp(),
    async close() {
      await transport.close?.();
    },
  };
}

function disabledOtp(): EmailClient["otp"] {
  const fail = async (): Promise<never> => {
    throw new Error(
      "[mailkey] OTP is not enabled — pass `otp: { secret: \"...\" }` to createEmail().",
    );
  };
  return { send: fail, verify: fail };
}
