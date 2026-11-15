
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL;

const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured =
  typeof SUPABASE_URL === 'string' &&
  SUPABASE_URL.startsWith('https://') &&
  typeof SUPABASE_KEY === 'string' &&
  SUPABASE_KEY.startsWith('sb_publishable_');

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    })
  : null;
