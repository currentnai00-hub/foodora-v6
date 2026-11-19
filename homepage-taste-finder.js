"use strict";
(() => {
  const root = document.getElementById("tasteFinder");
  if (!root) return;
  const status = root.querySelector("[data-taste-status]");
  const menu = document.getElementById("menu");

  function setSelect(id, value) {
    const control = document.getElementById(id);
    if (!control) return;
    control.value = value;
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function clearCurrentFilters() {
    const search = document.getElementById("search");
    if (search) { search.value = ""; search.dispatchEvent(new Event("input", { bubbles: true })); }
    setSelect("mealFilter", "all");
    setSelect("dietaryFilter", "all");
    setSelect("spiceFilter", "all");
    setSelect("sortMenu", "recommended");
    ["minPrice", "maxPrice"].forEach(id => {
      const field = document.getElementById(id);
      if (field) { field.value = ""; field.dispatchEvent(new Event("input", { bubbles: true })); }
    });
    const favorites = document.getElementById("favoritesToggle");
    if (favorites?.getAttribute("aria-pressed") === "true") favorites.click();
    const allCategory = document.querySelector('#categories [data-category="All"]');
    allCategory?.click();
  }

  function revealMenu(message) {
    if (status) status.textContent = message;
    menu?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  root.addEventListener("click", event => {
    const button = event.target.closest("[data-taste-preset]");
    if (!button || !root.contains(button)) return;
    const preset = button.dataset.tastePreset;
    clearCurrentFilters();

    if (preset === "mild") setSelect("spiceFilter", "mild");
    else if (preset === "hot") setSelect("spiceFilter", "hot");
    else if (preset === "breakfast") setSelect("mealFilter", "breakfast");
    else if (preset === "popular") setSelect("sortMenu", "popular");

    if (preset === "surprise") {
      const available = Array.from(document.querySelectorAll("#products .product"))
        .filter(card => !card.querySelector(".add:disabled"));
      if (!available.length) {
        revealMenu("মেনু লোড হচ্ছে বা এখন কোনো খাবার পাওয়া যাচ্ছে না—একটু পরে আবার চেষ্টা করুন।");
        return;
      }
      const selected = available[Math.floor(Math.random() * available.length)];
      selected.classList.add("fd-taste-highlight");
      revealMenu("আজকের সারপ্রাইজ বাছাই করা হয়েছে—দেখে নিন, পছন্দ হলে নিজেই কার্টে যোগ করুন।");
      window.setTimeout(() => selected.classList.remove("fd-taste-highlight"), 4500);
      return;
    }

    const visibleCount = document.querySelectorAll("#products .product").length;
    revealMenu(visibleCount
      ? "আপনার পছন্দ অনুযায়ী মেনু সাজানো হয়েছে—এবার দেখে নিন।"
      : "এই পছন্দে এখন কোনো আইটেম নেই। অন্য একটি অপশন চেষ্টা করুন।");
  });

  root.querySelector("[data-taste-reset]")?.addEventListener("click", () => {
    clearCurrentFilters();
    if (status) status.textContent = "সব ফিল্টার রিসেট করা হয়েছে। পুরো মেনু দেখুন।";
  });
})();
