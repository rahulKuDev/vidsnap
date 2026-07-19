import { Link, useLocation } from "wouter";
import { Download, History, Scissors, Globe, LogOut, LifeBuoy, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth-context";
import { toast } from "sonner";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logout, isAdmin } = useAuth();

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
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background relative overflow-hidden">
      {/* Ambient glow — toned down on mobile for perf */}
      <div className="hidden sm:block absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full pointer-events-none" />
      <div className="hidden sm:block absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-accent/20 blur-[120px] rounded-full pointer-events-none" />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-xl">
        <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group shrink-0">
            <div className="relative w-8 h-8 sm:w-9 sm:h-9">
              <div className="absolute inset-0 rounded-full border border-primary/40 group-hover:border-primary/70 transition-colors"
                   style={{ animation: "spin 8s linear infinite" }} />
              <div className="absolute inset-0.5 rounded-full bg-gradient-to-br from-violet-600/30 to-blue-600/20 blur-sm" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl overflow-hidden border border-white/10 shadow-[0_0_12px_rgba(139,92,246,0.5)]"
                     style={{ animation: "float 3s ease-in-out infinite" }}>
                  <div className="w-full h-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center">
                    <span className="text-white font-black text-xs">▶</span>
                  </div>
                </div>
              </div>
            </div>
            <span className="text-base sm:text-lg font-black tracking-tight">
              <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">Vid</span>
              <span className="text-white">Snap</span>
            </span>
          </Link>

          {/* Nav — horizontally scrollable on small screens */}
          <nav className="flex items-center min-w-0 overflow-x-auto scrollbar-none flex-1 justify-end gap-0.5 sm:gap-1">
            <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/");
                return (
                  <Link key={item.href} href={item.href}
                    className={cn(
                      "flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-2 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 min-h-[40px]",
                      isActive
                        ? "bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]"
                        : "text-muted-foreground hover:bg-white/5 hover:text-white"
                    )}>
                    <Icon className={cn("w-4 h-4 shrink-0", isActive && "text-primary")} />
                    <span className="hidden sm:inline-block whitespace-nowrap">{item.label}</span>
                  </Link>
                );
              })}
            </div>

            {/* Divider + User */}
            <div className="ml-1 pl-1 sm:ml-2 sm:pl-2 border-l border-white/10 flex items-center gap-1 shrink-0">
              {user && (
                <>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {user.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-xs font-semibold text-white leading-none">{user.name.split(" ")[0]}</p>
                      {isAdmin && (
                        <p className="text-[10px] text-violet-400 leading-none mt-0.5 flex items-center gap-0.5">
                          <ShieldCheck className="w-2.5 h-2.5" />Admin
                        </p>
                      )}
                    </div>
                  </div>
                  <button onClick={handleLogout} title="Sign out"
                    className="p-2 text-muted-foreground hover:text-red-400 rounded-md hover:bg-white/5 transition-colors min-h-[40px]">
                    <LogOut className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* ── Main ─────────────────────────────────────────────────────────────── */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-8 relative z-10">
        {children}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/5 py-3 sm:py-4 text-center">
        <p className="text-xs text-muted-foreground/50">
          © {new Date().getFullYear()} VidSnap ·{" "}
          <Link href="/help" className="hover:text-violet-400 transition-colors">Help &amp; Feedback</Link>
        </p>
      </footer>

      <style>{`
        @keyframes spin  { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
        .scrollbar-none { scrollbar-width: none; }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
