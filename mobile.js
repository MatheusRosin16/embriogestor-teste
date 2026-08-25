(function(){
  const body=document.body;
  window.alternarMenuMobile=function(){ body.classList.toggle('mobile-menu-open'); };
  window.fecharMenuMobile=function(){ body.classList.remove('mobile-menu-open'); };

  document.addEventListener('click',function(e){
    const b=e.target.closest && e.target.closest('#menu button');
    if(b && window.matchMedia('(max-width: 900px)').matches) fecharMenuMobile();
  });

  let deferredPrompt=null;
  const installBtn=document.getElementById('installAppBtn');
  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault(); deferredPrompt=e;
    if(installBtn) installBtn.hidden=false;
  });
  if(installBtn){
    installBtn.addEventListener('click',async()=>{
      if(!deferredPrompt){ alert('Para instalar como aplicativo, abra o EmbrioGestor em um endereço HTTPS no navegador do celular.'); return; }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt=null; installBtn.hidden=true;
    });
  }
  window.addEventListener('appinstalled',()=>{ if(installBtn) installBtn.hidden=true; });

  if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1')){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
  }
})();
