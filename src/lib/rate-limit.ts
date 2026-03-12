/**
 * Production-grade rate limiter using Upstash Redis.
 *
 * Persistent across all serverless function instances and immune to cold starts.
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Singleton Redis instance — reused across all rate limit operations
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in environment variables. " +
        "Create a free Redis database at https://upstash.com and add the credentials to your .env"
      );
    }

    redis = new Redis({ url, token });
  }
  return redis;
}

/**
 * Rate limiter instances — one per limit type.
 * Uses sliding window algorithm for accurate rate limiting across all instances.
 */
const limiters = {
  login: new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(10, "15 m"),
    analytics: true,
    prefix: "ratelimit:login",
  }),
  register: new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(5, "1 h"),
    analytics: true,
    prefix: "ratelimit:register",
  }),
  sceneModify: new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(30, "1 h"),
    analytics: true,
    prefix: "ratelimit:scene-modify",
  }),
  xaiVideo: new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(10, "1 h"),
    analytics: true,
    prefix: "ratelimit:xai-video",
  }),
  thumbnail: new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(10, "1 h"),
    analytics: true,
    prefix: "ratelimit:thumbnail",
  }),
  architectGen: new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(20, "1 h"),
    analytics: true,
    prefix: "ratelimit:architect-gen",
  }),
  visualHook: new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(10, "1 h"),
    analytics: true,
    prefix: "ratelimit:visual-hook",
  }),
  algoWhisperer: new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(10, "1 h"),
    analytics: true,
    prefix: "ratelimit:algo-whisperer",
  }),
  keyGen: new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(10, "1 h"),
    analytics: true,
    prefix: "ratelimit:key-gen",
  }),
};

export type RateLimitType = keyof typeof limiters;

export async function rateLimit(
  type: RateLimitType,
  identifier: string
): Promise<{ allowed: boolean; retryAfterMs: number; limit: number; remaining: number }> {
  const limiter = limiters[type];
  const result = await limiter.limit(identifier);

  return {
    allowed: result.success,
    retryAfterMs: result.reset - Date.now(),
    limit: result.limit,
    remaining: result.remaining,
  };
}