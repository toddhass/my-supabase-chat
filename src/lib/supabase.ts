// import { createClient } from "@supabase/supabase-js";

// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
// const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// // ✅ Runtime safety (DO NOT REMOVE)
// if (!supabaseUrl || !supabaseAnonKey) {
//   throw new Error(
//     "Missing Supabase environment variables:\n" +
//       "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local",
//   );
// }

// // ✅ Now TypeScript is satisfied + runtime is safe
// export const supabase = createClient(supabaseUrl, supabaseAnonKey);
import { createBrowserClient } from "@supabase/ssr";

// This ensures we only ever have ONE instance of the Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
