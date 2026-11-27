'use strict';
const KEY='badExpenses.v1', $=s=>document.querySelector(s);
const uid=()=>Math.random().toString(36).slice(2,10);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
const r2=n=>Math.round((+n||0)*100)/100;
const rm=n=>(n<0?'-':'')+'RM '+Math.abs(r2(n)).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
const sum=(a,f)=>r2(a.reduce((t,x)=>t+f(x),0));
const mName=k=>new Date(k+'-02').toLocaleDateString('ms-MY',{month:'short',year:'numeric'});
const today=()=>{const d=new Date();return new Date(d-d.getTimezoneOffset()*6e4).toISOString().slice(0,10)};

function blank(){return{salary:{gross:0,net:0,deductions:[]},cats:['Komitmen','Tabung','Credit Card','Utilities','Hutang','Petrol & Toll','Allocation'].map(n=>({id:uid(),name:n,budget:null,items:[]}))}}
let S={version:1,months:{}},cur=null,tab='bulan';
try{const s=JSON.parse(localStorage.getItem(KEY));if(s&&s.months)S=s}catch(e){}
const keys=()=>Object.keys(S.months).sort();
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){alert('Data tak dapat disimpan di browser ini. Sila Export.')}changed();render()}

/* Kiraan: actual = jumlah rekod key in; jika tiada rekod, tick bayar = jumlah plan */
const actual=i=>i.entries.length?sum(i.entries,e=>e.amt):(i.paid?r2(i.amt):0);
const plan=i=>i.on?r2(i.amt):0;
function catStat(c){
  const planned=sum(c.items,plan), budget=c.budget??planned, spent=sum(c.items,actual);
  const over=c.budget!=null?Math.max(0,r2(spent-budget)):sum(c.items,i=>Math.max(0,r2(actual(i)-plan(i))));
  return{planned,budget:r2(budget),spent,over};
}
function monthStat(k){
  const m=S.months[k], c=m.cats.map(x=>({name:x.name,...catStat(x)}));
  const t={net:r2(m.salary.net),budget:sum(c,x=>x.budget),spent:sum(c,x=>x.spent),over:sum(c,x=>x.over),cats:c};
  t.bakiPlan=r2(t.net-t.budget);t.baki=r2(t.net-t.spent);return t;
}

/* Dialog borang */
function form(title,fields,onOk,onDel){
  const d=$('#dlg');
  d.innerHTML=`<form method="dialog"><h2>${esc(title)}</h2>${fields.map(f=>f.type==='checkbox'
    ?`<label><input type="checkbox" name="${f.n}" ${f.v?'checked':''}> ${esc(f.l)}</label>`
    :`<label>${esc(f.l)}<input name="${f.n}" type="${f.type||'text'}" ${f.type==='number'?'step="0.01" inputmode="decimal"':''} value="${esc(f.v)}" ${f.req?'required':''}></label>`).join('')}
  <div class="row">${onDel?'<button type="button" id="del" class="red">Padam</button>':''}<span class="sp"></span><button type="button" id="no">Batal</button><button class="pri">Simpan</button></div></form>`;
  d.querySelector('form').onsubmit=e=>{const el=e.target.elements,o={};fields.forEach(f=>o[f.n]=f.type==='checkbox'?el[f.n].checked:f.type==='number'?(el[f.n].value===''?null:r2(el[f.n].value)):el[f.n].value.trim());onOk(o);save()};
  d.querySelector('#no').onclick=()=>d.close();
  if(onDel)d.querySelector('#del').onclick=()=>{if(confirm('Padam?')){onDel();d.close();save()}};
  d.showModal();
}
const cat=id=>S.months[cur].cats.find(c=>c.id===id);
const item=(c,id)=>cat(c).items.find(i=>i.id===id);

