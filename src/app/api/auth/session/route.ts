import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  // Only return fields the frontend actually needs — never expose tokenVersion or isActive
  return NextResponse.json({
    user: {
      id: session.id,
      name: session.name,
      email: session.email,
      role: session.role,
    },
  });
}