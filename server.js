const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const COUPONS_FILE = path.join(DATA_DIR, "coupons.json");
const SETTINGS_FILE = path.join(DATA_DIR, "site-settings.json");
const DEFAULT_DELIVERY_SETTINGS = { deliveryFee:70, freeDeliveryFrom:999, areas:[{id:"amirabad",name:"আমিরাবাদ ইউনিয়ন",active:true},{id:"padua",name:"পদুয়া ইউনিয়ন",active:true},{id:"chunti",name:"চুনতি",active:true},{id:"adhunagar",name:"আধুনগর",active:true}] };
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const LEGACY_PAYMENT_NUMBER = process.env.PAYMENT_NUMBER || "01XXXXXXXXX";
const PAYMENT_NUMBERS = {
  bKash: process.env.BKASH_NUMBER || LEGACY_PAYMENT_NUMBER,
  Nagad: process.env.NAGAD_NUMBER || LEGACY_PAYMENT_NUMBER
};
const PAYMENT_METHODS = (process.env.PAYMENT_METHODS || "bKash,Nagad").split(",").map(x => x.trim()).filter(Boolean);
const DELIVERY_FEE = Math.max(0, Number(process.env.DELIVERY_FEE || 60));
const FREE_DELIVERY_FROM = Math.max(0, Number(process.env.FREE_DELIVERY_FROM || 999));
const usePg = Boolean(process.env.DATABASE_URL);
const pool = usePg ? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
}) : null;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(ROOT, { extensions: ["html"] }));

app.get("/food/:id", (req,res) => res.sendFile(path.join(ROOT, "product.html")));

function ensureFile(file, fallback) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
}
function readJson(file, fallback) {
  ensureFile(file, fallback);
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temp = file + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}
function id(prefix) { return prefix + "_" + crypto.randomBytes(5).toString("hex"); }
function clean(s, max = 180) { return String(s ?? "").trim().slice(0, max); }
function money(n) { return Math.max(0, Math.round(Number(n) || 0)); }

async function sendTelegramOrderNotification(order) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_CHAT_ID || "";

  if (!botToken || !chatId) {
    console.warn("Telegram credentials are missing.");
    return;
  }

  const itemLines = order.items.map(item =>
    `• ${item.name} × ${item.qty} — ৳${item.price * item.qty}`
  ).join("\n");

  const message = [
    "🛒 NEW FOODORA ORDER",
    "",
    `Order ID: ${order.id}`,
    `Customer: ${order.name}`,
    `Phone: ${order.phone}`,
    `Address: ${order.address}`,
    "",
    "Items:",
    itemLines,
    "",
    `Subtotal: ৳${order.subtotal}`,
    `Discount: ৳${order.discount}`,
    `Delivery fee: ৳${order.deliveryFee}`,
    `TOTAL: ৳${order.total}`,
    "",
    `Payment: ${order.paymentMethod}`,
    `Payment status: ${order.paymentStatus}`,
    `Order status: ${order.status}`
  ].join("\n").slice(0, 4000);

  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true
      }),
      signal: AbortSignal.timeout(8000)
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.ok) {
    throw new Error(result.description || "Telegram notification failed");
  }
}

