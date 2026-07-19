import { Router, type IRouter } from "express";
import { existsSync, statSync, createReadStream } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";
import {
  createDownloadJob,
  getDownloadJob,
  listDownloadJobs,
  updateDownloadJob,
} from "../lib/jobs-store";
import {
  analyzeUrl,
  startDownload,
  applyEdits,
  DOWNLOADS_DIR,
} from "../lib/downloader";
import {
  AnalyzeVideoBody,
  StartDownloadBody,
  GetJobStatusParams,
  EditVideoBody,
  DownloadFileParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// POST /video/analyze
router.post("/video/analyze", async (req, res): Promise<void> => {
  const parsed = AnalyzeVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Optional cookies: frontend sends { url, cookiesBase64: "..." }
  let tempCookiesPath: string | undefined;
  const cookiesB64 = (req.body as any).cookiesBase64 as string | undefined;
  if (cookiesB64) {
    try {
      const { writeFileSync, mkdirSync } = await import("fs");
      const { tmpdir } = await import("os");
      const { randomUUID } = await import("crypto");
      const tmpDir = path.join(tmpdir(), "vidsnap-cookies");
      mkdirSync(tmpDir, { recursive: true });
      tempCookiesPath = path.join(tmpDir, `${randomUUID()}.txt`);
      const decoded = Buffer.from(cookiesB64, "base64").toString("utf8");
      writeFileSync(tempCookiesPath, decoded, "utf8");
      logger.info({ tempCookiesPath }, "Cookies file saved for analysis");
    } catch (e) {
      logger.warn({ e }, "Failed to save cookies for analysis");
    }
  }

  try {
    const info = await analyzeUrl(parsed.data.url, tempCookiesPath);
    res.json(info);
  } catch (err: unknown) {
    req.log.error({ err }, "Video analysis failed");
    const msg = err instanceof Error ? err.message : "Analysis failed";
    res.status(500).json({ error: msg });
  } finally {
    // Cleanup temp cookies file
    if (tempCookiesPath) {
      try { (await import("fs")).unlinkSync(tempCookiesPath); } catch {}
    }
  }
});


// POST /video/download
router.post("/video/download", async (req, res): Promise<void> => {
  const parsed = StartDownloadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { url, formatId, outputFormat, quality, removeWatermark, title, thumbnail, platform } = parsed.data;
  const jobId = randomUUID();
  const ext = outputFormat === "mp3" ? "mp3" : outputFormat === "m4a" ? "m4a" : "mp4";
  const outputFilename = `${jobId}.${ext}`;

  // ── Save cookies file if provided (persistent — survives async download) ────
  let cookiesFilePath: string | undefined;
  const cookiesB64 = (req.body as any).cookiesBase64 as string | undefined;
  if (cookiesB64) {
    try {
      const { writeFileSync, mkdirSync } = await import("fs");
      mkdirSync(DOWNLOADS_DIR, { recursive: true });
      cookiesFilePath = path.join(DOWNLOADS_DIR, `${jobId}.cookies.txt`);
      const decoded = Buffer.from(cookiesB64, "base64").toString("utf8");
      writeFileSync(cookiesFilePath, decoded, "utf8");
      logger.info({ cookiesFilePath }, "Cookies file saved for download");
    } catch (e) {
      logger.warn({ e }, "Failed to save cookies for download");
    }
  }

  // Create job in DB
  const job = await createDownloadJob({
    id: jobId,
    url,
    title: title ?? null,
    thumbnail: thumbnail ?? null,
    platform: platform ?? null,
    outputFormat,
    quality: quality ?? null,
    status: "pending",
    progress: 0,
    filename: outputFilename,
  });

  res.status(202).json(job);

  // Helper: clean up per-job cookies file
  const cleanupCookies = () => {
    if (cookiesFilePath) {
      try { require("fs").unlinkSync(cookiesFilePath); } catch {}
    }
  };

  // Start download in background (no await)
  (async () => {
    try {
      // Mark as downloading
      await updateDownloadJob(jobId, { status: "downloading" });

      await new Promise<void>((resolve, reject) => {
        startDownload(
          {
            url,
            formatId: formatId ?? undefined,
            outputFormat,
            quality: quality ?? undefined,
            removeWatermark: removeWatermark ?? false,
            outputFilename,
            cookiesFile: cookiesFilePath,   // ← pass cookies to yt-dlp
          },
          async (progress) => {
            await updateDownloadJob(jobId, { progress });
          },
          async (filename, filesize) => {
            const fp = path.join(DOWNLOADS_DIR, filename);
            const actualSize = existsSync(fp) ? statSync(fp).size : filesize;
            cleanupCookies();
            await updateDownloadJob(jobId, { status: "done", progress: 100, filename, filesize: actualSize });
            resolve();
          },
          async (errorMsg) => {
            cleanupCookies();
            await updateDownloadJob(jobId, { status: "error", errorMessage: errorMsg });
            reject(new Error(errorMsg));
          },
        );
      });
    } catch (err) {
      cleanupCookies();
      logger.error({ err, jobId }, "Background download failed");
    }
  })();
});

// GET /video/jobs/:jobId
router.get("/video/jobs/:jobId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const parsed = GetJobStatusParams.safeParse({ jobId: rawId });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  const job = await getDownloadJob(parsed.data.jobId);

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json(job);
});

