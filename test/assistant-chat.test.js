"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildStoreContext, createRateLimiter, answerFreeAssistant, registerAssistantRoutes } = require("../assistant");

test("assistant context contains safe store data and excludes customer personal data", () => {
  const context = buildStoreContext([{ id:"p1",name:"Burger",category:"Food",stock:2,price:250,active:true }],[{ id:"o1",name:"Private Customer",phone:"01700000000",address:"Private address",total:500,status:"Pending",createdAt:new Date().toISOString() }]);
  const serialized = JSON.stringify(context);
  assert.equal(context.productSummary.lowStockCount,1);
  assert.equal(context.orderSummary.total,1);
  assert.equal(context.products[0].name,"Burger");
  assert.equal(serialized.includes("Private Customer"),false);
  assert.equal(serialized.includes("01700000000"),false);
  assert.equal(serialized.includes("Private address"),false);
});
test("assistant rate limiter blocks requests after configured limit", () => {
  let now=1000; const allow=createRateLimiter({now:()=>now,limit:2,windowMs:100});
  assert.equal(allow("admin"),true); assert.equal(allow("admin"),true); assert.equal(allow("admin"),false);
  now+=101; assert.equal(allow("admin"),true);
});
const sample=buildStoreContext([
  {id:"p1",name:"Burger",category:"Food",stock:3,price:200,active:true},
  {id:"p2",name:"Kebab",category:"Food",stock:0,price:170,active:true},
  {id:"p3",name:"Rice",category:"Food",stock:20,price:80,active:true}
],[
  {id:"o1",name:"Private Customer",phone:"01811111111",address:"Private",total:300,status:"Pending",createdAt:new Date().toISOString()},
  {id:"o2",total:500,status:"Delivered",createdAt:new Date().toISOString()}
]);
test("free assistant reports low-stock products in Bangla",()=>{
  const answer=answerFreeAssistant("কোন পণ্যের স্টক কম?",sample);
  assert.match(answer,/Burger/); assert.match(answer,/3টি/);
  assert.doesNotMatch(answer,/Private Customer|01811111111|Private/);
});
test("free assistant reports out-of-stock products",()=>{
  assert.match(answerFreeAssistant("Show out of stock products",sample),/Kebab/);
});
test("free assistant reports order aggregates without customer data",()=>{
  const answer=answerFreeAssistant("মোট অর্ডার কত?",sample);
  assert.match(answer,/মোট অর্ডার: 2টি/);
  assert.doesNotMatch(answer,/Private Customer|01811111111|Private/);
});
test("free assistant explains scope for unsupported questions",()=>{
  const answer=answerFreeAssistant("Tell me a poem about the moon",sample);
  assert.match(answer,/rule-based assistant/);
});
function harness(products=[],orders=[]){
  const routes={}; const app={get(p,...h){routes["GET "+p]=h.at(-1);},post(p,...h){routes["POST "+p]=h.at(-1);}};
  registerAssistantRoutes({app,adminOnly:(_q,_s,n)=>n(),getProducts:async()=>products,getOrders:async()=>orders,env:{}});
  return routes;
}
async function invoke(handler,body={}){
  const res={statusCode:200,headers:{},status(c){this.statusCode=c;return this;},set(k,v){this.headers[k]=v;return this;},json(v){this.body=v;return this;}};
  await handler({body,ip:"127.0.0.1",socket:{}},res); return res;
}
test("chat endpoint works without a paid API key",async()=>{
  const routes=harness([{id:"p1",name:"Burger",stock:2,price:200,active:true}]);
  const res=await invoke(routes["POST /api/admin/assistant/chat"],{message:"স্টকের অবস্থা কী?"});
  assert.equal(res.statusCode,200); assert.equal(res.body.mode,"free-rule-based-read-only");
  assert.match(res.body.answer,/Burger|কম স্টক/); assert.equal(res.headers["Cache-Control"],"no-store");
});
test("chat endpoint validates message length and empty messages",async()=>{
  const routes=harness();
  assert.equal((await invoke(routes["POST /api/admin/assistant/chat"],{message:"x".repeat(1201)})).statusCode,400);
  assert.equal((await invoke(routes["POST /api/admin/assistant/chat"],{message:"  "})).statusCode,400);
});
