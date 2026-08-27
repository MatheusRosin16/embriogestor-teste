(function(){"use strict";

function camposDoContexto(contexto){
  return [...contexto.querySelectorAll(
    'input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])'
  )].filter(el=>{
    const st=getComputedStyle(el);
    if(st.display==="none"||st.visibility==="hidden")return false;
    if(el.offsetParent===null&&st.position!=="fixed")return false;
    return true;
  });
}
function proximoCampo(atual){
  const contexto=atual.closest(".modal")||atual.closest(".card")||atual.closest("form")||document;
  const campos=camposDoContexto(contexto);
  const i=campos.indexOf(atual);
  if(i<0)return null;
  for(let j=i+1;j<campos.length;j++){
    const el=campos[j];
    const txt=String(el.textContent||"").toLowerCase();
    if(el.tagName==="BUTTON"&&(txt.includes("excluir")||txt.includes("remover")||txt.includes("cancelar")))continue;
    return el;
  }
  return null;
}

document.addEventListener("keydown",function(ev){
  if(ev.key!=="Enter")return;
  const el=ev.target;
  if(!(el instanceof HTMLElement))return;
  if(el.tagName==="TEXTAREA"&&!ev.ctrlKey&&!ev.metaKey)return;
  if(el.tagName==="BUTTON")return;
  ev.preventDefault();
  const prox=proximoCampo(el);
  if(prox){
    prox.focus();
    if(prox.tagName==="INPUT"&&typeof prox.select==="function"&&!["date","month","number"].includes(prox.type)){
      try{prox.select();}catch(e){}
    }
  }
},true);

const CONFIGS=[
  {chave:"estoque-semen",nomes:["estoque de semen","estoque de sêmen"],placeholder:"Localizar por cliente, touro, raça, partida, central ou dados exibidos..."},
  {chave:"estoque-embrioes",nomes:["estoque de embrioes","estoque de embriões"],placeholder:"Localizar por cliente, doadora, touro, raça, identificação ou dados exibidos..."},
  {chave:"producao-embrioes",nomes:["producao de embrioes","produção de embriões"],placeholder:"Localizar por cliente, doadora, touro, data ou dados exibidos..."},
  {chave:"transferencia-embrioes",nomes:["transferencia de embrioes","transferência de embriões"],placeholder:"Localizar por cliente, doadora, touro, receptora, destino, diagnóstico ou dados exibidos..."}
];

function norm(v){
  return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
}
function paginaAtual(){
  const ativo=norm(document.querySelector("#menu button.active")?.textContent||"");
  const h1=norm(document.querySelector("h1")?.textContent||"");
  const h2=norm(document.querySelector("h2")?.textContent||"");
  const h3=norm(document.querySelector("#content h3")?.textContent||"");
  const tudo=`${ativo} ${h1} ${h2} ${h3}`;
  return CONFIGS.find(cfg=>cfg.nomes.some(n=>tudo.includes(norm(n))));
}
function linhasPesquisaveis(){
  const content=document.getElementById("content");
  if(!content)return[];
  const trs=[...content.querySelectorAll("tbody tr")];
  if(trs.length)return trs;
  const possiveis=[...content.querySelectorAll(".client-card,.group-card,.item-card,.accordion-item,.cliente-bloco,.cliente-card,.card")];
  return possiveis.filter((el,i,arr)=>!arr.some(outro=>outro!==el&&el.contains(outro)));
}
function aplicarFiltro(){
  const input=document.getElementById("egLocalizarGlobal");
  if(!input)return;
  const termo=norm(input.value);
  const linhas=linhasPesquisaveis();
  let visiveis=0;
  linhas.forEach(el=>{
    const mostrar=!termo||norm(el.innerText).includes(termo);
    el.style.display=mostrar?"":"none";
    if(mostrar)visiveis++;
  });
  const info=document.getElementById("egLocalizarInfo");
  if(info)info.textContent=termo?`${visiveis} resultado(s) encontrado(s)`:`${linhas.length} item(ns) exibido(s)`;
}
window.egLimparLocalizar=function(){
  const input=document.getElementById("egLocalizarGlobal");
  if(!input)return;
  input.value="";
  aplicarFiltro();
  input.focus();
};
function instalarPesquisa(){
  const cfg=paginaAtual();
  const content=document.getElementById("content");
  if(!cfg||!content)return;
  const existente=document.getElementById("egLocalizarWrap");
  if(existente){
    if(existente.dataset.pagina===cfg.chave)return;
    existente.remove();
  }
  const wrap=document.createElement("div");
  wrap.id="egLocalizarWrap";
  wrap.dataset.pagina=cfg.chave;
  wrap.style.cssText="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px 0;padding:12px;background:#f7fafc;border:1px solid #d8e4ee;border-radius:12px";
  wrap.innerHTML=`<div style="flex:1 1 300px;position:relative">
    <input id="egLocalizarGlobal" type="search" autocomplete="off" placeholder="${cfg.placeholder}" style="width:100%;min-height:44px;box-sizing:border-box;padding:10px 42px 10px 13px;border:1px solid #bfd0de;border-radius:10px;background:#fff;font-size:15px">
    <span style="position:absolute;right:13px;top:50%;transform:translateY(-50%);pointer-events:none;font-size:18px">🔎</span>
  </div>
  <button type="button" class="btn secondary" onclick="egLimparLocalizar()" style="min-height:44px">Limpar</button>
  <div id="egLocalizarInfo" style="flex:0 0 100%;font-size:12px;color:#647483"></div>`;
  const primeiro=content.querySelector(".card")||content.querySelector(".table-wrap")||content.firstElementChild;
  if(primeiro)content.insertBefore(wrap,primeiro);else content.prepend(wrap);
  document.getElementById("egLocalizarGlobal")?.addEventListener("input",aplicarFiltro);
  aplicarFiltro();
}
function observar(){
  instalarPesquisa();
  const content=document.getElementById("content");
  if(content){
    new MutationObserver(()=>requestAnimationFrame(instalarPesquisa)).observe(content,{childList:true,subtree:true});
  }
  new MutationObserver(()=>requestAnimationFrame(instalarPesquisa)).observe(document.documentElement,{childList:true,subtree:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",observar);else observar();

})();