'use strict';
/* Supabase: config dan sesi disimpan dalam browser sahaja, bukan dalam repo */
const CK='badExpenses.cloud';
let C={};try{C=JSON.parse(localStorage.getItem(CK))||{}}catch(e){}
let inbox=[],cloudMsg='',queue=Promise.resolve(),timer;
const saveC=()=>localStorage.setItem(CK,JSON.stringify(C));
const signedIn=()=>!!C.session;

async function req(path,{method='GET',body,auth=true,prefer}={}){
  if(auth&&Date.now()>C.session.exp-6e4)await token({refresh_token:C.session.refresh},'refresh_token');
  const h={apikey:C.key,'Content-Type':'application/json'};
  if(auth)h.Authorization='Bearer '+C.session.access;
  if(prefer)h.Prefer=prefer;
  const r=await fetch(C.url+path,{method,headers:h,body:body&&JSON.stringify(body),cache:'no-store'});
  const txt=await r.text(),d=txt?JSON.parse(txt):null;
  if(!r.ok)throw new Error(d?.msg||d?.message||d?.error_description||r.status);
  return d;
}
async function token(body,type){
  const d=await req('/auth/v1/token?grant_type='+type,{method:'POST',body,auth:false});
  C.session={access:d.access_token,refresh:d.refresh_token,exp:Date.now()+d.expires_in*1000,uid:d.user.id};saveC();
}

async function push(){
  const row={data:S,updated_at:new Date().toISOString()},mark=C.edits;
  const out=C.at
    ?await req('/rest/v1/app_state?user_id=eq.'+C.session.uid+'&updated_at=eq.'+encodeURIComponent(C.at),{method:'PATCH',body:row,prefer:'return=representation'})
    :await req('/rest/v1/app_state',{method:'POST',body:row,prefer:'return=representation'});
  if(!out.length)throw new Error('Data cloud berubah. Tekan Sync sekali lagi.');
  C.at=out[0].updated_at;if(C.edits===mark)C.dirty=false;saveC();
}
function useCloud(r){
  if(!valid(r.data))throw new Error('Data cloud tidak sah');
  S=r.data;C.at=r.updated_at;C.dirty=false;saveC();localStorage.setItem(KEY,JSON.stringify(S));
}
async function doSync(){
  const [r]=await req('/rest/v1/app_state?select=data,updated_at');
  if(!r){C.at=null;if(keys().length)await push()}
  else if(r.updated_at!==C.at){
    const clash=keys().length&&(C.dirty||!C.at);
    if(!clash||confirm('Data cloud berbeza dengan peranti ini.\n\nOK = guna data CLOUD\nCancel = guna data PERANTI INI (ganti cloud)'))useCloud(r);
    else{C.at=r.updated_at;await push()}
  }else if(C.dirty)await push();
  await pullTng();
}
function sync(){
  if(!signedIn()||$('#dlg').open)return queue;
  return queue=queue.then(async()=>{if(!signedIn())return;
    try{await doSync();cloudMsg='Sync: '+new Date().toLocaleTimeString('ms-MY')}catch(e){cloudMsg='Sync gagal: '+e.message}
    render()});
}
function changed(){if(!signedIn())return;C.dirty=true;C.edits=(C.edits||0)+1;saveC();clearTimeout(timer);timer=setTimeout(sync,800)}

