import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { LifeBuoy, MessageSquare, Sparkles, Upload, X, Loader2, CheckCircle2, ChevronDown, AlertCircle } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { toast } from "sonner";

const API = "/api";

const PLATFORMS = ["YouTube", "TikTok", "Instagram", "Facebook", "Twitter/X", "Vimeo", "Snapchat", "Other"];
const TYPES = [
  { id: "help", label: "🐛 Report Bug / Issue", desc: "Something isn't working right" },
  { id: "feedback", label: "💬 Feedback", desc: "Share your thoughts or experience" },
  { id: "feature", label: "✨ Feature Request", desc: "Suggest a new feature or improvement" },
];

export default function HelpPage() {
  const { token } = useAuth();
  const [type, setType] = useState("help");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [platform, setPlatform] = useState("");
  const [errorDetail, setErrorDetail] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Only image files allowed"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Image too large (max 10 MB)"); return; }
    setUploading(true);
    try {
      // Preview
      const reader = new FileReader();
      reader.onload = e => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(file);

      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`${API}/feedback/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setImageUrl(data.imageUrl);
      toast.success("Screenshot uploaded!");
    } catch (err: any) {
      toast.error(err.message);
      setImagePreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleImageUpload(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`${API}/feedback`, {
        method: "POST",
        headers,
        body: JSON.stringify({ type, subject, message, platform: platform || undefined, errorDetail: errorDetail || undefined, imageUrl: imageUrl ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      setDone(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center max-w-sm px-4">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Thank you! 🎉</h2>
          <p className="text-muted-foreground mb-6">Your {type === "help" ? "bug report" : type === "feature" ? "feature request" : "feedback"} has been received. We'll review it and get back to you.</p>
          <button onClick={() => { setDone(false); setSubject(""); setMessage(""); setImageUrl(null); setImagePreview(null); setErrorDetail(""); setPlatform(""); }}
            className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2 rounded-xl font-semibold transition-colors">
            Submit Another
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center">
            <LifeBuoy className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Help & Feedback</h1>
            <p className="text-sm text-muted-foreground">Report issues, share feedback, or request features</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Type selector */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {TYPES.map(t => (
              <button key={t.id} type="button" onClick={() => setType(t.id)}
                className={`text-left p-4 rounded-xl border transition-all ${type === t.id ? "bg-violet-600/20 border-violet-500 shadow-lg shadow-violet-500/10" : "bg-card/50 border-white/10 hover:border-white/20"}`}>
                <p className="text-sm font-semibold text-white">{t.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
              </button>
            ))}
          </div>

          {/* Platform (only for bugs) */}
          {type === "help" && (
            <div>
              <label className="text-sm font-medium text-white mb-1.5 block">Platform (optional)</label>
              <div className="relative">
                <select value={platform} onChange={e => setPlatform(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white appearance-none focus:outline-none focus:border-violet-500 transition-all">
                  <option value="">Select platform where issue occurred…</option>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="text-sm font-medium text-white mb-1.5 block">Subject *</label>
            <input required value={subject} onChange={e => setSubject(e.target.value)}
              placeholder={type === "help" ? "e.g. TikTok video download fails with 403 error" : type === "feature" ? "e.g. Add batch download support" : "e.g. Great tool but the editor could be faster"}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-violet-500 transition-all" />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-white mb-1.5 block">Description *</label>
            <textarea required rows={5} value={message} onChange={e => setMessage(e.target.value)}
              placeholder={type === "help" ? "Describe the issue in detail:\n• Which platform/URL were you using?\n• What error message appeared?\n• Steps to reproduce the problem?\n• What did you expect to happen?" : type === "feature" ? "Describe the feature you'd like to see and why it would be useful…" : "Share your experience, suggestions, or thoughts…"}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-violet-500 transition-all resize-none" />
          </div>

          {/* Error detail (for bug reports) */}
          {type === "help" && (
            <div>
              <label className="text-sm font-medium text-white mb-1.5 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-orange-400" /> Error message / console output (optional)
              </label>
              <textarea rows={3} value={errorDetail} onChange={e => setErrorDetail(e.target.value)}
                placeholder="Paste any error message or console output here…"
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-orange-300 placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 transition-all resize-none" />
            </div>
          )}

          {/* Image upload */}
          <div>
            <label className="text-sm font-medium text-white mb-1.5 block">Screenshot / Image (optional)</label>
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-white/10 aspect-video bg-black/30">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-contain" />
                <button type="button" onClick={() => { setImagePreview(null); setImageUrl(null); }}
                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-lg p-1.5 transition-colors">
                  <X className="w-4 h-4" />
                </button>
                {uploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-white animate-spin" />
                  </div>
                )}
              </div>
            ) : (
              <div
                onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-white/10 hover:border-violet-500/50 rounded-xl p-8 text-center cursor-pointer transition-all group">
                <Upload className="w-8 h-8 text-muted-foreground group-hover:text-violet-400 mx-auto mb-3 transition-colors" />
                <p className="text-sm text-muted-foreground group-hover:text-white transition-colors">
                  <span className="font-semibold text-violet-400">Click to upload</span> or drag & drop
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">PNG, JPG, WebP up to 10MB</p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
              </div>
            )}
          </div>

          <button type="submit" disabled={loading || uploading}
            className="w-full bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : type === "help" ? <LifeBuoy className="w-4 h-4" /> : type === "feature" ? <Sparkles className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
            {loading ? "Submitting…" : "Submit " + (type === "help" ? "Bug Report" : type === "feature" ? "Feature Request" : "Feedback")}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
