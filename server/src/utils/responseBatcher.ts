import prisma from '../config/prisma';
import crypto from 'crypto';
import { getQueueRedis } from '../config/redis';
import { slog } from './slog';

interface PendingResponse {
  questionId: string;
  participantId: string;
  selectedOption: number;
  selectedOptions?: number[];
  rankedOptions?: number[];
  answerText?: string | null;
  isCorrect: boolean;
  score?: number;
}

const COLUMNS_PER_ROW = 9;
const MAX_ROWS_PER_STATEMENT = Math.floor(60000 / COLUMNS_PER_ROW);
const MAX_FLUSH_ATTEMPTS = 3;
const REDIS_HASH_KEY = 'quiz:pending-responses';

const keyFor = (response: PendingResponse) => `${response.questionId}_${response.participantId}`;

class ResponseBatcher {
  private queue = new Map<string, PendingResponse>();
  private flushIntervalMs = 2000;
  private timer: NodeJS.Timeout | null = null;
  private isFlushing = false;
  private failedAttempts = 0;

  constructor() {
    this.start();
  }

  public async addResponse(response: PendingResponse) {
    const redis = getQueueRedis();
    const key = keyFor(response);

    if (redis) {
      try {
        await redis.hset(REDIS_HASH_KEY, key, JSON.stringify(response));
        return;
      } catch (error) {
        slog('warn', 'queue.redis.write_failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.queue.set(key, response);
  }

  public get pendingCount(): number {
    return this.queue.size;
  }

  private start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
    this.timer.unref?.();
  }

  public async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    for (let i = 0; i < 20 && this.isFlushing; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    await this.flush();
  }

  /** Force a write before reading tallies (session end / reveal). */
  public async flushNow(): Promise<void> {
    await this.flush();
  }

  /**
   * Removes and returns everything held in the local queue. Draining rather
   * than copying matters: entries that landed here while Redis was unreachable
   * would otherwise be re-flushed on every tick for the life of the process.
   */
  private drainLocal(): PendingResponse[] {
    const entries = Array.from(this.queue.values());
    this.queue.clear();
    return entries;
  }

  private async takeEntries(): Promise<PendingResponse[]> {
    const redis = getQueueRedis();

    if (redis) {
      try {
        const keys = await redis.hkeys(REDIS_HASH_KEY);
        // An empty hash does not mean there is nothing to write — the local
        // queue still holds anything buffered during a Redis outage.
        if (keys.length === 0) return this.drainLocal();

        const raw = await redis.hmget(REDIS_HASH_KEY, ...keys);
        await redis.hdel(REDIS_HASH_KEY, ...keys);

        const fromRedis = raw
          .filter((value): value is string => Boolean(value))
          .map((value) => JSON.parse(value) as PendingResponse);

        // Redis is the source of truth for a key it holds, so it wins over a
        // local entry for the same question/participant pair.
        const merged = new Map(this.drainLocal().map((entry) => [keyFor(entry), entry]));
        fromRedis.forEach((entry) => merged.set(keyFor(entry), entry));
        return Array.from(merged.values());
      } catch (error) {
        slog('warn', 'queue.redis.read_failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return this.drainLocal();
  }

  private restore(entries: PendingResponse[]) {
    for (const entry of entries) {
      const key = keyFor(entry);
      if (!this.queue.has(key)) this.queue.set(key, entry);
    }
  }

  private async flush() {
    if (this.isFlushing) return;
    this.isFlushing = true;

    const entries = await this.takeEntries();
    if (entries.length === 0) {
      this.isFlushing = false;
      return;
    }

    try {
      for (let start = 0; start < entries.length; start += MAX_ROWS_PER_STATEMENT) {
        await this.writeChunk(entries.slice(start, start + MAX_ROWS_PER_STATEMENT));
      }

      this.failedAttempts = 0;
      slog('info', 'queue.flushed', { count: entries.length });
    } catch (error) {
      this.failedAttempts += 1;
      slog('error', 'queue.flush_failed', {
        attempt: this.failedAttempts,
        error: error instanceof Error ? error.message : String(error),
      });

      if (this.failedAttempts < MAX_FLUSH_ATTEMPTS) {
        this.restore(entries);
      } else {
        this.failedAttempts = 0;
        slog('error', 'queue.dropped', { count: entries.length });
      }
    } finally {
      this.isFlushing = false;
    }
  }

  private async writeChunk(entries: PendingResponse[]): Promise<void> {
    const placeholders = entries
      .map(
        (_, i) =>
          `($${i * COLUMNS_PER_ROW + 1}, $${i * COLUMNS_PER_ROW + 2}, $${i * COLUMNS_PER_ROW + 3}, $${
            i * COLUMNS_PER_ROW + 4
          }, $${i * COLUMNS_PER_ROW + 5}, $${i * COLUMNS_PER_ROW + 6}::int[], $${i * COLUMNS_PER_ROW + 7}, $${
            i * COLUMNS_PER_ROW + 8
          }, $${i * COLUMNS_PER_ROW + 9}::int[])`
      )
      .join(',');

    const params = entries.flatMap((e) => [
      crypto.randomUUID(),
      e.questionId,
      e.participantId,
      e.selectedOption,
      e.isCorrect,
      `{${(e.selectedOptions ?? []).map((n) => Number(n) || 0).join(',')}}`,
      e.answerText ?? null,
      e.score ?? (e.isCorrect ? 1 : 0),
      `{${(e.rankedOptions ?? []).map((n) => Number(n) || 0).join(',')}}`,
    ]);

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "Response" ("id", "questionId", "participantId", "selectedOption", "isCorrect", "selectedOptions", "answerText", "score", "rankedOptions")
      VALUES ${placeholders}
      ON CONFLICT ("questionId", "participantId")
      DO UPDATE SET
        "selectedOption" = EXCLUDED."selectedOption",
        "isCorrect" = EXCLUDED."isCorrect",
        "selectedOptions" = EXCLUDED."selectedOptions",
        "answerText" = EXCLUDED."answerText",
        "score" = EXCLUDED."score",
        "rankedOptions" = EXCLUDED."rankedOptions",
        "respondedAt" = CURRENT_TIMESTAMP
    `,
      ...params
    );
  }
}

export const responseBatcher = new ResponseBatcher();
