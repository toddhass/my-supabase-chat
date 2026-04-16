// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "❌ Missing Supabase environment variables!\n" +
      "Make sure .env.local contains:\n" +
      "NEXT_PUBLIC_SUPABASE_URL=...\n" +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY=...",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
