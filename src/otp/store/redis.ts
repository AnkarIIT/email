import type { OtpRecord, OTPStore } from "../../core/types.js";

/** Minimal shape we need — satisfied by an ioredis instance. */
export interface RedisLikeClient {
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
}

/**
 * Production store: survives restarts and works across workers.
 * Pass any ioredis-compatible client (ioredis, node-redis v4 with .set/.get/.del).
 *
 *   npm install ioredis   # peer dependency
 *   store: new RedisOtpStore(new Redis(process.env.REDIS_URL))
 *
 * Every instance that shares the same Redis sees the same OTPs, so codes
 * survive platform restarts (Railway/Render redeploy / sleep) and work
 * with horizontally scaled backends.
 */
export class RedisOtpStore implements OTPStore {
  constructor(private readonly client: RedisLikeClient, private readonly prefix = "mailkey:otp:") {}

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  async set(key: string, value: OtpRecord, ttlSeconds: number): Promise<void> {
    await this.client.set(this.key(key), JSON.stringify(value), "EX", Math.max(1, Math.ceil(ttlSeconds)));
  }

  async get(key: string): Promise<OtpRecord | null> {
    const raw = await this.client.get(this.key(key));
    if (!raw) return null;
    try {
      const record = JSON.parse(raw) as OtpRecord;
      if (!record || typeof record.hash !== "string") return null;
      // Defensive: also honour the record's own expiry.
      if (record.expiresAt <= Date.now()) {
        await this.delete(key);
        return null;
      }
      return record;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.key(key));
  }
}
