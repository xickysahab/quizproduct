import prisma from '../config/prisma';
import crypto from 'crypto';

interface PendingResponse {
  questionId: string;
  participantId: string;
  selectedOption: number;
  isCorrect: boolean;
}

class ResponseBatcher {
  private queue = new Map<string, PendingResponse>();
  private flushIntervalMs = 2000;
  private timer: NodeJS.Timeout | null = null;
  private isFlushing = false;

  constructor() {
    this.start();
  }

  public addResponse(response: PendingResponse) {
    const key = `${response.questionId}_${response.participantId}`;
    this.queue.set(key, response);
  }

  private start() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.flush(), this.flushIntervalMs);
  }

  private async flush() {
    if (this.queue.size === 0 || this.isFlushing) return;
    this.isFlushing = true;

    // Snapshot the current queue and clear it to accept new responses
    const entries = Array.from(this.queue.values());
    this.queue.clear();

    try {
      // For PostgreSQL, we use raw SQL to perform a bulk upsert.
      // This is much faster than running hundreds of individual upserts.
      
      const values = entries.map(e => {
        const id = crypto.randomUUID();
        return `('${id}', '${e.questionId}', '${e.participantId}', ${e.selectedOption}, ${e.isCorrect})`;
      }).join(',');

      await prisma.$executeRawUnsafe(`
        INSERT INTO "Response" ("id", "questionId", "participantId", "selectedOption", "isCorrect")
        VALUES ${values}
        ON CONFLICT ("questionId", "participantId")
        DO UPDATE SET 
          "selectedOption" = EXCLUDED."selectedOption", 
          "isCorrect" = EXCLUDED."isCorrect",
          "respondedAt" = CURRENT_TIMESTAMP
      `);
      
      console.log(`🚀 Flushed ${entries.length} batched responses to database.`);
    } catch (error) {
      console.error('Error flushing response batch:', error);
      // In a more robust system, we would re-queue failed entries or dead-letter them.
    } finally {
      this.isFlushing = false;
    }
  }
}

export const responseBatcher = new ResponseBatcher();
