import type { OutgoingMessage, TransportAdapter, TransportSendResult } from "../core/types.js";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface ResendAdapterOptions {
  apiKey: string;
  /** Override for self-hosted/proxy scenarios. */
  endpoint?: string;
}

/**
 * Resend HTTP transport using native fetch — no Resend SDK dependency.
 * Works everywhere the app runs: Railway, Render, Fly.io, Vercel
 * serverless (where SMTP connections are unreliable), and home servers.
 */
export class ResendTransport implements TransportAdapter {
  readonly name = "resend";
  private readonly apiKey: string;
  private readonly endpoint: string;

  constructor(options: ResendAdapterOptions) {
    if (!options.apiKey) {
      throw new Error("ResendTransport requires an apiKey (RESEND_API_KEY).");
    }
    this.apiKey = options.apiKey;
    this.endpoint = options.endpoint ?? RESEND_ENDPOINT;
  }

  async send(message: OutgoingMessage): Promise<TransportSendResult> {
    // Resend requires a single recipient string or array without "Name" syntax.
    const to = message.to.map((addr) => addr.trim());

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: message.from,
        to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        reply_to: message.replyTo,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const err = new Error(
        `Resend API responded ${response.status}: ${body || response.statusText}`,
      ) as Error & { status?: number };
      err.status = response.status;
      throw err;
    }

    const data = (await response.json()) as { id?: string };
    return { id: data.id };
  }
}
