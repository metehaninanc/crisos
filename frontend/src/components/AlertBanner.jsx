export default function AlertBanner({ title, message, tone = "warning" }) {
  const toneStyles = {
    warning: "border-amber-300 bg-amber-100 text-amber-900",
    info: "border-sky/40 bg-sky/20 text-slate",
  };

  const renderContent = (content, className) => {
    if (!content) return null;
    if (typeof content === "string") {
      return <p className={className}>{content}</p>;
    }
    return <div className={className}>{content}</div>;
  };

  return (
    <div
      className={`rounded-2xl border px-4 py-3 shadow-sm ${toneStyles[tone]}`}
      role="status"
      aria-live="polite"
    >
      {renderContent(title, "text-sm font-semibold")}
      {renderContent(message, "text-xs text-ash")}
    </div>
  );
}
