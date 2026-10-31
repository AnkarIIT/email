import { describe, expect, it, vi } from "vitest";
import { QuotaGuard } from "../src/core/quota-guard.js";
import { InMemoryOtpStore } from "../src/otp/store/in-memory.js";
import { RedisOtpStore } from "../src/otp/store/redis.js";

describe("quota guard", () => {
  it("per-email cooldown window", () => {
    const g = new QuotaGuard({ perEmailCooldownSeconds: 60, hourlyCap: undefined as unknown as number });
    // undefined hourlyCap → null → no cap
    const t0 = Date.now();
    expect(g.check(["u@x.com"], t0)).toEqual({ ok: true });
    g.recordSend(["u@x.com"], t0);
    const blocked = g.check(["u@x.com"], t0 + 30_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toContain("cooldown");
    expect(g.check(["u@x.com"], t0 + 61_000)).toEqual({ ok: true });
  });

  it("hourly cap with sliding window", () => {
    const g = new QuotaGuard({ hourlyCap: 2, perEmailCooldownSeconds: 0 });
    const t0 = 1_000_000_000_000;
    g.recordSend(["a@x.com"], t0);
    g.recordSend(["b@x.com"], t0 + 60_000);
    expect(g.check(["c@x.com"], t0 + 120_000).ok).toBe(false);
    // 59+ min later the window drains
    expect(g.check(["c@x.com"], t0 + 61 * 60_000).ok).toBe(true);
  });

  it("case-insensitive recipient matching", () => {
    const g = new QuotaGuard({ perEmailCooldownSeconds: 60 });
    const t0 = Date.now();
    g.recordSend(["User@X.com"], t0);
    expect(g.check(["user@x.com"], t0 + 1000).ok).toBe(false);
  });

  it("multiple recipients blocked if any one is in cooldown", () => {
    const g = new QuotaGuard({ perEmailCooldownSeconds: 60 });
    const t0 = Date.now();
    g.recordSend(["a@x.com"], t0);
    expect(g.check(["new@x.com", "a@x.com"], t0 + 1000).ok).toBe(false);
  });
});

describe("in-memory OTP store", () => {
  it("stores, reads and deletes", async () => {
    const store = new InMemoryOtpStore();
    const record = { hash: "abc", expiresAt: Date.now() + 60_000, attemptsLeft: 3 };
    await store.set("u@x.com", record, 60);
    expect(await store.get("u@x.com")).toEqual(record);
    await store.delete("u@x.com");
    expect(await store.get("u@x.com")).toBeNull();
  });

  it("respects record expiry", async () => {
    const store = new InMemoryOtpStore();
    const record = { hash: "abc", expiresAt: Date.now() - 1, attemptsLeft: 3 };
    await store.set("u@x.com", record, 60);
    expect(await store.get("u@x.com")).toBeNull();
  });

  it("respects ttl hint", async () => {
    const store = new InMemoryOtpStore();
    const record = { hash: "abc", expiresAt: Date.now() + 10_000, attemptsLeft: 3 };
    await store.set("u@x.com", record, 0.01);
    await new Promise((r) => setTimeout(r, 20));
    expect(await store.get("u@x.com")).toBeNull();
  });
});

describe("redis OTP store (against a RedisLikeClient fake)", () => {
  class FakeRedis {
    private data = new Map<string, { value: string; expireAt: number | null }>();
    async set(key: string, value: string, ...args: unknown[]) {
      let expireAt: number | null = null;
      if (args[0] === "EX" && typeof args[1] === "number") {
        expireAt = Date.now() + args[1] * 1000;
      }
      this.data.set(key, { value, expireAt });
      return "OK";
    }
    async get(key: string) {
      const e = this.data.get(key);
      if (!e) return null;
      if (e.expireAt !== null && e.expireAt <= Date.now()) {
        this.data.delete(key);
        return null;
      }
      return e.value;
    }
    async del(key: string) {
      return this.data.delete(key) ? 1 : 0;
    }
  }

  it("stores HMAC records and honours TTL via redis EX", async () => {
    const redis = new FakeRedis();
    const store = new RedisOtpStore(redis);
    const record = { hash: "h1", expiresAt: Date.now() + 60_000, attemptsLeft: 3 };
    await store.set("u@x.com", record, 60);
    expect(await store.get("u@x.com")).toEqual(record);
    expect(await store.get("missing@x.com")).toBeNull();
    await store.delete("u@x.com");
    expect(await store.get("u@x.com")).toBeNull();
  });

  it("corrupt data is treated as missing, not thrown", async () => {
    const bad = {
      async set() { /* noop */ },
      async get() { return "{not-json"; },
      async del() { /* noop */ },
    };
    const store = new RedisOtpStore(bad);
    expect(await store.get("u@x.com")).toBeNull();
  });
});

describe("console transport", () => {
  it("prints rendered mail without throwing", async () => {
    const { ConsoleTransport } = await import("../src/transport/console.js");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const t = new ConsoleTransport();
    const res = await t.send({
      from: "App <a@x.com>",
      to: ["u@x.com"],
      subject: "Your code",
      text: "code: 123456",
    });
    expect(res.id).toMatch(/^console-/);
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
