"use client";

import { useEffect, useState } from "react";
import { supabase } from "../src/lib/supabase";
import ProfileModal from "../components/ProfileModal";

interface Profile {
  id: string;
  username: string;
  avatar_url: string | null;
  full_name?: string | null;
}

interface Post {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  profiles: {
    username: string;
    avatar_url: string | null;
  } | null;
}

export default function HomeFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [myProfile, setMyProfile] = useState<Profile | null>(null);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [content, setContent] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData?.user;
      if (currentUser) {
        setUser({ id: currentUser.id });

        // Fetch personal profile
        const { data: prof } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", currentUser.id)
          .single();
        if (prof) setMyProfile(prof);

        // Fetch other users for the "WhatsApp" sidebar
        const { data: usersData } = await supabase
          .from("profiles")
          .select("*")
          .limit(10);
        if (usersData) setAllUsers(usersData);
      }

      // Fetch initial posts
      const { data } = await supabase
        .from("messages")
        .select("*, profiles:author_id(username, avatar_url)")
        .order("created_at", { ascending: false });
      if (data) setPosts(data as Post[]);
    };
    init();

    // Realtime subscription
    const channel = supabase
      .channel("realtime-posts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("username, avatar_url")
            .eq("id", payload.new.author_id)
            .single();

          const newPost: Post = {
            id: payload.new.id,
            content: payload.new.content,
            created_at: payload.new.created_at,
            author_id: payload.new.author_id,
            profiles: profile,
          };
          setPosts((prev) => [newPost, ...prev]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user) return;

    const { error } = await supabase.from("messages").insert({
      content,
      author_id: user.id,
      room_name: "public",
      username: myProfile?.username || "user",
    });

    if (error) alert(error.message);
    else setContent("");
  };

  return (
    <div className="flex justify-center min-h-screen bg-white text-black">
      {/* WhatsApp Style Sidebar */}
      <nav className="hidden md:flex flex-col p-4 border-r w-80 sticky top-0 h-screen bg-gray-50">
        <div className="font-bold text-xl px-2 mb-6 text-blue-600 italic">
          Hybrid App
        </div>

        <button className="text-left p-3 hover:bg-gray-200 rounded-xl font-bold mb-4 transition bg-white shadow-sm">
          🏠 Home Feed
        </button>

        <h3 className="px-2 text-xs font-semibold text-gray-500 uppercase mb-4">
          Messages
        </h3>
        <div className="flex-1 overflow-y-auto space-y-2">
          {allUsers
            .filter((u) => u.id !== user?.id)
            .map((u) => (
              <button
                key={u.id}
                className="w-full flex items-center gap-3 p-2 hover:bg-gray-200 rounded-xl transition text-left"
              >
                <img
                  src={
                    u.avatar_url ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`
                  }
                  className="w-10 h-10 rounded-full bg-white border"
                  alt={`${u.username} avatar`}
                />
                <div className="flex-1 overflow-hidden">
                  <div className="font-bold text-sm">@{u.username}</div>
                  <div className="text-xs text-gray-400 truncate">
                    Start a chat...
                  </div>
                </div>
              </button>
            ))}
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="mt-4 p-3 border rounded-xl hover:bg-gray-100 font-bold"
        >
          👤 Edit Profile
        </button>
      </nav>

      {/* X Style Feed */}
      <main className="w-full max-w-2xl border-r">
        <div className="p-4 border-b sticky top-0 bg-white/80 backdrop-blur-md font-bold text-lg z-10">
          Home
        </div>

        <form onSubmit={handlePost} className="p-4 border-b">
          <textarea
            className="w-full outline-none text-lg resize-none"
            placeholder="What's happening?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex justify-end pt-2 border-t mt-2">
            <button className="bg-blue-500 text-white px-6 py-1.5 rounded-full font-bold hover:bg-blue-600 transition">
              Post
            </button>
          </div>
        </form>

        <div className="divide-y">
          {posts.map((post) => (
            <div
              key={post.id}
              className="p-4 flex gap-3 hover:bg-gray-50 transition"
            >
              <img
                src={
                  post.profiles?.avatar_url ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author_id}`
                }
                alt="Avatar"
                className="w-12 h-12 bg-gray-200 rounded-full flex-shrink-0"
              />
              <div className="flex-1">
                <div className="flex gap-2 text-sm">
                  <span className="font-bold">
                    @{post.profiles?.username || "user"}
                  </span>
                  <span className="text-gray-500">
                    {new Date(post.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 leading-relaxed text-gray-800">
                  {post.content}
                </p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {isModalOpen && user && (
        <ProfileModal
          user={user}
          profile={myProfile}
          onClose={() => setIsModalOpen(false)}
          onSave={(updated: Partial<Profile>) =>
            setMyProfile((prev) => (prev ? { ...prev, ...updated } : null))
          }
        />
      )}
    </div>
  );
}
