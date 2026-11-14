(()=>{
 const $=id=>document.getElementById(id);
 const money=n=>"৳"+Number(n||0).toLocaleString("en-BD");
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const steps=[
  {key:"Pending",title:"Order Placed",desc:"We have received your order."},
  {key:"Confirmed",title:"Confirmed",desc:"Your order has been confirmed."},
  {key:"Preparing",title:"Preparing",desc:"Our kitchen is preparing your food."},
  {key:"Shipped",title:"On the way",desc:"Your order is on its way."},
  {key:"Delivered",title:"Delivered",desc:"Your order has been delivered. Enjoy!"}
 ];
 const form=$("trackingForm"),button=$("trackButton"),refreshButton=$("refreshTracking");
 let activeId="",activePhone="",pollTimer=null,busy=false,lastStatus="";
 form.addEventListener("submit",async e=>{
  e.preventDefault();
  const id=$("orderId").value.trim(),phone=$("phone").value.replace(/\D/g,"");
  const msg=$("message"),result=$("result");
  msg.textContent="";result.hidden=true;
  if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
  activeId="";activePhone="";lastStatus="";
  if(!id||!/^01[0-9]{9}$/.test(phone)){msg.textContent="Please enter a valid Order ID and 11-digit Bangladeshi mobile number.";return;}
  activeId=id;activePhone=phone;button.disabled=true;button.textContent="CHECKING YOUR ORDER…";
  try{
   await fetchAndRender(false);
   if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
   if(lastStatus!=="Delivered"&&lastStatus!=="Cancelled")pollTimer=setInterval(()=>{if(!document.hidden)fetchAndRender(true)},20000);
   result.hidden=false;result.scrollIntoView({behavior:"smooth",block:"start"});
  }catch(err){msg.textContent=err.message;activeId="";activePhone="";}
  finally{button.disabled=false;button.innerHTML='TRACK MY ORDER <span>→</span>';}
 });
 async function fetchAndRender(silent){
  if(busy||!activeId||!activePhone)return;
  busy=true;
  if(refreshButton)refreshButton.disabled=true;
  try{
   const response=await fetch("/api/orders/track",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({orderId:activeId,phone:activePhone}),cache:"no-store"});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||"Could not find this order.");
   const changed=lastStatus&&lastStatus!==data.status;
   lastStatus=data.status||"Pending";
   render(data);
   $("result").hidden=false;
   const updated=new Date().toLocaleTimeString("en-BD",{hour:"numeric",minute:"2-digit"});
   $("lastUpdated").textContent="Updated "+updated+" · Refreshes automatically every 20 sec";
   if(silent&&changed)$("statusTitle").setAttribute("aria-label","Order status updated: "+lastStatus);
   if(lastStatus==="Delivered"||lastStatus==="Cancelled"){
    if(pollTimer){clearInterval(pollTimer);pollTimer=null;}
    $("lastUpdated").textContent="Order complete · Live updates stopped";
   }
  }catch(err){
   if(!silent)throw err;
   $("lastUpdated").textContent="Could not refresh just now. Retrying in 20 sec.";
  }finally{
   busy=false;
   if(refreshButton)refreshButton.disabled=false;
  }
 }
 refreshButton?.addEventListener("click",()=>fetchAndRender(false).catch(err=>{$("message").textContent=err.message}));
 function render(o){
  const raw=String(o.status||"Pending");
  const status=raw==="Out for delivery"?"Shipped":raw;
  const cancelled=status==="Cancelled";
  const current=steps.findIndex(s=>s.key===status);
  const index=current<0?0:current;
  $("statusTitle").textContent=cancelled?"Order cancelled":steps[index].title;
  $("statusBadge").textContent=cancelled?"Cancelled":raw;
  $("statusBadge").classList.toggle("cancelled",cancelled);
  const timeline=$("timeline");
  if(cancelled){
   timeline.innerHTML='<div class="step current"><span class="dot">×</span><div><b>Order Cancelled</b><small>This order has been cancelled. Please contact Foodora if you need help.</small></div></div>';
  }else{
   timeline.innerHTML=steps.map((step,i)=>{
    const done=i<index||status==="Delivered",active=i===index&&status!=="Delivered";
    return `<div class="step ${done?"done":""} ${active?"current":""}"><span class="dot">${done?"✓":i+1}</span><div><b>${step.title}</b><small>${step.desc}</small></div></div>`;
   }).join("");
  }
  const date=o.createdAt?new Date(o.createdAt).toLocaleString("en-BD",{dateStyle:"medium",timeStyle:"short"}):"—";
  const rows=[["Order ID",o.id],["Order date",date],["Payment",o.paymentMethod||"—"],["Payment status",o.paymentStatus||"—"],["Subtotal",money(o.subtotal)],["Discount",money(o.discount)],["Delivery fee",money(o.deliveryFee)],["Total amount",money(o.total),true]];
  $("details").innerHTML=rows.map(([key,value,total])=>`<div class="detail-row ${total?"total":""}"><span>${key}</span><strong>${esc(value)}</strong></div>`).join("");
  const items=Array.isArray(o.items)?o.items:[];
  $("items").innerHTML=items.length?items.map(item=>`<div class="item-row"><span>${esc(item.name||"Food item")} × ${Number(item.qty||1)}</span><strong>${money(Number(item.price||0)*Number(item.qty||1))}</strong></div>`).join(""):'<p class="hint">No product details available.</p>';
 }
 window.addEventListener("beforeunload",()=>{if(pollTimer)clearInterval(pollTimer)});
})();