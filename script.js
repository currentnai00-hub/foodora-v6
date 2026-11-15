"use strict";

/* =========================================
   FOODORA V6 — CUSTOMER WEBSITE
   Cart, Coupon, Search, Stock, Checkout
   bKash / Nagad Copy Number + COD
========================================= */

let products = [];
let cart = [];
let category = "All";
let favorites = new Set();
let favoritesOnly = false;
let sortMode = "recommended";
let dietaryFilter = "all";
let mealFilter = "all";
let spiceFilter = "all";
let minPriceFilter = 0;
let maxPriceFilter = Infinity;

let config = {
  paymentNumbers: {
    bKash: "01XXXXXXXXX",
    Nagad: "01XXXXXXXXX"
  },
  paymentMethods: ["bKash", "Nagad"],
  deliveryFee: 70,
  freeDeliveryFrom: 999,
  areas: []
};

let appliedCoupon = null;

const $ = id => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function money(value) {
  return "৳" + Number(value || 0).toLocaleString("en-BD");
}

function isCOD(method) {
  return String(method || "").trim().toLowerCase() ===
    "cash on delivery";
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Something went wrong");
  }

  return data;
}

/* =========================================
   CART STORAGE
========================================= */

function saveCart() {
  try {
    localStorage.setItem("foodora_cart", JSON.stringify(cart));
  } catch (_) {}
}

function subtotal() {
  return cart.reduce(
    (sum, p) => sum + Number(p.price) * p.qty,
    0
  );
}

function discount() {
  return Math.min(
    subtotal(),
    Number(appliedCoupon?.discount || 0)
  );
}

function delivery() {
  return subtotal() - discount() >= config.freeDeliveryFrom
    ? 0
    : config.deliveryFee;
}

function total() {
  return subtotal() - discount() + delivery();
}

function updateDeliveryProgress() {
  const panel = $("deliveryProgress");
  if (!panel) return;
  if (!cart.length || Number(config.freeDeliveryFrom) <= 0) { panel.hidden = true; panel.innerHTML = ""; return; }
  const threshold = Math.max(0, Number(config.freeDeliveryFrom) || 0);
  const eligibleAmount = Math.max(0, subtotal() - discount());
  const remaining = Math.max(0, threshold - eligibleAmount);
  const progress = Math.min(100, (eligibleAmount / threshold) * 100);
  panel.hidden = false;
  panel.innerHTML = remaining > 0
    ? `<div class="delivery-progress-copy"><span>আর <strong>${money(remaining)}</strong> যোগ করলেই ডেলিভারি ফ্রি!</span><b>${Math.round(progress)}%</b></div><div class="delivery-progress-track" role="progressbar" aria-label="ফ্রি ডেলিভারির অগ্রগতি" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><span style="width:${progress}%"></span></div>`
    : `<div class="delivery-progress-success">✓ অভিনন্দন! আপনার ডেলিভারি চার্জ ফ্রি।</div><div class="delivery-progress-track is-complete" role="progressbar" aria-label="ফ্রি ডেলিভারি অর্জিত" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span style="width:100%"></span></div>`;
}

/* =========================================
   PAYMENT METHODS
========================================= */

function paymentGuideUrl(method) {
  const params = new URLSearchParams({method, amount:String(total())});
  return "/payment-guide.html?" + params.toString();
}
function canonicalPaymentMethod(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "bkash") return "bKash";
  if (normalized === "nagad") return "Nagad";
  return String(value || "").trim();
}
function handlePaymentMethodChange() {
  const method = canonicalPaymentMethod($("paymentMethod")?.value);
  if (["bKash","Nagad"].includes(method)) {
    try {
      sessionStorage.setItem("foodora_payment_method",method);
      sessionStorage.setItem("foodora_checkout_coupon",JSON.stringify(appliedCoupon || null));
    } catch (_) {}
    window.location.assign(paymentGuideUrl(method));
    return;
  }
  updatePaymentHelp();
}
function updatePaymentHelp() {
  const methodInput = $("paymentMethod");
  const help = $("paymentHelp");
  const copyButton = $("copyPaymentNumber");

  if (!methodInput || !help) return;

  const method = methodInput.value;

  if (copyButton) {
    copyButton.style.display = "none";
    copyButton.dataset.number = "";
  }

  if (isCOD(method)) {
    help.textContent =
      "ক্যাশ অন ডেলিভারি: খাবার পৌঁছালে নগদ টাকা পরিশোধ করুন।";
    return;
  }

  const key = method.toLowerCase() === "bkash"
    ? "bKash"
    : method;

  const number = String(
    config.paymentNumbers?.[key] || ""
  ).trim();

  if (!number || number === "01XXXXXXXXX") {
    help.textContent =
      method + " নম্বরটি এখনো সেট করা হয়নি। অনুগ্রহ করে আমাদের সঙ্গে যোগাযোগ করুন।";
    return;
  }

  help.textContent =
    method + " পেমেন্ট নম্বর: " + number +
    "। অর্ডার নিশ্চিত করার পর পেমেন্ট করতে পারবেন।";

  if (copyButton) {
    copyButton.style.display = "block";
    copyButton.dataset.number = number;
    copyButton.textContent = "Copy " + method + " Number";
    copyButton.disabled = false;
  }
}

