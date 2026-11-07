"use strict";

let products = [];
let cart = [];
let category = "All";
let submitting = false;

const $ = id => document.getElementById(id);

function showMessage(id, message) {
  const el = $(id);
  if (el) el.textContent = message;
}

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  }[c]));
}

async function init() {
  const container = $("products");

  try {
    const response = await fetch("/api/products", { cache: "no-store" });
    if (!response.ok) throw Error("Products API error: " + response.status);

    const data = await response.json();
    if (!Array.isArray(data)) throw Error("Invalid products response");

    products = data.filter(p => p.active !== false);

    render();
  } catch (error) {
    console.error("Foodora menu error:", error);
    if (container) {
      container.innerHTML =
        "<p>Menu could not load. Please refresh the page.</p>";
    }
  }
}

function render() {
  const search = $("search");
  const categories = $("categories");
  const container = $("products");

  if (!categories || !container) return;

  const term = (search?.value || "").toLowerCase();

  const cats = ["All", ...new Set(products.map(p => p.category || "Other"))];

  categories.innerHTML = cats.map(c => `
    <button type="button"
      class="category ${category === c ? "active" : ""}"
      onclick="setCategory('${safe(c)}')">
      ${safe(c)}
    </button>
  `).join("");

  const filtered = products.filter(p =>
    (category === "All" || (p.category || "Other") === category) &&
    (String(p.name) + " " + String(p.category))
      .toLowerCase().includes(term)
  );

  container.innerHTML = filtered.length ? filtered.map(p => `
    <article class="product">
      <div class="productPhoto">
        ${p.image
          ? `<img src="${safe(p.image)}" alt="${safe(p.name)}" loading="lazy">`
          : `<span class="emoji">${safe(p.emoji || "🍽️")}</span>`}
      </div>
      <div class="productInfo">
        <div class="tag">${safe(p.category || "Food")}</div>
        <h3>${safe(p.name)}</h3>
        <p>${safe(p.description || "Fresh and delicious.")}</p>
        <div class="productBottom">
          <span class="price">৳${Number(p.price) || 0}</span>
          <button type="button" class="add"
            onclick="add('${safe(p.id)}')">
            + Add
          </button>
        </div>
      </div>
    </article>
  `).join("") : "<p>No food found.</p>";
}

function setCategory(value) {
  category = value;
  render();
}

function add(id) {
  const product = products.find(p => String(p.id) === String(id));
  if (!product) return;

  if (product.stock !== undefined &&
      Number(product.stock) <= 0) {
    alert("Sorry, this product is out of stock.");
    return;
  }

  const existing = cart.find(p => String(p.id) === String(id));

  if (existing) {
    if (product.stock !== undefined &&
        existing.qty >= Number(product.stock)) {
      alert("Available stock limit reached.");
      return;
    }
    existing.qty++;
  } else {
    cart.push({ ...product, qty: 1 });
  }

  updateCart();
}

function changeQty(id, amount) {
  const item = cart.find(p => String(p.id) === String(id));
  if (!item) return;

  const next = item.qty + amount;

  if (next <= 0) {
    cart = cart.filter(p => p !== item);
  } else {
    if (item.stock !== undefined && next > Number(item.stock)) {
      alert("Available stock limit reached.");
      return;
    }
    item.qty = next;
  }

  updateCart();
}

function updateCart() {
  const count = cart.reduce((sum, p) => sum + p.qty, 0);
  const subtotal = cart.reduce(
    (sum, p) => sum + Number(p.price) * p.qty, 0
  );
  const delivery = subtotal === 0 || subtotal >= 999 ? 0 : 60;

  if ($("cartCount")) $("cartCount").textContent = count;

  if ($("cartItems")) {
    $("cartItems").innerHTML = cart.length
      ? cart.map(p => `
        <div class="cartLine">
          <div>
            <b>${safe(p.name)}</b>
            <br><small>৳${Number(p.price)} each</small>
          </div>
          <div class="qty">
            <button type="button"
              onclick="changeQty('${safe(p.id)}',-1)">−</button>
            ${p.qty}
            <button type="button"
              onclick="changeQty('${safe(p.id)}',1)">+</button>
          </div>
        </div>
      `).join("")
      : "<p>Your cart is empty.</p>";
  }

  if ($("totals")) {
    $("totals").innerHTML = `
      <p>Subtotal: <b>৳${subtotal}</b></p>
      <p>Delivery: <b>৳${delivery}</b></p>
      <p>Total: <b>৳${subtotal + delivery}</b></p>
    `;
  }
}

