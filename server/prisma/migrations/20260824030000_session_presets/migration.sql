-- CreateEnum
CREATE TYPE "SessionPreset" AS ENUM ('DISCUSSION', 'GAME', 'SURVEY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "LeaderboardVisibility" AS ENUM ('HIDDEN', 'HOST_ONLY', 'EVERYONE');

-- CreateEnum
CREATE TYPE "ResultsReveal" AS ENUM ('HOST_TRIGGERED', 'AUTO_AFTER_QUESTION', 'NEVER');

-- CreateEnum
CREATE TYPE "ScoredOverride" AS ENUM ('INHERIT', 'YES', 'NO');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "autoAdvance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "leaderboardVisibility" "LeaderboardVisibility" NOT NULL DEFAULT 'EVERYONE',
ADD COLUMN     "phoneShowsQuestion" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "podiumAtEnd" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "preset" "SessionPreset" NOT NULL DEFAULT 'GAME',
ADD COLUMN     "resultsReveal" "ResultsReveal" NOT NULL DEFAULT 'HOST_TRIGGERED',
ADD COLUMN     "scoreboardBetweenQuestions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scoringEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "soundEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "streakBonusEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "scored" "ScoredOverride" NOT NULL DEFAULT 'INHERIT';

-- AlterTable
ALTER TABLE "Response" ADD COLUMN     "streak" INTEGER NOT NULL DEFAULT 0;


-- Backfill: `scoringEnabled` is now authoritative, so derive it from the legacy
-- sessionMode column rather than letting every existing session default to
-- scored. A survey that silently started grading would be a real regression.
UPDATE "Event" SET "scoringEnabled" = ("sessionMode" = 'QUIZ');

-- Existing sessions keep their current behaviour, so they are CUSTOM rather
-- than being retro-fitted into a preset whose other switches they do not match.
UPDATE "Event" SET "preset" = 'CUSTOM';