async function copyPaymentNumber() {
  const button = $("copyPaymentNumber");
  if (!button) return;

  const number = button.dataset.number;
  if (!number) return;

  const originalText = button.textContent;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(number);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = number;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();

      const copied = document.execCommand("copy");
      textarea.remove();

      if (!copied) throw new Error("Copy failed");
    }

    button.textContent = "✓ কপি হয়েছে";
    button.disabled = true;

    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 1800);

  } catch (error) {
    alert("কপি করা যায়নি। নম্বরটি নিজে কপি করুন:\n" + number);
  }
}

/* =========================================
   INITIALIZATION
========================================= */


/* =========================================
   FIRST-VISIT WELCOME + LIVE OFFERS
========================================= */
function closeWelcome() {
  const backdrop = $("welcomeBackdrop");
  if (backdrop) backdrop.hidden = true;
  try { localStorage.setItem("foodora_welcome_seen", String(Date.now())); } catch (_) {}
}

function renderWelcomeCatalog(products) {
  const wrap = $("welcomeCatalog");
  if (!wrap) return;
  const active = Array.isArray(products) ? products.filter(p => p && p.active !== false) : [];
  if (!active.length) {
    wrap.innerHTML = '<p class="welcome-catalog-empty">মেনুর আইটেমগুলো এখন লোড করা যাচ্ছে না। মেনু পেজে গিয়ে দেখে নিন।</p>';
    return;
  }
  const groups = new Map();
  active.forEach(product => {
    const category = String(product.category || "অন্যান্য");
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(product);
  });
  wrap.innerHTML = '<div class="welcome-catalog-heading"><strong>আমাদের মেনুতে যা যা পাবেন</strong><span>' + active.length + 'টি আইটেম</span></div>' +
    Array.from(groups.entries()).map(([category, items]) =>
      '<section class="welcome-category"><h4>' + esc(category) + ' <span>' + items.length + '</span></h4><div class="welcome-product-grid">' +
      items.map(product => {
        const image = typeof product.image === "string" && (/^https?:\/\//i.test(product.image) || /^\/(?!\/)/.test(product.image)) ? product.image : "";
        const visual = image
          ? '<img src="' + esc(image) + '" alt="' + esc(product.name || "Foodora item") + '" loading="lazy">'
          : '<span class="welcome-product-emoji">' + esc(product.emoji || "🍽️") + '</span>';
        return '<article class="welcome-product-card"><div class="welcome-product-visual">' + visual + '</div><div class="welcome-product-info"><strong>' + esc(product.name || "Food item") + '</strong><span>৳' + money(product.price) + '</span></div></article>';
      }).join("") +
      '</div></section>'
    ).join("");
}

function renderWelcomeCoupons(offers) {
  const list = $("welcomeCoupons");
  if (!list) return;
  if (!offers.length) {
    list.innerHTML = '<div class="welcome-coupon"><div class="welcome-coupon-copy"><span class="welcome-coupon-code">নতুন অফারের অপেক্ষায় থাকুন</span><span class="welcome-coupon-desc">এই মুহূর্তে কোনো সক্রিয় কুপন নেই।</span></div></div>';
    return;
  }
  list.innerHTML = offers.map(offer => {
    const value = offer.type === "percent" ? offer.value + "% ছাড়" : money(offer.value) + " ছাড়";
    const min = offer.minOrder > 0 ? "ন্যূনতম অর্ডার " + money(offer.minOrder) : "ন্যূনতম অর্ডার নেই";
    return '<div class="welcome-coupon"><div class="welcome-coupon-copy"><span class="welcome-coupon-code">' + esc(offer.code) + ' · ' + esc(value) + '</span><span class="welcome-coupon-desc">' + esc(min) + '</span></div><button type="button" data-copy-coupon="' + esc(offer.code) + '">কোড কপি</button></div>';
  }).join("");
}
async function showWelcomeIfNeeded() {
  const backdrop = $("welcomeBackdrop");
  if (!backdrop) return;
  try {
    const seenAt = Number(localStorage.getItem("foodora_welcome_seen") || 0);
    if (seenAt && Date.now() - seenAt < 7 * 24 * 60 * 60 * 1000) return;
  } catch (_) {}
  let customer = null, offerData = {offers:[]}, liveConfig = config, productData = [];
  const results = await Promise.allSettled([
    api("/api/customer/me"),
    api("/api/offers"),
    api("/api/config"),
    api("/api/products")
  ]);
  if (results[0].status === "fulfilled") customer = results[0].value.customer;
  if (results[1].status === "fulfilled") offerData = results[1].value;
  if (results[2].status === "fulfilled") liveConfig = {...config,...results[2].value};
  if (results[3].status === "fulfilled") productData = Array.isArray(results[3].value) ? results[3].value : (results[3].value.products || []);
  const title = $("welcomeTitle");
  const intro = $("welcomeIntro");
  if (title) title.textContent = customer?.name ? "স্বাগতম, " + customer.name + "!" : "স্বাগতম Foodora-তে!";
  if (intro) intro.textContent = customer?.name
    ? "আপনার জন্য চলছে দারুণ কিছু খাবারের অফার। পছন্দের খাবার অর্ডার করুন সহজেই।"
    : "প্রিয় Foodie, আপনার পছন্দের খাবার অর্ডার করুন আর উপভোগ করুন চলমান অফারগুলো।";
  const deliveryBox = $("welcomeDelivery");
  if (deliveryBox) {
    const threshold = Number(liveConfig.freeDeliveryFrom || 0);
    const fee = Number(liveConfig.deliveryFee || 0);
    deliveryBox.innerHTML = threshold > 0
      ? '🚚 <strong>' + money(threshold) + ' বা তার বেশি</strong> খাবারের অর্ডারে ডেলিভারি চার্জ ফ্রি। এর কম অর্ডারে ডেলিভারি চার্জ ' + money(fee) + '।'
      : '🚚 বর্তমানে ফ্রি ডেলিভারি শর্ত প্রযোজ্য নয়।';
  }
  renderWelcomeCoupons(Array.isArray(offerData.offers) ? offerData.offers : []);
  renderWelcomeCatalog(productData);
  backdrop.hidden = false;
}

async function init() {
  try {
    const [menu, settings] = await Promise.all([
      api("/api/products"),
      api("/api/config")
    ]);

    products = Array.isArray(menu) ? menu : [];
    config = { ...config, ...settings };

    try {
      const saved = JSON.parse(
        localStorage.getItem("foodora_cart") || "[]"
      );

      if (Array.isArray(saved)) {
        cart = saved.map(item => {
          const product = products.find(
            p => String(p.id) === String(item.id)
          );

          if (!product) return null;

          const quantity = Math.min(
            Math.max(1, Number(item.qty) || 1),
            Number(product.stock) || 0
          );

          return quantity > 0
            ? { ...product, qty: quantity }
            : null;
        }).filter(Boolean);
      }
    } catch (_) {
      cart = [];
    }

    const areaSelect=$("deliveryArea");
    if(areaSelect){areaSelect.innerHTML=`<option value="">এলাকা নির্বাচন করুন</option>`+(Array.isArray(config.areas)?config.areas:[]).map(area=>`<option value="${esc(area.id)}">${esc(area.name)}</option>`).join("");}

    const payment = $("paymentMethod");

    if (payment) {
      const methods = Array.isArray(config.paymentMethods)
        ? config.paymentMethods
        : [];

      payment.innerHTML = '<option value="" selected disabled>পেমেন্ট পদ্ধতি নির্বাচন করুন</option>' + methods.map(rawMethod => {
        const method = canonicalPaymentMethod(rawMethod);
        return `<option value="${esc(method)}">${esc(method)}</option>`;
      }).join("");
    }

    if (payment) {
      payment.removeEventListener("change", handlePaymentMethodChange);
      payment.addEventListener("change", handlePaymentMethodChange);
    }

    const copyButton = $("copyPaymentNumber");

    if (copyButton) {
      copyButton.removeEventListener("click", copyPaymentNumber);
      copyButton.addEventListener("click", copyPaymentNumber);
    }

    updatePaymentHelp();

    if ($("year")) {
      $("year").textContent = new Date().getFullYear();
    }

    try {
      const savedFavorites = JSON.parse(localStorage.getItem("foodora_favorites") || "[]");
      if (Array.isArray(savedFavorites)) favorites = new Set(savedFavorites.map(String));
    } catch (_) { favorites = new Set(); }

    renderProducts();
    updateFavoriteCount();
    updateCart();
    try {
      const session = await api("/api/customer/me");
      const nameField = $("checkoutForm")?.elements.namedItem("name");
      const phoneField = $("checkoutForm")?.elements.namedItem("phone");
      if (nameField && !nameField.value) nameField.value = session.customer.name;
      if (phoneField && !phoneField.value) phoneField.value = session.customer.phone;
    } catch (_) { /* Guest checkout remains available. */ }
    await showWelcomeIfNeeded();
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "1") {
      const selectedMethod = canonicalPaymentMethod(params.get("paymentMethod") || sessionStorage.getItem("foodora_payment_method") || "");
      const paymentSelect = $("paymentMethod");
      if (paymentSelect) {
        const matchingOption = [...paymentSelect.options].find(option => canonicalPaymentMethod(option.value) === selectedMethod);
        if (matchingOption) paymentSelect.value = matchingOption.value;
      }
      const transactionField = $("checkoutForm")?.elements.namedItem("transactionId");
      try {
        const savedTransactionId = sessionStorage.getItem("foodora_payment_transaction_id") || "";
        if (transactionField && savedTransactionId) transactionField.value = savedTransactionId;
        sessionStorage.removeItem("foodora_payment_transaction_id");
      } catch (_) {}
      try {
        const savedCoupon = JSON.parse(sessionStorage.getItem("foodora_checkout_coupon") || "null");
        if (savedCoupon?.code) {
          const checked = await api("/api/coupons/validate",{method:"POST",body:JSON.stringify({code:savedCoupon.code,subtotal:subtotal()})});
          appliedCoupon = {code:checked.code,discount:checked.discount};
        }
      } catch (_) { appliedCoupon = null; }
      closeWelcome();
      renderCheckoutSummary();
      openCheckout();
      updatePaymentHelp();
      sessionStorage.removeItem("foodora_payment_method");
      sessionStorage.removeItem("foodora_checkout_coupon");
      history.replaceState({}, "", "/");
    }

  } catch (error) {
    if ($("products")) {
      $("products").textContent =
        "Menu loading failed. Please refresh the page.";
    }

    console.error("Foodora initialization:", error);
  }
}


