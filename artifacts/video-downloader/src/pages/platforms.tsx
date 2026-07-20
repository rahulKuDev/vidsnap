import { useGetSupportedPlatforms } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { CheckCircle2, Globe, Loader2, Sparkles } from "lucide-react";

// ─── Simple Icons CDN: https://cdn.simpleicons.org/{slug}/{hex-color}
const SI = (slug: string, hex: string) => `https://cdn.simpleicons.org/${slug}/${hex}`;

// ─── Hardcoded popular platforms ─────────────────────────────────────────────
const POPULAR_PLATFORMS = [
  {
    name: "YouTube",
    domain: "youtube.com",
    logo: SI("youtube", "FF0000"),
    color: "#FF0000",
    bg: "rgba(255,0,0,0.10)",
    border: "rgba(255,0,0,0.22)",
    note: "Videos, Shorts, Playlists",
  },
  {
    name: "Instagram",
    domain: "instagram.com",
    logo: SI("instagram", "E1306C"),
    color: "#E1306C",
    bg: "rgba(225,48,108,0.10)",
    border: "rgba(225,48,108,0.22)",
    note: "Reels, Posts, Stories",
  },
  {
    name: "TikTok",
    domain: "tiktok.com",
    logo: SI("tiktok", "69C9D0"),
    color: "#69C9D0",
    bg: "rgba(105,201,208,0.10)",
    border: "rgba(105,201,208,0.22)",
    note: "Videos, Slideshows",
  },
  {
    name: "Twitter / X",
    domain: "x.com",
    logo: SI("x", "ffffff"),
    color: "#ffffff",
    bg: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.15)",
    note: "Videos, GIFs",
  },
  {
    name: "Facebook",
    domain: "facebook.com",
    logo: SI("facebook", "1877F2"),
    color: "#1877F2",
    bg: "rgba(24,119,242,0.10)",
    border: "rgba(24,119,242,0.22)",
    note: "Videos, Reels, Stories",
  },
  {
    name: "Vimeo",
    domain: "vimeo.com",
    logo: SI("vimeo", "1AB7EA"),
    color: "#1AB7EA",
    bg: "rgba(26,183,234,0.10)",
    border: "rgba(26,183,234,0.22)",
    note: "HD Videos",
  },
  {
    name: "Reddit",
    domain: "reddit.com",
    logo: SI("reddit", "FF4500"),
    color: "#FF4500",
    bg: "rgba(255,69,0,0.10)",
    border: "rgba(255,69,0,0.22)",
    note: "Videos, GIFs",
  },
  {
    name: "Snapchat",
    domain: "snapchat.com",
    logo: SI("snapchat", "FFFC00"),
    color: "#FFFC00",
    bg: "rgba(255,252,0,0.08)",
    border: "rgba(255,252,0,0.20)",
    note: "Spotlight, Stories",
  },
  {
    name: "Pinterest",
    domain: "pinterest.com",
    logo: SI("pinterest", "E60023"),
    color: "#E60023",
    bg: "rgba(230,0,35,0.10)",
    border: "rgba(230,0,35,0.22)",
    note: "Videos, Idea Pins",
  },
  {
    name: "LinkedIn",
    domain: "linkedin.com",
    logo: SI("linkedin", "0A66C2"),
    color: "#0A66C2",
    bg: "rgba(10,102,194,0.10)",
    border: "rgba(10,102,194,0.22)",
    note: "Native Videos",
  },
  {
    name: "Dailymotion",
    domain: "dailymotion.com",
    logo: SI("dailymotion", "0066DC"),
    color: "#0066DC",
    bg: "rgba(0,102,220,0.10)",
    border: "rgba(0,102,220,0.22)",
    note: "HD Videos",
  },
  {
    name: "Twitch",
    domain: "twitch.tv",
    logo: SI("twitch", "9146FF"),
    color: "#9146FF",
    bg: "rgba(145,70,255,0.10)",
    border: "rgba(145,70,255,0.22)",
    note: "Clips, VODs",
  },
  {
    name: "SoundCloud",
    domain: "soundcloud.com",
    logo: SI("soundcloud", "FF5500"),
    color: "#FF5500",
    bg: "rgba(255,85,0,0.10)",
    border: "rgba(255,85,0,0.22)",
    note: "Audio Tracks",
  },
  {
    name: "Bilibili",
    domain: "bilibili.com",
    logo: SI("bilibili", "FB7299"),
    color: "#FB7299",
    bg: "rgba(251,114,153,0.10)",
    border: "rgba(251,114,153,0.22)",
    note: "Videos, Anime",
  },
  {
    name: "Rumble",
    domain: "rumble.com",
    logo: SI("rumble", "85C742"),
    color: "#85C742",
    bg: "rgba(133,199,66,0.10)",
    border: "rgba(133,199,66,0.22)",
    note: "Videos",
  },
  {
    name: "Odysee",
    domain: "odysee.com",
    logo: SI("odysee", "EF1970"),
    color: "#EF1970",
    bg: "rgba(239,25,112,0.10)",
    border: "rgba(239,25,112,0.22)",
    note: "Videos",
  },
  {
    name: "Mixcloud",
    domain: "mixcloud.com",
    logo: SI("mixcloud", "5000FF"),
    color: "#5000FF",
    bg: "rgba(80,0,255,0.10)",
    border: "rgba(80,0,255,0.22)",
    note: "Audio Mixes",
  },
  {
    name: "Bandcamp",
    domain: "bandcamp.com",
    logo: SI("bandcamp", "1DA0C3"),
    color: "#1DA0C3",
    bg: "rgba(29,160,195,0.10)",
    border: "rgba(29,160,195,0.22)",
    note: "Music, Albums",
  },
  {
    name: "Flickr",
    domain: "flickr.com",
    logo: SI("flickr", "FF0084"),
    color: "#FF0084",
    bg: "rgba(255,0,132,0.10)",
    border: "rgba(255,0,132,0.22)",
    note: "Videos",
  },
  {
    name: "Telegram",
    domain: "t.me",
    logo: SI("telegram", "26A5E4"),
    color: "#26A5E4",
    bg: "rgba(38,165,228,0.10)",
    border: "rgba(38,165,228,0.22)",
    note: "Videos, Files",
  },
  {
    name: "VK",
    domain: "vk.com",
    logo: SI("vk", "0077FF"),
    color: "#0077FF",
    bg: "rgba(0,119,255,0.10)",
    border: "rgba(0,119,255,0.22)",
    note: "Videos",
  },
  {
    name: "Niconico",
    domain: "nicovideo.jp",
    logo: SI("niconico", "E6484F"),
    color: "#E6484F",
    bg: "rgba(230,72,79,0.10)",
    border: "rgba(230,72,79,0.22)",
    note: "Videos, Anime",
  },
  {
    name: "Apple Music",
    domain: "music.apple.com",
    logo: SI("applemusic", "FA57C1"),
    color: "#FA57C1",
    bg: "rgba(250,87,193,0.10)",
    border: "rgba(250,87,193,0.22)",
    note: "Music, Podcasts",
  },
  {
    name: "Spotify",
    domain: "spotify.com",
    logo: SI("spotify", "1DB954"),
    color: "#1DB954",
    bg: "rgba(29,185,84,0.10)",
    border: "rgba(29,185,84,0.22)",
    note: "Podcasts, Audio",
  },
];

