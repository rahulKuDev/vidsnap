// @ts-ignore — node:sqlite is experimental in Node 22, no TS types yet
import { DatabaseSync } from "node:sqlite";
import path from "path";
import { existsSync, mkdirSync } from "fs";
import { logger } from "./logger.js";

// ─── DB location ──────────────────────────────────────────────────────────────
const DB_DIR = process.env.DB_DIR || path.join(process.cwd(), "data");
if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
const DB_PATH = path.join(DB_DIR, "vidsnap.db");

// DatabaseSync is synchronous — perfect for Express route handlers
export const db: any = new DatabaseSync(DB_PATH);

// ─── WAL mode + FK enforcement ────────────────────────────────────────────────
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

// ─── Schema migrations ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT NOT NULL,
    email              TEXT NOT NULL UNIQUE,
    password_hash      TEXT NOT NULL,
    role               TEXT NOT NULL DEFAULT 'user',
    avatar_url         TEXT,
    is_verified        INTEGER NOT NULL DEFAULT 0,
    is_banned          INTEGER NOT NULL DEFAULT 0,
    banned_reason      TEXT,
    reset_token        TEXT UNIQUE,
    reset_token_expiry INTEGER,
    otp_code           TEXT,
    otp_expiry         INTEGER,
    created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER,
    type         TEXT NOT NULL DEFAULT 'help',
    subject      TEXT NOT NULL,
    message      TEXT NOT NULL,
    platform     TEXT,
    error_detail TEXT,
    image_url    TEXT,
    status       TEXT NOT NULL DEFAULT 'open',
    admin_reply  TEXT,
    created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS error_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    source     TEXT NOT NULL DEFAULT 'frontend',
    platform   TEXT,
    error_type TEXT,
    message    TEXT NOT NULL,
    stack      TEXT,
    url        TEXT,
    user_agent TEXT,
    user_id    INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_users_email    ON users(email);
  CREATE INDEX IF NOT EXISTS idx_feedback_user  ON feedback(user_id);
  CREATE INDEX IF NOT EXISTS idx_error_created  ON error_log(created_at DESC);
`);

logger.info({ path: DB_PATH }, "SQLite DB initialised");

// ─── Types ────────────────────────────────────────────────────────────────────
export interface UserRow {
  id: number; name: string; email: string; password_hash: string; role: string;
  avatar_url: string | null; is_verified: number; is_banned: number;
  banned_reason: string | null; reset_token: string | null;
  reset_token_expiry: number | null; otp_code: string | null;
  otp_expiry: number | null; created_at: number; updated_at: number;
}
export interface FeedbackRow {
  id: number; user_id: number | null; type: string; subject: string; message: string;
  platform: string | null; error_detail: string | null; image_url: string | null;
  status: string; admin_reply: string | null; created_at: number; updated_at: number;
}
export interface ErrorLogRow {
  id: number; source: string; platform: string | null; error_type: string | null;
  message: string; stack: string | null; url: string | null;
  user_agent: string | null; user_id: number | null; created_at: number;
}

// ─── Prepared statements (node:sqlite StatementSync) ─────────────────────────
// Each stmt.get(v) or stmt.all(v) takes positional params as individual args or via {named}
export const stmts = {
  getUserByEmail:       db.prepare("SELECT * FROM users WHERE email = ?"),
  getUserById:          db.prepare("SELECT * FROM users WHERE id = ?"),
  getUserByResetToken:  db.prepare("SELECT * FROM users WHERE reset_token = ?"),
  insertUser:           db.prepare("INSERT INTO users (name,email,password_hash,role,is_verified,otp_code,otp_expiry) VALUES (?,?,?,?,?,?,?)"),
  updateUserVerified:   db.prepare("UPDATE users SET is_verified=1,otp_code=NULL,otp_expiry=NULL,updated_at=unixepoch() WHERE id=?"),
  updateUserOtp:        db.prepare("UPDATE users SET otp_code=?,otp_expiry=?,updated_at=unixepoch() WHERE id=?"),
  updateUserReset:      db.prepare("UPDATE users SET reset_token=?,reset_token_expiry=?,updated_at=unixepoch() WHERE id=?"),
  updateUserPassword:   db.prepare("UPDATE users SET password_hash=?,reset_token=NULL,reset_token_expiry=NULL,updated_at=unixepoch() WHERE id=?"),
  updateUserBan:        db.prepare("UPDATE users SET is_banned=?,banned_reason=?,updated_at=unixepoch() WHERE id=?"),
  updateUserRole:       db.prepare("UPDATE users SET role=?,updated_at=unixepoch() WHERE id=?"),
  countUsers:           db.prepare("SELECT COUNT(*) as count FROM users"),
  getAllUsers:           db.prepare("SELECT * FROM users ORDER BY created_at DESC"),

  insertFeedback:       db.prepare("INSERT INTO feedback (user_id,type,subject,message,platform,error_detail,image_url) VALUES (?,?,?,?,?,?,?)"),
  getAllFeedback:        db.prepare("SELECT * FROM feedback ORDER BY created_at DESC"),
  getFeedbackById:      db.prepare("SELECT * FROM feedback WHERE id=?"),
  getFeedbackByUser:    db.prepare("SELECT * FROM feedback WHERE user_id=? ORDER BY created_at DESC"),
  updateFeedbackStatus: db.prepare("UPDATE feedback SET status=?,admin_reply=?,updated_at=unixepoch() WHERE id=?"),

  insertError:          db.prepare("INSERT INTO error_log (source,platform,error_type,message,stack,url,user_agent,user_id) VALUES (?,?,?,?,?,?,?,?)"),
  getRecentErrors:      db.prepare("SELECT * FROM error_log ORDER BY created_at DESC LIMIT ?"),
  countErrors:          db.prepare("SELECT COUNT(*) as count FROM error_log"),
  countErrorsToday:     db.prepare("SELECT COUNT(*) as count FROM error_log WHERE created_at > unixepoch()-86400"),
};