function nextKey(k){let[y,m]=k.split('-').map(Number);m++;if(m>12){m=1;y++}return y+'-'+String(m).padStart(2,'0')}
function newMonth(){
  const last=keys().at(-1);
  form('Tambah bulan (lama atau baru)',[{n:'k',l:'Bulan',type:'month',v:last?nextKey(last):today().slice(0,7),req:1}],o=>{
    if(!/^\d{4}-\d{2}$/.test(o.k))return alert('Format bulan: 2026-12');
    if(S.months[o.k]){cur=o.k;return}
    const before=keys().filter(k=>k<o.k).at(-1), src=before||keys()[0];
    const m=src?structuredClone(S.months[src]):blank();
    const gap=src?(o.k.slice(0,4)-src.slice(0,4))*12+(o.k.slice(5)-src.slice(5)):0;
    m.cats.forEach(c=>c.items.forEach(i=>{i.paid=false;i.entries=[];
      if(i.inst){i.inst.n+=gap;if(i.inst.n>i.inst.total)i.on=false}}));
    S.months[o.k]=m;cur=o.k;
  });
}
const editSalary=()=>{const s=S.months[cur].salary;form('Gaji',[{n:'gross',l:'Gaji kasar',type:'number',v:s.gross},{n:'net',l:'Gaji bersih (masuk bank)',type:'number',v:s.net}],o=>{s.gross=o.gross||0;s.net=o.net||0})};
function editDed(i){const a=S.months[cur].salary.deductions,x=a[i];form('Potongan / maklumat gaji',[{n:'name',l:'Nama',v:x?.name||'',req:1},{n:'amt',l:'Jumlah',type:'number',v:x?.amt??''}],o=>{o.amt=o.amt||0;x?Object.assign(x,o):a.push(o)},x&&(()=>a.splice(i,1)))}
function editCat(id){const c=id&&cat(id);form(c?'Edit kategori':'Kategori baru',[{n:'name',l:'Nama',v:c?.name||'',req:1},{n:'budget',l:'Had bajet (kosong = ikut jumlah item)',type:'number',v:c?.budget??''}],o=>{c?Object.assign(c,o):S.months[cur].cats.push({id:uid(),...o,items:[]})},c&&(()=>{const a=S.months[cur].cats;a.splice(a.indexOf(c),1)}))}
function editItem(cid,id){
  const i=id&&item(cid,id);
  form(i?'Edit item':'Item baru',[{n:'name',l:'Nama',v:i?.name||'',req:1},{n:'amt',l:'Jumlah plan (RM)',type:'number',v:i?.amt??''},{n:'note',l:'Nota',v:i?.note||''},
    {n:'n',l:'Ansuran ke- (jika ada)',type:'number',v:i?.inst?.n??''},{n:'total',l:'Jumlah ansuran',type:'number',v:i?.inst?.total??''},{n:'on',l:'Kira dalam bajet bulan ini',type:'checkbox',v:i?i.on:true}],
  o=>{const v={name:o.name,amt:o.amt||0,note:o.note,on:o.on,inst:o.n&&o.total?{n:o.n,total:o.total}:null};
    i?Object.assign(i,v):cat(cid).items.push({id:uid(),paid:false,entries:[],...v})},
  i&&(()=>{const a=cat(cid).items;a.splice(a.indexOf(i),1)}));
}
function editEntry(cid,id,n){
  const i=item(cid,id),e=i.entries[n];
  form((e?'Edit rekod: ':'Key in belanja: ')+i.name,[{n:'amt',l:'Jumlah (RM)',type:'number',v:e?.amt??'',req:1},{n:'date',l:'Tarikh',type:'date',v:e?.date||today()},{n:'note',l:'Nota / kedai',v:e?.note||''}],
  o=>{e?Object.assign(e,o):i.entries.push(o)},e&&(()=>i.entries.splice(n,1)));
}

function viewMonth(){
  const m=S.months[cur],t=monthStat(cur),s=m.salary;
  const stat=(l,v,c='')=>`<div class="card"><span class="mut">${l}</span><b class="${c}">${rm(v)}</b></div>`;
  return `<div class="stats" style="margin-top:10px">${stat('Gaji bersih',t.net)}${stat('Jumlah bajet',t.budget)}${stat('Sudah belanja',t.spent)}${stat('Baki sebenar',t.baki,t.baki<0?'red':'green')}</div>
  ${t.bakiPlan<0?`<div class="card red"><b>Amaran:</b> bajet melebihi gaji bersih sebanyak ${rm(-t.bakiPlan)}.</div>`:`<div class="card green">Baki selepas bajet: ${rm(t.bakiPlan)}</div>`}
  <details class="card"><summary>Gaji kasar ${rm(s.gross)} · potongan</summary>
  ${s.deductions.map((d,n)=>`<div class="item" data-a="ded" data-n="${n}"><span class="nm">${esc(d.name)}</span><span class="amt">${rm(d.amt)}</span></div>`).join('')}
  <div class="row"><button data-a="sal">Edit gaji</button><button data-a="ded">+ Potongan</button></div></details>
  ${m.cats.map(c=>{const x=catStat(c),pc=x.budget?x.spent/x.budget*100:(x.spent?100:0);return `<section class="card">
  <div class="row"><h2>${esc(c.name)}</h2><button data-a="cat" data-c="${c.id}" aria-label="Edit kategori">✎</button><span class="sp"></span><span class="amt">${rm(x.budget)}<br><span class="mut">${t.net?(x.budget/t.net*100).toFixed(1):0}% gaji bersih</span></span></div>
  <div class="bar"><i class="${x.over?'o':''}" style="width:${Math.min(100,pc)}%"></i></div>
  <div class="mut">Belanja ${rm(x.spent)}${x.over?` · <b class="red">Lebih ${rm(x.over)}</b>`:''}</div>
  ${c.items.map(i=>{const a=actual(i),ids=`data-c="${c.id}" data-i="${i.id}"`;return `<div class="item ${i.on?'':'off'}">
    <input type="checkbox" data-a="paid" ${ids} ${i.paid?'checked':''} aria-label="Sudah bayar ${esc(i.name)}">
    <div class="nm" data-a="item" ${ids}>${esc(i.name)}${i.inst?` <span class="mut">(${i.inst.n}/${i.inst.total})</span>`:''}
    <div class="mut">${esc(i.note)}${i.on?'':' · tidak dikira'}</div></div>
    <div class="amt">${rm(i.amt)}${i.entries.length?`<br><span class="mut ${a>plan(i)&&c.budget==null?'red':''}">guna ${rm(a)}</span>`:''}</div>
    <button data-a="entry" ${ids} aria-label="Key in belanja ${esc(i.name)}">+</button></div>
    ${i.entries.length?`<details><summary class="mut">${i.entries.length} rekod</summary>${i.entries.map((e,n)=>`<div class="item" data-a="entry" ${ids} data-n="${n}"><span class="nm mut">${esc(e.date)} ${esc(e.note)}</span><span class="amt">${rm(e.amt)}</span></div>`).join('')}</details>`:''}`}).join('')}
  <button data-a="item" data-c="${c.id}">+ Tambah item</button></section>`}).join('')}
  <button data-a="cat">+ Kategori baru</button>`;
}

