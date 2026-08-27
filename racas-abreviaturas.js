/* ============================================================
   EmbrioGestor — Abreviaturas de Raças v2
   Raças + Touros + Doadoras
   Módulo separado. Carregar DEPOIS do app.js.
   ============================================================ */
(function(){
"use strict";

const EG_RACAS_ABREV_KEY = "embriogestor_racas_abreviaturas_v2";

/* ------------------------------------------------------------
   MAPA DE ABREVIATURAS
   - preserva o que o sistema já conhece;
   - corrige apenas os padrões confirmados:
     Brangus = BN
     Nelore  = NE
   ------------------------------------------------------------ */

function carregarMapa(){
  let mapa = {};

  try {
    if(typeof ABREV_RACAS !== "undefined" && ABREV_RACAS){
      mapa = {...ABREV_RACAS};
    }
  } catch(e){}

  try {
    const salvo = JSON.parse(localStorage.getItem(EG_RACAS_ABREV_KEY) || "{}");
    mapa = {...mapa, ...salvo};
  } catch(e){}

  mapa["Brangus"] = "BN";
  mapa["Nelore"] = "NE";

  return mapa;
}

let EG_RACAS_ABREV = carregarMapa();

function salvarMapa(){
  try{
    localStorage.setItem(
      EG_RACAS_ABREV_KEY,
      JSON.stringify(EG_RACAS_ABREV)
    );
  }catch(e){
    console.warn("Não foi possível salvar abreviaturas de raças.", e);
  }

  try{
    if(typeof ABREV_RACAS !== "undefined"){
      Object.keys(EG_RACAS_ABREV).forEach(r=>{
        ABREV_RACAS[r] = EG_RACAS_ABREV[r];
      });
    }
  }catch(e){}
}

function normalizarSigla(v){
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g,"")
    .slice(0,6);
}

function abrevAutomatica(nome){
  const n = String(nome || "").trim();
  if(!n) return "";

  if(EG_RACAS_ABREV[n]){
    return normalizarSigla(EG_RACAS_ABREV[n]);
  }

  try{
    if(typeof racaAbreviada === "function"){
      const x = normalizarSigla(racaAbreviada(n));
      if(x) return x;
    }
  }catch(e){}

  const limpo = n
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[^A-Za-z0-9 ]/g," ")
    .trim();

  const partes = limpo.split(/\s+/).filter(Boolean);

  if(partes.length > 1){
    return partes.map(p=>p[0]).join("").slice(0,4).toUpperCase();
  }

  return limpo.slice(0,3).toUpperCase();
}

window.egAbrevPadraoRaca = function(nome){
  return abrevAutomatica(nome);
};

window.egAbrevRaca = function(nome){
  return abrevAutomatica(nome);
};

salvarMapa();

/* ------------------------------------------------------------
   FUNÇÕES DE EXIBIÇÃO
   ------------------------------------------------------------ */

window.touroRaca = function(id){
  const t=(db.touros||[]).find(x=>x.id===id);
  if(!t) return "";

  const personalizada=normalizarSigla(t.racaAbrev);
  if(personalizada) return personalizada;

  return abrevAutomatica(t.raca);
};

window.doadoraRaca = function(id){
  const d=(db.doadoras||[]).find(x=>x.id===id);
  if(!d) return "";

  const personalizada=normalizarSigla(d.racaAbrev);
  if(personalizada) return personalizada;

  return abrevAutomatica(d.raca);
};

/* ============================================================
   RAÇAS
   Agora cada raça possui abreviatura editável.
   ============================================================ */

