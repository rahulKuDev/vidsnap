import { spawn, execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "fs";
import path from "path";
import os from "os";
import { logger } from "./logger";
import { browserExtractVideoUrl } from "./browser-extractor";
import { downloadHLS } from "./hls-downloader";

// ─── Referer cache ─────────────────────────────────────────────────────────────
const refererCache = new Map<string, string>();

export const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || path.join(process.cwd(), "downloads");
if (!existsSync(DOWNLOADS_DIR)) mkdirSync(DOWNLOADS_DIR, { recursive: true });

// ─── Global cookies (YTDLP_COOKIES_FILE = direct path, or YTDLP_COOKIES_B64 = base64) ─────
export let GLOBAL_COOKIES_FILE: string | undefined;
(function initGlobalCookies() {
  // Option 1: direct file path (easiest for local dev)
  const filePath = process.env.YTDLP_COOKIES_FILE;
  if (filePath && existsSync(filePath)) {
    GLOBAL_COOKIES_FILE = filePath;
    logger.info({ filePath }, "Global cookies file loaded from YTDLP_COOKIES_FILE");
    return;
  }
  if (filePath) {
    logger.warn({ filePath }, "YTDLP_COOKIES_FILE set but file not found — ignoring");
  }

  // Option 2: base64-encoded content (for Railway/Render)
  const b64 = process.env.YTDLP_COOKIES_B64;
  if (!b64) return;
  try {
    const cookiesDir = path.join(os.tmpdir(), "vidsnap-cookies");
    mkdirSync(cookiesDir, { recursive: true });
    const cookiesPath = path.join(cookiesDir, "global-cookies.txt");
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    writeFileSync(cookiesPath, decoded, "utf8");
    GLOBAL_COOKIES_FILE = cookiesPath;
    logger.info({ cookiesPath }, "Global cookies file initialized from YTDLP_COOKIES_B64 env var");
  } catch (e) {
    logger.warn({ e }, "Failed to initialize global cookies from env var");
  }
})();


// ─── Types ─────────────────────────────────────────────────────────────────────
export interface VideoFormat {
  formatId: string;
  quality: string;
  resolution: string | null;
  ext: string;
  filesize: number | null;
  filesizeEstimated: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  tbr: number | null;
  vbr: number | null;
  abr: number | null;
  isHDR: boolean;
  isDolby: boolean;
  codecLabel: string | null;
}

export interface VideoChapter {
  title: string;
  startTime: number;
  endTime: number;
}

export interface SubtitleInfo {
  lang: string;
  name: string;
}

export interface VideoInfo {
  url: string;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  platform: string;
  uploader: string | null;
  viewCount: number | null;
  description: string | null;
  formats: VideoFormat[];
  chapters?: VideoChapter[];
  subtitles?: SubtitleInfo[];
  isLive?: boolean;
  ageRestricted?: boolean;
  requiresLogin?: boolean;
  /** How this video will be downloaded: direct (no auth), cookies (needs cookies.txt), extension (DRM/needs browser capture) */
  downloadMethod?: "direct" | "cookies" | "extension";
  sourceType?: "ytdlp" | "hls" | "cloudflare" | "browser" | "direct";
}

// ─── Platform detection ────────────────────────────────────────────────────────
function detectPlatform(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const MAP: [string, string][] = [
      ["youtube.com", "YouTube"], ["youtu.be", "YouTube"],
      ["tiktok.com", "TikTok"],
      ["facebook.com", "Facebook"], ["fb.com", "Facebook"], ["fb.watch", "Facebook"],
      ["instagram.com", "Instagram"],
      ["twitter.com", "Twitter/X"], ["x.com", "Twitter/X"],
      ["vimeo.com", "Vimeo"],
      ["twitch.tv", "Twitch"],
      ["dailymotion.com", "Dailymotion"],
      ["reddit.com", "Reddit"], ["v.redd.it", "Reddit"],
      ["pinterest.com", "Pinterest"],
      ["linkedin.com", "LinkedIn"],
      ["sharechat.com", "ShareChat"], ["moj.in", "ShareChat"],
      ["snapchat.com", "Snapchat"],
      ["mxplayer.in", "MX Player"],
      ["hotstar.com", "Hotstar"], ["hotstar.in", "Hotstar"],
      ["bilibili.com", "Bilibili"],
      ["soundcloud.com", "SoundCloud"],
      ["ok.ru", "OK.ru"],
      ["kuaishou.com", "Kuaishou"],
      ["loom.com", "Loom"],
      ["rumble.com", "Rumble"],
      ["odysee.com", "Odysee"],
      ["bitchute.com", "BitChute"],
      ["cloudflarestream.com", "Cloudflare Stream"],
    ];
    for (const [key, name] of MAP) {
      if (host.includes(key)) return name;
    }
    const parts = host.split(".");
    const name = parts[parts.length - 2] || "Unknown";
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch { return "Unknown"; }
}

// ─── URL type detection ────────────────────────────────────────────────────────
export function detectUrlType(url: string): "hls" | "cloudflare" | "direct" | "ytdlp" | "unknown" {
  const lower = url.toLowerCase();
  if (lower.startsWith("blob:")) return "hls"; // treat blob as stream
  if (/\.m3u8(\?|$)/i.test(url) || /manifest\.m3u8/i.test(url)) return "hls";
  if (/\.mpd(\?|$)/i.test(url)) return "hls"; // DASH manifests also ffmpeg
  if (/cloudflarestream\.com/i.test(url)) return "cloudflare";
  if (/\.(mp4|webm|mov|avi|mkv|flv|ts)(\?|$)/i.test(url)) return "direct";
  const ytdlpDomains = ["youtube.com", "youtu.be", "tiktok.com", "twitter.com", "x.com",
    "instagram.com", "facebook.com", "fb.com", "vimeo.com", "twitch.tv",
    "dailymotion.com", "reddit.com", "pinterest.com", "linkedin.com",
    "soundcloud.com", "ok.ru", "bilibili.com", "kuaishou.com", "rumble.com",
    "odysee.com", "bitchute.com", "loom.com", "snapchat.com", "sharechat.com",
    // Adult / generic sites — yt-dlp has extractors for these
    "xnxx.com", "xvideos.com", "xhamster.com", "pornhub.com", "redtube.com",
    "youporn.com", "tube8.com", "spankbang.com", "eporner.com", "xnxx.health",
    "xnxx.gold", "xnxx.fun",
  ];
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (ytdlpDomains.some(d => host.includes(d))) return "ytdlp";
  } catch {}
  return "unknown";
}

// ─── yt-dlp binary ────────────────────────────────────────────────────────────
function findYtDlp(): string {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  const isWindows = process.platform === "win32";
  const names = isWindows ? ["yt-dlp.exe", "yt-dlp"] : ["yt-dlp"];
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return isWindows ? "yt-dlp.exe" : "yt-dlp";
}

const YTDLP_BIN = findYtDlp();
logger.info({ bin: YTDLP_BIN }, "yt-dlp binary resolved");


// ─── ffmpeg path ──────────────────────────────────────────────────────────────
export function findFfmpeg(): string {
  try {
    const cmd = process.platform === "win32" ? "where ffmpeg" : "which ffmpeg";
    return execSync(cmd, { encoding: "utf8" }).split("\n")[0].trim() || "ffmpeg";
  } catch { return "ffmpeg"; }
}

// ─── arg sets ─────────────────────────────────────────────────────────────────
const ANALYZE_BASE_ARGS = [
  "--no-check-certificate", "--socket-timeout", "20",
  "--no-playlist", "--no-warnings",
  "--geo-bypass",
  "--no-write-annotations", "--no-write-description",
  "--add-headers", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "--add-headers", "Accept-Language:en-US,en;q=0.9",
];

const GENERIC_EXTRACTOR_ARGS = [
  "--force-generic-extractor",
  "--no-check-certificate", "--socket-timeout", "20",
  "--no-playlist", "--no-warnings",
  "--geo-bypass",
  "--add-headers", "Accept-Language:en-US,en;q=0.9",
  "--add-headers", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "--add-headers", "Referer:https://www.google.com/",
];

// YouTube multi-client args — ordered best-to-worst for server IPs
// tv_embedded: least monitored, best for server/DC IPs
// android_vr: returns FULL format list (144p – 4K)
// android: good fallback, often bypasses bot-detection
const YT_TV_ARGS = [
  "--no-check-certificate", "--socket-timeout", "20",
  "--no-playlist", "--no-warnings",
  "--extractor-args", "youtube:player_client=tv_embedded,web",
];
const YT_ANDROID_VR_ARGS = [
  "--no-check-certificate", "--socket-timeout", "20",
  "--no-playlist", "--no-warnings",
  "--extractor-args", "youtube:player_client=android_vr,web",
];
const YT_ANDROID_ARGS = [
  "--no-check-certificate", "--socket-timeout", "20",
  "--no-playlist", "--no-warnings",
  "--extractor-args", "youtube:player_client=android,web",
];
const YT_IOS_ARGS = [
  "--no-check-certificate", "--socket-timeout", "20",
  "--no-playlist", "--no-warnings",
  "--extractor-args", "youtube:player_client=ios,android",
];
const YT_MWEB_ARGS = [
  "--no-check-certificate", "--socket-timeout", "20",
  "--no-playlist", "--no-warnings",
  "--extractor-args", "youtube:player_client=mweb,android",
];

// Known DRM/login-gated platforms — skip Layer 2+4 immediately on auth failure
const KNOWN_OTT_DOMAINS = [
  "hotstar.com", "jiohotstar.com", "netflix.com", "primevideo.com",
  "zee5.com", "sonyliv.com", "voot.com", "jiocinema.com",
  "erosnow.com", "mxplayer.in", "altbalaji.com",
  "disneyplus.com", "hulu.com", "hbomax.com", "max.com", "peacocktv.com",
];
function isKnownOTT(url: string): boolean {
  return KNOWN_OTT_DOMAINS.some(d => url.includes(d));
}
function isAuthError(msg: string): boolean {
  return msg.includes("registered users") || msg.includes("login") ||
    msg.includes("Sign in") || msg.includes("cookies") ||
    msg.includes("authentication") || msg.includes("Premium") ||
    msg.includes("subscription");
}


