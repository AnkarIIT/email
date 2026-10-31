import nodemailer, { type Transporter } from "nodemailer";
import type { OutgoingMessage, TransportAdapter, TransportConfig, TransportSendResult } from "../core/types.js";

export interface SmtpAdapterOptions {
  host: string;
  port?: number;
  secure?: boolean;
  auth?: { user: string; pass: string };
}

/**
 * SMTP transport built on Nodemailer.
 * Works with Gmail app passwords, Brevo/Mailgun relays, or the
 * developer's own MTA on their own server (localhost) — so a host
 * choosing to build deliverability on its own IP can still use
 * this exact code path.
 */
export class SmtpTransport implements TransportAdapter {
  readonly name = "smtp";
  private readonly transporter: Transporter;

  constructor(options: SmtpAdapterOptions) {
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port ?? 587,
      secure: options.secure ?? false,
      auth: options.auth,
    });
  }

  async send(message: OutgoingMessage): Promise<TransportSendResult> {
    const info = await this.transporter.sendMail({
      from: message.from,
      to: message.to.join(", "),
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
    });
    return { id: info.messageId };
  }

  async close(): Promise<void> {
    this.transporter.close();
  }
}

export function isSmtpConfig(config: TransportConfig): config is Extract<TransportConfig, { type: "smtp" }> {
  return config.type === "smtp";
}
