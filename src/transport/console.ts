import type { OutgoingMessage, TransportAdapter, TransportSendResult } from "../core/types.js";

/**
 * Dev transport: prints the rendered email to the terminal instead of
 * sending. Zero credentials, zero network — the whole OTP flow works
 * out of the box during development.
 */
export class ConsoleTransport implements TransportAdapter {
  readonly name = "console";

  async send(message: OutgoingMessage): Promise<TransportSendResult> {
    const line = "─".repeat(58);
    console.log(`
┌${line}┐
│ ✉️  DEV MAIL (console transport — not actually sent)
├${line}┤
│ From:    ${message.from}
│ To:      ${message.to.join(", ")}
│ Subject: ${message.subject}
├${line}┤`);

    if (message.text) {
      console.log(message.text.split("\n").map((l) => `│ ${l}`).join("\n"));
    }

    console.log(`└${line}┘\n`);
    return { id: `console-${Date.now()}` };
  }
}
