import { Router } from "express";
import { z } from "zod";
import { stmts, type ErrorLogRow, type FeedbackRow, type UserRow } from "../lib/vidsnap-db.js";
import { requireAdmin } from "../middlewares/auth.js";
import { listDownloadJobs } from "../lib/jobs-store.js";

const router = Router();

// ─── Stats overview ────────────────────────────────────────────────────────────
router.get("/admin/stats", requireAdmin, async (_req, res, next): Promise<void> => {
  try {
    const { count: userCount } = stmts.countUsers.get()!;
    const { count: errorCount } = stmts.countErrors.get()!;
    const { count: errorToday } = stmts.countErrorsToday.get()!;
    const allFeedback = stmts.getAllFeedback.all() as FeedbackRow[];
    const openTickets = allFeedback.filter(f => f.status === "open").length;

    const allJobs = await listDownloadJobs();
    const downloadCount = allJobs.length;
    const activeDownloads = allJobs.filter(j => j.status === "processing").length;
    const failedDownloads = allJobs.filter(j => j.status === "error").length;

    res.json({
      users: userCount,
      downloads: downloadCount,
      activeDownloads,
      failedDownloads,
      openTickets,
      errorsTotal: errorCount,
      errorsToday: errorToday,
    });
  } catch (err) { next(err); }
});

// ─── All Users ─────────────────────────────────────────────────────────────────
router.get("/admin/users", requireAdmin, (_req, res): void => {
  const users = stmts.getAllUsers.all() as UserRow[];
  res.json(users.map(u => ({
    id: u.id, name: u.name, email: u.email, role: u.role,
    isVerified: !!u.is_verified, isBanned: !!u.is_banned, bannedReason: u.banned_reason,
    createdAt: new Date(u.created_at * 1000).toISOString(),
  })));
});

// ─── Ban / Unban user ──────────────────────────────────────────────────────────
router.patch("/admin/users/:id/ban", requireAdmin, (req, res): void => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid user id" }); return; }
  const Body = z.object({
    banned: z.boolean(),
    reason: z.string().max(500).optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }
  stmts.updateUserBan.run(parsed.data.banned ? 1 : 0, parsed.data.reason ?? null, id);
  res.json({ success: true });
});

// ─── Change user role ──────────────────────────────────────────────────────────
router.patch("/admin/users/:id/role", requireAdmin, (req, res): void => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid user id" }); return; }
  const Body = z.object({ role: z.enum(["user", "admin"]) });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid role" }); return; }
  stmts.updateUserRole.run(parsed.data.role, id);
  res.json({ success: true });
});

// ─── All Feedback / Help ───────────────────────────────────────────────────────
router.get("/admin/feedback", requireAdmin, (_req, res): void => {
  const rows = stmts.getAllFeedback.all() as FeedbackRow[];
  res.json(rows.map(r => ({
    id: r.id, userId: r.user_id, type: r.type, subject: r.subject, message: r.message,
    platform: r.platform, errorDetail: r.error_detail, imageUrl: r.image_url,
    status: r.status, adminReply: r.admin_reply,
    createdAt: new Date(r.created_at * 1000).toISOString(),
  })));
});

// ─── Update feedback status + reply ───────────────────────────────────────────
router.patch("/admin/feedback/:id", requireAdmin, (req, res): void => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "Invalid id" }); return; }
  const Body = z.object({
    status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
    adminReply: z.string().max(5000).optional(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const row = stmts.getFeedbackById.get(id);
  if (!row) { res.status(404).json({ error: "Ticket not found" }); return; }
  stmts.updateFeedbackStatus.run(
    parsed.data.status ?? row.status,
    parsed.data.adminReply ?? row.admin_reply,
    id,
  );
  res.json({ success: true });
});

// ─── Error Log ─────────────────────────────────────────────────────────────────
router.get("/admin/errors", requireAdmin, (req, res): void => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const rows = stmts.getRecentErrors.all(limit) as ErrorLogRow[];
  res.json(rows.map(r => ({
    id: r.id, source: r.source, platform: r.platform, errorType: r.error_type,
    message: r.message, stack: r.stack, url: r.url, userAgent: r.user_agent,
    userId: r.user_id, createdAt: new Date(r.created_at * 1000).toISOString(),
  })));
});

// ─── All Download Jobs ─────────────────────────────────────────────────────────
router.get("/admin/downloads", requireAdmin, async (_req, res, next): Promise<void> => {
  try {
    const jobs = await listDownloadJobs();
    res.json(jobs.map(j => ({
      id: j.id, url: j.url, title: j.title, platform: j.platform,
      outputFormat: j.outputFormat, quality: j.quality,
      status: j.status, progress: j.progress, errorMessage: j.errorMessage,
      filesize: j.filesize, createdAt: j.createdAt, updatedAt: j.updatedAt,
    })));
  } catch (err) { next(err); }
});

export default router;
