(function(){"use strict";
let egTransferPreview=[];

function E(v){
  if(typeof esc==="function") return esc(v);
  const mapa={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"};
  return String(v??"").replace(/[&<>"']/g,c=>mapa[c]);
}
function C(id){return (db.clientes||[]).find(x=>x.id===id);}
function P(id){return (db.producoes||[]).find(x=>x.id===id);}
function D(id){return (db.doadoras||[]).find(x=>x.id===id);}
function T(id){return (db.touros||[]).find(x=>x.id===id);}
function nomeDoadora(id){const d=D(id);return (typeof doadoraNome==="function"?doadoraNome(id):d?.nome)||"";}
function racaDoadora(id){const d=D(id);return (typeof doadoraRaca==="function"?doadoraRaca(id):d?.racaAbrev||d?.raca)||"";}
function nomeTouro(id){const t=T(id);return (typeof touroNome==="function"?touroNome(id):t?.nome)||"";}
function racaTouro(id){const t=T(id);return (typeof touroRaca==="function"?touroRaca(id):t?.racaAbrev||t?.raca)||"";}

function dadosOriginal(x){
  const prod=P(x.origemProducaoId);
  const did=x.doadoraId||prod?.doadoraId||"";
  const tid=x.touroId||prod?.touroId||"";
  return {
    id:x.id,
    data:x.data||"",
    clienteNome:C(x.clienteId)?.nome||"",
    doadora:nomeDoadora(did),
    racaDoadora:racaDoadora(did),
    touro:nomeTouro(tid),
    racaTouro:racaTouro(tid),
    receptora:x.receptora||"",
    grauD7:x.embriãoGrau||x.embriaoGrau||"",
    estagioD7:x.embriãoEstagio||x.embriaoEstagio||"",
    ovario:x.ovarioOvulou||"",
    grauCL:x.grauCL||"",
    clCavitario:x.clCavitario||"",
    destino:x.destino||"",
    diagnostico:x.diagnostico||"",
    obs:x.obs||""
  };
}

function campo(i,nome,min="110px"){
  const v=egTransferPreview[i]?.[nome]??"";
  return `<input type="text" value="${E(v)}"
    onchange="egTransferEditarCampo(${i},'${nome}',this.value)"
    style="min-width:${min};width:100%;box-sizing:border-box">`;
}

window.egTransferEditarCampo=function(i,nome,valor){
  if(!egTransferPreview[i]) return;
  egTransferPreview[i][nome]=String(valor??"");
};

window.egTransferMontarPrevia=function(){
  const cid=document.getElementById("egTransferClienteFiltro")?.value||"";
  const tipo=document.getElementById("egTransferPeriodoTipo")?.value||"dia";
  const valor=document.getElementById(`egTransferPeriodo_${tipo}`)?.value||"";

  if(!cid){alert("Selecione o cliente usado para localizar as transferências.");return;}
  if(!valor){alert("Informe o período.");return;}

  egTransferPreview=(db.transferencias||[])
    .filter(x=>x.clienteId===cid)
    .filter(x=>typeof dataNoPeriodo==="function"?dataNoPeriodo(x.data,tipo,valor):x.data===valor)
    .map(dadosOriginal);

  const area=document.getElementById("egTransferPreviewArea");
  if(!egTransferPreview.length){
    area.innerHTML=`<div class="card"><div class="empty-state">Nenhuma transferência encontrada no período selecionado.</div></div>`;
    return;
  }
  egTransferRenderPrevia();
};

window.egTransferRenderPrevia=function(){
  const area=document.getElementById("egTransferPreviewArea");
  if(!area)return;

  area.innerHTML=`<div class="card">
    <div class="section-title">
      <div><h3>Prévia editável</h3><p class="muted">${egTransferPreview.length} transferência(s)</p></div>
      <button class="btn" onclick="egTransferGerarPdfDaPrevia()">Gerar PDF</button>
    </div>
    <div class="note" style="margin-bottom:12px">
      As alterações feitas aqui valem apenas para este relatório e não modificam o banco do EmbrioGestor.
    </div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Data</th><th>Cliente</th><th>Doadora</th><th>Raça doadora</th><th>Touro</th><th>Raça touro</th>
        <th>Receptora</th><th>Grau D7</th><th>Estágio D7</th><th>Ovário</th><th>Grau CL</th><th>CL cavitário</th>
        <th>Destino</th><th>Diagnóstico</th><th>Observação</th>
      </tr></thead>
      <tbody>
      ${egTransferPreview.map((x,i)=>`<tr>
        <td>${campo(i,"data","105px")}</td>
        <td>${campo(i,"clienteNome","160px")}</td>
        <td>${campo(i,"doadora","105px")}</td>
        <td>${campo(i,"racaDoadora","80px")}</td>
        <td>${campo(i,"touro","135px")}</td>
        <td>${campo(i,"racaTouro","80px")}</td>
        <td>${campo(i,"receptora","105px")}</td>
        <td>${campo(i,"grauD7","80px")}</td>
        <td>${campo(i,"estagioD7","90px")}</td>
        <td>${campo(i,"ovario","85px")}</td>
        <td>${campo(i,"grauCL","80px")}</td>
        <td>${campo(i,"clCavitario","90px")}</td>
        <td>${campo(i,"destino","110px")}</td>
        <td>${campo(i,"diagnostico","105px")}</td>
        <td>${campo(i,"obs","170px")}</td>
      </tr>`).join("")}
      </tbody>
    </table></div>
  </div>`;
};

function grupos(lista){
  const g={};
  lista.forEach(x=>(g[x.data||""]??=[]).push(x));
  return g;
}

window.egTransferGerarPdfDaPrevia=function(){
  if(!egTransferPreview.length){alert("Monte a prévia primeiro.");return;}

  const cid=document.getElementById("egTransferClienteFiltro")?.value||"";
  const nome=document.getElementById("egTransferClienteRelatorio")?.value?.trim()||egTransferPreview[0]?.clienteNome||"";
  const cli={...(C(cid)||{}),nome};
  const tipo=document.getElementById("egTransferPeriodoTipo")?.value||"dia";
  const valor=document.getElementById(`egTransferPeriodo_${tipo}`)?.value||"";
  const gs=grupos(egTransferPreview);

  const corpo=Object.keys(gs).sort().map(data=>{
    const itens=gs[data];
    const prenhes=itens.filter(x=>x.diagnostico==="Prenhe").length;
    const vazias=itens.filter(x=>x.diagnostico==="Vazia").length;
    const pct=itens.length?Math.round(prenhes/itens.length*100):0;
    const linhas=itens.map((x,i)=>`<tr>
      <td>${i+1}</td><td>${E(x.doadora)}</td><td>${E(x.racaDoadora)}</td><td>${E(x.touro)}</td><td>${E(x.racaTouro)}</td>
      <td>${E(x.receptora)}</td><td>${E(x.grauD7)}</td><td>${E(x.estagioD7)}</td><td>${E(x.ovario)}</td><td>${E(x.grauCL)}</td>
      <td>${E(x.clCavitario)}</td><td>${E(x.destino)}</td><td>${E(x.diagnostico)}</td></tr>`).join("");
    const obs=[...new Set(itens.map(x=>String(x.obs||"").trim()).filter(Boolean))].join(" | ");

    return `<div style="margin-top:18px">
      <div style="padding:8px 12px;background:#173f61;color:#fff;font-weight:800;border-radius:8px 8px 0 0">
        DATA DA TRANSFERÊNCIA: ${E(typeof dataBR==="function"?dataBR(data):data)}
      </div>
      <table class="report-table"><thead><tr>
        <th>Nº</th><th>DOADORA</th><th>RAÇA DOADORA</th><th>TOURO</th><th>RAÇA TOURO</th><th>RECEPTORA</th>
        <th>GRAU D7</th><th>ESTÁGIO D7</th><th>OVÁRIO</th><th>GRAU CL</th><th>CL CAVITÁRIO</th><th>DESTINO</th><th>DIAGNÓSTICO</th>
      </tr></thead><tbody>${linhas}</tbody></table>
      <table class="report-table report-summary"><tbody>
        <tr><th>TOTAL</th><th>PRENHAS</th><th>VAZIAS</th><th>% PRENHEZ</th></tr>
        <tr><td>${itens.length}</td><td>${prenhes}</td><td>${vazias}</td><td>${pct}%</td></tr>
      </tbody></table>
      <div class="report-note"><b>OBS:</b> ${E(obs||"-")}</div>
    </div>`;
  }).join("");

  const prenhes=egTransferPreview.filter(x=>x.diagnostico==="Prenhe").length;
  const vazias=egTransferPreview.filter(x=>x.diagnostico==="Vazia").length;
  const pct=egTransferPreview.length?Math.round(prenhes/egTransferPreview.length*100):0;

  const cab=typeof cabecalhoRelatorioPeriodo==="function"
    ? cabecalhoRelatorioPeriodo("RELATÓRIO DE TRANSFERÊNCIA DE EMBRIÕES",cli,tipo,valor)
    : "";

  const obsG=document.getElementById("egTransferObsGeral")?.value?.trim()||"";

  const conteudo=`${cab}${corpo}
    <div class="report-grand-total"><b>TOTAL DO PERÍODO:</b> ${egTransferPreview.length} transferência(s) | Prenhas ${prenhes} | Vazias ${vazias} | Prenhez ${pct}%</div>
    ${obsG?`<div class="report-note"><b>OBSERVAÇÃO DO RELATÓRIO:</b> ${E(obsG)}</div>`:""}
    ${typeof rodapeSeminna==="function"?rodapeSeminna():`<div class="report-footer">EmbrioGestor</div>`}`;

  abrirRelatorioFormatado("Relatório de Transferência",cli,valor,conteudo,"landscape");
};

window.paginaTransferenciaEditavel=function(){
  if(typeof header==="function")header("Relatório Transferência Editável","Monte a prévia, revise os dados e gere o PDF");
  const h=typeof hoje==="function"?hoje():new Date().toISOString().slice(0,10);
  const clientes=(db.clientes||[]).slice().sort((a,b)=>String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR"));

  document.getElementById("content").innerHTML=`<div class="card">
    <div class="section-title"><div><h3>Filtros do relatório</h3><p class="muted">O cliente do filtro localiza as transferências. O nome do relatório pode ser diferente.</p></div></div>
    <div class="form-grid">
      <div><label>Cliente usado para localizar as transferências</label>
        <select id="egTransferClienteFiltro"><option value="">Selecione</option>${clientes.map(c=>`<option value="${E(c.id)}">${E(c.nome||"")}</option>`).join("")}</select>
      </div>
      <div><label>Nome do cliente no relatório</label><input id="egTransferClienteRelatorio" type="text" placeholder="Pode ser o comprador da genética"></div>
      <div><label>Período</label><select id="egTransferPeriodoTipo" onchange="egTransferTrocarPeriodo()"><option value="dia">Dia</option><option value="mes">Mês</option><option value="ano">Ano</option></select></div>
      <div id="egTransferWrap_dia"><label>Data</label><input id="egTransferPeriodo_dia" type="date" value="${E(h)}"></div>
      <div id="egTransferWrap_mes" style="display:none"><label>Mês</label><input id="egTransferPeriodo_mes" type="month" value="${E(h.slice(0,7))}"></div>
      <div id="egTransferWrap_ano" style="display:none"><label>Ano</label><input id="egTransferPeriodo_ano" type="number" value="${E(h.slice(0,4))}"></div>
    </div>
    <label style="margin-top:12px">Observação geral do relatório</label>
    <textarea id="egTransferObsGeral" rows="3" style="width:100%;box-sizing:border-box" placeholder="Observação opcional"></textarea>
    <br><button class="btn" onclick="egTransferMontarPrevia()">Montar prévia</button>
  </div><div id="egTransferPreviewArea"></div>`;

  const sel=document.getElementById("egTransferClienteFiltro");
  sel?.addEventListener("change",()=>{
    const c=C(sel.value), inp=document.getElementById("egTransferClienteRelatorio");
    if(inp && !inp.value.trim()) inp.value=c?.nome||"";
  });
};

window.egTransferTrocarPeriodo=function(){
  const tipo=document.getElementById("egTransferPeriodoTipo")?.value||"dia";
  ["dia","mes","ano"].forEach(t=>{
    const w=document.getElementById(`egTransferWrap_${t}`);
    if(w) w.style.display=t===tipo?"":"none";
  });
};

function instalarBotao(){
  const menu=document.getElementById("menu");
  if(!menu || menu.querySelector('[data-eg-transfer-editavel="1"]')) return;
  const ref=[...menu.querySelectorAll("button")].find(b=>String(b.textContent||"").toLowerCase().includes("transferência de embriões"));
  if(!ref) return;
  const b=document.createElement("button");
  b.type="button"; b.dataset.egTransferEditavel="1"; b.textContent="Relatório Transferência Editável";
  b.addEventListener("click",window.paginaTransferenciaEditavel);
  ref.insertAdjacentElement("afterend",b);
}
instalarBotao();
new MutationObserver(instalarBotao).observe(document.documentElement,{childList:true,subtree:true});
})();