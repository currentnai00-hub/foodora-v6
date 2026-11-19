(() => {
  "use strict";
  const SUPPORT_NUMBER = "8801883020407";
  const $ = (id) => document.getElementById(id);
  const norm = (value) => String(value || "").toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
  const money = (value) => "৳" + Number(value || 0).toLocaleString("en-BD");
  const state = { products: [], config: null, offers: [] };
  const waUrl = (message) => "https://wa.me/" + SUPPORT_NUMBER + "?text=" + encodeURIComponent(message);
  const logo = '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 28c-7 0-11-5-9-11 1-5 6-8 11-7 2-7 11-10 17-5 3 2 4 5 4 8 7-2 14 3 14 10 0 6-5 10-11 10H18Z" fill="currentColor"/><path d="M22 34h22l-3 17H25l-3-17Zm-4 0h30M28 52v5m10-5v5" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const addMessage = (text, who, html = false) => {
    const list = $("foodoraChatMessages");
    const item = document.createElement("div");
    item.className = "foodora-chat-message " + (who === "user" ? "is-user" : "is-bot");
    if (html) item.innerHTML = text;
    else item.textContent = text;
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
  };
  const link = (href, label, className = "") => '<a class="' + className + '" href="' + href + '">' + label + '</a>';
  const whatsappLink = (message, label = "WhatsApp Support-এ যোগাযোগ করুন") =>
    link(waUrl(message), label, "foodora-chat-wa-link");
  const fallback = (reason, english = false) => {
    const msg = english
      ? "This needs confirmation from our support team. Please contact Foodora on WhatsApp."
      : "এই বিষয়টি নিশ্চিত করে জানাতে আমাদের সাপোর্ট টিমের সাহায্য প্রয়োজন। অনুগ্রহ করে WhatsApp Support-এ যোগাযোগ করুন।";
    return msg + "<br>" + whatsappLink("Hello Foodora Support, I need help with: " + reason);
  };
  const answer = (raw) => {
    const q = norm(raw);
    const en = /^[\x00-\x7F]*$/.test(raw) && /[a-z]/i.test(raw);
    if (!q) return en ? "Please type your question." : "আপনার প্রশ্নটি লিখুন।";
    const urgent = /(refund|ফেরত|রিফান্ড|টাকা ফেরত|payment problem|পেমেন্ট সমস্যা|টাকা কাটা|টাকা কেটে|transaction|ট্রানজেকশন|trx|cancel|বাতিল|অভিযোগ|complaint|ভুল অর্ডার|wrong order|missing item|আইটেম নেই|নষ্ট|spoiled|অ্যালার্জি|allergy|food safety|নিরাপত্তা)/i.test(q);
    if (urgent) return fallback(raw, en);
    if (/(track|tracking|অর্ডার.*(কোথায়|অবস্থা|ট্র্যাক)|ট্র্যাকিং|order status|আমার অর্ডার)/i.test(q)) {
      return (en ? "You can check your order status on our tracking page. For an order-specific issue, please contact WhatsApp Support." : "আপনার অর্ডারের অবস্থা Order Tracking পেজে দেখতে পারবেন। অর্ডার-সংক্রান্ত নির্দিষ্ট সমস্যা হলে WhatsApp Support-এ যোগাযোগ করুন।") +
        "<br>" + link("/track", en ? "Open Order Tracking" : "অর্ডার ট্র্যাক করুন", "foodora-chat-inline-link") +
        "<br>" + whatsappLink("Hello Foodora Support, I need help with my order.");
    }
    if (/(delivery area|কোথায় ডেলিভারি|কোন এলাকায়|ডেলিভারি এলাকা|এলাকায় ডেলিভারি)/i.test(q)) {
      const areas = state.config?.areas?.map(x => x.name).filter(Boolean) || [];
      return areas.length
        ? (en ? "Current delivery areas: " : "বর্তমানে ডেলিভারি চালু আছে: ") + areas.join(", ") + (en ? ". Please confirm availability at checkout." : "। চেকআউটে আপনার এলাকা নির্বাচন করে নিশ্চিত করুন।")
        : fallback(raw, en);
    }
    if (/(delivery charge|delivery fee|ডেলিভারি চার্জ|ডেলিভারি ফি|ফ্রি ডেলিভারি)/i.test(q)) {
      if (!state.config) return fallback(raw, en);
      const fee = money(state.config.deliveryFee), threshold = money(state.config.freeDeliveryFrom);
      return en
        ? "Delivery fee is " + fee + ". Orders of " + threshold + " or more qualify for free delivery (subject to checkout confirmation)."
        : "ডেলিভারি চার্জ " + fee + "। " + threshold + " বা তার বেশি অর্ডারে ফ্রি ডেলিভারি প্রযোজ্য (চেকআউটে চূড়ান্ত তথ্য দেখুন)।";
    }
    if (/(payment|পেমেন্ট|কিভাবে টাকা|ক্যাশ অন|bkash|বিকাশ|nagad|নগদ|wallet)/i.test(q)) {
      const methods = state.config?.paymentMethods || [];
      return methods.length
        ? (en ? "Available payment methods: " : "বর্তমানে পেমেন্ট পদ্ধতি: ") + methods.join(", ") + (en ? ". Choose one at checkout. For payment verification or disputes, contact WhatsApp Support." : "। চেকআউটে পদ্ধতি নির্বাচন করুন। পেমেন্ট যাচাই বা সমস্যা হলে WhatsApp Support-এ যোগাযোগ করুন।") +
          "<br>" + whatsappLink("Hello Foodora Support, I need help with payment.")
        : fallback(raw, en);
    }
    if (/(offer|coupon|discount|কুপন|অফার|ছাড়|ডিসকাউন্ট)/i.test(q)) {
      if (!state.offers.length) return en ? "There are no active coupons listed right now. Please check the Offers section." : "এই মুহূর্তে কোনো সক্রিয় কুপন পাওয়া যাচ্ছে না। ওয়েবসাইটের অফার সেকশন দেখুন।";
      return (en ? "Currently listed offers: " : "বর্তমানে চালু অফার: ") + state.offers.map(o => o.code + " (" + (o.type === "percent" ? o.value + "% off" : money(o.value) + " off") + ", minimum " + money(o.minOrder) + ")").join("; ") + (en ? ". Terms are checked at checkout." : "। কুপনের শর্ত চেকআউটে যাচাই হবে।");
    }
    if (/(menu|food|খাবার|মেনু|price|দাম|কত টাকা)/i.test(q)) {
      const matches = state.products.filter(p => norm(p.name).includes(q) || q.includes(norm(p.name)) || norm(p.category).includes(q));
      if (matches.length) return matches.slice(0, 5).map(p => p.name + " — " + money(p.price) + (p.stock > 0 ? "" : (en ? " (currently unavailable)" : " (এখন পাওয়া যাচ্ছে না)"))).join("<br>");
      return en ? "Please browse our live menu for current items and prices." : "বর্তমান খাবার ও দাম দেখতে ওয়েবসাইটের মেনু দেখুন।";
    }
    if (/(order|অর্ডার).*(how|কিভাবে|করব|করবো)|কিভাবে.*অর্ডার|অর্ডার করতে/i.test(q)) {
      return en ? "Choose items from the menu, add them to your cart, then complete checkout with your delivery details and payment method." : "মেনু থেকে খাবার বেছে কার্টে যোগ করুন। এরপর চেকআউটে নাম, ফোন, ডেলিভারি এলাকা, ঠিকানা ও পেমেন্ট পদ্ধতি দিয়ে অর্ডার নিশ্চিত করুন।";
    }
    if (/(hello|hi|hey|হ্যালো|আসসালামু|সালাম|নমস্কার)/i.test(q)) {
      return en ? "Hello! Welcome to Foodora. Ask me about our menu, delivery, payment or order tracking." : "স্বাগতম Foodora-তে! মেনু, ডেলিভারি, পেমেন্ট অথবা অর্ডার ট্র্যাকিং সম্পর্কে প্রশ্ন করতে পারেন।";
    }
    return fallback(raw, en);
  };
  const send = () => {
    const input = $("foodoraChatInput");
    const value = input.value.trim();
    if (!value) return;
    addMessage(value, "user");
    input.value = "";
    addMessage(answer(value), "bot", true);
  };
  const init = async () => {
    const root = document.createElement("div");
    root.id = "foodoraSupportWidget";
    root.innerHTML = '<button id="foodoraChatLauncher" class="foodora-chat-launcher" type="button" aria-label="Open Foodora support chat"><span class="foodora-logo-mark">' + logo + '</span><span class="foodora-launcher-label"><strong>Foodora</strong><small>সাপোর্ট</small></span></button><section id="foodoraChatPanel" class="foodora-chat-panel" aria-label="Foodora customer support" hidden><header id="foodoraChatDragHandle" class="foodora-chat-header"><div class="foodora-chat-brand"><span class="foodora-chat-logo">' + logo + '</span><div><strong>Foodora</strong><small>Customer Support · <i></i> Online</small></div></div><div class="foodora-chat-actions"><button id="foodoraChatMinimize" type="button" aria-label="Minimize chat">−</button><button id="foodoraChatClose" type="button" aria-label="Close chat">×</button></div></header><div id="foodoraChatMessages" class="foodora-chat-messages" aria-live="polite"></div><div class="foodora-chat-quick"><button type="button" data-question="ডেলিভারি চার্জ কত?">ডেলিভারি চার্জ</button><button type="button" data-question="কোন কোন এলাকায় ডেলিভারি হয়?">ডেলিভারি এলাকা</button><button type="button" data-question="কীভাবে অর্ডার করব?">অর্ডার করার নিয়ম</button><button type="button" data-question="আমার অর্ডার ট্র্যাক করতে চাই">অর্ডার ট্র্যাক</button></div><form id="foodoraChatForm" class="foodora-chat-form"><input id="foodoraChatInput" maxlength="500" autocomplete="off" placeholder="আপনার প্রশ্ন লিখুন..." aria-label="Your question"><button type="submit">পাঠান</button></form><a class="foodora-chat-whatsapp" href="' + waUrl("Hello Foodora Support, I need assistance.") + '" target="_blank" rel="noopener noreferrer">WhatsApp Support ↗</a></section>';
    document.body.appendChild(root);
    const launcher = $("foodoraChatLauncher");
    let launcherDragged = false;
    try {
      const savedLauncher = JSON.parse(localStorage.getItem("foodoraSupportLauncherPosition") || "null");
      if (savedLauncher && Number.isFinite(savedLauncher.left) && Number.isFinite(savedLauncher.top)) {
        launcher.style.left = Math.max(8, Math.min(savedLauncher.left, innerWidth - launcher.offsetWidth - 8)) + "px";
        launcher.style.top = Math.max(8, Math.min(savedLauncher.top, innerHeight - launcher.offsetHeight - 8)) + "px";
        launcher.style.right = "auto"; launcher.style.bottom = "auto";
      }
    } catch (_) {}
    launcher.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const rect = launcher.getBoundingClientRect();
      const startX = event.clientX, startY = event.clientY;
      const originX = rect.left, originY = rect.top;
      let moved = false;
      launcher.setPointerCapture(event.pointerId);
      const move = (e) => {
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (!moved && Math.hypot(dx, dy) < 7) return;
        moved = true; launcherDragged = true;
        const left = Math.max(8, Math.min(originX + dx, innerWidth - launcher.offsetWidth - 8));
        const top = Math.max(8, Math.min(originY + dy, innerHeight - launcher.offsetHeight - 8));
        launcher.style.left = left + "px"; launcher.style.top = top + "px";
        launcher.style.right = "auto"; launcher.style.bottom = "auto";
      };
      const stop = () => {
        launcher.removeEventListener("pointermove", move);
        launcher.removeEventListener("pointerup", stop);
        launcher.removeEventListener("pointercancel", stop);
        if (moved) {
          try { localStorage.setItem("foodoraSupportLauncherPosition", JSON.stringify({left: launcher.offsetLeft, top: launcher.offsetTop})); } catch (_) {}
          setTimeout(() => { launcherDragged = false; }, 0);
        }
      };
      launcher.addEventListener("pointermove", move);
      launcher.addEventListener("pointerup", stop, { once: true });
      launcher.addEventListener("pointercancel", stop, { once: true });
    });
    $("foodoraChatLauncher").addEventListener("click", () => {
      $("foodoraChatPanel").hidden = false;
      $("foodoraChatLauncher").hidden = true;
      restorePosition();
      $("foodoraChatInput").focus();
      if (!$("foodoraChatMessages").children.length) addMessage("স্বাগতম Foodora-তে! আমি আপনার সাধারণ প্রশ্নে সাহায্য করতে পারি। গুরুত্বপূর্ণ বা অর্ডার-সংক্রান্ত সমস্যায় WhatsApp Support-এ যোগাযোগ করুন।", "bot");
    });
    const panel = $("foodoraChatPanel");
    const dragHandle = $("foodoraChatDragHandle");
    const restorePosition = () => {
      try {
        const saved = JSON.parse(localStorage.getItem("foodoraSupportPosition") || "null");
        if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
          panel.style.left = Math.max(8, Math.min(saved.left, innerWidth - panel.offsetWidth - 8)) + "px";
          panel.style.top = Math.max(8, Math.min(saved.top, innerHeight - panel.offsetHeight - 8)) + "px";
          panel.style.right = "auto"; panel.style.bottom = "auto";
        }
      } catch (_) {}
    };
    dragHandle.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      const rect = panel.getBoundingClientRect();
      const startX = event.clientX, startY = event.clientY;
      const originX = rect.left, originY = rect.top;
      dragHandle.setPointerCapture(event.pointerId);
      const move = (e) => {
        const left = Math.max(8, Math.min(originX + e.clientX - startX, innerWidth - panel.offsetWidth - 8));
        const top = Math.max(8, Math.min(originY + e.clientY - startY, innerHeight - panel.offsetHeight - 8));
        panel.style.left = left + "px"; panel.style.top = top + "px";
        panel.style.right = "auto"; panel.style.bottom = "auto";
      };
      const stop = () => {
        dragHandle.removeEventListener("pointermove", move);
        dragHandle.removeEventListener("pointerup", stop);
        try { localStorage.setItem("foodoraSupportPosition", JSON.stringify({left: panel.offsetLeft, top: panel.offsetTop})); } catch (_) {}
      };
      dragHandle.addEventListener("pointermove", move);
      dragHandle.addEventListener("pointerup", stop, { once: true });
    });
    $("foodoraChatMinimize").addEventListener("click", () => {
      panel.hidden = true; $("foodoraChatLauncher").hidden = false;
    });
    $("foodoraChatClose").addEventListener("click", () => {
      panel.hidden = true; $("foodoraChatLauncher").hidden = false;
    });
    $("foodoraChatForm").addEventListener("submit", (event) => { event.preventDefault(); send(); });
    root.addEventListener("click", (event) => {
      const button = event.target.closest("[data-question]");
      if (button) { $("foodoraChatInput").value = button.dataset.question; send(); }
    });
    try {
      const [config, products, offers] = await Promise.all([
        fetch("/api/config").then(r => r.ok ? r.json() : null),
        fetch("/api/products").then(r => r.ok ? r.json() : []),
        fetch("/api/offers").then(r => r.ok ? r.json() : {offers:[]})
      ]);
      state.config = config;
      state.products = Array.isArray(products) ? products : [];
      state.offers = Array.isArray(offers?.offers) ? offers.offers : [];
    } catch (_) { /* Static help and WhatsApp escalation remain available. */ }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();