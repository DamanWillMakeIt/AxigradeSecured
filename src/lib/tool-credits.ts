/**
 * tool-credits.ts
 * Credit helpers for Architect and Algorithm Whisperer only.
 * Visual Hook and Click Engineer use their own DB key records directly.
 * Quality Critic and Scene Modify have no credit system.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TOOL_CREDITS } from "@/lib/credits";

type CreditedTool = "architect" | "algorithmWhisperer";

const CREDIT_DEFAULTS: Record<CreditedTool, () => number> = {
  architect:          TOOL_CREDITS.architect,
  algorithmWhisperer: TOOL_CREDITS.algorithmWhisperer,
};

function toolLabel(tool: CreditedTool): string {
  return tool === "architect" ? "Architect" : "Algorithm Whisperer";
}

async function findRecord(tool: CreditedTool, userId: string): Promise<{ credits: number } | null> {
  if (tool === "architect") {
    return prisma.architectApiKey.findUnique({ where: { userId }, select: { credits: true } });
  }
  return prisma.seoApiKey.findUnique({ where: { userId }, select: { credits: true } });
}

export async function checkCredits(
  tool: CreditedTool,
  userId: string
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const record = await findRecord(tool, userId);

  if (!record) {
    await provisionCredits(tool, userId);
    return { ok: true };
  }

  if (record.credits <= 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `You have no ${toolLabel(tool)} credits remaining. Please contact support.` },
        { status: 402 }
      ),
    };
  }

  return { ok: true };
}

export async function deductCredit(tool: CreditedTool, userId: string): Promise<void> {
  if (tool === "architect") {
    await prisma.architectApiKey.update({
      where: { userId },
      data: { credits: { decrement: 1 }, callCount: { increment: 1 } },
    }).catch(() => {});
  } else {
    await prisma.seoApiKey.update({
      where: { userId },
      data: { credits: { decrement: 1 }, callCount: { increment: 1 } },
    }).catch(() => {});
  }
}

export async function provisionCredits(tool: CreditedTool, userId: string): Promise<void> {
  const defaultCredits = CREDIT_DEFAULTS[tool]();
  if (tool === "architect") {
    await prisma.architectApiKey.upsert({
      where: { userId },
      create: { userId, key: "provisioned", credits: defaultCredits, callCount: 0, isActive: true },
      update: {},
    }).catch(() => {});
  } else {
    await prisma.seoApiKey.upsert({
      where: { userId },
      create: { userId, key: "provisioned", agent: "seo-tags", credits: defaultCredits, callCount: 0, isActive: true },
      update: {},
    }).catch(() => {});
  }
}