document.addEventListener("click", async event => {
  const close = event.target.closest("#welcomeClose");
  const shop = event.target.closest("#welcomeShop");
  const copy = event.target.closest("[data-copy-coupon]");
  if (close) closeWelcome();
  if (shop) {
    closeWelcome();
    document.getElementById("offers")?.scrollIntoView({behavior:"smooth",block:"start"});
  }
  if (copy) {
    const code = copy.getAttribute("data-copy-coupon") || "";
    try {
      await navigator.clipboard.writeText(code);
      copy.textContent = "কপি হয়েছে ✓";
    } catch (_) {
      const couponInput = $("coupon");
      if (couponInput) couponInput.value = code;
      copy.textContent = "কার্টে ব্যবহার করুন";
    }
  }
});

/* =========================================
   PRODUCT IMAGES
========================================= */

function foodoraFoodImage(name) {
  const n = String(name || "").toLowerCase();

  const foods = [
    [/burger|বার্গার/, "photo-1568901346375-23c9450c58cd"],
    [/pizza|পিজ্জা/, "photo-1565299624946-b28f40a0ae38"],
    [/chicken|চিকেন|মুরগি/, "photo-1555939594-58d7cb561ad1"],
    [/biryani|বিরিয়ানি|পোলাও/, "photo-1563379091339-03246963d96c"],
    [/rice|ভাত|খিচুড়ি/, "photo-1512058564366-18510be2db19"],
    [/pasta|পাস্তা/, "photo-1473093295043-cdd812d0e601"],
    [/noodle|নুডলস|রামেন/, "photo-1569718212165-3a8278d5f624"],
    [/sandwich|স্যান্ডউইচ/, "photo-1528735602780-2552fd46c7af"],
    [/cake|কেক|dessert|মিষ্টি/, "photo-1578985545062-69928b1d9587"],
    [/juice|জুস|drink|coffee/, "photo-1544145945-f90425340c7e"],
    [/fish|মাছ|seafood/, "photo-1519708227418-c8fd9a32b7a2"],
    [/salad|সালাদ/, "photo-1512621776951-a57141f2eefd"]
  ];

  let id = "photo-1546069901-ba9599a7e63c";

  for (const [pattern, image] of foods) {
    if (pattern.test(n)) {
      id = image;
      break;
    }
  }

  return "https://images.unsplash.com/" +
    id + "?auto=format&fit=crop&w=900&q=85";
}

