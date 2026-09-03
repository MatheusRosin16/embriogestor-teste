/* ============================================================
   EmbrioGestor — Correção Aspiração + Custos v1
   ARQUIVO ÚNICO

   Corrige:
   1) Aspiração/OPU -> atualiza o arquivo principal do Google Drive
      após salvar/editar/excluir, quando conectado e online.
   2) Custos -> preserva custosProducao no banco local, na normalização
      e no arquivo principal enviado ao Google Drive.

   ORDEM RECOMENDADA:
   app.js
   cloud.js
   embriogestor-correcao-aspiracao-custos.js
   custos-producao.js
   ============================================================ */
(function(){
"use strict";

if(window.__EG_CORRECAO_ASPIRACAO_CUSTOS__) return;
window.__EG_CORRECAO_ASPIRACAO_CUSTOS__ = true;

const CUSTOS_SHADOW_KEY = "embriogestor_custos_producao_v1";
const OPU_PENDING_KEY = "embriogestor_aspiracao_sync_pendente";

/* =========================
   UTILITÁRIOS
   ========================= */
function banco(){
  try { return db; } catch(e) { return null; }
}
function chaveBanco(){
  try{
    if(typeof DB_KEY !== "undefined" && DB_KEY) return DB_KEY;
  }catch(e){}
  return "embriogestor_v9";
}
function clonar(v){
  try { return JSON.parse(JSON.stringify(v)); } catch(e) { return []; }
}

/* =========================
   CUSTOS — PERSISTÊNCIA
   ========================= */
function lerCustosShadow(){
  try{
    const x = JSON.parse(localStorage.getItem(CUSTOS_SHADOW_KEY) || "[]");
    return Array.isArray(x) ? x : [];
  }catch(e){
    return [];
  }
}
function salvarCustosShadow(lista){
  try{
    localStorage.setItem(
      CUSTOS_SHADOW_KEY,
      JSON.stringify(Array.isArray(lista) ? lista : [])
    );
  }catch(e){
    console.warn("EmbrioGestor: não foi possível salvar a cópia dos custos.", e);
  }
}
function lerCustosBancoBruto(){
  try{
    const raw = localStorage.getItem(chaveBanco());
    if(!raw) return [];
    const obj = JSON.parse(raw);
    return Array.isArray(obj?.custosProducao) ? obj.custosProducao : [];
  }catch(e){
    return [];
  }
}
function recuperarCustos(){
  const b = banco();

  if(Array.isArray(b?.custosProducao) && b.custosProducao.length){
    return b.custosProducao;
  }

  const bruto = lerCustosBancoBruto();
  if(bruto.length) return bruto;

  return lerCustosShadow();
}
function garantirCustos(){
  const b = banco();
  if(!b) return [];

  if(!Array.isArray(b.custosProducao) || !b.custosProducao.length){
    b.custosProducao = clonar(recuperarCustos());
  }

  salvarCustosShadow(b.custosProducao);
  return b.custosProducao;
}

/* Recupera custos logo na abertura. */
garantirCustos();

/* Preserva custosProducao quando app/cloud normalizam o banco. */
try{
  if(typeof normalizarBanco === "function" && !normalizarBanco.__egAspCustos){
    const original = normalizarBanco;

    const adaptada = function(data = {}){
      let custos = [];

      if(Array.isArray(data?.custosProducao)){
        custos = clonar(data.custosProducao);
      }else{
        custos = clonar(recuperarCustos());
      }

      const novo = original(data);

      if(!Array.isArray(novo.custosProducao)){
        novo.custosProducao = custos;
      }else if(!novo.custosProducao.length && custos.length){
        novo.custosProducao = custos;
      }

      salvarCustosShadow(novo.custosProducao);
      return novo;
    };

    adaptada.__egAspCustos = true;
    normalizarBanco = adaptada;
  }
}catch(e){
  console.warn("EmbrioGestor: falha ao adaptar normalizarBanco.", e);
}

/* Garante custos em banco novo. */
try{
  if(typeof bancoVazio === "function" && !bancoVazio.__egAspCustos){
    const original = bancoVazio;

    const adaptada = function(){
      const novo = original.apply(this, arguments);
      if(!Array.isArray(novo.custosProducao)){
        novo.custosProducao = [];
      }
      return novo;
    };

    adaptada.__egAspCustos = true;
    bancoVazio = adaptada;
  }
}catch(e){}

/* Mantém custos antes/depois de salvar localmente. */
try{
  if(typeof salvarBanco === "function" && !salvarBanco.__egAspCustos){
    const original = salvarBanco;

    const adaptada = function(){
      garantirCustos();
      salvarCustosShadow(banco()?.custosProducao || []);

      const r = original.apply(this, arguments);

      garantirCustos();
      salvarCustosShadow(banco()?.custosProducao || []);
      return r;
    };

    adaptada.__egAspCustos = true;
    salvarBanco = adaptada;
  }
}catch(e){
  console.warn("EmbrioGestor: falha ao adaptar salvarBanco.", e);
}

/* Garante custos dentro do pacote de backup, quando existir essa função. */
try{
  if(typeof pacoteBackup === "function" && !pacoteBackup.__egAspCustos){
    const original = pacoteBackup;

    const adaptada = function(){
      garantirCustos();

      const p = original.apply(this, arguments);

      if(p?.banco){
        p.banco.custosProducao = clonar(
          banco()?.custosProducao || lerCustosShadow()
        );
      }

      return p;
    };

    adaptada.__egAspCustos = true;
    pacoteBackup = adaptada;
  }
}catch(e){}

/* Se o cloud.js tiver função de aplicar backup, preserva custos locais
   quando o backup antigo ainda não possuir custosProducao. */
try{
  if(typeof aplicarBackupCloud === "function" && !aplicarBackupCloud.__egAspCustos){
    const original = aplicarBackupCloud;

    const adaptada = function(data){
      let custosNuvem = [];

      try{
        const bruto =
          (data?.formato === "EmbrioGestorBackup" && data?.banco)
            ? data.banco
            : data;

        if(Array.isArray(bruto?.custosProducao)){
          custosNuvem = clonar(bruto.custosProducao);
        }
      }catch(e){}

      const custosLocais = clonar(
        banco()?.custosProducao || recuperarCustos()
      );

      const r = original.apply(this, arguments);

      const b = banco();
      if(b){
        b.custosProducao =
          custosNuvem.length ? custosNuvem : custosLocais;

        salvarCustosShadow(b.custosProducao);

        try{
          localStorage.setItem(chaveBanco(), JSON.stringify(b));
        }catch(e){}
      }

      return r;
    };

    adaptada.__egAspCustos = true;
    aplicarBackupCloud = adaptada;
  }
}catch(e){}

/* =========================
   ASPIRAÇÃO / OPU — DRIVE
   ========================= */
function marcarOpuPendente(v = true){
  try{
    if(v){
      localStorage.setItem(OPU_PENDING_KEY, new Date().toISOString());
    }else{
      localStorage.removeItem(OPU_PENDING_KEY);
    }
  }catch(e){}
}
function driveConectado(){
  try{
    return typeof driveToken !== "undefined" && !!driveToken;
  }catch(e){
    return false;
  }
}

let timerOpu = null;

function sincronizarArquivoPrincipal(){
  marcarOpuPendente(true);

  clearTimeout(timerOpu);

  timerOpu = setTimeout(async function(){
    try{
      garantirCustos();

      if(
        !navigator.onLine ||
        !driveConectado() ||
        typeof salvarDadosPrincipaisDrive !== "function"
      ){
        return;
      }

      await salvarDadosPrincipaisDrive();

      marcarOpuPendente(false);
      console.log(
        "EmbrioGestor: Aspiração/OPU e custos enviados ao arquivo principal do Drive."
      );
    }catch(e){
      marcarOpuPendente(true);
      console.warn(
        "EmbrioGestor: sincronização pendente para o Google Drive.",
        e
      );
    }
  }, 700);
}

/* Salvar/editar Aspiração. */
try{
  if(typeof salvarAspiracao === "function" && !salvarAspiracao.__egAspCustos){
    const original = salvarAspiracao;

    const adaptada = function(){
      let antes = "";
      try{
        antes = JSON.stringify(banco()?.aspiracoes || []);
      }catch(e){}

      const r = original.apply(this, arguments);

      let depois = "";
      try{
        depois = JSON.stringify(banco()?.aspiracoes || []);
      }catch(e){}

      if(antes !== depois){
        sincronizarArquivoPrincipal();
      }

      return r;
    };

    adaptada.__egAspCustos = true;
    salvarAspiracao = adaptada;
  }
}catch(e){
  console.warn("EmbrioGestor: falha ao adaptar salvarAspiracao.", e);
}

/* Excluir Aspiração. */
try{
  if(typeof excluirAspiracao === "function" && !excluirAspiracao.__egAspCustos){
    const original = excluirAspiracao;

    const adaptada = function(){
      let antes = "";
      try{
        antes = JSON.stringify(banco()?.aspiracoes || []);
      }catch(e){}

      const r = original.apply(this, arguments);

      let depois = "";
      try{
        depois = JSON.stringify(banco()?.aspiracoes || []);
      }catch(e){}

      if(antes !== depois){
        sincronizarArquivoPrincipal();
      }

      return r;
    };

    adaptada.__egAspCustos = true;
    excluirAspiracao = adaptada;
  }
}catch(e){}

/* Se estava offline, tenta novamente ao voltar internet. */
window.addEventListener("online", function(){
  try{
    if(localStorage.getItem(OPU_PENDING_KEY)){
      sincronizarArquivoPrincipal();
    }
  }catch(e){}
});

/* Se conectar o Drive e houver OPU pendente, tenta enviar. */
try{
  if(
    typeof conectarGoogleDrive === "function" &&
    !conectarGoogleDrive.__egAspCustos
  ){
    const original = conectarGoogleDrive;

    const adaptada = async function(){
      const r = await original.apply(this, arguments);

      try{
        if(r && localStorage.getItem(OPU_PENDING_KEY)){
          setTimeout(sincronizarArquivoPrincipal, 500);
        }
      }catch(e){}

      return r;
    };

    adaptada.__egAspCustos = true;
    conectarGoogleDrive = adaptada;
  }
}catch(e){}

/* Consolida custos no banco principal local na abertura. */
try{
  const b = banco();
  if(b){
    garantirCustos();
    localStorage.setItem(chaveBanco(), JSON.stringify(b));
  }
}catch(e){}

console.log(
  "EmbrioGestor: correção única Aspiração + Custos ativa."
);
})();