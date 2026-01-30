import { Dialog, Menu } from "@headlessui/react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  adminGetHandoffMessages,
  adminListHandoffRequests,
  adminChangePassword,
  adminGetAlerts,
  adminLogin,
  adminSendHandoffMessage,
  adminUpdateHandoffStatus,
  API_BASE_URL,
} from "../../app/api";
import TableManager from "./TableManager";

const ADMIN_SESSION_KEY = "crisos_admin_session";

const loadAdminSession = () => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
};

const statusLabels = {
  open: "Open",
  assigned: "Assigned",
  closed: "Closed",
};

const statusStyles = {
  open: "border-slate/40 bg-white/80 text-slate",
  assigned: "border-slate/40 bg-white/80 text-slate",
  closed: "border-slate/40 bg-white/80 text-slate",
};

const normalizeRisk = (value, userStatus) => {
  if (userStatus === "emergency") {
    const num = Number(value);
    if (!Number.isFinite(num) || num === 0) return 90;
  }
  if (userStatus === "safe") {
    return 10;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return num;
};

const riskLabel = (value, userStatus) => {
  if (userStatus === "safe") return "Low";
  if (value >= 70) return "High";
  if (value >= 40) return "Medium";
  return "Low";
};

const parseSummary = (raw) => {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") {
    return raw;
  }
  return null;
};

const formatSlotValue = (value, map) => {
  if (value == null || value === "") return null;
  if (map && Object.prototype.hasOwnProperty.call(map, value)) {
    return map[value];
  }
  return String(value).replace(/_/g, " ");
};

