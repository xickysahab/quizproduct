export interface RoomBranding {
  name?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

const STORAGE_KEY = 'roomBranding';

export const readRoomBranding = (): RoomBranding | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RoomBranding;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};

export const writeRoomBranding = (branding: RoomBranding | null | undefined): void => {
  if (!branding || (!branding.logoUrl && !branding.primaryColor && !branding.name)) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(branding));
};

/** Soft tint for cards/chips derived from the org primary color. */
export const brandTint = (hex: string | null | undefined, alpha = 0.12): string | undefined => {
  if (!hex) return undefined;
  const cleaned = hex.replace('#', '');
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return undefined;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
