"use strict";
const crypto = require("crypto");
const zlib = require("zlib");
const qi = s => '"' + String(s).replace(/"/g,'""') + '"';
const ZIP_FORMAT = "foodora-postgres-zip", ZIP_VERSION = 1;
const MAX_BYTES = 50 * 1024 * 1024;
const CRC_TABLE = (() => { const t=[]; for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t; })();
function crc32(buf){let c=0xffffffff;for(const b of buf)c=CRC_TABLE[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function zipStored(entries){
 const locals=[],centrals=[];let offset=0;
 for(const [name,value] of entries){
  const n=Buffer.from(name),data=Buffer.isBuffer(value)?value:Buffer.from(value),crc=crc32(data);
  if(n.length>65535||data.length>MAX_BYTES)throw Error("ZIP entry exceeds supported size.");
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0,6);h.writeUInt16LE(0,8);h.writeUInt16LE(0,10);h.writeUInt16LE(0,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(n.length,26);h.writeUInt16LE(0,28);locals.push(h,n,data);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0,8);c.writeUInt16LE(0,10);c.writeUInt16LE(0,12);c.writeUInt16LE(0,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt16LE(0,30);c.writeUInt16LE(0,32);c.writeUInt16LE(0,34);c.writeUInt16LE(0,36);c.writeUInt32LE(0,38);c.writeUInt32LE(offset,42);centrals.push(c,n);offset+=h.length+n.length+data.length;
 }
 const central=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(central.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,central,end]);
}
function unzipStored(buf){
 if(!Buffer.isBuffer(buf)||buf.length>MAX_BYTES||buf.length<22)throw Error("Invalid or oversized ZIP backup.");
 const out=new Map();let p=0,entries=0;
 while(p+4<=buf.length&&buf.readUInt32LE(p)===0x04034b50){
  if(p+30>buf.length)throw Error("Truncated ZIP header.");
  const flags=buf.readUInt16LE(p+6),method=buf.readUInt16LE(p+8),crc=buf.readUInt32LE(p+14),size=buf.readUInt32LE(p+18),compressed=buf.readUInt32LE(p+22),nl=buf.readUInt16LE(p+26),el=buf.readUInt16LE(p+28);
  if(flags!==0||method!==0||size!==compressed||size>MAX_BYTES)throw Error("Unsupported ZIP compression or ZIP flags.");
  const start=p+30+nl+el,end=start+size;if(end>buf.length)throw Error("Truncated ZIP entry.");
  const name=buf.toString("utf8",p+30,p+30+nl),data=buf.subarray(start,end);
  if(!["backup.json","manifest.json"].includes(name)||out.has(name))throw Error("ZIP contains an unexpected or duplicate file.");
  if(crc32(data)!==crc)throw Error("ZIP entry checksum mismatch.");
  out.set(name,Buffer.from(data));p=end;entries++;if(entries>2)throw Error("ZIP contains too many entries.");
 }
 if(entries!==2||!out.has("backup.json")||!out.has("manifest.json"))throw Error("ZIP must contain backup.json and manifest.json.");
 return out;
}
function decodeBackup(input){
 if(Buffer.isBuffer(input)){
  const files=unzipStored(input),manifest=JSON.parse(files.get("manifest.json").toString("utf8")),payload=files.get("backup.json");
  const digest=crypto.createHash("sha256").update(payload).digest("hex");
  if(manifest.format!==ZIP_FORMAT||manifest.version!==ZIP_VERSION||manifest.file!=="backup.json"||manifest.bytes!==payload.length||manifest.sha256!==digest)throw Error("ZIP manifest or SHA-256 checksum is invalid.");
  return JSON.parse(payload.toString("utf8"));
 }
 return input;
}
function registerBackupRoutes({app,pool,adminOnly}) {
 const format="foodora-postgres-json", version=1;
 async function ensureSchema(){await pool.query(`CREATE TABLE IF NOT EXISTS foodora_backup_history (id BIGSERIAL PRIMARY KEY, backup_id TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), table_count INTEGER NOT NULL, row_count BIGINT NOT NULL, byte_size BIGINT NOT NULL, sha256 TEXT NOT NULL, backup_data JSONB); ALTER TABLE foodora_backup_history ADD COLUMN IF NOT EXISTS backup_data JSONB; CREATE INDEX IF NOT EXISTS foodora_backup_history_created_idx ON foodora_backup_history(created_at DESC)`);}
 async function snapshot(){
  const c=await pool.connect();try{await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");const names=await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'foodora_backup_history' ORDER BY table_name");const tables=[];let rowCount=0;for(const x of names.rows){const r=await c.query("SELECT * FROM public."+qi(x.table_name));tables.push({name:x.table_name,rows:r.rows});rowCount+=r.rowCount;}await c.query("COMMIT");return {format,version,createdAt:new Date().toISOString(),tables,tableCount:tables.length,rowCount};}catch(e){await c.query("ROLLBACK").catch(()=>{});throw e;}finally{c.release();}
 }
 async function validate(data){
  if(!data||data.format!==format||data.version!==version||!Array.isArray(data.tables))throw Error("Unsupported or invalid Foodora backup.");
  const schema=await pool.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position");const cols=new Map();for(const x of schema.rows){if(!cols.has(x.table_name))cols.set(x.table_name,new Set());cols.get(x.table_name).add(x.column_name);}
  const seen=new Set();let rows=0;for(const t of data.tables){if(!t||typeof t.name!=="string"||!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(t.name)||seen.has(t.name)||t.name==="foodora_backup_history"||!cols.has(t.name)||!Array.isArray(t.rows))throw Error("Backup contains an unknown or invalid table.");seen.add(t.name);for(const row of t.rows){if(!row||typeof row!=="object"||Array.isArray(row)||Object.keys(row).some(k=>!cols.get(t.name).has(k)))throw Error("Backup columns do not match the current database schema.");}rows+=t.rows.length;}
  const required=[...cols.keys()].filter(n=>n!=="foodora_backup_history");if(required.some(n=>!seen.has(n)))throw Error("Backup is missing one or more current database tables.");return {tableCount:seen.size,rowCount:rows,required};
 }
 app.get("/api/admin/backups",adminOnly,async(req,res)=>{try{const r=await pool.query('SELECT backup_id AS "backupId",created_at AS "createdAt",table_count AS "tableCount",row_count::text AS "rowCount",byte_size::text AS "byteSize",sha256 FROM foodora_backup_history ORDER BY created_at DESC LIMIT 50');res.set("Cache-Control","no-store").json({backups:r.rows});}catch{res.status(500).json({error:"Backup history unavailable."});}});
 app.post("/api/admin/backups",adminOnly,async(req,res)=>{try{const data=await snapshot(),payload=Buffer.from(JSON.stringify(data));if(payload.length>MAX_BYTES) return res.status(413).json({error:"Backup exceeds 50 MB limit."});const sha=crypto.createHash("sha256").update(payload).digest("hex"),manifest=Buffer.from(JSON.stringify({format:ZIP_FORMAT,version:ZIP_VERSION,file:"backup.json",bytes:payload.length,sha256:sha,createdAt:data.createdAt})),archive=zipStored([["backup.json",payload],["manifest.json",manifest]]),id="fd_"+crypto.randomBytes(8).toString("hex");await pool.query("INSERT INTO foodora_backup_history(backup_id,table_count,row_count,byte_size,sha256,backup_data) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[id,data.tableCount,data.rowCount,archive.length,sha,payload.toString("utf8")]);res.set({"Content-Type":"application/zip","Content-Disposition":'attachment; filename="foodora-database-'+new Date().toISOString().slice(0,10)+'.zip"',"Cache-Control":"no-store","X-Foodora-SHA256":sha}).send(archive);}catch(e){res.status(500).json({error:"Could not create database ZIP backup."});}});
 const rawZip= require("express").raw({type:["application/zip","application/octet-stream"],limit:"50mb"});
 app.post("/api/admin/backups/validate",adminOnly,rawZip,async(req,res)=>{try{const data=decodeBackup(req.body),size=Buffer.byteLength(JSON.stringify(data||{}));if(size>MAX_BYTES)return res.status(413).json({error:"Backup exceeds 50 MB limit."});const v=await validate(data);res.json({valid:true,tableCount:v.tableCount,rowCount:v.rowCount,format:"ZIP",warning:"Restore replaces current application data. Download a fresh backup before proceeding."});}catch(e){res.status(400).json({error:e.message});}});
 app.post("/api/admin/backups/restore",adminOnly,rawZip,async(req,res)=>{const c=await pool.connect();try{const data=decodeBackup(req.body),v=await validate(data),pre=await snapshot(),preBody=Buffer.from(JSON.stringify(pre));if(preBody.length>MAX_BYTES)throw Error("Automatic pre-restore backup exceeds 50 MB; restore refused safely.");const preSha=crypto.createHash("sha256").update(preBody).digest("hex"),preId="fd_pre_"+crypto.randomBytes(8).toString("hex");await pool.query("INSERT INTO foodora_backup_history(backup_id,table_count,row_count,byte_size,sha256,backup_data) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[preId,pre.tableCount,pre.rowCount,preBody.length,preSha,preBody.toString("utf8")]);await c.query("BEGIN");await c.query("SET LOCAL lock_timeout='5s'");await c.query("SET LOCAL statement_timeout='120s'");const fk=await c.query("SELECT tc.table_name child,ccu.table_name parent FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name AND tc.constraint_schema=kcu.constraint_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name AND ccu.constraint_schema=tc.constraint_schema WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' AND ccu.table_schema='public' AND tc.table_name <> 'foodora_backup_history'");if(fk.rows.some(x=>x.child===x.parent))throw Error("Self-referencing foreign keys require a reviewed restore plan; restore was refused.");const parents=new Map(v.required.map(n=>[n,new Set()]));for(const x of fk.rows)if(parents.has(x.child)&&parents.has(x.parent))parents.get(x.child).add(x.parent);const order=[],pending=new Set(v.required);while(pending.size){const ready=[...pending].filter(n=>[...parents.get(n)].every(p=>!pending.has(p)));if(!ready.length)throw Error("Circular foreign-key dependency detected. Safe automatic restore is unavailable.");for(const n of ready){order.push(n);pending.delete(n);}}const map=new Map(data.tables.map(t=>[t.name,t.rows]));for(const n of [...order].reverse())await c.query("DELETE FROM public."+qi(n));for(const n of order)for(const row of map.get(n)){const keys=Object.keys(row);if(!keys.length){await c.query("INSERT INTO public."+qi(n)+" DEFAULT VALUES");continue;}await c.query("INSERT INTO public."+qi(n)+" ("+keys.map(qi).join(",")+") VALUES ("+keys.map((_,i)=>"$"+(i+1)).join(",")+")",keys.map(k=>row[k]));}const seq=await c.query("SELECT table_name,column_name,pg_get_serial_sequence(format('%I.%I','public',table_name),column_name) sequence_name FROM information_schema.columns WHERE table_schema='public' AND column_default LIKE 'nextval(%'");for(const x of seq.rows){if(!x.sequence_name||!map.has(x.table_name))continue;const m=await c.query("SELECT MAX("+qi(x.column_name)+") value FROM public."+qi(x.table_name));const val=m.rows[0].value;await c.query("SELECT setval($1::regclass,$2,$3)",[x.sequence_name,val==null?1:val,val!=null]);}await c.query("COMMIT");res.json({ok:true,restoredTables:order.length,restoredRows:v.rowCount,preRestoreBackupId:preId});}catch(e){await c.query("ROLLBACK").catch(()=>{});res.status(400).json({error:e.message||"Restore failed; transaction rolled back."});}finally{c.release();}});
 return {ensureSchema};
}
module.exports={registerBackupRoutes,zipStored,unzipStored,decodeBackup};
