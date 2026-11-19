(()=>{
 "use strict";
 const $=id=>document.getElementById(id);
 const money=n=>"৳"+Number(n||0).toLocaleString("en-BD");
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const steps=[
  {key:"Pending",title:"Order placed",desc:"We have received your order."},
  {key:"Confirmed",title:"Order confirmed",desc:"Your order has been confirmed."},
  {key:"Preparing",title:"Being prepared",desc:"Our kitchen is preparing your food."},
  {key:"Shipped",title:"On the way",desc:"Your order is on its way to you."},
  {key:"Delivered",title:"Delivered",desc:"Your order has arrived. Enjoy!"}
 ];
 const form=$("trackingForm"),button=$("trackButton"),refreshButton=$("refreshTracking");
 let activeId="",activePhone="",pollTimer=null,etaTimer=null,busy=false,lastStatus="";
 const stopTimers=()=>{if(pollTimer){clearInterval(pollTimer);pollTimer=null;}if(etaTimer){clearInterval(etaTimer);etaTimer=null;}};
 const normalizeStatus=value=>{const s=String(value||"Pending").trim().toLowerCase();if(s==="out for delivery"||s==="shipped")return "Shipped";return steps.find(x=>x.key.toLowerCase()===s)?.key||"Pending";};
 form.addEventListener("submit",async e=>{
  e.preventDefault();
  const id=$("orderId").value.trim(),phone=$("phone").value.replace(/\D/g,"");
  const msg=$("message"),result=$("result");
  msg.textContent="";result.hidden=true;stopTimers();activeId="";activePhone="";lastStatus="";
  if(!id||!/^01[0-9]{9}$/.test(phone)){msg.textContent="Please enter a valid Order ID and 11-digit Bangladeshi mobile number.";return;}
  activeId=id;activePhone=phone;button.disabled=true;button.textContent="Verifying order…";
  try{
   await fetchAndRender(false);
   if(lastStatus!=="Delivered"&&lastStatus!=="Cancelled")pollTimer=setInterval(()=>{if(!document.hidden)fetchAndRender(true)},20000);
   result.hidden=false;result.scrollIntoView({behavior:"smooth",block:"start"});
  }catch(err){msg.textContent=err.message;activeId="";activePhone="";}
  finally{button.disabled=false;button.innerHTML='Track my order <span aria-hidden="true">→</span>';}
 });
 async function fetchAndRender(silent){
  if(busy||!activeId||!activePhone)return;
  busy=true;if(refreshButton)refreshButton.disabled=true;
  try{
   const response=await fetch("/api/orders/track",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({orderId:activeId,phone:activePhone}),cache:"no-store"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Could not find this order. Check your details and try again.");
   const changed=lastStatus&&lastStatus!==data.status;
   lastStatus=String(data.status||"Pending");
   render(data);
   $("result").hidden=false;
   const updated=new Date().toLocaleTimeString("en-BD",{hour:"numeric",minute:"2-digit"});
   $("lastUpdated").textContent="Updated "+updated+" · Automatic refresh every 20 seconds";
   if(silent&&changed){$("statusTitle").setAttribute("aria-label","Order status updated: "+lastStatus);$("statusTitle").focus?.();}
   if(lastStatus==="Delivered"||lastStatus==="Cancelled"){
    if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
    $("lastUpdated").textContent="Order complete · Automatic updates stopped";
   }
  }catch(err){
   if(!silent)throw err;
   $("lastUpdated").textContent="Refresh failed. We’ll try again in 20 seconds.";
  }finally{busy=false;if(refreshButton)refreshButton.disabled=false;}
 }
 refreshButton?.addEventListener("click",()=>fetchAndRender(false).catch(err=>{$("message").textContent=err.message}));
 function render(o){
  const raw=String(o.status||"Pending"),status=normalizeStatus(raw),cancelled=status==="Cancelled",index=steps.findIndex(s=>s.key===status);
  $("statusTitle").textContent=cancelled?"Your order was cancelled":steps[Math.max(0,index)].title;
  $("statusBadge").textContent=cancelled?"Cancelled":raw;
  $("statusBadge").classList.toggle("cancelled",cancelled);
  $("timeline").innerHTML=cancelled
   ?'<div class="step current"><span class="dot">×</span><div><b>Order cancelled</b><small>This order has been cancelled. Contact Foodora Support if you need help.</small></div></div>'
   :steps.map((step,i)=>{const done=i<index||status==="Delivered",active=i===index&&status!=="Delivered";return `<div class="step ${done?"done":""} ${active?"current":""}"><span class="dot">${done?"✓":i+1}</span><div><b>${step.title}</b><small>${step.desc}</small></div></div>`;}).join("");
  const eta=o.estimatedDeliveryAt?new Date(o.estimatedDeliveryAt):null,validEta=eta&&!Number.isNaN(eta.getTime())&&!cancelled&&status!=="Delivered";
  const etaSlot=$("etaSlot");
  etaSlot.innerHTML=validEta?'<section class="eta-card" id="etaCard"><div class="eta-copy"><span>Estimated arrival</span><small>Live estimate · May change with kitchen and delivery conditions</small></div><strong id="etaCountdown" aria-live="off">Calculating…</strong></section>':"";
  if(validEta){
   const tick=()=>{const left=eta.getTime()-Date.now(),node=$("etaCountdown"),card=$("etaCard");if(!node)return; if(left<=0){node.textContent="Arriving soon";card?.classList.add("expired");return;}const total=Math.floor(left/1000),hours=Math.floor(total/3600),mins=Math.floor(total%3600/60),secs=total%60;node.textContent=hours?hours+"h "+mins+"m":mins+"m "+secs+"s";};
   tick();etaTimer=setInterval(tick,1000);
  }else{if(etaTimer){clearInterval(etaTimer);etaTimer=null;}}
  const date=o.createdAt?new Date(o.createdAt).toLocaleString("en-BD",{dateStyle:"medium",timeStyle:"short"}):"—";
  const rows=[["Order ID",o.id],["Order date",date],["Payment method",o.paymentMethod||"—"],["Payment status",o.paymentStatus||"—"],["Subtotal",money(o.subtotal)],["Discount",money(o.discount)],["Delivery fee",money(o.deliveryFee)],["Total amount",money(o.total),true]];
  const cancelHtml=o.canCancel&&!cancelled?'<button id="cancelOrderButton" class="cancel-order-button" type="button">Cancel this order</button><p id="cancelOrderMessage" class="cancel-order-message" role="status" aria-live="polite"></p>':"";
  $("details").innerHTML=rows.map(([key,value,total])=>`<div class="detail-row ${total?"total":""}"><span>${key}</span><strong>${esc(value)}</strong></div>`).join("")+cancelHtml;
  const cancelButton=$("cancelOrderButton");
  if(cancelButton)cancelButton.addEventListener("click",async()=>{
   if(!window.confirm("Are you sure you want to cancel this order?"))return;
   cancelButton.disabled=true;const message=$("cancelOrderMessage");message.textContent="Sending cancellation request…";
   try{
    const response=await fetch("/api/customer/orders/"+encodeURIComponent(o.id)+"/cancel",{method:"POST",headers:{"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify({phone:activePhone})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||"This order could not be cancelled. Please refresh and check its status.");
    message.textContent=result.message||"Your order has been cancelled.";
    await fetchAndRender(true);
   }catch(error){message.textContent=error.message;cancelButton.disabled=false;}
  });
  const items=Array.isArray(o.items)?o.items:[];
  $("items").innerHTML=items.length?items.map(item=>`<div class="item-row"><span>${esc(item.name||"Food item")} × ${Math.max(1,Number(item.qty)||1)}</span><strong>${money(Number(item.price||0)*Math.max(1,Number(item.qty)||1))}</strong></div>`).join(""):'<p class="hint">Product details are not available for this order.</p>';
  const invites=$("reviewInvites");
  if(invites){const links=status==="Delivered"?items.map(item=>`<a href="/food/${encodeURIComponent(item.id)}?orderId=${encodeURIComponent(o.id)}#reviews">${esc(item.name||"পণ্য")} — রিভিউ দিন →</a>`).join(""):"";invites.hidden=!links;invites.innerHTML=links?'<h3>আপনার অর্ডার পৌঁছে গেছে! ⭐</h3><p>প্রতিটি খাবার সম্পর্কে আপনার সৎ মতামত জানান।</p><div>'+links+'</div>':"";}
 }
 window.addEventListener("beforeunload",stopTimers);
})();
