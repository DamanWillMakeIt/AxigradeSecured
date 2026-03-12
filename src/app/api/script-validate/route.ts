import { NextResponse } from "next/server";
import { verifySession } from "@/lib/verify-session";
import { rateLimit } from "@/lib/rate-limit";

const VALIDATOR_URL = "https://scriptvalidator.onrender.com/api/v1/validate";
const MAX_SCENES = 100;  // Prevent DoS via excessive scene count

// Basic schema validation for scene objects
function isValidScene(scene: unknown): scene is Record<string, unknown> {
  if (!scene || typeof scene !== "object") return false;
  // Add more specific validation as needed based on your scene structure
  return true;
}

export async function POST(request: Request) {
  const { session, error } = await verifySession();
  if (error) return error;


  try {
    const body = await request.json();

    // Normalize: scenes may arrive nested or flat
    const scenes = body.scenes ?? body.script ?? [];

    if (!Array.isArray(scenes) || scenes.length === 0) {
      console.error("[script-validate] Missing or empty scenes. Body keys:", Object.keys(body));
      return NextResponse.json({ error: "scenes array is required" }, { status: 400 });
    }

    // Validate scene count to prevent DoS
    if (scenes.length > MAX_SCENES) {
      return NextResponse.json(
        { error: `Too many scenes (max ${MAX_SCENES}). Received ${scenes.length}` },
        { status: 400 }
      );
    }

    // Validate each scene object structure
    for (let i = 0; i < scenes.length; i++) {
      if (!isValidScene(scenes[i])) {
        return NextResponse.json(
          { error: `Invalid scene object at index ${i}` },
          { status: 400 }
        );
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let res: Response;
    try {
      res = await fetch(VALIDATOR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenes,
          tone: body.tone ?? "professional",
          topic: body.topic ?? "General",
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const data = await res.json();

    if (!res.ok) {
      console.error("[script-validate] Validator error:", res.status);
      return NextResponse.json(
        { error: `Validator API error ${res.status}` },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json({ error: "Validator timed out. The server may be waking up — try again." }, { status: 504 });
    }
    console.error("[script-validate] Proxy error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Proxy request failed" }, { status: 500 });
  }
}