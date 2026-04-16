"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../src/lib/supabase";

export default function ChatApp() {
  const [username, setUsername] = useState("Guest-0000");
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [currentRoom, setCurrentRoom] = useState("General");
  const [rooms, setRooms] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [typingUsers, setTypingUsers] = useState([]);

  const channelRef = useRef(null);
  const scrollRef = useRef(null);
  const typingRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem("chat-username");
    if (saved) {
      setUsername(saved);
    } else {
      const newName = `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem("chat-username", newName);
      setUsername(newName);
    }
  }, []);

  useEffect(() => {
    const channel = supabase.channel(`room-${currentRoom}-presence`, {
      config: { presence: { key: username } },
    });
    channelRef.current = channel;
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const usersByRoom = {};
        const currentlyTyping = [];
        Object.entries(state).forEach(([name, presenceArray]) => {
          presenceArray.forEach((p) => {
            if (!usersByRoom[p.room]) usersByRoom[p.room] = [];
            if (!usersByRoom[p.room].includes(name)) usersByRoom[p.room].push(name);
            if (p.isTyping && name !== username) currentlyTyping.push(name);
          });
        });
        setOnlineUsers(usersByRoom);
        setTypingUsers(currentlyTyping);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ room: currentRoom, isTyping: false });
        }
      });
    return () => { channel.unsubscribe(); };
  }, [currentRoom, username]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: msgData } = await supabase
        .from("messages")
        .select("*")
        .ilike("content", `[${currentRoom}]%`)
        .order("created_at", { ascending: true });

      setMessages((msgData || []).map(msg => {
        const match = msg.content.match(/^\[([^\]]+)\]\s*(.*)$/);
        return { ...msg, text: match ? match[2] : msg.content };
      }));
    };
    fetchData();

    const msgChannel = supabase.channel(`chat-${currentRoom}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        if (payload.new.content.startsWith(`[${currentRoom}]`)) {
          const text = payload.new.content.replace(`[${currentRoom}] `, "");
          setMessages(prev => [...prev, { ...payload.new, text }]);
        }
      }).subscribe();

    return () => { supabase.removeChannel(msgChannel); };
  }, [currentRoom]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    const textToSend = content.trim();
    setContent("");
    await supabase.from("messages").insert([{
      username: username.trim() || "Anon",
      content: `[${currentRoom}] ${textToSend}`,
    }]);
  };

  return (
    <div className="flex h-[100dvh] flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      
      {/* HEADER - BUTTON MOVED TO RIGHT */}
      <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 backdrop-blur-md z-30">
        <div className="flex flex-col">
          <h1 className="text-xs font-black tracking-tighter text-emerald-500">SUPA-CHAT</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase">#{currentRoom}</p>
        </div>

        <div className="flex items-center gap-3">
          <input
            value={username}
            onChange={(e) => { setUsername(e.target.value); localStorage.setItem("chat-username", e.target.value); }}
            className="w-24 rounded-full bg-slate-800 border border-slate-700 px-3 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {/* Collapse Button on the Right */}
          <button 
            onClick={() => setSidebarOpen(true)} 
            className="md:hidden p-2 bg-slate-800 rounded-lg text-emerald-500 active:bg-slate-700 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
            </svg>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* SIDEBAR - Slides in from Right now */}
        <aside className={`absolute inset-y-0 right-0 z-50 w-64 transform bg-slate-900 transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"}`}>
          <div className="flex flex-col h-full border-l border-slate-800">
            <div className="p-4 flex justify-between items-center border-b border-slate-800">
              <span className="font-bold text-xs uppercase tracking-widest text-slate-500">Rooms</span>
              <button onClick={() => setSidebarOpen(false)} className="md:hidden text-slate-500 p-1">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-4">
              {["General", "Dev", "Random"].map((room) => (
                <button
                  key={room}
                  onClick={() => { setCurrentRoom(room); setSidebarOpen(false); }}
                  className={`flex w-full items-center justify-between rounded-xl px-4 py-3 mb-2 text-sm font-medium transition-all ${currentRoom === room ? "bg-emerald-600 text-white shadow-lg shadow-emerald-900/20" : "text-slate-400 hover:bg-slate-800"}`}
                >
                  # {room}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* OVERLAY */}
        {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden" />}

        {/* CHAT AREA */}
        <main className="flex flex-1 flex-col bg-slate-950">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`flex flex-col ${msg.username === username ? "items-end" : "items-start"}`}>
                <span className="mb-1 text-[10px] font-medium text-slate-500 px-1">{msg.username}</span>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${msg.username === username ? "bg-emerald-600 text-white rounded-tr-none shadow-md" : "bg-slate-800 text-slate-200 rounded-tl-none border border-slate-700/50"}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {typingUsers.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <div className="flex gap-1">
                  <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce"></span>
                  <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                </div>
                <p className="text-[10px] italic text-slate-500">{typingUsers[0]} is typing...</p>
              </div>
            )}
            <div ref={scrollRef} className="h-4" />
          </div>

          {/* INPUT AREA */}
          <footer className="border-t border-slate-800 bg-slate-900/50 p-3 pb-safe">
            <form onSubmit={sendMessage} className="flex gap-2 items-center max-w-4xl mx-auto">
              <input
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Message..."
                className="flex-1 rounded-2xl bg-slate-800 border border-slate-700 px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50 md:text-sm placeholder:text-slate-500"
              />
              <button className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg active:scale-95 transition-transform hover:bg-emerald-500">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </form>
          </footer>
        </main>
      </div>
    </div>
  );
}
