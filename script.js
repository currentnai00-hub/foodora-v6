
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
  paymentNumbers: { bKash: "01XXXXXXXXX", Nagad: "01XXXXXXXXX" },
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

function updatePaymentHelp() {
  const method = $("paymentMethod");
  const help = $("paymentHelp");
  if (!method || !help) return;
  const isCOD = ["cash on delivery", "cod"].includes(method.value.toLowerCase());
  const key = method.value.toLowerCase() === "bkash" ? "bKash" : method.value;
  const number = config.paymentNumbers?.[key] || "নম্বর সেট করা হয়নি";
  const box = $("paymentBox");
  const sender = document.querySelector('[name="senderNumber"]');
  const txn = document.querySelector('[name="transactionId"]');
  if (box) box.hidden = isCOD;
  if ($("codHelp")) $("codHelp").hidden = !isCOD;
  if ($("senderNumberLabel")) $("senderNumberLabel").hidden = isCOD;
  if ($("transactionIdLabel")) $("transactionIdLabel").hidden = isCOD;
  if ($("paymentNumber")) $("paymentNumber").textContent = number;
  if (sender) sender.required = !isCOD;
  if (txn) txn.required = !isCOD;
  help.textContent = isCOD
    ? "Cash on Delivery: order পৌঁছালে নগদ টাকা দিন।"
    : method.value + " Personal payment number:";
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

    if (payment) payment.addEventListener("change", updatePaymentHelp);
    updatePaymentHelp();

    $("year").textContent = new Date().getFullYear();

    renderProducts();
    updateCart();

  } catch (error) {
    $("products").textContent =
      "Menu loading failed. Please refresh the page.";
    console.error("Foodora initialization:", error);
  }
}


function foodoraImage(p) {
  const n = ((p.name || "") + " " + (p.category || "")).toLowerCase();

  const photos = [
    [/burger/, "photo-1568901346375-23c9450c58cd"],
    [/pizza/, "photo-1571407970349-bc81e7e96d47"],
    [/chaap|chap|kabab|kebab|boti/, "photo-1544025162-d76694265947"],
    [/chowmein|chow mein|noodle/, "photo-1569718212165-3a8278d5f624"],
    [/grill|bbq|roast/, "photo-1532550907401-a500c9a57435"],
    [/fried rice/, "photo-1512058564366-18510be2db19"],
    [/omelette|omelet|egg/, "photo-1525351484163-7529414344d8"],
    [/thai soup/, "photo-1547592180-85f173990554"],
    [/chicken soup/, "photo-1547592180-85f173990554"],
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

  return "https://images.unsplash.com/" + id +
    "?auto=format&fit=crop&w=900&q=85";
}

function renderProducts() {
  const search = ($("search").value || "").trim().toLowerCase();

  const categories = [
    "All",
    ...new Set(products.map(p => p.category).filter(Boolean))
  ];

  $("categories").innerHTML = categories.map(c => `
    <button class="chip ${category === c ? "active" : ""}"
      data-category="${esc(c)}">${esc(c)}</button>
  `).join("");

  const list = products.filter(p =>
    (p.active !== false) &&
    (category === "All" || p.category === category) &&
    ((p.name || "") + " " + (p.category || "") + " " +
      (p.description || "")).toLowerCase().includes(search)
  );

  $("products").innerHTML = list.length ? list.map(p => {
    const price = Number(p.price) || 0;
    const oldPrice = Number(
      p.originalPrice || p.original_price || p.oldPrice || 0
    );
    const hasDiscount = oldPrice > price && price > 0;
    const percent = hasDiscount
      ? Math.round((oldPrice - price) / oldPrice * 100) : 0;

    const image = p.image && /^https?:\/\//i.test(p.image)
      ? p.image : foodoraImage(p);

    const bestSeller = p.bestSeller === true ||
      p.isBestSeller === true || p.featured === true;

    const stock = Number(p.stock);
    const unavailable = stock <= 0;

    return `
      <article class="product">
        <div class="productPhoto">
          <img src="${esc(image)}"
               alt="${esc(p.name)}"
               loading="lazy"
               decoding="async"
               onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=900&q=85'">

          ${bestSeller
            ? '<span class="v8-badge bestseller">★ BEST SELLER</span>'
            : '<span class="v8-badge">FOODORA SPECIAL</span>'}

          ${hasDiscount
            ? `<span class="v8-discount">${percent}% OFF</span>`
            : ''}
        </div>

        <div class="productInfo">
          <div class="tag">${esc(p.category || "Fresh Food")}</div>
          <h3>${esc(p.name)}</h3>
          <p>${esc(p.description || "Freshly prepared with quality ingredients.")}</p>

          <div class="productBottom">
            <div class="v8-price">
              <span class="price">${money(price)}</span>
              ${hasDiscount
                ? `<del>${money(oldPrice)}</del>`
                : ''}
            </div>

            <button class="add"
              data-add="${esc(p.id)}"
              ${unavailable ? "disabled" : ""}>
              ${unavailable ? "Sold Out" : "+ Add"}
            </button>
          </div>
        </div>
      </article>
    `;
  }).join("") : `
    <div class="v8-empty">
      <div>🍽️</div>
      <h3>No food found</h3>
      <p>Try another food name or category.</p>
    </div>
  `;
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
        senderNumber: data.get("senderNumber"),
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
      " | Payment: " + (order.paymentStatus === "Verified" ? "Payment Successful" : order.paymentStatus) +
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
$("copyPaymentNumber")?.addEventListener("click", async () => {
  const number = $("paymentNumber")?.textContent || "";
  if (!number || number === "নম্বর সেট করা হয়নি") {
    alert("Payment number is not set.");
    return;
  }
  try {
    await navigator.clipboard.writeText(number);
    alert("Payment number copied: " + number);
  } catch {
    alert("Copy failed. Please copy manually: " + number);
  }
});
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

