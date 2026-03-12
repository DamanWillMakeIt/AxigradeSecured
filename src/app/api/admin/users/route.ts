import { NextResponse } from "next/server";
import { verifySession } from "@/lib/verify-session";
import { prisma } from "@/lib/prisma";

// PATCH /api/admin/users — update user role, suspend account, or revoke tokens
export async function PATCH(request: Request) {
  const { session, error } = await verifySession();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const { 
      userId, 
      role, 
      isActive, 
      revokeTokens 
    } = body as { 
      userId?: string; 
      role?: string; 
      isActive?: boolean;
      revokeTokens?: boolean;
    };

    if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

    // Build update data object
    const updateData: Record<string, unknown> = {};

    // Update role if provided
    if (role !== undefined) {
      if (!["user", "admin"].includes(role)) {
        return NextResponse.json({ error: "role must be 'user' or 'admin'" }, { status: 400 });
      }
      // Prevent self-demotion
      if (userId === session.id && role !== "admin") {
        return NextResponse.json({ error: "Cannot remove your own admin role" }, { status: 400 });
      }
      updateData.role = role;
      
      // When role changes, increment tokenVersion to invalidate existing sessions
      updateData.tokenVersion = { increment: 1 };
    }

    // Update account status if provided
    if (isActive !== undefined) {
      // Prevent self-suspension
      if (userId === session.id && !isActive) {
        return NextResponse.json({ error: "Cannot suspend your own account" }, { status: 400 });
      }
      updateData.isActive = isActive;
      
      // When suspending, also revoke tokens
      if (!isActive) {
        updateData.tokenVersion = { increment: 1 };
      }
    }

    // Revoke all user's tokens if requested
    if (revokeTokens === true) {
      if (userId === session.id) {
        return NextResponse.json({ error: "Cannot revoke your own tokens" }, { status: 400 });
      }
      updateData.tokenVersion = { increment: 1 };
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { 
        id: true, 
        name: true, 
        email: true, 
        role: true, 
        isActive: true,
        tokenVersion: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ user: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update user";
    // Prisma throws P2025 when record not found — surface a clean 404
    if (message.includes("Record to update not found")) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("[admin/users PATCH]", message);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

// DELETE /api/admin/users?id=xxx — delete a user and all their data
export async function DELETE(request: Request) {
  const { session, error } = await verifySession();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("id");
    if (!userId) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (userId === session.id) return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });

    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete user";
    if (message.includes("Record to delete does not exist")) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("[admin/users DELETE]", message);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
