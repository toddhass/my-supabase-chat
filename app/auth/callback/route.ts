import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/**
 * This route handles the redirect back from Supabase Auth
 * after a user clicks their email confirmation link.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // "next" is where we want to send the user after successful login
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const cookieStore = await cookies();

    // Initialize the Server Client specifically for route handlers
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: "", ...options });
          },
        },
      },
    );

    // Exchange the temporary auth code for a real session
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // SUCCESS: The session is now set in cookies.
      // We redirect to 'next' (usually the home feed).
      return NextResponse.redirect(`${origin}${next}`);
    }

    // Log the error for server-side debugging
    console.error("Auth Callback Error:", error.message);
  }

  // FAILURE: Return the user to login with an error message in the URL
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
