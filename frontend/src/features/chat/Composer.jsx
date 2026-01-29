import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export default function Composer({ onSend, onVoice, onVoiceError, disabled }) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onVoiceError?.(t("chat.voiceUnsupported"));
      return;
    }
    if (!window.isSecureContext) {
      onVoiceError?.(t("chat.voiceSecureContext"));
      return;
    }
    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: "microphone" });
        if (status.state === "denied") {
          onVoiceError?.(t("chat.voicePermissionBlocked"));
          return;
        }
      } catch {
      }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        if (blob.size === 0) {
          onVoiceError?.(t("chat.voiceEmpty"));
          return;
        }
        onVoice?.(blob);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (error) {
      onVoiceError?.(t("chat.voicePermissionError"));
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const handleVoiceClick = () => {
    if (disabled) return;
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-3 border-t border-clay/60 bg-white/70 px-4 py-4"
    >
      <input
        type="text"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={recording ? t("chat.listeningPlaceholder") : t("chat.placeholder")}
        className="flex-1 rounded-2xl border border-clay/60 bg-white px-4 py-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky/60 disabled:opacity-60"
        disabled={disabled || recording}
        aria-label={recording ? t("chat.listeningPlaceholder") : t("chat.placeholder")}
      />
      <button
        type="button"
        onClick={handleVoiceClick}
        disabled={disabled}
        className={`rounded-2xl border px-4 py-3 text-xs font-semibold uppercase tracking-wide shadow-soft transition ${
          recording
            ? "border-amber/60 bg-amber/20 text-amber-900"
            : "border-clay/60 bg-white text-ink"
        } disabled:cursor-not-allowed disabled:opacity-60`}
        aria-label={recording ? t("chat.voiceStop") : t("chat.voiceStart")}
      >
        {recording ? t("chat.voiceStop") : t("chat.voiceStart")}
      </button>
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-2xl bg-slate px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white shadow-soft transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {t("chat.send")}
      </button>
    </form>
  );
}
