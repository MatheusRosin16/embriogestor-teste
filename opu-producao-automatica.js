/* ============================================================
 EmbrioGestor — OPU -> Produção Automática v4

 Versão robusta:
 - NÃO depende de interceptar salvarAspiracao()
 - observa diretamente db.aspiracoes
 - cria/atualiza Produção automaticamente
 - agrupa Aspiração visualmente por Cliente + Data
 ============================================================ */
(function(){
"use strict";

if(window.__EG_OPU_PRODUCAO_AUTO_V4__) return;
window.__EG_OPU_PRODUCAO_AUTO_V4__=true;

function banco(){
  try{return db}catch(e){return null}
}

function num(v){
  const n=Number(v);
  return Number.isFinite(n)&&n>=0?n:0;
}

function escV(v){
  try{
    if(typeof esc==="function") return esc(v);
  }catch(e){}
  return String(v??"").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[c]);
}

function dataBr(v){
  try{
    if(typeof dataBR==="function") return dataBR(v);
  }catch(e){}
  const p=String(v||"").split("-");
  return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:String(v||"");
}

function nomeCliente(id){
  try{
    if(typeof clienteNome==="function") return clienteNome(id);
  }catch(e){}
  return banco()?.clientes?.find(x=>x.id===id)?.nome||"";
}

function nomeDoadora(id){
  try{
    if(typeof doadoraNome==="function") return doadoraNome(id);
  }catch(e){}
  return banco()?.doadoras?.find(x=>x.id===id)?.nome||"";
}

function racaDoadora(id){
  const d=banco()?.doadoras?.find(x=>x.id===id);
  return d?.raca||"";
}

function nomeTouro(id){
  try{
    if(typeof touroNome==="function") return touroNome(id);
  }catch(e){}
  return banco()?.touros?.find(x=>x.id===id)?.nome||"";
}

function idProd(){
  const b=banco();
  try{
    if(typeof idNovo==="function") return idNovo("PROD",b.producoes||[]);
  }catch(e){}
  return "PROD_AUTO_"+Date.now()+"_"+Math.random().toString(36).slice(2,7);
}

function procurarProducao(asp){
  const ps=banco()?.producoes||[];

  let p=ps.find(x=>String(x.origemAspiracaoId||"")===String(asp.id||""));
  if(p) return p;

  return ps.find(x=>
    String(x.clienteId||"")===String(asp.clienteId||"") &&
    String(x.data||"").slice(0,10)===String(asp.data||"").slice(0,10) &&
    String(x.doadoraId||"")===String(asp.doadoraId||"")
  )||null;
}

function sincronizarAspiracao(asp){
  const b=banco();
  if(!b||!asp||!asp.clienteId||!asp.data||!asp.doadoraId) return false;
  if(!Array.isArray(b.producoes)) b.producoes=[];

  const total=
    num(asp.grau1)+
    num(asp.grau2)+
    num(asp.grau3)+
    num(asp.grau4);

  const viaveis=
    num(asp.grau1)+
    num(asp.grau2)+
    num(asp.grau3);

  let p=procurarProducao(asp);
  let criada=false;

  if(!p){
    p={
      id:idProd(),
      data:asp.data,
      clienteId:asp.clienteId,
      doadoraId:asp.doadoraId,
      touroId:"",
      oocitos:total,
      oocitosViaveis:viaveis,
      clivados:0,
      embriõesD7:0,
      transferidosFresco:0,
      transferidosDT:0,
      transferidosVT:0,
      congeladosDT:0,
      congeladosVT:0,
      congelados:0,
      tipoCongelamento:"",
      obs:"",
      origemAspiracaoId:asp.id,
      autoGeradaAspiracao:true
    };
    b.producoes.push(p);
    criada=true;
  }

  /* Somente estes dados acompanham a OPU. */
  p.data=asp.data;
  p.clienteId=asp.clienteId;
  p.doadoraId=asp.doadoraId;
  p.oocitos=total;
  p.oocitosViaveis=viaveis;
  p.origemAspiracaoId=asp.id;
  p.autoGeradaAspiracao=true;
  p.grupoAspiracaoChave=String(asp.clienteId)+"|"+String(asp.data).slice(0,10);

  return criada;
}

let salvando=false;

function persistirSemLoop(){
  if(salvando)return;
  salvando=true;
  try{
    const b=banco();
    if(!b)return;

    /*
      Usa salvarBanco quando disponível para manter todos os módulos
      atuais do EmbrioGestor funcionando, inclusive nuvem/custos.
    */
    if(typeof salvarBanco==="function"){
      salvarBanco();
    }else{
      localStorage.setItem("embriogestor_v9",JSON.stringify(b));
    }
  }catch(e){
    console.warn("OPU -> Produção v4: falha ao persistir.",e);
  }finally{
    setTimeout(()=>{salvando=false},100);
  }
}

let assinatura="";

function assinaturaAspiracoes(){
  const a=banco()?.aspiracoes||[];
  return JSON.stringify(a.map(x=>[
    x.id,x.data,x.clienteId,x.doadoraId,
    num(x.grau1),num(x.grau2),num(x.grau3),num(x.grau4),num(x.grau5)
  ]));
}

function sincronizarTudo(forcar=false){
  const b=banco();
  if(!b)return;

  const nova=assinaturaAspiracoes();
  if(!forcar && nova===assinatura)return;
  assinatura=nova;

  let mudou=false;

  for(const asp of (b.aspiracoes||[])){
    const antes=JSON.stringify(procurarProducao(asp)||null);
    const criada=sincronizarAspiracao(asp);
    const depois=JSON.stringify(procurarProducao(asp)||null);
    if(criada||antes!==depois)mudou=true;
  }

  if(mudou) persistirSemLoop();
}

/* ============================================================
 PASTAS VISUAIS DA ASPIRAÇÃO — CLIENTE + DATA
 ============================================================ */
function listaAspiracoesVisivel(){
  const b=banco();
  let lista=[...(b?.aspiracoes||[])];

  try{
    if(typeof listaNoPeriodo==="function"){
      lista=listaNoPeriodo(lista);
    }
  }catch(e){}

  return lista;
}

function renderPastasAspiracao(){
  const b=banco();
  if(!b)return;

  try{
    if(typeof header==="function"){
      const resumo=typeof resumoFiltroGlobal==="function"
        ? `Filtro global: ${resumoFiltroGlobal()}`
        : "Clientes minimizados";
      header("Aspiração de Oócitos",resumo);
    }
  }catch(e){}

  const content=document.getElementById("content");
  if(!content)return;

  const lista=listaAspiracoesVisivel();

  /* Primeiro agrupa por CLIENTE. */
  const clientes={};

  for(const a of lista){
    const cid=String(a.clienteId||"");
    if(!clientes[cid]){
      clientes[cid]={
        clienteId:a.clienteId,
        itens:[]
      };
    }
    clientes[cid].itens.push(a);
  }

  const blocos=Object.values(clientes)
    .sort((a,b)=>
      nomeCliente(a.clienteId).localeCompare(
        nomeCliente(b.clienteId),
        "pt-BR"
      )
    )
    .map(grupoCliente=>{

      /* Dentro de cada cliente, separa pelas datas. */
      const datas={};

      for(const a of grupoCliente.itens){
        const d=String(a.data||"Sem data");
        (datas[d] ||= []).push(a);
      }

      const totalOocitos=grupoCliente.itens.reduce((s,x)=>
        s+num(x.grau1)+num(x.grau2)+num(x.grau3)+num(x.grau4),0);

      const totalViaveis=grupoCliente.itens.reduce((s,x)=>
        s+num(x.grau1)+num(x.grau2)+num(x.grau3),0);

      const conteudoDatas=Object.entries(datas)
        .sort(([a],[b])=>String(b).localeCompare(String(a)))
        .map(([data,itens])=>{

          const totalData=itens.reduce((s,x)=>
            s+num(x.grau1)+num(x.grau2)+num(x.grau3)+num(x.grau4),0);

          const viaveisData=itens.reduce((s,x)=>
            s+num(x.grau1)+num(x.grau2)+num(x.grau3),0);

          return `
            <div class="date-group" style="margin-top:10px">
              <div class="date-group-title">
                ${escV(dataBr(data))}
                — ${itens.length} doadora(s)
                | ${totalData} oócitos
                | ${viaveisData} viáveis
              </div>

              <div class="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Doadora</th>
                      <th>Raça</th>
                      <th>G1</th>
                      <th>G2</th>
                      <th>G3</th>
                      <th>G4</th>
                      <th>G5</th>
                      <th>Total produção</th>
                      <th>Viáveis</th>
                      <th>Touro OPU</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${itens.map(a=>{
                      const totalProd=
                        num(a.grau1)+num(a.grau2)+
                        num(a.grau3)+num(a.grau4);

                      const vivos=
                        num(a.grau1)+num(a.grau2)+num(a.grau3);

                      return `
                        <tr>
                          <td>${escV(nomeDoadora(a.doadoraId))}</td>
                          <td>${escV(racaDoadora(a.doadoraId))}</td>
                          <td>${num(a.grau1)}</td>
                          <td>${num(a.grau2)}</td>
                          <td>${num(a.grau3)}</td>
                          <td>${num(a.grau4)}</td>
                          <td>${num(a.grau5)}</td>
                          <td><strong>${totalProd}</strong></td>
                          <td><strong>${vivos}</strong></td>
                          <td>${escV(nomeTouro(a.touroId))}</td>
                          <td>
                            <button class="btn small secondary"
                              onclick="formAspiracao('${escV(a.id)}')">
                              Editar
                            </button>
                            <button class="btn small danger"
                              onclick="excluirAspiracao('${escV(a.id)}')">
                              Excluir
                            </button>
                          </td>
                        </tr>`;
                    }).join("")}
                  </tbody>
                </table>
              </div>
            </div>`;
        }).join("");

      /*
       IMPORTANTE:
       não há atributo "open".
       Portanto TODOS os clientes começam minimizados.
      */
      return `
        <details class="eg-opu-cliente-folder">
          <summary style="
            cursor:pointer;
            padding:13px 10px;
            font-weight:700;
            border-bottom:1px solid rgba(0,0,0,.08)
          ">
            📁 ${escV(nomeCliente(grupoCliente.clienteId))}
            <span style="font-weight:400">
              (${grupoCliente.itens.length} aspiração(ões)
              | ${totalOocitos} oócitos
              | ${totalViaveis} viáveis)
            </span>
          </summary>

          <div style="padding:4px 8px 14px">
            ${conteudoDatas}
          </div>
        </details>`;
    }).join("");

  content.innerHTML=`
    <div class="card">
      <div class="section-title">
        <h3>Aspirações por cliente</h3>
        <button class="btn" onclick="formAspiracao()">
          Nova aspiração
        </button>
      </div>

      ${blocos ||
        '<div class="empty-state">Nenhuma aspiração cadastrada.</div>'}
    </div>`;
}
/*
 Sobrescreve SOMENTE a visualização da página Aspiração.
 O formulário e o salvamento originais continuam sendo usados.
*/
try{
  aspiracoes=renderPastasAspiracao;
}catch(e){
  console.warn("OPU -> Produção v4: não foi possível instalar pastas visuais.",e);
}

/* ============================================================
 OBSERVADOR INDEPENDENTE
 ============================================================ */
function iniciar(){
  sincronizarTudo(true);

  setInterval(function(){
    try{
      sincronizarTudo(false);
    }catch(e){
      console.warn("OPU -> Produção v4:",e);
    }
  },700);
}

if(document.readyState==="loading"){
  document.addEventListener("DOMContentLoaded",()=>setTimeout(iniciar,800),{once:true});
}else{
  setTimeout(iniciar,800);
}

})();
