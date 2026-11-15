"use strict";
const byId=id=>document.getElementById(id);
async function accountApi(url,options={}){
  const response=await fetch(url,{...options,credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||"অনুরোধ সম্পন্ন করা যায়নি।");
  return data;
}
function showAuth(mode){
  const login=mode==="login";
  byId("loginForm").hidden=!login;byId("registerForm").hidden=login;
  byId("loginTab").classList.toggle("active",login);byId("registerTab").classList.toggle("active",!login);
  byId("loginTab").setAttribute("aria-selected",String(login));byId("registerTab").setAttribute("aria-selected",String(!login));
}
function money(value){return "৳"+Number(value||0).toLocaleString("en-BD");}
function safe(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}

function startWalletPaymentGuide(){
  const form=byId("walletTopupForm");
  if(!form)return;
  const amount=Number(form.elements.amount.value);
  const method=String(form.elements.paymentMethod.value||"");
  if(!Number.isFinite(amount)||amount<10||amount>100000){
    byId("walletTopupMessage").textContent="আগে ১০ থেকে ১,০০,০০০ টাকার মধ্যে পরিমাণ লিখুন।";
    form.elements.amount.focus();return;
  }
  if(!["bKash","Nagad"].includes(method))return;
  try{sessionStorage.removeItem("foodora_payment_transaction_id");sessionStorage.removeItem("foodora_payment_transaction_saved");}catch(_){}
  const params=new URLSearchParams({context:"wallet",method,amount:String(Math.round(amount))});
  location.href="/payment-guide.html?"+params.toString();
}
function restoreWalletTopupFromGuide(){
  const params=new URLSearchParams(location.search);
  if(params.get("walletTopup")!=="1")return;
  const method=params.get("method");
  const amount=Number(params.get("amount"));
  let transactionId="";
  try{transactionId=sessionStorage.getItem("foodora_payment_transaction_id")||"";}catch(_){}
  if(["bKash","Nagad"].includes(method)&&Number.isInteger(amount)&&amount>=10&&amount<=100000){
    byId("walletTopupForm").elements.amount.value=String(amount);
    byId("walletPaymentMethod").value=method;
    byId("walletTransactionId").value=transactionId;
    byId("walletTopupMessage").textContent=transactionId?"Transaction ID যুক্ত হয়েছে। এখন অনুরোধ জমা দিন।":"Transaction ID পাওয়া যায়নি। পেমেন্ট নির্দেশিকা থেকে আবার লিখে আসুন।";
    byId("walletTopupForm").scrollIntoView({behavior:"smooth",block:"center"});
  }
  history.replaceState({},document.title,"/account");
}
function walletTypeLabel(type){return ({topup:"টাকা জমা",purchase:"অর্ডার পেমেন্ট",refund:"রিফান্ড",adjustment:"সমন্বয়"})[type]||type;}
async function loadWallet(){
  const balance=byId("walletBalance"),transactions=byId("walletTransactions"),topups=byId("walletTopups");
  if(!balance||!transactions||!topups)return;
  try{
    const data=await accountApi("/api/customer/wallet");
    balance.textContent=money(Number(data.balancePaisa||0)/100);
    transactions.innerHTML=data.transactions?.length?data.transactions.map(item=>{
      const positive=["topup","refund","adjustment"].includes(item.type);
      const date=item.createdAt?new Date(item.createdAt).toLocaleString("bn-BD",{dateStyle:"medium",timeStyle:"short"}):"";
      return '<article class="wallet-transaction"><div><strong>'+safe(walletTypeLabel(item.type))+'</strong><small>'+safe(item.description||item.referenceId||"")+' · '+safe(date)+'</small></div><b class="'+(positive?"wallet-credit":"wallet-debit")+'">'+(positive?"+":"−")+money(Number(item.amountPaisa||0)/100)+'</b></article>';
    }).join(""):'<p class="account-empty">এখনো কোনো Wallet লেনদেন নেই।</p>';
    topups.innerHTML=data.topups?.length?data.topups.map(item=>{
      const date=item.createdAt?new Date(item.createdAt).toLocaleString("bn-BD",{dateStyle:"medium",timeStyle:"short"}):"";
      return '<article class="wallet-transaction"><div><strong>'+safe(item.paymentMethod)+' · '+safe(item.transactionId)+'</strong><small>'+safe(date)+(item.reviewNote?' · '+safe(item.reviewNote):"")+'</small></div><span class="wallet-status">'+safe(item.status)+'</span></article>';
    }).join(""):'<p class="account-empty">কোনো জমার অনুরোধ নেই।</p>';
  }catch(error){transactions.innerHTML='<p class="account-empty">'+safe(error.message)+'</p>';}
}
async function loadDashboard(customer){
  byId("accountAuth").hidden=true;byId("accountDashboard").hidden=false;
  byId("customerGreeting").textContent="স্বাগতম, "+customer.name;
  byId("customerPhone").textContent=customer.phone;
  await loadWallet();
  restoreWalletTopupFromGuide();
  const box=byId("accountOrders");box.innerHTML='<p class="account-empty">অর্ডার লোড হচ্ছে…</p>';
  try{
    const data=await accountApi("/api/customer/orders");
    if(!data.orders?.length){box.innerHTML='<p class="account-empty">এখনো কোনো অর্ডার নেই। <a href="/#menu">মেনু থেকে খাবার বেছে নিন।</a></p>';return;}
    box.innerHTML=data.orders.map(order=>{
      const items=Array.isArray(order.items)?order.items:[];
      const itemText=items.map(item=>safe(item.name)+" × "+Number(item.qty||0)).join(" · ");
      const date=order.createdAt?new Date(order.createdAt).toLocaleString("bn-BD",{dateStyle:"medium",timeStyle:"short"}):"";
      const reviewLinks=order.status==="Delivered"?items.map(item=>'<a class="account-detail-link" href="/food/'+encodeURIComponent(item.id)+'?orderId='+encodeURIComponent(order.id)+'#reviews">'+safe(item.name)+'-এর রিভিউ দিন →</a>').join(" "):"";
      const paymentNotice=order.paymentStatus==="Rejected"?'<div class="account-order-reviews"><strong>পেমেন্ট সংশোধন প্রয়োজন</strong><p>'+safe(order.latestPaymentNote||"আপনার Transaction ID আবার জমা দিন।")+'</p></div>':order.paymentStatus==="Verified"?'<div class="account-order-reviews"><strong>✓ পেমেন্ট অনুমোদিত হয়েছে</strong><p>আপনার পেমেন্ট যাচাই সম্পন্ন।</p></div>':order.paymentStatus==="Pending verification"&&Number(order.paymentEventCount||0)>0?'<div class="account-order-reviews"><strong>পেমেন্ট পুনরায় জমা হয়েছে</strong><p>যাচাইয়ের অপেক্ষায় আছে।</p></div>':"";
      return '<article class="account-order"><div class="account-order-top"><strong class="account-order-id">অর্ডার #'+safe(order.id)+'</strong><span class="account-order-status">'+safe(order.status||"Pending")+'</span></div><div class="account-order-meta">'+safe(date)+' · পেমেন্ট: '+safe(order.paymentStatus||"—")+'</div><div class="account-order-items">'+itemText+'</div><div class="account-order-total">মোট '+money(order.total)+'</div><a href="/account/order/'+encodeURIComponent(order.id)+'" class="account-detail-link">বিস্তারিত দেখুন →</a>'+paymentNotice+(reviewLinks?'<div class="account-order-reviews"><strong>আপনার অর্ডার পৌঁছে গেছে—আপনার মতামত জানান:</strong><div>'+reviewLinks+'</div></div>':"")+'</article>';
    }).join("");
  }catch(error){box.innerHTML='<p class="account-empty">'+safe(error.message)+'</p>';}
}
async function checkSession(){
  try{const data=await accountApi("/api/customer/me");await loadDashboard(data.customer);}
  catch(_){byId("accountAuth").hidden=false;byId("accountDashboard").hidden=true;}
}
function bindForm(formId,messageId,url,successText){
  byId(formId).addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector("button[type=submit]"),message=byId(messageId);
    if(!form.reportValidity())return;
    button.disabled=true;message.className="account-message";message.textContent="অনুগ্রহ করে অপেক্ষা করুন…";
    const data=Object.fromEntries(new FormData(form).entries());
    if(data.phone)data.phone=data.phone.replace(/\D/g,"");
    try{const result=await accountApi(url,{method:"POST",body:JSON.stringify(data)});message.className="account-message success";message.textContent=successText;form.reset();await loadDashboard(result.customer);}
    catch(error){message.textContent=error.message;}
    finally{button.disabled=false;}
  });
}

