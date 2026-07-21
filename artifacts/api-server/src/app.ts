import "dotenv/config";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

// ─── Initialize SQLite DB (runs migrations on first start) ─────────────────────
import "./lib/vidsnap-db.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors({
  origin: (origin, callback) => {
    // Allow all in dev; in production allow via ALLOWED_ORIGINS env
    const allowed = process.env.ALLOWED_ORIGINS?.split(",").map(s => s.trim()) || [];
    if (!origin || process.env.NODE_ENV !== "production" || allowed.length === 0 || allowed.includes(origin) || allowed.includes("*")) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check (Render / uptime monitors)
app.get("/api/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));

app.use("/api", router);

// ─── Global Error Handler ──────────────────────────────────────────────────────
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status ?? err.statusCode ?? 500;
  const message = err.message ?? "Internal Server Error";
  logger.error({ err, status }, `Unhandled error: ${message}`);
  res.status(status).json({
    error: status === 500 ? "Internal server error. Please try again." : message,
    ...(process.env.NODE_ENV !== "production" && { detail: message }),
  });
});

export default app;
