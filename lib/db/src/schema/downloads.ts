import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const downloadJobsTable = pgTable("download_jobs", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  title: text("title"),
  thumbnail: text("thumbnail"),
  platform: text("platform"),
  outputFormat: text("output_format").notNull(),
  quality: text("quality"),
  status: text("status").notNull().default("pending"),
  progress: integer("progress").notNull().default(0),
  filename: text("filename"),
  filesize: integer("filesize"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDownloadJobSchema = createInsertSchema(downloadJobsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertDownloadJob = z.infer<typeof insertDownloadJobSchema>;
export type DownloadJob = typeof downloadJobsTable.$inferSelect;