byId("walletRefresh")?.addEventListener("click",loadWallet);
byId("walletPaymentMethod")?.addEventListener("change",startWalletPaymentGuide);
byId("walletTopupForm")?.addEventListener("submit",async event=>{
  event.preventDefault();
  const form=event.currentTarget,button=byId("walletTopupSubmit"),message=byId("walletTopupMessage");
  if(!form.reportValidity())return;
  const data=Object.fromEntries(new FormData(form).entries());
  button.disabled=true;message.textContent="অনুরোধ জমা হচ্ছে…";
  try{
    await accountApi("/api/customer/wallet/topups",{method:"POST",body:JSON.stringify(data)});
    message.className="account-message success";message.textContent="অনুরোধ জমা হয়েছে। যাচাই শেষে ব্যালেন্স আপডেট হবে।";
    form.reset();try{sessionStorage.removeItem("foodora_payment_transaction_id");sessionStorage.removeItem("foodora_payment_transaction_saved");}catch(_){} await loadWallet();
  }catch(error){message.className="account-message";message.textContent=error.message;}
  finally{button.disabled=false;}
});
byId("loginTab").addEventListener("click",()=>showAuth("login"));
byId("registerTab").addEventListener("click",()=>showAuth("register"));
bindForm("loginForm","loginMessage","/api/customer/login","লগইন সফল হয়েছে।");
bindForm("registerForm","registerMessage","/api/customer/register","অ্যাকাউন্ট তৈরি হয়েছে।");
byId("logoutButton").addEventListener("click",async()=>{
  const button=byId("logoutButton");button.disabled=true;
  try{await accountApi("/api/customer/logout",{method:"POST"});byId("accountAuth").hidden=false;byId("accountDashboard").hidden=true;showAuth("login");}
  catch(error){alert(error.message);}
  finally{button.disabled=false;}
});
checkSession();
