import type { DownloadJob } from "@workspace/db";

type NewDownloadJob = {
  id: string;
  url: string;
  title?: string | null;
  thumbnail?: string | null;
  platform?: string | null;
  outputFormat: string;
  quality?: string | null;
  status?: string;
  progress?: number;
  filename?: string | null;
  filesize?: number | null;
  errorMessage?: string | null;
};

type DownloadJobUpdate = Partial<
  Pick<
    DownloadJob,
    | "title"
    | "thumbnail"
    | "platform"
    | "outputFormat"
    | "quality"
    | "status"
    | "progress"
    | "filename"
    | "filesize"
    | "errorMessage"
    | "updatedAt"
  >
>;

const memoryJobs = new Map<string, DownloadJob>();

function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

async function getDbDeps() {
  const [{ db, downloadJobsTable }, { eq, desc }] = await Promise.all([
    import("@workspace/db"),
    import("drizzle-orm"),
  ]);

  return { db, downloadJobsTable, eq, desc };
}

function normalizeJob(input: NewDownloadJob): DownloadJob {
  const now = new Date();

  return {
    id: input.id,
    url: input.url,
    title: input.title ?? null,
    thumbnail: input.thumbnail ?? null,
    platform: input.platform ?? null,
    outputFormat: input.outputFormat,
    quality: input.quality ?? null,
    status: input.status ?? "pending",
    progress: input.progress ?? 0,
    filename: input.filename ?? null,
    filesize: input.filesize ?? null,
    errorMessage: input.errorMessage ?? null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function createDownloadJob(input: NewDownloadJob): Promise<DownloadJob> {
  if (hasDatabase()) {
    const { db, downloadJobsTable, eq } = await getDbDeps();

    await db.insert(downloadJobsTable).values(input);

    const job = await db
      .select()
      .from(downloadJobsTable)
      .where(eq(downloadJobsTable.id, input.id))
      .then((rows: DownloadJob[]) => rows[0]);

    if (!job) {
      throw new Error(`Download job was not created: ${input.id}`);
    }

    return job;
  }

  const job = normalizeJob(input);
  memoryJobs.set(job.id, job);
  return job;
}

export async function getDownloadJob(id: string): Promise<DownloadJob | null> {
  if (hasDatabase()) {
    const { db, downloadJobsTable, eq } = await getDbDeps();

    return db
      .select()
      .from(downloadJobsTable)
      .where(eq(downloadJobsTable.id, id))
      .then((rows: DownloadJob[]) => rows[0] ?? null);
  }

  return memoryJobs.get(id) ?? null;
}

export async function listDownloadJobs(limit = 50): Promise<DownloadJob[]> {
  if (hasDatabase()) {
    const { db, downloadJobsTable, desc } = await getDbDeps();

    return db
      .select()
      .from(downloadJobsTable)
      .orderBy(desc(downloadJobsTable.createdAt))
      .limit(limit);
  }

  return Array.from(memoryJobs.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit);
}

export async function updateDownloadJob(
  id: string,
  updates: DownloadJobUpdate,
): Promise<void> {
  const nextUpdates = { ...updates, updatedAt: updates.updatedAt ?? new Date() };

  if (hasDatabase()) {
    const { db, downloadJobsTable, eq } = await getDbDeps();

    await db
      .update(downloadJobsTable)
      .set(nextUpdates)
      .where(eq(downloadJobsTable.id, id));
    return;
  }

  const job = memoryJobs.get(id);
  if (!job) return;

  memoryJobs.set(id, {
    ...job,
    ...nextUpdates,
  });
}
