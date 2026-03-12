import { NextResponse } from "next/server";
import { verifySession } from "@/lib/verify-session";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const MAX_MODS_PER_SCENE = 3;

const MAX_INSTRUCTION_LEN = 500;
const MAX_DIALOGUE_LEN    = 10000;
const MAX_VEO_PROMPT_LEN  = 2000;
const MAX_SHOOT_INSTR_LEN = 2000;

export async function POST(request: Request) {
  const { session, error } = await verifySession();
  if (error) return error;

  const { allowed, retryAfterMs } = await rateLimit("sceneModify", session.id);
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many modifications. Please wait before trying again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } }
    );
  }

  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured on server" }, { status: 500 });
  }

  const body = await request.json();
  const { instruction, currentDialogue, currentVeoPrompt, shootInstructions, sceneNumber, projectId } = body as {
    instruction: string;
    currentDialogue: string;
    currentVeoPrompt: string;
    shootInstructions: string;
    sceneNumber: number;
    projectId: string;
  };

  if (!instruction?.trim()) return NextResponse.json({ error: "Missing instruction" }, { status: 400 });
  if (!projectId) return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  if (typeof sceneNumber !== "number") return NextResponse.json({ error: "Missing sceneNumber" }, { status: 400 });

  if (instruction.length > MAX_INSTRUCTION_LEN)
    return NextResponse.json({ error: `Instruction too long (max ${MAX_INSTRUCTION_LEN} chars)` }, { status: 400 });
  if (currentDialogue && currentDialogue.length > MAX_DIALOGUE_LEN)
    return NextResponse.json({ error: `Dialogue too long (max ${MAX_DIALOGUE_LEN} chars)` }, { status: 400 });
  if (currentVeoPrompt && currentVeoPrompt.length > MAX_VEO_PROMPT_LEN)
    return NextResponse.json({ error: `VEO prompt too long (max ${MAX_VEO_PROMPT_LEN} chars)` }, { status: 400 });
  if (shootInstructions && shootInstructions.length > MAX_SHOOT_INSTR_LEN)
    return NextResponse.json({ error: `Shoot instructions too long (max ${MAX_SHOOT_INSTR_LEN} chars)` }, { status: 400 });

  // Verify project belongs to this user
  const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // Check per-scene modification limit
  const usage = await prisma.sceneModifyUsage.findUnique({
    where: { projectId_sceneNumber: { projectId, sceneNumber } },
  });

  if (usage && usage.useCount >= MAX_MODS_PER_SCENE) {
    return NextResponse.json(
      { error: `Scene ${sceneNumber} has reached the maximum of ${MAX_MODS_PER_SCENE} modifications.` },
      { status: 402 }
    );
  }

  const systemPrompt = `You are a professional video script writer and cinematographer. 
You will be given a scene's script dialogue, VEO video generation prompt, and shoot instructions.
Apply the user's requested changes and return ONLY a JSON object with this exact shape:
{
  "dialogue": "<updated script dialogue>",
  "veo_prompt": "<updated veo generation prompt>"
}
Do not include any explanation, markdown, or extra text. Only raw JSON.`;

  const userMessage = `Scene ${sceneNumber} — Apply this change: "${instruction}"

Current Script Dialogue:
${currentDialogue}

Current VEO Generation Prompt:
${currentVeoPrompt}

Shoot Instructions (for context only, do not modify):
${shootInstructions}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      console.error("[scene-modify] Gemini API error:", res.status);
      return NextResponse.json({ error: `Gemini API error ${res.status}` }, { status: res.status });
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = rawText.replace(/```json|```/g, "").trim();

    let parsed: { dialogue: string; veo_prompt: string };
    try {
      parsed = JSON.parse(clean);
    } catch {
      return NextResponse.json({ error: "Gemini returned an unexpected response format. Please try again." }, { status: 500 });
    }

    if (!parsed.dialogue || !parsed.veo_prompt) {
      return NextResponse.json({ error: "Gemini response was incomplete. Please try again." }, { status: 500 });
    }

    // Increment usage count on success
    await prisma.sceneModifyUsage.upsert({
      where: { projectId_sceneNumber: { projectId, sceneNumber } },
      create: { projectId, sceneNumber, useCount: 1 },
      update: { useCount: { increment: 1 } },
    });

    const newCount = (usage?.useCount ?? 0) + 1;

    return NextResponse.json({
      dialogue: parsed.dialogue,
      veo_prompt: parsed.veo_prompt,
      modificationsUsed: newCount,
      modificationsRemaining: MAX_MODS_PER_SCENE - newCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Scene modification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET — check remaining modifications for a scene
export async function GET(request: Request) {
  const { session, error } = await verifySession();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const sceneNumber = parseInt(searchParams.get("sceneNumber") ?? "", 10);

  if (!projectId || isNaN(sceneNumber)) {
    return NextResponse.json({ error: "Missing projectId or sceneNumber" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.id } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const usage = await prisma.sceneModifyUsage.findUnique({
    where: { projectId_sceneNumber: { projectId, sceneNumber } },
  });

  const used = usage?.useCount ?? 0;
  return NextResponse.json({
    sceneNumber,
    modificationsUsed: used,
    modificationsRemaining: Math.max(0, MAX_MODS_PER_SCENE - used),
    maxModifications: MAX_MODS_PER_SCENE,
  });
}