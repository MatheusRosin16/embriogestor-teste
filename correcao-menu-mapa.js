/* ============================================================
   EmbrioGestor — Correção Menu Relatório Semestral MAPA v1

   Objetivo:
   - fazer "Relatório Semestral MAPA" aparecer sempre no menu;
   - não altera o relatório MAPA em si;
   - não altera app.js.
   ============================================================ */
(function(){
"use strict";

if(window.__EG_CORRECAO_MENU_MAPA__) return;
window.__EG_CORRECAO_MENU_MAPA__ = true;

let botaoMapaSalvo = null;
let recarregouModulo = false;
let timerTentativa = null;

function textoMapa(el){
  const t = (el?.textContent || "").trim();
  return /relat[oó]rio.*mapa/i.test(t) || /mapa/i.test(t);
}

function acharMenu(){
  return document.getElementById("menu") ||
         document.querySelector(".sidebar nav") ||
         document.querySelector("aside nav");
}

function acharBotaoMapa(menu){
  if(!menu) return null;

  const botoes = [...menu.querySelectorAll("button, a")];

  return botoes.find(el => textoMapa(el)) || null;
}

function guardarSeExistir(){
  const menu = acharMenu();
  if(!menu) return false;

  const atual = acharBotaoMapa(menu);

  if(atual){
    botaoMapaSalvo = atual;
    return true;
  }

  return false;
}

function recolocarBotao(){
  const menu = acharMenu();
  if(!menu || !botaoMapaSalvo) return false;

  if(botaoMapaSalvo.isConnected && menu.contains(botaoMapaSalvo)){
    return true;
  }

  /* Mantém a posição próxima de Importar Dados Antigos/Nuvem,
     mas o mais importante é preservar o botão original e seu clique. */
  const itens = [...menu.querySelectorAll("button, a")];

  const nuvem = itens.find(el =>
    /nuvem.*backup/i.test((el.textContent || "").trim())
  );

  const sair = itens.find(el =>
    /^sair$/i.test((el.textContent || "").trim())
  );

  if(nuvem){
    menu.insertBefore(botaoMapaSalvo, nuvem);
  }else if(sair){
    menu.insertBefore(botaoMapaSalvo, sair);
  }else{
    menu.appendChild(botaoMapaSalvo);
  }

  return true;
}

function carregarModuloMapaNovamente(){
  if(recarregouModulo) return;
  recarregouModulo = true;

  /* Só recarrega o módulo se o botão não tiver sido criado na primeira
     execução. O novo carregamento acontece depois que o menu já existe. */
  const s = document.createElement("script");
  s.src = "relatorio-mapa.js?egmenu=" + Date.now();
  s.async = false;

  s.onload = function(){
    setTimeout(function(){
      guardarSeExistir();
      recolocarBotao();
    }, 100);
  };

  s.onerror = function(){
    console.warn("EmbrioGestor: não foi possível recarregar relatorio-mapa.js.");
  };

  document.head.appendChild(s);
}

function corrigir(){
  const menu = acharMenu();
  if(!menu) return;

  if(guardarSeExistir()){
    recolocarBotao();
    return;
  }

  if(botaoMapaSalvo){
    recolocarBotao();
    return;
  }

  clearTimeout(timerTentativa);
  timerTentativa = setTimeout(function(){
    const menu2 = acharMenu();
    if(!menu2) return;

    if(!acharBotaoMapa(menu2) && !botaoMapaSalvo){
      carregarModuloMapaNovamente();
    }
  }, 800);
}

function iniciar(){
  corrigir();

  const obs = new MutationObserver(function(){
    requestAnimationFrame(corrigir);
  });

  obs.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  /* Reforço durante os primeiros segundos da abertura. */
  let n = 0;
  const intervalo = setInterval(function(){
    corrigir();
    n++;
    if(n >= 15) clearInterval(intervalo);
  }, 500);
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", iniciar, {once:true});
}else{
  iniciar();
}

})();