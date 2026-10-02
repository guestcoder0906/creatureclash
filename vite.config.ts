import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    // Look up Supabase URL from process.env (Vercel build environment) or env (.env files)
    const supabaseUrl = 
      process.env.VITE_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.VITE_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_PROJECT_URL ||
      env.VITE_SUPABASE_URL ||
      env.SUPABASE_URL ||
      env.NEXT_PUBLIC_SUPABASE_URL ||
      env.VITE_PUBLIC_SUPABASE_URL ||
      env.SUPABASE_PROJECT_URL ||
      '';

    // Look up Supabase Anon Key from process.env (Vercel build environment) or env (.env files)
    const supabaseAnonKey = 
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.SUPABASE_KEY ||
      process.env.VITE_SUPABASE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_KEY ||
      process.env.SUPABASE_API_KEY ||
      process.env.SUPABASE_PUBLIC_ANON_KEY ||
      env.VITE_SUPABASE_ANON_KEY ||
      env.SUPABASE_ANON_KEY ||
      env.SUPABASE_KEY ||
      env.VITE_SUPABASE_KEY ||
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      env.NEXT_PUBLIC_SUPABASE_KEY ||
      env.SUPABASE_API_KEY ||
      env.SUPABASE_PUBLIC_ANON_KEY ||
      '';

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: true,
      },
      plugins: [react()],
      // Allow exposing SUPABASE_ and NEXT_PUBLIC_ variables directly via import.meta.env
      envPrefix: ['VITE_', 'SUPABASE_', 'NEXT_PUBLIC_', 'VERCEL_'],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || ''),
        '__SUPABASE_URL__': JSON.stringify(supabaseUrl),
        '__SUPABASE_ANON_KEY__': JSON.stringify(supabaseAnonKey),
        'process.env.VITE_SUPABASE_URL': JSON.stringify(supabaseUrl),
        'process.env.SUPABASE_URL': JSON.stringify(supabaseUrl),
        'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
        'process.env.SUPABASE_ANON_KEY': JSON.stringify(supabaseAnonKey),
        'process.env.SUPABASE_KEY': JSON.stringify(supabaseAnonKey),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
