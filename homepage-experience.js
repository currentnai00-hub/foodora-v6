"use strict";
(() => {
  const backdrop = document.getElementById("fdTour");
  if (!backdrop) return;
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
    returnFocus = document.activeElement;
    current = 0;
    render();
    backdrop.hidden = false;
    document.body.style.overflow = "hidden";
    backdrop.querySelector("[data-tour-close]").focus();
  }
  function close() {
    backdrop.hidden = true;
    document.body.style.overflow = "";
    if (returnFocus && typeof returnFocus.focus === "function") returnFocus.focus();
  }
  document.querySelectorAll("[data-tour-open]").forEach(button => button.addEventListener("click", open));
  backdrop.querySelectorAll("[data-tour-close]").forEach(button => button.addEventListener("click", close));
  backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
  document.addEventListener("keydown", event => {
    if (!backdrop.hidden && event.key === "Escape") close();
  });
  previous.addEventListener("click", () => { if (current > 0) { current -= 1; render(); } });
  next.addEventListener("click", () => {
    if (current === steps.length - 1) close();
    else { current += 1; render(); }
  });
})();