function adminOnly(req, res, next) {
  const supplied = req.get("x-admin-key") || "";
  if (!ADMIN_KEY || supplied.length !== ADMIN_KEY.length ||
      !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(ADMIN_KEY))) {
    return res.status(401).json({ error: "Admin authentication failed" });
  }
  next();
}
function defaultProducts() {
  return [
    { id: "p_burger", name: "Classic Beef Burger", category: "Burgers", price: 250, stock: 30, emoji: "🍔", description: "Juicy beef patty, fresh vegetables and house sauce.", active: true },
    { id: "p_kabab", name: "Reshmi Kabab", category: "Kebabs", price: 170, stock: 25, emoji: "🍢", description: "Tender, smoky and freshly grilled.", active: true },
    { id: "p_pizza", name: "Chicken Cheese Pizza", category: "Pizza", price: 520, stock: 15, emoji: "🍕", description: "Cheesy pizza topped with chicken.", active: true },
    { id: "p_fries", name: "Crispy French Fries", category: "Sides", price: 120, stock: 40, emoji: "🍟", description: "Golden crispy potato fries.", active: true },
    { id: "p_drink", name: "Chilled Soft Drink", category: "Drinks", price: 60, stock: 50, emoji: "🥤", description: "Cold and refreshing.", active: true }
  ];
}
function normalProduct(p) {
  return {
    id: clean(p.id, 60) || id("p"),
    name: clean(p.name, 100),
    category: clean(p.category, 60) || "Food",
    price: money(p.price),
    stock: Math.max(0, Math.floor(Number(p.stock ?? 20) || 0)),
    emoji: clean(p.emoji || "🍽️", 8),
    description: clean(p.description, 500),
    image: clean(p.image, 1000),
    mealTime: ["breakfast","lunch","dinner","all"].includes(p.mealTime) ? p.mealTime : "all",
    dietaryTags: Array.isArray(p.dietaryTags) ? [...new Set(p.dietaryTags.map(x=>clean(x,30).toLowerCase()).filter(x=>["vegetarian","sugar-free"].includes(x)))].slice(0,2) : [],
    spicyLevel: ["mild","medium","hot"].includes(p.spicyLevel) ? p.spicyLevel : "medium",
    featured: p.featured === true || p.featured === "true",
    active: p.active !== false
  };
}

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
      price INTEGER NOT NULL, stock INTEGER NOT NULL DEFAULT 0,
      emoji TEXT DEFAULT '🍽️', description TEXT DEFAULT '', image TEXT DEFAULT '',
      active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(),
      meal_time TEXT DEFAULT 'all', dietary_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      spicy_level TEXT DEFAULT 'medium', featured BOOLEAN DEFAULT FALSE
    );
    ALTER TABLE products ADD COLUMN IF NOT EXISTS meal_time TEXT DEFAULT 'all';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS dietary_tags JSONB NOT NULL DEFAULT '[]'::jsonb;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS spicy_level TEXT DEFAULT 'medium';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT FALSE;
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, phone TEXT NOT NULL,
      address TEXT NOT NULL, payment_method TEXT NOT NULL,
      transaction_id TEXT DEFAULT '', payment_status TEXT DEFAULT 'Unverified',
      status TEXT DEFAULT 'Pending', items JSONB NOT NULL,
      subtotal INTEGER NOT NULL, discount INTEGER NOT NULL DEFAULT 0,
      delivery_fee INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL,
      coupon_code TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS coupons (
      code TEXT PRIMARY KEY, type TEXT NOT NULL, value INTEGER NOT NULL,
      min_order INTEGER DEFAULT 0, active BOOLEAN DEFAULT TRUE,
      expires_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY, product_id TEXT NOT NULL, customer_name TEXT NOT NULL,
      rating INTEGER NOT NULL, comment TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query("INSERT INTO site_settings(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO NOTHING",["delivery",JSON.stringify(DEFAULT_DELIVERY_SETTINGS)]);
  const count = await pool.query("SELECT COUNT(*)::int AS n FROM products");
  if (count.rows[0].n === 0) {
    const old = readJson(path.join(ROOT, "products.json"), defaultProducts());
    const products = Array.isArray(old) && old.length ? old : defaultProducts();
    for (const raw of products) {
      const p = normalProduct(raw);
      await pool.query(
        `INSERT INTO products(id,name,category,price,stock,emoji,description,image,active,meal_time,dietary_tags,spicy_level,featured)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13) ON CONFLICT(id) DO NOTHING`,
        [p.id,p.name,p.category,p.price,p.stock,p.emoji,p.description,p.image,p.active,p.mealTime,JSON.stringify(p.dietaryTags),p.spicyLevel,p.featured]
      );
    }
  }
  const cc = await pool.query("SELECT COUNT(*)::int AS n FROM coupons");
  if (cc.rows[0].n === 0) {
    await pool.query("INSERT INTO coupons(code,type,value,min_order,active) VALUES ('WELCOME10','percent',10,300,true),('FOOD50','fixed',50,500,true) ON CONFLICT DO NOTHING");
  }
}
function initJson() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  ensureFile(SETTINGS_FILE, DEFAULT_DELIVERY_SETTINGS);
  const oldProducts = readJson(path.join(ROOT, "products.json"), defaultProducts());
  const products = readJson(PRODUCTS_FILE, Array.isArray(oldProducts) && oldProducts.length ? oldProducts.map(normalProduct) : defaultProducts());
  writeJson(PRODUCTS_FILE, products.map(normalProduct));
  ensureFile(ORDERS_FILE, readJson(path.join(ROOT, "orders.json"), []));
  ensureFile(COUPONS_FILE, [{ code:"WELCOME10", type:"percent", value:10, minOrder:300, active:true }, { code:"FOOD50", type:"fixed", value:50, minOrder:500, active:true }]);
}
async function getProducts(activeOnly = false) {
  if (usePg) {
    const r = await pool.query(`SELECT * FROM products ${activeOnly ? "WHERE active=true" : ""} ORDER BY created_at DESC`);
    return r.rows.map(p => ({ id:p.id,name:p.name,category:p.category,price:p.price,stock:p.stock,emoji:p.emoji,description:p.description,image:p.image,mealTime:p.meal_time||"all",dietaryTags:Array.isArray(p.dietary_tags)?p.dietary_tags:[],spicyLevel:p.spicy_level||"medium",featured:p.featured===true,active:p.active }));
  }
  const rows = readJson(PRODUCTS_FILE, defaultProducts());
  return activeOnly ? rows.filter(p => p.active !== false) : rows;
}
async function getOrders() {
  if (usePg) {
    const r = await pool.query("SELECT * FROM orders ORDER BY created_at DESC");
    return r.rows.map(o => ({ id:o.id,name:o.customer_name,phone:o.phone,address:o.address,paymentMethod:o.payment_method,transactionId:o.transaction_id,paymentStatus:o.payment_status,status:o.status,items:o.items,subtotal:o.subtotal,discount:o.discount,deliveryFee:o.delivery_fee,total:o.total,couponCode:o.coupon_code,createdAt:o.created_at }));
  }
  return readJson(ORDERS_FILE, []);
}
async function couponFor(code) {
  if (!code) return null;
  if (usePg) {
    const r = await pool.query("SELECT * FROM coupons WHERE code=$1 AND active=true AND (expires_at IS NULL OR expires_at>NOW())", [code.toUpperCase()]);
    return r.rows[0] || null;
  }
  return readJson(COUPONS_FILE, []).find(c => c.code.toUpperCase() === code.toUpperCase() && c.active !== false) || null;
}
async function getDeliverySettings() {
  let value;
  if(usePg){const r=await pool.query("SELECT value FROM site_settings WHERE key=$1",["delivery"]);value=r.rows[0]?.value;}
  else value=readJson(SETTINGS_FILE,DEFAULT_DELIVERY_SETTINGS);
  const source=value&&typeof value==="object"?value:DEFAULT_DELIVERY_SETTINGS;
  const areas=Array.isArray(source.areas)?source.areas:DEFAULT_DELIVERY_SETTINGS.areas;
  return {deliveryFee:money(source.deliveryFee??70),freeDeliveryFrom:money(source.freeDeliveryFrom??999),areas:areas.filter(a=>a&&a.active!==false&&clean(a.id,40)&&clean(a.name,80)).map(a=>({id:clean(a.id,40),name:clean(a.name,80),active:true}))};
}
async function saveDeliverySettings(value){
  const deliveryFee=money(value.deliveryFee),freeDeliveryFrom=money(value.freeDeliveryFrom),input=Array.isArray(value.areas)?value.areas:[],seen=new Set();
  const areas=input.map(a=>({id:clean(a.id,40).toLowerCase().replace(/[^a-z0-9_-]/g,""),name:clean(a.name,80),active:a.active!==false})).filter(a=>{if(!a.id||!a.name||seen.has(a.id))return false;seen.add(a.id);return true;});
  if(!areas.length||areas.length>100)throw new Error("At least one delivery area is required (maximum 100).");
  const settings={deliveryFee,freeDeliveryFrom,areas};
  if(usePg)await pool.query("INSERT INTO site_settings(key,value,updated_at) VALUES($1,$2::jsonb,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()",["delivery",JSON.stringify(settings)]);
  else writeJson(SETTINGS_FILE,settings);
  return settings;
}
function couponDiscount(coupon, subtotal) {
  if (!coupon || subtotal < Number(coupon.min_order ?? coupon.minOrder ?? 0)) return 0;
  const value = Number(coupon.value) || 0;
  return Math.min(subtotal, coupon.type === "percent" ? Math.floor(subtotal * value / 100) : value);
}

