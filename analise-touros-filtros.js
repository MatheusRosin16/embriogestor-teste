/* ============================================================
   EmbrioGestor — Análise de Touros + Filtros por Cliente v2
   CORREÇÃO: usa o banco global "db" do EmbrioGestor.
   Substitui analise-touros-filtros.js v1.
   ============================================================ */
(function(){
"use strict";

function E(v){
  const m={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"};
  return String(v??"").replace(/[&<>"']/g,c=>m[c]);
}
function N(v){
  return String(v??"").normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
}
function num(v){
  if(v===null || v===undefined || v==="") return 0;
  const n=Number(String(v).replace(",","."));
  return Number.isFinite(n)?n:0;
}
function fmt(n){
  return Number(n||0).toLocaleString("pt-BR");
}
function pct(a,b){
  return b>0 ? (a/b*100).toLocaleString("pt-BR",
    {minimumFractionDigits:1,maximumFractionDigits:1}) : "0,0";
}
function banco(){
  try{
    return db || {};
  }catch(e){
    return {};
  }
}
function clientesOrdenados(){
  const b=banco();
  return [...(b.clientes||[])].sort((a,b)=>
    String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR")
  );
}
function clienteNome(id){
  return (banco().clientes||[]).find(c=>c.id===id)?.nome||"";
}
function touroNome(id){
  return (banco().touros||[]).find(t=>t.id===id)?.nome||"";
}
function doadoraNome(id){
  return (banco().doadoras||[]).find(d=>d.id===id)?.nome||"";
}
function dataBR(v){
  if(!v)return "";
  const p=String(v).slice(0,10).split("-");
  return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:String(v);
}

/* ============================================================
   FILTRO DIGITÁVEL POR CLIENTE
   ============================================================ */
function criarListaClientes(id){
  let dl=document.getElementById(id);
  if(dl) dl.remove();

  dl=document.createElement("datalist");
  dl.id=id;
  dl.innerHTML=clientesOrdenados()
    .map(c=>`<option value="${E(c.nome||"")}"></option>`).join("");

  document.body.appendChild(dl);
}

function instalarCampoDigitavel(selectId,tipo){
  const select=document.getElementById(selectId);
  const existente=document.getElementById(selectId+"_busca");

  if(!select && !existente)return;

  let input=existente;

  if(input && input.dataset.egFiltroV2!=="1"){
    const novo=input.cloneNode(true);
    input.replaceWith(novo);
    input=novo;
  }

  if(!input && select){
    input=document.createElement("input");
    input.type="search";
    input.id=selectId+"_busca";
    input.placeholder="Digite o nome do cliente...";
    input.autocomplete="off";
    select.style.display="none";
    select.insertAdjacentElement("afterend",input);
  }

  if(!input || input.dataset.egFiltroV2==="1")return;

  input.dataset.egFiltroV2="1";
  input.setAttribute("list",selectId+"_lista");
  input.style.width="100%";
  input.style.boxSizing="border-box";
  criarListaClientes(selectId+"_lista");

  function filtrar(){
    const termo=N(input.value);

    if(tipo==="operacional"){
      const content=document.getElementById("content");
      if(!content)return;

      const blocos=[...content.querySelectorAll(".eg-client-collapsible")];

      if(blocos.length){
        blocos.forEach(bloco=>{
          const nome=N(bloco.querySelector("summary strong")?.textContent||"");
          const mostrar=!termo||nome.includes(termo);
          bloco.style.display=mostrar?"":"none";
          if(mostrar&&termo)bloco.open=true;
          if(!termo)bloco.open=false;
        });
        return;
      }

      const grupos=[...content.querySelectorAll(".date-group")]
        .filter(g=>!g.parentElement?.closest(".date-group"));

      grupos.forEach(g=>{
        const titulo=N(g.querySelector(".date-group-title")?.textContent||"");
        const c=clientesOrdenados()
          .find(cli=>titulo.includes(N(cli.nome||"")));

        g.style.display=!termo || (c&&N(c.nome).includes(termo)) ? "" : "none";
      });
      return;
    }

    const seletor=tipo==="doadoras"?"#egDoadorasGrupos":"#egTourosGrupos";
    const cont=document.querySelector(seletor);
    if(!cont)return;

    [...cont.querySelectorAll(":scope > [data-cliente-id], :scope > .date-group")]
      .forEach(g=>{
        const titulo=N(
          g.querySelector(".date-group-title")?.textContent ||
          g.querySelector("summary strong")?.textContent || ""
        );

        const c=clientesOrdenados()
          .find(cli=>titulo.includes(N(cli.nome||"")));

        const nome=c?.nome||titulo;
        g.style.display=!termo||N(nome).includes(termo)?"":"none";
      });
  }

  input.addEventListener("input",filtrar);
  input.addEventListener("search",filtrar);
}

function instalarFiltros(){
  instalarCampoDigitavel("egFiltroClienteOperacional","operacional");
  instalarCampoDigitavel("egFiltroDoadorasCliente","doadoras");
  instalarCampoDigitavel("egFiltroTourosCliente","touros");
}

/* ============================================================
   ANÁLISE DE TOUROS
   ============================================================ */
function producoesFiltradas(){
  const b=banco();
  const de=document.getElementById("egATDe")?.value||"";
  const ate=document.getElementById("egATAte")?.value||"";
  const cid=document.getElementById("egATCliente")?.value||"";
  const busca=N(document.getElementById("egATTouro")?.value||"");

  return (b.producoes||[]).filter(p=>{
    const data=String(p.data||"").slice(0,10);

    if(de&&data&&data<de)return false;
    if(ate&&data&&data>ate)return false;
    if(cid&&p.clienteId!==cid)return false;
    if(!p.touroId)return false;
    if(busca&&!N(touroNome(p.touroId)).includes(busca))return false;

    return true;
  });
}

function transferenciasDoTouro(touroId,de,ate,cid){
  const b=banco();

  return (b.transferencias||[]).filter(tr=>{
    let tid=tr.touroId||"";

    if(!tid&&tr.origemProducaoId){
      const p=(b.producoes||[]).find(x=>x.id===tr.origemProducaoId);
      tid=p?.touroId||"";
    }

    if(tid!==touroId)return false;

    const dt=String(tr.data||tr.dataTransferencia||"").slice(0,10);

    if(de&&dt&&dt<de)return false;
    if(ate&&dt&&dt>ate)return false;
    if(cid&&tr.clienteId!==cid)return false;

    return true;
  });
}

function diagPositivo(v){
  const x=N(v);
  return x.includes("prenhe")||
         x.includes("positivo")||
         x.includes("gestante")||
         x==="p"||
         x.includes("prenha");
}
function diagInformado(v){
  const x=N(v);
  return !!x&&x!=="-"&&!x.includes("sem diagnost");
}

function valorEmb(p){
  return num(
    p.embriõesD7 ??
    p.embrioesD7 ??
    p.embrioes ??
    p.embD7 ??
    0
  );
}
function valorViaveis(p){
  return num(
    p.oocitosViaveis ??
    p.viaveis ??
    p.oócitosViáveis ??
    0
  );
}
function valorCultivados(p){
  return num(
    p.clivados ??
    p.oocitosCultivados ??
    p.cultivados ??
    p.oocitos ??
    0
  );
}

function montarAnalise(){
  const b=banco();
  const lista=producoesFiltradas();

  const de=document.getElementById("egATDe")?.value||"";
  const ate=document.getElementById("egATAte")?.value||"";
  const cid=document.getElementById("egATCliente")?.value||"";

  const mapa=new Map();

  lista.forEach(p=>{
    if(!mapa.has(p.touroId)){
      mapa.set(p.touroId,{
        touroId:p.touroId,
        opu:0,
        viav:0,
        cult:0,
        emb:0,
        te:0
      });
    }

    const r=mapa.get(p.touroId);
    r.opu+=1;
    r.viav+=valorViaveis(p);
    r.cult+=valorCultivados(p);
    r.emb+=valorEmb(p);
    r.te+=num(p.transferidosFresco);
  });

  const linhas=[...mapa.values()].map(r=>{
    const t=(b.touros||[]).find(x=>x.id===r.touroId)||{};
    const trs=transferenciasDoTouro(r.touroId,de,ate,cid);

    if(r.te===0&&trs.length)r.te=trs.length;

    const palp30=trs.filter(x=>diagInformado(x.diagnostico)).length;
    const p30=trs.filter(x=>diagPositivo(x.diagnostico)).length;

    return{
      ...r,
      nome:t.nome||"Touro sem nome",
      rgd:t.registro||t.rgd||"",
      raca:t.raca||"",
      palp30,
      p30
    };
  }).sort((a,b)=>b.emb-a.emb||a.nome.localeCompare(b.nome,"pt-BR"));

  const tbody=document.getElementById("egATTbody");
  if(!tbody)return;

  tbody.innerHTML=linhas.length
    ?linhas.map(r=>`
      <tr>
        <td><button class="eg-at-link" onclick="egATDetalhar('${E(r.touroId)}')">${E(r.nome)}</button></td>
        <td>${E(r.rgd)}</td>
        <td>${E(r.raca)}</td>
        <td>${fmt(r.opu)}</td>
        <td>${fmt(r.viav)}</td>
        <td>${fmt(r.cult)}</td>
        <td><strong>${fmt(r.emb)}</strong></td>
        <td>${pct(r.emb,r.viav)}%</td>
        <td>${fmt(r.te)}</td>
        <td>${fmt(r.palp30)}</td>
        <td>${fmt(r.p30)}</td>
        <td>${pct(r.p30,r.palp30)}%</td>
        <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
      </tr>
    `).join("")
    :`<tr><td colspan="17" style="text-align:center;padding:24px">
       Nenhuma produção encontrada no período selecionado.
     </td></tr>`;

  const total=linhas.reduce((a,r)=>({
    opu:a.opu+r.opu,
    viav:a.viav+r.viav,
    cult:a.cult+r.cult,
    emb:a.emb+r.emb,
    te:a.te+r.te
  }),{opu:0,viav:0,cult:0,emb:0,te:0});

  const totalEl=document.getElementById("egATTotal");
  if(totalEl){
    totalEl.innerHTML=`
      <strong>${linhas.length} touro(s)</strong> ·
      OPU ${fmt(total.opu)} ·
      Viáveis ${fmt(total.viav)} ·
      Cultivados ${fmt(total.cult)} ·
      Embriões ${fmt(total.emb)} ·
      % Emb. ${pct(total.emb,total.viav)}% ·
      TE ${fmt(total.te)}
    `;
  }
}

window.egATMontar=montarAnalise;

window.egATDetalhar=function(touroId){
  const b=banco();

  const de=document.getElementById("egATDe")?.value||"";
  const ate=document.getElementById("egATAte")?.value||"";
  const cid=document.getElementById("egATCliente")?.value||"";

  const ps=(b.producoes||[]).filter(p=>{
    const dt=String(p.data||"").slice(0,10);

    return p.touroId===touroId &&
      (!de||!dt||dt>=de) &&
      (!ate||!dt||dt<=ate) &&
      (!cid||p.clienteId===cid);
  }).sort((a,b)=>String(b.data||"").localeCompare(String(a.data||"")));

  const el=document.getElementById("egATDetalhe");
  if(!el)return;

  el.innerHTML=`
    <div class="card" style="margin-top:16px">
      <div class="section-title">
        <h3>Produções — ${E(touroNome(touroId))}</h3>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Cliente</th>
              <th>Doadora</th>
              <th>Viáveis</th>
              <th>Cult.</th>
              <th>Emb.</th>
              <th>% Emb.</th>
              <th>TE</th>
            </tr>
          </thead>
          <tbody>
            ${ps.length?ps.map(p=>{
              const vi=valorViaveis(p);
              const cult=valorCultivados(p);
              const emb=valorEmb(p);

              return `<tr>
                <td>${E(dataBR(p.data))}</td>
                <td>${E(clienteNome(p.clienteId))}</td>
                <td>${E(doadoraNome(p.doadoraId))}</td>
                <td>${fmt(vi)}</td>
                <td>${fmt(cult)}</td>
                <td><strong>${fmt(emb)}</strong></td>
                <td>${pct(emb,vi)}%</td>
                <td>${fmt(num(p.transferidosFresco))}</td>
              </tr>`;
            }).join(""):`<tr><td colspan="8">Nenhuma produção encontrada.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
};

function telaAnaliseTouros(){
  if(typeof header==="function"){
    header("Análise de Touros","Produções e desempenho por reprodutor");
  }

  const hoje=new Date();
  const ano=hoje.getFullYear();
  const inicio=`${ano}-01-01`;
  const fim=hoje.toISOString().slice(0,10);

  const content=document.getElementById("content");
  if(!content)return;

  content.innerHTML=`
    <style>
      .eg-at-filtros{
        display:grid;
        grid-template-columns:repeat(4,minmax(160px,1fr));
        gap:10px;
        align-items:end
      }
      .eg-at-link{
        border:0;background:none;padding:0;color:#173b5c;
        font-weight:700;cursor:pointer;text-align:left
      }
      .eg-at-link:hover{text-decoration:underline}
      .eg-at-aviso{font-size:12px;color:#667788;margin-top:8px}
      @media(max-width:800px){
        .eg-at-filtros{grid-template-columns:1fr 1fr}
      }
      @media(max-width:520px){
        .eg-at-filtros{grid-template-columns:1fr}
      }
    </style>

    <div class="card">
      <div class="section-title"><h3>Análise de Touros</h3></div>

      <div class="eg-at-filtros">
        <div>
          <label>De</label>
          <input id="egATDe" type="date" value="${inicio}">
        </div>

        <div>
          <label>Até</label>
          <input id="egATAte" type="date" value="${fim}">
        </div>

        <div>
          <label>Cliente</label>
          <select id="egATCliente" onchange="egATMontar()">
            <option value="">Todos os clientes</option>
            ${clientesOrdenados().map(c=>
              `<option value="${E(c.id)}">${E(c.nome)}</option>`
            ).join("")}
          </select>
        </div>

        <div>
          <label>Localizar touro</label>
          <input id="egATTouro" type="search"
            placeholder="Digite o nome do touro..."
            oninput="egATMontar()">
        </div>
      </div>

      <div style="margin-top:12px">
        <button class="btn" onclick="egATMontar()">Montar análise</button>
      </div>

      <div id="egATTotal" style="margin:14px 0"></div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Touro</th><th>RGD</th><th>Raça</th>
              <th>OPU</th><th>Viáv.</th><th>Cult.</th>
              <th>Emb.</th><th>% Emb.</th><th>TE</th>
              <th>Palp. P30</th><th>P30</th><th>% P30</th>
              <th>Palp. P60</th><th>% P60</th>
              <th>M.</th><th>F.</th><th>Abs.</th>
            </tr>
          </thead>
          <tbody id="egATTbody"></tbody>
        </table>
      </div>

      <div class="eg-at-aviso">
        P60, sexo e aborto continuam como “—” porque ainda não existem
        campos separados para essas informações no banco atual.
      </div>
    </div>

    <div id="egATDetalhe"></div>
  `;

  montarAnalise();
}
window.egAnaliseTouros=telaAnaliseTouros;

function instalarMenu(){
  const menu=document.getElementById("menu");
  if(!menu||document.getElementById("egMenuAnaliseTouros"))return;

  const btn=document.createElement("button");
  btn.id="egMenuAnaliseTouros";
  btn.type="button";
  btn.textContent="Análise de Touros";

  btn.addEventListener("click",()=>{
    menu.querySelectorAll("button.active")
      .forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    telaAnaliseTouros();
  });

  const ref=[...menu.querySelectorAll("button")].find(b=>
    N(b.textContent).includes("relatorio")
  );

  if(ref)menu.insertBefore(btn,ref);
  else menu.appendChild(btn);
}

function instalar(){
  instalarFiltros();
  instalarMenu();
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",instalar);
}else{
  instalar();
}

new MutationObserver(()=>{
  requestAnimationFrame(instalar);
}).observe(document.documentElement,{childList:true,subtree:true});

})();