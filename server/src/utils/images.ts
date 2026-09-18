/**
 * Uploaded images, stored in Postgres.
 *
 * The browser shrinks a photo to WebP before sending it, so the cap below is
 * the server's backstop, not the everyday size. An image never changes after
 * upload, which is what lets it be cached forever and kept in memory: when a
 * question goes live, every phone in the room asks for it in the same second.
 */

export const MAX_IMAGE_BYTES = 500 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * The type the bytes actually are, whatever the request claimed. The response
 * is served with this type, so a script dressed up as a PNG must not pass.
 */
export const sniffImageType = (data: Buffer): string | null => {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 12 && data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
};

export const checkImage = (data: unknown): { ok: true; contentType: string } | { ok: false; message: string } => {
  if (!Buffer.isBuffer(data) || data.length === 0) {
    return { ok: false, message: 'Send a PNG, JPEG or WebP image.' };
  }
  if (data.length > MAX_IMAGE_BYTES) {
    return { ok: false, message: `Images must be ${MAX_IMAGE_BYTES / 1024} KB or smaller.` };
  }
  const contentType = sniffImageType(data);
  return contentType ? { ok: true, contentType } : { ok: false, message: 'Use a PNG, JPEG or WebP image.' };
};

const PATH = /^\/images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * True only for an image uploaded here. A hotlinked URL would let its host log
 * the IP of every participant whose phone renders it.
 */
export const isOwnImage = (url: string): boolean => PATH.test(url);

export const imagePath = (id: string): string => `/images/${id}`;
