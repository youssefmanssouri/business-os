/**
 * Synchronizes Prisma schema datasource provider with DATABASE_URL protocol.
 * Enables zero-config PostgreSQL in production (e.g., Neon / Supabase)
 * while preserving local zero-config SQLite development.
 */
const fs = require("fs");
const path = require("path");

function syncDatabaseProvider() {
  const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");
  if (!fs.existsSync(schemaPath)) {
    console.warn("[sync-provider] prisma/schema.prisma not found. Skipping.");
    return;
  }

  let content = fs.readFileSync(schemaPath, "utf8");

  // Determine target provider from DATABASE_URL
  const databaseUrl = (process.env.DATABASE_URL || "").trim();
  const isPostgres =
    databaseUrl.startsWith("postgres://") ||
    databaseUrl.startsWith("postgresql://");

  const targetProvider = isPostgres ? "postgresql" : "sqlite";

  // Match provider inside `datasource db { ... provider = "..." ... }`
  const datasourceRegex = /(datasource\s+db\s*\{[\s\S]*?provider\s*=\s*")([^"]+)("[\s\S]*?\})/;
  const match = content.match(datasourceRegex);

  if (!match) {
    console.warn("[sync-provider] Could not parse datasource db in schema.prisma. Skipping.");
    return;
  }

  const currentProvider = match[2];

  if (currentProvider !== targetProvider) {
    const updated = content.replace(datasourceRegex, `$1${targetProvider}$3`);
    fs.writeFileSync(schemaPath, updated, "utf8");
    console.log(
      `[sync-provider] Updated datasource provider in schema.prisma: '${currentProvider}' -> '${targetProvider}' (DATABASE_URL protocol: ${
        isPostgres ? "PostgreSQL" : "SQLite"
      })`
    );
  } else {
    console.log(
      `[sync-provider] Datasource provider is already '${targetProvider}' for schema.prisma.`
    );
  }
}

syncDatabaseProvider();
