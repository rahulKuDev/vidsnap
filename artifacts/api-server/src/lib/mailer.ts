import nodemailer from "nodemailer";
import { logger } from "./logger.js";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function fromAddress(): string {
  const name = process.env.SMTP_FROM_NAME ?? "VidSnap";
  const addr = process.env.SMTP_USER ?? "noreply@vidsnap.app";
  return `"${name}" <${addr}>`;
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildEmail(bodyHtml: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>VidSnap</title></head>
<body style="margin:0;padding:0;background:#0a0a14;font-family:'Segoe UI',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a14;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0"
  style="max-width:520px;width:100%;background:#12121e;border-radius:20px;border:1px solid rgba(255,255,255,0.08);overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.5);">
<tr><td style="background:linear-gradient(135deg,#1a0a2e 0%,#0e1428 100%);padding:36px 32px 28px;text-align:center;border-bottom:1px solid rgba(255,255,255,0.06);">
  <div style="display:inline-flex;align-items:center;gap:10px;">
    <div style="width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#2563eb);display:inline-flex;align-items:center;justify-content:center;">
      <span style="color:#fff;font-weight:900;font-size:20px;line-height:40px;text-align:center;display:block;width:40px;">▶</span>
    </div>
    <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Vid<span style="color:#7c3aed;">Snap</span></span>
  </div>
</td></tr>
<tr><td style="padding:32px;">
${bodyHtml}
</td></tr>
<tr><td style="padding:20px 32px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);">
  <p style="margin:0;color:rgba(255,255,255,0.3);font-size:12px;">© ${year} VidSnap · All rights reserved</p>
  <p style="margin:6px 0 0;color:rgba(255,255,255,0.2);font-size:11px;">If you didn't request this, you can safely ignore this email.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

// ─── OTP email ────────────────────────────────────────────────────────────────
export async function sendOtpEmail(to: string, name: string, otp: string): Promise<void> {
  const safeName = escapeHtml(name);
  const body = `
    <h2 style="margin:0 0 8px;color:#fff;font-size:22px;font-weight:700;">Verify your email</h2>
    <p style="margin:0 0 24px;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;">Hi <strong style="color:#fff;">${safeName}</strong>, enter this code to activate your VidSnap account:</p>
    <div style="background:rgba(124,58,237,0.1);border:2px solid rgba(124,58,237,0.4);border-radius:16px;padding:28px;text-align:center;margin:0 0 24px;">
      <span style="font-size:40px;font-weight:900;letter-spacing:10px;color:#a78bfa;font-family:monospace;">${escapeHtml(otp)}</span>
    </div>
    <p style="margin:0;color:rgba(255,255,255,0.4);font-size:13px;text-align:center;">⏱ This code expires in <strong style="color:rgba(255,255,255,0.6);">10 minutes</strong>.</p>`;

  await transporter.sendMail({
    from: fromAddress(),
    to,
    subject: `${otp} – Your VidSnap verification code`,
    html: buildEmail(body),
  });
  logger.info({ to }, "OTP email sent");
}

// ─── Password Reset email ──────────────────────────────────────────────────────
export async function sendPasswordResetEmail(to: string, name: string, resetUrl: string): Promise<void> {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl);
  const body = `
    <h2 style="margin:0 0 8px;color:#fff;font-size:22px;font-weight:700;">Reset your password</h2>
    <p style="margin:0 0 24px;color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;">Hi <strong style="color:#fff;">${safeName}</strong>, click the button below to reset your VidSnap password:</p>
    <div style="text-align:center;margin:0 0 28px;">
      <a href="${safeUrl}" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;padding:14px 36px;border-radius:12px;font-weight:700;font-size:15px;letter-spacing:0.3px;">Reset Password</a>
    </div>
    <p style="margin:0;color:rgba(255,255,255,0.4);font-size:12px;text-align:center;">Link expires in <strong style="color:rgba(255,255,255,0.5);">1 hour</strong>. Do not share this link.</p>
    <p style="margin:12px 0 0;color:rgba(255,255,255,0.25);font-size:11px;text-align:center;word-break:break-all;">${safeUrl}</p>`;

  await transporter.sendMail({
    from: fromAddress(),
    to,
    subject: "Reset your VidSnap password",
    html: buildEmail(body),
  });
  logger.info({ to }, "Password reset email sent");
}