function foodoraImage(product) {
  const n = (
    (product.name || "") + " " +
    (product.category || "")
  ).toLowerCase();

  const photos = [
    [/burger/, "photo-1568901346375-23c9450c58cd"],
    [/pizza/, "photo-1571407970349-bc81e7e96d47"],
    [/chaap|chap|kabab|kebab|boti/, "photo-1544025162-d76694265947"],
    [/chowmein|chow mein|noodle/, "photo-1569718212165-3a8278d5f624"],
    [/grill|bbq|roast/, "photo-1532550907401-a500c9a57435"],
    [/fried rice/, "photo-1512058564366-18510be2db19"],
    [/omelette|omelet|egg/, "photo-1525351484163-7529414344d8"],
    [/thai soup|chicken soup/, "photo-1547592180-85f173990554"],
    [/vegetable soup|soup/, "photo-1476718406336-bb5a9690ee2a"],
    [/chicken/, "photo-1626082927389-6cd097cdc6ec"],
    [/rice/, "photo-1512058564366-18510be2db19"]
  ];

  let id = "photo-1546069901-ba9599a7e63c";

  for (const [pattern, photo] of photos) {
    if (pattern.test(n)) {
      id = photo;
      break;
    }
  }

  return "https://images.unsplash.com/" +
    id + "?auto=format&fit=crop&w=900&q=85";
}

