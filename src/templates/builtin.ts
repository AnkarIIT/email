/**
 * Builtin transactional templates. Kept as source strings (not files) so
 * bundlers and npm installs need no runtime file access. A templatesDir
 * with same-named .hbs files overrides these.
 */

export interface BuiltInTemplate {
  /** Subject line template (same context as the body). */
  subject: string;
  /** Full HTML body. */
  html: string;
}

const layout = (title: string, body: string): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{{app_name}}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="padding:32px 32px 8px 32px;">
          <div style="font-size:18px;font-weight:700;color:#111827;">{{app_name}}</div>
          <h2 style="margin:16px 0 0 0;font-size:20px;color:#111827;">${title}</h2>
        </td></tr>
        <tr><td style="padding:8px 32px 0 32px;font-size:15px;line-height:1.6;color:#374151;">${body}</td></tr>
        <tr><td style="padding:32px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
          You received this email because of activity on <strong>{{app_name}}</strong>.
          If this wasn't you, you can safely ignore this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const otpBody = `
  <p>Use the verification code below to continue. It expires in <strong>{{ttl_minutes}} minutes</strong>.</p>
  <div style="margin:24px 0;padding:16px;background:#f9fafb;border:1px dashed #d1d5db;border-radius:8px;text-align:center;">
    <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;">{{otp_code}}</span>
  </div>
  <p style="margin-bottom:0;color:#6b7280;font-size:13px;">Never share this code with anyone — {{app_name}} will never ask for it.</p>`;

const welcomeBody = `
  <p>Welcome aboard, {{name}}! 🎉</p>
  <p>Your account is ready. Everything you need is waiting for you.</p>
  {{#if base_url}}{{#if action_url}}
  <div style="margin:24px 0;text-align:center;">
    <a href="{{action_url}}" style="display:inline-block;padding:12px 28px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">${"Get started"}</a>
  </div>
  {{/if}}{{/if}}
  <p style="color:#6b7280;font-size:13px;margin-bottom:0;">If the button doesn't work, copy this URL into your browser: <br />{{action_url}}</p>`;

const resetBody = `
  <p>We got a request to reset your password. Click the button below — this link is valid for <strong>{{ttl_minutes}} minutes</strong>.</p>
  <div style="margin:24px 0;text-align:center;">
    <a href="{{reset_url}}" style="display:inline-block;padding:12px 28px;background:#4f46e5;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Reset password</a>
  </div>
  <p style="color:#6b7280;font-size:13px;margin-bottom:0;">Prefer a code instead? Use this one: <strong>{{otp_code}}</strong>{{#unless otp_code}} (none was generated for this request){{/unless}}<br />
  Didn't request this? Ignore it — your password won't change without the link or code.</p>`;

export const builtinTemplates: Record<string, BuiltInTemplate> = {
  otp: {
    subject: "{{app_name}} — your verification code",
    html: layout("Verify your identity", otpBody),
  },
  welcome: {
    subject: "Welcome to {{app_name}}!",
    html: layout("Welcome aboard", welcomeBody),
  },
  "password-reset": {
    subject: "{{app_name}} — reset your password",
    html: layout("Password reset", resetBody),
  },
};

export type BuiltInTemplateName = keyof typeof builtinTemplates;