// GET /video/history
router.get("/video/history", async (req, res): Promise<void> => {
  const jobs = await listDownloadJobs(50);

  res.json(jobs);
});

// POST /video/edit
router.post("/video/edit", async (req, res): Promise<void> => {
  const parsed = EditVideoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { jobId, trimStart, trimEnd, removeWatermark, outputFormat, speed, muteAudio, volume, voiceEffect } = parsed.data;
  // Advanced params (not in typed schema — read directly from body)
  const body = req.body as any;
  const removeBackground = body.removeBackground ?? null;
  const pitchSemitones   = body.pitchSemitones   ?? null;
  const brightness       = body.brightness       ?? null;
  const contrast         = body.contrast         ?? null;
  const saturation       = body.saturation       ?? null;
  const blur             = body.blur             ?? null;
  const sharpen          = body.sharpen          ?? null;
  const visualFilter     = body.visualFilter     ?? null;
  const flipHorizontal   = body.flipHorizontal   ?? null;
  const flipVertical     = body.flipVertical     ?? null;
  const rotate           = body.rotate           ?? null;
  const trimMode         = body.trimMode         ?? null;  // "keep" | "delete"
  const videoDuration    = body.videoDuration    ?? null;  // seconds (needed for delete mode)


  // Get source job
  const sourceJob = await getDownloadJob(jobId);

  if (!sourceJob) {
    res.status(404).json({ error: "Source job not found" });
    return;
  }

  if (!sourceJob.filename) {
    res.status(400).json({ error: "Source job has no file" });
    return;
  }

  const editJobId = randomUUID();
  const fmt = outputFormat || sourceJob.outputFormat;
  const ext = fmt === "mp3" ? "mp3" : fmt === "m4a" ? "m4a" : fmt === "webm" ? "webm" : "mp4";
  const outputFilename = `${editJobId}.${ext}`;

  // Create edit job
  const editJob = await createDownloadJob({
    id: editJobId,
    url: sourceJob.url,
    title: sourceJob.title ? `${sourceJob.title} (edited)` : null,
    thumbnail: sourceJob.thumbnail,
    platform: sourceJob.platform,
    outputFormat: fmt,
    quality: sourceJob.quality,
    status: "processing",
    progress: 0,
    filename: outputFilename,
  });

  res.status(202).json(editJob);

  // Run edit in background
  (async () => {
    try {
      await applyEdits(
        sourceJob.filename!,
        outputFilename,
        trimStart,
        trimEnd,
        removeWatermark,
        fmt,
        speed,
        muteAudio,
        volume,
        voiceEffect,
        removeBackground,
        pitchSemitones,
        brightness,
        contrast,
        saturation,
        blur,
        sharpen,
        visualFilter,
        flipHorizontal,
        flipVertical,
        rotate,
        trimMode,
        videoDuration,
      );


      const fp = path.join(DOWNLOADS_DIR, outputFilename);
      const filesize = existsSync(fp) ? statSync(fp).size : null;

      await updateDownloadJob(editJobId, { status: "done", progress: 100, filesize });
    } catch (err) {
      logger.error({ err, editJobId }, "Edit failed");
      const msg = err instanceof Error ? err.message : "Edit failed";
      await updateDownloadJob(editJobId, { status: "error", errorMessage: msg });
    }
  })();
});

