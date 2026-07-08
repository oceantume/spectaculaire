export function enableBackdropDismiss(dialog: HTMLDialogElement) {
  // Close on a full click (not pointerdown, unlike native closedby="any"
  // light-dismiss) so the closing gesture can't fall through to whatever
  // element ends up underneath once the dialog is gone. This avoids a
  // Chromium mobile bug where closedby="any" causes backdrop taps to
  // trigger a click on the element beneath the dialog.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
}
