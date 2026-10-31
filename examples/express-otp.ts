/**
 * Drop-in OTP login flow with Express.
 *
 * Install: npm i express express-rate-limit
 * Run:     npx tsx examples/express-otp.ts
 */
import express from "express";
import { createEmail } from "mailkey";

const app = express();
app.use(express.json());

const email = createEmail({
  transport: process.env.EMAIL_TRANSPORT === "smtp"
    ? {
        type: "smtp",
        host: process.env.SMTP_HOST!,
        port: Number(process.env.SMTP_PORT ?? 587),
        auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
      }
    : { type: "resend", apiKey: process.env.RESEND_API_KEY ?? "", },
  from: process.env.EMAIL_FROM ?? "MyApp <no-reply@myapp.com>",
  appName: "MyApp",
  otp: { secret: process.env.OTP_SECRET!, cooldownSeconds: 60 },
});

// 1) POST /auth/send-otp  — body: { email }
app.post("/auth/send-otp", async (req, res) => {
  const { email: recipient } = req.body as { email?: string };
  if (!recipient) return res.status(400).json({ error: "email is required" });

  // Generic response regardless of delivery result → anti-enumeration.
  const result = await email.otp.send({ to: recipient });
  if (!result.ok && result.error.code !== "otp_cooldown_active") {
    // Delivery infrastructure failure — surface a plain 502 for the ops team.
    return res.status(502).json({ error: "mail delivery unavailable, try again" });
  }
  return res.json({ message: "If the address is valid, a code is on its way." });
});

// 2) POST /auth/verify-otp — body: { email, code }
app.post("/auth/verify-otp", async (req, res) => {
  const { email: recipient, code } = req.body as { email?: string; code?: string };
  if (!recipient || !code) return res.status(400).json({ error: "email and code are required" });

  const check = await email.otp.verify({ to: recipient, code });
  if (!check.valid) {
    const status = check.reason === "too_many_attempts" ? 429 : 401;
    return res.status(status).json({ valid: false, reason: check.reason, attemptsLeft: check.attemptsLeft });
  }
  // TODO: issue your real session/JWT here.
  return res.json({ valid: true, token: `fake-jwt-for-${recipient}` });
});

app.listen(3000, () => console.log("auth service on :3000"));
