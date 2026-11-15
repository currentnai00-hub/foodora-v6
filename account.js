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
async function loadDashboard(customer){
  byId("accountAuth").hidden=true;byId("accountDashboard").hidden=false;
  byId("customerGreeting").textContent="স্বাগতম, "+customer.name;
  byId("customerPhone").textContent=customer.phone;
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