function chart(rows){
  const W=Math.max(340,rows.length*80+60),H=240,max=Math.max(1,...rows.flatMap(r=>[r.net,r.spent,r.budget]))*1.1;
  const y=v=>200-v/max*180,step=(W-60)/rows.length;
  let g='';for(let n=0;n<=4;n++){const v=max*n/4;g+=`<line x1="50" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="46" y="${y(v)+4}" text-anchor="end">${Math.round(v)}</text>`}
  rows.forEach((r,n)=>{const x=50+step*n+step/2;
    [[r.budget,'--blue','Bajet'],[r.spent,'--orange','Belanja']].forEach(([v,c,l],j)=>g+=`<rect x="${x-22+j*23}" y="${y(v)}" width="21" height="${200-y(v)}" fill="var(${c})"><title>${l} ${mName(r.k)}: ${rm(v)}</title></rect>`);
    g+=`<text x="${x}" y="218" text-anchor="middle">${mName(r.k)}</text>`});
  const pts=rows.map((r,n)=>[50+step*n+step/2,y(r.net)]);
  g+=`<polyline fill="none" stroke="var(--green)" stroke-width="2.5" points="${pts.join(' ')}"/>`+pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="4" fill="var(--green)"/>`).join('');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Graf bajet, belanja dan gaji bersih">${g}</svg>
  <div class="mut"><span style="color:var(--blue)">■</span> Bajet <span style="color:var(--orange)">■</span> Belanja <span style="color:var(--green)">●</span> Gaji bersih</div>`;
}
function viewReport(){
  const now=today().slice(0,7),all=keys();
  /* Dari bulan pertama hingga bulan semasa; jika semua data masa depan, tunjuk semua */
  let ks=all.filter(k=>k<=now||k<=cur);if(!ks.length)ks=all;
  const rows=ks.map(k=>({k,...monthStat(k)})),t=monthStat(cur);
  const over=S.months[cur].cats.flatMap(c=>c.budget!=null?(catStat(c).over?[[c.name,catStat(c).over]]:[]):c.items.filter(i=>actual(i)>plan(i)).map(i=>[c.name+' › '+i.name,r2(actual(i)-plan(i))])).sort((a,b)=>b[1]-a[1]);
  return `<div class="card"><h2>${mName(ks[0])} – ${mName(ks.at(-1))}</h2>${chart(rows)}</div>
  <div class="card"><table><tr><th>Bulan</th><th>Gaji</th><th>Bajet</th><th>Belanja</th><th>Lebihan</th><th>Baki</th></tr>
  ${rows.map(r=>`<tr><td>${mName(r.k)}</td><td>${r.net.toFixed(2)}</td><td>${r.budget.toFixed(2)}</td><td>${r.spent.toFixed(2)}</td><td class="${r.over?'red':''}">${r.over.toFixed(2)}</td><td class="${r.baki<0?'red':''}">${r.baki.toFixed(2)}</td></tr>`).join('')}
  <tr><th>Jumlah</th>${['net','budget','spent','over','baki'].map(f=>`<th>${sum(rows,r=>r[f]).toFixed(2)}</th>`).join('')}</tr></table></div>
  <div class="card"><h2>Report lebihan: ${mName(cur)}</h2>
  ${t.bakiPlan<0?`<p class="red">Bajet lebih ${rm(-t.bakiPlan)} daripada gaji bersih.</p>`:''}${t.baki<0?`<p class="red">Belanja lebih ${rm(-t.baki)} daripada gaji bersih.</p>`:''}
  ${over.length?`<table>${over.map(([n,v])=>`<tr><td>${esc(n)}</td><td class="red">+${rm(v)}</td></tr>`).join('')}<tr><th>Jumlah lebihan</th><th>${rm(t.over)}</th></tr></table>`:'<p class="green">Tiada item melebihi bajet.</p>'}</div>
  <div class="card"><h2>Ikut kategori: ${mName(cur)}</h2><table><tr><th>Kategori</th><th>Bajet</th><th>Belanja</th><th>Beza</th></tr>${t.cats.map(c=>`<tr><td>${esc(c.name)}</td><td>${c.budget.toFixed(2)}</td><td>${c.spent.toFixed(2)}</td><td class="${c.spent>c.budget?'red':''}">${(c.budget-c.spent).toFixed(2)}</td></tr>`).join('')}</table></div>`;
}
const viewData=()=>`<div class="card"><h2>Backup data</h2><p class="mut">Data disimpan dalam browser ini (dan Supabase jika disambung). Export sebagai backup.</p>
<div class="row"><button class="pri" data-a="export">Export</button><button data-a="import">Import</button>${cur?'<button data-a="delm" class="red">Padam bulan ini</button>':''}</div></div>`;

