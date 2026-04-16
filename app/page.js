"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../src/lib/supabase";

export default function ChatApp() {
  const [username, setUsername] = useState("Guest-0000");
  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentRoom, setCurrentRoom] = useState("General");
  const [rooms, setRooms] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [typingUsers, setTypingUsers] = useState([]);

  const channelRef = useRef(null);
  const scrollRef = useRef(null);
  const typingRef = useRef(false);

  // Client-side initialization
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

  const setTyping = useCallback(async (isTyping) => {
    if (typingRef.current === isTyping) return;
    typingRef.current = isTyping;
    if (channelRef.current) {
      await channelRef.current.track({ room: currentRoom, isTyping });
    }
  }, [currentRoom]);

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
            if (p.isTyping && name !== username && !currentlyTyping.includes(name)) {
              currentlyTyping.push(name);
            }
          });
        });
        setOnlineUsers(usersByRoom);
        setTypingUsers(currentlyTyping);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          typingRef.current = false;
          await channel.track({ room: currentRoom, isTyping: false });
        }
      });

    return () => { channel.unsubscribe(); };
  }, [currentRoom, username]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: msgData } = await supabase
        .from("messages")
        .select("*")
        .ilike("content", `[${currentRoom}]%`)
        .order("created_at", { ascending: true });

      setMessages((msgData || []).map(msg => {
        const match = msg.content.match(/^\[([^\]]+)\]\s*(.*)$/);
        return { ...msg, text: match ? match[2] : msg.content };
      }));
      setLoading(false);
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
    const fetchRooms = async () => {
      const { data } = await supabase.from("rooms").select("name").order("name", { ascending: true });
      setRooms(data?.map(r => r.name) || ["General"]);
    };
    fetchRooms();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    const textToSend = content.trim();
    setContent("");
    setTyping(false);
    await supabase.from("messages").insert([{
      username: username.trim() || "Anon",
      content: `[${currentRoom}] ${textToSend}`,
    }]);
  };

  return (
    <div className="flex h-[100dvh] w-full bg-slate-950 text-slate-100 overflow-hidden relative">
      
      {/* SIDEBAR - Fixed on mobile, relative on desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-slate-900 border-r border-slate-800 transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-5 font-black text-xl text-emerald-500 border-b border-slate-800">
          SUPA-CHAT
        </div>
        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 mb-2">Rooms</p>
          {rooms.map((room) => (
            <button
              key={room}
              onClick={() => { setCurrentRoom(room); setSidebarOpen(false); }}
              className={`w-full flex items-center justify-between px-3 py-3 rounded-xl text-sm transition-colors ${
                currentRoom === room ? "bg-emerald-600 text-white" : "text-slate-400 hover:bg-slate-800"
              }`}
            >
              <span># {room}</span>
              {onlineUsers[room]?.length > 0 && (
                <span className="bg-slate-950/30 text-[10px] px-2 py-0.5 rounded-full">
                  {onlineUsers[room].length}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* MOBILE OVERLAY */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        
        {/* HEADER */}
        <header className="h-16 flex items-center justify-between px-4 bg-slate-900/50 border-b border-slate-800 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 text-slate-400 md:hidden hover:text-emerald-500"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
            </button>
            <h2 className="font-bold text-lg">#{currentRoom}</h2>
          </div>
          
          <input
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              localStorage.setItem("chat-username", e.target.value);
            }}
            className="w-28 md:w-36 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-500 outline-none"
          />
        </header>

        {/* CHAT MESSAGES */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {messages.map((msg, i) => {
            const isMe = msg.username === username;
            return (
              <div key={msg.id || i} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                <span className="text-[10px] text-slate-500 mb-1 px-1">
                  {isMe ? "You" : msg.username}
                </span>
                <div className={`max-w-[85%] md:max-w-[70%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                  isMe ? "bg-emerald-600 text-white rounded-tr-none" : "bg-slate-800 text-slate-100 rounded-tl-none"
                }`}>
                  {msg.text}
                </div>
              </div>
            );
          })}
          {typingUsers.length > 0 && (
            <div className="text-[11px] text-slate-500 italic animate-pulse">
              {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
            </div>
          )}
          <div ref={scrollRef} className="h-2" />
        </main>

        {/* INPUT FOOTER */}
        <footer className="p-3 md:p-4 bg-slate-900 border-t border-slate-800">
          <form onSubmit={sendMessage} className="flex gap-2 max-w-5xl mx-auto">
            <input
              value={content}
              onChange={(e) => { setContent(e.target.value); setTyping(e.target.value.length > 0); }}
              placeholder="Message..."
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-base md:text-sm focus:outline-none focus:border-emerald-500 transition-all shadow-inner"
            />
            <button className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 transition-all text-white px-5 md:px-8 rounded-xl font-bold text-sm shadow-lg shadow-emerald-900/20">
              Send
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
