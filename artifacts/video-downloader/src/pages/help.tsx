import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LifeBuoy, MessageSquare, Sparkles, Upload, X, Loader2,
  CheckCircle2, ChevronDown, AlertCircle, ShieldCheck,
  Users, Download, Activity, FileText, Ban, ChevronRight,
  RefreshCw, BarChart2, AlertTriangle, Shield,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { toast } from "sonner";

const API = "/api";

const PLATFORMS = ["YouTube", "TikTok", "Instagram", "Facebook", "Twitter/X", "Vimeo", "Snapchat", "Other"];
const TYPES = [
  { id: "help", label: "🐛 Report Bug / Issue", desc: "Something isn't working right" },
  { id: "feedback", label: "💬 Feedback", desc: "Share your thoughts or experience" },
  { id: "feature", label: "✨ Feature Request", desc: "Suggest a new feature or improvement" },
];

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────

type AdminTab = "stats" | "users" | "tickets" | "errors";

function AdminPanel({ token }: { token: string }) {
  const [activeTab, setActiveTab] = useState<AdminTab>("stats");
  const [stats, setStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [errors, setErrors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [banReason, setBanReason] = useState<Record<number, string>>({});

  const authHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const fetchStats = async () => {
    const r = await fetch(`${API}/admin/stats`, { headers: authHeaders });
    setStats(await r.json());
  };
  const fetchUsers = async () => {
    const r = await fetch(`${API}/admin/users`, { headers: authHeaders });
    setUsers(await r.json());
  };
  const fetchTickets = async () => {
    const r = await fetch(`${API}/admin/feedback`, { headers: authHeaders });
    setTickets(await r.json());
  };
  const fetchErrors = async () => {
    const r = await fetch(`${API}/admin/errors?limit=50`, { headers: authHeaders });
    setErrors(await r.json());
  };

  const loadTab = async (tab: AdminTab) => {
    setLoading(true);
    try {
      if (tab === "stats") await fetchStats();
      else if (tab === "users") await fetchUsers();
      else if (tab === "tickets") await fetchTickets();
      else await fetchErrors();
    } catch { toast.error("Failed to load data"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadTab(activeTab); }, [activeTab]);

  const handleBan = async (id: number, banned: boolean) => {
    const reason = banned ? (banReason[id] || undefined) : undefined;
    await fetch(`${API}/admin/users/${id}/ban`, {
      method: "PATCH", headers: authHeaders,
      body: JSON.stringify({ banned, reason }),
    });
    toast.success(banned ? "User banned" : "User unbanned");
    fetchUsers();
  };

  const handleRole = async (id: number, role: "user" | "admin") => {
    await fetch(`${API}/admin/users/${id}/role`, {
      method: "PATCH", headers: authHeaders,
      body: JSON.stringify({ role }),
    });
    toast.success(`Role changed to ${role}`);
    fetchUsers();
  };

  const handleTicketStatus = async (id: number, status: string) => {
    await fetch(`${API}/admin/feedback/${id}`, {
      method: "PATCH", headers: authHeaders,
      body: JSON.stringify({ status }),
    });
    toast.success("Status updated");
    fetchTickets();
  };

  const TABS: { id: AdminTab; label: string; icon: any }[] = [
    { id: "stats", label: "Stats", icon: BarChart2 },
    { id: "users", label: "Users", icon: Users },
    { id: "tickets", label: "Tickets", icon: FileText },
    { id: "errors", label: "Errors", icon: AlertTriangle },
  ];

  const statusColors: Record<string, string> = {
    open: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    in_progress: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    resolved: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    closed: "text-white/30 bg-white/5 border-white/10",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] backdrop-blur-xl overflow-hidden mb-8"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06] bg-violet-500/[0.06]">
        <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
          <Shield className="w-4.5 h-4.5 text-violet-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white">Admin Panel</h2>
          <p className="text-[11px] text-violet-300/60">Manage users, tickets, and system health</p>
        </div>
        <button onClick={() => loadTab(activeTab)} className="ml-auto text-white/30 hover:text-violet-400 transition-colors p-1.5 rounded-lg hover:bg-white/[0.05]">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-4 py-2.5 border-b border-white/[0.05] bg-black/20">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.id
                ? "bg-violet-600 text-white shadow-lg"
                : "text-white/40 hover:text-white/70 hover:bg-white/[0.05]"
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
          </div>
        ) : (
          <>
            {/* ─── STATS ─── */}
            {activeTab === "stats" && stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total Users", value: stats.users, icon: Users, color: "violet" },
                  { label: "Downloads", value: stats.downloads, icon: Download, color: "blue" },
                  { label: "Active Downloads", value: stats.activeDownloads, icon: Activity, color: "emerald" },
                  { label: "Open Tickets", value: stats.openTickets, icon: FileText, color: "yellow" },
                  { label: "Failed Downloads", value: stats.failedDownloads, icon: AlertCircle, color: "red" },
                  { label: "Errors Today", value: stats.errorsToday, icon: AlertTriangle, color: "orange" },
                  { label: "Total Errors", value: stats.errorsTotal, icon: AlertTriangle, color: "red" },
                ].map((s, i) => (
                  <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                    <p className="text-[11px] text-white/35 mb-1">{s.label}</p>
                    <p className="text-2xl font-black text-white">{s.value ?? 0}</p>
                  </div>
                ))}
              </div>
            )}

            {/* ─── USERS ─── */}
            {activeTab === "users" && (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {users.length === 0 && <p className="text-sm text-white/30 text-center py-6">No users found</p>}
                {users.map(u => (
                  <div key={u.id} className={`flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-xl border ${u.isBanned ? "border-red-500/20 bg-red-500/[0.05]" : "border-white/[0.06] bg-white/[0.02]"}`}>
                    <div className="flex items-center gap-2.5 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                        {u.name[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-white truncate">{u.name}</p>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase ${u.role === "admin" ? "bg-violet-500/20 text-violet-300" : "bg-blue-500/20 text-blue-300"}`}>{u.role}</span>
                          {u.isBanned && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase bg-red-500/20 text-red-300">Banned</span>}
                        </div>
                        <p className="text-[11px] text-white/30 truncate">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Role toggle */}
                      <button
                        onClick={() => handleRole(u.id, u.role === "admin" ? "user" : "admin")}
                        className="text-[11px] px-2.5 py-1 rounded-lg border border-white/10 text-white/50 hover:border-violet-500/40 hover:text-violet-400 transition-all"
                      >
                        {u.role === "admin" ? "→ User" : "→ Admin"}
                      </button>
                      {/* Ban toggle */}
                      <button
                        onClick={() => handleBan(u.id, !u.isBanned)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all flex items-center gap-1 ${
                          u.isBanned
                            ? "border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                            : "border-red-500/30 text-red-400 hover:bg-red-500/10"
                        }`}
                      >
                        <Ban className="w-3 h-3" />
                        {u.isBanned ? "Unban" : "Ban"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ─── TICKETS ─── */}
            {activeTab === "tickets" && (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {tickets.length === 0 && <p className="text-sm text-white/30 text-center py-6">No tickets yet</p>}
                {tickets.map(t => (
                  <div key={t.id} className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50">{t.type}</span>
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full border ${statusColors[t.status] ?? statusColors.open}`}>{t.status?.replace("_", " ")}</span>
                        </div>
                        <p className="text-sm font-semibold text-white truncate">{t.subject}</p>
                        <p className="text-xs text-white/35 mt-0.5 line-clamp-1">{t.message}</p>
                      </div>
                      <p className="text-[10px] text-white/20 shrink-0">{new Date(t.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {["open", "in_progress", "resolved", "closed"].map(s => (
                        <button
                          key={s}
                          onClick={() => handleTicketStatus(t.id, s)}
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border transition-all ${
                            t.status === s
                              ? statusColors[s]
                              : "border-white/[0.06] text-white/25 hover:text-white/50 hover:border-white/20"
                          }`}
                        >
                          {s.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ─── ERRORS ─── */}
            {activeTab === "errors" && (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {errors.length === 0 && <p className="text-sm text-white/30 text-center py-6">No errors logged</p>}
                {errors.map(e => (
                  <div key={e.id} className="p-3 rounded-xl border border-red-500/[0.1] bg-red-500/[0.03]">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">{e.source}</span>
                      {e.errorType && <span className="text-[10px] text-white/25">{e.errorType}</span>}
                      <span className="text-[10px] text-white/20 ml-auto">{new Date(e.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-red-300/80 font-mono leading-relaxed line-clamp-2">{e.message}</p>
                    {e.url && <p className="text-[10px] text-white/20 mt-1 truncate">{e.url}</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

// ─── MAIN HELP PAGE ───────────────────────────────────────────────────────────

export default function HelpPage() {
  const { token, isAdmin } = useAuth();
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
        method: "POST", headers,
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
          <p className="text-muted-foreground mb-6">Your {type === "help" ? "bug report" : type === "feature" ? "feature request" : "feedback"} has been received. We'll review it shortly.</p>
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

        {/* ── ADMIN PANEL (admin only) ─────────────────────────────── */}
        {isAdmin && token && <AdminPanel token={token} />}

        {/* ── HELP FORM ────────────────────────────────────────────── */}
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

          {/* Platform (bugs only) */}
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

          {/* Error detail */}
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
              <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
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
