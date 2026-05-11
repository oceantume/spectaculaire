if (!("command" in HTMLButtonElement.prototype)) {
  document.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest("button[commandfor]") as HTMLButtonElement | null;
    if (!btn) return;

    const targetId = btn.getAttribute("commandfor");
    const command = btn.getAttribute("command");
    if (!targetId || !command) return;

    const target = document.getElementById(targetId);
    if (!target) return;

    if (command === "show-modal" && target instanceof HTMLDialogElement) {
      target.showModal();
    } else if (command === "close" && target instanceof HTMLDialogElement) {
      target.close();
    } else if (command === "toggle-popover") {
      (target as HTMLElement).togglePopover();
    } else if (command === "show-popover") {
      (target as HTMLElement).showPopover();
    } else if (command === "hide-popover") {
      (target as HTMLElement).hidePopover();
    }
  });
}
