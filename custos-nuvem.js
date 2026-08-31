/* EmbrioGestor — Custos na Nuvem + Compatibilidade v1 */
(function(){
"use strict";

const CHAVE_PADRAO="embriogestor_v9";

function chave(){
  try{
    if(typeof DB_KEY!=="undefined" && DB_KEY) return DB_KEY;
  }catch(e){}
  return CHAVE_PADRAO;
}

function banco(){
  try{return db}catch(e){return null}
}

function custosStorage(){
  try{
    const raw=localStorage.getItem(chave());
    if(!raw)return [];
    const obj=JSON.parse(raw);
    return Array.isArray(obj?.custosProducao)?obj.custosProducao:[];
  }catch(e){return []}
}

function garantir(){
  const b=banco();
  if(!b)return;
  if(!Array.isArray(b.custosProducao)){
    b.custosProducao=custosStorage();
  }
}

garantir();

/* Faz a normalização antiga preservar custosProducao ao carregar Drive/importação */
try{
  if(typeof normalizarBanco==="function" && !normalizarBanco.__egCustosNuvem){
    const original=normalizarBanco;
    const adaptada=function(data={}){
      const custos=Array.isArray(data?.custosProducao)?data.custosProducao:[];
      const novo=original(data);
      novo.custosProducao=custos;
      return novo;
    };
    adaptada.__egCustosNuvem=true;
    normalizarBanco=adaptada;
  }
}catch(e){
  console.warn("Custos Nuvem: normalização não adaptada.",e);
}

/* Garante que bancos novos também tenham o campo */
try{
  if(typeof bancoVazio==="function" && !bancoVazio.__egCustosNuvem){
    const original=bancoVazio;
    const adaptada=function(){
      const novo=original();
      if(!Array.isArray(novo.custosProducao))novo.custosProducao=[];
      return novo;
    };
    adaptada.__egCustosNuvem=true;
    bancoVazio=adaptada;
  }
}catch(e){}

/* Antes de qualquer salvamento, mantém o campo presente */
try{
  if(typeof salvarBanco==="function" && !salvarBanco.__egCustosNuvem){
    const original=salvarBanco;
    const adaptada=function(){
      garantir();
      return original.apply(this,arguments);
    };
    adaptada.__egCustosNuvem=true;
    salvarBanco=adaptada;
  }
}catch(e){}

/* Consolida imediatamente o banco atual */
try{
  const b=banco();
  if(b){
    garantir();
    localStorage.setItem(chave(),JSON.stringify(b));
  }
}catch(e){}

console.log("EmbrioGestor: custos compatíveis com nuvem.");
})();