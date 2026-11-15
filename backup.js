"use strict";
const crypto = require("crypto");
const qi = s => '"' + String(s).replace(/"/g,'""') + '"';
function registerBackupRoutes({app,pool,adminOnly}) {
 const format="foodora-postgres-json", version=1, maxBytes=50*1024*1024;
 async function ensureSchema(){
  await pool.query(`CREATE TABLE IF NOT EXISTS foodora_backup_history (
   id BIGSERIAL PRIMARY KEY, backup_id TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   table_count INTEGER NOT NULL, row_count BIGINT NOT NULL, byte_size BIGINT NOT NULL, sha256 TEXT NOT NULL, backup_data JSONB
  ); ALTER TABLE foodora_backup_history ADD COLUMN IF NOT EXISTS backup_data JSONB; CREATE INDEX IF NOT EXISTS foodora_backup_history_created_idx ON foodora_backup_history(created_at DESC)`);
 }
 async function snapshot(){
  const c=await pool.connect();
  try{
   await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
   const names=await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'foodora_backup_history' ORDER BY table_name");
   const tables=[];let rowCount=0;
   for(const x of names.rows){const r=await c.query("SELECT * FROM public."+qi(x.table_name));tables.push({name:x.table_name,rows:r.rows});rowCount+=r.rowCount}
   await c.query("COMMIT");
   return {format,version,createdAt:new Date().toISOString(),tables,tableCount:tables.length,rowCount};
  }catch(e){await c.query("ROLLBACK").catch(()=>{});throw e}finally{c.release()}
 }
 async function validate(data){
  if(!data||data.format!==format||data.version!==version||!Array.isArray(data.tables))throw Error("Unsupported or invalid Foodora backup.");
  const schema=await pool.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position");
  const cols=new Map();for(const x of schema.rows){if(!cols.has(x.table_name))cols.set(x.table_name,new Set());cols.get(x.table_name).add(x.column_name)}
  const seen=new Set();let rows=0;
  for(const t of data.tables){
   if(!t||typeof t.name!=="string"||!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t.name)||seen.has(t.name)||t.name==="foodora_backup_history"||!cols.has(t.name)||!Array.isArray(t.rows))throw Error("Backup contains an unknown or invalid table.");
   seen.add(t.name);
   for(const row of t.rows){if(!row||typeof row!=="object"||Array.isArray(row)||Object.keys(row).some(k=>!cols.get(t.name).has(k)))throw Error("Backup columns do not match the current database schema.");}
   rows+=t.rows.length;
  }
  const required=[...cols.keys()].filter(n=>n!=="foodora_backup_history");
  if(required.some(n=>!seen.has(n)))throw Error("Backup is missing one or more current database tables.");
  return {tableCount:seen.size,rowCount:rows,required};
 }
 app.get("/api/admin/backups",adminOnly,async(req,res)=>{
  try{const r=await pool.query("SELECT backup_id AS \"backupId\",created_at AS \"createdAt\",table_count AS \"tableCount\",row_count::text AS \"rowCount\",byte_size::text AS \"byteSize\",sha256 FROM foodora_backup_history ORDER BY created_at DESC LIMIT 50");res.set("Cache-Control","no-store").json({backups:r.rows})}
  catch(e){res.status(500).json({error:"Backup history unavailable."})}
 });
 app.post("/api/admin/backups",adminOnly,async(req,res)=>{
  try{const data=await snapshot(),body=Buffer.from(JSON.stringify(data));if(body.length>maxBytes)return res.status(413).json({error:"Backup exceeds 50 MB limit."});
   const sha=crypto.createHash("sha256").update(body).digest("hex"),id="fd_"+crypto.randomBytes(8).toString("hex");
   await pool.query("INSERT INTO foodora_backup_history(backup_id,table_count,row_count,byte_size,sha256,backup_data) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[id,data.tableCount,data.rowCount,body.length,sha,body.toString("utf8")]);
   res.set({"Content-Type":"application/json; charset=utf-8","Content-Disposition":'attachment; filename="foodora-database-'+new Date().toISOString().slice(0,10)+'.json"',"Cache-Control":"no-store","X-Foodora-SHA256":sha}).send(body);
  }catch(e){res.status(500).json({error:"Could not create database backup."})}
 });
 app.post("/api/admin/backups/validate",adminOnly,async(req,res)=>{
  try{const size=Buffer.byteLength(JSON.stringify(req.body||{}));if(size>maxBytes)return res.status(413).json({error:"Backup exceeds 50 MB limit."});const v=await validate(req.body);res.json({valid:true,tableCount:v.tableCount,rowCount:v.rowCount,warning:"Restore replaces live data. Download a fresh backup before proceeding."})}
  catch(e){res.status(400).json({error:e.message})}
 });
 app.post("/api/admin/backups/restore",adminOnly,async(req,res)=>{
  const c=await pool.connect();
  try{
   const v=await validate(req.body);
   const pre=await snapshot(),preBody=Buffer.from(JSON.stringify(pre));
   if(preBody.length>maxBytes)throw Error("Automatic pre-restore backup exceeds 50 MB; restore refused safely.");
   const preSha=crypto.createHash("sha256").update(preBody).digest("hex"),preId="fd_pre_"+crypto.randomBytes(8).toString("hex");
   await pool.query("INSERT INTO foodora_backup_history(backup_id,table_count,row_count,byte_size,sha256,backup_data) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[preId,pre.tableCount,pre.rowCount,preBody.length,preSha,preBody.toString("utf8")]);
   await c.query("BEGIN");await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='120s'");
   const fk=await c.query("SELECT tc.table_name child,ccu.table_name parent FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' AND ccu.table_schema='public' AND tc.table_name <> 'foodora_backup_history'");
   if(fk.rows.some(x=>x.child===x.parent))throw Error("Self-referencing foreign keys require a reviewed restore plan; restore was refused.");
   const parents=new Map(v.required.map(n=>[n,new Set()]));for(const x of fk.rows)if(parents.has(x.child)&&parents.has(x.parent))parents.get(x.child).add(x.parent);
   const order=[],pending=new Set(v.required);while(pending.size){const ready=[...pending].filter(n=>[...parents.get(n)].every(p=>!pending.has(p)));if(!ready.length)throw Error("Circular foreign-key dependency detected. Safe automatic restore is unavailable.");for(const n of ready){order.push(n);pending.delete(n)}}
   const map=new Map(req.body.tables.map(t=>[t.name,t.rows]));
   for(const n of [...order].reverse())await c.query("DELETE FROM public."+qi(n));
   for(const n of order)for(const row of map.get(n)){
    const keys=Object.keys(row);if(!keys.length){await c.query("INSERT INTO public."+qi(n)+" DEFAULT VALUES");continue}
    await c.query("INSERT INTO public."+qi(n)+" ("+keys.map(qi).join(",")+") VALUES ("+keys.map((_,i)=>"$"+(i+1)).join(",")+")",keys.map(k=>row[k]));
   }
   const seq=await c.query("SELECT table_name,column_name,pg_get_serial_sequence(format('%I.%I','public',table_name),column_name) sequence_name FROM information_schema.columns WHERE table_schema='public' AND column_default LIKE 'nextval(%'");
   for(const x of seq.rows){if(!x.sequence_name||!map.has(x.table_name))continue;const m=await c.query("SELECT MAX("+qi(x.column_name)+") value FROM public."+qi(x.table_name));const val=m.rows[0].value;await c.query("SELECT setval($1::regclass,$2,$3)",[x.sequence_name,val==null?1:val,val!=null])}
   await c.query("COMMIT");res.json({ok:true,restoredTables:order.length,restoredRows:v.rowCount,preRestoreBackupId:preId});
  }catch(e){await c.query("ROLLBACK").catch(()=>{});res.status(400).json({error:e.message||"Restore failed; transaction rolled back."})}finally{c.release()}
 });
 return {ensureSchema};
}
module.exports={registerBackupRoutes};
