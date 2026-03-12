/**
 * Full session verification for API route handlers (Node.js runtime).
 *
 * Middleware only verifies JWT signature/expiry (Edge Runtime — no Prisma).
 * This helper adds the DB check: tokenVersion and isActive.
 * Call this at the top of any API route that needs auth.
 *
 * Usage:
 *   const { session, error } = await verifySession();
 *   if (error) return error;  // NextResponse 401
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/auth";

type VerifyResult =
  | { session: SessionUser; error: null }
  | { session: null; error: NextResponse };

export async function verifySession(): Promise<VerifyResult> {
  const session = await getSession();

  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  // Enforce tokenVersion and isActive against live DB
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { tokenVersion: true, isActive: true, role: true },
  });

  if (!user) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!user.isActive) {
    return {
      session: null,
      error: NextResponse.json(
        { error: "Account suspended. Please contact support." },
        { status: 403 }
      ),
    };
  }

  if (user.tokenVersion !== session.tokenVersion) {
    return {
      session: null,
      error: NextResponse.json({ error: "Session expired. Please sign in again." }, { status: 401 }),
    };
  }

  // Return session with fresh role from DB (not stale JWT role)
  return { session: { ...session, role: user.role }, error: null };
}
