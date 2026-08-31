/* EmbrioGestor - Touros/Cliente + Tipo Semen + Analise v1 */
(function(){
"use strict";
const B=()=>{try{return db||{}}catch(e){return{}}};
const N=v=>String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const E=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));

/* Tipo de semen no cadastro */
const FT=window.formTouro, ST=window.salvarTouro;
if(typeof FT==="function") window.formTouro=function(id=""){
 const r=FT.apply(this,arguments);
 setTimeout(()=>{
  if(document.querySelector('[name="tipoSemen"]'))return;
  const t=(B().touros||[]).find(x=>x.id===id)||{};
  const alvo=document.querySelector('[name="central"]')?.closest("div")||document.querySelector('[name="nome"]')?.closest("div");
  if(!alvo)return;
  const d=document.createElement("div");
  d.innerHTML='<label>Tipo de sêmen</label><select name="tipoSemen"><option value="">Selecione...</option><option value="Convencional">Convencional</option><option value="Sexado macho">Sexado macho</option><option value="Sexado fêmea">Sexado fêmea</option></select>';
  alvo.after(d); d.querySelector("select").value=t.tipoSemen||"";
 },0); return r;
};
if(typeof ST==="function") window.salvarTouro=function(id=""){
 const tipo=document.querySelector('[name="tipoSemen"]')?.value||"";
 const nome=document.querySelector('[name="nome"]')?.value?.trim()||"";
 const r=ST.apply(this,arguments);
 let t=id?(B().touros||[]).find(x=>x.id===id):[...(B().touros||[])].reverse().find(x=>String(x.nome||"").trim()===nome);
 if(t){t.tipoSemen=tipo;if(typeof salvarBanco==="function")salvarBanco()}
 return r;
};

/* Touros do cliente na producao */
function ids(cid){
 const s=new Set(); if(!cid)return s;
 ["estoque","producoes","servicosSemen"].forEach(k=>(B()[k]||[]).forEach(x=>{if(x.clienteId===cid&&x.touroId)s.add(x.touroId)}));
 return s;
}
function filtrar(valor=""){
 const c=document.querySelector('[name="clienteId"]'),t=document.querySelector('[name="touroId"]'); if(!c||!t)return;
 const s=ids(c.value); if(valor)s.add(valor);
 const L=(B().touros||[]).filter(x=>s.has(x.id)).sort((a,b)=>String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR"));
 t.innerHTML='<option value="">'+(c.value?'Selecione o touro...':'Selecione primeiro o cliente...')+'</option>'+L.map(x=>'<option value="'+E(x.id)+'">'+E(x.nome)+(x.tipoSemen?' — '+E(x.tipoSemen):'')+'</option>').join("");
 if(valor)t.value=valor;
 let a=document.getElementById("egAvisoTouroClienteProd");if(!a){a=document.createElement("small");a.id="egAvisoTouroClienteProd";a.style.display="block";t.after(a)}
 a.textContent=!c.value?"Selecione primeiro o cliente.":L.length?L.length+" touro(s) disponível(is) para este cliente.":"Nenhum touro vinculado a este cliente. Cadastre o sêmen no estoque primeiro.";
}
const FP=window.formProducao;
if(typeof FP==="function")window.formProducao=function(id=""){
 const p=(B().producoes||[]).find(x=>x.id===id)||{},r=FP.apply(this,arguments);
 setTimeout(()=>{const c=document.querySelector('[name="clienteId"]');if(!c)return;filtrar(p.touroId||"");if(!c.dataset.egtc){c.dataset.egtc="1";c.addEventListener("change",()=>filtrar(""))}},0);return r;
};

/* Multisselecao na analise */
const sel=new Set();
const touros=()=>[...(B().touros||[])].sort((a,b)=>String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR"));
function achar(q){q=N(q);return touros().find(x=>N(x.nome)===q)||touros().find(x=>N(x.nome).includes(q))}
function render(){
 const a=document.getElementById("egATSelecionados");if(!a)return;
 a.innerHTML=sel.size?[...sel].map(id=>{const t=touros().find(x=>x.id===id);return t?'<span style="display:inline-flex;gap:6px;padding:6px 9px;margin:3px;border:1px solid #ccd8e2;border-radius:18px">'+E(t.nome)+' <button type="button" onclick="egATRemoverTouro(\''+E(id)+'\')">×</button></span>':""}).join(""):"<small>Nenhum touro selecionado — mostrando todos.</small>";
}
function aplicar(){const b=document.getElementById("egATTbody");if(!b)return;[...b.querySelectorAll("tr")].forEach(r=>{const bt=r.querySelector(".eg-at-link");if(!bt)return;const t=touros().find(x=>N(x.nome)===N(bt.textContent));r.style.display=!sel.size||(t&&sel.has(t.id))?"":"none"})}
window.egATAdicionarTouro=()=>{const i=document.getElementById("egATMultiTouro");if(!i)return;const t=achar(i.value);if(!t){if(i.value.trim())alert("Touro não encontrado.");return}sel.add(t.id);i.value="";render();if(window.egATMontar)window.egATMontar();setTimeout(aplicar,0);i.focus()};
window.egATRemoverTouro=id=>{sel.delete(id);render();if(window.egATMontar)window.egATMontar();setTimeout(aplicar,0)};
window.egATLimparTouros=()=>{sel.clear();render();if(window.egATMontar)window.egATMontar();setTimeout(aplicar,0)};
function instalar(){
 const body=document.getElementById("egATTbody");if(!body||document.getElementById("egATMultiWrap"))return;
 const old=document.getElementById("egATTouro");if(old?.closest("div"))old.closest("div").style.display="none";
 const dl=document.createElement("datalist");dl.id="egATListaTouros";dl.innerHTML=touros().map(t=>'<option value="'+E(t.nome)+'"></option>').join("");document.body.appendChild(dl);
 const w=document.createElement("div");w.id="egATMultiWrap";w.style.cssText="margin:14px 0;padding:12px;border:1px solid #d8e4ee;border-radius:12px";
 w.innerHTML='<label><strong>Selecionar touros para analisar</strong></label><div style="display:flex;gap:8px;flex-wrap:wrap"><input id="egATMultiTouro" type="search" list="egATListaTouros" placeholder="Digite o touro e pressione Enter..." style="flex:1;min-width:220px"><button type="button" class="btn secondary" onclick="egATAdicionarTouro()">Adicionar</button><button type="button" class="btn secondary" onclick="egATLimparTouros()">Mostrar todos</button></div><small>Digite um touro → Enter → digite o próximo → Enter.</small><div id="egATSelecionados"></div>';
 body.closest(".table-wrap")?.before(w);document.getElementById("egATMultiTouro")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();egATAdicionarTouro()}},true);render();aplicar();
}
const MA=window.egATMontar;if(typeof MA==="function")window.egATMontar=function(){const r=MA.apply(this,arguments);setTimeout(()=>{instalar();aplicar()},0);return r};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",instalar);else instalar();
new MutationObserver(()=>requestAnimationFrame(instalar)).observe(document.documentElement,{childList:true,subtree:true});
})();