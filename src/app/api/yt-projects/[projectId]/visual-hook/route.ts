import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/verify-session";
import { rateLimit } from "@/lib/rate-limit";
import { createHash } from "crypto";

const XAI_VIDEO_BASE = "https://serverless.on-demand.io/apps/xai-video";
const MAX_DATA_BYTES = 500 * 1024;

const CLOUDINARY_CLOUD      = process.env.CLOUDINARY_CLOUD_NAME!;
const CLOUDINARY_API_KEY    = process.env.CLOUDINARY_API_KEY!;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET!;

type RouteParams = { params: { projectId: string } };

async function uploadToCloudinary(base64Data: string, mimeType: string, userId: string): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const folder    = `xai_video_refs/${userId}`;
  const sig       = createHash("sha1").update(`folder=${folder}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`).digest("hex");
  const form      = new FormData();
  form.append("file",      `data:${mimeType};base64,${base64Data}`);
  form.append("api_key",   CLOUDINARY_API_KEY);
  form.append("timestamp", timestamp);
  form.append("folder",    folder);
  form.append("signature", sig);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status})`);
  const data = await res.json();
  return data.secure_url as string;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { session, error } = await verifySession();
  if (error) return error;

  const project = await prisma.project.findFirst({ where: { id: params.projectId, userId: session.id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    const doc = await prisma.visualHook.findUnique({ where: { projectId: project.id } });
    return NextResponse.json({ document: doc ?? null });
  }

  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(jobId)) {
    return NextResponse.json({ error: "Invalid jobId" }, { status: 400 });
  }
  const xaiApiKey = request.headers.get("x-xai-key");
  if (!xaiApiKey) return NextResponse.json({ error: "Missing x-xai-key header" }, { status: 400 });

  try {
    const pollRes = await fetch(`${XAI_VIDEO_BASE}/status/${jobId}`, {
      headers: { "x-api-key": xaiApiKey },
    });
    const pollData = await pollRes.json();
    return NextResponse.json(pollData);
  } catch {
    return NextResponse.json({ status: "processing" });
  }
}

export async function POST(request: Request, { params }: RouteParams) {
  const { session, error } = await verifySession();
  if (error) return error;

  const { allowed, retryAfterMs } = await rateLimit("visualHook", session.id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait before generating another video." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  // Load Visual Hook Axigrade key + check credits
  const vhKey = await prisma.visualHookApiKey.findUnique({ where: { userId: session.id } });
  if (!vhKey?.key) {
    return NextResponse.json({ error: "No Visual Hook API key found. Please add your Axigrade key first." }, { status: 400 });
  }
  if (vhKey.credits <= 0) {
    return NextResponse.json({ error: "You have no Visual Hook credits remaining. Please contact support." }, { status: 402 });
  }

  const project = await prisma.project.findFirst({ where: { id: params.projectId, userId: session.id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await request.json();
  const xaiApiKey: string | undefined = body?.xaiApiKey;
  const { prompt, model, image } = body as {
    prompt: string;
    model?: "veo3" | "grok";
    image?: { base64: string; mimeType: string };
  };

  if (!xaiApiKey) return NextResponse.json({ error: "xAI API key is required" }, { status: 400 });
  if (!prompt?.trim()) return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  if (prompt.length > 2000) return NextResponse.json({ error: "Prompt too long (max 2000 chars)" }, { status: 400 });

  const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  if (image) {
    if (!image.base64 || !image.mimeType) return NextResponse.json({ error: "Image must have base64 and mimeType" }, { status: 400 });
    if (!ALLOWED_MIME.has(image.mimeType)) return NextResponse.json({ error: "Unsupported image type. Use JPEG, PNG, WebP or GIF." }, { status: 400 });
    if (image.base64.length > 10 * 1024 * 1024) return NextResponse.json({ error: "Image too large (max ~7.5 MB)" }, { status: 413 });
  }

  try {
    let imageUrl: string | undefined;
    if (image) imageUrl = await uploadToCloudinary(image.base64, image.mimeType, session.id);

    const payload: Record<string, unknown> = { prompt: prompt.trim(), model: model ?? "veo3" };
    if (imageUrl) payload.image_url = imageUrl;

    const res = await fetch(`${XAI_VIDEO_BASE}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": xaiApiKey },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ error: `Video generation failed: ${res.status}` }, { status: res.status });
    }

    // Deduct credit on success
    await prisma.visualHookApiKey.update({
      where: { userId: session.id },
      data: { credits: { decrement: 1 }, callCount: { increment: 1 } },
    }).catch(() => {});

    return NextResponse.json({ ...data, cloudinary_ref_url: imageUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Video generation failed";
    console.error("[VisualHook] generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  const { session, error } = await verifySession();
  if (error) return error;

  const project = await prisma.project.findFirst({ where: { id: params.projectId, userId: session.id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_DATA_BYTES) {
    return NextResponse.json({ error: "Payload too large (max 500 KB)" }, { status: 413 });
  }

  let body: { data?: unknown };
  try { body = JSON.parse(raw); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const doc = await prisma.visualHook.upsert({
    where: { projectId: project.id },
    create: { projectId: project.id, data: (body?.data as object) ?? {} },
    update: { data: (body?.data as object) ?? {} },
  });
  return NextResponse.json({ document: doc });
}
