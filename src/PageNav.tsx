import { useEffect, useRef, useState } from "preact/hooks";

type Props = {
  theme: string;
  onToggleTheme: () => void;
};

type NavItem = {
  label: string;
  disabled?: boolean;
};

const items: NavItem[] = [
  { label: "Le Festif!", disabled: true },
  { label: "Fête de la Musique de Québec", disabled: true },
];

export function PageNav({ theme, onToggleTheme }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div class="flex items-center justify-between mb-4">
      <div ref={ref} class="relative inline-block">
        <button
          type="button"
          class={`text-2xl font-bold flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors dark:text-gray-100${open ? " bg-black/5 dark:bg-white/10" : " hover:bg-black/5 dark:hover:bg-white/10"}`}
          onClick={() => setOpen((v) => !v)}
        >
          Programmation FEQ 2026
          <span class="text-base leading-none self-center">▾</span>
        </button>
        {open && (
          <div class="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 rounded shadow-lg border border-gray-200 dark:border-gray-700 min-w-max z-30">
            {items.map((item) => (
              <div
                key={item.label}
                class="px-4 py-2 text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed flex items-center gap-2"
              >
                {item.label}
                <span class="text-xs">À venir</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onToggleTheme}
        class={`cursor-pointer p-1 rounded transition-colors ${theme === "dark" ? "text-gray-300 hover:text-gray-100" : "text-gray-300 hover:text-gray-400"}`}
        aria-label={theme === "dark" ? "Passer au mode clair" : "Passer au mode sombre"}
      >
        {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      </button>
    </div>
  );
}

function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <line x1="12" y1="20" x2="12" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <line x1="2" y1="12" x2="4" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <line x1="20" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}
