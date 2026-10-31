import type { OtpRecord, OTPStore } from "../../core/types.js";

/**
 * Default store for quick starts and single-process dev. Data is lost on
 * restarts (by design of the interface contract — see RedisOtpStore for
 * production / Railway-Render-style auto-restarting platforms).
 */
export class InMemoryOtpStore implements OTPStore {
  private readonly entries = new Map<string, { record: OtpRecord; expiresAtMs: number }>();

  async set(key: string, value: OtpRecord, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { record: value, expiresAtMs: Date.now() + ttlSeconds * 1000 });
  }

  async get(key: string): Promise<OtpRecord | null> {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const now = Date.now();
    if (entry.record.expiresAt <= now || entry.expiresAtMs <= now) {
      this.entries.delete(key);
      return null;
    }
    return entry.record;
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  /** Test hook. */
  clear(): void {
    this.entries.clear();
  }
}
