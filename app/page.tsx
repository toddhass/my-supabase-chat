"use client";

import { useEffect, useState } from "react";
import { supabase } from "../src/lib/supabase";
import ProfileModal from "../components/ProfileModal";
import { useRouter } from "next/navigation";

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
  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      // 1. Get current user session
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData?.user;

      if (!currentUser) {
        router.push("/login");
        return;
      }

      setUser({ id: currentUser.id });

      // 2. Fetch personal profile
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .single();

      if (prof) {
        setMyProfile(prof);

        // --- AUTO-ONBOARDING LOGIC ---
        // If the user has no full_name, we assume they haven't finished setup.
        // We trigger the modal automatically.
        if (!prof.full_name) {
          setIsModalOpen(true);
        }
      }

      // 3. Fetch other users for Sidebar
      const { data: usersData } = await supabase
        .from("profiles")
        .select("*")
        .neq("id", currentUser.id)
        .limit(10);
      if (usersData) setAllUsers(usersData);

      // 4. Fetch initial posts
      const { data, error } = await supabase
        .from("messages")
        .select(
          `
          id, 
          content, 
          created_at, 
          author_id, 
          profiles!messages_author_id_fkey (
            username, 
            avatar_url
          )
        `,
        )
        .order("created_at", { ascending: false });

      if (data) setPosts(data as unknown as Post[]);
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
  }, [router]);

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user) return;

    const { error } = await supabase.from("messages").insert({
      content,
      author_id: user.id,
      room_name: "public",
      username: myProfile?.username || "user",
    });

    if (!error) setContent("");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="flex justify-center min-h-screen bg-white text-black">
      {/* --- SIDEBAR --- */}
      <nav className="hidden md:flex flex-col p-4 border-r w-80 sticky top-0 h-screen bg-gray-50">
        <div className="font-bold text-2xl px-2 mb-8 text-blue-600 italic tracking-tighter">
          Supa Chat
        </div>

        <button className="flex items-center gap-3 text-left p-3 bg-blue-50 text-blue-600 rounded-xl font-bold mb-6 border border-blue-100">
          <span>🏠</span> Home Feed
        </button>

        <div className="flex-1 flex flex-col overflow-hidden">
          <h3 className="px-2 text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
            Direct Messages
          </h3>
          <div className="flex-1 overflow-y-auto space-y-1">
            {allUsers.map((u) => (
              <button
                key={u.id}
                className="w-full flex items-center gap-3 p-3 hover:bg-white rounded-xl transition text-left group"
              >
                <img
                  src={
                    u.avatar_url ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.id}`
                  }
                  className="w-10 h-10 rounded-full bg-gray-200 border"
                  alt="avatar"
                />
                <div className="flex-1 overflow-hidden">
                  <div className="font-bold text-sm text-gray-800">
                    @{u.username}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    Active now
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t space-y-2">
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full flex items-center gap-3 p-3 hover:bg-gray-200 rounded-xl font-semibold transition text-sm text-gray-700"
          >
            <span>👤</span> My Profile
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-3 hover:bg-red-50 text-red-600 rounded-xl font-bold transition text-sm"
          >
            <span>🚪</span> Logout
          </button>
        </div>
      </nav>

      {/* --- MAIN FEED --- */}
      <main className="w-full max-w-2xl border-r bg-white min-h-screen">
        <div className="p-4 border-b sticky top-0 bg-white/90 backdrop-blur-md font-black text-xl z-10">
          Home
        </div>

        <form onSubmit={handlePost} className="p-4 border-b">
          <div className="flex gap-3">
            <img
              src={
                myProfile?.avatar_url ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id}`
              }
              className="w-12 h-12 rounded-full border bg-gray-100"
              alt="My Avatar"
            />
            <div className="flex-1">
              <textarea
                className="w-full outline-none text-xl resize-none mt-2 placeholder-gray-400"
                placeholder="What's happening?"
                rows={3}
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
              <div className="flex justify-between items-center pt-3 border-t mt-2">
                <span className="text-blue-500 text-sm font-medium">
                  Public Space
                </span>
                <button
                  disabled={!content.trim()}
                  className="bg-blue-500 text-white px-6 py-2 rounded-full font-bold hover:bg-blue-600 transition disabled:opacity-50"
                >
                  Post
                </button>
              </div>
            </div>
          </div>
        </form>

        <div className="divide-y bg-gray-50">
          {posts.map((post) => (
            <div
              key={post.id}
              className="p-4 flex gap-3 bg-white hover:bg-gray-50 transition"
            >
              <img
                src={
                  post.profiles?.avatar_url ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${post.author_id}`
                }
                alt="Avatar"
                className="w-12 h-12 rounded-full flex-shrink-0 border"
              />
              <div className="flex-1">
                <div className="flex gap-2 items-center text-sm mb-1">
                  <span className="font-bold text-gray-900">
                    @{post.profiles?.username || "user"}
                  </span>
                  <span className="text-gray-400">·</span>
                  <span className="text-gray-400">
                    {new Date(post.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-gray-800">{post.content}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Modal Overlay */}
      {isModalOpen && user && (
        <ProfileModal
          user={user}
          profile={myProfile}
          onClose={() => setIsModalOpen(false)}
          onSave={(updated) =>
            setMyProfile((prev) => (prev ? { ...prev, ...updated } : null))
          }
        />
      )}
    </div>
  );
}
