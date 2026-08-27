/* EmbrioGestor - registro robusto do modo offline */
(function(){
"use strict";

if(!("serviceWorker" in navigator)){
  console.warn("Service Worker não suportado neste navegador.");
  return;
}

window.addEventListener("load", async ()=>{
  try{
    const reg = await navigator.serviceWorker.register("./sw.js?v=2", { scope: "./" });
    console.log("EmbrioGestor offline registrado:", reg.scope);

    // Força verificação da versão nova.
    try { await reg.update(); } catch(e){}

    // Se uma versão nova assumir, recarrega uma vez para ficar controlado pelo SW.
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", ()=>{
      if(refreshing) return;
      refreshing = true;
      location.reload();
    });

    // Mostra diagnóstico simples no console.
    if(navigator.serviceWorker.controller){
      console.log("EmbrioGestor já está controlado pelo modo offline.");
    }else{
      console.log("Primeira instalação do modo offline: feche e abra o app após carregar online.");
    }
  }catch(err){
    console.error("Falha ao registrar modo offline:", err);
  }
});
})();