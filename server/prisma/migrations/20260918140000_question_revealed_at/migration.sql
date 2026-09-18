-- When a question's results were shown to the room. Answers close at that
-- moment. Nullable and left NULL for existing rows: a question revealed before
-- this column existed has no timestamp to backfill, and guessing one would
-- close answers on sessions that are already over.
ALTER TABLE "Question" ADD COLUMN "revealedAt" TIMESTAMP(3);
