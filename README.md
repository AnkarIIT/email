# mailkey

> Embeddable OTP + transactional email for Node.js. Free to use, five-minute setup, works on any host — including free tiers, serverless, and your own laptop.

`mailkey` is a **library** your backend imports directly. It handles the whole transactional-email lifecycle:

- ✉️ **Sending** via Resend (HTTP API), any SMTP relay (Gmail/Brevo/your own MTA), or a console printer for dev
- 🔐 **OTP engine** — CSPRNG codes, HMAC-hashed storage, TTL, bounded attempts, resend cooldown, single-use semantics
- 🍞 **Handlebars templates** with responsive builtin templates (OTP, welcome, password-reset) and automatic plain-text fallback
- 🛡 **Never throws** — every send returns a structured result, so a dead provider never crashes your app
- 🚦 **quotaGuard** — per-recipient cooldown + hourly cap so a runaway loop can't burn your free-tier quota

```bash
npm install mailkey
```

---

## Quick start (zero credentials)

The `console` transport prints every email to your terminal — the whole OTP flow works with no API keys, no DNS, no network:

```ts
import { createEmail } from "mailkey";

const email = createEmail({
  transport: { type: "console" },           // dev mode: prints instead of sending
  from: "MyApp <no-reply@myapp.com>",
  appName: "MyApp",
  otp: { secret: process.env.OTP_SECRET },  // any long random string
});

// Send a welcome email
await email.send({
  to: "user@example.com",
  subject: "Welcome",
  template: "welcome",
  data: { name: "Aisha", action_url: "https://myapp.com/start" },
});

// OTP flow
await email.otp.send({ to: "user@example.com" });                  // code lands in inbox (or console)
const check = await email.otp.verify({ to: "user@example.com", code: "481920" });
// → { valid: true }  |  { valid: false, reason: "invalid_code", attemptsLeft: 2 }
```

Try it right now, no install of providers needed:

```bash
npm run demo      # prints the mail + flows in the terminal
```

---

## Real delivery in one config line

### Resend (recommended for production & free tier)

