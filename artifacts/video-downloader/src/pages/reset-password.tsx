import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { KeyRound, Lock, Eye, EyeOff, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { toast } from "sonner";

const API = "/api";

export default function ResetPasswordPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const token = new URLSearchParams(search).get("token") ?? "";
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (!token) { navigate("/auth"); }
  }, [token, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { toast.error("Passwords don't match"); return; }
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Reset failed");
      setDone(true);
      setTimeout(() => navigate("/auth"), 2500);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.15) 0%, transparent 60%)" }}>
      <div className="w-full max-w-md">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
          {done ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Password Reset!</h2>
              <p className="text-sm text-muted-foreground">Redirecting to sign in…</p>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 bg-violet-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <KeyRound className="w-7 h-7 text-violet-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1 text-center">Set new password</h2>
              <p className="text-sm text-muted-foreground mb-6 text-center">Choose a strong password for your account</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input required type={showPass ? "text" : "password"} value={password}
                    onChange={e => setPassword(e.target.value)} placeholder="New password (min 6 chars)"
                    className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-violet-500 transition-all" />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input required type="password" value={confirm}
                    onChange={e => setConfirm(e.target.value)} placeholder="Confirm new password"
                    className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-violet-500 transition-all" />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Reset Password
                </button>
              </form>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
