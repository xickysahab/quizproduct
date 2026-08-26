import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    /**
     * Migrations connect directly; the running server connects through the pooler.
     *
     * `prisma migrate` takes a session-level advisory lock before it applies
     * anything, so that two instances booting at once cannot run the same
     * migration twice. A transaction-mode pooler (Neon's `-pooler` host, and
     * PgBouncer generally) hands each statement whichever backend session is
     * free, so the lock is taken on one session and looked for on another —
     * and `migrate deploy` dies with P1002 after a ten second wait.
     *
     * It fails intermittently rather than always, which is worse: the deploy
     * that happens to win the race looks fine, and the one that does not takes
     * the release down with `Exited with status 1`.
     *
     * DIRECT_URL is the same Neon connection string with `-pooler` removed from
     * the host. Falls back to DATABASE_URL so a local Postgres, which has no
     * pooler in front of it, needs no second variable.
     */
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});
