import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Settings,
  X,
  Plus,
  Image as ImageIcon,
  ChevronLeft,
  Trash2,
  Key,
  MessageCircle,
  Calendar,
  CalendarDays,
  BookHeart,
  ChevronRight,
  Sparkles,
  Palette,
  Trash,
  StickyNote,
  ScrollText,
  Code2,
  User,
  Brain,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from "lucide-react";

function useSystemTheme() {
  const [isDark, setIsDark] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : true
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDark;
}

const STORAGE_KEY = "app-data";
const APP_TITLE = "Always"; // 开屏动画显示的名字，改这里就行

const DEFAULT_CHARACTER = {
  id: "default-1",
  name: "沉舟",
  desc: "温柔、话不多但很稳，喜欢在细节里关心人，说话简短自然，像日常聊天一样，不会长篇大论。",
  avatar: null,
  memory: "", // 长期记忆摘要，随聊天推进被 AI 提炼更新
  memoryUpdatedAtCount: 0, // 上次更新记忆时的消息总数，用来判断要不要再总结一次
  chatBg: "default", // 聊天背景预设key，'custom'时用 chatBgImage
  chatBgImage: null, // 自定义背景图 base64
  temperature: 1, // 0-1.5，越高越发散随性，越低越稳定保守
  extraPrompt: "", // 高级：追加的原始系统提示词，直接拼进 system
  profile: "", // 更详细的人物背景设定，独立于简短的desc
  provider: "anthropic", // 'anthropic' | 'deepseek'
  model: "claude-sonnet-4-6",
};

const CHAT_BG_PRESETS = {
  default: { label: "默认", swatch: null }, // 跟随深浅色系统主题
  cream: { label: "暖米色", swatch: "#f2e8d8", bg: "#f2e8d8" },
  sky: { label: "浅蓝", swatch: "#e3edf7", bg: "#e3edf7" },
  sage: { label: "淡绿", swatch: "#e6ede4", bg: "#e6ede4" },
  blush: { label: "樱粉", swatch: "#fbe8ec", bg: "#fbe8ec" },
  ink: { label: "墨黑", swatch: "#161616", bg: "#161616" },
  custom: { label: "自定义图片", swatch: null },
};

const MEMORY_UPDATE_INTERVAL = 12; // 每新增这么多条消息，触发一次记忆更新

function defaultAppData() {
  return {
    apiKeys: { anthropic: "", deepseek: "" },
    characters: [DEFAULT_CHARACTER],
    messagesByCharacter: {
      [DEFAULT_CHARACTER.id]: [
        { id: 1, role: "assistant", text: "在的，今天过得怎么样？" },
      ],
    },
    events: [], // { id, title, date: 'YYYY-MM-DD', repeatYearly: bool, note }
    journalByCharacter: {}, // { [characterId]: [{ id, date: 'YYYY-MM-DD', userText, aiText }] }
    userProfile: { name: "", avatar: null, bio: "" },
    thinkingEnabled: false,
  };
}

function splitIntoBubbles(text) {
  const raw = text
    .replace(/\n+/g, "\n")
    .split(/(?<=[。！？…\n])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const merged = [];
  for (const seg of raw) {
    if (merged.length && (merged[merged.length - 1].length < 4 || seg.length < 4)) {
      merged[merged.length - 1] += seg;
    } else {
      merged.push(seg);
    }
  }
  return merged.length ? merged : [text];
}

// 解析 AI 回复里是否包裹了番外故事卡片或 HTML 渲染卡片
function parseSpecialCard(fullText) {
  const storyMatch = fullText.match(/<STORY title="([^"]*)">([\s\S]*?)<\/STORY>/);
  if (storyMatch) {
    return { type: "story", title: storyMatch[1].trim() || "番外", content: storyMatch[2].trim() };
  }
  const htmlMatch = fullText.match(/<HTMLDOC title="([^"]*)">([\s\S]*?)<\/HTMLDOC>/);
  if (htmlMatch) {
    return { type: "html", title: htmlMatch[1].trim() || "网页", content: htmlMatch[2].trim() };
  }
  return null;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const PAPER_STYLES = {
  cream: {
    label: "米黄横线",
    bg: "#faf6ec",
    text: "#3a3226",
    faint: "rgba(58,50,38,0.4)",
    bgImage: "repeating-linear-gradient(rgba(58,50,38,0.08) 0px, rgba(58,50,38,0.08) 1px, transparent 1px, transparent 34px)",
    bgPos: "0 64px",
    swatch: "#faf6ec",
  },
  grid: {
    label: "方格纸",
    bg: "#f4f7fb",
    text: "#2c3440",
    faint: "rgba(44,52,64,0.4)",
    bgImage:
      "repeating-linear-gradient(rgba(44,52,64,0.07) 0px, rgba(44,52,64,0.07) 1px, transparent 1px, transparent 24px), repeating-linear-gradient(90deg, rgba(44,52,64,0.07) 0px, rgba(44,52,64,0.07) 1px, transparent 1px, transparent 24px)",
    bgPos: "0 0",
    swatch: "#f4f7fb",
  },
  kraft: {
    label: "牛皮纸",
    bg: "#d9c4a1",
    text: "#3f2e1a",
    faint: "rgba(63,46,26,0.45)",
    bgImage:
      "radial-gradient(circle at 20% 30%, rgba(255,255,255,0.12), transparent 60%), radial-gradient(circle at 80% 70%, rgba(0,0,0,0.08), transparent 55%)",
    bgPos: "0 0",
    swatch: "#d9c4a1",
  },
  pink: {
    label: "少女粉",
    bg: "#fdeef2",
    text: "#5a3644",
    faint: "rgba(90,54,68,0.4)",
    bgImage: "radial-gradient(rgba(224,120,150,0.15) 1px, transparent 1px)",
    bgPos: "0 0",
    bgSize: "16px 16px",
    swatch: "#fdeef2",
  },
  starry: {
    label: "深夜星空",
    bg: "#1a1a2e",
    text: "#e8e6f0",
    faint: "rgba(232,230,240,0.4)",
    bgImage:
      "radial-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), radial-gradient(rgba(255,255,255,0.3) 1px, transparent 1px)",
    bgPos: "0 0, 10px 15px",
    bgSize: "22px 22px, 30px 30px",
    swatch: "#1a1a2e",
  },
};

const STICKER_EMOJIS = ["🌸", "💛", "⭐️", "🍀", "🎀", "☁️", "🐾", "💌", "🍂", "🌙", "✨", "🧸", "🍒", "🌈", "📎", "🕊️"];

const PROVIDERS = {
  anthropic: {
    label: "Anthropic",
    keyPlaceholder: "sk-ant-...",
    keyHint: "去 console.anthropic.com 创建",
    models: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    ],
    supportsImage: true,
  },
  deepseek: {
    label: "DeepSeek",
    keyPlaceholder: "sk-...",
    keyHint: "去 platform.deepseek.com 创建",
    models: [
      { id: "deepseek-chat", label: "DeepSeek-V3 (deepseek-chat)" },
      { id: "deepseek-reasoner", label: "DeepSeek-R1 (deepseek-reasoner)" },
    ],
    supportsImage: false,
  },
};

// 统一的模型调用封装：屏蔽 Anthropic / DeepSeek 两种不同的请求格式
// logicalMessages: [{ role: 'user'|'assistant', text, image?: {base64, mediaType} }]
async function callModel({ provider, model, apiKey, system, logicalMessages, temperature, useThinking, maxTokens }) {
  if (!apiKey) return { error: "缺少 API Key" };

  if (provider === "deepseek") {
    const messages = [
      { role: "system", content: system },
      ...logicalMessages.map((m) => ({
        role: m.role,
        content: m.image ? `${m.text || "看看这张图"}\n（注：DeepSeek 当前不支持读图，已忽略图片内容）` : m.text || "",
      })),
    ];
    try {
      // 走自己部署的后端代理（/api/deepseek），不直接从浏览器打到 DeepSeek，
      // 因为 DeepSeek 官方接口没有开放浏览器直连的 CORS 许可，直连会被浏览器拦截。
      const response = await fetch("/api/deepseek", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey,
          model: model || "deepseek-chat",
          max_tokens: maxTokens || 800,
          temperature: temperature ?? 1,
          messages,
        }),
      });
      const data = await response.json();
      if (data?.error) return { error: data.error.message || "DeepSeek 请求出错" };
      const choice = data?.choices?.[0]?.message;
      return {
        text: choice?.content || "",
        thinking: useThinking ? choice?.reasoning_content || "" : "",
      };
    } catch (e) {
      return { error: "代理请求失败，检查后端是否部署成功" };
    }
  }

  // 默认 Anthropic
  const anthropicMessages = logicalMessages.map((m) => {
    if (m.image) {
      return {
        role: m.role,
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: m.image.mediaType, data: m.image.base64 },
          },
          { type: "text", text: m.text || "看看这张图" },
        ],
      };
    }
    return { role: m.role, content: m.text || "" };
  });

  const body = {
    model: model || "claude-sonnet-4-6",
    max_tokens: maxTokens || (useThinking ? 2000 : 500),
    system,
    messages: anthropicMessages,
  };
  if (useThinking) {
    body.thinking = { type: "enabled", budget_tokens: Math.min(1200, (maxTokens || 2000) - 500) };
  } else {
    body.temperature = temperature ?? 1;
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (data?.error) return { error: data.error.message || "请检查 API Key 是否正确" };
    const thinkingText = data?.content
      ?.filter((b) => b.type === "thinking")
      .map((b) => b.thinking || "")
      .join("\n\n");
    const text = data?.content?.map((b) => (b.type === "text" ? b.text : "")).join("");
    return { text: text || "", thinking: thinkingText || "" };
  } catch (e) {
    return { error: "网络请求失败" };
  }
}

async function summarizeMemory({ apiKey, provider, model, existingMemory, recentMessages, personaName }) {
  const transcript = recentMessages
    .map((m) => `${m.role === "user" ? "用户" : personaName}: ${m.text || "[图片]"}`)
    .join("\n");

  const prompt = `已有的长期记忆摘要（可能为空）：
${existingMemory || "（暂无）"}

以下是最近一段对话记录：
${transcript}

请更新长期记忆摘要。要求：
- 只保留重要、值得长期记住的信息：用户的身份/习惯/喜好、重要事件、双方关系进展、承诺过的事
- 不要记录寒暄、重复的问候语这类没有信息量的内容
- 和已有摘要合并，去重，不要重复罗列
- 用简洁的条目式中文写，每条一行，不超过8条
- 只输出摘要内容本身，不要任何前言或解释`;

  const result = await callModel({
    provider,
    model,
    apiKey,
    system: "你是一个总结助手，只输出要求的内容，不加任何前言。",
    logicalMessages: [{ role: "user", text: prompt }],
    maxTokens: 400,
  });
  return result?.text?.trim() || null;
}

