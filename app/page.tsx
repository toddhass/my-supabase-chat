"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../src/lib/supabase";
import { toast, Toaster } from "sonner";
import { formatDistanceToNow } from "date-fns";

// ==================== TYPES ====================
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
  created_by: string;
}

export default function ChatApp() {
  const [hasMounted, setHasMounted] = useState(false);

  // ==================== STATE ====================
  const [username, setUsername] = useState<string>(() => {
    if (typeof window === "undefined") return "Guest-0000";
    const saved = localStorage.getItem("chat-username");
    return saved || `Guest-${Math.floor(1000 + Math.random() * 9000)}`;
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [currentRoom, setCurrentRoom] = useState<string>("General");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  const [newRoomName, setNewRoomName] = useState("");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastSendTimeRef = useRef<Record<string, number>>({});

  useEffect(() => {
    setHasMounted(true);
  }, []);

  // ==================== UTILITIES ====================
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  const isNearBottom = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return true;
    const { scrollTop, scrollHeight, clientHeight } = container;
    return scrollHeight - scrollTop - clientHeight < 200;
  }, []);

  // ==================== FETCH & REALTIME ====================
  useEffect(() => {
    if (!hasMounted) return;
    let mounted = true;

    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: roomData } = await supabase
          .from("rooms")
          .select("*")
          .order("name");
        if (mounted && roomData) {
          // Use a Map or a filter to ensure initial fetch doesn't have duplicates
          setRooms(roomData as Room[]);
        }

        const { data: msgData, error } = await supabase
          .from("messages")
          .select("*")
          .eq("room_name", currentRoom)
          .order("created_at", { ascending: true });

        if (error) throw error;
        if (mounted) {
          setMessages((msgData as Message[]) || []);
          setTimeout(() => scrollToBottom("auto"), 50);
        }
      } catch (err) {
        console.error(err);
        toast.error("Connection error");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchData();

    const channel = supabase
      .channel(`global-chat-sync`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_name=eq.${currentRoom}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => String(m.id) === String(newMsg.id)))
              return prev;
            const filtered = prev.filter(
              (m) =>
                !(
                  m.username === newMsg.username &&
                  String(m.id).startsWith("temp-")
                ),
            );
            return [...filtered, newMsg];
          });
          if (isNearBottom()) setTimeout(() => scrollToBottom(), 10);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const newRoom = payload.new as Room;
            setRooms((prev) => {
              // CRITICAL FIX: Check for duplicate ID before adding
              if (prev.some((r) => r.id === newRoom.id)) return prev;
              return [...prev, newRoom].sort((a, b) =>
                a.name.localeCompare(b.name),
              );
            });
            toast.success(`New room: #${newRoom.name}`);
          } else if (payload.eventType === "DELETE") {
            const deletedRoom = payload.old as { id: string };
            setRooms((prev) => {
              const updated = prev.filter((r) => r.id !== deletedRoom.id);
              // If the user was in the room that got deleted, kick them to General
              const wasInDeleted = prev.find(
                (r) => r.id === deletedRoom.id && r.name === currentRoom,
              );
              if (wasInDeleted) {
                setCurrentRoom("General");
                toast.error("The room you were in was deleted.");
              }
              return updated;
            });
          }
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [currentRoom, scrollToBottom, isNearBottom, hasMounted]);

  // ==================== ROOM ACTIONS ====================
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newRoomName.trim().replace(/\s+/g, "-").toLowerCase();
    if (!name) return;

    try {
      const { error } = await supabase.from("rooms").insert({
        name,
        created_by: username,
      });
      if (error) throw error;
      setNewRoomName("");
      setIsCreatingRoom(false);
    } catch (err) {
      toast.error("Room name already exists!");
    }
  };

  const handleDeleteRoom = async (roomId: string, roomName: string) => {
    if (!confirm(`Are you sure you want to delete #${roomName}?`)) return;

    try {
      const { error } = await supabase.from("rooms").delete().eq("id", roomId);
      if (error) throw error;
      toast.success("Room deleted");
    } catch (err) {
      toast.error("Failed to delete room");
    }
  };

  // ==================== SEND MESSAGE ====================
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || sending) return;

    const textToSubmit = content.trim();
    const optimisticId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      room_name: currentRoom,
      username,
      content: textToSubmit,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setContent("");
    setSending(true);

    try {
      const { error } = await supabase.from("messages").insert({
        room_name: currentRoom,
        username,
        content: textToSubmit,
      });
      if (error) throw error;
      scrollToBottom();
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      toast.error("Failed to send");
      setContent(textToSubmit);
    } finally {
      setSending(false);
    }
  };

  if (!hasMounted) return <div className="h-screen bg-slate-950" />;

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <Toaster position="top-center" richColors theme="dark" />

      {/* --- SIDEBAR --- */}
      <aside
        className={`${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 fixed md:static inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300`}
      >
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <span className="text-xl font-black text-emerald-500 italic tracking-tighter uppercase">
            SupaChat
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-slate-500"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <div className="flex items-center justify-between px-2 mb-2">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              Channels
            </p>
            <button
              onClick={() => setIsCreatingRoom(true)}
              className="text-emerald-500 hover:text-emerald-400 text-lg font-bold"
            >
              +
            </button>
          </div>

          {rooms.map((room) => (
            <div key={room.id} className="group flex items-center gap-1">
              <button
                onClick={() => {
                  setCurrentRoom(room.name);
                  setSidebarOpen(false);
                }}
                className={`flex-1 text-left px-4 py-2 rounded-xl text-sm transition-all ${currentRoom === room.name ? "bg-emerald-600 text-white shadow-lg font-bold" : "text-slate-400 hover:bg-slate-800"}`}
              >
                # {room.name}
              </button>
              {room.created_by === username && (
                <button
                  onClick={() => handleDeleteRoom(room.id, room.name)}
                  className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-500 transition-all"
                  title="Delete Room"
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* --- MAIN CHAT --- */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden text-emerald-500 text-2xl"
            >
              ☰
            </button>
            <h2 className="font-bold text-lg">#{currentRoom}</h2>
          </div>
          <input
            type="text"
            value={username}
            onChange={(e) => {
              const val = e.target.value.slice(0, 15);
              setUsername(val);
              localStorage.setItem("chat-username", val);
            }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-xs text-emerald-400 outline-none w-32 focus:border-emerald-500"
          />
        </header>

        <main
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-slate-950"
        >
          {loading ? (
            <div className="h-full flex items-center justify-center text-slate-600 animate-pulse text-xs tracking-widest">
              SYNCING...
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.username === username ? "items-end" : "items-start"} ${String(msg.id).startsWith("temp-") ? "opacity-40" : ""}`}
              >
                <div
                  className={`flex items-center gap-2 mb-1.5 ${msg.username === username ? "flex-row-reverse" : ""}`}
                >
                  <span className="text-[10px] font-black text-emerald-500 uppercase">
                    {msg.username}
                  </span>
                  <span className="text-[9px] text-slate-700">
                    {msg.created_at
                      ? formatDistanceToNow(new Date(msg.created_at), {
                          addSuffix: true,
                        })
                      : "Sending..."}
                  </span>
                </div>
                <div
                  className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[14px] ${msg.username === username ? "bg-emerald-600 text-white rounded-tr-none" : "bg-slate-800 text-slate-100 rounded-tl-none"}`}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}
        </main>

        <footer className="p-4 bg-slate-900 border-t border-slate-800">
          <form onSubmit={sendMessage} className="max-w-4xl mx-auto flex gap-3">
            <input
              type="text"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={`Message #${currentRoom}...`}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-5 py-3 outline-none focus:border-emerald-500 text-sm"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={!content.trim() || sending}
              className="bg-emerald-600 hover:bg-emerald-500 px-8 rounded-xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-900/20"
            >
              {sending ? "..." : "Send"}
            </button>
          </form>
        </footer>
      </div>

      {/* --- CREATE ROOM MODAL --- */}
      {isCreatingRoom && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateRoom}
            className="bg-slate-900 border border-slate-800 p-8 rounded-3xl w-full max-w-sm shadow-2xl"
          >
            <h3 className="text-xl font-bold mb-4 text-emerald-500">
              Create New Channel
            </h3>
            <input
              autoFocus
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="channel-name"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:border-emerald-500 mb-6"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsCreatingRoom(false)}
                className="flex-1 py-3 text-slate-400 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-emerald-600 py-3 rounded-xl font-bold shadow-lg shadow-emerald-900/40"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
