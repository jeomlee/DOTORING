// src/utils/imageUrls.ts
import { supabase } from '../api/supabaseClient';

const BUCKET = 'coupon-images';
const TTL_SEC = 60 * 60; // 1h
const CACHE_TTL_MS = TTL_SEC * 1000 * 0.9; // 약 54분
const HTTP_REGEX = /^https?:\/\//i;

type CacheItem = {
  url: string;
  expiresAt: number;
};

const cache = new Map<string, CacheItem>();

function getCached(key: string) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (cached.expiresAt > Date.now()) return cached.url;
  cache.delete(key);
  return null;
}

function setCache(key: string, url: string) {
  cache.set(key, { url, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function normalizeStorageKey(raw?: string | null) {
  if (!raw) return null;
  if (!raw.startsWith('http')) return raw.replace(/^\/+/, '');

  const publicMarker = `/storage/v1/object/public/${BUCKET}/`;
  const pIdx = raw.indexOf(publicMarker);
  if (pIdx >= 0) {
    return raw.slice(pIdx + publicMarker.length);
  }

  const marker = `/storage/v1/object/`;
  const idx = raw.indexOf(marker);
  if (idx >= 0) {
    const rest = raw.slice(idx + marker.length);
    const parts = rest.split('/');
    const bucketIdx = parts.findIndex((p) => p === BUCKET);
    if (bucketIdx >= 0) {
      return parts.slice(bucketIdx + 1).join('/').split('?')[0];
    }
  }

  return null;
}

async function fetchSignedUrls(keys: string[]): Promise<Record<string, string | null>> {
  const unique = Array.from(new Set(keys));
  const result: Record<string, string | null> = {};

  if (unique.length === 0) return result;

  unique.forEach((key) => {
    result[key] = null;
  });

  try {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(unique, TTL_SEC);

    if (error) {
      console.log('[imageUrls] createSignedUrls error:', error.message);
      return result;
    }

    data?.forEach((item) => {
      if (!item.path) return;
      const url = item.signedUrl ?? null;
      result[item.path] = url;
      if (url) setCache(item.path, url);
    });
  } catch (e: any) {
    console.log('[imageUrls] signed urls exception:', e?.message ?? e);
  }

  return result;
}

export async function resolveCouponImageUrl(raw?: string | null) {
  if (!raw) return null;
  if (HTTP_REGEX.test(raw)) return raw;

  const key = normalizeStorageKey(raw);
  if (!key) return null;

  const cached = getCached(key);
  if (cached) return cached;

  const fresh = await fetchSignedUrls([key]);
  return fresh[key] ?? null;
}

type HasImage = { image_url?: string | null };

export async function attachDisplayImageUrls<T extends HasImage>(
  items: T[],
): Promise<Array<T & { displayImageUrl: string | null }>> {
  const keysToFetch: string[] = [];

  const mapped = items.map((item) => {
    if (!item.image_url) {
      return { item, key: null as string | null, direct: null as string | null };
    }

    if (HTTP_REGEX.test(item.image_url)) {
      return { item, key: null as string | null, direct: item.image_url };
    }

    const key = normalizeStorageKey(item.image_url);
    if (!key) {
      return { item, key: null as string | null, direct: null as string | null };
    }

    const cached = getCached(key);
    if (!cached) keysToFetch.push(key);
    return { item, key, direct: cached };
  });

  const freshMap = await fetchSignedUrls(keysToFetch);

  return mapped.map(({ item, key, direct }) => {
    const displayImageUrl =
      direct ?? (key ? getCached(key) ?? freshMap[key] ?? null : null);
    return { ...item, displayImageUrl: displayImageUrl ?? null };
  });
}

export function invalidateCouponImageUrl(raw?: string | null) {
  if (!raw) return;
  if (!raw.startsWith('http')) {
    cache.delete(raw);
    return;
  }

  const key = normalizeStorageKey(raw);
  if (key) cache.delete(key);
}

export function clearCouponImageUrlCache() {
  cache.clear();
}
