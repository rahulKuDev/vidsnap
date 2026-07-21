import { useState, useRef, useEffect, useCallback } from "react";
import { useSearch, useLocation } from "wouter";
import {
  useGetDownloadHistory,
  useEditVideo,
  useGetJobStatus,
  DownloadJob,
  EditInputOutputFormat,
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Scissors, Volume2, VolumeX, Sparkles, FileVideo, Loader2,
  Play, Pause, Mic, Gauge, Download, ChevronDown,
  CheckCircle2, AlertCircle, Wand2, RotateCcw,
  FlipHorizontal2, SunMedium, Contrast, Droplets,
  AudioWaveform, MicOff, Zap, Film, ImageIcon, Settings2, RefreshCw,
  FlipVertical2, Trash2, Undo2, Redo2, ZoomIn, ZoomOut, Square,
  ArrowDownToLine, X, Waves,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── helpers ─────────────────────────────────────────────────────────────────
function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 10);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${ms}`;
}

function getFileUrl(filename: string, preview = false) {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api/video/file/${filename}${preview ? "?preview=1" : ""}`;
}

// ─── tabs ────────────────────────────────────────────────────────────────────
type Tab = "trim" | "audio" | "voice" | "effects" | "transform" | "export";

const TABS: { id: Tab; label: string; icon: React.ReactNode; activeColor: string }[] = [
  { id: "trim",      label: "Trim",      icon: <Scissors className="w-3.5 h-3.5" />,   activeColor: "text-violet-400" },
  { id: "audio",     label: "Audio",     icon: <Volume2 className="w-3.5 h-3.5" />,     activeColor: "text-blue-400"   },
  { id: "voice",     label: "Voice",     icon: <Mic className="w-3.5 h-3.5" />,         activeColor: "text-pink-400"   },
  { id: "effects",   label: "Effects",   icon: <Film className="w-3.5 h-3.5" />,        activeColor: "text-amber-400"  },
  { id: "transform", label: "Transform", icon: <Settings2 className="w-3.5 h-3.5" />,   activeColor: "text-emerald-400"},
  { id: "export",    label: "Export",    icon: <Download className="w-3.5 h-3.5" />,    activeColor: "text-sky-400"    },
];

// ─── voice presets ────────────────────────────────────────────────────────────
const VOICE_PRESETS = [
  { id: "normal",    label: "Original",   emoji: "🎤", desc: "No effect",     activeCls: "border-white/30 bg-white/8" },
  { id: "chipmunk",  label: "Chipmunk",   emoji: "🐿️", desc: "+7 semitones",   activeCls: "border-yellow-500/50 bg-yellow-500/10" },
  { id: "deep",      label: "Deep",       emoji: "🎸", desc: "-5 semitones",   activeCls: "border-blue-500/50 bg-blue-500/10" },
  { id: "robot",     label: "Robot",      emoji: "🤖", desc: "Echo + chorus",  activeCls: "border-cyan-500/50 bg-cyan-500/10" },
  { id: "echo",      label: "Cave Echo",  emoji: "🏔️", desc: "Long reverb",    activeCls: "border-purple-500/50 bg-purple-500/10" },
  { id: "telephone", label: "Telephone",  emoji: "📞", desc: "Lo-fi band",     activeCls: "border-green-500/50 bg-green-500/10" },
  { id: "bass",      label: "Bass Boost", emoji: "🔊", desc: "Low freq boost", activeCls: "border-red-500/50 bg-red-500/10" },
  { id: "treble",    label: "Air",        emoji: "🌬️", desc: "High freq lift", activeCls: "border-sky-500/50 bg-sky-500/10" },
  { id: "hall",      label: "Concert",    emoji: "🎭", desc: "Hall reverb",    activeCls: "border-violet-500/50 bg-violet-500/10" },
] as const;
type VoiceEffect = typeof VOICE_PRESETS[number]["id"];

// ─── visual filters ────────────────────────────────────────────────────────────
const VISUAL_FILTERS = [
  { id: "none",      label: "None",      emoji: "🎬", cssFilter: "" },
  { id: "bw",        label: "B&W",       emoji: "⚫", cssFilter: "grayscale(1)" },
  { id: "sepia",     label: "Sepia",     emoji: "🟤", cssFilter: "sepia(0.85)" },
  { id: "vintage",   label: "Vintage",   emoji: "📷", cssFilter: "sepia(0.3) contrast(1.1) saturate(0.85)" },
  { id: "cinematic", label: "Cinematic", emoji: "🎥", cssFilter: "contrast(1.2) saturate(0.8)" },
  { id: "cold",      label: "Cold",      emoji: "❄️", cssFilter: "hue-rotate(200deg) saturate(1.3)" },
  { id: "warm",      label: "Warm",      emoji: "🔥", cssFilter: "hue-rotate(-20deg) saturate(1.15)" },
  { id: "fade",      label: "Fade",      emoji: "🌫️", cssFilter: "brightness(1.25) contrast(0.75) saturate(0.8)" },
] as const;
type VisualFilter = typeof VISUAL_FILTERS[number]["id"];

const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4] as const;

const FORMAT_OPTIONS = [
  { value: "mp4",  label: "MP4",  desc: "Best compatibility", icon: "🎬", activeCls: "border-blue-500/40 bg-blue-500/8" },
  { value: "webm", label: "WebM", desc: "Web optimized",      icon: "🌐", activeCls: "border-green-500/40 bg-green-500/8" },
  { value: "mp3",  label: "MP3",  desc: "Audio only",         icon: "🎵", activeCls: "border-orange-500/40 bg-orange-500/8" },
  { value: "m4a",  label: "M4A",  desc: "High quality audio", icon: "🎧", activeCls: "border-violet-500/40 bg-violet-500/8" },
  { value: "flac", label: "FLAC", desc: "Lossless audio",     icon: "💎", activeCls: "border-amber-500/40 bg-amber-500/8" },
  { value: "wav",  label: "WAV",  desc: "Uncompressed audio", icon: "🔊", activeCls: "border-red-500/40 bg-red-500/8" },
] as const;

// ─── Trim history hook ────────────────────────────────────────────────────────
interface TrimState { start: number; end: number; mode: "keep" | "delete" }

function useTrimHistory(initial: TrimState) {
  const [past, setPast] = useState<TrimState[]>([]);
  const [present, setPresent] = useState<TrimState>(initial);
  const [future, setFuture] = useState<TrimState[]>([]);
  const presentRef = useRef(present);
  presentRef.current = present;

  const push = useCallback((next: TrimState) => {
    setPast(p => [...p.slice(-49), presentRef.current]);
    setPresent(next);
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    setPast(p => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setFuture(f => [presentRef.current, ...f]);
      setPresent(prev);
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture(f => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast(p => [...p, presentRef.current]);
      setPresent(next);
      return f.slice(1);
    });
  }, []);

  const reset = useCallback((s: TrimState) => {
    setPast([]); setPresent(s); setFuture([]);
  }, []);

  return {
    trimState: present, push, undo, redo, reset,
    canUndo: past.length > 0, canRedo: future.length > 0,
    pastCount: past.length, futureCount: future.length,
  };
}