function render(){
  const ks=keys();if(!S.months[cur]){const now=today().slice(0,7);cur=ks.includes(now)?now:ks.at(-1)||null}
  $('#nav').innerHTML=[['bulan','Bulanan'],['report','Report'],['data','Data']].map(([k,l])=>`<button data-a="tab" data-t="${k}" class="${tab===k?'on':''}">${l}</button>`).join('');
  $('#mbar').innerHTML=cur?`<select id="sel" aria-label="Pilih bulan" class="sp">${ks.map(k=>`<option value="${k}" ${k===cur?'selected':''}>${mName(k)}</option>`).join('')}</select><button data-a="newm">+ Bulan</button>`:'';
  if(cur)$('#sel').onchange=e=>{cur=e.target.value;render()};
  $('#app').innerHTML=tab==='data'?viewCloud()+viewData():viewInbox()+(!cur?`<div class="card"><h2>Mula di sini</h2><p>Import fail data awak, atau mula kosong.</p><div class="row"><button class="pri" data-a="import">Import data</button><button data-a="newm">Mula kosong</button><button data-a="login">Sambung Supabase</button></div></div>`:tab==='report'?viewReport():viewMonth());
}
function valid(d){return d&&d.months&&Object.entries(d.months).every(([k,m])=>/^\d{4}-\d{2}$/.test(k)&&m.salary&&Array.isArray(m.salary.deductions)&&Array.isArray(m.cats)&&m.cats.every(c=>/^\w+$/.test(c.id)&&Array.isArray(c.items)&&c.items.every(i=>/^\w+$/.test(i.id)&&Array.isArray(i.entries)&&(!i.inst||(Number.isFinite(i.inst.n)&&Number.isFinite(i.inst.total))))))}
document.addEventListener('click',e=>{
  const el=e.target.closest('[data-a]');if(!el)return;const{a,c,i,n,t}=el.dataset;
  if(a==='tab'){tab=t;render()}
  if(a==='newm')newMonth();
  if(a==='sal')editSalary();
  if(a==='ded')editDed(n===undefined?-1:+n);
  if(a==='cat')editCat(c);
  if(a==='item')editItem(c,i);
  if(a==='entry')editEntry(c,i,n===undefined?-1:+n);
  if(a==='paid'){item(c,i).paid=el.checked;save()}
  if(a==='import')$('#file').click();
  if(a==='export'){const l=document.createElement('a');l.href=URL.createObjectURL(new Blob([JSON.stringify(S,null,1)],{type:'application/json'}));l.download='bad-expenses-backup-'+today()+'.json';l.click()}
  if(a==='delm'&&confirm('Padam semua data '+mName(cur)+'?')){delete S.months[cur];cur=null;save()}
});
$('#file').onchange=async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  try{const d=JSON.parse(await f.text());if(!valid(d))throw 0;
    if(keys().length&&!confirm('Gantikan semua data sedia ada?'))return;
    S=d;cur=null;tab='bulan';save()}catch(x){alert('Fail tidak sah.')}
};
