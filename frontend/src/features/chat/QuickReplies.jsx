import { useTranslation } from "react-i18next";

export default function QuickReplies({ replies, onSelect, disabled }) {
  const { t } = useTranslation();
  if (!replies?.length) return null;

  return (
    <div className="border-t border-clay/60 bg-white/60 px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-ash">
        {t("chat.quickReplies")}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {replies.map((reply, index) => (
          <button
            key={`${reply.title}-${index}`}
            type="button"
            onClick={() => onSelect(reply.payload || reply.title)}
            disabled={disabled}
            className="rounded-full border border-slate/10 bg-white px-4 py-2 text-xs font-semibold text-slate shadow-sm transition hover:-translate-y-0.5 hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
          >
            {reply.title}
          </button>
        ))}
      </div>
    </div>
  );
}
