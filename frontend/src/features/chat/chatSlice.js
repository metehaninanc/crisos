import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { sendChatMessage } from "../../app/api";

const createId = () =>
  (globalThis.crypto?.randomUUID?.() ||
    `msg_${Date.now()}_${Math.random().toString(16).slice(2)}`);

const createSessionId = () =>
  `web_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const STORAGE_KEY = "crisos_chat_state";
const HANDOFF_TRIGGERS = [
  "connecting you to a human operator",
  "high risk detected",
  "waiting for operator",
  "human operator",
];

const DEFAULT_QUICK_REPLIES = [
  { title: "Emergency", payload: "/report_emergency" },
  { title: "I'm Trapped", payload: "/report_trapped" },
  { title: "I'm Safe - Need Info", payload: "/report_safe" },
];

const detectHandoff = (text) => {
  if (!text) return false;
  const lowered = text.toLowerCase();
  return HANDOFF_TRIGGERS.some((phrase) => lowered.includes(phrase));
};

const normalizeResponses = (responses = []) =>
  responses
    .map((entry) => ({
      id: createId(),
      sender: "bot",
      text: entry.text || "",
      buttons: entry.buttons || [],
      timestamp: new Date().toISOString(),
    }))
    .filter((entry) => entry.text || entry.buttons.length);

export const sendMessage = createAsyncThunk(
  "chat/sendMessage",
  async ({ text }, { getState }) => {
    const { chat } = getState();
    if (!chat.disclaimerAccepted) {
      return [];
    }
    const payload = {
      sender_id: chat.sessionId,
      message: text,
      locale: chat.language,
      location: chat.location,
    };
    const data = await sendChatMessage(payload);
    return data.messages || [];
  }
);

const loadPersistedState = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

const baseState = {
  sessionId: createSessionId(),
  messages: [],
  quickReplies: DEFAULT_QUICK_REPLIES,
  status: "idle",
  error: null,
  disclaimerAccepted: false,
  disclaimerDeclined: false,
  handoffActive: false,
  handoffRequestId: null,
  handoffLastMessageId: 0,
  location: { text: "", lat: null, lon: null, source: "manual" },
  language: "en",
};

const persistedState = loadPersistedState();
const initialState = persistedState
  ? {
      ...baseState,
      ...persistedState,
      status: "idle",
      error: null,
      sessionId: persistedState.sessionId || baseState.sessionId,
      messages: Array.isArray(persistedState.messages)
        ? persistedState.messages
        : baseState.messages,
      quickReplies: Array.isArray(persistedState.quickReplies)
        ? persistedState.quickReplies
        : baseState.quickReplies,
    }
  : baseState;

const chatSlice = createSlice({
  name: "chat",
  initialState,
  reducers: {
    addUserMessage(state, action) {
      state.messages.push({
        id: createId(),
        sender: "user",
        text: action.payload.text,
        timestamp: new Date().toISOString(),
      });
      state.quickReplies = [];
    },
    addIncomingMessages(state, action) {
      action.payload.forEach((message) => {
        state.messages.push(message);
      });
    },
    addSystemMessage(state, action) {
      const last = state.messages[state.messages.length - 1];
      if (
        last &&
        last.sender === "system" &&
        last.text === action.payload.text
      ) {
        return;
      }
      state.messages.push({
        id: createId(),
        sender: "system",
        text: action.payload.text,
        timestamp: new Date().toISOString(),
      });
    },
    replaceSystemMessageText(state, action) {
      const { from, to } = action.payload || {};
      if (!from || !to) return;
      const message = state.messages.find(
        (item) => item.sender === "system" && item.text === from
      );
      if (!message) return;
      message.text = to;
    },
    setQuickReplies(state, action) {
      state.quickReplies = Array.isArray(action.payload)
        ? action.payload
        : state.quickReplies;
    },
    removeSystemMessageByText(state, action) {
      state.messages = state.messages.filter(
        (message) =>
          !(
            message.sender === "system" &&
            message.text === action.payload
          )
      );
    },
    setLocation(state, action) {
      state.location = { ...state.location, ...action.payload };
    },
    setLanguage(state, action) {
      state.language = action.payload;
    },
    setDisclaimerAccepted(state, action) {
      state.disclaimerAccepted = action.payload;
      if (action.payload) {
        state.disclaimerDeclined = false;
      }
    },
    setDisclaimerDeclined(state, action) {
      state.disclaimerDeclined = action.payload;
      if (action.payload) {
        state.disclaimerAccepted = false;
      }
    },
    setHandoffActive(state, action) {
      state.handoffActive = action.payload;
    },
    setHandoffRequest(state, action) {
      state.handoffRequestId = action.payload;
    },
    setHandoffLastMessageId(state, action) {
      state.handoffLastMessageId = action.payload;
    },
    clearChat(state) {
      state.messages = [];
      state.quickReplies = DEFAULT_QUICK_REPLIES;
      state.status = "idle";
      state.error = null;
      state.handoffActive = false;
      state.handoffRequestId = null;
      state.handoffLastMessageId = 0;
      state.sessionId = createSessionId();
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendMessage.pending, (state) => {
        state.status = "sending";
        state.error = null;
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.status = "idle";
        const normalized = normalizeResponses(action.payload);
        normalized.forEach((message) => state.messages.push(message));

        const last = normalized[normalized.length - 1];
        state.quickReplies = last?.buttons || [];

        if (normalized.some((message) => detectHandoff(message.text))) {
          state.handoffActive = true;
        }
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.status = "idle";
        state.error = action.error?.message || "Unable to contact server.";
      });
  },
});

export const {
  addUserMessage,
  addIncomingMessages,
  addSystemMessage,
  replaceSystemMessageText,
  setQuickReplies,
  removeSystemMessageByText,
  setLocation,
  setLanguage,
  setDisclaimerAccepted,
  setDisclaimerDeclined,
  setHandoffActive,
  setHandoffRequest,
  setHandoffLastMessageId,
  clearChat,
} = chatSlice.actions;

export default chatSlice.reducer;
