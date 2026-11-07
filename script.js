
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
    if (pattern.test(n)) { id = image; break; }
  }
  return "https://images.unsplash.com/" + id + "?auto=format&fit=crop&w=900&q=85";
}

"use strict";

let products = [];
let cart = [];
let category = "All";
let config = {
  paymentNumber: "01XXXXXXXXX",
  paymentMethods: ["bKash", "Nagad"],
  deliveryFee: 60,
  freeDeliveryFrom: 999
};
let appliedCoupon = null;

const $ = id => document.getElementById(id);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;",
    '"':"&quot;", "'":"&#39;"
  })[c]);
}

function money(value) {
  return "৳" + Number(value || 0).toLocaleString("en-BD");
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

function saveCart() {
  try {
    localStorage.setItem("foodora_cart", JSON.stringify(cart));
  } catch (_) {}
}

function subtotal() {
  return cart.reduce((sum, p) => sum + Number(p.price) * p.qty, 0);
}

function discount() {
  return Math.min(subtotal(), Number(appliedCoupon?.discount || 0));
}

function delivery() {
  return subtotal() - discount() >= config.freeDeliveryFrom
    ? 0 : config.deliveryFee;
}

function total() {
  return subtotal() - discount() + delivery();
}

async function init() {
  try {
    const [menu, settings] = await Promise.all([
      api("/api/products"),
      api("/api/config")
    ]);

    products = menu;
    config = {...config, ...settings};

    try {
      const saved = JSON.parse(localStorage.getItem("foodora_cart") || "[]");
      if (Array.isArray(saved)) {
        cart = saved.map(item => {
          const p = products.find(x => String(x.id) === String(item.id));
          if (!p) return null;
          return {...p, qty: Math.min(
            Math.max(1, Number(item.qty) || 1),
            Number(p.stock) || 0
          )};
        }).filter(x => x && x.qty > 0);
      }
    } catch (_) {
      cart = [];
    }

    const payment = $("paymentMethod");
    if (payment) {
      payment.innerHTML = config.paymentMethods.map(m =>
        `<option value="${esc(m)}">${esc(m)}</option>`
      ).join("");
    }

    const help = $("paymentHelp");
    if (help) {
      help.textContent =
        "Payment number: " + config.paymentNumber +
        ". You can pay after confirming your order.";
    }

    $("year").textContent = new Date().getFullYear();

    renderProducts();
    updateCart();

  } catch (error) {
    $("products").textContent =
      "Menu loading failed. Please refresh the page.";
    console.error("Foodora initialization:", error);
  }
}

function renderProducts() {
  const search = ($("search").value || "").toLowerCase();

  const categories = [
    "All",
    ...new Set(products.map(p => p.category))
  ];

  $("categories").innerHTML = categories.map(c => `
    <button class="chip ${category === c ? "active" : ""}"
      data-category="${esc(c)}">${esc(c)}</button>
  `).join("");

  const list = products.filter(p =>
    (category === "All" || p.category === category) &&
    (p.name + " " + p.category).toLowerCase().includes(search)
  );

  $("products").innerHTML = list.length ? list.map(p => `
    <article class="product-card">
      <div class="product-visual">
        ${p.image
          ? `<img src="${esc(p.image || foodoraFoodImage(p.name))}" alt="${esc(p.name)}"
              onerror="this.style.display='none'">`
          : esc(p.emoji || "🍽️")}
      </div>
      <div class="product-info">
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.description || "Fresh and delicious.")}</p>
        <div class="product-bottom">
          <span class="price">${money(p.price)}</span>
          <button class="add-button" data-add="${esc(p.id)}"
            ${Number(p.stock) <= 0 ? "disabled" : ""}>
            ${Number(p.stock) <= 0 ? "Sold Out" : "+ Add"}
          </button>
        </div>
      </div>
    </article>
  `).join("") : `<p>No food found.</p>`;
}

function addToCart(id) {
  const p = products.find(x => String(x.id) === String(id));
  if (!p) return;

  const old = cart.find(x => String(x.id) === String(id));

  if (Number(p.stock) <= 0) {
    alert("This product is out of stock.");
    return;
  }

  if (old) {
    if (old.qty >= Number(p.stock)) {
      alert("Maximum available stock reached.");
      return;
    }
    old.qty++;
  } else {
    cart.push({...p, qty: 1});
  }

  appliedCoupon = null;
  $("couponMessage").textContent = "";
  $("coupon").value = "";
  updateCart();
}

function updateCart() {
  const count = cart.reduce((s, p) => s + p.qty, 0);
  $("cartCount").textContent = count;

  $("cartItems").innerHTML = cart.length ? cart.map(p => `
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
  `).join("") : `<div class="empty">Your cart is empty. Add some delicious food!</div>`;

  $("totals").innerHTML = `
    <div class="total-line"><span>Subtotal</span><b>${money(subtotal())}</b></div>
    <div class="total-line"><span>Discount</span><b>−${money(discount())}</b></div>
    <div class="total-line"><span>Delivery</span><b>${money(delivery())}</b></div>
    <div class="total-line"><strong>Total</strong><strong>${money(total())}</strong></div>
  `;

  $("checkoutOpen").disabled = !cart.length;
  saveCart();
}

function openCart() {
  updateCart();
  $("drawer").classList.add("open");
  $("backdrop").classList.add("show");
}

function closeCart() {
  $("drawer").classList.remove("open");
  $("backdrop").classList.remove("show");
}

function openCheckout() {
  if (!cart.length) return alert("Please add food first.");
  closeCart();
  $("checkoutMessage").textContent = "";
  $("checkoutModal").classList.add("show");
}

function closeCheckout() {
  $("checkoutModal").classList.remove("show");
}

async function applyCoupon() {
  const code = $("coupon").value.trim();

  if (!code) {
    $("couponMessage").textContent = "Enter a coupon code.";
    return;
  }

  try {
    const result = await api("/api/coupons/validate", {
      method: "POST",
      body: JSON.stringify({code, subtotal: subtotal()})
    });

    appliedCoupon = {code: result.code, discount: result.discount};
    $("couponMessage").textContent =
      "Coupon applied! You saved " + money(result.discount);
    updateCart();

  } catch (error) {
    appliedCoupon = null;
    $("couponMessage").textContent = error.message;
    updateCart();
  }
}

async function placeOrder(event) {
  event.preventDefault();

  if (!cart.length) {
    $("checkoutMessage").textContent = "Your cart is empty.";
    return;
  }

  const form = $("checkoutForm");
  const button = form.querySelector("button[type='submit'], button:not([type])");
  const data = new FormData(form);

  button.disabled = true;
  button.textContent = "Placing order...";

  try {
    const result = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        name: data.get("name"),
        phone: data.get("phone"),
        address: data.get("address"),
        paymentMethod: data.get("paymentMethod"),
        transactionId: data.get("transactionId"),
        couponCode: appliedCoupon?.code || "",
        items: cart.map(p => ({id: p.id, qty: p.qty}))
      })
    });

    const order = result.order || {};

    $("checkoutMessage").textContent =
      "Order successful! Order ID: " + order.id +
      ". " + (result.payment?.instructions || "");

    alert(
      "Order successful!\n" +
      "Order ID: " + order.id + "\n" +
      "Total: " + money(order.total) + "\n\n" +
      (result.payment?.instructions || "")
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

async function trackOrder(event) {
  event.preventDefault();

  const id = $("trackId").value.trim();
  const output = $("trackResult");
  output.textContent = "Checking order...";

  try {
    const order = await api("/api/orders/" + encodeURIComponent(id));

    output.textContent =
      "Order: " + order.id +
      " | Status: " + order.status +
      " | Payment: " + order.paymentStatus +
      " | Total: " + money(order.total);

  } catch (error) {
    output.textContent = error.message;
  }
}

$("cartOpen").addEventListener("click", openCart);
$("cartClose").addEventListener("click", closeCart);
$("backdrop").addEventListener("click", closeCart);
$("checkoutOpen").addEventListener("click", openCheckout);
$("checkoutClose").addEventListener("click", closeCheckout);
$("checkoutForm").addEventListener("submit", placeOrder);
$("trackForm").addEventListener("submit", trackOrder);
$("search").addEventListener("input", renderProducts);
$("applyCoupon").addEventListener("click", applyCoupon);

$("checkoutModal").addEventListener("click", event => {
  if (event.target === $("checkoutModal")) closeCheckout();
});

$("categories").addEventListener("click", event => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  category = button.dataset.category;
  renderProducts();
});

$("products").addEventListener("click", event => {
  const button = event.target.closest("[data-add]");
  if (button) addToCart(button.dataset.add);
});

$("cartItems").addEventListener("click", event => {
  const remove = event.target.closest("[data-remove]");
  const change = event.target.closest("[data-qty]");

  if (remove) {
    cart = cart.filter(p => String(p.id) !== remove.dataset.remove);
    appliedCoupon = null;
    updateCart();
    return;
  }

  if (change) {
    const p = cart.find(x => String(x.id) === change.dataset.qty);
    if (!p) return;

    const amount = Number(change.dataset.change);
    const product = products.find(x => String(x.id) === String(p.id));

    if (amount > 0 && p.qty >= Number(product?.stock || 0)) {
      alert("Maximum stock reached.");
      return;
    }

    p.qty += amount;
    if (p.qty <= 0) cart = cart.filter(x => x !== p);

    appliedCoupon = null;
    updateCart();
  }
});

init();
