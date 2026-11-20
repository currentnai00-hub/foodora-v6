"use strict";
(() => {
  const root = document.documentElement;
  const overlay = document.getElementById("fdEntryIntro");
  if (!overlay || !root.classList.contains("fd-entry-pending")) {
    if (overlay) overlay.hidden = true;
    return;
  }

  const skip = overlay.querySelector("[data-entry-skip]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let timer = null;
  let previousOverflow = "";
  let finished = false;

  function finish() {
    if (finished) return;
    finished = true;
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    root.classList.remove("fd-entry-pending");
    document.body.style.overflow = previousOverflow;
    document.body.classList.remove("fd-entry-intro-open");
    document.dispatchEvent(new CustomEvent("foodora:intro:finished"));
  }

  function onKeydown(event) {
    if (finished) return;
    if (event.key === "Escape") {
      event.preventDefault();
      finish();
    } else if (event.key === "Tab") {
      event.preventDefault();
      skip.focus({ preventScroll: true });
    }
  }

  try {
    sessionStorage.setItem("foodora_entry_intro_seen", "1");
  } catch (_) {
    // The intro still works when session storage is unavailable.
  }

  if (reducedMotion.matches) {
    finish();
    return;
  }

  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.body.classList.add("fd-entry-intro-open");
  overlay.setAttribute("aria-hidden", "false");
  skip.focus({ preventScroll: true });
  skip.addEventListener("click", finish);
  document.addEventListener("keydown", onKeydown);
  timer = window.setTimeout(finish, 2850);

  window.addEventListener("pagehide", () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
    document.removeEventListener("keydown", onKeydown);
    document.body.style.overflow = previousOverflow;
    document.body.classList.remove("fd-entry-intro-open");
    root.classList.remove("fd-entry-pending");
  }, { once: true });
})();
