import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAnalyzeVideo, useStartDownload, DownloadInputOutputFormat, VideoInfo, VideoFormat, useGetSupportedPlatforms } from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, Link } from "wouter";
import {
  Download, Link2, Clock, Eye, User, Music, Video as VideoIcon,
  ChevronRight, Sparkles, Loader2, AlertCircle, CheckCircle2,
  FileVideo, FileAudio, Headphones, Zap, Shield, Globe, Info,
  ChevronDown, ChevronUp, Upload, Lock, Cookie, ExternalLink,
  ArrowRight, Wand2, Eraser, Star, Layers,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const formSchema = z.object({
  url: z.string().url("Please enter a valid URL"),
});

const QUALITY_ORDER = ["4K HDR", "4K DV", "4K", "2K HDR", "2K", "1080p HDR", "1080p", "720p HDR", "720p", "480p", "360p", "240p", "144p", "Best Available"];
const VIDEO_OUTPUT_FORMATS = ["mp4", "mkv", "webm"] as const;
const AUDIO_OUTPUT_FORMATS = ["mp3", "m4a", "flac", "wav"] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDuration(seconds: number) {
  if (!seconds) return "Unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatNumber(num: number) {
  if (!num) return "0";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toString();
}

function formatSize(bytes: number | null | undefined, estimated?: boolean) {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  const str = mb >= 1000 ? (mb / 1024).toFixed(1) + " GB" : mb.toFixed(0) + " MB";
  return estimated ? `~${str}` : str;
}

// Quality visual config
function getQualityConfig(quality: string) {
  if (quality === "Best Available") return {
    tier: "best",
    glow: "rgba(16,185,129,0.25)",
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    badgeLabel: "AUTO",
  };
  if (quality.startsWith("4K")) return {
    tier: "ultra",
    glow: "rgba(234,179,8,0.3)",
    border: "border-yellow-500/40",
    bg: "bg-yellow-500/10",
    text: "text-yellow-300",
    badge: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
    badgeLabel: quality.includes("HDR") ? "4K·HDR" : quality.includes("DV") ? "4K·DV" : "4K",
  };
  if (quality.startsWith("2K")) return {
    tier: "high",
    glow: "rgba(168,85,247,0.25)",
    border: "border-purple-500/40",
    bg: "bg-purple-500/10",
    text: "text-purple-300",
    badge: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    badgeLabel: quality.includes("HDR") ? "2K·HDR" : "2K",
  };
  if (quality.startsWith("1080p")) return {
    tier: "hd",
    glow: "rgba(59,130,246,0.25)",
    border: "border-blue-500/35",
    bg: "bg-blue-500/8",
    text: "text-blue-300",
    badge: "bg-blue-500/20 text-blue-300 border-blue-500/35",
    badgeLabel: quality.includes("HDR") ? "FHD·HDR" : "FHD",
  };
  if (quality.startsWith("720p")) return {
    tier: "hd",
    glow: "rgba(34,211,238,0.2)",
    border: "border-cyan-500/30",
    bg: "bg-cyan-500/5",
    text: "text-cyan-300",
    badge: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
    badgeLabel: "HD",
  };
  return {
    tier: "sd",
    glow: "rgba(148,163,184,0.1)",
    border: "border-white/10",
    bg: "bg-white/3",
    text: "text-slate-300",
    badge: null,
    badgeLabel: null,
  };
}


// Split and sort formats
function splitFormats(formats: (VideoFormat & { filesizeEstimated?: number | null; tbr?: number | null; codecLabel?: string | null; isHDR?: boolean; isDolby?: boolean })[]) {
  const video = formats.filter(f => f.hasVideo);
  const audio = formats.filter(f => !f.hasVideo);
  video.sort((a, b) => {
    const ia = QUALITY_ORDER.indexOf(a.quality);
    const ib = QUALITY_ORDER.indexOf(b.quality);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return { video, audio };
}

// ─── Quality Card ─────────────────────────────────────────────────────────────
function QualityCard({
  fmt, isSelected, isFirst, onClick,
}: {
  fmt: VideoFormat & { filesizeEstimated?: number | null; tbr?: number | null; codecLabel?: string | null; isHDR?: boolean; isDolby?: boolean };
  isSelected: boolean;
  isFirst: boolean;
  onClick: () => void;
}) {
  const cfg = getQualityConfig(fmt.quality);
  const size = formatSize(fmt.filesize) ?? formatSize((fmt as any).filesizeEstimated, true);
  const isBestAvail = fmt.quality === "Best Available";
  const hasWarning = typeof (fmt as any).codecLabel === "string" && (fmt as any).codecLabel?.startsWith("⚠");

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col p-3.5 rounded-xl border text-left transition-all duration-200 group overflow-hidden",
        isBestAvail ? "col-span-2" : "",   // full width for Best Available
        isSelected
          ? `${cfg.bg} ${cfg.border} shadow-lg`
          : "bg-white/3 border-white/8 hover:bg-white/6 hover:border-white/18"
      )}
      style={isSelected ? { boxShadow: `0 0 24px ${cfg.glow}` } : undefined}
    >
      {/* BEST badge for first quality */}
      {isFirst && !isBestAvail && (
        <span className="absolute top-1.5 right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase tracking-wide">
          BEST
        </span>
      )}

      {/* Quality label + HDR/DV badge */}
      <div className="flex items-center gap-1.5 mb-1 pr-8">
        <span className={cn("text-base font-black font-mono leading-none", isSelected ? cfg.text : "text-white")}>
          {fmt.quality.split(" ")[0]}
        </span>
        {(fmt as any).isHDR && (
          <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-orange-500/15 text-orange-300 border-orange-500/25">HDR</span>
        )}
        {(fmt as any).isDolby && (
          <span className="text-[9px] font-bold px-1 py-0.5 rounded border bg-violet-500/15 text-violet-300 border-violet-500/25">DV</span>
        )}
        {cfg.badge && (
          <span className={cn("text-[9px] font-bold px-1 py-0.5 rounded border", cfg.badge)}>
            {cfg.badgeLabel}
          </span>
        )}
      </div>

      {/* Meta row */}
      <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        {(fmt as any).codecLabel && !hasWarning && (
          <span className="font-mono bg-white/5 px-1 rounded">{(fmt as any).codecLabel}</span>
        )}
        {hasWarning && (
          <span className="font-mono bg-amber-500/10 border border-amber-500/20 text-amber-300 px-1 rounded">{(fmt as any).codecLabel}</span>
        )}
        {isBestAvail && !hasWarning && (
          <span className="text-muted-foreground">Auto-selects best quality + audio</span>
        )}
        {fmt.fps && fmt.fps > 30 && <span>{fmt.fps}fps</span>}
        {size && <span>{size}</span>}
        <span className="uppercase">{fmt.ext}</span>
      </div>

      {isSelected && (
        <div className="absolute bottom-2 right-2">
          <CheckCircle2 className={cn("w-4 h-4", cfg.text)} />
        </div>
      )}
    </button>
  );
}