export default function ChatApp() {
  const isDark = useSystemTheme();
  const c = isDark
    ? {
        pageBg: "#0b0b0c",
        headerBg: "#141416",
        headerBorder: "rgba(255,255,255,0.06)",
        nameText: "#ffffff",
        subText: "rgba(255,255,255,0.35)",
        iconColor: "rgba(255,255,255,0.5)",
        bubbleUserBg: "#3478f6",
        bubbleUserText: "#ffffff",
        bubbleAIBg: "#2c2c2e",
        bubbleAIText: "#ffffff",
        inputBarBg: "#141416",
        inputBarBorder: "rgba(255,255,255,0.06)",
        inputFieldBg: "#1c1c1e",
        inputFieldText: "#ffffff",
        typingDot: "rgba(255,255,255,0.4)",
        modalBg: "#1c1c1e",
        modalText: "#ffffff",
        modalSubText: "rgba(255,255,255,0.4)",
        modalFieldBg: "#2c2c2e",
        listItemBorder: "rgba(255,255,255,0.06)",
        listItemHover: "rgba(255,255,255,0.04)",
        danger: "#ff453a",
      }
    : {
        pageBg: "#f2f2f4",
        headerBg: "#ffffff",
        headerBorder: "rgba(0,0,0,0.06)",
        nameText: "#000000",
        subText: "rgba(0,0,0,0.4)",
        iconColor: "rgba(0,0,0,0.4)",
        bubbleUserBg: "#3478f6",
        bubbleUserText: "#ffffff",
        bubbleAIBg: "#e9e9eb",
        bubbleAIText: "#000000",
        inputBarBg: "#ffffff",
        inputBarBorder: "rgba(0,0,0,0.06)",
        inputFieldBg: "#f0f0f1",
        inputFieldText: "#000000",
        typingDot: "rgba(0,0,0,0.3)",
        modalBg: "#ffffff",
        modalText: "#000000",
        modalSubText: "rgba(0,0,0,0.4)",
        modalFieldBg: "#f0f0f1",
        listItemBorder: "rgba(0,0,0,0.06)",
        listItemHover: "rgba(0,0,0,0.03)",
        danger: "#ff3b30",
      };

  const [loaded, setLoaded] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const letterCount = APP_TITLE.length;
    const totalMs = letterCount * 90 + 550; // 每个字延迟90ms起跳 + 单次跳动动画时长 + 缓冲
    const t = setTimeout(() => setSplashDone(true), totalMs);
    return () => clearTimeout(t);
  }, []);
  const [view, setView] = useState("list"); // 'list' | 'chat' | 'calendar'
  const [apiKeys, setApiKeys] = useState({ anthropic: "", deepseek: "" });
  const [characters, setCharacters] = useState([]);
  const [messagesByCharacter, setMessagesByCharacter] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [events, setEvents] = useState([]);
  const [userProfile, setUserProfile] = useState({ name: "", avatar: null, bio: "" });
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [journalByCharacter, setJournalByCharacter] = useState({});
  const [journalIndex, setJournalIndex] = useState(0); // 当前查看的日记页在排序数组里的下标
  const [journalDraftText, setJournalDraftText] = useState("");
  const [journalGenerating, setJournalGenerating] = useState(false);
  const [journalFlipDir, setJournalFlipDir] = useState(null); // 'left' | 'right' | null，用来触发翻页动画
  const [viewingCard, setViewingCard] = useState(null); // { type, title, content } | null
  const [showChatBgPicker, setShowChatBgPicker] = useState(false);
  const [expandedThinkingIds, setExpandedThinkingIds] = useState(() => new Set());
  const chatBgInputRef = useRef(null);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [selectedStickerId, setSelectedStickerId] = useState(null);
  const journalPageRef = useRef(null);
  const stickerDragRef = useRef(null); // { mode: 'move'|'scale'|'rotate', stickerId, centerPx, startAngle, startScale, startDist }

  const [showApiModal, setShowApiModal] = useState(false);
  const [draftApiKeys, setDraftApiKeys] = useState({ anthropic: "", deepseek: "" });

  const [showUserProfileModal, setShowUserProfileModal] = useState(false);
  const [draftUserName, setDraftUserName] = useState("");
  const [draftUserBio, setDraftUserBio] = useState("");
  const [draftUserAvatar, setDraftUserAvatar] = useState(null);
  const userAvatarInputRef = useRef(null);

  const [showCharModal, setShowCharModal] = useState(false);
  const [editingCharId, setEditingCharId] = useState(null); // null = creating new
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftAvatar, setDraftAvatar] = useState(null);
  const [draftTemperature, setDraftTemperature] = useState(1);
  const [draftExtraPrompt, setDraftExtraPrompt] = useState("");
  const [draftProfile, setDraftProfile] = useState("");
  const [draftProvider, setDraftProvider] = useState("anthropic");
  const [draftModel, setDraftModel] = useState("claude-sonnet-4-6");
  const [showAdvancedChar, setShowAdvancedChar] = useState(false);

  const [manageMode, setManageMode] = useState(false);

  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [draftEventTitle, setDraftEventTitle] = useState("");
  const [draftEventDate, setDraftEventDate] = useState("");
  const [draftEventRepeat, setDraftEventRepeat] = useState(false);
  const [draftEventNote, setDraftEventNote] = useState("");
  const [calendarCursor, setCalendarCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() }; // month: 0-11
  });
  const [selectedDate, setSelectedDate] = useState(null); // 'YYYY-MM-DD'

  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [showPlusMenu, setShowPlusMenu] = useState(false);

  const scrollRef = useRef(null);
  const imageInputRef = useRef(null);
  const avatarInputRef = useRef(null);

  // ---- Load from persistent storage on mount ----
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        const migratedKeys = data.apiKeys || { anthropic: data.apiKey || "", deepseek: "" };
        setApiKeys(migratedKeys);
        setCharacters(data.characters?.length ? data.characters : [DEFAULT_CHARACTER]);
        setMessagesByCharacter(data.messagesByCharacter || {});
        setEvents(data.events || []);
        setJournalByCharacter(data.journalByCharacter || {});
        setUserProfile(data.userProfile || { name: "", avatar: null, bio: "" });
        setThinkingEnabled(!!data.thinkingEnabled);
      } else {
        const d = defaultAppData();
        setApiKeys(d.apiKeys);
        setCharacters(d.characters);
        setMessagesByCharacter(d.messagesByCharacter);
        setEvents(d.events);
        setJournalByCharacter(d.journalByCharacter);
        setUserProfile(d.userProfile);
        setThinkingEnabled(d.thinkingEnabled);
      }
    } catch (e) {
      const d = defaultAppData();
      setApiKeys(d.apiKeys);
      setCharacters(d.characters);
      setMessagesByCharacter(d.messagesByCharacter);
      setEvents(d.events);
      setJournalByCharacter(d.journalByCharacter);
      setUserProfile(d.userProfile);
      setThinkingEnabled(d.thinkingEnabled);
    } finally {
      setLoaded(true);
    }
  }, []);

  const persist = useCallback((next) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      console.error("save failed", e);
    }
  }, []);

  // Save whenever core data changes (after initial load)
  useEffect(() => {
    if (!loaded) return;
    persist({ apiKeys, characters, messagesByCharacter, events, journalByCharacter, userProfile, thinkingEnabled });
  }, [loaded, apiKeys, characters, messagesByCharacter, events, journalByCharacter, userProfile, thinkingEnabled, persist]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messagesByCharacter, activeId, typing]);

  const activeChar = characters.find((ch) => ch.id === activeId);
  const activeMessages = activeId ? messagesByCharacter[activeId] || [] : [];

  // ---- Character CRUD ----
  const openNewCharacter = () => {
    setEditingCharId(null);
    setDraftName("");
    setDraftDesc("");
    setDraftAvatar(null);
    setDraftTemperature(1);
    setDraftExtraPrompt("");
    setDraftProfile("");
    setDraftProvider("anthropic");
    setDraftModel(PROVIDERS.anthropic.models[0].id);
    setShowAdvancedChar(false);
    setShowCharModal(true);
  };

  const openEditCharacter = (ch) => {
    setEditingCharId(ch.id);
    setDraftName(ch.name);
    setDraftDesc(ch.desc);
    setDraftAvatar(ch.avatar);
    setDraftTemperature(ch.temperature ?? 1);
    setDraftExtraPrompt(ch.extraPrompt || "");
    setDraftProfile(ch.profile || "");
    setDraftProvider(ch.provider || "anthropic");
    setDraftModel(ch.model || PROVIDERS[ch.provider || "anthropic"].models[0].id);
    setShowAdvancedChar(false);
    setShowCharModal(true);
  };

  const saveCharacter = () => {
    const name = draftName.trim() || "未命名";
    const desc = draftDesc.trim();
    if (editingCharId) {
      setCharacters((prev) =>
        prev.map((ch) =>
          ch.id === editingCharId
            ? {
                ...ch,
                name,
                desc,
                avatar: draftAvatar,
                temperature: draftTemperature,
                extraPrompt: draftExtraPrompt.trim(),
                profile: draftProfile.trim(),
                provider: draftProvider,
                model: draftModel,
              }
            : ch
        )
      );
    } else {
      const id = uid();
      setCharacters((prev) => [
        ...prev,
        {
          id,
          name,
          desc,
          avatar: draftAvatar,
          memory: "",
          memoryUpdatedAtCount: 0,
          chatBg: "default",
          chatBgImage: null,
          temperature: draftTemperature,
          extraPrompt: draftExtraPrompt.trim(),
          profile: draftProfile.trim(),
          provider: draftProvider,
          model: draftModel,
        },
      ]);
      setMessagesByCharacter((prev) => ({
        ...prev,
        [id]: [{ id: 1, role: "assistant", text: "嗨，我们开始聊吧" }],
      }));
    }
    setShowCharModal(false);
  };

  function renderAdvancedCharSection() {
    return (
      <div className="mb-4">
        <button
          onClick={() => setShowAdvancedChar((v) => !v)}
          style={{ color: c.bubbleUserBg }}
          className="text-[13px] font-medium mb-3"
        >
          {showAdvancedChar ? "收起高级设置 ▲" : "高级设置（服务商 / 模型 / 温度 / 详细人设）▼"}
        </button>
        {showAdvancedChar && (
          <div>
            <label style={{ color: c.modalSubText }} className="text-[12px]">
              AI 服务商
            </label>
            <div className="flex gap-2 mt-1 mb-3">
              {Object.entries(PROVIDERS).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => {
                    setDraftProvider(key);
                    setDraftModel(cfg.models[0].id);
                  }}
                  style={{
                    backgroundColor: draftProvider === key ? c.bubbleUserBg : c.modalFieldBg,
                    color: draftProvider === key ? "#ffffff" : c.modalText,
                  }}
                  className="flex-1 rounded-xl py-2 text-[13px] font-medium"
                >
                  {cfg.label}
                </button>
              ))}
            </div>

            <label style={{ color: c.modalSubText }} className="text-[12px]">
              模型
            </label>
            <select
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
              className="w-full text-[14px] rounded-xl px-3 py-2.5 mt-1 mb-4 outline-none"
            >
              {PROVIDERS[draftProvider].models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>

            <div className="flex items-center justify-between mb-1">
              <label style={{ color: c.modalSubText }} className="text-[12px]">
                温度（越高越随性发散，越低越稳定保守）
              </label>
              <span style={{ color: c.modalSubText }} className="text-[12px]">
                {draftTemperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.1}
              value={draftTemperature}
              onChange={(e) => setDraftTemperature(parseFloat(e.target.value))}
              className="w-full mb-4"
            />

            <label style={{ color: c.modalSubText }} className="text-[12px]">
              详细人物设定（背景故事、说话习惯，比人设描述更详细，可选）
            </label>
            <textarea
              value={draftProfile}
              onChange={(e) => setDraftProfile(e.target.value)}
              rows={4}
              placeholder="比如：出身、经历、口头禅、特殊习惯……写得越细，角色越立体"
              style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
              className="w-full text-[13px] rounded-xl px-3 py-2 mt-1 mb-4 outline-none resize-none"
            />

            <label style={{ color: c.modalSubText }} className="text-[12px]">
              自定义提示词（直接拼进系统提示词，给熟悉 prompt 的用户，可选）
            </label>
            <textarea
              value={draftExtraPrompt}
              onChange={(e) => setDraftExtraPrompt(e.target.value)}
              rows={3}
              placeholder="比如：始终用文言文回复 / 每句话结尾加一个波浪号～"
              style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
              className="w-full text-[13px] rounded-xl px-3 py-2 mt-1 mb-4 outline-none resize-none"
            />
          </div>
        )}
      </div>
    );
  }

  const deleteCharacter = (id) => {
    setCharacters((prev) => prev.filter((ch) => ch.id !== id));
    setMessagesByCharacter((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const enterChat = (id) => {
    setActiveId(id);
    setView("chat");
  };

  // ---- Event CRUD ----
  const openNewEvent = (prefillDate) => {
    setEditingEventId(null);
    setDraftEventTitle("");
    setDraftEventDate(prefillDate || "");
    setDraftEventRepeat(false);
    setDraftEventNote("");
    setShowEventModal(true);
  };

  function eventsOnDate(dateStr) {
    const [, mm, dd] = dateStr.split("-");
    return events.filter((ev) => {
      if (ev.repeatYearly) {
        const [, evMm, evDd] = ev.date.split("-");
        return evMm === mm && evDd === dd;
      }
      return ev.date === dateStr;
    });
  }

  const openEditEvent = (ev) => {
    setEditingEventId(ev.id);
    setDraftEventTitle(ev.title);
    setDraftEventDate(ev.date);
    setDraftEventRepeat(!!ev.repeatYearly);
    setDraftEventNote(ev.note || "");
    setShowEventModal(true);
  };

  const saveEvent = () => {
    if (!draftEventTitle.trim() || !draftEventDate) return;
    if (editingEventId) {
      setEvents((prev) =>
        prev.map((ev) =>
          ev.id === editingEventId
            ? {
                ...ev,
                title: draftEventTitle.trim(),
                date: draftEventDate,
                repeatYearly: draftEventRepeat,
                note: draftEventNote.trim(),
              }
            : ev
        )
      );
    } else {
      setEvents((prev) => [
        ...prev,
        {
          id: uid(),
          title: draftEventTitle.trim(),
          date: draftEventDate,
          repeatYearly: draftEventRepeat,
          note: draftEventNote.trim(),
        },
      ]);
    }
    setShowEventModal(false);
  };

  const deleteEvent = (id) => {
    setEvents((prev) => prev.filter((ev) => ev.id !== id));
  };

  // 计算和"今天"相关的事件文本，供 system prompt 使用
  function getRelevantEventsText() {
    if (!events.length) return "";
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const daysUntil = (dateStr, repeatYearly) => {
      const target = new Date(dateStr + "T00:00:00");
      let compareTarget = target;
      if (repeatYearly) {
        compareTarget = new Date(today.getFullYear(), target.getMonth(), target.getDate());
        if (compareTarget < new Date(today.toDateString())) {
          compareTarget = new Date(today.getFullYear() + 1, target.getMonth(), target.getDate());
        }
      }
      const diffMs = compareTarget.setHours(0, 0, 0, 0) - new Date(today.toDateString()).getTime();
      return Math.round(diffMs / 86400000);
    };

    const lines = [];
    for (const ev of events) {
      const d = daysUntil(ev.date, ev.repeatYearly);
      if (d === 0) lines.push(`今天就是"${ev.title}"${ev.note ? "（" + ev.note + "）" : ""}`);
      else if (d > 0 && d <= 7) lines.push(`还有${d}天是"${ev.title}"${ev.note ? "（" + ev.note + "）" : ""}`);
      else if (d < 0 && d >= -2) lines.push(`"${ev.title}"是${-d}天前`);
    }
    return lines.join("\n");
  }

  // ---- Journal helpers ----
  function getJournalEntries(charId) {
    const list = journalByCharacter[charId] || [];
    return [...list].sort((a, b) => a.date.localeCompare(b.date));
  }

  function openJournal(charId) {
    setActiveId(charId);
    setView("journal");
    const entries = getJournalEntries(charId);
    if (entries.length === 0) {
      goToTodayJournal(charId);
      return;
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    let idx = entries.findIndex((e) => e.date === todayStr);
    if (idx === -1) idx = entries.length - 1;
    setJournalIndex(idx);
    setJournalDraftText(entries[idx]?.userText || "");
  }

  function goToTodayJournal(charId) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const existing = journalByCharacter[charId] || [];
    let entries = existing;
    if (!existing.some((e) => e.date === todayStr)) {
      const newEntry = { id: uid(), date: todayStr, userText: "", aiText: "", paperStyle: "cream", stickers: [] };
      entries = [...existing, newEntry];
      setJournalByCharacter((prev) => ({ ...prev, [charId]: entries }));
    }
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
    const idx = sorted.findIndex((e) => e.date === todayStr);
    setJournalIndex(idx === -1 ? sorted.length - 1 : idx);
    setJournalDraftText(sorted[idx]?.userText || "");
  }

  function saveJournalText(charId, date, text) {
    setJournalByCharacter((prev) => {
      const list = prev[charId] || [];
      const next = list.map((e) => (e.date === date ? { ...e, userText: text } : e));
      return { ...prev, [charId]: next };
    });
  }

  function setEntryPaperStyle(charId, date, styleKey) {
    setJournalByCharacter((prev) => {
      const list = prev[charId] || [];
      const next = list.map((e) => (e.date === date ? { ...e, paperStyle: styleKey } : e));
      return { ...prev, [charId]: next };
    });
  }

  function addStickerToEntry(charId, date, emoji) {
    const newSticker = { id: uid(), emoji, x: 50, y: 45, rot: 0, scale: 1 };
    setJournalByCharacter((prev) => {
      const list = prev[charId] || [];
      const next = list.map((e) =>
        e.date === date ? { ...e, stickers: [...(e.stickers || []), newSticker] } : e
      );
      return { ...prev, [charId]: next };
    });
    return newSticker.id;
  }

  function updateStickerInEntry(charId, date, stickerId, patch) {
    setJournalByCharacter((prev) => {
      const list = prev[charId] || [];
      const next = list.map((e) => {
        if (e.date !== date) return e;
        return {
          ...e,
          stickers: (e.stickers || []).map((s) => (s.id === stickerId ? { ...s, ...patch } : s)),
        };
      });
      return { ...prev, [charId]: next };
    });
  }

  function removeStickerFromEntry(charId, date, stickerId) {
    setJournalByCharacter((prev) => {
      const list = prev[charId] || [];
      const next = list.map((e) =>
        e.date === date ? { ...e, stickers: (e.stickers || []).filter((s) => s.id !== stickerId) } : e
      );
      return { ...prev, [charId]: next };
    });
  }

  async function requestAiJournalEntry(charId, date) {
    const persona = characters.find((ch) => ch.id === charId);
    const entries = journalByCharacter[charId] || [];
    const entry = entries.find((e) => e.date === date);
    const provider = persona?.provider || "anthropic";
    const key = apiKeys[provider];
    if (!persona || !entry || !key) {
      if (!key) {
        setShowApiModal(true);
        setDraftApiKeys({ ...apiKeys });
      }
      return;
    }
    setJournalGenerating(true);
    const dateLabel = new Date(date + "T00:00:00").toLocaleDateString("zh-CN", {
      month: "long",
      day: "numeric",
      weekday: "long",
    });
    const prompt = `你正在扮演"${persona.name}"。人设：${persona.desc}
${persona.memory ? `你记得关于对方的事：\n${persona.memory}\n` : ""}
今天是${dateLabel}。这是你和对方共用的日记本，对方今天写了这一段：
「${entry.userText || "（对方今天什么都没写）"}」

请你以"${persona.name}"的第一人称，写一段日记式的回应/感想，像真的在同一个本子上续写一样。要求：
- 直接输出日记正文，不要加称呼、不要说"作为AI"
- 语气贴合人设，自然、有生活气息，不要浮夸
- 3-5句话即可，不用太长
- 可以回应对方写的内容，也可以聊聊你自己"当天"的感想`;

    try {
      const result = await callModel({
        provider,
        model: persona.model,
        apiKey: key,
        system: "你是一个日记共写助手，严格按用户要求的格式输出正文。",
        logicalMessages: [{ role: "user", text: prompt }],
        maxTokens: 400,
      });
      const text = result?.text?.trim();
      if (text) {
        setJournalByCharacter((prev) => {
          const list = prev[charId] || [];
          const next = list.map((e) => (e.date === date ? { ...e, aiText: text } : e));
          return { ...prev, [charId]: next };
        });
      }
    } catch (e) {
      // 静默失败，用户可以再点一次
    } finally {
      setJournalGenerating(false);
    }
  }

  // ---- Image / avatar pickers ----
  const handlePickImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    setPendingImage({
      base64,
      mediaType: file.type || "image/jpeg",
      previewUrl: URL.createObjectURL(file),
    });
    setShowPlusMenu(false);
    e.target.value = "";
  };

  const handlePickAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    setDraftAvatar(`data:${file.type || "image/jpeg"};base64,${base64}`);
    e.target.value = "";
  };

  const handlePickUserAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    setDraftUserAvatar(`data:${file.type || "image/jpeg"};base64,${base64}`);
    e.target.value = "";
  };

  const saveUserProfile = () => {
    setUserProfile({
      name: draftUserName.trim(),
      bio: draftUserBio.trim(),
      avatar: draftUserAvatar,
    });
    setShowUserProfileModal(false);
  };

  const setCharacterChatBg = (charId, key) => {
    setCharacters((prev) => prev.map((ch) => (ch.id === charId ? { ...ch, chatBg: key } : ch)));
  };

  const handlePickChatBgImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeId) return;
    const base64 = await fileToBase64(file);
    const dataUrl = `data:${file.type || "image/jpeg"};base64,${base64}`;
    setCharacters((prev) =>
      prev.map((ch) => (ch.id === activeId ? { ...ch, chatBg: "custom", chatBgImage: dataUrl } : ch))
    );
    e.target.value = "";
  };

  // ---- Send message ----
  const sendMessage = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || typing || !activeId) return;

    const currentIdEarly = activeId;
    const personaEarly = characters.find((ch) => ch.id === currentIdEarly);
    const providerEarly = personaEarly?.provider || "anthropic";

    if (!apiKeys[providerEarly]) {
      setShowApiModal(true);
      setDraftApiKeys({ ...apiKeys });
      return;
    }

    const now = new Date();
    const userMsg = {
      id: Date.now(),
      role: "user",
      text,
      image: pendingImage ? pendingImage.previewUrl : null,
    };
    const imageForApi = pendingImage;
    const currentId = activeId;
    const prevMessages = messagesByCharacter[currentId] || [];
    const nextMessages = [...prevMessages, userMsg];
    setMessagesByCharacter((prev) => ({ ...prev, [currentId]: nextMessages }));
    setInput("");
    setPendingImage(null);
    setTyping(true);

    const nowStr = now.toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      dateStyle: "full",
      timeStyle: "short",
    });

    const persona = characters.find((ch) => ch.id === currentId);
    const provider = persona?.provider || "anthropic";
    const providerConfig = PROVIDERS[provider];
    const model = persona?.model || providerConfig.models[0].id;
    const useThinking = thinkingEnabled && provider === "anthropic"; // DeepSeek 的推理链是模型自带的，不走这个开关

    const eventsText = getRelevantEventsText();

    const userInfoText = userProfile.name || userProfile.bio
      ? `关于正在和你聊天的这个人：${userProfile.name ? `ta 希望你叫 ta "${userProfile.name}"。` : ""}${userProfile.bio ? `\n${userProfile.bio}` : ""}\n`
      : "";

    const systemPrompt = `你正在扮演一个虚构角色，名字叫"${persona?.name}"。人设：${persona?.desc}
${persona?.profile ? `更详细的人物设定：\n${persona.profile}\n` : ""}${userInfoText}当前真实时间：${nowStr}（这是背景信息，只有在自然的时候才提起，不要每句话都报时间）。
${persona?.memory ? `关于对方，你记得这些（自然地在合适的时候体现出"记得"，不要生硬地罗列出来）：\n${persona.memory}\n` : ""}${eventsText ? `日历上最近的事：\n${eventsText}\n（如果合适，可以自然提起，不用每次都说）\n` : ""}回复要求：
- 像正常人发微信/iMessage一样说话，简短、口语化，可以分成2-4句短话
- 每句之间用换行分隔
- 不要用旁白、动作描写、星号，不要说"作为AI"
- 不要一次性输出一大段书面语
- 如果对方发了图片，自然地聊图片里的内容，别机械描述
- 如果对方明确要求你写一段番外、小故事、长篇内容，不要用聊天气泡铺满屏幕，而是把全部正文包裹在这个标签里：<STORY title="一个简短标题">正文内容，可以分段，可以较长</STORY>，标签外不要输出任何其他文字
- 如果对方明确要求你写网页、HTML、可视化页面、小游戏这类东西，把完整可运行的 HTML 代码（包含 style 和 script）包裹在这个标签里：<HTMLDOC title="一个简短标题">完整HTML代码</HTMLDOC>，标签外不要输出任何其他文字
- 除上述两种明确请求外，一律用普通分句聊天的方式回复${persona?.extraPrompt ? `\n\n额外指示：\n${persona.extraPrompt}` : ""}`;

    try {
      const logicalMessages = nextMessages.slice(-12).map((m) => {
        if (m.image && m === userMsg && imageForApi && providerConfig.supportsImage) {
          return { role: "user", text, image: { base64: imageForApi.base64, mediaType: imageForApi.mediaType } };
        }
        return {
          role: m.role,
          text: m.text || (m.cardType ? `[${m.cardType === "story" ? "番外" : "网页"}：${m.cardTitle}] ${m.cardContent?.slice(0, 300) || ""}` : "[图片]"),
        };
      });

      const result = await callModel({
        provider,
        model,
        apiKey: apiKeys[provider],
        system: systemPrompt,
        logicalMessages,
        temperature: persona?.temperature ?? 1,
        useThinking,
      });

      if (result.error) {
        setMessagesByCharacter((prev) => ({
          ...prev,
          [currentId]: [
            ...(prev[currentId] || []),
            {
              id: Date.now(),
              role: "assistant",
              text: `（请求出错：${result.error}）`,
            },
          ],
        }));
        setTyping(false);
        return;
      }

      const thinkingText = result.thinking || "";
      const fullText = result.text || "……(没接收到回复)";

      const card = parseSpecialCard(fullText);
      let bubbleCountForMemory = 0;

      if (card) {
        await new Promise((r) => setTimeout(r, 500));
        setMessagesByCharacter((prev) => ({
          ...prev,
          [currentId]: [
            ...(prev[currentId] || []),
            {
              id: Date.now(),
              role: "assistant",
              cardType: card.type,
              cardTitle: card.title,
              cardContent: card.content,
              thinking: thinkingText || undefined,
            },
          ],
        }));
        bubbleCountForMemory = 1;
      } else {
        const bubbles = splitIntoBubbles(fullText);
        bubbleCountForMemory = bubbles.length;

        for (let i = 0; i < bubbles.length; i++) {
          await new Promise((r) => setTimeout(r, 500 + Math.min(bubbles[i].length * 25, 900)));
          setMessagesByCharacter((prev) => ({
            ...prev,
            [currentId]: [
              ...(prev[currentId] || []),
              {
                id: Date.now() + i,
                role: "assistant",
                text: bubbles[i],
                thinking: i === 0 ? thinkingText || undefined : undefined,
              },
            ],
          }));
        }
      }

      // 消息数够多了，异步触发一次记忆总结，不阻塞聊天
      const totalCount = nextMessages.length + bubbleCountForMemory;
      const lastUpdated = persona?.memoryUpdatedAtCount || 0;
      if (totalCount - lastUpdated >= MEMORY_UPDATE_INTERVAL) {
        const toSummarize = nextMessages.slice(lastUpdated);
        summarizeMemory({
          apiKey: apiKeys[provider],
          provider,
          model,
          existingMemory: persona?.memory || "",
          recentMessages: toSummarize,
          personaName: persona?.name || "角色",
        }).then((newMemory) => {
          if (newMemory) {
            setCharacters((prev) =>
              prev.map((ch) =>
                ch.id === currentId
                  ? { ...ch, memory: newMemory, memoryUpdatedAtCount: totalCount }
                  : ch
              )
            );
          }
        });
      }
    } catch (e) {
      setMessagesByCharacter((prev) => ({
        ...prev,
        [currentId]: [
          ...(prev[currentId] || []),
          { id: Date.now(), role: "assistant", text: "（网络好像断了，等下再试试）" },
        ],
      }));
    } finally {
      setTyping(false);
    }
  };

  const saveApiKey = () => {
    setApiKeys({
      anthropic: draftApiKeys.anthropic.trim(),
      deepseek: draftApiKeys.deepseek.trim(),
    });
    setShowApiModal(false);
  };

  const lastMessagePreview = (id) => {
    const msgs = messagesByCharacter[id] || [];
    const last = msgs[msgs.length - 1];
    if (!last) return "";
    if (last.cardType) return last.cardType === "story" ? `[番外] ${last.cardTitle}` : `[网页] ${last.cardTitle}`;
    if (last.image && !last.text) return "[图片]";
    return last.text;
  };

  if (!splashDone || !loaded) {
    return (
      <div
        style={{ backgroundColor: c.pageBg }}
        className="h-screen w-full flex items-center justify-center"
      >
        <style>{`
          @keyframes letterJump {
            0% { transform: translateY(0); }
            30% { transform: translateY(-16px); }
            55% { transform: translateY(0); }
            100% { transform: translateY(0); }
          }
        `}</style>
        <div className="flex">
          {APP_TITLE.split("").map((ch, i) => (
            <span
              key={i}
              style={{
                color: c.nameText,
                display: "inline-block",
                animation: "letterJump 0.5s ease-out",
                animationDelay: `${i * 90}ms`,
                animationFillMode: "both",
              }}
              className="text-[34px] font-semibold"
            >
              {ch}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // ================= LIST VIEW =================
  if (view === "list") {
    return (
      <div style={{ backgroundColor: c.pageBg }} className="h-screen w-full flex flex-col font-sans">
        <div
          style={{ backgroundColor: c.headerBg, borderBottomColor: c.headerBorder }}
          className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        >
          <button
            onClick={() => {
              setDraftUserName(userProfile.name);
              setDraftUserBio(userProfile.bio);
              setDraftUserAvatar(userProfile.avatar);
              setShowUserProfileModal(true);
            }}
            className="flex items-center gap-2"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#3478f6] flex items-center justify-center text-white overflow-hidden shrink-0">
              {userProfile.avatar ? (
                <img src={userProfile.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <User size={16} />
              )}
            </div>
            <div style={{ color: c.nameText }} className="text-[20px] font-semibold">
              消息
            </div>
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setManageMode((v) => !v)}
              style={{ color: manageMode ? c.bubbleUserBg : c.iconColor }}
              className="px-2.5 h-8 flex items-center justify-center rounded-full text-[13px] font-medium"
            >
              {manageMode ? "完成" : "管理"}
            </button>
            <button
              onClick={() => setView("calendar")}
              style={{ color: c.iconColor }}
              className="w-8 h-8 flex items-center justify-center rounded-full"
            >
              <CalendarDays size={17} />
            </button>
            <button
              onClick={() => {
                setDraftApiKeys({ ...apiKeys });
                setShowApiModal(true);
              }}
              style={{ color: c.iconColor }}
              className="w-8 h-8 flex items-center justify-center rounded-full"
            >
              <SlidersHorizontal size={16} />
            </button>
            <button
              onClick={openNewCharacter}
              style={{ color: c.iconColor }}
              className="w-8 h-8 flex items-center justify-center rounded-full"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {!apiKeys.anthropic && !apiKeys.deepseek && (
          <button
            onClick={() => {
              setDraftApiKeys({ ...apiKeys });
              setShowApiModal(true);
            }}
            style={{ backgroundColor: isDark ? "#1c2a44" : "#e8f0fe", color: "#3478f6" }}
            className="mx-4 mt-3 rounded-xl px-3.5 py-2.5 text-[13px] text-left"
          >
            还没设置 API Key，点这里填写才能开始聊天 →
          </button>
        )}

        <div className="flex-1 overflow-y-auto">
          {characters.length === 0 && (
            <div style={{ color: c.subText }} className="text-center text-[14px] mt-16">
              还没有角色，点右上角 + 创建一个
            </div>
          )}
          {characters.map((ch) => (
            <div
              key={ch.id}
              style={{ borderBottomColor: c.listItemBorder }}
              className="flex items-center gap-3 px-4 py-3 border-b active:opacity-70"
              onClick={() => (manageMode ? openEditCharacter(ch) : enterChat(ch.id))}
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#5b6cff] to-[#8b5cf6] flex items-center justify-center text-white text-base font-medium overflow-hidden shrink-0">
                {ch.avatar ? (
                  <img src={ch.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  ch.name.slice(0, 1)
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ color: c.nameText }} className="text-[15px] font-medium leading-none">
                  {ch.name}
                </div>
                <div style={{ color: c.subText }} className="text-[13px] mt-1.5 truncate">
                  {lastMessagePreview(ch.id) || "暂无消息"}
                </div>
              </div>
              {manageMode && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteCharacter(ch.id);
                  }}
                  style={{ color: c.danger }}
                  className="w-8 h-8 flex items-center justify-center shrink-0"
                >
                  <Trash2 size={18} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* API Key modal */}
        {showApiModal && (
          <div className="absolute inset-0 bg-black/60 flex items-end sm:items-center justify-center z-20">
            <div style={{ backgroundColor: c.modalBg }} className="w-full sm:w-96 sm:rounded-2xl rounded-t-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div style={{ color: c.modalText }} className="text-[16px] font-medium">
                  API Key 设置
                </div>
                <button onClick={() => setShowApiModal(false)} style={{ color: c.modalSubText }}>
                  <X size={18} />
                </button>
              </div>
              <div style={{ color: c.modalSubText }} className="text-[12px] mb-3 leading-relaxed">
                填哪家的 Key，角色就能用哪家的模型。都只存在你自己的浏览器里。
              </div>

              {Object.entries(PROVIDERS).map(([key, cfg]) => (
                <div key={key} className="mb-4">
                  <label style={{ color: c.modalSubText }} className="text-[12px]">
                    {cfg.label} API Key（{cfg.keyHint}）
                  </label>
                  <input
                    value={draftApiKeys[key]}
                    onChange={(e) => setDraftApiKeys((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={cfg.keyPlaceholder}
                    style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
                    className="w-full text-[14px] rounded-xl px-3 py-2.5 mt-1 outline-none"
                  />
                </div>
              ))}

              <label className="flex items-center justify-between mb-4">
                <div>
                  <div style={{ color: c.modalText }} className="text-[14px]">
                    显示思考链
                  </div>
                  <div style={{ color: c.modalSubText }} className="text-[11px] mt-0.5">
                    开启后能看到角色回复前的推理过程（仅对 Anthropic 生效），但会稍微变慢
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={thinkingEnabled}
                  onChange={(e) => setThinkingEnabled(e.target.checked)}
                  className="w-5 h-5 shrink-0 ml-3"
                />
              </label>
              <button
                onClick={saveApiKey}
                style={{ backgroundColor: c.bubbleUserBg, color: "#ffffff" }}
                className="w-full rounded-xl py-2.5 text-[15px] font-medium"
              >
                保存
              </button>
            </div>
          </div>
        )}

        {/* User profile modal */}
        {showUserProfileModal && (
          <div className="absolute inset-0 bg-black/60 flex items-end sm:items-center justify-center z-20">
            <div style={{ backgroundColor: c.modalBg }} className="w-full sm:w-96 sm:rounded-2xl rounded-t-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div style={{ color: c.modalText }} className="text-[16px] font-medium">
                  我的主页
                </div>
                <button onClick={() => setShowUserProfileModal(false)} style={{ color: c.modalSubText }}>
                  <X size={18} />
                </button>
              </div>

              <input
                ref={userAvatarInputRef}
                type="file"
                accept="image/*"
                onChange={handlePickUserAvatar}
                className="hidden"
              />
              <div className="flex justify-center mb-4">
                <button
                  onClick={() => userAvatarInputRef.current?.click()}
                  className="w-16 h-16 rounded-full bg-gradient-to-br from-[#8b5cf6] to-[#3478f6] flex items-center justify-center text-white overflow-hidden"
                >
                  {draftUserAvatar ? (
                    <img src={draftUserAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User size={24} />
                  )}
                </button>
              </div>

              <label style={{ color: c.modalSubText }} className="text-[12px]">
                昵称
              </label>
              <input
                value={draftUserName}
                onChange={(e) => setDraftUserName(e.target.value)}
                placeholder="角色会这样称呼你"
                style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
                className="w-full text-[15px] rounded-xl px-3 py-2 mt-1 mb-4 outline-none"
              />

              <label style={{ color: c.modalSubText }} className="text-[12px]">
                关于我（可选）
              </label>
              <textarea
                value={draftUserBio}
                onChange={(e) => setDraftUserBio(e.target.value)}
                rows={4}
                placeholder="性格、喜好、正在忙的事……角色聊天时会参考这些"
                style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
                className="w-full text-[14px] rounded-xl px-3 py-2 mt-1 mb-4 outline-none resize-none"
              />

              <button
                onClick={saveUserProfile}
                style={{ backgroundColor: c.bubbleUserBg, color: "#ffffff" }}
                className="w-full rounded-xl py-2.5 text-[15px] font-medium"
              >
                保存
              </button>
            </div>
          </div>
        )}
        {showCharModal && (
          <div className="absolute inset-0 bg-black/60 flex items-end sm:items-center justify-center z-20">
            <div style={{ backgroundColor: c.modalBg }} className="w-full sm:w-96 sm:rounded-2xl rounded-t-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div style={{ color: c.modalText }} className="text-[16px] font-medium">
                  {editingCharId ? "编辑角色" : "新建角色"}
                </div>
                <button onClick={() => setShowCharModal(false)} style={{ color: c.modalSubText }}>
                  <X size={18} />
                </button>
              </div>
              <div className="flex justify-center mb-4">
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  className="w-16 h-16 rounded-full bg-gradient-to-br from-[#5b6cff] to-[#8b5cf6] flex items-center justify-center text-white text-lg font-medium overflow-hidden relative"
                >
                  {draftAvatar ? (
                    <img src={draftAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    draftName.slice(0, 1) || "?"
                  )}
                </button>
              </div>
              <input ref={avatarInputRef} type="file" accept="image/*" onChange={handlePickAvatar} className="hidden" />
              <label style={{ color: c.modalSubText }} className="text-[12px]">
                名字
              </label>
              <input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
                className="w-full text-[15px] rounded-xl px-3 py-2 mt-1 mb-4 outline-none"
              />
              <label style={{ color: c.modalSubText }} className="text-[12px]">
                人设描述
              </label>
              <textarea
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                rows={4}
                placeholder="性格、说话方式、背景故事……"
                style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
                className="w-full text-[14px] rounded-xl px-3 py-2 mt-1 mb-4 outline-none resize-none"
              />
              {renderAdvancedCharSection()}
              {editingCharId && (
                <>
                  <div className="flex items-center justify-between">
                    <label style={{ color: c.modalSubText }} className="text-[12px]">
                      长期记忆（AI 自动整理，可以手动改）
                    </label>
                    {characters.find((ch) => ch.id === editingCharId)?.memory && (
                      <button
                        onClick={() =>
                          setCharacters((prev) =>
                            prev.map((ch) =>
                              ch.id === editingCharId
                                ? { ...ch, memory: "", memoryUpdatedAtCount: 0 }
                                : ch
                            )
                          )
                        }
                        style={{ color: c.danger }}
                        className="text-[12px]"
                      >
                        清空
                      </button>
                    )}
                  </div>
                  <textarea
                    value={characters.find((ch) => ch.id === editingCharId)?.memory || ""}
                    onChange={(e) =>
                      setCharacters((prev) =>
                        prev.map((ch) =>
                          ch.id === editingCharId ? { ...ch, memory: e.target.value } : ch
                        )
                      )
                    }
                    rows={4}
                    placeholder="聊够一定条数后，这里会自动出现 AI 整理的记忆摘要"
                    style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
                    className="w-full text-[13px] rounded-xl px-3 py-2 mt-1 mb-4 outline-none resize-none"
                  />
                </>
              )}
              <button
                onClick={saveCharacter}
                style={{ backgroundColor: c.bubbleUserBg, color: "#ffffff" }}
                className="w-full rounded-xl py-2.5 text-[15px] font-medium"
              >
                保存
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ================= CALENDAR VIEW =================
  if (view === "calendar") {
    const todayStr = new Date().toISOString().slice(0, 10);
    const { year, month } = calendarCursor;

    const firstDayOfMonth = new Date(year, month, 1);
    const startWeekday = firstDayOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const pad = (n) => String(n).padStart(2, "0");
    const dateStrFor = (d) => `${year}-${pad(month + 1)}-${pad(d)}`;

    const goPrevMonth = () =>
      setCalendarCursor((cur) => {
        const m = cur.month - 1;
        return m < 0 ? { year: cur.year - 1, month: 11 } : { year: cur.year, month: m };
      });
    const goNextMonth = () =>
      setCalendarCursor((cur) => {
        const m = cur.month + 1;
        return m > 11 ? { year: cur.year + 1, month: 0 } : { year: cur.year, month: m };
      });

    const selectedEvents = selectedDate ? eventsOnDate(selectedDate) : [];
    const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

    return (
      <div style={{ backgroundColor: c.pageBg }} className="h-screen w-full flex flex-col font-sans relative">
        <div
          style={{ backgroundColor: c.headerBg, borderBottomColor: c.headerBorder }}
          className="flex items-center justify-between px-2 py-3 border-b shrink-0"
        >
          <div className="flex items-center gap-1">
            <button
              onClick={() => setView("list")}
              style={{ color: c.iconColor }}
              className="w-9 h-9 flex items-center justify-center rounded-full"
            >
              <ChevronLeft size={22} />
            </button>
            <div style={{ color: c.nameText }} className="text-[17px] font-semibold ml-1">
              {year}年{month + 1}月
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={goPrevMonth}
              style={{ color: c.iconColor }}
              className="w-9 h-9 flex items-center justify-center rounded-full text-[18px]"
            >
              ‹
            </button>
            <button
              onClick={goNextMonth}
              style={{ color: c.iconColor }}
              className="w-9 h-9 flex items-center justify-center rounded-full text-[18px]"
            >
              ›
            </button>
          </div>
        </div>

        {/* Weekday header */}
        <div className="grid grid-cols-7 px-2 pt-3 pb-1 shrink-0">
          {weekdayLabels.map((w) => (
            <div key={w} style={{ color: c.subText }} className="text-center text-[12px]">
              {w}
            </div>
          ))}
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-7 px-2 gap-y-1 shrink-0">
          {cells.map((d, idx) => {
            if (d === null) return <div key={`empty-${idx}`} />;
            const dateStr = dateStrFor(d);
            const isToday = dateStr === todayStr;
            const dayEvents = eventsOnDate(dateStr);
            const hasEvents = dayEvents.length > 0;
            return (
              <button
                key={dateStr}
                onClick={() => {
                  setSelectedDate(dateStr);
                }}
                className="flex flex-col items-center justify-start py-1.5 gap-1"
              >
                <div
                  style={{
                    backgroundColor: isToday ? c.bubbleUserBg : "transparent",
                    color: isToday ? "#ffffff" : c.nameText,
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[14px] font-medium"
                >
                  {d}
                </div>
                <div
                  style={{ backgroundColor: hasEvents ? c.bubbleUserBg : "transparent" }}
                  className="w-1 h-1 rounded-full"
                />
              </button>
            );
          })}
        </div>

        {/* Selected day panel */}
        <div
          style={{ borderTopColor: c.listItemBorder }}
          className="flex-1 overflow-y-auto border-t mt-3"
        >
          {!selectedDate && (
            <div style={{ color: c.subText }} className="text-center text-[14px] mt-10 px-8 leading-relaxed">
              点日期上方的格子，看看那天有什么事，或者加一条新的
            </div>
          )}
          {selectedDate && (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div style={{ color: c.nameText }} className="text-[15px] font-medium">
                  {selectedDate.slice(5, 7)}月{selectedDate.slice(8, 10)}日
                </div>
                <button
                  onClick={() => openNewEvent(selectedDate)}
                  style={{ color: c.bubbleUserBg }}
                  className="text-[13px] font-medium"
                >
                  + 添加事件
                </button>
              </div>
              {selectedEvents.length === 0 && (
                <div style={{ color: c.subText }} className="text-[13px] py-4 text-center">
                  这天还没有事件
                </div>
              )}
              {selectedEvents.map((ev) => (
                <div
                  key={ev.id}
                  onClick={() => openEditEvent(ev)}
                  style={{ backgroundColor: c.bubbleAIBg }}
                  className="rounded-xl px-3.5 py-2.5 mb-2 active:opacity-70"
                >
                  <div style={{ color: c.nameText }} className="text-[14px] font-medium">
                    {ev.title}
                    {ev.repeatYearly && (
                      <span style={{ color: c.subText }} className="text-[11px] ml-1.5 font-normal">
                        每年
                      </span>
                    )}
                  </div>
                  {ev.note && (
                    <div style={{ color: c.subText }} className="text-[12px] mt-0.5">
                      {ev.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {showEventModal && (
          <div className="absolute inset-0 bg-black/60 flex items-end sm:items-center justify-center z-20">
            <div style={{ backgroundColor: c.modalBg }} className="w-full sm:w-96 sm:rounded-2xl rounded-t-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div style={{ color: c.modalText }} className="text-[16px] font-medium">
                  {editingEventId ? "编辑事件" : "新建事件"}
                </div>
                <button onClick={() => setShowEventModal(false)} style={{ color: c.modalSubText }}>
                  <X size={18} />
                </button>
              </div>
              <label style={{ color: c.modalSubText }} className="text-[12px]">
                标题
              </label>
              <input
                value={draftEventTitle}
                onChange={(e) => setDraftEventTitle(e.target.value)}
                placeholder="比如：念念生日"
                style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
                className="w-full text-[15px] rounded-xl px-3 py-2 mt-1 mb-4 outline-none"
              />
              <label style={{ color: c.modalSubText }} className="text-[12px]">
                日期
              </label>
              <input
                type="date"
                value={draftEventDate}
                onChange={(e) => setDraftEventDate(e.target.value)}
                style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
                className="w-full text-[15px] rounded-xl px-3 py-2 mt-1 mb-4 outline-none"
              />
              <label className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  checked={draftEventRepeat}
                  onChange={(e) => setDraftEventRepeat(e.target.checked)}
                  className="w-4 h-4"
                />
                <span style={{ color: c.modalText }} className="text-[14px]">
                  每年重复（生日/纪念日选这个）
                </span>
              </label>
              <label style={{ color: c.modalSubText }} className="text-[12px]">
                备注（可选）
              </label>
              <textarea
                value={draftEventNote}
                onChange={(e) => setDraftEventNote(e.target.value)}
                rows={2}
                placeholder="给角色的一点背景信息"
                style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
                className="w-full text-[14px] rounded-xl px-3 py-2 mt-1 mb-4 outline-none resize-none"
              />
              <div className="flex gap-2">
                {editingEventId && (
                  <button
                    onClick={() => {
                      deleteEvent(editingEventId);
                      setShowEventModal(false);
                    }}
                    style={{ backgroundColor: c.modalFieldBg, color: c.danger }}
                    className="flex-1 rounded-xl py-2.5 text-[15px] font-medium"
                  >
                    删除
                  </button>
                )}
                <button
                  onClick={saveEvent}
                  style={{ backgroundColor: c.bubbleUserBg, color: "#ffffff" }}
                  className="flex-1 rounded-xl py-2.5 text-[15px] font-medium"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ================= JOURNAL VIEW =================
  if (view === "journal") {
    const entries = getJournalEntries(activeId);
    const currentEntry = entries[journalIndex];
    const hasPrev = journalIndex > 0;
    const hasNext = journalIndex < entries.length - 1;
    const isToday = currentEntry?.date === new Date().toISOString().slice(0, 10);

    const styleKey = currentEntry?.paperStyle || "cream";
    const paper = PAPER_STYLES[styleKey] || PAPER_STYLES.cream;

    const flip = (dir) => {
      if (dir === "prev" && !hasPrev) return;
      if (dir === "next" && !hasNext) return;
      const newIdx = dir === "prev" ? journalIndex - 1 : journalIndex + 1;
      setJournalFlipDir(dir === "prev" ? "right" : "left");
      if (currentEntry) saveJournalText(activeId, currentEntry.date, journalDraftText);
      setSelectedStickerId(null);
      setJournalIndex(newIdx);
      setJournalDraftText(entries[newIdx]?.userText || "");
    };

    const formattedDate = currentEntry
      ? new Date(currentEntry.date + "T00:00:00").toLocaleDateString("zh-CN", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
        })
      : "";

    // ---- Sticker drag/scale/rotate handlers ----
    const getPagePx = (clientX, clientY) => {
      const rect = journalPageRef.current.getBoundingClientRect();
      return { px: clientX - rect.left, py: clientY - rect.top, rect };
    };

    const handleStickerPointerDown = (e, sticker) => {
      e.stopPropagation();
      e.preventDefault();
      setSelectedStickerId(sticker.id);
      e.currentTarget.setPointerCapture(e.pointerId);
      const { rect } = getPagePx(e.clientX, e.clientY);
      stickerDragRef.current = {
        mode: "move",
        stickerId: sticker.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startX: sticker.x,
        startY: sticker.y,
        rectW: rect.width,
        rectH: rect.height,
      };
    };

    const handleStickerPointerMove = (e) => {
      const drag = stickerDragRef.current;
      if (!drag || drag.mode !== "move") return;
      const dxPct = ((e.clientX - drag.startClientX) / drag.rectW) * 100;
      const dyPct = ((e.clientY - drag.startClientY) / drag.rectH) * 100;
      const newX = Math.min(96, Math.max(4, drag.startX + dxPct));
      const newY = Math.min(96, Math.max(4, drag.startY + dyPct));
      updateStickerInEntry(activeId, currentEntry.date, drag.stickerId, { x: newX, y: newY });
    };

    const handleStickerPointerUp = () => {
      stickerDragRef.current = null;
    };

    const handleScalePointerDown = (e, sticker) => {
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const { rect } = getPagePx(e.clientX, e.clientY);
      const centerPx = { x: (sticker.x / 100) * rect.width + rect.left, y: (sticker.y / 100) * rect.height + rect.top };
      const startDist = Math.hypot(e.clientX - centerPx.x, e.clientY - centerPx.y);
      stickerDragRef.current = {
        mode: "scale",
        stickerId: sticker.id,
        centerPx,
        startDist: Math.max(startDist, 1),
        startScale: sticker.scale || 1,
      };
    };

    const handleScalePointerMove = (e) => {
      const drag = stickerDragRef.current;
      if (!drag || drag.mode !== "scale") return;
      const dist = Math.hypot(e.clientX - drag.centerPx.x, e.clientY - drag.centerPx.y);
      const ratio = dist / drag.startDist;
      const newScale = Math.min(3, Math.max(0.4, drag.startScale * ratio));
      updateStickerInEntry(activeId, currentEntry.date, drag.stickerId, { scale: newScale });
    };

    const handleRotatePointerDown = (e, sticker) => {
      e.stopPropagation();
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const { rect } = getPagePx(e.clientX, e.clientY);
      const centerPx = { x: (sticker.x / 100) * rect.width + rect.left, y: (sticker.y / 100) * rect.height + rect.top };
      const startAngle = (Math.atan2(e.clientY - centerPx.y, e.clientX - centerPx.x) * 180) / Math.PI;
      stickerDragRef.current = {
        mode: "rotate",
        stickerId: sticker.id,
        centerPx,
        startAngle,
        startRot: sticker.rot || 0,
      };
    };

    const handleRotatePointerMove = (e) => {
      const drag = stickerDragRef.current;
      if (!drag || drag.mode !== "rotate") return;
      const angle = (Math.atan2(e.clientY - drag.centerPx.y, e.clientX - drag.centerPx.x) * 180) / Math.PI;
      const newRot = drag.startRot + (angle - drag.startAngle);
      updateStickerInEntry(activeId, currentEntry.date, drag.stickerId, { rot: newRot });
    };

    const handleAnyPointerMove = (e) => {
      const drag = stickerDragRef.current;
      if (!drag) return;
      if (drag.mode === "move") handleStickerPointerMove(e);
      else if (drag.mode === "scale") handleScalePointerMove(e);
      else if (drag.mode === "rotate") handleRotatePointerMove(e);
    };

    return (
      <div style={{ backgroundColor: c.pageBg }} className="h-screen w-full flex flex-col font-sans relative">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Zhi+Mang+Xing&family=Ma+Shan+Zheng&display=swap');
          @keyframes pageFromLeft { from { transform: translateX(-24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          @keyframes pageFromRight { from { transform: translateX(24px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
          .journal-page-left { animation: pageFromLeft 0.28s ease-out; }
          .journal-page-right { animation: pageFromRight 0.28s ease-out; }
          .journal-hand { font-family: 'Zhi Mang Xing', cursive; }
        `}</style>

        <div
          style={{ backgroundColor: c.headerBg, borderBottomColor: c.headerBorder }}
          className="flex items-center justify-between px-2 py-3 border-b shrink-0"
        >
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (currentEntry) saveJournalText(activeId, currentEntry.date, journalDraftText);
                setView("chat");
              }}
              style={{ color: c.iconColor }}
              className="w-9 h-9 flex items-center justify-center rounded-full"
            >
              <ChevronLeft size={22} />
            </button>
            <div style={{ color: c.nameText }} className="text-[16px] font-medium ml-1">
              和{activeChar?.name}的日记本
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            {currentEntry && (
              <>
                <button
                  onClick={() => {
                    setShowStickerPicker((v) => !v);
                    setShowStylePicker(false);
                  }}
                  style={{ color: showStickerPicker ? c.bubbleUserBg : c.iconColor }}
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                >
                  <Sparkles size={16} />
                </button>
                <button
                  onClick={() => {
                    setShowStylePicker((v) => !v);
                    setShowStickerPicker(false);
                  }}
                  style={{ color: showStylePicker ? c.bubbleUserBg : c.iconColor }}
                  className="w-8 h-8 flex items-center justify-center rounded-full"
                >
                  <Palette size={16} />
                </button>
              </>
            )}
            <button
              onClick={() => goToTodayJournal(activeId)}
              style={{ color: c.bubbleUserBg }}
              className="px-2.5 h-8 flex items-center justify-center text-[13px] font-medium"
            >
              今天
            </button>
          </div>
        </div>

        {/* Style picker row */}
        {showStylePicker && currentEntry && (
          <div style={{ backgroundColor: c.headerBg, borderBottomColor: c.headerBorder }} className="flex items-center gap-3 px-4 py-3 border-b shrink-0 overflow-x-auto">
            {Object.entries(PAPER_STYLES).map(([key, s]) => (
              <button
                key={key}
                onClick={() => setEntryPaperStyle(activeId, currentEntry.date, key)}
                className="flex flex-col items-center gap-1 shrink-0"
              >
                <div
                  style={{
                    backgroundColor: s.swatch,
                    borderColor: styleKey === key ? c.bubbleUserBg : "transparent",
                  }}
                  className="w-9 h-9 rounded-full border-2"
                />
                <span style={{ color: c.subText }} className="text-[10px]">
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Sticker picker row */}
        {showStickerPicker && currentEntry && (
          <div style={{ backgroundColor: c.headerBg, borderBottomColor: c.headerBorder }} className="flex items-center gap-3 px-4 py-3 border-b shrink-0 overflow-x-auto">
            {STICKER_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => {
                  const id = addStickerToEntry(activeId, currentEntry.date, emoji);
                  setSelectedStickerId(id);
                  setShowStickerPicker(false);
                }}
                className="text-[26px] shrink-0 active:scale-90 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <div
          className="flex-1 overflow-y-auto flex items-start justify-center px-4 py-5"
          onPointerDown={() => setSelectedStickerId(null)}
        >
          {!currentEntry ? (
            <div style={{ color: c.subText }} className="text-center text-[14px] mt-16 px-8 leading-relaxed">
              <BookHeart size={32} className="mx-auto mb-3 opacity-40" />
              还没有日记，点右上角"今天"写下第一篇
            </div>
          ) : (
            <div
              key={currentEntry.date}
              ref={journalPageRef}
              onPointerMove={handleAnyPointerMove}
              onPointerUp={handleStickerPointerUp}
              onPointerDown={(e) => e.stopPropagation()}
              className={`relative w-full max-w-md rounded-2xl shadow-lg overflow-hidden ${
                journalFlipDir === "left" ? "journal-page-left" : journalFlipDir === "right" ? "journal-page-right" : ""
              }`}
              style={{
                backgroundColor: paper.bg,
                backgroundImage: paper.bgImage,
                backgroundPosition: paper.bgPos,
                backgroundSize: paper.bgSize,
              }}
            >
              <div className="px-6 pt-6 pb-2">
                <div style={{ color: paper.faint }} className="text-[12px] tracking-wide">
                  {formattedDate}
                  {isToday && <span className="ml-1.5">· 今天</span>}
                </div>
              </div>

              <div className="px-6 pb-2">
                <textarea
                  value={journalDraftText}
                  onChange={(e) => setJournalDraftText(e.target.value)}
                  onBlur={() => saveJournalText(activeId, currentEntry.date, journalDraftText)}
                  placeholder="今天想写点什么呢……"
                  rows={5}
                  style={{ color: paper.text, lineHeight: "34px" }}
                  className="journal-hand w-full bg-transparent outline-none resize-none text-[19px]"
                />
              </div>

              <div style={{ borderTopColor: paper.faint }} className="mx-6 border-t border-dashed pt-3 pb-6 opacity-90">
                <div style={{ color: paper.faint }} className="text-[12px] mb-2">
                  {activeChar?.name} 的回信
                </div>
                {currentEntry.aiText ? (
                  <div style={{ color: paper.text, lineHeight: "34px" }} className="journal-hand text-[19px] whitespace-pre-wrap">
                    {currentEntry.aiText}
                  </div>
                ) : (
                  <button
                    onClick={() => requestAiJournalEntry(activeId, currentEntry.date)}
                    disabled={journalGenerating}
                    style={{ color: journalGenerating ? paper.faint : c.bubbleUserBg }}
                    className="flex items-center gap-1.5 text-[13px] font-medium"
                  >
                    <Sparkles size={14} />
                    {journalGenerating ? "写着呢..." : `请${activeChar?.name}也写一段`}
                  </button>
                )}
              </div>

              {/* Sticker layer */}
              {(currentEntry.stickers || []).map((s) => {
                const isSelected = selectedStickerId === s.id;
                return (
                  <div
                    key={s.id}
                    style={{
                      position: "absolute",
                      left: `${s.x}%`,
                      top: `${s.y}%`,
                      transform: `translate(-50%, -50%) rotate(${s.rot || 0}deg) scale(${s.scale || 1})`,
                      touchAction: "none",
                    }}
                    onPointerDown={(e) => handleStickerPointerDown(e, s)}
                    className="select-none cursor-grab"
                  >
                    <div className="relative">
                      <div className="text-[34px] leading-none">{s.emoji}</div>
                      {isSelected && (
                        <>
                          <div className="absolute inset-0 -m-2 border border-dashed rounded-lg" style={{ borderColor: c.bubbleUserBg }} />
                          <button
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeStickerFromEntry(activeId, currentEntry.date, s.id);
                              setSelectedStickerId(null);
                            }}
                            style={{ backgroundColor: c.danger }}
                            className="absolute -top-3 -right-3 w-5 h-5 rounded-full flex items-center justify-center text-white"
                          >
                            <X size={11} />
                          </button>
                          <div
                            onPointerDown={(e) => handleScalePointerDown(e, s)}
                            style={{ backgroundColor: c.bubbleUserBg, touchAction: "none" }}
                            className="absolute -bottom-3 -right-3 w-5 h-5 rounded-full cursor-nwse-resize"
                          />
                          <div
                            onPointerDown={(e) => handleRotatePointerDown(e, s)}
                            style={{ backgroundColor: c.bubbleUserBg, touchAction: "none" }}
                            className="absolute -top-3 -left-3 w-5 h-5 rounded-full cursor-grab"
                          />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Page navigation */}
        {entries.length > 0 && (
          <div className="flex items-center justify-center gap-6 pb-4 pt-1 shrink-0">
            <button
              onClick={() => flip("prev")}
              disabled={!hasPrev}
              style={{ color: hasPrev ? c.iconColor : c.listItemBorder }}
              className="w-9 h-9 flex items-center justify-center rounded-full"
            >
              <ChevronLeft size={20} />
            </button>
            <div style={{ color: c.subText }} className="text-[12px]">
              {journalIndex + 1} / {entries.length}
            </div>
            <button
              onClick={() => flip("next")}
              disabled={!hasNext}
              style={{ color: hasNext ? c.iconColor : c.listItemBorder }}
              className="w-9 h-9 flex items-center justify-center rounded-full"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}
      </div>
    );
  }

  // ================= CHAT VIEW =================
  return (
    <div style={{ backgroundColor: c.pageBg }} className="h-screen w-full flex flex-col font-sans relative">
      <div
        style={{ backgroundColor: c.headerBg, borderBottomColor: c.headerBorder }}
        className="flex items-center justify-between px-2 py-3 border-b shrink-0"
      >
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <button
            onClick={() => setView("list")}
            style={{ color: c.iconColor }}
            className="w-9 h-9 flex items-center justify-center rounded-full shrink-0"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#5b6cff] to-[#8b5cf6] flex items-center justify-center text-white text-xs font-medium overflow-hidden shrink-0">
            {activeChar?.avatar ? (
              <img src={activeChar.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              activeChar?.name?.slice(0, 1)
            )}
          </div>
          <div className="ml-2 min-w-0">
            <div style={{ color: c.nameText }} className="text-[15px] font-medium truncate leading-none">
              {activeChar?.name}
            </div>
            <div style={{ color: c.subText }} className="text-[10px] mt-1 truncate">
              {PROVIDERS[activeChar?.provider || "anthropic"]?.models.find((m) => m.id === activeChar?.model)?.label ||
                activeChar?.model ||
                "Claude Sonnet 4.6"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={() => setShowChatBgPicker((v) => !v)}
            style={{ color: showChatBgPicker ? c.bubbleUserBg : c.iconColor }}
            className="w-8 h-8 flex items-center justify-center rounded-full"
          >
            <ImageIcon size={17} />
          </button>
          <button
            onClick={() => activeId && openJournal(activeId)}
            style={{ color: c.iconColor }}
            className="w-8 h-8 flex items-center justify-center rounded-full"
          >
            <BookHeart size={17} />
          </button>
          <button
            onClick={() => activeChar && openEditCharacter(activeChar)}
            style={{ color: c.iconColor }}
            className="w-8 h-8 flex items-center justify-center rounded-full"
          >
            <Settings size={17} />
          </button>
        </div>
      </div>

      {showChatBgPicker && (
        <div
          style={{ backgroundColor: c.headerBg, borderBottomColor: c.headerBorder }}
          className="flex items-center gap-3 px-4 py-3 border-b shrink-0 overflow-x-auto"
        >
          <input ref={chatBgInputRef} type="file" accept="image/*" onChange={handlePickChatBgImage} className="hidden" />
          {Object.entries(CHAT_BG_PRESETS).map(([key, preset]) => {
            const isActive = (activeChar?.chatBg || "default") === key;
            if (key === "custom") {
              return (
                <button
                  key={key}
                  onClick={() => chatBgInputRef.current?.click()}
                  className="flex flex-col items-center gap-1 shrink-0"
                >
                  <div
                    style={{
                      borderColor: isActive ? c.bubbleUserBg : "transparent",
                      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                    }}
                    className="w-9 h-9 rounded-full border-2 flex items-center justify-center"
                  >
                    <ImageIcon size={14} style={{ color: c.iconColor }} />
                  </div>
                  <span style={{ color: c.subText }} className="text-[10px]">
                    {preset.label}
                  </span>
                </button>
              );
            }
            return (
              <button
                key={key}
                onClick={() => setCharacterChatBg(activeId, key)}
                className="flex flex-col items-center gap-1 shrink-0"
              >
                <div
                  style={{
                    backgroundColor: preset.swatch || (isDark ? "#0b0b0c" : "#f2f2f4"),
                    borderColor: isActive ? c.bubbleUserBg : "transparent",
                    backgroundImage:
                      key === "default"
                        ? "linear-gradient(135deg, rgba(128,128,128,0.3) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.3) 75%), linear-gradient(135deg, rgba(128,128,128,0.3) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.3) 75%)"
                        : undefined,
                    backgroundSize: key === "default" ? "8px 8px" : undefined,
                    backgroundPosition: key === "default" ? "0 0, 4px 4px" : undefined,
                  }}
                  className="w-9 h-9 rounded-full border-2"
                />
                <span style={{ color: c.subText }} className="text-[10px]">
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div
        ref={scrollRef}
        style={
          activeChar?.chatBg === "custom" && activeChar?.chatBgImage
            ? {
                backgroundImage: `url(${activeChar.chatBgImage})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : activeChar?.chatBg && activeChar.chatBg !== "default" && CHAT_BG_PRESETS[activeChar.chatBg]
            ? { backgroundColor: CHAT_BG_PRESETS[activeChar.chatBg].bg }
            : {}
        }
        className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5"
      >
        {activeMessages.map((m, idx) => {
          const prev = activeMessages[idx - 1];
          const next = activeMessages[idx + 1];
          const showGap = prev && prev.role !== m.role;
          const isUser = m.role === "user";
          const isLastInGroup = !next || next.role !== m.role || !!next.cardType;

          if (m.cardType) {
            const isStory = m.cardType === "story";
            const isExpanded = expandedThinkingIds.has(m.id);
            return (
              <div key={m.id} className={`flex flex-col items-start ${showGap ? "mt-3" : ""}`}>
                {m.thinking && (
                  <div className="mb-1.5 max-w-[85%]">
                    <button
                      onClick={() =>
                        setExpandedThinkingIds((prev) => {
                          const next = new Set(prev);
                          next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                          return next;
                        })
                      }
                      style={{ color: c.subText }}
                      className="text-[11px] flex items-center gap-1"
                    >
                      💭 {isExpanded ? "收起思考过程" : "查看思考过程"}
                    </button>
                    {isExpanded && (
                      <div
                        style={{ backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", color: c.subText }}
                        className="mt-1 rounded-xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap"
                      >
                        {m.thinking}
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={() => setViewingCard({ type: m.cardType, title: m.cardTitle, content: m.cardContent })}
                  style={{ backgroundColor: c.bubbleAIBg, color: c.bubbleAIText, borderBottomLeftRadius: 4 }}
                  className="max-w-[75%] rounded-[18px] px-3.5 py-3 flex items-center gap-3 text-left active:opacity-70"
                >
                  <div
                    style={{ backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  >
                    {isStory ? <ScrollText size={18} /> : <Code2 size={18} />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium truncate">{m.cardTitle}</div>
                    <div style={{ color: c.subText }} className="text-[12px] mt-0.5">
                      {isStory ? "点击查看番外全文" : "点击查看渲染效果"}
                    </div>
                  </div>
                </button>
              </div>
            );
          }

          return (
            <div
              key={m.id}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"} ${showGap ? "mt-3" : ""}`}
            >
              {m.thinking && (
                <div className="mb-1.5 max-w-[85%]">
                  <button
                    onClick={() =>
                      setExpandedThinkingIds((prev) => {
                        const next = new Set(prev);
                        next.has(m.id) ? next.delete(m.id) : next.add(m.id);
                        return next;
                      })
                    }
                    style={{ color: c.subText }}
                    className="text-[11px] flex items-center gap-1"
                  >
                    💭 {expandedThinkingIds.has(m.id) ? "收起思考过程" : "查看思考过程"}
                  </button>
                  {expandedThinkingIds.has(m.id) && (
                    <div
                      style={{ backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)", color: c.subText }}
                      className="mt-1 rounded-xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap"
                    >
                      {m.thinking}
                    </div>
                  )}
                </div>
              )}
              <div
                style={{
                  backgroundColor: isUser ? c.bubbleUserBg : c.bubbleAIBg,
                  color: isUser ? c.bubbleUserText : c.bubbleAIText,
                  borderBottomRightRadius: isUser && isLastInGroup ? 4 : 18,
                  borderBottomLeftRadius: !isUser && isLastInGroup ? 4 : 18,
                }}
                className="relative max-w-[75%] px-3.5 py-2 text-[15px] leading-snug whitespace-pre-wrap break-words rounded-[18px]"
              >
                {m.image && (
                  <img src={m.image} alt="" className="rounded-[14px] max-w-full mb-1" style={{ maxHeight: 220 }} />
                )}
                {m.text}
                {isLastInGroup && (
                  <span
                    style={{
                      position: "absolute",
                      bottom: 0,
                      [isUser ? "right" : "left"]: -6,
                      width: 12,
                      height: 12,
                      backgroundColor: isUser ? c.bubbleUserBg : c.bubbleAIBg,
                      clipPath: isUser
                        ? "polygon(0 0, 100% 100%, 0 100%)"
                        : "polygon(100% 0, 100% 100%, 0 100%)",
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
        {typing && (
          <div className="flex justify-start mt-3">
            <div style={{ backgroundColor: c.bubbleAIBg, borderBottomLeftRadius: 4 }} className="rounded-[18px] px-4 py-3 flex gap-1 items-center">
              <span style={{ backgroundColor: c.typingDot }} className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span style={{ backgroundColor: c.typingDot }} className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span style={{ backgroundColor: c.typingDot }} className="w-1.5 h-1.5 rounded-full animate-bounce" />
            </div>
          </div>
        )}
      </div>

      {pendingImage && (
        <div style={{ backgroundColor: c.inputBarBg }} className="px-3 pt-2 flex items-center gap-2 shrink-0">
          <div className="relative">
            <img src={pendingImage.previewUrl} alt="" className="w-14 h-14 object-cover rounded-xl" />
            <button
              onClick={() => setPendingImage(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}

      <div
        style={{ backgroundColor: c.inputBarBg, borderTopColor: c.inputBarBorder }}
        className="px-3 py-2.5 border-t flex items-end gap-2 shrink-0 relative"
      >
        <input ref={imageInputRef} type="file" accept="image/*" onChange={handlePickImage} className="hidden" />

        <button
          onClick={() => setShowPlusMenu((v) => !v)}
          style={{ color: c.iconColor }}
          className="w-9 h-9 flex items-center justify-center rounded-full shrink-0"
        >
          <Plus size={20} />
        </button>

        {showPlusMenu && (
          <div style={{ backgroundColor: c.modalBg }} className="absolute bottom-14 left-3 rounded-2xl shadow-lg p-2 z-20">
            <button
              onClick={() => imageInputRef.current?.click()}
              style={{ color: c.modalText }}
              className="flex items-center gap-2 px-3 py-2.5 text-[14px] whitespace-nowrap"
            >
              <ImageIcon size={17} />
              照片
            </button>
          </div>
        )}

        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="发消息..."
          style={{ backgroundColor: c.inputFieldBg, color: c.inputFieldText }}
          className="flex-1 resize-none text-[15px] rounded-2xl px-4 py-2.5 outline-none max-h-24 placeholder:opacity-60"
        />
        <button
          onClick={sendMessage}
          disabled={(!input.trim() && !pendingImage) || typing}
          style={{
            backgroundColor:
              (!input.trim() && !pendingImage) || typing
                ? isDark
                  ? "rgba(255,255,255,0.1)"
                  : "rgba(0,0,0,0.1)"
                : c.bubbleUserBg,
            color:
              (!input.trim() && !pendingImage) || typing
                ? isDark
                  ? "rgba(255,255,255,0.2)"
                  : "rgba(0,0,0,0.2)"
                : "#ffffff",
          }}
          className="w-9 h-9 flex items-center justify-center rounded-full transition shrink-0"
        >
          <Send size={16} />
        </button>
      </div>

      {/* Story / HTML card viewer */}
      {viewingCard && (
        <div style={{ backgroundColor: c.pageBg }} className="absolute inset-0 z-40 flex flex-col">
          <div
            style={{ backgroundColor: c.headerBg, borderBottomColor: c.headerBorder }}
            className="flex items-center justify-between px-2 py-3 border-b shrink-0"
          >
            <div className="flex items-center gap-1 min-w-0">
              <button
                onClick={() => setViewingCard(null)}
                style={{ color: c.iconColor }}
                className="w-9 h-9 flex items-center justify-center rounded-full shrink-0"
              >
                <ChevronLeft size={22} />
              </button>
              <div style={{ color: c.nameText }} className="text-[15px] font-medium truncate">
                {viewingCard.title}
              </div>
            </div>
          </div>

          {viewingCard.type === "story" ? (
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <div
                style={{ color: c.nameText }}
                className="text-[16px] leading-[1.9] whitespace-pre-wrap"
              >
                {viewingCard.content}
              </div>
            </div>
          ) : (
            <iframe
              title={viewingCard.title}
              srcDoc={viewingCard.content}
              sandbox="allow-scripts allow-forms allow-popups"
              className="flex-1 w-full border-0"
              style={{ backgroundColor: "#ffffff" }}
            />
          )}
        </div>
      )}

      {/* Character edit modal (accessible from chat header too) */}
      {showCharModal && (
        <div className="absolute inset-0 bg-black/60 flex items-end sm:items-center justify-center z-30">
          <div style={{ backgroundColor: c.modalBg }} className="w-full sm:w-96 sm:rounded-2xl rounded-t-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div style={{ color: c.modalText }} className="text-[16px] font-medium">
                编辑角色
              </div>
              <button onClick={() => setShowCharModal(false)} style={{ color: c.modalSubText }}>
                <X size={18} />
              </button>
            </div>
            <div className="flex justify-center mb-4">
              <button
                onClick={() => avatarInputRef.current?.click()}
                className="w-16 h-16 rounded-full bg-gradient-to-br from-[#5b6cff] to-[#8b5cf6] flex items-center justify-center text-white text-lg font-medium overflow-hidden relative"
              >
                {draftAvatar ? (
                  <img src={draftAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  draftName.slice(0, 1) || "?"
                )}
              </button>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handlePickAvatar} className="hidden" />
            <label style={{ color: c.modalSubText }} className="text-[12px]">
              名字
            </label>
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
              className="w-full text-[15px] rounded-xl px-3 py-2 mt-1 mb-4 outline-none"
            />
            <label style={{ color: c.modalSubText }} className="text-[12px]">
              人设描述
            </label>
            <textarea
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
              rows={4}
              style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
              className="w-full text-[14px] rounded-xl px-3 py-2 mt-1 mb-4 outline-none resize-none"
            />
            {renderAdvancedCharSection()}
            {editingCharId && (
              <>
                <div className="flex items-center justify-between">
                  <label style={{ color: c.modalSubText }} className="text-[12px]">
                    长期记忆（AI 自动整理，可以手动改）
                  </label>
                  {characters.find((ch) => ch.id === editingCharId)?.memory && (
                    <button
                      onClick={() =>
                        setCharacters((prev) =>
                          prev.map((ch) =>
                            ch.id === editingCharId
                              ? { ...ch, memory: "", memoryUpdatedAtCount: 0 }
                              : ch
                          )
                        )
                      }
                      style={{ color: c.danger }}
                      className="text-[12px]"
                    >
                      清空
                    </button>
                  )}
                </div>
                <textarea
                  value={characters.find((ch) => ch.id === editingCharId)?.memory || ""}
                  onChange={(e) =>
                    setCharacters((prev) =>
                      prev.map((ch) =>
                        ch.id === editingCharId ? { ...ch, memory: e.target.value } : ch
                      )
                    )
                  }
                  rows={4}
                  placeholder="聊够一定条数后，这里会自动出现 AI 整理的记忆摘要"
                  style={{ backgroundColor: c.modalFieldBg, color: c.modalText }}
                  className="w-full text-[13px] rounded-xl px-3 py-2 mt-1 mb-4 outline-none resize-none"
                />
              </>
            )}
            <button
              onClick={saveCharacter}
              style={{ backgroundColor: c.bubbleUserBg, color: "#ffffff" }}
              className="w-full rounded-xl py-2.5 text-[15px] font-medium"
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
