"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
// Correct path to your singleton
import { supabase } from "../../src/lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSignIn = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      router.push("/");
      router.refresh();
    }
    setLoading(false);
  };

  const handleSignUp = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      alert(error.message);
    } else {
      alert("Check your email for the confirmation link!");
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col gap-4 max-w-sm mx-auto mt-20 p-8 border rounded-xl shadow-lg bg-white text-black">
      <h1 className="text-2xl font-bold">Join X-Chat</h1>
      <p className="text-sm text-gray-500">Sign in or create an account</p>

      <input
        className="p-2 border rounded focus:ring-2 focus:ring-blue-400 outline-none"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="p-2 border rounded focus:ring-2 focus:ring-blue-400 outline-none"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <button
        disabled={loading}
        onClick={handleSignIn}
        className="bg-blue-600 text-white p-2 rounded font-bold hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Processing..." : "Sign In"}
      </button>

      <button
        disabled={loading}
        onClick={handleSignUp}
        className="text-blue-600 text-sm font-medium hover:underline"
      >
        {/* Fixed the unescaped entity by using &apos; instead of ' */}
        Don&apos;t have an account? Sign Up
      </button>
    </div>
  );
}
