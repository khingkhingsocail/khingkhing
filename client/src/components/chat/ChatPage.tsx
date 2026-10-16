import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Hash,
  LockKeyhole,
  MessageCircle,
  Plus,
  Search,
  Users,
  RefreshCw,
  LogIn,
} from "lucide-react";
import { openLoginPage } from "@/const";
import { arenaCapabilities } from "@/lib/arena";
import {
  ChatApiError,
  fetchChatMe,
  saveChatAccount,
  fetchChatRooms,
  fetchChatRoom,
  fetchChatPeople,
  createDirectChat,
  createGroupChat,
  fetchChatChannels,
  joinChatChannel,
  respondChatInvite,
  leaveChatRoom,
  inviteChatPeople,
  fetchChatMessages,
  mergeChatMessages,
  mergeChatRooms,
} from "@/lib/chat";
import type {
  ChatPerson,
  ChatRoom,
  ChatMessage,
  ChatChannel,
  ChatTarget,
  ChatRoomCursor,
} from "../../../../shared/chat";
import ChatComposer from "./ChatComposer";
import ChatMedia from "./ChatMedia";
import "./chat.css";
const currentMonth = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
  }).format(new Date());
function Avatar({ person }: { person: ChatPerson }) {
  return (
    <span className="chat-avatar">
      {person.avatar ? (
        <img src={person.avatar} alt="" />
      ) : (
        Array.from(person.displayName)[0]
      )}
    </span>
  );
}
export default function ChatPage({
  target,
  onTargetHandled,
}: {
  target?: ChatTarget | null;
  onTargetHandled?: () => void;
}) {
  const [me, setMe] = useState<{
    userId: number;
    account: ChatPerson | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState("");
  const [nickname, setNickname] = useState("");
  const [bindProfile, setBindProfile] = useState("");
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [roomsCursor, setRoomsCursor] = useState<ChatRoomCursor | null>(null);
  const [roomsMoreBusy, setRoomsMoreBusy] = useState(false);
  const inboxInitialized = useRef(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [members, setMembers] = useState<(ChatPerson & { state: string })[]>(
    []
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyMore, setHistoryMore] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [roomLoading, setRoomLoading] = useState(false);
  const [mode, setMode] = useState<"direct" | "group" | "invite" | null>(null);
  const [people, setPeople] = useState<ChatPerson[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [picks, setPicks] = useState<number[]>([]);
  const [title, setTitle] = useState("");
  const [channelOpen, setChannelOpen] = useState(false);
  const [channelFocus, setChannelFocus] = useState<ChatTarget | null>(null);
  const [period, setPeriod] = useState(currentMonth);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const stickBottom = useRef(true);
  const handledTarget = useRef<ChatTarget | null>(null);
  const refreshMe = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchChatMe();
      setMe(result);
      setNickname(result.account?.displayName ?? "");
      setBindProfile(result.account?.arenaProfileId ?? "");
      setUnauthorized(false);
    } catch (cause) {
      if (cause instanceof ChatApiError && cause.status === 401)
        setUnauthorized(true);
      else setError(cause instanceof Error ? cause.message : "เปิดแชทไม่ได้");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);
  const refreshRooms = useCallback(async () => {
    const result = await fetchChatRooms();
    setRooms(current => mergeChatRooms(current, result.rooms));
    if (!inboxInitialized.current) {
      setRoomsCursor(result.nextCursor);
      inboxInitialized.current = true;
    }
  }, []);
  useEffect(() => {
    if (!me?.account) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!document.hidden)
        try {
          const result = await fetchChatRooms();
          if (active) {
            setRooms(current => mergeChatRooms(current, result.rooms));
            if (!inboxInitialized.current) {
              setRoomsCursor(result.nextCursor);
              inboxInitialized.current = true;
            }
          }
        } catch (cause) {
          if (active) {
            setError(cause instanceof Error ? cause.message : "โหลดห้องไม่ได้");
            if (cause instanceof ChatApiError && cause.status === 401) {
              setMe(null);
              setRooms([]);
              setMessages([]);
              setSelected(null);
              setUnauthorized(true);
            }
          }
        }
      if (active) timer = setTimeout(poll, 4000);
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [me?.account]);
  useEffect(() => {
    if (!selected || !me?.account) {
      setRoom(null);
      setMessages([]);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    let latestId = 0;
    let initialized = false;
    setRoom(null);
    setMessages([]);
    setMembers([]);
    setError("");
    setRoomLoading(true);
    stickBottom.current = true;
    async function load() {
      try {
        const detail = await fetchChatRoom(selected!);
        if (!active) return;
        setRoom(detail.room);
        setMembers(detail.members);
        if (detail.room.state === "active") {
          const page = await fetchChatMessages(
            selected!,
            {},
            controller.signal
          );
          if (!active) return;
          setMessages(page.messages);
          setHistoryMore(page.hasMore);
          latestId = page.messages.at(-1)?.id ?? 0;
        }
        initialized = true;
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "เปิดห้องไม่ได้");
          setRoom(null);
          setMessages([]);
        }
      } finally {
        if (active) setRoomLoading(false);
      }
    }
    async function poll() {
      if (initialized && !document.hidden)
        try {
          const detail = await fetchChatRoom(selected!);
          if (!active) return;
          setRoom(detail.room);
          setMembers(detail.members);
          if (detail.room.state === "active") {
            const page = await fetchChatMessages(
              selected!,
              { after: latestId },
              controller.signal
            );
            if (!active) return;
            if (page.messages.length) {
              latestId = page.messages.at(-1)!.id;
              setMessages(current => mergeChatMessages(current, page.messages));
            }
          }
        } catch (cause) {
          if (active) {
            setError(
              cause instanceof Error ? cause.message : "อัปเดตข้อความไม่ได้"
            );
            if (
              cause instanceof ChatApiError &&
              [401, 403].includes(cause.status)
            ) {
              setRoom(null);
              setMessages([]);
              initialized = false;
            }
          }
        }
      if (active) timer = setTimeout(poll, 4000);
    }
    void load().then(() => {
      if (active) timer = setTimeout(poll, 4000);
    });
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [selected, me?.account]);
  useLayoutEffect(() => {
    if (stickBottom.current && scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, selected]);
  useEffect(() => {
    if (!mode || !me?.account) return;
    let active = true;
    setPeopleLoading(true);
    const timer = setTimeout(() => {
      void fetchChatPeople(query)
        .then(result => {
          if (active) setPeople(result.people);
        })
        .catch(cause => {
          if (active) setError(cause.message);
        })
        .finally(() => {
          if (active) setPeopleLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [mode, query, me?.account]);
  useEffect(() => {
    if (!channelOpen || !me?.account) return;
    let active = true;
    void fetchChatChannels(period)
      .then(result => {
        if (active) setChannels(result.channels);
      })
      .catch(cause => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [period, channelOpen, me?.account]);
  useEffect(() => {
    if (!target || !me?.account || handledTarget.current === target) return;
    handledTarget.current = target;
    setError("");
    if (target.profileId) {
      void fetchChatPeople("", target.profileId)
        .then(async result => {
          if (!result.people.length)
            throw new Error(
              "โปรไฟล์นี้ยังไม่ผูกบัญชีแชท หรือเป็นโปรไฟล์ของคุณเอง ให้เจ้าของเปิดเมนูข้อความและผูกโปรไฟล์ก่อน"
            );
          const created = await createDirectChat(result.people[0].userId);
          setSelected(created.roomId);
          await refreshRooms();
        })
        .catch(cause => setError(cause.message))
        .finally(() => onTargetHandled?.());
    } else if (target.category) {
      setChannelFocus(target);
      setChannelOpen(true);
      setPeriod(target.period ?? currentMonth());
      onTargetHandled?.();
    }
  }, [target, me?.account, onTargetHandled, refreshRooms]);
  async function configure(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await saveChatAccount(nickname, bindProfile || null);
      setMe(current =>
        current ? { ...current, account: result.account } : current
      );
      setSetup(false);
      handledTarget.current = null;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ตั้งชื่อไม่ได้");
    } finally {
      setBusy(false);
    }
  }
  async function operate(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }
  async function moreRooms() {
    if (!roomsCursor || roomsMoreBusy) return;
    setRoomsMoreBusy(true);
    try {
      const result = await fetchChatRooms(roomsCursor);
      setRooms(current => mergeChatRooms(current, result.rooms));
      setRoomsCursor(result.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "โหลดห้องเก่าไม่ได้");
    } finally {
      setRoomsMoreBusy(false);
    }
  }
  function openNew(next: "direct" | "group" | "invite") {
    setChannelOpen(false);
    setMode(next);
    setPicks([]);
    setQuery("");
    setTitle("");
    setPeople([]);
  }
  async function createConversation(person?: ChatPerson) {
    await operate(async () => {
      const result = person
        ? await createDirectChat(person.userId)
        : await createGroupChat(title, picks);
      setSelected(result.roomId);
      setMode(null);
      await refreshRooms();
    });
  }
  async function respond(accept: boolean) {
    if (!selected) return;
    await operate(async () => {
      await respondChatInvite(selected, accept);
      await refreshRooms();
      if (accept) {
        const result = await fetchChatRoom(selected);
        setRoom(result.room);
        setMembers(result.members);
        const page = await fetchChatMessages(selected);
        setMessages(page.messages);
        setHistoryMore(page.hasMore);
      } else {
        setRooms(current => current.filter(item => item.id !== selected));
        setSelected(null);
      }
    });
  }
  async function older() {
    if (!selected || historyBusy || !messages.length) return;
    setHistoryBusy(true);
    const requestedRoom = selected;
    const element = scrollRef.current;
    const height = element?.scrollHeight ?? 0;
    try {
      const result = await fetchChatMessages(selected, {
        before: messages[0].id,
      });
      if (selectedRef.current !== requestedRoom) return;
      stickBottom.current = false;
      setMessages(current => mergeChatMessages(current, result.messages));
      setHistoryMore(result.hasMore);
      requestAnimationFrame(() => {
        if (element) element.scrollTop += element.scrollHeight - height;
      });
    } catch (cause) {
      if (selectedRef.current === requestedRoom)
        setError(cause instanceof Error ? cause.message : "โหลดประวัติไม่ได้");
    } finally {
      setHistoryBusy(false);
    }
  }
  const ownProfiles = Object.keys(arenaCapabilities());
  if (loading)
    return (
      <section className="chat-page manus-no-record">
        <p role="status">กำลังยืนยันบัญชีแชท…</p>
      </section>
    );
  if (unauthorized)
    return (
      <section className="chat-page chat-gate manus-no-record">
        <LockKeyhole size={42} />
        <p className="chat-eyebrow">KHING KHING · MESSAGES</p>
        <h1>คุยกันแบบส่วนตัว</h1>
        <p>
          แชทสองคน แชทกลุ่ม และห้องแข่งขันขิงขิง
          <br />
          เข้าสู่ระบบเพื่อให้ข้อความผูกกับบัญชีจริง
        </p>
        <button
          type="button"
          className="chat-primary"
          onClick={() => openLoginPage()}
        >
          <LogIn size={18} />
          เข้าสู่ระบบเพื่อใช้แชท
        </button>
        <small>
          ไม่ใช่การเข้ารหัสปลายทางถึงปลายทาง ·
          ผู้ดำเนินการระบบอาจเข้าถึงข้อมูลได้
        </small>
      </section>
    );
  if (!me)
    return (
      <section className="chat-page manus-no-record">
        <p className="chat-error" role="alert">
          {error || "ยืนยันบัญชีไม่สำเร็จ"}
        </p>
        <button type="button" onClick={() => void refreshMe()}>
          ลองใหม่
        </button>
      </section>
    );
  return (
    <section
      className={`chat-page manus-no-record${selected && !mode && !channelOpen ? " has-conversation" : ""}`}
      aria-labelledby="chat-page-title"
    >
      <header className="chat-header">
        <div>
          <p className="chat-eyebrow">KHING KHING · MESSAGES</p>
          <h1 id="chat-page-title">ข้อความ</h1>
          <span>ส่วนตัว · กลุ่ม · ห้องแข่งขัน</span>
        </div>
        {me.account ? (
          <button
            type="button"
            className="chat-secondary"
            onClick={() => setSetup(v => !v)}
          >
            ชื่อแชท / ผูกโปรไฟล์
          </button>
        ) : null}
      </header>
      {error ? (
        <div className="chat-error" role="alert">
          {error}
          <button
            type="button"
            className="chat-icon"
            aria-label="ปิดข้อความแจ้งเตือน"
            onClick={() => setError("")}
          >
            ×
          </button>
        </div>
      ) : null}
      {!me.account || setup ? (
        <form className="chat-setup" onSubmit={event => void configure(event)}>
          <h2>
            {me.account ? "แก้ชื่อแชทและผูกโปรไฟล์" : "ตั้งชื่อสำหรับแชท"}
          </h2>
          <label>
            ชื่อที่สมาชิกจะเห็น
            <input
              required
              minLength={2}
              maxLength={60}
              value={nickname}
              disabled={busy}
              onChange={e => setNickname(e.target.value)}
              placeholder="ชื่อที่อยากใช้พูดคุย"
            />
          </label>
          <label>
            ผูกโปรไฟล์ Arena ของคุณ (ไม่บังคับสำหรับDM/กลุ่ม)
            <select
              value={bindProfile}
              disabled={busy}
              onChange={e => setBindProfile(e.target.value)}
            >
              <option value="">ไม่ผูกโปรไฟล์</option>
              {[
                ...new Set([
                  ...ownProfiles,
                  ...(me.account?.arenaProfileId
                    ? [me.account.arenaProfileId]
                    : []),
                ]),
              ].map(id => (
                <option key={id} value={id}>
                  โปรไฟล์ {id.slice(0, 8)}…
                </option>
              ))}
            </select>
          </label>
          <p>
            ใช้บัญชีที่ล็อกอินและรหัสเจ้าของโปรไฟล์เพื่อตรวจสิทธิ์
            ไม่เปิดเผยอีเมล · ห้องแข่งขันต้องผูกโปรไฟล์ที่ลงสถิติเดือนนั้น
          </p>
          <button className="chat-primary" type="submit" disabled={busy}>
            {busy ? "กำลังบันทึก…" : "บันทึกและเปิดแชท"}
          </button>
        </form>
      ) : null}
      {me.account ? (
        <>
          <div className="chat-layout">
            <aside className="chat-inbox" aria-label="รายชื่อห้องแชท">
              <div className="chat-me">
                <Avatar person={me.account} />
                <span>
                  <b>{me.account.displayName}</b>
                  <small>
                    {me.account.handle
                      ? `@${me.account.handle}`
                      : "บัญชีแชทของคุณ"}
                  </small>
                </span>
              </div>
              <div className="chat-actions">
                <button type="button" onClick={() => openNew("direct")}>
                  <MessageCircle size={15} />
                  คุยส่วนตัว
                </button>
                <button type="button" onClick={() => openNew("group")}>
                  <Plus size={15} />
                  สร้างกลุ่ม
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode(null);
                    setChannelFocus(null);
                    setChannelOpen(v => !v);
                  }}
                  aria-expanded={channelOpen}
                >
                  <Hash size={15} />
                  ห้องแข่งขัน
                </button>
              </div>
              {mode ? (
                <div className="chat-new">
                  <header>
                    <strong>
                      {mode === "group"
                        ? "สร้างกลุ่ม"
                        : mode === "invite"
                          ? "เชิญสมาชิก"
                          : "เลือกคนที่ต้องการคุย"}
                    </strong>
                    <button
                      type="button"
                      className="chat-icon"
                      aria-label="ปิดการเลือกผู้ใช้"
                      onClick={() => setMode(null)}
                    >
                      ×
                    </button>
                  </header>
                  {mode === "group" ? (
                    <label>
                      ชื่อกลุ่ม
                      <input
                        required
                        minLength={2}
                        maxLength={80}
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="เช่น ทีมวิ่งของเรา"
                      />
                    </label>
                  ) : null}
                  <label className="chat-search">
                    <Search size={14} />
                    <input
                      type="search"
                      aria-label="ค้นหาผู้ใช้แชท"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="ค้นชื่อหรือ @ผู้ใช้"
                    />
                  </label>
                  {peopleLoading ? (
                    <p role="status">ค้นหาผู้ใช้…</p>
                  ) : !people.length ? (
                    <p>ยังไม่พบคนที่เปิดใช้แชท</p>
                  ) : (
                    people.map(person =>
                      mode === "direct" ? (
                        <button
                          type="button"
                          className="chat-person"
                          key={person.userId}
                          disabled={busy}
                          onClick={() => void createConversation(person)}
                        >
                          <Avatar person={person} />
                          <span>
                            {person.displayName}
                            <small>
                              {person.handle ? `@${person.handle}` : "บัญชีแชท"}
                            </small>
                          </span>
                        </button>
                      ) : (
                        <label className="chat-person" key={person.userId}>
                          <input
                            type="checkbox"
                            checked={picks.includes(person.userId)}
                            disabled={
                              busy ||
                              (!picks.includes(person.userId) &&
                                picks.length >= 49)
                            }
                            onChange={e =>
                              setPicks(current =>
                                e.target.checked
                                  ? [...current, person.userId]
                                  : current.filter(id => id !== person.userId)
                              )
                            }
                          />
                          <span>
                            {person.displayName}
                            <small>
                              {person.handle ? `@${person.handle}` : ""}
                            </small>
                          </span>
                        </label>
                      )
                    )
                  )}
                  {mode !== "direct" ? (
                    <button
                      className="chat-primary"
                      type="button"
                      disabled={
                        busy ||
                        !picks.length ||
                        (mode === "group" && title.trim().length < 2)
                      }
                      onClick={() =>
                        mode === "group"
                          ? void createConversation()
                          : void operate(async () => {
                              await inviteChatPeople(selected!, picks);
                              setMode(null);
                              const detail = await fetchChatRoom(selected!);
                              setMembers(detail.members);
                            })
                      }
                    >
                      {mode === "group"
                        ? "สร้างกลุ่มและส่งคำเชิญ"
                        : "ส่งคำเชิญ"}{" "}
                      ({picks.length})
                    </button>
                  ) : null}
                  <small>ผู้รับต้องตอบรับก่อนอ่านข้อความและไฟล์</small>
                </div>
              ) : null}
              {channelOpen ? (
                <div className="chat-channel-list">
                  <header>
                    <h2>ห้องแข่งขันขิงขิง</h2>
                    <button
                      type="button"
                      className="chat-icon"
                      aria-label="ปิดรายชื่อห้องแข่งขัน"
                      onClick={() => setChannelOpen(false)}
                    >
                      ×
                    </button>
                  </header>
                  <label>
                    เดือนแข่งขัน
                    <input
                      type="month"
                      value={period}
                      min="2000-01"
                      max={currentMonth()}
                      onChange={e => setPeriod(e.target.value)}
                    />
                  </label>
                  <p>
                    เฉพาะผู้ผูกโปรไฟล์ที่ลงสถิติตรงหมวด/เดือน ·
                    เมื่อเข้าร่วมจะอ่านประวัติทั้งหมดได้
                  </p>
                  {channelFocus ? (
                    <button
                      type="button"
                      className="chat-secondary"
                      onClick={() => setChannelFocus(null)}
                    >
                      แสดงห้องทุกหมวด
                    </button>
                  ) : null}
                  {channels
                    .filter(
                      channel =>
                        !channelFocus ||
                        (channel.category === channelFocus.category &&
                          (!channelFocus.boardKey ||
                            channel.boardKey === channelFocus.boardKey))
                    )
                    .map(channel => (
                      <button
                        type="button"
                        key={JSON.stringify([
                          channel.category,
                          channel.boardKey,
                          channel.period,
                        ])}
                        disabled={
                          busy || !channel.eligible || channel.period !== period
                        }
                        className={`chat-channel${target?.boardKey === channel.boardKey ? " is-target" : ""}`}
                        onClick={() =>
                          void operate(async () => {
                            const result = await joinChatChannel(channel);
                            setSelected(result.roomId);
                            setChannelOpen(false);
                            await refreshRooms();
                          })
                        }
                      >
                        <Hash size={16} />
                        <span>
                          {channel.title}
                          <small>
                            {channel.eligible
                              ? "เข้าร่วมพูดคุย"
                              : "ต้องลงสถิติก่อน"}
                          </small>
                        </span>
                      </button>
                    ))}
                </div>
              ) : null}
              <div className="chat-room-list">
                {!rooms.length ? (
                  <div className="chat-empty">
                    <MessageCircle size={26} />
                    <strong>เริ่มบทสนทนาแรก</strong>
                    <p>เลือกคนคุย สร้างกลุ่ม หรือเข้าห้องแข่งขัน</p>
                  </div>
                ) : (
                  rooms.map(item => (
                    <button
                      type="button"
                      className={`chat-room-item${selected === item.id ? " is-selected" : ""}`}
                      aria-current={selected === item.id ? "page" : undefined}
                      key={item.id}
                      onClick={() => {
                        setSelected(item.id);
                        setMode(null);
                        setChannelOpen(false);
                      }}
                    >
                      {item.kind === "channel" ? (
                        <Hash size={20} />
                      ) : item.kind === "group" ? (
                        <Users size={20} />
                      ) : (
                        <MessageCircle size={20} />
                      )}
                      <span>
                        <b>{item.title}</b>
                        <small>
                          {item.state === "invited"
                            ? "คำเชิญ · รอตอบรับ"
                            : item.kind === "direct"
                              ? "ส่วนตัวสองคน"
                              : item.kind === "group"
                                ? "กลุ่มส่วนตัว"
                                : "ผู้เข้าร่วมแข่งขัน"}
                        </small>
                      </span>
                      {item.state === "invited" ? <i>ใหม่</i> : null}
                    </button>
                  ))
                )}
              </div>
              {roomsCursor ? (
                <button
                  type="button"
                  className="chat-history"
                  disabled={roomsMoreBusy}
                  onClick={() => void moreRooms()}
                >
                  {roomsMoreBusy ? "กำลังโหลดห้องเก่า…" : "โหลดห้องก่อนหน้า"}
                </button>
              ) : null}
            </aside>
            <div className="chat-conversation" aria-label="บทสนทนา">
              {!selected ? (
                <div className="chat-empty chat-empty--large">
                  <MessageCircle size={42} />
                  <h2>พื้นที่พูดคุยของคุณ</h2>
                  <p>เลือกห้องด้านซ้าย หรือเริ่มคุยกับเพื่อน</p>
                </div>
              ) : roomLoading ? (
                <p className="chat-loading" role="status">
                  กำลังเปิดห้อง…
                </p>
              ) : room && room.id === selected ? (
                <>
                  <header className="chat-conversation__header">
                    <button
                      type="button"
                      className="chat-icon chat-back"
                      aria-label="กลับรายชื่อห้อง"
                      onClick={() => setSelected(null)}
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <div>
                      <h2>{room.title}</h2>
                      <small>
                        {room.state === "invited"
                          ? "ยังไม่ได้ตอบรับคำเชิญ"
                          : `${members.filter(m => m.state === "active").length} สมาชิกที่แสดง · อัปเดตทุก4วินาที`}
                      </small>
                    </div>
                    {room.state === "active" &&
                    !(
                      room.kind === "group" && room.ownerUserId === me.userId
                    ) ? (
                      <button
                        type="button"
                        className="chat-secondary"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "ออกจากห้องนี้? คุณจะอ่านหรือเปิดไฟล์ไม่ได้อีก แชทสองคนจะไม่เปิดใหม่ในเวอร์ชันนี้ ส่วนกลุ่มหรือห้องแข่งขันต้องได้รับสิทธิ์ใหม่"
                            )
                          )
                            void operate(async () => {
                              await leaveChatRoom(room.id);
                              setRooms(current =>
                                current.filter(item => item.id !== room.id)
                              );
                              setSelected(null);
                              setMessages([]);
                              await refreshRooms();
                            });
                        }}
                      >
                        ออกห้อง
                      </button>
                    ) : null}
                    {room.kind === "group" && room.ownerUserId === me.userId ? (
                      <button
                        type="button"
                        className="chat-secondary"
                        onClick={() => openNew("invite")}
                      >
                        เชิญเพิ่ม
                      </button>
                    ) : null}
                  </header>
                  {room.state === "invited" ? (
                    <div className="chat-invitation">
                      <Users size={32} />
                      <h3>คุณได้รับคำเชิญพูดคุย</h3>
                      <p>
                        เมื่อเข้าร่วม คุณจะอ่านประวัติและไฟล์เดิมได้
                        สมาชิกอื่นจะเห็นชื่อแชทของคุณ
                      </p>
                      <button
                        className="chat-primary"
                        disabled={busy}
                        type="button"
                        onClick={() => void respond(true)}
                      >
                        ตอบรับและเข้าร่วม
                      </button>
                      <button
                        className="chat-secondary"
                        disabled={busy}
                        type="button"
                        onClick={() => void respond(false)}
                      >
                        ปฏิเสธ
                      </button>
                    </div>
                  ) : (
                    <>
                      <details className="chat-members">
                        <summary>
                          สมาชิกและคำเชิญที่แสดง ({members.length})
                        </summary>
                        {members.map(person => (
                          <span key={person.userId}>
                            {person.displayName} ·{" "}
                            {person.state === "active"
                              ? "เข้าร่วมแล้ว"
                              : "รอตอบรับ"}
                          </span>
                        ))}
                      </details>
                      <div
                        className="chat-messages"
                        ref={scrollRef}
                        onScroll={event => {
                          const e = event.currentTarget;
                          stickBottom.current =
                            e.scrollHeight - e.scrollTop - e.clientHeight < 120;
                        }}
                      >
                        {historyMore ? (
                          <button
                            className="chat-history"
                            type="button"
                            disabled={historyBusy}
                            onClick={() => void older()}
                          >
                            {historyBusy ? "กำลังโหลด…" : "โหลดข้อความก่อนหน้า"}
                          </button>
                        ) : null}
                        {!messages.length ? (
                          <div className="chat-empty">
                            <p>ยังไม่มีข้อความ เริ่มพูดคุยได้เลย</p>
                          </div>
                        ) : (
                          messages.map(message => (
                            <article
                              className={`chat-bubble${message.sender.userId === me.userId ? " is-own" : ""}`}
                              key={message.id}
                            >
                              <header>
                                <b>{message.sender.displayName}</b>
                                <time dateTime={message.createdAt}>
                                  {new Date(message.createdAt).toLocaleString(
                                    "th-TH",
                                    {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    }
                                  )}
                                </time>
                              </header>
                              {message.text ? <p>{message.text}</p> : null}
                              {message.files.map(file => (
                                <ChatMedia key={file.id} file={file} />
                              ))}
                            </article>
                          ))
                        )}
                      </div>
                      <ChatComposer
                        key={room.id}
                        roomId={room.id}
                        onSent={message => {
                          stickBottom.current = true;
                          setMessages(current =>
                            mergeChatMessages(current, [message])
                          );
                          void refreshRooms().catch(() => {});
                        }}
                        onForbidden={() => {
                          setRoom(null);
                          setMessages([]);
                          setError(
                            "สิทธิ์ห้องเปลี่ยนหรือsessionหมดอายุ กรุณาเปิดห้อง/เข้าสู่ระบบใหม่"
                          );
                        }}
                      />
                    </>
                  )}
                </>
              ) : (
                <div className="chat-empty">
                  <p>เปิดห้องนี้ไม่ได้ กรุณาตรวจสิทธิ์หรือเลือกห้องอื่น</p>
                  <button
                    type="button"
                    className="chat-secondary"
                    onClick={() => setSelected(null)}
                  >
                    กลับรายชื่อห้อง
                  </button>
                </div>
              )}
            </div>
          </div>
          <p className="chat-privacy">
            <LockKeyhole size={12} />
            อ่านข้อความ/ไฟล์ได้เฉพาะสมาชิกที่ตอบรับ · ไม่มีE2EE ·
            ผู้ดำเนินการServer/Databaseอาจเข้าถึงข้อมูลได้
          </p>
        </>
      ) : null}
    </section>
  );
}
