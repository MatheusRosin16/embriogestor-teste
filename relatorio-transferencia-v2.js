(function(){"use strict";
function E(v){return typeof esc==="function"?esc(v):String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
function H(){return typeof hoje==="function"?hoje():new Date().toISOString().slice(0,10);}
function C(id){return (db.clientes||[]).find(x=>x.id===id);}
function G(t){const p=(db.producoes||[]).find(x=>x.id===t.origemProducaoId),did=t.doadoraId||p?.doadoraId||"",tid=t.touroId||p?.touroId||"",d=(db.doadoras||[]).find(x=>x.id===did),to=(db.touros||[]).find(x=>x.id===tid);return{dn:(typeof doadoraNome==="function"?doadoraNome(did):d?.nome)||"",dr:(typeof doadoraRaca==="function"?doadoraRaca(did):d?.raca)||"",tn:(typeof touroNome==="function"?touroNome(tid):to?.nome)||"",tr:(typeof touroRaca==="function"?touroRaca(tid):to?.raca)||""};}
function opts(id){return(db.clientes||[]).slice().sort((a,b)=>String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR")).map(c=>`<option value="${E(c.id)}" ${c.id===id?"selected":""}>${E(c.nome||"")}</option>`).join("");}
const blocoAnt=window.blocoPeriodoRelatorio;
window.blocoPeriodoRelatorio=function(clienteId,tipo,titulo){
 if(tipo!=="transferencia")return typeof blocoAnt==="function"?blocoAnt(clienteId,tipo,titulo):"";
 const h=H(),c=C(clienteId);
 return `<div class="report-choice"><h3>${E(titulo)}</h3>
 <label>Período</label><select id="rel_transferencia_tipo" onchange="atualizarPeriodoRel('transferencia')"><option value="dia">Dia</option><option value="mes">Mês</option><option value="ano">Ano</option></select>
 <div id="rel_transferencia_dia_wrap"><label>Data</label><input id="rel_transferencia_dia" type="date" value="${E(h)}"></div>
 <div id="rel_transferencia_mes_wrap" style="display:none"><label>Mês</label><input id="rel_transferencia_mes" type="month" value="${E(h.slice(0,7))}"></div>
 <div id="rel_transferencia_ano_wrap" style="display:none"><label>Ano</label><input id="rel_transferencia_ano" type="number" min="2000" max="2100" value="${E(h.slice(0,4))}"></div>
 <div style="margin-top:14px;padding:14px;border:1px solid #d7e4ee;border-radius:12px;background:#f7fafc">
 <strong style="display:block;margin-bottom:10px;color:#173f61">Cliente que aparecerá no relatório</strong>
 <label>Escolher cliente cadastrado</label><select id="rel_transferencia_cliente_relatorio" onchange="egTransferAtualizarNomeCliente()"><option value="">Nome manual</option>${opts(clienteId)}</select>
 <label style="margin-top:10px">Nome no relatório</label><input id="rel_transferencia_cliente_nome" type="text" value="${E(c?.nome||"")}" placeholder="Digite o nome que deve aparecer no relatório">
 <small style="display:block;margin-top:6px;color:#687887">Altera somente o relatório. O proprietário da doadora, produção e genética permanece inalterado.</small></div>
 <label style="margin-top:12px">Observação do relatório</label><textarea id="rel_transferencia_obs" rows="4" style="width:100%;box-sizing:border-box;resize:vertical;min-height:90px;margin-bottom:12px" placeholder="Digite uma observação para este relatório..."></textarea>
 <button class="btn" onclick="gerarRelatorioPeriodo('${E(clienteId)}','transferencia')">Gerar relatório</button></div>`;
};
window.egTransferAtualizarNomeCliente=function(){const id=document.getElementById("rel_transferencia_cliente_relatorio")?.value||"",i=document.getElementById("rel_transferencia_cliente_nome");if(i&&id)i.value=C(id)?.nome||"";};
window.egRelatorioTransferenciaV2=function(cid,valor,tipo="dia",nome=""){
 const cf=C(cid);if(!cf)return;
 const dados=(db.transferencias||[]).filter(x=>x.clienteId===cid&&(typeof dataNoPeriodo==="function"?dataNoPeriodo(x.data,tipo,valor):x.data===valor));
 if(!dados.length){alert("Não há transferências cadastradas para este cliente no período selecionado.");return;}
 const cr={...cf,nome:String(nome||cf.nome||"").trim()},gr={};dados.forEach(x=>(gr[x.data||""]??=[]).push(x));
 const corpo=Object.keys(gr).sort().map(data=>{const itens=gr[data],pr=itens.filter(x=>x.diagnostico==="Prenhe").length,vz=itens.filter(x=>x.diagnostico==="Vazia").length,pct=itens.length?Math.round(pr/itens.length*100):0;
 const linhas=itens.map((x,i)=>{const g=G(x);return `<tr><td>${i+1}</td><td>${E(g.dn)}</td><td>${E(g.dr)}</td><td>${E(g.tn)}</td><td>${E(g.tr)}</td><td>${E(x.receptora||"")}</td><td>${E(x.embriãoGrau||x.embriaoGrau||"")}</td><td>${E(x.embriãoEstagio||x.embriaoEstagio||"")}</td><td>${E(x.ovarioOvulou||"")}</td><td>${E(x.grauCL||"")}</td><td>${E(x.clCavitario||"")}</td><td>${E(x.destino||"")}</td><td>${E(x.diagnostico||"")}</td></tr>`}).join("");
 return `<div style="margin-top:18px"><div style="padding:8px 12px;background:#173f61;color:#fff;font-weight:800;border-radius:8px 8px 0 0">DATA DA TRANSFERÊNCIA: ${E(typeof dataBR==="function"?dataBR(data):data)}</div><table class="report-table"><thead><tr><th>Nº</th><th>DOADORA</th><th>RAÇA DOADORA</th><th>TOURO</th><th>RAÇA TOURO</th><th>RECEPTORA</th><th>GRAU D7</th><th>ESTÁGIO D7</th><th>OVÁRIO</th><th>GRAU CL</th><th>CL CAVITÁRIO</th><th>DESTINO</th><th>DIAGNÓSTICO</th></tr></thead><tbody>${linhas}</tbody></table><table class="report-table report-summary"><tbody><tr><th>TOTAL DE ANIMAIS</th><th>PRENHAS</th><th>VAZIAS</th><th>% PRENHEZ</th></tr><tr><td>${itens.length}</td><td>${pr}</td><td>${vz}</td><td>${pct}%</td></tr></tbody></table><div class="report-note"><b>OBS:</b> ${E(typeof observacoesUnicas==="function"?(observacoesUnicas(itens)||"-"):"-")}</div></div>`;}).join("");
 const pr=dados.filter(x=>x.diagnostico==="Prenhe").length,vz=dados.filter(x=>x.diagnostico==="Vazia").length,pct=dados.length?Math.round(pr/dados.length*100):0;
 const cab=typeof cabecalhoRelatorioPeriodo==="function"?cabecalhoRelatorioPeriodo("RELATÓRIO DE TRANSFERÊNCIA DE EMBRIÕES",cr,tipo,valor):cabecalhoRelatorio("RELATÓRIO DE TRANSFERÊNCIA DE EMBRIÕES",cr,valor);
 const conteudo=`${cab}<div style="margin:12px 0 16px;padding:10px 12px;border:1px solid #cbdce8;border-radius:8px;background:#f7fafc"><b>CLIENTE DO RELATÓRIO:</b> ${E(cr.nome)}</div>${corpo}<div class="report-grand-total"><b>TOTAL DO PERÍODO:</b> ${dados.length} transferência(s) | Prenhas ${pr} | Vazias ${vz} | Prenhez ${pct}%</div><div class="report-footer">EmbrioGestor - Relatório de transferência por período, dividido por data</div>`;
 abrirRelatorioFormatado("Relatório de Transferência",cr,valor,conteudo,"landscape");
};
const gerarAnt=window.gerarRelatorioPeriodo;
window.gerarRelatorioPeriodo=function(cid,tipo){
 if(tipo!=="transferencia")return typeof gerarAnt==="function"?gerarAnt(cid,tipo):undefined;
 const pt=document.getElementById("rel_transferencia_tipo")?.value||"dia",valor=document.getElementById(`rel_transferencia_${pt}`)?.value||"",nome=document.getElementById("rel_transferencia_cliente_nome")?.value?.trim()||"",obs=document.getElementById("rel_transferencia_obs")?.value?.trim()||"";
 if(!valor){alert("Informe o período.");return;}
 egRelatorioTransferenciaV2(cid,valor,pt,nome);
 if(obs)setTimeout(()=>{const a=document.getElementById("reportPrintable");if(!a)return;a.querySelector(".eg-observacao-manual-relatorio")?.remove();const b=document.createElement("div");b.className="report-note eg-observacao-manual-relatorio";b.innerHTML="<b>OBSERVAÇÃO DO RELATÓRIO:</b> "+E(obs);const f=a.querySelector(".report-footer")||a.querySelector(".seminna-report-footer");f?.parentNode?f.parentNode.insertBefore(b,f):a.appendChild(b);},50);
};
})();