/* EmbrioGestor - indicador de trabalho offline v2 */
(function(){
"use strict";

const KEY="embriogestor_offline_pending";

function pending(){return localStorage.getItem(KEY)==="1";}

function statusEl(){
  let el=document.getElementById("egOfflineStatus");
  if(el) return el;
  el=document.createElement("div");
  el.id="egOfflineStatus";
  el.style.cssText="position:fixed;right:12px;bottom:12px;z-index:2147482500;max-width:360px;padding:10px 14px;border-radius:12px;font:600 13px/1.4 Arial,sans-serif;box-shadow:0 7px 24px rgba(0,0,0,.22)";
  document.body.appendChild(el);
  return el;
}

function refresh(){
  const el=statusEl();

  if(!navigator.onLine){
    el.textContent=pending()
      ?"📴 Offline — dados salvos neste aparelho; sincronize quando voltar a internet."
      :"📴 Offline — trabalhando com os dados salvos neste aparelho.";
    el.style.background="#7a4b00";
    el.style.color="#fff";
    el.style.display="block";
    return;
  }

  if(pending()){
    el.textContent="☁️ Internet disponível — há alterações pendentes para o Google Drive.";
    el.style.background="#173f61";
    el.style.color="#fff";
    el.style.display="block";
  }else{
    el.textContent="✓ Online";
    el.style.background="#eaf7ef";
    el.style.color="#1e6b3b";
    setTimeout(()=>{if(navigator.onLine&&!pending())el.style.display="none";},2500);
  }
}

function mark(){
  localStorage.setItem(KEY,"1");
  localStorage.setItem("embriogestor_offline_last_local",new Date().toISOString());
  refresh();
}

function clear(){
  localStorage.removeItem(KEY);
  localStorage.setItem("embriogestor_offline_last_sync",new Date().toISOString());
  refresh();
}

if(typeof window.salvarBanco==="function"){
  const old=window.salvarBanco;
  window.salvarBanco=function(){
    const r=old.apply(this,arguments);
    mark();
    return r;
  };
}

if(typeof window.salvarDadosPrincipaisDrive==="function"){
  const old=window.salvarDadosPrincipaisDrive;
  window.salvarDadosPrincipaisDrive=async function(){
    const before=localStorage.getItem("embriogestor_drive_ultima_sync")||"";
    const r=await old.apply(this,arguments);
    const after=localStorage.getItem("embriogestor_drive_ultima_sync")||"";
    if(after && after!==before) clear();
    return r;
  };
}

window.addEventListener("offline",refresh);
window.addEventListener("online",()=>{
  refresh();
  if(pending()){
    setTimeout(()=>{
      if(confirm("A internet voltou e existem alterações pendentes. Deseja abrir Nuvem & Backup agora?")){
        if(typeof irPara==="function")irPara("nuvem");
      }
    },500);
  }
});
window.addEventListener("load",refresh);

window.EmbrioOffline={temPendencias:pending,marcar:mark,limpar:clear,atualizar:refresh};
})();