// Enhanced download args — optimized for Railway/cloud server
export const DOWNLOAD_ARGS = [
  "--no-check-certificate",
  "--geo-bypass",
  "--socket-timeout", "60",
  "--add-headers", "Accept-Language:en-US,en;q=0.9",
  "--add-headers", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "--concurrent-fragments", "4",
  "--retries", "5",
  "--fragment-retries", "5",
  "--buffer-size", "32K",
  "--file-access-retries", "3",
];

// Platform-specific extractor args
// Each entry is a *full* set of base args (not extras on top of ANALYZE_BASE_ARGS).
// Return value: array of [baseArgs] to try in order.
function getExtractorArgSets(url: string): Array<{ base: string[], extra: string[] }> {
  const def = (extra: string[] = []) => ({ base: ANALYZE_BASE_ARGS, extra });
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      // tv_embedded: least monitored by YouTube, best from server/DC IPs
      // android_vr: returns complete format list (144p–4K)
      // android: good all-round fallback
      return [
        { base: YT_TV_ARGS, extra: [] },        // Best from server IPs
        { base: YT_ANDROID_VR_ARGS, extra: [] }, // Full format list
        { base: ANALYZE_BASE_ARGS, extra: [] },  // yt-dlp auto-selection
        { base: YT_ANDROID_ARGS, extra: [] },
        { base: YT_IOS_ARGS, extra: [] },
        { base: YT_MWEB_ARGS, extra: [] },
      ];
    }
    if (host.includes("tiktok.com")) {
      // Random device_id to avoid fingerprint blocks on mobile API
      const deviceId = () => String(Math.floor(Math.random() * 9e18) + 1e18);
      const cookieArgs = GLOBAL_COOKIES_FILE ? ["--cookies", GLOBAL_COOKIES_FILE] : [];

      const argSets: { base: string[]; extra: string[] }[] = [];

      // If cookies available → web strategy first (bypasses IP block on mobile API)
      if (GLOBAL_COOKIES_FILE) {
        argSets.push(
          // Web path with cookies — most reliable when logged in
          { base: ANALYZE_BASE_ARGS, extra: [...cookieArgs] },
          // Web path + explicit browser UA
          { base: ANALYZE_BASE_ARGS, extra: [...cookieArgs, "--add-headers", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"] },
        );
      }

      // Mobile API fallbacks (best on server IPs without IP ban)
      argSets.push(
        def([
          ...cookieArgs,
          "--extractor-args", `tiktok:api_hostname=api19-normal-c-alisg.tiktokv.com;device_id=${deviceId()}`,
          "--add-headers", "User-Agent:TikTok 34.1.3 rv:341303 (iPhone; iOS 17.3.1; en_US) Cronet",
        ]),
        def([
          ...cookieArgs,
          "--extractor-args", `tiktok:api_hostname=api22-normal-c-alisg.tiktokv.com;device_id=${deviceId()}`,
          "--add-headers", "User-Agent:TikTok 34.1.3 rv:341303 (iPhone; iOS 17.3.1; en_US) Cronet",
        ]),
        def([
          ...cookieArgs,
          "--extractor-args", `tiktok:api_hostname=api16-normal-c-useast1a.tiktokv.com;device_id=${deviceId()}`,
          "--add-headers", "User-Agent:TikTok 34.1.3 rv:341303 (iPhone; iOS 17.3.1; en_US) Cronet",
        ]),
        def([
          ...cookieArgs,
          "--extractor-args", `tiktok:api_hostname=api22-normal-c-useast2a.tiktokv.com;device_id=${deviceId()}`,
          "--add-headers", "User-Agent:TikTok 34.1.3 rv:341303 (iPhone; iOS 17.3.1; en_US) Cronet",
        ]),
        def([...cookieArgs, "--add-headers", "User-Agent:Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15"]),
        def([...cookieArgs]),
      );
      return argSets;
    }

    if (host.includes("instagram.com")) return [
      def(["--add-headers", "User-Agent:Instagram 319.0.0.0.34"]),
      def(["--extractor-args", "instagram:api=v1"]),
      def([]),
    ];
    if (host.includes("twitter.com") || host.includes("x.com")) return [
      def(["--extractor-args", "twitter:api=graphql"]),
      def([]),
    ];
    if (host.includes("facebook.com") || host.includes("fb.com") || host.includes("fb.watch")) return [
      // Mobile Safari UA — bypasses many Facebook auth checks on public videos
      def([
        "--add-headers", "User-Agent:Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Mobile/15E148 Safari/604.1",
        "--add-headers", "Accept-Language:en-US,en;q=0.9",
      ]),
      def(["--extractor-args", "facebook:_login_required=false"]),
      def(["--add-headers", "User-Agent:facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"]),
      def([]),
    ];
    if (host.includes("snapchat.com")) return [
      def(["--add-headers", "User-Agent:Snapchat/12.51.0.34 (iPhone; iOS 17.0)"]),
      def([]),
    ];
    if (host.includes("sharechat.com") || host.includes("moj.in")) return [
      def(["--add-headers", "User-Agent:ShareChat/2024"]),
      def([]),
    ];
    if (host.includes("reddit.com") || host.includes("v.redd.it")) return [
      def(["--extractor-args", "reddit:_login_required=false"]),
      def([]),
    ];
    if (host.includes("bilibili.com")) return [
      def(["--add-headers", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
           "--add-headers", "Referer:https://www.bilibili.com"]),
      def([]),
    ];
    // ── Indian OTT Platforms ──────────────────────────────────────────────────
    if (host.includes("hotstar.com") || host.includes("jiohotstar.com")) return [
      def(["--extractor-args", "hotstar:geo_bypass_country=IN",
           "--add-headers", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
           "--add-headers", "Accept-Language:en-IN,en;q=0.9",
           "--geo-bypass-country", "IN"]),
      def([]),
    ];
    if (host.includes("mxplayer.in")) return [
      def(["--add-headers", "User-Agent:Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36",
           "--add-headers", "Accept-Language:en-IN,en;q=0.9",
           "--geo-bypass-country", "IN"]),
      def([]),
    ];
    if (host.includes("zee5.com")) return [
      def(["--add-headers", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
           "--add-headers", "x-z5-platform-uid:web",
           "--geo-bypass-country", "IN"]),
      def([]),
    ];
    if (host.includes("sonyliv.com") || host.includes("voot.com")) return [
      def(["--add-headers", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
           "--geo-bypass-country", "IN"]),
      def([]),
    ];
    if (host.includes("erosnow.com") || host.includes("erosstx.com")) return [def(["--geo-bypass-country", "IN"]), def([])];
    if (host.includes("jiocinema.com")) return [def(["--geo-bypass-country", "IN"]), def([])];
  } catch {}
  return [def([])];
}

// ─── Detect if a format is DRM-protected ─────────────────────────────────────
function isDRMProtected(f: Record<string, unknown>): boolean {
  const hasEncryption = !!f.has_drm || !!(f as any).is_drm || !!(f as any).drm;
  const manifestUrl = ((f.manifest_url as string) || "").toLowerCase();
  // Widevine/PlayReady signals
  const isDashDrm = manifestUrl.includes("widevine") || manifestUrl.includes("playready");
  return hasEncryption || isDashDrm;
}

// ─── Detect bogus / Next.js internal title ────────────────────────────────────
function isBogusTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  const BAD = ["_buildManifest", "_ssgManifest", "__NEXT_DATA__", "undefined", "null"];
  return BAD.some(b => title.includes(b)) || title.trim().length < 2;
}


// ─── Friendly error ───────────────────────────────────────────────────────────
function friendlyError(raw: string): string {
  if (raw.includes("DRM") || raw.includes("drm") || raw.includes("Widevine") || raw.includes("PlayReady"))
    return "🔒 This video is DRM-protected (Widevine/PlayReady). Download is not possible without a valid license key. Most premium OTT content (Hotstar, Netflix, Amazon Prime) is DRM-encrypted.";
  if (raw.includes("Unsupported URL") || raw.includes("is not a supported") ||
      raw.includes("No suitable extractor") || raw.includes("no extractor") ||
      (raw.includes("Unable to extract") && !raw.includes("youtube")) ||
      raw.includes("ExtractorError")) {
    return "This website uses Cloudflare protection or a custom player that blocks automated extractors. Please try a direct video or supported site link.";
  }
  if (raw.includes("Requested format is not available"))
    return "No downloadable formats found. The video may be private, region-locked, or require login.";
  // TikTok-specific: IP block from India/local IPs
  if (raw.includes("IP address is blocked") || raw.includes("blocked from accessing"))
    return "🚫 TikTok has blocked this IP address. This happens on home/office IPs in some regions. The download will work on cloud servers (Railway/Render). Try deploying to Railway and use the hosted version.";
  if (raw.includes("Video unavailable") || raw.includes("not available") || raw.includes("status code 0"))
    return "This video is unavailable. It may be private, deleted, or region-restricted.";
  // HTTP errors
  if (raw.includes("HTTP Error 403") || raw.includes("403 Forbidden") || raw.includes("403: Forbidden"))
    return "🚫 Access denied (HTTP 403). This video may require login, cookies, or is region-restricted.";
  if (raw.includes("HTTP Error 429") || raw.includes("429 Too Many") || raw.includes("Too Many Requests"))
    return "⏳ Rate limited (HTTP 429). Too many requests sent — wait a few minutes and try again.";
  if (raw.includes("HTTP Error 401") || raw.includes("401 Unauthorized"))
    return "🔑 Unauthorized (HTTP 401). This content requires authentication. Upload your cookies.txt file.";
  if (raw.includes("HTTP Error 410") || raw.includes("HTTP Error 404"))
    return "❌ Video not found (HTTP 404/410). The video may have been deleted or the URL is invalid.";
  // Geo/region
  if (raw.includes("not available in your country") || raw.includes("geo") || raw.includes("region") || raw.includes("GeoRestriction"))
    return "🌐 This video is geo-restricted and not available in your region.";
  // Premium/subscription
  if (raw.includes("Premium") || raw.includes("Music Premium") || raw.includes("subscription required") || raw.includes("subscribers only"))
    return "⭐ This content requires a premium subscription. Upload cookies from a logged-in premium account to download.";
  // Instagram-specific: "does not allow downloading public content without being logged-in"
  if (raw.includes("logged-in") || raw.includes("logged in") || raw.includes("without being logged") ||
      raw.includes("Sign in") || raw.includes("login") || raw.includes("Login required") ||
      /\bage\b/i.test(raw) || raw.includes("age-gate")) {
    if (raw.toLowerCase().includes("instagram"))
      return "🔑 Instagram requires login to download. Upload your Instagram browser cookies (cookies.txt) and re-analyze to unlock video formats.";
    if (raw.toLowerCase().includes("facebook"))
      return "🔑 Facebook requires login for this video. Upload your Facebook browser cookies (cookies.txt) and re-analyze.";
    return "🔑 This video requires login. Upload your cookies.txt file in Advanced Options and try again.";
  }
  // Private/members-only
  if (raw.includes("Private video") || raw.includes("private") || raw.includes("members only"))
    return "🔒 This video is private or members-only. You need to be logged in to access it — upload your cookies.txt.";
  if (raw.includes("No such file") || raw.includes("ffmpeg"))
    return "Video processing failed. Make sure ffmpeg is installed and in PATH.";
  if (raw.includes("socket timeout") || raw.includes("timed out") || raw.includes("Connection timeout"))
    return "⏱️ Request timed out. The server may be slow or the URL is unreachable. Try again in a moment.";
  if (raw.includes("Unable to connect") || raw.includes("Network error") || raw.includes("Name or service not known"))
    return "🌐 Network error. Check your internet connection and try again.";
  const cleaned = raw.replace(/\[\w+\]/g, "").trim().slice(-200);
  return cleaned || "An unknown error occurred. Please try again.";
}

