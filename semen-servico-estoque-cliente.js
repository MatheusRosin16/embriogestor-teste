/* EmbrioGestor - Sêmen do serviço: somente estoque do cliente v1 */
(function(){
"use strict";
function B(){try{return db||{}}catch(e){return{}}}
function E(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function N(v){if(typeof v==="number")return v;let s=String(v??"").trim().replace(",",".");let n=Number(s);return Number.isFinite(n)?n:0}
function nomeTouro(id){try{return typeof touroNome==="function"?touroNome(id):(B().touros||[]).find(x=>x.id===id)?.nome||""}catch(e){return""}}
function fmt(v){try{return typeof formatarDose==="function"?formatarDose(v):N(v).toLocaleString("pt-BR",{maximumFractionDigits:2})}catch(e){return String(v??"")}}
function recalc(){try{if(typeof recalcularTodosEstoques==="function")recalcularTodosEstoques()}catch(e){}}
function saldo(e,servicoId=""){
  if(!e)return 0;
  if(servicoId){
    try{
      const mov=(B().movimentacoes||[]).find(m=>m.origemServicoSemenId===servicoId);
      if(typeof egSaldoLoteIgnorandoMovimento==="function")return egSaldoLoteIgnorandoMovimento(e.id,mov?.id||"");
    }catch(err){}
  }
  if(e.saldo!==undefined)return Math.max(0,N(e.saldo));
  let s=N(e.quantidade??e.entrada??0);
  (B().movimentacoes||[]).filter(m=>m.estoqueId===e.id).forEach(m=>{
    const q=Math.max(0,N(m.quantidade));
    if(m.tipo==="Uso"||m.tipo==="Ajuste negativo")s-=q;
    else if(m.tipo==="Devolução"||m.tipo==="Ajuste positivo")s+=q;
  });
  return Math.max(0,s);
}
function estoqueCliente(cid,servicoId="",selecionado=""){
  recalc();
  return (B().estoque||[]).filter(e=>e.clienteId===cid&&(e.id===selecionado||saldo(e,servicoId)>0));
}
function preencherTouros(cid,tid="",servicoId="",estoqueId=""){
  const sel=document.querySelector('[name="touroId"]');if(!sel)return;
  const ids=[...new Set(estoqueCliente(cid,servicoId,estoqueId).map(e=>e.touroId).filter(Boolean))];
  if(tid&&!ids.includes(tid))ids.push(tid);
  const lista=ids.map(id=>(B().touros||[]).find(t=>t.id===id)).filter(Boolean).sort((a,b)=>String(a.nome||"").localeCompare(String(b.nome||""),"pt-BR"));
  sel.innerHTML='<option value="">'+(cid?'Selecione o touro...':'Selecione primeiro o cliente...')+'</option>'+
    lista.map(t=>'<option value="'+E(t.id)+'">'+E(t.nome||"")+'</option>').join("");
  if(tid)sel.value=tid;
  let h=document.getElementById("egSemenClienteAjuda");
  if(!h){h=document.createElement("small");h.id="egSemenClienteAjuda";h.className="field-help";sel.after(h)}
  h.textContent=!cid?"Selecione primeiro o cliente.":lista.length?"Somente touros com doses disponíveis deste cliente.":"Este cliente não possui doses de sêmen disponíveis.";
}
function preencherLotes(selecionado="",servicoId=""){
  const cid=document.querySelector('[name="clienteId"]')?.value||"";
  const tid=document.querySelector('[name="touroId"]')?.value||"";
  const sel=document.querySelector('[name="estoqueId"]');if(!sel)return;
  let itens=estoqueCliente(cid,servicoId,selecionado);
  if(tid)itens=itens.filter(e=>e.touroId===tid||e.id===selecionado);
  sel.innerHTML='<option value="">'+(!cid?'Selecione primeiro o cliente...':!tid?'Selecione o touro...':'Selecione o lote...')+'</option>'+
    itens.map(e=>'<option value="'+E(e.id)+'">'+E(nomeTouro(e.touroId))+' | '+E(e.partida||"Sem partida")+' | disponível '+E(fmt(saldo(e,servicoId)))+' dose(s)'+(e.recipiente?' | caneca '+E(e.recipiente):'')+'</option>').join("");
  if(selecionado)sel.value=selecionado;
}
const original=window.formDoseServico;
if(typeof original!=="function")return;
window.formDoseServico=function(clienteId="",data="",id=""){
  const s=(B().servicosSemen||[]).find(x=>x.id===id)||{};
  clienteId=s.clienteId||clienteId;
  original.apply(this,[clienteId,data,id]);
  setTimeout(()=>{
    const c=document.querySelector('[name="clienteId"]'),t=document.querySelector('[name="touroId"]'),e=document.querySelector('[name="estoqueId"]');
    if(!c||!t||!e)return;
    preencherTouros(c.value||clienteId,s.touroId||"",id,s.estoqueId||"");
    preencherLotes(s.estoqueId||"",id);
    if(!c.dataset.egSemenCliente){c.dataset.egSemenCliente="1";c.addEventListener("change",()=>{preencherTouros(c.value,"",id,"");preencherLotes("",id)})}
    if(!t.dataset.egSemenCliente){t.dataset.egSemenCliente="1";t.addEventListener("change",()=>preencherLotes("",id))}
  },0);
};
})();