/* ============================================================
   EmbrioGestor — Filtro por Cliente + Enter Avança v2
   - Filtro SOMENTE por cliente em:
     Estoque de Sêmen, Estoque de Embriões,
     Produção de Embriões, Transferência de Embriões
   - Doadoras agrupadas e filtradas por cliente
   - Touros agrupados por clientes relacionados via estoque/produção
   - Enter avança nos formulários
   Carregar DEPOIS de racas-abreviaturas.js
   ============================================================ */
(function(){
"use strict";

function E(v){
  if(typeof esc==="function") return esc(v);
  const m={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"};
  return String(v??"").replace(/[&<>"']/g,c=>m[c]);
}
function N(v){
  return String(v??"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .trim();
}
function clientesOrdenados(){
  const lista = typeof clientesDisponiveisProfissional==="function"
    ? clientesDisponiveisProfissional()
    : (db.clientes||[]);
  return [...lista].sort((a,b)=>String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR"));
}
function clienteNomeLocal(id){
  return (db.clientes||[]).find(c=>c.id===id)?.nome || "Sem cliente vinculado";
}
function opcoesClientes(valor=""){
  return `<option value="">Todos os clientes</option>` +
    clientesOrdenados().map(c=>
      `<option value="${E(c.id)}" ${c.id===valor?"selected":""}>${E(c.nome||"")}</option>`
    ).join("");
}

/* ============================================================
   ENTER AVANÇA
   ============================================================ */
function camposDoContexto(contexto){
  return [...contexto.querySelectorAll(
    'input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled])'
  )].filter(el=>{
    const st=getComputedStyle(el);
    if(st.display==="none"||st.visibility==="hidden")return false;
    if(el.offsetParent===null&&st.position!=="fixed")return false;
    return true;
  });
}
function proximoCampo(atual){
  const contexto=atual.closest(".modal-box")||atual.closest(".modal")||atual.closest("form")||atual.closest(".card")||document;
  const campos=camposDoContexto(contexto);
  const i=campos.indexOf(atual);
  if(i<0)return null;

  for(let j=i+1;j<campos.length;j++){
    const el=campos[j];
    const txt=N(el.textContent||"");
    if(el.tagName==="BUTTON"&&(txt.includes("excluir")||txt.includes("remover")||txt.includes("cancelar")))continue;
    return el;
  }
  return null;
}
document.addEventListener("keydown",ev=>{
  if(ev.key!=="Enter")return;
  const el=ev.target;
  if(!(el instanceof HTMLElement))return;
  if(el.tagName==="TEXTAREA"&&!ev.ctrlKey&&!ev.metaKey)return;
  if(el.tagName==="BUTTON")return;

  ev.preventDefault();
  const prox=proximoCampo(el);
  if(!prox)return;

  prox.focus();
  if(prox.tagName==="INPUT"&&typeof prox.select==="function"&&!["date","month","number"].includes(prox.type)){
    try{prox.select();}catch(e){}
  }
},true);

/* ============================================================
   DOADORAS — AGRUPADAS + FILTRO POR CLIENTE
   ============================================================ */
window.egFiltrarDoadorasCliente=function(){
  const cid=document.getElementById("egFiltroDoadorasCliente")?.value||"";
  document.querySelectorAll("#egDoadorasGrupos [data-cliente-id]").forEach(bloco=>{
    bloco.style.display=!cid||bloco.dataset.clienteId===cid?"":"none";
  });
};

window.doadoras=function(){
  header("Doadoras","Doadoras separadas e filtradas por cliente");

  const clientes=clientesOrdenados();
  const grupos=clientes.map(c=>{
    const itens=(db.doadoras||[])
      .filter(d=>d.clienteId===c.id)
      .sort((a,b)=>String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR"));

    if(!itens.length)return "";

    return `<div class="date-group" data-cliente-id="${E(c.id)}">
      <div class="date-group-title">${E(c.nome)} — ${itens.length} doadora(s)</div>
      ${typeof tabelaDoadoras==="function" ? tabelaDoadoras(itens) : ""}
    </div>`;
  }).join("");

  const sem=(db.doadoras||[]).filter(d=>!db.clientes.some(c=>c.id===d.clienteId));
  const semHtml=sem.length?`<div class="date-group" data-cliente-id="SEM_CLIENTE">
    <div class="date-group-title">Sem cliente vinculado — ${sem.length} doadora(s)</div>
    ${typeof tabelaDoadoras==="function" ? tabelaDoadoras(sem) : ""}
  </div>`:"";

  document.getElementById("content").innerHTML=`
    <div class="card">
      <div class="section-title">
        <h3>Doadoras por cliente</h3>
        <button class="btn" onclick="formDoadora()">Nova doadora</button>
      </div>

      <div style="margin-bottom:14px">
        <label>Localizar cliente</label>
        <select id="egFiltroDoadorasCliente" onchange="egFiltrarDoadorasCliente()">
          ${opcoesClientes()}
          ${sem.length?'<option value="SEM_CLIENTE">Sem cliente vinculado</option>':""}
        </select>
      </div>

      <div id="egDoadorasGrupos">
        ${grupos||semHtml ? grupos+semHtml : '<div class="empty-state">Nenhuma doadora cadastrada.</div>'}
      </div>
    </div>
  `;
};

/* ============================================================
   TOUROS — AGRUPADOS POR CLIENTES RELACIONADOS
   O cadastro do touro continua único/global.
   Um touro pode aparecer em vários clientes.
   ============================================================ */
function clientesDoTouro(touroId){
  const ids=new Set();

  (db.estoque||[]).forEach(x=>{
    if(x.touroId===touroId&&x.clienteId)ids.add(x.clienteId);
  });

  (db.producoes||[]).forEach(x=>{
    if(x.touroId===touroId&&x.clienteId)ids.add(x.clienteId);
  });

  (db.transferencias||[]).forEach(x=>{
    if(x.touroId===touroId&&x.clienteId)ids.add(x.clienteId);

    if(x.origemProducaoId){
      const p=(db.producoes||[]).find(y=>y.id===x.origemProducaoId);
      if(p?.touroId===touroId&&x.clienteId)ids.add(x.clienteId);
    }
  });

  return [...ids];
}
function tabelaTourosCliente(lista){
  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Touro</th><th>Registro</th><th>Raça</th><th>Abrev.</th><th>Central</th><th>Ações</th>
    </tr></thead>
    <tbody>
      ${lista.map(t=>`<tr>
        <td>${E(t.nome||"")}</td>
        <td>${E(t.registro||"")}</td>
        <td>${E(t.raca||"")}</td>
        <td><strong>${E(String(t.racaAbrev||"").trim().toUpperCase() || (typeof egAbrevPadraoRaca==="function"?egAbrevPadraoRaca(t.raca):""))}</strong></td>
        <td>${E(t.central||"")}</td>
        <td>
          <button class="btn small secondary" onclick="formTouro('${E(t.id)}')">Editar</button>
          <button class="btn small danger" onclick="excluirTouro('${E(t.id)}')">Excluir</button>
        </td>
      </tr>`).join("")}
    </tbody>
  </table></div>`;
}
window.egFiltrarTourosCliente=function(){
  const cid=document.getElementById("egFiltroTourosCliente")?.value||"";
  document.querySelectorAll("#egTourosGrupos [data-cliente-id]").forEach(bloco=>{
    bloco.style.display=!cid||bloco.dataset.clienteId===cid?"":"none";
  });
};
window.touros=function(){
  header("Touros","Touros organizados pelos clientes que possuem estoque ou utilização");

  const clientes=clientesOrdenados();

  const blocos=clientes.map(c=>{
    const itens=(db.touros||[])
      .filter(t=>clientesDoTouro(t.id).includes(c.id))
      .sort((a,b)=>String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR"));

    if(!itens.length)return "";

    return `<div class="date-group" data-cliente-id="${E(c.id)}">
      <div class="date-group-title">${E(c.nome)} — ${itens.length} touro(s)</div>
      ${tabelaTourosCliente(itens)}
    </div>`;
  }).join("");

  const sem=(db.touros||[])
    .filter(t=>clientesDoTouro(t.id).length===0)
    .sort((a,b)=>String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR"));

  const semHtml=sem.length?`<div class="date-group" data-cliente-id="SEM_CLIENTE">
    <div class="date-group-title">Sem cliente relacionado — ${sem.length} touro(s)</div>
    ${tabelaTourosCliente(sem)}
  </div>`:"";

  document.getElementById("content").innerHTML=`
    <div class="card">
      <div class="section-title">
        <h3>Touros por cliente</h3>
        <button class="btn" onclick="formTouro()">Novo touro</button>
      </div>

      <div style="margin-bottom:14px">
        <label>Localizar cliente</label>
        <select id="egFiltroTourosCliente" onchange="egFiltrarTourosCliente()">
          ${opcoesClientes()}
          ${sem.length?'<option value="SEM_CLIENTE">Sem cliente relacionado</option>':""}
        </select>
      </div>

      <div id="egTourosGrupos">
        ${blocos||semHtml ? blocos+semHtml : '<div class="empty-state">Nenhum touro cadastrado.</div>'}
      </div>
    </div>
  `;
};

/* ============================================================
   FILTRO SOMENTE POR CLIENTE NAS 4 ABAS OPERACIONAIS
   ============================================================ */
const PAGINAS=[
  {id:"estoque", nomes:["estoque de semen","estoque de sêmen"]},
  {id:"estoqueEmbrioes", nomes:["estoque de embrioes","estoque de embriões"]},
  {id:"producoes", nomes:["producao de embrioes","produção de embriões"]},
  {id:"transferencias", nomes:["transferencia de embrioes","transferência de embriões"]}
];

function paginaOperacionalAtual(){
  const ativo=document.querySelector("#menu button.active")?.dataset?.page||"";
  if(PAGINAS.some(p=>p.id===ativo))return ativo;

  const titulo=N(
    (document.getElementById("pageTitle")?.textContent||"")+" "+
    (document.querySelector("#content h3")?.textContent||"")
  );

  return PAGINAS.find(p=>p.nomes.some(n=>titulo.includes(N(n))))?.id||"";
}

function gruposClienteNaPagina(){
  const content=document.getElementById("content");
  if(!content)return[];

  // As versões atuais do EmbrioGestor usam date-group para blocos por cliente/data.
  let grupos=[...content.querySelectorAll(".date-group")];

  // Preferimos apenas grupos superiores; grupos internos de data ficam subordinados.
  grupos=grupos.filter(g=>!g.parentElement?.closest(".date-group"));

  return grupos;
}

function clienteDoGrupo(grupo){
  const titulo=N(
    grupo.querySelector(".date-group-title")?.textContent ||
    grupo.querySelector("h3,h4")?.textContent ||
    ""
  );

  const c=clientesOrdenados().find(cli=>titulo.includes(N(cli.nome)));
  return c?.id||"";
}

function filtrarPaginaCliente(){
  const sel=document.getElementById("egFiltroClienteOperacional");
  if(!sel)return;
  const cid=sel.value||"";
  const nomeCid=cid?N(clienteNomeLocal(cid)):"";

  const grupos=gruposClienteNaPagina();

  if(grupos.length){
    grupos.forEach(g=>{
      const gid=clienteDoGrupo(g);
      g.style.display=!cid || gid===cid ? "" : "none";
    });
    return;
  }

  // Fallback para telas que ainda estejam em tabela simples:
  // procura SOMENTE o nome do cliente escolhido, não termos digitados.
  const linhas=[...document.querySelectorAll("#content tbody tr")];
  linhas.forEach(tr=>{
    if(!cid){tr.style.display="";return;}
    tr.style.display=N(tr.innerText).includes(nomeCid)?"":"none";
  });
}

function instalarFiltroClienteOperacional(){
  const pagina=paginaOperacionalAtual();
  const content=document.getElementById("content");
  if(!pagina||!content)return;

  const atual=document.getElementById("egFiltroClienteOperacionalWrap");
  if(atual){
    if(atual.dataset.pagina===pagina)return;
    atual.remove();
  }

  const wrap=document.createElement("div");
  wrap.id="egFiltroClienteOperacionalWrap";
  wrap.dataset.pagina=pagina;
  wrap.style.cssText="margin:0 0 14px;padding:12px;background:#f7fafc;border:1px solid #d8e4ee;border-radius:12px";
  wrap.innerHTML=`
    <label>Localizar cliente</label>
    <select id="egFiltroClienteOperacional" onchange="egFiltrarClienteOperacional()">
      ${opcoesClientes()}
    </select>
  `;

  const primeiro=content.firstElementChild;
  if(primeiro)content.insertBefore(wrap,primeiro);
  else content.prepend(wrap);
}
window.egFiltrarClienteOperacional=filtrarPaginaCliente;

/* ============================================================
   OBSERVADORES
   ============================================================ */
function instalar(){
  instalarFiltroClienteOperacional();
}
if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",instalar);
}else{
  instalar();
}
new MutationObserver(()=>requestAnimationFrame(instalar))
  .observe(document.documentElement,{childList:true,subtree:true});

})();