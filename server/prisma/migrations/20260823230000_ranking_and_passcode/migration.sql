-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'RANKING';

-- NOTE: `prisma migrate diff` wanted to drop "Response_participantId_covering_idx"
-- here. That drop has been removed deliberately. The index is created in raw SQL
-- by migration 20260823220000_leaderboard_covering_index because Prisma cannot
-- express INCLUDE columns, so every future diff will try to remove it again.
-- Dropping it silently takes the leaderboard from 15ms back to 72ms at 2,000
-- participants. Always strip that DROP INDEX line when regenerating a migration.

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "passcodeHash" TEXT;

-- AlterTable
ALTER TABLE "Response" ADD COLUMN     "rankedOptions" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

