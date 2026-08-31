/* EmbrioGestor — Dashboard Produção v1
   Troca os cards de estoque por totais produtivos e adiciona % de produção.
*/
(function(){
"use strict";

function B(){try{return db||{}}catch(e){return{}}}
function nn(v){const n=Number(v);return Number.isFinite(n)&&n>=0?n:0}

function producoesPeriodoAtual(){
  const b=B();
  try{
    if(typeof lerPeriodo==="function" && typeof dataNoPeriodo==="function"){
      const p=lerPeriodo("dash");
      if(p && p.valor){
        return (b.producoes||[]).filter(x=>dataNoPeriodo(x.data,p.tipo,p.valor));
      }
    }
  }catch(e){}
  return b.producoes||[];
}

function pct(n,d){
  if(!d)return "0,0%";
  return (n/d*100).toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:1})+"%";
}

function localizarCard(rotulos){
  const cards=[...document.querySelectorAll("#dashboardResultado .card, #content .card")];
  return cards.find(card=>{
    const titulo=(card.querySelector("strong")?.textContent||"").trim().toLowerCase();
    return rotulos.some(r=>titulo===r.toLowerCase());
  });
}

function setCard(card,titulo,valor,sub=""){
  if(!card)return;
  const strong=card.querySelector("strong");
  const h2=card.querySelector("h2");
  if(strong)strong.textContent=titulo;
  if(h2)h2.textContent=valor;
  let small=card.querySelector("small");
  if(sub){
    if(!small){
      small=document.createElement("small");
      card.appendChild(small);
    }
    small.textContent=sub;
  }else if(small){
    small.remove();
  }
}

function aplicarAlteracoes(){
  const out=document.getElementById("dashboardResultado");
  if(!out)return;

  const prod=producoesPeriodoAtual();
  const viaveis=prod.reduce((s,p)=>s+nn(p.oocitosViaveis),0);
  const d7=prod.reduce((s,p)=>s+nn(p.embriõesD7),0);
  const fresco=prod.reduce((s,p)=>s+nn(p.transferidosFresco),0);
  const dt=prod.reduce((s,p)=>s+nn(p.congeladosDT??p.transferidosDT),0);
  const vt=prod.reduce((s,p)=>s+nn(p.congeladosVT??p.transferidosVT),0);
  const congelados=dt+vt;

  const cardSemen=localizarCard(["Estoque sêmen","Estoque de sêmen","Doses de sêmen"]);
  const cardEstoqueEmb=localizarCard(["Estoque embriões DT/VT","Estoque de embriões DT/VT","Embriões em estoque"]);

  setCard(cardSemen,"Total de embriões frescos",fresco,"Transferidos a fresco no período");
  setCard(cardEstoqueEmb,"Total de embriões congelados",congelados,`DT ${dt} + VT ${vt}`);

  /* Adiciona ou atualiza % de produção */
  let cardPct=document.getElementById("egDashPercentualProducao");
  if(!cardPct){
    cardPct=document.createElement("div");
    cardPct.className="card";
    cardPct.id="egDashPercentualProducao";
    const grid=out.querySelector(".grid.kpis")||out.querySelector(".kpis");
    if(grid)grid.appendChild(cardPct);
  }
  if(cardPct){
    cardPct.innerHTML=`
      <strong>% de produção</strong>
      <h2>${pct(d7,viaveis)}</h2>
      <small>Embriões D7 ÷ Oócitos viáveis</small>
    `;
  }
}

/* A versão atual do EmbrioGestor usa aplicarDashboard() após mudar período.
   Envolvemos a função para atualizar nossos cards sempre junto. */
try{
  if(typeof aplicarDashboard==="function" && !aplicarDashboard.__egDashboardProducao){
    const original=aplicarDashboard;
    const adaptada=function(){
      const r=original.apply(this,arguments);
      setTimeout(aplicarAlteracoes,0);
      return r;
    };
    adaptada.__egDashboardProducao=true;
    aplicarDashboard=adaptada;
  }
}catch(e){
  console.warn("Dashboard Produção: não foi possível envolver aplicarDashboard.",e);
}

/* Também cobre abertura inicial e eventuais re-renders. */
function instalar(){
  setTimeout(aplicarAlteracoes,0);
}
if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",instalar);
}else{
  instalar();
}

new MutationObserver(()=>{
  if(document.getElementById("dashboardResultado")){
    requestAnimationFrame(aplicarAlteracoes);
  }
}).observe(document.documentElement,{childList:true,subtree:true});

})();