// ─── OG Meta fallback (title + thumbnail from page HTML) ────────────────────
/**
 * Fetches the first ~50KB of the page and parses og:title and og:image.
 * Used as fallback when yt-dlp cannot extract title/thumbnail (DRM/login sites).
 */
async function fetchOGMeta(url: string): Promise<{ title?: string; thumbnail?: string }> {
  try {
    const mod = url.startsWith("https") ? await import("https") : await import("http");
    const html = await new Promise<string>((resolve, reject) => {
      const req = (mod as any).get(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml",
          "Accept-Language": "en-IN,en;q=0.9",
        },
        timeout: 6000,
      }, (res: any) => {
        let data = "";
        let bytes = 0;
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          data += chunk.toString();
          if (bytes > 60000) res.destroy(); // Only need <head> — stop early
        });
        res.on("end", () => resolve(data));
        res.on("close", () => resolve(data));
      });
      req.on("error", reject);
      req.on("timeout", () => { req.destroy(); reject(new Error("OG fetch timeout")); });
    });

    // og:title (try property= and name= variants)
    const rawTitle =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ??
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];

    // og:image
    const rawImage =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1];

    // Strip site-name suffix like " - JioHotstar" or " | Netflix"
    const title = rawTitle?.trim()?.replace(/\s*[-|–—|]\s*(JioHotstar|Hotstar|Netflix|SonyLIV|Zee5|Prime Video|MX Player).*$/i, "").trim();

    return { title: title || undefined, thumbnail: rawImage?.trim() || undefined };
  } catch {
    return {};
  }
}

// ─── Quality label ────────────────────────────────────────────────────────────
function heightToLabel(h: number): string {
  if (h >= 2160) return "4K";
  if (h >= 1440) return "2K";
  if (h >= 1080) return "1080p";
  if (h >= 720)  return "720p";
  if (h >= 480)  return "480p";
  if (h >= 360)  return "360p";
  if (h >= 240)  return "240p";
  if (h >= 144)  return "144p";
  return `${h}p`;
}

// ─── Codec label ──────────────────────────────────────────────────────────────
function buildCodecLabel(vcodec: string | null | undefined): string | null {
  if (!vcodec || vcodec === "none") return null;
  const v = vcodec.toLowerCase();
  if (v.startsWith("av01") || v.startsWith("av1")) return "AV1";
  if (v.startsWith("vp9") || v.startsWith("vp09")) return "VP9";
  if (v.startsWith("hev1") || v.startsWith("hvc1") || v.includes("hevc") || v.includes("h265")) return "H.265";
  if (v.startsWith("avc") || v.startsWith("h264") || v.includes("h.264")) return "H.264";
  if (v.startsWith("vp8")) return "VP8";
  return null;
}

// ─── Codec family for grouping ────────────────────────────────────────────────
function getCodecFamily(vcodec: string | null | undefined): string {
  if (!vcodec || vcodec === "none") return "other";
  const v = vcodec.toLowerCase();
  if (v.startsWith("av01") || v.startsWith("av1")) return "av1";
  if (v.startsWith("vp9") || v.startsWith("vp09")) return "vp9";
  if (v.startsWith("hev1") || v.startsWith("hvc1") || v.includes("hevc") || v.includes("h265")) return "h265";
  if (v.startsWith("avc") || v.startsWith("h264") || v.includes("h.264")) return "h264";
  if (v.startsWith("vp8")) return "vp8";
  return "other";
}

// Most-compatible codecs first (H.264 plays everywhere, AV1 is smallest, etc.)
const CODEC_PRIORITY = ["h264", "av1", "vp9", "h265", "vp8", "other"];

function isHDRFormat(f: Record<string, unknown>): boolean {
  const dyn = ((f.dynamic_range as string) || "").toLowerCase();
  const fmt = ((f.format_note as string) || "").toLowerCase();
  return dyn.includes("hdr") || fmt.includes("hdr") || fmt.includes("dolby") || fmt.includes("dv");
}

function isDolbyFormat(f: Record<string, unknown>): boolean {
  const fmt = ((f.format_note as string) || "").toLowerCase();
  const dyn = ((f.dynamic_range as string) || "").toLowerCase();
  return fmt.includes("dolby") || fmt.includes("dv") || dyn.includes("dv") || dyn.includes("dolby");
}

// Estimate file size from bitrate + duration
function estimateSize(tbr: number | null, duration: number | null): number | null {
  if (!tbr || !duration) return null;
  return Math.round((tbr * 1000 * duration) / 8); // bytes
}

// ─── yt-dlp runner ────────────────────────────────────────────────────────────
function runYtDlp(args: string[], baseArgs: string[] = DOWNLOAD_ARGS, timeoutMs = 90000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, [...baseArgs, ...args], { timeout: timeoutMs });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.slice(-800).trim() || `yt-dlp exited with code ${code}`));
    });
    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
    });
  });
}

