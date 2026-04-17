"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

interface ProfileModalProps {
  user: { id: string };
  profile: { username: string; full_name?: string | null } | null;
  onSave: (data: { username: string; full_name: string }) => void;
  onClose: () => void;
}

export default function ProfileModal({
  user,
  profile,
  onSave,
  onClose,
}: ProfileModalProps) {
  const [username, setUsername] = useState(profile?.username || "");
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      username: username.toLowerCase().replace(/\s/g, ""),
      full_name: fullName,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      alert(error.message);
    } else {
      onSave({ username, full_name: fullName });
      onClose();
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl text-black">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold">Edit Profile</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-black text-2xl"
          >
            ×
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Username
            </label>
            <div className="flex items-center border rounded-lg p-2 focus-within:ring-2 focus-within:ring-blue-500">
              <span className="text-gray-400 mr-1">@</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full outline-none"
                placeholder="johndoe"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">
              Display Name
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full border rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="John Doe"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-black text-white font-bold py-3 rounded-full hover:bg-gray-800 transition disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
