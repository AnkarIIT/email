import type { QuotaGuardConfig } from "./types.js";

/**
 * Protects the developer's provider free-tier from accidental burns
 * (a runaway loop can eat a 100/day quota in minutes) and adds a basic
 * resend cooldown per recipient.
 *
 * State lives in-process by design: it is a guard, not an audit log.
 */
export class QuotaGuard {
  private readonly perEmailCooldownMs: number;
  private readonly hourlyCap: number | null;
  private readonly lastSentAt = new Map<string, number>();
  private recentSendTimes: number[] = [];

  constructor(config: QuotaGuardConfig = {}) {
    this.perEmailCooldownMs = (config.perEmailCooldownSeconds ?? 60) * 1000;
    this.hourlyCap = config.hourlyCap ?? null;
  }

  /** Returns a rejection reason, or null when the send may proceed. */
  check(recipients: readonly string[], now = Date.now()): { ok: true } | { ok: false; reason: string } {
    if (this.hourlyCap !== null) {
      this.pruneHourly(now);
      if (this.recentSendTimes.length >= this.hourlyCap) {
        return { ok: false, reason: `hourly cap of ${this.hourlyCap} sends reached` };
      }
    }

    if (this.perEmailCooldownMs > 0) {
      for (const email of recipients) {
        const last = this.lastSentAt.get(email.toLowerCase());
        if (last !== undefined && now - last < this.perEmailCooldownMs) {
          const waitSeconds = Math.ceil((this.perEmailCooldownMs - (now - last)) / 1000);
          return { ok: false, reason: `cooldown active for ${email} — retry in ${waitSeconds}s` };
        }
      }
    }

    return { ok: true };
  }

  /** Call only after a successful send. */
  recordSend(recipients: readonly string[], now = Date.now()): void {
    for (const email of recipients) {
      this.lastSentAt.set(email.toLowerCase(), now);
    }
    this.recentSendTimes.push(now);
  }

  /** Test hook. */
  reset(): void {
    this.lastSentAt.clear();
    this.recentSendTimes = [];
  }

  private pruneHourly(now: number): void {
    const oneHourAgo = now - 60 * 60 * 1000;
    this.recentSendTimes = this.recentSendTimes.filter((t) => t > oneHourAgo);
  }
}
