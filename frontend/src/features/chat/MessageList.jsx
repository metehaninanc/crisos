import { useEffect, useRef } from "react";

const bubbleStyles = {
  user: "bg-slate text-white ml-auto",
  bot: "bg-white text-ink",
  system: "bg-clay/50 text-ash",
};

export default function MessageList({ messages }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6" role="log" aria-live="polite">
      <div className="flex flex-col gap-4">
        {messages.map((message) => (
          <div key={message.id} className="flex">
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${bubbleStyles[message.sender]}`}
            >
              <p className="whitespace-pre-line leading-relaxed">{message.text}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
