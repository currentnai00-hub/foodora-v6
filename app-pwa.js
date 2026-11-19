(()=>{
 "use strict";
 if(!("serviceWorker" in navigator))return;
 let installPrompt=null;
 const installButton=document.createElement("button");
 installButton.type="button";
 installButton.className="foodora-install-cta";
 installButton.textContent="＋ অ্যাপ ইনস্টল";
 installButton.setAttribute("aria-label","Install Foodora on this device");
 installButton.hidden=true;
 document.body.appendChild(installButton);
 const isStandalone=()=>window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;
 if(!isStandalone()){
  window.addEventListener("beforeinstallprompt",event=>{
   event.preventDefault();installPrompt=event;installButton.hidden=false;
  });
 }
 installButton.addEventListener("click",async()=>{
  if(!installPrompt)return;
  installButton.disabled=true;
  try{
   await installPrompt.prompt();
   const choice=await installPrompt.userChoice;
   if(choice?.outcome==="accepted")installButton.hidden=true;
  }catch(_){}
  installPrompt=null;installButton.disabled=false;
 });
 window.addEventListener("appinstalled",()=>{
  installButton.hidden=true;installPrompt=null;
 });
 window.addEventListener("load",()=>{
  navigator.serviceWorker.register("/sw.js",{scope:"/"})
   .then(registration=>{
    registration.addEventListener("updatefound",()=>{
     const worker=registration.installing;
     if(worker)worker.addEventListener("statechange",()=>{
      if(worker.state==="installed"&&navigator.serviceWorker.controller){
       const notice=document.createElement("div");
       notice.className="foodora-update-notice";
       notice.textContent="Foodora আপডেট প্রস্তুত। নতুন সংস্করণ পেতে পেজটি রিফ্রেশ করুন।";
       document.body.appendChild(notice);
      }
     });
    });
   }).catch(()=>{});
 });
 const style=document.createElement("style");
 style.textContent=".foodora-install-cta{position:fixed;z-index:9998;right:16px;bottom:18px;border:0;border-radius:999px;padding:12px 17px;background:#102c23;color:#fff;font:700 13px 'Hind Siliguri',sans-serif;box-shadow:0 8px 28px #102c2350;cursor:pointer}.foodora-install-cta[hidden]{display:none}.foodora-install-cta:disabled{opacity:.6}.foodora-update-notice{position:fixed;z-index:9999;left:16px;right:16px;bottom:75px;padding:12px 15px;border-radius:12px;background:#183d32;color:#fff;text-align:center;font:600 12px 'Hind Siliguri',sans-serif;box-shadow:0 8px 28px #0003}@media(min-width:760px){.foodora-install-cta{right:24px;bottom:24px}}";
 document.head.appendChild(style);
})();