window.racas = function(){
  header(
    "Raças",
    "Cadastro de raças e abreviaturas"
  );

  document.getElementById("content").innerHTML = `
    <div class="card">
      <div class="section-title">
        <h3>Raças cadastradas</h3>

        <button class="btn" onclick="formRaca()">
          Nova raça
        </button>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Raça</th>
              <th>Abreviatura</th>
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            ${(db.racas || []).map(r=>`
              <tr>
                <td>${esc(r)}</td>

                <td>
                  <strong>${esc(abrevAutomatica(r))}</strong>
                </td>

                <td>
                  <button
                    class="btn small secondary"
                    onclick="formRaca('${encodeURIComponent(r)}')"
                  >
                    Editar
                  </button>

                  <button
                    class="btn small danger"
                    onclick="excluirRaca('${encodeURIComponent(r)}')"
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

window.formRaca = function(nomeCodificado = ""){
  const antigo = nomeCodificado
    ? decodeURIComponent(nomeCodificado)
    : "";

  const sigla = antigo
    ? abrevAutomatica(antigo)
    : "";

  modal(
    antigo ? "Editar raça" : "Nova raça",
    `
      <div class="form-grid">

        ${campo(
          "Nome da raça",
          "nome",
          antigo
        )}

        <div>
          <label>Abreviatura</label>

          <input
            type="text"
            name="abreviatura"
            value="${esc(sigla)}"
            maxlength="6"
            autocomplete="off"
            style="text-transform:uppercase"
            placeholder="Ex.: NE, BN, AN"
          >

          <small class="field-help">
            Esta sigla será sugerida automaticamente nos cadastros de touros e doadoras.
          </small>
        </div>

      </div>

      <br>

      <button
        class="btn"
        onclick="salvarRaca('${nomeCodificado}')"
      >
        ${antigo ? "Salvar" : "Adicionar raça"}
      </button>
    `
  );

  const input = document.querySelector('[name="abreviatura"]');
  input?.addEventListener("input", ()=>{
    input.value = normalizarSigla(input.value);
  });
};

window.salvarRaca = function(nomeCodificado = ""){
  const antigo = nomeCodificado
    ? decodeURIComponent(nomeCodificado)
    : "";

  const nome =
    document.querySelector('[name="nome"]')?.value?.trim() || "";

  let sigla =
    normalizarSigla(
      document.querySelector('[name="abreviatura"]')?.value || ""
    );

  if(!exigir(nome.length > 0, "Informe o nome da raça.")) return;

  if(
    db.racas.some(
      r =>
        r.toLowerCase() === nome.toLowerCase() &&
        r !== antigo
    )
  ){
    alert("Esta raça já está cadastrada.");
    return;
  }

  if(!sigla){
    sigla = abrevAutomatica(nome);
  }

  if(
    !exigir(
      /^[A-Z0-9]{1,6}$/.test(sigla),
      "A abreviatura deve ter de 1 a 6 letras ou números, sem espaços."
    )
  ) return;

  if(antigo){
    const i = db.racas.indexOf(antigo);

    if(i >= 0){
      db.racas[i] = nome;
    }

    db.doadoras.forEach(d=>{
      if(d.raca === antigo){
        d.raca = nome;

        /* Se a doadora não tinha sigla personalizada,
           acompanha a nova sigla da raça. */
        if(!String(d.racaAbrev || "").trim()){
          d.racaAbrev = sigla;
        }
      }
    });

    db.touros.forEach(t=>{
      if(t.raca === antigo){
        t.raca = nome;

        if(!String(t.racaAbrev || "").trim()){
          t.racaAbrev = sigla;
        }
      }
    });

    if(antigo !== nome){
      delete EG_RACAS_ABREV[antigo];
    }
  }else{
    db.racas.push(nome);
  }

  EG_RACAS_ABREV[nome] = sigla;

  /* Padrões confirmados prevalecem. */
  if(nome === "Brangus") EG_RACAS_ABREV[nome] = "BN";
  if(nome === "Nelore") EG_RACAS_ABREV[nome] = "NE";

  salvarMapa();

  db.racas = [...new Set(db.racas)]
    .sort((a,b)=>a.localeCompare(b,"pt-BR"));

  fecharModal();
  salvarBanco();
};

/* ============================================================
   TOUROS
   Campo de abreviatura editável.
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

        <button class="btn" onclick="formTouro()">
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
              <th>Ações</th>
            </tr>
          </thead>

          <tbody>
            ${(db.touros || []).map(t=>`
              <tr>
                <td>${esc(t.nome || "")}</td>
                <td>${esc(t.registro || "")}</td>
                <td>${esc(t.raca || "")}</td>
                <td><strong>${esc(normalizarSigla(t.racaAbrev) || abrevAutomatica(t.raca))}</strong></td>
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

window.formTouro = function(id = ""){
  const t=(db.touros || []).find(x=>x.id===id) || {};

  const sigla =
    normalizarSigla(t.racaAbrev)
    || abrevAutomatica(t.raca);

  modal(
    id ? "Editar touro" : "Novo touro",
    `
      <div class="form-grid">

        ${campo("Nome do touro","nome",t.nome)}

        ${campo("Registro","registro",t.registro)}

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
            value="${esc(sigla)}"
            maxlength="6"
            style="text-transform:uppercase"
            placeholder="Ex.: NE, BN"
          >
        </div>

        ${select(
          "Central de coleta / genética",
          "central",
          CENTRAIS_INICIAIS,
          t.central
        )}

        ${campo("Código do touro","codigo",t.codigo)}

        ${campo("Observações","obs",t.obs)}

      </div>

      <br>

      <button class="btn" onclick="salvarTouro('${id}')">
        Salvar
      </button>
    `
  );

  configurarSugestaoAbrev("raca","racaAbrev");
};

window.salvarTouro = function(id = ""){
  const get=n=>
    document.querySelector(`[name="${n}"]`)?.value?.trim() || "";

  if(!exigir(get("nome"),"Informe o nome do touro.")) return;
  if(!exigir(get("raca"),"Selecione a raça.")) return;
  if(!exigir(get("central"),"Selecione a central.")) return;

  const sigla =
    normalizarSigla(get("racaAbrev"))
    || abrevAutomatica(get("raca"));

  const objeto = {
    id:id || idNovo("TOU",db.touros),
    nome:get("nome"),
    registro:get("registro"),
    raca:get("raca"),
    racaAbrev:sigla,
    central:get("central"),
    codigo:get("codigo"),
    obs:get("obs")
  };

  if(id){
    const atual=db.touros.find(x=>x.id===id);
    if(!atual)return;
    Object.assign(atual,objeto);
  }else{
    db.touros.push(objeto);
  }

  fecharModal();
  salvarBanco();
};

/* ============================================================
   DOADORAS
   Campo de abreviatura editável.
   ============================================================ */

window.doadoras = function(){
  header(
    "Doadoras",
    "Doadoras separadas por cliente"
  );

  document.getElementById("content").innerHTML = `
    <div class="card">

      <div class="section-title">
        <h3>Doadoras</h3>

        <button class="btn" onclick="formDoadora()">
          Nova doadora
        </button>
      </div>

      ${tabelaDoadoras(db.doadoras)}

    </div>
  `;
};

window.tabelaDoadoras = function(lista){
  return `
    <div class="table-wrap">

      <table>

        <thead>
          <tr>
            <th>Identificação</th>
            <th>Registro</th>
            <th>Cliente</th>
            <th>Raça</th>
            <th>Abrev.</th>
            <th>Categoria</th>
            <th>Nascimento</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>
          ${(lista || []).map(d=>`
            <tr>

              <td>${esc(d.nome || "")}</td>

              <td>${esc(d.registro || "")}</td>

              <td>${esc(clienteNome(d.clienteId))}</td>

              <td>${esc(d.raca || "")}</td>

              <td>
                <strong>
                  ${esc(
                    normalizarSigla(d.racaAbrev)
                    || abrevAutomatica(d.raca)
                  )}
                </strong>
              </td>

              <td>${esc(d.categoria || "")}</td>

              <td>${esc(d.nascimento || "")}</td>

              <td>${badge(d.status || "")}</td>

              <td>
                <button
                  class="btn small secondary"
                  onclick="formDoadora('${d.id}')"
                >
                  Editar
                </button>

                <button
                  class="btn small danger"
                  onclick="excluirDoadora('${d.id}')"
                >
                  Excluir
                </button>
              </td>

            </tr>
          `).join("")}
        </tbody>

      </table>

    </div>
  `;
};

window.formDoadora = function(id = "", clienteId = ""){
  const d=(db.doadoras || []).find(x=>x.id===id) || {};

  clienteId = d.clienteId || clienteId;

  const sigla =
    normalizarSigla(d.racaAbrev)
    || abrevAutomatica(d.raca);

  modal(
    id ? "Editar doadora" : "Nova doadora",
    `
      <div class="form-grid">

        ${select(
          "Cliente",
          "clienteId",
          typeof clientesDisponiveisProfissional === "function"
            ? clientesDisponiveisProfissional()
            : db.clientes,
          clienteId
        )}

        ${campo(
          "Identificação / Brinco",
          "nome",
          d.nome
        )}

        ${campo(
          "Registro",
          "registro",
          d.registro
        )}

        ${select(
          "Raça",
          "raca",
          db.racas,
          d.raca
        )}

        <div>
          <label>Abreviatura da raça</label>

          <input
            type="text"
            name="racaAbrev"
            value="${esc(sigla)}"
            maxlength="6"
            style="text-transform:uppercase"
            placeholder="Ex.: NE, BN"
          >

          <small class="field-help">
            Pode usar a sigla padrão da raça ou editar somente para esta doadora.
          </small>
        </div>

        ${select(
          "Categoria",
          "categoria",
          CATEGORIAS_DOADORAS,
          d.categoria
        )}

        ${campo(
          "Data de nascimento",
          "nascimento",
          d.nascimento,
          "date"
        )}

        ${select(
          "Status",
          "status",
          STATUS_DOADORA,
          d.status || "Ativo"
        )}

        ${campo(
          "Observações",
          "obs",
          d.obs
        )}

      </div>

      <br>

      <button class="btn" onclick="salvarDoadora('${id}')">
        Salvar
      </button>
    `
  );

  configurarSugestaoAbrev("raca","racaAbrev");
};

window.salvarDoadora = function(id = ""){
  const get=n=>
    document.querySelector(`[name="${n}"]`)?.value?.trim() || "";

  if(!exigir(get("clienteId"),"Selecione o cliente.")) return;
  if(!exigir(get("nome"),"Informe a identificação/brinco da doadora.")) return;
  if(!exigir(get("raca"),"Selecione a raça.")) return;
  if(!exigir(get("categoria"),"Selecione a categoria.")) return;

  const sigla =
    normalizarSigla(get("racaAbrev"))
    || abrevAutomatica(get("raca"));

  const objeto = {
    id:id || idNovo("DOA",db.doadoras),
    clienteId:get("clienteId"),
    nome:get("nome"),
    registro:get("registro"),
    raca:get("raca"),
    racaAbrev:sigla,
    categoria:get("categoria"),
    nascimento:get("nascimento"),
    status:get("status") || "Ativo",
    obs:get("obs")
  };

  if(id){
    const atual=db.doadoras.find(x=>x.id===id);
    if(!atual)return;
    Object.assign(atual,objeto);
  }else{
    db.doadoras.push(objeto);
  }

  fecharModal();
  salvarBanco();
};

/* ------------------------------------------------------------
   Sugestão automática em Touros e Doadoras
   ------------------------------------------------------------ */

function configurarSugestaoAbrev(nomeRaca,nomeAbrev){
  const sel=document.querySelector(`[name="${nomeRaca}"]`);
  const inp=document.querySelector(`[name="${nomeAbrev}"]`);

  if(!sel || !inp) return;

  let manual=false;

  inp.addEventListener("input",()=>{
    manual=true;
    inp.value=normalizarSigla(inp.value);
  });

  sel.addEventListener("change",()=>{
    if(!manual || !inp.value.trim()){
      inp.value=abrevAutomatica(sel.value);
    }
  });
}

/* ------------------------------------------------------------
   Migração segura
   Registros sem sigla passam a receber a sigla do catálogo.
   Não sobrescreve uma sigla já personalizada.
   ------------------------------------------------------------ */

function migrar(){
  let mudou=false;

  (db.touros || []).forEach(t=>{
    if(!String(t.racaAbrev || "").trim()){
      t.racaAbrev=abrevAutomatica(t.raca);
      mudou=true;
    }
  });

  (db.doadoras || []).forEach(d=>{
    if(!String(d.racaAbrev || "").trim()){
      d.racaAbrev=abrevAutomatica(d.raca);
      mudou=true;
    }
  });

  if(mudou){
    try{
      localStorage.setItem(DB_KEY,JSON.stringify(db));
    }catch(e){}
  }
}

migrar();

})();
