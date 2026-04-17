"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../src/lib/supabase";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatApp() {
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState("");
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [currentRoom, setCurrentRoom] = useState("General");
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [roomMembers, setRoomMembers] = useState([]);
  const [uploading, setUploading] = useState(false);

  const channelRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  const getAvatar = (seed) =>
    `https://api.dicebear.com/7.x/lorelei/svg?seed=${seed}`;

  // 1. Initial Setup
  useEffect(() => {
    setMounted(true);
    const init = async () => {
      const saved = localStorage.getItem("chat-username");
      const name = saved || `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
      if (!saved) localStorage.setItem("chat-username", name);
      setUsername(name);

      const { data } = await supabase
        .from("rooms")
        .select("id, name")
        .order("name");
      if (data) setRooms(data);
      setLoading(false);
    };
    init();
  }, []);

  // 2. Realtime Presence & Room Members
  useEffect(() => {
    if (!mounted) return;
    const channel = supabase.channel(`room-${currentRoom}-presence`, {
      config: { presence: { key: username } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const members = [];
        Object.entries(state).forEach(([name, presenceArray]) => {
          presenceArray.forEach((p) => {
            if (p.room === currentRoom) members.push(name);
          });
        });
        setRoomMembers([...new Set(members)]);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ room: currentRoom });
      });

    return () => {
      channel.unsubscribe();
    };
  }, [currentRoom, username, mounted]);

  // 3. Realtime Messages & Initial Fetch
  useEffect(() => {
    if (!mounted) return;

    const processMessage = (msg) => {
      // Regex to detect the Markdown image syntax we use for uploads
      const imgMatch = msg.content.match(/\!\[\]\((.*?)\)/);
      return {
        ...msg,
        text: msg.content.replace(`[${currentRoom}] `, ""),
        imageUrl: imgMatch ? imgMatch[1] : null,
      };
    };

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .ilike("content", `[${currentRoom}]%`)
        .order("created_at", { ascending: true });

      setMessages((data || []).map(processMessage));
    };

    fetchMessages();

    const msgSub = supabase
      .channel(`chat-${currentRoom}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          if (payload.new.content.startsWith(`[${currentRoom}]`)) {
            setMessages((prev) => [...prev, processMessage(payload.new)]);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgSub);
    };
  }, [currentRoom, mounted]);

  // 4. Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, roomMembers.length]);

  // 5. Image Upload Logic
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}.${fileExt}`; // Use timestamp for unique names
    const filePath = `${currentRoom}/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("chat-attachments").getPublicUrl(filePath);

      await supabase.from("messages").insert([
        {
          username,
          content: `[${currentRoom}] ![](${publicUrl})`,
        },
      ]);
    } catch (error) {
      console.error(error);
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = ""; // Reset input
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    const text = content.trim();
    setContent("");
    const { error } = await supabase
      .from("messages")
      .insert([{ username, content: `[${currentRoom}] ${text}` }]);
    if (error) {
      toast.error("Failed to send");
      setContent(text);
    }
  };

  if (!mounted) return null;
  if (loading)
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 text-emerald-500 font-black animate-pulse uppercase tracking-widest">
        Supa-Chat Initializing...
      </div>
    );

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* HEADER */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-2 text-emerald-500 hover:bg-slate-800 rounded-lg shrink-0"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16m-7 6h7"
              />
            </svg>
          </button>
          <div className="flex flex-col">
            <h1 className="text-xs font-black text-emerald-500 italic leading-none">
              SUPA-CHAT
            </h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-1">
              #{currentRoom}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button
            onClick={() => setMembersOpen(!membersOpen)}
            className="text-slate-400 hover:text-emerald-500 shrink-0"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
          </button>
          <div className="flex items-center gap-2 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700 shrink-0">
            <img
              src={getAvatar(username)}
              className="w-5 h-5 rounded-full bg-slate-700"
              alt="me"
            />
            <input
              className="bg-transparent text-[10px] w-16 md:w-20 focus:outline-none"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                localStorage.setItem("chat-username", e.target.value);
              }}
            />
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* ROOMS SIDEBAR */}
        <aside
          className={`absolute inset-y-0 left-0 z-30 w-64 bg-slate-900 border-r border-slate-800 transition-transform duration-300 md:relative md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="p-4 border-b border-slate-800 text-[10px] font-bold text-slate-500 tracking-widest uppercase">
            Channels
          </div>
          <div className="p-2 space-y-1 overflow-y-auto">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => {
                  setCurrentRoom(room.name);
                  setSidebarOpen(false);
                }}
                className={`w-full text-left px-4 py-2.5 rounded-xl text-sm transition-all ${currentRoom === room.name ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:bg-slate-800"}`}
              >
                # {room.name}
              </button>
            ))}
          </div>
        </aside>

        {/* MAIN CHAT AREA */}
        <main className="flex flex-1 flex-col overflow-hidden bg-slate-950">
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.map((msg, i) => (
              <div
                key={msg.id || i}
                className={`flex gap-3 ${msg.username === username ? "flex-row-reverse" : "flex-row"}`}
              >
                <img
                  src={getAvatar(msg.username)}
                  className="w-9 h-9 rounded-xl bg-slate-800 shrink-0 shadow-md"
                  alt="avatar"
                />
                <div
                  className={`flex flex-col max-w-[85%] md:max-w-[70%] ${msg.username === username ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[11px] font-bold text-slate-400">
                      {msg.username}
                    </span>
                    <span className="text-[9px] text-slate-600 font-medium">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <div
                    className={`text-sm ${msg.username === username ? "chat-bubble-me" : "chat-bubble-them"} prose prose-invert prose-sm max-w-none`}
                  >
                    {msg.imageUrl ? (
                      <a
                        href={msg.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block mt-1"
                      >
                        <img
                          src={msg.imageUrl}
                          alt="Attachment"
                          className="rounded-lg max-w-full h-auto border border-white/10 shadow-sm"
                          onLoad={() =>
                            scrollRef.current?.scrollIntoView({
                              behavior: "smooth",
                            })
                          }
                        />
                      </a>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.text}
                      </ReactMarkdown>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={scrollRef} className="h-4" />
          </div>

          {/* FOOTER INPUT AREA */}
          <footer className="p-3 pb-safe border-t border-slate-800 bg-slate-900/50">
            <form
              onSubmit={sendMessage}
              className="flex gap-2 max-w-5xl mx-auto items-center"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-11 w-11 shrink-0 items-center justify-center bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 transition-colors active:scale-95"
              >
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent animate-spin rounded-full" />
                ) : (
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                )}
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileUpload}
              />

              <input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={`Message #${currentRoom.toLowerCase()}...`}
                className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-600"
              />
              <button
                type="submit"
                disabled={!content.trim()}
                className="h-11 px-5 shrink-0 bg-emerald-600 rounded-xl font-bold hover:bg-emerald-500 disabled:opacity-50 transition-all active:scale-95 text-sm"
              >
                Send
              </button>
            </form>
          </footer>
        </main>

        {/* MEMBERS SIDEBAR */}
        <aside
          className={`absolute inset-y-0 right-0 z-30 w-64 bg-slate-900 border-l border-slate-800 transition-transform duration-300 transform ${membersOpen ? "translate-x-0" : "translate-x-full"} lg:relative lg:translate-x-0 ${!membersOpen && "lg:hidden"}`}
        >
          <div className="p-4 border-b border-slate-800 text-[10px] font-bold text-slate-500 tracking-widest uppercase">
            Members — {roomMembers.length}
          </div>
          <div className="p-4 space-y-4 overflow-y-auto">
            {roomMembers.map((member) => (
              <div key={member} className="flex items-center gap-3 group">
                <div className="relative">
                  <img
                    src={getAvatar(member)}
                    className="w-8 h-8 rounded-full bg-slate-800 group-hover:ring-2 ring-emerald-500/50 transition-all"
                    alt="member"
                  />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
                </div>
                <span className="text-sm text-slate-300 font-medium truncate">
                  {member}{" "}
                  {member === username && (
                    <span className="text-slate-500 text-[10px] ml-1">
                      (You)
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* OVERLAYS */}
      {(sidebarOpen || (membersOpen && window.innerWidth < 1024)) && (
        <div
          onClick={() => {
            setSidebarOpen(false);
            setMembersOpen(false);
          }}
          className="fixed inset-0 bg-black/60 z-20 backdrop-blur-sm md:hidden"
        />
      )}
    </div>
  );
}
