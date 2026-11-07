FOODORA V6 — TERMUX + RENDER DEPLOYMENT (বাংলা)

এই ZIP-এর ফাইলগুলো:
server.js, package.json, render.yaml, .env.example, .gitignore,
index.html, style.css, script.js, admin.html, admin.css, admin.js

লোকাল Termux:
1) ZIP-টি Android Download ফোল্ডারে রাখুন।
2) Termux:
   termux-setup-storage
   mkdir -p ~/FoodoraV6
   cp /sdcard/Download/Foodora_V6_Complete.zip ~/
   unzip -o ~/Foodora_V6_Complete.zip -d ~/FoodoraV6
3) পুরোনো FoodShop-এ বসাতে আগে ব্যাকআপ:
   cd ~/FoodShop
   cp -r . ../FoodShop_V5_backup
4) V6 ফাইল কপি:
   cp ~/FoodoraV6/Foodora_V6/* ~/FoodShop/
   cp ~/FoodoraV6/Foodora_V6/.env.example ~/FoodShop/.env.example
5) Install ও চালু:
   cd ~/FoodShop
   npm install
   node --check server.js
   ADMIN_KEY='নিজের-লম্বা-গোপন-কী' npm start
6) Browser:
   http://127.0.0.1:8080
   http://127.0.0.1:8080/admin.html

RENDER DEPLOYMENT:
A) GitHub account-এ নতুন private repository তৈরি করুন।
B) PC বা Termux থেকে FoodShop-এর V6 files GitHub-এ push করুন। .env, node_modules, data, products.json, orders.json commit করবেন না।
C) Render Dashboard → New → Blueprint → GitHub repository select করুন।
D) render.yaml থেকে Web Service ও PostgreSQL database তৈরি হবে। Free database-এর মেয়াদ/সীমা Render-এর বর্তমান plan অনুযায়ী পরিবর্তিত হতে পারে।
E) Render Environment-এ ADMIN_KEY নিজে শক্তিশালী secret দিয়ে সেট করুন। PAYMENT_NUMBER-এ আপনার merchant/personal payment receive number দিন; PAYMENT_METHODS প্রয়োজনমতো রাখুন।
F) Deploy শেষ হলে Render URL:
   https://your-service-name.onrender.com
   Admin:
   https://your-service-name.onrender.com/admin.html

গুরুত্বপূর্ণ:
- Render-এ PostgreSQL DATABASE_URL সংযুক্ত থাকলে products/orders/coupons/reviews PostgreSQL-এ থাকে।
- DATABASE_URL ছাড়া JSON mode চলে, কিন্তু Render-এর ephemeral filesystem-এ ডেটা deploy/restart-এর পর হারাতে পারে। Production-এ PostgreSQL ব্যবহার করুন।
- Manual payment: গ্রাহক bKash/Nagad-এ নিজে টাকা পাঠাবে, Transaction ID দেবে; Admin Dashboard থেকে Payment Status → Verified করতে হবে। এটি automatic gateway নয়।
- PAYMENT_NUMBER ও ADMIN_KEY কখনো public code-এ লিখবেন না।
- V6-এ customer account/login নেই; order tracking ID দিয়ে কাজ করে।
- Free Render service idle হলে sleep হতে পারে; প্রথম request-এ cold start লাগতে পারে। 24/7 no-sleep uptime-এর জন্য paid instance প্রয়োজন হতে পারে।
- HTTPS Render domain-এ স্বয়ংক্রিয়ভাবে দেওয়া হয়।
- Live launch-এর আগে test order, payment verification, stock, mobile layout পরীক্ষা করুন।
