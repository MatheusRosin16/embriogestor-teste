/* ============================================================
   EmbrioGestor — Abreviaturas de Raças / Touros v1
   Módulo separado. Carregar DEPOIS do app.js.
   ============================================================ */
(function(){
"use strict";

/* Correções confirmadas pelo usuário.
   Nelore já estava NE no sistema; Brangus é corrigido de BG para BN. */
try {
  if (typeof ABREV_RACAS !== "undefined") {
    ABREV_RACAS["Nelore"] = "NE";
    ABREV_RACAS["Brangus"] = "BN";
  }
} catch(e) {
  console.warn("Não foi possível atualizar ABREV_RACAS:", e);
}

/* Abreviação padrão com fallback para o comportamento atual do sistema. */
function egAbrevPadraoRaca(nome){
  const n = String(nome || "").trim();
  if(!n) return "";

  try {
    if(typeof ABREV_RACAS !== "undefined" && ABREV_RACAS[n]){
      return String(ABREV_RACAS[n]).toUpperCase();
    }
  } catch(e){}

  if(typeof racaAbreviada === "function"){
    try { return String(racaAbreviada(n) || "").toUpperCase(); }
    catch(e){}
  }

  const limpo = n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^A-Za-z0-9 ]/g," ")
    .trim();

  const partes = limpo.split(/\s+/).filter(Boolean);

  return partes.length > 1
    ? partes.map(x=>x[0]).join("").slice(0,4).toUpperCase()
    : limpo.slice(0,3).toUpperCase();
}

/* Torna a função disponível para outros módulos futuros. */
window.egAbrevPadraoRaca = egAbrevPadraoRaca;

/* A abreviatura do touro passa a respeitar:
   1. abreviatura personalizada no cadastro;
   2. abreviatura padrão da raça. */
window.touroRaca = function(id){
  const t = (db.touros || []).find(x=>x.id===id);
  if(!t) return "";

  const personalizada = String(t.racaAbrev || "").trim().toUpperCase();
  if(personalizada) return personalizada;

  return egAbrevPadraoRaca(t.raca);
};

/* Mantém doadoras usando a tabela padrão corrigida. */
window.doadoraRaca = function(id){
  const d = (db.doadoras || []).find(x=>x.id===id);
  if(!d) return "";
  return egAbrevPadraoRaca(d.raca);
};

/* ============================================================
   TELA DE TOUROS
   Inclui uma coluna de abreviatura.
   ============================================================ */
window.touros = function(){
  header(
    "Touros",
    "Cadastro de touros, raças e centrais de coleta"
  );

  document.getElementById("content").innerHTML = `
    <div class="card">
      <div class="section-title">
        <h3>Touros</h3>

        <button
          class="btn"
          onclick="formTouro()"
        >
          Novo touro
        </button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Touro</th>
              <th>Registro</th>
              <th>Raça</th>
              <th>Abrev.</th>
              <th>Central</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            ${(db.touros || []).map(t=>`
              <tr>
                <td>${esc(t.nome || "")}</td>
                <td>${esc(t.registro || "")}</td>
                <td>${esc(t.raca || "")}</td>

                <td>
                  <strong>
                    ${esc(
                      String(t.racaAbrev || "").trim().toUpperCase()
                      || egAbrevPadraoRaca(t.raca)
                    )}
                  </strong>
                </td>

                <td>${esc(t.central || "")}</td>

                <td>
                  <button
                    class="btn small secondary"
                    onclick="formTouro('${t.id}')"
                  >
                    Editar
                  </button>

                  <button
                    class="btn small danger"
                    onclick="excluirTouro('${t.id}')"
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
};

/* ============================================================
   FORMULÁRIO DO TOURO
   Novo campo: Abreviatura da raça
   ============================================================ */
