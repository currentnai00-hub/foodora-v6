"use strict";
(() => {
  const grid = document.getElementById("products");
  if (!grid) return;

  let activeCard = null;
  let returnFocus = null;
  let previousOverflow = "";

  const modal = document.createElement("div");
  modal.className = "fd-quick-view-backdrop";
  modal.hidden = true;
  modal.innerHTML = `
    <section class="fd-quick-view" role="dialog" aria-modal="true" aria-labelledby="fdQuickViewTitle" aria-describedby="fdQuickViewDescription" tabindex="-1">
      <button type="button" class="fd-quick-view-close" aria-label="দ্রুত দেখুন বন্ধ করুন">×</button>
      <div class="fd-quick-view-layout">
        <div class="fd-quick-view-image-wrap"><img class="fd-quick-view-image" alt=""></div>
        <div class="fd-quick-view-copy">
          <p class="fd-quick-view-kicker">FOODORA · QUICK VIEW</p>
          <p class="fd-quick-view-category"></p>
          <h2 id="fdQuickViewTitle"></h2>
          <p class="fd-quick-view-description" id="fdQuickViewDescription"></p>
          <div class="fd-quick-view-meta"><strong class="fd-quick-view-price"></strong><span class="fd-quick-view-stock"></span></div>
          <button type="button" class="fd-quick-view-add">কার্টে যোগ করুন</button>
          <a class="fd-quick-view-details">সম্পূর্ণ বিস্তারিত দেখুন ↗</a>
        </div>
      </div>
    </section>`;
  document.body.appendChild(modal);

  const dialog = modal.querySelector('[role="dialog"]');
  const closeButton = modal.querySelector(".fd-quick-view-close");
  const addButton = modal.querySelector(".fd-quick-view-add");

  function addTriggers() {
    grid.querySelectorAll(".product").forEach(card => {
      const bottom = card.querySelector(".productBottom");
      if (!bottom || bottom.querySelector("[data-quick-view]")) return;
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "fd-quick-view-trigger";
      trigger.dataset.quickView = "true";
      trigger.textContent = "দ্রুত দেখুন";
      trigger.setAttribute("aria-label", "দ্রুত দেখুন: " + (card.querySelector(".product-name-link")?.textContent || "খাবার"));
      bottom.insertBefore(trigger, bottom.querySelector(".add"));
    });
  }

  function open(card, trigger) {
    const image = card.querySelector(".productPhoto img");
    const name = card.querySelector(".product-name-link");
    const description = card.querySelector(".productInfo > p");
    const category = card.querySelector(".productInfo .tag");
    const price = card.querySelector(".v8-price .price");
    const originalAdd = card.querySelector(".add");
    if (!name || !originalAdd) return;

    activeCard = card;
    returnFocus = trigger;
    previousOverflow = document.body.style.overflow;
    modal.querySelector(".fd-quick-view-image").src = image?.src || "";
    modal.querySelector(".fd-quick-view-image").alt = image?.alt || name.textContent.trim();
    modal.querySelector(".fd-quick-view-category").textContent = category?.textContent || "Foodora menu";
    modal.querySelector("#fdQuickViewTitle").textContent = name.textContent.trim();
    modal.querySelector("#fdQuickViewDescription").textContent = description?.textContent.trim() || "এই খাবারটি সম্পর্কে আরও জানতে বিস্তারিত পেজ দেখুন।";
    modal.querySelector(".fd-quick-view-price").textContent = price?.textContent || "";
    modal.querySelector(".fd-quick-view-stock").textContent = originalAdd.disabled ? "স্টক শেষ" : "অর্ডারের জন্য উপলব্ধ";
    modal.querySelector(".fd-quick-view-details").href = name.href;
    addButton.disabled = originalAdd.disabled;
    addButton.textContent = originalAdd.disabled ? "স্টক শেষ" : "কার্টে যোগ করুন";
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    closeButton.focus();
  }

  function close() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.style.overflow = previousOverflow;
    activeCard = null;
    if (returnFocus?.isConnected) returnFocus.focus();
    returnFocus = null;
  }

  grid.addEventListener("click", event => {
    const trigger = event.target.closest("[data-quick-view]");
    if (!trigger) return;
    const card = trigger.closest(".product");
    if (card) open(card, trigger);
  });

  addButton.addEventListener("click", () => {
    if (!activeCard) return;
    const id = activeCard.querySelector("[data-add]")?.dataset.add;
    const currentCard = Array.from(grid.querySelectorAll(".product")).find(card =>
      card.querySelector("[data-add]")?.dataset.add === id
    );
    const currentAdd = currentCard?.querySelector(".add");
    if (currentAdd && !currentAdd.disabled) currentAdd.click();
    close();
  });

  closeButton.addEventListener("click", close);
  modal.addEventListener("click", event => {
    if (event.target === modal) close();
  });
  document.addEventListener("keydown", event => {
    if (modal.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") {
      const focusable = [closeButton, addButton, modal.querySelector(".fd-quick-view-details")].filter(el => !el.disabled);
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
        event.preventDefault();
        focusable[0].focus();
      }
    }
  });

  addTriggers();
  const observer = new MutationObserver(addTriggers);
  observer.observe(grid, {childList:true,subtree:true});
})();
