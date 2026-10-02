import { createClient, SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_DEMO_URL = 'https://tnqbbnhdwtqbblyovfhl.supabase.co';
const DEFAULT_DEMO_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRucWJibmhkd3RxYmJseW92ZmhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDk4NTYwMDAsImV4cCI6MjAyNTQzMjAwMH0.wZ99K-hR_demo_anon_key_creature_clash';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isCustom: boolean;
}

export const getStoredSupabaseConfig = (): SupabaseConfig => {
  const meta = import.meta as any;
  const envUrl = meta.env?.VITE_SUPABASE_URL;
  const envKey = meta.env?.VITE_SUPABASE_ANON_KEY;

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
  // Reset cached client
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
    cachedClient = createClient(config.url, config.anonKey, {
      realtime: {
        params: {
          eventsPerSecond: 20,
        },
      },
    });
    cachedConfigKey = keyString;
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
};