app.get("/api/health", (req,res) => res.json({ ok:true, app:"Foodora V6", database:usePg ? "postgresql" : "local-json", time:new Date().toISOString() }));
app.get("/api/config",async(req,res)=>{try{const delivery=await getDeliverySettings();res.set("Cache-Control","no-store");res.json({paymentNumbers:PAYMENT_NUMBERS,paymentMethods:PAYMENT_METHODS,...delivery});}catch{res.status(500).json({error:"Store settings unavailable"});}});
app.get("/api/products", async (req,res) => {
  try { res.json(await getProducts(true)); } catch(e) { res.status(500).json({error:"Could not load products"}); }
});
app.get("/api/products/:id/reviews", async (req,res) => {
  try {
    if (usePg) {
      const r = await pool.query("SELECT id,customer_name AS name,rating,comment,created_at FROM reviews WHERE product_id=$1 ORDER BY created_at DESC LIMIT 30", [req.params.id]);
      return res.json(r.rows);
    }
    const all = readJson(path.join(DATA_DIR,"reviews.json"), []);
    res.json(all.filter(x => x.productId === req.params.id).slice(-30).reverse());
  } catch { res.status(500).json({error:"Could not load reviews"}); }
});
app.post("/api/products/:id/reviews", async (req,res) => {
  const name=clean(req.body.name,80), rating=Number(req.body.rating), comment=clean(req.body.comment,500);
  if (!name || !Number.isInteger(rating) || rating<1 || rating>5) return res.status(400).json({error:"Name and a 1–5 rating are required"});
  try {
    const products=await getProducts(true);
    if (!products.some(p=>p.id===req.params.id)) return res.status(404).json({error:"Product not found"});
    const review={id:id("r"),productId:req.params.id,name,rating,comment,createdAt:new Date().toISOString()};
    if (usePg) await pool.query("INSERT INTO reviews(id,product_id,customer_name,rating,comment) VALUES($1,$2,$3,$4,$5)",[review.id,review.productId,name,rating,comment]);
    else { const f=path.join(DATA_DIR,"reviews.json"); const a=readJson(f,[]); a.push(review); writeJson(f,a); }
    res.status(201).json({ok:true,review});
  } catch { res.status(500).json({error:"Review could not be saved"}); }
});
app.post("/api/coupons/validate", async (req,res) => {
  const code=clean(req.body.code,40).toUpperCase(), subtotal=money(req.body.subtotal);
  try {
    const c=await couponFor(code);
    if (!c) return res.status(404).json({error:"Coupon is invalid or expired"});
    const min=Number(c.min_order ?? c.minOrder ?? 0);
    if (subtotal<min) return res.status(400).json({error:`Minimum order ৳${min}`});
    res.json({code,discount:couponDiscount(c,subtotal)});
  } catch { res.status(500).json({error:"Coupon validation failed"}); }
});
app.post("/api/orders", async (req,res) => {
  const name=clean(req.body.name,80), phone=clean(req.body.phone,25), address=clean(req.body.address,400);
  const deliveryAreaId=clean(req.body.deliveryArea,40);
  const paymentMethod=clean(req.body.paymentMethod,30), transactionId=clean(req.body.transactionId,80);
  const input=Array.isArray(req.body.items) ? req.body.items : [];
  if (!name || !/^01[0-9]{9}$/.test(phone) || !address || !PAYMENT_METHODS.includes(paymentMethod) || !input.length)
    return res.status(400).json({error:"Name, valid BD phone, address, payment method and cart items are required"});
  try {
    const deliverySettings=await getDeliverySettings();
    const deliveryArea=deliverySettings.areas.find(area=>area.id===deliveryAreaId);
    if(!deliveryArea)return res.status(400).json({error:"এই এলাকায় আপাতত ডেলিভারি চালু নেই। তালিকা থেকে এলাকা নির্বাচন করুন।"});
    const products=await getProducts(true), normalized=[];
    for (const item of input) {
      const p=products.find(x=>x.id===item.id);
      const qty=Math.max(0,Math.min(50,Math.floor(Number(item.qty)||0)));
      if (!p || !qty) return res.status(400).json({error:"Invalid product or quantity"});
      if (p.stock < qty) return res.status(400).json({error:`Only ${p.stock} left for ${p.name}`});
      const existing=normalized.find(x=>x.id===p.id);
      if (existing) existing.qty+=qty;
      else normalized.push({id:p.id,name:p.name,price:p.price,qty});
    }
    for (const item of normalized) {
      const p=products.find(x=>x.id===item.id);
      if (p.stock<item.qty) return res.status(400).json({error:`Insufficient stock for ${p.name}`});
    }
    const subtotal=normalized.reduce((s,x)=>s+x.price*x.qty,0);
    const code=clean(req.body.couponCode,40).toUpperCase();
    const coupon=await couponFor(code);
    if (code && !coupon) return res.status(400).json({error:"Coupon invalid or expired"});
    const discount=couponDiscount(coupon,subtotal);
    const deliveryFee=subtotal-discount>=deliverySettings.freeDeliveryFrom ? 0 : deliverySettings.deliveryFee;
    const fullAddress=deliveryArea.name+" — "+address;
    const total=subtotal-discount+deliveryFee;
    const order={id:id("FD"),name,phone,address:fullAddress,deliveryArea:deliveryArea.name,paymentMethod,transactionId,paymentStatus:transactionId?"Pending verification":"Awaiting payment",status:"Pending",items:normalized,subtotal,discount,deliveryFee,total,couponCode:code,createdAt:new Date().toISOString()};
    if (usePg) {
      const client=await pool.connect();
      try {
        await client.query("BEGIN");
        for (const item of normalized) {
          const r=await client.query("UPDATE products SET stock=stock-$1 WHERE id=$2 AND stock >= $1",[item.qty,item.id]);
          if (!r.rowCount) throw new Error("Stock changed; please refresh your cart");
        }
        await client.query(`INSERT INTO orders(id,customer_name,phone,address,payment_method,transaction_id,payment_status,status,items,subtotal,discount,delivery_fee,total,coupon_code)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
          [order.id,name,phone,fullAddress,paymentMethod,transactionId,order.paymentStatus,order.status,JSON.stringify(normalized),subtotal,discount,deliveryFee,total,code]);
        await client.query("COMMIT");
      } catch(e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
    } else {
      const latest=readJson(PRODUCTS_FILE,[]);
      for (const item of normalized) { const p=latest.find(x=>x.id===item.id); if (!p || p.stock<item.qty) return res.status(409).json({error:"Stock changed; refresh and try again"}); p.stock-=item.qty; }
      writeJson(PRODUCTS_FILE,latest);
      const orders=readJson(ORDERS_FILE,[]); orders.unshift(order); writeJson(ORDERS_FILE,orders);
    }
    
    sendTelegramOrderNotification(order).catch(err => {
      console.error("Telegram order notification failed:", err.message);
    });

    const isCashOnDelivery =
      paymentMethod.toLowerCase() === "cash on delivery";

    const selectedPaymentNumber = isCashOnDelivery
      ? null
      : PAYMENT_NUMBERS[paymentMethod];

    const instructions = isCashOnDelivery
      ? "Pay cash when your order is delivered."
      : `Send ৳${total} to ${selectedPaymentNumber} using ${paymentMethod} (manual payment). Then share the Transaction ID.`;

    res.status(201).json({
      ok: true,
      order: {
        id: order.id,
        total: order.total,
        status: order.status,
        paymentStatus: order.paymentStatus
      },
      payment: {
        method: paymentMethod,
        number: selectedPaymentNumber,
        instructions
      }
    });
  } catch(e) { console.error(e); res.status(500).json({error:e.message || "Order could not be placed"}); }
});
app.post("/api/orders/track", async (req,res) => {
  try {
    const orderId = clean(req.body.orderId,60).toLowerCase();
    const phone = String(req.body.phone || "").replace(/\D/g, "");
    if (!orderId || !/^01[0-9]{9}$/.test(phone))
      return res.status(400).json({error:"Enter your Order ID and the 11-digit checkout phone number."});
    const orders=await getOrders();
    const o=orders.find(x=>String(x.id).toLowerCase()===orderId);
    if (!o || String(o.phone || "").replace(/\D/g, "") !== phone)
      return res.status(404).json({error:"We couldn't find an order with those details. Check your Order ID and phone number."});
    res.set("Cache-Control", "no-store");
    res.set("Referrer-Policy", "no-referrer");
    res.json({
      id:o.id, status:o.status, paymentStatus:o.paymentStatus,
      paymentMethod:o.paymentMethod || o.payment || "", createdAt:o.createdAt || o.created_at,
      items:Array.isArray(o.items)?o.items:[], subtotal:Number(o.subtotal||0),
      discount:Number(o.discount||0), deliveryFee:Number(o.deliveryFee ?? o.delivery ?? 0),
      total:Number(o.total||0)
    });
  } catch { res.status(500).json({error:"Tracking is temporarily unavailable. Please try again."}); }
});

app.get("/api/orders/:id", async (req,res) => {
  try {
    const orderId = clean(req.params.id,60).toLowerCase();
    const phone = String(req.query.phone || "").replace(/\D/g, "");
    if (!orderId || !/^01[0-9]{9}$/.test(phone))
      return res.status(400).json({error:"Enter your Order ID and the 11-digit checkout phone number."});
    const orders=await getOrders();
    const o=orders.find(x=>String(x.id).toLowerCase()===orderId);
    if (!o || String(o.phone || "").replace(/\D/g, "") !== phone)
      return res.status(404).json({error:"We couldn't find an order with those details. Check your Order ID and phone number."});
    res.set("Cache-Control", "no-store");
    res.json({
      id:o.id, name:o.name, status:o.status, paymentStatus:o.paymentStatus,
      paymentMethod:o.paymentMethod || o.payment || "", createdAt:o.createdAt || o.created_at,
      items:Array.isArray(o.items)?o.items:[], subtotal:Number(o.subtotal||0),
      discount:Number(o.discount||0), deliveryFee:Number(o.deliveryFee ?? o.delivery ?? 0),
      total:Number(o.total||0)
    });
  } catch { res.status(500).json({error:"Tracking is temporarily unavailable. Please try again."}); }
});

// Admin APIs
app.get("/api/admin/delivery-settings",adminOnly,async(req,res)=>{try{res.set("Cache-Control","no-store");res.json(await getDeliverySettings());}catch{res.status(500).json({error:"Delivery settings unavailable"});}});
app.put("/api/admin/delivery-settings",adminOnly,async(req,res)=>{try{const settings=await saveDeliverySettings(req.body||{});res.json({ok:true,...settings});}catch(e){res.status(400).json({error:e.message||"Delivery settings could not be saved"});}});
app.get("/api/admin/summary",adminOnly,async(req,res)=>{
  try {
    const [products,orders]=await Promise.all([getProducts(),getOrders()]);
    const today=new Date().toISOString().slice(0,10);
    res.json({products:products.length,activeProducts:products.filter(p=>p.active!==false).length,orders:orders.length,revenue:orders.filter(o=>o.status!=="Cancelled").reduce((s,o)=>s+Number(o.total||0),0),todayOrders:orders.filter(o=>String(o.createdAt).slice(0,10)===today).length,lowStock:products.filter(p=>p.stock<=5).length});
  } catch { res.status(500).json({error:"Summary unavailable"}); }
});
app.get("/api/admin/analytics",adminOnly,async(req,res)=>{
  try {
    const orders=await getOrders();
    const dateKey=value=>{
      const date=value?new Date(value):null;
      if(!date||Number.isNaN(date.getTime()))return "";
      const parts=new Intl.DateTimeFormat("en-CA",{
        timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"
      }).formatToParts(date);
      const part=type=>parts.find(x=>x.type===type)?.value||"";
      return part("year")+"-"+part("month")+"-"+part("day");
    };
    const todayKey=dateKey(new Date());
    const todayUtcMidnight=new Date(todayKey+"T00:00:00+06:00");
    const days=[];
    const byDay=new Map();
    for(let offset=6;offset>=0;offset--){
      const date=new Date(todayUtcMidnight);
      date.setUTCDate(date.getUTCDate()-offset);
      const key=dateKey(date);
      const label=new Intl.DateTimeFormat("en-BD",{
        timeZone:"Asia/Dhaka",weekday:"short",day:"numeric"
      }).format(date);
      const item={date:key,label,orders:0,revenue:0};
      days.push(item);
      byDay.set(key,item);
    }
    const statuses={};
    let totalRevenue=0,totalOrders=0;
    for(const order of orders){
      const status=clean(order.status||"Pending",40)||"Pending";
      statuses[status]=(statuses[status]||0)+1;
      const day=byDay.get(dateKey(order.createdAt||order.created_at));
      if(!day)continue;
      const amount=Number(order.total);
      const safeAmount=Number.isFinite(amount)&&amount>0?amount:0;
      day.orders++;
      totalOrders++;
      if(status!=="Cancelled"){
        day.revenue+=safeAmount;
        totalRevenue+=safeAmount;
      }
    }
    res.set("Cache-Control","no-store");
    res.json({days,totalOrders,totalRevenue,statuses});
  } catch {
    res.status(500).json({error:"Analytics unavailable"});
  }
});
app.get("/api/admin/products",adminOnly,async(req,res)=>{ try{res.json(await getProducts());}catch{res.status(500).json({error:"Products unavailable"});} });
app.post("/api/admin/products",adminOnly,async(req,res)=>{
  const p=normalProduct(req.body);
  if(!p.name || !p.price) return res.status(400).json({error:"Product name and price required"});
  try {
    if(usePg) await pool.query(`INSERT INTO products(id,name,category,price,stock,emoji,description,image,active,meal_time,dietary_tags,spicy_level,featured) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,[p.id,p.name,p.category,p.price,p.stock,p.emoji,p.description,p.image,p.active,p.mealTime,JSON.stringify(p.dietaryTags),p.spicyLevel,p.featured]);
    else {const a=readJson(PRODUCTS_FILE,[]);a.unshift(p);writeJson(PRODUCTS_FILE,a);}
    res.status(201).json(p);
  }catch(e){res.status(500).json({error:"Product could not be added"});}
});
app.patch("/api/admin/products/:id",adminOnly,async(req,res)=>{
  try{
    if(usePg){
      const old=(await pool.query("SELECT * FROM products WHERE id=$1",[req.params.id])).rows[0];
      if(!old)return res.status(404).json({error:"Not found"});
      const p=normalProduct({...old,...req.body,id:old.id});
      await pool.query("UPDATE products SET name=$1,category=$2,price=$3,stock=$4,emoji=$5,description=$6,image=$7,active=$8,meal_time=$9,dietary_tags=$10::jsonb,spicy_level=$11,featured=$12 WHERE id=$13",[p.name,p.category,p.price,p.stock,p.emoji,p.description,p.image,p.active,p.mealTime,JSON.stringify(p.dietaryTags),p.spicyLevel,p.featured,p.id]);
      return res.json(p);
    }
    const a=readJson(PRODUCTS_FILE,[]),i=a.findIndex(x=>x.id===req.params.id);
    if(i<0)return res.status(404).json({error:"Not found"});
    a[i]=normalProduct({...a[i],...req.body,id:a[i].id});writeJson(PRODUCTS_FILE,a);res.json(a[i]);
  }catch{res.status(500).json({error:"Update failed"});}
});
app.delete("/api/admin/products/:id",adminOnly,async(req,res)=>{
  try{
    if(usePg) await pool.query("UPDATE products SET active=false WHERE id=$1",[req.params.id]);
    else {const a=readJson(PRODUCTS_FILE,[]);const p=a.find(x=>x.id===req.params.id);if(!p)return res.status(404).json({error:"Not found"});p.active=false;writeJson(PRODUCTS_FILE,a);}
    res.json({ok:true});
  }catch{res.status(500).json({error:"Delete failed"});}
});
app.get("/api/admin/orders",adminOnly,async(req,res)=>{try{res.json(await getOrders());}catch{res.status(500).json({error:"Orders unavailable"});}});
app.patch("/api/admin/orders/:id",adminOnly,async(req,res)=>{
  const allowed=["Pending","Confirmed","Preparing","Shipped","Out for delivery","Delivered","Cancelled"];
  const status=clean(req.body.status,40), paymentStatus=clean(req.body.paymentStatus,40);
  if(status && !allowed.includes(status))return res.status(400).json({error:"Invalid order status"});
  if(paymentStatus && !["Awaiting payment","Pending verification","Verified","Rejected"].includes(paymentStatus))return res.status(400).json({error:"Invalid payment status"});
  try{
    if(usePg){
      const r=await pool.query("UPDATE orders SET status=COALESCE(NULLIF($1,''),status),payment_status=COALESCE(NULLIF($2,''),payment_status) WHERE id=$3 RETURNING id,status,payment_status",[status,paymentStatus,req.params.id]);
      if(!r.rowCount)return res.status(404).json({error:"Order not found"});
      if(status==="Cancelled") {
        const o=(await pool.query("SELECT items FROM orders WHERE id=$1",[req.params.id])).rows[0];
      }
      return res.json({ok:true,...r.rows[0]});
    }
    const a=readJson(ORDERS_FILE,[]),o=a.find(x=>x.id===req.params.id);if(!o)return res.status(404).json({error:"Order not found"});
    if(status)o.status=status;if(paymentStatus)o.paymentStatus=paymentStatus;writeJson(ORDERS_FILE,a);res.json({ok:true,order:o});
  }catch{res.status(500).json({error:"Order update failed"});}
});
app.get("/api/admin/coupons",adminOnly,async(req,res)=>{
  try{if(usePg){const r=await pool.query("SELECT code,type,value,min_order AS \"minOrder\",active,expires_at AS \"expiresAt\" FROM coupons ORDER BY code");return res.json(r.rows);}res.json(readJson(COUPONS_FILE,[]));}catch{res.status(500).json({error:"Coupons unavailable"});}
});
app.post("/api/admin/coupons",adminOnly,async(req,res)=>{
  const code=clean(req.body.code,40).toUpperCase(),type=req.body.type==="percent"?"percent":"fixed",value=money(req.body.value),minOrder=money(req.body.minOrder);
  if(!code||!value|| (type==="percent"&&value>100))return res.status(400).json({error:"Valid coupon details required"});
  try{if(usePg)await pool.query("INSERT INTO coupons(code,type,value,min_order,active) VALUES($1,$2,$3,$4,true) ON CONFLICT(code) DO UPDATE SET type=$2,value=$3,min_order=$4,active=true",[code,type,value,minOrder]);else{const a=readJson(COUPONS_FILE,[]);const i=a.findIndex(x=>x.code===code);const c={code,type,value,minOrder,active:true};if(i>=0)a[i]=c;else a.push(c);writeJson(COUPONS_FILE,a);}res.status(201).json({code,type,value,minOrder,active:true});}catch{res.status(500).json({error:"Coupon save failed"});}
});
app.get("/api/admin/reviews",adminOnly,async(req,res)=>{
  try{if(usePg){const r=await pool.query("SELECT id,product_id AS \"productId\",customer_name AS name,rating,comment,created_at AS \"createdAt\" FROM reviews ORDER BY created_at DESC");return res.json(r.rows);}res.json(readJson(path.join(DATA_DIR,"reviews.json"),[]));}catch{res.status(500).json({error:"Reviews unavailable"});}
});

async function start(){
  if(usePg) await initDb(); else initJson();
  app.listen(PORT,"0.0.0.0",()=>console.log(`Foodora V6 running on port ${PORT} | DB: ${usePg?"PostgreSQL":"local JSON"}`));
}
start().catch(err=>{console.error("Startup failed:",err);process.exit(1);});
