"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CreativeSelectOption<TValue extends string> {
  value: TValue;
  label: string;
  description?: string;
  Icon?: LucideIcon;
  disabled?: boolean;
}

interface CreativeSelectProps<TValue extends string> {
  id: string;
  value: TValue;
  options: Array<CreativeSelectOption<TValue>>;
  onChange: (value: TValue) => void;
  disabled?: boolean;
  Icon?: LucideIcon;
  ariaLabel?: string;
  size?: "default" | "compact" | "pair";
  menuAlign?: "left" | "right";
}

function findEnabledIndex(options: Array<{ disabled?: boolean }>, startIndex: number, direction: 1 | -1) {
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (startIndex + direction * offset + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return startIndex;
}

export function CreativeSelect<TValue extends string>({
  id,
  value,
  options,
  onChange,
  disabled,
  Icon,
  ariaLabel,
  size = "default",
  menuAlign = "left"
}: CreativeSelectProps<TValue>) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPlacement, setMenuPlacement] = useState<"top" | "bottom">("bottom");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedOption = options.find((option) => option.value === value) ?? options[0];
  const LeadingIcon = selectedOption?.Icon ?? Icon;

  useEffect(() => {
    if (!isOpen) return;

    function updateMenuPlacement() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;

      const estimatedMenuHeight = Math.min(options.length * 58 + 16, 240);
      const availableBelow = window.innerHeight - rect.bottom;
      const availableAbove = rect.top;
      setMenuPlacement(availableBelow < estimatedMenuHeight && availableAbove > availableBelow ? "top" : "bottom");
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => findEnabledIndex(options, current, event.key === "ArrowDown" ? 1 : -1));
      }
      if (event.key === "Enter") {
        const activeOption = options[activeIndex];
        if (activeOption && !activeOption.disabled) {
          event.preventDefault();
          onChange(activeOption.value);
          setIsOpen(false);
          rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
        }
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPlacement);
    window.addEventListener("scroll", updateMenuPlacement, true);
    updateMenuPlacement();

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPlacement);
      window.removeEventListener("scroll", updateMenuPlacement, true);
    };
  }, [activeIndex, isOpen, onChange, options]);

  useEffect(() => {
    if (!isOpen) return;
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : findEnabledIndex(options, -1, 1));
  }, [isOpen, options, value]);

  const isSmall = size === "compact" || size === "pair";

  return (
    <div ref={rootRef} className={cn("relative min-w-0", isOpen && "z-[1000]")}>
      <button
        id={id}
        type="button"
        role="combobox"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen ? `${listboxId}-${activeIndex}` : undefined}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (!isOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
        className={cn(
          "group relative flex min-w-0 w-full items-center overflow-hidden border text-left text-sm font-semibold shadow-sm outline-none transition",
          size === "compact"
            ? "gap-2 rounded-full px-3 py-2"
            : size === "pair"
              ? "gap-2 rounded-xl px-2.5 py-2.5"
              : "gap-3 rounded-2xl px-4 py-3",
          "border-slate-200/80 bg-slate-50/95 text-slate-950 hover:border-brand-300 hover:bg-white focus:border-brand-500 focus:ring-4 focus:ring-brand-100",
          "dark:border-slate-700 dark:bg-slate-950/90 dark:text-slate-100 dark:hover:border-cyan-500/70 dark:focus:ring-cyan-500/20",
          "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-70 dark:disabled:bg-slate-900",
          isOpen && "border-brand-500 ring-4 ring-brand-100 dark:border-cyan-500 dark:ring-cyan-500/20"
        )}
      >
        <span className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-cyan-300 via-brand-500 to-indigo-500 opacity-0 transition group-hover:opacity-100 group-focus:opacity-100" />
        {LeadingIcon ? (
          <span
            className={cn(
              "grid shrink-0 place-items-center bg-cyan-400/10 text-cyan-500 ring-1 ring-cyan-300/20 dark:text-cyan-300",
              size === "compact" ? "h-7 w-7 rounded-full" : size === "pair" ? "h-7 w-7 rounded-lg" : "h-8 w-8 rounded-xl"
            )}
          >
            <LeadingIcon className={cn(isSmall ? "h-3.5 w-3.5" : "h-4 w-4")} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate", isSmall ? "text-sm" : "text-base")}>{selectedOption?.label}</span>
          {selectedOption?.description ? (
            <span className="mt-0.5 block truncate text-xs font-medium text-slate-500 dark:text-slate-400">
              {selectedOption.description}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "shrink-0 text-slate-400 transition duration-200 dark:text-slate-500",
            isSmall ? "h-4 w-4" : "h-5 w-5",
            isOpen && "rotate-180 text-cyan-500 dark:text-cyan-300"
          )}
        />
      </button>

      {isOpen ? (
        <div
          id={listboxId}
          role="listbox"
          aria-labelledby={id}
          className={cn(
            "absolute z-[1000] min-w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white/[0.98] p-1.5 shadow-2xl shadow-slate-950/20 backdrop-blur-xl dark:border-cyan-400/20 dark:bg-slate-950/95",
            menuPlacement === "top" ? "bottom-full mb-2" : "top-full mt-2",
            size === "compact" &&
              "w-max min-w-[13rem] border-cyan-400/25 bg-slate-950/95 shadow-[0_22px_70px_rgba(2,6,23,0.42)] dark:bg-slate-950/95",
            size === "pair" && "w-max min-w-[13rem]",
            menuAlign === "right" ? "right-0" : "left-0 right-0"
          )}
        >
          <div className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
          <div className="max-h-60 overflow-y-auto overscroll-contain pr-0.5">
            {options.map((option, index) => {
              const OptionIcon = option.Icon ?? Icon;
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value}
                  id={`${listboxId}-${index}`}
                  type="button"
                  role="option"
                  disabled={option.disabled}
                  aria-selected={isSelected}
                  aria-disabled={option.disabled}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "relative flex w-full items-center gap-3 rounded-xl border-l-2 border-transparent px-3 py-2.5 text-left text-sm transition",
                    isSelected
                      ? "border-cyan-400 bg-sky-50 text-slate-950 dark:bg-cyan-400/10 dark:text-cyan-50"
                      : size === "compact"
                        ? "text-slate-200 hover:bg-white/10"
                        : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10",
                    option.disabled && "cursor-not-allowed opacity-45 hover:bg-transparent dark:hover:bg-transparent",
                    index === activeIndex && !option.disabled && "ring-1 ring-inset ring-cyan-300/70 dark:ring-cyan-400/40"
                  )}
                >
                  {OptionIcon ? (
                    <span
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-lg",
                        isSelected
                          ? "bg-cyan-400/15 text-cyan-600 dark:text-cyan-300"
                          : "bg-cyan-400/10 text-cyan-500 dark:text-cyan-300"
                      )}
                    >
                      <OptionIcon className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{option.label}</span>
                    {option.description ? (
                      <span className="block text-xs leading-4 text-slate-500 dark:text-slate-400">{option.description}</span>
                    ) : null}
                  </span>
                  {isSelected ? <Check className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
