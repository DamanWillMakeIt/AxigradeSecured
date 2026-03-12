import { TOOL_CREDITS } from "@/lib/credits";
import { NextResponse } from "next/server";
import { verifySession } from "@/lib/verify-session";
import { prisma } from "@/lib/prisma";
import { encrypt, safeDecrypt } from "@/lib/encryption";
import { rateLimit } from "@/lib/rate-limit";

const SCRIPT_API  = "https://serverless.on-demand.io/apps/script/api/v1/auth/generate-key";
const SCRIPT_BASE = "https://serverless.on-demand.io/apps/script/api/v1";

function extractKey(data: Record<string, unknown>): string | null {
  return (
    (data.api_key as string) ||
    (data.key as string) ||
    (data.token as string) ||
    ((data.data as Record<string, unknown>)?.api_key as string) ||
    ((data.data as Record<string, unknown>)?.key as string) ||
    ((data.data as Record<string, unknown>)?.token as string) ||
    ((data.result as Record<string, unknown>)?.api_key as string) ||
    ((data.result as Record<string, unknown>)?.key as string) ||
    null
  );
}

async function isKeyValid(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(`${SCRIPT_BASE}/status/ping`, {
      method: "GET",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    });
    return res.status !== 401;
  } catch {
    return true;
  }
}

async function fetchExistingKey(email: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${SCRIPT_BASE}/auth/key?user_id=${encodeURIComponent(email.trim())}`,
      { method: "GET", headers: { "Content-Type": "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return extractKey(data);
  } catch {
    return null;
  }
}

export async function GET() {
  const { session, error } = await verifySession();
  if (error) return error;

  const record = await prisma.architectApiKey.findUnique({ where: { userId: session.id } });
  if (!record) return NextResponse.json({ api_key: null, credits: null, callCount: null });

  return NextResponse.json({
    api_key: safeDecrypt(record.key),
    credits: record.credits,
    callCount: record.callCount,
  });
}

export async function POST(request: Request) {
  const { session, error } = await verifySession();
  if (error) return error;

  const { allowed, retryAfterMs } = await rateLimit("keyGen", session.id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const force = body?.force === true;

  const existing = await prisma.architectApiKey.findUnique({ where: { userId: session.id } });

  if (existing?.key && !force) {
    return NextResponse.json({ api_key: safeDecrypt(existing.key) });
  }

  if (existing?.key && force) {
    const decryptedKey = safeDecrypt(existing.key);
    const valid = await isKeyValid(decryptedKey);
    if (valid) return NextResponse.json({ api_key: decryptedKey });
    await prisma.architectApiKey.delete({ where: { userId: session.id } }).catch(() => {});
  }

  try {
    const res = await fetch(SCRIPT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: session.email.trim() }),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok || res.status === 409) {
      let apiKey = extractKey(data);

      // 409 = key exists on their server but not in response body - fetch directly
      if (!apiKey && res.status === 409) {
        apiKey = await fetchExistingKey(session.email);
      }

      if (apiKey) {
        const encryptedKey = encrypt(apiKey);
        await prisma.architectApiKey.upsert({
          where: { userId: session.id },
          create: { userId: session.id, key: encryptedKey, credits: TOOL_CREDITS.architect(), callCount: 0, isActive: true },
          update: { key: encryptedKey, isActive: true },
        });
        return NextResponse.json({ api_key: apiKey });
      }

      console.error("[architect-key] 409 but no key found in response.");
      return NextResponse.json(
        { error: "Key already exists on server but could not be retrieved. Please contact support." },
        { status: 500 }
      );
    }

    console.error("[architect-key] External API error:", res.status);
    return NextResponse.json({ error: `External API returned ${res.status}` }, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate API key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const { session, error } = await verifySession();
  if (error) return error;

  await prisma.architectApiKey.delete({ where: { userId: session.id } }).catch(() => {});
  return NextResponse.json({ success: true });
}