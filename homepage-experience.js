"use strict";
(() => {
  const backdrop = document.getElementById("fdTour");
  if (!backdrop) return;

  const dialog = backdrop.querySelector('[role="dialog"]');
  const steps = [
    { icon: "🛍️", title: "পছন্দের খাবার বেছে নিন", text: "মেনু, সার্চ ও ফিল্টার থেকে আপনার পছন্দের খাবার খুঁজে কার্টে যোগ করুন।" },
    { icon: "🧾", title: "চেকআউটে মূল্য যাচাই", text: "ডেলিভারি তথ্য দিন। সার্ভার অর্ডারের আইটেম, মূল্য ও স্টক পুনরায় যাচাই করে।" },
    { icon: "🔎", title: "পেমেন্ট রিভিউ", text: "ম্যানুয়াল পেমেন্ট হলে Transaction ID জমা হয়; অনুমোদিত টিম পেমেন্ট যাচাই করে।" },
    { icon: "🚚", title: "অর্ডারের আপডেট দেখুন", text: "অর্ডার নিশ্চিত হওয়ার পর ট্র্যাকিং পেজে বর্তমান অবস্থা দেখতে পারবেন।" }
  ];
  const visual = document.getElementById("fdTourVisual");
  const count = document.getElementById("fdTourCount");
  const progress = document.getElementById("fdTourProgress");
  const title = document.getElementById("fdTourStepTitle");
  const copy = document.getElementById("fdTourStepText");
  const previous = document.getElementById("fdTourPrev");
  const next = document.getElementById("fdTourNext");
  let current = 0;
  let returnFocus = null;
  let previousBodyOverflow = "";

  function getFocusableElements() {
    return Array.from(dialog.querySelectorAll(
      'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'
    )).filter(element =>
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0
    );
  }

  function render() {
    const step = steps[current];
    visual.textContent = step.icon;
    count.textContent = String(current + 1).padStart(2, "0") + " / " + String(steps.length).padStart(2, "0");
    progress.style.width = ((current + 1) / steps.length * 100) + "%";
    title.textContent = step.title;
    copy.textContent = step.text;
    previous.disabled = current === 0;
    next.textContent = current === steps.length - 1 ? "শেষ করুন ✓" : "পরের ধাপ →";
  }

  function open() {
    if (!backdrop.hidden) return;
    returnFocus = document.activeElement;
    previousBodyOverflow = document.body.style.overflow;
    current = 0;
    render();
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    const closeButton = backdrop.querySelector("[data-tour-close]");
    closeButton.focus();
  }

  function close() {
    if (backdrop.hidden) return;
    backdrop.hidden = true;
    document.body.style.overflow = previousBodyOverflow;
    if (returnFocus && typeof returnFocus.focus === "function" && returnFocus.isConnected) {
      returnFocus.focus();
    }
    returnFocus = null;
  }

  document.querySelectorAll("[data-tour-open]").forEach(button => button.addEventListener("click", open));
  backdrop.querySelectorAll("[data-tour-close]").forEach(button => button.addEventListener("click", close));
  backdrop.addEventListener("click", event => {
    if (event.target === backdrop) close();
  });

  document.addEventListener("keydown", event => {
    if (backdrop.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = getFocusableElements();
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener("focusin", event => {
    if (backdrop.hidden || dialog.contains(event.target)) return;
    const focusable = getFocusableElements();
    (focusable[0] || dialog).focus();
  });

  previous.addEventListener("click", () => {
    if (current > 0) {
      current -= 1;
      render();
    }
  });
  next.addEventListener("click", () => {
    if (current === steps.length - 1) close();
    else {
      current += 1;
      render();
    }
  });
})();
