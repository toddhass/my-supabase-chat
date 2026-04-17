/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../src/lib/supabase";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// --- HELPERS ---
const getAvatar = (seed) =>
  `https://api.dicebear.com/7.x/lorelei/svg?seed=${seed}`;
const formatTime = (dateStr) => {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
};

// --- SUB-COMPONENTS ---

const MessageList = ({ messages, username, scrollRef }) => (
  <div className="flex-1 overflow-y-auto p-3 space-y-6 scrollbar-hide">
    {messages.map((msg, i) => (
      <div
        key={msg.id || i}
        className={`flex gap-2.5 ${msg.username === username ? "flex-row-reverse" : "flex-row"}`}
      >
        <img
          src={getAvatar(msg.username)}
          className="w-8 h-8 rounded-lg bg-slate-800 shrink-0 self-end mb-1 shadow-sm"
          alt="avatar"
        />

        <div
          className={`flex flex-col min-w-0 max-w-[85%] md:max-w-[70%] ${msg.username === username ? "items-end" : "items-start"}`}
        >
          <div className="flex items-center gap-2 mb-1 px-1">
            <span className="text-slate-500 font-bold uppercase text-[10px]">
              {msg.username}
            </span>
            <span className="text-[9px] text-slate-600 font-medium">
              {formatTime(msg.created_at)}
            </span>
          </div>

          <div
            className={`relative p-3 rounded-2xl shadow-sm ${
              msg.username === username
                ? "bg-emerald-600 text-white rounded-tr-none"
                : "bg-slate-800 text-slate-100 rounded-tl-none"
            }`}
          >
            <div className="prose prose-invert prose-sm max-w-none break-words leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {msg.text}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </div>
    ))}
    <div ref={scrollRef} className="h-10" />
  </div>
);

const InputBar = ({ content, setContent, sendMessage }) => {
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  return (
    <footer className="p-3 bg-slate-900/95 border-t border-slate-800 shrink-0">
      <form
        onSubmit={sendMessage}
        className="flex gap-2 max-w-5xl mx-auto items-center"
      >
        <textarea
          rows="1"
          value={content}
          onKeyDown={handleKeyDown}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-slate-800 rounded-xl px-4 py-2.5 text-[16px] md:text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none text-white border-none"
        />
        <button
          type="submit"
          disabled={!content.trim()}
          className="bg-emerald-600 h-10 w-10 flex items-center justify-center rounded-full text-white disabled:opacity-50 active:scale-95 transition-all shadow-lg shadow-emerald-900/20"
        >
          ➤
        </button>
      </form>
    </footer>
  );
};