/* ---- Transaksi TNG ---- */
const RULES=[[/econsave/i,/econsave/i],[/speed\s*mart/i,/speedmart/i],[/setel|petron|shell|caltex/i,/setel/i]];
const NOT_SPEND=/reload|top.?up|received|refund|cashback|terima|tambah nilai/i;
function parseTx(t){
  const text=((t.title||'')+' '+(t.body||'')).trim(),m=text.match(/RM\s?([\d,]+(?:\.\d{1,2})?)/i);
  const d=new Date(new Date(t.created_at).getTime()+8*36e5).toISOString().slice(0,10); /* waktu Malaysia */
  return{id:t.id,text,amt:m?r2(m[1].replace(/,/g,'')):0,date:d};
}
const allItems=k=>S.months[k].cats.flatMap(c=>c.items.map(i=>({c,i})));
const recorded=id=>keys().some(k=>allItems(k).some(x=>x.i.entries.some(e=>e.tx===id)));
const addTx=(x,i)=>i.entries.push({amt:x.amt,date:x.date,note:'TNG: '+x.text.slice(0,80),tx:x.id});
const markDone=ids=>req('/rest/v1/transactions?id=in.('+ids.join(',')+')',{method:'PATCH',body:{processed:true}});
async function pullTng(){
  const rows=await req('/rest/v1/transactions?processed=eq.false&order=created_at.asc&limit=100');
  const done=[];inbox=[];let added=false;
  for(const x of rows.map(parseTx)){
    if(recorded(x.id)){done.push(x.id);continue}
    const k=x.date.slice(0,7),rule=x.amt&&!NOT_SPEND.test(x.text)&&RULES.find(r=>r[0].test(x.text));
    const hit=rule&&S.months[k]&&allItems(k).find(y=>rule[1].test(y.i.name));
    if(hit){addTx(x,hit.i);done.push(x.id);added=true}else inbox.push(x);
  }
  if(added){C.dirty=true;saveC();localStorage.setItem(KEY,JSON.stringify(S))}
  if(C.dirty)await push(); /* simpan dahulu, baru tanda selesai */
  if(done.length)await markDone(done);
}

function viewInbox(){
  if(!inbox.length)return'';
  return `<div class="card"><h2>Peti masuk TNG (${inbox.length})</h2>${inbox.map(x=>{const k=x.date.slice(0,7),m=S.months[k];
    return `<div class="item" style="display:block"><div>${esc(x.text)}</div><div class="mut">${esc(x.date)} · ${x.amt?rm(x.amt):'jumlah tidak dikesan'}</div>
    <div class="row">${m&&x.amt?`<select class="sp" data-tx="${esc(x.id)}" aria-label="Masukkan ke item"><option value="">Masukkan ke…</option>${allItems(k).map(y=>`<option value="${y.i.id}">${esc(y.c.name+' › '+y.i.name)}</option>`).join('')}</select>`:`<span class="mut sp">${m?'':'Tambah bulan '+mName(k)+' dahulu'}</span>`}<button data-a="skip" data-i="${esc(x.id)}">Abaikan</button></div></div>`}).join('')}</div>`;
}
function viewCloud(){
  return `<div class="card"><h2>Cloud (Supabase)</h2>${signedIn()
    ?`<p class="mut">${esc(cloudMsg||'Log masuk')}</p><div class="row"><button class="pri" data-a="sync">Sync</button><button data-a="logout">Log keluar</button></div>`
    :`<p class="mut">Belum disambung.</p><button class="pri" data-a="login">Sambung</button>`}</div>`;
}
function login(){
  form('Sambung Supabase',[{n:'url',l:'Project URL',v:C.url||'',req:1},{n:'key',l:'Publishable key',v:C.key||'',req:1},{n:'email',l:'Email',type:'email',v:'',req:1},{n:'password',l:'Password',type:'password',v:'',req:1}],async o=>{
    const url=o.url.replace(/\/(rest\/v1)?\/*$/,'');
    if(!/^https:\/\/[\w.-]+$/.test(url))return alert('Project URL mesti bermula https://');
    if(/^sb_secret_/.test(o.key))return alert('Itu SECRET key. Guna publishable key.');
    if(C.url!==url){C.at=null}
    C.url=url;C.key=o.key;
    try{await token({email:o.email,password:o.password},'password');await sync()}catch(e){alert('Gagal: '+e.message)}
  });
}
document.addEventListener('click',async e=>{
  const el=e.target.closest('[data-a]');if(!el)return;const a=el.dataset.a;
  if(a==='login')login();
  if(a==='sync')sync();
  if(a==='logout'){C={url:C.url,key:C.key};saveC();inbox=[];render()}
  if(a==='skip'){try{await markDone([el.dataset.i]);inbox=inbox.filter(x=>x.id!==el.dataset.i);render()}catch(x){alert(x.message)}}
});
document.addEventListener('change',e=>{
  const id=e.target.dataset.tx;if(!id||!e.target.value)return;
  const x=inbox.find(y=>y.id===id),hit=allItems(x.date.slice(0,7)).find(y=>y.i.id===e.target.value);
  if(!recorded(id))addTx(x,hit.i);
  inbox=inbox.filter(y=>y!==x);save();
  clearTimeout(timer);sync(); /* sync akan simpan, kemudian tanda transaksi selesai */
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
