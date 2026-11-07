let products = [];
let cart = [];
let category = "All";

const $ = id => document.getElementById(id);

function safe(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;",
    '"':"&quot;", "'":"&#39;"
  }[c]));
}

async function init() {
  try {
    const r = await fetch("/api/products");
    if (!r.ok) throw Error("Menu loading failed");
    products = await r.json();
    render();
  } catch (e) {
    $("products").textContent = "Could not load menu. Please refresh.";
  }
}

function render() {
  const term = ($("search")?.value || "").toLowerCase();
  const cats = ["All", ...new Set(products.map(p => p.category))];

  $("categories").innerHTML = cats.map(c =>
    `<button class="category ${category === c ? "active" : ""}"
    onclick="setCategory('${safe(c)}')">${safe(c)}</button>`
  ).join("");

  const list = products.filter(p =>
    (category === "All" || p.category === category) &&
    (p.name + " " + p.category).toLowerCase().includes(term)
  );

  $("products").innerHTML = list.length ? list.map(p => `
    <article class="product">
      <div class="productPhoto">
        <span class="emoji">${safe(p.emoji || "🍽️")}</span>
      </div>
      <div class="productInfo">
        <div class="tag">${safe(p.category)}</div>
        <h3>${safe(p.name)}</h3>
        <p>${safe(p.description || "Fresh and delicious.")}</p>
        <div class="productBottom">
          <span class="price">৳${Number(p.price)}</span>
          <button class="add" onclick="add('${safe(p.id)}')">+ Add</button>
        </div>
      </div>
    </article>
  `).join("") : "<p>No food found.</p>";
}

function setCategory(c) {
  category = c;
  render();
}

function add(id) {
  const p = products.find(x => String(x.id) === String(id));
  if (!p) return alert("Product not found");

  const old = cart.find(x => String(x.id) === String(id));
  if (old) old.qty++;
  else cart.push({...p, qty:1});

  updateCart();
}

function updateCart() {
  const count = cart.reduce((s,p) => s + p.qty, 0);
  const subtotal = cart.reduce((s,p) => s + Number(p.price) * p.qty, 0);
  const delivery = subtotal >= 999 || subtotal === 0 ? 0 : 60;

  $("count").textContent = count;
  $("subtotal").textContent = "৳" + subtotal;
  $("delivery").textContent = "৳" + delivery;
  $("total").textContent = "৳" + (subtotal + delivery);

  $("cartItems").innerHTML = cart.length ? cart.map(p => `
    <div class="cartLine">
      <div><b>${safe(p.name)}</b><br><small>৳${p.price} each</small></div>
      <div class="qty">
        <button onclick="changeQty('${safe(p.id)}',-1)">−</button>
        ${p.qty}
        <button onclick="changeQty('${safe(p.id)}',1)">+</button>
      </div>
    </div>
  `).join("") : "Your basket is empty.";
}

function changeQty(id, n) {
  const p = cart.find(x => String(x.id) === String(id));
  if (!p) return;
  p.qty += n;
  if (p.qty <= 0) cart = cart.filter(x => x !== p);
  updateCart();
}

function openCart() {
  updateCart();
  $("cartModal").classList.add("show");
}

function closeCart() {
  $("cartModal").classList.remove("show");
}

function openCheckout() {
  if (!cart.length) return alert("Add food first!");
  closeCart();
  $("checkoutModal").classList.add("show");
}

function closeCheckout() {
  $("checkoutModal").classList.remove("show");
}

const checkoutForm = $("checkout-form");

if (checkoutForm) {
  checkoutForm.addEventListener("submit", async function(e) {
    e.preventDefault();

    const form = this;
    if (!cart.length) return alert("Your basket is empty.");

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.textContent = "Submitting...";

    const data = new FormData(form);

    try {
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          name: data.get("name"),
          phone: data.get("phone"),
          address: data.get("address"),
          payment: data.get("payment"),
          items: cart.map(p => ({id:p.id, qty:p.qty}))
        })
      });

      const result = await r.json();
      if (!r.ok) throw Error(result.error || "Order failed");

      alert("Order successful!\nOrder ID: " +
        result.orderId + "\nTotal: ৳" + result.total);

      cart = [];
      updateCart();
      form.reset();
      closeCheckout();

    } catch (err) {
      alert("Order Error: " + err.message);
    } finally {
      button.disabled = false;
      button.textContent = "Place Order →";
    }
  });
}

init();
updateCart();
