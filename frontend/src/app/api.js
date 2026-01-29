const DEFAULT_BASE_URL = "http://localhost:8000";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || DEFAULT_BASE_URL;

export async function sendChatMessage(payload) {
  const response = await fetch(`${API_BASE_URL}/api/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail = data.detail || "";
    } catch {
      detail = await response.text();
    }
    if (detail.includes("localhost") && detail.includes("5005")) {
      throw new Error("Chat service offline. Start the Rasa server.");
    }
    throw new Error(detail || "Chat request failed");
  }

  return response.json();
}

export async function transcribeAudio(blob, locale) {
  const formData = new FormData();
  formData.append("audio", blob, "voice.webm");
  if (locale) {
    formData.append("locale", locale);
  }
  const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    let detail = "";
    try {
      const data = await response.json();
      detail = data.detail || "";
    } catch {
      detail = await response.text();
    }
    throw new Error(detail || "Transcription failed");
  }
  return response.json();
}

export async function getActiveHandoffRequest(conversationId) {
  const url = new URL(`${API_BASE_URL}/api/handoff/requests/active`);
  url.searchParams.set("conversation_id", conversationId);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Unable to load handoff status");
  }
  return response.json();
}

export async function getHandoffMessages(requestId, afterId = 0) {
  const url = new URL(`${API_BASE_URL}/api/handoff/messages`);
  url.searchParams.set("request_id", requestId);
  url.searchParams.set("after_id", String(afterId));
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Unable to load handoff messages");
  }
  return response.json();
}

export async function sendHandoffMessage(payload) {
  const response = await fetch(`${API_BASE_URL}/api/handoff/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Unable to send handoff message");
  }
  return response.json();
}

export async function adminLogin(payload) {
  const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Login failed");
  }
  return response.json();
}

export async function adminListHandoffRequests(token, status) {
  const url = new URL(`${API_BASE_URL}/api/admin/handoff/requests`);
  if (status) {
    url.searchParams.set("status", status);
  }
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("Unable to load handoff requests");
  }
  return response.json();
}

export async function adminGetHandoffMessages(token, requestId, afterId = 0) {
  const url = new URL(`${API_BASE_URL}/api/admin/handoff/messages`);
  url.searchParams.set("request_id", requestId);
  url.searchParams.set("after_id", String(afterId));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("Unable to load handoff messages");
  }
  return response.json();
}

export async function adminSendHandoffMessage(token, payload) {
  const response = await fetch(`${API_BASE_URL}/api/admin/handoff/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Unable to send handoff message");
  }
  return response.json();
}

export async function adminUpdateHandoffStatus(token, requestId, status) {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/handoff/requests/${requestId}/status`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    }
  );
  if (!response.ok) {
    throw new Error("Unable to update handoff status");
  }
  return response.json();
}

export async function adminGetTable(token, table, limit = 50, offset = 0) {
  const url = new URL(`${API_BASE_URL}/api/admin/table/${table}`);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("Unable to load table");
  }
  return response.json();
}

export async function adminGetAlerts(token) {
  const response = await fetch(`${API_BASE_URL}/api/admin/alerts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("Unable to load alerts");
  }
  return response.json();
}

export async function adminCreateRow(token, table, data) {
  const response = await fetch(`${API_BASE_URL}/api/admin/table/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ data }),
  });
  if (!response.ok) {
    throw new Error("Unable to create row");
  }
  return response.json();
}

export async function adminUpdateRow(token, table, rowId, data) {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/table/${table}/${rowId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ data }),
    }
  );
  if (!response.ok) {
    throw new Error("Unable to update row");
  }
  return response.json();
}

export async function adminDeleteRow(token, table, rowId) {
  const response = await fetch(
    `${API_BASE_URL}/api/admin/table/${table}/${rowId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!response.ok) {
    throw new Error("Unable to delete row");
  }
  return response.json();
}

export async function adminChangePassword(token, payload) {
  const response = await fetch(`${API_BASE_URL}/api/admin/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error("Unable to change password");
  }
  return response.json();
}
