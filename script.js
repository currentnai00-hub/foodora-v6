let products=[],cart=[],category="All";

async function init(){
 try{
  const r=await fetch("/api/products");
  if(!r.ok)throw Error("Menu loading failed");
  products=await r.json();
  render();
 }catch(e){
  document.getElementById("products").textContent="Could not load menu. Please refresh.";
 }
}

function render(){
 const term=(document.getElementById("search").value||"").toLowerCase();
 const cats=["All",...new Set(products.map(p=>p.category))];

 document.getElementById("categories").innerHTML=cats.map(c=>
  `<button class="category ${category===c?"active":""}" onclick="setCategory('${safe(c)}')">${safe(c)}</button>`
 ).join("");

 const list=products.filter(p=>
  (category==="All"||p.category===category)&&
  (p.name+" "+p.category).toLowerCase().includes(term)
 );

 document.getElementById("products").innerHTML=list.length?
 list.map(p=>`
  <article class="product">
   <div class="productPhoto"><span class="emoji">${safe(p.emoji||"🍽️")}</span></div>
   <div class="productInfo">
    <div class="tag">${safe(p.category)}</div>
    <h3>${safe(p.name)}</h3>
    <p>${safe(p.description||"Fresh and delicious.")}</p>
    <div class="productBottom">
     <span class="price">৳${Number(p.price)}</span>
     <button class="add" onclick="add('${p.id}')">+ Add</button>
    </div>
   </div>
  </article>
 `).join(""):"<p>No food found. Try another search.</p>";
}

function safe(s){
 return String(s??"").replace(/[&<>"']/g,c=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
 }[c]));
}

function setCategory(c){
 category=c;
 render();
}

function add(id){
 let p=products.find(x=>String(x.id)===String(id));
 if(!p)return;
 let old=cart.find(x=>String(x.id)===String(id));
 old?old.qty++:cart.push({...p,qty:1});
 updateCart();
}

function updateCart(){
 let count=cart.reduce((s,x)=>s+x.qty,0);
 let subtotal=cart.reduce((s,x)=>s+x.price*x.qty,0);
 let delivery=subtotal>=999||subtotal===0?0:60;

 document.getElementById("count").textContent=count;
 document.getElementById("subtotal").textContent="৳"+subtotal;
 document.getElementById("delivery").textContent="৳"+delivery;
 document.getElementById("total").textContent="৳"+(subtotal+delivery);

 document.getElementById("cartItems").innerHTML=cart.length?
 cart.map(p=>`
  <div class="cartLine">
   <div><b>${safe(p.name)}</b><br><small>৳${p.price} each</small></div>
   <div class="qty">
    <button onclick="changeQty('${p.id}',-1)">−</button>
    ${p.qty}
    <button onclick="changeQty('${p.id}',1)">+</button>
   </div>
  </div>
 `).join(""):"Your basket is empty.";
}

function changeQty(id,n){
 let p=cart.find(x=>String(x.id)===String(id));
 if(p){
  p.qty+=n;
  if(p.qty<=0)cart=cart.filter(x=>x!==p);
 }
 updateCart();
}

function openCart(){
 document.getElementById("cartModal").classList.add("show");
}

function closeCart(){
 document.getElementById("cartModal").classList.remove("show");
}

function openCheckout(){
 if(!cart.length)return alert("Add food first!");
 closeCart();
 document.getElementById("checkoutModal").classList.add("show");
}

function closeCheckout(){
 document.getElementById("checkoutModal").classList.remove("show");
}

const checkoutForm=document.getElementById("checkout-form");

checkoutForm.addEventListener("submit",async function(e){
 e.preventDefault();

 // Keep a direct reference to the form before awaiting fetch.
 const form=e.currentTarget;

 if(!cart.length)return alert("Your basket is empty.");

 const button=form.querySelector('button[type="submit"]');
 button.disabled=true;
 button.textContent="Submitting...";

 const data=new FormData(form);

 try{
  const r=await fetch("/api/orders",{
   method:"POST",
   headers:{"Content-Type":"application/json"},
   body:JSON.stringify({
    name:data.get("name"),
    phone:data.get("phone"),
    address:data.get("address"),
    payment:data.get("payment"),
    items:cart.map(p=>({id:p.id,qty:p.qty}))
   })
  });

  const result=await r.json();

  if(!r.ok)throw Error(result.error||"Order failed");

  alert(
   "Order successful!\nOrder ID: "+
   result.orderId+
   "\nTotal: ৳"+
   result.total
  );

  cart=[];
  updateCart();

  // Safe reset: use saved form reference, not e.currentTarget.
  form.reset();

  closeCheckout();

 }catch(err){
  alert("Order Error: "+err.message);
 }finally{
  button.disabled=false;
  button.textContent="Place Order →";
 }
});

init();
updateCart();
