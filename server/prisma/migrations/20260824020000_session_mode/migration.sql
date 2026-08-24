-- CreateEnum
CREATE TYPE "SessionMode" AS ENUM ('QUIZ', 'SURVEY');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN "sessionMode" "SessionMode" NOT NULL DEFAULT 'QUIZ';
