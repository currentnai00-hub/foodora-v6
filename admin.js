let key=sessionStorage.getItem("foodoraAdminKey")||"";
const $=s=>document.querySelector(s),money=n=>"৳"+Number(n||0).toLocaleString("en-BD");
async function req(url,opts={}){const r=await fetch(url,{...opts,headers:{"Content-Type":"application/json","x-admin-key":key,...(opts.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Request failed");return d}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function connect(){try{await loadAll();sessionStorage.setItem("foodoraAdminKey",key);$("#loginPanel").hidden=true;$("#dashboard").hidden=false}catch(e){$("#loginMessage").textContent=e.message}}
$("#loginBtn").onclick=()=>{key=$("#adminKey").value;connect()};$("#adminKey").addEventListener("keydown",e=>{if(e.key==="Enter")$("#loginBtn").click()});
$("#logoutBtn").onclick=()=>{key="";sessionStorage.removeItem("foodoraAdminKey");$("#dashboard").hidden=true;$("#loginPanel").hidden=false;$("#adminKey").value=""};
async function loadAll(){await Promise.all([loadStats(),loadOrders(),loadProducts(),loadCoupons(),loadReviews()])}
async function loadStats(){const s=await req("/api/admin/summary");$("#stats").innerHTML=[["Products",s.products],["Orders",s.orders],["Gross sales",money(s.revenue)],["Low stock",s.lowStock]].map(x=>`<div class="stat-card"><span>${x[0]}</span><b>${x[1]}</b></div>`).join("")}
async function loadOrders(){
  const orders=await req("/api/admin/orders");
  const rows=orders.map(o=>{
    const id=esc(o.id);
    const cod=["cash on delivery","cod"].includes(String(o.paymentMethod||"").toLowerCase());
    const pending=o.paymentStatus==="Pending verification"&&!cod;
    const actions=pending
      ? '<div class="payment-review-actions"><button type="button" class="small-button" data-payment-review="'+id+'" data-action="approve">Verify &amp; approve</button> <button type="button" class="small-button" data-payment-review="'+id+'" data-action="reject">Reject</button></div>'
      : "";
    const items=(o.items||[]).map(i=>esc(i.name)+" × "+i.qty).join("<br>");
    const statusOptions=["Pending","Confirmed","Preparing","Shipped","Out for delivery","Delivered","Cancelled"]
      .map(x=>'<option '+(o.status===x?"selected":"")+'>'+x+'</option>').join("");
    return '<tr><td><b>'+id+'</b><br><small>'+new Date(o.createdAt).toLocaleString()+'</small></td>'+
      '<td>'+esc(o.name)+'<br>'+esc(o.phone)+'<br><small>'+esc(o.address)+'</small></td>'+
      '<td>'+items+'</td><td>'+money(o.total)+'</td>'+
      '<td><b>'+esc(o.paymentStatus||"Unknown")+'</b><br><small>'+esc(o.paymentMethod)+'<br>Sender: '+esc(o.senderNumber||"Not provided")+'<br>Txn ID: '+esc(o.transactionId||"No Txn ID")+'</small>'+actions+'</td>'+
      '<td><select data-status="'+id+'">'+statusOptions+'</select></td>'+
      '<td><button class="small-button" data-save="'+id+'">Save status</button></td></tr>';
  }).join("");
  $("#ordersTable").innerHTML=orders.length
    ? '<table class="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Payment</th><th>Order status</th><th>Save</th></tr></thead><tbody>'+rows+'</tbody></table>'
    : '<p class="empty-admin">No orders yet.</p>';
  $("#ordersTable").querySelectorAll("[data-save]").forEach(button=>button.onclick=async()=>{
    const id=button.dataset.save;
    try{
      await req("/api/admin/orders/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify({status:$('[data-status="'+id+'"]').value})});
      await loadStats();await loadOrders();alert("Order status updated");
    }catch(error){alert(error.message);}
  });
  $("#ordersTable").querySelectorAll("[data-payment-review]").forEach(button=>button.onclick=async()=>{
    const id=button.dataset.paymentReview,action=button.dataset.action;
    const message=action==="approve"
      ? "শুধু bKash/Nagad অ্যাপ বা অনুমোদিত স্টেটমেন্টে আসল লেনদেন, পরিমাণ ও Transaction ID মিলিয়ে থাকলেই Approve করুন। চালিয়ে যাবেন?"
      : "এই পেমেন্ট Reject করতে চান?";
    if(!confirm(message))return;
    button.disabled=true;
    try{
      await req("/api/admin/orders/"+encodeURIComponent(id)+"/payment-review",{
        method:"PATCH",body:JSON.stringify({action,note:action==="approve"?"Payment manually verified by admin":"Payment could not be verified"})
      });
      await loadOrders();await loadStats();alert(action==="approve"?"Payment verified.":"Payment rejected.");
    }catch(error){alert(error.message);button.disabled=false;}
  });
}
async function loadProducts(){const a=await req("/api/admin/products");$("#productsTable").innerHTML=`<table class="admin-table"><thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock</th><th>Active</th><th>Save</th></tr></thead><tbody>${a.map(p=>`<tr><td>${esc(p.emoji)} ${esc(p.name)}<br><small>${esc(p.id)}</small></td><td>${esc(p.category)}</td><td><input type="number" min="1" value="${p.price}" data-price="${esc(p.id)}" style="width:85px"></td><td><input type="number" min="0" value="${p.stock}" data-stock="${esc(p.id)}" style="width:70px"></td><td>${p.active===false?"Hidden":"Visible"}</td><td><button class="small-button" data-product-save="${esc(p.id)}">Save</button> <button class="small-button" data-hide="${esc(p.id)}">Hide</button></td></tr>`).join("")}</tbody></table>`;$("#productsTable").querySelectorAll("[data-product-save]").forEach(b=>b.onclick=async()=>{const id=b.dataset.productSave;try{await req("/api/admin/products/"+id,{method:"PATCH",body:JSON.stringify({price:Number($(`[data-price="${id}"]`).value),stock:Number($(`[data-stock="${id}"]`).value)})});await loadProducts();await loadStats();alert("Product updated")}catch(e){alert(e.message)}});$("#productsTable").querySelectorAll("[data-hide]").forEach(b=>b.onclick=async()=>{if(!confirm("Hide this product?"))return;try{await req("/api/admin/products/"+b.dataset.hide,{method:"DELETE"});loadProducts()}catch(e){alert(e.message)}})}
$("#addProductBtn").onclick=()=>{$("#productForm").hidden=false;$("#productForm").reset()};$("#cancelProduct").onclick=()=>$("#productForm").hidden=true;
$("#productForm").onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget).entries());d.price=Number(d.price);d.stock=Number(d.stock);try{await req("/api/admin/products",{method:"POST",body:JSON.stringify(d)});$("#productForm").hidden=true;await loadProducts();await loadStats()}catch(err){$("#productMessage").textContent=err.message}};
async function loadCoupons(){const a=await req("/api/admin/coupons");$("#couponsTable").innerHTML=a.length?`<table class="admin-table"><tr><th>Code</th><th>Type</th><th>Value</th><th>Minimum order</th><th>Status</th></tr>${a.map(c=>`<tr><td><b>${esc(c.code)}</b></td><td>${esc(c.type)}</td><td>${c.value}</td><td>${money(c.minOrder??c.min_order)}</td><td>${c.active?"Active":"Inactive"}</td></tr>`).join("")}</table>`:'<p class="empty-admin">No coupons.</p>'}
$("#couponForm").onsubmit=async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget).entries());d.value=Number(d.value);d.minOrder=Number(d.minOrder);try{await req("/api/admin/coupons",{method:"POST",body:JSON.stringify(d)});e.currentTarget.reset();loadCoupons()}catch(err){alert(err.message)}};
async function loadReviews(){const a=await req("/api/admin/reviews");$("#reviewsTable").innerHTML=a.length?a.map(r=>`<div class="review-card"><b>${esc(r.name)} · ${"★".repeat(r.rating)}</b><p>${esc(r.comment)}</p><small>${esc(r.productId)}</small></div>`).join(""):'<p class="empty-admin">No reviews yet.</p>'}
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));["orders","products","coupons","reviews"].forEach(x=>$("#"+x+"Tab").hidden=x!==b.dataset.tab)});
if(key){$("#adminKey").value=key;connect()}
