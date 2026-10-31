import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TemplateEngine } from "../src/templates/engine.js";
import { htmlToText } from "../src/templates/html-to-text.js";
import { createEmail } from "../src/core/mailer.js";

describe("template engine", () => {
  it("renders builtin otp template with variables", () => {
    const engine = new TemplateEngine({ appName: "TestApp" });
    const out = engine.render({
      template: "otp",
      subject: "{{app_name}} — your code",
      data: { otp_code: "481920", ttl_minutes: 5 },
    });
    expect(out.subject).toContain("TestApp");
    expect(out.html).toContain("481920");
    expect(out.text).toContain("481920");
    expect(out.text).not.toContain("<");
  });

  it("falls back to plain text generated from HTML", () => {
    const engine = new TemplateEngine();
    const out = engine.render({
      template: "otp",
      subject: "s",
      data: { otp_code: "123456", ttl_minutes: 5 },
    });
    // Text version must exist and contain the code and the sharing warning.
    expect(out.text).toContain("123456");
    expect(out.text).toContain("Never share this code");
  });

  it("injects app_name default from client config", () => {
    const engine = new TemplateEngine({ appName: "CoolApp" });
    const out = engine.render({ template: "otp", subject: "{{app_name}} code", data: { otp_code: "111111" } });
    expect(out.subject).toContain("CoolApp");
  });

  it("throws a clear error for unknown templates", () => {
    const engine = new TemplateEngine();
    expect(() => engine.render({ template: "nope", subject: "s" })).toThrow(/Unknown template "nope"/);
    expect(() => engine.render({ subject: "s" })).toThrow(/template.*or raw .html./);
  });

  it("custom templatesDir can override builtin and add new templates", () => {
    const dir = mkdtempSync(join(tmpdir(), "mailkey-"));
    writeFileSync(join(dir, "otp.hbs"), "<p>Custom OTP {{otp_code}}</p>");
    writeFileSync(join(dir, "invoice.hbs"), "<p>Invoice {{#each items}}{{this}} {{/each}}</p>");

    const engine = new TemplateEngine({ appName: "TestApp" }, dir);
    const otp = engine.render({ template: "otp", subject: "s", data: { otp_code: "999999" } });
    expect(otp.html).toContain("Custom OTP 999999");

    const invoice = engine.render({
      template: "invoice",
      subject: "Invoice",
      data: { items: ["A", "B"] },
    });
    expect(invoice.html).toContain("Invoice A B");
  });

  it("subject is interpolated with template context", () => {
    const engine = new TemplateEngine({ appName: "TestApp" });
    const out = engine.render({
      template: "otp",
      subject: "{{app_name}} — your code",
      data: { otp_code: "777777" },
    });
    expect(out.subject).toBe("TestApp — your code");
  });
});

describe("end-to-end via createEmail with custom dir", () => {
  it("unknown template in send returns structured error, not a throw", async () => {
    const client = createEmail({
      transport: { type: "console" },
      from: "T <t@t.io>",
      otp: { secret: "s".repeat(32) },
    });
    const result = await client.send({
      to: "u@x.com",
      subject: "s",
      template: "nope",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("template_error");
  });

  it("rich html banners become readable text via htmlToText", () => {
    const text = htmlToText(
      "<div><h2>Hi</h2><style>.a{}</style><p>Body &amp; more</p></div>",
    );
    expect(text).toContain("Hi");
    expect(text).toContain("Body & more");
    expect(text).not.toContain(".a{}");
  });
});
