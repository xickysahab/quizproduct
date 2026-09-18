import prisma from '../config/prisma';
import type { LeaderboardRow } from './leaderboard';

/**
 * Team quizzes. A team is ranked by its members' average score, not their
 * total, so a team of eight does not beat a team of four on headcount alone.
 * Everyone who joined counts toward the average, answered or not.
 */

export const MAX_TEAMS = 12;
const MAX_TEAM_NAME = 30;

export interface TeamStanding {
  teamId: string;
  name: string;
  members: number;
  average: number;
  rank: number;
}

export const cleanTeamNames = (names: unknown): { ok: true; names: string[] } | { ok: false; message: string } => {
  if (!Array.isArray(names)) return { ok: false, message: 'Send a list of team names.' };
  const cleaned = names.map((n) => String(n ?? '').trim().slice(0, MAX_TEAM_NAME)).filter(Boolean);
  if (cleaned.length === 1) return { ok: false, message: 'A team quiz needs at least two teams.' };
  if (cleaned.length > MAX_TEAMS) return { ok: false, message: `At most ${MAX_TEAMS} teams.` };
  if (new Set(cleaned.map((n) => n.toLowerCase())).size !== cleaned.length) {
    return { ok: false, message: 'Two teams have the same name.' };
  }
  return { ok: true, names: cleaned };
};

export const getTeamStandings = async (eventId: string): Promise<TeamStanding[]> => {
  const rows = await prisma.$queryRaw<{ id: string; name: string; members: bigint; average: number | string | null }[]>`
    WITH scores AS (
      SELECT p."id", p."teamId",
        COALESCE(SUM(COALESCE(NULLIF(r."score", 0), CASE WHEN r."isCorrect" THEN 1 ELSE 0 END)), 0) AS score
      FROM "Participant" p
      LEFT JOIN "Response" r ON r."participantId" = p."id"
      WHERE p."eventId" = ${eventId}
      GROUP BY p."id"
    )
    SELECT t."id", t."name", COUNT(s."id") AS members, AVG(s.score)::float AS average
    FROM "Team" t
    LEFT JOIN scores s ON s."teamId" = t."id"
    WHERE t."eventId" = ${eventId}
    GROUP BY t."id"
    ORDER BY COALESCE(AVG(s.score), 0) DESC, t."name" ASC
  `;

  // Equal averages share a place (1, 2, 2, 4) — a tie shown as 2nd and 3rd
  // would be decided by nothing but the alphabet.
  const standings: TeamStanding[] = [];
  rows.forEach((row, index) => {
    // One decimal: an average of 2.333… reads as 2.3 on a projector.
    const average = Math.round(Number(row.average ?? 0) * 10) / 10;
    const previous = standings[index - 1];
    standings.push({
      teamId: row.id,
      name: row.name,
      members: Number(row.members),
      average,
      rank: previous && previous.average === average ? previous.rank : index + 1,
    });
  });
  return standings;
};

/** Team standings in the shape the podium already draws. */
export const teamPodiumRows = (standings: TeamStanding[]): LeaderboardRow[] =>
  standings.map((t) => ({
    participantId: t.teamId,
    name: t.name,
    score: t.average,
    answers: t.members,
    lastAnsweredAt: null,
    rank: t.rank,
  }));

/**
 * The team a joining participant goes into: the one they picked, if it is a
 * team of this event, otherwise whichever currently has the fewest members.
 *
 * ponytail: count-then-assign, so a burst of simultaneous joins can land a
 * team one or two over. Fine for a quiz; lock per event if it ever matters.
 */
export const teamForJoin = async (eventId: string, requested: unknown): Promise<{ id: string; name: string } | null> => {
  const teams = await prisma.team.findMany({
    where: { eventId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, _count: { select: { participants: true } } },
  });
  if (teams.length === 0) return null;

  const chosen =
    teams.find((t) => t.id === requested) ??
    teams.reduce((smallest, t) => (t._count.participants < smallest._count.participants ? t : smallest));
  return { id: chosen.id, name: chosen.name };
};
