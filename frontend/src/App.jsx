import { useEffect, useMemo, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import ChatPanel from "./features/chat/ChatPanel";
import LanguageSwitcher from "./components/LanguageSwitcher";
import AlertBanner from "./components/AlertBanner";
import AdminPanel from "./features/admin/AdminPanel";
import LocationSearch from "./components/LocationSearch";
import DisclaimerModal from "./components/DisclaimerModal";
import {
  addSystemMessage,
  addUserMessage,
  sendMessage,
  clearChat,
  setHandoffActive,
  setHandoffLastMessageId,
  setHandoffRequest,
  setLanguage,
  setLocation,
  setDisclaimerAccepted,
  setDisclaimerDeclined,
  replaceSystemMessageText,
  setQuickReplies,
} from "./features/chat/chatSlice";
import { API_BASE_URL } from "./app/api";

const QUICK_ACTIONS = [
  { key: "warnings", payload: "/request_warnings" },
  { key: "evacuation", payload: "/request_evacuation_info" },
  { key: "numbers", payload: "/request_emergency_numbers" },
  { key: "forecast", payload: "/request_forecast" },
  { key: "contact", payload: "/request_supply_points" },
  { key: "supply", payload: "/request_supply" },
  {
    key: "instructions",
    payload: "How do I prepare myself for a flood disaster?",
  },
];
const DEFAULT_QUICK_REPLY_PAYLOADS = [
  "/report_emergency",
  "/report_trapped",
  "/report_safe",
];

const isDashboardPath = () =>
  window.location.pathname.replace(/\/+$/, "") === "/dashboard";
const DISCLAIMER_VERSION = "v1.0";

function App() {
  const dispatch = useDispatch();
  const { t, i18n } = useTranslation();
  const [locationInput, setLocationInput] = useState("");
  const [adminView, setAdminView] = useState(isDashboardPath);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [geoError, setGeoError] = useState("");
  const {
    location,
    handoffActive,
    language,
    error,
    disclaimerAccepted,
    disclaimerDeclined,
    messages,
    quickReplies,
    handoffRequestId,
    handoffLastMessageId,
    sessionId,
  } = useSelector((state) => state.chat);

  const greetedRef = useRef(false);
  const geoRequestedRef = useRef(false);
  const lastUserLanguage = useRef(language);

  useEffect(() => {
    if (!disclaimerAccepted) return;
    if (messages.length === 0) {
      greetedRef.current = false;
    }
  }, [messages.length, disclaimerAccepted]);

  const buildDefaultQuickReplies = () => [
    { title: t("chat.quickEmergency"), payload: "/report_emergency" },
    { title: t("chat.quickTrapped"), payload: "/report_trapped" },
    { title: t("chat.quickSafe"), payload: "/report_safe" },
  ];

  const isDefaultQuickReplies = (replies) => {
    if (!Array.isArray(replies) || replies.length !== 3) return false;
    const payloads = replies.map((item) => item.payload).sort();
    const expected = [...DEFAULT_QUICK_REPLY_PAYLOADS].sort();
    return payloads.every((value, index) => value === expected[index]);
  };

  const shouldUpdateDefaultQuickReplies = (replies, expected) => {
    if (!isDefaultQuickReplies(replies)) return false;
    if (!Array.isArray(expected) || replies.length !== expected.length) {
      return false;
    }
    return replies.some(
      (reply, index) =>
        reply.payload !== expected[index].payload ||
        reply.title !== expected[index].title
    );
  };

  useEffect(() => {
    if (!disclaimerAccepted) return;
    if (greetedRef.current) return;
    const hasIntro = messages.some(
      (message) =>
        message.sender === "system" && message.text === t("app.chat_intro")
    );
    if (hasIntro) {
      greetedRef.current = true;
      return;
    }
    greetedRef.current = true;
    dispatch(addSystemMessage({ text: t("app.chat_intro") }));
  }, [dispatch, t, messages, disclaimerAccepted]);

  useEffect(() => {
    if (!disclaimerAccepted) return;
    const introTexts = ["en", "de", "tr"]
      .map((lang) => i18n.getResource(lang, "translation", "app.chat_intro"))
      .filter(Boolean);
    const currentIntro = t("app.chat_intro");
    if (
      messages.some(
        (message) =>
          message.sender === "system" && message.text === currentIntro
      )
    ) {
      return;
    }
    const previous = introTexts.find((text) =>
      messages.some(
        (message) => message.sender === "system" && message.text === text
      )
    );
    if (previous) {
      dispatch(replaceSystemMessageText({ from: previous, to: currentIntro }));
    }
  }, [dispatch, disclaimerAccepted, i18n, messages, t]);

  useEffect(() => {
    if (!disclaimerAccepted) return;
    const expected = buildDefaultQuickReplies();
    if (!shouldUpdateDefaultQuickReplies(quickReplies, expected)) return;
    dispatch(setQuickReplies(expected));
  }, [disclaimerAccepted, quickReplies, dispatch, t]);

  useEffect(() => {
    const handlePopState = () => {
      setAdminView(isDashboardPath());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    document.title = adminView ? "CRISOS Dashboard" : "CRISOS";
  }, [adminView]);


  useEffect(() => {
    const accepted = localStorage.getItem("crisos_disclaimer_accepted");
    const version = localStorage.getItem("crisos_disclaimer_version");
    if (accepted === "true" && version === DISCLAIMER_VERSION) {
      dispatch(setDisclaimerAccepted(true));
    } else {
      dispatch(setDisclaimerAccepted(false));
    }
  }, [dispatch, disclaimerAccepted]);

  useEffect(() => {
    try {
      const payload = {
        sessionId,
        messages,
        quickReplies,
        handoffActive,
        handoffRequestId,
        handoffLastMessageId,
        location,
        language,
        disclaimerAccepted,
        disclaimerDeclined,
      };
      sessionStorage.setItem("crisos_chat_state", JSON.stringify(payload));
    } catch {
    }
  }, [
    sessionId,
    messages,
    quickReplies,
    handoffActive,
    handoffRequestId,
    handoffLastMessageId,
    location,
    language,
    disclaimerAccepted,
    disclaimerDeclined,
  ]);

  useEffect(() => {
    if (!disclaimerAccepted) return;
    geoRequestedRef.current = true;
  }, [disclaimerAccepted]);

  const locationLabel = useMemo(() => {
    if (location.text) {
      return location.text;
    }
    if (location.lat && location.lon) {
      return `${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}`;
    }
    return t("location.placeholder");
  }, [location, t]);

  const hasUserMessage = useMemo(
    () => messages.some((message) => message.sender === "user"),
    [messages]
  );

  const handleLocationSave = () => {
    if (!disclaimerAccepted) return;
    const trimmed = locationInput.trim();
    if (!trimmed) return;
    const hadLocation =
      Boolean(location.text && location.text.trim()) ||
      location.lat != null ||
      location.lon != null;
    dispatch(
      setLocation({
        text: trimmed,
        lat: null,
        lon: null,
        source: "manual",
      })
    );
    if (hasUserMessage) {
      const payload = hadLocation
        ? `/change_location${JSON.stringify({ location: trimmed })}`
        : trimmed;
      dispatch(addUserMessage({ text: trimmed }));
      dispatch(sendMessage({ text: payload }));
    }
    setLocationInput("");
  };

  const handleLocationSelect = (item) => {
    if (!disclaimerAccepted) return;
    if (!item) return;
    const lat = item.lat ? parseFloat(item.lat) : null;
    const lon = item.lon ? parseFloat(item.lon) : null;
    dispatch(
      setLocation({
        text: item.label || item.display_name || locationInput,
        lat,
        lon,
        source: "search",
      })
    );
    setLocationInput(item.label || item.display_name || "");
  };

  const handleGps = () => {
    if (!disclaimerAccepted) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoError("");
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const hadLocation =
          Boolean(location.text && location.text.trim()) ||
          location.lat != null ||
          location.lon != null;
        fetch(
          `${API_BASE_URL}/api/reverse?lat=${encodeURIComponent(
            lat
          )}&lon=${encodeURIComponent(lon)}`
        )
          .then((response) => response.json())
          .then((data) => {
            const label = data.label || "";
            dispatch(
              setLocation({
                text: label,
                lat,
                lon,
                source: "gps",
              })
            );
            if (hasUserMessage) {
              const payload = hadLocation
                ? `/change_location${JSON.stringify({
                    location: label || `${lat}, ${lon}`,
                  })}`
                : label || `${lat}, ${lon}`;
              dispatch(addUserMessage({ text: label || `${lat}, ${lon}` }));
              dispatch(sendMessage({ text: payload }));
            }
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
            const coords = `${lat}, ${lon}`;
            if (hasUserMessage) {
              const payload = hadLocation
                ? `/change_location${JSON.stringify({ location: coords })}`
                : coords;
              dispatch(addUserMessage({ text: coords }));
              dispatch(sendMessage({ text: payload }));
            }
          });
      },
      () => {
        setGeoError("Location access denied.");
        dispatch(
          addSystemMessage({
            text: "Unable to access GPS. Please enter location manually.",
          })
        );
      }
    );
  };

  const handleLanguageChange = (nextLang) => {
    i18n.changeLanguage(nextLang);
    dispatch(setLanguage(nextLang));
  };

  useEffect(() => {
    if (adminView) {
      if (language !== "en") {
        lastUserLanguage.current = language;
        handleLanguageChange("en");
      }
      return;
    }
    if (
      lastUserLanguage.current &&
      language !== lastUserLanguage.current
    ) {
      handleLanguageChange(lastUserLanguage.current);
    }
  }, [adminView]);

  const handleQuickAction = (payload) => {
    if (!disclaimerAccepted) return;
    dispatch(addUserMessage({ text: payload }));
    dispatch(sendMessage({ text: payload }));
  };

  const handleDisclaimerAccept = () => {
    localStorage.setItem("crisos_disclaimer_accepted", "true");
    localStorage.setItem(
      "crisos_disclaimer_timestamp",
      new Date().toISOString()
    );
    localStorage.setItem("crisos_disclaimer_version", DISCLAIMER_VERSION);
    dispatch(setDisclaimerAccepted(true));
    dispatch(setDisclaimerDeclined(false));
    setDisclaimerOpen(false);
    fetch(`${API_BASE_URL}/api/disclaimer/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        timestamp: Date.now(),
        version: DISCLAIMER_VERSION,
        userAgent: navigator.userAgent,
      }),
    }).catch(() => null);
  };

  const handleDisclaimerDecline = () => {
    localStorage.removeItem("crisos_disclaimer_accepted");
    localStorage.removeItem("crisos_disclaimer_timestamp");
    localStorage.removeItem("crisos_disclaimer_version");
    dispatch(setDisclaimerAccepted(false));
    dispatch(setDisclaimerDeclined(true));
    setDisclaimerOpen(false);
  };

  const handleDisclaimerReview = () => {
    dispatch(setDisclaimerDeclined(false));
  };

  const disclaimerRequired =
    !disclaimerAccepted && !disclaimerDeclined;

  return (
    <div className="grain">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 pb-16 pt-10 sm:px-6">
        {!adminView && (
          <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div>
                <p className="brand-wordmark text-3xl text-ink">
                  <span>{t("app.title").slice(0, 3)}</span>
                  <span className="text-rose-500">{t("app.title").slice(3)}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  window.history.pushState({}, "", "/dashboard");
                  setAdminView(true);
                }}
                className="rounded-full border border-clay bg-white/70 px-3 py-2 text-xs font-semibold text-ash"
              >
                {t("navigation.admin")}
              </button>
              <LanguageSwitcher
                value={language}
                onChange={handleLanguageChange}
              />
            </div>
          </header>
        )}

        {adminView ? (
          <section className="mt-8">
            <AdminPanel />
          </section>
        ) : (
          <>
            {disclaimerDeclined ? (
              <main className="mt-8">
                <div className="mx-auto w-full max-w-2xl rounded-3xl border border-clay/70 bg-white/90 p-6 shadow-card">
                  <h2 className="text-sm font-semibold text-ink">
                    {t("app.disclaimer_required_title")}
                  </h2>
                  <p className="mt-2 text-sm text-ash">
                    {t("app.disclaimer_decline_warning")}
                  </p>
                  <div className="mt-4 rounded-2xl border border-clay/60 bg-sand/60 p-4">
                    <p className="text-xs font-semibold text-ink">
                      {t("app.restricted_emergency_title")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-ash">
                      {["112", "155", "156", "110"].map((num) => (
                        <span
                          key={num}
                          className="rounded-full border border-clay bg-white px-3 py-1 text-xs font-semibold text-ash"
                        >
                          {num}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-clay/60 bg-white/80 p-4">
                    <p className="text-xs font-semibold text-ink">
                      {t("app.restricted_safety_title")}
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-ash">
                      {t("app.restricted_safety_items", { returnObjects: true }).map(
                        (item) => (
                          <li key={item}>{item}</li>
                        )
                      )}
                    </ul>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={handleDisclaimerReview}
                      className="rounded-full border border-clay bg-white px-3 py-2 text-xs font-semibold text-ash"
                    >
                      {t("app.disclaimer_review")}
                    </button>
                  </div>
                </div>
              </main>
            ) : (
              <main className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
                <aside className="flex flex-col gap-6 lg:min-h-[70vh]">
                  {handoffActive && (
                    <AlertBanner
                      title={
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                          {t("status.handoff")}
                        </span>
                      }
                      message={t("status.waiting")}
                      tone="success"
                    />
                  )}

                  {error && <AlertBanner title={error} tone="warning" />}

                  <div className="rounded-3xl border border-clay/70 bg-white/80 p-5 shadow-card">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-ink">
                        {t("location.title")}
                      </p>
                      {location.source === "gps" ? (
                        <span className="text-xs text-moss">
                          {t("location.gpsActive")}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs text-ash">{t("location.hint")}</p>
                    <div className="mt-3 flex flex-col gap-2">
                      <LocationSearch
                        value={locationInput}
                        onChange={setLocationInput}
                        onSelect={handleLocationSelect}
                        placeholder={t("location.placeholder")}
                        disabled={!disclaimerAccepted}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleLocationSave}
                          disabled={!disclaimerAccepted}
                          className="flex-1 rounded-2xl bg-slate px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t("location.save")}
                        </button>
                        <button
                          type="button"
                          onClick={handleGps}
                          disabled={!disclaimerAccepted}
                          className="flex-1 rounded-2xl border border-slate/20 bg-white px-3 py-2 text-xs font-semibold text-slate disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t("location.useGps")}
                        </button>
                      </div>
                      {geoError ? (
                        <p className="text-xs text-ember">{geoError}</p>
                      ) : null}
                    </div>
                    <div className="mt-4 rounded-2xl border border-clay/60 bg-sand px-3 py-2 text-xs text-ash">
                      {locationLabel}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-clay/70 bg-white/80 p-5 shadow-card">
                    <p className="text-sm font-semibold text-ink">{t("actions.title")}</p>
                    <div className="mt-3 grid gap-2">
                      {QUICK_ACTIONS.map((action) => (
                        <button
                          key={action.key}
                          type="button"
                          onClick={() => handleQuickAction(action.payload)}
                          disabled={!disclaimerAccepted || handoffActive}
                          className="rounded-2xl border border-slate/10 bg-white px-4 py-3 text-xs font-semibold text-slate shadow-sm transition hover:-translate-y-0.5 hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {t(`actions.${action.key}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-auto">
                    <AlertBanner
                      title={
                        <button
                          type="button"
                          onClick={() => setDisclaimerOpen(true)}
                          className="text-sm font-semibold text-ink underline decoration-dotted underline-offset-4"
                        >
                          {t("app.disclaimer_title_short")}
                        </button>
                      }
                      message={
                        <div className="mt-2 space-y-2">
                          <ul className="list-disc space-y-1 pl-4 text-xs text-ash">
                            {t("app.disclaimer_items", { returnObjects: true }).map(
                              (item) => (
                                <li key={item}>{item}</li>
                              )
                            )}
                          </ul>
                        </div>
                      }
                      tone="info"
                    />
                  </div>
                </aside>

                <section className="flex flex-col gap-6">
                  <ChatPanel />
                </section>
              </main>
            )}
          </>
        )}
        <DisclaimerModal
          open={disclaimerRequired || disclaimerOpen}
          mode={disclaimerRequired ? "required" : "read"}
          onAccept={handleDisclaimerAccept}
          onDecline={handleDisclaimerDecline}
          onClose={() => setDisclaimerOpen(false)}
        />

      </div>
    </div>
  );
}

export default App;
