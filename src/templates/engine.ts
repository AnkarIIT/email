import Handlebars from "handlebars";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { builtinTemplates, type BuiltInTemplate } from "./builtin.js";
import { htmlToText } from "./html-to-text.js";

export interface TemplateRenderResult {
  subject: string;
  html: string;
  text: string;
}

/**
 * Handlebars rendering with builtin transactional templates and automatic
 * plain-text fallback. A custom `templatesDir` can override builtins
 * (same file name, e.g. `otp.hbs`) or add new template names.
 */
export class TemplateEngine {
  private readonly compiled = new Map<string, Handlebars.TemplateDelegate<Record<string, unknown>>>();
  private readonly templatesDir: string | null;

  constructor(
    private readonly defaults: { appName?: string; baseUrl?: string } = {},
    templatesDir?: string,
  ) {
    this.templatesDir = templatesDir ?? null;
  }

  render(input: {
    template?: string;
    subject: string;
    data?: Record<string, unknown>;
    html?: string;
    text?: string;
  }): TemplateRenderResult {
    if (input.html) {
      // Raw HTML mode — no template pipeline.
      return {
        subject: input.subject,
        html: input.html,
        text: input.text ?? htmlToText(input.html),
      };
    }

    if (!input.template) {
      throw new Error("send() requires a `template` or raw `html`.");
    }

    const render = this.getTemplate(input.template);
    const context = {
      ...input.data,
      app_name: input.data?.app_name ?? this.defaults.appName ?? "MyApp",
      base_url: input.data?.base_url ?? this.defaults.baseUrl ?? "",
    };

    const html = render(context);
    const subject = Handlebars.compile(input.subject)(context);

    return {
      subject,
      html,
      text: input.text ?? htmlToText(html),
    };
  }

  private getTemplate(name: string): Handlebars.TemplateDelegate<Record<string, unknown>> {
    const cached = this.compiled.get(name);
    if (cached) return cached;

    let source: string | undefined;

    // 1) Custom override / custom template from templatesDir
    if (this.templatesDir) {
      for (const ext of [".hbs", ".handlebars"]) {
        try {
          source = readFileSync(join(this.templatesDir, name + ext), "utf8");
          break;
        } catch {
          // try next extension
        }
      }
    }

    // 2) Fallback to builtin
    if (source === undefined) {
      const builtin = builtinTemplates[name] as BuiltInTemplate | undefined;
      if (!builtin) {
        throw new Error(
          `Unknown template "${name}". Provide a ${name}.hbs in templatesDir or use a builtin: ${Object.keys(builtinTemplates).join(", ")}.`,
        );
      }
      source = builtin.html;
    }

    const compiled = Handlebars.compile<Record<string, unknown>>(source);
    this.compiled.set(name, compiled);
    return compiled;
  }
}
