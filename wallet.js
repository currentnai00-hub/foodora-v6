"use strict";

/**
 * Foodora prepaid wallet.
 * All money mutations are server-side PostgreSQL transactions.
 * No credit/BNPL support is implemented.
 */
function registerWalletRoutes({app,pool,signedInCustomer,adminOnly,requestIsSameOrigin,requireCustomerDatabase,clean}) {
  const PAYMENT_METHODS = ["bKash","Nagad"];
  const amount = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 1000000 ? Number(value) : 0;

  async function ensureWalletSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wallet_accounts (
        customer_id TEXT PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
        balance_paisa BIGINT NOT NULL DEFAULT 0 CHECK (balance_paisa >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS wallet_topups (
        id BIGSERIAL PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        amount_paisa BIGINT NOT NULL CHECK (amount_paisa > 0),
        payment_method TEXT NOT NULL CHECK (payment_method IN ('bKash','Nagad')),
        transaction_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected')),
        reviewed_by TEXT NOT NULL DEFAULT '',
        review_note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reviewed_at TIMESTAMPTZ,
        UNIQUE(payment_method, transaction_id)
      );
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id BIGSERIAL PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        type TEXT NOT NULL CHECK (type IN ('topup','purchase','refund','adjustment')),
        amount_paisa BIGINT NOT NULL CHECK (amount_paisa > 0),
        balance_after_paisa BIGINT NOT NULL CHECK (balance_after_paisa >= 0),
        reference_type TEXT NOT NULL DEFAULT '',
        reference_id TEXT NOT NULL DEFAULT '',
        idempotency_key TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS wallet_transactions_customer_idx
        ON wallet_transactions(customer_id, created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS wallet_topups_status_idx
        ON wallet_topups(status, created_at DESC);
    `);
  }

  async function ensureAccount(client, customerId) {
    await client.query("INSERT INTO wallet_accounts(customer_id) VALUES($1) ON CONFLICT(customer_id) DO NOTHING",[customerId]);
  }

  async function postLedger(client, {customerId,type,amountPaisa,referenceType="",referenceId="",idempotencyKey,description}) {
    const prior=await client.query("SELECT id,balance_after_paisa FROM wallet_transactions WHERE idempotency_key=$1",[idempotencyKey]);
    if(prior.rowCount) return {duplicate:true,balancePaisa:Number(prior.rows[0].balance_after_paisa)};
    await ensureAccount(client,customerId);
    const account=(await client.query("SELECT balance_paisa FROM wallet_accounts WHERE customer_id=$1 FOR UPDATE",[customerId])).rows[0];
    const current=Number(account.balance_paisa);
    if(type==="purchase" && current<amountPaisa) throw Object.assign(new Error("Wallet balance is insufficient."),{status:409});
    const next=type==="purchase"?current-amountPaisa:current+amountPaisa;
    if(!Number.isSafeInteger(next)||next<0) throw new Error("Wallet balance limit exceeded.");
    await client.query("UPDATE wallet_accounts SET balance_paisa=$2,updated_at=NOW() WHERE customer_id=$1",[customerId,next]);
    await client.query(
      `INSERT INTO wallet_transactions(customer_id,type,amount_paisa,balance_after_paisa,reference_type,reference_id,idempotency_key,description)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [customerId,type,amountPaisa,next,referenceType,referenceId,idempotencyKey,description]);
    return {duplicate:false,balancePaisa:next};
  }

  async function cancelOrderAndRefund(orderId) {
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const r=await client.query(
        "SELECT id,customer_id,payment_method,payment_status,total,status FROM orders WHERE id=$1 FOR UPDATE",
        [orderId]);
      if(!r.rowCount) throw Object.assign(new Error("Order not found."),{status:404});
      const o=r.rows[0];
      if(o.status==="Cancelled") {
        await client.query("COMMIT");
        return {id:o.id,status:o.status,refundIssued:false,alreadyCancelled:true};
      }
      await client.query("UPDATE orders SET status='Cancelled' WHERE id=$1",[o.id]);
      let refundIssued=false;
      const method=String(o.payment_method||"");
      const eligible=o.customer_id && ["bKash","Nagad"].includes(method) && o.payment_status==="Verified" && Number(o.total)>0;
      if(eligible) {
        const credit=await postLedger(client,{
          customerId:o.customer_id,type:"refund",amountPaisa:Number(o.total)*100,
          referenceType:"order",referenceId:o.id,idempotencyKey:"order-refund:"+o.id,
          description:"Cancelled order refund · "+o.id
        });
        refundIssued=!credit.duplicate;
      }
      await client.query("COMMIT");
      return {id:o.id,status:"Cancelled",refundIssued};
    } catch(e) {
      await client.query("ROLLBACK").catch(()=>{});
      throw e;
    } finally {client.release();}
  }

  app.get("/api/customer/wallet",async(req,res)=>{
    if(!requireCustomerDatabase(res))return;
    try {
      const customer=await signedInCustomer(req);
      if(!customer)return res.status(401).json({error:"লগইন করুন।"});
      const [balance,transactions,topups]=await Promise.all([
        pool.query("SELECT balance_paisa FROM wallet_accounts WHERE customer_id=$1",[customer.id]),
        pool.query(`SELECT id,type,amount_paisa AS "amountPaisa",balance_after_paisa AS "balanceAfterPaisa",reference_type AS "referenceType",reference_id AS "referenceId",description,created_at AS "createdAt" FROM wallet_transactions WHERE customer_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[customer.id]),
        pool.query(`SELECT id,amount_paisa AS "amountPaisa",payment_method AS "paymentMethod",transaction_id AS "transactionId",status,review_note AS "reviewNote",created_at AS "createdAt" FROM wallet_topups WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 30`,[customer.id])
      ]);
      res.set("Cache-Control","no-store").json({
        balancePaisa:Number(balance.rows[0]?.balance_paisa||0),
        transactions:transactions.rows.map(x=>({...x,amountPaisa:Number(x.amountPaisa),balanceAfterPaisa:Number(x.balanceAfterPaisa)})),
        topups:topups.rows.map(x=>({...x,amountPaisa:Number(x.amountPaisa)}))
      });
    } catch(e){res.status(500).json({error:"Wallet তথ্য পাওয়া যায়নি।"});}
  });

  app.post("/api/customer/wallet/topups",async(req,res)=>{
    if(!requestIsSameOrigin(req))return res.status(403).json({error:"Request origin not allowed."});
    if(!requireCustomerDatabase(res))return;
    try{
      const customer=await signedInCustomer(req);
      if(!customer)return res.status(401).json({error:"লগইন করুন।"});
      const amountPaisa=amount(req.body.amount)*100;
      const paymentMethod=String(req.body.paymentMethod||"");
      const transactionId=clean(req.body.transactionId,80);
      if(!amountPaisa||!PAYMENT_METHODS.includes(paymentMethod)||!/^[A-Za-z0-9_-]{4,80}$/.test(transactionId))
        return res.status(400).json({error:"সঠিক পরিমাণ, bKash/Nagad এবং Transaction ID দিন।"});
      const result=await pool.query(
        "INSERT INTO wallet_topups(customer_id,amount_paisa,payment_method,transaction_id) VALUES($1,$2,$3,$4) RETURNING id,status",
        [customer.id,amountPaisa,paymentMethod,transactionId]);
      res.status(201).set("Cache-Control","no-store").json({ok:true,topup:result.rows[0],message:"অনুরোধ জমা হয়েছে; অ্যাডমিন যাচাই না করা পর্যন্ত ব্যালেন্স বাড়বে না।"});
    }catch(e){
      if(e.code==="23505")return res.status(409).json({error:"এই Transaction ID আগে ব্যবহার করা হয়েছে।"});
      res.status(500).json({error:"Top-up অনুরোধ জমা দেওয়া যায়নি।"});
    }
  });

  app.get("/api/admin/wallet/topups",adminOnly,async(req,res)=>{
    if(!requireCustomerDatabase(res))return;
    try{
      const r=await pool.query(`SELECT t.id,t.customer_id AS "customerId",c.full_name AS "customerName",c.phone,t.amount_paisa AS "amountPaisa",t.payment_method AS "paymentMethod",t.transaction_id AS "transactionId",t.status,t.review_note AS "reviewNote",t.created_at AS "createdAt" FROM wallet_topups t JOIN customers c ON c.id=t.customer_id ORDER BY t.created_at DESC LIMIT 500`);
      res.set("Cache-Control","no-store").json({topups:r.rows.map(x=>({...x,amountPaisa:Number(x.amountPaisa)}))});
    }catch(e){res.status(500).json({error:"Top-up list unavailable"});}
  });

  app.patch("/api/admin/wallet/topups/:id",adminOnly,async(req,res)=>{
    const action=String(req.body.action||"").toLowerCase();
    const note=clean(req.body.note,300);
    if(!["approve","reject"].includes(action))return res.status(400).json({error:"Choose approve or reject."});
    const client=await pool.connect();
    try{
      await client.query("BEGIN");
      const r=await client.query("SELECT * FROM wallet_topups WHERE id=$1 FOR UPDATE",[req.params.id]);
      if(!r.rowCount){await client.query("ROLLBACK");return res.status(404).json({error:"Top-up not found."});}
      const t=r.rows[0];
      if(t.status!=="Pending"){await client.query("ROLLBACK");return res.status(409).json({error:"This top-up has already been reviewed."});}
      if(action==="approve"){
        await postLedger(client,{
          customerId:t.customer_id,type:"topup",amountPaisa:Number(t.amount_paisa),
          referenceType:"topup",referenceId:String(t.id),idempotencyKey:"topup:"+t.id,
          description:"Approved wallet top-up · "+t.payment_method
        });
      }
      await client.query(
        "UPDATE wallet_topups SET status=$2,reviewed_by='Admin',review_note=$3,reviewed_at=NOW() WHERE id=$1",
        [t.id,action==="approve"?"Approved":"Rejected",note]);
      await client.query("COMMIT");
      res.json({ok:true,status:action==="approve"?"Approved":"Rejected"});
    }catch(e){
      await client.query("ROLLBACK").catch(()=>{});
      res.status(e.status||500).json({error:e.message||"Top-up review failed."});
    }finally{client.release();}
  });

  app.get("/api/admin/wallet/transactions",adminOnly,async(req,res)=>{
    if(!requireCustomerDatabase(res))return;
    try{
      const r=await pool.query(`SELECT w.id,w.customer_id AS "customerId",c.full_name AS "customerName",c.phone,w.type,w.amount_paisa AS "amountPaisa",w.balance_after_paisa AS "balanceAfterPaisa",w.reference_type AS "referenceType",w.reference_id AS "referenceId",w.description,w.created_at AS "createdAt" FROM wallet_transactions w JOIN customers c ON c.id=w.customer_id ORDER BY w.created_at DESC,w.id DESC LIMIT 500`);
      res.set("Cache-Control","no-store").json({transactions:r.rows.map(x=>({...x,amountPaisa:Number(x.amountPaisa),balanceAfterPaisa:Number(x.balanceAfterPaisa)}))});
    }catch(e){res.status(500).json({error:"Wallet transactions unavailable"});}
  });

  return {ensureWalletSchema,cancelOrderAndRefund};
}

module.exports={registerWalletRoutes};
