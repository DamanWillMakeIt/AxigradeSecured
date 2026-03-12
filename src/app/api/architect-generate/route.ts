import { NextResponse } from "next/server";
import { verifySession } from "@/lib/verify-session";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { safeDecrypt } from "@/lib/encryption";

const BASE = "https://serverless.on-demand.io/apps/script/api/v1";
const JOB_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export async function POST(request: Request) {
  const { session, error } = await verifySession();
  if (error) return error;

  const { allowed, retryAfterMs } = await rateLimit("architectGen", session.id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait before generating again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const keyRecord = await prisma.architectApiKey.findUnique({ where: { userId: session.id } });
  if (!keyRecord?.key) {
    return NextResponse.json({ error: "No API key found. Generate one first." }, { status: 400 });
  }

  if (keyRecord.credits <= 0) {
    return NextResponse.json(
      { error: "You have no Architect credits remaining. Please contact support to top up." },
      { status: 402 }
    );
  }

  const apiKey = safeDecrypt(keyRecord.key);

  const body = await request.json();
  const { apiKey: _ignored, ...payload } = body as { apiKey?: string; [k: string]: unknown };

  try {
    const res = await fetch(`${BASE}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        await prisma.architectApiKey.delete({ where: { userId: session.id } }).catch(() => {});
      }
      console.error("[architect-generate] API error:", res.status, data);
      return NextResponse.json({ error: `Generate API error ${res.status}` }, { status: res.status });
    }

    // Deduct credit only on success
    await prisma.architectApiKey.update({
      where: { userId: session.id },
      data: { credits: { decrement: 1 }, callCount: { increment: 1 } },
    }).catch(() => {});

    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const { session, error } = await verifySession();
  if (error) return error;

  const keyRecord = await prisma.architectApiKey.findUnique({ where: { userId: session.id } });
  if (!keyRecord?.key) {
    return NextResponse.json({ error: "No API key found." }, { status: 400 });
  }
  const apiKey = safeDecrypt(keyRecord.key);

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  if (!JOB_ID_RE.test(jobId)) return NextResponse.json({ error: "Invalid jobId format" }, { status: 400 });

  try {
    const res = await fetch(`${BASE}/status/${jobId}`, {
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Status check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
