"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const method = String(params.get("method") || "bKash").toLowerCase() === "nagad" ? "Nagad" : "bKash";
  const theme = method === "bKash" ? "bkash" : "nagad";
  const amount = Math.max(0, Math.round(Number(params.get("amount")) || 0));
  const returnUrl = "/?checkout=1&paymentMethod=" + encodeURIComponent(method);
  $("guideHero").classList.add(theme); $("guideLogo").textContent = method; $("guideTitle").textContent = method + " দিয়ে Send Money করুন";
  $("guideIntro").textContent = method + " অ্যাপ ব্যবহার করে নিচের নম্বরে Send Money করুন।";
  $("guideAmount").textContent = "৳" + amount.toLocaleString("en-BD");
  $("guideCopy").classList.add(theme); $("guideContinue").href = returnUrl; $("guideBack").href = returnUrl;
  const steps = method === "bKash" ? [
    ["bKash অ্যাপ খুলুন","আপনার bKash অ্যাপে লগইন করে Send Money অপশন নির্বাচন করুন।"],
    ["প্রাপকের নম্বর দিন","Foodora-র দেখানো bKash নম্বরটি লিখুন বা কপি করে পেস্ট করুন।"],
    ["টাকার পরিমাণ লিখুন","অর্ডারের দেখানো পরিমাণটি লিখুন। পাঠানোর আগে নম্বর ও পরিমাণ আবার মিলিয়ে নিন।"],
    ["পেমেন্ট নিশ্চিত করুন","অ্যাপের নির্দেশনা অনুসরণ করুন। আপনার PIN কাউকে জানাবেন না।"],
    ["Transaction ID সংরক্ষণ করুন","সফল Send Money-এর পর পাওয়া Transaction ID লিখে রাখুন। Foodora-তে ফিরে checkout ফর্মে সেটি দিন।"]
  ] : [
    ["Nagad অ্যাপ খুলুন","আপনার Nagad অ্যাপে লগইন করে Send Money অপশন নির্বাচন করুন।"],
    ["প্রাপকের নম্বর দিন","Foodora-র দেখানো Nagad নম্বরটি লিখুন বা কপি করে পেস্ট করুন।"],
    ["টাকার পরিমাণ লিখুন","অর্ডারের দেখানো পরিমাণটি লিখুন। পাঠানোর আগে নম্বর ও পরিমাণ আবার মিলিয়ে নিন।"],
    ["পেমেন্ট নিশ্চিত করুন","অ্যাপের নির্দেশনা অনুসরণ করুন। আপনার PIN কাউকে জানাবেন না।"],
    ["Transaction ID সংরক্ষণ করুন","সফল Send Money-এর পর পাওয়া Transaction ID লিখে রাখুন। Foodora-তে ফিরে checkout ফর্মে সেটি দিন।"]
  ];
  $("guideSteps").innerHTML = steps.map(step => '<article class="payment-guide-step"><div><strong>' + step[0] + '</strong><p>' + step[1] + '</p></div></article>').join("");
  $("guideCopy").addEventListener("click", async () => {
    const number = $("guideNumber").textContent.trim();
    if (!number || number.includes("লোড") || number.includes("সেট করা")) return;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(number);
      else { const field=document.createElement("textarea"); field.value=number; field.style.position="fixed"; field.style.opacity="0"; document.body.appendChild(field); field.select(); const ok=document.execCommand("copy"); field.remove(); if(!ok) throw new Error("copy failed"); }
      $("guideCopy").textContent="কপি হয়েছে ✓";
    } catch (_) { $("guideCopy").textContent="কপি হয়নি—নম্বরটি নির্বাচন করুন"; }
  });
  fetch("/api/config",{cache:"no-store"}).then(response=>{if(!response.ok)throw new Error("settings unavailable");return response.json();}).then(config=>{
    const number=String(config.paymentNumbers && config.paymentNumbers[method] || "").trim();
    if(!number || number==="01XXXXXXXXX"){ $("guideNumber").textContent="পেমেন্ট নম্বর এখনো সেট করা হয়নি"; $("guideCopy").disabled=true; $("guideNote").textContent="এই পেমেন্ট পদ্ধতির নম্বর পাওয়া যাচ্ছে না। কোনো অনুমান করা নম্বরে টাকা পাঠাবেন না; Foodora-র সঙ্গে যোগাযোগ করুন।"; $("guideContinue").textContent="Foodora-তে ফিরে যান"; return; }
    $("guideNumber").textContent=number;
  }).catch(()=>{ $("guideNumber").textContent="নম্বর লোড করা যায়নি"; $("guideCopy").disabled=true; $("guideNote").textContent="সেটিংস লোড হয়নি। পেজ রিফ্রেশ করুন অথবা Foodora-তে ফিরে যান।"; });
})();