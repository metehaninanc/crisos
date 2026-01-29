import { Dialog } from "@headlessui/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import LanguageSwitcher from "./LanguageSwitcher";
import { setLanguage } from "../features/chat/chatSlice";

export default function DisclaimerModal({
  open,
  mode = "required",
  onAccept,
  onDecline,
  onClose,
}) {
  const { t, i18n } = useTranslation();
  const dispatch = useDispatch();
  const language = useSelector((state) => state.chat.language);
  const [checked, setChecked] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef(null);
  const required = mode === "required";
  const sections = t("app.disclaimer_sections", { returnObjects: true });
  const handleLanguageChange = (nextLang) => {
    i18n.changeLanguage(nextLang);
    dispatch(setLanguage(nextLang));
  };

  useEffect(() => {
    if (!open) {
      setChecked(false);
      setScrolled(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !required) return;
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const atBottom =
        el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
      if (atBottom) {
        setScrolled(true);
      }
    };
    const checkOverflow = () => {
      const needsScroll = el.scrollHeight > el.clientHeight + 8;
      if (!needsScroll) {
        setScrolled(true);
      }
    };
    el.scrollTop = 0;
    checkOverflow();
    handleScroll();
    el.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", checkOverflow);
    return () => {
      el.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", checkOverflow);
    };
  }, [open, required, sections.length]);

  const acceptDisabled = required && (!checked || !scrolled);
  const handleClose = required ? () => {} : onClose || (() => {});

  return (
    <Dialog open={open} onClose={handleClose} className="relative z-50">
      <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="h-[90vh] w-[90vw] max-w-[800px] overflow-hidden rounded-3xl border border-clay/70 bg-white p-6 shadow-card sm:h-auto">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span aria-hidden="true">⚠️</span>
              <h1 className="text-base font-semibold text-ink">
                {t("app.disclaimer_header")}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <LanguageSwitcher
                value={language}
                onChange={handleLanguageChange}
              />
              {!required ? (
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-full border border-clay bg-white px-3 py-2 text-xs font-semibold text-ash"
                >
                  {t("app.disclaimer_close")}
                </button>
              ) : null}
            </div>
          </div>

          <div
            ref={scrollRef}
            className="mt-4 max-h-[60vh] space-y-5 overflow-y-auto pr-2 text-sm text-ash scroll-smooth"
          >
            {sections.map((section) => (
              <section key={section.title}>
                <h3 className="text-base font-semibold text-ink">
                  {section.title}
                </h3>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={`${section.title}-${index}`} className="mt-2">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>

          {required && !scrolled ? (
            <p className="mt-3 text-xs text-ash">
              {t("app.disclaimer_scroll_hint")}
            </p>
          ) : null}

          {required ? (
            <label className="mt-4 flex items-center gap-2 text-xs text-ash">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
                className="h-4 w-4 rounded border border-clay/60"
              />
              <span>{t("app.disclaimer_checkbox")}</span>
            </label>
          ) : null}

          {required ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={onDecline}
                className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700"
              >
                {t("app.disclaimer_decline")}
              </button>
              <button
                type="button"
                onClick={onAccept}
                disabled={acceptDisabled}
                className="rounded-full bg-slate px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("app.disclaimer_accept")}
              </button>
            </div>
          ) : null}
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
