/* ============================================================
   EmbrioGestor — OPU -> Produção Automática v1

   Ao salvar Aspiração de Oócitos:
   - agrupa por Cliente + Data;
   - cria automaticamente uma Produção por doadora;
   - preenche:
       Cliente
       Data
       Doadora
       Raça da doadora
       Oócitos totais = G1+G2+G3+G4
       Oócitos viáveis = G1+G2+G3
   - NÃO preenche touro, clivados, D7, transferidos, congelados etc.
   - evita duplicidade.
   ============================================================ */
(function(){
"use strict";

if(window.__EG_OPU_PRODUCAO_AUTO_V1__) return;
window.__EG_OPU_PRODUCAO_AUTO_V1__ = true;

function B(){
  try{return db||{}}catch(e){return{}}
}
function num(v){
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function texto(v){ return String(v ?? "").trim(); }

function valor(obj, nomes){
  for(const n of nomes){
    if(obj && obj[n] !== undefined && obj[n] !== null && obj[n] !== ""){
      return obj[n];
    }
  }
  return "";
}

function getG(asp, grau){
  const g = String(grau);
  return num(valor(asp,[
    "g"+g,
    "G"+g,
    "grau"+g,
    "Grau"+g,
    "oocitosG"+g,
    "oócitosG"+g,
    "oocitos_g"+g,
    "oocitos"+g
  ]));
}

function idNovo(prefix){
  return prefix+"_"+Date.now()+"_"+Math.random().toString(36).slice(2,9);
}

function nomeCliente(id){
  const b=B();
  const c=(b.clientes||[]).find(x=>String(x.id)===String(id));
  return texto(c?.nome || c?.razaoSocial || c?.fantasia || "Cliente");
}

function doadoraPorId(id){
  const b=B();
  return (b.doadoras||[]).find(x=>String(x.id)===String(id)) || null;
}

function nomeDoadora(d){
  return texto(d?.nome || d?.identificacao || d?.brinco || d?.rgd || "Doadora");
}

function racaDoadora(d){
  if(!d) return "";
  const direta = texto(d.raca || d.raça || d.racaNome || d.raçaNome);
  if(direta) return direta;

  const rid = d.racaId ?? d.raçaId;
  if(rid){
    const r=(B().racas||[]).find(x=>String(x.id)===String(rid));
    return texto(r?.nome || r?.sigla || r?.abreviacao || r?.abreviação);
  }
  return "";
}

function formatarDataBR(data){
  const s=texto(data);
  if(!s) return "";
  const p=s.slice(0,10).split("-");
  return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
}

function dadosAspiracao(asp){
  const clienteId = valor(asp,["clienteId","idCliente"]);
  const data = valor(asp,["data","dataAspiracao","dataAspiração"]);
  const doadoraId = valor(asp,["doadoraId","idDoadora"]);

  const g1=getG(asp,1), g2=getG(asp,2), g3=getG(asp,3), g4=getG(asp,4);

  /* Compatibilidade: se o cadastro antigo não tiver G1-G4 estruturados,
     usa os totais já existentes na própria aspiração. */
  let totais = g1+g2+g3+g4;
  let viaveis = g1+g2+g3;

  if(totais===0){
    totais=num(valor(asp,[
      "oocitos","oócitos","oocitosTotais","oócitosTotais","totalOocitos"
    ]));
  }
  if(viaveis===0){
    viaveis=num(valor(asp,[
      "oocitosViaveis","oócitosViaveis","oocitosViáveis","viaveis","viáveis"
    ]));
  }

  return {clienteId,data,doadoraId,g1,g2,g3,g4,totais,viaveis};
}

function acharProducaoExistente(asp, d){
  const producoes=B().producoes||[];

  /* Primeiro: vínculo exato com a aspiração. */
  let p=producoes.find(x=>
    String(x.origemAspiracaoId||"")===String(asp.id||"")
  );
  if(p) return p;

  /* Segundo: produção já existente para mesmo cliente + data + doadora.
     Assim não duplica produções criadas manualmente antes da instalação. */
  return producoes.find(x=>
    String(x.clienteId||"")===String(d.clienteId||"") &&
    String(x.data||"").slice(0,10)===String(d.data||"").slice(0,10) &&
    String(x.doadoraId||"")===String(d.doadoraId||"")
  ) || null;
}

function preencherBase(p, asp, d){
  const doadora=doadoraPorId(d.doadoraId);
  const cliente=nomeCliente(d.clienteId);

  p.clienteId=d.clienteId;
  p.data=d.data;
  p.doadoraId=d.doadoraId;

  /* Campos extras de referência; não atrapalham versões antigas. */
  p.racaDoadora=racaDoadora(doadora);
  p.raçaDoadora=p.racaDoadora;
  p.oocitos=d.totais;
  p.oocitosViaveis=d.viaveis;

  p.origemAspiracaoId=asp.id || p.origemAspiracaoId || idNovo("asp");
  p.autoGeradaAspiracao = p.autoGeradaAspiracao !== false;

  const chave = String(d.clienteId||"")+"|"+String(d.data||"").slice(0,10);
  p.grupoAspiracaoChave=chave;
  p.grupoAspiracaoNome=cliente+" — "+formatarDataBR(d.data);

  return p;
}

function sincronizarUma(asp){
  const b=B();
  if(!Array.isArray(b.producoes)) b.producoes=[];

  const d=dadosAspiracao(asp);
  if(!d.clienteId || !d.data || !d.doadoraId) return false;

  let p=acharProducaoExistente(asp,d);
  let criou=false;

  if(!p){
    p={
      id:idNovo("prod"),
      touroId:"",
      clivados:"",
      embriõesD7:"",
      transferidosFresco:"",
      congeladosDT:"",
      congeladosVT:"",
      obs:""
    };
    b.producoes.push(p);
    criou=true;
  }

  /* Atualiza apenas os dados que vêm da OPU.
     Os dados digitados depois na Produção permanecem intactos. */
  preencherBase(p,asp,d);

  return criou;
}

let sincronizando=false;

function sincronizarTodas(salvar=true){
  if(sincronizando) return 0;
  sincronizando=true;

  try{
    const b=B();
    const aspiracoes=Array.isArray(b.aspiracoes)?b.aspiracoes:[];
    let criadas=0;

    for(const asp of aspiracoes){
      if(sincronizarUma(asp)) criadas++;
    }

    if(salvar && aspiracoes.length){
      try{
        if(typeof salvarBanco==="function") salvarBanco();
        else localStorage.setItem(
          (typeof DB_KEY!=="undefined"&&DB_KEY)?DB_KEY:"embriogestor_v9",
          JSON.stringify(b)
        );
      }catch(e){}
    }

    return criadas;
  }finally{
    sincronizando=false;
  }
}

/* ------------------------------------------------------------
   APÓS SALVAR/EDITAR ASPIRAÇÃO
   ------------------------------------------------------------ */
try{
  if(typeof salvarAspiracao==="function" && !salvarAspiracao.__egOpuProdAuto){
    const original=salvarAspiracao;

    const adaptada=function(){
      const antes=(B().aspiracoes||[]).map(x=>JSON.stringify(x)).join("|");
      const r=original.apply(this,arguments);
      const depois=(B().aspiracoes||[]).map(x=>JSON.stringify(x)).join("|");

      if(antes!==depois){
        setTimeout(()=>sincronizarTodas(true),0);
      }
      return r;
    };

    adaptada.__egOpuProdAuto=true;
    salvarAspiracao=adaptada;
  }
}catch(e){
  console.warn("OPU -> Produção: não foi possível adaptar salvarAspiracao.",e);
}

/* ------------------------------------------------------------
   MIGRAÇÃO INICIAL
   Ao instalar, também cria produções que estejam faltando para
   aspirações já cadastradas, sem duplicar as existentes.
   ------------------------------------------------------------ */
function iniciar(){
  setTimeout(()=>{
    try{
      const n=sincronizarTodas(true);
      if(n>0){
        console.log(`EmbrioGestor: ${n} produção(ões) criada(s) automaticamente a partir das OPUs.`);
      }
    }catch(e){
      console.warn("OPU -> Produção: falha na sincronização inicial.",e);
    }
  },900);
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",iniciar,{once:true});
}else{
  iniciar();
}

})();