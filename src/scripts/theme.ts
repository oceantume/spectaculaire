import { setStored } from "./stored-state";

document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
  const toggle = () => {
    const isDark = document.documentElement.classList.toggle("dark");
    setStored("theme", isDark ? "dark" : "light");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? "#111827" : "#ffffff");
  };

  if (document.startViewTransition) {
    document.startViewTransition(toggle);
  } else {
    toggle();
  }
});
