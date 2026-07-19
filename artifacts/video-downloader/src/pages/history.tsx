import { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { 
  useGetDownloadHistory, 
  useGetJobStatus,
  DownloadJob, 
  DownloadJobStatus,
  DownloadInputOutputFormat,
  useStartDownload,
  getDownloadFileUrl
} from "@workspace/api-client-react";
import { 
  Download, 
  FileVideo, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  RotateCw,
  RefreshCw,
  MoreVertical,
  Scissors,
  HardDriveDownload,
  Loader2,
  History
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Job Card component handles its own polling if active
function JobCard({ initialJob }: { initialJob: DownloadJob }) {
  const [job, setJob] = useState<DownloadJob>(initialJob);
  const startDownload = useStartDownload();
  
  const isComplete = job.status === "done" || job.status === "error";
  
  // Only poll if not complete
  const { data: polledJob } = useGetJobStatus(job.id, { 
    query: { 
      enabled: !isComplete, 
      refetchInterval: isComplete ? undefined : 2000,
      queryKey: ["jobStatus", job.id],
    } 
  });

  useEffect(() => {
    if (polledJob) {
      setJob(polledJob);
    }
  }, [polledJob]);

  // If the job gets replaced via "Retry", we sync with the new initialJob
  useEffect(() => {
    if (initialJob.id !== job.id) {
      setJob(initialJob);
    }
  }, [initialJob]);

  const handleRetry = () => {
    startDownload.mutate(
      { 
        data: { 
          url: job.url, 
          outputFormat: job.outputFormat as DownloadInputOutputFormat,
          quality: job.quality || undefined
        } 
      },
      {
        onSuccess: (newJob) => {
          setJob(newJob);
        }
      }
    );
  };

  const getStatusColor = (status: DownloadJobStatus) => {
    switch(status) {
      case "done": return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
      case "error": return "text-destructive bg-destructive/10 border-destructive/20";
      case "downloading": 
      case "processing": return "text-primary bg-primary/10 border-primary/20";
      case "pending": return "text-amber-500 bg-amber-500/10 border-amber-500/20";
      default: return "text-muted-foreground bg-muted";
    }
  };

  const getStatusIcon = (status: DownloadJobStatus) => {
    switch(status) {
      case "done": return <CheckCircle2 className="w-4 h-4" />;
      case "error": return <AlertCircle className="w-4 h-4" />;
      case "downloading": return <RotateCw className="w-4 h-4 animate-spin" />;
      case "processing": return <Loader2 className="w-4 h-4 animate-spin" />;
      case "pending": return <Clock className="w-4 h-4" />;
      default: return null;
    }
  };

  const formatSize = (bytes: number | null | undefined) => {
    if (!bytes) return "Unknown";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1000) return (mb / 1024).toFixed(2) + " GB";
    return mb.toFixed(1) + " MB";
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="bg-card/50 backdrop-blur-sm border-white/5 hover:border-white/10 transition-colors overflow-hidden group">
        {job.status === "downloading" || job.status === "processing" ? (
          <div className="h-1 w-full bg-white/5 relative">
            <motion.div 
              className="absolute top-0 left-0 h-full bg-gradient-electric"
              initial={{ width: 0 }}
              animate={{ width: `${job.progress}%` }}
              transition={{ ease: "linear" }}
            />
            <div className="absolute inset-0 bg-white/20 shimmer mix-blend-overlay" />
          </div>
        ) : null}
        
        <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row gap-4 sm:gap-6 items-start sm:items-center">
          {/* Thumbnail */}
          <div className="w-full sm:w-40 aspect-video rounded-lg overflow-hidden bg-white/5 border border-white/10 shrink-0 relative">
            {job.thumbnail ? (
              <img src={job.thumbnail} alt="Thumbnail" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <FileVideo className="w-8 h-8 text-muted-foreground/50" />
              </div>
            )}
            {job.platform && (
              <div className="absolute top-2 left-2">
                <Badge className="bg-black/60 backdrop-blur text-xs font-medium border-0 scale-90 origin-top-left">
                  {job.platform}
                </Badge>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0 space-y-2 w-full">
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-semibold text-base line-clamp-1 text-white" title={job.title || job.url}>
                {job.title || job.url}
              </h3>
              <Badge variant="outline" className={cn("shrink-0 uppercase font-mono text-[10px]", getStatusColor(job.status))}>
                <span className="flex items-center gap-1.5">
                  {getStatusIcon(job.status)}
                  {job.status}
                </span>
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
              <span className="font-mono uppercase px-2 py-0.5 rounded bg-white/5 text-white/70">
                {job.quality || 'BEST'} • {job.outputFormat}
              </span>
              {job.filesize && <span>{formatSize(job.filesize)}</span>}
              <span className="flex items-center gap-1" title={new Date(job.createdAt).toLocaleString()}>
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
              </span>
            </div>

            {/* Error Message */}
            {job.status === "error" && job.errorMessage && (
              <p className="text-xs text-destructive/80 mt-2 bg-destructive/10 p-2 rounded-md">
                {job.errorMessage}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-t-0 border-white/5">
            {job.status === "done" && job.filename && (
              <Button asChild size="sm" className="w-full sm:w-auto bg-primary/20 text-primary hover:bg-primary/30 border-0">
                <a href={getDownloadFileUrl(job.filename)} download>
                  <HardDriveDownload className="w-4 h-4 mr-2" />
                  Save File
                </a>
              </Button>
            )}

            {job.status === "error" && (
              <Button onClick={handleRetry} size="sm" variant="outline" className="w-full sm:w-auto border-white/10 hover:bg-white/5">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0 border-white/5 hover:bg-white/5">
                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-popover/95 backdrop-blur border-white/10">
                <DropdownMenuItem onClick={() => navigator.clipboard.writeText(job.url)}>
                  Copy Original URL
                </DropdownMenuItem>
                {job.status === "done" && (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href={`/editor?jobId=${job.id}`} className="cursor-pointer flex w-full">
                        <Scissors className="w-4 h-4 mr-2" /> Send to Editor
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator className="bg-white/5" />
                <DropdownMenuItem className="text-destructive focus:bg-destructive/10 cursor-pointer">
                  Delete Record
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function HistoryPage() {
  const { data: history, isLoading, refetch, isRefetching } = useGetDownloadHistory({
    query: {
      queryKey: ["downloadHistory"],
      // Only poll when there are active/pending jobs — avoids constant 5s hammering when idle
      refetchInterval: (query) => {
        const jobs = (query.state.data as DownloadJob[] | undefined) ?? [];
        const hasActive = jobs.some(j => j.status === "downloading" || j.status === "pending" || j.status === "processing");
        return hasActive ? 3000 : false;
      },
    }
  });

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12 pt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Downloads</h1>
          <p className="text-muted-foreground mt-1">Your recent and active download jobs.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()} 
            disabled={isRefetching}
            className="border-white/10 hover:bg-white/5"
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", isRefetching && "animate-spin")} />
            Refresh
          </Button>
          <Button asChild size="sm" className="bg-white/10 hover:bg-white/20 text-white border-0">
            <Link href="/">
              <Download className="w-4 h-4 mr-2" />
              New Download
            </Link>
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p>Loading history...</p>
          </div>
        ) : !history || history.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center space-y-4 bg-card/30 rounded-xl border border-white/5 border-dashed"
          >
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2">
              <History className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-white">No downloads yet</h3>
            <p className="text-muted-foreground max-w-sm">
              Your downloaded videos will appear here. Start by grabbing a link from your favorite platform.
            </p>
            <Button asChild className="bg-gradient-electric hover:shadow-electric text-white border-0 mt-4">
              <Link href="/">Go to Downloader</Link>
            </Button>
          </motion.div>
        ) : (
          <AnimatePresence mode="popLayout">
            {history.map((job) => (
              <JobCard key={job.id} initialJob={job} />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}