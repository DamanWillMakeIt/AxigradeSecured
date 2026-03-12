import { NextResponse } from "next/server";
import { verifySession } from "@/lib/verify-session";

// Maximum video size to proxy — prevents bandwidth abuse and function timeouts
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB

export async function GET(request: Request) {
  const { session, error } = await verifySession();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) return NextResponse.json({ error: "Missing url param" }, { status: 400 });

  // SSRF guard — only proxy from known xAI video domains
  let parsed: URL;
  try { parsed = new URL(url); }
  catch { return NextResponse.json({ error: "Invalid URL" }, { status: 400 }); }

  // Narrowed allowlist — reject overly broad storage.googleapis.com, only allow specific subdomains
  const ALLOWED_HOSTS = [
    "vidgen.x.ai",
    "cdn.x.ai",
    // Only allow xAI's specific GCS buckets, not all of storage.googleapis.com
    "storage.googleapis.com/xai-video-outputs",
    "storage.googleapis.com/xai-cdn",
  ];
  
  const isAllowed = ALLOWED_HOSTS.some(h => {
    // Exact match for specific bucket paths
    if (h.includes('/')) {
      return url.startsWith(`https://${h}`);
    }
    // Domain/subdomain match
    return parsed.hostname === h || parsed.hostname.endsWith("." + h);
  });

  if (!isAllowed) {
    return NextResponse.json({ error: "Domain not allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!upstream.ok) return NextResponse.json({ error: `Upstream ${upstream.status}` }, { status: 502 });

    const contentLength = upstream.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_VIDEO_BYTES) {
      return NextResponse.json({ error: "Video too large to proxy (max 100 MB)" }, { status: 413 });
    }

    const contentType = upstream.headers.get("content-type") ?? "video/mp4";
    const body = upstream.body;
    if (!body) return NextResponse.json({ error: "Empty upstream body" }, { status: 502 });

    // Stream with size cap — abort if stream exceeds limit
    let bytesRead = 0;
    const reader = body.getReader();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            bytesRead += value.length;
            if (bytesRead > MAX_VIDEO_BYTES) {
              controller.error(new Error("Video size limit exceeded"));
              await reader.cancel();
              break;
            }

            controller.enqueue(value);
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Proxy failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}