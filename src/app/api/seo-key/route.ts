import { TOOL_CREDITS } from "@/lib/credits";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/verify-session";
import { getMongoDb } from "@/lib/mongo"; // ← singleton, no per-request connect/close
import { encrypt, decrypt, safeDecrypt } from "@/lib/encryption";
import { rateLimit } from "@/lib/rate-limit";

const SEO_BASE = "https://serverless.on-demand.io/apps/generate-seotags";

type LiveKeyData = {
  key: string;
  credits: number;
  callCount: number;
  isActive: boolean;
} | null;

// Uses the shared singleton MongoClient — never opens a new connection per request
async function getLiveKeyDataByEmail(email: string): Promise<LiveKeyData> {
  try {
    const db = await getMongoDb("axigrade");
    const doc = await db
      .collection("api_keys")
      .findOne({ user_id: email.trim() });
    if (!doc) return null;
    return {
      key:       doc.key       as string,
      credits:   doc.credits   as number,
      callCount: (doc.call_count ?? doc.callCount ?? 0) as number,
      isActive:  (doc.is_active  ?? doc.isActive  ?? true) as boolean,
    };
  } catch {
    return null;
  }
}

// ── GET ───────────────────────────────────────────────────────────────────
export async function GET() {
  const { session, error } = await verifySession();
  if (error) return error;
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const live = await getLiveKeyDataByEmail(session.email);

  if (live) {
    const encryptedKey = encrypt(live.key);
    const seoKey = await prisma.seoApiKey.upsert({
      where: { userId: session.id },
      create: {
        userId:    session.id,
        key:       encryptedKey,  // Store encrypted
        agent:     "seo-tags",
        credits:   live.credits,
        callCount: live.callCount,
        isActive:  live.isActive,
      },
      update: {
        key:       encryptedKey,  // Store encrypted
        credits:   live.credits,
        callCount: live.callCount,
        isActive:  live.isActive,
      },
    });
    
    // Decrypt before returning to client
    return NextResponse.json({ 
      seoKey: {
        ...seoKey,
        key: safeDecrypt(seoKey.key),
      }
    });
  }

  const seoKey = await prisma.seoApiKey.findUnique({
    where: { userId: session.id },
  });
  
  if (!seoKey) {
    return NextResponse.json({ seoKey: null });
  }
  
  // Decrypt before returning to client
  return NextResponse.json({ 
    seoKey: {
      ...seoKey,
      key: safeDecrypt(seoKey.key),
    }
  });
}

// ── POST ──────────────────────────────────────────────────────────────────
export async function POST() {
  const { session, error } = await verifySession();
  if (error) return error;
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { allowed, retryAfterMs } = await rateLimit("keyGen", session.id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  const live = await getLiveKeyDataByEmail(session.email);

  if (live) {
    if (live.credits <= 0) {
      const encryptedKey = encrypt(live.key);
      await prisma.seoApiKey.upsert({
        where: { userId: session.id },
        create: { userId: session.id, key: encryptedKey, agent: "seo-tags", credits: 0, callCount: live.callCount, isActive: live.isActive },
        update: { key: encryptedKey, credits: 0, callCount: live.callCount, isActive: live.isActive },
      }).catch(() => {});
      return NextResponse.json(
        { error: "Credits exhausted. Please contact support to top up your account.", credits: 0 },
        { status: 402 }
      );
    }

    const encryptedKey = encrypt(live.key);
    const seoKey = await prisma.seoApiKey.upsert({
      where: { userId: session.id },
      create: { userId: session.id, key: encryptedKey, agent: "seo-tags", credits: live.credits, callCount: live.callCount, isActive: live.isActive },
      update: { key: encryptedKey, credits: live.credits, callCount: live.callCount, isActive: live.isActive },
    });
    
    return NextResponse.json({ 
      seoKey: {
        ...seoKey,
        key: safeDecrypt(seoKey.key),  // Decrypt before sending to client
      },
      message: "Existing key returned" 
    });
  }

  // No key at all — generate a fresh one
  const keyRes = await fetch(`${SEO_BASE}/seo/generate-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: session.email.trim() }),
  });

  const keyRaw = await keyRes.json().catch(() => ({}));

  if (!keyRes.ok) {
    if (keyRes.status === 409) {
      const recovered = await getLiveKeyDataByEmail(session.email);
      if (recovered) {
        const encryptedKey = encrypt(recovered.key);
        const seoKey = await prisma.seoApiKey.upsert({
          where: { userId: session.id },
          create: { userId: session.id, key: encryptedKey, agent: "seo-tags", credits: recovered.credits, callCount: recovered.callCount, isActive: recovered.isActive },
          update: { key: encryptedKey, credits: recovered.credits, callCount: recovered.callCount, isActive: recovered.isActive },
        });
        return NextResponse.json({ 
          seoKey: {
            ...seoKey,
            key: safeDecrypt(seoKey.key),
          },
          message: "Existing key recovered from API" 
        });
      }
    }
    return NextResponse.json(
      { error: `Key generation failed: ${keyRes.status}` },
      { status: keyRes.status }
    );
  }

  const freshLive = await getLiveKeyDataByEmail(session.email);
  const plainKey = freshLive?.key ?? keyRaw.key;
  const encryptedKey = encrypt(plainKey);
  
  const seoKey = await prisma.seoApiKey.upsert({
    where: { userId: session.id },
    create: {
      userId:    session.id,
      key:       encryptedKey,  // Store encrypted
      agent:     keyRaw.agent         ?? "seo-tags",
      credits:   freshLive?.credits   ?? keyRaw.credits   ?? TOOL_CREDITS.algorithmWhisperer(),
      callCount: freshLive?.callCount ?? keyRaw.call_count ?? 0,
      isActive:  freshLive?.isActive  ?? true,
    },
    update: {
      key:       encryptedKey,  // Store encrypted
      credits:   freshLive?.credits   ?? keyRaw.credits   ?? TOOL_CREDITS.algorithmWhisperer(),
      callCount: freshLive?.callCount ?? keyRaw.call_count ?? 0,
      isActive:  freshLive?.isActive  ?? true,
    },
  });

  return NextResponse.json({ 
    seoKey: {
      ...seoKey,
      key: safeDecrypt(seoKey.key),  // Decrypt before sending to client
    },
    message: "Key generated successfully" 
  });
}