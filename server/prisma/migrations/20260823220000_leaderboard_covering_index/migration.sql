-- Covering index for the leaderboard aggregation.
--
-- The leaderboard groups every response for an event's participants. Without
-- this, Postgres scans the Response heap: measured at 72ms for a 2,000-person
-- event with 60,000 responses. With it the aggregate runs index-only and the
-- same query takes 15ms — and the win grows with event size, which is exactly
-- where the old load-everything-into-JavaScript approach fell over.
--
-- CONCURRENTLY so building it does not lock writes on a live table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Response_participantId_covering_idx"
  ON "Response" ("participantId")
  INCLUDE ("score", "isCorrect", "respondedAt");
