import { createClient, SupabaseClient } from '@supabase/supabase-js';

declare const __SUPABASE_URL__: string | undefined;
declare const __SUPABASE_ANON_KEY__: string | undefined;

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isCustom: boolean;
}

export const getStoredSupabaseConfig = (): SupabaseConfig => {
  const meta = import.meta as any;

  // 1. Direct Vite compile-time injection from Vercel process.env config variables
  let url = (typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '') || '';
  let anonKey = (typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : '') || '';

  // 2. Check import.meta.env with all common prefix patterns
  if (!url) {
    url =
      meta.env?.VITE_SUPABASE_URL ||
      meta.env?.SUPABASE_URL ||
      meta.env?.NEXT_PUBLIC_SUPABASE_URL ||
      meta.env?.VITE_PUBLIC_SUPABASE_URL ||
      meta.env?.SUPABASE_PROJECT_URL ||
      '';
  }

  if (!anonKey) {
    anonKey =
      meta.env?.VITE_SUPABASE_ANON_KEY ||
      meta.env?.SUPABASE_ANON_KEY ||
      meta.env?.SUPABASE_KEY ||
      meta.env?.VITE_SUPABASE_KEY ||
      meta.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      meta.env?.NEXT_PUBLIC_SUPABASE_KEY ||
      meta.env?.SUPABASE_API_KEY ||
      meta.env?.SUPABASE_PUBLIC_ANON_KEY ||
      '';
  }

  // 3. Check browser globals (window / process.env fallback if polyfilled)
  if (typeof window !== 'undefined') {
    const win = window as any;
    if (!url) {
      url = win.__SUPABASE_URL__ || win.ENV?.SUPABASE_URL || win.ENV?.VITE_SUPABASE_URL || '';
    }
    if (!anonKey) {
      anonKey = win.__SUPABASE_ANON_KEY__ || win.ENV?.SUPABASE_ANON_KEY || win.ENV?.VITE_SUPABASE_ANON_KEY || '';
    }
  }

  if (url && anonKey) {
    return {
      url: url.trim(),
      anonKey: anonKey.trim(),
      isCustom: true,
    };
  }

  // 4. LocalStorage fallback
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
