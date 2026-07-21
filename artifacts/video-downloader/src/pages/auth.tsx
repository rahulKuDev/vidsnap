import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye, EyeOff, Mail, Lock, User, ArrowRight, Loader2,
  ShieldCheck, KeyRound, RefreshCw, ChevronLeft, Download,
  Scissors, Globe, CheckCircle2, AlertCircle, Sparkles,
} from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useLocation } from "wouter";
import { toast } from "sonner";

const API = "/api";

// ─── INPUT COMPONENT (outside AuthPage to prevent cursor-jump bug) ────────────
function AuthInput({
  type = "text", icon: Icon, placeholder, value, onChange, error, right, showPass, onTogglePass,
}: {
  type?: string; icon: any; placeholder: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string; right?: React.ReactNode;
  showPass?: boolean; onTogglePass?: () => void;
}) {
  return (
    <div>
      <div className="relative">
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
        <input
          type={type} value={value} onChange={onChange} placeholder={placeholder} required
          className={`w-full bg-white/[0.04] border rounded-xl pl-10 pr-${right ? "10" : "4"} py-3 text-sm text-white placeholder:text-white/25 focus:outline-none transition-all
            ${error ? "border-red-500/70 focus:border-red-500 focus:ring-1 focus:ring-red-500/30" : "border-white/[0.08] focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/20"}`}
        />
        {right && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{right}</div>
        )}
      </div>
      <AnimatePresence mode="wait">
        {error && error.trim() && (
          <motion.p
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-1.5 text-xs text-red-400 mt-1.5 ml-1"
          >
            <AlertCircle className="w-3 h-3 shrink-0" />
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

type Screen = "login" | "register" | "otp" | "forgot" | "forgot-sent";

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
}

const FEATURES = [
  { icon: Download, text: "Download from 50+ platforms" },
  { icon: Scissors, text: "Built-in video editor" },
  { icon: Globe, text: "4K, 1080p, HD & audio" },
  { icon: ShieldCheck, text: "Secure & private downloads" },
];

export default function AuthPage() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const [screen, setScreen] = useState<Screen>("login");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Form states
  const [form, setForm] = useState({ name: "", email: "", password: "", rememberMe: false });
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
    // Clear field error when user types
    if (k in fieldErrors) setFieldErrors(prev => ({ ...prev, [k]: undefined }));
  };

  const clearErrors = () => setFieldErrors({});

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
    clearErrors();
    setLoading(true);
    try {
      const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg: string = data.error ?? "Registration failed";
        // Show inline error for email-specific issues
        if (res.status === 409 || msg.toLowerCase().includes("email")) {
          setFieldErrors(prev => ({ ...prev, email: msg }));
        } else if (msg.toLowerCase().includes("name")) {
          setFieldErrors(prev => ({ ...prev, name: msg }));
        } else if (msg.toLowerCase().includes("password")) {
          setFieldErrors(prev => ({ ...prev, password: msg }));
        } else {
          toast.error(msg);
        }
        return;
      }
      if (data.requiresOtp) {
        setPendingEmail(data.email ?? form.email);
        setScreen("otp");
        toast.success("Check your email for the 6-digit code!");
      } else if (data.token) {
        login(data.token, data.user);
        navigate("/");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  // ─── LOGIN ───────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
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
        const msg: string = data.error ?? "Login failed";
        if (msg.toLowerCase().includes("email") || msg.toLowerCase().includes("password") || msg.toLowerCase().includes("invalid")) {
          setFieldErrors({ email: " ", password: msg });
        } else {
          toast.error(msg);
        }
        return;
      }
      login(data.token, data.user);
      navigate("/");
    } catch (err: any) {
      toast.error(err.message ?? "Login failed");
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

  const switchScreen = (s: Screen) => {
    clearErrors();
    setScreen(s);
  };

  return (
    <div className="min-h-screen bg-[#080810] flex items-stretch overflow-hidden">

      {/* ── LEFT PANEL — decorative, hidden on mobile ───────────────────── */}
      <div className="hidden lg:flex lg:w-[52%] relative flex-col justify-between p-12 overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-20%] left-[-10%] w-[70%] h-[70%] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 65%)" }} />
          <div className="absolute bottom-[-15%] right-[-10%] w-[60%] h-[60%] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(59,130,246,0.14) 0%, transparent 65%)" }} />
          <div className="absolute top-[40%] right-[5%] w-[40%] h-[40%] rounded-full"
            style={{ background: "radial-gradient(circle, rgba(236,72,153,0.08) 0%, transparent 65%)" }} />
        </div>

        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />

        {/* Logo */}
        <div className="relative z-10">
          <div className="inline-flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/40">
              <span className="text-white font-black text-xl">▶</span>
            </div>
            <div>
              <span className="text-2xl font-black text-white tracking-tight">Vid<span className="text-violet-400">Snap</span></span>
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400/70 mt-0.5">Universal</p>
            </div>
          </div>
        </div>

        {/* Hero text */}
        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="text-4xl xl:text-5xl font-black text-white leading-[1.15] tracking-tight mb-4">
              Download any video.{" "}
              <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
                Anywhere.
              </span>
            </h1>
            <p className="text-white/50 text-lg leading-relaxed max-w-sm">
              The most powerful video downloader & editor. 50+ platforms, 4K quality, all in your browser.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 + 0.3 }}
                className="flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0">
                  <f.icon className="w-4 h-4 text-violet-400" />
                </div>
                <span className="text-sm text-white/60 font-medium">{f.text}</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400/70 ml-auto shrink-0" />
              </motion.div>
            ))}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-6 pt-2">
            {[
              { value: "50+", label: "Platforms" },
              { value: "4K", label: "Max Quality" },
              { value: "Free", label: "Always" },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-2xl font-black text-white">{s.value}</p>
                <p className="text-xs text-white/35 font-medium mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom quote */}
        <div className="relative z-10">
          <p className="text-xs text-white/20 italic">"The best video downloader I've used." — Power user</p>
        </div>
      </div>

      {/* ── RIGHT PANEL — forms ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12 relative">

        {/* Mobile logo */}
        <div className="lg:hidden mb-8 text-center">
          <div className="inline-flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <span className="text-white font-black text-base">▶</span>
            </div>
            <span className="text-xl font-black text-white tracking-tight">Vid<span className="text-violet-400">Snap</span></span>
          </div>
          <p className="text-xs text-white/35 mt-1.5">Download & edit videos from anywhere</p>
        </div>

        <div className="w-full max-w-[400px]">
          <AnimatePresence mode="wait">

            {/* ─── LOGIN / REGISTER ────────────────────────────────────── */}
            {(screen === "login" || screen === "register") && (
              <motion.div
                key={`auth-${screen}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                transition={{ duration: 0.22 }}
              >
                {/* Header */}
                <div className="mb-7">
                  <h2 className="text-2xl font-black text-white mb-1">
                    {screen === "login" ? "Welcome back 👋" : "Create account ✨"}
                  </h2>
                  <p className="text-sm text-white/40">
                    {screen === "login"
                      ? "Sign in to continue to VidSnap"
                      : "Join thousands of users downloading videos"}
                  </p>
                </div>

                {/* Tabs */}
                <div className="flex bg-white/[0.04] border border-white/[0.07] rounded-xl p-1 mb-6">
                  {(["login", "register"] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => switchScreen(t)}
                      className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                        screen === t
                          ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-lg"
                          : "text-white/40 hover:text-white/70"
                      }`}
                    >
                      {t === "login" ? "Sign In" : "Sign Up"}
                    </button>
                  ))}
                </div>

                <form onSubmit={screen === "login" ? handleLogin : handleRegister} className="space-y-4">
                  {screen === "register" && (
                    <AuthInput
                      icon={User} placeholder="Full name" value={form.name}
                      onChange={set("name")} error={fieldErrors.name}
                    />
                  )}

                  <AuthInput
                    type="email" icon={Mail} placeholder="Email address" value={form.email}
                    onChange={set("email")} error={fieldErrors.email}
                  />

                  <AuthInput
                    type={showPass ? "text" : "password"} icon={Lock}
                    placeholder={screen === "register" ? "Password (min 6 chars)" : "Password"}
                    value={form.password} onChange={set("password")} error={fieldErrors.password}
                    right={
                      <button type="button" onClick={() => setShowPass(s => !s)}
                        className="text-white/30 hover:text-white/70 transition-colors p-0.5">
                        {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    }
                  />

                  {screen === "login" && (
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox" checked={form.rememberMe} onChange={set("rememberMe")}
                          className="w-4 h-4 rounded border-white/20 accent-violet-600"
                        />
                        <span className="text-xs text-white/40 group-hover:text-white/60 transition-colors">Remember me (30 days)</span>
                      </label>
                      <button type="button" onClick={() => switchScreen("forgot")}
                        className="text-xs text-violet-400 hover:text-violet-300 transition-colors font-medium">
                        Forgot password?
                      </button>
                    </div>
                  )}

                  <button
                    type="submit" disabled={loading}
                    className="w-full relative overflow-hidden bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20 mt-2 group"
                  >
                    <span className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" />
                    {loading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : screen === "login" ? <ArrowRight className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />
                    }
                    <span>{screen === "login" ? "Sign In" : "Create Account"}</span>
                  </button>
                </form>

                {/* Switch link */}
                <p className="text-center text-xs text-white/30 mt-5">
                  {screen === "login" ? "New to VidSnap? " : "Already have an account? "}
                  <button
                    onClick={() => switchScreen(screen === "login" ? "register" : "login")}
                    className="text-violet-400 hover:text-violet-300 font-semibold transition-colors"
                  >
                    {screen === "login" ? "Create account →" : "Sign in →"}
                  </button>
                </p>
              </motion.div>
            )}

            {/* ─── OTP VERIFICATION ────────────────────────────────────── */}
            {screen === "otp" && (
              <motion.div
                key="otp"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16 }}
                className="text-center"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20 rounded-3xl flex items-center justify-center mx-auto mb-5">
                  <ShieldCheck className="w-8 h-8 text-violet-400" />
                </div>
                <h2 className="text-2xl font-black text-white mb-1">Check your email</h2>
                <p className="text-sm text-white/40 mb-1.5">We sent a 6-digit code to</p>
                <p className="text-sm font-bold text-violet-400 mb-7">{pendingEmail}</p>

                <form onSubmit={handleVerifyOtp}>
                  <div className="flex gap-2.5 justify-center mb-6">
                    {otp.map((digit, i) => (
                      <input
                        key={i} ref={el => { otpRefs.current[i] = el; }}
                        value={digit} onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        maxLength={1} inputMode="numeric"
                        className="w-11 h-14 text-center text-xl font-black bg-white/[0.04] border-2 border-white/[0.08] rounded-xl text-white focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 transition-all"
                      />
                    ))}
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 mb-4 shadow-lg shadow-violet-500/20">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    Verify Code
                  </button>
                </form>
                <button onClick={handleResend} className="text-sm text-white/35 hover:text-white/70 flex items-center gap-1.5 mx-auto transition-colors mb-3">
                  <RefreshCw className="w-3.5 h-3.5" /> Resend code
                </button>
                <button onClick={() => switchScreen("login")} className="text-xs text-white/20 hover:text-white/40 flex items-center gap-1 mx-auto transition-colors">
                  <ChevronLeft className="w-3 h-3" /> Back to sign in
                </button>
              </motion.div>
            )}

            {/* ─── FORGOT PASSWORD ─────────────────────────────────────── */}
            {screen === "forgot" && (
              <motion.div key="forgot" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }}>
                <div className="w-14 h-14 bg-blue-500/15 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <KeyRound className="w-7 h-7 text-blue-400" />
                </div>
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-black text-white mb-1">Forgot password?</h2>
                  <p className="text-sm text-white/40">Enter your email and we'll send a reset link</p>
                </div>
                <form onSubmit={handleForgot} className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none" />
                    <input required type="email" value={form.email} onChange={set("email")} placeholder="Email address"
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/20 transition-all" />
                  </div>
                  <button type="submit" disabled={loading}
                    className="w-full bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-violet-500/20">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    Send Reset Link
                  </button>
                </form>
                <button onClick={() => switchScreen("login")} className="text-sm text-white/30 hover:text-white/60 mt-5 flex items-center gap-1 mx-auto transition-colors">
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to sign in
                </button>
              </motion.div>
            )}

            {/* ─── FORGOT SENT ─────────────────────────────────────────── */}
            {screen === "forgot-sent" && (
              <motion.div key="sent" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="text-center">
                <div className="w-20 h-20 bg-emerald-500/15 border border-emerald-500/20 rounded-3xl flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                </div>
                <h2 className="text-2xl font-black text-white mb-2">Check your inbox!</h2>
                <p className="text-sm text-white/40 mb-6 leading-relaxed">
                  We sent a reset link to{" "}
                  <strong className="text-white">{form.email}</strong>.{" "}
                  It expires in 1 hour.
                </p>
                <button onClick={() => switchScreen("login")} className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1 mx-auto transition-colors font-medium">
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to sign in
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}