/* =========================================
   PRODUCT DISPLAY
========================================= */

function renderProducts() {
  const searchInput = $("search");
  if (!$("products") || !searchInput) return;

  const search = (searchInput.value || "").trim().toLowerCase();

  const categories = [
    "All",
    ...new Set(products.map(p => p.category).filter(Boolean))
  ];

  $("categories").innerHTML = categories.map(c => `
    <button class="chip ${category === c ? "active" : ""}"
      data-category="${esc(c)}">${esc(c === "All" ? "সব খাবার" : c)}</button>
  `).join("");

  let list = products.filter(p => {
    const tags = Array.isArray(p.dietaryTags) ? p.dietaryTags : [];
    const meal = p.mealTime || "all";
    const spice = p.spicyLevel || "medium";
    return p.active !== false &&
      (!favoritesOnly || favorites.has(String(p.id))) &&
      (category === "All" || p.category === category) &&
      (mealFilter === "all" || meal === mealFilter || meal === "all") &&
      (dietaryFilter === "all" || tags.includes(dietaryFilter)) &&
      (spiceFilter === "all" || spice === spiceFilter) &&
      Number(p.price) >= minPriceFilter && Number(p.price) <= maxPriceFilter &&
      ((p.name || "") + " " + (p.category || "") + " " + (p.description || "")).toLowerCase().includes(search);
  });

  if (sortMode === "price-low") list.sort((a,b) => Number(a.price)-Number(b.price));
  if (sortMode === "price-high") list.sort((a,b) => Number(b.price)-Number(a.price));
  if (sortMode === "name") list.sort((a,b) => String(a.name).localeCompare(String(b.name)));
  if (sortMode === "popular") list.sort((a,b) => Number(b.featured===true)-Number(a.featured===true));

  $("products").innerHTML = list.length
    ? list.map(p => {
        const price = Number(p.price) || 0;

        const oldPrice = Number(
          p.originalPrice ||
          p.original_price ||
          p.oldPrice || 0
        );

        const hasDiscount = oldPrice > price && price > 0;

        const percent = hasDiscount
          ? Math.round((oldPrice - price) / oldPrice * 100)
          : 0;

        const image = p.image &&
          /^https?:\/\//i.test(p.image)
          ? p.image
          : foodoraImage(p);

        const bestSeller = p.featured === true;

        const unavailable = Number(p.stock) <= 0;

        return `
          <article class="product">
            <div class="productPhoto">
              <button type="button" class="favorite-button ${favorites.has(String(p.id)) ? "is-favorite" : ""}" data-favorite="${esc(p.id)}" aria-label="${favorites.has(String(p.id)) ? "পছন্দ থেকে সরান" : "পছন্দে যোগ করুন"}" aria-pressed="${favorites.has(String(p.id))}">${favorites.has(String(p.id)) ? "♥" : "♡"}</button>
              <a class="product-detail-link" href="/food/${encodeURIComponent(String(p.id))}" aria-label="View ${esc(p.name)} details"><img src="${esc(image)}"
                alt="${esc(p.name)}"
                loading="lazy"
                decoding="async"
                onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85'">

              </a>
              ${bestSeller
                ? '<span class="v8-badge bestseller">★ জনপ্রিয়</span>'
                : '<span class="v8-badge">ফুডোরা স্পেশাল</span>'}

              ${hasDiscount
                ? `<span class="v8-discount">${percent}% OFF</span>`
                : ""}
            </div>

            <div class="productInfo">
              <div class="tag">${esc(p.category || "Fresh Food")}</div>
              <div class="menu-product-tags">${(Array.isArray(p.dietaryTags)?p.dietaryTags:[]).map(tag=>'<span>'+(tag==="vegetarian"?"নিরামিষ":"চিনি ছাড়া")+'</span>').join("")}${p.spicyLevel==="hot"?'<span>ঝাল</span>':p.spicyLevel==="mild"?'<span>কম ঝাল</span>':""}</div>
              <h3><a class="product-name-link" href="/food/${encodeURIComponent(String(p.id))}">${esc(p.name)}</a></h3>
              <p>${esc(p.description || "Freshly prepared with quality ingredients.")}</p>

              <div class="productBottom">
                <div class="v8-price">
                  <span class="price">${money(price)}</span>
                  ${hasDiscount ? `<del>${money(oldPrice)}</del>` : ""}
                </div>

                <button class="add"
                  data-add="${esc(p.id)}"
                  ${unavailable ? "disabled" : ""}>
                  ${unavailable ? "স্টক শেষ" : "+ যোগ করুন"}
                </button>
              </div>
            </div>
          </article>
        `;
      }).join("")
    : `
      <div class="v8-empty">
        <div>🍽️</div>
        <h3>${favoritesOnly ? "এখনো পছন্দের খাবার যোগ করেননি" : "কোনো খাবার পাওয়া যায়নি"}</h3>
        <p>${favoritesOnly ? "যে খাবারটি পছন্দ, তার হার্ট চিহ্নে চাপ দিন।" : "অন্য নাম বা ক্যাটাগরি দিয়ে খুঁজে দেখুন।"}</p>
      </div>
    `;
}