const MORE_PLATFORMS = [
  "OK.ru", "WeChat", "Weibo", "YandexDisk", "Dropbox (public)",
  "Google Drive", "OneDrive", "Streamable", "Gfycat",
  "Tenor", "Giphy", "Imgur", "Periscope", "YouNow",
  "Caffeine", "Trovo", "ESPN", "CNN", "BBC", "Reuters",
  "Crunchyroll", "Funimation", "Tubi", "Pluto TV",
  "Arte", "France TV", "9GAG", "Vine archive",
];

// ─── Logo component with fallback ─────────────────────────────────────────────
function PlatformLogo({
  logo, name, color, fallbackChar,
}: {
  logo: string; name: string; color: string; fallbackChar: string;
}) {
  return (
    <div className="w-12 h-12 flex items-center justify-center">
      <img
        src={logo}
        alt={name}
        className="w-10 h-10 object-contain drop-shadow-md group-hover:scale-110 transition-transform duration-300"
        onError={(e) => {
          // Fallback to first letter if CDN fails
          const el = e.currentTarget as HTMLImageElement;
          el.style.display = "none";
          const parent = el.parentElement!;
          parent.innerHTML = `<div style="width:48px;height:48px;border-radius:14px;background:${color}22;border:1px solid ${color}44;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:${color}">${fallbackChar}</div>`;
        }}
      />
    </div>
  );
}

