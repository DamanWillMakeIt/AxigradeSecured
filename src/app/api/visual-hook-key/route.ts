import { NextResponse } from "next/server";
import { verifySession } from "@/lib/verify-session";
import { prisma } from "@/lib/prisma";
import { encrypt, safeDecrypt } from "@/lib/encryption";
import { TOOL_CREDITS } from "@/lib/credits";
import { randomBytes } from "crypto";

function generateKey(): string {
  return "vh_" + randomBytes(24).toString("hex");
}

export async function GET() {
  const { session, error } = await verifySession();
  if (error) return error;

  const record = await prisma.visualHookApiKey.findUnique({ where: { userId: session.id } });
  if (!record) return NextResponse.json({ api_key: null, credits: null, callCount: null });

  return NextResponse.json({
    api_key: safeDecrypt(record.key),
    credits: record.credits,
    callCount: record.callCount,
  });
}

// POST — auto-provisions a key if the user doesn't have one yet.
// Credits are only set on CREATE — never overwritten on subsequent calls.
export async function POST() {
  const { session, error } = await verifySession();
  if (error) return error;

  const existing = await prisma.visualHookApiKey.findUnique({ where: { userId: session.id } });

  if (existing) {
    return NextResponse.json({
      api_key: safeDecrypt(existing.key),
      credits: existing.credits,
      callCount: existing.callCount,
    });
  }

  const plainKey = generateKey();
  const encryptedKey = encrypt(plainKey);
  const defaultCredits = TOOL_CREDITS.visualHook();

  const record = await prisma.visualHookApiKey.create({
    data: { userId: session.id, key: encryptedKey, credits: defaultCredits, callCount: 0, isActive: true },
  });

  return NextResponse.json({
    api_key: plainKey,
    credits: record.credits,
    callCount: record.callCount,
  });
}

export async function DELETE() {
  const { session, error } = await verifySession();
  if (error) return error;

  await prisma.visualHookApiKey.delete({ where: { userId: session.id } }).catch(() => {});
  return NextResponse.json({ success: true });
}