/* =========================================
   ADD TO CART
========================================= */

function updateFavoriteCount() {
  const count = favorites.size;
  if ($("favoriteCount")) $("favoriteCount").textContent = count;
  if ($("favoritesToggle")) {
    $("favoritesToggle").classList.toggle("active", favoritesOnly);
    $("favoritesToggle").setAttribute("aria-pressed", String(favoritesOnly));
  }
}

function toggleFavorite(id) {
  const key = String(id);
  if (favorites.has(key)) favorites.delete(key);
  else favorites.add(key);

  try {
    localStorage.setItem("foodora_favorites", JSON.stringify([...favorites]));
  } catch (_) {}

  updateFavoriteCount();
  renderProducts();
}

function addToCart(id) {
  const product = products.find(
    p => String(p.id) === String(id)
  );

  if (!product) return;

  const old = cart.find(
    p => String(p.id) === String(id)
  );

  if (Number(product.stock) <= 0) {
    alert("This product is out of stock.");
    return;
  }

  if (old) {
    if (old.qty >= Number(product.stock)) {
      alert("Maximum available stock reached.");
      return;
    }

    old.qty++;
  } else {
    cart.push({ ...product, qty: 1 });
  }

  appliedCoupon = null;

  if ($("couponMessage")) $("couponMessage").textContent = "";
  if ($("coupon")) $("coupon").value = "";

  updateCart();
}

/* =========================================
   CART DISPLAY
========================================= */

function updateCart() {
  if (!$("cartItems")) return;

  const count = cart.reduce((sum, p) => sum + p.qty, 0);

  $("cartCount").textContent = count;

  $("cartItems").innerHTML = cart.length
    ? cart.map(p => `
        <div class="cart-line">
          <div>
            <b>${esc(p.name)}</b>
            <p>${money(p.price)} × ${p.qty}</p>
          </div>
          <div class="qty-controls">
            <button type="button" aria-label="একটি কমান" data-qty="${esc(p.id)}" data-change="-1">−</button>
            <b>${p.qty}</b>
            <button type="button" aria-label="একটি বাড়ান" data-qty="${esc(p.id)}" data-change="1">+</button>
            <button type="button" aria-label="সরিয়ে ফেলুন" data-remove="${esc(p.id)}">✕</button>
          </div>
        </div>
      `).join("")
    : `<div class="empty"><p>আপনার কার্ট এখনো খালি।</p><a href="#menu" data-close-cart>মেনু থেকে খাবার বেছে নিন →</a></div>`;

  updateDeliveryProgress();

  $("totals").innerHTML = `
    <div class="total-line"><span>খাবারের মূল্য</span><b>${money(subtotal())}</b></div>
    <div class="total-line"><span>ছাড়</span><b>−${money(discount())}</b></div>
    <div class="total-line"><span>ডেলিভারি চার্জ</span><b>${delivery() === 0 ? "ফ্রি" : money(delivery())}</b></div>
    <div class="total-line"><strong>সর্বমোট</strong><strong>${money(total())}</strong></div>
  `;

  $("checkoutOpen").disabled = !cart.length;

  saveCart();
}

