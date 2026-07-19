import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Mail, Lock, User, ArrowRight, Loader2, ShieldCheck, KeyRound, RefreshCw, ChevronLeft } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useLocation } from "wouter";
import { toast } from "sonner";

const API = "/api";

type Screen = "login" | "register" | "otp" | "forgot" | "forgot-sent";

export default function AuthPage() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const [screen, setScreen] = useState<Screen>("login");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  // Form states
  const [form, setForm] = useState({ name: "", email: "", password: "", rememberMe: false });
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  // ─── OTP input ──────────────────────────────────────────────────────────────
  const handleOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  };
  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  // ─── REGISTER ───────────────────────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Registration failed");
      if (data.requiresOtp) {
        setPendingEmail(data.email ?? form.email);
        setScreen("otp");
        toast.success("Check your email for the 6-digit code!");
      } else if (data.token) {
        login(data.token, data.user);
        navigate("/");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── LOGIN ───────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password, rememberMe: form.rememberMe }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.requiresOtp) {
          setPendingEmail(data.email ?? form.email);
          setScreen("otp");
          toast.info("Verify your email first. A code has been sent.");
          return;
        }
        throw new Error(data.error ?? "Login failed");
      }
      login(data.token, data.user);
      navigate("/");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── VERIFY OTP ──────────────────────────────────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otp.join("");
    if (code.length < 6) { toast.error("Enter all 6 digits"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail, otp: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      login(data.token, data.user);
      navigate("/");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── RESEND OTP ───────────────────────────────────────────────────────────────
  const handleResend = async () => {
    try {
      const res = await fetch(`${API}/auth/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("New code sent!");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  // ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setScreen("forgot-sent");
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
        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <span className="text-white font-black text-lg">▶</span>
            </div>
            <span className="text-2xl font-black text-white tracking-tight">Vid<span className="text-violet-400">Snap</span></span>
          </div>
          <p className="text-sm text-muted-foreground">Download & edit videos from anywhere</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* ─── LOGIN / REGISTER CARD ─────────────────────────────────────────── */}
          {(screen === "login" || screen === "register") && (
            <motion.div key="auth" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="bg-card/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
              {/* Tabs */}
              <div className="flex bg-black/30 rounded-xl p-1 mb-6">
                {(["login", "register"] as const).map(t => (
                  <button key={t} onClick={() => setScreen(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${screen === t ? "bg-violet-600 text-white shadow-lg" : "text-muted-foreground hover:text-white"}`}>
                    {t === "login" ? "Sign In" : "Sign Up"}
                  </button>
                ))}
              </div>

              <form onSubmit={screen === "login" ? handleLogin : handleRegister} className="space-y-4">
                {screen === "register" && (
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input required value={form.name} onChange={set("name")} placeholder="Full name"
                      className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all" />
                  </div>
                )}
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input required type="email" value={form.email} onChange={set("email")} placeholder="Email address"
                    className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all" />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input required type={showPass ? "text" : "password"} value={form.password} onChange={set("password")}
                    placeholder={screen === "register" ? "Password (min 6 chars)" : "Password"}
                    className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-10 py-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all" />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white transition-colors">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {screen === "login" && (
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.rememberMe} onChange={set("rememberMe")} className="w-4 h-4 rounded border-white/20 accent-violet-600" />
                      <span className="text-xs text-muted-foreground">Remember me (30 days)</span>
                    </label>
                    <button type="button" onClick={() => setScreen("forgot")}
                      className="text-xs text-violet-400 hover:text-violet-300 transition-colors">Forgot password?</button>
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {screen === "login" ? "Sign In" : "Create Account"}
                </button>
              </form>
            </motion.div>
          )}

          {/* ─── OTP VERIFICATION ─────────────────────────────────────────────── */}
          {screen === "otp" && (
            <motion.div key="otp" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="bg-card/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
              <div className="w-14 h-14 bg-violet-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ShieldCheck className="w-7 h-7 text-violet-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Check your email</h2>
              <p className="text-sm text-muted-foreground mb-2">We sent a 6-digit code to</p>
              <p className="text-sm font-semibold text-violet-400 mb-6">{pendingEmail}</p>

              <form onSubmit={handleVerifyOtp}>
                <div className="flex gap-2 justify-center mb-6">
                  {otp.map((digit, i) => (
                    <input key={i} ref={el => { otpRefs.current[i] = el; }}
                      value={digit} onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                      maxLength={1} inputMode="numeric"
                      className="w-11 h-14 text-center text-xl font-bold bg-black/40 border-2 border-white/10 rounded-xl text-white focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 transition-all" />
                  ))}
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 mb-4">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  Verify Code
                </button>
              </form>
              <button onClick={handleResend} className="text-sm text-muted-foreground hover:text-white flex items-center gap-1 mx-auto transition-colors">
                <RefreshCw className="w-3 h-3" /> Resend code
              </button>
              <button onClick={() => setScreen("login")} className="text-xs text-muted-foreground/60 hover:text-muted-foreground mt-3 flex items-center gap-1 mx-auto transition-colors">
                <ChevronLeft className="w-3 h-3" /> Back to sign in
              </button>
            </motion.div>
          )}

          {/* ─── FORGOT PASSWORD ──────────────────────────────────────────────── */}
          {screen === "forgot" && (
            <motion.div key="forgot" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="bg-card/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
              <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <KeyRound className="w-7 h-7 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1 text-center">Forgot password?</h2>
              <p className="text-sm text-muted-foreground mb-6 text-center">Enter your email and we'll send a reset link</p>
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input required type="email" value={form.email} onChange={set("email")} placeholder="Email address"
                    className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-violet-500 transition-all" />
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Send Reset Link
                </button>
              </form>
              <button onClick={() => setScreen("login")} className="text-sm text-muted-foreground/60 hover:text-muted-foreground mt-4 flex items-center gap-1 mx-auto transition-colors">
                <ChevronLeft className="w-3 h-3" /> Back to sign in
              </button>
            </motion.div>
          )}

          {/* ─── FORGOT SENT ─────────────────────────────────────────────────── */}
          {screen === "forgot-sent" && (
            <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="bg-card/80 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Check your inbox!</h2>
              <p className="text-sm text-muted-foreground mb-6">We sent a password reset link to <strong className="text-white">{form.email}</strong>. It expires in 1 hour.</p>
              <button onClick={() => setScreen("login")}
                className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1 mx-auto transition-colors">
                <ChevronLeft className="w-3 h-3" /> Back to sign in
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