// --- MAIN COMPONENT ---
export default function ChatApp() {
  const [mounted, setMounted] = useState(false);
  const [username, setUsername] = useState("");
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [currentRoom, setCurrentRoom] = useState("General");
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [roomMembers, setRoomMembers] = useState([]);

  const scrollRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkSize = () => setIsMobile(window.innerWidth < 1024);
    checkSize();
    window.addEventListener("resize", checkSize);
    return () => window.removeEventListener("resize", checkSize);
  }, []);

  const changeUsername = () => {
    const newName = prompt("Enter new username:", username);
    if (newName && newName.trim() && newName !== username) {
      const cleanName = newName.trim().substring(0, 15);
      localStorage.setItem("chat-username", cleanName);
      setUsername(cleanName);
      window.location.reload(); // Refresh to re-sync presence
    }
  };

  const processMessage = useCallback(
    (msg) => ({
      ...msg,
      text: msg.content.replace(`[${currentRoom}] `, ""),
    }),
    [currentRoom],
  );

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
    if (!mounted || !username) return;
    const channel = supabase.channel(`room-${currentRoom}-presence`, {
      config: { presence: { key: username } },
    });
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
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select(`*`)
        .ilike("content", `[${currentRoom}]%`)
        .order("created_at", { ascending: true });
      setMessages((data || []).map(processMessage));
    };
    fetchMessages();
    const channel = supabase
      .channel(`chat-logic-${currentRoom}`)
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
      supabase.removeChannel(channel);
    };
  }, [currentRoom, mounted, processMessage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollRef.current)
        scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 150);
    return () => clearTimeout(timer);
  }, [messages.length]);

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
        LOADING...
      </div>
    );

  if (isMobile) {
    return (
      <div className="fixed inset-0 h-[100dvh] flex flex-col bg-slate-950 overflow-hidden font-sans">
        <header className="h-14 border-b border-slate-800 flex items-center px-4 justify-between bg-slate-900 shrink-0">
          <div className="flex flex-col">
            <span className="text-emerald-500 font-black text-[10px]">
              SUPA-CHAT
            </span>
            <span className="text-white font-bold text-sm uppercase">
              #{currentRoom}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={changeUsername} className="p-2 text-slate-400">
              ⚙️
            </button>
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-emerald-500 p-2 text-xl"
            >
              ☰
            </button>
          </div>
        </header>

        <MessageList
          messages={messages}
          username={username}
          scrollRef={scrollRef}
        />
        <InputBar
          content={content}
          setContent={setContent}
          sendMessage={sendMessage}
        />

        {sidebarOpen && (
          <div className="fixed inset-0 bg-slate-950/95 z-50 p-6 flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex justify-between items-center mb-8">
              <span className="text-emerald-500 font-black">MENU</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-white text-3xl"
              >
                &times;
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-6">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">
                Channels
              </div>
              {rooms.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setCurrentRoom(r.name);
                    setSidebarOpen(false);
                  }}
                  className={`w-full text-left p-4 rounded-xl font-bold ${currentRoom === r.name ? "bg-emerald-600 text-white" : "bg-slate-900 text-slate-400"}`}
                >
                  # {r.name}
                </button>
              ))}
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-8 mb-4">
                Online ({roomMembers.length})
              </div>
              {roomMembers.map((m) => (
                <div
                  key={m}
                  className="flex items-center gap-3 text-slate-200 font-medium py-1"
                >
                  <div className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_5px_#10b981]" />
                  {m}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex bg-slate-950 overflow-hidden font-sans">
      <aside className="w-64 border-r border-slate-800 bg-slate-900 p-4 flex flex-col shrink-0">
        <h1 className="font-black text-emerald-500 mb-8 italic">
          SUPA-CHAT PRO
        </h1>
        <div className="flex-1 space-y-1">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => setCurrentRoom(room.name)}
              className={`w-full text-left p-3 rounded-xl font-bold transition-all ${currentRoom === room.name ? "bg-emerald-600 text-white shadow-lg" : "text-slate-400 hover:bg-slate-800"}`}
            >
              # {room.name}
            </button>
          ))}
        </div>
        <button
          onClick={changeUsername}
          className="mt-auto p-3 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-700 transition-colors"
        >
          👤 EDIT PROFILE
        </button>
      </aside>

      <main className="flex-1 flex flex-col bg-slate-950 relative">
        <header className="h-14 border-b border-slate-800 flex items-center px-6 bg-slate-900/50 backdrop-blur-sm shrink-0">
          <span className="font-bold text-white text-lg">#{currentRoom}</span>
        </header>
        <MessageList
          messages={messages}
          username={username}
          scrollRef={scrollRef}
        />
        <InputBar
          content={content}
          setContent={setContent}
          sendMessage={sendMessage}
        />
      </main>

      <aside className="w-64 border-l border-slate-800 bg-slate-900 p-4 hidden lg:flex flex-col shrink-0">
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">
          ONLINE MEMBERS
        </span>
        <div className="space-y-3">
          {roomMembers.map((m) => (
            <div
              key={m}
              className="flex items-center gap-3 text-sm text-slate-300 font-medium"
            >
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_5px_#10b981]" />
              {m}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
