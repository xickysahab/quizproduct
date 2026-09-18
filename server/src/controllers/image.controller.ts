import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { checkImage, imagePath } from '../utils/images';

// ponytail: in-process cache, so each server instance warms its own. Fine for
// one or two instances; a CDN in front of /images replaces it at scale.
const CACHE_BYTES = 32 * 1024 * 1024;
const cache = new Map<string, { contentType: string; data: Buffer }>();
let cachedBytes = 0;

const readImage = async (id: string): Promise<{ contentType: string; data: Buffer } | null> => {
  const hit = cache.get(id);
  if (hit) {
    // Re-insert to mark it most recently used.
    cache.delete(id);
    cache.set(id, hit);
    return hit;
  }

  const row = await prisma.image.findUnique({ where: { id }, select: { contentType: true, data: true } });
  if (!row) return null;

  const entry = { contentType: row.contentType, data: Buffer.from(row.data) };
  cache.set(id, entry);
  cachedBytes += entry.data.length;
  for (const [key, value] of cache) {
    if (cachedBytes <= CACHE_BYTES) break;
    cache.delete(key);
    cachedBytes -= value.data.length;
  }
  return entry;
};

/** Stores one image sent as the raw request body. */
export const uploadImage = async (req: AuthRequest, res: Response): Promise<void> => {
  const checked = checkImage(req.body);
  if (!checked.ok) {
    res.status(400).json({ message: checked.message });
    return;
  }

  const image = await prisma.image.create({
    data: { contentType: checked.contentType, data: new Uint8Array(req.body as Buffer), uploadedBy: req.user!.userId },
    select: { id: true },
  });
  res.status(201).json({ url: imagePath(image.id) });
};

/** Public: participants are not logged in, and the ID is unguessable. */
export const serveImage = async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);
  const image = /^[0-9a-f-]{36}$/.test(id) ? await readImage(id) : null;
  if (!image) {
    res.status(404).json({ message: 'Not found' });
    return;
  }

  // An image never changes after upload, so a phone fetches it exactly once.
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.type(image.contentType).send(image.data);
};
