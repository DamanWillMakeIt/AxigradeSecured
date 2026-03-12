import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { verifySession } from "@/lib/verify-session";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: NextRequest) {
  const { session, error } = await verifySession();
  if (error) return error;
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 thumbnail generations per user per hour
  const { allowed, retryAfterMs } = await rateLimit("thumbnail", session.id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit reached. Please wait before generating another thumbnail." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  // Load Click Engineer Axigrade key + check credits
  const ceKey = await prisma.clickEngineerApiKey.findUnique({ where: { userId: session.id } });
  if (!ceKey?.key) {
    return NextResponse.json({ error: "No Click Engineer API key found. Please add your Axigrade key first." }, { status: 400 });
  }
  if (ceKey.credits <= 0) {
    return NextResponse.json({ error: "You have no Click Engineer credits remaining. Please contact support." }, { status: 402 });
  }

  try {
    const formData = await req.formData();

    const image      = formData.get("image")      as File | null;
    const videoTitle = formData.get("videoTitle") as string | null;
    const summary    = formData.get("summary")    as string | null;
    const prompt     = formData.get("prompt")     as string | null;

    if (!image)      return NextResponse.json({ error: "Reference image is required" }, { status: 400 });
    if (!videoTitle) return NextResponse.json({ error: "Video title is required" }, { status: 400 });
    if (!prompt)     return NextResponse.json({ error: "Prompt is required" }, { status: 400 });

    // Input length limits
    if (videoTitle.length > 200) return NextResponse.json({ error: "Video title too long (max 200 chars)" }, { status: 400 });
    if (prompt.length > 1000)    return NextResponse.json({ error: "Prompt too long (max 1000 chars)" }, { status: 400 });

    // Per-user Cloudinary folder — isolates user uploads
    const userFolder = `axigrade-thumbnails/${session.id}`;

    const bytes = await image.arrayBuffer();

    // Reject images over 10 MB before uploading to Cloudinary
    const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image too large (max 10 MB)" }, { status: 413 });
    }

    const base64Image = Buffer.from(bytes).toString("base64");

    const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
      cloudinary.uploader.upload(
        `data:${image.type};base64,${base64Image}`,
        { folder: userFolder, resource_type: "image" },
        (error, result) => {
          if (error || !result) reject(error ?? new Error("Upload returned no result"));
          else resolve(result as { secure_url: string });
        }
      );
    });

    const cloudinaryUrl = uploadResult.secure_url;

    const aiPrompt = [
      summary ? `Summary: ${summary}` : "",
      `Task: ${prompt}`,
    ].filter(Boolean).join("\n\n");

    // Call the thumbnail generation service
    const genResponse = await fetch("https://thumbnailgenerator-8k3s.onrender.com/thumbnail/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: cloudinaryUrl,
        video_title: videoTitle,
        prompt: aiPrompt,
      }),
    });

    if (!genResponse.ok) {
      return NextResponse.json(
        { error: `Thumbnail generation service returned status ${genResponse.status}` },
        { status: genResponse.status }
      );
    }

    const genData = await genResponse.json();
    const thumbnailUrl = genData.thumbnail_url ?? null;

    // Deduct credit on success
    await prisma.clickEngineerApiKey.update({
      where: { userId: session.id },
      data: { credits: { decrement: 1 }, callCount: { increment: 1 } },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      cloudinaryUrl,
      thumbnailUrl,
      videoTitle,
      summary,
    });
  } catch (error: unknown) {
    // Never log the full error object — it might contain the API key in a stack trace
    const message = error instanceof Error ? error.message : "Failed to generate thumbnail";
    console.error("Thumbnail generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}