// GET /video/platforms
router.get("/video/platforms", (req, res): void => {
  const platforms = [
    { name: "YouTube", domain: "youtube.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z" fill="#FF0000"/></svg>', supported: true },
    { name: "TikTok", domain: "tiktok.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M19.6 3.3C18.2 1.9 17.4 0 17.3 0h-3.4v16.6c0 1.6-1.3 3-3 3a3 3 0 0 1-3-3 3 3 0 0 1 3-3c.3 0 .6 0 .9.1V10c-.3 0-.6-.1-.9-.1C6.2 9.9 3 13.1 3 17.1S6.2 24 10.9 24s7.9-3.5 7.9-7.9V8.2a11 11 0 0 0 6.2 1.9V6.7s-3 .2-5.4-3.4z" fill="#010101"/></svg>', supported: true },
    { name: "Instagram", domain: "instagram.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 3.3.2 4.8 1.7 5 5 .1 1.3.1 1.7.1 4.9 0 3.2 0 3.6-.1 4.9-.2 3.3-1.7 4.8-5 5-1.3.1-1.7.1-4.9.1-3.2 0-3.6 0-4.9-.1-3.3-.2-4.8-1.7-5-5C2 16.6 2 16.2 2 12c0-3.2 0-3.6.1-4.9C2.3 3.9 3.8 2.3 7.1 2.1 8.4 2 8.8 2 12 2zm0-2.2C8.7 0 8.3 0 7 .1 2.7.3.3 2.7.1 7 0 8.3 0 8.7 0 12c0 3.3 0 3.7.1 5 .2 4.3 2.6 6.7 7 6.9 1.3.1 1.7.1 5 .1s3.7 0 5-.1c4.3-.2 6.7-2.6 6.9-7 .1-1.3.1-1.7.1-5s0-3.7-.1-5c-.2-4.3-2.6-6.7-7-6.9C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4A6.2 6.2 0 0 0 12 5.8zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.8a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z" fill="url(#ig-gradient)"/><defs><linearGradient id="ig-gradient" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" style="stop-color:#f09433"/><stop offset="25%" style="stop-color:#e6683c"/><stop offset="50%" style="stop-color:#dc2743"/><stop offset="75%" style="stop-color:#cc2366"/><stop offset="100%" style="stop-color:#bc1888"/></linearGradient></defs></svg>', supported: true },
    { name: "Facebook", domain: "facebook.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M24 12.1C24 5.4 18.6 0 12 0S0 5.4 0 12.1C0 18.1 4.4 23 10.1 24v-8.4H7.1v-3.5h3V9.6c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-1.9.9-1.9 1.9v2.2h3.3l-.5 3.5H14V24C19.6 23 24 18.1 24 12.1z" fill="#1877F2"/></svg>', supported: true },
    { name: "Twitter/X", domain: "x.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18.2 1h3.5l-7.7 8.8L23 23h-7.1l-5.5-7.2L4 23H.4l8.2-9.4L1 1h7.2l5 6.6L18.2 1zm-1.2 19.8h1.9L7.1 3H5L17 20.8z" fill="#000"/></svg>', supported: true },
    { name: "Vimeo", domain: "vimeo.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M23.9 6.6c-.1 2.4-1.8 5.7-5 9.9C15.6 21 12.9 23 10.5 23c-1.4 0-2.6-1.3-3.6-3.9L5 12c-.7-2.6-1.5-3.9-2.3-3.9-.2 0-.8.4-1.9 1.2L0 8.2c1.2-1 2.3-2 3.5-3 1.5-1.3 2.7-2 3.4-2 1.8-.2 2.9 1.1 3.3 3.8.4 2.9.7 4.7.9 5.4.5 2.3 1 3.4 1.7 3.4.5 0 1.2-.7 2.1-2.2 1-1.5 1.5-2.7 1.5-3.5 0-1.5-.9-2.3-2.6-2.3-.9 0-1.9.2-2.9.6 1.9-6.3 5.6-9.3 11-9.1 3.9.1 5.8 2.7 5.7 7.3z" fill="#1AB7EA"/></svg>', supported: true },
    { name: "Reddit", domain: "reddit.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.0 4.5c.8 0 1.5.7 1.5 1.5s-.7 1.5-1.5 1.5a1.5 1.5 0 0 1-1.5-1.5c0-.8.7-1.5 1.5-1.5zm-9.9 2l4.4.6-1.3 4.7A4.2 4.2 0 0 1 12 13c1.3 0 2.6.6 3.4 1.5l.3-.8 3.5-.5c.2.3.3.6.3 1 0 2.3-2.6 4.3-5.9 4.3-3.3 0-5.9-2-5.9-4.3 0-2.3 2.6-4.3 5.9-4.3.6 0 1.2.1 1.8.2l1-3.7-3.4-.4v-.5zm-2.6 8.4a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm10 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" fill="#FF4500"/></svg>', supported: true },
    { name: "Twitch", domain: "twitch.tv", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M11.6 6H13v4.5h-1.4V6zm3.9 0h1.4v4.5h-1.4V6zM2.4 0L0 2.6V21.4h6V24l2.4-2.6H12l4.8-5.1V0H2.4zm18 11.9L17 15.4h-3.6L11 17.7v-2.3H7.2V1.3h13.2v10.6z" fill="#9146FF"/></svg>', supported: true },
    { name: "Dailymotion", domain: "dailymotion.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm4.3 16.8H13v-1.1c-.7.8-1.6 1.3-2.8 1.3-2.5 0-4.3-2-4.3-4.9 0-3 1.8-4.9 4.4-4.9 1.1 0 2 .4 2.6 1.2V7.2h3.4v9.6z" fill="#0066DC"/></svg>', supported: true },
    { name: "Pinterest", domain: "pinterest.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.4 0 12c0 5.1 3.2 9.4 7.7 11.1-.1-.9-.2-2.4 0-3.4.2-.9 1.4-6 1.4-6s-.4-.7-.4-1.8c0-1.7 1-3 2.4-3 1.2 0 1.7.9 1.7 1.9 0 1.2-.7 2.9-1.1 4.5-.3 1.4.7 2.5 2 2.5 2.4 0 4-2.5 4-6.1 0-3.2-2.3-5.4-5.6-5.4-3.8 0-6 2.9-6 5.8 0 1.1.4 2.4 1 3 .1.1.1.2.1.4l-.4 1.5c-.1.3-.3.4-.6.2-2.2-1-3.6-4.2-3.6-6.8 0-5.5 4-10.6 11.5-10.6 6 0 10.7 4.3 10.7 10 0 5.9-3.7 10.7-8.9 10.7-1.7 0-3.4-.9-3.9-2l-1.1 4c-.4 1.5-1.5 3.4-2.2 4.5.8.3 1.7.4 2.5.4 6.6 0 12-5.4 12-12S18.6 0 12 0z" fill="#E60023"/></svg>', supported: true },
    { name: "LinkedIn", domain: "linkedin.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M20.4 20.4h-3.5V14.9c0-1.3 0-3-1.8-3-1.9 0-2.1 1.5-2.1 2.9v5.6H9.5V9h3.3v1.6h.1c.5-.9 1.6-1.8 3.3-1.8 3.5 0 4.1 2.3 4.1 5.3v6.3zM5.3 7.4a2 2 0 1 1 0-4.1 2 2 0 0 1 0 4.1zM7 20.4H3.6V9H7v11.4zM22.2 0H1.8C.8 0 0 .8 0 1.8v20.4C0 23.2.8 24 1.8 24h20.4c1 0 1.8-.8 1.8-1.8V1.8C24 .8 23.2 0 22.2 0z" fill="#0A66C2"/></svg>', supported: true },
    { name: "Snapchat", domain: "snapchat.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12.2.5c2.3 0 5.5 1.2 6.7 4.3.4 1 .3 2.6.3 3.4l.2.1c.2.1.5.1.8.1.3 0 .5-.1.7-.1.2 0 .4 0 .6.1.5.1.8.5.8.9 0 .7-.7 1.1-1.1 1.3l-.3.2c-.4.2-.7.5-.8.8 0 .1 0 .3.1.5.4.8.9 2.3 2.5 3.4.3.2.5.5.4.9-.1.4-.5.7-1.2.9-.2.1-.4.1-.7.2-.4.1-.8.3-.9.6-.1.2-.1.4 0 .7 0 .1.1.3.1.3.1.2.2.4.2.7 0 .7-.5 1.2-1.2 1.2h-.2c-.7-.1-1.4-.5-2.5-1-1.2-.5-2.2-.6-2.9-.4-.4.1-.9.4-1.3.7-.5.3-1 .6-1.6.8-.3.1-.6.2-.9.2-.3 0-.6-.1-.9-.2-.6-.2-1.1-.5-1.6-.8-.4-.3-.9-.6-1.3-.7-.7-.2-1.7-.1-2.9.4-1.1.5-1.8.9-2.5 1h-.2c-.7 0-1.2-.5-1.2-1.2 0-.3.1-.5.2-.7l.1-.3c.1-.3.1-.5 0-.7-.1-.3-.5-.5-.9-.6-.3-.1-.5-.1-.7-.2-.7-.2-1.1-.5-1.2-.9-.1-.4.1-.7.4-.9 1.6-1.1 2.1-2.6 2.5-3.4.1-.2.1-.4.1-.5-.1-.3-.4-.6-.8-.8l-.3-.2C2.4 11.1 1.7 10.7 1.7 10c0-.4.3-.8.8-.9.2-.1.4-.1.6-.1.2 0 .4.1.7.1.3 0 .6 0 .8-.1l.2-.1c0-.8-.1-2.4.3-3.4C6.3 1.7 9.9.5 12.2.5z" fill="#FFFC00"/></svg>', supported: true },
    { name: "ShareChat", domain: "sharechat.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#FF6347"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="10" font-family="Arial" font-weight="bold">SC</text></svg>', supported: true },
    { name: "MX Player", domain: "mxplayer.in", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#FF6600"/><polygon points="9,7 19,12 9,17" fill="white"/></svg>', supported: true },
    { name: "Hotstar", domain: "hotstar.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#1B74E4"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="7" font-family="Arial" font-weight="bold">Hotstar</text></svg>', supported: true },
    { name: "Bilibili", domain: "bilibili.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M17.8 4.2l1.6-1.6c.3-.3.3-.8 0-1.1-.3-.3-.8-.3-1.1 0L16.4 3H7.6L5.7 1.5c-.3-.3-.8-.3-1.1 0-.3.3-.3.8 0 1.1l1.6 1.6C4.4 5.2 3 7.1 3 9.3v7.4C3 19.7 5.3 22 8.3 22h7.4c3 0 5.3-2.3 5.3-5.3V9.3c0-2.2-1.4-4.1-3.2-5.1zM8.2 14.3H7v-4.6h1.2v4.6zm2.5 0H9.5v-4.6h1.2v4.6zm4.8-2.6c0 1.4-.5 2.8-2 2.8-1.6 0-2-1.4-2-2.8 0-1.4.4-2.8 2-2.8s2 1.4 2 2.8z" fill="#00A1D6"/></svg>', supported: true },
    { name: "SoundCloud", domain: "soundcloud.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M1.2 13.9c-.1.2 0 .4.2.5l.5.1c.2 0 .4-.1.4-.3l.5-3-.5-3c0-.2-.2-.3-.4-.3l-.5.1c-.2.1-.3.3-.2.5l.4 2.7-.4 2.7zm2.3.7c-.1.2 0 .4.2.5h.5c.2 0 .4-.2.4-.4l.4-3.5-.4-3.8c0-.2-.2-.4-.4-.4H4c-.2.1-.3.3-.2.5l.4 3.7-.4 3.4zm2.3.5c0 .3.2.5.5.5h.4c.3 0 .5-.2.5-.5l.4-4-.4-4.3c0-.3-.2-.5-.5-.5h-.4c-.3 0-.5.2-.5.5l-.3 4.3.3 4zm2.4.3c0 .3.2.5.5.5h.5c.3 0 .5-.2.5-.5l.3-4.3-.3-5c0-.3-.2-.5-.5-.5h-.5c-.3 0-.5.2-.5.5l-.3 5 .3 4.3zm2.3.2c0 .3.2.6.6.6h.5c.3 0 .6-.3.6-.6l.3-4.5-.3-5.5c0-.3-.3-.6-.6-.6h-.5c-.3 0-.6.3-.6.6l-.2 5.5.2 4.5zm2.4.1c0 .4.3.7.7.7h.4c.4 0 .7-.3.7-.7l.2-4.6-.2-5.7c0-.4-.3-.7-.7-.7h-.4c-.4 0-.7.3-.7.7l-.2 5.7.2 4.6zm9.9-7.3c-.5-2.3-2.5-3.9-4.8-3.9-.5 0-1 .1-1.5.3-.2-2.5-2.3-4.5-4.9-4.5-.7 0-1.3.2-1.9.4-.2.1-.3.3-.3.5V15c0 .4.3.7.7.7h12.1c1.5 0 2.7-1.2 2.7-2.7 0-1.4-1-2.5-2.1-2.7z" fill="#FF5500"/></svg>', supported: true },
    { name: "Spotify", domain: "spotify.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.6 0 12 0zm5.5 17.3c-.2.4-.7.5-1 .3-2.8-1.7-6.3-2.1-10.5-1.1-.4.1-.8-.2-.9-.6-.1-.4.2-.8.6-.9 4.5-1 8.4-.6 11.5 1.3.4.1.5.7.3 1zm1.5-3.3c-.3.4-.8.6-1.2.3-3.2-2-8.1-2.6-11.8-1.4-.5.2-1-.1-1.1-.6-.2-.5.1-1 .6-1.1 4.3-1.3 9.7-.7 13.3 1.6.4.3.5.8.2 1.2zm.1-3.4c-3.8-2.3-10.1-2.5-13.7-1.4-.6.2-1.2-.2-1.4-.8-.2-.6.2-1.2.8-1.4 4.2-1.3 11.2-1.1 15.6 1.6.5.3.7 1 .4 1.5-.3.5-1 .7-1.5.4l-.2.1z" fill="#1DB954"/></svg>', supported: true },
    { name: "OK.ru", domain: "ok.ru", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#F97400"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="8" font-family="Arial" font-weight="bold">OK</text></svg>', supported: true },
    { name: "Kuaishou", domain: "kuaishou.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#FF4906"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="7" font-family="Arial" font-weight="bold">KS</text></svg>', supported: true },
    { name: "Loom", domain: "loom.com", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#625DF5"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="8" font-family="Arial" font-weight="bold">L</text></svg>', supported: true },
    { name: "+ 1000 more", domain: "yt-dlp.org", icon: '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="12" fill="#6366F1"/><text x="12" y="16" text-anchor="middle" fill="white" font-size="9" font-family="Arial" font-weight="bold">+</text></svg>', supported: true },
  ];

  res.json({ platforms });
});

// GET /video/file/:filename
router.get("/video/file/:filename", async (req, res): Promise<void> => {
  const rawName = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
  const parsed = DownloadFileParams.safeParse({ filename: rawName });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }

  // Sanitize: only allow alphanumeric, dashes, underscores, dots
  const safe = parsed.data.filename.replace(/[^a-zA-Z0-9\-_.]/g, "");
  const filePath = path.join(DOWNLOADS_DIR, safe);

  if (!existsSync(filePath)) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const stat = statSync(filePath);
  const ext = path.extname(safe).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".m4a": "audio/mp4",
    ".mkv": "video/x-matroska",
  };

  const mime = mimeMap[ext] || "application/octet-stream";
  const isPreview = req.query.preview === "1";
  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", isPreview ? `inline; filename="${safe}"` : `attachment; filename="${safe}"`);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Length", stat.size);

  createReadStream(filePath).pipe(res);
});

export default router;
