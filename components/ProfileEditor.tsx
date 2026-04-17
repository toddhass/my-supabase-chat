"use client";
import { useState, useEffect } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function ProfileEditor({ session }: { session: any }) {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    getProfile();
  }, [session]);

  async function getProfile() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select(`username, avatar_url`)
        .eq("id", session.user.id)
        .single();

      if (data) {
        setUsername(data.username);
        setAvatarUrl(data.avatar_url);
      }
    } finally {
      setLoading(false);
    }
  }

  async function updateProfile() {
    const { error } = await supabase.from("profiles").upsert({
      id: session.user.id,
      username,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    });
    if (error) alert(error.message);
    else alert("Profile updated!");
  }

  return (
    <div className="p-4 border rounded-lg shadow-sm bg-white">
      <h2 className="text-xl font-bold mb-4">Edit Profile</h2>
      <input
        type="text"
        placeholder="Username"
        value={username || ""}
        onChange={(e) => setUsername(e.target.value)}
        className="block w-full p-2 border mb-2 rounded"
      />
      <button
        onClick={updateProfile}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
      >
        Save Changes
      </button>
    </div>
  );
}