Sign up at [resend.com](https://resend.com) (free tier: **100 emails/day**), verify your domain, get an API key.

```ts
const email = createEmail({
  transport: { type: "resend", apiKey: process.env.RESEND_API_KEY },
  from: "MyApp <no-reply@yourdomain.com>",  // must be on your verified domain
  appName: "MyApp",
  otp: { secret: process.env.OTP_SECRET },
});
```

Works on **every hosting platform** — including serverless (Vercel/Netlify), Railway, Render, Fly.io, Docker, and your own laptop. No inbound ports, no static IP needed.

### SMTP (Gmail app password, Brevo, Mailgun relay, or your own MTA)

```ts
const email = createEmail({
  transport: {
    type: "smtp",
    host: process.env.SMTP_HOST,     // e.g. smtp.gmail.com / smtp-relay.brevo.com / localhost
    port: 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  },
  from: "MyApp <no-reply@myapp.com>",
  otp: { secret: process.env.OTP_SECRET },
});
```

> ⚠️ **Gmail note:** sending from a personal Gmail works for dev/tests (`you@gmail.com` + app password), but the sender shows your Gmail address and deliverability is weak. For production use a verified domain with Resend/SES/your own MTA.

### Bring your own adapter

```ts
const email = createEmail({
  transport: { type: "custom", adapter: mySesAdapter },  // implements TransportAdapter
});
```

```ts
interface TransportAdapter {
  name: string;
  send(msg: OutgoingMessage): Promise<{ id?: string }>;
  close?(): Promise<void>;
}
```

---

## Free-tier cheat sheet (what "free" actually means)

| Option | Cost | Limit | Good for |
|---|---|---|---|
| Console transport | ₹0 | unlimited | dev / CI / trials |
| Gmail SMTP | ₹0 | ~500/day, own-Gmail sender | dev, tiny apps |
| Resend free tier | ₹0 | 100/day, your verified domain | production start |
| Brevo / SendGrid free tiers | ₹0 | ~300 / 100 per day | production start |
| AWS SES | ~$0.10 / 1000 emails | no daily cap | real scale |

The library is free forever (MIT). Actual delivery always rides on one of these providers' infrastructures — that's how inbox placement works.

---

## OTP: safety built in

| Guard | Behavior | Default |
|---|---|---|
| CSPRNG generation | `node:crypto.randomInt` — 6 digits | 6 |
| Hashed at rest | Only `HMAC-SHA256(secret, code)` is stored | — |
| Timing safety | Constant-time comparison | — |
| TTL | Code expires | 5 min |
| Bounded attempts | After N wrong codes the record is burned | 3 |
| Single-use | First successful verify deletes the code | — |
| Resend cooldown | Per recipient | 60 s |
| Constant finalize | `verify()` returns `{ valid, reason }` | — |
| Anti-enumeration | `otp.send()` never returns the code | — |

All of the above are configurable via `otp: { … }` in `createEmail()`.

### OTP storage backends

```ts
// dev / single process (default)
otp: { secret }                                // InMemoryOtpStore

// production — survives restarts, works across workers
import Redis from "ioredis";                   // npm install ioredis
otp: {
  secret,
  store: new RedisOtpStore(new Redis(process.env.REDIS_URL)),
}
```

**Why Redis matters on Railway/Render:** their auto-restarts/sleep cycles wipe in-process memory. A user who got a code before the restart would always hit "invalid OTP". With Redis, codes (and cooldowns and attempt counters) survive.

---

## Deployment guide

### Rule of thumb

1. **Serverless (Vercel, Netlify…)?** → use the `resend` adapter (HTTP works everywhere; SMTP long-connections are unreliable there).
2. **Railway / Render / Fly.io first deploy?** → enable **Redis** for OTP storage (restarts wipe memory).
3. **Own VPS (Hetzner/DO) + Docker?** → anything works, including your own MTA on `localhost:587` if you've done SPF/DKIM/DMARC/rDNS setup.

### Railway (free $5/mo credit)

- Plugin: Redis (one click)
- Env vars in the dashboard — no config file changes
- Recommended transport: `resend`

### Render

- Free tier **sleeps after 15 min idle** — every cold wake wipes in-memory state.
- → OTP **must** use Redis (Render's or Upstash free tier).

### Vercel / serverless

- → `resend` adapter only; OTP store **must** be `RedisOtpStore` (each invocation is a fresh process).

### Docker

A backend using mailkey is just a normal Node container:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "server.js"]
```

with `docker-compose.yml` for the Redis store:

```yaml
services:
  app:
    build: .
    env_file: .env
    ports: ["3000:3000"]
  redis:
    image: redis:alpine
```

### Laptop / home server as the server

Good news: sending email is **outbound only** — no inbound port, no static IP, no port-forwarding needed. Use the `resend` (or `smtp` port 587) adapter and it just works.

**Two honest warnings:**
- The laptop sleeping/off = OTP service down.
- The "own IP reputation" path (direct SMTP on port 25 from your own IP) does **not** work from home connections — ISPs block port 25, IPs are usually dynamic/CGNAT, and reputation starts at zero. That path is only viable on a dedicated VPS after SPF/DKIM/DMARC + rDNS + warm-up work (see the deliverability checklist in `docs/DELIVERABILITY.md`).

Run the same stack anywhere:

```bash
docker compose up
```

---

## API

### `createEmail(config: ClientConfig): EmailClient`

| Config field | Meaning |
|---|---|
| `transport` | `console` / `smtp` / `resend` / `custom` |
| `from` | Default sender, e.g. `"MyApp <no-reply@myapp.com>"` |
| `appName` | Injected into templates as `{{app_name}}` |
| `otp` | `{ secret, length?, ttlSeconds?, maxAttempts?, cooldownSeconds?, store? }` |
| `quotaGuard` | `{ perEmailCooldownSeconds?, hourlyCap? }` |
| `templatesDir` | Folder of `.hbs` files to override/add templates |
| `baseUrl` | Injected as `{{base_url}}` into templates |

### `email.send(input: MessageInput): Promise<SendResult>`

```ts
//  send() NEVER throws:
type SendResult = { ok: true; id: string; }
                | { ok: false; error: { code; message; retryable } };
```

### `email.otp.send({ to, appName?, data? }): Promise<SendResult>`

Generates + stores a hashed code and delivers the OTP email. Cooldown to the same recipient returns `{ ok: false, error: { code: "otp_cooldown_active", retryable: true } }`.

### `email.otp.verify({ to, code }): Promise<VerifyResult>`

```ts
type VerifyResult =
  | { valid: true }
  | { valid: false; reason: "not_found" | "expired" | "too_many_attempts" | "invalid_code" | "missing_code";
      attemptsLeft?: number };
```

### Templates

Builtins: `otp`, `welcome`, `password-reset`. Override by placing same-named `.hbs` files in your `templatesDir`:

```hbs
{{!-- templatesDir/my-template.hbs --}}
<h1>Hi {{user_name}},</h1>
<p>Your code: {{otp_code}}</p>
```

Every render automatically produces a plain-text fallback from the HTML.

---

## Examples

See [`examples/express-otp.ts`](examples/express-otp.ts) for a complete drop-in login route (send-OTP → verify → JWT) using Express.

## Scripts

| Command | Does |
|---|---|
| `npm run demo` | Console-transport walkthrough (no credentials) |
| `npm test` | 33 vitest tests |
| `npm run build` | emits `dist/` |
| `npm run typecheck` | strict TS |

## Roadmap

- v2: HTTP sidecar API (`POST /emails`, `POST /otp`) + official Docker image — for PHP/Go/Python hosts
- v2: AWS SES, SendGrid, Postmark adapters
- v1.x: `doctor` CLI (SPF/DKIM/DMARC/blocklist checks for "own IP" senders)
- v3: bounced/delivered webhooks + magic links

## License

MIT
