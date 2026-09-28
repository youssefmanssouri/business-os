import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

function getDatabaseUrl(): string {
  const url = (process.env.DATABASE_URL || "").trim();

  // 1. Production or remote PostgreSQL (e.g., Neon, Supabase, RDS)
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return url;
  }

  // 2. Serverless execution environment fallback (Vercel / AWS Lambda)
  const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

  if (isServerless) {
    console.warn(
      "[Database] Running in serverless environment with local SQLite fallback. " +
      "For persistent multi-tenant data and reliable authentication across serverless instances, " +
      "configure a PostgreSQL DATABASE_URL (e.g., Neon / Supabase) in your environment settings."
    );

    const tmpDbPath = path.join("/tmp", "dev.db");
    const sourceDbPath = path.join(process.cwd(), "prisma", "dev.db");

    // Seed /tmp/dev.db from bundled prisma/dev.db if it doesn't exist
    if (!fs.existsSync(tmpDbPath) && fs.existsSync(sourceDbPath)) {
      try {
        fs.copyFileSync(sourceDbPath, tmpDbPath);
      } catch (err) {
        console.error("Failed to copy dev.db to /tmp:", err);
      }
    }

    if (fs.existsSync(tmpDbPath)) {
      return `file:${tmpDbPath}`;
    }
  }

  // 3. Local development SQLite with absolute path
  return `file:${path.resolve(process.cwd(), "prisma", "dev.db")}`;
}

const dbUrl = getDatabaseUrl();
process.env.DATABASE_URL = dbUrl;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: dbUrl,
      },
    },
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

globalForPrisma.prisma = db;