// ─── Parse formats from yt-dlp JSON ──────────────────────────────────────────
function parseFormats(info: Record<string, unknown>): VideoFormat[] {
  const rawFormats: Record<string, unknown>[] = (info.formats as any) || [];
  const duration = (info.duration as number) || null;
  const formats: VideoFormat[] = [];

  // ── Step 1: Separate video streams by height+codec (DASH video-only or muxed) ──
  const heightGroups = new Map<string, Record<string, unknown>>();
  let drmCount = 0;

  for (const f of rawFormats) {
    const vcodec = f.vcodec as string;
    const h = (f.height as number) || 0;
    if (!vcodec || vcodec === "none") continue;
    if (isDRMProtected(f)) { drmCount++; continue; }

    // Accept even h=0 formats — label them "Best" instead of filtering them out
    const isHDR = isHDRFormat(f);
    const codecFamily = getCodecFamily(vcodec);
    const heightKey = h > 0 ? String(h) : "0";
    const groupKey = `${heightKey}-${codecFamily}-${isHDR ? "hdr" : "sdr"}`;
    const existing = heightGroups.get(groupKey);

    if (!existing) {
      heightGroups.set(groupKey, f);
    } else {
      const bitrate = (x: Record<string, unknown>) => ((x.tbr as number) || (x.vbr as number) || 0);
      if (bitrate(f) > bitrate(existing)) heightGroups.set(groupKey, f);
    }
  }

  // Sort: height desc → H.264 first → SDR before HDR
  let sortedKeys = Array.from(heightGroups.keys()).sort((a, b) => {
    const partsA = a.split("-");
    const partsB = b.split("-");
    const heightDiff = parseInt(partsB[0]) - parseInt(partsA[0]);
    if (heightDiff !== 0) return heightDiff;
    const codecDiff = CODEC_PRIORITY.indexOf(partsA[1]) - CODEC_PRIORITY.indexOf(partsB[1]);
    if (codecDiff !== 0) return codecDiff;
    return partsA[2] === "sdr" ? -1 : 1;
  });

  // Keep ≤360p only if no higher-res available
  const hasHigherRes = sortedKeys.some(k => parseInt(k.split("-")[0]) > 360);
  if (hasHigherRes) sortedKeys = sortedKeys.filter(k => parseInt(k.split("-")[0]) > 360);

  for (const key of sortedKeys) {
    const best = heightGroups.get(key)!;
    const parts = key.split("-");
    const height = parseInt(parts[0]);
    const isHDR = parts[2] === "hdr";
    const isDolby = isDolbyFormat(best);
    const hasAudio = !!(best.acodec as string) && (best.acodec as string) !== "none";
    const fmtId = best.format_id as string;
    const tbr = (best.tbr as number) || (best.vbr as number) || null;
    const codecLabel = buildCodecLabel(best.vcodec as string);
    const filesizeRaw = (best.filesize as number) || (best.filesize_approx as number) || null;
    const filesizeEst = filesizeRaw ? null : estimateSize(tbr, duration);

    let label = height > 0 ? heightToLabel(height) : "Best Available";
    if (isHDR) label += " HDR";
    if (isDolby) label += " DV";

    // If video-only (DASH), merge with bestaudio
    const combinedId = hasAudio ? fmtId : `${fmtId}+bestaudio[ext=m4a]/bestaudio`;

    formats.push({
      formatId: combinedId,
      quality: label,
      resolution: (best.width && best.height) ? `${best.width}x${best.height}` : (height > 0 ? `?x${height}` : null),
      ext: "mp4",  // Always MP4 output
      filesize: filesizeRaw,
      filesizeEstimated: filesizeEst,
      hasAudio: true,
      hasVideo: true,
      fps: (best.fps as number) || null,
      vcodec: (best.vcodec as string) || null,
      acodec: hasAudio ? (best.acodec as string) : "aac (merged)",
      tbr,
      vbr: (best.vbr as number) || null,
      abr: null,
      isHDR,
      isDolby,
      codecLabel,
    });
  }

  // ── Step 2: Fallback — combined-stream sites (TikTok, xnxx, ShareChat, etc.) ──
  // Triggers if Step 1 produced nothing (no video with recognizable codec/height)
  if (formats.length === 0) {
    const seen = new Set<string>();
    const combined = rawFormats
      .filter(f => {
        const v = f.vcodec as string;
        // Accept: both streams combined (v+a) OR video-only streams (v, a=none)
        return v && v !== "none";
      })
      .sort((a, b) => {
        const hd = ((b.height as number) || 0) - ((a.height as number) || 0);
        return hd !== 0 ? hd : ((b.tbr as number) || 0) - ((a.tbr as number) || 0);
      });

    for (const f of combined) {
      if (isDRMProtected(f)) continue;
      const h = (f.height as number) || 0;
      const label = h > 0 ? heightToLabel(h) : "Best";
      const key = `${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const tbr = (f.tbr as number) || null;
      const filesizeRaw = (f.filesize as number) || (f.filesize_approx as number) || null;
      const hasAudio = !!(f.acodec as string) && (f.acodec as string) !== "none";
      const fmtId = f.format_id as string;
      const combinedId = hasAudio ? fmtId : `${fmtId}+bestaudio[ext=m4a]/bestaudio`;
      formats.push({
        formatId: combinedId,
        quality: label,
        resolution: (f.width && f.height) ? `${f.width}x${f.height}` : null,
        ext: "mp4",  // Always MP4
        filesize: filesizeRaw,
        filesizeEstimated: filesizeRaw ? null : estimateSize(tbr, duration),
        hasAudio: true,
        hasVideo: true,
        fps: (f.fps as number) || null,
        vcodec: (f.vcodec as string) || null,
        acodec: hasAudio ? (f.acodec as string) : "aac (merged)",
        tbr,
        vbr: (f.vbr as number) || null,
        abr: null,
        isHDR: isHDRFormat(f),
        isDolby: isDolbyFormat(f),
        codecLabel: buildCodecLabel(f.vcodec as string),
      });
    }
  }

  // ── Step 3: GUARANTEED fallback — if yt-dlp returned JSON but zero video formats ──
  // This catches sites where yt-dlp can download but doesn't expose DASH/format list
  // (xnxx.health, many adult/CDN sites, single-stream sites with unknown format structure)
  const videoCount = formats.filter(f => f.hasVideo).length;
  if (videoCount === 0) {
    // Add quality stubs from 1080p down to 360p — yt-dlp will attempt each
    const stubs = [
      { label: "Best Available", fmt: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best", res: null },
      { label: "1080p",         fmt: "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]", res: "1920x1080" },
      { label: "720p",          fmt: "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]", res: "1280x720" },
      { label: "480p",          fmt: "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]", res: "854x480" },
      { label: "360p",          fmt: "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]", res: "640x360" },
    ];
    for (const s of stubs) {
      formats.push({
        formatId: s.fmt,
        quality: s.label,
        resolution: s.res,
        ext: "mp4",
        filesize: null, filesizeEstimated: null,
        hasAudio: true, hasVideo: true,
        fps: null, vcodec: null, acodec: null,
        tbr: null, vbr: null, abr: null,
        isHDR: false, isDolby: false,
        codecLabel: "Auto",
      });
    }
  }

  // ── Step 4: Audio formats ──────────────────────────────────────────────────────
  // Best M4A (actual extracted stream)
  const bestM4A = rawFormats
    .filter(f => (f.vcodec as string) === "none" && (f.ext as string) === "m4a")
    .sort((a, b) => ((b.abr as number) || (b.tbr as number) || 0) - ((a.abr as number) || (a.tbr as number) || 0))[0];

  if (bestM4A) {
    const abr = (bestM4A.abr as number) || (bestM4A.tbr as number) || null;
    formats.push({
      formatId: bestM4A.format_id as string,
      quality: "Audio Only",
      resolution: null, ext: "m4a",
      filesize: (bestM4A.filesize as number) || null, filesizeEstimated: null,
      hasAudio: true, hasVideo: false,
      fps: null, vcodec: null, acodec: (bestM4A.acodec as string) || "aac",
      tbr: null, vbr: null, abr,
      isHDR: false, isDolby: false, codecLabel: null,
    });
  }

  // MP3 always available
  formats.push({
    formatId: "bestaudio/best",
    quality: "Audio Only",
    resolution: null, ext: "mp3",
    filesize: null, filesizeEstimated: null,
    hasAudio: true, hasVideo: false,
    fps: null, vcodec: null, acodec: "mp3",
    tbr: null, vbr: null, abr: null,
    isHDR: false, isDolby: false, codecLabel: null,
  });

  return formats;
}

// ─── Analyze URL ──────────────────────────────────────────────────────────────
export async function analyzeUrl(url: string, cookiesFile?: string): Promise<VideoInfo> {
  const urlType = detectUrlType(url);
  const argSets = getExtractorArgSets(url);
  const isOTT = isKnownOTT(url);
  let raw: string | null = null;
  let lastError: Error | null = null;
  let authErrorDetected = false;

  // Extra args when cookies are provided
  const cookiesArgs: string[] = cookiesFile ? ["--cookies", cookiesFile] : [];
  if (cookiesFile) {
    logger.info({ cookiesFile }, "Using cookies file for analysis");
  }

  // ── LAYER 1: yt-dlp with platform-specific args ───────────────────────────
  if (urlType !== "hls" && urlType !== "direct") {
    for (const { base, extra } of argSets) {
      try {
        // 15s timeout (was 25s) — faster failure for DRM sites
        raw = await runYtDlp(["--dump-json", "--no-playlist", "--no-warnings", ...cookiesArgs, ...extra, url], base, 15000);
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const msg = lastError.message;
        if (isAuthError(msg)) authErrorDetected = true;
        logger.warn({ extraLen: extra.length, authErrorDetected }, "Layer 1: yt-dlp attempt failed");
      }
    }
  }

  // ── SHORT-CIRCUIT for known OTT on auth failure ────────────────────────────
  // Skip Layer 2+4 (browser) entirely — saves 30+ seconds of waiting.
  // BUT: if cookies were provided, do NOT short-circuit — give all layers a chance.
  if (raw === null && isOTT && authErrorDetected && !cookiesFile) {
    logger.info({ url }, "OTT auth error detected (no cookies) — skipping browser extraction");
    // Fall through directly to the stub return below
  } else {

  // ── LAYER 2: Force generic extractor ──────────────────────────────────────
  if (raw === null && urlType !== "hls" && urlType !== "direct" && (!isOTT || cookiesFile)) {
    try {
      raw = await runYtDlp(["--dump-json", ...cookiesArgs, url], GENERIC_EXTRACTOR_ARGS);
      logger.info({ url }, "Layer 2: generic extractor succeeded");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn({ err }, "Layer 2: generic extractor failed");
    }
  }


  // ── LAYER 3: Direct HLS/M3U8 ──────────────────────────────────────────────
  if (raw === null && (urlType === "hls" || url.includes(".m3u8") || url.includes(".mpd"))) {
    logger.info({ url }, "Layer 3: treating as direct HLS/DASH stream");
    const platform = detectPlatform(url);
    return {
      url, title: `Stream from ${platform}`,
      thumbnail: null, duration: null, platform,
      uploader: null, viewCount: null, description: null,
      sourceType: "hls",
      formats: [
        { formatId: "best", quality: "Best Available", resolution: null, ext: "mp4",
          filesize: null, filesizeEstimated: null, hasAudio: true, hasVideo: true,
          fps: null, vcodec: "h264", acodec: "aac", tbr: null, vbr: null, abr: null,
          isHDR: false, isDolby: false, codecLabel: "H.264" },
        { formatId: "bestaudio/best", quality: "Audio Only", resolution: null, ext: "mp3",
          filesize: null, filesizeEstimated: null, hasAudio: true, hasVideo: false,
          fps: null, vcodec: null, acodec: "mp3", tbr: null, vbr: null, abr: null,
          isHDR: false, isDolby: false, codecLabel: null },
      ],
    };
  }

  // ── LAYER 4: Playwright browser extraction ────────────────────────────────
  if (raw === null) {
    logger.info({ url }, "Layer 4: browser-based video extraction");
    try {
      let extracted = await browserExtractVideoUrl(url, 15000, true); // 15s headless
      if (!extracted && process.platform === "win32") {
        logger.info({ url }, "Layer 4: headless found nothing, retrying headful");
        extracted = await browserExtractVideoUrl(url, 20000, false); // 20s headful
      }
      if (extracted) {
        refererCache.set(extracted.videoUrl, extracted.referer);
        logger.info({ videoUrl: extracted.videoUrl }, "Layer 4: browser found video URL");
        try {
          raw = await runYtDlp(
            ["--dump-json",
             "--add-headers", `Referer:${extracted.referer}`,
             "--add-headers", `Origin:${extracted.referer}`,
             extracted.videoUrl],
            ANALYZE_BASE_ARGS,
          );
        } catch {
          const platform = detectPlatform(url);
          const isHLS = extracted.videoUrl.includes(".m3u8");
          return {
            url: extracted.videoUrl,
            title: extracted.title ?? `Video from ${platform}`,
            thumbnail: extracted.thumbnail,
            duration: null, platform,
            uploader: null, viewCount: null, description: null,
            sourceType: "browser",
            formats: [
              {
                formatId: "best", quality: "Best Available",
                resolution: null, ext: "mp4",
                filesize: null, filesizeEstimated: null,
                hasAudio: true, hasVideo: true,
                fps: null, vcodec: isHLS ? "h264" : null, acodec: "aac",
                tbr: null, vbr: null, abr: null,
                isHDR: false, isDolby: false, codecLabel: isHLS ? "H.264" : null,
              },
              {
                formatId: "bestaudio/best", quality: "Audio Only",
                resolution: null, ext: "mp3",
                filesize: null, filesizeEstimated: null,
                hasAudio: true, hasVideo: false,
                fps: null, vcodec: null, acodec: "mp3",
                tbr: null, vbr: null, abr: null,
                isHDR: false, isDolby: false, codecLabel: null,
              },
            ],
          };
        }
      } else {
        logger.warn({ url }, "Layer 4: browser extraction found no video URLs");
      }
    } catch (browserErr) {
      logger.error({ browserErr }, "Layer 4: browser extraction threw error");
    }
  }

  } // end else (non-OTT-shortcircuit path)

  if (raw === null) {
    const errMsg = lastError?.message ?? "Unknown error";
    const isLoginError = errMsg.includes("registered users") ||
      errMsg.includes("login") || errMsg.includes("Sign in") ||
      errMsg.includes("cookies") || errMsg.includes("authentication");
    const isDRMErr = errMsg.includes("DRM") || errMsg.includes("Widevine") || errMsg.includes("PlayReady");

    // For known OTT/DRM platforms: return a stub VideoInfo instead of throwing.
    const knownDRM = [
      "netflix.com", "primevideo.com", "disneyplus.com",
      "hulu.com", "hbomax.com", "max.com", "peacocktv.com",
      "hotstar.com", "jiohotstar.com",
    ];
    const knownLogin = [
      "zee5.com", "sonyliv.com", "voot.com", "jiocinema.com",
      "erosnow.com", "mxplayer.in", "altbalaji.com",
    ];
    const isKnownDRM = knownDRM.some(d => url.includes(d));
    const isKnownLogin = knownLogin.some(d => url.includes(d));
    const isKnownOTTSite = isKnownDRM || isKnownLogin;

    if (isLoginError || isDRMErr || isKnownOTTSite) {
      const platform = detectPlatform(url);
      let title = platform + " Video";
      try {
        const parts = new URL(url).pathname.split("/").filter(Boolean);
        const slug = parts.find(p => p.length > 3 && !/^\d+$/.test(p) && p !== "watch" && p !== "shows");
        if (slug) title = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      } catch {}

      // DRM (Netflix/Prime/Hotstar) → extension needed. Login-only → cookies may work.
      // BUT: if cookies were provided, always give them a chance — use "cookies" method + add format.
      const needsExtension = (isDRMErr || isKnownDRM) && !cookiesFile;
      const method: "extension" | "cookies" = needsExtension ? "extension" : "cookies";

      // Try to get real title + thumbnail from the page's OG meta tags
      const og = await fetchOGMeta(url).catch(() => ({} as { title?: string; thumbnail?: string }));
      if (og.title && !isBogusTitle(og.title)) title = og.title;
      const stubThumbnail = og.thumbnail || null;

      // When cookies are provided, offer multiple quality options so user can attempt at specific resolution
      const mkVideoStub = (label: string, fmtId: string, res: string | null, h: number | null) => ({
        formatId: fmtId,
        quality: label,
        resolution: res,
        ext: "mp4" as const,
        filesize: null, filesizeEstimated: null,
        hasAudio: true, hasVideo: true,
        fps: null, vcodec: null, acodec: null,
        tbr: null, vbr: null, abr: null,
        isHDR: false, isDolby: false,
        codecLabel: "via Cookies" as string | null,
      });
      const stubVideoFormats = cookiesFile ? [
        mkVideoStub("Best Available", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best", null, null),
        mkVideoStub("1080p",  "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080]", "1920×1080", 1080),
        mkVideoStub("720p",   "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720]",   "1280×720",  720),
        mkVideoStub("480p",   "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480]",   "854×480",   480),
        mkVideoStub("360p",   "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360]",   "640×360",   360),
      ] : [];

      logger.warn({ url, platform, isLoginError, isDRMErr, method, hasCookies: !!cookiesFile }, "Returning OTT stub");
      return {
        url, title,
        thumbnail: stubThumbnail, duration: null, platform,
        uploader: null, viewCount: null,
        description: needsExtension
          ? "🔒 DRM-protected (Widevine). Use the browser extension to capture the stream URL while it plays in your browser."
          : cookiesFile
            ? "🍪 Attempting download with your cookies. If it fails, the content may still be DRM-encrypted."
            : "🔑 Login required. Upload your cookies.txt file exported from your logged-in browser session.",
        formats: [
          ...stubVideoFormats,
          {
            formatId: "bestaudio/best",
            quality: "Audio Only", resolution: null, ext: "mp3",
            filesize: null, filesizeEstimated: null,
            hasAudio: true, hasVideo: false,
            fps: null, vcodec: null, acodec: "mp3",
            tbr: null, vbr: null, abr: null,
            isHDR: false, isDolby: false, codecLabel: null,
          },
        ],
        sourceType: "ytdlp" as const,
        requiresLogin: !cookiesFile,
        downloadMethod: method,
        ageRestricted: false, isLive: false,
      };
    }

    throw new Error(friendlyError(errMsg));
  }

  const info = JSON.parse(raw) as Record<string, unknown>;
  const platform = detectPlatform(url);
  const formats = parseFormats(info);
  const thumbnail = (info.thumbnail as string) || null;

  // ── Fix bogus title (Next.js _buildManifest, etc.) ──────────────────────────
  let title = (info.title as string) || "Untitled";
  if (isBogusTitle(title)) {
    try {
      const parts = new URL(url).pathname.split("/").filter(Boolean);
      const slug = parts.find(p => p.length > 3 && !/^\d+$/.test(p) && p !== "watch" && p !== "shows" && p !== "in");
      title = slug ? slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : platform + " Video";
    } catch { title = platform + " Video"; }
  }

  // ── Post-parse: browser extraction for public social platforms ─────────────
  // For Instagram: ALWAYS run browser extraction even if yt-dlp returned formats,
  // because yt-dlp format IDs are metadata-only and fail when actually downloading.
  // For other social platforms: run only when yt-dlp returned 0 video formats.
  const PUBLIC_SOCIAL_DOMAINS = [
    "instagram.com", "tiktok.com", "snapchat.com",
    "sharechat.com", "moj.in", "twitter.com", "x.com",
    "facebook.com", "fb.com", "fb.watch",  // Facebook public videos are accessible without login via browser
  ];
  const isPublicSocial = PUBLIC_SOCIAL_DOMAINS.some(d => url.includes(d));
  const isInstagram = url.includes("instagram.com");
  const isSnapchat = url.includes("snapchat.com");
  const isFacebook = url.includes("facebook.com") || url.includes("fb.com") || url.includes("fb.watch");
  const videoFormatsFound = formats.filter(f => f.hasVideo).length;

  // Instagram: always extract via browser (yt-dlp formats fail on download)
  // Snapchat/Facebook: always use browser extraction (yt-dlp rarely succeeds for these)
  // Others: only if no video found at all
  const shouldBrowserExtract = isInstagram || isSnapchat || isFacebook || (isPublicSocial && videoFormatsFound === 0);

  if (shouldBrowserExtract) {
    logger.info({ url, reason: isInstagram ? "instagram-override" : "no-formats" },
      "Post-parse: attempting browser extraction for public social platform");
    try {
      const extracted = await browserExtractVideoUrl(url, 22000, true);
      if (extracted?.videoUrl) {
        refererCache.set(extracted.videoUrl, extracted.referer);
        logger.info({ videoUrl: extracted.videoUrl.slice(0, 80) }, "Browser extraction succeeded");

        if (isInstagram) {
          // DON'T remove yt-dlp format entries — they show real quality options (1080p, 720p, etc.)
          // The download fallback in startDownload handles the auth error by using browser CDN URL.
          // Just mark them so the UI knows they may need a fallback.
          logger.info({ url }, "Instagram: keeping yt-dlp formats + adding direct CDN URL at top");
        }

        formats.unshift({
          formatId: `direct:${extracted.videoUrl}`,
          quality: "Best Available",
          resolution: null,
          ext: extracted.isHLS ? "mp4" : "mp4",
          filesize: null,
          filesizeEstimated: null,
          hasAudio: true,
          hasVideo: true,
          fps: null,
          vcodec: extracted.isHLS ? "h264" : null,
          acodec: "aac",
          tbr: null,
          vbr: null,
          abr: null,
          isHDR: false,
          isDolby: false,
          codecLabel: extracted.isHLS ? "H.264" : null,
        });
      } else if (isInstagram && videoFormatsFound > 0) {
        // Browser extraction returned no URL — warn that yt-dlp formats may need cookies
        logger.warn({ url }, "Instagram browser extraction returned no URL; marking yt-dlp formats as needing cookies");
        formats.filter(f => f.hasVideo).forEach(f => {
          (f as any).codecLabel = "⚠️ Needs Cookies";
        });
      }
    } catch (browserErr) {
      logger.warn({ browserErr, url }, "Post-parse browser extraction failed");
      if (isInstagram && videoFormatsFound > 0) {
        formats.filter(f => f.hasVideo).forEach(f => {
          (f as any).codecLabel = "⚠️ Needs Cookies";
        });
      }
    }
  }

  // ── DRM fallback: 0 video formats but raw video streams exist → add Best Available ──
  const allRaw: Record<string, unknown>[] = (info.formats as any) || [];
  const totalVideoRaw = allRaw.filter(f => (f.vcodec as string) && (f.vcodec as string) !== "none" && (f.height as number) > 0).length;
  // videoFormatsFound is already declared above in the post-parse block
  const isDrmSite = ["hotstar.com", "jiohotstar.com", "netflix.com", "primevideo.com",
    "sonyliv.com", "zee5.com", "voot.com", "jiocinema.com"].some(d => url.includes(d));


  if (videoFormatsFound === 0 && totalVideoRaw > 0) {
    formats.unshift({
      formatId: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best",
      quality: "Best Available",
      resolution: null, ext: "mp4",
      filesize: null, filesizeEstimated: null,
      hasAudio: true, hasVideo: true,
      fps: null, vcodec: null, acodec: null,
      tbr: null, vbr: null, abr: null,
      isHDR: false, isDolby: false,
      codecLabel: isDrmSite ? "⚠️ Needs Cookies" : null,
    });
  }

  // Parse chapters
  const rawChapters = (info.chapters as any[]) || [];
  const chapters: VideoChapter[] = rawChapters.map((c: any) => ({
    title: c.title || "Chapter",
    startTime: c.start_time || 0,
    endTime: c.end_time || 0,
  }));

  // Parse subtitles
  const rawSubs = (info.subtitles as Record<string, unknown>) || {};
  const subtitles: SubtitleInfo[] = Object.entries(rawSubs).map(([lang, data]) => ({
    lang,
    name: (data as any)?.[0]?.name || lang,
  }));

  // requiresLogin:
  // - Public social platforms (Instagram, TikTok, Snapchat, Moj, Twitter) → NEVER requiresLogin
  //   even if yt-dlp auth-failed, because the content is publicly accessible via browser.
  // - OTT/DRM platforms or private content → yes, flag it.
  const hasVideoFormats = formats.some(f => f.hasVideo);
  const requiresLogin = !hasVideoFormats && !!lastError && isAuthError(lastError.message) && !isPublicSocial;
  // downloadMethod: direct if video formats found, cookies if auth error, extension for HLS/browser
  let downloadMethod: VideoInfo["downloadMethod"] = "direct";
  if (requiresLogin) downloadMethod = "cookies";

  return {
    url,
    title,
    thumbnail,
    duration: (info.duration as number) || null,
    platform,
    uploader: (info.uploader as string) || null,
    viewCount: (info.view_count as number) || null,
    description: (info.description as string) || null,
    formats,
    chapters: chapters.length > 0 ? chapters : undefined,
    subtitles: subtitles.length > 0 ? subtitles : undefined,
    isLive: !!(info.is_live as boolean),
    ageRestricted: !!(info.age_limit as number),
    requiresLogin,
    downloadMethod,
    sourceType: "ytdlp" as const,
  };
}


// ─── Platform watermark/logo filter ──────────────────────────────────────────
/**
 * Returns an ffmpeg -vf filter string for platform-specific watermark/logo removal.
 * OTT platforms: delogo (blurs the logo area). TikTok/Instagram: crop bottom.
 * Returns null if no known filter for this URL.
 */
export function getPlatformWatermarkFilter(url: string): string | null {
  const lower = url.toLowerCase();
  // Short-form video watermarks (bottom bar with username/logo)
  if (lower.includes("tiktok.com"))    return "crop=iw:ih*0.92:0:0";         // bottom 8%
  if (lower.includes("instagram.com")) return "crop=iw:ih*0.93:0:0";         // bottom 7%
  if (lower.includes("snapchat.com"))  return "crop=iw:ih*0.93:0:0";
  // Indian OTT — top-left channel logo
  if (lower.includes("hotstar.com") || lower.includes("jiohotstar.com"))
    return "delogo=x=8:y=8:w=135:h=58:show=0";
  if (lower.includes("sonyliv.com"))
    return "delogo=x=8:y=8:w=110:h=50:show=0";
  if (lower.includes("zee5.com"))
    return "delogo=x=8:y=8:w=100:h=44:show=0";
  if (lower.includes("voot.com"))
    return "delogo=x=8:y=8:w=95:h=42:show=0";
  if (lower.includes("mxplayer.in"))
    return "delogo=x=8:y=8:w=112:h=50:show=0";
  if (lower.includes("jiocinema.com"))
    return "delogo=x=8:y=8:w=122:h=52:show=0";
  if (lower.includes("erosnow.com"))
    return "delogo=x=8:y=8:w=100:h=46:show=0";
  if (lower.includes("altbalaji.com"))
    return "delogo=x=8:y=8:w=110:h=48:show=0";
  if (lower.includes("hoichoi.tv"))
    return "delogo=x=8:y=8:w=100:h=44:show=0";
  // Global OTT
  if (lower.includes("netflix.com"))
    return "delogo=x=8:y=8:w=82:h=52:show=0";
  if (lower.includes("primevideo.com") || lower.includes("amazon.com"))
    return "delogo=x=8:y=8:w=132:h=56:show=0";
  if (lower.includes("disneyplus.com") || lower.includes("hotstar.com"))
    return "delogo=x=8:y=8:w=112:h=50:show=0";
  if (lower.includes("hbomax.com") || lower.includes("max.com"))
    return "delogo=x=8:y=8:w=95:h=46:show=0";
  if (lower.includes("hulu.com"))
    return "delogo=x=8:y=8:w=90:h=42:show=0";
  if (lower.includes("peacocktv.com"))
    return "delogo=x=8:y=8:w=110:h=50:show=0";
  // Fallback for any known OTT: remove both top-left and top-right corners
  if (isKnownOTT(url))
    // NOTE: delogo does NOT support expressions (iw-145 is invalid). Use literal pixel values only.
    // 1775 = 1920 - 145, covers top-right logo on standard HD. 835 covers 980px wide (480p).
    return "delogo=x=5:y=5:w=140:h=60:show=0";
  return null;
}

// ─── Download options ─────────────────────────────────────────────────────────
export interface DownloadOptions {
  url: string;
  formatId?: string;
  outputFormat: string;
  quality?: string;
  removeWatermark?: boolean;
  outputFilename: string;
  cookiesFile?: string;
  platform?: string;
  customHeaders?: Record<string, string>;
}

export function startDownload(
  options: DownloadOptions,
  onProgress: (progress: number, speed?: string, eta?: string, downloaded?: string) => void,
  onDone: (filename: string, filesize: number | null) => void,
  onError: (error: string) => void,
): void {
  const outputPath = path.join(DOWNLOADS_DIR, options.outputFilename);
  const ffmpegPath = findFfmpeg();
  const jobId = path.basename(options.outputFilename, path.extname(options.outputFilename));

  const isHLSUrl = options.url.includes(".m3u8") || options.url.includes(".mpd");
  const urlType = detectUrlType(options.url);

  // ── Browser-extracted direct CDN URL (format ID starts with 'direct:') ────
  if (options.formatId?.startsWith("direct:")) {
    const directUrl = options.formatId.replace(/^direct:/, "");
    const cachedRef = refererCache.get(directUrl) || refererCache.get(options.url) || options.url;
    const isHLS = /\.m3u8/i.test(directUrl);
    if (isHLS) {
      downloadHLS({
        manifestUrl: directUrl,
        outputPath,
        referer: cachedRef,
        onProgress: (pct) => onProgress(pct),
      })
        .then(() => onDone(options.outputFilename, null))
        .catch((err) => onError(friendlyError(err.message)));
    } else {
      // Direct MP4/video file — download with yt-dlp using the direct CDN URL
      const directArgs = [
        "--no-warnings", "--newline", "-o", outputPath,
        "--add-headers", `Referer:${cachedRef}`,
        "--add-headers", `Origin:${cachedRef}`,
        "-f", "best",
        directUrl,
      ];
      const directProc = spawn(YTDLP_BIN, [...DOWNLOAD_ARGS, ...directArgs]);
      let directStderr = "";
      directProc.stdout.on("data", (chunk: Buffer) => {
        const line = chunk.toString();
        const m = line.match(/\[download\]\s+([\d.]+)%/);
        if (m) onProgress(Math.round(parseFloat(m[1])));
      });
      directProc.stderr.on("data", (d: Buffer) => { directStderr += d.toString(); });
      directProc.on("close", (code) => {
        if (code === 0) onDone(options.outputFilename, null);
        else onError(friendlyError(directStderr.slice(-400)));
      });
      directProc.on("error", (err) => onError(`Failed to start download: ${err.message}`));
    }
    return;
  }

  // ── HLS direct download via ffmpeg ────────────────────────────────────────

  if (urlType === "hls" || (isHLSUrl && options.formatId === "best")) {
    const cachedReferer = refererCache.get(options.url);
    downloadHLS({
      manifestUrl: options.url,
      outputPath,
      referer: cachedReferer,
      onProgress: (pct) => onProgress(pct),
    })
      .then(() => onDone(options.outputFilename, null))
      .catch((err) => onError(friendlyError(err.message)));
    return;
  }

  const args: string[] = [
    "--no-playlist", "--no-warnings", "--newline",
    "-o", outputPath,
  ];

  // Referer from cache
  const cachedReferer = refererCache.get(options.url);
  if (cachedReferer) {
    args.push("--add-headers", `Referer:${cachedReferer}`, "--add-headers", `Origin:${cachedReferer}`);
  }

  // Custom headers
  if (options.customHeaders) {
    for (const [key, value] of Object.entries(options.customHeaders)) {
      args.push("--add-headers", `${key}:${value}`);
    }
  }

  // Cookies file
  if (options.cookiesFile && existsSync(options.cookiesFile)) {
    args.push("--cookies", options.cookiesFile);
  }

  if (options.outputFormat === "mp3") {
    args.push("-x", "--audio-format", "mp3", "--audio-quality", "0");
  } else if (options.outputFormat === "m4a") {
    args.push("-x", "--audio-format", "m4a");
  } else if (options.outputFormat === "flac") {
    args.push("-x", "--audio-format", "flac");
  } else if (options.outputFormat === "wav") {
    args.push("-x", "--audio-format", "wav");
  } else {
    // Height-based quality selection
    const qualityToHeight = (q: string): number | null => {
      if (q === "4K" || q === "4K HDR") return 2160;
      if (q === "2K" || q === "2K HDR") return 1440;
      const m = q.match(/^(\d+)p/i);
      return m ? parseInt(m[1], 10) : null;
    };
    const isHDR = options.quality?.includes("HDR");
    const h = options.quality ? qualityToHeight(options.quality) : null;

    if (h !== null) {
      const hdrFilter = isHDR ? "" : "";
      args.push("-f",
        `bestvideo[height<=${h}][ext=mp4]+bestaudio[ext=m4a]` +
        `/bestvideo[height<=${h}][ext=mp4]+bestaudio` +
        `/bestvideo[height<=${h}]+bestaudio[ext=m4a]` +
        `/bestvideo[height<=${h}]+bestaudio` +
        `/best[height<=${h}]` +
        `/bestvideo[ext=mp4]+bestaudio[ext=m4a]` +
        `/bestvideo+bestaudio/best`
      );
    } else if (options.formatId && options.formatId !== "best") {
      args.push("-f", `${options.formatId}/bestvideo+bestaudio/best`);
    } else {
      args.push("-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best");
    }

    const outFmt = options.outputFormat === "mkv" ? "mkv" :
                   options.outputFormat === "webm" ? "webm" : "mp4";
    args.push("--merge-output-format", outFmt);

    // ── Watermark removal via ffmpeg post-processor ──────────────────────────
    if (options.removeWatermark) {
      const wmFilter = getPlatformWatermarkFilter(options.url);
      if (wmFilter) {
        // Inject ffmpeg filter during the merge/remux step (works for DASH/HLS)
        args.push("--postprocessor-args", `Merger:-vf ${wmFilter}`);
        args.push("--postprocessor-args", `FFmpegVideoConvertor:-vf ${wmFilter}`);
        logger.info({ wmFilter, url: options.url }, "Watermark removal filter applied");
      } else {
        // Generic: remove top-left logo area.
        // NOTE: delogo does NOT support expressions (iw-145 is invalid) — literal ints only.
        const genericFilter = "delogo=x=5:y=5:w=140:h=60:show=0";
        args.push("--postprocessor-args", `Merger:-vf ${genericFilter}`);
      }
    }
  }

  args.push("--ffmpeg-location", ffmpegPath, options.url);

  // Add platform-specific extractor args (same as analyze uses for geo-bypass etc.)
  const dlExtractorArgSets = getExtractorArgSets(options.url);
  const dlExtractorArgs = dlExtractorArgSets.length > 0
    ? [...dlExtractorArgSets[0].base, ...dlExtractorArgSets[0].extra]
    : [];

  logger.info({ args: args.slice(0, 10), hasCookies: !!options.cookiesFile }, "Starting download");

  const proc = spawn(YTDLP_BIN, [...DOWNLOAD_ARGS, ...dlExtractorArgs, ...args]);
  let lastProgress = 0;
  let stderrBuf = "";

  proc.stdout.on("data", (chunk: Buffer) => {
    const line = chunk.toString();
    // Match: [download]  45.3% of   58.23MiB at    2.34MiB/s ETA 00:20
    const fullMatch = line.match(/\[download\]\s+([\d.]+)%\s+of\s+[\d.]+\S+\s+at\s+([\d.]+\S+)\s+ETA\s+(\S+)/);
    const simpleMatch = line.match(/\[download\]\s+([\d.]+)%/);

    if (fullMatch) {
      const pct = Math.round(parseFloat(fullMatch[1]));
      const speed = fullMatch[2];
      const eta = fullMatch[3];
      if (pct > lastProgress) {
        lastProgress = pct;
        onProgress(pct, speed, eta);
      }
    } else if (simpleMatch) {
      const pct = Math.round(parseFloat(simpleMatch[1]));
      if (pct > lastProgress) {
        lastProgress = pct;
        onProgress(pct);
      }
    }
  });

  proc.stderr.on("data", (chunk: Buffer) => { stderrBuf += chunk.toString(); });

  proc.on("close", (code) => {
    if (code === 0) {
      let actualFilename = options.outputFilename;
      try {
        const files = readdirSync(DOWNLOADS_DIR);
        const match = files.find(
          (f) => path.basename(f, path.extname(f)) === jobId
            && !f.endsWith(".part")
            && !f.endsWith(".ytdl")
            && !f.endsWith(".cookies.txt")   // don't pick up our cookies file
        );
        if (match) actualFilename = match;
      } catch {}
      const fp = path.join(DOWNLOADS_DIR, actualFilename);
      const filesize = existsSync(fp) ? statSync(fp).size : null;
      onDone(actualFilename, filesize);
      return;
    }

    // ── Auth error on public social → try browser extraction fallback ──────────
    const errMsg = stderrBuf.slice(-600).trim() || `yt-dlp exited with code ${code}`;
    const SOCIAL_DOMAINS = ["instagram.com", "tiktok.com", "snapchat.com"];
    const isSocialUrl = SOCIAL_DOMAINS.some(d => options.url.includes(d));
    const isAuthFailure = /logged.in|without being logged|login required|authentication|not allow.*without/i.test(errMsg);

    if (isSocialUrl && isAuthFailure && !options.cookiesFile) {
      logger.info({ url: options.url }, "Download auth error — trying browser extraction fallback");
      (async () => {
        try {
          const extracted = await browserExtractVideoUrl(options.url, 25000, true);
          if (extracted?.videoUrl) {
            const cdnUrl = extracted.videoUrl;
            const referer = refererCache.get(cdnUrl) || refererCache.get(options.url) || options.url;
            logger.info({ cdnUrl: cdnUrl.slice(0, 80) }, "Browser fallback during download succeeded — downloading CDN URL");

            if (/\.m3u8/i.test(cdnUrl)) {
              downloadHLS({ manifestUrl: cdnUrl, outputPath, referer, onProgress: (pct) => onProgress(pct) })
                .then(() => { onDone(options.outputFilename, null); })
                .catch((e) => onError(friendlyError(e.message)));
            } else {
              const dlArgs = [
                "--no-warnings", "--newline", "-o", outputPath,
                "--add-headers", `Referer:${referer}`,
                "--add-headers", `Origin:${referer}`,
                "-f", "best", cdnUrl,
              ];
              const dlProc = spawn(YTDLP_BIN, [...DOWNLOAD_ARGS, ...dlArgs]);
              let dlStderr = "";
              dlProc.stdout.on("data", (chunk: Buffer) => {
                const m = chunk.toString().match(/\[download\]\s+([\d.]+)%/);
                if (m) onProgress(Math.round(parseFloat(m[1])));
              });
              dlProc.stderr.on("data", (d: Buffer) => { dlStderr += d.toString(); });
              dlProc.on("close", (c) => {
                if (c === 0) {
                  const fp = path.join(DOWNLOADS_DIR, options.outputFilename);
                  onDone(options.outputFilename, existsSync(fp) ? statSync(fp).size : null);
                } else {
                  onError(friendlyError(dlStderr.slice(-300)));
                }
              });
              dlProc.on("error", (e) => onError(`CDN download failed: ${e.message}`));
            }
            return;
          }
        } catch (fbErr) {
          logger.warn({ fbErr }, "Browser download fallback failed");
        }
        // All fallbacks exhausted
        const platform = options.url.includes("instagram") ? "Instagram" : "this platform";
        onError(`🔑 ${platform} requires login. Please upload your browser cookies (cookies.txt) and re-analyze to unlock downloads.`);
      })();
      return;
    }

    onError(friendlyError(errMsg));
  });

  proc.on("error", (err) => { onError(`Failed to start download: ${err.message}`); });
}

// ─── FFmpeg edit ──────────────────────────────────────────────────────────────
export async function applyEdits(
  inputFilename: string,
  outputFilename: string,
  trimStart?: number | null,
  trimEnd?: number | null,
  removeWatermark?: boolean,
  outputFormat?: string,
  speed?: number | null,
  muteAudio?: boolean | null,
  volume?: number | null,
  voiceEffect?: string | null,
  // Advanced params
  removeBackground?: boolean | null,
  pitchSemitones?: number | null,
  brightness?: number | null,
  contrast?: number | null,
  saturation?: number | null,
  blur?: number | null,
  sharpen?: number | null,
  visualFilter?: string | null,
  flipHorizontal?: boolean | null,
  flipVertical?: boolean | null,
  rotate?: number | null,
  // Trim mode: "keep" = keep selected region (default), "delete" = remove selected region
  trimMode?: "keep" | "delete" | null,
  // Video duration (needed for delete mode)
  videoDuration?: number | null,
): Promise<void> {
  const inputPath = path.join(DOWNLOADS_DIR, inputFilename);
  const outputPath = path.join(DOWNLOADS_DIR, outputFilename);
  const ffmpegBin = findFfmpeg();  // Use bundled ffmpeg, not bare system "ffmpeg"

  if (!existsSync(inputPath)) throw new Error(`Input file not found: ${inputFilename}`);

  const isDeleteMode = trimMode === "delete" && trimStart != null && trimEnd != null;

  // ── DELETE MODE: remove selected region, keep outside parts ──────────────────
  if (isDeleteMode) {
    const seg1End = trimStart!;
    const seg2Start = trimEnd!;
    const dur = videoDuration ?? 0;

    const isAudioOnly = outputFormat === "mp3" || outputFormat === "m4a" || outputFormat === "flac" || outputFormat === "wav";

    // Build concat filter for delete mode
    // Segment 1: [0 → trimStart], Segment 2: [trimEnd → end]
    const filterParts: string[] = [];
    const mapArgs: string[] = [];

    if (!isAudioOnly) {
      filterParts.push(`[0:v]trim=0:${seg1End.toFixed(3)},setpts=PTS-STARTPTS[v0]`);
      if (dur > 0 && seg2Start < dur) {
        filterParts.push(`[0:v]trim=start=${seg2Start.toFixed(3)},setpts=PTS-STARTPTS[v1]`);
        filterParts.push(`[v0][v1]concat=n=2:v=1:a=0[vout]`);
      } else {
        filterParts.push(`[v0]copy[vout]`);
      }
    }
    if (!muteAudio) {
      filterParts.push(`[0:a]atrim=0:${seg1End.toFixed(3)},asetpts=PTS-STARTPTS[a0]`);
      if (dur > 0 && seg2Start < dur) {
        filterParts.push(`[0:a]atrim=start=${seg2Start.toFixed(3)},asetpts=PTS-STARTPTS[a1]`);
        filterParts.push(`[a0][a1]concat=n=2:v=0:a=1[aout]`);
      } else {
        filterParts.push(`[a0]acopy[aout]`);
      }
    }

    const deleteArgs = ["-y", "-i", inputPath, "-filter_complex", filterParts.join(";")];
    if (!isAudioOnly) deleteArgs.push("-map", "[vout]");
    if (!muteAudio) deleteArgs.push("-map", "[aout]");
    else deleteArgs.push("-an");

    // Output codec
    if (isAudioOnly) {
      deleteArgs.push("-vn");
      if (outputFormat === "mp3") deleteArgs.push("-c:a", "libmp3lame", "-q:a", "2");
      else if (outputFormat === "flac") deleteArgs.push("-c:a", "flac");
      else if (outputFormat === "wav") deleteArgs.push("-c:a", "pcm_s16le");
      else deleteArgs.push("-c:a", "aac", "-b:a", "192k");
    } else {
      deleteArgs.push("-c:v", "libx264", "-preset", "fast", "-crf", "22");
      if (!muteAudio) deleteArgs.push("-c:a", "aac", "-b:a", "192k");
      deleteArgs.push("-movflags", "+faststart");
    }
    deleteArgs.push(outputPath);

    logger.info({ inputFilename, outputFilename, seg1End, seg2Start }, "Running ffmpeg delete-segment edit");
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegBin, deleteArgs);
      let stderr = "";
      proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg delete-segment failed (code ${code}): ${stderr.slice(-600).trim()}`));
      });
      proc.on("error", (e) => reject(new Error(`FFmpeg not found or failed to start: ${e.message}. Ensure ffmpeg is installed.`)));
    });
  }

  // ── KEEP MODE (default): trim to selected region ──────────────────────────────
  const args: string[] = ["-y"];
  if (trimStart != null && trimStart > 0) args.push("-ss", String(trimStart));
  args.push("-i", inputPath);
  if (trimEnd != null && trimEnd > 0) {
    const dur = (trimStart && trimStart > 0) ? trimEnd - trimStart : trimEnd;
    args.push("-t", String(Math.max(0, dur)));
  }

  const isAudioOnly = outputFormat === "mp3" || outputFormat === "m4a" || outputFormat === "flac" || outputFormat === "wav";
  const vfilters: string[] = [];
  const afilters: string[] = [];

  // ── Video filters ─────────────────────────────────────────────────────────
  if (!isAudioOnly) {
    // Watermark / logo removal
    if (removeWatermark) {
      // Remove top-left logo area (OTT platforms like Hotstar, SonyLIV, etc.)
      // NOTE: delogo does NOT support expressions like iw-145 — only literal integers.
      // Crop and delogo cannot be safely chained for all videos, so apply only top-left.
      vfilters.push("delogo=x=5:y=5:w=140:h=60:show=0");
    }

    // Speed (video PTS)
    const effectiveSpeed = speed && speed !== 1 ? Math.max(0.25, Math.min(4, speed)) : null;
    if (effectiveSpeed) vfilters.push(`setpts=${(1 / effectiveSpeed).toFixed(4)}*PTS`);

    // Flip
    if (flipHorizontal) vfilters.push("hflip");
    if (flipVertical) vfilters.push("vflip");

    // Rotate
    if (rotate === 90) vfilters.push("transpose=1");
    else if (rotate === 180) vfilters.push("transpose=1,transpose=1");
    else if (rotate === 270) vfilters.push("transpose=2");

    // Blur
    if (blur && blur > 0) {
      const r = Math.round(blur * 2) * 2 + 1; // must be odd
      vfilters.push(`gblur=sigma=${blur.toFixed(1)}`);
    }

    // Sharpen
    if (sharpen && sharpen > 0) {
      const s = Math.min(5, sharpen);
      vfilters.push(`unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=${s.toFixed(1)}`);
    }

    // Brightness / Contrast / Saturation via eq filter
    const hasBCS = (brightness != null && brightness !== 0) ||
                   (contrast != null && contrast !== 1.0 && contrast != null) ||
                   (saturation != null && saturation !== 1.0 && saturation != null);
    if (hasBCS) {
      const b = brightness ?? 0;
      const c = contrast ?? 1.0;
      const s = saturation ?? 1.0;
      vfilters.push(`eq=brightness=${b.toFixed(2)}:contrast=${c.toFixed(2)}:saturation=${s.toFixed(2)}`);
    }

    // Visual filter presets (applied via explicit ffmpeg filters — avoid invalid named presets)
    if (visualFilter && visualFilter !== "none") {
      if (visualFilter === "bw") {
        vfilters.push("colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3");
      } else if (visualFilter === "sepia") {
        vfilters.push("colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131");
      } else if (visualFilter === "vintage") {
        // Warm tones + slight desaturation + vignette (no named curve preset)
        vfilters.push("eq=saturation=0.85:contrast=1.1,colorbalance=rs=0.07:rh=0.05:gs=-0.02:bs=-0.05,vignette=PI/4");
      } else if (visualFilter === "cinematic") {
        // High contrast + desaturation + vignette
        vfilters.push("eq=contrast=1.2:saturation=0.8,colorbalance=bs=-0.05:bh=-0.05,vignette=PI/5");
      } else if (visualFilter === "cold") {
        vfilters.push("colorbalance=bs=0.15:bh=0.1,eq=saturation=1.1");
      } else if (visualFilter === "warm") {
        vfilters.push("colorbalance=rs=0.1:rh=0.08,eq=saturation=1.05");
      } else if (visualFilter === "fade") {
        vfilters.push("eq=brightness=0.12:contrast=0.75:saturation=0.7");
      }
    }
  }

  // ── Audio filters ─────────────────────────────────────────────────────────
  if (muteAudio) {
    args.push("-an");
  } else {
    // Volume
    if (volume != null && volume !== 100) afilters.push(`volume=${(volume / 100).toFixed(2)}`);

    // Speed audio (atempo chain)
    const effectiveSpeed = speed && speed !== 1 ? Math.max(0.25, Math.min(4, speed)) : null;
    if (effectiveSpeed) {
      const buildAtempo = (s: number): string[] => {
        const f: string[] = [];
        while (s > 2.0) { f.push("atempo=2.0"); s /= 2.0; }
        while (s < 0.5) { f.push("atempo=0.5"); s *= 2.0; }
        f.push(`atempo=${s.toFixed(4)}`);
        return f;
      };
      afilters.push(...buildAtempo(effectiveSpeed));
    }

    // Background voice removal (remove music, keep vocals) via bandpass
    if (removeBackground) {
      // Keep vocals (300Hz–3400Hz) and attenuate background music bands
      afilters.push(
        "highpass=f=80",
        "lowpass=f=8000",
        "equalizer=f=200:t=o:w=100:g=-8",   // reduce low rumble
        "equalizer=f=8000:t=o:w=2000:g=-6", // reduce high hiss
      );
    }

    // Pitch shift (in semitones) — asetrate approach
    if (pitchSemitones && pitchSemitones !== 0) {
      const factor = Math.pow(2, pitchSemitones / 12);
      const newRate = Math.round(44100 * factor);
      afilters.push(`aresample=44100,asetrate=${newRate},aresample=44100`);
    }

    // Voice effect presets
    const effect = voiceEffect || "normal";
    if (effect === "chipmunk")  afilters.push("aresample=44100,asetrate=66150,aresample=44100");
    else if (effect === "deep") afilters.push("aresample=44100,asetrate=30870,aresample=44100");
    else if (effect === "robot") afilters.push("aecho=0.8:0.88:10:0.7,chorus=0.5:0.9:50:0.4:0.25:2");
    else if (effect === "echo") afilters.push("aecho=0.8:0.9:700|900:0.35|0.2");
    else if (effect === "telephone") afilters.push("highpass=f=300,lowpass=f=3400,volume=1.5");
    else if (effect === "bass")   afilters.push("equalizer=f=100:t=o:w=50:g=8,equalizer=f=200:t=o:w=100:g=4");
    else if (effect === "treble") afilters.push("equalizer=f=8000:t=o:w=2000:g=6,equalizer=f=12000:t=o:w=3000:g=4");
    else if (effect === "hall")   afilters.push("aecho=0.5:0.7:500:0.5");

    if (afilters.length > 0) args.push("-af", afilters.join(","));
  }

  if (vfilters.length > 0 && !isAudioOnly) args.push("-vf", vfilters.join(","));

  // ── Output codec ─────────────────────────────────────────────────────────
  // Fast path: if no filters at all, use stream copy (trim-only = near instant)
  const hasNoFilters = vfilters.length === 0 && afilters.length === 0 && !muteAudio;
  const isFormatCompatible = !outputFormat || outputFormat === "mp4" || outputFormat === "mkv";

  if (hasNoFilters && isFormatCompatible && !isAudioOnly) {
    // Stream copy — no re-encode, just cut/remux. Nearly instantaneous.
    args.push("-c:v", "copy", "-c:a", "copy");
    args.push("-avoid_negative_ts", "make_zero");
    args.push("-movflags", "+faststart");
  } else if (isAudioOnly) {
    args.push("-vn");
    if (outputFormat === "mp3") args.push("-c:a", "libmp3lame", "-q:a", "2");
    else if (outputFormat === "flac") args.push("-c:a", "flac");
    else if (outputFormat === "wav") args.push("-c:a", "pcm_s16le");
    else args.push("-c:a", "aac", "-b:a", "192k");
  } else {
    // Full re-encode (filters applied)
    args.push("-c:v", "libx264", "-preset", "fast", "-crf", "22");
    if (!muteAudio) args.push("-c:a", "aac", "-b:a", "192k");
    args.push("-movflags", "+faststart");
  }

  args.push(outputPath);
  logger.info({ inputFilename, outputFilename, filters: { vfilters, afilters } }, "Running ffmpeg edit");

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, args);  // Use findFfmpeg() result, not bare "ffmpeg"
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg failed (code ${code}): ${stderr.slice(-600).trim()}`));
    });
    proc.on("error", (e) => reject(new Error(`FFmpeg not found or failed to start: ${e.message}. Ensure ffmpeg is installed in PATH or bundled.`)));
  });
}
