import { Router } from "express";
import { z } from "zod";
import { optionalAuth } from "../middlewares/auth.js";
import { stmts } from "../lib/vidsnap-db.js";

const router = Router();

// Rate limit: simple in-memory map (IP -> last 10 timestamps)
const rateLimitMap = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = 60_000; // 1 minute
  const maxPerWindow = 20;
  const times = (rateLimitMap.get(ip) ?? []).filter(t => now - t < window);
  times.push(now);
  rateLimitMap.set(ip, times);
  return times.length > maxPerWindow;
}

// POST /errors/report — Frontend reports errors here
router.post("/errors/report", optionalAuth, (req, res): void => {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    ?? req.socket.remoteAddress
    ?? "unknown";

  if (isRateLimited(ip)) {
    res.status(429).json({ error: "Too many error reports" });
    return;
  }

  const Body = z.object({
    source: z.enum(["frontend", "api", "download"]).optional().default("frontend"),
    platform: z.string().max(100).optional(),
    errorType: z.string().max(200).optional(),
    message: z.string().max(2000),
    stack: z.string().max(5000).optional(),
    url: z.string().max(500).optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid payload" }); return; }

  const { source, platform, errorType, message, stack, url } = parsed.data;
  const userAgent = (req.headers["user-agent"] ?? "").slice(0, 300);
  const userId = req.user?.userId ?? null;

  try {
    stmts.insertError.run(source, platform ?? null, errorType ?? null, message, stack ?? null, url ?? null, userAgent, userId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to log error" });
  }
});

// Internal helper: log a server-side error
export function logServerError(opts: {
  source?: string; platform?: string; errorType?: string; message: string; stack?: string;
}): void {
  try {
    stmts.insertError.run(
      opts.source ?? "api", opts.platform ?? null, opts.errorType ?? null,
      opts.message, opts.stack ?? null, null, null, null,
    );
  } catch { /* never throw in error logger */ }
}

export default router;