function openCart() {
  $("drawer")?.classList.add("show");
  $("backdrop")?.classList.add("show");
}

function closeCart() {
  $("drawer")?.classList.remove("show");
  $("backdrop")?.classList.remove("show");
}

function openCheckout() {
  if (!cart.length) {
    alert("Please add food to your cart first.");
    return;
  }

  closeCart();
  $("checkoutModal")?.classList.add("show");
}

function closeCheckout() {
  $("checkoutModal")?.classList.remove("show");
}

function setupPaymentMethods() {
  const select = $("paymentMethod");
  if (!select || select.options.length) return;

  select.innerHTML = `
    <option value="Cash on Delivery">Cash on Delivery</option>
    <option value="bKash">bKash</option>
    <option value="Nagad">Nagad</option>
  `;
}

async function submitOrder(event) {
  event.preventDefault();

  const form = event.currentTarget;

  if (submitting) return;
  if (!cart.length) {
    alert("Your cart is empty.");
    return;
  }

  const button = form.querySelector('button[type="submit"], button:not([type])');
  const formData = new FormData(form);

  const orderData = {
    name: formData.get("name"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    payment: formData.get("paymentMethod"),
    paymentMethod: formData.get("paymentMethod"),
    transactionId: formData.get("transactionId"),
    items: cart.map(p => ({ id: p.id, qty: p.qty }))
  };

  submitting = true;
  if (button) {
    button.disabled = true;
    button.textContent = "Submitting...";
  }

  showMessage("checkoutMessage", "Submitting your order...");

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(orderData)
    });

    const result = await response.json();

    if (!response.ok) {
      throw Error(result.error || "Order could not be submitted.");
    }

    alert(
      "Order successful!\nOrder ID: " +
      (result.orderId || result.id || "") +
      "\nTotal: ৳" + (result.total ?? "")
    );

    cart = [];
    form.reset();
    updateCart();
    closeCheckout();
    showMessage("checkoutMessage", "");

  } catch (error) {
    console.error("Order error:", error);
    showMessage("checkoutMessage", error.message);
    alert("Order Error: " + error.message);
  } finally {
    submitting = false;
    if (button) {
      button.disabled = false;
      button.textContent = "Place order";
    }
  }
}

async function trackOrder(event) {
  event.preventDefault();

  const id = $("trackId")?.value.trim();
  if (!id) return;

  showMessage("trackResult", "Checking order...");

  try {
    const response = await fetch(
      "/api/orders/" + encodeURIComponent(id),
      { cache: "no-store" }
    );

    const result = await response.json();

    if (!response.ok) {
      throw Error(result.error || "Order tracking is not available.");
    }

    const order = result.order || result;

    showMessage(
      "trackResult",
      "Order: " + (order.id || id) +
      " | Status: " + (order.status || "Pending")
    );

  } catch (error) {
    showMessage("trackResult", error.message);
  }
}

function connectEvents() {
  $("search")?.addEventListener("input", render);

  $("cartOpen")?.addEventListener("click", openCart);
  $("cartClose")?.addEventListener("click", closeCart);
  $("backdrop")?.addEventListener("click", closeCart);

  $("checkoutOpen")?.addEventListener("click", openCheckout);
  $("checkoutClose")?.addEventListener("click", closeCheckout);

  $("checkoutForm")?.addEventListener("submit", submitOrder);
  $("trackForm")?.addEventListener("submit", trackOrder);

  $("applyCoupon")?.addEventListener("click", () => {
    showMessage(
      "couponMessage",
      "Please contact the shop to confirm an active coupon."
    );
  });

  if ($("year")) {
    $("year").textContent = new Date().getFullYear();
  }

  setupPaymentMethods();
}

document.addEventListener("DOMContentLoaded", () => {
  connectEvents();
  updateCart();
  init();
});