/* =========================================
   CART DRAWER
========================================= */

function openCart() {
  updateCart();
  $("drawer").classList.add("open");
  $("backdrop").classList.add("show");
}

function closeCart() {
  $("drawer").classList.remove("open");
  $("backdrop").classList.remove("show");
}

/* =========================================
   CHECKOUT
========================================= */

function renderCheckoutSummary() {
  const panel = $("checkoutSummary");
  if (!panel) return;
  const lines = cart.map(item => `<div class="checkout-summary-item"><span>${esc(item.name)} × ${item.qty}</span><b>${money(Number(item.price) * item.qty)}</b></div>`).join("");
  panel.innerHTML = `<div class="checkout-summary-heading"><strong>অর্ডারের সারাংশ</strong><span>${cart.reduce((n,p)=>n+p.qty,0)}টি আইটেম</span></div>${lines}<div class="checkout-summary-total"><span>সর্বমোট (আনুমানিক)</span><strong>${money(total())}</strong></div>`;
}

function resetCheckoutView() {
  if ($("checkoutFields")) $("checkoutFields").hidden = false;
  if ($("checkoutResult")) { $("checkoutResult").hidden = true; $("checkoutResult").innerHTML = ""; }
  const message = $("checkoutMessage");
  if (message) { message.textContent = ""; message.classList.remove("success"); }
  const button = $("placeOrderButton");
  if (button) { button.disabled = false; button.textContent = "অর্ডার নিশ্চিত করুন"; }
}

function openCheckout() {
  if (!cart.length) {
    alert("আগে কার্টে খাবার যোগ করুন।");
    return;
  }

  closeCart();

  resetCheckoutView();
  renderCheckoutSummary();
  $("checkoutModal").classList.add("show");

  updatePaymentHelp();
}

function closeCheckout() {
  $("checkoutModal").classList.remove("show");
  if ($("checkoutResult") && !$("checkoutResult").hidden) {
    $("checkoutForm").reset();
    resetCheckoutView();
  }
}

/* =========================================
   COUPON
========================================= */

async function applyCoupon() {
  const code = $("coupon").value.trim();

  if (!code) {
    $("couponMessage").textContent = "কুপন কোড লিখুন।";
    return;
  }

  try {
    const result = await api("/api/coupons/validate", {
      method: "POST",
      body: JSON.stringify({
        code,
        subtotal: subtotal()
      })
    });

    appliedCoupon = {
      code: result.code,
      discount: result.discount
    };

    $("couponMessage").textContent =
      "কুপন প্রয়োগ হয়েছে! সাশ্রয় " + money(result.discount);

    updateCart();

  } catch (error) {
    appliedCoupon = null;
    $("couponMessage").textContent = error.message;
    updateCart();
  }
}

/* =========================================
   PLACE ORDER
========================================= */

async function placeOrder(event) {
  event.preventDefault();
  const form = $("checkoutForm"), message = $("checkoutMessage"), button = $("placeOrderButton");
  if (!cart.length) { message.textContent = "আপনার কার্ট খালি। আগে খাবার যোগ করুন।"; return; }
  if (!form.reportValidity()) return;
  const data = new FormData(form), paymentMethod = String(data.get("paymentMethod") || "");
  button.disabled = true;
  button.textContent = "অর্ডার নিশ্চিত হচ্ছে…";
  message.textContent = "আপনার অর্ডারের তথ্য যাচাই করা হচ্ছে…";
  try {
    const result = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        name: data.get("name"), phone: data.get("phone"), address: data.get("address"),
        deliveryArea: data.get("deliveryArea"), paymentMethod,
        transactionId: data.get("transactionId"), couponCode: appliedCoupon?.code || "",
        items: cart.map(p => ({ id: p.id, qty: p.qty }))
      })
    });
    const order = result.order || {};
    const instructions = isCOD(paymentMethod)
      ? "ডেলিভারির সময় নগদ টাকা পরিশোধ করুন।"
      : (result.payment?.instructions || "পেমেন্ট নির্দেশনা জানতে আমাদের সঙ্গে যোগাযোগ করুন।");
    cart = [];
    appliedCoupon = null;
    localStorage.removeItem("foodora_cart");
    updateCart();
    try {
      const refreshedProducts = await api("/api/products");
      products = Array.isArray(refreshedProducts) ? refreshedProducts : products;
      renderProducts();
    } catch (_) { /* Order creation already succeeded; keep the confirmation visible. */ }
    $("checkoutFields").hidden = true;
    message.textContent = "";
    const panel = $("checkoutResult");
    panel.hidden = false;
    panel.innerHTML = `
      <div class="checkout-success-mark" aria-hidden="true">✓</div>
      <p class="checkout-success-eyebrow">অর্ডার সফলভাবে গ্রহণ করা হয়েছে</p>
      <h3>ধন্যবাদ! আপনার অর্ডারটি পেয়েছি।</h3>
      <div class="checkout-order-id"><span>আপনার অর্ডার আইডি</span><strong>${esc(order.id || "—")}</strong></div>
      <p class="checkout-final-total">মোট: <strong>${money(order.total)}</strong></p>
      <p class="checkout-payment-instructions">${esc(instructions)}</p>
      <a class="primary-button full checkout-track-link" href="/track">অর্ডার ট্র্যাক করুন</a>
      <button type="button" class="checkout-done-button" id="checkoutDone">বন্ধ করুন</button>`;
    $("checkoutDone").addEventListener("click", closeCheckout);
  } catch (error) {
    message.textContent = error.message || "অর্ডার সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।";
    button.disabled = false;
    button.textContent = "আবার চেষ্টা করুন";
  }
}