export default function PlatformsPage() {
  const { data, isLoading } = useGetSupportedPlatforms();
  const apiPlatforms = data?.platforms ?? [];
  // Only switch to API data if server returned real results
  const useApiData = !isLoading && apiPlatforms.length > 0;

  return (
    <div className="max-w-5xl mx-auto pb-16 pt-6 px-4">

      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-4 max-w-2xl mx-auto mb-10"
      >
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/[0.05] border border-white/10 mb-2"
          style={{ boxShadow: "0 0 32px rgba(139,92,246,0.2)" }}
        >
          <Globe className="w-8 h-8 text-violet-400" />
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">
          Supported Platforms
        </h1>
        <p className="text-base text-white/40 leading-relaxed">
          VidSnap relies on industry-standard extraction tools. While we highlight the most popular sites below, we actually support over{" "}
          <span className="text-white font-semibold">1,000+ different websites</span> across the internet.
        </p>
      </motion.div>

      {/* ── HERO BANNER ────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="relative overflow-hidden rounded-2xl border border-violet-500/20 p-8 text-center mb-10"
        style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(37,99,235,0.14) 50%, rgba(124,58,237,0.10) 100%)" }}
      >
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "linear-gradient(rgba(255,255,255,0.8) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.8) 1px,transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <Sparkles className="w-8 h-8 text-violet-400" />
          <h2 className="text-2xl font-black text-white">If it plays a video, we can probably download it.</h2>
          <p className="text-white/45 max-w-lg text-sm">
            Just paste the URL on the home page and hit Analyze. VidSnap will figure out the rest automatically.
          </p>
        </div>
      </motion.div>

      {/* ── PLATFORM GRID ──────────────────────────────────────────── */}
      <div className="space-y-5">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
          <h3 className="text-lg font-bold text-white">Popular Supported Sites</h3>
          <span className="text-xs text-white/30 bg-white/[0.05] border border-white/[0.08] px-2.5 py-1 rounded-full font-medium">
            {POPULAR_PLATFORMS.length}+ highlighted
          </span>
        </div>

        {useApiData ? (
          // ── API data when server is running ──────────────────────
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {apiPlatforms.map((platform: any, i: number) => (
              <motion.div
                key={platform.domain}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="group bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-violet-500/30 rounded-2xl p-4 flex flex-col items-center text-center gap-3 cursor-default transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-violet-500/10"
              >
                <div className="w-12 h-12 flex items-center justify-center">
                  {platform.icon?.startsWith("<svg") ? (
                    <div
                      dangerouslySetInnerHTML={{ __html: platform.icon }}
                      className="w-10 h-10 [&>svg]:w-full [&>svg]:h-full group-hover:scale-110 transition-transform"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-lg font-black text-white">
                      {platform.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div className="w-full">
                  <p className="text-sm font-semibold text-white truncate">{platform.name}</p>
                  <p className="text-[10px] text-white/30 font-mono truncate">{platform.domain}</p>
                </div>
                {platform.supported && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/60 group-hover:text-emerald-400 transition-colors" />
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          // ── Always-visible hardcoded cards with real SVG logos ──
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {POPULAR_PLATFORMS.map((platform, i) => (
              <motion.div
                key={platform.domain}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, type: "spring", stiffness: 200, damping: 20 }}
                className="group cursor-default"
              >
                <div
                  className="rounded-2xl border p-4 flex flex-col items-center text-center gap-3 h-full transition-all duration-200 hover:-translate-y-1.5 hover:shadow-xl"
                  style={{
                    background: platform.bg,
                    borderColor: platform.border,
                    boxShadow: "none",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 32px ${platform.color}25`;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                  }}
                >
                  {/* Real SVG Logo */}
                  <PlatformLogo
                    logo={platform.logo}
                    name={platform.name}
                    color={platform.color}
                    fallbackChar={platform.name.charAt(0)}
                  />

                  {/* Name & domain */}
                  <div className="w-full">
                    <p className="text-sm font-bold text-white truncate">{platform.name}</p>
                    <p
                      className="text-[10px] font-mono truncate mt-0.5"
                      style={{ color: platform.color + "99" }}
                    >
                      {platform.domain}
                    </p>
                  </div>

                  {/* Note */}
                  <p className="text-[10px] text-white/35 leading-tight">{platform.note}</p>

                  {/* Supported badge */}
                  <div className="flex items-center gap-1 mt-auto">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span className="text-[9px] text-emerald-400/80 font-semibold uppercase tracking-wide">Supported</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ── MORE PLATFORMS TAG CLOUD ────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-10 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-6"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <h3 className="text-sm font-bold text-white">Also Supported</h3>
          <span className="text-xs text-white/25 ml-auto">+ many more</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {MORE_PLATFORMS.map((p, i) => (
            <motion.span
              key={p}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + i * 0.02 }}
              className="text-xs px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.07] text-white/50 hover:text-white/80 hover:border-white/20 transition-all cursor-default"
            >
              {p}
            </motion.span>
          ))}
          <span className="text-xs px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 font-semibold">
            + 1,000 more…
          </span>
        </div>
      </motion.div>

      {/* ── BOTTOM CTA ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="mt-6 text-center"
      >
        <p className="text-sm text-white/25">
          Don't see your platform?{" "}
          <a href="/help" className="text-violet-400 hover:text-violet-300 transition-colors font-medium">
            Let us know →
          </a>
        </p>
      </motion.div>

    </div>
  );
}