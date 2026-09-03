/* ============================================================
 EmbrioGestor — OPU -> Produção Automática v2
 Feito para o app.js atual do EmbrioGestor.

 Campos reais da Aspiração:
 grau1, grau2, grau3, grau4, grau5

 Produção automática:
 oocitos = grau1 + grau2 + grau3 + grau4
 oocitosViaveis = grau1 + grau2 + grau3

 Agrupamento visual:
 Cliente + Data (já utilizado pelo EmbrioGestor)
 ============================================================ */
(function(){
"use strict";

if(window.__EG_OPU_PRODUCAO_AUTO_V2__) return;
window.__EG_OPU_PRODUCAO_AUTO_V2__=true;

function banco(){
  try{return db}catch(e){return null}
}
function n(v){
  const x=Number(v);
  return Number.isFinite(x)&&x>=0?x:0;
}

function chave(asp){
  return [
    String(asp.clienteId||""),
    String(asp.data||"").slice(0,10),
    String(asp.doadoraId||"")
  ].join("|");
}

function producaoDaAspiracao(asp){
  const b=banco();
  if(!b)return null;

  /* vínculo exato criado por esta automação */
  const porOrigem=(b.producoes||[]).find(p=>
    String(p.origemAspiracaoId||"")===String(asp.id||"")
  );
  if(porOrigem)return porOrigem;

  /* evita duplicar se já existir Cliente + Data + Doadora */
  return (b.producoes||[]).find(p=>
    String(p.clienteId||"")===String(asp.clienteId||"") &&
    String(p.data||"").slice(0,10)===String(asp.data||"").slice(0,10) &&
    String(p.doadoraId||"")===String(asp.doadoraId||"")
  )||null;
}

function criarOuAtualizar(asp){
  const b=banco();
  if(!b||!asp)return false;
  if(!Array.isArray(b.producoes))b.producoes=[];

  if(!asp.clienteId||!asp.data||!asp.doadoraId)return false;

  const total=n(asp.grau1)+n(asp.grau2)+n(asp.grau3)+n(asp.grau4);
  const viaveis=n(asp.grau1)+n(asp.grau2)+n(asp.grau3);

  let p=producaoDaAspiracao(asp);
  let criada=false;

  if(!p){
    p={
      id: (typeof idNovo==="function")
        ? idNovo("PROD",b.producoes)
        : "PROD_AUTO_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),

      data:asp.data,
      clienteId:asp.clienteId,
      doadoraId:asp.doadoraId,

      /* preenchido depois pelo usuário */
      touroId:"",
      clivados:0,
      embriõesD7:0,
      transferidosFresco:0,
      congeladosDT:0,
      congeladosVT:0,
      obs:"",

      /* vínculo com a OPU */
      origemAspiracaoId:asp.id,
      autoGeradaAspiracao:true
    };

    b.producoes.push(p);
    criada=true;
  }

  /* Estes campos SEMPRE acompanham a OPU. */
  p.data=asp.data;
  p.clienteId=asp.clienteId;
  p.doadoraId=asp.doadoraId;
  p.oocitos=total;
  p.oocitosViaveis=viaveis;
  p.origemAspiracaoId=asp.id;
  p.autoGeradaAspiracao=true;
  p.grupoAspiracaoChave=String(asp.clienteId)+"|"+String(asp.data).slice(0,10);

  /*
   NÃO altera:
   touroId, clivados, embriõesD7,
   transferidosFresco, congeladosDT, congeladosVT, obs.
   Assim os dados preenchidos depois não são apagados.
  */

  return criada;
}

let executando=false;

function sincronizarTodas(){
  if(executando)return 0;
  executando=true;

  try{
    const b=banco();
    if(!b)return 0;

    const aspiracoes=Array.isArray(b.aspiracoes)?b.aspiracoes:[];
    let criadas=0;

    for(const asp of aspiracoes){
      if(criarOuAtualizar(asp))criadas++;
    }

    /* Salva sem depender do formulário de Produção,
       portanto o touro pode permanecer vazio neste momento. */
    if(aspiracoes.length){
      if(typeof salvarBanco==="function"){
        salvarBanco();
      }else{
        try{
          localStorage.setItem("embriogestor_v9",JSON.stringify(b));
        }catch(e){}
      }
    }

    return criadas;
  }finally{
    executando=false;
  }
}

/* ------------------------------------------------------------
 INTERCEPTA O SALVAMENTO REAL DA ASPIRAÇÃO
 ------------------------------------------------------------ */
try{
  if(typeof salvarAspiracao==="function"&&!salvarAspiracao.__egOpuProdV2){
    const original=salvarAspiracao;

    const adaptada=function(){
      let antes="";
      try{antes=JSON.stringify((banco()?.aspiracoes)||[])}catch(e){}

      const r=original.apply(this,arguments);

      let depois="";
      try{depois=JSON.stringify((banco()?.aspiracoes)||[])}catch(e){}

      if(antes!==depois){
        setTimeout(function(){
          try{sincronizarTodas()}catch(e){
            console.warn("OPU -> Produção v2:",e);
          }
        },50);
      }

      return r;
    };

    adaptada.__egOpuProdV2=true;
    salvarAspiracao=adaptada;
  }
}catch(e){
  console.warn("OPU -> Produção v2: salvarAspiracao não encontrada.",e);
}

/* ------------------------------------------------------------
 AO ABRIR:
 também cria produções faltantes para OPUs antigas.
 ------------------------------------------------------------ */
function iniciar(){
  setTimeout(function(){
    try{
      const qtd=sincronizarTodas();
      if(qtd>0){
        console.log("EmbrioGestor: "+qtd+" produção(ões) criada(s) a partir das OPUs.");
      }
    }catch(e){
      console.warn("OPU -> Produção v2:",e);
    }
  },1200);
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",iniciar,{once:true});
}else{
  iniciar();
}

})();