"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, MessageSquare, Search, Send, X } from "lucide-react";

type ChatUser = {
  id: string;
  name: string | null;
  email: string;
  role: "ADMIN" | "SUB_ADMIN" | "INTERNAL_STAFF" | "USER";
};

type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  sender: { id: string; name: string | null; email: string };
};

type OpenChat = {
  conversationId: string;
  user: ChatUser;
  messages: ChatMessage[];
  inputValue: string;
  isMinimized: boolean;
  isLoading: boolean;
  unreadCount: number;
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  SUB_ADMIN: "Agent",
  INTERNAL_STAFF: "Case Manager",
  USER: "Applicant",
};
const CHAT_MESSAGES_POLL_MS = process.env.NODE_ENV === "development" ? 20_000 : 10_000;
const CHAT_UNREAD_POLL_MS = process.env.NODE_ENV === "development" ? 20_000 : 8_000;

function getInitial(user: ChatUser) {
  return (user.name || user.email)[0].toUpperCase();
}

export function ChatPopup({ currentUserId }: { currentUserId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [openChats, setOpenChats] = useState<OpenChat[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [serverUnreadCount, setServerUnreadCount] = useState(0);
  const [showIncomingHint, setShowIncomingHint] = useState(false);
  const openChatsRef = useRef<OpenChat[]>([]);
  const optimisticCounterRef = useRef(0);
  const prevServerUnreadRef = useRef(0);
  const unreadInitRef = useRef(false);
  const incomingHintTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    openChatsRef.current = openChats;
  }, [openChats]);

  // Load user list once
  useEffect(() => {
    fetch("/api/chat/users")
      .then((r) => r.json())
      .then((data) => setUsers(data.users ?? []))
      .catch(() => {});
  }, []);

  const fetchMessages = useCallback(
    async (conversationId: string, silent = false) => {
      try {
        const res = await fetch(
          `/api/chat/conversations/${conversationId}/messages`,
        );
        if (!res.ok) return;
        const data = await res.json();
        const newMessages: ChatMessage[] = data.messages ?? [];

        setOpenChats((prev) =>
          prev.map((c) => {
            if (c.conversationId !== conversationId) return c;
            const prevCount = c.messages.length;
            const added = newMessages.length - prevCount;
            const newUnread = silent
              ? c.isMinimized
                ? c.unreadCount + Math.max(0, added)
                : 0
              : 0;
            return {
              ...c,
              messages: newMessages,
              unreadCount: newUnread,
            };
          }),
        );
      } catch {
        // network error – ignore silently
      }
    },
    [],
  );

  const ensureDirectConversation = useCallback(
    async (targetUserId: string, createIfMissing: boolean) => {
      const res = await fetch("/api/chat/conversations/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, createIfMissing }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        conversation: {
          id: string;
          messages?: ChatMessage[];
        } | null;
      };
      return data.conversation;
    },
    [],
  );

  // Poll all non-minimized open chats.
  useEffect(() => {
    if (openChats.length === 0) return;
    const interval = setInterval(() => {
      for (const chat of openChatsRef.current) {
        if (chat.conversationId) {
          fetchMessages(chat.conversationId, true);
        }
      }
    }, CHAT_MESSAGES_POLL_MS);
    return () => clearInterval(interval);
  }, [openChats.length, fetchMessages]);

  // Poll unread count from server so users get notified even when chats are not open.
  useEffect(() => {
    let cancelled = false;

    const fetchUnread = async () => {
      try {
        const res = await fetch("/api/chat/unread-count", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number };
        const next = Math.max(0, Number(data.count ?? 0));
        if (cancelled) return;

        setServerUnreadCount(next);
        if (unreadInitRef.current && next > prevServerUnreadRef.current) {
          setShowIncomingHint(true);
          if (incomingHintTimeoutRef.current) {
            clearTimeout(incomingHintTimeoutRef.current);
          }
          incomingHintTimeoutRef.current = setTimeout(() => {
            setShowIncomingHint(false);
          }, 3500);
        }
        prevServerUnreadRef.current = next;
        unreadInitRef.current = true;
      } catch {
        // ignore fetch errors
      }
    };

    void fetchUnread();
    const interval = setInterval(fetchUnread, CHAT_UNREAD_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (incomingHintTimeoutRef.current) {
        clearTimeout(incomingHintTimeoutRef.current);
      }
    };
  }, []);

  const totalUnread = openChats.reduce((acc, c) => acc + c.unreadCount, 0);
  const visibleUnread = Math.max(totalUnread, serverUnreadCount);

  const openChat = async (user: ChatUser) => {
    // If already open, un-minimise it
    const existing = openChats.find((c) => c.user.id === user.id);
    if (existing) {
      setOpenChats((prev) =>
        prev.map((c) =>
          c.user.id === user.id
            ? { ...c, isMinimized: false, unreadCount: 0 }
            : c,
        ),
      );
      setIsOpen(false);
      return;
    }

    // Cap at 3 windows – drop oldest if necessary
    if (openChats.length >= 3) {
      setOpenChats((prev) => prev.slice(1));
    }

    const placeholder: OpenChat = {
      conversationId: "",
      user,
      messages: [],
      inputValue: "",
      isMinimized: false,
      isLoading: true,
      unreadCount: 0,
    };
    setOpenChats((prev) => [...prev, placeholder]);
    setIsOpen(false);

    try {
      const conversation = await ensureDirectConversation(user.id, false);
      setOpenChats((prev) =>
        prev.map((c) => {
          if (c.user.id !== user.id) return c;
          return {
            ...c,
            conversationId: conversation?.id ?? "",
            messages: conversation?.messages ?? [],
            isLoading: false,
          };
        }),
      );
    } catch {
      setOpenChats((prev) => prev.filter((c) => c.user.id !== user.id));
    }
  };

  const closeChat = (userId: string) =>
    setOpenChats((prev) => prev.filter((c) => c.user.id !== userId));

  const toggleMinimize = (userId: string) =>
    setOpenChats((prev) =>
      prev.map((c) =>
        c.user.id === userId
          ? { ...c, isMinimized: !c.isMinimized, unreadCount: 0 }
          : c,
      ),
    );

  const sendMessage = async (chatUserId: string) => {
    const chat = openChatsRef.current.find((c) => c.user.id === chatUserId);
    if (!chat) return;
    const content = chat.inputValue.trim();
    if (!content) return;

    let conversationId = chat.conversationId;
    if (!conversationId) {
      try {
        const conversation = await ensureDirectConversation(chat.user.id, true);
        if (!conversation) return;
        conversationId = conversation.id;
        setOpenChats((prev) =>
          prev.map((c) =>
            c.user.id === chatUserId
              ? {
                  ...c,
                  conversationId,
                  messages: conversation.messages ?? c.messages,
                  isLoading: false,
                }
              : c,
          ),
        );
      } catch {
        return;
      }
    }

    // Optimistic message so the UI feels instant
    optimisticCounterRef.current += 1;
    const optimistic: ChatMessage = {
      id: `opt-${optimisticCounterRef.current}`,
      conversationId,
      senderId: currentUserId,
      content,
      createdAt: new Date().toISOString(),
      sender: { id: currentUserId, name: "You", email: "" },
    };

    setOpenChats((prev) =>
      prev.map((c) =>
        c.user.id === chatUserId
          ? { ...c, messages: [...c.messages, optimistic], inputValue: "" }
          : c,
      ),
    );

    try {
      await fetch(`/api/chat/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      // Replace optimistic with real data
      await fetchMessages(conversationId);
    } catch {
      // Remove optimistic on failure
      setOpenChats((prev) =>
        prev.map((c) =>
          c.user.id === chatUserId
            ? {
                ...c,
                messages: c.messages.filter((m) => m.id !== optimistic.id),
                inputValue: content,
              }
            : c,
        ),
      );
    }
  };

  const uniqueUsers = users.filter(
    (user, index, all) =>
      all.findIndex(
        (candidate) => candidate.email.toLowerCase() === user.email.toLowerCase(),
      ) === index,
  );

  const filteredUsers = uniqueUsers.filter(
    (u) =>
      (u.name ?? u.email).toLowerCase().includes(userSearch.toLowerCase()) ||
      u.email.toLowerCase().includes(userSearch.toLowerCase()),
  );

  return (
    <div className="fixed bottom-0 left-2 right-2 z-50 flex max-w-[calc(100vw-1rem)] items-end justify-end gap-2 overflow-x-auto sm:left-auto sm:right-4 sm:max-w-none">
      {/* Chat windows – rendered left-to-right */}
      {openChats.map((chat) => (
        <ChatWindow
          key={chat.user.id}
          chat={chat}
          currentUserId={currentUserId}
          onClose={() => closeChat(chat.user.id)}
          onToggleMinimize={() => toggleMinimize(chat.user.id)}
          onSend={() => sendMessage(chat.user.id)}
          onInputChange={(value) =>
            setOpenChats((prev) =>
              prev.map((c) =>
                c.user.id === chat.user.id ? { ...c, inputValue: value } : c,
              ),
            )
          }
        />
      ))}

      {/* Main panel + toggle button */}
      <div className="flex flex-col items-end">
        {/* User list panel */}
        {isOpen && (
          <div className="mb-2 w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
            {/* Panel header */}
            <div className="bg-gradient-to-r from-rose-400 to-blue-400 px-4 py-3">
              <h3 className="text-sm font-semibold text-white">Messages</h3>
            </div>

            {/* Search */}
            <div className="p-2 border-b border-slate-100">
              <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5">
                <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search people…"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="flex-1 bg-transparent text-xs outline-none text-slate-700 placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* User list */}
            <div className="max-h-72 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <p className="p-6 text-center text-xs text-slate-400">
                  No users found
                </p>
              ) : (
                filteredUsers.map((user) => {
                  const isActive = openChats.some(
                    (c) => c.user.id === user.id && !c.isMinimized,
                  );
                  return (
                    <button
                      key={user.id}
                      onClick={() => openChat(user)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="relative shrink-0">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-blue-400 text-sm font-bold text-white">
                          {getInitial(user)}
                        </div>
                        {isActive && (
                          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">
                          {user.name ?? user.email}
                        </p>
                        <p className="text-xs text-slate-400">
                          {ROLE_LABELS[user.role] ?? user.role}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Toggle button */}
        {showIncomingHint && !isOpen && visibleUnread > 0 && (
          <div className="mb-2 rounded-full bg-slate-900 px-3 py-1 text-[11px] font-medium text-white shadow-lg">
            New message received
          </div>
        )}

        <button
          onClick={() => {
            setIsOpen((v) => !v);
            setShowIncomingHint(false);
          }}
          className="relative mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-rose-400 to-blue-400 text-white shadow-lg hover:scale-105 transition-transform"
          aria-label="Toggle chat"
        >
          {isOpen ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <MessageSquare className="h-5 w-5" />
          )}
          {!isOpen && visibleUnread > 0 && (
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white ring-2 ring-white">
              {visibleUnread > 9 ? "9+" : visibleUnread}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Individual chat window ───────────────────────────────────────────────────

function ChatWindow({
  chat,
  currentUserId,
  onClose,
  onToggleMinimize,
  onSend,
  onInputChange,
}: {
  chat: OpenChat;
  currentUserId: string;
  onClose: () => void;
  onToggleMinimize: () => void;
  onSend: () => void;
  onInputChange: (value: string) => void;
}) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    if (!chat.isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chat.messages.length, chat.isMinimized]);

  // Focus input when window opens
  useEffect(() => {
    if (!chat.isMinimized) {
      inputRef.current?.focus();
    }
  }, [chat.isMinimized]);

  const displayName = chat.user.name ?? chat.user.email;

  return (
    <div className="w-72 max-w-[calc(100vw-1rem)] self-end overflow-hidden rounded-t-xl border border-slate-200 bg-white shadow-2xl">
      {/* Header */}
      <div className="flex w-full items-center justify-between bg-gradient-to-r from-rose-400 to-blue-400 px-3 py-2.5">
        <button
          onClick={onToggleMinimize}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-label={chat.isMinimized ? "Expand chat" : "Minimize chat"}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
            {getInitial(chat.user)}
          </div>
          <div className="min-w-0">
            <p className="max-w-[140px] truncate text-xs font-semibold text-white">
              {displayName}
            </p>
            <p className="text-[10px] text-white/70">
              {ROLE_LABELS[chat.user.role] ?? chat.user.role}
            </p>
          </div>
        </button>

        <div className="ml-2 flex shrink-0 items-center gap-1">
          {chat.isMinimized && chat.unreadCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-[9px] font-bold text-rose-500">
              {chat.unreadCount > 9 ? "9+" : chat.unreadCount}
            </span>
          )}
          <button
            onClick={onToggleMinimize}
            className="rounded p-0.5 hover:bg-white/20 transition-colors"
            aria-label={chat.isMinimized ? "Expand chat" : "Minimize chat"}
          >
            <ChevronDown
              className={`h-4 w-4 text-white transition-transform duration-200 ${
                chat.isMinimized ? "rotate-180" : ""
              }`}
            />
          </button>
          <button
            onClick={onClose}
            className="rounded p-0.5 hover:bg-white/20 transition-colors"
            aria-label="Close chat"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>

      {/* Body */}
      {!chat.isMinimized && (
        <>
          {/* Messages area */}
          <div className="h-64 overflow-y-auto p-3 flex flex-col gap-2 bg-slate-50">
            {chat.isLoading ? (
              <div className="flex h-full items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-rose-400 border-t-transparent" />
              </div>
            ) : chat.messages.length === 0 ? (
              <p className="mt-10 text-center text-xs text-slate-400">
                No messages yet. Say hi!
              </p>
            ) : (
              chat.messages.map((msg) => {
                const isOwn = msg.senderId === currentUserId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-1.5 text-xs leading-relaxed ${
                        isOwn
                          ? "bg-gradient-to-r from-rose-400 to-blue-400 text-white rounded-br-none"
                          : "bg-white text-slate-800 border border-slate-200 rounded-bl-none"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div className="flex items-center gap-2 border-t border-slate-100 bg-white px-2 py-2">
            <input
              ref={inputRef}
              type="text"
              value={chat.inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              placeholder="Aa"
              className="flex-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs outline-none text-slate-700 placeholder:text-slate-400"
            />
            <button
              onClick={onSend}
              disabled={!chat.inputValue.trim() || chat.isLoading}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-rose-400 to-blue-400 text-white disabled:opacity-40 transition-opacity hover:opacity-90"
              aria-label="Send message"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
