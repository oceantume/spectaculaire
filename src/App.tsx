import { useEffect } from "preact/hooks";
import { PageNav } from "./PageNav";
import { ScheduleTable } from "./ScheduleTable";
import { useStoredState } from "./useStoredState";

export function App() {
  const [theme, setTheme] = useStoredState(
    "theme",
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#111827" : "#ffffff");
  }, [theme]);

  function onToggleTheme() {
    setTheme((v) => (v === "dark" ? "light" : "dark"));
  }

  return (
    <main class="p-2 sm:p-4 dark:bg-gray-900 min-h-screen">
      <PageNav theme={theme} onToggleTheme={onToggleTheme} />
      <ScheduleTable />
    </main>
  );
}
