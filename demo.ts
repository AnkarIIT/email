/**
 * Quick demo — run with:
 *
 *   node demo.ts   (or: npm run demo)
 *
 * Uses the "console" transport: no credentials, no network.
 * OTP codes and emails print straight to your terminal.
 */
import { createEmail } from "./src/index.js";

const email = createEmail({
  transport: { type: "console" },
  from: "DemoApp <no-reply@demoapp.dev>",
  appName: "DemoApp",
  otp: {
    secret: "demo-secret-please-change-in-production",
    cooldownSeconds: 0, // allow resending in the demo
  },
  quotaGuard: { perEmailCooldownSeconds: 0 },
});

async function main() {
  const to = "aisha@example.com";

  // 1) Transactional send (never throws — structured result)
  console.log("── 1. send(): welcome email");
  const sent = await email.send({
    to,
    subject: "Welcome",
    template: "welcome",
    data: { name: "Aisha", action_url: "https://demoapp.dev/start" },
  });
  console.log("Result:", JSON.stringify(sent, null, 2));

  // 2) OTP send
  console.log("\n── 2. otp.send(): verification code (see box above ☝️)");
  const otpSent = await email.otp.send({ to });
  console.log("Result:", JSON.stringify(otpSent, null, 2));

  // 3) OTP verify — first a wrong code, then recover it for the demo
  console.log("\n── 3. otp.verify(): wrong code first...");
  console.log(JSON.stringify(await email.otp.verify({ to, code: "000000" })));

  console.log("\n── 4. otp.verify(): then the right code");
  // For the demo we read the printed code; re-send & capture via a spy is overkill.
  const code = process.argv[2];
  if (!code) {
    console.log("Tip: run `npm run demo -- 123456` … but the actual code is printed in the mail box above.");
    return;
  }
  console.log(JSON.stringify(await email.otp.verify({ to, code })));

  // 5) Failing transport → structured error, no crash
  console.log("\n── 5. resilience: dead transport stays caught");
  const bad = createEmail({
    transport: { type: "smtp", host: "127.0.0.1", port: 1, auth: { user: "u", pass: "p" } },
    from: "DemoApp <no-reply@demoapp.dev>",
  });
  const res = await bad.send({ to, subject: "Will fail", html: "<p>hello</p>" });
  console.log("Result:", JSON.stringify(res, null, 2));

  await bad.close();
  await email.close();
}

main().catch((err) => {
  console.error("Unexpected:", err);
  process.exit(1);
});
