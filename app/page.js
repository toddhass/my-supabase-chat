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

  useEffect(() => {
    if (!mounted) return;
    const processMessage = (msg) => {
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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, roomMembers.length]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${currentRoom}/${fileName}`;
    try {
      const { error: uploadError } = await supabase.storage
        .from("chat-attachments")
        .upload(filePath, file);
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from("chat-attachments").getPublicUrl(filePath);
      await supabase
        .from("messages")
        .insert([{ username, content: `[${currentRoom}] ![](${publicUrl})` }]);
    } catch (error) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950 text-emerald-500 font-black">
        INITIALIZING...
      </div>
    );

  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none">
      {/* SLIMMER HEADER */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900/90 px-3 backdrop-blur-md z-20">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden p-1.5 text-emerald-500 hover:bg-slate-800 rounded-lg"
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
            <h1 className="text-[10px] font-black text-emerald-500 italic leading-none tracking-tighter">
              SUPA-CHAT
            </h1>
            <p className="text-[11px] text-slate-200 font-bold uppercase mt-0.5">
              #{currentRoom}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setMembersOpen(!membersOpen)}
            className="text-slate-400 p-1"
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
          <div className="flex items-center gap-1.5 bg-slate-800 pl-1.5 pr-2.5 py-1 rounded-full border border-slate-700">
            <img
              src={getAvatar(username)}
              className="w-4 h-4 rounded-full"
              alt="me"
            />
            <input
              className="bg-transparent text-[10px] w-14 focus:outline-none font-medium"
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
          className={`absolute inset-y-0 left-0 z-40 w-72 bg-slate-900 border-r border-slate-800 transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="p-4 border-b border-slate-800 flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">
              Channels
            </span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-slate-500"
            >
              ✕
            </button>
          </div>
          <div className="p-2 space-y-1 overflow-y-auto h-full">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => {
                  setCurrentRoom(room.name);
                  setSidebarOpen(false);
                }}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all ${currentRoom === room.name ? "bg-emerald-600 text-white" : "text-slate-400 hover:bg-slate-800"}`}
              >
                # {room.name}
              </button>
            ))}
          </div>
        </aside>

        {/* MAIN CHAT */}
        <main className="flex flex-1 flex-col overflow-hidden bg-slate-950 relative">
          <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4">
            {messages.map((msg, i) => (
              <div
                key={msg.id || i}
                className={`flex gap-2.5 ${msg.username === username ? "flex-row-reverse" : "flex-row"}`}
              >
                <img
                  src={getAvatar(msg.username)}
                  className="w-8 h-8 rounded-lg bg-slate-800 shrink-0 self-end mb-1"
                  alt="avatar"
                />
                <div
                  className={`flex flex-col min-w-0 max-w-[85%] md:max-w-[70%] ${msg.username === username ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-2 mb-0.5 px-1">
                    <span className="text-[10px] font-bold text-slate-500 truncate">
                      {msg.username}
                    </span>
                    <span className="text-[9px] text-slate-600">
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>

                  <div
                    className={`text-[14px] leading-relaxed break-words shadow-sm ${msg.username === username ? "bg-emerald-600 text-white rounded-2xl rounded-tr-none px-3 py-2" : "bg-slate-800 text-slate-100 rounded-2xl rounded-tl-none px-3 py-2"} prose prose-invert prose-sm max-w-none`}
                  >
                    {msg.imageUrl ? (
                      <a
                        href={msg.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block my-1"
                      >
                        <img
                          src={msg.imageUrl}
                          alt="Attachment"
                          className="rounded-lg max-w-full h-auto border border-black/20"
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

          {/* INPUT AREA */}
          <footer className="p-2 md:p-4 bg-slate-900/80 border-t border-slate-800 backdrop-blur-sm">
            <form
              onSubmit={sendMessage}
              className="flex gap-2 max-w-5xl mx-auto items-end"
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-10 w-10 shrink-0 items-center justify-center bg-slate-800 rounded-full text-slate-400 active:bg-slate-700"
              >
                {uploading ? (
                  <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent animate-spin rounded-full" />
                ) : (
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
                      d="M12 4v16m8-8H4"
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

              <textarea
                rows="1"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(e);
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 min-w-0 bg-slate-800 border-none rounded-2xl px-4 py-2.5 text-sm focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-500 resize-none max-h-32"
              />
              <button
                type="submit"
                disabled={!content.trim()}
                className="h-10 w-10 shrink-0 flex items-center justify-center bg-emerald-600 rounded-full disabled:opacity-50 active:scale-95 transition-transform"
              >
                <svg
                  className="w-5 h-5 text-white transform rotate-90"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </form>
          </footer>
        </main>

        {/* MEMBERS SIDEBAR */}
        <aside
          className={`absolute inset-y-0 right-0 z-40 w-64 bg-slate-900 border-l border-slate-800 transition-transform duration-300 transform ${membersOpen ? "translate-x-0" : "translate-x-full"} lg:relative lg:translate-x-0 ${!membersOpen && "lg:hidden"}`}
        >
          <div className="p-4 border-b border-slate-800 flex justify-between items-center">
            <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">
              Online ({roomMembers.length})
            </span>
            <button onClick={() => setMembersOpen(false)} className="lg:hidden">
              ✕
            </button>
          </div>
          <div className="p-4 space-y-4 overflow-y-auto h-full">
            {roomMembers.map((member) => (
              <div key={member} className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <img
                    src={getAvatar(member)}
                    className="w-8 h-8 rounded-full border border-slate-700"
                    alt="avatar"
                  />
                  <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-slate-900 rounded-full" />
                </div>
                <span className="text-sm text-slate-300 font-medium truncate">
                  {member}
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
          className="fixed inset-0 bg-black/60 z-30 backdrop-blur-sm md:hidden"
        />
      )}
    </div>
  );
}
