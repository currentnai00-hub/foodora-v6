"use strict";
const root=document.getElementById("orderDetail");
const safe=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=value=>"৳"+Number(value||0).toLocaleString("en-BD");
function row(label,value,extra=""){return '<div class="order-detail-row '+extra+'"><span>'+label+'</span><strong>'+value+'</strong></div>';}
async function loadOrder(){
  const id=decodeURIComponent(location.pathname.split("/").pop()||"");
  if(!id){root.innerHTML='<p class="order-detail-error">অর্ডার আইডি পাওয়া যায়নি।</p>';return;}
  try{
    const response=await fetch("/api/customer/orders/"+encodeURIComponent(id),{credentials:"same-origin",headers:{"Accept":"application/json"}});
    const data=await response.json().catch(()=>({}));
    if(response.status===401){location.href="/account";return;}
    if(!response.ok)throw new Error(data.error||"অর্ডারের তথ্য পাওয়া যায়নি।");
    const o=data.order,items=Array.isArray(o.items)?o.items:[];
    const date=o.createdAt?new Date(o.createdAt).toLocaleString("bn-BD",{dateStyle:"full",timeStyle:"short"}):"";
    const itemHtml=items.map(item=>'<div class="order-detail-item"><span>'+safe(item.name)+' × '+Number(item.qty||0)+'</span><strong>'+money(Number(item.price||0)*Number(item.qty||0))+'</strong></div>').join("");
    root.innerHTML='<div class="order-detail-head"><div><h1>অর্ডার #'+safe(o.id)+'</h1><div class="order-detail-muted">'+safe(date)+'</div></div><span class="order-detail-status">'+safe(o.status||"Pending")+'</span></div><h2>অর্ডারের খাবার</h2><div class="order-detail-items">'+(itemHtml||'<p>কোনো আইটেম নেই।</p>')+'</div><div class="order-detail-totals">'+row("খাবারের মূল্য",money(o.subtotal))+row("ছাড়","− "+money(o.discount))+row("ডেলিভারি চার্জ",money(o.deliveryFee))+row("সর্বমোট",money(o.total),"order-detail-grand")+'</div><div class="order-detail-info"><strong>ডেলিভারি ঠিকানা</strong><br>'+safe(o.address)+'<br><strong>পেমেন্ট পদ্ধতি:</strong> '+safe(o.paymentMethod||"—")+'<br><strong>পেমেন্ট অবস্থা:</strong> '+safe(o.paymentStatus||"—")+'</div><p style="margin-top:18px"><a class="account-detail-link" href="/track">অর্ডার ট্র্যাকিং পেজ খুলুন →</a></p>';
  }catch(error){root.innerHTML='<p class="order-detail-error">'+safe(error.message)+'</p><p style="text-align:center"><a href="/account">অ্যাকাউন্টে ফিরে যান</a></p>';}
}
loadOrder();