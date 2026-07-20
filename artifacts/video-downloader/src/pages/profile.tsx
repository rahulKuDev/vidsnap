import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Mail, Lock, ShieldCheck, Camera, Save, Loader2,
  Eye, EyeOff, Calendar, CheckCircle2, AlertCircle, LogOut,
  Download, Star, X, ArrowLeft, Edit2, Key,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useLocation } from "wouter";
import { toast } from "sonner";

const API = "/api";

const AVATAR_GRADIENTS = [
  ["#7c3aed", "#2563eb"],
  ["#db2777", "#7c3aed"],
  ["#059669", "#0891b2"],
  ["#d97706", "#dc2626"],
  ["#7c3aed", "#ec4899"],
];

function getGradient(name: string) {
  return AVATAR_GRADIENTS[name.charCodeAt(0) % AVATAR_GRADIENTS.length];
}

export default function ProfilePage() {
  const { user, token, login, logout, isAdmin } = useAuth();
  const [, navigate] = useLocation();

  const [editName, setEditName] = useState(user?.name ?? "");
  const [nameEdited, setNameEdited] = useState(false);
  const [savingName, setSavingName] = useState(false);

  const [oldPass, setOldPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingPass, setSavingPass] = useState(false);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [activeSection, setActiveSection] = useState<"info" | "password">("info");
  const fileRef = useRef<HTMLInputElement>(null);
  const [downloadCount, setDownloadCount] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/video/history?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setDownloadCount(d.total ?? 0))
      .catch(() => setDownloadCount(0));
  }, [token]);

  if (!user) { navigate("/auth"); return null; }

  const [g1, g2] = getGradient(user.name);
  const joinDate = new Date(user.createdAt).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });

  const handleClose = () => navigate("/");

  const handleSaveName = async () => {
    if (!editName.trim() || editName === user.name) { setNameEdited(false); return; }
    if (editName.trim().length < 2) { toast.error("Name must be at least 2 characters"); return; }
    setSavingName(true);
    try {
      const res = await fetch(`${API}/auth/update-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update name");
      login(token!, { ...user, name: editName.trim() });
      toast.success("Name updated!");
      setNameEdited(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPass.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    setSavingPass(true);
    try {
      const res = await fetch(`${API}/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change password");
      toast.success("Password changed!");
      setOldPass(""); setNewPass("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingPass(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Only image files allowed"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image too large (max 5 MB)"); return; }
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`${API}/feedback/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      const patchRes = await fetch(`${API}/auth/update-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatarUrl: data.imageUrl }),
      });
      const patchData = await patchRes.json();
      if (!patchRes.ok) throw new Error(patchData.error ?? "Failed to update avatar");
      login(token!, { ...user, avatarUrl: data.imageUrl });
      toast.success("Avatar updated!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogout = () => { logout(); toast.success("Signed out"); navigate("/auth"); };

  return (
    <>
      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* ── Profile Panel ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, x: "100%" }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: "100%" }}
        transition={{ type: "spring", stiffness: 280, damping: 30 }}
        className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md flex flex-col shadow-2xl"
        style={{ background: "linear-gradient(180deg, #0d0d1a 0%, #080810 100%)", borderLeft: "1px solid rgba(255,255,255,0.07)" }}
      >
        {/* ── Top bar ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <button
            onClick={handleClose}
            className="flex items-center gap-2 text-white/40 hover:text-white text-sm font-medium transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back
          </button>

          <p className="text-sm font-bold text-white">My Profile</p>

          {/* Close X */}
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] flex items-center justify-center text-white/50 hover:text-white transition-all group"
          >
            <X className="w-4 h-4 group-hover:rotate-90 transition-transform duration-200" />
          </button>
        </div>

        {/* ── Scrollable body ───────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Avatar + Name hero ──────────────────────────────────────── */}
          <div
            className="relative px-6 pt-8 pb-6"
            style={{ background: `linear-gradient(180deg, ${g1}18 0%, transparent 100%)` }}
          >
            {/* Avatar */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div
                  className="w-24 h-24 rounded-3xl flex items-center justify-center text-3xl font-black text-white shadow-2xl overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${g1}, ${g2})`,
                    boxShadow: `0 0 40px ${g1}55`,
                  }}
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                  ) : (
                    <span>{user.name[0].toUpperCase()}</span>
                  )}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-3xl">
                      <Loader2 className="w-7 h-7 text-white animate-spin" />
                    </div>
                  )}
                </div>
                {/* Camera button */}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full border-2 border-[#080810] flex items-center justify-center transition-transform hover:scale-110"
                  style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}
                  title="Change avatar"
                >
                  <Camera className="w-3.5 h-3.5 text-white" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); }} />
              </div>

              {/* Name */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 flex-wrap mb-1.5">
                  <h1 className="text-xl font-black text-white">{user.name}</h1>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border
                    ${isAdmin ? "bg-violet-500/20 text-violet-300 border-violet-500/30" : "bg-blue-500/20 text-blue-300 border-blue-500/30"}`}>
                    {isAdmin ? <ShieldCheck className="w-2.5 h-2.5" /> : <Star className="w-2.5 h-2.5" />}
                    {user.role}
                  </span>
                  {user.isVerified && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 className="w-2.5 h-2.5" /> Verified
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/35">{user.email}</p>
              </div>

              {/* Stats strip */}
              <div className="flex items-center gap-3 w-full mt-1">
                {[
                  { icon: Download, label: "Downloads", value: downloadCount ?? "—" },
                  { icon: Calendar, label: "Joined", value: new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" }) },
                  { icon: isAdmin ? ShieldCheck : User, label: "Role", value: isAdmin ? "Admin" : "User" },
                ].map((s, i) => (
                  <div key={i}
                    className="flex-1 bg-white/[0.04] border border-white/[0.06] rounded-2xl p-3 text-center">
                    <s.icon className="w-4 h-4 text-violet-400 mx-auto mb-1" />
                    <p className="text-sm font-bold text-white">{s.value}</p>
                    <p className="text-[10px] text-white/25 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Section tabs ────────────────────────────────────────────── */}
          <div className="flex items-center gap-1 px-5 mb-4">
            {([
              { id: "info", label: "Profile Info", icon: Edit2 },
              { id: "password", label: "Password", icon: Key },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeSection === tab.id
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-500/20"
                    : "bg-white/[0.04] text-white/40 hover:text-white/70 border border-white/[0.06]"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="px-5 pb-6">
            <AnimatePresence mode="wait">

              {/* ── PROFILE INFO ─────────────────────────────────────── */}
              {activeSection === "info" && (
                <motion.div
                  key="info"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-4"
                >
                  {/* Display name editor */}
                  <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4">
                    <label className="text-[11px] font-semibold text-white/40 uppercase tracking-wider block mb-2.5">
                      Display Name
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                        <input
                          value={editName}
                          onChange={e => { setEditName(e.target.value); setNameEdited(e.target.value !== user.name); }}
                          placeholder="Your name"
                          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 transition-all"
                        />
                      </div>
                      <AnimatePresence>
                        {nameEdited && (
                          <motion.button
                            initial={{ opacity: 0, scale: 0.85 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.85 }}
                            onClick={handleSaveName} disabled={savingName}
                            className="px-3.5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-1.5"
                          >
                            {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Save
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Account details */}
                  <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 space-y-0">
                    <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-3">Account Details</p>
                    {[
                      { icon: Mail, label: "Email", value: user.email },
                      { icon: Calendar, label: "Joined", value: joinDate },
                      { icon: ShieldCheck, label: "Role", value: user.role === "admin" ? "Administrator" : "Standard User" },
                    ].map((item, i) => (
                      <div key={i}
                        className="flex items-center gap-3 py-2.5 border-b border-white/[0.04] last:border-0">
                        <item.icon className="w-4 h-4 text-white/20 shrink-0" />
                        <span className="text-xs text-white/30 w-14 shrink-0">{item.label}</span>
                        <span className="text-sm text-white font-medium truncate">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Sign out */}
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-red-500/20 bg-red-500/[0.05] hover:bg-red-500/[0.10] text-red-400 hover:text-red-300 text-sm font-semibold transition-all"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </motion.div>
              )}

              {/* ── CHANGE PASSWORD ────────────────────────────────── */}
              {activeSection === "password" && (
                <motion.div
                  key="password"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <div className="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4">
                    <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-4">Change Password</p>
                    <form onSubmit={handleChangePassword} className="space-y-3">
                      {/* Old password */}
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                        <input
                          type={showOld ? "text" : "password"} value={oldPass}
                          onChange={e => setOldPass(e.target.value)}
                          placeholder="Current password" required
                          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 transition-all"
                        />
                        <button type="button" onClick={() => setShowOld(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-colors">
                          {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      {/* New password */}
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
                        <input
                          type={showNew ? "text" : "password"} value={newPass}
                          onChange={e => setNewPass(e.target.value)}
                          placeholder="New password (min 6 chars)" required
                          className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 transition-all"
                        />
                        <button type="button" onClick={() => setShowNew(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/20 hover:text-white/60 transition-colors">
                          {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>

                      {newPass && newPass.length < 6 && (
                        <p className="flex items-center gap-1.5 text-xs text-red-400">
                          <AlertCircle className="w-3 h-3" /> At least 6 characters required
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={savingPass || !oldPass || !newPass}
                        className="w-full bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/15"
                      >
                        {savingPass ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                        Update Password
                      </button>
                    </form>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </>
  );
}
