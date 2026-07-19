import { useGetSupportedPlatforms } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { CheckCircle2, Globe, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function PlatformsPage() {
  const { data, isLoading } = useGetSupportedPlatforms();

  const platforms = data?.platforms || [];

  return (
    <div className="max-w-5xl mx-auto space-y-12 pb-16 pt-6">
      {/* Header */}
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 border border-white/10 mb-2">
          <Globe className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">
          Supported Platforms
        </h1>
        <p className="text-lg text-muted-foreground">
          VidSnap relies on industry-standard extraction tools. While we highlight the most popular sites below, we actually support over <span className="text-white font-medium">1,000+ different websites</span> across the internet.
        </p>
      </div>

      {/* Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 border border-white/10 p-8 text-center group">
        <div className="absolute inset-0 bg-white/5 shimmer mix-blend-overlay opacity-50" />
        <div className="relative z-10 flex flex-col items-center justify-center space-y-4">
          <Sparkles className="w-8 h-8 text-white group-hover:scale-110 transition-transform" />
          <h2 className="text-2xl font-bold text-white">If it plays a video, we can probably download it.</h2>
          <p className="text-primary-foreground/80 max-w-lg">
            Just paste the URL on the home page and hit Analyze. VidSnap will figure out the rest automatically.
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="space-y-6">
        <h3 className="text-xl font-bold border-b border-white/10 pb-4">Popular Supported Sites</h3>
        
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {platforms.map((platform, i) => (
              <motion.div
                key={platform.domain}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="bg-card/40 border-white/5 hover:bg-white/5 hover:border-white/20 transition-all group overflow-hidden">
                  <CardContent className="p-6 flex flex-col items-center justify-center text-center space-y-4 h-full relative">
                    {platform.supported && (
                      <div className="absolute top-2 right-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                      </div>
                    )}
                    
                    {/* Render raw SVG icon or fallback to first letter */}
                    <div className="w-12 h-12 flex items-center justify-center text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300">
                      {platform.icon && platform.icon.startsWith('<svg') ? (
                        <div dangerouslySetInnerHTML={{ __html: platform.icon }} className="w-full h-full [&>svg]:w-full [&>svg]:h-full fill-current" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-xl font-bold">
                          {platform.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-1 w-full">
                      <h4 className="font-semibold text-sm text-white truncate px-2">{platform.name}</h4>
                      <p className="text-[10px] text-muted-foreground font-mono truncate px-2">{platform.domain}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}