// ─── Job selector ─────────────────────────────────────────────────────────────
function JobSelector({ jobs, selected, onChange }: {
  jobs: DownloadJob[]; selected: DownloadJob | null; onChange: (job: DownloadJob) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 hover:bg-white/8 transition-colors text-left">
        {selected ? (
          <>
            {selected.thumbnail
              ? <img src={selected.thumbnail} alt="" className="w-14 h-9 object-cover rounded-lg shrink-0" />
              : <div className="w-14 h-9 bg-white/10 rounded-lg flex items-center justify-center shrink-0"><FileVideo className="w-5 h-5 text-muted-foreground" /></div>}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-white truncate">{selected.title || selected.filename}</p>
              <p className="text-xs text-muted-foreground uppercase font-mono mt-0.5">{selected.outputFormat} · {selected.quality || "best"}</p>
            </div>
          </>
        ) : (
          <span className="text-muted-foreground text-sm">Choose a completed download to edit…</span>
        )}
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 top-full mt-2 w-full max-h-72 overflow-y-auto bg-popover/95 backdrop-blur border border-white/10 rounded-xl shadow-2xl">
            {jobs.length === 0
              ? <div className="p-6 text-center text-sm text-muted-foreground"><FileVideo className="w-8 h-8 mx-auto mb-2 opacity-40" />No completed downloads yet.</div>
              : jobs.map(job => (
                <button key={job.id} type="button" onClick={() => { onChange(job); setOpen(false); }}
                  className={cn("w-full flex items-center gap-3 px-4 py-3 hover:bg-white/8 transition-colors text-left border-b border-white/5 last:border-0", selected?.id === job.id && "bg-primary/10")}>
                  {job.thumbnail
                    ? <img src={job.thumbnail} alt="" className="w-14 h-9 object-cover rounded-lg shrink-0" />
                    : <div className="w-14 h-9 bg-white/10 rounded-lg flex items-center justify-center shrink-0"><FileVideo className="w-4 h-4 text-muted-foreground" /></div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{job.title || job.filename}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono uppercase">{job.outputFormat} · {job.quality || "best"}</p>
                  </div>
                  {selected?.id === job.id && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                </button>
              ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function parseMmSs(str: string): number {
  const parts = str.trim().split(":").map(Number);
  if (parts.some(isNaN)) return 0;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

// ─── Trim timeline ─────────────────────────────────────────────────────────────
function TrimTimeline({
  duration, trimStart, trimEnd, trimMode, currentTime, zoom,
  onTrimChange, onSeek, onDelete, onReset, onModeToggle,
  canUndo, canRedo, onUndo, onRedo, pastCount, futureCount,
}: {
  duration: number; trimStart: number; trimEnd: number;
  trimMode: "keep" | "delete"; currentTime: number; zoom: number;
  onTrimChange: (s: number, e: number) => void;
  onSeek: (t: number) => void; onDelete: () => void; onReset: () => void; onModeToggle: () => void;
  canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void;
  pastCount: number; futureCount: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | "region" | null>(null);
  const dragStartX = useRef(0);
  const dragStartVals = useRef({ start: 0, end: 0 });
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [startEditing, setStartEditing] = useState(false);
  const [endEditing, setEndEditing] = useState(false);

  useEffect(() => { if (!startEditing) setStartInput(fmt(trimStart)); }, [trimStart, startEditing]);
  useEffect(() => { if (!endEditing) setEndInput(fmt(trimEnd)); }, [trimEnd, endEditing]);

  const safeD = Math.max(duration, 0.001);
  const halfSpan = 1 / (2 * zoom);
  const center = currentTime / safeD;
  const viewStart = Math.max(0, Math.min(1 - 2 * halfSpan, center - halfSpan));
  const viewEnd = Math.min(1, viewStart + 2 * halfSpan);

  const pct = (v: number) => {
    const raw = v / safeD;
    return Math.min(100, Math.max(0, ((raw - viewStart) / (viewEnd - viewStart)) * 100));
  };
  const fromPct = useCallback((p: number) => {
    const raw = viewStart + (p / 100) * (viewEnd - viewStart);
    return Math.min(duration, Math.max(0, raw * duration));
  }, [viewStart, viewEnd, duration]);

  const getPosPct = useCallback((e: PointerEvent | React.PointerEvent) => {
    if (!barRef.current) return 0;
    const rect = barRef.current.getBoundingClientRect();
    return Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
  }, []);

  useEffect(() => {
    const up = () => { dragging.current = null; };
    const move = (e: PointerEvent) => {
      if (!dragging.current) return;
      const t = fromPct(getPosPct(e));
      if (dragging.current === "start") onTrimChange(Math.max(0, Math.min(t, trimEnd - 0.5)), trimEnd);
      else if (dragging.current === "end") onTrimChange(trimStart, Math.min(duration, Math.max(t, trimStart + 0.5)));
      else if (dragging.current === "region") {
        const dx = getPosPct(e) - dragStartX.current;
        const dt = (dx / 100) * (viewEnd - viewStart) * duration;
        const s = Math.max(0, dragStartVals.current.start + dt);
        const len = dragStartVals.current.end - dragStartVals.current.start;
        onTrimChange(s, Math.min(duration, s + len));
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [trimStart, trimEnd, duration, getPosPct, fromPct, viewStart, viewEnd]);

  const applyStart = () => { onTrimChange(Math.max(0, Math.min(parseMmSs(startInput), trimEnd - 0.5)), trimEnd); setStartEditing(false); };
  const applyEnd = () => { onTrimChange(trimStart, Math.max(trimStart + 0.5, Math.min(parseMmSs(endInput), duration))); setEndEditing(false); };

  const rulerMarks = () => {
    if (duration <= 0) return [];
    const visD = (viewEnd - viewStart) * duration;
    const intervals = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const interval = intervals.find(i => visD / i <= 9) || 600;
    const st = viewStart * duration, et = viewEnd * duration;
    const marks: number[] = [];
    for (let t = Math.floor(st / interval) * interval; t <= et + interval; t += interval)
      if (t >= 0 && t <= duration) marks.push(Math.round(t * 10) / 10);
    return marks;
  };

  const clipDur = trimEnd - trimStart;
  const isDelete = trimMode === "delete";
  const bgColor = isDelete ? "bg-red-400" : "bg-violet-400";

  return (
    <div className="space-y-3">
      {/* Mode + Undo/Redo */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={onModeToggle}
          className={cn("flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all flex-1",
            isDelete ? "bg-red-500/15 border-red-500/40 text-red-300" : "bg-violet-500/10 border-violet-500/20 text-violet-300")}>
          {isDelete ? <Trash2 className="w-3.5 h-3.5" /> : <Scissors className="w-3.5 h-3.5" />}
          {isDelete ? "Delete Selected Region" : "Keep Selected Region"}
          <span className="ml-auto text-[9px] opacity-50">tap to switch</span>
        </button>
        <button type="button" onClick={onUndo} disabled={!canUndo} title={`Undo (Ctrl+Z) — ${pastCount} steps`}
          className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-muted-foreground hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <Undo2 className="w-3.5 h-3.5" />
          {canUndo && <span className="absolute -top-1 -right-1 bg-violet-500 text-white text-[7px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">{pastCount}</span>}
        </button>
        <button type="button" onClick={onRedo} disabled={!canRedo} title={`Redo (Ctrl+Y) — ${futureCount} steps`}
          className="relative w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-muted-foreground hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
          <Redo2 className="w-3.5 h-3.5" />
          {canRedo && <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[7px] rounded-full w-3.5 h-3.5 flex items-center justify-center font-bold">{futureCount}</span>}
        </button>
      </div>

      {/* Time chips */}
      <div className="flex items-center justify-between gap-2">
        <div className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 border", isDelete ? "bg-red-500/10 border-red-500/25" : "bg-violet-500/10 border-violet-500/25")}>
          <span className={cn("text-[10px] uppercase font-bold", isDelete ? "text-red-400" : "text-violet-400")}>{isDelete ? "From" : "Start"}</span>
          {startEditing
            ? <input autoFocus value={startInput} onChange={e => setStartInput(e.target.value)}
                onBlur={applyStart} onKeyDown={e => { if (e.key === "Enter") applyStart(); if (e.key === "Escape") setStartEditing(false); }}
                className="w-20 bg-transparent text-xs font-mono text-white text-center outline-none" placeholder="MM:SS" />
            : <button onClick={() => setStartEditing(true)} className={cn("text-xs font-mono text-white min-w-[3.5rem] text-center", isDelete ? "hover:text-red-300" : "hover:text-violet-300")}>{fmt(trimStart)}</button>}
        </div>

        <div className="text-center flex flex-col items-center gap-0.5">
          <div className="text-[9px] text-white/25 uppercase tracking-widest">{isDelete ? "Deleted" : "Clip"}</div>
          <div className={cn("text-xs font-bold font-mono", isDelete ? "text-red-300" : "text-white")}>{fmt(clipDur)}</div>
          {duration > 0 && <div className="text-[9px] text-white/20 font-mono">{isDelete ? `${fmt(duration - clipDur)} kept` : `of ${fmt(duration)}`}</div>}
        </div>

        <div className={cn("flex items-center gap-1.5 rounded-xl px-3 py-1.5 border", isDelete ? "bg-red-500/10 border-red-500/25" : "bg-violet-500/10 border-violet-500/25")}>
          <span className={cn("text-[10px] uppercase font-bold", isDelete ? "text-red-400" : "text-violet-400")}>{isDelete ? "To" : "End"}</span>
          {endEditing
            ? <input autoFocus value={endInput} onChange={e => setEndInput(e.target.value)}
                onBlur={applyEnd} onKeyDown={e => { if (e.key === "Enter") applyEnd(); if (e.key === "Escape") setEndEditing(false); }}
                className="w-20 bg-transparent text-xs font-mono text-white text-center outline-none" placeholder="MM:SS" />
            : <button onClick={() => setEndEditing(true)} className={cn("text-xs font-mono text-white min-w-[3.5rem] text-center", isDelete ? "hover:text-red-300" : "hover:text-violet-300")}>{fmt(trimEnd)}</button>}
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-1">
        <div ref={barRef}
          className="relative h-16 bg-white/5 rounded-xl border border-white/10 select-none overflow-hidden cursor-crosshair"
          onClick={e => { if (!dragging.current) onSeek(fromPct(getPosPct(e as unknown as PointerEvent))); }}>

          <div className="absolute top-0 bottom-0 left-0 bg-black/55 pointer-events-none" style={{ width: `${pct(trimStart)}%` }} />
          <div className="absolute top-0 bottom-0 right-0 bg-black/55 pointer-events-none" style={{ width: `${100 - pct(trimEnd)}%` }} />

          <div className={cn("absolute top-0 bottom-0 border-y pointer-events-none", isDelete ? "bg-red-500/20 border-red-500/50" : "bg-violet-500/15 border-violet-500/40")}
            style={{ left: `${pct(trimStart)}%`, width: `${Math.max(0, pct(trimEnd) - pct(trimStart))}%` }} />

          {isDelete && (
            <div className="absolute top-0 bottom-0 pointer-events-none opacity-15"
              style={{ left: `${pct(trimStart)}%`, width: `${pct(trimEnd) - pct(trimStart)}%`,
                backgroundImage: "repeating-linear-gradient(45deg,#ef4444 0,#ef4444 2px,transparent 2px,transparent 10px)" }} />
          )}

          {/* Region drag (move both handles together) */}
          <div className="absolute top-0 bottom-0 cursor-move z-10"
            style={{ left: `${pct(trimStart) + 5}%`, width: `${Math.max(0, pct(trimEnd) - pct(trimStart) - 10)}%` }}
            onPointerDown={e => {
              e.stopPropagation();
              dragging.current = "region";
              dragStartX.current = getPosPct(e);
              dragStartVals.current = { start: trimStart, end: trimEnd };
              e.currentTarget.setPointerCapture(e.pointerId);
            }} />

          {/* Waveform decoration */}
          <div className="absolute inset-0 flex items-center gap-[1.5px] px-1 pointer-events-none opacity-25">
            {Array.from({ length: 150 }).map((_, i) => (
              <div key={i} className="flex-1 bg-white/80 rounded-full"
                style={{ height: `${18 + Math.abs(Math.sin(i * 0.7 + 1.2) * 38 + Math.cos(i * 1.4) * 22)}%` }} />
            ))}
          </div>

          {/* START handle */}
          <div className="absolute top-0 bottom-0 w-5 -translate-x-1/2 flex items-center justify-center cursor-ew-resize z-20 group"
            style={{ left: `${pct(trimStart)}%` }}
            onPointerDown={e => { e.stopPropagation(); dragging.current = "start"; e.currentTarget.setPointerCapture(e.pointerId); }}>
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-[9px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">{fmt(trimStart)}</div>
            <div className={cn("w-[3px] h-full rounded-sm group-hover:brightness-125 transition-all", bgColor, isDelete ? "shadow-[0_0_8px_rgba(239,68,68,0.8)]" : "shadow-[0_0_8px_rgba(139,92,246,0.8)]")} />
            <div className={cn("absolute top-1/2 -translate-y-1/2 -left-1.5 w-0 h-0 border-t-[5px] border-b-[5px] border-r-[6px] border-t-transparent border-b-transparent", isDelete ? "border-r-red-400" : "border-r-violet-400")} />
          </div>

          {/* END handle */}
          <div className="absolute top-0 bottom-0 w-5 -translate-x-1/2 flex items-center justify-center cursor-ew-resize z-20 group"
            style={{ left: `${pct(trimEnd)}%` }}
            onPointerDown={e => { e.stopPropagation(); dragging.current = "end"; e.currentTarget.setPointerCapture(e.pointerId); }}>
            <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-[9px] font-mono px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">{fmt(trimEnd)}</div>
            <div className={cn("w-[3px] h-full rounded-sm group-hover:brightness-125 transition-all", bgColor, isDelete ? "shadow-[0_0_8px_rgba(239,68,68,0.8)]" : "shadow-[0_0_8px_rgba(139,92,246,0.8)]")} />
            <div className={cn("absolute top-1/2 -translate-y-1/2 -right-1.5 w-0 h-0 border-t-[5px] border-b-[5px] border-l-[6px] border-t-transparent border-b-transparent", isDelete ? "border-l-red-400" : "border-l-violet-400")} />
          </div>

          {/* Playhead */}
          {duration > 0 && (
            <div className="absolute top-0 bottom-0 z-30 pointer-events-none" style={{ left: `${pct(currentTime)}%` }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_6px_white]" />
              <div className="w-px h-full bg-white/80 drop-shadow-[0_0_4px_white]" />
            </div>
          )}
        </div>

        {/* Ruler */}
        <div className="relative h-5">
          {rulerMarks().map(t => (
            <div key={t} className="absolute flex flex-col items-center" style={{ left: `${pct(t)}%`, transform: "translateX(-50%)" }}>
              <div className="w-px h-1.5 bg-white/15" />
              <span className="text-[9px] text-white/25 font-mono mt-0.5">{fmt(t)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Quick set */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button"
          onClick={() => onTrimChange(Math.max(0, Math.min(currentTime, trimEnd - 0.5)), trimEnd)}
          className={cn("flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold transition-all",
            isDelete ? "bg-red-500/8 border-red-500/20 text-red-300 hover:bg-red-500/15" : "bg-violet-500/10 border-violet-500/20 text-violet-300 hover:bg-violet-500/20")}>
          ⟵ Set {isDelete ? "From" : "Start"} <kbd className="bg-white/8 px-1 rounded text-[9px]">[</kbd>
        </button>
        <button type="button"
          onClick={() => onTrimChange(trimStart, Math.min(duration, Math.max(currentTime, trimStart + 0.5)))}
          className={cn("flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-semibold transition-all",
            isDelete ? "bg-red-500/8 border-red-500/20 text-red-300 hover:bg-red-500/15" : "bg-violet-500/10 border-violet-500/20 text-violet-300 hover:bg-violet-500/20")}>
          <kbd className="bg-white/8 px-1 rounded text-[9px]">]</kbd> Set {isDelete ? "To" : "End"} ⟶
        </button>
      </div>

      {/* Delete / Reset */}
      <div className={cn("grid gap-2", isDelete ? "grid-cols-2" : "grid-cols-1")}>
        {isDelete && (
          <button type="button" onClick={onDelete}
            className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/15 border border-red-500/40 text-xs font-bold text-red-300 hover:bg-red-500/25 hover:border-red-500/60 transition-all">
            <Trash2 className="w-3.5 h-3.5" /> Confirm Delete {fmt(clipDur)}
          </button>
        )}
        <button type="button" onClick={onReset}
          className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
          <Square className="w-3.5 h-3.5" /> Reset to full {duration > 0 ? fmt(duration) : "video"}
        </button>
      </div>

      <p className="text-[10px] text-white/20 text-center">
        💡 Drag handles · click to seek · <kbd className="bg-white/8 px-1 rounded">[</kbd> start · <kbd className="bg-white/8 px-1 rounded">]</kbd> end · <kbd className="bg-white/8 px-1 rounded">Space</kbd> play · <kbd className="bg-white/8 px-1 rounded">Ctrl+Z</kbd> undo
      </p>
    </div>
  );
}

// ─── Export Progress Panel ─────────────────────────────────────────────────────
function ExportProgressPanel({ jobId, onDismiss }: { jobId: string; onDismiss: () => void }) {
  const { data: job } = useGetJobStatus(jobId, {
    query: {
      queryKey: ["jobStatus", jobId],
      refetchInterval: (query) => {
        const s = (query.state.data as any)?.status;
        return (s === "done" || s === "error") ? false : 1500;
      },
    },
  });
  const status: string = job?.status ?? "processing";
  const progress: number = job?.progress ?? 0;
  const errorMsg: string | null = job?.errorMessage ?? null;
  const filename: string | null = job?.filename ?? null;
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const downloadUrl = filename ? `${base}/api/video/file/${filename}` : null;

  return (
    <motion.div initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.97 }}
      className="relative bg-card/90 border border-white/12 rounded-2xl p-5 space-y-4 overflow-hidden">
      {status === "processing" && <div className="absolute inset-0 bg-gradient-to-r from-violet-600/5 via-blue-600/5 to-violet-600/5 animate-pulse pointer-events-none" />}
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center border",
            status === "done" ? "bg-emerald-500/20 border-emerald-500/30" :
            status === "error" ? "bg-red-500/20 border-red-500/30" : "bg-violet-500/20 border-violet-500/30")}>
            {status === "done" ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> :
             status === "error" ? <AlertCircle className="w-5 h-5 text-red-400" /> :
             <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />}
          </div>
          <div>
            <p className="font-bold text-sm text-white">
              {status === "done" ? "Export Complete!" : status === "error" ? "Export Failed" : "Exporting Video…"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {status === "done" ? "Edited video is ready to download" :
               status === "error" ? (errorMsg?.slice(0, 100) || "An error occurred") : `Processing… ${progress}%`}
            </p>
          </div>
        </div>
        <button onClick={onDismiss} className="text-muted-foreground hover:text-white transition-colors shrink-0"><X className="w-4 h-4" /></button>
      </div>
      {status === "processing" && (
        <div className="relative h-2 bg-white/8 rounded-full overflow-hidden">
          <motion.div className="absolute inset-y-0 left-0 bg-gradient-to-r from-violet-500 to-blue-500 rounded-full"
            initial={{ width: "5%" }} animate={{ width: `${Math.max(5, progress)}%` }} transition={{ duration: 0.6 }} />
        </div>
      )}
      {status === "done" && downloadUrl && (
        <a href={downloadUrl} download
          className="flex items-center justify-center gap-3 w-full py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm hover:brightness-110 transition-all shadow-lg hover:shadow-emerald-500/25">
          <ArrowDownToLine className="w-5 h-5" /> Download Edited Video
        </a>
      )}
      {status === "error" && (
        <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300 leading-relaxed">{errorMsg || "Export failed. Check FFmpeg is installed and source file exists."}</p>
        </div>
      )}
    </motion.div>
  );
}

// ─── Shared UI ─────────────────────────────────────────────────────────────────
function SectionHead({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center shrink-0">{icon}</div>
      <div><h3 className="font-semibold text-white text-sm">{title}</h3><p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p></div>
    </div>
  );
}

function ToggleRow({ icon, title, desc, checked, onChange, checkedCls }: {
  icon: React.ReactNode; title: string; desc: string; checked: boolean; onChange: (v: boolean) => void; checkedCls: string;
}) {
  return (
    <div className={cn("flex items-center justify-between rounded-xl px-4 py-3.5 border transition-all", checked ? checkedCls : "bg-white/5 border-white/8")}>
      <div className="flex items-center gap-3">
        <div className="shrink-0">{icon}</div>
        <div><Label className="text-sm font-medium text-white">{title}</Label><p className="text-xs text-muted-foreground">{desc}</p></div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange, display, icon, sliderCls }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; display: string; icon?: React.ReactNode; sliderCls?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm text-white/80 flex items-center gap-2">{icon}{label}</Label>
        <span className="text-xs font-mono px-2 py-0.5 rounded bg-white/8 text-white min-w-[3.5rem] text-center">{display}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)}
        className={cn("[&>[role=slider]]:bg-primary [&>[role=slider]]:border-primary [&>.relative]:h-1.5", sliderCls)} />
      <div className="flex justify-between text-[10px] text-white/20 font-mono"><span>{min}</span><span>{max}</span></div>
    </div>
  );
}

// ─── Main editor ───────────────────────────────────────────────────────────────
export default function EditorPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const defaultJobId = new URLSearchParams(search).get("jobId") ?? "";

  const { data: history } = useGetDownloadHistory();
  const editVideo = useEditVideo();

  const editableJobs = history?.filter(j => j.status === "done" && j.filename) ?? [];
  const [selectedJob, setSelectedJob] = useState<DownloadJob | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoError, setVideoError] = useState(false);

  const { trimState, push: pushTrim, undo: undoTrim, redo: redoTrim, reset: resetTrim,
    canUndo, canRedo, pastCount, futureCount } = useTrimHistory({ start: 0, end: 0, mode: "keep" });

  const trimStart = trimState.start;
  const trimEnd = trimState.end;
  const trimMode = trimState.mode;

  const [activeTab, setActiveTab] = useState<Tab>("trim");
  const [zoom, setZoom] = useState(1);
  const [exportJobId, setExportJobId] = useState<string | null>(null);

  // Audio
  const [muteAudio, setMuteAudio] = useState(false);
  const [volume, setVolume] = useState(100);
  const [removeBackground, setRemoveBackground] = useState(false);
  // Voice
  const [voiceEffect, setVoiceEffect] = useState<VoiceEffect>("normal");
  const [pitchSemitones, setPitchSemitones] = useState(0);
  // Effects
  const [visualFilter, setVisualFilter] = useState<VisualFilter>("none");
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(1.0);
  const [saturation, setSaturation] = useState(1.0);
  const [blur, setBlur] = useState(0);
  const [sharpen, setSharpen] = useState(0);
  // Transform
  const [speed, setSpeed] = useState(1);
  const [removeWatermark, setRemoveWatermark] = useState(false);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);
  const [rotate, setRotate] = useState(0);
  // Export
  const [outputFormat, setOutputFormat] = useState<"mp4" | "mp3" | "webm" | "m4a" | "flac" | "wav">("mp4");

  useEffect(() => {
    if (defaultJobId && editableJobs.length > 0 && !selectedJob) {
      const j = editableJobs.find(j => j.id === defaultJobId);
      if (j) selectJob(j);
    }
  }, [editableJobs.length]);

  const selectJob = (job: DownloadJob) => {
    setSelectedJob(job);
    setIsPlaying(false); setCurrentTime(0); setDuration(0); setVideoError(false);
    resetTrim({ start: 0, end: 0, mode: "keep" });
    setExportJobId(null); setZoom(1);
  };

  const resetAll = () => {
    setMuteAudio(false); setVolume(100); setRemoveBackground(false);
    setVoiceEffect("normal"); setPitchSemitones(0);
    setVisualFilter("none"); setBrightness(0); setContrast(1); setSaturation(1); setBlur(0); setSharpen(0);
    setSpeed(1); setRemoveWatermark(false); setFlipHorizontal(false); setFlipVertical(false); setRotate(0);
    if (duration > 0) resetTrim({ start: 0, end: duration, mode: "keep" });
    toast.success("All settings reset");
  };

  const onLoadedMetadata = () => { const d = videoRef.current?.duration ?? 0; setDuration(d); resetTrim({ start: 0, end: d, mode: "keep" }); };
  const onTimeUpdate = () => setCurrentTime(videoRef.current?.currentTime ?? 0);
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); } else { v.pause(); setIsPlaying(false); }
  };
  const handleSeek = (t: number) => { if (videoRef.current) videoRef.current.currentTime = t; setCurrentTime(t); };

  const handleTrimChange = useCallback((s: number, e: number) => {
    pushTrim({ start: s, end: e, mode: trimMode });
  }, [pushTrim, trimMode]);

  const handleModeToggle = () => pushTrim({ start: trimStart, end: trimEnd, mode: trimMode === "keep" ? "delete" : "keep" });
  const handleDeleteRegion = () => toast.success(`Region ${fmt(trimStart)}–${fmt(trimEnd)} will be removed on export`);
  const handleResetTrim = () => pushTrim({ start: 0, end: duration, mode: "keep" });

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "[") { handleTrimChange(Math.max(0, Math.min(currentTime, trimEnd - 0.5)), trimEnd); e.preventDefault(); }
      else if (e.key === "]") { handleTrimChange(trimStart, Math.min(duration, Math.max(currentTime, trimStart + 0.5))); e.preventDefault(); }
      else if (e.key === " ") { togglePlay(); e.preventDefault(); }
      else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") { undoTrim(); e.preventDefault(); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || (e.shiftKey && e.key === "z"))) { redoTrim(); e.preventDefault(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentTime, trimStart, trimEnd, duration, trimMode, undoTrim, redoTrim, handleTrimChange]);

  const vf = VISUAL_FILTERS.find(f => f.id === visualFilter);
  const previewCSS = [
    vf?.cssFilter ?? "",
    brightness !== 0 ? `brightness(${1 + brightness})` : "",
    contrast !== 1.0 ? `contrast(${contrast})` : "",
    saturation !== 1.0 ? `saturate(${saturation})` : "",
    blur > 0 ? `blur(${(blur * 0.4).toFixed(1)}px)` : "",
  ].filter(Boolean).join(" ") || "none";

  const hasTrim = trimStart > 0 || (trimEnd > 0 && trimEnd < duration);
  const activeEdits = [
    hasTrim, muteAudio, removeBackground, volume !== 100,
    voiceEffect !== "normal", pitchSemitones !== 0,
    visualFilter !== "none", brightness !== 0, contrast !== 1, saturation !== 1, blur > 0, sharpen > 0,
    speed !== 1, removeWatermark, flipHorizontal, flipVertical, rotate !== 0, outputFormat !== "mp4",
  ].filter(Boolean).length;

  const handleApply = () => {
    if (!selectedJob) return;
    const extra: Record<string, unknown> = {};
    if (removeBackground) extra.removeBackground = true;
    if (pitchSemitones !== 0) extra.pitchSemitones = pitchSemitones;
    if (brightness !== 0) extra.brightness = brightness;
    if (contrast !== 1.0) extra.contrast = contrast;
    if (saturation !== 1.0) extra.saturation = saturation;
    if (blur > 0) extra.blur = blur;
    if (sharpen > 0) extra.sharpen = sharpen;
    if (visualFilter !== "none") extra.visualFilter = visualFilter;
    if (flipHorizontal) extra.flipHorizontal = true;
    if (flipVertical) extra.flipVertical = true;
    if (rotate !== 0) extra.rotate = rotate;
    if (trimMode === "delete" && hasTrim) { extra.trimMode = "delete"; extra.videoDuration = duration; }

    editVideo.mutate({
      data: {
        jobId: selectedJob.id,
        trimStart: hasTrim && trimStart > 0 ? trimStart : undefined,
        trimEnd: hasTrim && trimEnd < duration ? trimEnd : undefined,
        removeWatermark: removeWatermark || undefined,
        outputFormat: outputFormat as EditInputOutputFormat,
        speed: speed !== 1 ? speed : undefined,
        muteAudio: muteAudio || undefined,
        volume: volume !== 100 ? volume : undefined,
        voiceEffect: voiceEffect !== "normal" ? voiceEffect : undefined,
        ...extra as any,
      },
    }, {
      onSuccess: (data: any) => {
        const newId = data?.id ?? data?.jobId;
        if (newId) { setExportJobId(newId); toast.success("Export started! Tracking below…"); }
        else { toast.success("Export started! Check History."); setLocation("/history"); }
      },
      onError: (e) => toast.error(`Export failed: ${e.message}`),
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-20 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600/30 to-purple-600/20 border border-violet-500/30 flex items-center justify-center">
            <Film className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Video Studio</h1>
            <p className="text-xs text-muted-foreground">Professional editing · FFmpeg powered</p>
          </div>
        </div>
        {selectedJob && activeEdits > 0 && (
          <button onClick={resetAll} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5 border border-white/8">
            <RefreshCw className="w-3.5 h-3.5" />Reset all
          </button>
        )}
      </div>

      <JobSelector jobs={editableJobs} selected={selectedJob} onChange={selectJob} />

      <AnimatePresence>
        {exportJobId && <ExportProgressPanel jobId={exportJobId} onDismiss={() => setExportJobId(null)} />}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {selectedJob && (
          <motion.div key={selectedJob.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, type: "spring", bounce: 0.2 }}
            className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-5">

            {/* LEFT: Preview + controls */}
            <div className="space-y-3">
              <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 group shadow-2xl">
                {selectedJob.filename && !videoError ? (
                  <video ref={videoRef} src={getFileUrl(selectedJob.filename, true)}
                    className="w-full h-full object-contain" style={{ filter: previewCSS }}
                    onLoadedMetadata={onLoadedMetadata} onTimeUpdate={onTimeUpdate}
                    onError={() => setVideoError(true)} onEnded={() => setIsPlaying(false)} playsInline />
                ) : selectedJob.thumbnail ? (
                  <img src={selectedJob.thumbnail} alt="" className="w-full h-full object-cover opacity-50" style={{ filter: previewCSS }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><FileVideo className="w-12 h-12 text-white/20" /></div>
                )}
                <button type="button" onClick={togglePlay}
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/25">
                  <div className="w-14 h-14 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/20 shadow-xl">
                    {isPlaying ? <Pause className="w-6 h-6 text-white" /> : <Play className="w-6 h-6 text-white ml-0.5" />}
                  </div>
                </button>
                <div className="absolute top-2.5 left-2.5 flex gap-1.5 flex-wrap">
                  {selectedJob.platform && <Badge className="bg-black/60 backdrop-blur text-[10px] border-0">{selectedJob.platform}</Badge>}
                  {previewCSS !== "none" && <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]"><Sparkles className="w-2.5 h-2.5 mr-1" />PREVIEW</Badge>}
                  {trimMode === "delete" && hasTrim && <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-[10px]"><Trash2 className="w-2.5 h-2.5 mr-1" />DELETE MODE</Badge>}
                </div>
                {duration > 0 && <div className="absolute bottom-2.5 right-2.5 bg-black/70 backdrop-blur text-white text-xs font-mono px-2 py-1 rounded-lg">{fmt(currentTime)} / {fmt(duration)}</div>}
                {videoError && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground"><AlertCircle className="w-8 h-8 text-amber-500" /><p className="text-xs text-center px-4">Preview unavailable — file will still be edited</p></div>}
              </div>

              <div className="bg-white/3 border border-white/8 rounded-xl px-4 py-3 space-y-1.5">
                <p className="font-semibold text-sm text-white line-clamp-1">{selectedJob.title || selectedJob.filename}</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedJob.outputFormat && <span className="bg-white/8 text-white/60 px-2 py-0.5 rounded text-[10px] uppercase font-mono">{selectedJob.outputFormat}</span>}
                  {selectedJob.quality && <span className="bg-white/8 text-white/60 px-2 py-0.5 rounded text-[10px] font-mono">{selectedJob.quality}</span>}
                  {duration > 0 && <span className="bg-white/8 text-white/60 px-2 py-0.5 rounded text-[10px] font-mono">{fmt(duration)}</span>}
                </div>
              </div>

              {activeEdits > 0 && (
                <div className="bg-violet-500/8 border border-violet-500/20 rounded-xl px-4 py-3">
                  <p className="text-xs text-violet-300 font-semibold mb-2 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />{activeEdits} active edit{activeEdits !== 1 ? "s" : ""}</p>
                  <div className="flex flex-wrap gap-1">
                    {hasTrim && <Badge variant="outline" className={cn("text-[10px]", trimMode === "delete" ? "border-red-500/40 text-red-300" : "border-violet-500/40 text-violet-300")}>{trimMode === "delete" ? "🗑 Delete" : "✂ Trim"}</Badge>}
                    {muteAudio && <Badge variant="outline" className="border-red-500/40 text-red-300 text-[10px]">🔇 Muted</Badge>}
                    {removeBackground && <Badge variant="outline" className="border-cyan-500/40 text-cyan-300 text-[10px]">🎤 Voice Only</Badge>}
                    {volume !== 100 && <Badge variant="outline" className="border-blue-500/40 text-blue-300 text-[10px]">🔊 {volume}%</Badge>}
                    {voiceEffect !== "normal" && <Badge variant="outline" className="border-pink-500/40 text-pink-300 text-[10px]">🎙 {voiceEffect}</Badge>}
                    {pitchSemitones !== 0 && <Badge variant="outline" className="border-pink-500/40 text-pink-300 text-[10px]">🎵 {pitchSemitones > 0 ? "+" : ""}{pitchSemitones}st</Badge>}
                    {visualFilter !== "none" && <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px]">🎨 {visualFilter}</Badge>}
                    {(brightness !== 0 || contrast !== 1 || saturation !== 1) && <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px]">🌈 Color</Badge>}
                    {blur > 0 && <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px]">💧 Blur</Badge>}
                    {sharpen > 0 && <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[10px]">✨ Sharp</Badge>}
                    {speed !== 1 && <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px]">⚡ {speed}×</Badge>}
                    {removeWatermark && <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px]">🪄 No WM</Badge>}
                    {(flipHorizontal || flipVertical) && <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px]">↔ Flipped</Badge>}
                    {rotate !== 0 && <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px]">↻ {rotate}°</Badge>}
                    {outputFormat !== "mp4" && <Badge variant="outline" className="border-sky-500/40 text-sky-300 text-[10px]">→ {outputFormat.toUpperCase()}</Badge>}
                  </div>
                </div>
              )}

              <button type="button" onClick={handleApply} disabled={!selectedJob || editVideo.isPending}
                className={cn("w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-base transition-all",
                  "bg-gradient-to-r from-violet-600 via-purple-600 to-blue-600 text-white shadow-lg",
                  "hover:shadow-[0_0_40px_rgba(124,58,237,0.4)] hover:brightness-110",
                  "disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]")}>
                {editVideo.isPending ? <><Loader2 className="w-5 h-5 animate-spin" />Processing…</> : <><Zap className="w-5 h-5" />Apply Edits &amp; Export</>}
              </button>
            </div>

            {/* RIGHT: Tabs */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-1 bg-white/5 border border-white/8 rounded-xl p-1 overflow-x-auto">
                {TABS.map(t => (
                  <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                    className={cn("flex-1 min-w-fit flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                      activeTab === t.id ? "bg-white/12 text-white shadow border border-white/12" : "text-muted-foreground hover:text-white hover:bg-white/5")}>
                    <span className={activeTab === t.id ? t.activeColor : ""}>{t.icon}</span>
                    <span className="hidden sm:inline">{t.label}</span>
                  </button>
                ))}
              </div>

              <div className="bg-card/60 border border-white/8 rounded-2xl p-5 flex-1 backdrop-blur min-h-[440px]">
                <AnimatePresence mode="wait">

                  {activeTab === "trim" && (
                    <motion.div key="trim" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="space-y-5">
                      <div className="flex items-start justify-between">
                        <SectionHead icon={<Scissors className="w-4 h-4 text-violet-400" />} title="Trim & Cut" desc="Keep or delete a region. Use [ ] keys or drag handles for precision." />
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button onClick={() => setZoom(z => Math.max(1, z / 1.5))} disabled={zoom <= 1}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-muted-foreground hover:text-white hover:bg-white/10 disabled:opacity-30 transition-all">
                            <ZoomOut className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[10px] font-mono text-white/40 min-w-[2.5rem] text-center">{zoom.toFixed(1)}×</span>
                          <button onClick={() => setZoom(z => Math.min(20, z * 1.5))}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 border border-white/10 text-muted-foreground hover:text-white hover:bg-white/10 transition-all">
                            <ZoomIn className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {duration > 0 ? (
                        <TrimTimeline
                          duration={duration} trimStart={trimStart} trimEnd={trimEnd} trimMode={trimMode}
                          currentTime={currentTime} zoom={zoom}
                          onTrimChange={handleTrimChange} onSeek={handleSeek}
                          onDelete={handleDeleteRegion} onReset={handleResetTrim} onModeToggle={handleModeToggle}
                          canUndo={canUndo} canRedo={canRedo} onUndo={undoTrim} onRedo={redoTrim}
                          pastCount={pastCount} futureCount={futureCount}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
                          {videoError ? (
                            <>
                              <AlertCircle className="w-8 h-8 text-amber-500" />
                              <p className="text-xs text-amber-400">Preview failed — enter times manually</p>
                              <div className="grid grid-cols-2 gap-3 mt-2 w-full max-w-xs">
                                {(["Start", "End"] as const).map(label => (
                                  <div key={label} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5 border border-white/8">
                                    <span className="text-xs text-muted-foreground w-8">{label}</span>
                                    <input type="number" min={0} step={0.1} defaultValue={0}
                                      onChange={e => { const v = parseFloat(e.target.value) || 0; label === "Start" ? handleTrimChange(v, trimEnd) : handleTrimChange(trimStart, v); }}
                                      className="flex-1 bg-transparent text-sm font-mono text-white text-right outline-none min-w-0" />
                                    <span className="text-xs text-muted-foreground">s</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          ) : <><Loader2 className="w-6 h-6 animate-spin text-primary" /><p className="text-sm">Loading video…</p></>}
                        </div>
                      )}
                    </motion.div>
                  )}

                  {activeTab === "audio" && (
                    <motion.div key="audio" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="space-y-4">
                      <SectionHead icon={<Volume2 className="w-4 h-4 text-blue-400" />} title="Audio Controls" desc="Adjust volume, isolate vocals, or mute audio." />
                      <ToggleRow icon={<VolumeX className={cn("w-5 h-5", muteAudio ? "text-red-400" : "text-muted-foreground")} />} title="Mute Audio" desc="Remove all sound" checked={muteAudio} onChange={setMuteAudio} checkedCls="bg-red-500/10 border-red-500/30" />
                      {!muteAudio && <>
                        <ToggleRow icon={<MicOff className={cn("w-5 h-5", removeBackground ? "text-cyan-400" : "text-muted-foreground")} />} title="Voice Isolator" desc="Suppress background music" checked={removeBackground} onChange={setRemoveBackground} checkedCls="bg-cyan-500/10 border-cyan-500/30" />
                        <SliderRow label="Volume" value={volume} min={0} max={300} step={5} onChange={setVolume} display={`${volume}%`} icon={<Gauge className="w-4 h-4 text-blue-400" />} sliderCls="[&>[role=slider]]:bg-blue-500 [&>[role=slider]]:border-blue-400" />
                      </>}
                    </motion.div>
                  )}

                  {activeTab === "voice" && (
                    <motion.div key="voice" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="space-y-5">
                      <SectionHead icon={<Mic className="w-4 h-4 text-pink-400" />} title="Voice Changer" desc="Transform audio with voice effects or shift the pitch." />
                      <div className="grid grid-cols-3 gap-2">
                        {VOICE_PRESETS.map(p => (
                          <button key={p.id} type="button" onClick={() => setVoiceEffect(p.id)}
                            className={cn("flex flex-col items-center gap-1 p-3 rounded-xl border transition-all text-center group",
                              voiceEffect === p.id ? `${p.activeCls} scale-[1.03]` : "bg-white/5 border-white/8 hover:bg-white/10 hover:border-white/20")}>
                            <span className="text-xl group-hover:scale-110 transition-transform">{p.emoji}</span>
                            <span className="text-xs font-bold text-white">{p.label}</span>
                            <span className="text-[9px] text-muted-foreground">{p.desc}</span>
                            {voiceEffect === p.id && <CheckCircle2 className="w-3 h-3 text-primary" />}
                          </button>
                        ))}
                      </div>
                      <div className="bg-white/5 rounded-xl p-4 border border-white/8 space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm text-white flex items-center gap-2"><AudioWaveform className="w-4 h-4 text-pink-400" />Pitch Shift</Label>
                          <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-mono px-2 py-0.5 rounded", pitchSemitones === 0 ? "text-muted-foreground bg-white/5" : "text-pink-300 bg-pink-500/15")}>{pitchSemitones > 0 ? "+" : ""}{pitchSemitones} st</span>
                            {pitchSemitones !== 0 && <button onClick={() => setPitchSemitones(0)} className="text-[10px] text-muted-foreground hover:text-white underline">reset</button>}
                          </div>
                        </div>
                        <Slider value={[pitchSemitones]} min={-12} max={12} step={1} onValueChange={([v]) => setPitchSemitones(v)} className="[&>[role=slider]]:bg-pink-500 [&>[role=slider]]:border-pink-400 [&>.relative]:h-1.5" />
                        <div className="flex justify-between text-[10px] text-white/25 font-mono"><span>-12 (Octave ↓)</span><span>0</span><span>+12 (Octave ↑)</span></div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "effects" && (
                    <motion.div key="effects" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="space-y-5">
                      <SectionHead icon={<Film className="w-4 h-4 text-amber-400" />} title="Visual Effects" desc="Cinematic filters and color correction. Live preview in player." />
                      <div className="grid grid-cols-4 gap-2">
                        {VISUAL_FILTERS.map(f => (
                          <button key={f.id} type="button" onClick={() => setVisualFilter(f.id)}
                            className={cn("flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all group",
                              visualFilter === f.id ? "bg-amber-500/15 border-amber-500/50 scale-[1.05]" : "bg-white/5 border-white/8 hover:bg-white/10 hover:border-white/20")}>
                            <span className="text-xl group-hover:scale-110 transition-transform">{f.emoji}</span>
                            <span className={cn("text-[10px] font-semibold", visualFilter === f.id ? "text-amber-300" : "text-muted-foreground")}>{f.label}</span>
                          </button>
                        ))}
                      </div>
                      <div className="space-y-4">
                        <SliderRow label="Brightness" value={brightness} min={-1} max={1} step={0.05} onChange={setBrightness} display={brightness > 0 ? `+${(brightness*100).toFixed(0)}%` : `${(brightness*100).toFixed(0)}%`} icon={<SunMedium className="w-4 h-4 text-amber-400" />} sliderCls="[&>[role=slider]]:bg-amber-500 [&>[role=slider]]:border-amber-400" />
                        <SliderRow label="Contrast" value={contrast} min={0.5} max={2.5} step={0.05} onChange={setContrast} display={`${contrast.toFixed(2)}×`} icon={<Contrast className="w-4 h-4 text-amber-400" />} sliderCls="[&>[role=slider]]:bg-amber-500 [&>[role=slider]]:border-amber-400" />
                        <SliderRow label="Saturation" value={saturation} min={0} max={3} step={0.05} onChange={setSaturation} display={`${saturation.toFixed(2)}×`} icon={<Droplets className="w-4 h-4 text-amber-400" />} sliderCls="[&>[role=slider]]:bg-amber-500 [&>[role=slider]]:border-amber-400" />
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between"><Label className="text-xs text-white/70 flex items-center gap-1.5"><Waves className="w-3.5 h-3.5 text-amber-400" />Blur</Label><span className="text-[10px] font-mono text-muted-foreground">{blur.toFixed(1)}</span></div>
                            <Slider value={[blur]} min={0} max={10} step={0.5} onValueChange={([v]) => setBlur(v)} className="[&>[role=slider]]:bg-amber-500 [&>.relative]:h-1" />
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between"><Label className="text-xs text-white/70 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-amber-400" />Sharpen</Label><span className="text-[10px] font-mono text-muted-foreground">{sharpen.toFixed(1)}</span></div>
                            <Slider value={[sharpen]} min={0} max={5} step={0.25} onValueChange={([v]) => setSharpen(v)} className="[&>[role=slider]]:bg-amber-500 [&>.relative]:h-1" />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "transform" && (
                    <motion.div key="transform" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="space-y-5">
                      <SectionHead icon={<Settings2 className="w-4 h-4 text-emerald-400" />} title="Transform" desc="Control speed, flip, rotate, and remove watermarks." />
                      <div className="space-y-3">
                        <Label className="text-sm text-white flex items-center gap-2"><Gauge className="w-4 h-4 text-emerald-400" />Playback Speed</Label>
                        <div className="grid grid-cols-4 gap-2">
                          {SPEED_PRESETS.map(s => (
                            <button key={s} type="button" onClick={() => setSpeed(s)}
                              className={cn("py-2 rounded-xl border text-sm font-mono font-bold transition-all",
                                speed === s ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-300 scale-[1.05]" : "bg-white/5 border-white/8 text-muted-foreground hover:text-white hover:bg-white/8")}>
                              {s}×
                            </button>
                          ))}
                        </div>
                        <SliderRow label="Custom speed" value={speed} min={0.1} max={4} step={0.05} onChange={setSpeed} display={`${speed.toFixed(2)}×`} icon={<Zap className="w-4 h-4 text-emerald-400" />} sliderCls="[&>[role=slider]]:bg-emerald-500 [&>[role=slider]]:border-emerald-400" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm text-white">Flip &amp; Rotate</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => setFlipHorizontal(!flipHorizontal)} className={cn("flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all", flipHorizontal ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-white/5 border-white/8 text-muted-foreground hover:text-white")}><FlipHorizontal2 className="w-4 h-4" />Flip Horizontal{flipHorizontal && <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-emerald-400" />}</button>
                          <button onClick={() => setFlipVertical(!flipVertical)} className={cn("flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all", flipVertical ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-white/5 border-white/8 text-muted-foreground hover:text-white")}><FlipVertical2 className="w-4 h-4" />Flip Vertical{flipVertical && <CheckCircle2 className="w-3.5 h-3.5 ml-auto text-emerald-400" />}</button>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          {[0, 90, 180, 270].map(r => (
                            <button key={r} onClick={() => setRotate(r)} className={cn("flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-bold transition-all", rotate === r ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300" : "bg-white/5 border-white/8 text-muted-foreground hover:text-white")}><RotateCcw className="w-3.5 h-3.5" />{r}°</button>
                          ))}
                        </div>
                      </div>
                      <ToggleRow icon={<Wand2 className={cn("w-5 h-5", removeWatermark ? "text-emerald-400" : "text-muted-foreground")} />} title="Remove Watermark" desc="Crop bottom 8% overlay (TikTok, Instagram style)" checked={removeWatermark} onChange={setRemoveWatermark} checkedCls="bg-emerald-500/10 border-emerald-500/30" />
                    </motion.div>
                  )}

                  {activeTab === "export" && (
                    <motion.div key="export" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="space-y-5">
                      <SectionHead icon={<Download className="w-4 h-4 text-sky-400" />} title="Export Format" desc="Choose the output container and codec for your edited file." />
                      <div className="grid grid-cols-2 gap-3">
                        {FORMAT_OPTIONS.map(f => (
                          <button key={f.value} type="button" onClick={() => setOutputFormat(f.value as typeof outputFormat)}
                            className={cn("flex items-start gap-3 p-4 rounded-xl border transition-all text-left group",
                              outputFormat === f.value ? `${f.activeCls} scale-[1.02]` : "bg-white/5 border-white/8 hover:bg-white/10 hover:border-white/18")}>
                            <span className="text-2xl shrink-0 group-hover:scale-110 transition-transform">{f.icon}</span>
                            <div className="flex-1 min-w-0">
                              <p className={cn("font-bold text-sm", outputFormat === f.value ? "text-white" : "text-white/70")}>{f.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{f.desc}</p>
                            </div>
                            {outputFormat === f.value && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                          </button>
                        ))}
                      </div>
                      <div className="bg-sky-500/8 border border-sky-500/20 rounded-xl px-4 py-3 text-xs text-sky-300 flex items-start gap-2">
                        <ImageIcon className="w-4 h-4 shrink-0 mt-0.5 text-sky-400" />
                        <span>Video re-encoded at H.264 CRF 22 + AAC 192kbps. FLAC/WAV produce lossless audio-only files.</span>
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!selectedJob && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-violet-600/20 to-purple-600/10 border border-violet-500/20 flex items-center justify-center">
            <Film className="w-12 h-12 text-violet-400/50" />
          </div>
          <h3 className="text-xl font-semibold text-white">Video Studio</h3>
          <p className="text-muted-foreground text-sm max-w-sm">Select a completed download above — trim, delete region, undo/redo, voice changer, color grading, effects and more.</p>
          {editableJobs.length === 0 && (
            <Button asChild className="bg-gradient-to-r from-violet-600 to-blue-600 text-white border-0 mt-2">
              <a href="/">Go download something first →</a>
            </Button>
          )}
        </motion.div>
      )}
    </div>
  );
}
