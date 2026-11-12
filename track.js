(()=>{
 const $=id=>document.getElementById(id), money=n=>"৳"+Number(n||0).toLocaleString("en-BD");
 const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const steps=[
  {key:"Pending",title:"Order Placed",desc:"We have received your order."},
  {key:"Confirmed",title:"Confirmed",desc:"Your order has been confirmed."},
  {key:"Preparing",title:"Processing",desc:"Our kitchen is preparing your food."},
  {key:"Shipped",title:"Shipped",desc:"Your order is on its way."},
  {key:"Delivered",title:"Delivered",desc:"Your order has been delivered. Enjoy!"}
 ];
 const form=$("trackingForm");
 form.addEventListener("submit",async e=>{
  e.preventDefault();const id=$("orderId").value.trim(),phone=$("phone").value.replace(/\D/g,"");
  const msg=$("message"),btn=$("trackButton"),result=$("result");msg.textContent="";result.hidden=true;
  if(!id||!/^01[0-9]{9}$/.test(phone)){msg.textContent="Please enter a valid Order ID and 11-digit Bangladeshi mobile number.";return;}
  btn.disabled=true;btn.textContent="CHECKING YOUR ORDER…";
  try{const r=await fetch(`/api/orders/${encodeURIComponent(id)}?phone=${encodeURIComponent(phone)}`,{headers:{Accept:"application/json"},cache:"no-store"});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||"Could not find this order.");render(data);result.hidden=false;result.scrollIntoView({behavior:"smooth",block:"start"});}
  catch(err){msg.textContent=err.message;}
  finally{btn.disabled=false;btn.innerHTML='TRACK MY ORDER <span>→</span>';}
 });
 function render(o){
  const raw=String(o.status||"Pending");const status=raw==="Out for delivery"?"Shipped":raw;const cancelled=status==="Cancelled";const current=steps.findIndex(s=>s.key===status);const index=current<0?0:current;
  $("statusTitle").textContent=cancelled?"Order cancelled":steps[index].title;
  $("statusBadge").textContent=cancelled?"Cancelled":status;
  $("statusBadge").classList.toggle("cancelled",cancelled);
  const timeline=$("timeline");
  if(cancelled){timeline.innerHTML='<div class="step current"><span class="dot">×</span><div><b>Order Cancelled</b><small>This order has been cancelled. Please contact Foodora if you need help.</small></div></div>';}
  else timeline.innerHTML=steps.map((s,i)=>{const done=i<index||status==="Delivered";const active=i===index&&status!=="Delivered";return `<div class="step ${done?"done":""} ${active?"current":""}"><span class="dot">${done?"✓":i+1}</span><div><b>${s.title}</b><small>${s.desc}</small></div></div>`}).join("");
  const date=o.createdAt?new Date(o.createdAt).toLocaleString("en-BD",{dateStyle:"medium",timeStyle:"short"}):"—";
  const rows=[["Order ID",o.id],["Order date",date],["Payment",o.paymentMethod||"—"],["Payment status",o.paymentStatus||"—"],["Subtotal",money(o.subtotal)],["Discount",money(o.discount)],["Delivery fee",money(o.deliveryFee)],["Total amount",money(o.total),true]];
  $("details").innerHTML=rows.map(([k,v,total])=>`<div class="detail-row ${total?"total":""}"><span>${k}</span><strong>${esc(v)}</strong></div>`).join("");
  const items=Array.isArray(o.items)?o.items:[];
  $("items").innerHTML=items.length?items.map(i=>`<div class="item-row"><span>${esc(i.name||"Food item")} × ${Number(i.qty||1)}</span><strong>${money(Number(i.price||0)*Number(i.qty||1))}</strong></div>`).join(""):'<p class="hint">No product details available.</p>';
 }
})();