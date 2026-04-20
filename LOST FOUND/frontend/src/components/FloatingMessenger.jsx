import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE } from "../config/api";

const POLL_INTERVAL_MS = 5000;
const REQUEST_TIMEOUT_MS = 10000;
const MESSENGER_API_BASES = [
  API_BASE,
  "http://localhost:5000",
  "http://localhost:8000",
];

const normalizeBase = (base) => String(base).replace(/\/+$/, "");

const buildApiUrl = (base, path) => `${normalizeBase(base)}${path}`;

const parseApiResponse = async (res, fallbackMessage, requestUrl) => {
  const contentType = res.headers.get("content-type") || "";
  const raw = await res.text();

  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      if (contentType.includes("application/json")) {
        throw new Error(fallbackMessage);
      }
    }
  }

  if (!res.ok) {
    const statusInfo = requestUrl
      ? ` (HTTP ${res.status} ${res.statusText} @ ${requestUrl})`
      : ` (HTTP ${res.status} ${res.statusText})`;
    const message =
      data?.message ||
      (raw && raw.trim().startsWith("<!DOCTYPE")
        ? `${fallbackMessage}. API returned HTML instead of JSON. Check API_BASE and backend server.${statusInfo}`
        : `${fallbackMessage}.${statusInfo}`);
    throw new Error(message);
  }

  if (!data) {
    throw new Error(`${fallbackMessage}. Empty or invalid server response.`);
  }

  return data;
};

const fetchJsonWithFallback = async (path, options, fallbackMessage) => {
  const uniqueBases = [...new Set(MESSENGER_API_BASES.filter(Boolean))];
  let lastError = null;

  for (const base of uniqueBases) {
    const requestUrl = buildApiUrl(base, path);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(requestUrl, {
          ...options,
          signal: controller.signal,
        });
        return await parseApiResponse(response, fallbackMessage, requestUrl);
      } catch (error) {
        if (error?.name === "AbortError") {
          throw new Error(
            `${fallbackMessage}. Request timeout. Please check backend server and network. (${requestUrl})`,
          );
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error;
    }
  }

  try {
    if (lastError) throw lastError;
    throw new Error(fallbackMessage);
  } catch (error) {
    throw new Error(error?.message || fallbackMessage);
  }
};

const getUserInfo = () => {
  try {
    return JSON.parse(localStorage.getItem("userInfo") || "null");
  } catch {
    return null;
  }
};

