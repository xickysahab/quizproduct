import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import { env } from './env';
import { slog } from '../utils/slog';

let publisher: Redis | null = null;
let subscriber: Redis | null = null;

const disconnectClients = () => {
  publisher?.disconnect();
  subscriber?.disconnect();
  publisher = null;
  subscriber = null;
};

/**
 * Socket.IO keeps room membership in the memory of the process that owns the
 * connection. Without a shared adapter a host on instance A cannot reach
 * participants on instance B, which caps the whole app at one server.
 *
 * Redis is optional: if it is not configured, or is unreachable, the server
 * keeps running in single-instance mode rather than refusing to boot.
 */
export const attachSocketAdapter = async (io: Server): Promise<void> => {
  if (!env.redisUrl) return;

  try {
    publisher = new Redis(env.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 3 });
    subscriber = publisher.duplicate();

    await Promise.all([publisher.connect(), subscriber.connect()]);

    io.adapter(createAdapter(publisher, subscriber));
    slog('info', 'redis.adapter.attached');

    publisher.on('error', (error) => slog('error', 'redis.publisher.error', { error: error.message }));
    subscriber.on('error', (error) => slog('error', 'redis.subscriber.error', { error: error.message }));
  } catch (error) {
    slog('error', 'redis.unavailable', {
      error: error instanceof Error ? error.message : String(error),
    });
    disconnectClients();
  }
};

/** Shared Redis used for the durable answer queue. Null when running in-memory. */
export const getQueueRedis = (): Redis | null => publisher;

export const closeRedis = async (): Promise<void> => {
  if (!publisher && !subscriber) return;

  try {
    await Promise.all([publisher?.quit(), subscriber?.quit()]);
  } catch {
    disconnectClients();
  } finally {
    publisher = null;
    subscriber = null;
  }
};
