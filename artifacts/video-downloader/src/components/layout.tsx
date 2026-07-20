import { Link, useLocation } from "wouter";
import { Download, History, Scissors, Globe, LogOut, LifeBuoy, ShieldCheck, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { toast } from "sonner";
import { useState } from "react";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/", label: "Downloader", icon: Download },
    { href: "/history", label: "History", icon: History },
    { href: "/editor", label: "Editor", icon: Scissors },
    { href: "/platforms", label: "Platforms", icon: Globe },
    { href: "/help", label: "Help", icon: LifeBuoy },
  ];

  const handleLogout = () => {
    logout();
    toast.success("Signed out successfully.");
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background relative overflow-x-hidden">

      {/* ── Fixed Background Layer: orbs + floating text ───────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        {/* Ambient orbs */}
        <div className="absolute top-[-10%] left-[-8%] w-[50%] h-[50%] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 65%)", animation: "orbFloat1 14s ease-in-out infinite" }} />
        <div className="absolute bottom-[-10%] right-[-8%] w-[45%] h-[45%] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 65%)", animation: "orbFloat2 18s ease-in-out infinite" }} />
        <div className="absolute top-[40%] right-[20%] w-[30%] h-[30%] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(236,72,153,0.06) 0%, transparent 65%)", animation: "orbFloat3 22s ease-in-out infinite" }} />

        {/* Floating watermark text — very low opacity, background only */}
        {[
          { text: "VidSnap",           top:  "6%",  color: "rgba(167,139,250,0.055)", size: "2.5rem",  dur: "28s",  dir: "floatLeft",  delay: "0s" },
          { text: "Universal",         top: "15%",  color: "rgba(96,165,250,0.050)",  size: "1.8rem",  dur: "34s",  dir: "floatRight", delay: "4s" },
          { text: "Rahul",             top: "24%",  color: "rgba(52,211,153,0.045)",  size: "2.1rem",  dur: "22s",  dir: "floatLeft",  delay: "8s" },
          { text: "▶ Download",        top: "33%",  color: "rgba(244,114,182,0.045)", size: "1.6rem",  dur: "30s",  dir: "floatRight", delay: "2s" },
          { text: "VidSnap Universal", top: "43%",  color: "rgba(251,191,36,0.04)",   size: "3rem",    dur: "40s",  dir: "floatLeft",  delay: "12s" },
          { text: "Rahul",             top: "53%",  color: "rgba(139,92,246,0.04)",   size: "1.5rem",  dur: "25s",  dir: "floatRight", delay: "6s" },
          { text: "4K • 1080p • HD",   top: "62%",  color: "rgba(34,211,238,0.045)",  size: "1.4rem",  dur: "32s",  dir: "floatLeft",  delay: "16s" },
          { text: "VidSnap",           top: "71%",  color: "rgba(248,113,113,0.04)",  size: "2.8rem",  dur: "38s",  dir: "floatRight", delay: "10s" },
          { text: "Universal",         top: "80%",  color: "rgba(167,139,250,0.05)",  size: "2rem",    dur: "26s",  dir: "floatLeft",  delay: "20s" },
          { text: "Rahul",             top: "89%",  color: "rgba(74,222,128,0.04)",   size: "1.7rem",  dur: "36s",  dir: "floatRight", delay: "14s" },
        ].map((item, i) => (
          <span
            key={i}
            className="absolute font-black select-none whitespace-nowrap"
            style={{
              top: item.top,
              fontSize: item.size,
              color: item.color,
              animation: `${item.dir} ${item.dur} linear ${item.delay} infinite`,
              letterSpacing: "0.05em",
            }}
          >
            {item.text}
          </span>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          HEADER
          - Desktop (md+): Full horizontal nav with text labels
          - Mobile (< md): Logo left + hamburger right → drawer below
      ══════════════════════════════════════════════════════════════════ */}
      <header className="sticky top-0 z-50 w-full border-b border-white/[0.07] bg-[rgba(6,6,16,0.92)] backdrop-blur-2xl">

        <div className="w-full px-3 md:px-6 h-[52px] md:h-[60px] flex items-center">

          {/* ── LOGO ──────────────────────────────────────────────── */}
          <Link href="/" className="flex items-center gap-2.5 group shrink-0">
            <div className="relative w-9 h-9 md:w-10 md:h-10 shrink-0">
              <div
                className="absolute -inset-1 rounded-[16px] opacity-70 blur-md transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: "conic-gradient(from 140deg, rgba(167,139,250,0.15), rgba(96,165,250,0.75), rgba(52,211,153,0.55), rgba(167,139,250,0.15))", animation: "vidsnapLogoAura 4s linear infinite" }}
              />
              <div
                className="relative w-full h-full rounded-[13px] overflow-hidden border border-cyan-300/25 bg-white/[0.04]"
                style={{ boxShadow: "0 0 16px rgba(139,92,246,0.45), 0 0 34px rgba(59,130,246,0.18)", animation: "vidsnapLogoFloat 3.6s ease-in-out infinite" }}
              >
                <img
                  src="/vidsnap-logo.png"
                  alt="VidSnap"
                  className="w-full h-full object-cover block"
                  onError={(e) => {
                    const el = e.currentTarget;
                    el.style.display = "none";
                    el.parentElement!.style.cssText += ";background:linear-gradient(135deg,#7c3aed,#2563eb);display:flex;align-items:center;justify-content:center;";
                    el.parentElement!.innerHTML = '<span style="color:#fff;font-size:17px;font-weight:900">▶</span>';
                  }}
                />
              </div>
              <span className="absolute -right-0.5 -top-0.5 w-2.5 h-2.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.9)] animate-pulse" />
            </div>

            <div className="flex items-center gap-1.5 leading-none select-none">
              <span className="text-[17px] md:text-[18px] font-black tracking-tight animated-gradient-text">
                VidSnap
              </span>
              <span className="px-1.5 md:px-2 py-0.5 rounded-md border border-violet-400/35 bg-violet-500/15 text-[8px] md:text-[9px] font-black uppercase tracking-[0.14em] text-violet-200 shadow-[0_0_14px_rgba(139,92,246,0.25)]">
                Universal
              </span>
            </div>
          </Link>

          {/* ══ DESKTOP NAV (md+) ═══════════════════════════════════ */}
          <nav className="hidden md:flex items-center gap-0.5 ml-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150",
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/50 hover:text-white hover:bg-white/[0.05]"
                  )}
                >
                  <Icon className={cn("w-[14px] h-[14px] shrink-0", isActive && "text-violet-400")} />
                  {item.label}
                </Link>
              );
            })}

            {/* User pill */}
            {user && (
              <div className="flex items-center gap-1 ml-2 pl-2 border-l border-white/10">
                <Link href="/profile" className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.07] hover:border-violet-500/30 hover:bg-white/[0.08] transition-all group">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0 group-hover:ring-2 group-hover:ring-violet-500/40 transition-all overflow-hidden">
                    {user.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      user.name[0].toUpperCase()
                    )}
                  </div>
                  <div className="leading-tight">
                    <p className="text-[12px] font-semibold text-white leading-none">{user.name.split(" ")[0]}</p>
                    {isAdmin && (
                      <p className="text-[10px] text-violet-400 flex items-center gap-0.5 mt-0.5 leading-none">
                        <ShieldCheck className="w-2.5 h-2.5" />Admin
                      </p>
                    )}
                  </div>
                </Link>
                <button
                  onClick={handleLogout}
                  title="Sign out"
                  className="p-1.5 text-white/35 hover:text-red-400 rounded-lg hover:bg-white/[0.05] transition-colors"
                >
                  <LogOut className="w-[15px] h-[15px]" />
                </button>
              </div>
            )}
          </nav>

          {/* ══ MOBILE NAV (< md) — avatar + hamburger only ═════════ */}
          <div className="flex md:hidden items-center gap-2 ml-auto">
            {user && (
              <Link href="/profile" className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0 hover:ring-2 hover:ring-violet-500/50 transition-all overflow-hidden">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  user.name[0].toUpperCase()
                )}
              </Link>
            )}
            <button
              onClick={() => setMobileMenuOpen(v => !v)}
              className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/[0.06] transition-colors"
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

        </div>

        {/* ══ MOBILE DRAWER (< md) ════════════════════════════════════ */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-white/[0.07] bg-[rgba(6,6,16,0.98)] backdrop-blur-2xl">
            <div className="w-full px-3 py-3 flex flex-col gap-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3.5 rounded-xl text-[14px] font-medium transition-all",
                      isActive
                        ? "bg-violet-500/[0.12] text-white border border-violet-500/20"
                        : "text-white/50 hover:text-white hover:bg-white/[0.04]"
                    )}
                  >
                    <Icon className={cn("w-[18px] h-[18px] shrink-0", isActive && "text-violet-400")} />
                    <span>{item.label}</span>
                    {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400" />}
                  </Link>
                );
              })}

              {user && (
                <div className="mt-1.5 pt-3 border-t border-white/[0.06] flex items-center justify-between px-2">
                  <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center text-sm font-bold text-white overflow-hidden">
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        user.name[0].toUpperCase()
                      )}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-white">{user.name}</p>
                      {isAdmin && (
                        <p className="text-[11px] text-violet-400 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" /> Admin
                        </p>
                      )}
                    </div>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-red-400 hover:bg-red-500/10 rounded-xl transition-colors"
                  >
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ══════════════════════════════════════════════════════════════════
          MAIN — centered flex column, proper padding
      ══════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 w-full px-3 md:px-6 py-5 md:py-8 relative z-10 flex flex-col items-center">
        {children}
      </main>

      {/* ══════════════════════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/[0.05] py-3 z-10 relative">
        <div className="w-full px-3 md:px-6 flex items-center justify-between">
          <p className="text-[11px] text-white/20">© {new Date().getFullYear()} VidSnap</p>
          <Link href="/help" className="text-[11px] text-white/20 hover:text-violet-400 transition-colors">
            Help &amp; Feedback
          </Link>
        </div>
      </footer>

    </div>
  );
}
