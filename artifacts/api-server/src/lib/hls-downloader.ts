import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { logger } from "./logger";

export interface HLSDownloadOptions {
  manifestUrl: string;
  outputPath: string;
  referer?: string;
  cookiesFile?: string;
  headers?: Record<string, string>;
  onProgress?: (percent: number) => void;
}

/**
 * Download an HLS (.m3u8) or DASH (.mpd) stream directly using ffmpeg.
 * This is the fastest method — no re-encoding, just remux to MP4.
 */
export async function downloadHLS(opts: HLSDownloadOptions): Promise<void> {
  const ffmpegPath = findFfmpeg();
  const { manifestUrl, outputPath, referer, cookiesFile, headers = {}, onProgress } = opts;

  const args: string[] = ["-y"];

  // Build HTTP headers string for ffmpeg
  const allHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    ...headers,
  };
  if (referer) {
    allHeaders["Referer"] = referer;
    allHeaders["Origin"] = new URL(referer).origin;
  }

  // Apply headers
  for (const [key, value] of Object.entries(allHeaders)) {
    args.push("-headers", `${key}: ${value}\r\n`);
  }

  // Cookies file
  if (cookiesFile && existsSync(cookiesFile)) {
    // ffmpeg doesn't natively support cookie files, so we parse and add as header
    try {
      const { readFileSync } = await import("fs");
      const cookieContent = readFileSync(cookiesFile, "utf8");
      const cookies = parseCookieTxt(cookieContent, manifestUrl);
      if (cookies) {
        args.push("-headers", `Cookie: ${cookies}\r\n`);
      }
    } catch (e) {
      logger.warn({ e }, "HLS: failed to parse cookies file");
    }
  }

  args.push("-i", manifestUrl);
  args.push(
    "-c", "copy",           // No re-encoding — very fast
    "-bsf:a", "aac_adtstoasc", // Fix AAC for MP4 container
    "-movflags", "+faststart",
    outputPath
  );

  logger.info({ manifestUrl, outputPath }, "HLS: starting ffmpeg download");

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = "";
    let duration = 0;

    proc.stderr.on("data", (chunk: Buffer) => {
      const line = chunk.toString();
      stderr += line;

      // Extract duration for progress calculation
      const durMatch = line.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (durMatch && !duration) {
        const h = parseInt(durMatch[1]);
        const m = parseInt(durMatch[2]);
        const s = parseFloat(durMatch[3]);
        duration = h * 3600 + m * 60 + s;
      }

      // Calculate progress from time position
      if (onProgress && duration > 0) {
        const timeMatch = line.match(/time=(\d+):(\d+):([\d.]+)/);
        if (timeMatch) {
          const h = parseInt(timeMatch[1]);
          const m = parseInt(timeMatch[2]);
          const s = parseFloat(timeMatch[3]);
          const elapsed = h * 3600 + m * 60 + s;
          const pct = Math.min(99, Math.round((elapsed / duration) * 100));
          onProgress(pct);
        }
      }
    });

    proc.on("close", (code) => {
      if (code === 0) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`ffmpeg HLS download failed: ${stderr.slice(-400)}`));
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`ffmpeg not found or failed: ${err.message}. Install ffmpeg and add to PATH.`));
    });
  });
}

function findFfmpeg(): string {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const { execSync } = require("child_process");
    const cmd = process.platform === "win32" ? "where ffmpeg" : "which ffmpeg";
    return execSync(cmd, { encoding: "utf8" }).split("\n")[0].trim() || "ffmpeg";
  } catch { return "ffmpeg"; }
}

/**
 * Parse Netscape cookie file format and return Cookie header value
 * for the given URL's domain.
 */
function parseCookieTxt(content: string, url: string): string | null {
  try {
    const targetDomain = new URL(url).hostname;
    const cookies: string[] = [];

    for (const line of content.split("\n")) {
      if (line.startsWith("#") || !line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length < 7) continue;
      const domain = parts[0];
      const name = parts[5];
      const value = parts[6];
      if (targetDomain.includes(domain.replace(/^\./, ""))) {
        cookies.push(`${name}=${value}`);
      }
    }

    return cookies.length > 0 ? cookies.join("; ") : null;
  } catch { return null; }
}