window.formTouro = function(id = ""){
  const t = (db.touros || []).find(x=>x.id===id) || {};

  const abreviatura =
    String(t.racaAbrev || "").trim().toUpperCase()
    || egAbrevPadraoRaca(t.raca);

  modal(
    id ? "Editar touro" : "Novo touro",
    `
      <div class="form-grid">

        ${campo(
          "Nome do touro",
          "nome",
          t.nome
        )}

        ${campo(
          "Registro",
          "registro",
          t.registro
        )}

        ${select(
          "Raça",
          "raca",
          db.racas,
          t.raca
        )}

        <div>
          <label>Abreviatura da raça</label>

          <input
            type="text"
            name="racaAbrev"
            value="${esc(abreviatura)}"
            maxlength="6"
            autocomplete="off"
            style="text-transform:uppercase"
            placeholder="Ex.: NE, BN, AN"
          >

          <small class="field-help">
            Pode editar esta sigla. Se ficar vazia, o sistema usa a abreviatura padrão da raça.
          </small>
        </div>

        ${select(
          "Central de coleta / genética",
          "central",
          CENTRAIS_INICIAIS,
          t.central
        )}

        ${campo(
          "Código do touro",
          "codigo",
          t.codigo
        )}

        ${campo(
          "Observações",
          "obs",
          t.obs
        )}

      </div>

      <br>

      <button
        class="btn"
        onclick="salvarTouro('${id}')"
      >
        Salvar
      </button>
    `
  );

  /* Ao trocar a raça, sugere automaticamente a abreviatura padrão.
     Se o usuário já digitou uma sigla personalizada, não sobrescreve
     após ele alterar manualmente. */
  const selRaca = document.querySelector('[name="raca"]');
  const inpAbrev = document.querySelector('[name="racaAbrev"]');

  if(selRaca && inpAbrev){
    let editadaManualmente = false;

    inpAbrev.addEventListener("input", ()=>{
      editadaManualmente = true;
      inpAbrev.value = inpAbrev.value.toUpperCase();
    });

    selRaca.addEventListener("change", ()=>{
      if(!editadaManualmente || !inpAbrev.value.trim()){
        inpAbrev.value = egAbrevPadraoRaca(selRaca.value);
      }
    });
  }
};

/* ============================================================
   SALVAMENTO
   Preserva todos os campos antigos + racaAbrev.
   ============================================================ */
window.salvarTouro = function(id = ""){
  const get = nome =>
    document.querySelector(`[name="${nome}"]`)?.value?.trim() || "";

  if(!exigir(get("nome"), "Informe o nome do touro.")) return;
  if(!exigir(get("raca"), "Selecione a raça.")) return;
  if(!exigir(get("central"), "Selecione a central.")) return;

  let abrev = get("racaAbrev").toUpperCase();

  if(!abrev){
    abrev = egAbrevPadraoRaca(get("raca"));
  }

  if(!exigir(
    /^[A-Z0-9]{1,6}$/.test(abrev),
    "A abreviatura deve ter de 1 a 6 letras ou números, sem espaços."
  )) return;

  const objeto = {
    id: id || idNovo("TOU", db.touros),
    nome: get("nome"),
    registro: get("registro"),
    raca: get("raca"),
    racaAbrev: abrev,
    central: get("central"),
    codigo: get("codigo"),
    obs: get("obs")
  };

  if(id){
    const atual = db.touros.find(x=>x.id===id);
    if(!atual) return;
    Object.assign(atual, objeto);
  }else{
    db.touros.push(objeto);
  }

  fecharModal();
  salvarBanco();
};

/* Corrige silenciosamente touros Brangus/Nelore sem abreviatura personalizada.
   Não altera quem já possui uma abreviatura manual salva. */
function migrarAbreviaturas(){
  let mudou = false;

  (db.touros || []).forEach(t=>{
    if(String(t.racaAbrev || "").trim()) return;

    if(t.raca === "Brangus"){
      t.racaAbrev = "BN";
      mudou = true;
    }

    if(t.raca === "Nelore"){
      t.racaAbrev = "NE";
      mudou = true;
    }
  });

  if(mudou){
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    } catch(e){
      console.warn("Não foi possível salvar migração das abreviaturas.", e);
    }
  }
}

migrarAbreviaturas();

})();
