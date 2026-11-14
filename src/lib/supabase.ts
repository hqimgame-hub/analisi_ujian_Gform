/**
 * Supabase Client Singleton
 * Gunakan environment variable VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
 * Fallback ke mode offline (localStorage) jika env tidak dikonfigurasi
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * Mendeteksi apakah Supabase sudah dikonfigurasi
 * Jika belum, aplikasi berjalan dalam mode demo (localStorage)
 */
export const isSupabaseConfigured = (): boolean => {
  return !!supabaseUrl && !!supabaseAnonKey &&
    supabaseUrl !== 'https://YOUR_PROJECT_REF.supabase.co' &&
    supabaseAnonKey !== 'YOUR_SUPABASE_ANON_KEY_HERE';
};

/** Supabase client instance — null jika belum dikonfigurasi */
export let supabase: SupabaseClient | null = null;

if (isSupabaseConfigured()) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
  console.info('[Supabase] Connected to:', supabaseUrl);
} else {
  console.warn(
    '[Supabase] Belum dikonfigurasi. Aplikasi berjalan dalam mode DEMO (localStorage).\n' +
    'Untuk produksi: isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di file .env.local'
  );
}

export default supabase;
