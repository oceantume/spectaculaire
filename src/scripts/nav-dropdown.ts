const toggle = document.querySelector("[data-nav-toggle]");
const menu = document.querySelector("[data-nav-menu]");

toggle?.addEventListener("click", () => {
  menu?.classList.toggle("hidden");
});

document.addEventListener("mousedown", (e) => {
  const wrapper = document.querySelector("[data-nav-dropdown]");
  if (wrapper && !wrapper.contains(e.target as Node)) {
    menu?.classList.add("hidden");
  }
});
