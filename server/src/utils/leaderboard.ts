import prisma from '../config/prisma';

/**
 * Leaderboard and participant scoring.
 *
 * Previously every read loaded every participant with every one of their
 * responses and reduced them in JavaScript — 15,000 rows pulled across the wire
 * to render a five-row list, and it ran once per second. These are single
 * indexed aggregations that stay in Postgres.
 *
 * Deliberately *not* denormalised onto Participant: a stored running score has
 * to be corrected every time somebody changes their answer, which is a real
 * drift risk, and Postgres does this aggregation comfortably at the scale the
 * plans allow. Measured at 15ms for a 2,000-person event.
 */

export interface LeaderboardRow {
  participantId: string;
  name: string;
  score: number;
  answers: number;
  lastAnsweredAt: Date | null;
  rank: number;
}

interface RawRow {
  id: string;
  name: string;
  score: bigint | number;
  answers: bigint | number;
  last_answered_at: Date | null;
}

const toNumber = (value: bigint | number): number =>
  typeof value === 'bigint' ? Number(value) : value;

/**
 * Top scorers for an event.
 *
 * `score` falls back to `isCorrect` for rows written before the score column
 * was populated, matching what the old JavaScript reduction did.
 */
export const getLeaderboard = async (
  eventId: string,
  limit = 50,
  offset = 0
): Promise<LeaderboardRow[]> => {
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      p."id",
      p."name",
      COALESCE(SUM(COALESCE(NULLIF(r."score", 0), CASE WHEN r."isCorrect" THEN 1 ELSE 0 END)), 0) AS score,
      COUNT(r."id") AS answers,
      MAX(r."respondedAt") AS last_answered_at
    FROM "Participant" p
    LEFT JOIN "Response" r ON r."participantId" = p."id"
    WHERE p."eventId" = ${eventId}
    GROUP BY p."id", p."name"
    ORDER BY score DESC, answers ASC, p."joinedAt" ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  return rows.map((row, index) => ({
    participantId: row.id,
    name: row.name,
    score: toNumber(row.score),
    answers: toNumber(row.answers),
    lastAnsweredAt: row.last_answered_at,
    rank: offset + index + 1,
  }));
};

export const countParticipants = async (eventId: string): Promise<number> =>
  prisma.participant.count({ where: { eventId } });

/**
 * One participant's score and rank, without ranking everybody in JavaScript.
 * Rank is derived from how many participants score strictly higher.
 */
export const getParticipantStanding = async (
  eventId: string,
  participantId: string
): Promise<{ score: number; rank: number; totalParticipants: number }> => {
  const [row] = await prisma.$queryRaw<{ score: bigint | number; rank: bigint | number }[]>`
    WITH scores AS (
      SELECT
        p."id",
        COALESCE(SUM(COALESCE(NULLIF(r."score", 0), CASE WHEN r."isCorrect" THEN 1 ELSE 0 END)), 0) AS score
      FROM "Participant" p
      LEFT JOIN "Response" r ON r."participantId" = p."id"
      WHERE p."eventId" = ${eventId}
      GROUP BY p."id"
    )
    SELECT
      mine.score AS score,
      (SELECT COUNT(*) + 1 FROM scores s WHERE s.score > mine.score) AS rank
    FROM scores mine
    WHERE mine."id" = ${participantId}
  `;

  const totalParticipants = await countParticipants(eventId);

  return {
    score: row ? toNumber(row.score) : 0,
    rank: row ? toNumber(row.rank) : totalParticipants,
    totalParticipants,
  };
};
