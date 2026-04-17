"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../src/lib/supabase";
import { toast, Toaster } from "sonner";
import { formatDistanceToNow } from "date-fns";

// ================= TYPES =================
interface Message {
  id: string;
  room_name: string;
  username: string;
  content: string;
  created_at: string;
}

interface Room {
  id: string;
  name: string;
  created_by: string | null;
}

export default function ChatApp() {
  // prevent duplicate realtime subscriptions (IMPORTANT FIX)
  const channelRef = useRef<any>(null);

  // ================= STATE =================
  const [username, setUsername] = useState(() => {
    if (typeof window === "undefined") return "Guest-0000";
    const saved = localStorage.getItem("chat-username");
    return saved || `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  const [currentRoom, setCurrentRoom] = useState("general");
  const [rooms, setRooms] = useState<Room[]>([]);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  const [newRoomName, setNewRoomName] = useState("");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  // ================= REFS =================
  const scrollRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ================= HELPERS =================
  const norm = (v: string) => v.trim().toLowerCase();

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  // ================= FETCH DATA =================
  const fetchInitial = useCallback(async () => {
    setLoading(true);

    const { data: roomsData } = await supabase
      .from("rooms")
      .select("*")
      .order("name");

    const { data: messagesData } = await supabase
      .from("messages")
      .select("*")
      .eq("room_name", norm(currentRoom))
      .order("created_at", { ascending: true });

    setRooms((roomsData as Room[]) || []);
    setMessages((messagesData as Message[]) || []);

    setLoading(false);
    setTimeout(scrollToBottom, 50);
  }, [currentRoom, scrollToBottom]);

  // ================= REALTIME =================
  useEffect(() => {
    fetchInitial();

    // cleanup old channel (FIX DUPLICATE MESSAGES)
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase.channel(`room-${norm(currentRoom)}`);
    channelRef.current = channel;

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_name=eq.${norm(currentRoom)}`,
        },
        (payload) => {
          const msg = payload.new as Message;

          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });

          setTimeout(scrollToBottom, 20);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms" },
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            setRooms((prev) => [...prev, payload.new as Room]);
          }

          if (payload.eventType === "DELETE") {
            setRooms((prev) => prev.filter((r) => r.id !== payload.old.id));
          }
        },
      )
      .on("broadcast", { event: "typing" }, (payload: any) => {
        const { user, isTyping } = payload.payload;

        setTypingUsers((prev) =>
          isTyping
            ? Array.from(new Set([...prev, user]))
            : prev.filter((u) => u !== user),
        );
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentRoom, fetchInitial, scrollToBottom]);

  // ================= SEND MESSAGE =================
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    const text = content.trim();
    setContent("");

    const { error } = await supabase.from("messages").insert({
      room_name: norm(currentRoom),
      username,
      content: text,
    });

    if (error) {
      toast.error("Message failed");
      console.error(error);
      return;
    }

    scrollToBottom();
  };

  // ================= ROOMS =================
  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();

    const name = norm(newRoomName);
    if (!name) return;

    const { error } = await supabase.from("rooms").insert({
      name,
      created_by: username,
    });

    if (error) {
      toast.error("Room creation failed");
      return;
    }

    setNewRoomName("");
    setIsCreatingRoom(false);
    toast.success("Room created");
  };

  const deleteRoom = async (room: Room) => {
    if (!confirm(`Delete #${room.name}?`)) return;

    const { error } = await supabase.from("rooms").delete().eq("id", room.id);

    if (error) {
      toast.error("Delete failed");
      return;
    }
  };

  // ================= TYPING =================
  const handleTyping = (val: string) => {
    setContent(val);

    const channel = supabase.channel(`room-${norm(currentRoom)}`);

    channel.send({
      type: "broadcast",
      event: "typing",
      payload: { user: username, isTyping: val.length > 0 },
    });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      channel.send({
        type: "broadcast",
        event: "typing",
        payload: { user: username, isTyping: false },
      });
    }, 1200);
  };

  // ================= UI =================
  return (
    <div className="flex h-screen bg-slate-950 text-white">
      <Toaster theme="dark" />

      {/* SIDEBAR */}
      <aside className={`w-72 bg-slate-900 border-r border-slate-800 p-4`}>
        <div className="flex justify-between items-center mb-4">
          <h1 className="font-bold text-emerald-400">SupaChat</h1>
          <button onClick={() => setIsCreatingRoom(true)}>+</button>
        </div>

        {rooms.map((room) => (
          <div key={room.id} className="flex justify-between items-center">
            <button
              className={`text-left p-2 w-full ${
                norm(currentRoom) === room.name ? "text-emerald-400" : ""
              }`}
              onClick={() => setCurrentRoom(room.name)}
            >
              # {room.name}
            </button>

            {room.created_by === username && (
              <button onClick={() => deleteRoom(room)} className="text-red-400">
                🗑
              </button>
            )}
          </div>
        ))}
      </aside>

      {/* CHAT */}
      <main className="flex-1 flex flex-col">
        <header className="p-4 border-b border-slate-800 flex justify-between">
          <div># {currentRoom}</div>

          <input
            className="bg-transparent text-emerald-400 outline-none text-right"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="text-slate-500">Loading...</div>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-md p-3 rounded-xl ${
                  m.username === username
                    ? "bg-emerald-600 ml-auto"
                    : "bg-slate-800"
                }`}
              >
                <div className="text-xs text-slate-300 flex justify-between">
                  <span>{m.username}</span>
                  <span>
                    {formatDistanceToNow(new Date(m.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <div>{m.content}</div>
              </div>
            ))
          )}

          {typingUsers.length > 0 && (
            <div className="text-xs text-slate-500 italic">
              {typingUsers.join(", ")} typing...
            </div>
          )}
        </div>

        <form
          onSubmit={sendMessage}
          className="p-4 border-t border-slate-800 flex gap-2"
        >
          <input
            className="flex-1 bg-slate-800 p-2 rounded"
            value={content}
            onChange={(e) => handleTyping(e.target.value)}
            placeholder="Message..."
          />
          <button className="bg-emerald-600 px-4 rounded">Send</button>
        </form>
      </main>

      {/* CREATE ROOM MODAL */}
      {isCreatingRoom && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
          <form
            onSubmit={createRoom}
            className="bg-slate-900 p-6 rounded-xl w-80"
          >
            <input
              className="w-full p-2 bg-slate-800 mb-3"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="room name"
            />
            <button className="bg-emerald-600 w-full p-2 rounded">
              Create
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
