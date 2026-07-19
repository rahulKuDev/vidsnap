import { Router } from "express";
import multer from "multer";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { z } from "zod";
import { stmts } from "../lib/vidsnap-db.js";
import { optionalAuth, requireAuth } from "../middlewares/auth.js";

const router = Router();

// ─── Multer setup: local image upload ─────────────────────────────────────────
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(process.cwd(), "uploads");
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, `${randomUUID()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// ─── Upload image ──────────────────────────────────────────────────────────────
router.post("/feedback/upload", upload.single("image"), (req, res): void => {
  if (!req.file) { res.status(400).json({ error: "No image uploaded" }); return; }
  const base = process.env.APP_URL ?? "http://localhost:3001";
  const imageUrl = `/api/feedback/images/${req.file.filename}`;
  res.json({ imageUrl, filename: req.file.filename });
});

// ─── Serve uploaded images ─────────────────────────────────────────────────────
router.get("/feedback/images/:filename", (req, res): void => {
  const filename = path.basename(req.params.filename as string);
  const filepath = path.join(UPLOADS_DIR, filename);
  if (!existsSync(filepath)) { res.status(404).json({ error: "Image not found" }); return; }
  res.sendFile(filepath);
});

// ─── Submit feedback (public, auth optional) ──────────────────────────────────
router.post("/feedback", optionalAuth, (req, res, next): void => {
  try {
    const Body = z.object({
      type: z.enum(["help", "feedback", "feature"]).default("help"),
      subject: z.string().min(3, "Subject too short").max(500),
      message: z.string().min(10, "Please describe in at least 10 characters").max(5000),
      platform: z.string().max(100).optional(),
      errorDetail: z.string().max(2000).optional(),
      imageUrl: z.string().max(1000).optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { type, subject, message, platform, errorDetail, imageUrl } = parsed.data;
    const userId = req.user?.userId ?? null;

    const result = stmts.insertFeedback.run(userId, type, subject, message, platform ?? null, errorDetail ?? null, imageUrl ?? null);
    const id = result.lastInsertRowid as number;
    const row = stmts.getFeedbackById.get(id)!;
    res.status(201).json({
      id: row.id, type: row.type, subject: row.subject, status: row.status,
      createdAt: new Date(row.created_at * 1000).toISOString(),
      message: "Your feedback has been submitted. Thank you!",
    });
  } catch (err) { next(err); }
});

// ─── Get user's own feedback ───────────────────────────────────────────────────
router.get("/feedback", requireAuth, (req, res): void => {
  const rows = stmts.getFeedbackByUser.all(req.user!.userId);
  res.json(rows.map(r => ({
    id: r.id, type: r.type, subject: r.subject, message: r.message,
    platform: r.platform, status: r.status, adminReply: r.admin_reply,
    imageUrl: r.image_url, createdAt: new Date(r.created_at * 1000).toISOString(),
  })));
});

export default router;
