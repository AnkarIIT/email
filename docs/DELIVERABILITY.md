# Deliverability checklist (the honest version)

Use this when **you** want to own the sending path (your own VPS IP) instead of
riding on a transactional provider. Only viable on a **dedicated VPS with a
static IP** — impossible on Vercel/Render/shared hosting and home connections.

## Pre-flight

- [ ] **Static, dedicated IP** on the VPS (Hetzner/DO/Lightsail all offer one).
- [ ] **Port 25 unblock** — all major clouds block it by default; request removal
      (Hetzner usually grants it after a short form; AWS SES users don't need this).
- [ ] **PTR / rDNS record** — set the server IP's reverse DNS to your mail hostname
      (`mail.yourdomain.com`). Missing PTR = instant spam classification.
- [ ] **Blocklist check** — the IP may be pre-blacklisted (it was on a previous
      tenant). Check mxtoolbox.com / Spamhaus before you start.

## DNS records (on your domain)

| Record | Example value |
|---|---|
| `A` | `mail.yourdomain.com` → your VPS IP |
| `MX` | `yourdomain.com` → `mail.yourdomain.com` (only if receiving) |
| **SPF** (TXT) | `v=spf1 mx a ip4:YOUR_VPS_IP ~all` |
| **DKIM** (TXT) | generated keys from your mail stack (`s1._domainkey.yourdomain.com`) |
| **DMARC** (TXT) | `_dmarc` → `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com` |

## Run a mail stack (or just use localhost relay)

- [Postfix](https://www.postfix.org/) classic,
  [Postal](https://postalserver.io/) full-featured,
  [Maddy](https://maddy.email/) single-binary — all present an SMTP interface on
  the VPS; mailkey connects to it exactly like any other relay:

```ts
transport: { type: "smtp", host: "localhost", port: 25 /* or 587 */ }
```

## Warm-up (this is where most self-hosters fail)

- [ ] Week 1–2: send **tens** per day, gradually ramp.
- [ ] Watch Gmail Postmaster Tools (free) for reputation.
- [ ] Monitor bounce rate; > 2–3 % hard bounces tanks reputation.
- [ ] Keep OTP emails in the **inbox** — test every major provider
      (Gmail, Outlook, Yahoo) before shipping.

## When it goes wrong

 Reputation problems self-inflict on *everything* you send. If OTP emails
 start landing in spam, users see "code not received" — that's worse than
 downtime. That's the engineering trade-off: convenience + reputation vs
 absolute ownership. Many teams start on Resend/SES and migrate to self-hosted
 later with prepaid monitoring.
