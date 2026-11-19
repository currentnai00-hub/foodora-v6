"use strict";
(() => {
  const section = document.getElementById("fdMysteryBox");
  const grid = document.getElementById("products");
  if (!section || !grid) return;

  const revealButton = section.querySelector("[data-mystery-reveal]");
  const result = section.querySelector("[data-mystery-result]");
  const image = section.querySelector("[data-mystery-image]");
  const category = section.querySelector("[data-mystery-category]");
  const name = section.querySelector("[data-mystery-name]");
  const description = section.querySelector("[data-mystery-description]");
  const price = section.querySelector("[data-mystery-price]");
  const details = section.querySelector("[data-mystery-details]");
  const addButton = section.querySelector("[data-mystery-add]");
  const status = section.querySelector("[data-mystery-status]");
  let lastProductId = "";

  function availableProducts() {
    return Array.from(grid.querySelectorAll(".product")).filter(card => {
      const add = card.querySelector(".add");
      const title = card.querySelector(".product-name-link");
      return add && title && add.dataset.add && !add.disabled;
    });
  }

  function reveal() {
    const candidates = availableProducts();
    if (!candidates.length) {
      status.textContent = "মেনু এখনো প্রস্তুত হচ্ছে, অথবা সব খাবার সাময়িকভাবে অনুপলব্ধ। একটু পরে আবার চেষ্টা করুন।";
      return;
    }

    const freshCandidates = candidates.filter(card =>
      String(card.querySelector(".add").dataset.add) !== lastProductId
    );
    const pool = freshCandidates.length ? freshCandidates : candidates;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    const add = selected.querySelector(".add");
    const title = selected.querySelector(".product-name-link");
    const photo = selected.querySelector(".productPhoto img");
    const copy = selected.querySelector(".productInfo > p");
    const tag = selected.querySelector(".productInfo .tag");
    const amount = selected.querySelector(".v8-price .price");
    const id = String(add.dataset.add);

    lastProductId = id;
    name.textContent = title.textContent.trim();
    description.textContent = copy?.textContent.trim() || "এই খাবারটি Foodora মেনু থেকে বেছে নেওয়া হয়েছে।";
    category.textContent = tag?.textContent.trim() || "আজকের রহস্য";
    price.textContent = amount?.textContent.trim() || "";
    details.href = title.href;
    image.src = photo?.currentSrc || photo?.src || "";
    image.alt = title.textContent.trim();
    addButton.dataset.productId = id;
    addButton.disabled = typeof window.addToCart !== "function";
    result.hidden = false;
    status.textContent = "রহস্য উন্মোচিত! চাইলে বিস্তারিত দেখুন অথবা নিজে কার্টে যোগ করুন।";
    result.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }

  revealButton.addEventListener("click", reveal);
  addButton.addEventListener("click", () => {
    const id = addButton.dataset.productId;
    if (!id || typeof window.addToCart !== "function") {
      status.textContent = "কার্ট ফিচারটি এই মুহূর্তে প্রস্তুত নয়।";
      return;
    }

    const currentCard = Array.from(grid.querySelectorAll(".product")).find(card => {
      const currentAdd = card.querySelector(".add");
      return currentAdd && String(currentAdd.dataset.add) === id;
    });
    if (!currentCard || currentCard.querySelector(".add").disabled) {
      status.textContent = "এই খাবারটি এখন আর অর্ডারের জন্য উপলব্ধ নয়। নতুন রহস্য খুলে দেখুন।";
      addButton.disabled = true;
      return;
    }

    const count = document.getElementById("cartCount");
    const before = Number(count?.textContent || 0);
    window.addToCart(id);
    const after = Number(count?.textContent || 0);
    status.textContent = after > before
      ? "খাবারটি আপনার কার্টে যোগ হয়েছে। চাইলে আরও একবার রহস্য খুলুন!"
      : "খাবারটি কার্টে যোগ করা যায়নি। স্টক ও কার্টের অবস্থা যাচাই করে আবার চেষ্টা করুন।";
  });

  const observer = new MutationObserver(() => {
    if (result.hidden) revealButton.disabled = availableProducts().length === 0;
  });
  observer.observe(grid, { childList: true, subtree: true });
  revealButton.disabled = availableProducts().length === 0;
})();
