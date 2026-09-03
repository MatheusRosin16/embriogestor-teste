(function(){
"use strict";
const K="embriogestor_aspiracao_sync_pendente";
function pend(v=true){try{v?localStorage.setItem(K,new Date().toISOString()):localStorage.removeItem(K)}catch(e){}}
function conectado(){try{return typeof driveToken!=="undefined"&&!!driveToken}catch(e){return false}}
let t=null;
function sync(){
  pend(true); clearTimeout(t);
  t=setTimeout(async()=>{
    try{
      if(!navigator.onLine||!conectado()||typeof salvarDadosPrincipaisDrive!=="function")return;
      await salvarDadosPrincipaisDrive(); pend(false);
    }catch(e){pend(true)}
  },700);
}
try{
  if(typeof salvarAspiracao==="function"){
    const o=salvarAspiracao;
    salvarAspiracao=function(){
      let a="";try{a=JSON.stringify(db.aspiracoes||[])}catch(e){}
      const r=o.apply(this,arguments);
      let b="";try{b=JSON.stringify(db.aspiracoes||[])}catch(e){}
      if(a!==b)sync(); return r;
    };
  }
}catch(e){}
try{
  if(typeof excluirAspiracao==="function"){
    const o=excluirAspiracao;
    excluirAspiracao=function(){
      let a="";try{a=JSON.stringify(db.aspiracoes||[])}catch(e){}
      const r=o.apply(this,arguments);
      let b="";try{b=JSON.stringify(db.aspiracoes||[])}catch(e){}
      if(a!==b)sync(); return r;
    };
  }
}catch(e){}
window.addEventListener("online",()=>{try{if(localStorage.getItem(K))sync()}catch(e){}});
try{
  if(typeof conectarGoogleDrive==="function"){
    const o=conectarGoogleDrive;
    conectarGoogleDrive=async function(){
      const r=await o.apply(this,arguments);
      try{if(r&&localStorage.getItem(K))setTimeout(sync,500)}catch(e){}
      return r;
    };
  }
}catch(e){}
})();