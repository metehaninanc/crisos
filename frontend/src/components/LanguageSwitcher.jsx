import { Listbox } from "@headlessui/react";
import { useMemo } from "react";

const LANGUAGES = [
  { code: "en", label: "EN" },
  { code: "tr", label: "TR" },
  { code: "de", label: "DE" },
];

export default function LanguageSwitcher({ value, onChange }) {
  const selected = useMemo(
    () => LANGUAGES.find((lang) => lang.code === value) || LANGUAGES[0],
    [value]
  );

  return (
    <Listbox value={selected} onChange={(option) => onChange(option.code)}>
      <div className="relative">
        <Listbox.Button className="rounded-full border border-clay bg-white/80 px-3 py-2 text-[11px] font-semibold text-ash">
          {selected.label}
        </Listbox.Button>
        <Listbox.Options className="absolute right-0 z-20 mt-2 w-24 rounded-2xl border border-clay bg-white shadow-soft">
          {LANGUAGES.map((lang) => (
            <Listbox.Option
              key={lang.code}
              value={lang}
              className={({ active }) =>
                `cursor-pointer px-3 py-2 text-xs ${active ? "bg-sand" : ""}`
              }
            >
              {lang.label}
            </Listbox.Option>
          ))}
        </Listbox.Options>
      </div>
    </Listbox>
  );
}
