"use client";

import { useState, useEffect } from "react";
// Import the shared singleton instead of creating a new one here
import { supabase } from "../src/lib/supabase";

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  full_name?: string | null;
}

interface ProfileModalProps {
  user: { id: string };
  profile: Profile | null;
  onClose: () => void;
  onSave: (updated: Partial<Profile>) => void;
}

export default function ProfileModal({
  user,
  profile,
  onClose,
  onSave,
}: ProfileModalProps) {
  const [username, setUsername] = useState(profile?.username || "");
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || "");
  const [loading, setLoading] = useState(false);

  // Keep internal state in sync if the profile prop changes
  useEffect(() => {
    if (profile) {
      setUsername(profile.username || "");
      setFullName(profile.full_name || "");
      setAvatarUrl(profile.avatar_url || "");
    }
  }, [profile]);

  const handleUpdateProfile = async () => {
    setLoading(true);

    const updates = {
      id: user.id,
      username,
      full_name: fullName,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("profiles").upsert(updates);

    if (error) {
      alert(error.message);
    } else {
      onSave({ username, full_name: fullName, avatar_url: avatarUrl });
      onClose();
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-2xl font-bold mb-4">Edit Profile</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Username
            </label>
            <input
              className="w-full p-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="johndoe"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Full Name
            </label>
            <input
              className="w-full p-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              Avatar URL
            </label>
            <input
              className="w-full p-2 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              type="text"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.png"
            />
            <p className="text-xs text-gray-400 mt-1">
              Leave blank to use an auto-generated avatar.
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button
            onClick={onClose}
            className="flex-1 p-2 border rounded-xl font-bold hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleUpdateProfile}
            disabled={loading}
            className="flex-1 p-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
