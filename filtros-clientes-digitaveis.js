/* ============================================================
   EmbrioGestor — Filtros de clientes digitáveis v1
   Complemento para filtro-clientes-enter-v2.js
   Carregar DEPOIS dele.
   ============================================================ */
(function(){
"use strict";

function norm(v){
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .trim();
}

function clientes(){
  const lista = typeof clientesDisponiveisProfissional === "function"
    ? clientesDisponiveisProfissional()
    : (db.clientes || []);

  return [...lista].sort((a,b)=>
    String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR")
  );
}

function criarDatalist(id){
  let dl = document.getElementById(id);
  if(dl) dl.remove();

  dl = document.createElement("datalist");
  dl.id = id;
  dl.innerHTML = clientes()
    .map(c=>`<option value="${String(c.nome||"").replace(/"/g,"&quot;")}"></option>`)
    .join("");

  document.body.appendChild(dl);
  return dl;
}

function substituirSelectPorBusca(selectId, tipo){
  const sel = document.getElementById(selectId);
  if(!sel) return;
  if(document.getElementById(selectId + "_busca")) return;

  const wrapper = sel.parentElement;
  if(!wrapper) return;

  const input = document.createElement("input");
  input.type = "search";
  input.id = selectId + "_busca";
  input.autocomplete = "off";
  input.placeholder = "Digite o nome do cliente...";
  input.setAttribute("list", selectId + "_lista");
  input.style.width = "100%";
  input.style.boxSizing = "border-box";

  criarDatalist(selectId + "_lista");

  sel.style.display = "none";
  sel.insertAdjacentElement("afterend", input);

  function filtrar(){
    const termo = norm(input.value);

    if(tipo === "doadoras"){
      document.querySelectorAll("#egDoadorasGrupos [data-cliente-id]").forEach(bloco=>{
        const titulo = norm(
          bloco.querySelector(".date-group-title")?.textContent || ""
        );

        bloco.style.display =
          !termo || titulo.includes(termo)
            ? ""
            : "none";
      });
    }

    else if(tipo === "touros"){
      document.querySelectorAll("#egTourosGrupos [data-cliente-id]").forEach(bloco=>{
        const titulo = norm(
          bloco.querySelector(".date-group-title")?.textContent || ""
        );

        bloco.style.display =
          !termo || titulo.includes(termo)
            ? ""
            : "none";
      });
    }

    else if(tipo === "operacional"){
      const content = document.getElementById("content");
      if(!content) return;

      let grupos = [...content.querySelectorAll(".date-group")];
      grupos = grupos.filter(g=>!g.parentElement?.closest(".date-group"));

      if(grupos.length){
        grupos.forEach(bloco=>{
          const titulo = norm(
            bloco.querySelector(".date-group-title")?.textContent ||
            bloco.querySelector("h3,h4")?.textContent ||
            ""
          );

          bloco.style.display =
            !termo || titulo.includes(termo)
              ? ""
              : "none";
        });

        return;
      }

      /* Fallback para alguma tela que ainda esteja em tabela simples.
         Continua procurando somente o nome do cliente digitado. */
      [...content.querySelectorAll("tbody tr")].forEach(tr=>{
        tr.style.display =
          !termo || norm(tr.innerText).includes(termo)
            ? ""
            : "none";
      });
    }
  }

  input.addEventListener("input", filtrar);

  /* Esc limpa rapidamente o filtro. */
  input.addEventListener("keydown", ev=>{
    if(ev.key === "Escape"){
      input.value = "";
      filtrar();
    }
  });
}

function instalar(){
  substituirSelectPorBusca(
    "egFiltroDoadorasCliente",
    "doadoras"
  );

  substituirSelectPorBusca(
    "egFiltroTourosCliente",
    "touros"
  );

  substituirSelectPorBusca(
    "egFiltroClienteOperacional",
    "operacional"
  );
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", instalar);
}else{
  instalar();
}

/* As páginas são reconstruídas ao navegar, então reinstala automaticamente. */
new MutationObserver(()=>{
  requestAnimationFrame(instalar);
}).observe(
  document.documentElement,
  {childList:true, subtree:true}
);

})();