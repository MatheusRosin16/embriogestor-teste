/* EmbrioGestor - observacao nos relatorios v3 */
(function(){
"use strict";
let pendente={tipo:"",texto:""};
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}

window.blocoPeriodoRelatorio=function(clienteId,tipo,titulo){
  const h=typeof hoje==="function"?hoje():new Date().toISOString().slice(0,10);
  return `<div class="report-choice"><h3>${titulo}</h3>
    <label>Período</label>
    <select id="rel_${tipo}_tipo" onchange="atualizarPeriodoRel('${tipo}')">
      <option value="dia">Dia</option><option value="mes">Mês</option><option value="ano">Ano</option>
    </select>
    <div id="rel_${tipo}_dia_wrap"><label>Data</label><input id="rel_${tipo}_dia" type="date" value="${h}"></div>
    <div id="rel_${tipo}_mes_wrap" style="display:none"><label>Mês</label><input id="rel_${tipo}_mes" type="month" value="${h.slice(0,7)}"></div>
    <div id="rel_${tipo}_ano_wrap" style="display:none"><label>Ano</label><input id="rel_${tipo}_ano" type="number" min="2000" max="2100" value="${h.slice(0,4)}"></div>
    <label style="margin-top:12px">Observação do relatório</label>
    <textarea id="rel_${tipo}_obs" rows="4" placeholder="Digite a observação que deverá aparecer no campo OBS do relatório..." style="width:100%;box-sizing:border-box;resize:vertical;min-height:90px;margin-bottom:12px"></textarea>
    <button class="btn" onclick="gerarRelatorioPeriodo('${clienteId}','${tipo}')">Gerar relatório</button>
  </div>`;
};

window.gerarRelatorioPeriodo=function(clienteId,tipo){
  const periodoTipo=document.getElementById(`rel_${tipo}_tipo`)?.value||"dia";
  const valor=document.getElementById(`rel_${tipo}_${periodoTipo}`)?.value||"";
  const texto=document.getElementById(`rel_${tipo}_obs`)?.value?.trim()||"";
  if(!valor){alert("Informe o período.");return;}
  pendente={tipo,texto};
  try{
    if(tipo==="producao") relatorioProducao(clienteId,valor,periodoTipo);
    else if(tipo==="congelamento") relatorioCongelamento(clienteId,valor,periodoTipo);
    else relatorioTransferencia(clienteId,valor,periodoTipo);
  }finally{pendente={tipo:"",texto:""};}
};

const abrirOriginal=window.abrirRelatorioFormatado;
if(typeof abrirOriginal!=="function"){console.error("EmbrioGestor: abrirRelatorioFormatado não encontrada.");return;}

window.abrirRelatorioFormatado=function(titulo,cliente,data,conteudo,orientacao){
  let html=String(conteudo??"");
  const tipo=pendente.tipo, texto=pendente.texto;
  if(texto){
    const seguro=esc(texto);
    if(tipo==="producao"){
      const rx=/<div class="report-note"><b>OBS:<\/b>[\s\S]*?<\/div>/i;
      if(rx.test(html)) html=html.replace(rx,`<div class="report-note"><b>OBS:</b> ${seguro}</div>`);
      else html=html.replace(/(<div class="report-grand-total">)/i,`<div class="report-note"><b>OBS:</b> ${seguro}</div>$1`);
    }else if(tipo==="transferencia"){
      const rx=/<div class="report-note"><b>OBSERVAÇÕES:<\/b>[\s\S]*?<\/div>/i;
      if(rx.test(html)) html=html.replace(rx,`<div class="report-note"><b>OBSERVAÇÕES:</b> ${seguro}</div>`);
      else html=html.replace(/(<div class="report-grand-total">)/i,`<div class="report-note"><b>OBSERVAÇÕES:</b> ${seguro}</div>$1`);
    }else if(tipo==="congelamento"){
      html=html.replace(/(<div class="report-grand-total">)/i,`<div class="report-note"><b>OBS:</b> ${seguro}</div>$1`);
    }
  }
  return abrirOriginal.call(this,titulo,cliente,data,html,orientacao);
};
})();