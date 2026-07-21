import { chromium } from "playwright-core";
import { existsSync } from "fs";
import { logger } from "./logger";

// ─── Find system browser ──────────────────────────────────────────────────────
function findSystemBrowser(): string | null {
  const user = process.env["USERNAME"] || process.env["USER"] || "";
  const candidates = [
    // Windows — Chrome
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    `C:\\Users\\${user}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
    // Windows — Edge (always on Win10+)
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    // Linux
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser", "/usr/bin/chromium",
    "/snap/bin/chromium",
    // macOS
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      logger.info({ executablePath: p }, "Found system browser");
      return p;
    }
  }
  return null;
}

export interface BrowserExtractResult {
  videoUrl: string;
  referer: string;
  title: string | null;
  thumbnail: string | null;
  isHLS?: boolean;
  isDASH?: boolean;
  isBlob?: boolean;
}

// ─── URL scoring ──────────────────────────────────────────────────────────────
const VIDEO_URL_PATTERNS = [
  { pattern: /\.m3u8(\?|$)/i,             priority: 10 },
  { pattern: /\.mpd(\?|$)/i,              priority: 9  },
  { pattern: /\/hls\//i,                   priority: 8  },
  { pattern: /\/stream\//i,               priority: 7  },
  // Only match video manifests — NOT Next.js _buildManifest.js
  { pattern: /manifest\.m3u8/i,           priority: 9  },
  { pattern: /\/videoplayback/i,          priority: 8  },
  { pattern: /\.mp4(\?|$)/i,             priority: 5  },
  { pattern: /\.webm(\?|$)/i,            priority: 4  },
  { pattern: /\.ts(\?|$)/i,              priority: 3  },
];

const SKIP_PATTERNS = [
  /\.(gif|jpg|jpeg|png|webp|svg|ico)([\?#]|$)/i,
  /ads?[_\-./]/i, /analytics/i, /tracking/i, /pixel/i,
  /\/(css|fonts?|icons?)\//i,
  /google-analytics/i, /doubleclick/i, /adservice/i,
  /\/ad\//i, /\.adserver\./i,
  // Next.js / webpack internal files (NOT video)
  /_buildManifest/i, /_ssgManifest/i, /__NEXT_DATA__/i,
  /\/static\/chunks\//i, /\/static\/css\//i, /\/static\/js\//i,
  /webpack/i, /hot-update/i,
  // Generic JS/CSS (must NOT be scored as video)
  /\.js(\?|$)/i, /\.css(\?|$)/i, /\.json(\?|$)/i,
];

// Known video CDN domains — always pass scoring even if URL has ambiguous terms
const VIDEO_CDN_WHITELIST = [
  /cdninstagram\.com/i,   // Instagram
  /akamaized\.net/i,       // Akamai CDN (TikTok, many others)
  /bytedance\.com/i,       // TikTok
  /tiktokcdn\.com/i,
  /snapchat\.net/i,
  /snapchat\.com\/web\//i,
  /sc-cdn\.net/i,          // Snapchat CDN
  /vimeocdn\.com/i,
  /fbcdn\.net/i,           // Facebook CDN
  /fbsbx\.com/i,           // Facebook storage CDN (video downloads)
  /video\.xx\.fbcdn\.net/i, // Facebook video CDN regional
  /video-[a-z]{3}\d+\.fbcdn\.net/i, // Facebook regional video CDN
  /twitch\.tv\/vod/i,
  /streamable\.com/i,
  /reddit\.com\/v/i,
];

function scoreUrl(url: string): number {
  const isWhitelisted = VIDEO_CDN_WHITELIST.some(p => p.test(url));
  // For whitelisted CDN domains: only skip if it's clearly a JS/CSS/JSON/image asset
  // (these are served from the same CDN but are NOT video)
  const isStaticAsset = /\.(js|css|json|gif|jpg|jpeg|png|webp|svg|ico)(\?|$)/i.test(url);
  if (!isWhitelisted) {
    if (SKIP_PATTERNS.some(p => p.test(url))) return -1;
  } else if (isStaticAsset) {
    return -1; // Skip static assets even on whitelisted CDNs
  }
  for (const { pattern, priority } of VIDEO_URL_PATTERNS) {
    if (pattern.test(url)) return priority;
  }
  // Whitelisted CDN with no video extension — give base score so content-type can boost it
  if (isWhitelisted) return 0;
  return -1;
}

// ─── Viewport presets (randomised to avoid fingerprinting) ───────────────────
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
];

// ─── Main extractor ───────────────────────────────────────────────────────────
export async function browserExtractVideoUrl(
  pageUrl: string,
  timeoutMs = 22000,
  headless = true,
  cookiesFile?: string,
): Promise<BrowserExtractResult | null> {
  const executablePath = findSystemBrowser() ?? undefined;
  const viewport = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];

  let browser;
  try {
    browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--allow-running-insecure-content",
        `--window-size=${viewport.width},${viewport.height}`,
      ],
    });
  } catch (err) {
    logger.warn({ err }, "Could not launch browser for extraction");
    return null;
  }

  try {
    const context = await browser.newContext({
      viewport,
      userAgent: pickUserAgent(),
      extraHTTPHeaders: {
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
    });

    // Stealth: remove automation indicators
    await context.addInitScript(`
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      window.chrome = { runtime: {} };
    `);

    // Inject cookies from file if provided
    if (cookiesFile && existsSync(cookiesFile)) {
      try {
        const { readFileSync } = await import("fs");
        const cookieContent = readFileSync(cookiesFile, "utf8");
        const parsed = parseNetscapeCookies(cookieContent, pageUrl);
        if (parsed.length > 0) {
          await context.addCookies(parsed);
          logger.info({ count: parsed.length, pageUrl }, "Browser extractor: injected cookies");
        }
      } catch (e) {
        logger.warn({ e }, "Browser extractor: failed to inject cookies");
      }
    }

    const page = await context.newPage();

    // Auto-close popups
    context.on("page", async (p) => {
      if (p === page) return;
      try { await p.close(); } catch {}
    });

    const origin = (() => { try { return new URL(pageUrl).origin; } catch { return pageUrl; } })();
    const foundUrls: { url: string; score: number }[] = [];
    let blobVideoDetected = false;

    // Network intercept — catch all video-related requests
    page.on("response", async (response) => {
      try {
        const url = response.url();
        const ct = response.headers()["content-type"] || "";
        const status = response.status();

        logger.debug({ url, status, contentType: ct }, "Network intercept");

        let extraScore = 0;
        if (ct.includes("mpegurl") || ct.includes("x-mpegURL")) extraScore = 4;
        else if (ct.includes("dash+xml") || ct.includes("mpd")) extraScore = 3;
        else if (ct.includes("mp4") || ct.includes("video")) extraScore = 2;
        else if (ct.includes("octet-stream") && scoreUrl(url) >= 0) extraScore = 1;

        const urlScore = scoreUrl(url);
        if (urlScore >= 0 || extraScore > 0) {
          const score = Math.max(urlScore, 0) + extraScore;
          if (score > 0) {
            foundUrls.push({ url, score });
            logger.info({ url, score, ct }, "Browser: candidate stream found");
          }
        }
      } catch {}
    });

    // Navigate to page
    logger.info({ pageUrl }, "Browser: navigating");
    try {
      await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 35000 });
    } catch (gotoErr: any) {
      if (gotoErr.message?.includes("net::ERR_ABORTED") || gotoErr.message?.includes("detached")) {
        logger.warn({ msg: gotoErr.message }, "Browser: goto aborted, continuing anyway");
      } else {
        throw gotoErr;
      }
    }

    // Human-like scroll to trigger lazy loading
    await humanScroll(page);

    // Wait for initial content
    const halfTimeout = Math.floor(timeoutMs / 2);
    await page.waitForTimeout(halfTimeout);

    // Try play buttons in all frames (including iframes)
    const playSelectors = [
      ".play-button-outer", ".play-button", "[onclick*='fireload']",
      "button[aria-label*='play' i]", ".jw-icon-display", ".jw-display-icon",
      ".plyr__control--overlaid", "[class*='playBtn']", "[class*='play-btn']",
      "[class*='PlayButton']", "[class*='play_button']", "[data-testid*='play']",
      ".vjs-big-play-button", ".ytp-large-play-button", "video", ".loader",
    ];

    for (const frame of page.frames()) {
      for (const sel of playSelectors) {
        try {
          const el = await frame.$(sel);
          if (el) {
            await el.click({ timeout: 2000 });
            logger.info({ sel, frameUrl: frame.url() }, "Browser: clicked play");
            break;
          }
        } catch {}
      }
    }

    // Collect iframe src URLs for fallback embedded player navigation
    const iframeSrcs: string[] = [];
    for (const frame of page.frames()) {
      try {
        const srcs = await frame.evaluate((): string[] => {
          const res: string[] = [];
          (document as any).querySelectorAll("iframe").forEach((f: any) => {
            const src = f.src || f.getAttribute("data-src") || f.getAttribute("src");
            if (src && src.startsWith("http")) res.push(src);
          });
          return res;
        });
        iframeSrcs.push(...srcs);
      } catch {}
    }

    // If no streams captured yet, navigate directly to embedded iframe players
    if (foundUrls.length === 0 && iframeSrcs.length > 0) {
      const uniqueIframes = Array.from(new Set(iframeSrcs)).filter(
        u => !u.includes("facebook") && !u.includes("google") && !u.includes("twitter")
      );
      for (const iframeUrl of uniqueIframes.slice(0, 3)) {
        logger.info({ iframeUrl }, "Browser: navigating directly to embedded player iframe");
        try {
          await page.goto(iframeUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForTimeout(1500);

          // Trigger click handlers & fireload directly in browser DOM context
          await page.evaluate(() => {
            try { (window as any).fireload?.(); } catch {}
            try { (document as any).querySelector('.play-button-outer')?.click(); } catch {}
            try { (document as any).querySelector('.play-button')?.click(); } catch {}
            try { (document as any).querySelectorAll('video').forEach((v: any) => v.play?.()); } catch {}
          });

          for (const sel of playSelectors) {
            try {
              const el = await page.$(sel);
              if (el) {
                await el.click({ timeout: 1500 });
                logger.info({ sel, iframeUrl }, "Browser: clicked iframe play button");
              }
            } catch {}
          }

          await page.waitForTimeout(2000);

          // Scan iframe HTML content + unpacked JS for m3u8/mp4 stream URLs
          try {
            const iframeHtml = await page.content();
            const unpackedIframeHtml = unpackPackedJS(iframeHtml);
            const cleanedIframe = unpackedIframeHtml.replace(/\\\/|\\/g, "/");
            const streamRegex = /(?:https?:)?\/\/[^\s"'<>\\]+?\.(?:m3u8|mpd|mp4|webm)(?:\?[^\s"'<>\\]*)?/gi;
            let sm;
            while ((sm = streamRegex.exec(cleanedIframe)) !== null) {
              let su = sm[0];
              if (su.startsWith("//")) su = "https:" + su;
              const score = scoreUrl(su);
              if (score >= 0) foundUrls.push({ url: su, score: score + 5 });
            }
          } catch {}

          if (foundUrls.length > 0) break;
        } catch (e) {
          logger.warn({ e, iframeUrl }, "Browser: failed to navigate iframe URL");
        }
      }
    }

    // Check for blob: URLs in video elements
    for (const frame of page.frames()) {
      try {
        const blobResult = (await frame.evaluate(async () => {
          const video = (document as any).querySelector("video");
          if (!video) return null;
          const src = video.src || video.querySelector("source")?.getAttribute("src");
          if (!src?.startsWith("blob:")) return null;
          try {
            const response = await fetch(src as string);
            const blob = await response.blob();
            if (blob.type.startsWith("video/") || blob.size > 10000) return src as string;
          } catch {}
          return null;
        })) as string | null;

        if (blobResult) {
          blobVideoDetected = true;
          logger.info({ blobUrl: blobResult, frameUrl: frame.url() }, "Browser: blob video detected");
          // For blob URLs we can't download directly, but we note it for the user
        }
      } catch {}
    }

    await page.waitForTimeout(halfTimeout);

    // Scan DOM video tags in all frames
    for (const frame of page.frames()) {
      try {
        const domVideoUrls = await frame.evaluate((): string[] => {
          const urls: string[] = [];
          const doc = document as any;
          doc.querySelectorAll("video").forEach((v: any) => {
            if (v.src && !v.src.startsWith("blob:")) urls.push(v.src);
            v.querySelectorAll("source").forEach((s: any) => {
              if (s.src && !s.src.startsWith("blob:")) urls.push(s.src);
            });
          });
          doc.querySelectorAll("[data-src],[data-video-src],[data-stream-url]").forEach((el: any) => {
            const src = el.getAttribute("data-src") || el.getAttribute("data-video-src") || el.getAttribute("data-stream-url");
            if (src && src.startsWith("http")) urls.push(src);
          });
          return urls;
        });
        for (const u of domVideoUrls) {
          const score = scoreUrl(u);
          if (score >= 0) foundUrls.push({ url: u, score: score + 1 });
        }
      } catch {}
    }

    // Also scan page source HTML (and unpacked JS) for video URLs
    try {
      const rawContent = await page.content();
      const unpackedContent = unpackPackedJS(rawContent);
      const cleaned = unpackedContent.replace(/\\\/|\\/g, "/");

      // Match standard http(s) URLs with m3u8, mpd, mp4, webm extensions
      const videoUrlRegex = /(?:https?:)?\/\/[^\s"'<>\\]+?\.(?:m3u8|mpd|mp4|webm)(?:\?[^\s"'<>\\]*)?/gi;
      let m;
      while ((m = videoUrlRegex.exec(cleaned)) !== null) {
        let u = m[0];
        if (u.startsWith("//")) u = "https:" + u;
        const score = scoreUrl(u);
        if (score >= 0) foundUrls.push({ url: u, score });
      }

      // Match domain paths without scheme (e.g. s7.as-cdn5.top/cdn/down/.../l.m3u8)
      const domainPathRegex = /([a-z0-9\-]+(?:\.[a-z0-9\-]+)+\/[^\s"'<>\\]+?\.(?:m3u8|mpd|mp4|webm)(?:\?[^\s"'<>\\]*)?)/gi;
      while ((m = domainPathRegex.exec(cleaned)) !== null) {
        const domainPath = m[1];
        if (domainPath.includes(".")) {
          const u = "https://" + domainPath;
          const score = scoreUrl(u);
          if (score >= 0) foundUrls.push({ url: u, score });
        }
      }
    } catch {}

    const title = await page.title().catch(() => null);
    const thumbnail = await page.evaluate((): string | null => {
      const el = (document as any).querySelector('meta[property="og:image"]');
      return el?.content || null;
    }).catch(() => null);

    if (foundUrls.length === 0) {
      // Debug screenshot
      try {
        await page.screenshot({ path: "screenshot-debug.png" });
        logger.warn({ pageUrl }, "Saved debug screenshot — no video URLs found");
      } catch {}

      if (blobVideoDetected) {
        logger.warn({ pageUrl }, "Only blob URLs found — cannot download directly");
      }

      logger.warn({ pageUrl }, "Browser: no video URLs found");
      return null;
    }

    // Deduplicate and pick best
    const seen = new Set<string>();
    const unique = foundUrls.filter(({ url }) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
    unique.sort((a, b) => b.score - a.score);
    const best = unique[0];

    logger.info({ videoUrl: best.url, score: best.score }, "Browser: selected best URL");

    return {
      videoUrl: best.url,
      referer: origin,
      title: title || null,
      thumbnail: thumbnail || null,
      isHLS: /\.m3u8/i.test(best.url),
      isDASH: /\.mpd/i.test(best.url),
      isBlob: false,
    };
  } catch (err) {
    logger.error({ err, pageUrl }, "Browser extractor error");
    return null;
  } finally {
    await browser.close().catch(() => {});
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pickUserAgent(): string {
  const agents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  ];
  return agents[Math.floor(Math.random() * agents.length)];
}

async function humanScroll(page: any): Promise<void> {
  try {
    await page.evaluate(() => {
      (window as any).scrollTo({ top: (document as any).body.scrollHeight / 3, behavior: "smooth" });
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      (window as any).scrollTo({ top: 0, behavior: "smooth" });
    });
    await page.waitForTimeout(400);
  } catch {}
}

function unpackPackedJS(code: string): string {
  try {
    const regex = /eval\(function\(p,a,c,k,e,d\)\{.*?\}\('([^']+)',\s*(\d+),\s*(\d+),\s*'([^']+)'\.split\('\|'\)/gi;
    let match;
    let result = code;
    while ((match = regex.exec(code)) !== null) {
      try {
        let [_, p, aStr, cStr, kStr] = match;
        let a = parseInt(aStr, 10);
        let c = parseInt(cStr, 10);
        let k = kStr.split("|");
        const e = (n: number): string => (n < a ? "" : e(Math.floor(n / a))) + (n % a > 35 ? String.fromCharCode(n % a + 29) : (n % a).toString(36));
        while (c--) {
          if (k[c]) p = p.replace(new RegExp("\\b" + e(c) + "\\b", "g"), k[c]);
        }
        result += "\n" + p;
      } catch {}
    }
    return result;
  } catch {
    return code;
  }
}

interface PlaywrightCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

function parseNetscapeCookies(content: string, targetUrl: string): PlaywrightCookie[] {
  const cookies: PlaywrightCookie[] = [];
  try {
    const targetDomain = new URL(targetUrl).hostname;
    for (const line of content.split("\n")) {
      if (line.startsWith("#") || !line.trim()) continue;
      const parts = line.split("\t");
      if (parts.length < 7) continue;
      const [domain, , cookiePath, secure, , name, value] = parts;
      const cleanDomain = domain.replace(/^\./, "");
      if (targetDomain.includes(cleanDomain) || cleanDomain.includes(targetDomain.split(".").slice(-2).join("."))) {
        cookies.push({
          name: name.trim(),
          value: (value || "").trim(),
          domain: domain.trim(),
          path: cookiePath || "/",
          secure: secure === "TRUE",
          httpOnly: false,
          sameSite: "None",
        });
      }
    }
  } catch {}
  return cookies;
}
