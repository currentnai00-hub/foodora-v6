(() => {
  "use strict";

  const root = document.getElementById("homeHero");
  if (!root) return;

  const slides = Array.from(root.querySelectorAll(".hero-slide"));
  const dots = Array.from(root.querySelectorAll(".hero-dot"));
  const previous = document.getElementById("heroPrev");
  const next = document.getElementById("heroNext");
  const pauseButton = document.getElementById("heroPause");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const intervalMs = 7000;

  let current = 0;
  let timer = null;
  let userPaused = false;
  let pointerStartX = null;

  function render(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      const active = i === current;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
      slide.querySelectorAll("a,button").forEach(control => {
        if (active) control.removeAttribute("tabindex");
        else control.setAttribute("tabindex", "-1");
      });
    });
    dots.forEach((dot, i) => {
      const active = i === current;
      dot.classList.toggle("is-active", active);
      if (active) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  }

  function stopTimer() {
    if (timer !== null) window.clearInterval(timer);
    timer = null;
  }

  function canAutoPlay() {
    return !userPaused && !reducedMotion.matches &&
      !document.hidden && !root.matches(":hover") &&
      !root.contains(document.activeElement);
  }

  function startTimer() {
    stopTimer();
    if (!canAutoPlay() || slides.length < 2) return;
    timer = window.setInterval(() => render(current + 1), intervalMs);
  }

  function goTo(index) {
    render(index);
    startTimer();
  }

  previous?.addEventListener("click", () => goTo(current - 1));
  next?.addEventListener("click", () => goTo(current + 1));
  dots.forEach(dot => dot.addEventListener("click", () => goTo(Number(dot.dataset.slide) || 0)));

  pauseButton?.addEventListener("click", () => {
    userPaused = !userPaused;
    pauseButton.setAttribute("aria-pressed", String(userPaused));
    pauseButton.setAttribute("aria-label", userPaused ? "স্লাইড অটো-প্লে চালু করুন" : "স্লাইড অটো-প্লে বন্ধ করুন");
    pauseButton.textContent = userPaused ? "▶" : "Ⅱ";
    startTimer();
  });

  root.addEventListener("mouseenter", stopTimer);
  root.addEventListener("mouseleave", startTimer);
  root.addEventListener("focusin", stopTimer);
  root.addEventListener("focusout", event => {
    if (!root.contains(event.relatedTarget)) startTimer();
  });
  document.addEventListener("visibilitychange", startTimer);
  reducedMotion.addEventListener?.("change", startTimer);

  root.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") { event.preventDefault(); goTo(current - 1); }
    if (event.key === "ArrowRight") { event.preventDefault(); goTo(current + 1); }
  });

  root.addEventListener("pointerdown", event => {
    if (event.pointerType === "touch") pointerStartX = event.clientX;
  }, { passive: true });
  root.addEventListener("pointerup", event => {
    if (pointerStartX === null) return;
    const distance = event.clientX - pointerStartX;
    pointerStartX = null;
    if (Math.abs(distance) > 48) goTo(current + (distance < 0 ? 1 : -1));
  }, { passive: true });
  root.addEventListener("pointercancel", () => { pointerStartX = null; });

  const categoryTrack = document.getElementById("categories");
  document.querySelectorAll("[data-category-scroll]").forEach(button => {
    button.addEventListener("click", () => {
      if (!categoryTrack) return;
      const direction = Number(button.dataset.categoryScroll) || 1;
      categoryTrack.scrollBy({ left: direction * Math.max(180, categoryTrack.clientWidth * 0.65), behavior: reducedMotion.matches ? "auto" : "smooth" });
    });
  });

  render(0);
  startTimer();
})();
