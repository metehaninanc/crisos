import { useDispatch, useSelector } from "react-redux";
import { useEffect, useRef } from "react";
import MessageList from "./MessageList";
import Composer from "./Composer";
import QuickReplies from "./QuickReplies";
import {
  addIncomingMessages,
  addSystemMessage,
  addUserMessage,
  clearChat,
  removeSystemMessageByText,
  sendMessage,
  setHandoffLastMessageId,
  setHandoffRequest,
  setLocation,
} from "./chatSlice";
import { useTranslation } from "react-i18next";
import {
  getActiveHandoffRequest,
  getHandoffMessages,
  sendHandoffMessage,
  transcribeAudio,
  API_BASE_URL,
} from "../../app/api";

export default function ChatPanel() {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const {
    messages,
    quickReplies,
    handoffActive,
    handoffRequestId,
    handoffLastMessageId,
    sessionId,
    location,
    disclaimerAccepted,
  } = useSelector((state) => state.chat);
  const sending = useSelector((state) => state.chat.status === "sending");
  const pollingRef = useRef(false);
  const autoLocationRef = useRef(null);
  const autoGpsPromptRef = useRef(null);
  const ignoreHandoffIdsRef = useRef(new Set());
  const closingRef = useRef(false);

  const locationPromptPatterns = [
    /where are you located/i,
    /share (your )?location/i,
    /share the city name/i,
    /provide (your )?location/i,
    /enter (your )?(address|location)/i,
    /konum(unuz)?u.*(paylas|girin|yazin)/i,
    /adresinizi.*(paylas|girin|yazin)/i,
    /wo (befinden|bist) (sie|du)/i,
    /bitte.*standort/i,
    /bitte.*adresse/i,
  ];

  const isLocationPrompt = (text) => {
    if (!text) return false;
    const lowered = text.toLowerCase();
    if (lowered.includes("location:") || lowered.includes("gps:")) {
      return false;
    }
    return locationPromptPatterns.some((pattern) => pattern.test(text));
  };

  const getLastBotMessage = () => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].sender === "bot") {
        return messages[i];
      }
    }
    return null;
  };

  const handleSend = (text) => {
    if (!disclaimerAccepted) return;
    dispatch(addUserMessage({ text }));
    if (handoffActive) {
      const deliver = (requestId) =>
        sendHandoffMessage({
          request_id: requestId,
          sender: "user",
          text,
        })
          .then((data) => {
            if (data?.id) {
              ignoreHandoffIdsRef.current.add(data.id);
            }
            return data;
          })
          .catch(() => null);

      if (handoffRequestId) {
        deliver(handoffRequestId);
      } else {
        getActiveHandoffRequest(sessionId)
          .then((data) => {
            if (data.request?.id) {
              dispatch(setHandoffRequest(data.request.id));
              deliver(data.request.id);
            }
          })
          .catch(() => null);
      }
      return;
    }
    dispatch(sendMessage({ text }));
  };

  const handleVoice = (blob) => {
    if (!disclaimerAccepted) return;
    transcribeAudio(blob, i18n.language)
      .then((data) => {
        const text = data?.text?.trim();
        if (!text) {
          dispatch(addSystemMessage({ text: t("chat.voiceEmpty") }));
          return;
        }
        handleSend(text);
      })
      .catch(() => {
        dispatch(addSystemMessage({ text: t("chat.voiceError") }));
      });
  };

  const handleVoiceError = (message) => {
    if (!message) return;
    dispatch(addSystemMessage({ text: message }));
  };

  useEffect(() => {
    if (!disclaimerAccepted) return;
    if (!handoffActive || handoffRequestId) return;
    getActiveHandoffRequest(sessionId)
      .then((data) => {
        if (data.request?.id) {
          dispatch(setHandoffRequest(data.request.id));
        }
      })
      .catch(() => null);
  }, [dispatch, handoffActive, handoffRequestId, sessionId]);

  useEffect(() => {
    if (!disclaimerAccepted) return;
    if (!handoffActive || !handoffRequestId) return;
    if (pollingRef.current) return;
    pollingRef.current = true;

    const interval = setInterval(() => {
      getHandoffMessages(handoffRequestId, handoffLastMessageId)
        .then((data) => {
          if (!data.messages?.length) return;
          const lastId = data.messages[data.messages.length - 1].id;
          const formatted = data.messages
            .filter(
              (message) =>
                !(
                  message.sender === "user" &&
                  ignoreHandoffIdsRef.current.has(message.id)
                )
            )
            .map((message) => ({
              id: message.id,
              sender: message.sender === "agent" ? "bot" : message.sender,
              text: message.text,
              timestamp: message.created_at,
            }));
          dispatch(addIncomingMessages(formatted));
          dispatch(setHandoffLastMessageId(lastId));
          ignoreHandoffIdsRef.current.forEach((id) => {
            if (id <= lastId) {
              ignoreHandoffIdsRef.current.delete(id);
            }
          });
        })
        .catch(() => null);
    }, 2000);

    return () => {
      pollingRef.current = false;
      clearInterval(interval);
    };
  }, [
    dispatch,
    handoffActive,
    handoffRequestId,
    handoffLastMessageId,
  ]);

  useEffect(() => {
    if (!handoffActive || !handoffRequestId) return;
    const closeHandoff = () => {
      if (closingRef.current) return;
      closingRef.current = true;
      const url = `${API_BASE_URL}/api/handoff/requests/${handoffRequestId}/status`;
      const payload = JSON.stringify({ status: "closed" });
      sessionStorage.setItem("crisos_handoff_closed_on_unload", "1");
      sessionStorage.setItem(
        "crisos_handoff_request_id",
        String(handoffRequestId)
      );
      try {
        const note = JSON.stringify({
          request_id: handoffRequestId,
          sender: "system",
          text: "User left the chat. Session closed.",
        });
        if (navigator.sendBeacon) {
          const noteBlob = new Blob([note], { type: "application/json" });
          navigator.sendBeacon(`${API_BASE_URL}/api/handoff/messages`, noteBlob);
        } else {
          fetch(`${API_BASE_URL}/api/handoff/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: note,
            keepalive: true,
          }).catch(() => null);
        }
      } catch {
      }
      if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(url, blob);
        return;
      }
      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => null);
    };

    window.addEventListener("beforeunload", closeHandoff);
    window.addEventListener("pagehide", closeHandoff);
    return () => {
      window.removeEventListener("beforeunload", closeHandoff);
      window.removeEventListener("pagehide", closeHandoff);
    };
  }, [handoffActive, handoffRequestId]);

  useEffect(() => {
    const reopenFlag = sessionStorage.getItem("crisos_handoff_closed_on_unload");
    if (!reopenFlag) return;
    const storedRequestId = sessionStorage.getItem(
      "crisos_handoff_request_id"
    );
    const requestId =
      handoffRequestId || (storedRequestId ? Number(storedRequestId) : 0);
    if (!requestId) return;
    sessionStorage.removeItem("crisos_handoff_closed_on_unload");
    sessionStorage.removeItem("crisos_handoff_request_id");
    dispatch(
      removeSystemMessageByText("User left the chat. Session closed.")
    );
    if (!handoffActive) {
      dispatch(setHandoffRequest(requestId));
      dispatch(setHandoffLastMessageId(0));
      dispatch(setHandoffActive(true));
    }
    fetch(`${API_BASE_URL}/api/handoff/requests/${requestId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "open",
        suppress_close_message: true,
      }),
      keepalive: true,
    }).catch(() => null);
  }, [dispatch, handoffActive, handoffRequestId]);

  useEffect(() => {
    if (!disclaimerAccepted) return;
    if (handoffActive) return;
    const lastBot = getLastBotMessage();
    if (!lastBot) return;
    if (autoLocationRef.current === lastBot.id) return;
    const text = lastBot.text || "";
    if (!isLocationPrompt(text)) return;
    if (!location?.text && (location?.lat == null || location?.lon == null)) {
      if (autoGpsPromptRef.current === lastBot.id) return;
      autoGpsPromptRef.current = lastBot.id;
      dispatch(addSystemMessage({ text: t("location.gpsPrompt") }));
      if (!navigator.geolocation) {
        dispatch(addSystemMessage({ text: t("location.gpsUnavailable") }));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;
          fetch(
            `${API_BASE_URL}/api/reverse?lat=${encodeURIComponent(
              lat
            )}&lon=${encodeURIComponent(lon)}`
          )
            .then((response) => response.json())
            .then((data) => {
              dispatch(
                setLocation({
                  text: data.label || "",
                  lat,
                  lon,
                  source: "gps",
                })
              );
            })
            .catch(() => {
              dispatch(
                setLocation({
                  text: "",
                  lat,
                  lon,
                  source: "gps",
                })
              );
            });
        },
        () => {
          dispatch(addSystemMessage({ text: t("location.gpsDenied") }));
        },
        { enableHighAccuracy: false, timeout: 8000 }
      );
      return;
    }
    const reply = location.text?.trim()
      ? location.text.trim()
      : `${location.lat}, ${location.lon}`;
    if (!reply) return;
    autoLocationRef.current = lastBot.id;
    dispatch(addUserMessage({ text: reply }));
    dispatch(sendMessage({ text: reply }));
  }, [messages, location, handoffActive, dispatch, disclaimerAccepted, t]);

  const composerDisabled =
    !disclaimerAccepted || (sending && !handoffActive);

  return (
    <div className="flex min-h-[60vh] flex-col overflow-hidden rounded-3xl border border-clay/70 bg-white/70 shadow-card lg:h-[70vh]">
      <div className="flex items-center justify-between border-b border-clay/60 px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-ink">{t("chat.title")}</p>
          <p className="text-xs text-ash">
            {handoffActive ? "Human" : "Bot"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!handoffActive ? (
            <button
              type="button"
              onClick={() => dispatch(clearChat())}
              disabled={!disclaimerAccepted}
              className="rounded-full border border-clay bg-white px-3 py-1 text-xs font-semibold text-ash disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset
            </button>
          ) : null}
          <span className="rounded-full bg-sand px-3 py-1 text-xs font-semibold text-ash">
            {sending ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-sky/60 border-t-slate" />
                Typing
              </span>
            ) : (
              "Ready"
            )}
          </span>
        </div>
      </div>
      <MessageList messages={messages} />
      <QuickReplies
        replies={quickReplies}
        onSelect={handleSend}
        disabled={!disclaimerAccepted || handoffActive}
      />
      <Composer
        onSend={handleSend}
        onVoice={handleVoice}
        onVoiceError={handleVoiceError}
        disabled={composerDisabled}
      />
    </div>
  );
}
