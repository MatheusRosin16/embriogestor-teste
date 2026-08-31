(function(){"use strict";
if(!("serviceWorker" in navigator)){console.warn("Service Worker não suportado.");return;}
window.addEventListener("load",async()=>{
  try{
    const reg=await navigator.serviceWorker.register("./sw.js",{scope:"./"});
    console.log("EmbrioGestor offline registrado:",reg.scope);
    reg.addEventListener("updatefound",()=>{
      const novo=reg.installing;
      if(!novo)return;
      novo.addEventListener("statechange",()=>{
        if(novo.state==="installed"&&navigator.serviceWorker.controller){
          console.log("Nova versão instalada. Será usada na próxima abertura.");
        }
      });
    });
  }catch(err){
    console.error("Falha ao registrar modo offline:",err);
  }
});
})();