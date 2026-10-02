import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isCustom: boolean;
}

export const getStoredSupabaseConfig = (): SupabaseConfig => {
  const meta = import.meta as any;
  const envUrl =
    meta.env?.VITE_SUPABASE_URL ||
    meta.env?.VITE_PUBLIC_SUPABASE_URL ||
    meta.env?.NEXT_PUBLIC_SUPABASE_URL ||
    meta.env?.SUPABASE_URL;

  const envKey =
    meta.env?.VITE_SUPABASE_ANON_KEY ||
    meta.env?.VITE_SUPABASE_KEY ||
    meta.env?.VITE_PUBLIC_SUPABASE_ANON_KEY ||
    meta.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    meta.env?.SUPABASE_ANON_KEY ||
    meta.env?.SUPABASE_KEY;

  if (envUrl && envKey) {
    return {
      url: envUrl.trim(),
      anonKey: envKey.trim(),
      isCustom: true,
    };
  }

  const localUrl = localStorage.getItem('creature_clash_supabase_url');
  const localKey = localStorage.getItem('creature_clash_supabase_key');

  if (localUrl && localKey) {
    return {
      url: localUrl.trim(),
      anonKey: localKey.trim(),
      isCustom: true,
    };
  }

  return {
    url: '',
    anonKey: '',
    isCustom: false,
  };
};

export const saveSupabaseConfig = (url: string, anonKey: string) => {
  if (url && anonKey) {
    localStorage.setItem('creature_clash_supabase_url', url.trim());
    localStorage.setItem('creature_clash_supabase_key', anonKey.trim());
  } else {
    localStorage.removeItem('creature_clash_supabase_url');
    localStorage.removeItem('creature_clash_supabase_key');
  }
  cachedClient = null;
};

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

export const getSupabaseClient = (): SupabaseClient | null => {
  const config = getStoredSupabaseConfig();
  if (!config.url || !config.anonKey) {
    return null;
  }

  const keyString = `${config.url}_${config.anonKey}`;
  if (cachedClient && cachedConfigKey === keyString) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(config.url, config.anonKey);
    cachedConfigKey = keyString;
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
};
