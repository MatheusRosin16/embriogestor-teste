/* ============================================================
   EmbrioGestor — Doadoras e Touros minimizados por cliente v1
   Complemento para filtro-clientes-enter-v2.js
   Carregar DEPOIS dele e dos filtros digitáveis.
   ============================================================ */
(function(){
"use strict";

function prepararGrupo(grupo){
  if(!grupo || grupo.dataset.egColapsavel==="1") return;

  const titulo = grupo.querySelector(".date-group-title");
  if(!titulo) return;

  const filhos = [...grupo.children].filter(el=>el!==titulo);
  if(!filhos.length) return;

  grupo.dataset.egColapsavel="1";
  grupo.dataset.egAberto="0";

  titulo.style.cursor = "pointer";
  titulo.style.userSelect = "none";
  titulo.style.display = "flex";
  titulo.style.alignItems = "center";
  titulo.style.justifyContent = "space-between";
  titulo.style.gap = "10px";

  const textoOriginal = document.createElement("span");
  textoOriginal.className = "eg-grupo-titulo-texto";
  textoOriginal.innerHTML = titulo.innerHTML;

  const seta = document.createElement("span");
  seta.className = "eg-grupo-seta";
  seta.textContent = "▶";
  seta.style.fontSize = "14px";
  seta.style.flex = "0 0 auto";
  seta.style.transition = "transform .15s ease";

  titulo.innerHTML = "";
  titulo.appendChild(textoOriginal);
  titulo.appendChild(seta);

  filhos.forEach(el=>{
    el.classList.add("eg-grupo-conteudo");
    el.style.display = "none";
  });

  titulo.addEventListener("click", ()=>{
    const aberto = grupo.dataset.egAberto==="1";
    grupo.dataset.egAberto = aberto ? "0" : "1";

    filhos.forEach(el=>{
      el.style.display = aberto ? "none" : "";
    });

    seta.textContent = aberto ? "▶" : "▼";
  });
}

function prepararTela(){
  const doadoras = document.getElementById("egDoadorasGrupos");
  const touros = document.getElementById("egTourosGrupos");

  if(doadoras){
    doadoras.querySelectorAll(":scope > .date-group")
      .forEach(prepararGrupo);
  }

  if(touros){
    touros.querySelectorAll(":scope > .date-group")
      .forEach(prepararGrupo);
  }
}

/* Quando o filtro digitável localizar apenas um cliente,
   abre automaticamente esse grupo para facilitar o uso. */
function abrirGrupoVisivelUnico(container){
  if(!container) return;

  const visiveis = [...container.querySelectorAll(":scope > .date-group")]
    .filter(g=>getComputedStyle(g).display!=="none");

  if(visiveis.length!==1) return;

  const grupo = visiveis[0];
  if(grupo.dataset.egAberto==="1") return;

  const titulo = grupo.querySelector(".date-group-title");
  titulo?.click();
}

function observarFiltros(){
  document.addEventListener("input", ev=>{
    const id = ev.target?.id || "";

    if(id==="egFiltroDoadorasCliente_busca"){
      setTimeout(
        ()=>abrirGrupoVisivelUnico(document.getElementById("egDoadorasGrupos")),
        20
      );
    }

    if(id==="egFiltroTourosCliente_busca"){
      setTimeout(
        ()=>abrirGrupoVisivelUnico(document.getElementById("egTourosGrupos")),
        20
      );
    }
  });
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded", ()=>{
    prepararTela();
    observarFiltros();
  });
}else{
  prepararTela();
  observarFiltros();
}

new MutationObserver(()=>{
  requestAnimationFrame(prepararTela);
}).observe(
  document.documentElement,
  {childList:true, subtree:true}
);

})();