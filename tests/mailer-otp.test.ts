import { describe, expect, it, vi } from "vitest";
import { createEmail } from "../src/core/mailer.js";
import type { ClientConfig, SendResult } from "../src/core/types.js";

/**
 * Test transport: records every send and optionally fails, so we can
 * validate the "senders never throw" contract without a real provider.
 */
function testTransport(opts: { failWith?: Error; id?: string } = {}) {
  const sent: unknown[] = [];
  return {
    sent,
    adapter: {
      name: "test",
      async send(message: unknown) {
        sent.push(message);
        if (opts.failWith) throw opts.failWith;
        return { id: opts.id ?? "test-1" };
      },
    },
  };
}

function makeClient(overrides: Partial<ClientConfig> = {}, transportOpts: { failWith?: Error } = {}) {
  const t = testTransport(transportOpts);
  const client = createEmail({
    transport: { type: "custom", adapter: t.adapter },
    from: "MyApp <no-reply@myapp.com>",
    appName: "MyApp",
    otp: {
      secret: "test-secret-0123456789abcdef",
      cooldownSeconds: 0,
      ttlSeconds: 300,
    },
    ...overrides,
  });
  return { client, sent: t.sent as { to: string[]; html: string; text: string; subject: string }[] };
}

describe("mailer (senders never throw)", () => {
  it("sends with a template and returns ok with an id", async () => {
    const { client } = makeClient();
    const result = await client.send({
      to: "user@example.com",
      subject: "Hi",
      template: "otp",
      data: { otp_code: "123456" },
    });
    expect(result.ok).toBe(true);
    expect("id" in result && result.id.length).toBeGreaterThan(0);
  });

  it("returns structured failure when the transport dies — no exception", async () => {
    const { client } = makeClient({}, { failWith: new Error("SMTP host is dead") });
    await expect(
      client.send({ to: "user@example.com", subject: "Hi", template: "otp", data: {} }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "transport_failed",
        message: "SMTP host is dead",
        retryable: true,
      },
    });
  });

  it("returns invalid_input instead of throwing on missing subject/template", async () => {
    const { client } = makeClient();
    const noSubject = await client.send({ to: "user@example.com", template: "otp" });
    expect(noSubject.ok).toBe(false);
    if (!noSubject.ok) expect(noSubject.error.code).toBe("invalid_input");

    const noTemplate = await client.send({ to: "user@example.com", subject: "s" });
    expect(noTemplate.ok).toBe(false);
  });

  it("raw html mode skips templates and generates a plain-text fallback", async () => {
    const { client, sent } = makeClient();
    const result = await client.send({
      to: "user@example.com",
      subject: "Raw",
      html: "<p>Hello <b>world</b></p><a href='https://x.com'>Go</a>",
    });
    expect(result.ok).toBe(true);
    expect(sent[0].subject).toBe("Raw");
    expect(sent[0].text).toContain("Hello world");
    expect(sent[0].text).toContain("https://x.com");
  });

  it("per-recipient cooldown produces rate_limited without sending", async () => {
    const { client, sent } = makeClient({
      quotaGuard: { perEmailCooldownSeconds: 60 },
    });
    const one: SendResult = await client.send({
      to: "user@example.com",
      subject: "one",
      template: "otp",
    });
    const two: SendResult = await client.send({
      to: "user@example.com",
      subject: "two",
      template: "otp",
    });
    expect(one.ok).toBe(true);
    expect(two.ok).toBe(false);
    if (!two.ok) expect(two.error.code).toBe("rate_limited");
    // other recipients are unaffected
    const other = await client.send({
      to: "other@example.com",
      subject: "other",
      template: "otp",
    });
    expect(other.ok).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it("hourlyCap blocks sends across recipients", async () => {
    const { client } = makeClient({ quotaGuard: { hourlyCap: 2, perEmailCooldownSeconds: 0 } });
    const emails = ["a@x.com", "b@x.com", "c@x.com"];
    const results = [];
    for (const to of emails) {
      results.push(await client.send({ to, subject: "s", template: "otp" }));
    }
    expect(results[0].ok).toBe(true);
    expect(results[1].ok).toBe(true);
    expect(results[2].ok).toBe(false);
    if (!results[2].ok) expect(results[2].error.code).toBe("rate_limited");
  });

  it("warns and disables otp when no otp config is given", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const t = testTransport();
    const client = createEmail({
      transport: { type: "custom", adapter: t.adapter },
      from: "MyApp <no-reply@myapp.com>",
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("otp is disabled"));
    await expect(client.otp.send({ to: "u@x.com" })).rejects.toThrow(/OTP is not enabled/);
    warn.mockRestore();
  });
});

describe("otp engine", () => {
  async function setup(storeOverride?: ClientConfig["store"]) {
    const { client, sent } = makeClient({ otp: { secret: "test-secret-0123456789abcdef", cooldownSeconds: 0 }, store: storeOverride });
    return { client, sent };
  }

  function lastCodeFor(sentHtml: string): string {
    // Pull the 6-digit code out of the rendered template.
    const match = sentHtml.match(/<span[^>]*>(\d{6})<\/span>/);
    if (!match) throw new Error("no code rendered");
    return match[1];
  }

  it("send → verify happy path (single use)", async () => {
    const { client, sent } = await setup();
    const result = await client.otp.send({ to: "User@Example.com" });
    expect(result.ok).toBe(true);

    const html = sent[sent.length - 1].html;
    const code = lastCodeFor(html);
    const to = sent[sent.length - 1].to[0];

    const ok = await client.otp.verify({ to, code });
    expect(ok.valid).toBe(true);
    // single-use: same code can't verify again
    const ok2 = await client.otp.verify({ to, code: "000000" });
    expect(ok2).toEqual({ valid: false, reason: "not_found" });
  });

  it("does not leak the raw code anywhere in the returned result", async () => {
    const { client, sent } = await setup();
    const result = await client.otp.send({ to: "user@example.com" });
    expect(JSON.stringify(result)).not.toMatch(/\d{6}/);
    expect(sent.length).toBe(1);
  });

  it("bounded attempts: 3 wrong codes burn the record", async () => {
    const { client, sent } = await setup();
    await client.otp.send({ to: "user@example.com" });
    const code = lastCodeFor(sent[sent.length - 1].html);
    const wrong = code === "123456" ? "654321" : "123456";

    const r1 = await client.otp.verify({ to: "user@example.com", code: wrong });
    const r2 = await client.otp.verify({ to: "user@example.com", code: wrong });
    expect(r1).toMatchObject({ valid: false, reason: "invalid_code", attemptsLeft: 2 });
    expect(r2).toMatchObject({ valid: false, reason: "invalid_code", attemptsLeft: 1 });

    const r3 = await client.otp.verify({ to: "user@example.com", code: wrong });
    expect(r3).toEqual({ valid: false, reason: "too_many_attempts", attemptsLeft: 0 });

    // The record was burned on attempt 3 — even the right code is dead.
    const r4 = await client.otp.verify({ to: "user@example.com", code });
    expect(r4.valid).toBe(false);
  });

  it("resend cooldown blocks immediate re-send with a structured error", async () => {
    const { client } = makeClient({
      otp: { secret: "test-secret-0123456789abcdef", cooldownSeconds: 60 },
    });
    const first = await client.otp.send({ to: "user@example.com" });
    const second = await client.otp.send({ to: "user@example.com" });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe("otp_cooldown_active");
  });

  it("expired codes are rejected with reason expired", async () => {
    // A store that reveals the record even past its expiry — the engine's
    // defensive `record.expiresAt` check must produce reason: "expired".
    const expiredInStore = {
      async set() { /* noop */ },
      async get() {
        return { hash: "h", expiresAt: Date.now() - 1000, attemptsLeft: 3 };
      },
      async delete() { /* noop */ },
    };

    const client = createEmail({
      transport: { type: "custom", adapter: testTransport().adapter },
      from: "MyApp <no-reply@myapp.com>",
      otp: { secret: "test-secret-0123456789abcdef", store: expiredInStore },
    });

    const result = await client.otp.verify({ to: "user@example.com", code: "123456" });
    expect(result).toEqual({ valid: false, reason: "expired" });
  });

  it("codes whose store entry timed out read as not_found", async () => {
    const { client, sent } = makeClient({
      otp: { secret: "test-secret-0123456789abcdef", ttlSeconds: 1, cooldownSeconds: 0 },
    });
    await client.otp.send({ to: "user@example.com" });
    const code = lastCodeFor(sent[sent.length - 1].html);
    await new Promise((r) => setTimeout(r, 1100));
    const result = await client.otp.verify({ to: "user@example.com", code });
    expect(result).toEqual({ valid: false, reason: "not_found" });
  });

  it("rejects empty codes", async () => {
    const { client } = await setup();
    expect(await client.otp.verify({ to: "user@example.com", code: "" })).toEqual({
      valid: false,
      reason: "missing_code",
    });
  });

  it("normalizes email case so User@X.com and user@x.com share one record", async () => {
    const { client, sent } = await setup();
    await client.otp.send({ to: "USER@example.com" });
    const code = lastCodeFor(sent[0].html);
    expect(await client.otp.verify({ to: "user@EXAMPLE.com", code })).toEqual({ valid: true });
  });
});
