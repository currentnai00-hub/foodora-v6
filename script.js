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

let config = {
  paymentNumbers: {
    bKash: "01XXXXXXXXX",
    Nagad: "01XXXXXXXXX"
  },
  paymentMethods: ["bKash", "Nagad"],
  deliveryFee: 60,
  freeDeliveryFrom: 999
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

/* =========================================
   PAYMENT METHODS
========================================= */

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
      "Cash on Delivery: Pay cash when your order is delivered.";
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
      method + " payment number is not configured. Please contact us.";
    return;
  }

  help.textContent =
    method + " payment number: " + number +
    ". You can pay after confirming your order.";

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

    button.textContent = "✓ Copied!";
    button.disabled = true;

    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 1800);

  } catch (error) {
    alert("Copy failed. Please copy this number manually:\n" + number);
  }
}

/* =========================================
   INITIALIZATION
========================================= */

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

    const payment = $("paymentMethod");

    if (payment) {
      const methods = Array.isArray(config.paymentMethods)
        ? config.paymentMethods
        : [];

      payment.innerHTML = methods.map(method =>
        `<option value="${esc(method)}">${esc(method)}</option>`
      ).join("");
    }

    if (payment) {
      payment.removeEventListener("change", updatePaymentHelp);
      payment.addEventListener("change", updatePaymentHelp);
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

  } catch (error) {
    if ($("products")) {
      $("products").textContent =
        "Menu loading failed. Please refresh the page.";
    }

    console.error("Foodora initialization:", error);
  }
}

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

  let list = products.filter(p =>
    p.active !== false &&
    (!favoritesOnly || favorites.has(String(p.id))) &&
    (category === "All" || p.category === category) &&
    (
      (p.name || "") + " " +
      (p.category || "") + " " +
      (p.description || "")
    ).toLowerCase().includes(search)
  );

  if (sortMode === "price-low") list.sort((a,b) => Number(a.price)-Number(b.price));
  if (sortMode === "price-high") list.sort((a,b) => Number(b.price)-Number(a.price));
  if (sortMode === "name") list.sort((a,b) => String(a.name).localeCompare(String(b.name)));

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

        const bestSeller =
          p.bestSeller === true ||
          p.isBestSeller === true ||
          p.featured === true;

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
                ? '<span class="v8-badge bestseller">★ BEST SELLER</span>'
                : '<span class="v8-badge">FOODORA SPECIAL</span>'}

              ${hasDiscount
                ? `<span class="v8-discount">${percent}% OFF</span>`
                : ""}
            </div>

            <div class="productInfo">
              <div class="tag">${esc(p.category || "Fresh Food")}</div>
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
            <p>${money(p.price)} each</p>
          </div>

          <div class="qty-controls">
            <button data-qty="${esc(p.id)}" data-change="-1">−</button>
            <b>${p.qty}</b>
            <button data-qty="${esc(p.id)}" data-change="1">+</button>
            <button data-remove="${esc(p.id)}">✕</button>
          </div>
        </div>
      `).join("")
    : `<div class="empty">Your cart is empty. Add some delicious food!</div>`;

  $("totals").innerHTML = `
    <div class="total-line">
      <span>Subtotal</span><b>${money(subtotal())}</b>
    </div>
    <div class="total-line">
      <span>Discount</span><b>−${money(discount())}</b>
    </div>
    <div class="total-line">
      <span>Delivery</span><b>${money(delivery())}</b>
    </div>
    <div class="total-line">
      <strong>Total</strong><strong>${money(total())}</strong>
    </div>
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

function openCheckout() {
  if (!cart.length) {
    alert("Please add food first.");
    return;
  }

  closeCart();

  $("checkoutMessage").textContent = "";
  $("checkoutModal").classList.add("show");

  updatePaymentHelp();
}

function closeCheckout() {
  $("checkoutModal").classList.remove("show");
}

/* =========================================
   COUPON
========================================= */

async function applyCoupon() {
  const code = $("coupon").value.trim();

  if (!code) {
    $("couponMessage").textContent = "Enter a coupon code.";
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
      "Coupon applied! You saved " + money(result.discount);

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

  if (!cart.length) {
    $("checkoutMessage").textContent = "Your cart is empty.";
    return;
  }

  const form = $("checkoutForm");

  const button = form.querySelector(
    "button[type='submit'], button:not([type])"
  );

  if (!button) return;

  const data = new FormData(form);
  const paymentMethod = String(
    data.get("paymentMethod") || ""
  );

  button.disabled = true;
  button.textContent = "Placing order...";

  try {
    const result = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        name: data.get("name"),
        phone: data.get("phone"),
        address: data.get("address"),
        paymentMethod,
        transactionId: data.get("transactionId"),
        couponCode: appliedCoupon?.code || "",
        items: cart.map(p => ({
          id: p.id,
          qty: p.qty
        }))
      })
    });

    const order = result.order || {};

    let instructions = "";

    if (isCOD(paymentMethod)) {
      instructions = "Please pay cash when your order is delivered.";
    } else {
      instructions = result.payment?.instructions || "";
    }

    const successMessage =
      "Order successful! Order ID: " + order.id +
      ". " + instructions;

    $("checkoutMessage").textContent = successMessage;

    alert(
      "Order successful!\n" +
      "Order ID: " + order.id + "\n" +
      "Total: " + money(order.total) +
      (instructions ? "\n\n" + instructions : "")
    );

    cart = [];
    appliedCoupon = null;

    form.reset();

    localStorage.removeItem("foodora_cart");

    updateCart();
    closeCheckout();

    await init();

  } catch (error) {
    $("checkoutMessage").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = "Place order";
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