/* =========================================
   EVENT LISTENERS
========================================= */

$("cartOpen").addEventListener("click", openCart);
$("cartClose").addEventListener("click", closeCart);
$("backdrop").addEventListener("click", closeCart);

$("checkoutOpen").addEventListener("click", openCheckout);
$("checkoutClose").addEventListener("click", closeCheckout);

$("checkoutForm").addEventListener("submit", placeOrder);

$("search").addEventListener("input", renderProducts);
if ($("sortMenu")) $("sortMenu").addEventListener("change", event => { sortMode = event.target.value; renderProducts(); });
if ($("dietaryFilter")) $("dietaryFilter").addEventListener("change", event => { dietaryFilter = event.target.value; renderProducts(); });
if ($("mealFilter")) $("mealFilter").addEventListener("change", event => { mealFilter = event.target.value; renderProducts(); });
if ($("spiceFilter")) $("spiceFilter").addEventListener("change", event => { spiceFilter = event.target.value; renderProducts(); });
if ($("minPrice")) $("minPrice").addEventListener("input", event => { minPriceFilter = Math.max(0, Number(event.target.value)||0); renderProducts(); });
if ($("maxPrice")) $("maxPrice").addEventListener("input", event => { maxPriceFilter = event.target.value===""?Infinity:Math.max(0,Number(event.target.value)||0); renderProducts(); });
if ($("favoritesToggle")) $("favoritesToggle").addEventListener("click", () => { favoritesOnly = !favoritesOnly; updateFavoriteCount(); renderProducts(); });
$("applyCoupon").addEventListener("click", applyCoupon);

$("checkoutModal").addEventListener("click", event => {
  if (event.target === $("checkoutModal")) {
    closeCheckout();
  }
});

$("categories").addEventListener("click", event => {
  const button = event.target.closest("[data-category]");
  if (!button) return;

  category = button.dataset.category;
  renderProducts();
});

$("products").addEventListener("click", event => {
  const favoriteButton = event.target.closest("[data-favorite]");
  if (favoriteButton) {
    toggleFavorite(favoriteButton.dataset.favorite);
    return;
  }

  const button = event.target.closest("[data-add]");
  if (button) {
    addToCart(button.dataset.add);
  }
});

$("cartItems").addEventListener("click", event => {
  if (event.target.closest("[data-close-cart]")) { closeCart(); return; }
  const remove = event.target.closest("[data-remove]");
  const change = event.target.closest("[data-qty]");

  if (remove) {
    cart = cart.filter(
      p => String(p.id) !== remove.dataset.remove
    );

    appliedCoupon = null;
    updateCart();
    return;
  }

  if (change) {
    const productInCart = cart.find(
      p => String(p.id) === change.dataset.qty
    );

    if (!productInCart) return;

    const amount = Number(change.dataset.change);

    const product = products.find(
      p => String(p.id) === String(productInCart.id)
    );

    if (
      amount > 0 &&
      productInCart.qty >= Number(product?.stock || 0)
    ) {
      alert("Maximum stock reached.");
      return;
    }

    productInCart.qty += amount;

    if (productInCart.qty <= 0) {
      cart = cart.filter(p => p !== productInCart);
    }

    appliedCoupon = null;
    updateCart();
  }
});

/* =========================================
   START FOODORA
========================================= */

init();