const buildSummary = (summary, request, resolvedAddress) => {
  if (!summary) return null;
  const slots = summary.slots || {};
  const isEmergency =
    slots.user_status === "emergency" || request?.user_status === "emergency";

  const lines = [];
  const riskValue = normalizeRisk(request?.risk_score, request?.user_status);
  const riskLevel = riskLabel(riskValue, request?.user_status);
  const riskText = request?.user_status === "safe" ? riskLevel : `${riskLevel} (${riskValue})`;
  const location = slots.location || slots.address || slots.city || resolvedAddress;
  const lat = slots.lat ?? slots.latitude;
  const lon = slots.lon ?? slots.longitude;
  const gps =
    lat != null && lon != null
      ? `${Number(lat).toFixed(5)}, ${Number(lon).toFixed(5)}`
      : null;

  const medicalNeed = slots.need_medical || slots.medical_need;
  const vulnerableGroup = slots.vulnerable_group;
  const heatingRisk = slots.heating_cooling_risk;

  const yesNoMap = { yes: "Yes", no: "No", affirm: "Yes", deny: "No" };
  const waterLevelMap = {
    below_10cm: "Below 10 cm",
    "10cm_30cm": "10-30 cm",
    "30cm_60cm": "30-60 cm",
    above_60cm: "Above 60 cm",
  };
  const waterTrendMap = {
    none: "None",
    stable: "Stable",
    slowly_rising: "Slowly rising",
    rising_fast: "Rising fast",
  };
  const floorInfoMap = {
    basement: "Basement",
    ground: "Ground floor",
    upper_floor: "Upper floor",
  };
  const hazardMap = {
    none: "None",
    gas_smell: "Gas smell",
    electricity_risk: "Electrical risk",
    fire: "Fire",
  };
  const fireDistanceMap = {
    none: "Not visible",
    visible: "Visible",
    nearby: "Nearby",
    surrounding: "Surrounding",
  };
  const smokeMap = {
    none: "None",
    slightly_difficult: "Slightly difficult",
    cant_breathe: "Cannot breathe",
  };
  const vehicleMap = { ...yesNoMap, vehicle: "Yes", no_vehicle: "No" };
  const heatingMap = {
    normal: "Normal",
    uncomfortable: "Uncomfortable",
    dangerous: "Dangerous",
  };
  const buildingFloorMap = {
    ground_1st: "Ground or 1st floor",
    "2_4": "2nd to 4th floor",
    "5_plus": "5th floor or higher",
  };
  const durationMap = {
    below_6hours: "Less than 6 hours",
    "6h_24h": "6 to 24 hours",
    above_24h: "More than 24 hours",
  };

  const addLine = (label, value, map) => {
    const formatted = formatSlotValue(value, map);
    if (formatted == null || formatted === "") return;
    lines.push(`${label}: ${formatted}`);
  };

  if (isEmergency) {
    lines.push(`Risk: ${riskText}`);
    if (location) lines.push(`Location: ${location}`);
    if (gps) lines.push(`GPS: ${gps}`);
    if (slots.person_count) lines.push(`People: ${slots.person_count}`);
    addLine("Medical need", medicalNeed);
    addLine("Vulnerable", slots.vulnerable_group, yesNoMap);
    addLine("Mobility", slots.mobility_needs, yesNoMap);
  } else {
    const userStatus = slots.user_status || request?.user_status;
    const crisisType = slots.crisis_type || request?.crisis_type;
    lines.push(`Risk: ${riskText}`);
    if (userStatus) lines.push(`User status: ${userStatus}`);
    if (crisisType) lines.push(`Crisis type: ${crisisType}`);
    if (location) lines.push(`Location: ${location}`);
    if (gps) lines.push(`GPS: ${gps}`);
    if (slots.person_count) lines.push(`People: ${slots.person_count}`);
    addLine("Medical need", medicalNeed);
    addLine("Vulnerable", vulnerableGroup, yesNoMap);
    addLine("Mobility", slots.mobility_needs, yesNoMap);
    if ((slots.crisis_type || request?.crisis_type) !== "power_outage") {
      addLine("Temperature", heatingRisk, heatingMap);
    }
  }

  const crisisType = slots.crisis_type || request?.crisis_type;
  if (crisisType === "flood") {
    addLine("Water level", slots.water_level, waterLevelMap);
    addLine("Water trend", slots.water_trend, waterTrendMap);
    addLine("Floor", slots.floor_info, floorInfoMap);
    addLine("Power outage", slots.power_outage, yesNoMap);
    addLine("Additional hazards", slots.hazard_type, hazardMap);
  } else if (crisisType === "wildfire") {
    addLine("Fire distance", slots.fire_distance, fireDistanceMap);
    addLine("Smoke inhalation", slots.smoke_inhalation, smokeMap);
    addLine("Vehicle access", slots.vehicle_access, vehicleMap);
  } else if (crisisType === "power_outage") {
    addLine("Temperature", slots.heating_cooling_risk, heatingMap);
    addLine("Building floor", slots.building_floor, buildingFloorMap);
    addLine("Outage duration", slots.duration_estimate, durationMap);
  }

  if (!lines.length) return null;
  return {
    title: isEmergency ? "Emergency summary" : "Handoff summary",
    lines,
  };
};

const TABLE_PAGES = [
  { id: "alerts", label: "Current Alerts", shortLabel: "AL" },
  { id: "supply_points", label: "Supply Points", shortLabel: "SP" },
  { id: "contact_points", label: "Contact Points", shortLabel: "CP" },
  { id: "emergency_numbers", label: "Emergency Numbers", shortLabel: "EN" },
  { id: "users", label: "Users", shortLabel: "US" },
];

