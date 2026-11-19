"use strict";
(()=>{
const $=s=>document.querySelector(s),KEY="foodora_ops_admin_key";
const statuses=["Pending","Confirmed","Preparing","Shipped","Out for delivery","Delivered","Cancelled"];
const lanes=[{statuses:["Pending"],label:"New orders"},{statuses:["Confirmed"],label:"Confirmed"},{statuses:["Preparing"],label:"Kitchen / preparation"},{statuses:["Shipped"],label:"Ready for dispatch"},{statuses:["Out for delivery"],label:"On the road"},{statuses:["Delivered","Cancelled"],label:"Completed / cancelled"}];
let key=sessionStorage.getItem(KEY)||"",orders=[],busy=false,timer=null,streamAbort=null,streamRetry=1000;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const isDone=o=>["Delivered","Cancelled"].includes(o.status);
const etaDate=o=>o.estimatedDeliveryAt?new Date(o.estimatedDeliveryAt):null;
const isOverdue=o=>!isDone(o)&&etaDate(o)&&!Number.isNaN(etaDate(o).getTime())&&etaDate(o).getTime()<Date.now();
async function api(url,opts={}){const r=await fetch(url,{...opts,headers:{"Content-Type":"application/json","x-admin-key":key,...(opts.headers||{})},cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Request failed");return d}
function fmtDate(value){if(!value)return "ETA not set";const d=new Date(value);return Number.isNaN(d.getTime())?"ETA unavailable":d.toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}
function visibleOrders(){const q=$("#search").value.trim().toLowerCase(),f=$("#filter").value;return orders.filter(o=>(!q||String(o.id).toLowerCase().includes(q))&&(!f||o.status===f))}
function render(){
const active=orders.filter(o=>!isDone(o));$("#activeCount").textContent=active.length;$("#preparingCount").textContent=orders.filter(o=>o.status==="Preparing").length;$("#deliveryCount").textContent=orders.filter(o=>o.status==="Out for delivery").length;$("#overdueCount").textContent=active.filter(isOverdue).length;
const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka"}).format(new Date());$("#deliveredCount").textContent=orders.filter(o=>o.status==="Delivered").length;
const list=visibleOrders();$("#board").innerHTML=lanes.map(({statuses,label})=>{const items=list.filter(o=>statuses.includes(o.status));return '<section class="lane"><div class="lanehead"><h2>'+label+'</h2><span class="count">'+items.length+'</span></div>'+ (items.length?items.map(card).join(""):'<div class="empty">No orders in this queue</div>')+'</section>'}).join("");
$("#board").querySelectorAll("[data-save]").forEach(b=>b.addEventListener("click",()=>updateOrder(b.dataset.save,b)));
}
function card(o){const overdue=isOverdue(o),eta=etaDate(o),remaining=eta?Math.ceil((eta-Date.now())/60000):null;const mins=Number.isInteger(o.prepMinutes)?o.prepMinutes:"";
return '<article class="order"><div class="order-top"><span class="order-id">'+esc(o.id)+'</span><span class="pill '+(overdue?'overdue':'')+'">'+(overdue?'ETA overdue':esc(o.status))+'</span></div><div class="meta">'+esc(o.items?.length||0)+' item line(s) · ৳'+esc(o.total||0)+'</div><div class="meta">'+esc(fmtDate(o.estimatedDeliveryAt))+(remaining!==null&&!overdue?' · '+remaining+' min remaining':'')+'</div><div class="meta">Placed '+esc(o.createdAt?new Date(o.createdAt).toLocaleString():"time unavailable")+'</div><div class="order-actions"><select data-status="'+esc(o.id)+'">'+statuses.map(s=>'<option '+(o.status===s?'selected':'')+'>'+s+'</option>').join("")+'</select><button data-save="'+esc(o.id)+'">Update</button></div><div class="meta">ETA minutes: <input type="number" min="5" max="240" value="'+esc(mins)+'" placeholder="35" data-eta="'+esc(o.id)+'" style="width:65px;background:#17231c;color:white;border:1px solid #33463a;border-radius:6px;padding:4px"></div></article>'}
async function updateOrder(id,button){if(busy)return;const status=$('[data-status="'+CSS.escape(id)+'"]').value,raw=$('[data-eta="'+CSS.escape(id)+'"]').value;const body={status};if(raw!=="")body.etaMinutes=Number(raw);if(!confirm("Update order "+id+" to "+status+"?"))return;button.disabled=true;try{await api("/api/admin/orders/"+encodeURIComponent(id),{method:"PATCH",body:JSON.stringify(body)});await refresh()}catch(e){alert(e.message)}finally{button.disabled=false}}
async function refresh(){if(busy||!key)return;busy=true;$("#syncState").textContent="Syncing…";try{const result=await api("/api/admin/orders");orders=Array.isArray(result)?result:[];render();$("#syncState").textContent="Live · synced "+new Date().toLocaleTimeString()}catch(e){$("#syncState").textContent="Connection issue · "+e.message;if(e.message.toLowerCase().includes("authentication"))logout()}finally{busy=false}}
async function connectLiveEvents(){
 if(!key||streamAbort)return;
 streamAbort=new AbortController();
 try{
  const response=await fetch("/api/admin/events/stream",{headers:{"x-admin-key":key},cache:"no-store",signal:streamAbort.signal});
  if(!response.ok||!response.body)throw Error("Live stream unavailable");
  streamRetry=1000;$("#syncState").textContent="Live · real-time event stream connected";
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="";
  while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let boundary;
   while((boundary=buffer.indexOf("\\n\\n"))>=0){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);if(frame.startsWith(":"))continue;if(/^event: (order\\.|payment\\.)/.test(frame)){refresh();}}
  }
 }catch(error){if(error.name!=="AbortError"&&key)$("#syncState").textContent="Live reconnecting · polling fallback active";}
 finally{streamAbort=null;if(key){const delay=streamRetry;streamRetry=Math.min(streamRetry*2,15000);setTimeout(connectLiveEvents,delay);}}
}
function open(){key=$("#adminKey").value.trim();if(!key)return $("#loginMsg").textContent="Admin key required.";sessionStorage.setItem(KEY,key);refresh().then(()=>{if(orders.length||$("#syncState").textContent.startsWith("Live")){$("#login").hidden=true;$("#dashboard").hidden=false;$("#logoutBtn").hidden=false;connectLiveEvents();}})}
function logout(){key="";sessionStorage.removeItem(KEY);if(streamAbort){streamAbort.abort();streamAbort=null;}if(timer)clearInterval(timer);$("#dashboard").hidden=true;$("#login").hidden=false;$("#logoutBtn").hidden=true;$("#adminKey").value="";$("#syncState").textContent="Not connected"}
$("#loginBtn").addEventListener("click",open);$("#adminKey").addEventListener("keydown",e=>{if(e.key==="Enter")open()});$("#logoutBtn").addEventListener("click",logout);$("#refreshBtn").addEventListener("click",refresh);$("#search").addEventListener("input",render);$("#filter").addEventListener("change",render);
if(key){$("#adminKey").value=key;refresh().then(()=>{if($("#syncState").textContent.startsWith("Live")){$("#login").hidden=true;$("#dashboard").hidden=false;$("#logoutBtn").hidden=false;connectLiveEvents();}})}
timer=setInterval(()=>{if(!$("#dashboard").hidden)refresh()},10000);
})();