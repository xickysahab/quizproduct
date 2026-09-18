import { describe, expect, it } from 'vitest';
import { checkImage, isOwnImage, sniffImageType } from '../utils/images';

const id = '123e4567-e89b-12d3-a456-426614174000';

describe('sniffImageType', () => {
  it('reads the type from the bytes, not the label', () => {
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))).toBe('image/webp');
    expect(sniffImageType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
  });
});

describe('checkImage', () => {
  it('refuses anything over 500 KB', () => {
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(500 * 1024)]);
    expect(checkImage(big)).toEqual({ ok: false, message: expect.stringContaining('500 KB') });
  });
});

describe('isOwnImage', () => {
  it('accepts only an uploaded image path', () => {
    expect(isOwnImage(`/images/${id}`)).toBe(true);
    expect(isOwnImage(`https://tracker.example.com/images/${id}`)).toBe(false);
    expect(isOwnImage(`/images/${id}?x=1`)).toBe(false);
    expect(isOwnImage('/images/../auth/me')).toBe(false);
  });
});