// ─── Home Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [, setLocation] = useLocation();
  const [analyzedData, setAnalyzedData] = useState<VideoInfo | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<VideoFormat | null>(null);
  const [removeWatermark, setRemoveWatermark] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [videoOutputFmt, setVideoOutputFmt] = useState<string>("mp4");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cookiesBase64, setCookiesBase64] = useState<string | null>(null);
  const [cookiesFileName, setCookiesFileName] = useState<string | null>(null);
  const [analyzeElapsed, setAnalyzeElapsed] = useState(0);
  const cookiesRef = useRef<HTMLInputElement>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const analyzeVideo = useAnalyzeVideo();
  const startDownload = useStartDownload();

  const { data: supportedData } = useGetSupportedPlatforms();

  // Start/stop elapsed timer based on analyze pending state
  useEffect(() => {
    if (analyzeVideo.isPending) {
      setAnalyzeElapsed(0);
      elapsedRef.current = setInterval(() => setAnalyzeElapsed(s => s + 1), 1000);
    } else {
      if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [analyzeVideo.isPending]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { url: "" },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    setAnalyzedData(null);
    setSelectedFormat(null);
    setAnalyzeError(null);
    setDownloadError(null);
    // Build request body — include cookies if available
    const body: Record<string, unknown> = { url: values.url };
    if (cookiesBase64) body.cookiesBase64 = cookiesBase64;

    analyzeVideo.mutate(
      { data: body as any },
      {
        onSuccess: (data) => {
          setAnalyzedData(data);
          const { video } = splitFormats(data.formats as any);
          // Auto-select best quality: video[] is already sorted best-first (4K > 1080p > ...)
          // So just pick video[0]. Fallback to Best Available or first format.
          const preferred =
            video[0] ||
            data.formats.find((f: any) => f.quality === "Best Available") ||
            data.formats[0];
          if (preferred) setSelectedFormat(preferred as VideoFormat);
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Failed to analyze URL";
          setAnalyzeError(msg);
        },
      }
    );
  }

  // Re-analyze current URL with cookies
  function reAnalyzeWithCookies() {
    const url = form.getValues("url");
    if (!url) return;
    onSubmit({ url });
  }

  // Handle cookies file selection
  function handleCookiesFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCookiesFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const b64 = btoa(unescape(encodeURIComponent(text)));
      setCookiesBase64(b64);
      // Auto re-analyze immediately — pass b64 directly to avoid setState timing issues
      const url = form.getValues("url");
      if (url && analyzedData) {
        const body: Record<string, unknown> = { url, cookiesBase64: b64 };
        setAnalyzeError(null);
        analyzeVideo.mutate(
          { data: body as any },
          {
            onSuccess: (data) => {
              setAnalyzedData(data);
              const { video } = splitFormats(data.formats as any);
              const preferred = video[0] || data.formats.find((f: any) => f.quality === "Best Available") || data.formats[0];
              if (preferred) setSelectedFormat(preferred as VideoFormat);
            },
            onError: (err: unknown) => {
              const msg = err instanceof Error ? err.message : "Failed to analyze URL";
              setAnalyzeError(msg);
            },
          }
        );
      }
    };
    reader.readAsText(file);
  }

  const handleDownload = () => {
    if (!analyzedData || !selectedFormat) return;

    // ── Validation: block invalid format downloads before they even start ──────
    const codecLbl = (selectedFormat as any).codecLabel as string | null;
    const dlMethod = (analyzedData as any).downloadMethod as string | undefined;

    if (dlMethod === "extension") {
      setDownloadError("🔒 This content is DRM-protected (Widevine). Direct download is blocked. Use a browser extension to capture the stream URL while it plays.");
      return;
    }
    if (codecLbl && (codecLbl.includes("⚠") || codecLbl.includes("Needs Cookies"))) {
      setDownloadError("🔑 This format requires cookies to download. Upload your cookies.txt file in Advanced Options above, then re-analyze.");
      return;
    }

    setDownloadError(null);

    const isAudio = !selectedFormat.hasVideo;
    const outputFormat: DownloadInputOutputFormat = isAudio
      ? (selectedFormat.ext === "m4a" ? "m4a" : selectedFormat.ext === "flac" ? "mp3" : "mp3")
      : videoOutputFmt as DownloadInputOutputFormat;

    // Build download body — include cookies if available so yt-dlp can authenticate
    const dlBody: Record<string, unknown> = {
      url: analyzedData.url,
      formatId: selectedFormat.formatId,
      outputFormat,
      quality: selectedFormat.quality,
      removeWatermark,
      title: analyzedData.title ?? undefined,
      thumbnail: analyzedData.thumbnail ?? undefined,
      platform: analyzedData.platform ?? undefined,
    };
    if (cookiesBase64) dlBody.cookiesBase64 = cookiesBase64;

    startDownload.mutate(
      { data: dlBody as any },
      { onSuccess: () => setLocation("/history") }
    );
  };


  const { video: videoFormats, audio: audioFormats } = analyzedData
    ? splitFormats(analyzedData.formats as any)
    : { video: [], audio: [] };

  const PLATFORM_PILLS = ["YouTube", "TikTok", "Instagram", "Facebook", "Twitter/X", "Vimeo", "Reddit", "Twitch", "+ 1000 more"];

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6 md:gap-8 pb-bar-safe px-0">

      {/* ── Hero ────────────────────────────────────────────────────────────────── */}
      <div className="text-center space-y-5 pt-10 pb-4">

        {/* Animated Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: [0.175, 0.885, 0.32, 1.275] }}
          className="flex justify-center mb-2"
        >
          <div className="relative w-16 h-16 md:w-24 md:h-24">
            {/* Outer rotating ring */}
            <div className="absolute inset-0 rounded-full border-2 border-primary/30 animate-spin" style={{ animationDuration: "8s" }} />
            {/* Middle pulsing ring */}
            <div className="absolute inset-1 rounded-full border border-violet-400/20 animate-ping" style={{ animationDuration: "3s" }} />
            {/* Glow blob */}
            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-violet-600/40 to-blue-600/30 blur-xl animate-pulse" />
            {/* Logo image */}
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <div className="w-14 h-14 md:w-20 md:h-20 rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(139,92,246,0.5)] border border-white/10">
                <img src="/vidsnap-logo.png" alt="VidSnap" className="w-full h-full object-cover" />
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Brand Name */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }}
          className="flex items-center justify-center gap-3"
        >
          <span className="text-2xl font-black tracking-tight bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
            VidSnap
          </span>
          <span className="px-2 py-0.5 rounded-md bg-primary/15 border border-primary/25 text-[10px] font-bold text-primary uppercase tracking-widest">
            Universal
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm font-medium text-white/80"
        >
          <Sparkles className="w-4 h-4 text-primary" />
          Supports 1000+ Platforms — Any Site, Any Quality
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight leading-tight"
        >
          Download <span className="text-gradient-electric">Anything</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
          className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-xl mx-auto px-2"
        >
          4K · 1080p · 720p · HDR · DV · MP3 · FLAC · HLS streams · 1000+ websites
        </motion.p>
      </div>

      {/* ── URL Input ─────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.3 }}>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="relative group">
            <div className="absolute -inset-1 bg-gradient-electric rounded-2xl opacity-20 group-hover:opacity-40 blur-xl transition-opacity duration-500" />
            <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center bg-card border border-white/10 rounded-2xl p-2 shadow-2xl focus-within:border-primary/50 transition-colors gap-2 sm:gap-0">
              <div className="pl-3 sm:pl-4 pt-1 sm:pt-0 text-muted-foreground shrink-0 flex items-center">
                <Link2 className="w-5 h-5" />
              </div>
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem className="flex-1 px-4 space-y-0">
                    <FormControl>
                      <Input
                        placeholder="Paste any video URL..."
                        className="border-0 bg-transparent text-sm sm:text-base shadow-none focus-visible:ring-0 px-0 h-10 sm:h-14"
                        disabled={analyzeVideo.isPending}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="pb-1 pl-0 text-xs" />
                  </FormItem>
                )}
              />
              <Button
                type="submit" size="lg"
                className={cn(
                  "h-14 px-8 rounded-xl text-base font-bold shrink-0 transition-all duration-300",
                  analyzeVideo.isPending
                    ? "bg-white/10 text-white cursor-not-allowed"
                    : "bg-gradient-electric hover:shadow-electric text-white border-0"
                )}
                disabled={analyzeVideo.isPending || !form.watch("url")}
              >
                {analyzeVideo.isPending ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" />{analyzeElapsed > 0 ? `${analyzeElapsed}s…` : "Analyzing…"}</>
                ) : (
                  <>Analyze <ChevronRight className="ml-1 h-5 w-5" /></>
                )}
              </Button>
            </div>
          </form>
        </Form>

        {analyzeError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="mt-3 flex items-start gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-4 py-3"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{analyzeError}</span>
          </motion.div>
        )}

        {/* ── Analyze Timer ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {analyzeVideo.isPending && (
            <motion.div
              key="analyze-timer"
              initial={{ opacity: 0, y: -10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.97 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="mt-4 relative overflow-hidden rounded-2xl border border-white/10 bg-card/80 backdrop-blur-sm p-5"
            >
              {/* Animated gradient scan line */}
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(90deg, transparent 0%, rgba(139,92,246,0.08) 50%, transparent 100%)" }}
                animate={{ x: ["-100%", "100%"] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
              />

              <div className="flex items-center gap-4">
                {/* Spinning radar icon */}
                <div className="relative shrink-0 w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-2 border-violet-500/30" />
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-400"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-violet-400" />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  {/* Message cycling */}
                  <motion.p
                    key={Math.floor(analyzeElapsed / 4)}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4 }}
                    className="text-sm font-semibold text-white mb-1.5"
                  >
                    {([
                      "🔍 Detecting video source…",
                      "⚡ Extracting format list…",
                      "🎯 Finding best qualities…",
                      "📡 Fetching stream metadata…",
                      "🔐 Checking access permissions…",
                      "✨ Almost there, polishing results…",
                      "🚀 Finalizing quality options…",
                    ])[Math.floor(analyzeElapsed / 4) % 7]}
                  </motion.p>

                  {/* Progress bar */}
                  <div className="relative h-1.5 rounded-full bg-white/8 overflow-hidden">
                    {/* Indeterminate fill — pulses between 20–90% */}
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 via-blue-400 to-cyan-400"
                      animate={{ width: ["20%", "88%", "55%", "92%", "40%", "80%"] }}
                      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                    />
                    {/* Shimmering highlight */}
                    <motion.div
                      className="absolute inset-y-0 w-16 rounded-full bg-white/30"
                      animate={{ x: ["-64px", "400px"] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
                    />
                  </div>
                </div>

                {/* Elapsed time counter */}
                <div className="shrink-0 text-right">
                  <motion.div
                    key={analyzeElapsed}
                    initial={{ scale: 1.3, opacity: 0.6 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="text-2xl font-black font-mono tabular-nums text-violet-300"
                  >
                    {analyzeElapsed}s
                  </motion.div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">elapsed</div>
                </div>
              </div>

              {/* Dots row */}
              <div className="flex items-center gap-1.5 mt-4 pl-16">
                {[0,1,2,3,4,5].map(i => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-violet-400/60"
                    animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                  />
                ))}
                <span className="text-xs text-muted-foreground ml-1">
                  {analyzeElapsed < 5 ? "Quick sites take ~2-3s" :
                   analyzeElapsed < 12 ? "Complex sites may take 10-15s" :
                   analyzeElapsed < 25 ? "Trying alternate extractors…" :
                   "Deep analysis in progress, please wait…"}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>

      {/* ── Results ───────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {analyzedData && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.5, type: "spring", bounce: 0.2 }}
            className="flex flex-col gap-5"
          >
            {/* Video Info */}
            <div className="bg-card border border-white/10 rounded-2xl overflow-hidden">
              <div className="flex flex-col md:flex-row">
                {/* Thumbnail — fixed height to avoid portrait images stretching the card */}
                <div className="relative w-full md:w-64 lg:w-72 shrink-0 h-52 md:h-auto md:min-h-[200px] md:max-h-60 overflow-hidden">
                  {analyzedData.thumbnail ? (
                    <img src={analyzedData.thumbnail} alt={analyzedData.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-white/5">
                      <VideoIcon className="w-12 h-12 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent md:bg-gradient-to-r md:from-transparent md:to-card/80" />
                  {analyzedData.duration && (
                    <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-sm text-white text-xs font-mono px-2 py-1 rounded-md flex items-center gap-1">
                      <Clock className="w-3 h-3" />{formatDuration(analyzedData.duration)}
                    </div>
                  )}
                  <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap">
                    <Badge className="bg-black/60 backdrop-blur-sm text-white border-white/20 text-xs">{analyzedData.platform}</Badge>
                    {(analyzedData as any).isLive && <Badge className="bg-red-600/80 text-white border-red-500/30 text-xs">🔴 LIVE</Badge>}
                    {(analyzedData as any).sourceType === "hls" && <Badge className="bg-blue-600/60 text-white border-blue-500/30 text-xs">HLS</Badge>}
                  </div>
                </div>

                <div className="flex-1 p-5 flex flex-col justify-center gap-3">
                  <h3 className="font-bold text-lg leading-snug line-clamp-2">{analyzedData.title}</h3>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                    {analyzedData.uploader && <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />{analyzedData.uploader}</span>}
                    {analyzedData.viewCount && <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />{formatNumber(analyzedData.viewCount)} views</span>}
                    {analyzedData.duration && <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" />{formatDuration(analyzedData.duration)}</span>}
                  </div>
                  <div className="flex items-center gap-2 text-xs flex-wrap">
                    {/* Download method badge — shown immediately after analysis */}
                    {(() => {
                      const method = (analyzedData as any).downloadMethod as "direct" | "cookies" | "extension" | undefined;
                      if (method === "direct" || (!method && videoFormats.length > 0)) return (
                        <span className="flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-full px-2.5 py-0.5 font-semibold">
                          <CheckCircle2 className="w-3 h-3" /> Direct Download
                        </span>
                      );
                      if (method === "cookies") return (
                        <span className="flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-full px-2.5 py-0.5 font-semibold">
                          <Cookie className="w-3 h-3" /> Needs Cookies
                        </span>
                      );
                      if (method === "extension") return (
                        <span className="flex items-center gap-1 bg-red-500/15 border border-red-500/30 text-red-300 rounded-full px-2.5 py-0.5 font-semibold">
                          <Lock className="w-3 h-3" /> DRM — Use Extension
                        </span>
                      );
                      return null;
                    })()}
                    {videoFormats.length > 0 ? (
                      <span className="text-green-400 font-medium">
                        {videoFormats.length} video qual{videoFormats.length !== 1 ? "ities" : "ity"} · {audioFormats.length} audio format{audioFormats.length !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-amber-400 font-medium">No open video streams found · {audioFormats.length} audio format{audioFormats.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                  {/* Subtitles badge */}
                  {(analyzedData as any).subtitles?.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Globe className="w-3.5 h-3.5" />
                      <span>{(analyzedData as any).subtitles.length} subtitle languages available</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Smart Download Method Banner ──────────────────────────────────── */}
            {(() => {
              const method = (analyzedData as any).downloadMethod as "direct" | "cookies" | "extension" | undefined;
              const hasVideo = videoFormats.length > 0;
              const needsCookies = !hasVideo && ((analyzedData as any).requiresLogin === true || method === "extension");

              // Unified Cookies Guide Card — shown whenever there are no video formats
              if (needsCookies) {
                const isDRM = method === "extension";
                return (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className={`rounded-2xl border flex flex-col gap-0 overflow-hidden ${isDRM
                      ? "bg-gradient-to-br from-red-950/40 via-slate-900/60 to-amber-950/30 border-red-500/25"
                      : "bg-gradient-to-br from-amber-950/40 via-slate-900/60 to-orange-950/20 border-amber-500/25"
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start gap-4 p-5 pb-4">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-xl ${isDRM ? "bg-red-500/15" : "bg-amber-500/15"}`}>
                        {isDRM ? "🔒" : "🔑"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-bold text-base mb-0.5 ${isDRM ? "text-red-300" : "text-amber-300"}`}>
                          {isDRM
                            ? `${analyzedData.platform} is DRM-protected — use Cookies to unlock`
                            : `${analyzedData.platform} requires login — upload Cookies to get video`
                          }
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {isDRM
                            ? "Widevine DRM blocks direct download. However, if you're a subscriber, exporting your browser cookies often bypasses this restriction."
                            : "This platform requires you to be logged in. Export your browser cookies and upload them — video qualities will appear instantly."
                          }
                        </p>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-white/6 mx-5" />

                    {/* Step by Step Guide */}
                    <div className="px-5 pt-4 pb-3">
                      <p className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-3">How to export cookies</p>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        {[
                          {
                            step: "1",
                            icon: "🧩",
                            title: "Install Extension",
                            desc: "Add \"Get cookies.txt LOCALLY\" to Chrome/Edge",
                            action: (
                              <a
                                href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
                                target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-lg bg-blue-500/15 border border-blue-500/25 text-[10px] font-bold text-blue-300 hover:bg-blue-500/25 transition-colors"
                              >
                                <ExternalLink className="w-2.5 h-2.5" /> Chrome Web Store →
                              </a>
                            ),
                          },
                          {
                            step: "2",
                            icon: "🌐",
                            title: `Open ${analyzedData.platform}`,
                            desc: `Log in to your ${analyzedData.platform} account in the browser`,
                          },
                          {
                            step: "3",
                            icon: "🍪",
                            title: "Export cookies.txt",
                            desc: "Click the extension icon → select \"Export cookies.txt\" for this site",
                          },
                          {
                            step: "4",
                            icon: "⚡",
                            title: "Upload & Auto-Analyze",
                            desc: "Upload the file below — video formats appear instantly!",
                          },
                        ].map(({ step, icon, title, desc, action }) => (
                          <div key={step} className="flex flex-col gap-1.5 bg-white/3 rounded-xl p-3 border border-white/8">
                            <div className="flex items-center gap-2">
                              <div className={`w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 ${isDRM ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>{step}</div>
                              <span className="text-base">{icon}</span>
                              <span className="text-xs font-bold text-white">{title}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground leading-relaxed pl-7">{desc}</p>
                            {action && <div className="pl-7">{action}</div>}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 📱 Mobile Guide — Kiwi Browser */}
                    <div className="px-5 pb-4">
                      <div className={`rounded-xl border overflow-hidden ${isDRM ? "border-orange-500/20 bg-orange-500/5" : "border-orange-500/20 bg-orange-500/5"}`}>
                        <button
                          id="mobile-guide-toggle"
                          onClick={() => {
                            const el = document.getElementById("mobile-guide-content");
                            const arrow = document.getElementById("mobile-guide-arrow");
                            if (el) el.classList.toggle("hidden");
                            if (arrow) arrow.classList.toggle("rotate-180");
                          }}
                          className="w-full flex items-center justify-between px-4 py-3 text-left"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg">📱</span>
                            <div>
                              <p className="text-xs font-bold text-orange-300">On Mobile / Phone?</p>
                              <p className="text-[10px] text-muted-foreground">Use Kiwi Browser to export cookies</p>
                            </div>
                          </div>
                          <ChevronDown id="mobile-guide-arrow" className="w-4 h-4 text-orange-400 transition-transform duration-200" />
                        </button>

                        <div id="mobile-guide-content" className="hidden border-t border-orange-500/15 px-4 pb-4 pt-3">
                          <p className="text-[11px] font-bold text-white/60 uppercase tracking-widest mb-3">Step by step — Android phone</p>
                          <div className="flex flex-col gap-2">
                            {[
                              {
                                num: "1",
                                icon: "🌐",
                                title: "Download Kiwi Browser",
                                desc: "Install \"Kiwi Browser\" from Play Store — it supports Chrome extensions on Android",
                                link: { text: "Play Store →", href: "https://play.google.com/store/apps/details?id=com.kiwibrowser.browser" },
                              },
                              {
                                num: "2",
                                icon: "🧩",
                                title: "Install the Extension",
                                desc: "In Kiwi Browser: tap ⋮ menu → Extensions → tap \"+\" → search \"Get cookies.txt LOCALLY\" → install",
                                link: { text: "Extension Link →", href: "https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc" },
                              },
                              {
                                num: "3",
                                icon: "🔑",
                                title: `Log in to ${analyzedData.platform}`,
                                desc: `Open ${analyzedData.platform} website in Kiwi Browser and log in to your account`,
                              },
                              {
                                num: "4",
                                icon: "🍪",
                                title: "Export Cookies",
                                desc: "Tap the extension icon (jigsaw piece) in top-right → tap \"Get cookies.txt\" for this site → Save the file",
                              },
                              {
                                num: "5",
                                icon: "⚡",
                                title: "Upload Here",
                                desc: "Come back to VidSnap → tap the upload area below → select your cookies.txt file → auto-analyzing begins!",
                              },
                            ].map(({ num, icon, title, desc, link }) => (
                              <div key={num} className="flex items-start gap-2.5 bg-white/3 rounded-lg p-2.5 border border-white/6">
                                <div className="w-5 h-5 rounded-full bg-orange-500/20 text-orange-300 text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5">{num}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="text-xs">{icon}</span>
                                    <span className="text-xs font-bold text-white">{title}</span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground leading-relaxed">{desc}</p>
                                  {link && (
                                    <a href={link.href} target="_blank" rel="noreferrer"
                                      className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-bold text-orange-400 hover:text-orange-300"
                                    >
                                      <ExternalLink className="w-2.5 h-2.5" /> {link.text}
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-2.5 flex items-center gap-1">
                            <Info className="w-3 h-3 shrink-0" />
                            Kiwi Browser is free & safe. It's the only mobile browser that supports Chrome extensions.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Upload Zone */}
                    <div className="px-5 pb-5 pt-1">
                      <input type="file" accept=".txt" className="hidden" id="cookies-upload-main" onChange={handleCookiesFile} />
                      {cookiesBase64 ? (
                        /* Cookies loaded — show status + re-analyze */
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                          <div className="flex items-center gap-2.5 flex-1 px-4 py-3 bg-green-500/10 border border-green-500/25 rounded-xl">
                            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-green-300 truncate">{cookiesFileName}</p>
                              <p className="text-[10px] text-muted-foreground">Cookies loaded — ready to analyze</p>
                            </div>
                            <button
                              onClick={() => { setCookiesBase64(null); setCookiesFileName(null); }}
                              className="text-muted-foreground hover:text-white text-[11px] shrink-0 hover:bg-white/10 px-2 py-1 rounded"
                            >✕ Remove</button>
                          </div>
                          <Button
                            onClick={reAnalyzeWithCookies}
                            disabled={analyzeVideo.isPending}
                            className={`shrink-0 font-bold h-11 px-6 ${isDRM ? "bg-red-500 hover:bg-red-600 text-white" : "bg-amber-500 hover:bg-amber-600 text-black"}`}
                          >
                            {analyzeVideo.isPending
                              ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Analyzing...</>
                              : <><Zap className="w-4 h-4 mr-2" />Re-analyze with Cookies</>
                            }
                          </Button>
                        </div>
                      ) : (
                        /* Upload area */
                        <label htmlFor="cookies-upload-main" className="cursor-pointer block">
                          <div className={`group flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed transition-all duration-300 text-center
                            ${isDRM
                              ? "border-red-500/30 hover:border-red-400/60 hover:bg-red-500/5"
                              : "border-amber-500/30 hover:border-amber-400/60 hover:bg-amber-500/5"
                            }`}
                          >
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl transition-transform group-hover:scale-110 ${isDRM ? "bg-red-500/10" : "bg-amber-500/10"}`}>
                              🍪
                            </div>
                            <div>
                              <p className={`font-bold text-sm mb-1 ${isDRM ? "text-red-300" : "text-amber-300"}`}>
                                Click to upload cookies.txt
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Export from "Get cookies.txt LOCALLY" extension · .txt files only
                              </p>
                            </div>
                            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-colors ${isDRM
                              ? "bg-red-500/15 border border-red-500/30 text-red-300 group-hover:bg-red-500/25"
                              : "bg-amber-500/15 border border-amber-500/30 text-amber-300 group-hover:bg-amber-500/25"
                            }`}>
                              <Upload className="w-4 h-4" />
                              Browse cookies.txt
                            </div>
                          </div>
                        </label>
                      )}
                    </div>
                  </motion.div>
                );
              }

              // CASE: Direct download — no banner, just show formats below
              return null;
            })()}

            {/* Format Selection */}
            <div className="flex flex-col gap-4">

              {/* Video Qualities — full width */}
              {videoFormats.length > 0 && (
                <div className="bg-card border border-white/10 rounded-2xl p-3 sm:p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <FileVideo className="w-4 h-4 text-blue-400" />
                    </div>
                    <h4 className="font-semibold text-sm">Video Qualities</h4>
                    <Badge variant="secondary" className="ml-auto text-xs bg-white/5">{videoFormats.length} option{videoFormats.length !== 1 ? "s" : ""}</Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {videoFormats.map((fmt, i) => (
                      <QualityCard
                        key={fmt.formatId}
                        fmt={fmt as any}
                        isSelected={selectedFormat?.formatId === fmt.formatId}
                        isFirst={i === 0}
                        onClick={() => setSelectedFormat(fmt)}
                      />
                    ))}
                  </div>

                  {/* Output container format */}
                  <div className="mt-4 pt-4 border-t border-white/8 flex items-center gap-3">
                    <p className="text-xs text-muted-foreground font-medium shrink-0">Output</p>
                    <div className="flex gap-2">
                      {VIDEO_OUTPUT_FORMATS.map(fmt => (
                        <button
                          key={fmt}
                          onClick={() => setVideoOutputFmt(fmt)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-bold uppercase border transition-all",
                            videoOutputFmt === fmt
                              ? "bg-primary/15 border-primary/40 text-primary"
                              : "bg-white/5 border-white/10 text-muted-foreground hover:border-white/25"
                          )}
                        >{fmt}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Audio Formats */}
              {audioFormats.length > 0 && (
                <div className="bg-card border border-white/10 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <Headphones className="w-4 h-4 text-purple-400" />
                    </div>
                    <h4 className="font-semibold text-sm">Audio Only</h4>
                    <Badge variant="secondary" className="ml-auto text-xs bg-white/5">{audioFormats.length} format{audioFormats.length !== 1 ? "s" : ""}</Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {audioFormats.map(fmt => {
                      const isSelected = selectedFormat?.formatId === fmt.formatId;
                      const isMP3 = fmt.ext === "mp3";
                      const isFLAC = fmt.ext === "flac";
                      const isWAV = fmt.ext === "wav";
                      const size = formatSize(fmt.filesize);
                      const iconColor = isMP3 ? "text-orange-400" : isFLAC ? "text-blue-400" : isWAV ? "text-green-400" : "text-green-400";
                      const bgColor = isMP3 ? "bg-orange-500/20" : isFLAC ? "bg-blue-500/20" : "bg-green-500/20";
                      const desc = isMP3 ? "Universal · 320kbps" : isFLAC ? "Lossless" : isWAV ? "Uncompressed" : "High quality AAC";

                      return (
                        <button
                          key={fmt.formatId}
                          onClick={() => setSelectedFormat(fmt)}
                          className={cn(
                            "flex flex-col items-center gap-2.5 p-3.5 rounded-xl border text-center transition-all duration-200 group",
                            isSelected
                              ? "bg-purple-500/10 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.15)]"
                              : "bg-white/3 border-white/8 hover:bg-white/8 hover:border-white/20"
                          )}
                        >
                          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", bgColor)}>
                            {isMP3 ? <Music className={cn("w-5 h-5", iconColor)} /> : <FileAudio className={cn("w-5 h-5", iconColor)} />}
                          </div>
                          <div className="min-w-0">
                            <div className="font-black font-mono text-sm uppercase">{fmt.ext}</div>
                            <div className="text-[10px] text-muted-foreground leading-tight">{desc}</div>
                            {size && <div className="text-[10px] text-white/40">{size}</div>}
                          </div>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-purple-400" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Watermark Removal Card ──────────────────────────── */}
            {(videoFormats.length > 0 || analyzedData.formats.some((f: any) => f.hasVideo)) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "rounded-2xl border overflow-hidden transition-all duration-300",
                  removeWatermark
                    ? "bg-gradient-to-br from-violet-950/50 via-card to-purple-950/30 border-violet-500/30 shadow-[0_0_30px_rgba(139,92,246,0.12)]"
                    : "bg-card border-white/10"
                )}
              >
                <div className="flex items-center gap-4 p-4">
                  <div className={cn(
                    "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-all",
                    removeWatermark ? "bg-violet-500/20" : "bg-white/5"
                  )}>
                    <Wand2 className={cn("w-5 h-5 transition-colors", removeWatermark ? "text-violet-400" : "text-muted-foreground")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-white">Remove Watermarks & Logos</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      {(() => {
                        const p = (analyzedData as any)?.platform?.toLowerCase() || "";
                        const u = (analyzedData as any)?.url?.toLowerCase() || "";
                        if (p.includes("hotstar") || u.includes("hotstar") || u.includes("jiohotstar"))
                          return "Removes JioHotstar channel logo (top-left) & Disney+ badge";
                        if (p.includes("tiktok") || u.includes("tiktok"))
                          return "Crops bottom 8% — removes username bar & TikTok logo";
                        if (p.includes("instagram") || u.includes("instagram"))
                          return "Crops bottom 7% — removes handle & Instagram watermark";
                        if (p.includes("sony") || u.includes("sonyliv"))
                          return "Removes SonyLIV channel watermark from top-left corner";
                        if (p.includes("zee") || u.includes("zee5"))
                          return "Removes Zee5 logo from top-left corner";
                        if (p.includes("mx") || u.includes("mxplayer"))
                          return "Removes MX Player branding watermark";
                        if (p.includes("netflix") || u.includes("netflix"))
                          return "Removes Netflix N logo from corner";
                        if (p.includes("prime") || u.includes("primevideo"))
                          return "Removes Amazon Prime Video badge";
                        return "Removes corner logos, channel watermarks & bottom overlays";
                      })()}
                    </p>
                  </div>
                  <Switch
                    id="watermark-main"
                    checked={removeWatermark}
                    onCheckedChange={setRemoveWatermark}
                    className="data-[state=checked]:bg-violet-500 shrink-0"
                  />
                </div>

                {removeWatermark && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    className="border-t border-violet-500/20 px-4 pb-4 pt-3"
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(() => {
                        const p = (analyzedData as any)?.platform?.toLowerCase() || "";
                        const u = (analyzedData as any)?.url?.toLowerCase() || "";
                        let items: { icon: string; label: string; desc: string }[];
                        if (p.includes("tiktok") || u.includes("tiktok")) {
                          items = [
                            { icon: "👤", label: "Username Bar", desc: "Bottom 8% crop" },
                            { icon: "🎵", label: "Music Credit", desc: "Bottom overlay" },
                            { icon: "🎯", label: "Promo Tags", desc: "Sponsored labels" },
                          ];
                        } else if (p.includes("instagram") || u.includes("instagram")) {
                          items = [
                            { icon: "📸", label: "Handle Tag", desc: "Bottom crop 7%" },
                            { icon: "📍", label: "Location Tag", desc: "Story overlay" },
                            { icon: "🔗", label: "Link sticker", desc: "Bottom bar" },
                          ];
                        } else if (p.includes("hotstar") || u.includes("hotstar")) {
                          items = [
                            { icon: "📺", label: "JioHotstar Logo", desc: "Top-left 135×58px" },
                            { icon: "⭐", label: "Disney+ Badge", desc: "Channel branding" },
                            { icon: "🔴", label: "LIVE badge", desc: "Corner overlay" },
                          ];
                        } else if (p.includes("sony") || u.includes("sonyliv")) {
                          items = [
                            { icon: "🎬", label: "SonyLIV Logo", desc: "Top-left 110×50px" },
                            { icon: "📡", label: "Channel Bug", desc: "Corner watermark" },
                            { icon: "✂️", label: "Bottom Bar", desc: "Info overlay" },
                          ];
                        } else {
                          items = [
                            { icon: "🎯", label: "Top-Left Logo", desc: "delogo 140×60px" },
                            { icon: "🔖", label: "Top-Right Badge", desc: "Channel mark" },
                            { icon: "✂️", label: "Bottom Strip", desc: "8% crop" },
                          ];
                        }
                        return items.map(item => (
                          <div key={item.label} className="flex items-start gap-2 p-2.5 rounded-xl bg-violet-500/8 border border-violet-500/20">
                            <span className="text-sm shrink-0">{item.icon}</span>
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold text-white truncate">{item.label}</p>
                              <p className="text-[10px] text-violet-300/60">{item.desc}</p>
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-2.5 flex items-center gap-1.5">
                      <Info className="w-3 h-3 shrink-0" />
                      ffmpeg delogo/crop filter applied during download merge step. Works best on DASH/HLS streams.
                    </p>
                  </motion.div>
                )}
              </motion.div>
            )}

            {/* Advanced Options */}
            <div className="bg-card border border-white/10 rounded-2xl overflow-hidden">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between p-4 text-sm font-medium hover:bg-white/3 transition-colors"
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="w-4 h-4" />
                  Advanced Options
                </span>
                {showAdvanced ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>

              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                    className="border-t border-white/8 px-4 pb-4 pt-3 flex flex-col gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Upload className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium mb-1">Cookies File</p>
                        <p className="text-xs text-muted-foreground mb-2">Upload cookies.txt to bypass login/age restrictions</p>
                        {cookiesBase64 && (
                          <div className="flex items-center gap-2 mb-2 px-3 py-1.5 bg-green-500/10 border border-green-500/25 rounded-lg text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                            <span className="text-green-300 font-medium truncate">{cookiesFileName}</span>
                            <button onClick={() => { setCookiesBase64(null); setCookiesFileName(null); if (cookiesRef.current) cookiesRef.current.value = ""; }} className="ml-auto text-muted-foreground hover:text-white text-[10px]">✕ Remove</button>
                          </div>
                        )}
                        <input ref={cookiesRef} type="file" accept=".txt" onChange={handleCookiesFile} className="text-xs text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border file:border-white/10 file:bg-white/5 file:text-xs file:font-medium file:text-white cursor-pointer" />
                      </div>
                    </div>
                    <div className="p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl flex items-start gap-2 text-xs text-muted-foreground">
                      <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                      <span>VidSnap tries multiple extraction methods. If a site fails with yt-dlp, it automatically falls back to browser extraction and HLS direct download.</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* ── Sticky Download Bar ──────────────────────────────── */}
          </motion.div>
        )}
      </AnimatePresence>

      {/* STICKY DOWNLOAD FLOATING BAR — always visible when format selected */}
      <AnimatePresence>
        {analyzedData && selectedFormat && (
          <motion.div
            initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 60 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-4 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
          >
            <div className="pointer-events-auto w-full max-w-2xl flex flex-col gap-2">

              {/* ── Download Error Toast — shown when validation blocks download ── */}
              <AnimatePresence>
                {downloadError && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.97 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-950/90 border border-red-500/40 backdrop-blur-xl shadow-lg"
                  >
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-200 leading-relaxed flex-1">{downloadError}</p>
                    <button
                      onClick={() => setDownloadError(null)}
                      className="text-red-400 hover:text-red-200 text-lg leading-none shrink-0 transition-colors ml-2"
                      aria-label="Dismiss error"
                    >×</button>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Main sticky bar ─────────────────────────────────────────────── */}
              <div className="relative">
                {/* Outer glow — turns red tint when error is active */}
                <div className={cn(
                  "absolute -inset-1 rounded-2xl opacity-40 blur-lg",
                  downloadError ? "bg-red-500/60" : "bg-gradient-electric"
                )} />
                <div className="relative bg-card/95 backdrop-blur-xl border border-white/20 rounded-2xl px-4 py-3 flex items-center gap-4 shadow-2xl">

                  {/* Format info */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      selectedFormat.hasVideo ? "bg-primary/15 border border-primary/25" : "bg-purple-500/15 border border-purple-500/25"
                    )}>
                      {selectedFormat.hasVideo
                        ? <FileVideo className="w-5 h-5 text-primary" />
                        : <Headphones className="w-5 h-5 text-purple-400" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-black text-sm text-white truncate">
                        {selectedFormat.hasVideo
                          ? `${selectedFormat.quality} · ${videoOutputFmt.toUpperCase()}`
                          : `${selectedFormat.ext.toUpperCase()} · Audio`}
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {selectedFormat.hasVideo
                          ? `${(selectedFormat as any).codecLabel || "Video"} · ${selectedFormat.resolution || "Best"}${selectedFormat.fps ? ` · ${selectedFormat.fps}fps` : ""}`
                          : selectedFormat.acodec || "Audio"}
                        {removeWatermark && <span className="ml-2 text-violet-400">· 🧙 Logo removed</span>}
                      </div>
                    </div>
                  </div>

                  {/* File size badge */}
                  {(formatSize(selectedFormat.filesize) ?? formatSize((selectedFormat as any).filesizeEstimated, true)) && (
                    <span className="shrink-0 text-xs font-mono px-2 py-1 bg-white/8 border border-white/10 rounded-lg text-white/60">
                      {formatSize(selectedFormat.filesize) ?? formatSize((selectedFormat as any).filesizeEstimated, true)}
                    </span>
                  )}

                  {/* Download button */}
                  <Button
                    size="lg"
                    onClick={handleDownload}
                    disabled={startDownload.isPending}
                    className={cn(
                      "shrink-0 text-white border-0 font-black h-11 px-6 text-sm transition-all duration-200",
                      downloadError
                        ? "bg-red-600/80 hover:bg-red-700"
                        : "bg-gradient-electric hover:shadow-electric"
                    )}
                  >
                    {startDownload.isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting...</>
                    ) : (
                      <><Download className="mr-2 h-4 w-4" />
                        Download {selectedFormat.hasVideo ? selectedFormat.quality : selectedFormat.ext.toUpperCase()}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Brand Showcase & Guides (empty state OR DRM/no-video state) ───── */}
      {(!analyzedData || (analyzedData && videoFormats.length === 0 && !cookiesBase64)) && !analyzeVideo.isPending && (
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="space-y-16 mt-8"
        >
          {/* ── HOW IT WORKS ── Premium Animated Guide ─────────────────────── */}
          <div className="space-y-8">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary mb-4">
                <Sparkles className="w-3.5 h-3.5" /> SIMPLE AS 1-2-3
              </div>
              <h2 className="text-3xl font-black text-white mb-2 tracking-tight">Download Any Video</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">From 1,000+ websites. No registration. No limits. Just pure quality.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  step: "01",
                  gradient: "from-violet-500/20 via-violet-500/5 to-transparent",
                  border: "border-violet-500/25 hover:border-violet-500/50",
                  glow: "rgba(139,92,246,0.2)",
                  numColor: "text-violet-400",
                  iconBg: "bg-violet-500/20",
                  icon: <Link2 className="w-6 h-6 text-violet-400" />,
                  title: "Copy any URL",
                  desc: "YouTube, Instagram, TikTok, JioHotstar, Netflix, Twitter/X — any link from any app or browser.",
                  tag: "1000+ websites",
                  tagColor: "bg-violet-500/15 text-violet-300",
                },
                {
                  step: "02",
                  gradient: "from-blue-500/20 via-blue-500/5 to-transparent",
                  border: "border-blue-500/25 hover:border-blue-500/50",
                  glow: "rgba(59,130,246,0.2)",
                  numColor: "text-blue-400",
                  iconBg: "bg-blue-500/20",
                  icon: <Globe className="w-6 h-6 text-blue-400" />,
                  title: "Analyze & Pick Quality",
                  desc: "We extract every available format — 4K AV1, 1080p H.264, VP9, HDR, audio-only. Pick what you need.",
                  tag: "4K · HDR · AV1",
                  tagColor: "bg-blue-500/15 text-blue-300",
                },
                {
                  step: "03",
                  gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
                  border: "border-emerald-500/25 hover:border-emerald-500/50",
                  glow: "rgba(16,185,129,0.2)",
                  numColor: "text-emerald-400",
                  iconBg: "bg-emerald-500/20",
                  icon: <Download className="w-6 h-6 text-emerald-400" />,
                  title: "Download & Keep",
                  desc: "Download in MP4, MKV, WebM, MP3, FLAC. Strip watermarks & logos automatically.",
                  tag: "No watermarks",
                  tagColor: "bg-emerald-500/15 text-emerald-300",
                },
              ].map((s, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * idx, duration: 0.5, ease: "easeOut" }}
                  className={cn(
                    "relative rounded-2xl border overflow-hidden p-6 group cursor-default transition-all duration-300",
                    s.border,
                    `bg-gradient-to-br ${s.gradient}`
                  )}
                >
                  {/* Big step number background */}
                  <div className={cn("absolute top-4 right-5 text-7xl font-black font-mono select-none opacity-8 transition-opacity group-hover:opacity-15", s.numColor)}>
                    {s.step}
                  </div>

                  {/* Icon */}
                  <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-5", s.iconBg)}>
                    {s.icon}
                  </div>

                  {/* Content */}
                  <div className="space-y-2">
                    <h3 className="text-lg font-black text-white">{s.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>

                  {/* Tag */}
                  <div className={cn("inline-flex items-center gap-1 mt-4 px-2.5 py-1 rounded-lg text-[10px] font-bold", s.tagColor)}>
                    {s.tag}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* ── WHY VIDSNAP ── Feature highlights ────────────────────── */}
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-black text-white mb-1">Why VidSnap?</h2>
              <p className="text-xs text-muted-foreground">The most complete video downloader on the web</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { icon: <Layers className="w-5 h-5 text-violet-400" />, bg: "bg-violet-500/10", label: "All Codecs", desc: "AV1, VP9, H.264, H.265 — every variant shown" },
                { icon: <Wand2 className="w-5 h-5 text-pink-400" />, bg: "bg-pink-500/10", label: "Logo Removal", desc: "Platform-specific delogo for OTT & social" },
                { icon: <Zap className="w-5 h-5 text-amber-400" />, bg: "bg-amber-500/10", label: "Lightning Fast", desc: "Multi-threaded yt-dlp + FFmpeg pipeline" },
                { icon: <Shield className="w-5 h-5 text-blue-400" />, bg: "bg-blue-500/10", label: "Cookies Support", desc: "Unlock age-restricted & login-gated content" },
                { icon: <Globe className="w-5 h-5 text-emerald-400" />, bg: "bg-emerald-500/10", label: "1000+ Sites", desc: "YouTube · Instagram · TikTok · Hotstar & more" },
                { icon: <FileAudio className="w-5 h-5 text-orange-400" />, bg: "bg-orange-500/10", label: "Studio Editor", desc: "Trim · speed · pitch · visual filters in-browser" },
                { icon: <Star className="w-5 h-5 text-yellow-400" />, bg: "bg-yellow-500/10", label: "True 4K", desc: "Highest bitrate, HDR, Dolby Vision supported" },
                { icon: <Lock className="w-5 h-5 text-cyan-400" />, bg: "bg-cyan-500/10", label: "Private & Safe", desc: "No data stored, runs locally on your system" },
              ].map(({ icon, bg, label, desc }) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className="flex flex-col gap-3 p-4 rounded-2xl bg-card/40 border border-white/6 hover:bg-white/5 hover:border-white/12 transition-all duration-300 group"
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform", bg)}>
                    {icon}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{label}</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Supported Platforms */}
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-white">Supported Platforms</h2>
              <p className="text-xs text-muted-foreground mt-1">Download original quality media files from over 1,000 websites</p>
            </div>

            {supportedData?.platforms && supportedData.platforms.length > 0 ? (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {supportedData.platforms.slice(0, 12).map((platform: any, i: number) => (
                  <motion.div
                    key={platform.domain}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex flex-col items-center justify-center p-4 rounded-2xl bg-card/30 border border-white/5 hover:border-white/15 hover:bg-white/8 transition-all duration-300 text-center space-y-3 group cursor-default"
                  >
                    <div className="w-8 h-8 flex items-center justify-center text-white/80 group-hover:text-white group-hover:scale-110 transition-all duration-300">
                      {platform.icon && platform.icon.startsWith("<svg") ? (
                        <div
                          dangerouslySetInnerHTML={{ __html: platform.icon }}
                          className="w-full h-full [&>svg]:w-full [&>svg]:h-full fill-current [&>svg]:fill-current"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold font-mono">
                          {platform.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-white truncate max-w-[5.5rem]">{platform.name}</p>
                      <p className="text-[9px] text-muted-foreground truncate max-w-[5.5rem] font-mono">{platform.domain}</p>
                    </div>
                  </motion.div>
                ))}
                <Link href="/platforms" className="flex flex-col items-center justify-center p-4 rounded-2xl bg-gradient-electric/10 border border-primary/20 hover:border-primary/40 hover:bg-gradient-electric/15 transition-all duration-300 text-center space-y-1.5 cursor-pointer">
                  <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-sm font-bold text-primary">+</div>
                  <div>
                    <p className="text-xs font-bold text-white">1000+ More</p>
                    <p className="text-[9px] text-primary hover:underline font-semibold">View Full List</p>
                  </div>
                </Link>
              </div>
            ) : (
              <div className="text-center text-xs text-muted-foreground">Loading platform registry…</div>
            )}
          </div>

          {/* Tech Specs Footer */}
          <div className="flex flex-wrap justify-center gap-2">
            {[
              { icon: <Zap className="w-3.5 h-3.5 text-primary" />, label: "8x concurrent download threads" },
              { icon: <Shield className="w-3.5 h-3.5 text-blue-400" />, label: "Bypasses restrictions via auto-cookies" },
              { icon: <Globe className="w-3.5 h-3.5 text-emerald-400" />, label: "DASH, HLS, live streams & playlist support" },
              { icon: <FileAudio className="w-3.5 h-3.5 text-pink-400" />, label: "High bitrate FLAC, WAV & MP3 formats" },
            ].map(({ icon, label }) => (
              <span key={label} className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/4 border border-white/6 text-xs text-white/70">
                {icon}{label}
              </span>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
