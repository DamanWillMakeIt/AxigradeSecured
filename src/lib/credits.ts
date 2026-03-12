/**
 * Credit limits per tool — set via Vercel env vars, no redeploy needed.
 *
 * CREDITS_ARCHITECT              (default: 25) — Architect script generation
 * CREDITS_ALGORITHM_WHISPERER    (default: 25) — SEO tags / Algorithm Whisperer
 * CREDITS_CLICK_ENGINEER         (default: 25) — Thumbnail generation
 * CREDITS_VISUAL_HOOK            (default: 25) — Video generation
 *
 * Quality Critic and Scene Modify have no credit system.
 * Scene Modify is limited to 3 modifications per scene instead.
 */

function getCredit(envKey: string, fallback = 25): number {
  const val = process.env[envKey];
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) || parsed < 0 ? fallback : parsed;
}

export const TOOL_CREDITS = {
  architect:          () => getCredit("CREDITS_ARCHITECT"),
  algorithmWhisperer: () => getCredit("CREDITS_ALGORITHM_WHISPERER"),
  clickEngineer:      () => getCredit("CREDITS_CLICK_ENGINEER"),
  visualHook:         () => getCredit("CREDITS_VISUAL_HOOK"),
} as const;