const getAuthHeaders = (user = getUserInfo()) => {
  if (!user?.token) return null;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${user.token}`,
  };
};

const formatTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });

const isShareSupported = () =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";

const MessengerIcon = ({ unread, onMouseDown, onClick, style }) => (
  <button
    type="button"
    onMouseDown={onMouseDown}
    onClick={onClick}
    style={style}
    className="fixed z-[70] flex h-16 w-16 items-center justify-center rounded-full bg-transparent shadow-xl shadow-cyan-900/35 transition hover:scale-105"
    title="Open messenger"
  >
    <svg aria-hidden="true" viewBox="0 0 64 64" className="h-14 w-14">
      <defs>
        <linearGradient
          id="messengerGradient"
          x1="0%"
          y1="100%"
          x2="100%"
          y2="0%"
        >
          <stop offset="0%" stopColor="#0099FF" />
          <stop offset="55%" stopColor="#A033FF" />
          <stop offset="100%" stopColor="#FF5280" />
        </linearGradient>
      </defs>
      <path
        d="M32 2C15.6 2 2.3 14.6 2.3 30.1c0 8.8 4.2 16.6 10.7 21.7v9.9c0 1.6 1.7 2.6 3.1 1.9l10.9-5.6c1.6.3 3.3.4 5 .4 16.4 0 29.7-12.6 29.7-28.2S48.4 2 32 2Z"
        fill="url(#messengerGradient)"
      />
      <path
        d="M16.6 38.7 27.5 25c1-1.2 2.8-1.5 4.1-.6l7 4.9c.7.5 1.8.4 2.4-.2l8.4-8.7c1.4-1.5 3.8.2 2.9 2L41.5 39.2c-1 1.5-3.1 1.8-4.5.7l-7.2-5.4c-.7-.5-1.7-.5-2.4.1l-8.2 6.4c-1.7 1.3-4-.4-2.6-2.3Z"
        fill="#FFFFFF"
      />
    </svg>
    {unread > 0 && (
      <span className="absolute -right-1 -top-1 min-w-[20px] rounded-full bg-rose-500 px-1.5 py-0.5 text-center text-[11px] font-bold text-white">
        {unread > 99 ? "99+" : unread}
      </span>
    )}
  </button>
);

export default function FloatingMessenger() {
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState(getUserInfo());
  const [isOpen, setIsOpen] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [attachedImage, setAttachedImage] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [targetEmail, setTargetEmail] = useState("");
  const [startingDirectChat, setStartingDirectChat] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [dragPosition, setDragPosition] = useState(null);

  const dragRef = useRef({ isDragging: false, moved: false, dx: 0, dy: 0 });
  const pollRef = useRef(null);
  const pendingItemRef = useRef(null);
  const sendLockRef = useRef(false);
  const photoInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const totalUnread = useMemo(
    () =>
      conversations.reduce((sum, convo) => sum + (convo.unreadCount || 0), 0),
    [conversations],
  );

  const effectiveUser = authUser || getUserInfo();

  const clearAuthAndShowLogin = useCallback((message) => {
    localStorage.removeItem("userInfo");
    setAuthUser(null);
    setConversations([]);
    setActiveConversation(null);
    setMessages([]);
    setTargetEmail("");
    setAttachedImage(null);
    setEditingMessageId(null);
    setError(message || "Please login again.");
  }, []);

  const clearComposer = useCallback(() => {
    setMessageInput("");
    setAttachedImage(null);
    setEditingMessageId(null);
  }, []);

  const handleImagePick = useCallback(async (file) => {
    if (!file) return;

    if (!String(file.type || "").startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAttachedImage({
        dataUrl,
        name: file.name || "photo.jpg",
        type: file.type || "image/jpeg",
      });
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load image");
    }
  }, []);

  const handleShareImage = useCallback(async (message) => {
    const imageUrl = String(message?.imageUrl || "").trim();
    if (!imageUrl) return;

    try {
      if (isShareSupported()) {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File(
          [blob],
          message?.imageName || `message-${message?._id || Date.now()}.jpg`,
          { type: message?.imageType || blob.type || "image/jpeg" },
        );

        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({
            title: "Shared photo",
            text: message?.content || "Photo from chat",
            files: [file],
          });
          return;
        }
      }
    } catch {
      // Fall back to opening the image in a new tab.
    }

    window.open(imageUrl, "_blank", "noopener,noreferrer");
  }, []);

  const loadConversations = useCallback(async () => {
    const headers = getAuthHeaders(effectiveUser);
    if (!headers) {
      setConversations([]);
      return;
    }

    setLoadingConversations(true);
    try {
      const data = await fetchJsonWithFallback(
        "/api/messages/conversations",
        {
          headers,
        },
        "Failed to load conversations",
      );
      setConversations(Array.isArray(data) ? data : []);
    } catch (err) {
      if (/token failed|not authorized/i.test(String(err?.message || ""))) {
        clearAuthAndShowLogin("Session expired. Please login again.");
        return;
      }
      setError(err.message || "Failed to load conversations");
    } finally {
      setLoadingConversations(false);
    }
  }, [clearAuthAndShowLogin, effectiveUser]);

  const loadThread = useCallback(
    async (conversation) => {
      const headers = getAuthHeaders(effectiveUser);
      if (!headers || !conversation?.otherUser?._id) {
        setMessages([]);
        return;
      }

      setLoadingMessages(true);
      try {
        const params = new URLSearchParams({
          itemId: conversation.item?._id || "direct",
          userId: conversation.otherUser._id,
        });
        const data = await fetchJsonWithFallback(
          `/api/messages/thread?${params.toString()}`,
          {
            headers,
          },
          "Failed to load messages",
        );
        setMessages(Array.isArray(data) ? data : []);

        setConversations((prev) =>
          prev.map((c) =>
            (c.item?._id || "direct") ===
              (conversation.item?._id || "direct") &&
            c.otherUser?._id === conversation.otherUser?._id
              ? { ...c, unreadCount: 0 }
              : c,
          ),
        );
      } catch (err) {
        if (/token failed|not authorized/i.test(String(err?.message || ""))) {
          clearAuthAndShowLogin("Session expired. Please login again.");
          return;
        }
        setError(err.message || "Failed to load messages");
      } finally {
        setLoadingMessages(false);
      }
    },
    [clearAuthAndShowLogin, effectiveUser],
  );

  const setActiveAndLoad = useCallback(
    async (conversation) => {
      setActiveConversation(conversation);
      clearComposer();
      await loadThread(conversation);
    },
    [clearComposer, loadThread],
  );

  const startConversationByItem = useCallback(
    async (itemId) => {
      const headers = getAuthHeaders(effectiveUser);
      if (!headers) {
        pendingItemRef.current = itemId;
        setIsOpen(true);
        return;
      }

      setError("");
      setIsOpen(true);

      try {
        const data = await fetchJsonWithFallback(
          "/api/messages/start",
          {
            method: "POST",
            headers,
            body: JSON.stringify({ itemId }),
          },
          "Failed to start conversation",
        );

        await loadConversations();
        const conversation = {
          item: data.item,
          otherUser: data.otherUser,
          latestMessage: data.latestMessage,
          unreadCount: 0,
        };
        await setActiveAndLoad(conversation);
      } catch (err) {
        if (/token failed|not authorized/i.test(String(err?.message || ""))) {
          clearAuthAndShowLogin("Session expired. Please login again.");
          return;
        }
        setError(err.message || "Failed to open conversation");
      }
    },
    [clearAuthAndShowLogin, effectiveUser, loadConversations, setActiveAndLoad],
  );

  const startConversationByEmail = useCallback(
    async (email) => {
      const headers = getAuthHeaders(effectiveUser);
      if (!headers) {
        setError("Please login first.");
        setIsOpen(true);
        return;
      }

      const normalizedEmail = String(email || "")
        .trim()
        .toLowerCase();
      if (!normalizedEmail) {
        setError("Please enter an email address.");
        return;
      }

      setError("");
      setStartingDirectChat(true);

      try {
        const data = await fetchJsonWithFallback(
          "/api/messages/start-by-email",
          {
            method: "POST",
            headers,
            body: JSON.stringify({ email: normalizedEmail }),
          },
          "Failed to start direct conversation",
        );

        await loadConversations();
        const conversation = {
          item: data.item,
          otherUser: data.otherUser,
          latestMessage: data.latestMessage,
          unreadCount: 0,
        };
        setTargetEmail("");
        await setActiveAndLoad(conversation);
      } catch (err) {
        if (/token failed|not authorized/i.test(String(err?.message || ""))) {
          clearAuthAndShowLogin("Session expired. Please login again.");
          return;
        }
        setError(err.message || "Failed to start direct conversation");
      } finally {
        setStartingDirectChat(false);
      }
    },
    [clearAuthAndShowLogin, effectiveUser, loadConversations, setActiveAndLoad],
  );

  const sendMessage = useCallback(async () => {
    const headers = getAuthHeaders(effectiveUser);
    if (!headers || !activeConversation || sendLockRef.current) {
      return;
    }

    const content = messageInput.trim();
    const imageUrl = String(attachedImage?.dataUrl || "").trim();

    if (!editingMessageId && !content && !imageUrl) return;

    if (editingMessageId && !content) {
      const originalMessage = messages.find(
        (msg) => msg._id === editingMessageId,
      );
      if (!originalMessage?.imageUrl) {
        setError("Message content is required.");
        return;
      }
    }

    sendLockRef.current = true;
    setSending(true);
    setError("");

    try {
      if (editingMessageId) {
        const data = await fetchJsonWithFallback(
          `/api/messages/${editingMessageId}`,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({ content }),
          },
          "Failed to edit message",
        );

        setMessages((prev) =>
          prev.map((msg) => (msg._id === editingMessageId ? data : msg)),
        );
        clearComposer();
        await loadConversations();
        return;
      }

      const data = await fetchJsonWithFallback(
        "/api/messages/send",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            itemId: activeConversation.item?._id || "direct",
            receiverId: activeConversation.otherUser._id,
            content,
            imageUrl,
            imageName: attachedImage?.name || "",
            imageType: attachedImage?.type || "",
          }),
        },
        "Failed to send message",
      );

      setMessages((prev) => [...prev, data]);
      clearComposer();
      await loadConversations();
    } catch (err) {
      if (/token failed|not authorized/i.test(String(err?.message || ""))) {
        clearAuthAndShowLogin("Session expired. Please login again.");
        return;
      }
      setError(err.message || "Failed to send message");
    } finally {
      setSending(false);
      sendLockRef.current = false;
    }
  }, [
    activeConversation,
    clearAuthAndShowLogin,
    effectiveUser,
    attachedImage,
    clearComposer,
    loadConversations,
    messageInput,
    editingMessageId,
    messages,
  ]);

  const startEditingMessage = useCallback((message) => {
    setEditingMessageId(message._id);
    setMessageInput(message.content || "");
    setAttachedImage(null);
    setError("");
  }, []);

  const cancelEditingMessage = useCallback(() => {
    clearComposer();
  }, [clearComposer]);

  const removeMessage = useCallback(
    async (message) => {
      if (!message?._id || !window.confirm("Delete this message?")) {
        return;
      }

      const headers = getAuthHeaders(effectiveUser);
      if (!headers) {
        return;
      }

      setSending(true);
      setError("");

      try {
        await fetchJsonWithFallback(
          `/api/messages/${message._id}`,
          {
            method: "DELETE",
            headers,
          },
          "Failed to delete message",
        );

        setMessages((prev) => prev.filter((msg) => msg._id !== message._id));
        if (editingMessageId === message._id) {
          clearComposer();
        }
        await loadConversations();
      } catch (err) {
        if (/token failed|not authorized/i.test(String(err?.message || ""))) {
          clearAuthAndShowLogin("Session expired. Please login again.");
          return;
        }
        setError(err.message || "Failed to delete message");
      } finally {
        setSending(false);
      }
    },
    [
      clearAuthAndShowLogin,
      clearComposer,
      editingMessageId,
      effectiveUser,
      loadConversations,
    ],
  );

  const logoutFromMessenger = () => {
    localStorage.removeItem("userInfo");
    setAuthUser(null);
    setConversations([]);
    setActiveConversation(null);
    setMessages([]);
    setTargetEmail("");
    setAttachedImage(null);
    setError("");
  };

  useEffect(() => {
    if (!isOpen || !effectiveUser?.token) {
      return;
    }

    loadConversations();
  }, [effectiveUser, isOpen, loadConversations]);

  useEffect(() => {
    const handleOpenMessenger = (event) => {
      const itemId = event?.detail?.itemId;
      if (itemId) {
        startConversationByItem(itemId);
      } else {
        setIsOpen(true);
      }
    };

    window.addEventListener("lf:open-messenger", handleOpenMessenger);
    return () =>
      window.removeEventListener("lf:open-messenger", handleOpenMessenger);
  }, [startConversationByItem]);

  useEffect(() => {
    const syncAuthState = () => {
      setAuthUser(getUserInfo());
    };

    window.addEventListener("storage", syncAuthState);
    return () => window.removeEventListener("storage", syncAuthState);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setAuthUser(getUserInfo());
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !effectiveUser?.token) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
      return;
    }

    if (pollRef.current) {
      clearInterval(pollRef.current);
    }

    pollRef.current = setInterval(() => {
      loadConversations();
      if (activeConversation) {
        loadThread(activeConversation);
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [
    activeConversation,
    effectiveUser,
    isOpen,
    loadConversations,
    loadThread,
  ]);

  useEffect(() => {
    const onMouseMove = (event) => {
      if (!dragRef.current.isDragging) return;
      dragRef.current.moved = true;
      setDragPosition({
        x: event.clientX - dragRef.current.dx,
        y: event.clientY - dragRef.current.dy,
      });
    };

    const onMouseUp = () => {
      dragRef.current.isDragging = false;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const handleIconMouseDown = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      isDragging: true,
      moved: false,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
    };
  };

  const handleIconClick = () => {
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }

    setError("");
    setIsOpen((prev) => !prev);
  };

  const iconStyle = dragPosition
    ? {
        left: `${dragPosition.x}px`,
        top: `${dragPosition.y}px`,
        right: "auto",
        bottom: "auto",
      }
    : { left: "24px", bottom: "24px" };

  return (
    <>
      <MessengerIcon
        unread={totalUnread}
        onMouseDown={handleIconMouseDown}
        onClick={handleIconClick}
        style={iconStyle}
      />

      {isOpen && (
        <div className="fixed bottom-24 left-6 z-[70] flex h-[84vh] w-[94vw] max-h-[860px] max-w-[1040px] overflow-hidden rounded-3xl border border-cyan-400/20 bg-slate-950/95 shadow-[0_30px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl sm:w-[88vw] lg:w-[980px]">
          {!effectiveUser?.token ? (
            <section className="flex w-full flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6">
              <div className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                  Messenger
                </p>
                <h3 className="mt-2 text-xl font-semibold text-slate-100">
                  Login once on website to continue
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  Messenger uses your website login session. You do not need to
                  fill email and password every time inside messenger.
                </p>
              </div>

              <button
                type="button"
                onClick={() => navigate("/login")}
                className="mt-2 w-fit rounded-xl bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/30 transition hover:-translate-y-0.5 hover:bg-cyan-300"
              >
                Go to Login
              </button>

              {error && (
                <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {error}
                </p>
              )}
            </section>
          ) : (
            <>
              <aside className="flex w-[36%] min-w-[320px] flex-col border-r border-white/10 bg-slate-900/80">
                <div className="border-b border-white/10 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">
                      Messenger
                    </p>
                    <button
                      type="button"
                      onClick={logoutFromMessenger}
                      className="rounded-md px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
                    >
                      Logout
                    </button>
                  </div>
                  <div className="mt-3 space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                    <p className="text-[11px] text-slate-400">
                      Type target email to start chat
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={targetEmail}
                        onChange={(e) => setTargetEmail(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            if (!startingDirectChat && targetEmail.trim()) {
                              startConversationByEmail(targetEmail);
                            }
                          }
                        }}
                        placeholder="user@gmail.com"
                        className="w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-[11px] text-slate-100 outline-none transition focus:border-cyan-400"
                      />
                      <button
                        type="button"
                        disabled={startingDirectChat || !targetEmail.trim()}
                        onClick={() => startConversationByEmail(targetEmail)}
                        className="rounded-lg bg-cyan-400 px-3 py-2 text-[11px] font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {startingDirectChat ? "Starting..." : "Start"}
                      </button>
                    </div>
                    {error && (
                      <p className="rounded-md bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">
                        {error}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto p-3">
                  {loadingConversations ? (
                    <p className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-3 text-xs text-slate-400">
                      Loading...
                    </p>
                  ) : conversations.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-4 text-center text-xs text-slate-400">
                      No conversations yet.
                    </p>
                  ) : (
                    conversations.map((convo) => {
                      const isActive =
                        (activeConversation?.item?._id || "direct") ===
                          (convo.item?._id || "direct") &&
                        activeConversation?.otherUser?._id ===
                          convo.otherUser?._id;

                      return (
                        <button
                          key={`${convo.item?._id || "direct"}:${convo.otherUser?._id}`}
                          type="button"
                          onClick={() => setActiveAndLoad(convo)}
                          className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                            isActive
                              ? "border-cyan-400/50 bg-cyan-400/10 shadow-lg shadow-cyan-500/10"
                              : "border-white/10 bg-white/[0.02] hover:border-cyan-400/30 hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-xs font-bold uppercase text-cyan-200">
                              {String(
                                convo.otherUser?.name ||
                                  convo.otherUser?.email ||
                                  "U",
                              )
                                .trim()
                                .charAt(0)}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-xs font-semibold text-slate-100">
                                  {convo.item?.itemName ||
                                    "Direct conversation"}
                                </p>
                                {convo.unreadCount > 0 && (
                                  <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                    {convo.unreadCount > 9
                                      ? "9+"
                                      : convo.unreadCount}
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-[11px] text-slate-300">
                                {convo.otherUser?.name ||
                                  convo.otherUser?.email ||
                                  "User"}
                              </p>
                              <p className="mt-1 truncate text-[10px] text-slate-500">
                                {convo.latestMessage?.content ||
                                  (convo.latestMessage?.imageUrl
                                    ? "Photo shared"
                                    : "No messages yet")}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </aside>

              <section className="flex flex-1 flex-col bg-gradient-to-b from-slate-950/80 to-slate-900/80">
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">
                      {activeConversation?.item?.itemName || "Direct chat"}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {activeConversation?.otherUser?.name ||
                        activeConversation?.otherUser?.email ||
                        ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-lg border border-white/10 px-2.5 py-1.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.08),_transparent_38%)] p-5">
                  {loadingMessages ? (
                    <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
                      Loading messages...
                    </p>
                  ) : messages.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-5 text-center text-xs text-slate-400">
                      No messages in this chat yet.
                    </p>
                  ) : (
                    messages.map((msg) => (
                      <div
                        key={msg._id}
                        className={`max-w-[82%] rounded-2xl border px-3.5 py-2.5 text-xs shadow-md ${
                          msg.isMine
                            ? "ml-auto border-cyan-300/20 bg-cyan-400/15 text-cyan-100 shadow-cyan-500/10"
                            : "border-white/10 bg-white/[0.04] text-slate-200"
                        }`}
                      >
                        {msg.imageUrl ? (
                          <button
                            type="button"
                            onClick={() => handleShareImage(msg)}
                            className="block w-full overflow-hidden rounded-xl border border-white/10 bg-black/20 text-left"
                            title="Open or share photo"
                          >
                            <img
                              src={msg.imageUrl}
                              alt={msg.imageName || "Shared photo"}
                              className="max-h-72 w-full object-contain"
                              loading="lazy"
                            />
                          </button>
                        ) : null}
                        {msg.content ? (
                          <p className={msg.imageUrl ? "mt-2" : ""}>
                            {msg.content}
                          </p>
                        ) : null}
                        {msg.editedAt ? (
                          <p className="mt-1 text-[10px] italic text-slate-400">
                            Edited
                          </p>
                        ) : null}
                        {msg.isMine ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => startEditingMessage(msg)}
                              className="rounded-full border border-cyan-300/30 px-2 py-0.5 text-[10px] font-semibold text-cyan-200 transition hover:bg-cyan-300/15"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => removeMessage(msg)}
                              className="rounded-full border border-rose-300/30 px-2 py-0.5 text-[10px] font-semibold text-rose-200 transition hover:bg-rose-300/15"
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="text-[10px] text-slate-400">
                            {formatTime(msg.createdAt)}
                          </p>
                          {msg.imageUrl ? (
                            <button
                              type="button"
                              onClick={() => handleShareImage(msg)}
                              className="text-[10px] font-semibold text-cyan-300 transition hover:text-cyan-200"
                            >
                              Share
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {error && (
                  <p className="px-4 pb-1 text-[11px] text-rose-300">{error}</p>
                )}

                <div className="border-t border-white/10 bg-slate-950/70 p-4">
                  {editingMessageId ? (
                    <div className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-cyan-200">
                          Editing message
                        </p>
                        <p className="truncate text-[10px] text-slate-300">
                          Update the text, then save changes.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={cancelEditingMessage}
                        className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-300 transition hover:bg-white/10 hover:text-slate-100"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}

                  {attachedImage ? (
                    <div className="mb-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5">
                      <img
                        src={attachedImage.dataUrl}
                        alt={attachedImage.name || "Selected photo"}
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-slate-100">
                          {attachedImage.name || "Selected photo"}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Ready to send with your message.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachedImage(null)}
                        className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={
                          !activeConversation ||
                          sending ||
                          Boolean(editingMessageId)
                        }
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-[11px] font-semibold text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Attach a photo"
                      >
                        Photo
                      </button>
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={
                          !activeConversation ||
                          sending ||
                          Boolean(editingMessageId)
                        }
                        className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-[11px] font-semibold text-slate-200 transition hover:border-cyan-400/50 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Open camera"
                      >
                        Camera
                      </button>
                    </div>

                    <input
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      disabled={!activeConversation || sending}
                      placeholder={
                        editingMessageId
                          ? "Edit your message..."
                          : activeConversation
                            ? "Type a message..."
                            : "Choose a conversation"
                      }
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={sendMessage}
                      disabled={
                        !activeConversation ||
                        sending ||
                        (!messageInput.trim() &&
                          !attachedImage &&
                          !editingMessageId)
                      }
                      className="rounded-xl bg-cyan-400 px-4 py-3 text-xs font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {editingMessageId ? "Save" : "Send"}
                    </button>
                  </div>

                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      handleImagePick(file);
                      event.target.value = "";
                    }}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      handleImagePick(file);
                      event.target.value = "";
                    }}
                  />
                </div>
              </section>
            </>
          )}
        </div>
      )}
    </>
  );
}
