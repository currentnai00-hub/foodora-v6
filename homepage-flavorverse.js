"use strict";
(() => {
  const root = document.getElementById("flavorverse");
  const menu = document.getElementById("products");
  if (!root || !menu) return;

  const steps = Array.from(root.querySelectorAll("[data-flavor-step]"));
  const progress = Array.from(root.querySelectorAll("[data-flavor-progress]"));
  const next = root.querySelector("[data-flavor-next]");
  const back = root.querySelector("[data-flavor-back]");
  const result = root.querySelector("[data-flavor-result]");
  const answers = { mood: "", flavor: "", appetite: "" };
  let selectedProductId = "";

  const personas = {
    spicy: {
      title: "The Firestarter 🔥",
      copy: "তুমি সাহসী স্বাদের মানুষ। পরিচিতির বাইরে গিয়ে একটু bold কিছু খুঁজে নিতে ভালোবাসো।"
    },
    savory: {
      title: "The Flavor Architect 🍔",
      copy: "তুমি স্বাদের balance আর satisfying bite পছন্দ করো—প্রতিটি পছন্দে নিজের একটা signature আছে।"
    },
    sweet: {
      title: "The Sweet Alchemist 🍰",
      copy: "তোমার পছন্দে আছে মিষ্টি আনন্দ আর ছোট ছোট delightful মুহূর্ত।"
    }
  };

  function currentStep() {
    return steps.findIndex(step => !step.hidden);
  }

  function setStep(index) {
    steps.forEach((step, i) => { step.hidden = i !== index; });
    progress.forEach((item, i) => {
      item.classList.toggle("is-active", i <= index);
      item.classList.toggle("is-current", i === index);
    });
    back.hidden = index === 0;
    next.hidden = false;
    next.disabled = !answers[steps[index].querySelector("[data-flavor-group]")?.dataset.flavorGroup];
    next.innerHTML = index === steps.length - 1 ? "আমার Flavor Identity দেখাও <span>✦</span>" : "পরের ধাপ <span>→</span>";
    steps[index].querySelector("[aria-pressed='true']")?.focus({ preventScroll: true });
  }

  function availableProducts() {
    return Array.from(menu.querySelectorAll(".product")).filter(card => {
      const add = card.querySelector(".add");
      const title = card.querySelector(".product-name-link");
      return add && title && add.dataset.add && !add.disabled;
    });
  }

  function scoreProduct(card) {
    const content = (card.querySelector(".productInfo")?.textContent || card.textContent || "").toLowerCase();
    const keywordSets = {
      spicy: ["ঝাল", "spicy", "hot"],
      savory: ["burger", "pizza", "বিরিয়ানি", "biryani", "চিকেন", "chicken", "স্যান্ডউইচ", "sandwich", "ভাত", "rice", "পাস্তা", "pasta"],
      sweet: ["মিষ্টি", "sweet", "dessert", "cake", "কেক", "চকলেট", "chocolate", "ice cream", "আইসক্রিম"],
      light: ["সালাদ", "salad", "সুপ", "soup", "হালকা", "light", "vegetarian", "নিরামিষ"],
      hearty: ["বিরিয়ানি", "biryani", "burger", "pizza", "ভাত", "rice", "চিকেন", "chicken", "পাস্তা", "pasta"]
    };
    let score = 0;
    (keywordSets[answers.flavor] || []).forEach(word => { if (content.includes(word)) score += 3; });
    (keywordSets[answers.appetite] || []).forEach(word => { if (content.includes(word)) score += 2; });
    if (answers.flavor === "spicy" && content.includes("কম ঝাল")) score -= 2;
    if (answers.flavor === "sweet" && content.includes("ঝাল")) score -= 1;
    return score;
  }

  function chooseProduct() {
    const candidates = availableProducts();
    if (!candidates.length) return null;
    const ranked = candidates.map(card => ({ card, score: scoreProduct(card) }));
    const bestScore = Math.max(...ranked.map(item => item.score));
    const pool = bestScore > 0 ? ranked.filter(item => item.score === bestScore) : ranked;
    return pool[Math.floor(Math.random() * pool.length)].card;
  }

  function finish() {
    const persona = personas[answers.flavor] || personas.savory;
    root.querySelector("[data-flavor-persona]").textContent = persona.title;
    const moodCopy = {
      comfort: "Comfort Mode তোমার আজকের mood-কে আরও আপন করে তুলেছে।",
      explore: "Explore Mode বলছে—নতুন স্বাদের দরজা খোলা থাকুক।",
      celebrate: "Celebration Mode—আজকের খাবার হোক তোমার ছোট্ট উদযাপন।"
    };
    const appetiteCopy = {
      light: "হালকা কিছু খুঁজছো।",
      hearty: "আজ পেটভরে খাওয়ার mood।",
      any: "আজ surprise-ই তোমার plan।"
    };
    root.querySelector("[data-flavor-copy]").textContent = persona.copy + " " + (moodCopy[answers.mood] || "") + " " + (appetiteCopy[answers.appetite] || "");
    const card = chooseProduct();
    const match = root.querySelector("[data-flavor-match]");
    const status = root.querySelector("[data-flavor-status]");
    selectedProductId = "";

    if (card) {
      const add = card.querySelector(".add");
      const title = card.querySelector(".product-name-link");
      const image = card.querySelector(".productPhoto img");
      const price = card.querySelector(".price");
      selectedProductId = String(add.dataset.add);
      root.querySelector("[data-flavor-product]").textContent = title.textContent.trim();
      root.querySelector("[data-flavor-price]").textContent = price?.textContent.trim() || "";
      root.querySelector("[data-flavor-image]").src = image?.currentSrc || image?.src || "";
      root.querySelector("[data-flavor-image]").alt = title.textContent.trim();
      root.querySelector("[data-flavor-link]").href = title.href;
      root.querySelector("[data-flavor-add]").disabled = typeof window.addToCart !== "function";
      match.hidden = false;
      status.textContent = "এটি তোমার উত্তরের ভিত্তিতে মেনু থেকে বাছাই করা একটি suggestion—চূড়ান্ত পছন্দ তোমার।";
    } else {
      match.hidden = true;
      status.textContent = "তোমার Flavor Identity তৈরি হয়েছে। মেনু লোড হলে আবার খাবারের suggestion দেখতে পারবে।";
    }

    steps.forEach(step => { step.hidden = true; });
    progress.forEach(item => item.classList.add("is-active"));
    next.hidden = true;
    back.hidden = true;
    result.hidden = false;
    result.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  }

  root.addEventListener("click", event => {
    const option = event.target.closest("[data-flavor-group]");
    if (option && root.contains(option)) {
      const group = option.dataset.flavorGroup;
      if (!Object.prototype.hasOwnProperty.call(answers, group)) return;
      answers[group] = option.dataset.flavorValue || "";
      root.querySelectorAll('[data-flavor-group="' + group + '"]').forEach(button => {
        const selected = button === option;
        button.setAttribute("aria-pressed", String(selected));
        button.classList.toggle("is-selected", selected);
      });
      next.disabled = !answers[group];
      return;
    }

    if (event.target.closest("[data-flavor-next]")) {
      const index = currentStep();
      const group = steps[index]?.querySelector("[data-flavor-group]")?.dataset.flavorGroup;
      if (!group || !answers[group]) return;
      if (index === steps.length - 1) finish();
      else setStep(index + 1);
      return;
    }

    if (event.target.closest("[data-flavor-back]")) {
      const index = currentStep();
      if (index > 0) setStep(index - 1);
      return;
    }

    if (event.target.closest("[data-flavor-restart]")) {
      Object.keys(answers).forEach(key => { answers[key] = ""; });
      root.querySelectorAll("[data-flavor-group]").forEach(button => {
        button.setAttribute("aria-pressed", "false");
        button.classList.remove("is-selected");
      });
      result.hidden = true;
      selectedProductId = "";
      setStep(0);
      root.querySelector("[data-flavor-step='0']")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (event.target.closest("[data-flavor-add]")) {
      if (!selectedProductId || typeof window.addToCart !== "function") {
        root.querySelector("[data-flavor-status]").textContent = "কার্ট এখন প্রস্তুত নয়। মেনু থেকে খাবারটি বেছে নিতে পারো।";
        return;
      }
      const count = document.getElementById("cartCount");
      const before = Number(count?.textContent || 0);
      window.addToCart(selectedProductId);
      const after = Number(count?.textContent || 0);
      root.querySelector("[data-flavor-status]").textContent = after > before
        ? "খাবারটি কার্টে যোগ হয়েছে—অর্ডার করবে কি না, সিদ্ধান্ত তোমার।"
        : "এই খাবারটি কার্টে যোগ করা যায়নি। মেনুতে স্টক ও কার্টের অবস্থা দেখে নাও।";
    }
  });

  setStep(0);
})();
