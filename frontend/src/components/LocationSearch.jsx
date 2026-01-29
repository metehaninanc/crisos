import { Combobox } from "@headlessui/react";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "../app/api";

export default function LocationSearch({
  value,
  onChange,
  onSelect,
  placeholder,
  disabled = false,
}) {
  const [query, setQuery] = useState(value || "");
  const [selected, setSelected] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setQuery(value || "");
    if (!value) {
      setSelected(null);
    }
  }, [value]);

  useEffect(() => {
    if (disabled) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (disabled || !query || query.length < 3) {
      setResults([]);
      return;
    }

    const handle = setTimeout(() => {
      setLoading(true);
      setError(null);
      fetch(`${API_BASE_URL}/api/geocode?query=${encodeURIComponent(query)}`)
        .then((response) => {
          if (!response.ok) {
            throw new Error("Unable to fetch suggestions");
          }
          return response.json();
        })
        .then((data) => {
            setResults(data.results || []);
        })
        .catch((err) => {
          setError(err.message);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="relative">
      <Combobox
        value={selected}
        disabled={disabled}
        onChange={(item) => {
          if (!item || disabled) return;
          const label = item.label || item.display_name || "";
          setSelected(item);
          setQuery(label);
          onSelect(item);
        }}
      >
        <Combobox.Input
          className="w-full rounded-2xl border border-clay/60 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky/60"
          onChange={(event) => {
            if (disabled) return;
            const next = event.target.value;
            setQuery(next);
            onChange(next);
          }}
          displayValue={() => query}
          placeholder={placeholder}
          disabled={disabled}
        />
        {loading ? (
          <div className="absolute right-3 top-2 text-[10px] text-ash">
            ...
          </div>
        ) : null}
        {error ? (
          <div className="mt-1 text-[10px] text-ember">{error}</div>
        ) : null}
        {results.length > 0 && (
          <Combobox.Options className="absolute z-20 mt-2 max-h-56 w-full overflow-y-auto rounded-2xl border border-clay bg-white shadow-soft">
            {results.map((item, index) => (
              <Combobox.Option
                key={`${item.label || item.display_name}-${index}`}
                value={item}
                className={({ active }) =>
                  `cursor-pointer px-4 py-2 text-xs ${
                    active ? "bg-sand" : "bg-white"
                  }`
                }
              >
                {item.label || item.display_name}
              </Combobox.Option>
            ))}
          </Combobox.Options>
        )}
      </Combobox>
    </div>
  );
}
