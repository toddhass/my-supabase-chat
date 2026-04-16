"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../src/lib/supabase";

export default function ChatApp() {
  // --- 1. STATE & IDENTITY ---
  const [username, setUsername] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("chat-username");
      if (saved) return saved;
      const newName = `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
      localStorage.setItem("chat-username", newName);
      return newName;
    }
    return "Guest-0000";
  });

  const [messages, setMessages] = useState([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentRoom, setCurrentRoom] = useState("General");
  const [rooms, setRooms] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [onlineUsers, setOnlineUsers] = useState({});
  const [typingUsers, setTypingUsers] = useState([]);
  const [recentUsers, setRecentUsers] = useState([]); // NEW: Offline/Recent users

  const channelRef = useRef(null);
  const scrollRef = useRef(null);
  const typingRef = useRef(false);

  // --- 2. STABLE TYPING SETTER ---
  const setTyping = useCallback(
    async (isTyping) => {
      if (typingRef.current === isTyping) return;
      typingRef.current = isTyping;
      if (channelRef.current) {
        await channelRef.current.track({
          room: currentRoom,
          isTyping: isTyping,
        });
      }
    },
    [currentRoom],
  );

  // --- 3. PRESENCE SYNC ---
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
            if (!usersByRoom[p.room].includes(name))
              usersByRoom[p.room].push(name);
            if (p.isTyping && name !== username) {
              if (!currentlyTyping.includes(name)) currentlyTyping.push(name);
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

    return () => {
      setTyping(false);
      channel.unsubscribe();
    };
  }, [currentRoom, username, setTyping]);

  // --- 4. DATA FETCHING (MESSAGES & RECENT USERS) ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Fetch Messages
      const { data: msgData } = await supabase
        .from("messages")
        .select("*")
        .ilike("content", `[${currentRoom}]%`)
        .order("created_at", { ascending: true });

      const parsedMsgs = (msgData || []).map((msg) => {
        const match = msg.content.match(/^\[([^\]]+)\]\s*(.*)$/);
        return { ...msg, text: match ? match[2] : msg.content };
      });
      setMessages(parsedMsgs);

      // Extract unique usernames from the last 50 messages for "Recent Users"
      const uniqueNames = [
        ...new Set(parsedMsgs.map((m) => m.username)),
      ].filter((n) => n !== username);
      setRecentUsers(uniqueNames);

      setLoading(false);
    };
    fetchData();

    const msgChannel = supabase
      .channel(`chat-${currentRoom}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          if (payload.new.content.startsWith(`[${currentRoom}]`)) {
            const text = payload.new.content.replace(`[${currentRoom}] `, "");
            const newMsg = { ...payload.new, text };
            setMessages((prev) => [...prev, newMsg]);

            // Update recent users if a new person speaks
            setRecentUsers((prev) => {
              if (
                !prev.includes(newMsg.username) &&
                newMsg.username !== username
              ) {
                return [newMsg.username, ...prev].slice(0, 10);
              }
              return prev;
            });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(msgChannel);
    };
  }, [currentRoom, username]);

  useEffect(() => {
    const fetchRooms = async () => {
      const { data } = await supabase
        .from("rooms")
        .select("name")
        .order("name", { ascending: true });
      setRooms(data?.map((r) => r.name) || ["General"]);
    };
    fetchRooms();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  // --- 5. ACTIONS ---
  const handleInputChange = (e) => {
    setContent(e.target.value);
    setTyping(e.target.value.trim().length > 0);
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    const textToSend = content.trim();
    setContent("");
    await setTyping(false);
    await supabase.from("messages").insert([
      {
        username: username.trim() || "Anon",
        content: `[${currentRoom}] ${textToSend}`,
      },
    ]);
  };

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* SIDEBAR */}
      <aside
        className={`${sidebarOpen ? "w-80" : "w-0"} transition-all duration-300 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 overflow-hidden`}
      >
        <div className="p-6 border-b border-slate-800 shrink-0 text-xl font-black text-emerald-500 italic tracking-tighter">
          SUPA-CHAT
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* ROOMS LIST */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase px-2 mb-2">
              Rooms
            </p>
            {rooms.map((room) => (
              <button
                key={room}
                onClick={() => {
                  setCurrentRoom(room);
                  setContent("");
                }}
                className={`w-full flex items-center justify-between px-4 py-2 rounded-xl text-sm transition-all mb-1 ${currentRoom === room ? "bg-emerald-600 text-white font-bold" : "hover:bg-slate-800 text-slate-400"}`}
              >
                <span># {room}</span>
                {onlineUsers[room]?.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700/50">
                    {onlineUsers[room].length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ONLINE NOW */}
          <div>
            <p className="text-[10px] font-bold text-emerald-500 uppercase px-2 mb-2">
              Online Now
            </p>
            <div className="space-y-1 px-2">
              {(onlineUsers[currentRoom] || []).map((u) => (
                <div
                  key={u}
                  className="flex items-center gap-2 text-xs text-slate-300"
                >
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                  {u === username ? "You" : u}
                </div>
              ))}
            </div>
          </div>

          {/* RECENTLY ACTIVE (OFFLINE) */}
          {recentUsers.filter(
            (u) => !(onlineUsers[currentRoom] || []).includes(u),
          ).length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase px-2 mb-2">
                Recently Active
              </p>
              <div className="space-y-1 px-2">
                {recentUsers
                  .filter((u) => !(onlineUsers[currentRoom] || []).includes(u))
                  .map((u) => (
                    <div
                      key={u}
                      className="flex items-center gap-2 text-xs text-slate-500"
                    >
                      <span className="w-1.5 h-1.5 bg-slate-700 rounded-full"></span>
                      {u}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN CHAT */}
      <div className="flex-1 flex flex-col min-w-0 bg-slate-950">
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 bg-slate-900/50">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-emerald-500 text-2xl"
            >
              ☰
            </button>
            <h2 className="font-bold text-lg">#{currentRoom}</h2>
          </div>
          <input
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              localStorage.setItem("chat-username", e.target.value);
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-[10px] text-emerald-400 font-bold w-32 outline-none focus:border-emerald-500"
          />
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="text-center animate-pulse text-slate-600 mt-10 text-xs">
              Syncing...
            </div>
          ) : (
            <>
              {messages.map((msg, i) => {
                const isMe = msg.username === username;
                return (
                  <div
                    key={msg.id || i}
                    className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`flex items-center gap-2 mb-1 px-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}
                    >
                      <span
                        className={`text-[10px] font-bold uppercase ${isMe ? "text-slate-400" : "text-emerald-500"}`}
                      >
                        {isMe ? "You" : msg.username}
                      </span>
                      <span className="text-[9px] text-slate-600">
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div
                      className={isMe ? "chat-bubble-me" : "chat-bubble-them"}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })}

              {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 px-2 py-2">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                  </div>
                  <span className="text-[10px] text-slate-500 italic font-medium">
                    {typingUsers.join(", ")} is typing...
                  </span>
                </div>
              )}
            </>
          )}
          <div ref={scrollRef} />
        </main>

        <footer className="p-4 bg-slate-900 border-t border-slate-800 shrink-0">
          <form onSubmit={sendMessage} className="max-w-5xl mx-auto flex gap-2">
            <input
              type="text"
              value={content}
              onChange={handleInputChange}
              placeholder={`Message #${currentRoom}...`}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 text-white outline-none"
            />
            <button
              type="submit"
              disabled={!content.trim()}
              className="bg-emerald-600 px-8 rounded-xl font-bold text-xs text-white uppercase active:scale-95 transition-all"
            >
              Send
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
