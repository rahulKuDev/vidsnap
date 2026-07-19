import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, stmts } from "../lib/vidsnap-db.js";
import { signToken } from "../lib/jwt.js";
import { requireAuth } from "../middlewares/auth.js";
import { sendOtpEmail, sendPasswordResetEmail } from "../lib/mailer.js";

const router = Router();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function serializeUser(u: ReturnType<typeof stmts.getUserById.get>) {
  if (!u) return null;
  return {
    id: u.id, name: u.name, email: u.email, role: u.role,
    avatarUrl: u.avatar_url, isVerified: !!u.is_verified,
    createdAt: new Date(u.created_at * 1000).toISOString(),
  };
}

// ─── REGISTER ─────────────────────────────────────────────────────────────────
router.post("/auth/register", async (req, res, next): Promise<void> => {
  try {
    const Body = z.object({
      name: z.string().min(2, "Name must be at least 2 characters"),
      email: z.string().email("Invalid email address"),
      password: z.string().min(6, "Password must be at least 6 characters"),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { name, email, password } = parsed.data;

    const existing = stmts.getUserByEmail.get(email);
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { count } = stmts.countUsers.get()!;
    const isFirstUser = count === 0;
    const role = isFirstUser ? "admin" : "user";
    const otp = isFirstUser ? null : generateOtp();
    const otpExpiry = otp ? Math.floor(Date.now() / 1000) + 600 : null; // 10 min

    stmts.insertUser.run(name, email, passwordHash, role, isFirstUser ? 1 : 0, otp, otpExpiry);
    const user = stmts.getUserByEmail.get(email)!;

    if (isFirstUser) {
      const token = signToken({ userId: user.id, email: user.email, role: user.role });
      res.status(201).json({ token, user: serializeUser(user), requiresOtp: false });
      return;
    }

    // Send OTP
    try { await sendOtpEmail(email, name, otp!); } catch { /* don't block */ }
    res.status(201).json({ requiresOtp: true, email, message: "Check your email for the 6-digit verification code." });
  } catch (err) { next(err); }
});

// ─── VERIFY OTP ──────────────────────────────────────────────────────────────
router.post("/auth/verify-otp", async (req, res, next): Promise<void> => {
  try {
    const Body = z.object({ email: z.string().email(), otp: z.string().length(6) });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

    const { email, otp } = parsed.data;
    const user = stmts.getUserByEmail.get(email);
    if (!user) { res.status(404).json({ error: "Account not found" }); return; }

    if (user.is_verified) {
      const token = signToken({ userId: user.id, email: user.email, role: user.role });
      res.json({ token, user: serializeUser(user) });
      return;
    }
    if (!user.otp_code || !user.otp_expiry) {
      res.status(400).json({ error: "No verification code found. Request a new one." });
      return;
    }
    if (Math.floor(Date.now() / 1000) > user.otp_expiry) {
      res.status(400).json({ error: "Verification code expired. Request a new one." });
      return;
    }
    if (user.otp_code !== otp) {
      res.status(400).json({ error: "Incorrect code. Please try again." });
      return;
    }

    stmts.updateUserVerified.run(user.id);
    const updated = stmts.getUserById.get(user.id)!;
    const token = signToken({ userId: updated.id, email: updated.email, role: updated.role });
    res.json({ token, user: serializeUser(updated) });
  } catch (err) { next(err); }
});

// ─── RESEND OTP ───────────────────────────────────────────────────────────────
router.post("/auth/resend-otp", async (req, res, next): Promise<void> => {
  try {
    const Body = z.object({ email: z.string().email() });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid email" }); return; }

    const user = stmts.getUserByEmail.get(parsed.data.email);
    if (!user) { res.json({ success: true }); return; } // don't reveal
    if (user.is_verified) { res.status(400).json({ error: "Account already verified" }); return; }

    const otp = generateOtp();
    const otpExpiry = Math.floor(Date.now() / 1000) + 600;
    stmts.updateUserOtp.run(otp, otpExpiry, user.id);

    try {
      await sendOtpEmail(user.email, user.name, otp);
    } catch {
      res.status(500).json({ error: "Failed to send email. Check your SMTP settings." });
      return;
    }
    res.json({ success: true, message: "New verification code sent." });
  } catch (err) { next(err); }
});

// ─── LOGIN ────────────────────────────────────────────────────────────────────
router.post("/auth/login", async (req, res, next): Promise<void> => {
  try {
    const Body = z.object({
      email: z.string().email(),
      password: z.string().min(1),
      rememberMe: z.boolean().optional().default(false),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid email or password" }); return; }

    const { email, password, rememberMe } = parsed.data;
    const user = stmts.getUserByEmail.get(email);
    if (!user) { res.status(401).json({ error: "Invalid email or password" }); return; }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) { res.status(401).json({ error: "Invalid email or password" }); return; }

    if (user.is_banned) {
      const reason = user.banned_reason ? ` Reason: ${user.banned_reason}` : "";
      res.status(403).json({ error: `Your account has been suspended.${reason}`, isBanned: true });
      return;
    }
    if (!user.is_verified) {
      // Auto-resend OTP
      const otp = generateOtp();
      const otpExpiry = Math.floor(Date.now() / 1000) + 600;
      stmts.updateUserOtp.run(otp, otpExpiry, user.id);
      try { await sendOtpEmail(user.email, user.name, otp); } catch { /* ignore */ }
      res.status(403).json({ error: "Please verify your email first.", requiresOtp: true, email: user.email });
      return;
    }

    const token = signToken({ userId: user.id, email: user.email, role: user.role }, rememberMe);
    res.json({ token, user: serializeUser(user) });
  } catch (err) { next(err); }
});

// ─── ME ───────────────────────────────────────────────────────────────────────
router.get("/auth/me", requireAuth, (req, res): void => {
  const user = stmts.getUserById.get(req.user!.userId);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(serializeUser(user));
});

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
router.post("/auth/forgot-password", async (req, res, next): Promise<void> => {
  try {
    const Body = z.object({ email: z.string().email() });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid email" }); return; }

    const user = stmts.getUserByEmail.get(parsed.data.email);
    if (!user) { res.json({ success: true }); return; } // don't reveal

    const resetToken = randomUUID();
    const expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    stmts.updateUserReset.run(resetToken, expiry, user.id);

    const appUrl = process.env.APP_URL ?? "http://localhost:5173";
    await sendPasswordResetEmail(user.email, user.name, `${appUrl}/reset-password?token=${resetToken}`);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────
router.post("/auth/reset-password", async (req, res, next): Promise<void> => {
  try {
    const Body = z.object({ token: z.string().min(1), newPassword: z.string().min(6) });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: "Invalid request" }); return; }

    const user = stmts.getUserByResetToken.get(parsed.data.token);
    if (!user || !user.reset_token_expiry || Math.floor(Date.now() / 1000) > user.reset_token_expiry) {
      res.status(400).json({ error: "Invalid or expired reset link" });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    stmts.updateUserPassword.run(passwordHash, user.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
