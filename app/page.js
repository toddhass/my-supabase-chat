"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../src/lib/supabase";

export default function ChatApp() {
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
const [sidebarOpen, setSidebarOpen] = useState(false); // default closed on mobile
const [onlineUsers, setOnlineUsers] = useState({});
const [typingUsers, setTypingUsers] = useState([]);
const [recentUsers, setRecentUsers] = useState([]);

const channelRef = useRef(null);
const scrollRef = useRef(null);
const typingRef = useRef(false);

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

useEffect(() => {
const channel = supabase.channel(`room-${currentRoom}-presence`, {
config: { presence: { key: username } },
});
channelRef.current = channel;

```
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
```

}, [currentRoom, username, setTyping]);

useEffect(() => {
const fetchData = async () => {
setLoading(true);

```
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
```

}, [currentRoom, username]);

useEffect(() => {
const fetchRooms = async () => {
const { data } = await supabase
.from("rooms")
.select("name")
.order("name", { ascending: true });

```
  setRooms(data?.map((r) => r.name) || ["General"]);
};

fetchRooms();
```

}, []);

useEffect(() => {
scrollRef.current?.scrollIntoView({ behavior: "smooth" });
}, [messages, typingUsers]);

const handleInputChange = (e) => {
setContent(e.target.value);
setTyping(e.target.value.trim().length > 0);
};

const sendMessage = async (e) => {
e.preventDefault();
if (!content.trim()) return;

```
const textToSend = content.trim();
setContent("");
await setTyping(false);

await supabase.from("messages").insert([
  {
    username: username.trim() || "Anon",
    content: `[${currentRoom}] ${textToSend}`,
  },
]);
```

};

return ( <div className="flex h-dvh w-full bg-slate-950 text-slate-100 font-sans">
{/* Sidebar */}
<aside
className={`           fixed md:relative z-40
          h-full md:h-auto
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0
          w-72 md:w-80
          transition-transform duration-300
          bg-slate-900 border-r border-slate-800
          flex flex-col
        `}
> <div className="p-4 md:p-6 border-b border-slate-800 text-lg md:text-xl font-black text-emerald-500 italic">
SUPA-CHAT </div>

```
    <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-6">
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
              setSidebarOpen(false); // close on mobile
            }}
            className={`w-full flex justify-between px-3 py-2 rounded-lg text-sm mb-1 ${
              currentRoom === room
                ? "bg-emerald-600 text-white"
                : "hover:bg-slate-800 text-slate-400"
            }`}
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
    </div>
  </aside>

  {/* Backdrop */}
  {sidebarOpen && (
    <div
      className="fixed inset-0 bg-black/50 z-30 md:hidden"
      onClick={() => setSidebarOpen(false)}
    />
  )}

  {/* Main */}
  <div className="flex-1 flex flex-col min-w-0">
    <header className="h-14 md:h-16 px-3 md:px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="text-emerald-500 text-xl"
      >
        ☰
      </button>

      <h2 className="font-bold text-base md:text-lg">
        #{currentRoom}
      </h2>

      <input
        value={username}
        onChange={(e) => {
          setUsername(e.target.value);
          localStorage.setItem("chat-username", e.target.value);
        }}
        className="w-24 md:w-32 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px]"
      />
    </header>

    <main className="flex-1 overflow-y-auto p-3 md:p-6 space-y-4">
      {messages.map((msg, i) => {
        const isMe = msg.username === username;
        return (
          <div
            key={i}
            className={`flex flex-col ${
              isMe ? "items-end" : "items-start"
            }`}
          >
            <div className="text-[10px] text-slate-400 mb-1">
              {isMe ? "You" : msg.username}
            </div>
            <div
              className={
                isMe ? "chat-bubble-me" : "chat-bubble-them"
              }
            >
              {msg.text}
            </div>
          </div>
        );
      })}

      {typingUsers.length > 0 && (
        <div className="text-xs text-slate-500 italic">
          {typingUsers.join(", ")} typing...
        </div>
      )}

      <div ref={scrollRef} />
    </main>

    <footer className="sticky bottom-0 p-2 md:p-4 bg-slate-900 border-t border-slate-800">
      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          value={content}
          onChange={handleInputChange}
          placeholder="Message..."
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        />
        <button className="bg-emerald-600 px-4 md:px-6 rounded-lg text-xs font-bold">
          Send
        </button>
      </form>
    </footer>
  </div>
</div>
```

);
}