export default function AdminPanel() {
  const { t } = useTranslation();
  const session = loadAdminSession();
  const [token, setToken] = useState(session?.token || "");
  const [userType, setUserType] = useState(session?.userType || "");
  const [username, setUsername] = useState(session?.username || "crisos_admin");
  const [password, setPassword] = useState("123456789");
  const [authError, setAuthError] = useState("");
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [toast, setToast] = useState("");

  const [requests, setRequests] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [lastMessageId, setLastMessageId] = useState(0);
  const [draft, setDraft] = useState("");
  const [activePage, setActivePage] = useState("handover");
  const [queueUpdatedAt, setQueueUpdatedAt] = useState(null);
  const [summaryAddresses, setSummaryAddresses] = useState({});
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState("");

  const isAdmin = userType === "admin";

  const pages = useMemo(() => {
    const base = [
      { id: "handover", label: t("admin.queue"), shortLabel: "HQ" },
    ];
    if (isAdmin) {
      return [...base, ...TABLE_PAGES];
    }
    return [
      ...base,
      { id: "supply_points", label: "Supply Points", shortLabel: "SP" },
      { id: "contact_points", label: "Contact Points", shortLabel: "CP" },
    ];
  }, [isAdmin, t]);

  const handleLogin = () => {
    setAuthError("");
    adminLogin({ username, password })
      .then((data) => {
        setToken(data.token);
        setUserType(data.user_type);
        setUsername(username);
        setPassword("");
      })
      .catch(() => setAuthError("Login failed"));
  };

  const handleLogout = () => {
    setToken("");
    setUserType("");
    setUsername("crisos_admin");
    setPassword("123456789");
    setSelectedId(null);
    setMessages([]);
    setActivePage("handover");
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
    }
  };

  const handlePasswordUpdate = () => {
    if (!currentPassword || !newPassword) {
      setPasswordError("Fill in all fields.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    setPasswordError("");
    adminChangePassword(token, {
      current_password: currentPassword,
      new_password: newPassword,
    })
      .then(() => {
        setPasswordModalOpen(false);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setToast("Password updated.");
      })
      .catch(() => setPasswordError("Unable to change password."));
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!token) {
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
      return;
    }
    window.localStorage.setItem(
      ADMIN_SESSION_KEY,
      JSON.stringify({
        token,
        userType,
        username,
      })
    );
  }, [token, userType, username]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const load = () =>
      adminListHandoffRequests(token)
        .then((data) => {
          if (!active) return;
          setRequests(data.requests || []);
          setQueueUpdatedAt(new Date());
        })
        .catch(() => null);
    load();
    const interval = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    if (!selectedId || !token) return;
    setMessages([]);
    setLastMessageId(0);
    adminGetHandoffMessages(token, selectedId, 0)
      .then((data) => {
        const incoming = (data.messages || []).map((message) => ({
          id: message.id,
          sender: message.sender,
          text: message.text,
          timestamp: message.created_at,
        }));
        setMessages(incoming);
        if (incoming.length) {
          setLastMessageId(incoming[incoming.length - 1].id);
        }
      })
      .catch(() => null);
  }, [selectedId, token]);

  useEffect(() => {
    if (!selectedId || !token) return;
    const interval = setInterval(() => {
      adminGetHandoffMessages(token, selectedId, lastMessageId)
        .then((data) => {
          if (!data.messages?.length) return;
          setMessages((prev) => [
            ...prev,
            ...data.messages.map((message) => ({
              id: message.id,
              sender: message.sender,
              text: message.text,
              timestamp: message.created_at,
            })),
          ]);
          setLastMessageId(data.messages[data.messages.length - 1].id);
        })
        .catch(() => null);
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedId, lastMessageId, token]);

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedId),
    [requests, selectedId]
  );
  const summaryAddress = selectedRequest?.id
    ? summaryAddresses[selectedRequest.id]
    : null;
  const summary = useMemo(
    () =>
      buildSummary(
        parseSummary(selectedRequest?.summary_json),
        selectedRequest,
        summaryAddress
      ),
    [selectedRequest, summaryAddress]
  );
  const assignmentLocked =
    selectedRequest?.assigned_to &&
    selectedRequest.assigned_to !== username &&
    userType !== "admin";
  const closedLocked = selectedRequest?.status === "closed";

  useEffect(() => {
    if (!selectedRequest?.id) return;
    const summaryData = parseSummary(selectedRequest?.summary_json);
    if (!summaryData) return;
    const slots = summaryData.slots || {};
    const hasLocation = slots.location || slots.address || slots.city;
    const lat = slots.lat ?? slots.latitude;
    const lon = slots.lon ?? slots.longitude;
    if (hasLocation || lat == null || lon == null) return;
    if (summaryAddresses[selectedRequest.id]) return;
    fetch(
      `${API_BASE_URL}/api/reverse?lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lon)}`
    )
      .then((response) => response.json())
      .then((data) => {
        if (data.label) {
          setSummaryAddresses((prev) => ({
            ...prev,
            [selectedRequest.id]: data.label,
          }));
        }
      })
      .catch(() => null);
  }, [selectedRequest, summaryAddresses]);

  useEffect(() => {
    if (!token || activePage !== "alerts") return;
    let active = true;
    setAlertsLoading(true);
    setAlertsError("");
    adminGetAlerts(token)
      .then((data) => {
        if (!active) return;
        setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
      })
      .catch(() => {
        if (!active) return;
        setAlertsError("Unable to load alerts.");
      })
      .finally(() => {
        if (!active) return;
        setAlertsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activePage, token]);

  const alertTone = (severity) => {
    const level = String(severity || "").toLowerCase();
    if (level === "extreme") {
      return "border-rose-300 bg-rose-100 text-rose-800";
    }
    if (level === "severe") {
      return "border-orange-300 bg-orange-100 text-orange-800";
    }
    return "border-clay/60 bg-white text-ash";
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !selectedId || !token || assignmentLocked || closedLocked) {
      return;
    }
    setDraft("");
    adminSendHandoffMessage(token, {
      request_id: selectedId,
      sender: "agent",
      text,
    }).catch(() => null);
  };

  const handleStatus = (status) => {
    if (!selectedId || !token || closedLocked) return;
    adminUpdateHandoffStatus(token, selectedId, status)
      .then(() => {
        setRequests((prev) =>
          prev.map((item) =>
            item.id === selectedId
              ? {
                  ...item,
                  status,
                  assigned_to:
                    status === "assigned"
                      ? username
                      : status === "open"
                      ? null
                      : item.assigned_to,
                }
              : item
          )
        );
      })
      .catch(() => null);
  };

  if (!token) {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-clay/70 bg-white/80 p-6 shadow-card">
        <div className="flex flex-col items-center text-center">
          <p className="brand-wordmark text-3xl text-ink">
            <span>CRI</span>
            <span className="text-rose-500">SOS</span>
          </p>
          <p className="mt-2 text-xs text-ash">Sign in to continue.</p>
        </div>
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            handleLogin();
          }}
        >
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            className="rounded-2xl border border-clay/60 bg-white px-3 py-2 text-sm shadow-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="rounded-2xl border border-clay/60 bg-white px-3 py-2 text-sm shadow-sm"
          />
          {authError ? (
            <p className="text-xs text-ember">{authError}</p>
          ) : null}
          <button
            type="submit"
            className="rounded-2xl bg-slate px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white"
          >
            Sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      className={`relative grid min-w-0 gap-6 ${
        navCollapsed ? "lg:grid-cols-[96px_1fr]" : "lg:grid-cols-[240px_1fr]"
      }`}
    >
      {toast ? (
        <div className="fixed right-6 top-6 z-50 rounded-2xl border border-moss/40 bg-moss/10 px-4 py-2 text-xs font-semibold text-moss shadow-soft">
          {toast}
        </div>
      ) : null}
      <Menu as="div" className="absolute right-0 -top-14 z-30">
        <Menu.Button className="rounded-full border border-clay bg-white/80 px-3 py-2 text-xs font-semibold text-ash">
          {username || "Account"}
        </Menu.Button>
        <Menu.Items className="absolute right-0 mt-2 w-44 rounded-2xl border border-clay bg-white shadow-soft">
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={() => setPasswordModalOpen(true)}
                className={`block w-full px-4 py-2 text-left text-xs ${
                  active ? "bg-sand" : ""
                }`}
              >
                Change password
              </button>
            )}
          </Menu.Item>
          <Menu.Item>
            {({ active }) => (
              <button
                type="button"
                onClick={handleLogout}
                className={`block w-full px-4 py-2 text-left text-xs ${
                  active ? "bg-sand" : ""
                }`}
              >
                Sign out
              </button>
            )}
          </Menu.Item>
        </Menu.Items>
      </Menu>
      <aside className="max-h-[70vh] overflow-y-auto rounded-3xl border border-clay/70 bg-white/80 p-4 shadow-card lg:h-[70vh]">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-ash">
            {navCollapsed ? "DB" : "Dashboard"}
          </p>
          <button
            type="button"
            onClick={() => setNavCollapsed((prev) => !prev)}
            title={navCollapsed ? "Expand menu" : "Collapse menu"}
            className="rounded-full border border-clay/60 bg-white px-2 py-1 text-[10px] font-semibold uppercase text-ash"
          >
            {navCollapsed ? ">>" : "<<"}
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {pages.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() => setActivePage(page.id)}
              title={page.label}
              className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                activePage === page.id
                  ? "border border-slate/60 bg-slate text-white shadow-soft"
                  : "border border-clay/60 bg-white text-ash"
              } ${navCollapsed ? "text-center" : "text-left"}`}
            >
              {navCollapsed
                ? page.shortLabel || page.label.slice(0, 2).toUpperCase()
                : page.label}
            </button>
          ))}
        </div>
      </aside>

      <section className="w-full min-w-0">
        {activePage === "handover" ? (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="flex h-full flex-col rounded-3xl border border-clay/70 bg-white/80 p-5 shadow-card lg:h-[70vh]">
              <p className="text-sm font-semibold text-ink">{t("admin.queue")}</p>
              <div className="mt-4 flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
                {requests.length === 0 && (
                  <p className="text-xs text-ash">{t("admin.empty")}</p>
                )}
                {requests.map((request) => {
                  const createdAt = request.created_at
                    ? new Date(request.created_at)
                    : null;
                  const shortDate = createdAt
                    ? createdAt.toLocaleDateString(undefined, {
                        month: "short",
                        day: "2-digit",
                      })
                    : null;
                  const shortTime = createdAt
                    ? createdAt.toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : null;
                  const riskValue = normalizeRisk(request.risk_score, request.user_status);
                  const selected = request.id === selectedId;
                  const isClosed = request.status === "closed";
                  const isDisabled = isClosed && userType !== "admin";
                  const isSafe = request.user_status === "safe";
                  const cardTone = isClosed
                    ? "border-clay/60 bg-clay/30"
                    : isSafe
                    ? "border-moss/30 bg-moss/10"
                    : riskValue >= 70
                    ? "border-rose-300 bg-rose-100"
                    : riskValue >= 40
                    ? "border-orange-300 bg-orange-100"
                    : "border-clay/60 bg-white";
                  const selectedBorder = selected
                    ? "border-black ring-2 ring-black ring-inset"
                    : "";
                  const hasNewMessage =
                    request.status === "assigned" &&
                    request.last_message_sender === "user";
                  const riskLevel = riskLabel(riskValue, request.user_status);
                  const riskText =
                    request.user_status === "safe"
                      ? riskLevel
                      : `${riskLevel} (${riskValue})`;
                  return (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => setSelectedId(request.id)}
                      disabled={isDisabled}
                      className={`rounded-2xl border px-3 py-3 text-left text-xs transition ${cardTone} ${selectedBorder} ${
                        isDisabled ? "cursor-not-allowed opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-ink">
                          {request.user_status || "unknown"}
                        </span>
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${statusStyles[request.status]}`}
                          >
                            {request.status === "assigned" && request.assigned_to
                              ? `ASSIGNED: ${request.assigned_to}`
                              : statusLabels[request.status]}
                            {hasNewMessage ? (
                              <span className="ml-2 inline-block h-2 w-2 rounded-full bg-ember" />
                            ) : null}
                          </span>
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-ash">
                        Crisis: {request.crisis_type || "unknown"}
                      </p>
                      <p className="text-[11px] text-ash">
                        Risk: {riskText}
                      </p>
                      {shortDate ? (
                        <p className="text-[11px] text-ash">
                          Date: {shortDate} {shortTime || ""}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div className="mt-auto border-t border-clay/60 pt-3 text-[10px] text-ash">
                Updated{" "}
                {queueUpdatedAt
                  ? queueUpdatedAt.toLocaleTimeString()
                  : "--:--"}
              </div>
            </div>

            <div className="flex min-h-[60vh] flex-col overflow-hidden rounded-3xl border border-clay/70 bg-white/70 shadow-card lg:h-[70vh]">
              <div className="flex items-center justify-between border-b border-clay/60 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {selectedRequest ? t("admin.conversation") : t("admin.select")}
                  </p>
                  <p className="text-xs text-ash">
                    {selectedRequest?.conversation_id ||
                      t("admin.noConversation")}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleStatus("assigned")}
                    className="rounded-full border border-sky/40 bg-sky/20 px-3 py-1 text-[10px] font-semibold uppercase text-slate"
                  >
                    {t("admin.assign")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStatus("closed")}
                    className="rounded-full border border-clay/80 bg-clay/40 px-3 py-1 text-[10px] font-semibold uppercase text-ash"
                  >
                    {t("admin.close")}
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-6">
                {summary ? (
                  <div className="mb-4 rounded-2xl border border-clay/60 bg-sand px-4 py-3 text-xs text-ash">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink">
                      {summary.title}
                    </p>
                    <div className="mt-2 flex flex-col gap-1 text-[11px] text-ash">
                      {summary.lines.map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="flex flex-col gap-4">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.sender === "agent"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                          message.sender === "agent"
                            ? "bg-slate text-white"
                            : "bg-white text-ink"
                        }`}
                      >
                        <p className="whitespace-pre-line leading-relaxed">
                          {message.text}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 border-t border-clay/60 bg-white/70 px-4 py-4">
                {assignmentLocked || closedLocked ? (
                  <p className="text-[11px] text-ash">
                    {closedLocked
                      ? "This handover is closed."
                      : `Assigned to ${selectedRequest?.assigned_to}.`}
                  </p>
                ) : null}
                <input
                  type="text"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={t("admin.replyPlaceholder")}
                  className="flex-1 rounded-2xl border border-clay/60 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky/60"
                  disabled={!selectedId || assignmentLocked || closedLocked}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={
                    !selectedId || !draft.trim() || assignmentLocked || closedLocked
                  }
                  className="rounded-2xl bg-slate px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white shadow-soft transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t("chat.send")}
                </button>
              </div>
            </div>
          </div>
        ) : activePage === "alerts" ? (
          <div className="rounded-3xl border border-clay/70 bg-white/80 p-6 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">Current alerts</p>
              <span className="text-xs text-ash">Severe & Extreme</span>
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {alertsLoading ? (
                <p className="text-xs text-ash">Loading alerts...</p>
              ) : alertsError ? (
                <p className="text-xs text-ember">{alertsError}</p>
              ) : alerts.length === 0 ? (
                <p className="text-xs text-ash">No severe or extreme alerts.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {alerts.map((alert) => (
                    <li
                      key={`${alert.source}-${alert.id}`}
                      className={`rounded-2xl border px-4 py-3 text-sm ${alertTone(
                        alert.severity
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase">
                        <span>{alert.severity}</span>
                        <span>{alert.source}</span>
                      </div>
                      {alert.title_en ? (
                        <p className="mt-2 text-sm font-semibold text-ink">
                          {alert.title_en}
                        </p>
                      ) : null}
                      {alert.title_de ? (
                        <p className={`${alert.title_en ? "mt-1" : "mt-2"} text-sm text-ash`}>
                          {alert.title_de}
                        </p>
                      ) : !alert.title_en ? (
                        <p className="mt-2 text-sm font-semibold text-ink">
                          {alert.title}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <TableManager token={token} tableName={activePage} />
        )}
      </section>

      <Dialog
        open={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/20" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Panel className="w-full max-w-md rounded-3xl border border-clay/70 bg-white p-6 shadow-card">
            <Dialog.Title className="text-sm font-semibold text-ink">
              Change password
            </Dialog.Title>
            <div className="mt-4 grid gap-3">
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Current password"
                className="rounded-2xl border border-clay/60 bg-white px-3 py-2 text-sm shadow-sm"
              />
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password"
                className="rounded-2xl border border-clay/60 bg-white px-3 py-2 text-sm shadow-sm"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm password"
                className="rounded-2xl border border-clay/60 bg-white px-3 py-2 text-sm shadow-sm"
              />
              {passwordError ? (
                <p className="text-xs text-ember">{passwordError}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="rounded-full border border-clay bg-white px-3 py-2 text-xs font-semibold text-ash"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handlePasswordUpdate}
                  className="rounded-full bg-slate px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white"
                >
                  Save
                </button>
              </div>
            </div>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}
