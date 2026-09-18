import api from '../services/api';

/** The server's cap. Photos are shrunk well below it before upload. */
const MAX_BYTES = 500 * 1024;
/** A phone photo can be large; it is re-encoded here, so only refuse the absurd. */
const MAX_INPUT_BYTES = 20 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Re-encodes to WebP no larger than `maxSide` pixels. Safari cannot encode
 * WebP and quietly returns PNG, so its output falls back to JPEG for photos —
 * and to PNG for logos, which usually need their transparency.
 */
const shrink = async (file: File, maxSide: number, keepAlpha: boolean): Promise<Blob> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.82, 0.65, 0.5]) {
    let blob = await toBlob(canvas, 'image/webp', quality);
    if (blob?.type !== 'image/webp') blob = await toBlob(canvas, keepAlpha ? 'image/png' : 'image/jpeg', quality);
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error('That image is too detailed to fit in 500 KB. Try a smaller or simpler one.');
};

/** Uploads an image and returns its `/images/<id>` path. */
export const uploadImage = async (file: File, kind: 'question' | 'logo'): Promise<string> => {
  if (!TYPES.includes(file.type)) throw new Error('Use a PNG, JPEG or WebP image.');
  if (file.size > MAX_INPUT_BYTES) throw new Error('That file is over 20 MB. Choose a smaller image.');

  const blob = await shrink(file, kind === 'logo' ? 512 : 1600, kind === 'logo');
  try {
    const res = await api.post('/images', blob, { headers: { 'Content-Type': blob.type } });
    return res.data.url;
  } catch (error) {
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    throw new Error(message || 'The upload failed. Try again.');
  }
};

/** Uploaded images live on the API server; older logos may be full URLs. */
export const imageSrc = (url: string): string =>
  url.startsWith('/images/') ? `${api.defaults.baseURL}${url}` : url;
