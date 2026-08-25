const DB_KEY = "embriogestor_v9";

const db = carregarBanco();

let page = "dashboard";

let clienteSelecionado = null;


// ============================================================
// BANCO
// ============================================================

function numeroNaoNegativo(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function recalcularEstoqueItem(estoqueItem, banco = db) {
  if (!estoqueItem) return;
  const inicial = numeroNaoNegativo(estoqueItem.quantidade ?? estoqueItem.entrada ?? 0);
  let saldo = inicial;
  let usadas = 0;
  (banco.movimentacoes || []).filter(m => m.estoqueId === estoqueItem.id).forEach(m => {
    const q = numeroNaoNegativo(m.quantidade);
    if (m.tipo === "Uso") { saldo -= q; usadas += q; }
    else if (m.tipo === "Devolução") { saldo += q; usadas = Math.max(0, usadas - q); }
    else if (m.tipo === "Ajuste positivo") saldo += q;
    else if (m.tipo === "Ajuste negativo") saldo -= q;
  });
  estoqueItem.usadas = usadas;
  estoqueItem.saldo = Math.max(0, saldo);
  estoqueItem.entrada = inicial;
  estoqueItem.quantidade = inicial;
}

function recalcularTodosEstoques(banco = db) {
  (banco.estoque || []).forEach(e => recalcularEstoqueItem(e, banco));
}

function exigir(condicao, mensagem) {
  if (!condicao) { alert(mensagem); return false; }
  return true;
}

function bancoVazio() {
  return {
    versao: 9,
    clientes: [], fazendas: [], doadoras: [], touros: [],
    racas: [...new Set(RACAS_INICIAIS)],
    profissionais: [], usuarios: [], estoque: [], movimentacoes: [], estoqueEmbrioes: [],
    aspiracoes: [], producoes: [], transferencias: [], congelamentos: [], servicosSemen: []
  };
}

function normalizarBanco(data = {}) {
  const base = bancoVazio();
  const listas = ["clientes","fazendas","doadoras","touros","profissionais","usuarios","estoque","movimentacoes","estoqueEmbrioes","aspiracoes","producoes","transferencias","congelamentos","servicosSemen"];
  listas.forEach(k => base[k] = Array.isArray(data[k]) ? data[k] : []);

  // Migração segura de raças: preserva cadastros antigos e inclui catálogo inicial.
  const antigas = Array.isArray(data.racas) ? data.racas : [];
  const nomesAntigos = antigas.map(r => typeof r === "string" ? r : (r?.nome || "")).filter(Boolean);
  base.racas = [...new Set([...RACAS_INICIAIS, ...nomesAntigos])].sort((a,b)=>a.localeCompare(b,"pt-BR"));

  // Migra estoque antigo e recalcula saldos a partir das movimentações.
  base.estoque = base.estoque.map(e => ({
    ...e,
    quantidade: numeroNaoNegativo(e.quantidade ?? e.entrada ?? 0),
    entrada: numeroNaoNegativo(e.quantidade ?? e.entrada ?? 0),
    recipienteTipo: ["BOTIJAO","CANECA"].includes(String(e.recipienteTipo||"").toUpperCase())
      ? String(e.recipienteTipo).toUpperCase()
      : (String(e.botijao||"").toUpperCase().includes("CANECA") ? "CANECA" : "BOTIJAO"),
    recipiente: e.recipiente || e.botijao || "",
    usadas: numeroNaoNegativo(e.usadas || 0),
    saldo: numeroNaoNegativo(e.saldo ?? e.quantidade ?? e.entrada ?? 0)
  }));

  // Vincula movimentações antigas ao lote correto usando cliente+touro+partida.
  base.movimentacoes = base.movimentacoes.map(m => {
    if (m.estoqueId) return m;
    const matches = base.estoque.filter(e => e.clienteId===m.clienteId && e.touroId===m.touroId && String(e.partida||"")===String(m.partida||""));
    return matches.length===1 ? {...m, estoqueId:matches[0].id} : m;
  });

  // Se um estoque antigo tinha saldo/usadas mas nenhuma movimentação registrada,
  // cria movimentações de migração para preservar exatamente o estado encontrado.
  base.estoque.forEach(e => {
    const vinculadas = base.movimentacoes.filter(m => m.estoqueId===e.id);
    if (vinculadas.length) return;
    const inicial = numeroNaoNegativo(e.quantidade);
    const alvoUsadas = Math.min(numeroNaoNegativo(e.usadas), inicial);
    const alvoSaldo = numeroNaoNegativo(e.saldo);
    if (alvoUsadas > 0) base.movimentacoes.push({id:idNovo("MOV",base.movimentacoes),estoqueId:e.id,clienteId:e.clienteId,touroId:e.touroId,partida:e.partida,tipo:"Uso",quantidade:alvoUsadas,data:e.data||"",obs:"Migração automática do estoque antigo"});
    const aposUso = inicial - alvoUsadas;
    if (alvoSaldo > aposUso) base.movimentacoes.push({id:idNovo("MOV",base.movimentacoes),estoqueId:e.id,clienteId:e.clienteId,touroId:e.touroId,partida:e.partida,tipo:"Ajuste positivo",quantidade:alvoSaldo-aposUso,data:e.data||"",obs:"Migração automática do saldo antigo"});
    if (alvoSaldo < aposUso) base.movimentacoes.push({id:idNovo("MOV",base.movimentacoes),estoqueId:e.id,clienteId:e.clienteId,touroId:e.touroId,partida:e.partida,tipo:"Ajuste negativo",quantidade:aposUso-alvoSaldo,data:e.data||"",obs:"Migração automática do saldo antigo"});
  });

  // Migração da produção v6: preserva dados antigos e volta a separar
  // transferências a fresco, DT e VT. Registros da v5 continuam íntegros.
  base.producoes = base.producoes.map(p => ({
    ...p,
    transferidosFresco: numeroNaoNegativo(p.transferidosFresco),
    transferidosDT: numeroNaoNegativo(p.transferidosDT),
    transferidosVT: numeroNaoNegativo(p.transferidosVT),
    congelados: numeroNaoNegativo(p.congelados),
    tipoCongelamento: p.tipoCongelamento || "",
    doseUtilizada: Number.isFinite(Number(p.doseUtilizada)) ? Number(p.doseUtilizada) : 0
  }));

  // Campos antigos de transferência (como partida) são ignorados pelo sistema novo.
  base.transferencias = base.transferencias.map(t => ({
    id:t.id, data:t.data||"", clienteId:t.clienteId||"", doadoraId:t.doadoraId||"", touroId:t.touroId||"",
    receptora:t.receptora||"", embriãoGrau:t.embriãoGrau||t.embriaoGrau||"",
    embriãoEstagio:t.embriãoEstagio||t.embriaoEstagio||"", destino:t.destino||"",
    ovarioOvulou:t.ovarioOvulou||t.ovario||"", grauCL:t.grauCL||"", clCavitario:t.clCavitario||"",
    diagnostico:t.diagnostico||"Pendente", dataDiagnostico:t.dataDiagnostico||"", obs:t.obs||"",
    origemProducaoId:t.origemProducaoId||"", autoFresco:Boolean(t.autoFresco), ordemFresco:Number(t.ordemFresco)||0
  }));

  base.versao = 9;
  recalcularTodosEstoques(base);
  return base;
}

function carregarBanco() {
  const chaves = [DB_KEY, "embriogestor_v8", "embriogestor_v7", "embriogestor_v6", "embriogestor_v5", "embriogestor_v4", "embriogestor_v3", "embriogestor_v2", "embriogestor_v1"];
  for (const chave of chaves) {
    const raw = localStorage.getItem(chave);
    if (!raw) continue;
    try { return normalizarBanco(JSON.parse(raw)); }
    catch (e) { console.warn("Banco antigo inválido em", chave, e); }
  }
  return bancoVazio();
}


function salvarBanco() {
  recalcularTodosEstoques();
  db.versao = 9;
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  render();
}


// ============================================================
// UTILITÁRIOS
// ============================================================

function idNovo(prefixo, lista) {
  const usados = new Set((lista || []).map(x => String(x.id || "")));
  let maior = 0;
  usados.forEach(id => {
    const m = id.match(new RegExp("^" + prefixo + "(\\d+)$"));
    if (m) maior = Math.max(maior, Number(m[1]));
  });
  let n = maior + 1;
  let id;
  do { id = prefixo + String(n++).padStart(5, "0"); } while (usados.has(id));
  return id;
}


function esc(valor) {

  return String(
    valor ?? ""
  ).replace(
    /[&<>"']/g,
    c => ({

      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"

    })[c]
  );

}


function hoje() {

  return new Date()
    .toISOString()
    .split("T")[0];

}


function moeda(valor) {

  return Number(
    valor || 0
  ).toLocaleString(
    "pt-BR"
  );

}


function clienteNome(id) {

  return db.clientes.find(
    x => x.id === id
  )?.nome || "";

}


function doadoraNome(id) {

  return db.doadoras.find(
    x => x.id === id
  )?.nome || "";

}


function touroNome(id) {

  return db.touros.find(
    x => x.id === id
  )?.nome || "";

}


function atualizarDoadorasPorCliente(nomeSelect = "doadoraId", selecionado = "") {
  const clienteId = document.querySelector('[name="clienteId"]')?.value || "";
  const el = document.querySelector(`[name="${nomeSelect}"]`);
  if (!el) return;
  const lista = db.doadoras.filter(d => d.clienteId === clienteId);
  el.innerHTML = '<option value="">Selecione...</option>' + lista.map(d =>
    `<option value="${esc(d.id)}" ${d.id === selecionado ? "selected" : ""}>${esc(d.nome)}${d.registro ? " | Reg: " + esc(d.registro) : ""}</option>`
  ).join("");
}

function confirmarExclusao(texto) {
  return confirm(texto + "\n\nEsta ação não pode ser desfeita.");
}

function excluirCliente(id) {
  const c=db.clientes.find(x=>x.id===id); if(!c) return;
  const doadoras=db.doadoras.filter(x=>x.clienteId===id).map(x=>x.id);
  const estoques=db.estoque.filter(x=>x.clienteId===id).map(x=>x.id);
  const resumo=`Excluir o cliente ${c.nome}? Também serão excluídos registros vinculados (doadoras, estoque, movimentações, OPU, produções e transferências).`;
  if(!confirmarExclusao(resumo)) return;
  db.clientes=db.clientes.filter(x=>x.id!==id);
  db.doadoras=db.doadoras.filter(x=>x.clienteId!==id);
  db.estoque=db.estoque.filter(x=>x.clienteId!==id);
  db.estoqueEmbrioes=db.estoqueEmbrioes.filter(x=>x.clienteId!==id);
  db.movimentacoes=db.movimentacoes.filter(x=>x.clienteId!==id && !estoques.includes(x.estoqueId));
  db.aspiracoes=db.aspiracoes.filter(x=>x.clienteId!==id && !doadoras.includes(x.doadoraId));
  db.producoes=db.producoes.filter(x=>x.clienteId!==id && !doadoras.includes(x.doadoraId));
  db.transferencias=db.transferencias.filter(x=>x.clienteId!==id && !doadoras.includes(x.doadoraId));
  salvarBanco();
}

function excluirDoadora(id) {
  const d=db.doadoras.find(x=>x.id===id); if(!d) return;
  if(!confirmarExclusao(`Excluir a doadora ${d.nome}? OPUs, produções e transferências vinculadas também serão excluídas.`)) return;
  db.doadoras=db.doadoras.filter(x=>x.id!==id);
  db.aspiracoes=db.aspiracoes.filter(x=>x.doadoraId!==id);
  db.producoes=db.producoes.filter(x=>x.doadoraId!==id);
  db.estoqueEmbrioes=db.estoqueEmbrioes.filter(x=>x.doadoraId!==id);
  db.transferencias=db.transferencias.filter(x=>x.doadoraId!==id);
  salvarBanco();
}

function excluirTouro(id) {
  const t=db.touros.find(x=>x.id===id); if(!t) return;
  const estoques=db.estoque.filter(x=>x.touroId===id).map(x=>x.id);
  if(!confirmarExclusao(`Excluir o touro ${t.nome}? Estoques, movimentações, OPUs, produções e transferências vinculadas também serão excluídos.`)) return;
  db.touros=db.touros.filter(x=>x.id!==id);
  db.estoque=db.estoque.filter(x=>x.touroId!==id);
  db.estoqueEmbrioes=db.estoqueEmbrioes.filter(x=>x.touroId!==id);
  db.movimentacoes=db.movimentacoes.filter(x=>x.touroId!==id && !estoques.includes(x.estoqueId));
  db.aspiracoes=db.aspiracoes.filter(x=>x.touroId!==id);
  db.producoes=db.producoes.filter(x=>x.touroId!==id);
  db.transferencias=db.transferencias.filter(x=>x.touroId!==id);
  salvarBanco();
}

function excluirProfissional(id) {
  const p=db.profissionais.find(x=>x.id===id); if(!p) return;
  if(!confirmarExclusao(`Excluir o profissional ${p.nome}?`)) return;
  db.profissionais=db.profissionais.filter(x=>x.id!==id); salvarBanco();
}

function excluirEstoque(id) {
  const e=db.estoque.find(x=>x.id===id); if(!e) return;
  if(!confirmarExclusao(`Excluir este lote de sêmen (${touroNome(e.touroId)} / ${e.partida})? As movimentações deste lote também serão excluídas.`)) return;
  db.estoque=db.estoque.filter(x=>x.id!==id);
  db.movimentacoes=db.movimentacoes.filter(x=>x.estoqueId!==id);
  salvarBanco();
}

function excluirMovimentacao(id) {
  if(!confirmarExclusao("Excluir esta movimentação de estoque? O saldo será recalculado automaticamente.")) return;
  db.movimentacoes=db.movimentacoes.filter(x=>x.id!==id); salvarBanco();
}

function excluirAspiracao(id) {
  if(!confirmarExclusao("Excluir este registro de OPU/aspiração?")) return;
  db.aspiracoes=db.aspiracoes.filter(x=>x.id!==id); salvarBanco();
}

function excluirProducao(id) {
  if(!confirmarExclusao("Excluir esta produção de embriões?")) return;
  db.producoes=db.producoes.filter(x=>x.id!==id); salvarBanco();
}

function excluirTransferencia(id) {
  if(!confirmarExclusao("Excluir esta transferência de embrião?")) return;
  db.transferencias=db.transferencias.filter(x=>x.id!==id); salvarBanco();
}

function racaNome(nome) {

  /*
  IMPORTANTE:

  A raça é armazenada pelo nome.

  Não mostramos RAC00001,
  RAC00002 etc.
  */

  return nome || "";

}


function profissionalNome(id) {

  return db.profissionais.find(
    x => x.id === id
  )?.nome || "";

}


// ============================================================
// MENU
// ============================================================

const MENU = [

  ["dashboard", "Dashboard"],

  ["clientes", "Clientes"],

  ["doadoras", "Doadoras"],

  ["touros", "Touros"],

  ["racas", "Raças"],

  ["profissionais", "Profissionais"],

  ["carteiras", "Carteiras por Profissional"],

  ["estoque", "Estoque de Sêmen"],

  ["estoqueEmbrioes", "Estoque de Embriões"],

  ["movimentacoes", "Movimentações"],

  ["aspiracoes", "Aspiração de Oócitos"],

  ["producoes", "Produção de Embriões"],

  ["transferencias", "Transferência de Embriões"],

  ["relatorios", "Relatórios por Cliente"],

  ["importarDados", "Importar Dados Antigos"],


  ["nuvem", "Nuvem & Backup"],

  ["sair", "Sair"]

];


document.getElementById(
  "menu"
).innerHTML = MENU.map(
  ([id, nome]) => `

    <button
      data-page="${id}"
      onclick="irPara('${id}')"
    >
      ${nome}
    </button>

  `
).join("");


function irPara(novaPagina) {

  // Sair é uma ação, não uma página do sistema.
  // Interceptar aqui evita alterar o estado de navegação e impede
  // que o render tente abrir uma página inexistente.
  if (novaPagina === "sair") {
    if (typeof egSair === "function") {
      egSair();
    } else {
      sessionStorage.removeItem("embriogestor_auth");
      location.reload();
    }
    return;
  }

  page = novaPagina;

  clienteSelecionado = null;

  render();

}


// ============================================================
// HEADER
// ============================================================

function header(
  titulo,
  subtitulo
) {

  document.getElementById(
    "pageTitle"
  ).textContent = titulo;


  document.getElementById(
    "pageSubtitle"
  ).textContent = subtitulo;


  document
    .querySelectorAll(
      "#menu button"
    )
    .forEach(btn => {

      btn.classList.toggle(
        "active",
        btn.dataset.page === page
      );

    });

}


// ============================================================
// MODAL
// ============================================================

function modal(
  titulo,
  conteudo
) {

  let elemento =
    document.getElementById(
      "modal"
    );


  if (!elemento) {

    elemento =
      document.createElement(
        "div"
      );

    elemento.id = "modal";

    elemento.className =
      "modal";

    document.body.appendChild(
      elemento
    );

  }


  elemento.innerHTML = `

    <div class="modal-box">

      <div class="modal-head">

        <h3>
          ${titulo}
        </h3>

        <button
          class="close"
          onclick="fecharModal()"
        >
          ×
        </button>

      </div>

      ${conteudo}

    </div>

  `;


  elemento.classList.add(
    "open"
  );

}


function fecharModal() {

  document
    .getElementById(
      "modal"
    )
    ?.classList.remove(
      "open"
    );

}


// ============================================================
// FORMULÁRIOS
// ============================================================

function campo(
  label,
  name,
  value = "",
  type = "text"
) {

  return `

    <div>

      <label>
        ${label}
      </label>

      <input
        type="${type}"
        name="${name}"
        value="${esc(value)}"
        ${type === "number" ? 'min="0" step="1" inputmode="numeric"' : ""}
      >

    </div>

  `;

}


function select(
  label,
  name,
  lista,
  selecionado = ""
) {

  return `

    <div>

      <label>
        ${label}
      </label>

      <select name="${name}">

        <option value="">
          Selecione...
        </option>

        ${lista.map(
    item => {

      const valor =
        typeof item ===
          "string"
          ? item
          : item.id;

      const texto =
        typeof item ===
          "string"
          ? item
          : item.nome;

      return `

              <option
                value="${esc(valor)}"
                ${valor ===
          selecionado
          ? "selected"
          : ""
        }
              >
                ${esc(texto)}
              </option>

            `;

    }
  ).join("")}

      </select>

    </div>

  `;

}


function badge(valor) {

  return `

    <span class="badge">

      ${esc(valor)}

    </span>

  `;

}


// ============================================================
// RENDER
// ============================================================

function render() {

  switch (page) {

    case "dashboard":
      dashboard();
      break;

    case "clientes":
      clientes();
      break;

    case "doadoras":
      doadoras();
      break;

    case "touros":
      touros();
      break;

    case "racas":
      racas();
      break;

    case "profissionais":
      profissionais();
      break;

    case "carteiras":
      carteiras();
      break;

    case "estoque":
      estoque();
      break;

    case "estoqueEmbrioes":
      estoqueEmbrioes();
      break;

    case "movimentacoes":
      movimentacoes();
      break;

    case "aspiracoes":
      aspiracoes();
      break;

    case "producoes":
      producoes();
      break;

    case "transferencias":
      transferencias();
      break;

    case "relatorios":
      relatorios();
      break;

    case "importarDados":
      if (typeof paginaImportarDados === "function") paginaImportarDados();
      else document.getElementById("content").innerHTML = `<div class="card"><p>Módulo de importação não carregado.</p></div>`;
      break;

    case "usuarios":
      usuariosPermissoes();
      break;

    case "nuvem":
      if (typeof paginaNuvem === "function") paginaNuvem();
      else document.getElementById("content").innerHTML = `<div class="card"><p>Módulo de nuvem não carregado.</p></div>`;
      break;

  }

}


// ============================================================
// DASHBOARD
// ============================================================

function dashboard() {

  header(
    "Dashboard",
    "Visão geral do laboratório"
  );


  const oocitos =
    db.aspiracoes.reduce(
      (total, x) =>
        total +
        Number(
          x.oocitos || 0
        ),
      0
    );


  const embrioes =
    db.producoes.reduce(
      (total, x) =>
        total +
        Number(
          x.embriõesD7 || 0
        ),
      0
    );


  const doses =
    db.estoque.reduce(
      (total, x) =>
        total +
        Number(
          x.saldo || 0
        ),
      0
    );


  document.getElementById(
    "content"
  ).innerHTML = `

    <div class="grid kpis">

      <div class="card">
        <strong>Clientes</strong>
        <h2>
          ${db.clientes.length}
        </h2>
      </div>

      <div class="card">
        <strong>Doadoras ativas</strong>
        <h2>
          ${db.doadoras.filter(
    x =>
      x.status ===
      "Ativo"
  ).length
    }
        </h2>
      </div>

      <div class="card">
        <strong>Oócitos coletados</strong>
        <h2>
          ${oocitos}
        </h2>
      </div>

      <div class="card">
        <strong>Embriões D7</strong>
        <h2>
          ${embrioes}
        </h2>
      </div>

      <div class="card">
        <strong>Doses de sêmen</strong>
        <h2>
          ${doses}
        </h2>
      </div>

    </div>

  `;

}


// ============================================================
// CLIENTES
// ============================================================

function clientes() {

  header(
    "Clientes",
    "Pastas individuais dos clientes"
  );


  document.getElementById(
    "content"
  ).innerHTML = `

    <div class="card">

      <div class="section-title">

        <h3>
          Clientes
        </h3>

        <button
          class="btn"
          onclick="formCliente()"
        >
          Novo cliente
        </button>

      </div>


      <div class="table-wrap">

        <table>

          <thead>

            <tr>

              <th>Cliente</th>
              <th>CPF/CNPJ</th>
              <th>Propriedade</th>
              <th>Município</th>
              <th>Doadoras</th>
              <th></th>

            </tr>

          </thead>

          <tbody>

            ${db.clientes.map(
    cliente => {

      const qtd =
        db.doadoras.filter(
          d =>
            d.clienteId ===
            cliente.id
        ).length;


      return `

                    <tr>

                      <td>
                        ${esc(
        cliente.nome
      )}
                      </td>

                      <td>
                        ${esc(
        cliente.cpf
      )}
                      </td>

                      <td>
                        ${esc(
        cliente.propriedade
      )}
                      </td>

                      <td>
                        ${esc(
        cliente.municipio
      )}
                      </td>

                      <td>
                        ${qtd}
                      </td>

                      <td>

                        <button
                          class="btn small"
                          onclick="abrirPastaCliente('${cliente.id}')"
                        >
                          Abrir pasta
                        </button>

                        <button class="btn small secondary" onclick="formCliente('${cliente.id}')">Editar</button>
                        <button class="btn small danger" onclick="excluirCliente('${cliente.id}')">Excluir</button>

                      </td>

                    </tr>

                  `;

    }
  ).join("")
    }

          </tbody>

        </table>

      </div>

    </div>

  `;

}


// ============================================================
// FORM CLIENTE
// ============================================================

function formCliente(id = "") {

  const cliente =
    db.clientes.find(
      x => x.id === id
    ) || {};


  modal(

    id
      ? "Editar cliente"
      : "Novo cliente",

    `

      <div class="form-grid">

        ${campo(
      "Nome / Razão Social",
      "nome",
      cliente.nome
    )}

        ${campo(
      "CPF / CNPJ",
      "cpf",
      cliente.cpf
    )}

        ${campo(
      "Propriedade",
      "propriedade",
      cliente.propriedade
    )}

        ${campo(
      "Município",
      "municipio",
      cliente.municipio
    )}

        ${campo(
      "UF",
      "uf",
      cliente.uf
    )}

        ${campo(
      "Telefone",
      "telefone",
      cliente.telefone
    )}

        ${campo(
      "E-mail",
      "email",
      cliente.email
    )}

      </div>


      <br>

      <button
        class="btn"
        onclick="salvarCliente('${id}')"
      >
        Salvar
      </button>

    `

  );

}


function salvarCliente(id) {

  const get =
    nome =>
      document.querySelector(
        `[name="${nome}"]`
      ).value;


  const objeto = {

    id:
      id ||
      idNovo(
        "CLI",
        db.clientes
      ),

    nome:
      get("nome"),

    cpf:
      get("cpf"),

    propriedade:
      get("propriedade"),

    municipio:
      get("municipio"),

    uf:
      get("uf"),

    telefone:
      get("telefone"),

    email:
      get("email")

  };


  if (id) {

    Object.assign(
      db.clientes.find(
        x =>
          x.id === id
      ),
      objeto
    );

  } else {

    db.clientes.push(
      objeto
    );

  }


  fecharModal();

  salvarBanco();

}


// ============================================================
// PASTA DO CLIENTE
// ============================================================

function abrirPastaCliente(
  clienteId
) {

  const cliente =
    db.clientes.find(
      x =>
        x.id ===
        clienteId
    );


  if (!cliente)
    return;


  clienteSelecionado =
    clienteId;


  header(
    cliente.nome,
    "Pasta individual do cliente"
  );


  const doadoras =
    db.doadoras.filter(
      x =>
        x.clienteId ===
        clienteId
    );


  const aspiracoes =
    db.aspiracoes.filter(
      x =>
        x.clienteId ===
        clienteId
    );


  const producoes =
    db.producoes.filter(
      x =>
        x.clienteId ===
        clienteId
    );


  const transferencias =
    db.transferencias.filter(
      x =>
        x.clienteId ===
        clienteId
    );


  document.getElementById(
    "content"
  ).innerHTML = `

    <div class="card">

      <div class="section-title">

        <div>

          <h2>
            ${esc(cliente.nome)}
          </h2>

          <p>
            ${esc(
    cliente.propriedade
  )}
          </p>

        </div>


        <button
          class="btn secondary"
          onclick="clientes()"
        >
          Voltar
        </button>

      </div>


      <div class="grid kpis">

        <div class="card">
          Doadoras
          <h2>
            ${doadoras.length}
          </h2>
        </div>

        <div class="card">
          Aspirações
          <h2>
            ${aspiracoes.length}
          </h2>
        </div>

        <div class="card">
          Produções
          <h2>
            ${producoes.length}
          </h2>
        </div>

        <div class="card">
          Transferências
          <h2>
            ${transferencias.length}
          </h2>
        </div>

      </div>


      <br>


      <div class="section-title">

        <h3>
          Doadoras
        </h3>

        <button
          class="btn"
          onclick="formDoadora('', '${clienteId}')"
        >
          Nova doadora
        </button>

      </div>


      ${tabelaDoadoras(doadoras)}

    </div>

  `;

}


// ============================================================
// DOADORAS
// ============================================================

function doadoras() {

  header(
    "Doadoras",
    "Doadoras separadas por cliente"
  );


  document.getElementById(
    "content"
  ).innerHTML = `

    <div class="card">

      <div class="section-title">

        <h3>
          Doadoras
        </h3>

        <button
          class="btn"
          onclick="formDoadora()"
        >
          Nova doadora
        </button>

      </div>


      ${tabelaDoadoras(
    db.doadoras
  )}

    </div>

  `;

}


function tabelaDoadoras(lista) {
  return `
    <div class="table-wrap"><table><thead><tr>
      <th>Identificação</th><th>Registro</th><th>Cliente</th><th>Raça</th><th>Categoria</th><th>Nascimento</th><th>Status</th><th>Ações</th>
    </tr></thead><tbody>
    ${lista.map(d=>`<tr>
      <td>${esc(d.nome)}</td><td>${esc(d.registro||"")}</td><td>${esc(clienteNome(d.clienteId))}</td><td>${esc(racaNome(d.raca))}</td>
      <td>${esc(d.categoria)}</td><td>${esc(d.nascimento)}</td><td>${badge(d.status)}</td>
      <td><button class="btn small secondary" onclick="formDoadora('${d.id}')">Editar</button>
      <button class="btn small danger" onclick="excluirDoadora('${d.id}')">Excluir</button></td>
    </tr>`).join("")}
    </tbody></table></div>`;
}

// ============================================================
// FORM DOADORA
// ============================================================

function formDoadora(id = "", clienteId = "") {
  const d=db.doadoras.find(x=>x.id===id)||{};
  clienteId=d.clienteId||clienteId;
  modal(id?"Editar doadora":"Nova doadora",`
    <div class="form-grid">
      ${select("Cliente","clienteId",clientesDisponiveisProfissional(),clienteId)}
      ${campo("Identificação / Brinco","nome",d.nome)}
      ${campo("Registro","registro",d.registro)}
      ${select("Raça","raca",db.racas,d.raca)}
      ${select("Categoria","categoria",CATEGORIAS_DOADORAS,d.categoria)}
      ${campo("Data de nascimento","nascimento",d.nascimento,"date")}
      ${select("Status","status",STATUS_DOADORA,d.status||"Ativo")}
      ${campo("Observações","obs",d.obs)}
    </div><br><button class="btn" onclick="salvarDoadora('${id}')">Salvar</button>`);
}

function salvarDoadora(id) {
  const get=n=>document.querySelector(`[name="${n}"]`).value.trim();
  if (!exigir(get("clienteId"), "Selecione o cliente.")) return;
  if (!exigir(get("nome"), "Informe a identificação/brinco da doadora.")) return;
  if (!exigir(get("raca"), "Selecione a raça.")) return;
  if (!exigir(get("categoria"), "Selecione a categoria.")) return;
  const objeto={id:id||idNovo("DOA",db.doadoras),clienteId:get("clienteId"),nome:get("nome"),registro:get("registro"),raca:get("raca"),categoria:get("categoria"),nascimento:get("nascimento"),status:get("status")||"Ativo",obs:get("obs")};
  if(id) Object.assign(db.doadoras.find(x=>x.id===id),objeto); else db.doadoras.push(objeto);
  fecharModal(); salvarBanco();
}

// ============================================================
// TOUROS
// ============================================================

function touros() {

  header(
    "Touros",
    "Cadastro de touros e centrais de coleta"
  );


  document.getElementById(
    "content"
  ).innerHTML = `

    <div class="card">

      <div class="section-title">

        <h3>
          Touros
        </h3>

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
              <th>Central</th>
              <th></th>

            </tr>

          </thead>


          <tbody>

            ${db.touros.map(
    t => `

                  <tr>

                    <td>
                      ${esc(
      t.nome
    )}
                    </td>

                    <td>
                      ${esc(
      t.registro
    )}
                    </td>

                    <td>
                      ${esc(
      t.raca
    )}
                    </td>

                    <td>
                      ${esc(
      t.central
    )}
                    </td>

                    <td>

                      <button class="btn small secondary" onclick="formTouro('${t.id}')">Editar</button>
                      <button class="btn small danger" onclick="excluirTouro('${t.id}')">Excluir</button>

                    </td>

                  </tr>

                `
  ).join("")
    }

          </tbody>

        </table>

      </div>

    </div>

  `;

}


function formTouro(
  id = ""
) {

  const t =
    db.touros.find(
      x => x.id === id
    ) || {};


  modal(

    id
      ? "Editar touro"
      : "Novo touro",

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

}


function salvarTouro(id) {
  const get=n=>document.querySelector(`[name="${n}"]`).value.trim();
  if (!exigir(get("nome"), "Informe o nome do touro.")) return;
  if (!exigir(get("raca"), "Selecione a raça.")) return;
  if (!exigir(get("central"), "Selecione a central.")) return;
  const objeto={id:id||idNovo("TOU",db.touros),nome:get("nome"),registro:get("registro"),raca:get("raca"),central:get("central"),codigo:get("codigo"),obs:get("obs")};
  if(id) Object.assign(db.touros.find(x=>x.id===id),objeto); else db.touros.push(objeto);
  fecharModal(); salvarBanco();
}


// ============================================================
// RAÇAS
// ============================================================

function racas() {
  header("Raças", "Cadastro de raças bovinas salvo no banco local");
  document.getElementById("content").innerHTML = `
    <div class="card"><div class="section-title"><h3>Raças cadastradas</h3><button class="btn" onclick="formRaca()">Nova raça</button></div>
    <div class="table-wrap"><table><thead><tr><th>Raça</th><th>Ações</th></tr></thead><tbody>
    ${db.racas.map(r=>`<tr><td>${esc(r)}</td><td><button class="btn small secondary" onclick="formRaca('${encodeURIComponent(r)}')">Editar</button>
    <button class="btn small danger" onclick="excluirRaca('${encodeURIComponent(r)}')">Excluir</button></td></tr>`).join("")}
    </tbody></table></div></div>`;
}

function formRaca(nomeCodificado = "") {
  const antigo=nomeCodificado?decodeURIComponent(nomeCodificado):"";
  modal(antigo?"Editar raça":"Nova raça",`${campo("Nome da raça","nome",antigo)}<br>
    <button class="btn" onclick="salvarRaca('${nomeCodificado}')">${antigo?"Salvar":"Adicionar raça"}</button>`);
}

function salvarRaca(nomeCodificado = "") {
  const antigo=nomeCodificado?decodeURIComponent(nomeCodificado):"";
  const nome=document.querySelector('[name="nome"]').value.trim();
  if(!exigir(nome.length>0,"Informe o nome da raça.")) return;
  if(db.racas.some(r=>r.toLowerCase()===nome.toLowerCase() && r!==antigo)){alert("Esta raça já está cadastrada.");return;}
  if(antigo){
    const i=db.racas.indexOf(antigo); if(i>=0) db.racas[i]=nome;
    db.doadoras.forEach(d=>{if(d.raca===antigo)d.raca=nome;});
    db.touros.forEach(t=>{if(t.raca===antigo)t.raca=nome;});
  } else db.racas.push(nome);
  db.racas=[...new Set(db.racas)].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  fecharModal(); salvarBanco();
}

function excluirRaca(nomeCodificado) {
  const nome=decodeURIComponent(nomeCodificado);
  const usoD=db.doadoras.filter(d=>d.raca===nome).length, usoT=db.touros.filter(t=>t.raca===nome).length;
  if(usoD||usoT){alert(`A raça ${nome} está sendo usada em ${usoD} doadora(s) e ${usoT} touro(s). Altere esses cadastros antes de excluí-la.`);return;}
  if(!confirmarExclusao(`Excluir a raça ${nome}?`)) return;
  db.racas=db.racas.filter(r=>r!==nome); salvarBanco();
}

// ============================================================
// PROFISSIONAIS
// ============================================================

function profissionais() {

  header(
    "Profissionais",
    "Equipe e profissionais do laboratório"
  );


  document.getElementById(
    "content"
  ).innerHTML = `

    <div class="card">

      <div class="section-title">

        <h3>
          Profissionais
        </h3>

        <button
          class="btn"
          onclick="formProfissional()"
        >
          Novo profissional
        </button>

      </div>


      <div class="table-wrap">

        <table>

          <thead>

            <tr>

              <th>Nome</th>
              <th>Profissão</th>
              <th>Funcional</th>
              <th>Telefone</th>
              <th>Status</th>
              <th></th>

            </tr>

          </thead>


          <tbody>

            ${db.profissionais.map(
    p => `

                  <tr>

                    <td>
                      ${esc(p.nome)}
                    </td>

                    <td>
                      ${esc(p.profissao)}
                    </td>

                    <td>
                      ${esc(
      p.funcional
    )}
                    </td>

                    <td>
                      ${esc(
      p.telefone
    )}
                    </td>

                    <td>
                      ${badge(
      p.status
    )}
                    </td>

                    <td>

                      <button class="btn small secondary" onclick="formProfissional('${p.id}')">Editar</button>
                      <button class="btn small danger" onclick="excluirProfissional('${p.id}')">Excluir</button>

                    </td>

                  </tr>

                `
  ).join("")
    }

          </tbody>

        </table>

      </div>

    </div>

  `;

}


function formProfissional(
  id = ""
) {

  const p =
    db.profissionais.find(
      x => x.id === id
    ) || {};


  modal(

    id
      ? "Editar profissional"
      : "Novo profissional",

    `

      <div class="form-grid">

        ${campo(
      "Nome",
      "nome",
      p.nome
    )}


        ${select(
      "Profissão",
      "profissao",
      PROFISSOES_INICIAIS,
      p.profissao
    )}


        ${campo(
      "Número funcional",
      "funcional",
      p.funcional
    )}


        ${campo(
      "Telefone",
      "telefone",
      p.telefone
    )}


        ${campo(
      "E-mail",
      "email",
      p.email
    )}


        ${campo(
      "Data de entrada",
      "entrada",
      p.entrada,
      "date"
    )}


        ${campo(
      "Data de saída",
      "saida",
      p.saida,
      "date"
    )}


        ${select(
      "Status",
      "status",
      [
        "Ativo",
        "Inativo"
      ],
      p.status ||
      "Ativo"
    )}

      </div>


      <br>


      <button
        class="btn"
        onclick="salvarProfissional('${id}')"
      >
        Salvar
      </button>

    `

  );

}


function salvarProfissional(id) {
  const get=n=>document.querySelector(`[name="${n}"]`).value.trim();
  if (!exigir(get("nome"), "Informe o nome do profissional.")) return;
  if (!exigir(get("profissao"), "Selecione a profissão.")) return;
  if (get("saida") && get("entrada") && get("saida") < get("entrada")) { alert("A data de saída não pode ser anterior à entrada."); return; }
  const objeto={id:id||idNovo("PRO",db.profissionais),nome:get("nome"),profissao:get("profissao"),funcional:get("funcional"),telefone:get("telefone"),email:get("email"),entrada:get("entrada"),saida:get("saida"),status:get("status")||"Ativo"};
  if(id) Object.assign(db.profissionais.find(x=>x.id===id),objeto); else db.profissionais.push(objeto);
  fecharModal(); salvarBanco();
}


// ============================================================
// ESTOQUE DE SÊMEN
// ============================================================

function estoque() {
  recalcularTodosEstoques();
  header("Estoque de Sêmen", "Estoque separado por cliente, touro e lote");
  document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><h3>Estoque de sêmen</h3><button class="btn" onclick="formEstoque()">Nova entrada</button></div>
  <div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Touro</th><th>Central</th><th>Partida/lote</th><th>Quantidade</th><th>Usadas</th><th>Saldo</th><th>Recipiente</th><th>Local</th><th>Observações</th><th>Ações</th></tr></thead><tbody>
  ${db.estoque.map(x=>`<tr><td>${esc(clienteNome(x.clienteId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(x.central)}</td><td>${esc(x.partida)}</td><td>${numeroNaoNegativo(x.quantidade)}</td><td>${numeroNaoNegativo(x.usadas)}</td><td><strong>${numeroNaoNegativo(x.saldo)}</strong></td><td>${esc(x.recipienteTipo)}</td><td>${esc(x.recipiente)}</td><td>${esc(x.obs)}</td>
  <td><button class="btn small secondary" onclick="formEstoque('${x.id}')">Editar</button><button class="btn small danger" onclick="excluirEstoque('${x.id}')">Excluir</button></td></tr>`).join("")}
  </tbody></table></div></div>`;
}

function formEstoque(id="") {
  const e=db.estoque.find(x=>x.id===id)||{};
  modal(id?"Editar estoque de sêmen":"Entrada de sêmen",`<div class="form-grid">
  ${select("Cliente","clienteId",clientesDisponiveisProfissional(),e.clienteId||"")}${select("Touro","touroId",db.touros,e.touroId||"")}
  ${campo("Partida / lote","partida",e.partida||"")}${campo("Quantidade de doses","quantidade",e.quantidade??"0","number")}${campo("Data de entrada","data",e.data||hoje(),"date")}
  ${select("Tipo de recipiente","recipienteTipo",["BOTIJAO","CANECA"],e.recipienteTipo||"")}${campo("Identificação do botijão/caneca","recipiente",e.recipiente||"")}${campo("Observações","obs",e.obs||"")}
  </div><br><button class="btn" onclick="salvarEstoque('${id}')">Salvar</button>`);
}

function salvarEstoque(id="") {
  const get=n=>document.querySelector(`[name="${n}"]`).value.trim();
  const q=Number(get("quantidade"));
  if (!exigir(get("clienteId"),"Selecione o cliente.")) return;
  if (!exigir(get("touroId"),"Selecione o touro.")) return;
  const touro=db.touros.find(x=>x.id===get("touroId"));
  if (!exigir(touro,"Selecione um touro válido.")) return;
  if (!exigir(get("partida"),"Informe a partida/lote.")) return;
  if (!exigir(Number.isFinite(q) && q > 0,"A quantidade deve ser maior que zero e pode ser fracionada (ex.: 2,5).")) return;
  if (!exigir(["BOTIJAO","CANECA"].includes(get("recipienteTipo")),"Selecione BOTIJAO ou CANECA.")) return;
  const objeto={id:id||idNovo("EST",db.estoque),clienteId:get("clienteId"),touroId:get("touroId"),central:touro.central||"",partida:get("partida"),quantidade:q,entrada:q,data:get("data"),recipienteTipo:get("recipienteTipo"),recipiente:get("recipiente"),obs:get("obs")};
  if(id){
    const atual=db.estoque.find(x=>x.id===id); if(!atual) return;
    const movs=db.movimentacoes.filter(m=>m.estoqueId===id);
    let saldo=q, usadas=0;
    for(const m of movs){const v=numeroNaoNegativo(m.quantidade);if(m.tipo==="Uso"){saldo-=v;usadas+=v;}else if(m.tipo==="Devolução"){saldo+=v;usadas=Math.max(0,usadas-v);}else if(m.tipo==="Ajuste positivo")saldo+=v;else if(m.tipo==="Ajuste negativo")saldo-=v;}
    if(!exigir(saldo>=0,"A nova quantidade inicial deixaria o saldo negativo. Ajuste ou exclua movimentações antes de reduzir este lote.")) return;
    Object.assign(atual,objeto,{usadas,saldo});
    db.movimentacoes.filter(m=>m.estoqueId===id).forEach(m=>Object.assign(m,{clienteId:objeto.clienteId,touroId:objeto.touroId,partida:objeto.partida}));
  } else db.estoque.push({...objeto,usadas:0,saldo:q});
  fecharModal(); salvarBanco();
}

// ============================================================
// MOVIMENTAÇÕES
// ============================================================

function movimentacoes() {
  header("Movimentações", "Movimentações do estoque por cliente");
  document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><h3>Movimentações</h3><button class="btn" onclick="formMovimentacao()">Nova movimentação</button></div>
  <div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Touro</th><th>Partida</th><th>Tipo</th><th>Quantidade</th><th>Observação</th><th>Ações</th></tr></thead><tbody>
  ${db.movimentacoes.map(x=>`<tr><td>${esc(x.data)}</td><td>${esc(clienteNome(x.clienteId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(x.partida)}</td><td>${esc(x.tipo)}</td><td>${x.quantidade}</td><td>${esc(x.obs||"")}</td>
  <td><button class="btn small secondary" onclick="formMovimentacao('${x.id}')">Editar</button><button class="btn small danger" onclick="excluirMovimentacao('${x.id}')">Excluir</button></td></tr>`).join("")}
  </tbody></table></div></div>`;
}

function formMovimentacao(id="") {
  const m=db.movimentacoes.find(x=>x.id===id)||{};
  modal(id?"Editar movimentação":"Nova movimentação",`<div class="form-grid">
  ${select("Cliente","clienteId",clientesDisponiveisProfissional(),m.clienteId||"")}
  <div><label>Estoque / lote</label><select name="estoqueId"><option value="">Selecione primeiro o cliente...</option></select></div>
  ${select("Tipo","tipo",["Uso","Devolução","Ajuste positivo","Ajuste negativo"],m.tipo||"")}${`<div><label>Quantidade</label><input type="number" name="quantidade" min="0" step="0.1" inputmode="decimal" value="${esc(m.quantidade??1)}"></div>`}${campo("Data","data",m.data||hoje(),"date")}${campo("Observação","obs",m.obs||"")}
  </div><br><button class="btn" onclick="salvarMovimentacao('${id}')">Salvar</button>`);
  const cliente=document.querySelector('[name="clienteId"]');
  cliente.addEventListener('change',()=>atualizarEstoquesMovimentacao(""));
  atualizarEstoquesMovimentacao(m.estoqueId||"");
}

function atualizarEstoquesMovimentacao(selecionado="") {
  const cid=document.querySelector('[name="clienteId"]')?.value||"";
  const sel=document.querySelector('[name="estoqueId"]'); if(!sel) return;
  recalcularTodosEstoques();
  const itens=db.estoque.filter(x=>x.clienteId===cid);
  sel.innerHTML='<option value="">Selecione...</option>'+itens.map(x=>`<option value="${esc(x.id)}" ${x.id===selecionado?"selected":""}>${esc(touroNome(x.touroId))} | ${esc(x.partida)} | saldo: ${x.saldo}</option>`).join('');
}

function salvarMovimentacao(id="") {
  const get=n=>document.querySelector(`[name="${n}"]`).value.trim();
  const estoque=db.estoque.find(x=>x.id===get("estoqueId"));
  const q=Number(get("quantidade")), tipo=get("tipo");
  if (!exigir(get("clienteId"),"Selecione o cliente.")) return;
  if (!exigir(estoque && estoque.clienteId===get("clienteId"),"Selecione um lote pertencente ao cliente informado.")) return;
  if (!exigir(["Uso","Devolução","Ajuste positivo","Ajuste negativo"].includes(tipo),"Selecione o tipo de movimentação.")) return;
  if (!exigir(Number.isFinite(q) && q > 0,"A quantidade deve ser maior que zero e pode ser fracionada (ex.: 2,5).")) return;
  // Calcula o estado do lote ignorando a movimentação que está sendo editada.
  let saldo=numeroNaoNegativo(estoque.quantidade), usadas=0;
  db.movimentacoes.filter(m=>m.estoqueId===estoque.id && m.id!==id).forEach(m=>{const v=numeroNaoNegativo(m.quantidade);if(m.tipo==="Uso"){saldo-=v;usadas+=v;}else if(m.tipo==="Devolução"){saldo+=v;usadas=Math.max(0,usadas-v);}else if(m.tipo==="Ajuste positivo")saldo+=v;else if(m.tipo==="Ajuste negativo")saldo-=v;});
  if (["Uso","Ajuste negativo"].includes(tipo) && q > saldo) { alert("Quantidade maior que o saldo disponível."); return; }
  if (tipo === "Devolução" && q > usadas) { alert("A devolução não pode ser maior que a quantidade usada deste lote."); return; }
  const objeto={id:id||idNovo("MOV",db.movimentacoes),estoqueId:estoque.id,clienteId:estoque.clienteId,touroId:estoque.touroId,partida:estoque.partida,tipo,quantidade:q,data:get("data"),obs:get("obs")};
  if(id){const atual=db.movimentacoes.find(x=>x.id===id);if(!atual)return;Object.assign(atual,objeto);}else db.movimentacoes.push(objeto);
  fecharModal(); salvarBanco();
}

// ============================================================
// ASPIRAÇÃO DE OÓCITOS / OPU
// ============================================================

function aspiracoes() {
  header("Aspiração de Oócitos", "Controle das aspirações por cliente e doadora");
  document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><h3>Aspiração de Oócitos / OPU</h3><button class="btn" onclick="formAspiracao()">Nova aspiração</button></div>
  <div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Doadora</th><th>Raça</th><th>Oócitos</th><th>G1</th><th>G2</th><th>G3</th><th>G4</th><th>G5</th><th>Touro</th><th>Ações</th></tr></thead><tbody>
  ${db.aspiracoes.map(x=>{const d=db.doadoras.find(a=>a.id===x.doadoraId);return `<tr><td>${esc(x.data)}</td><td>${esc(clienteNome(x.clienteId))}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(d?.raca)}</td><td><strong>${numeroNaoNegativo(x.oocitos)}</strong></td><td>${numeroNaoNegativo(x.grau1)}</td><td>${numeroNaoNegativo(x.grau2)}</td><td>${numeroNaoNegativo(x.grau3)}</td><td>${numeroNaoNegativo(x.grau4)}</td><td>${numeroNaoNegativo(x.grau5)}</td><td>${esc(touroNome(x.touroId))}</td><td><button class="btn small secondary" onclick="formAspiracao('${x.id}')">Editar</button><button class="btn small danger" onclick="excluirAspiracao('${x.id}')">Excluir</button></td></tr>`}).join("")}
  </tbody></table></div></div>`;
}

function formAspiracao(id="") {
  const a=db.aspiracoes.find(x=>x.id===id)||{};
  modal(id?"Editar aspiração de oócitos":"Nova aspiração de oócitos",`<div class="form-grid">
    ${campo("Data","data",a.data||hoje(),"date")}
    ${select("Cliente","clienteId",clientesDisponiveisProfissional(),a.clienteId||"")}
    <div><label>Doadora</label><select name="doadoraId"><option value="">Selecione primeiro o cliente...</option></select></div>
    ${campo("Total de oócitos coletados","oocitos",a.oocitos??"0","number")}
    ${campo("Oócitos Grau 1","grau1",a.grau1??"0","number")}${campo("Oócitos Grau 2","grau2",a.grau2??"0","number")}${campo("Oócitos Grau 3","grau3",a.grau3??"0","number")}${campo("Oócitos Grau 4","grau4",a.grau4??"0","number")}${campo("Oócitos Grau 5","grau5",a.grau5??"0","number")}
    ${select("Touro","touroId",db.touros,a.touroId||"")}${campo("Observações","obs",a.obs||"")}
  </div><br><button class="btn" onclick="salvarAspiracao('${id}')">Salvar</button>`);
  document.querySelector('[name="clienteId"]').addEventListener('change',()=>atualizarDoadorasPorCliente("doadoraId",""));
  atualizarDoadorasPorCliente("doadoraId",a.doadoraId||"");
}

function salvarAspiracao(id="") {
  const get=n=>document.querySelector(`[name="${n}"]`).value.trim();
  const nums=["oocitos","grau1","grau2","grau3","grau4","grau5"].reduce((a,k)=>(a[k]=Number(get(k)),a),{});
  if (!exigir(get("clienteId"),"Selecione o cliente.")) return;
  const d=db.doadoras.find(x=>x.id===get("doadoraId"));
  if (!exigir(d && d.clienteId===get("clienteId"),"Selecione uma doadora pertencente ao cliente.")) return;
  if (!exigir(Object.values(nums).every(n=>Number.isInteger(n)&&n>=0),"As quantidades devem ser números inteiros não negativos.")) return;
  if (!exigir(nums.grau1+nums.grau2+nums.grau3+nums.grau4+nums.grau5 <= nums.oocitos,"A soma dos graus G1 a G5 não pode superar o total de oócitos.")) return;
  const objeto={id:id||idNovo("ASP",db.aspiracoes),data:get("data"),clienteId:get("clienteId"),doadoraId:get("doadoraId"),...nums,touroId:get("touroId"),obs:get("obs")};
  if(id){const atual=db.aspiracoes.find(x=>x.id===id);if(!atual)return;Object.assign(atual,objeto);}else db.aspiracoes.push(objeto);
  fecharModal(); salvarBanco();
}

// ============================================================
// PRODUÇÃO DE EMBRIÕES
// ============================================================

function agruparPorData(lista) {
  return [...(lista || [])].sort((a,b)=>String(b.data||"").localeCompare(String(a.data||""))).reduce((acc,item)=>{
    const chave=item.data||"Sem data";
    (acc[chave] ||= []).push(item);
    return acc;
  },{});
}

function dataBR(data) {
  if(!data) return "";
  const p=String(data).split("-");
  return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : String(data);
}

function producoes() {
  header("Produção de Embriões", "Produções organizadas por data");
  const grupos=agruparPorData(db.producoes);
  document.getElementById("content").innerHTML=`
  <div class="card"><div class="section-title"><h3>Produção de Embriões</h3><button class="btn" onclick="formProducao()">Nova produção</button></div>
  ${Object.keys(grupos).length ? Object.entries(grupos).map(([data,itens])=>`
    <div class="date-group"><div class="date-group-title">${esc(dataBR(data))}</div>
    <div class="table-wrap"><table><thead><tr>
      <th>Cliente</th><th>Doadora</th><th>Touro</th><th>Oócitos</th><th>Viáveis</th><th>Clivados</th><th>% Cliv.</th><th>Embriões D7</th><th>% Prod.</th><th>Fresco</th><th>DT</th><th>VT</th><th>Congelados</th><th>Tipo</th><th>Ações</th>
    </tr></thead><tbody>
    ${itens.map(x=>`<tr>
      <td>${esc(clienteNome(x.clienteId))}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td>
      <td>${numeroNaoNegativo(x.oocitos)}</td><td>${numeroNaoNegativo(x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.clivados)}</td><td>${percentual(x.clivados,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.embriõesD7)}</td><td>${percentual(x.embriõesD7,x.oocitosViaveis)}</td>
      <td>${numeroNaoNegativo(x.transferidosFresco)}</td><td>${numeroNaoNegativo(x.transferidosDT)}</td><td>${numeroNaoNegativo(x.transferidosVT)}</td><td>${numeroNaoNegativo(x.congelados)}</td><td>${esc(x.tipoCongelamento||"")}</td>
      <td><button class="btn small secondary" onclick="formProducao('${x.id}')">Editar</button><button class="btn small danger" onclick="excluirProducao('${x.id}')">Excluir</button></td>
    </tr>`).join("")}
    </tbody></table></div></div>`).join("") : `<div class="empty-state">Nenhuma produção cadastrada.</div>`}
  </div>`;
}

function percentual(numerador, denominador) {
  if (!denominador || denominador <= 0) return "0%";
  return (Number(numerador)/Number(denominador)*100).toFixed(0)+"%";
}

function formProducao(id="") {
  const p=db.producoes.find(x=>x.id===id)||{};
  modal(id?"Editar produção de embriões":"Nova produção de embriões",`
    <div class="form-grid">
      ${campo("Data","data",p.data||hoje(),"date")}
      ${select("Cliente","clienteId",clientesDisponiveisProfissional(),p.clienteId||"")}
      <div><label>Doadora</label><select name="doadoraId"><option value="">Selecione primeiro o cliente...</option></select></div>
      ${select("Touro","touroId",db.touros,p.touroId||"")}
      ${campo("Oócitos totais","oocitos",p.oocitos??"0","number")}
      ${campo("Oócitos viáveis","oocitosViaveis",p.oocitosViaveis??"0","number")}
      ${campo("Clivados","clivados",p.clivados??"0","number")}
      ${campo("Embriões viáveis no D7","embriõesD7",p.embriõesD7??"0","number")}
      ${campo("Embriões transferidos a fresco","transferidosFresco",p.transferidosFresco??"0","number")}
      ${campo("Embriões transferidos DT","transferidosDT",p.transferidosDT??"0","number")}
      ${campo("Embriões transferidos VT","transferidosVT",p.transferidosVT??"0","number")}
      ${campo("Embriões congelados","congelados",p.congelados??"0","number")}
      ${select("Tipo dos embriões congelados","tipoCongelamento",["DT","VT","Outro"],p.tipoCongelamento||"")}
      ${campo("Observações","obs",p.obs||"")}
    </div><br>
    <div class="note"><strong>Cálculo automático</strong><br>% de clivagem = Clivados ÷ Oócitos viáveis × 100<br>% de produção = Embriões viáveis D7 ÷ Oócitos viáveis × 100</div><br>
    <button class="btn" onclick="salvarProducao('${id}')">Salvar produção</button>`);
  document.querySelector('[name="clienteId"]').addEventListener('change',()=>atualizarDoadorasPorCliente("doadoraId",""));
  atualizarDoadorasPorCliente("doadoraId",p.doadoraId||"");
}

function salvarProducao(id="") {
  const get=n=>document.querySelector(`[name="${n}"]`).value.trim();
  const campos=["oocitos","oocitosViaveis","clivados","embriõesD7","transferidosFresco","transferidosDT","transferidosVT","congelados"];
  const n={}; campos.forEach(k=>n[k]=Number(get(k)));
  if (!exigir(get("data"),"Informe a data da produção.")) return;
  if (!exigir(get("clienteId"),"Selecione o cliente.")) return;
  const d=db.doadoras.find(x=>x.id===get("doadoraId"));
  if (!exigir(d && d.clienteId===get("clienteId"),"Selecione uma doadora pertencente ao cliente.")) return;
  if (!exigir(get("touroId"),"Selecione o touro.")) return;
  if (!exigir(campos.every(k=>Number.isInteger(n[k])&&n[k]>=0),"As quantidades devem ser números inteiros não negativos.")) return;
  if (!exigir(n.oocitosViaveis<=n.oocitos,"Oócitos viáveis não podem superar o total de oócitos.")) return;
  if (!exigir(n.clivados<=n.oocitosViaveis,"Clivados não podem superar os oócitos viáveis.")) return;
  if (!exigir(n.embriõesD7<=n.clivados,"Embriões D7 não podem superar os clivados.")) return;
  const destinados=n.transferidosFresco+n.transferidosDT+n.transferidosVT+n.congelados;
  if (!exigir(destinados<=n.embriõesD7,"Fresco + DT + VT + congelados não podem superar os embriões D7.")) return;
  if (n.congelados>0 && !exigir(get("tipoCongelamento"),"Informe o tipo dos embriões congelados.")) return;
  const objeto={id:id||idNovo("PROD",db.producoes),data:get("data"),clienteId:get("clienteId"),doadoraId:get("doadoraId"),touroId:get("touroId"),...n,tipoCongelamento:n.congelados>0?get("tipoCongelamento"):"",obs:get("obs")};
  if(id){const atual=db.producoes.find(x=>x.id===id);if(!atual)return;Object.assign(atual,objeto);}else db.producoes.push(objeto);
  fecharModal(); salvarBanco();
}

// ============================================================
// TRANSFERÊNCIAS
// ============================================================

function transferencias() {
  header("Transferência de Embriões", "Transferências organizadas por data");
  const grupos=agruparPorData(db.transferencias);
  document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><h3>Transferências</h3><button class="btn" onclick="formTransferencia()">Nova transferência</button></div>
  ${Object.keys(grupos).length ? Object.entries(grupos).map(([data,itens])=>`
  <div class="date-group"><div class="date-group-title">${esc(dataBR(data))}</div>
  <div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Doadora</th><th>Touro</th><th>Receptora</th><th>Embrião D7</th><th>Destino</th><th>Diagnóstico</th><th>Ações</th></tr></thead><tbody>
  ${itens.map(x=>`<tr><td>${esc(clienteNome(x.clienteId))}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(x.receptora)}</td><td>${esc(x.embriãoGrau)}<br>${esc(x.embriãoEstagio)}</td><td>${esc(x.destino)}</td><td>${badge(x.diagnostico)}</td>
  <td><button class="btn small secondary" onclick="formTransferencia('${x.id}')">Editar</button><button class="btn small secondary" onclick="editarDiagnostico('${x.id}')">Diagnóstico</button><button class="btn small danger" onclick="excluirTransferencia('${x.id}')">Excluir</button></td></tr>`).join("")}
  </tbody></table></div></div>`).join("") : `<div class="empty-state">Nenhuma transferência cadastrada.</div>`}
  </div>`;
}

function formTransferencia(id="") {
  const t=db.transferencias.find(x=>x.id===id)||{};
  modal(id?"Editar transferência de embrião":"Nova transferência de embrião",`
    <div class="form-grid">
      ${campo("Data","data",t.data||hoje(),"date")}
      ${select("Cliente","clienteId",clientesDisponiveisProfissional(),t.clienteId||"")}
      <div><label>Doadora</label><select name="doadoraId"><option value="">Selecione primeiro o cliente...</option></select></div>
      ${select("Touro","touroId",db.touros,t.touroId||"")}
      ${campo("Identificação da receptora","receptora",t.receptora||"")}
      ${select("Grau de qualidade do embrião D7","embriãoGrau",GRAUS_EMBRIOES_D7,t.embriãoGrau||"")}
      ${select("Estágio do embrião D7","embriãoEstagio",ESTAGIOS_EMBRIAO_D7,t.embriãoEstagio||"")}
      ${select("Destino","destino",DESTINOS_EMBRIAO,t.destino||"")}
      ${select("Diagnóstico","diagnostico",DIAGNOSTICOS,t.diagnostico||"Pendente")}
      ${campo("Data do diagnóstico","dataDiagnostico",t.dataDiagnostico||"","date")}
      ${campo("Observações","obs",t.obs||"")}
    </div><br><div class="note">O destino deve indicar se a transferência foi a fresco, DT, VT ou se o embrião foi descartado.</div><br>
    <button class="btn" onclick="salvarTransferencia('${id}')">Salvar transferência</button>`);
  document.querySelector('[name="clienteId"]').addEventListener('change',()=>atualizarDoadorasPorCliente("doadoraId",""));
  atualizarDoadorasPorCliente("doadoraId",t.doadoraId||"");
}

function salvarTransferencia(id="") {
  const get=n=>document.querySelector(`[name="${n}"]`).value.trim();
  if (!exigir(get("data"),"Informe a data da transferência.")) return;
  if (!exigir(get("clienteId"),"Selecione o cliente.")) return;
  const d=db.doadoras.find(x=>x.id===get("doadoraId"));
  if (!exigir(d && d.clienteId===get("clienteId"),"Selecione uma doadora pertencente ao cliente.")) return;
  if (!exigir(get("touroId"),"Selecione o touro.")) return;
  if (!exigir(get("receptora"),"Informe a receptora.")) return;
  if (!exigir(get("embriãoGrau"),"Selecione o grau D7.")) return;
  if (!exigir(get("embriãoEstagio"),"Selecione o estágio D7.")) return;
  if (!exigir(get("destino"),"Selecione o destino.")) return;
  if (get("diagnostico")!=="Pendente" && !exigir(get("dataDiagnostico"),"Informe a data do diagnóstico.")) return;
  const objeto={id:id||idNovo("TE",db.transferencias),data:get("data"),clienteId:get("clienteId"),doadoraId:get("doadoraId"),touroId:get("touroId"),receptora:get("receptora"),embriãoGrau:get("embriãoGrau"),embriãoEstagio:get("embriãoEstagio"),destino:get("destino"),diagnostico:get("diagnostico")||"Pendente",dataDiagnostico:get("dataDiagnostico"),obs:get("obs")};
  if(id){const atual=db.transferencias.find(x=>x.id===id);if(!atual)return;Object.assign(atual,objeto);delete atual.partida;}else db.transferencias.push(objeto);
  fecharModal(); salvarBanco();
}

// ============================================================
// EDITAR DIAGNÓSTICO
// ============================================================

function editarDiagnostico(
  id
) {

  const transferencia =
    db.transferencias.find(
      x =>
        x.id === id
    );


  if (!transferencia)
    return;


  modal(

    "Atualizar diagnóstico",

    `

      <div class="note">

        <strong>
          Cliente:
        </strong>

        ${esc(
      clienteNome(
        transferencia.clienteId
      )
    )}

        <br>

        <strong>
          Receptora:
        </strong>

        ${esc(
      transferencia.receptora
    )}

      </div>


      <br>


      ${select(
      "Novo diagnóstico",
      "diagnostico",
      DIAGNOSTICOS,
      transferencia.diagnostico
    )}


      ${campo(
      "Data do diagnóstico",
      "dataDiagnostico",
      transferencia.dataDiagnostico,
      "date"
    )}


      <br>


      <button
        class="btn"
        onclick="salvarDiagnostico('${id}')"
      >
        Atualizar diagnóstico
      </button>

    `

  );

}


function salvarDiagnostico(
  id
) {

  const transferencia =
    db.transferencias.find(
      x =>
        x.id === id
    );


  if (!transferencia)
    return;


  transferencia.diagnostico =
    document.querySelector(
      '[name="diagnostico"]'
    ).value;


  transferencia.dataDiagnostico =
    document.querySelector(
      '[name="dataDiagnostico"]'
    ).value;


  fecharModal();

  salvarBanco();

}


// ============================================================
// RELATÓRIOS POR CLIENTE E DATA
// ============================================================

function relatorios() {
  header("Relatórios por Cliente e Data", "Selecione o cliente e depois a data do procedimento");
  document.getElementById("content").innerHTML = `
    <div class="card">
      <h3>Selecionar cliente</h3>
      <p>Pesquise pelo nome ou CPF/CNPJ.</p>
      <div style="max-width:500px"><input id="buscaCliente" placeholder="Digite nome ou CPF/CNPJ" oninput="buscarClienteRelatorio()"></div>
      <div id="resultadoClientes" style="margin-top:15px"></div>
    </div>
    <div id="relatorioSelecionado" style="margin-top:20px"></div>`;
}

function buscarClienteRelatorio() {
  const termo=document.getElementById("buscaCliente").value.toLowerCase().trim();
  if(!termo){document.getElementById("resultadoClientes").innerHTML="";return;}
  const encontrados=db.clientes.filter(c=>(c.nome||"").toLowerCase().includes(termo)||String(c.cpf||"").toLowerCase().includes(termo));
  document.getElementById("resultadoClientes").innerHTML=encontrados.map(c=>`<div class="card"><strong>${esc(c.nome)}</strong><br>CPF/CNPJ: ${esc(c.cpf||"")}<br><br><button class="btn small" onclick="mostrarRelatoriosCliente('${c.id}')">Selecionar cliente</button></div>`).join("");
}

function datasCliente(clienteId, tipo) {
  const fonte=tipo==="producao"?db.producoes:tipo==="congelamento"?db.producoes.filter(x=>Number(x.congelados)>0):db.transferencias;
  return [...new Set(fonte.filter(x=>x.clienteId===clienteId && x.data).map(x=>x.data))].sort((a,b)=>b.localeCompare(a));
}

function opcoesDatas(clienteId,tipo){
  const datas=datasCliente(clienteId,tipo);
  return datas.length?datas.map(d=>`<option value="${esc(d)}">${esc(dataBR(d))}</option>`).join(""):`<option value="">Nenhuma data cadastrada</option>`;
}

function mostrarRelatoriosCliente(clienteId) {
  const cliente=db.clientes.find(x=>x.id===clienteId); if(!cliente)return;
  document.getElementById("relatorioSelecionado").innerHTML=`
    <div class="card"><h2>${esc(cliente.nome)}</h2><p>CPF/CNPJ: ${esc(cliente.cpf||"")}</p><hr>
      <div class="report-choice-grid">
        ${blocoEscolhaRelatorio(clienteId,"producao","Produção de Embriões")}
        ${blocoEscolhaRelatorio(clienteId,"congelamento","Congelamento de Embriões")}
        ${blocoEscolhaRelatorio(clienteId,"transferencia","Transferência de Embriões")}
      </div>
    </div>`;
}

function blocoEscolhaRelatorio(clienteId,tipo,titulo){
  const fn=tipo==="producao"?"relatorioProducao":tipo==="congelamento"?"relatorioCongelamento":"relatorioTransferencia";
  return `<div class="report-choice"><h3>${titulo}</h3><label>Data do relatório</label><select id="data_${tipo}">${opcoesDatas(clienteId,tipo)}</select><button class="btn" onclick="const d=document.getElementById('data_${tipo}').value;if(!d){alert('Selecione uma data.');return;} ${fn}('${clienteId}',d)">Gerar relatório do dia</button></div>`;
}

function totaisProducao(dados){
  const t={oocitos:0,oocitosViaveis:0,clivados:0,embriõesD7:0,transferidosFresco:0,transferidosDT:0,transferidosVT:0,congelados:0};
  dados.forEach(x=>Object.keys(t).forEach(k=>t[k]+=numeroNaoNegativo(x[k])));return t;
}

function observacoesUnicas(dados){return [...new Set(dados.map(x=>String(x.obs||"").trim()).filter(Boolean))].join(" | ");}

function abrirRelatorioFormatado(titulo,cliente,data,conteudo,orientacao="landscape"){
  modal(titulo,`<div class="report-actions"><button class="btn" onclick="imprimirRelatorio('${orientacao}')">Exportar em PDF</button></div><div id="reportPrintable" class="report-sheet ${orientacao}">${conteudo}</div>`);
}

function cabecalhoRelatorio(titulo,cliente,data,extra=""){
  return `<div class="report-header"><div class="report-brand">EmbrioGestor</div><div class="report-head-main"><h1>LABORATÓRIO DE REPRODUÇÃO ANIMAL</h1><div class="report-meta"><b>CLIENTE:</b><span>${esc(cliente.nome)}</span><b>DATA:</b><span>${esc(dataBR(data))}</span>${extra}</div></div></div><h2 class="report-title">${titulo}</h2>`;
}

function imprimirRelatorio(orientacao="landscape"){
  const el=document.getElementById("reportPrintable"); if(!el)return;
  const w=window.open("","_blank");
  const css=`@page{size:A4 ${orientacao};margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0}.report-sheet{width:100%}.report-header{display:flex;align-items:center;border-bottom:2px solid #7ea6c9;padding-bottom:7px;margin-bottom:8px}.report-brand{font-size:25px;font-weight:800;color:#2f75b5;width:22%}.report-head-main{width:78%}.report-head-main h1{font-size:16px;margin:0 0 7px}.report-meta{display:grid;grid-template-columns:70px 1fr 55px 150px;gap:3px 8px;font-size:10px}.report-title{text-align:center;font-size:15px;margin:8px 0}.report-table{width:100%;border-collapse:collapse;font-size:8px}.report-table th{background:#d9e8f5;font-weight:700}.report-table th,.report-table td{border:1px solid #9dbbd5;padding:3px;text-align:center}.report-table .total-row td{font-weight:700}.report-note{font-size:9px;margin:7px 0}.report-footer{text-align:center;font-size:8px;margin-top:10px;border-top:1px solid #bbb;padding-top:5px}.report-date-title{margin:12px 0 4px;padding:4px 6px;background:#eef5fb;border-left:3px solid #2f75b5;font-weight:700;font-size:9px}.report-grand-total{margin:10px 0;padding:7px;border:1px solid #9dbbd5;background:#f5f9fc;font-size:9px}.no-print{display:none}`;
  w.document.write(`<html><head><meta charset="utf-8"><title>${esc(document.title)} - Relatório</title><style>${css}</style></head><body>${el.outerHTML}<script>window.onload=()=>{setTimeout(()=>window.print(),200)}<\/script></body></html>`);
  w.document.close();
}

function relatorioProducao(clienteId,data) {
  const cliente=db.clientes.find(x=>x.id===clienteId); if(!cliente)return;
  const dados=db.producoes.filter(x=>x.clienteId===clienteId && x.data===data);
  const t=totaisProducao(dados);
  const linhas=dados.map((x,i)=>{const d=db.doadoras.find(a=>a.id===x.doadoraId);return `<tr><td>${i+1}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(d?.raca||"")}</td><td>${esc(touroNome(x.touroId))}</td><td>${numeroNaoNegativo(x.oocitos)}</td><td>${numeroNaoNegativo(x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.clivados)}</td><td>${percentual(x.clivados,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.embriõesD7)}</td><td>${percentual(x.embriõesD7,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.transferidosFresco)}</td><td>${numeroNaoNegativo(x.transferidosDT)}</td><td>${numeroNaoNegativo(x.transferidosVT)}</td><td>${numeroNaoNegativo(x.congelados)}</td><td>${esc(x.tipoCongelamento||"")}</td></tr>`}).join("");
  const conteudo=`${cabecalhoRelatorio("RELATÓRIO PRODUÇÃO IN VITRO DE EMBRIÕES",cliente,data)}<table class="report-table"><thead><tr><th>Nº</th><th>DOADORA</th><th>RAÇA</th><th>TOURO</th><th>OÓCITOS TOTAIS</th><th>OÓCITOS VIÁVEIS</th><th>CLIVAGEM</th><th>%CLIV</th><th>EMB. VIÁVEIS D7</th><th>%PROD</th><th>FRESCO</th><th>DT</th><th>VT</th><th>CONG.</th><th>TIPO</th></tr></thead><tbody>${linhas}<tr class="total-row"><td colspan="4">TOTAL</td><td>${t.oocitos}</td><td>${t.oocitosViaveis}</td><td>${t.clivados}</td><td>${percentual(t.clivados,t.oocitosViaveis)}</td><td>${t.embriõesD7}</td><td>${percentual(t.embriõesD7,t.oocitosViaveis)}</td><td>${t.transferidosFresco}</td><td>${t.transferidosDT}</td><td>${t.transferidosVT}</td><td>${t.congelados}</td><td></td></tr></tbody></table><div class="report-note"><b>OBS:</b> ${esc(observacoesUnicas(dados)||"-")}</div><div class="report-footer">EmbrioGestor - Relatório gerado por cliente e data</div>`;
  abrirRelatorioFormatado("Relatório de Produção",cliente,data,conteudo,"landscape");
}

function relatorioCongelamento(clienteId,data) {
  const cliente=db.clientes.find(x=>x.id===clienteId); if(!cliente)return;
  const dados=db.producoes.filter(x=>x.clienteId===clienteId && x.data===data && Number(x.congelados)>0);
  const total=dados.reduce((a,x)=>a+numeroNaoNegativo(x.congelados),0);
  const linhas=dados.map((x,i)=>{const d=db.doadoras.find(a=>a.id===x.doadoraId);return `<tr><td>${i+1}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(d?.raca||"")}</td><td>${esc(touroNome(x.touroId))}</td><td>${numeroNaoNegativo(x.embriõesD7)}</td><td>${numeroNaoNegativo(x.congelados)}</td><td>${esc(x.tipoCongelamento||"Não informado")}</td><td>${esc(x.obs||"")}</td></tr>`}).join("");
  const conteudo=`${cabecalhoRelatorio("RELATÓRIO DE CONGELAMENTO DE EMBRIÕES",cliente,data)}<table class="report-table"><thead><tr><th>Nº</th><th>DOADORA</th><th>RAÇA</th><th>TOURO</th><th>EMB. D7</th><th>CONGELADOS</th><th>TIPO</th><th>OBS</th></tr></thead><tbody>${linhas}<tr class="total-row"><td colspan="5">TOTAL CONGELADO</td><td>${total}</td><td colspan="2"></td></tr></tbody></table><div class="report-footer">EmbrioGestor - Relatório gerado por cliente e data</div>`;
  abrirRelatorioFormatado("Relatório de Congelamento",cliente,data,conteudo,"landscape");
}

function relatorioTransferencia(clienteId,data) {
  const cliente=db.clientes.find(x=>x.id===clienteId); if(!cliente)return;
  const dados=db.transferencias.filter(x=>x.clienteId===clienteId && x.data===data);
  const prenhes=dados.filter(x=>x.diagnostico==="Prenhe").length, vazias=dados.filter(x=>x.diagnostico==="Vazia").length;
  const linhas=dados.map((x,i)=>{const d=db.doadoras.find(a=>a.id===x.doadoraId);return `<tr><td>${i+1}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(d?.raca||"")}</td><td>${esc(x.embriãoGrau||"")}</td><td>${esc(x.embriãoEstagio||"")}</td><td>${esc(x.receptora||"")}</td><td>${esc(x.destino||"")}</td><td>${esc(x.diagnostico||"")}</td></tr>`}).join("");
  const pct=dados.length?Math.round(prenhes/dados.length*100):0;
  const conteudo=`${cabecalhoRelatorio("PLANILHA DE TRANSFERÊNCIA DE EMBRIÕES",cliente,data)}<table class="report-table"><thead><tr><th>Nº</th><th>DOADORA</th><th>TOURO</th><th>RAÇA</th><th>GRAU D7</th><th>ESTÁGIO D7</th><th>RECEPTORA</th><th>DESTINO</th><th>DIAGNÓSTICO PRENHEZ</th></tr></thead><tbody>${linhas}</tbody></table><table class="report-table report-summary"><tbody><tr><th>TOTAL DE ANIMAIS</th><th>PRENHAS</th><th>VAZIAS</th><th>% PRENHEZ</th></tr><tr><td>${dados.length}</td><td>${prenhes}</td><td>${vazias}</td><td>${pct}%</td></tr></tbody></table><div class="report-note"><b>OBSERVAÇÕES:</b> ${esc(observacoesUnicas(dados)||"-")}</div><div class="report-footer">EmbrioGestor - Relatório gerado por cliente e data</div>`;
  abrirRelatorioFormatado("Relatório de Transferência",cliente,data,conteudo,"landscape");
}

// ============================================================
// BACKUP
// ============================================================

function exportarBackup() {

  const arquivo =
    new Blob(

      [
        JSON.stringify(
          db,
          null,
          2
        )
      ],

      {
        type:
          "application/json"
      }

    );


  const url =
    URL.createObjectURL(
      arquivo
    );


  const a =
    document.createElement(
      "a"
    );


  a.href = url;

  a.download =
    "EmbrioGestor_Backup.json";

  a.click();


  URL.revokeObjectURL(
    url
  );

}


// ============================================================
// INICIALIZAÇÃO FINAL OCORRE NO FIM DO ARQUIVO
// ============================================================

// ============================================================
// V1.5 - ESTOQUE DE EMBRIÕES + DASHBOARD/RELATÓRIOS POR PERÍODO
// ============================================================

function touroRaca(id){ return db.touros.find(x=>x.id===id)?.raca || ""; }
function doadoraRaca(id){ return db.doadoras.find(x=>x.id===id)?.raca || ""; }

function periodoPadrao(tipo="dia") {
  const h=hoje();
  return {tipo, dia:h, mes:h.slice(0,7), ano:h.slice(0,4)};
}

function dataNoPeriodo(data,tipo,valor){
  if(!data || !valor) return false;
  if(tipo==="dia") return data===valor;
  if(tipo==="mes") return data.slice(0,7)===valor;
  if(tipo==="ano") return data.slice(0,4)===valor;
  return false;
}

function rotuloPeriodo(tipo,valor){
  if(tipo==="dia") return dataBR(valor);
  if(tipo==="mes"){
    const [a,m]=String(valor).split("-");
    const nomes=["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    return `${nomes[Number(m)]||m}/${a}`;
  }
  return String(valor||"");
}

function controlesPeriodo(prefixo, onAplicar){
  const h=hoje();
  return `<div class="period-filter card">
    <div class="period-filter-grid">
      <div><label>Período</label><select id="${prefixo}_tipo" onchange="atualizarControlePeriodo('${prefixo}')"><option value="dia">Dia</option><option value="mes">Mês</option><option value="ano">Ano</option></select></div>
      <div id="${prefixo}_dia_wrap"><label>Data</label><input id="${prefixo}_dia" type="date" value="${h}"></div>
      <div id="${prefixo}_mes_wrap" style="display:none"><label>Mês</label><input id="${prefixo}_mes" type="month" value="${h.slice(0,7)}"></div>
      <div id="${prefixo}_ano_wrap" style="display:none"><label>Ano</label><input id="${prefixo}_ano" type="number" min="2000" max="2100" value="${h.slice(0,4)}"></div>
      <div class="period-filter-action"><button class="btn" onclick="${onAplicar}">Aplicar filtro</button></div>
    </div>
  </div>`;
}

function atualizarControlePeriodo(prefixo){
  const tipo=document.getElementById(`${prefixo}_tipo`)?.value||"dia";
  ["dia","mes","ano"].forEach(t=>{const el=document.getElementById(`${prefixo}_${t}_wrap`);if(el)el.style.display=t===tipo?"":"none";});
}

function lerPeriodo(prefixo){
  const tipo=document.getElementById(`${prefixo}_tipo`)?.value||"dia";
  const valor=document.getElementById(`${prefixo}_${tipo}`)?.value||"";
  return {tipo,valor};
}

function estoqueEmbrioes(){
  header("Estoque de Embriões", "Embriões DT e VT separados por cliente e localização no botijão");
  const clientes=[...clientesDisponiveisProfissional()].sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
  const blocos=clientes.map(c=>{
    const itens=db.estoqueEmbrioes.filter(e=>e.clienteId===c.id);
    if(!itens.length) return "";
    const totalDT=itens.filter(e=>e.tipo==="DT").reduce((a,e)=>a+numeroNaoNegativo(e.quantidade),0);
    const totalVT=itens.filter(e=>e.tipo==="VT").reduce((a,e)=>a+numeroNaoNegativo(e.quantidade),0);
    return `<div class="date-group"><div class="date-group-title">${esc(c.nome)} — DT: ${totalDT} | VT: ${totalVT}</div>
      <div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Doadora</th><th>Raça doadora</th><th>Touro</th><th>Raça touro</th><th>Qtd.</th><th>Botijão</th><th>Caneca</th><th>Raque</th><th>Posição</th><th>Obs.</th><th>Ações</th></tr></thead><tbody>
      ${itens.map(e=>`<tr><td><strong>${esc(e.tipo)}</strong></td><td>${esc(doadoraNome(e.doadoraId))}</td><td>${esc(doadoraRaca(e.doadoraId))}</td><td>${esc(touroNome(e.touroId))}</td><td>${esc(touroRaca(e.touroId))}</td><td>${numeroNaoNegativo(e.quantidade)}</td><td>${esc(e.botijao)}</td><td>${esc(e.caneca)}</td><td>${esc(e.raque)}</td><td>${esc(e.posicao)}</td><td>${esc(e.obs||"")}</td><td><button class="btn small secondary" onclick="formEstoqueEmbriao('${e.id}')">Editar</button><button class="btn small danger" onclick="excluirEstoqueEmbriao('${e.id}')">Excluir</button></td></tr>`).join("")}
      </tbody></table></div></div>`;
  }).join("");
  document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><h3>Estoque por cliente</h3><button class="btn" onclick="formEstoqueEmbriao()">Novo estoque de embriões</button></div>${blocos||'<div class="empty-state">Nenhum embrião DT/VT em estoque.</div>'}</div>`;
}

function formEstoqueEmbriao(id=""){
  const e=db.estoqueEmbrioes.find(x=>x.id===id)||{};
  modal(id?"Editar estoque de embriões":"Novo estoque de embriões",`<div class="form-grid">
    ${select("Cliente","clienteId",clientesDisponiveisProfissional(),e.clienteId||"")}
    <div><label>Doadora</label><select name="doadoraId"><option value="">Selecione primeiro o cliente...</option></select></div>
    ${select("Touro","touroId",db.touros,e.touroId||"")}
    ${select("Tipo","tipo",["DT","VT"],e.tipo||"")}
    ${campo("Quantidade","quantidade",e.quantidade??"1","number")}
    ${campo("Botijão","botijao",e.botijao||"")}
    ${campo("Caneca","caneca",e.caneca||"")}
    ${campo("Raque","raque",e.raque||"")}
    ${campo("Posição","posicao",e.posicao||"")}
    ${campo("Observações","obs",e.obs||"")}
  </div><br><button class="btn" onclick="salvarEstoqueEmbriao('${id}')">Salvar</button>`);
  document.querySelector('[name="clienteId"]').addEventListener('change',()=>atualizarDoadorasPorCliente("doadoraId",""));
  atualizarDoadorasPorCliente("doadoraId",e.doadoraId||"");
}

function salvarEstoqueEmbriao(id=""){
  const get=n=>document.querySelector(`[name="${n}"]`)?.value.trim()||"";
  const q=Number(get("quantidade"));
  if(!exigir(get("clienteId"),"Selecione o cliente."))return;
  const d=db.doadoras.find(x=>x.id===get("doadoraId"));
  if(!exigir(d&&d.clienteId===get("clienteId"),"Selecione uma doadora pertencente ao cliente."))return;
  if(!exigir(get("touroId"),"Selecione o touro."))return;
  if(!exigir(["DT","VT"].includes(get("tipo")),"Selecione DT ou VT."))return;
  if(!exigir(Number.isInteger(q)&&q>0,"A quantidade deve ser um número inteiro maior que zero."))return;
  if(!exigir(get("botijao"),"Informe o botijão."))return;
  const obj={id:id||idNovo("EMB",db.estoqueEmbrioes),clienteId:get("clienteId"),doadoraId:get("doadoraId"),touroId:get("touroId"),tipo:get("tipo"),quantidade:q,botijao:get("botijao"),caneca:get("caneca"),raque:get("raque"),posicao:get("posicao"),obs:get("obs")};
  if(id){const atual=db.estoqueEmbrioes.find(x=>x.id===id);if(!atual)return;Object.assign(atual,obj);}else db.estoqueEmbrioes.push(obj);
  fecharModal();salvarBanco();
}

function excluirEstoqueEmbriao(id){
  if(!confirmarExclusao("Excluir este registro do estoque de embriões?"))return;
  db.estoqueEmbrioes=db.estoqueEmbrioes.filter(x=>x.id!==id);salvarBanco();
}

// Dashboard v1.5 com período Dia/Mês/Ano.
function dashboard(){
  header("Dashboard","Indicadores por dia, mês ou ano");
  document.getElementById("content").innerHTML=controlesPeriodo("dash","aplicarDashboard()")+`<div id="dashboardResultado"></div>`;
  aplicarDashboard();
}

function aplicarDashboard(){
  const {tipo,valor}=lerPeriodo("dash");
  if(!valor)return;
  const asp=db.aspiracoes.filter(x=>dataNoPeriodo(x.data,tipo,valor));
  const prod=db.producoes.filter(x=>dataNoPeriodo(x.data,tipo,valor));
  const te=db.transferencias.filter(x=>dataNoPeriodo(x.data,tipo,valor));
  const oocitos=asp.reduce((a,x)=>a+numeroNaoNegativo(x.oocitos),0);
  const embrioes=prod.reduce((a,x)=>a+numeroNaoNegativo(x.embriõesD7),0);
  const fresco=prod.reduce((a,x)=>a+numeroNaoNegativo(x.transferidosFresco),0);
  const dt=prod.reduce((a,x)=>a+numeroNaoNegativo(x.transferidosDT),0);
  const vt=prod.reduce((a,x)=>a+numeroNaoNegativo(x.transferidosVT),0);
  const cong=prod.reduce((a,x)=>a+numeroNaoNegativo(x.congelados),0);
  const doses=db.estoque.reduce((a,x)=>a+numeroNaoNegativo(x.saldo),0);
  const embEstoque=db.estoqueEmbrioes.reduce((a,x)=>a+numeroNaoNegativo(x.quantidade),0);
  document.getElementById("dashboardResultado").innerHTML=`<div class="filter-summary">Período: <strong>${esc(rotuloPeriodo(tipo,valor))}</strong></div><div class="grid kpis">
    <div class="card"><strong>OPUs</strong><h2>${asp.length}</h2></div>
    <div class="card"><strong>Oócitos coletados</strong><h2>${oocitos}</h2></div>
    <div class="card"><strong>Embriões D7</strong><h2>${embrioes}</h2></div>
    <div class="card"><strong>Fresco</strong><h2>${fresco}</h2></div>
    <div class="card"><strong>DT</strong><h2>${dt}</h2></div>
    <div class="card"><strong>VT</strong><h2>${vt}</h2></div>
    <div class="card"><strong>Congelados</strong><h2>${cong}</h2></div>
    <div class="card"><strong>Transferências</strong><h2>${te.length}</h2></div>
    <div class="card"><strong>Estoque sêmen</strong><h2>${doses}</h2></div>
    <div class="card"><strong>Estoque embriões DT/VT</strong><h2>${embEstoque}</h2></div>
  </div>`;
}

function relatorios(){
  header("Relatórios por Cliente e Período","Gere relatórios diários, mensais ou anuais, sempre separados internamente por data");
  document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><h3>Localizar cliente</h3></div><div class="client-filter"><input id="buscaClienteRel" placeholder="Digite o nome do cliente ou CPF/CNPJ" oninput="buscarClienteRelatorio()"></div><div id="resultadoClientes"></div></div><div id="relatorioSelecionado" style="margin-top:20px"></div>`;
}

function mostrarRelatoriosCliente(clienteId){
  const cliente=db.clientes.find(x=>x.id===clienteId);if(!cliente)return;
  document.getElementById("relatorioSelecionado").innerHTML=`<div class="card"><h2>${esc(cliente.nome)}</h2><p>CPF/CNPJ: ${esc(cliente.cpf||"")}</p><hr><div class="report-choice-grid">
    ${blocoPeriodoRelatorio(clienteId,"producao","Produção de Embriões")}
    ${blocoPeriodoRelatorio(clienteId,"congelamento","Congelamento de Embriões")}
    ${blocoPeriodoRelatorio(clienteId,"transferencia","Transferência de Embriões")}
    ${blocoEstoqueCliente(clienteId)}
  </div></div>`;
}

function blocoPeriodoRelatorio(clienteId,tipo,titulo){
  const h=hoje();
  return `<div class="report-choice"><h3>${titulo}</h3>
    <label>Período</label><select id="rel_${tipo}_tipo" onchange="atualizarPeriodoRel('${tipo}')"><option value="dia">Dia</option><option value="mes">Mês</option><option value="ano">Ano</option></select>
    <div id="rel_${tipo}_dia_wrap"><label>Data</label><input id="rel_${tipo}_dia" type="date" value="${h}"></div>
    <div id="rel_${tipo}_mes_wrap" style="display:none"><label>Mês</label><input id="rel_${tipo}_mes" type="month" value="${h.slice(0,7)}"></div>
    <div id="rel_${tipo}_ano_wrap" style="display:none"><label>Ano</label><input id="rel_${tipo}_ano" type="number" min="2000" max="2100" value="${h.slice(0,4)}"></div>
    <label>Observação do relatório</label>

<textarea
  id="rel_${tipo}_obs"
  rows="4"
  placeholder="Digite uma observação para este relatório..."
  style="width:100%; resize:vertical;"
></textarea>
    <button class="btn" onclick="gerarRelatorioPeriodo('${clienteId}','${tipo}')">Gerar relatório</button></div>`;
}

function atualizarPeriodoRel(tipo){
  const t=document.getElementById(`rel_${tipo}_tipo`)?.value||"dia";
  ["dia","mes","ano"].forEach(k=>{const el=document.getElementById(`rel_${tipo}_${k}_wrap`);if(el)el.style.display=k===t?"":"none";});
}

function gerarRelatorioPeriodo(clienteId,tipo){
  const periodoTipo=document.getElementById(`rel_${tipo}_tipo`)?.value||"dia";
  const valor=document.getElementById(`rel_${tipo}_${periodoTipo}`)?.value||"";
  const observacaoRelatorio =
  document.getElementById(`rel_${tipo}_obs`)?.value.trim() || "";
  if(!valor){alert("Informe o período.");return;}
  if(tipo==="producao")
  relatorioProducao(clienteId,valor,periodoTipo,observacaoRelatorio);

else if(tipo==="congelamento")
  relatorioCongelamento(clienteId,valor,periodoTipo,observacaoRelatorio);

else
  relatorioTransferencia(clienteId,valor,periodoTipo,observacaoRelatorio);
}

function blocoEstoqueCliente(clienteId){
  return `<div class="report-choice"><h3>Posição de Estoques</h3><p>Visualize o estoque atual de sêmen e de embriões DT/VT deste cliente, incluindo localização.</p><button class="btn" onclick="relatorioEstoquesCliente('${clienteId}')">Abrir posição de estoques</button></div>`;
}

function cabecalhoRelatorioPeriodo(titulo,cliente,tipo,valor){
  return `<div class="report-header"><div class="report-brand">EmbrioGestor</div><div class="report-head-main"><h1>LABORATÓRIO DE REPRODUÇÃO ANIMAL</h1><div class="report-meta"><b>CLIENTE:</b><span>${esc(cliente.nome)}</span><b>PERÍODO:</b><span>${esc(rotuloPeriodo(tipo,valor))}</span></div></div></div><h2 class="report-title">${titulo}</h2>`;
}

function grupoRelatorioPorData(dados,renderTabela){
  const grupos=agruparPorData(dados);
  return Object.entries(grupos).map(([data,itens])=>`<div class="report-date-title">DATA: ${esc(dataBR(data))}</div>${renderTabela(itens,data)}`).join("");
}

function relatorioProducao(clienteId,valor,tipo="dia",observacaoRelatorio=""){
  const cliente=db.clientes.find(x=>x.id===clienteId);if(!cliente)return;
  const dados=db.producoes.filter(x=>x.clienteId===clienteId&&dataNoPeriodo(x.data,tipo,valor));
  if(!dados.length){alert("Não há produção cadastrada para este cliente no período selecionado.");return;}
  const corpo=grupoRelatorioPorData(dados,(itens)=>{const t=totaisProducao(itens);const linhas=itens.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(doadoraRaca(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${numeroNaoNegativo(x.oocitos)}</td><td>${numeroNaoNegativo(x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.clivados)}</td><td>${percentual(x.clivados,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.embriõesD7)}</td><td>${percentual(x.embriõesD7,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.transferidosFresco)}</td><td>${numeroNaoNegativo(x.transferidosDT)}</td><td>${numeroNaoNegativo(x.transferidosVT)}</td><td>${numeroNaoNegativo(x.congelados)}</td><td>${esc(x.tipoCongelamento||"")}</td></tr>`).join("");return `<table class="report-table"><thead><tr><th>Nº</th><th>DOADORA</th><th>RAÇA DOADORA</th><th>TOURO</th><th>RAÇA TOURO</th><th>OÓCITOS TOTAIS</th><th>OÓCITOS VIÁVEIS</th><th>CLIVAGEM</th><th>%CLIV</th><th>EMB. D7</th><th>%PROD</th><th>FRESCO</th><th>DT</th><th>VT</th><th>CONG.</th><th>TIPO</th></tr></thead><tbody>${linhas}<tr class="total-row"><td colspan="5">TOTAL DO DIA</td><td>${t.oocitos}</td><td>${t.oocitosViaveis}</td><td>${t.clivados}</td><td>${percentual(t.clivados,t.oocitosViaveis)}</td><td>${t.embriõesD7}</td><td>${percentual(t.embriõesD7,t.oocitosViaveis)}</td><td>${t.transferidosFresco}</td><td>${t.transferidosDT}</td><td>${t.transferidosVT}</td><td>${t.congelados}</td><td></td></tr></tbody></table><div class="report-note"><b>OBS:</b> ${esc(observacoesUnicas(itens)||"-")}</div>`;});
  const totalG=totaisProducao(dados);
  const conteudo=`${cabecalhoRelatorioPeriodo("RELATÓRIO PRODUÇÃO IN VITRO DE EMBRIÕES",cliente,tipo,valor)}${corpo}<div class="report-grand-total"><b>TOTAL DO PERÍODO:</b> Oócitos ${totalG.oocitos} | Viáveis ${totalG.oocitosViaveis} | Clivados ${totalG.clivados} | Embriões D7 ${totalG.embriõesD7} | Fresco ${totalG.transferidosFresco} | DT ${totalG.transferidosDT} | VT ${totalG.transferidosVT} | Congelados ${totalG.congelados}</div><div ${observacaoRelatorio
  ? `<div class="report-note"><b>OBSERVAÇÃO DO RELATÓRIO:</b> ${esc(observacaoRelatorio)}</div>`
  : ""
                                                                                                                                                                                                                                                                                                                                                                                                                                                         }
  class="report-footer">EmbrioGestor - Relatório por cliente e período, dividido por data</div>`;
  abrirRelatorioFormatado("Relatório de Produção",cliente,valor,conteudo,"landscape");
}

function relatorioCongelamento(clienteId,valor,tipo="dia",observacaoRelatorio=""){
  const cliente=db.clientes.find(x=>x.id===clienteId);if(!cliente)return;
  const dados=db.producoes.filter(x=>x.clienteId===clienteId&&numeroNaoNegativo(x.congelados)>0&&dataNoPeriodo(x.data,tipo,valor));
  if(!dados.length){alert("Não há congelamentos cadastrados para este cliente no período selecionado.");return;}
  const corpo=grupoRelatorioPorData(dados,(itens)=>{const total=itens.reduce((a,x)=>a+numeroNaoNegativo(x.congelados),0);const linhas=itens.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(doadoraRaca(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${numeroNaoNegativo(x.embriõesD7)}</td><td>${numeroNaoNegativo(x.congelados)}</td><td>${esc(x.tipoCongelamento||"Não informado")}</td><td>${esc(x.obs||"")}</td></tr>`).join("");return `<table class="report-table"><thead><tr><th>Nº</th><th>DOADORA</th><th>RAÇA DOADORA</th><th>TOURO</th><th>RAÇA TOURO</th><th>EMB. D7</th><th>CONGELADOS</th><th>TIPO</th><th>OBS</th></tr></thead><tbody>${linhas}<tr class="total-row"><td colspan="6">TOTAL DO DIA</td><td>${total}</td><td colspan="2"></td></tr></tbody></table>`;});
  const total=dados.reduce((a,x)=>a+numeroNaoNegativo(x.congelados),0);
  const conteudo=`${cabecalhoRelatorioPeriodo("RELATÓRIO DE CONGELAMENTO DE EMBRIÕES",cliente,tipo,valor)}${corpo}<div class="report-grand-total"><b>TOTAL CONGELADO NO PERÍODO:</b> ${total}</div><div ${observacaoRelatorio
  ? `<div class="report-note"><b>OBSERVAÇÃO DO RELATÓRIO:</b> ${esc(observacaoRelatorio)}</div>`
  : ""
} 
  class="report-footer">EmbrioGestor - Relatório por cliente e período, dividido por data</div>`;
  abrirRelatorioFormatado("Relatório de Congelamento",cliente,valor,conteudo,"landscape");
}

function relatorioTransferencia(clienteId,valor,tipo="dia",observacaoRelatorio=""){
  const cliente=db.clientes.find(x=>x.id===clienteId);if(!cliente)return;
  const dados=db.transferencias.filter(x=>x.clienteId===clienteId&&dataNoPeriodo(x.data,tipo,valor));
  if(!dados.length){alert("Não há transferências cadastradas para este cliente no período selecionado.");return;}
  const corpo=grupoRelatorioPorData(dados,(itens)=>{const prenhes=itens.filter(x=>x.diagnostico==="Prenhe").length,vazias=itens.filter(x=>x.diagnostico==="Vazia").length,pct=itens.length?Math.round(prenhes/itens.length*100):0;const linhas=itens.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(doadoraRaca(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${esc(x.embriãoGrau||"")}</td><td>${esc(x.embriãoEstagio||"")}</td><td>${esc(x.receptora||"")}</td><td>${esc(x.destino||"")}</td><td>${esc(x.diagnostico||"")}</td></tr>`).join("");return `<table class="report-table"><thead><tr><th>Nº</th><th>DOADORA</th><th>RAÇA DOADORA</th><th>TOURO</th><th>RAÇA TOURO</th><th>GRAU D7</th><th>ESTÁGIO D7</th><th>RECEPTORA</th><th>DESTINO</th><th>DIAGNÓSTICO</th></tr></thead><tbody>${linhas}</tbody></table><table class="report-table report-summary"><tbody><tr><th>TOTAL</th><th>PRENHAS</th><th>VAZIAS</th><th>% PRENHEZ</th></tr><tr><td>${itens.length}</td><td>${prenhes}</td><td>${vazias}</td><td>${pct}%</td></tr></tbody></table><div class="report-note"><b>OBSERVAÇÕES:</b> ${esc(observacoesUnicas(itens)||"-")}</div>`;});
  const prenhes=dados.filter(x=>x.diagnostico==="Prenhe").length,vazias=dados.filter(x=>x.diagnostico==="Vazia").length,pct=dados.length?Math.round(prenhes/dados.length*100):0;
  const conteudo=`${cabecalhoRelatorioPeriodo("PLANILHA DE TRANSFERÊNCIA DE EMBRIÕES",cliente,tipo,valor)}${corpo}<div class="report-grand-total"><b>TOTAL DO PERÍODO:</b> ${dados.length} transferências | ${prenhes} prenhas | ${vazias} vazias | ${pct}% prenhez</div><div ${observacaoRelatorio
  ? `<div class="report-note"><b>OBSERVAÇÃO DO RELATÓRIO:</b> ${esc(observacaoRelatorio)}</div>`
  : ""
}
  class="report-footer">EmbrioGestor - Relatório por cliente e período, dividido por data</div>`;
  abrirRelatorioFormatado("Relatório de Transferência",cliente,valor,conteudo,"landscape");
}

function relatorioEstoquesCliente(clienteId){
  const cliente=db.clientes.find(x=>x.id===clienteId);if(!cliente)return;
  const semen=db.estoque.filter(x=>x.clienteId===clienteId);
  const emb=db.estoqueEmbrioes.filter(x=>x.clienteId===clienteId);
  const linhasS=semen.map(x=>`<tr><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${esc(x.central||"")}</td><td>${esc(x.partida||"")}</td><td>${numeroNaoNegativo(x.quantidade)}</td><td>${numeroNaoNegativo(x.usadas)}</td><td>${numeroNaoNegativo(x.saldo)}</td><td>${esc(x.recipienteTipo||"")}</td><td>${esc(x.recipiente||"")}</td></tr>`).join("")||'<tr><td colspan="9">Sem estoque de sêmen cadastrado.</td></tr>';
  const linhasE=emb.map(x=>`<tr><td>${esc(x.tipo)}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(doadoraRaca(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${numeroNaoNegativo(x.quantidade)}</td><td>${esc(x.botijao)}</td><td>${esc(x.caneca)}</td><td>${esc(x.raque)}</td><td>${esc(x.posicao)}</td></tr>`).join("")||'<tr><td colspan="10">Sem estoque de embriões cadastrado.</td></tr>';
  const conteudo=`${cabecalhoRelatorioPeriodo("POSIÇÃO DE ESTOQUES",cliente,"dia",hoje())}<h3>ESTOQUE DE SÊMEN</h3><table class="report-table"><thead><tr><th>TOURO</th><th>RAÇA</th><th>CENTRAL</th><th>PARTIDA/LOTE</th><th>QUANTIDADE</th><th>USADAS</th><th>SALDO</th><th>RECIPIENTE</th><th>LOCALIZAÇÃO</th></tr></thead><tbody>${linhasS}</tbody></table><h3 style="margin-top:14px">ESTOQUE DE EMBRIÕES DT / VT</h3><table class="report-table"><thead><tr><th>TIPO</th><th>DOADORA</th><th>RAÇA DOADORA</th><th>TOURO</th><th>RAÇA TOURO</th><th>QTD.</th><th>BOTIJÃO</th><th>CANECA</th><th>RAQUE</th><th>POSIÇÃO</th></tr></thead><tbody>${linhasE}</tbody></table><div class="report-footer">EmbrioGestor - Posição atual de estoques por cliente</div>`;
  abrirRelatorioFormatado("Posição de Estoques",cliente,hoje(),conteudo,"landscape");
}

// Estoque de sêmen v1.5: visualização agrupada por cliente.
function estoque(){
  header("Estoque de Sêmen","Estoque de sêmen separado por cliente");
  const clientes=[...clientesDisponiveisProfissional()].sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
  const blocos=clientes.map(c=>{
    const itens=db.estoque.filter(e=>e.clienteId===c.id);
    if(!itens.length)return "";
    const saldo=itens.reduce((a,e)=>a+numeroNaoNegativo(e.saldo),0);
    return `<div class="date-group"><div class="date-group-title">${esc(c.nome)} — Saldo total: ${saldo} doses</div><div class="table-wrap"><table><thead><tr><th>Touro</th><th>Raça</th><th>Central</th><th>Partida / lote</th><th>Quantidade</th><th>Usadas</th><th>Saldo</th><th>Recipiente</th><th>Localização</th><th>Observações</th><th>Ações</th></tr></thead><tbody>${itens.map(x=>`<tr><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${esc(x.central)}</td><td>${esc(x.partida)}</td><td>${numeroNaoNegativo(x.quantidade)}</td><td>${numeroNaoNegativo(x.usadas)}</td><td><strong>${numeroNaoNegativo(x.saldo)}</strong></td><td>${esc(x.recipienteTipo)}</td><td>${esc(x.recipiente)}</td><td>${esc(x.obs)}</td><td><button class="btn small secondary" onclick="formEstoque('${x.id}')">Editar</button><button class="btn small danger" onclick="excluirEstoque('${x.id}')">Excluir</button></td></tr>`).join("")}</tbody></table></div></div>`;
  }).join("");
  document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><h3>Estoque de Sêmen</h3><button class="btn" onclick="formEstoque()">Nova entrada</button></div>${blocos||'<div class="empty-state">Nenhum estoque de sêmen cadastrado.</div>'}</div>`;
}


// ============================================================
// V1.6 — FILTRO GLOBAL, ESTOQUES AUTOMÁTICOS E RELATÓRIOS
// ============================================================

const LOGO_SEMINNA_DATA = "data:image/png;base64,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";
let filtroGlobal = (()=>{try{return JSON.parse(localStorage.getItem("embriogestor_filtro_global")||"null")||{tipo:"dia",valor:hoje()}}catch{return {tipo:"dia",valor:hoje()}}})();

function salvarFiltroGlobal(tipo,valor){
  filtroGlobal={tipo,valor};
  localStorage.setItem("embriogestor_filtro_global",JSON.stringify(filtroGlobal));
}
function noFiltroGlobal(data){return dataNoPeriodo(data,filtroGlobal.tipo,filtroGlobal.valor);}
function resumoFiltroGlobal(){return rotuloPeriodo(filtroGlobal.tipo,filtroGlobal.valor);}
function listaNoPeriodo(lista){return (lista||[]).filter(x=>noFiltroGlobal(x.data));}

// Todo estoque seminal passa a usar CANECA como recipiente.
db.estoque.forEach(e=>{e.recipienteTipo="CANECA";});

function sincronizarEstoqueEmbrioesProducao(prod){
  if(!prod) return;
  const tipos=[['DT',numeroNaoNegativo(prod.congeladosDT ?? prod.transferidosDT)],['VT',numeroNaoNegativo(prod.congeladosVT ?? prod.transferidosVT)]];
  tipos.forEach(([tipo,qtd])=>{
    let item=db.estoqueEmbrioes.find(e=>e.origemProducaoId===prod.id && e.tipo===tipo);
    if(qtd>0){
      if(item){
        Object.assign(item,{clienteId:prod.clienteId,doadoraId:prod.doadoraId,touroId:prod.touroId,quantidade:qtd,data:prod.data,origem:"Produção automática"});
      }else{
        db.estoqueEmbrioes.push({id:idNovo("EMB",db.estoqueEmbrioes),origemProducaoId:prod.id,origem:"Produção automática",data:prod.data,clienteId:prod.clienteId,doadoraId:prod.doadoraId,touroId:prod.touroId,tipo,quantidade:qtd,botijao:"",caneca:"",raque:"",posicao:"",obs:"Gerado automaticamente pela produção. Informe a localização."});
      }
    }else if(item){
      db.estoqueEmbrioes=db.estoqueEmbrioes.filter(e=>e.id!==item.id);
    }
  });
}
function sincronizarTodosEstoquesEmbrioes(){(db.producoes||[]).forEach(sincronizarEstoqueEmbrioesProducao);}
sincronizarTodosEstoquesEmbrioes();
localStorage.setItem(DB_KEY,JSON.stringify(db));

function excluirProducao(id){
  if(!confirmarExclusao("Excluir esta produção? O estoque de embriões DT/VT gerado automaticamente por ela também será removido."))return;
  db.producoes=db.producoes.filter(x=>x.id!==id);
  db.estoqueEmbrioes=db.estoqueEmbrioes.filter(x=>x.origemProducaoId!==id);
  salvarBanco();
}

function dashboard(){
  header("Dashboard","O período selecionado aqui é aplicado em todo o sistema");
  const h=filtroGlobal.valor||hoje();
  document.getElementById("content").innerHTML=controlesPeriodo("dash","aplicarDashboard()")+`<div class="filter-summary global-filter-banner">Filtro ativo em todo o sistema: <strong>${esc(resumoFiltroGlobal())}</strong></div><div id="dashboardResultado"></div>`;
  const tipoEl=document.getElementById('dash_tipo'); if(tipoEl) tipoEl.value=filtroGlobal.tipo;
  ['dia','mes','ano'].forEach(t=>{const el=document.getElementById(`dash_${t}`);if(el && filtroGlobal.tipo===t) el.value=filtroGlobal.valor;});
  atualizarControlePeriodo('dash');
  aplicarDashboard(false);
}
function aplicarDashboard(persistir=true){
  const {tipo,valor}=lerPeriodo("dash"); if(!valor)return;
  if(persistir) salvarFiltroGlobal(tipo,valor);
  const asp=db.aspiracoes.filter(x=>dataNoPeriodo(x.data,tipo,valor));
  const prod=db.producoes.filter(x=>dataNoPeriodo(x.data,tipo,valor));
  const te=db.transferencias.filter(x=>dataNoPeriodo(x.data,tipo,valor));
  const oocitos=asp.reduce((a,x)=>a+numeroNaoNegativo(x.oocitos),0), embrioes=prod.reduce((a,x)=>a+numeroNaoNegativo(x.embriõesD7),0);
  const fresco=prod.reduce((a,x)=>a+numeroNaoNegativo(x.transferidosFresco),0),dt=prod.reduce((a,x)=>a+numeroNaoNegativo(x.congeladosDT??x.transferidosDT),0),vt=prod.reduce((a,x)=>a+numeroNaoNegativo(x.congeladosVT??x.transferidosVT),0);
  const doses=db.estoque.reduce((a,x)=>a+numeroNaoNegativo(x.saldo),0),embEstoque=db.estoqueEmbrioes.reduce((a,x)=>a+numeroNaoNegativo(x.quantidade),0);
  const out=document.getElementById("dashboardResultado"); if(!out)return;
  out.innerHTML=`<div class="filter-summary">Período: <strong>${esc(rotuloPeriodo(tipo,valor))}</strong></div><div class="grid kpis">
    <div class="card"><strong>OPUs</strong><h2>${asp.length}</h2></div><div class="card"><strong>Oócitos coletados</strong><h2>${oocitos}</h2></div><div class="card"><strong>Embriões D7</strong><h2>${embrioes}</h2></div><div class="card"><strong>Transferidos a fresco</strong><h2>${fresco}</h2></div><div class="card"><strong>Congelados DT</strong><h2>${dt}</h2></div><div class="card"><strong>Congelados VT</strong><h2>${vt}</h2></div><div class="card"><strong>Transferências</strong><h2>${te.length}</h2></div><div class="card"><strong>Estoque sêmen</strong><h2>${doses}</h2></div><div class="card"><strong>Estoque embriões DT/VT</strong><h2>${embEstoque}</h2></div></div>`;
}

function aspiracoes(){
  header("Aspiração de Oócitos",`Filtro global: ${resumoFiltroGlobal()}`); const lista=listaNoPeriodo(db.aspiracoes);
  document.getElementById("content").innerHTML=`<div class="global-filter-banner">Mostrando: <strong>${esc(resumoFiltroGlobal())}</strong></div><div class="card"><div class="section-title"><h3>Aspiração de Oócitos / OPU</h3><button class="btn" onclick="formAspiracao()">Nova aspiração</button></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Doadora</th><th>Raça</th><th>Oócitos</th><th>G1</th><th>G2</th><th>G3</th><th>G4</th><th>G5</th><th>Touro</th><th>Ações</th></tr></thead><tbody>${lista.map(x=>{const d=db.doadoras.find(a=>a.id===x.doadoraId);return `<tr><td>${esc(dataBR(x.data))}</td><td>${esc(clienteNome(x.clienteId))}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(d?.raca||"")}</td><td><strong>${numeroNaoNegativo(x.oocitos)}</strong></td><td>${numeroNaoNegativo(x.grau1)}</td><td>${numeroNaoNegativo(x.grau2)}</td><td>${numeroNaoNegativo(x.grau3)}</td><td>${numeroNaoNegativo(x.grau4)}</td><td>${numeroNaoNegativo(x.grau5)}</td><td>${esc(touroNome(x.touroId))}</td><td><button class="btn small secondary" onclick="formAspiracao('${x.id}')">Editar</button><button class="btn small danger" onclick="excluirAspiracao('${x.id}')">Excluir</button></td></tr>`}).join("")||'<tr><td colspan="12">Nenhum registro no período selecionado.</td></tr>'}</tbody></table></div></div>`;
}

function producoes(){
  header("Produção de Embriões",`Filtro global: ${resumoFiltroGlobal()}`); const grupos=agruparPorData(listaNoPeriodo(db.producoes));
  document.getElementById("content").innerHTML=`<div class="global-filter-banner">Mostrando: <strong>${esc(resumoFiltroGlobal())}</strong></div><div class="card"><div class="section-title"><h3>Produção de Embriões</h3><button class="btn" onclick="formProducao()">Nova produção</button></div>${Object.keys(grupos).length?Object.entries(grupos).map(([data,itens])=>`<div class="date-group"><div class="date-group-title">${esc(dataBR(data))}</div><div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Doadora</th><th>Touro</th><th>Oócitos</th><th>Viáveis</th><th>Clivados</th><th>% Cliv.</th><th>Embriões D7</th><th>% Prod.</th><th>Fresco</th><th>Cong. DT</th><th>Cong. VT</th><th>Total congelado</th><th>Ações</th></tr></thead><tbody>${itens.map(x=>{const dt=numeroNaoNegativo(x.congeladosDT??x.transferidosDT),vt=numeroNaoNegativo(x.congeladosVT??x.transferidosVT);return `<tr><td>${esc(clienteNome(x.clienteId))}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${numeroNaoNegativo(x.oocitos)}</td><td>${numeroNaoNegativo(x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.clivados)}</td><td>${percentual(x.clivados,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.embriõesD7)}</td><td>${percentual(x.embriõesD7,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.transferidosFresco)}</td><td>${dt}</td><td>${vt}</td><td><strong>${dt+vt}</strong></td><td><button class="btn small secondary" onclick="formProducao('${x.id}')">Editar</button><button class="btn small danger" onclick="excluirProducao('${x.id}')">Excluir</button></td></tr>`}).join("")}</tbody></table></div></div>`).join(""):'<div class="empty-state">Nenhuma produção no período selecionado.</div>'}</div>`;
}
function formProducao(id=""){
  const p=db.producoes.find(x=>x.id===id)||{}; const dt=p.congeladosDT??p.transferidosDT??0,vt=p.congeladosVT??p.transferidosVT??0;
  modal(id?"Editar produção de embriões":"Nova produção de embriões",`<div class="form-grid">${campo("Data","data",p.data||filtroGlobal.valor||hoje(),"date")}${select("Cliente","clienteId",clientesDisponiveisProfissional(),p.clienteId||"")}<div><label>Doadora</label><select name="doadoraId"><option value="">Selecione primeiro o cliente...</option></select></div>${select("Touro","touroId",db.touros,p.touroId||"")}${campo("Oócitos totais","oocitos",p.oocitos??0,"number")}${campo("Oócitos viáveis","oocitosViaveis",p.oocitosViaveis??0,"number")}${campo("Clivados","clivados",p.clivados??0,"number")}${campo("Embriões viáveis no D7","embriõesD7",p.embriõesD7??0,"number")}${campo("Embriões transferidos a fresco","transferidosFresco",p.transferidosFresco??0,"number")}${campo("Embriões congelados DT","congeladosDT",dt,"number")}${campo("Embriões congelados VT","congeladosVT",vt,"number")}${campo("Observações","obs",p.obs||"")}</div><br><div class="note"><strong>Estoque automático:</strong> ao salvar, os embriões DT e VT entram automaticamente no Estoque de Embriões. Depois, informe Botijão, Caneca, Raque e Posição no estoque.</div><br><button class="btn" onclick="salvarProducao('${id}')">Salvar produção</button>`);
  document.querySelector('[name="clienteId"]').addEventListener('change',()=>atualizarDoadorasPorCliente("doadoraId","")); atualizarDoadorasPorCliente("doadoraId",p.doadoraId||"");
}
function salvarProducao(id=""){
  const get=n=>document.querySelector(`[name="${n}"]`)?.value.trim()||""; const ks=["oocitos","oocitosViaveis","clivados","embriõesD7","transferidosFresco","congeladosDT","congeladosVT"],n={};ks.forEach(k=>n[k]=Number(get(k)));
  if(!exigir(get("data"),"Informe a data da produção."))return;if(!exigir(get("clienteId"),"Selecione o cliente."))return;const d=db.doadoras.find(x=>x.id===get("doadoraId"));if(!exigir(d&&d.clienteId===get("clienteId"),"Selecione uma doadora pertencente ao cliente."))return;if(!exigir(get("touroId"),"Selecione o touro."))return;if(!exigir(ks.every(k=>Number.isInteger(n[k])&&n[k]>=0),"As quantidades devem ser números inteiros não negativos."))return;if(!exigir(n.oocitosViaveis<=n.oocitos,"Oócitos viáveis não podem superar o total de oócitos."))return;if(!exigir(n.clivados<=n.oocitosViaveis,"Clivados não podem superar os oócitos viáveis."))return;if(!exigir(n.embriõesD7<=n.clivados,"Embriões D7 não podem superar os clivados."))return;
  if(!exigir(n.transferidosFresco+n.congeladosDT+n.congeladosVT<=n.embriõesD7,"Fresco + congelados DT + congelados VT não podem superar os embriões D7."))return;
  const obj={id:id||idNovo("PROD",db.producoes),data:get("data"),clienteId:get("clienteId"),doadoraId:get("doadoraId"),touroId:get("touroId"),...n,transferidosDT:n.congeladosDT,transferidosVT:n.congeladosVT,congelados:n.congeladosDT+n.congeladosVT,tipoCongelamento:n.congeladosDT&&n.congeladosVT?"DT + VT":n.congeladosDT?"DT":n.congeladosVT?"VT":"",obs:get("obs")};
  if(id){const atual=db.producoes.find(x=>x.id===id);if(!atual)return;Object.assign(atual,obj);}else db.producoes.push(obj); sincronizarEstoqueEmbrioesProducao(obj); fecharModal();salvarBanco();
}

function transferencias(){
  header("Transferência de Embriões",`Filtro global: ${resumoFiltroGlobal()}`);const grupos=agruparPorData(listaNoPeriodo(db.transferencias));
  document.getElementById("content").innerHTML=`<div class="global-filter-banner">Mostrando: <strong>${esc(resumoFiltroGlobal())}</strong></div><div class="card"><div class="section-title"><h3>Transferências</h3><button class="btn" onclick="formTransferencia()">Nova transferência</button></div>${Object.keys(grupos).length?Object.entries(grupos).map(([data,itens])=>`<div class="date-group"><div class="date-group-title">${esc(dataBR(data))}</div><div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Doadora</th><th>Touro</th><th>Receptora</th><th>Embrião D7</th><th>Destino</th><th>Diagnóstico</th><th>Ações</th></tr></thead><tbody>${itens.map(x=>`<tr><td>${esc(clienteNome(x.clienteId))}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(x.receptora)}</td><td>${esc(x.embriãoGrau)}<br>${esc(x.embriãoEstagio)}</td><td>${esc(x.destino)}</td><td>${badge(x.diagnostico)}</td><td><button class="btn small secondary" onclick="formTransferencia('${x.id}')">Editar</button><button class="btn small secondary" onclick="editarDiagnostico('${x.id}')">Diagnóstico</button><button class="btn small danger" onclick="excluirTransferencia('${x.id}')">Excluir</button></td></tr>`).join("")}</tbody></table></div></div>`).join(""):'<div class="empty-state">Nenhuma transferência no período selecionado.</div>'}</div>`;
}

function movimentacoes(){
  header("Movimentações de Sêmen",`Filtro global: ${resumoFiltroGlobal()}`); const lista=listaNoPeriodo(db.movimentacoes);
  document.getElementById("content").innerHTML=`<div class="global-filter-banner">Mostrando: <strong>${esc(resumoFiltroGlobal())}</strong></div><div class="card"><div class="section-title"><h3>Movimentações</h3><button class="btn" onclick="formMovimentacao()">Nova movimentação</button></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Touro</th><th>Partida</th><th>Tipo</th><th>Qtd.</th><th>Obs.</th><th>Ações</th></tr></thead><tbody>${lista.map(x=>`<tr><td>${esc(dataBR(x.data))}</td><td>${esc(clienteNome(x.clienteId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(x.partida)}</td><td>${esc(x.tipo)}</td><td>${numeroNaoNegativo(x.quantidade)}</td><td>${esc(x.obs||"")}</td><td><button class="btn small secondary" onclick="formMovimentacao('${x.id}')">Editar</button><button class="btn small danger" onclick="excluirMovimentacao('${x.id}')">Excluir</button></td></tr>`).join("")||'<tr><td colspan="8">Nenhuma movimentação no período selecionado.</td></tr>'}</tbody></table></div></div>`;
}

function formEstoque(id=""){
  const e=db.estoque.find(x=>x.id===id)||{};
  modal(id?"Editar estoque de sêmen":"Nova entrada de sêmen",`<div class="form-grid">${select("Cliente","clienteId",clientesDisponiveisProfissional(),e.clienteId||"")}${select("Touro","touroId",db.touros,e.touroId||"")}${campo("Partida / lote","partida",e.partida||"")}${`<div><label>Quantidade de entrada</label><input type="number" name="quantidade" min="0" step="0.1" inputmode="decimal" value="${esc(e.quantidade??0)}"></div>`}${campo("Data de entrada","data",e.data||hoje(),"date")}<div><label>Tipo de recipiente</label><input value="CANECA" disabled><input type="hidden" name="recipienteTipo" value="CANECA"></div>${campo("Identificação da caneca","recipiente",e.recipiente||"")}${campo("Observações","obs",e.obs||"")}</div><br><button class="btn" onclick="salvarEstoque('${id}')">Salvar</button>`);
}
function salvarEstoque(id=""){
  const get=n=>document.querySelector(`[name="${n}"]`)?.value.trim()||"";const q=Number(get("quantidade")),touro=db.touros.find(x=>x.id===get("touroId"));if(!exigir(get("clienteId"),"Selecione o cliente."))return;if(!exigir(touro,"Selecione o touro."))return;if(!exigir(get("partida"),"Informe a partida/lote."))return;if(!exigir(Number.isFinite(q)&&q>=0,"A quantidade deve ser não negativa e pode ser fracionada (ex.: 2,5)."))return;if(!exigir(get("recipiente"),"Informe a identificação da caneca."))return;
  const obj={id:id||idNovo("EST",db.estoque),clienteId:get("clienteId"),touroId:get("touroId"),central:touro.central||"",partida:get("partida"),quantidade:q,entrada:q,data:get("data"),recipienteTipo:"CANECA",recipiente:get("recipiente"),obs:get("obs")};if(id){const a=db.estoque.find(x=>x.id===id);if(!a)return;Object.assign(a,obj);}else db.estoque.push(obj);fecharModal();salvarBanco();
}
function estoque(){
  header("Estoque de Sêmen","Recipiente padronizado: CANECA");const clientes=[...clientesDisponiveisProfissional()].sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));const blocos=clientes.map(c=>{const itens=db.estoque.filter(e=>e.clienteId===c.id);if(!itens.length)return"";const saldo=itens.reduce((a,e)=>a+numeroNaoNegativo(e.saldo),0);return `<div class="date-group"><div class="date-group-title">${esc(c.nome)} — Saldo total: ${saldo} doses</div><div class="table-wrap"><table><thead><tr><th>Touro</th><th>Raça</th><th>Central</th><th>Partida / lote</th><th>Quantidade</th><th>Usadas</th><th>Saldo</th><th>Recipiente</th><th>Caneca</th><th>Observações</th><th>Ações</th></tr></thead><tbody>${itens.map(x=>`<tr><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${esc(x.central)}</td><td>${esc(x.partida)}</td><td>${numeroNaoNegativo(x.quantidade)}</td><td>${numeroNaoNegativo(x.usadas)}</td><td><strong>${numeroNaoNegativo(x.saldo)}</strong></td><td>CANECA</td><td>${esc(x.recipiente)}</td><td>${esc(x.obs)}</td><td><button class="btn small secondary" onclick="formEstoque('${x.id}')">Editar</button><button class="btn small danger" onclick="excluirEstoque('${x.id}')">Excluir</button></td></tr>`).join("")}</tbody></table></div></div>`}).join("");document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><h3>Estoque de Sêmen</h3><button class="btn" onclick="formEstoque()">Nova entrada</button></div>${blocos||'<div class="empty-state">Nenhum estoque de sêmen cadastrado.</div>'}</div>`;
}

function estoqueEmbrioes(){
  sincronizarTodosEstoquesEmbrioes(); header("Estoque de Embriões","DT e VT gerados automaticamente a partir da produção");const clientes=[...clientesDisponiveisProfissional()].sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));const blocos=clientes.map(c=>{const itens=db.estoqueEmbrioes.filter(e=>e.clienteId===c.id);if(!itens.length)return"";const totalDT=itens.filter(e=>e.tipo==="DT").reduce((a,e)=>a+numeroNaoNegativo(e.quantidade),0),totalVT=itens.filter(e=>e.tipo==="VT").reduce((a,e)=>a+numeroNaoNegativo(e.quantidade),0);return `<div class="date-group"><div class="date-group-title">${esc(c.nome)} — DT: ${totalDT} | VT: ${totalVT}</div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Doadora</th><th>Raça doadora</th><th>Touro</th><th>Raça touro</th><th>Qtd.</th><th>Botijão</th><th>Caneca</th><th>Raque</th><th>Posição</th><th>Origem</th><th>Ações</th></tr></thead><tbody>${itens.map(e=>`<tr><td>${esc(dataBR(e.data||""))}</td><td><strong>${esc(e.tipo)}</strong></td><td>${esc(doadoraNome(e.doadoraId))}</td><td>${esc(doadoraRaca(e.doadoraId))}</td><td>${esc(touroNome(e.touroId))}</td><td>${esc(touroRaca(e.touroId))}</td><td>${numeroNaoNegativo(e.quantidade)}</td><td>${esc(e.botijao||"A definir")}</td><td>${esc(e.caneca||"A definir")}</td><td>${esc(e.raque||"")}</td><td>${esc(e.posicao||"")}</td><td>${esc(e.origem||"Manual")}</td><td><button class="btn small secondary" onclick="formEstoqueEmbriao('${e.id}')">Editar localização</button><button class="btn small danger" onclick="excluirEstoqueEmbriao('${e.id}')">Excluir</button></td></tr>`).join("")}</tbody></table></div></div>`}).join("");document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><h3>Estoque por cliente</h3><button class="btn" onclick="formEstoqueEmbriao()">Adicionar estoque manual</button></div><div class="note">Embriões DT e VT lançados em Produção entram aqui automaticamente. Preencha a localização física após o congelamento.</div>${blocos||'<div class="empty-state">Nenhum embrião DT/VT em estoque.</div>'}</div>`;
}

function rodapeSeminna(){return `<div class="seminna-footer"><strong>SÊMINNA - LABORATÓRIO DE REPRODUÇÃO ANIMAL</strong><br>AV. General Osório, 797, sala 01, Francisco Beltrão - PR</div>`;}
function cabecalhoRelatorioPeriodo(titulo,cliente,tipo,valor){return `<div class="report-header"><div class="report-brand"><img src="${LOGO_SEMINNA_DATA}" alt="Sêminna"></div><div class="report-head-main"><h1>SÊMINNA LABORATÓRIO DE REPRODUÇÃO ANIMAL</h1><div class="report-meta"><b>CLIENTE:</b><span>${esc(cliente.nome)}</span><b>PERÍODO:</b><span>${esc(rotuloPeriodo(tipo,valor))}</span></div></div></div><h2 class="report-title">${titulo}</h2>`;}
function abrirRelatorioFormatado(titulo,cliente,data,conteudo,orientacao="landscape"){modal(titulo,`<div class="report-actions"><button class="btn" onclick="imprimirRelatorio('${orientacao}')">Exportar / Salvar em PDF</button></div><div id="reportPrintable" class="report-sheet ${orientacao}">${conteudo}</div>`);}
function imprimirRelatorio(orientacao="landscape"){
  const el=document.getElementById("reportPrintable");if(!el){alert("Relatório não encontrado.");return;}
  let style=document.getElementById('printReportStyle');if(style)style.remove();style=document.createElement('style');style.id='printReportStyle';style.textContent=`@page{size:A4 ${orientacao};margin:8mm}@media print{body>*{visibility:hidden!important}#modal,#modal *{visibility:visible!important}#modal{position:absolute!important;inset:0!important;background:#fff!important;padding:0!important;display:block!important}#modal .modal-box{box-shadow:none!important;width:100%!important;max-width:none!important;max-height:none!important;overflow:visible!important;padding:0!important}.modal-head,.report-actions{display:none!important}#reportPrintable{position:absolute;left:0;top:0;width:100%!important}.report-date-title{break-before:auto}.date-group,.report-table{break-inside:avoid}}`;document.head.appendChild(style);setTimeout(()=>window.print(),50);
}

function relatorios(){
  header("Relatórios por Cliente e Período",`Filtro global atual: ${resumoFiltroGlobal()}`);document.getElementById("content").innerHTML=`<div class="global-filter-banner">O período padrão dos relatórios acompanha o Dashboard: <strong>${esc(resumoFiltroGlobal())}</strong></div><div class="card"><div class="section-title"><h3>Localizar cliente</h3></div><div class="client-filter"><input id="buscaClienteRel" placeholder="Digite o nome do cliente ou CPF/CNPJ" oninput="buscarClienteRelatorio()"></div><div id="resultadoClientes"></div></div><div id="relatorioSelecionado" style="margin-top:20px"></div>`;
}
function blocoPeriodoRelatorio(clienteId,tipo,titulo){const v=filtroGlobal.valor||hoje(),t=filtroGlobal.tipo||'dia';return `<div class="report-choice"><h3>${titulo}</h3><label>Período</label><select id="rel_${tipo}_tipo" onchange="atualizarPeriodoRel('${tipo}')"><option value="dia" ${t==='dia'?'selected':''}>Dia</option><option value="mes" ${t==='mes'?'selected':''}>Mês</option><option value="ano" ${t==='ano'?'selected':''}>Ano</option></select><div id="rel_${tipo}_dia_wrap" style="display:${t==='dia'?'block':'none'}"><label>Data</label><input id="rel_${tipo}_dia" type="date" value="${t==='dia'?v:hoje()}"></div><div id="rel_${tipo}_mes_wrap" style="display:${t==='mes'?'block':'none'}"><label>Mês</label><input id="rel_${tipo}_mes" type="month" value="${t==='mes'?v:hoje().slice(0,7)}"></div><div id="rel_${tipo}_ano_wrap" style="display:${t==='ano'?'block':'none'}"><label>Ano</label><input id="rel_${tipo}_ano" type="number" min="2000" max="2100" value="${t==='ano'?v:hoje().slice(0,4)}"></div><button class="btn" onclick="gerarRelatorioPeriodo('${clienteId}','${tipo}')">Gerar relatório</button></div>`;}

function totaisProducao(dados){const t={oocitos:0,oocitosViaveis:0,clivados:0,embriõesD7:0,transferidosFresco:0,congeladosDT:0,congeladosVT:0,congelados:0};dados.forEach(x=>{t.oocitos+=numeroNaoNegativo(x.oocitos);t.oocitosViaveis+=numeroNaoNegativo(x.oocitosViaveis);t.clivados+=numeroNaoNegativo(x.clivados);t.embriõesD7+=numeroNaoNegativo(x.embriõesD7);t.transferidosFresco+=numeroNaoNegativo(x.transferidosFresco);t.congeladosDT+=numeroNaoNegativo(x.congeladosDT??x.transferidosDT);t.congeladosVT+=numeroNaoNegativo(x.congeladosVT??x.transferidosVT);});t.congelados=t.congeladosDT+t.congeladosVT;return t;}
function relatorioProducao(clienteId,valor,tipo="dia"){
  const cliente=db.clientes.find(x=>x.id===clienteId);if(!cliente)return;const dados=db.producoes.filter(x=>x.clienteId===clienteId&&dataNoPeriodo(x.data,tipo,valor));if(!dados.length){alert("Não há produção cadastrada para este cliente no período selecionado.");return;}const corpo=grupoRelatorioPorData(dados,(itens)=>{const t=totaisProducao(itens);const linhas=itens.map((x,i)=>{const dt=numeroNaoNegativo(x.congeladosDT??x.transferidosDT),vt=numeroNaoNegativo(x.congeladosVT??x.transferidosVT);return `<tr><td>${i+1}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(doadoraRaca(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${numeroNaoNegativo(x.oocitos)}</td><td>${numeroNaoNegativo(x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.clivados)}</td><td>${percentual(x.clivados,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.embriõesD7)}</td><td>${percentual(x.embriõesD7,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.transferidosFresco)}</td><td>${dt}</td><td>${vt}</td><td>${dt+vt}</td></tr>`}).join("");return `<table class="report-table"><thead><tr><th>Nº</th><th>DOADORA</th><th>RAÇA DOADORA</th><th>TOURO</th><th>RAÇA TOURO</th><th>OÓCITOS TOTAIS</th><th>OÓCITOS VIÁVEIS</th><th>CLIVAGEM</th><th>%CLIV</th><th>EMB. D7</th><th>%PROD</th><th>FRESCO</th><th>DT</th><th>VT</th><th>TOTAL CONG.</th></tr></thead><tbody>${linhas}<tr class="total-row"><td colspan="5">TOTAL DO DIA</td><td>${t.oocitos}</td><td>${t.oocitosViaveis}</td><td>${t.clivados}</td><td>${percentual(t.clivados,t.oocitosViaveis)}</td><td>${t.embriõesD7}</td><td>${percentual(t.embriõesD7,t.oocitosViaveis)}</td><td>${t.transferidosFresco}</td><td>${t.congeladosDT}</td><td>${t.congeladosVT}</td><td>${t.congelados}</td></tr></tbody></table><div class="report-note"><b>OBS:</b> ${esc(observacoesUnicas(itens)||"-")}</div>`;});const g=totaisProducao(dados);const conteudo=`${cabecalhoRelatorioPeriodo("RELATÓRIO PRODUÇÃO IN VITRO DE EMBRIÕES",cliente,tipo,valor)}${corpo}<div class="report-grand-total"><b>TOTAL DO PERÍODO:</b> Oócitos ${g.oocitos} | Viáveis ${g.oocitosViaveis} | Clivados ${g.clivados} | Embriões D7 ${g.embriõesD7} | Fresco ${g.transferidosFresco} | DT ${g.congeladosDT} | VT ${g.congeladosVT} | Total congelado ${g.congelados}</div>${rodapeSeminna()}`;abrirRelatorioFormatado("Relatório de Produção",cliente,valor,conteudo,"landscape");
}
function relatorioCongelamento(clienteId,valor,tipo="dia"){
  const cliente=db.clientes.find(x=>x.id===clienteId);if(!cliente)return;const dados=db.producoes.filter(x=>x.clienteId===clienteId&&(numeroNaoNegativo(x.congeladosDT??x.transferidosDT)+numeroNaoNegativo(x.congeladosVT??x.transferidosVT)>0)&&dataNoPeriodo(x.data,tipo,valor));if(!dados.length){alert("Não há congelamentos cadastrados para este cliente no período selecionado.");return;}const corpo=grupoRelatorioPorData(dados,(itens)=>{let totalDT=0,totalVT=0;const linhas=itens.map((x,i)=>{const dt=numeroNaoNegativo(x.congeladosDT??x.transferidosDT),vt=numeroNaoNegativo(x.congeladosVT??x.transferidosVT);totalDT+=dt;totalVT+=vt;return `<tr><td>${i+1}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(doadoraRaca(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${dt}</td><td>${vt}</td><td>${dt+vt}</td><td>${esc(x.obs||"")}</td></tr>`}).join("");return `<table class="report-table"><thead><tr><th>Nº</th><th>DOADORA</th><th>RAÇA DOADORA</th><th>TOURO</th><th>RAÇA TOURO</th><th>DT</th><th>VT</th><th>TOTAL</th><th>OBS</th></tr></thead><tbody>${linhas}<tr class="total-row"><td colspan="5">TOTAL DO DIA</td><td>${totalDT}</td><td>${totalVT}</td><td>${totalDT+totalVT}</td><td></td></tr></tbody></table>`;});const g=totaisProducao(dados);abrirRelatorioFormatado("Relatório de Congelamento",cliente,valor,`${cabecalhoRelatorioPeriodo("RELATÓRIO DE CONGELAMENTO DE EMBRIÕES",cliente,tipo,valor)}${corpo}<div class="report-grand-total"><b>TOTAL NO PERÍODO:</b> DT ${g.congeladosDT} | VT ${g.congeladosVT} | Total ${g.congelados}</div>${rodapeSeminna()}`,"landscape");
}
function relatorioTransferencia(clienteId,valor,tipo="dia"){
  const cliente=db.clientes.find(x=>x.id===clienteId);if(!cliente)return;const dados=db.transferencias.filter(x=>x.clienteId===clienteId&&dataNoPeriodo(x.data,tipo,valor));if(!dados.length){alert("Não há transferências cadastradas para este cliente no período selecionado.");return;}const corpo=grupoRelatorioPorData(dados,(itens)=>{const prenhes=itens.filter(x=>x.diagnostico==="Prenhe").length,vazias=itens.filter(x=>x.diagnostico==="Vazia").length,pct=itens.length?Math.round(prenhes/itens.length*100):0;const linhas=itens.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(doadoraRaca(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${esc(x.embriãoGrau||"")}</td><td>${esc(x.embriãoEstagio||"")}</td><td>${esc(x.receptora||"")}</td><td>${esc(x.destino||"")}</td><td>${esc(x.diagnostico||"")}</td></tr>`).join("");return `<table class="report-table"><thead><tr><th>Nº</th><th>DOADORA</th><th>RAÇA DOADORA</th><th>TOURO</th><th>RAÇA TOURO</th><th>GRAU D7</th><th>ESTÁGIO D7</th><th>RECEPTORA</th><th>DESTINO</th><th>DIAGNÓSTICO</th></tr></thead><tbody>${linhas}</tbody></table><table class="report-table report-summary"><tbody><tr><th>TOTAL</th><th>PRENHAS</th><th>VAZIAS</th><th>% PRENHEZ</th></tr><tr><td>${itens.length}</td><td>${prenhes}</td><td>${vazias}</td><td>${pct}%</td></tr></tbody></table><div class="report-note"><b>OBSERVAÇÕES:</b> ${esc(observacoesUnicas(itens)||"-")}</div>`;});const prenhes=dados.filter(x=>x.diagnostico==="Prenhe").length,vazias=dados.filter(x=>x.diagnostico==="Vazia").length,pct=dados.length?Math.round(prenhes/dados.length*100):0;abrirRelatorioFormatado("Relatório de Transferência",cliente,valor,`${cabecalhoRelatorioPeriodo("PLANILHA DE TRANSFERÊNCIA DE EMBRIÕES",cliente,tipo,valor)}${corpo}<div class="report-grand-total"><b>TOTAL DO PERÍODO:</b> ${dados.length} transferências | ${prenhes} prenhas | ${vazias} vazias | ${pct}% prenhez</div>${rodapeSeminna()}`,"landscape");
}
function relatorioEstoquesCliente(clienteId){
  const cliente=db.clientes.find(x=>x.id===clienteId);if(!cliente)return;sincronizarTodosEstoquesEmbrioes();const semen=db.estoque.filter(x=>x.clienteId===clienteId),emb=db.estoqueEmbrioes.filter(x=>x.clienteId===clienteId);const linhasS=semen.map(x=>`<tr><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${esc(x.central||"")}</td><td>${esc(x.partida||"")}</td><td>${numeroNaoNegativo(x.quantidade)}</td><td>${numeroNaoNegativo(x.usadas)}</td><td>${numeroNaoNegativo(x.saldo)}</td><td>CANECA</td><td>${esc(x.recipiente||"")}</td></tr>`).join("")||'<tr><td colspan="9">Sem estoque de sêmen cadastrado.</td></tr>';const linhasE=emb.map(x=>`<tr><td>${esc(x.tipo)}</td><td>${esc(dataBR(x.data||""))}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(doadoraRaca(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${numeroNaoNegativo(x.quantidade)}</td><td>${esc(x.botijao||"")}</td><td>${esc(x.caneca||"")}</td><td>${esc(x.raque||"")}</td><td>${esc(x.posicao||"")}</td></tr>`).join("")||'<tr><td colspan="11">Sem estoque de embriões cadastrado.</td></tr>';const conteudo=`${cabecalhoRelatorioPeriodo("POSIÇÃO DE ESTOQUES",cliente,"dia",hoje())}<h3>ESTOQUE DE SÊMEN</h3><table class="report-table"><thead><tr><th>TOURO</th><th>RAÇA</th><th>CENTRAL</th><th>PARTIDA/LOTE</th><th>QUANTIDADE</th><th>USADAS</th><th>SALDO</th><th>RECIPIENTE</th><th>CANECA</th></tr></thead><tbody>${linhasS}</tbody></table><h3 style="margin-top:14px">ESTOQUE DE EMBRIÕES DT / VT</h3><table class="report-table"><thead><tr><th>TIPO</th><th>DATA</th><th>DOADORA</th><th>RAÇA DOADORA</th><th>TOURO</th><th>RAÇA TOURO</th><th>QTD.</th><th>BOTIJÃO</th><th>CANECA</th><th>RAQUE</th><th>POSIÇÃO</th></tr></thead><tbody>${linhasE}</tbody></table>${rodapeSeminna()}`;abrirRelatorioFormatado("Posição de Estoques",cliente,hoje(),conteudo,"landscape");
}



// ============================================================
// V1.8 — ORGANIZAÇÃO POR CLIENTE, DOSE UTILIZADA E TE AUTOMÁTICA
// ============================================================

function numeroDecimal(v){
  const n=Number(String(v??"").replace(",","."));
  return Number.isFinite(n)?n:0;
}
function formatarDose(v){
  const n=numeroDecimal(v);
  return n.toLocaleString("pt-BR",{minimumFractionDigits:1,maximumFractionDigits:2});
}
function agrupadoPorClienteEData(lista){
  const clientes={};
  (lista||[]).forEach(x=>{
    const cid=x.clienteId||"SEM_CLIENTE";
    if(!clientes[cid])clientes[cid]={};
    const data=x.data||"SEM_DATA";
    if(!clientes[cid][data])clientes[cid][data]=[];
    clientes[cid][data].push(x);
  });
  return clientes;
}
function nomeClienteOrdenacao(id){return clienteNome(id)||"Sem cliente";}

function doadoras(){
  header("Doadoras","Doadoras separadas por cliente");
  const clientes=[...clientesDisponiveisProfissional()].sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
  const semCliente=db.doadoras.filter(d=>!db.clientes.some(c=>c.id===d.clienteId));
  const blocos=clientes.map(c=>{
    const itens=db.doadoras.filter(d=>d.clienteId===c.id).sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
    if(!itens.length)return "";
    return `<div class="date-group"><div class="date-group-title">${esc(c.nome)} — ${itens.length} doadora(s)</div>${tabelaDoadoras(itens)}</div>`;
  }).join("")+(semCliente.length?`<div class="date-group"><div class="date-group-title">Sem cliente vinculado</div>${tabelaDoadoras(semCliente)}</div>`:"");
  document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><h3>Doadoras por cliente</h3><button class="btn" onclick="formDoadora()">Nova doadora</button></div>${blocos||'<div class="empty-state">Nenhuma doadora cadastrada.</div>'}</div>`;
}

function dashboard(){
  header("Dashboard","Cada produção de embriões equivale a uma OPU; o período selecionado é aplicado no sistema");
  document.getElementById("content").innerHTML=controlesPeriodo("dash","aplicarDashboard()")+`<div class="filter-summary global-filter-banner">Filtro ativo em todo o sistema: <strong>${esc(resumoFiltroGlobal())}</strong></div><div id="dashboardResultado"></div>`;
  const tipoEl=document.getElementById("dash_tipo");if(tipoEl)tipoEl.value=filtroGlobal.tipo;
  ["dia","mes","ano"].forEach(t=>{const el=document.getElementById(`dash_${t}`);if(el&&filtroGlobal.tipo===t)el.value=filtroGlobal.valor;});
  atualizarControlePeriodo("dash");aplicarDashboard(false);
}
function aplicarDashboard(persistir=true){
  const {tipo,valor}=lerPeriodo("dash");if(!valor)return;
  if(persistir)salvarFiltroGlobal(tipo,valor);
  const prod=db.producoes.filter(x=>dataNoPeriodo(x.data,tipo,valor));
  const te=db.transferencias.filter(x=>dataNoPeriodo(x.data,tipo,valor));
  const opu=prod.length;
  const oocitosViaveis=prod.reduce((a,x)=>a+numeroNaoNegativo(x.oocitosViaveis),0);
  const oocitosTotais=prod.reduce((a,x)=>a+numeroNaoNegativo(x.oocitos),0);
  const embrioes=prod.reduce((a,x)=>a+numeroNaoNegativo(x.embriõesD7),0);
  const fresco=prod.reduce((a,x)=>a+numeroNaoNegativo(x.transferidosFresco),0);
  const dt=prod.reduce((a,x)=>a+numeroNaoNegativo(x.congeladosDT??x.transferidosDT),0);
  const vt=prod.reduce((a,x)=>a+numeroNaoNegativo(x.congeladosVT??x.transferidosVT),0);
  const doses=db.estoque.reduce((a,x)=>a+numeroNaoNegativo(x.saldo),0);
  const embEstoque=db.estoqueEmbrioes.reduce((a,x)=>a+numeroNaoNegativo(x.quantidade),0);
  const out=document.getElementById("dashboardResultado");if(!out)return;
  out.innerHTML=`<div class="filter-summary">Período: <strong>${esc(rotuloPeriodo(tipo,valor))}</strong></div><div class="grid kpis">
  <div class="card"><strong>OPUs / Produções</strong><h2>${opu}</h2></div>
  <div class="card"><strong>Oócitos coletados (viáveis)</strong><h2>${oocitosViaveis}</h2></div>
  <div class="card"><strong>Oócitos coletados totais</strong><h2>${oocitosTotais}</h2></div>
  <div class="card"><strong>Embriões D7</strong><h2>${embrioes}</h2></div>
  <div class="card"><strong>Transferidos a fresco</strong><h2>${fresco}</h2></div>
  <div class="card"><strong>Congelados DT</strong><h2>${dt}</h2></div>
  <div class="card"><strong>Congelados VT</strong><h2>${vt}</h2></div>
  <div class="card"><strong>Transferências</strong><h2>${te.length}</h2></div>
  <div class="card"><strong>Estoque sêmen</strong><h2>${doses}</h2></div>
  <div class="card"><strong>Estoque embriões DT/VT</strong><h2>${embEstoque}</h2></div></div>`;
}

function producoes(){
  header("Produção de Embriões",`Separada por cliente e data — ${resumoFiltroGlobal()}`);
  const lista=listaNoPeriodo(db.producoes);
  const grupos=agrupadoPorClienteEData(lista);
  const clienteIds=Object.keys(grupos).sort((a,b)=>nomeClienteOrdenacao(a).localeCompare(nomeClienteOrdenacao(b),"pt-BR"));
  const blocos=clienteIds.map(cid=>{
    const datas=grupos[cid];
    const porData=Object.keys(datas).sort((a,b)=>b.localeCompare(a)).map(data=>{
      const itens=datas[data];
      return `<div class="client-date-subgroup"><div class="client-date-title">${esc(dataBR(data))}</div><div class="table-wrap"><table><thead><tr><th>Doadora</th><th>Touro</th><th>Dose utilizada</th><th>Oócitos totais</th><th>Viáveis</th><th>Clivados</th><th>% Cliv.</th><th>Embriões D7</th><th>% Prod.</th><th>Fresco</th><th>Cong. DT</th><th>Cong. VT</th><th>Total congelado</th><th>Ações</th></tr></thead><tbody>${itens.map(x=>{const dt=numeroNaoNegativo(x.congeladosDT??x.transferidosDT),vt=numeroNaoNegativo(x.congeladosVT??x.transferidosVT);return `<tr><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${formatarDose(x.doseUtilizada)} dose</td><td>${numeroNaoNegativo(x.oocitos)}</td><td>${numeroNaoNegativo(x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.clivados)}</td><td>${percentual(x.clivados,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.embriõesD7)}</td><td>${percentual(x.embriõesD7,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.transferidosFresco)}</td><td>${dt}</td><td>${vt}</td><td><strong>${dt+vt}</strong></td><td><button class="btn small secondary" onclick="formProducao('${x.id}')">Editar</button><button class="btn small danger" onclick="excluirProducao('${x.id}')">Excluir</button></td></tr>`}).join("")}</tbody></table></div></div>`;
    }).join("");
    return `<div class="date-group client-group"><div class="date-group-title">CLIENTE: ${esc(nomeClienteOrdenacao(cid))}</div>${porData}</div>`;
  }).join("");
  document.getElementById("content").innerHTML=`<div class="global-filter-banner">Mostrando: <strong>${esc(resumoFiltroGlobal())}</strong></div><div class="card"><div class="section-title"><h3>Produção por cliente e data</h3><button class="btn" onclick="formProducao()">Nova produção</button></div>${blocos||'<div class="empty-state">Nenhuma produção no período selecionado.</div>'}</div>`;
}

function formProducao(id=""){
  const p=db.producoes.find(x=>x.id===id)||{};const dt=p.congeladosDT??p.transferidosDT??0,vt=p.congeladosVT??p.transferidosVT??0;
  const dataPadrao=filtroGlobal.tipo==="dia"?filtroGlobal.valor:hoje();
  modal(id?"Editar produção de embriões":"Nova produção de embriões",`<div class="form-grid">
    ${campo("Data","data",p.data||dataPadrao,"date")}${select("Cliente","clienteId",clientesDisponiveisProfissional(),p.clienteId||"")}
    <div><label>Doadora</label><select name="doadoraId"><option value="">Selecione primeiro o cliente...</option></select></div>
    ${select("Touro","touroId",db.touros,p.touroId||"")}
    <div><label>Quantidade de dose utilizada</label><input name="doseUtilizada" type="text" inputmode="decimal" placeholder="Ex.: 0,1; 0,2; 0,3" value="${esc(p.doseUtilizada??'0,1')}"><small class="field-help">Informe em passos de 0,1 dose.</small></div>
    ${campo("Oócitos totais","oocitos",p.oocitos??0,"number")}${campo("Oócitos viáveis","oocitosViaveis",p.oocitosViaveis??0,"number")}${campo("Clivados","clivados",p.clivados??0,"number")}${campo("Embriões viáveis no D7","embriõesD7",p.embriõesD7??0,"number")}${campo("Embriões transferidos a fresco","transferidosFresco",p.transferidosFresco??0,"number")}${campo("Embriões congelados DT","congeladosDT",dt,"number")}${campo("Embriões congelados VT","congeladosVT",vt,"number")}${campo("Observações","obs",p.obs||"")}
  </div><br><div class="note"><strong>Automático:</strong> cada embrião a fresco gera uma linha editável em Transferência de Embriões. DT e VT entram automaticamente no Estoque de Embriões.</div><br><button class="btn" onclick="salvarProducao('${id}')">Salvar produção</button>`);
  document.querySelector('[name="clienteId"]').addEventListener('change',()=>atualizarDoadorasPorCliente("doadoraId",""));atualizarDoadorasPorCliente("doadoraId",p.doadoraId||"");
}
function transferenciaTemDados(t){
  const obs=String(t.obs||"").trim();
  const obsUsuario=obs && obs!=="Gerado automaticamente pela produção de embriões a fresco.";
  return Boolean(String(t.receptora||"").trim()||String(t.embriãoGrau||"").trim()||String(t.embriãoEstagio||"").trim()||String(t.ovarioOvulou||"").trim()||String(t.grauCL||"").trim()||String(t.clCavitario||"").trim()||(t.diagnostico&&t.diagnostico!=="Pendente")||obsUsuario);
}
function sincronizarTransferenciasFrescoProducao(prod){
  if(!prod)return;
  const desejado=numeroNaoNegativo(prod.transferidosFresco);
  let vinculadas=db.transferencias.filter(t=>t.origemProducaoId===prod.id).sort((a,b)=>(a.ordemFresco||0)-(b.ordemFresco||0));
  if(!vinculadas.length&&desejado>0){
    const candidatas=db.transferencias.filter(t=>!t.origemProducaoId&&t.clienteId===prod.clienteId&&t.data===prod.data&&t.doadoraId===prod.doadoraId&&t.touroId===prod.touroId&&t.destino==="TRANSFERENCIA A FRESCO").slice(0,desejado);
    candidatas.forEach((t,i)=>{t.origemProducaoId=prod.id;t.ordemFresco=i+1;});
    vinculadas=candidatas;
  }
  while(vinculadas.length<desejado){
    const ordem=vinculadas.length+1;
    const t={id:idNovo("TE",db.transferencias),data:prod.data,clienteId:prod.clienteId,doadoraId:prod.doadoraId,touroId:prod.touroId,receptora:"",embriãoGrau:"",embriãoEstagio:"",destino:"TRANSFERENCIA A FRESCO",ovarioOvulou:"",grauCL:"",clCavitario:"",diagnostico:"Pendente",dataDiagnostico:"",obs:"",origemProducaoId:prod.id,autoFresco:true,ordemFresco:ordem};
    db.transferencias.push(t);vinculadas.push(t);
  }
  if(vinculadas.length>desejado){
    const extras=vinculadas.slice(desejado).reverse();
    extras.forEach(t=>{if(!transferenciaTemDados(t)){db.transferencias=db.transferencias.filter(x=>x.id!==t.id);}});
  }
  db.transferencias.filter(t=>t.origemProducaoId===prod.id).forEach((t,i)=>{
    t.data=prod.data;t.clienteId=prod.clienteId;t.doadoraId=prod.doadoraId;t.touroId=prod.touroId;t.destino="TRANSFERENCIA A FRESCO";t.ordemFresco=i+1;
  });
}
function sincronizarTodasTransferenciasFresco(){(db.producoes||[]).forEach(sincronizarTransferenciasFrescoProducao);}
function salvarProducao(id=""){
  const get=n=>document.querySelector(`[name="${n}"]`)?.value.trim()||"";
  const ks=["oocitos","oocitosViaveis","clivados","embriõesD7","transferidosFresco","congeladosDT","congeladosVT"],n={};ks.forEach(k=>n[k]=Number(get(k)));
  const dose=numeroDecimal(get("doseUtilizada"));
  if(!exigir(get("data"),"Informe a data da produção."))return;if(!exigir(get("clienteId"),"Selecione o cliente."))return;
  const d=db.doadoras.find(x=>x.id===get("doadoraId"));if(!exigir(d&&d.clienteId===get("clienteId"),"Selecione uma doadora pertencente ao cliente."))return;if(!exigir(get("touroId"),"Selecione o touro."))return;
  if(!exigir(dose>0&&Math.abs(dose*10-Math.round(dose*10))<0.00001,"Informe a dose utilizada em passos de 0,1 (ex.: 0,1; 0,2; 0,3)."))return;
  if(!exigir(ks.every(k=>Number.isInteger(n[k])&&n[k]>=0),"As quantidades devem ser números inteiros não negativos."))return;
  if(!exigir(n.oocitosViaveis<=n.oocitos,"Oócitos viáveis não podem superar o total de oócitos."))return;if(!exigir(n.clivados<=n.oocitosViaveis,"Clivados não podem superar os oócitos viáveis."))return;if(!exigir(n.embriõesD7<=n.clivados,"Embriões D7 não podem superar os clivados."))return;
  if(!exigir(n.transferidosFresco+n.congeladosDT+n.congeladosVT<=n.embriõesD7,"Fresco + congelados DT + congelados VT não podem superar os embriões D7."))return;
  if(id){const preenchidas=db.transferencias.filter(t=>t.origemProducaoId===id&&transferenciaTemDados(t)).length;if(!exigir(n.transferidosFresco>=preenchidas,`Existem ${preenchidas} transferências a fresco já preenchidas. Exclua/limpe essas transferências antes de reduzir o número a fresco.`))return;}
  const obj={id:id||idNovo("PROD",db.producoes),data:get("data"),clienteId:get("clienteId"),doadoraId:get("doadoraId"),touroId:get("touroId"),doseUtilizada:dose,...n,transferidosDT:n.congeladosDT,transferidosVT:n.congeladosVT,congelados:n.congeladosDT+n.congeladosVT,tipoCongelamento:n.congeladosDT&&n.congeladosVT?"DT + VT":n.congeladosDT?"DT":n.congeladosVT?"VT":"",obs:get("obs")};
  if(id){const atual=db.producoes.find(x=>x.id===id);if(!atual)return;Object.assign(atual,obj);}else db.producoes.push(obj);
  sincronizarEstoqueEmbrioesProducao(obj);sincronizarTransferenciasFrescoProducao(obj);fecharModal();salvarBanco();
}
function excluirProducao(id){
  if(!confirmarExclusao("Excluir esta produção? Os estoques DT/VT e as transferências a fresco automáticas vinculadas também serão removidos."))return;
  const preenchidas=db.transferencias.filter(t=>t.origemProducaoId===id&&transferenciaTemDados(t));
  if(preenchidas.length&&!confirm(`Existem ${preenchidas.length} transferência(ões) vinculada(s) com dados preenchidos. Deseja excluir a produção e também essas transferências?`))return;
  db.producoes=db.producoes.filter(x=>x.id!==id);db.estoqueEmbrioes=db.estoqueEmbrioes.filter(x=>x.origemProducaoId!==id);db.transferencias=db.transferencias.filter(x=>x.origemProducaoId!==id);salvarBanco();
}

function transferenciaCLTexto(t){
  const base=[t.ovarioOvulou,t.grauCL].filter(Boolean).join("");
  const cav=t.clCavitario?` / ${t.clCavitario==="Sim"?"Cavitário":"Não cavitário"}`:"";
  return base+cav;
}
function transferencias(){
  header("Transferência de Embriões",`Separada por cliente e data — ${resumoFiltroGlobal()}`);
  const permitidos=new Set(clientesDisponiveisProfissional().map(c=>c.id)); const lista=listaNoPeriodo(db.transferencias).filter(x=>!profissionalAtivoId||permitidos.has(x.clienteId)),grupos=agrupadoPorClienteEData(lista),clienteIds=Object.keys(grupos).sort((a,b)=>nomeClienteOrdenacao(a).localeCompare(nomeClienteOrdenacao(b),"pt-BR"));
  const blocos=clienteIds.map(cid=>{const datas=grupos[cid];const porData=Object.keys(datas).sort((a,b)=>b.localeCompare(a)).map(data=>{const itens=datas[data];return `<div class="client-date-subgroup"><div class="client-date-title">${esc(dataBR(data))}</div><div class="table-wrap"><table><thead><tr><th>Doadora</th><th>Touro</th><th>Receptora</th><th>Grau D7</th><th>Estágio D7</th><th>Ovário / CL</th><th>Destino</th><th>Diagnóstico</th><th>Ações</th></tr></thead><tbody>${itens.map(x=>`<tr class="${x.autoFresco?'auto-row':''}"><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(x.receptora||'<preencher>')}</td><td>${esc(x.embriãoGrau||"")}</td><td>${esc(x.embriãoEstagio||"")}</td><td>${esc(transferenciaCLTexto(x)||"")}</td><td>${esc(x.destino||"")}</td><td>${badge(x.diagnostico||"Pendente")}</td><td><button class="btn small secondary" onclick="formTransferencia('${x.id}')">Editar</button><button class="btn small secondary" onclick="editarDiagnostico('${x.id}')">Diagnóstico</button><button class="btn small danger" onclick="excluirTransferencia('${x.id}')">Excluir</button></td></tr>`).join("")}</tbody></table></div></div>`}).join("");return `<div class="date-group client-group"><div class="date-group-title">CLIENTE: ${esc(nomeClienteOrdenacao(cid))}</div>${porData}</div>`}).join("");
  document.getElementById("content").innerHTML=`<div class="global-filter-banner">Mostrando: <strong>${esc(resumoFiltroGlobal())}</strong></div><div class="card"><div class="section-title"><h3>Transferências por cliente e data</h3><button class="btn" onclick="formTransferencia()">Nova transferência</button></div>${blocos||'<div class="empty-state">Nenhuma transferência no período selecionado.</div>'}</div>`;
}
function formTransferencia(id=""){
  const t=db.transferencias.find(x=>x.id===id)||{};const dataPadrao=filtroGlobal.tipo==="dia"?filtroGlobal.valor:hoje();
  modal(id?"Editar transferência de embrião":"Nova transferência de embrião",`<div class="form-grid">
    ${campo("Data","data",t.data||dataPadrao,"date")}${select("Cliente","clienteId",clientesDisponiveisProfissional(),t.clienteId||"")}
    <div><label>Doadora</label><select name="doadoraId"><option value="">Selecione primeiro o cliente...</option></select></div>${select("Touro","touroId",db.touros,t.touroId||"")}
    ${campo("Identificação da receptora","receptora",t.receptora||"")}${select("Grau de qualidade do embrião D7","embriãoGrau",GRAUS_EMBRIOES_D7,t.embriãoGrau||"")}${select("Estágio do embrião D7","embriãoEstagio",ESTAGIOS_EMBRIAO_D7,t.embriãoEstagio||"")}
    ${select("Ovário que ovulou","ovarioOvulou",["OD","OE"],t.ovarioOvulou||"")}${select("Grau do corpo lúteo","grauCL",["1","2","3"],t.grauCL||"")}${select("Corpo lúteo cavitário?","clCavitario",["Sim","Não"],t.clCavitario||"")}
    ${select("Destino","destino",DESTINOS_EMBRIAO,t.destino||"TRANSFERENCIA A FRESCO")}${select("Diagnóstico","diagnostico",DIAGNOSTICOS,t.diagnostico||"Pendente")}${campo("Data do diagnóstico","dataDiagnostico",t.dataDiagnostico||"","date")}${campo("Observações","obs",t.obs||"")}
  </div><br>${t.origemProducaoId?'<div class="note">Esta transferência foi gerada automaticamente a partir de uma produção com embrião a fresco. Os dados da receptora e avaliação podem ser editados normalmente.</div><br>':''}<button class="btn" onclick="salvarTransferencia('${id}')">Salvar transferência</button>`);
  document.querySelector('[name="clienteId"]').addEventListener('change',()=>atualizarDoadorasPorCliente("doadoraId",""));atualizarDoadorasPorCliente("doadoraId",t.doadoraId||"");
}
function salvarTransferencia(id=""){
  const get=n=>document.querySelector(`[name="${n}"]`)?.value.trim()||"";
  if(!exigir(get("data"),"Informe a data da transferência."))return;if(!exigir(get("clienteId"),"Selecione o cliente."))return;
  const d=db.doadoras.find(x=>x.id===get("doadoraId"));if(!exigir(d&&d.clienteId===get("clienteId"),"Selecione uma doadora pertencente ao cliente."))return;if(!exigir(get("touroId"),"Selecione o touro."))return;
  const atual=id?db.transferencias.find(x=>x.id===id):null;
  const obj={id:id||idNovo("TE",db.transferencias),data:get("data"),clienteId:get("clienteId"),doadoraId:get("doadoraId"),touroId:get("touroId"),receptora:get("receptora"),embriãoGrau:get("embriãoGrau"),embriãoEstagio:get("embriãoEstagio"),ovarioOvulou:get("ovarioOvulou"),grauCL:get("grauCL"),clCavitario:get("clCavitario"),destino:get("destino"),diagnostico:get("diagnostico")||"Pendente",dataDiagnostico:get("dataDiagnostico"),obs:get("obs"),origemProducaoId:atual?.origemProducaoId||"",autoFresco:Boolean(atual?.autoFresco),ordemFresco:atual?.ordemFresco||0};
  if(id){if(!atual)return;Object.assign(atual,obj);}else db.transferencias.push(obj);fecharModal();salvarBanco();
}

function excluirTransferencia(id){
  const t=db.transferencias.find(x=>x.id===id);if(!t)return;
  if(!confirmarExclusao("Excluir esta transferência?"))return;
  if(t.origemProducaoId){
    const prod=db.producoes.find(p=>p.id===t.origemProducaoId);
    if(prod)prod.transferidosFresco=Math.max(0,numeroNaoNegativo(prod.transferidosFresco)-1);
  }
  db.transferencias=db.transferencias.filter(x=>x.id!==id);
  salvarBanco();
}

function buscarClienteRelatorio(){
  const input=document.getElementById("buscaClienteRel")||document.getElementById("buscaCliente");
  const out=document.getElementById("resultadoClientes");if(!input||!out)return;
  const termo=String(input.value||"").toLowerCase().trim();
  const encontrados=[...db.clientes].filter(c=>!termo||(c.nome||"").toLowerCase().includes(termo)||String(c.cpf||c.cnpj||"").toLowerCase().includes(termo)).sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
  out.innerHTML=encontrados.length?encontrados.map(c=>`<div class="client-search-result"><div><strong>${esc(c.nome)}</strong><small>${c.cpf||c.cnpj?`CPF/CNPJ: ${esc(c.cpf||c.cnpj)}`:""}</small></div><button class="btn small" onclick="mostrarRelatoriosCliente('${c.id}')">Selecionar cliente</button></div>`).join(""):'<div class="empty-state">Nenhum cliente encontrado.</div>';
}
function relatorios(){
  header("Relatórios por Cliente e Período",`Filtro global atual: ${resumoFiltroGlobal()}`);
  document.getElementById("content").innerHTML=`<div class="global-filter-banner">O período padrão dos relatórios acompanha o Dashboard: <strong>${esc(resumoFiltroGlobal())}</strong></div><div class="card"><div class="section-title"><h3>Localizar cliente</h3></div><div class="client-filter"><input id="buscaClienteRel" placeholder="Digite o nome do cliente ou CPF/CNPJ" oninput="buscarClienteRelatorio()"></div><div id="resultadoClientes"></div></div><div id="relatorioSelecionado" style="margin-top:20px"></div>`;
  buscarClienteRelatorio();
}

function totaisProducao(dados){
  const t={oocitos:0,oocitosViaveis:0,clivados:0,embriõesD7:0,transferidosFresco:0,congeladosDT:0,congeladosVT:0,congelados:0,doseUtilizada:0};
  dados.forEach(x=>{t.oocitos+=numeroNaoNegativo(x.oocitos);t.oocitosViaveis+=numeroNaoNegativo(x.oocitosViaveis);t.clivados+=numeroNaoNegativo(x.clivados);t.embriõesD7+=numeroNaoNegativo(x.embriõesD7);t.transferidosFresco+=numeroNaoNegativo(x.transferidosFresco);t.congeladosDT+=numeroNaoNegativo(x.congeladosDT??x.transferidosDT);t.congeladosVT+=numeroNaoNegativo(x.congeladosVT??x.transferidosVT);t.doseUtilizada+=numeroDecimal(x.doseUtilizada);});t.congelados=t.congeladosDT+t.congeladosVT;return t;
}
function relatorioProducao(clienteId,valor,tipo="dia"){
  const cliente=db.clientes.find(x=>x.id===clienteId);if(!cliente)return;const dados=db.producoes.filter(x=>x.clienteId===clienteId&&dataNoPeriodo(x.data,tipo,valor));if(!dados.length){alert("Não há produção cadastrada para este cliente no período selecionado.");return;}
  const corpo=grupoRelatorioPorData(dados,(itens)=>{const t=totaisProducao(itens);const linhas=itens.map((x,i)=>{const dt=numeroNaoNegativo(x.congeladosDT??x.transferidosDT),vt=numeroNaoNegativo(x.congeladosVT??x.transferidosVT);return `<tr><td>${i+1}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(doadoraRaca(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${formatarDose(x.doseUtilizada)}</td><td>${numeroNaoNegativo(x.oocitos)}</td><td>${numeroNaoNegativo(x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.clivados)}</td><td>${percentual(x.clivados,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.embriõesD7)}</td><td>${percentual(x.embriõesD7,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.transferidosFresco)}</td><td>${dt}</td><td>${vt}</td></tr>`}).join("");return `<table class="report-table"><thead><tr><th>Nº</th><th>DOADORA</th><th>RAÇA DOADORA</th><th>TOURO</th><th>RAÇA TOURO</th><th>DOSE</th><th>OÓCITOS TOTAIS</th><th>OÓCITOS VIÁVEIS</th><th>CLIVAGEM</th><th>%CLIV</th><th>EMB. D7</th><th>%PROD</th><th>FRESCO</th><th>DT</th><th>VT</th></tr></thead><tbody>${linhas}<tr class="total-row"><td colspan="5">TOTAL DO DIA</td><td>${formatarDose(t.doseUtilizada)}</td><td>${t.oocitos}</td><td>${t.oocitosViaveis}</td><td>${t.clivados}</td><td>${percentual(t.clivados,t.oocitosViaveis)}</td><td>${t.embriõesD7}</td><td>${percentual(t.embriõesD7,t.oocitosViaveis)}</td><td>${t.transferidosFresco}</td><td>${t.congeladosDT}</td><td>${t.congeladosVT}</td></tr></tbody></table><div class="report-note"><b>OBS:</b> ${esc(observacoesUnicas(itens)||"-")}</div>`;});
  const g=totaisProducao(dados);const conteudo=`${cabecalhoRelatorioPeriodo("RELATÓRIO PRODUÇÃO IN VITRO DE EMBRIÕES",cliente,tipo,valor)}${corpo}<div class="report-grand-total"><b>TOTAL DO PERÍODO:</b> ${dados.length} OPU(s) | Oócitos totais ${g.oocitos} | Viáveis ${g.oocitosViaveis} | Embriões D7 ${g.embriõesD7} | Fresco ${g.transferidosFresco} | DT ${g.congeladosDT} | VT ${g.congeladosVT}</div>${rodapeSeminna()}`;abrirRelatorioFormatado("Relatório de Produção",cliente,valor,conteudo,"landscape");
}
function relatorioTransferencia(clienteId,valor,tipo="dia"){
  const cliente=db.clientes.find(x=>x.id===clienteId);if(!cliente)return;const dados=db.transferencias.filter(x=>x.clienteId===clienteId&&dataNoPeriodo(x.data,tipo,valor));if(!dados.length){alert("Não há transferências cadastradas para este cliente no período selecionado.");return;}
  const corpo=grupoRelatorioPorData(dados,(itens)=>{const prenhes=itens.filter(x=>x.diagnostico==="Prenhe").length,vazias=itens.filter(x=>x.diagnostico==="Vazia").length,pct=itens.length?Math.round(prenhes/itens.length*100):0;const linhas=itens.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(doadoraRaca(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${esc(x.receptora||"")}</td><td>${esc(x.embriãoGrau||"")}</td><td>${esc(x.embriãoEstagio||"")}</td><td>${esc(x.ovarioOvulou||"")}</td><td>${esc(x.grauCL||"")}</td><td>${esc(x.clCavitario||"")}</td><td>${esc(x.destino||"")}</td><td>${esc(x.diagnostico||"")}</td></tr>`).join("");return `<table class="report-table"><thead><tr><th>Nº</th><th>DOADORA</th><th>RAÇA DOADORA</th><th>TOURO</th><th>RAÇA TOURO</th><th>RECEPTORA</th><th>GRAU D7</th><th>ESTÁGIO D7</th><th>OVÁRIO</th><th>GRAU CL</th><th>CAVITÁRIO</th><th>DESTINO</th><th>DIAGNÓSTICO</th></tr></thead><tbody>${linhas}</tbody></table><table class="report-table report-summary"><tbody><tr><th>TOTAL</th><th>PRENHAS</th><th>VAZIAS</th><th>% PRENHEZ</th></tr><tr><td>${itens.length}</td><td>${prenhes}</td><td>${vazias}</td><td>${pct}%</td></tr></tbody></table><div class="report-note"><b>OBSERVAÇÕES:</b> ${esc(observacoesUnicas(itens)||"-")}</div>`;});const prenhes=dados.filter(x=>x.diagnostico==="Prenhe").length,vazias=dados.filter(x=>x.diagnostico==="Vazia").length,pct=dados.length?Math.round(prenhes/dados.length*100):0;abrirRelatorioFormatado("Relatório de Transferência",cliente,valor,`${cabecalhoRelatorioPeriodo("PLANILHA DE TRANSFERÊNCIA DE EMBRIÕES",cliente,tipo,valor)}${corpo}<div class="report-grand-total"><b>TOTAL DO PERÍODO:</b> ${dados.length} transferências | ${prenhes} prenhas | ${vazias} vazias | ${pct}% prenhez</div>${rodapeSeminna()}`,"landscape");
}


// ============================================================
// V1.9 — SERVIÇO POR CLIENTE/DATA, RAÇAS ABREVIADAS E CARTEIRA PROFISSIONAL
// ============================================================

const PROFISSIONAL_ATIVO_KEY="embriogestor_profissional_ativo_v1";
let profissionalAtivoId=localStorage.getItem(PROFISSIONAL_ATIVO_KEY)||"";
if(!Array.isArray(db.servicosSemen)) db.servicosSemen=[];
(db.clientes||[]).forEach(c=>{if(c.profissionalId===undefined)c.profissionalId="";});

function clientesDisponiveisProfissional(){
  if(!profissionalAtivoId) return db.clientes||[];
  return (db.clientes||[]).filter(c=>c.profissionalId===profissionalAtivoId);
}
function clientePermitidoNoContexto(clienteId){return !profissionalAtivoId||clientesDisponiveisProfissional().some(c=>c.id===clienteId);}
function profissionalAtivoNome(){return db.profissionais.find(p=>p.id===profissionalAtivoId)?.nome||"Todos os profissionais";}
function selecionarProfissionalAtivo(id){
  profissionalAtivoId=id||"";localStorage.setItem(PROFISSIONAL_ATIVO_KEY,profissionalAtivoId);render();
}
function limparProfissionalAtivo(){profissionalAtivoId="";localStorage.removeItem(PROFISSIONAL_ATIVO_KEY);render();}
function contextoProfissionalHTML(){return `<div class="global-filter-banner">Profissional / carteira ativa: <strong>${esc(profissionalAtivoNome())}</strong>${profissionalAtivoId?` <button class="btn small secondary" onclick="limparProfissionalAtivo()">Ver todos</button>`:""}</div>`;}

function carteiras(){
  header("Carteiras por Profissional","Organize os clientes por profissional responsável e cadastre os demais dados a partir dessa carteira");
  const profs=[...(db.profissionais||[])].sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
  const selectProf=`<select id="carteiraProf" onchange="selecionarProfissionalAtivo(this.value)"><option value="">Todos os profissionais</option>${profs.map(p=>`<option value="${esc(p.id)}" ${p.id===profissionalAtivoId?'selected':''}>${esc(p.nome)} — ${esc(p.profissao||'')}</option>`).join('')}</select>`;
  const clientes=clientesDisponiveisProfissional().sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
  const linhas=clientes.map(c=>`<tr><td>${esc(c.nome)}</td><td>${esc(c.propriedade||"")}</td><td>${esc(profissionalNome(c.profissionalId)||"Não definido")}</td><td><button class="btn small secondary" onclick="formCliente('${c.id}')">Editar</button><button class="btn small" onclick="formDoadora('', '${c.id}')">Nova doadora</button><button class="btn small" onclick="formEstoque('', '${c.id}')">Estoque sêmen</button></td></tr>`).join('');
  document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><h3>Selecionar carteira</h3></div><label>Profissional responsável</label>${selectProf}</div>${contextoProfissionalHTML()}<div class="card"><div class="section-title"><h3>Clientes da carteira</h3><button class="btn" onclick="formCliente()">Novo cliente</button></div><div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Propriedade</th><th>Profissional</th><th>Ações rápidas</th></tr></thead><tbody>${linhas||'<tr><td colspan="4">Nenhum cliente nesta carteira.</td></tr>'}</tbody></table></div><div class="quick-actions"><button class="btn secondary" onclick="formDoadora()">Nova doadora</button><button class="btn secondary" onclick="formTouro()">Novo touro</button><button class="btn secondary" onclick="formRaca()">Nova raça</button><button class="btn secondary" onclick="formProfissional()">Novo profissional</button><button class="btn secondary" onclick="formEstoque()">Novo estoque de sêmen</button></div></div>`;
}

function formCliente(id=""){
  const c=db.clientes.find(x=>x.id===id)||{};
  const profPadrao=c.profissionalId||profissionalAtivoId||"";
  modal(id?"Editar cliente":"Novo cliente",`<div class="form-grid">${campo("Nome / Razão Social","nome",c.nome)}${campo("CPF / CNPJ","cpf",c.cpf)}${campo("Propriedade","propriedade",c.propriedade)}${campo("Município","municipio",c.municipio)}${campo("UF","uf",c.uf)}${campo("Telefone","telefone",c.telefone)}${campo("E-mail","email",c.email)}${select("Profissional responsável","profissionalId",db.profissionais,profPadrao)}</div><br><button class="btn" onclick="salvarCliente('${id}')">Salvar</button>`);
}
function salvarCliente(id=""){
  const get=n=>document.querySelector(`[name="${n}"]`)?.value.trim()||"";
  if(!exigir(get("nome"),"Informe o nome do cliente."))return;
  const obj={id:id||idNovo("CLI",db.clientes),nome:get("nome"),cpf:get("cpf"),propriedade:get("propriedade"),municipio:get("municipio"),uf:get("uf"),telefone:get("telefone"),email:get("email"),profissionalId:get("profissionalId")};
  if(id){const a=db.clientes.find(x=>x.id===id);if(a)Object.assign(a,obj);}else db.clientes.push(obj);fecharModal();salvarBanco();
}

const ABREV_RACAS={
 "Holandesa":"HO","Holandês":"HO","Holstein":"HO","Jersey":"JE","Gir":"GI","Gir Leiteiro":"GL","Girolando":"GIRL","Guzerá":"GUZ","Nelore":"NE","Nelore Mocho":"NM","Nelore Pelagens":"NP","Brahman":"BRH","Sindi":"SIN","Tabapuã":"TAB","Angus":"AN","Aberdeen Angus":"AN","Red Angus":"RA","Hereford":"HE","Braford":"BF","Brangus":"BG","Senepol":"SE","Simmental":"SIM","Simental":"SIM","Charolês":"CHA","Limousin":"LIM","Pardo-Suíça":"PS","Brown Swiss":"BS","Montbéliarde":"MON","Fleckvieh":"FL","Canchim":"CAN","Santa Gertrudis":"SG","Wagyu":"WAG","Akaushi":"AKA"
};
function racaAbreviada(nome){
  const n=String(nome||"").trim();if(!n)return "";if(ABREV_RACAS[n])return ABREV_RACAS[n];
  const limpo=n.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9 ]/g," ").trim();
  const ps=limpo.split(/\s+/).filter(Boolean);if(ps.length>1)return ps.map(x=>x[0]).join("").slice(0,4).toUpperCase();return limpo.slice(0,3).toUpperCase();
}
function touroRaca(id){return racaAbreviada(db.touros.find(x=>x.id===id)?.raca||"");}
function doadoraRaca(id){return racaAbreviada(db.doadoras.find(x=>x.id===id)?.raca||"");}

function servicosSemenDo(clienteId,data){return (db.servicosSemen||[]).filter(s=>s.clienteId===clienteId&&s.data===data);}
function formDoseServico(clienteId="",data="",id=""){
  const s=db.servicosSemen.find(x=>x.id===id)||{};clienteId=s.clienteId||clienteId;data=s.data||data||(filtroGlobal.tipo==='dia'?filtroGlobal.valor:hoje());
  modal(id?"Editar sêmen usado no serviço":"Doses usadas no serviço",`<div class="form-grid">${campo("Data do serviço","data",data,"date")}${select("Cliente","clienteId",clientesDisponiveisProfissional(),clienteId)}${select("Touro","touroId",db.touros,s.touroId||"")}${campo("Partida / lote","partida",s.partida||"")}<div><label>Quantidade de doses utilizadas no serviço</label><input name="doses" type="text" inputmode="decimal" value="${esc(s.doses??'1,0')}" placeholder="Ex.: 0,5; 1,0; 1,5"><small class="field-help">Informe uma única vez por serviço (cliente + data + touro/partida), não por doadora.</small></div></div><br><button class="btn" onclick="salvarDoseServico('${id}')">Salvar doses do serviço</button>`);
}
function salvarDoseServico(id=""){
  const get=n=>document.querySelector(`[name="${n}"]`)?.value.trim()||"";const doses=numeroDecimal(get("doses"));
  if(!exigir(get("data"),"Informe a data do serviço."))return;if(!exigir(get("clienteId"),"Selecione o cliente."))return;if(!exigir(get("touroId"),"Selecione o touro."))return;if(!exigir(doses>0,"Informe uma quantidade de doses maior que zero."))return;
  const obj={id:id||idNovo("SRV",db.servicosSemen),data:get("data"),clienteId:get("clienteId"),touroId:get("touroId"),partida:get("partida"),doses};
  if(id){const a=db.servicosSemen.find(x=>x.id===id);if(a)Object.assign(a,obj);}else db.servicosSemen.push(obj);fecharModal();salvarBanco();
}
function excluirDoseServico(id){if(!confirm("Excluir este registro de doses do serviço?"))return;db.servicosSemen=db.servicosSemen.filter(x=>x.id!==id);salvarBanco();}
function blocoSemenServico(clienteId,data,itensProducoes=[]){
  const regs=servicosSemenDo(clienteId,data);const tourosUsados=[...new Set((itensProducoes||[]).map(x=>x.touroId).filter(Boolean))];
  return `<div class="service-semen-box"><div class="section-title"><strong>Sêmen utilizado no serviço</strong><button class="btn small secondary" onclick="formDoseServico('${clienteId}','${data}')">Registrar doses do serviço</button></div>${regs.length?`<div class="table-wrap"><table><thead><tr><th>Touro</th><th>Raça</th><th>Partida</th><th>Doses</th><th>Ações</th></tr></thead><tbody>${regs.map(r=>`<tr><td>${esc(touroNome(r.touroId))}</td><td>${esc(touroRaca(r.touroId))}</td><td>${esc(r.partida||'')}</td><td>${formatarDose(r.doses)}</td><td><button class="btn small secondary" onclick="formDoseServico('${clienteId}','${data}','${r.id}')">Editar</button><button class="btn small danger" onclick="excluirDoseServico('${r.id}')">Excluir</button></td></tr>`).join('')}</tbody></table></div>`:`<div class="note">Nenhuma dose registrada para este serviço.${tourosUsados.length?' Touros usados: '+tourosUsados.map(touroNome).join(', '):''}</div>`}</div>`;
}

function egDashboardAno(tipo,valor){
  if(tipo==="ano") return String(valor||hoje().slice(0,4));
  return String(valor||hoje()).slice(0,4);
}
function egProducoesPorMesSvg(ano){
  const dados=Array.from({length:12},(_,i)=>db.producoes.filter(p=>String(p.data||"").slice(0,4)===ano && Number(String(p.data||"").slice(5,7))===i+1).length);
  const nomes=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const max=Math.max(1,...dados);
  const W=720,H=230,padL=38,padR=18,padT=18,padB=34;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const pts=dados.map((v,i)=>{const x=padL+(plotW*i/11);const y=padT+plotH-(v/max)*plotH;return {x,y,v,i};});
  const poly=pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area=`${padL},${padT+plotH} ${poly} ${padL+plotW},${padT+plotH}`;
  const grid=[0,.25,.5,.75,1].map(fr=>{const y=padT+plotH-fr*plotH;const val=Math.round(max*fr);return `<line x1="${padL}" y1="${y}" x2="${padL+plotW}" y2="${y}" class="eg-chart-grid"/><text x="${padL-8}" y="${y+4}" text-anchor="end" class="eg-chart-axis">${val}</text>`}).join("");
  const labels=pts.map(p=>`<text x="${p.x}" y="${H-10}" text-anchor="middle" class="eg-chart-axis">${nomes[p.i]}</text>`).join("");
  const dots=pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" class="eg-chart-dot"><title>${nomes[p.i]}: ${p.v} produção(ões)</title></circle>`).join("");
  return `<svg class="eg-monthly-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Produções por mês em ${esc(ano)}">${grid}<polygon points="${area}" class="eg-chart-area"/><polyline points="${poly}" class="eg-chart-line"/>${dots}${labels}</svg>`;
}
function egUltimasProducoesHTML(){
  const itens=[...(db.producoes||[])].filter(p=>p.data).sort((a,b)=>String(b.data).localeCompare(String(a.data)) || String(b.id||"").localeCompare(String(a.id||""))).slice(0,5);
  if(!itens.length)return `<div class="empty-state">Nenhuma produção cadastrada.</div>`;
  return `<div class="table-wrap"><table class="eg-latest-table"><thead><tr><th>Data</th><th>Cliente</th><th>Doadora</th><th>Embriões D7</th><th>Congelados</th><th>Tipo</th></tr></thead><tbody>${itens.map(p=>{const dt=numeroNaoNegativo(p.congeladosDT??p.transferidosDT),vt=numeroNaoNegativo(p.congeladosVT??p.transferidosVT),cong=dt+vt;const tipo=dt&&vt?"DT + VT":dt?"DT":vt?"VT":"—";return `<tr><td>${esc(dataBR(p.data))}</td><td>${esc(clienteNome(p.clienteId))}</td><td>${esc(doadoraNome(p.doadoraId))}</td><td>${numeroNaoNegativo(p.embriõesD7)}</td><td>${cong}</td><td>${tipo}</td></tr>`}).join("")}</tbody></table></div><div class="eg-latest-actions"><button class="btn small secondary" onclick="irPara('producoes')">Ver todas as produções</button></div>`;
}
function aplicarDashboard(persistir=true){
  const {tipo,valor}=lerPeriodo("dash");if(!valor)return;
  if(persistir)salvarFiltroGlobal(tipo,valor);
  const prod=db.producoes.filter(x=>dataNoPeriodo(x.data,tipo,valor));
  const te=db.transferencias.filter(x=>dataNoPeriodo(x.data,tipo,valor));
  const opu=prod.length;
  const oocitosViaveis=prod.reduce((a,x)=>a+numeroNaoNegativo(x.oocitosViaveis),0);
  const oocitosTotais=prod.reduce((a,x)=>a+numeroNaoNegativo(x.oocitos),0);
  const embrioes=prod.reduce((a,x)=>a+numeroNaoNegativo(x.embriõesD7),0);
  const fresco=prod.reduce((a,x)=>a+numeroNaoNegativo(x.transferidosFresco),0);
  const dt=prod.reduce((a,x)=>a+numeroNaoNegativo(x.congeladosDT??x.transferidosDT),0);
  const vt=prod.reduce((a,x)=>a+numeroNaoNegativo(x.congeladosVT??x.transferidosVT),0);
  const doses=db.estoque.reduce((a,x)=>a+numeroNaoNegativo(x.saldo),0);
  const embEstoque=db.estoqueEmbrioes.reduce((a,x)=>a+numeroNaoNegativo(x.quantidade),0);
  const ano=egDashboardAno(tipo,valor);
  const out=document.getElementById("dashboardResultado");if(!out)return;
  out.innerHTML=`<div class="filter-summary">Período: <strong>${esc(rotuloPeriodo(tipo,valor))}</strong></div><div class="grid kpis">
  <div class="card"><strong>OPUs / Produções</strong><h2>${opu}</h2></div>
  <div class="card"><strong>Oócitos coletados (viáveis)</strong><h2>${oocitosViaveis}</h2></div>
  <div class="card"><strong>Oócitos coletados totais</strong><h2>${oocitosTotais}</h2></div>
  <div class="card"><strong>Embriões D7</strong><h2>${embrioes}</h2></div>
  <div class="card"><strong>Transferidos a fresco</strong><h2>${fresco}</h2></div>
  <div class="card"><strong>Congelados DT</strong><h2>${dt}</h2></div>
  <div class="card"><strong>Congelados VT</strong><h2>${vt}</h2></div>
  <div class="card"><strong>Transferências</strong><h2>${te.length}</h2></div>
  <div class="card"><strong>Estoque sêmen</strong><h2>${doses}</h2></div>
  <div class="card"><strong>Estoque embriões DT/VT</strong><h2>${embEstoque}</h2></div></div>
  <div class="eg-dashboard-insights">
    <section class="card eg-chart-card"><div class="section-title"><div><h3>Produções por mês</h3><p class="muted">Número de produções lançadas em ${esc(ano)}.</p></div></div>${egProducoesPorMesSvg(ano)}</section>
    <section class="card eg-latest-card"><div class="section-title"><div><h3>Últimas produções</h3><p class="muted">Cinco lançamentos mais recentes do laboratório.</p></div></div>${egUltimasProducoesHTML()}</section>
  </div>`;
}

function producoes(){
  header("Produção de Embriões",`Separada por cliente e data — ${resumoFiltroGlobal()}`);const permitidos=new Set(clientesDisponiveisProfissional().map(c=>c.id));const lista=listaNoPeriodo(db.producoes).filter(x=>!profissionalAtivoId||permitidos.has(x.clienteId));const grupos=agrupadoPorClienteEData(lista);const clienteIds=Object.keys(grupos).sort((a,b)=>nomeClienteOrdenacao(a).localeCompare(nomeClienteOrdenacao(b),"pt-BR"));
  const blocos=clienteIds.map(cid=>{const datas=grupos[cid];const porData=Object.keys(datas).sort((a,b)=>b.localeCompare(a)).map(data=>{const itens=datas[data];return `<div class="client-date-subgroup"><div class="client-date-title">${esc(dataBR(data))}</div><div class="table-wrap"><table><thead><tr><th>Doadora</th><th>Raça</th><th>Touro</th><th>Raça</th><th>Oócitos totais</th><th>Viáveis</th><th>Clivados</th><th>% Cliv.</th><th>Embriões D7</th><th>% Prod.</th><th>Fresco</th><th>Cong. DT</th><th>Cong. VT</th><th>Total cong.</th><th>Ações</th></tr></thead><tbody>${itens.map(x=>{const dt=numeroNaoNegativo(x.congeladosDT??x.transferidosDT),vt=numeroNaoNegativo(x.congeladosVT??x.transferidosVT);return `<tr><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(doadoraRaca(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${numeroNaoNegativo(x.oocitos)}</td><td>${numeroNaoNegativo(x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.clivados)}</td><td>${percentual(x.clivados,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.embriõesD7)}</td><td>${percentual(x.embriõesD7,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.transferidosFresco)}</td><td>${dt}</td><td>${vt}</td><td><strong>${dt+vt}</strong></td><td><button class="btn small secondary" onclick="formProducao('${x.id}')">Editar</button><button class="btn small danger" onclick="excluirProducao('${x.id}')">Excluir</button></td></tr>`}).join("")}</tbody></table></div>${blocoSemenServico(cid,data,itens)}</div>`}).join("");return `<div class="date-group client-group"><div class="date-group-title">CLIENTE: ${esc(nomeClienteOrdenacao(cid))}</div>${porData}</div>`}).join("");
  document.getElementById("content").innerHTML=`${contextoProfissionalHTML()}<div class="global-filter-banner">Mostrando: <strong>${esc(resumoFiltroGlobal())}</strong></div><div class="card"><div class="section-title"><h3>Produção por cliente e data</h3><button class="btn" onclick="formProducao()">Nova produção</button></div>${blocos||'<div class="empty-state">Nenhuma produção no período selecionado.</div>'}</div>`;
}
function formProducao(id=""){
  const p=db.producoes.find(x=>x.id===id)||{},dt=p.congeladosDT??p.transferidosDT??0,vt=p.congeladosVT??p.transferidosVT??0,dataPadrao=filtroGlobal.tipo==="dia"?filtroGlobal.valor:hoje();
  modal(id?"Editar produção de embriões":"Nova produção de embriões",`<div class="form-grid">${campo("Data","data",p.data||dataPadrao,"date")}${select("Cliente","clienteId",clientesDisponiveisProfissional(),p.clienteId||"")}<div><label>Doadora</label><select name="doadoraId"><option value="">Selecione primeiro o cliente...</option></select></div>${select("Touro","touroId",db.touros,p.touroId||"")}${campo("Oócitos totais","oocitos",p.oocitos??0,"number")}${campo("Oócitos viáveis","oocitosViaveis",p.oocitosViaveis??0,"number")}${campo("Clivados","clivados",p.clivados??0,"number")}${campo("Embriões viáveis no D7","embriõesD7",p.embriõesD7??0,"number")}${campo("Embriões transferidos a fresco","transferidosFresco",p.transferidosFresco??0,"number")}${campo("Embriões congelados DT","congeladosDT",dt,"number")}${campo("Embriões congelados VT","congeladosVT",vt,"number")}${campo("Observações","obs",p.obs||"")}</div><br><div class="note"><strong>Doses:</strong> a quantidade de sêmen não é mais informada por doadora. Depois de salvar as produções, registre uma única vez as doses usadas no bloco “Sêmen utilizado no serviço” do cliente/data.</div><br><button class="btn" onclick="salvarProducao('${id}')">Salvar produção</button>`);
  document.querySelector('[name="clienteId"]').addEventListener('change',()=>atualizarDoadorasPorCliente("doadoraId",""));atualizarDoadorasPorCliente("doadoraId",p.doadoraId||"");
}
function salvarProducao(id=""){
  const get=n=>document.querySelector(`[name="${n}"]`)?.value.trim()||"";const ks=["oocitos","oocitosViaveis","clivados","embriõesD7","transferidosFresco","congeladosDT","congeladosVT"],n={};ks.forEach(k=>n[k]=Number(get(k)));
  if(!exigir(get("data"),"Informe a data da produção."))return;if(!exigir(get("clienteId"),"Selecione o cliente."))return;const d=db.doadoras.find(x=>x.id===get("doadoraId"));if(!exigir(d&&d.clienteId===get("clienteId"),"Selecione uma doadora pertencente ao cliente."))return;if(!exigir(get("touroId"),"Selecione o touro."))return;if(!exigir(ks.every(k=>Number.isInteger(n[k])&&n[k]>=0),"As quantidades devem ser números inteiros não negativos."))return;if(!exigir(n.oocitosViaveis<=n.oocitos,"Oócitos viáveis não podem superar o total de oócitos."))return;if(!exigir(n.clivados<=n.oocitosViaveis,"Clivados não podem superar os oócitos viáveis."))return;if(!exigir(n.embriõesD7<=n.clivados,"Embriões D7 não podem superar os clivados."))return;if(!exigir(n.transferidosFresco+n.congeladosDT+n.congeladosVT<=n.embriõesD7,"Fresco + DT + VT não podem superar os embriões D7."))return;if(id){const preenchidas=db.transferencias.filter(t=>t.origemProducaoId===id&&transferenciaTemDados(t)).length;if(!exigir(n.transferidosFresco>=preenchidas,`Existem ${preenchidas} transferências a fresco já preenchidas.`))return;}
  const obj={id:id||idNovo("PROD",db.producoes),data:get("data"),clienteId:get("clienteId"),doadoraId:get("doadoraId"),touroId:get("touroId"),...n,transferidosDT:n.congeladosDT,transferidosVT:n.congeladosVT,congelados:n.congeladosDT+n.congeladosVT,tipoCongelamento:n.congeladosDT&&n.congeladosVT?"DT + VT":n.congeladosDT?"DT":n.congeladosVT?"VT":"",obs:get("obs")};if(id){const a=db.producoes.find(x=>x.id===id);if(!a)return;Object.assign(a,obj);}else db.producoes.push(obj);sincronizarEstoqueEmbrioesProducao(obj);sincronizarTransferenciasFrescoProducao(obj);fecharModal();salvarBanco();
}

function resumoTourosServico(clienteId,data,itens){
  const regs=servicosSemenDo(clienteId,data), ids=[...new Set([...(itens||[]).map(x=>x.touroId),...regs.map(x=>x.touroId)].filter(Boolean))];
  const linhas=ids.map(tid=>{const prods=(itens||[]).filter(x=>x.touroId===tid),viaveis=prods.reduce((a,x)=>a+numeroNaoNegativo(x.oocitosViaveis),0),emb=prods.reduce((a,x)=>a+numeroNaoNegativo(x.embriõesD7),0),rr=regs.filter(r=>r.touroId===tid),partidas=[...new Set(rr.map(r=>r.partida).filter(Boolean))].join(', ')||'-',doses=rr.reduce((a,r)=>a+numeroDecimal(r.doses),0);return `<tr><td>${esc(touroNome(tid))}</td><td>${esc(partidas)}</td><td>${doses?formatarDose(doses):'-'}</td><td>${esc(touroRaca(tid))}</td><td>${percentual(emb,viaveis)}</td></tr>`}).join('');
  return `<table class="report-table report-bulls"><thead><tr><th>TOURO</th><th>PARTIDA</th><th>DOSES</th><th>RAÇA</th><th>PRODUÇÃO % (EMBRIÕES/OÓCITOS VIÁVEIS)</th></tr></thead><tbody>${linhas||'<tr><td colspan="5">Sem dados de touro para o serviço.</td></tr>'}</tbody></table>`;
}
function relatorioProducao(clienteId,valor,tipo="dia"){
  const cliente=db.clientes.find(x=>x.id===clienteId);if(!cliente)return;const dados=db.producoes.filter(x=>x.clienteId===clienteId&&dataNoPeriodo(x.data,tipo,valor));if(!dados.length){alert("Não há produção cadastrada para este cliente no período selecionado.");return;}
  const corpo=grupoRelatorioPorData(dados,(itens)=>{const t=totaisProducao(itens),data=itens[0]?.data||"";const linhas=itens.map((x,i)=>{const dt=numeroNaoNegativo(x.congeladosDT??x.transferidosDT),vt=numeroNaoNegativo(x.congeladosVT??x.transferidosVT);return `<tr><td>${i+1}</td><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(doadoraRaca(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${numeroNaoNegativo(x.oocitos)}</td><td>${numeroNaoNegativo(x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.clivados)}</td><td>${percentual(x.clivados,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.embriõesD7)}</td><td>${percentual(x.embriõesD7,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.transferidosFresco)}</td><td>${dt}</td><td>${vt}</td></tr>`}).join("");return `<table class="report-table"><thead><tr><th>Nº</th><th>DOADORA</th><th>RAÇA</th><th>TOURO</th><th>RAÇA</th><th>OÓCITOS TOTAIS</th><th>OÓCITOS VIÁVEIS</th><th>CLIVAGEM</th><th>%CLIV</th><th>EMB. D7</th><th>%PROD</th><th>FRESCO</th><th>DT</th><th>VT</th></tr></thead><tbody>${linhas}<tr class="total-row"><td colspan="5">TOTAL DO DIA</td><td>${t.oocitos}</td><td>${t.oocitosViaveis}</td><td>${t.clivados}</td><td>${percentual(t.clivados,t.oocitosViaveis)}</td><td>${t.embriõesD7}</td><td>${percentual(t.embriõesD7,t.oocitosViaveis)}</td><td>${t.transferidosFresco}</td><td>${t.congeladosDT}</td><td>${t.congeladosVT}</td></tr></tbody></table><div class="report-note"><b>OBS:</b> ${esc(observacoesUnicas(itens)||"-")}</div>${resumoTourosServico(clienteId,data,itens)}`;});
  const g=totaisProducao(dados),servicos=new Set(dados.map(x=>`${x.clienteId}|${x.data}`)).size;const conteudo=`${cabecalhoRelatorioPeriodo("RELATÓRIO PRODUÇÃO IN VITRO DE EMBRIÕES",cliente,tipo,valor)}${corpo}<div class="report-grand-total"><b>TOTAL DO PERÍODO:</b> ${servicos} OPU(s) | Oócitos totais ${g.oocitos} | Viáveis ${g.oocitosViaveis} | Embriões D7 ${g.embriõesD7} | Fresco ${g.transferidosFresco} | DT ${g.congeladosDT} | VT ${g.congeladosVT}</div>${rodapeSeminna()}`;abrirRelatorioFormatado("Relatório de Produção",cliente,valor,conteudo,"landscape");
}

function relatorios(){
  header("Relatórios por Cliente e Período",`Filtro global atual: ${resumoFiltroGlobal()}`);document.getElementById("content").innerHTML=`${contextoProfissionalHTML()}<div class="global-filter-banner">O período padrão dos relatórios acompanha o Dashboard: <strong>${esc(resumoFiltroGlobal())}</strong></div><div class="card"><div class="section-title"><h3>Localizar cliente</h3></div><div class="client-filter"><input id="buscaClienteRel" placeholder="Digite o nome do cliente ou CPF/CNPJ" oninput="buscarClienteRelatorio()"></div><div id="resultadoClientes"></div></div><div id="relatorioSelecionado" style="margin-top:20px"></div>`;buscarClienteRelatorio();
}
function buscarClienteRelatorio(){
  const input=document.getElementById("buscaClienteRel")||document.getElementById("buscaCliente"),out=document.getElementById("resultadoClientes");if(!input||!out)return;const termo=String(input.value||"").toLowerCase().trim();const encontrados=clientesDisponiveisProfissional().filter(c=>!termo||(c.nome||"").toLowerCase().includes(termo)||String(c.cpf||c.cnpj||"").toLowerCase().includes(termo)).sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));out.innerHTML=encontrados.length?encontrados.map(c=>`<div class="client-search-result"><div><strong>${esc(c.nome)}</strong><small>${profissionalNome(c.profissionalId)?`Profissional: ${esc(profissionalNome(c.profissionalId))}`:""}</small></div><button class="btn small" onclick="mostrarRelatoriosCliente('${c.id}')">Selecionar cliente</button></div>`).join(""):'<div class="empty-state">Nenhum cliente encontrado.</div>';
}


function formEstoque(id="",clienteId=""){
  const e=db.estoque.find(x=>x.id===id)||{};clienteId=e.clienteId||clienteId||"";
  modal(id?"Editar estoque de sêmen":"Nova entrada de sêmen",`<div class="form-grid">${select("Cliente","clienteId",clientesDisponiveisProfissional(),clienteId)}${select("Touro","touroId",db.touros,e.touroId||"")}${campo("Partida / lote","partida",e.partida||"")}${`<div><label>Quantidade de entrada</label><input type="number" name="quantidade" min="0" step="0.1" inputmode="decimal" value="${esc(e.quantidade??0)}"></div>`}${campo("Data de entrada","data",e.data||hoje(),"date")}<div><label>Tipo de recipiente</label><input value="CANECA" disabled><input type="hidden" name="recipienteTipo" value="CANECA"></div>${campo("Identificação da caneca","recipiente",e.recipiente||"")}${campo("Observações","obs",e.obs||"")}</div><br><button class="btn" onclick="salvarEstoque('${id}')">Salvar</button>`);
}



// ============================================================
// V2.6 — ACESSO ADMINISTRADOR + PORTAL DE CONSULTA ISOLADO
// ============================================================

const EG_PERFIS = ["Administrador","Consulta"];
const EG_MENU_PERFIL = {
  "Administrador": ["dashboard","clientes","doadoras","touros","racas","profissionais","carteiras","estoque","estoqueEmbrioes","movimentacoes","aspiracoes","producoes","transferencias","relatorios","importarDados","usuarios","nuvem"],
  "Consulta": ["dashboard","doadoras","estoque","estoqueEmbrioes","producoes","transferencias","relatorios"]
};

function egSessaoApp(){
  try{return JSON.parse(sessionStorage.getItem("embriogestor_auth"))||null;}catch{return null;}
}
function egPerfilAtual(){return egSessaoApp()?.perfil||"Administrador";}
function egClienteSessaoId(){return egSessaoApp()?.clienteId||"";}
function egEhAdmin(){return egPerfilAtual()==="Administrador";}
function egSomenteConsulta(){return !egEhAdmin();}
function egPaginaPermitida(id){return (EG_MENU_PERFIL[egPerfilAtual()]||EG_MENU_PERFIL.Consulta).includes(id);}
function egPodeEditar(){return egEhAdmin();}
function egNegarEdicao(){alert("Este acesso é somente para consulta. Não é permitido criar, editar ou excluir registros.");return false;}

function egNormalizarUsuariosCliente(){
  if(!Array.isArray(db.usuarios))db.usuarios=[];
  db.usuarios.forEach(u=>{
    if(u.perfil!=="Administrador")u.perfil="Consulta";
    if(!("clienteId" in u))u.clienteId="";
  });
}

function egAplicarMenuAcesso(){
  const menu=document.getElementById("menu"); if(!menu)return;
  egNormalizarUsuariosCliente();
  const permitidas=new Set(EG_MENU_PERFIL[egPerfilAtual()]||EG_MENU_PERFIL.Consulta);
  const itens=MENU.filter(([id])=>permitidas.has(id));
  menu.innerHTML=itens.map(([id,nome])=>`<button data-page="${id}" onclick="irPara('${id}')">${nome}</button>`).join("");
  const sair=document.createElement("button");
  sair.type="button"; sair.className="menu-sair"; sair.textContent="Sair";
  sair.onclick=()=>{if(typeof egSair==="function")egSair();else{sessionStorage.removeItem("embriogestor_auth");location.reload();}};
  menu.appendChild(sair);
  const rodape=document.querySelector('.sidebar-footer');
  if(rodape){
    const s=egSessaoApp();
    const cliente=s?.clienteId?clienteNome(s.clienteId):"";
    rodape.innerHTML=s?`<strong>${esc(s.nome||s.usuario||'Usuário')}</strong><br>${esc(s.perfil||'')}${cliente?`<br><small>${esc(cliente)}</small>`:""}`:'Dados locais + Google Drive opcional';
  }
}

function irPara(novaPagina){
  if(!egPaginaPermitida(novaPagina)){alert("Seu usuário não possui acesso a este módulo.");return;}
  page=novaPagina; clienteSelecionado=null; render();
}

// Mantém o nome legado desta função porque vários módulos já a utilizam.
// Administrador enxerga todos os clientes (ou a carteira profissional selecionada).
// Consulta enxerga exclusivamente o cliente vinculado ao próprio login.
function clientesDisponiveisProfissional(){
  if(egEhAdmin()){
    if(!profissionalAtivoId)return db.clientes||[];
    return (db.clientes||[]).filter(c=>c.profissionalId===profissionalAtivoId);
  }
  const cid=egClienteSessaoId();
  if(!cid)return [];
  return (db.clientes||[]).filter(c=>c.id===cid);
}
function clientePermitidoNoContexto(clienteId){return clientesDisponiveisProfissional().some(c=>c.id===clienteId);}
function profissionalAtivoNome(){
  if(!egEhAdmin())return clienteNome(egClienteSessaoId())||"Cliente não vinculado";
  return db.profissionais.find(p=>p.id===profissionalAtivoId)?.nome||"Todos os profissionais";
}
function selecionarProfissionalAtivo(id){
  if(!egEhAdmin()){alert("Somente o Administrador pode alternar carteiras.");return;}
  profissionalAtivoId=id||"";localStorage.setItem(PROFISSIONAL_ATIVO_KEY,profissionalAtivoId);render();
}
function limparProfissionalAtivo(){
  if(!egEhAdmin())return;
  profissionalAtivoId="";localStorage.removeItem(PROFISSIONAL_ATIVO_KEY);render();
}
function contextoProfissionalHTML(){
  if(!egEhAdmin())return `<div class="global-filter-banner">Consulta do cliente: <strong>${esc(clienteNome(egClienteSessaoId())||'Não vinculado')}</strong></div>`;
  const nome=profissionalAtivoNome();
  return `<div class="global-filter-banner">Carteira visível: <strong>${esc(nome)}</strong>${profissionalAtivoId?` <button class="btn small secondary" onclick="limparProfissionalAtivo()">Ver todos</button>`:""}</div>`;
}

function egComEscopoClientes(fn){
  if(egEhAdmin())return fn();
  const ids=new Set(clientesDisponiveisProfissional().map(c=>c.id));
  const backup={};
  const mapa={
    clientes:x=>ids.has(x.id),
    doadoras:x=>ids.has(x.clienteId),
    estoque:x=>ids.has(x.clienteId),
    movimentacoes:x=>ids.has(x.clienteId),
    estoqueEmbrioes:x=>ids.has(x.clienteId),
    aspiracoes:x=>ids.has(x.clienteId),
    producoes:x=>ids.has(x.clienteId),
    transferencias:x=>ids.has(x.clienteId),
    servicosSemen:x=>ids.has(x.clienteId)
  };
  try{
    Object.entries(mapa).forEach(([k,f])=>{backup[k]=db[k];db[k]=(db[k]||[]).filter(f);});
    return fn();
  } finally {Object.entries(backup).forEach(([k,v])=>db[k]=v);}
}

const _egDashboard=dashboard, _egClientes=clientes, _egDoadoras=doadoras, _egMovimentacoes=movimentacoes, _egAspiracoes=aspiracoes;
dashboard=function(){return egComEscopoClientes(()=>_egDashboard());};
clientes=function(){return egComEscopoClientes(()=>_egClientes());};
doadoras=function(){return egComEscopoClientes(()=>_egDoadoras());};
movimentacoes=function(){return egComEscopoClientes(()=>_egMovimentacoes());};
aspiracoes=function(){return egComEscopoClientes(()=>_egAspiracoes());};

const _egCarteiras=carteiras;
carteiras=function(){if(!egEhAdmin()){alert("Somente Administradores acessam Carteiras por Profissional.");page="dashboard";return dashboard();}return _egCarteiras();};

// Cadastro de cliente permanece administrativo.
function formCliente(id=""){
  if(!egEhAdmin())return egNegarEdicao();
  const c=db.clientes.find(x=>x.id===id)||{};
  const pid=c.profissionalId||profissionalAtivoId||"";
  const campoProf=select("Profissional responsável","profissionalId",db.profissionais,pid);
  modal(id?"Editar cliente":"Novo cliente",`<div class="form-grid">${campo("Nome / Razão Social","nome",c.nome)}${campo("CPF / CNPJ","cpf",c.cpf)}${campo("Propriedade","propriedade",c.propriedade)}${campo("Município","municipio",c.municipio)}${campo("UF","uf",c.uf)}${campo("Telefone","telefone",c.telefone)}${campo("E-mail","email",c.email)}${campoProf}</div><br><button class="btn" onclick="salvarCliente('${id}')">Salvar</button>`);
}
function salvarCliente(id=""){
  if(!egEhAdmin())return egNegarEdicao();
  const get=n=>document.querySelector(`[name="${n}"]`)?.value.trim()||"";
  if(!exigir(get("nome"),"Informe o nome do cliente."))return;
  const obj={id:id||idNovo("CLI",db.clientes),nome:get("nome"),cpf:get("cpf"),propriedade:get("propriedade"),municipio:get("municipio"),uf:get("uf"),telefone:get("telefone"),email:get("email"),profissionalId:get("profissionalId")};
  if(id){const a=db.clientes.find(x=>x.id===id);if(!a)return;Object.assign(a,obj);}else db.clientes.push(obj);
  fecharModal();salvarBanco();
}

// Atalho direto no cadastro do cliente para criar/redefinir seu acesso de consulta.
function formAcessoCliente(clienteId){
  if(!egEhAdmin())return;
  const c=db.clientes.find(x=>x.id===clienteId);if(!c)return;
  egNormalizarUsuariosCliente();
  const existente=(db.usuarios||[]).find(u=>u.perfil!=="Administrador"&&u.clienteId===clienteId);
  if(existente)return formUsuario(existente.id,clienteId);
  return formUsuario("",clienteId);
}

// Usuários acompanham o banco e, portanto, os backups/sincronização do Administrador.
function usuariosPermissoes(){
  if(!egEhAdmin()){alert("Somente Administradores podem gerenciar acessos.");page="dashboard";return dashboard();}
  egNormalizarUsuariosCliente();
  header("Usuários e Acessos","Crie o login de consulta de cada cliente");
  const linhas=(db.usuarios||[]).map(u=>`<tr><td>${esc(u.nome||"")}</td><td>${esc(u.usuario||"")}</td><td>${badge(u.perfil||"Consulta")}</td><td>${esc(u.clienteId?clienteNome(u.clienteId):"—")}</td><td>${badge(u.ativo===false?"Inativo":"Ativo")}</td><td><button class="btn small secondary" onclick="formUsuario('${u.id}','${u.clienteId||""}')">Editar</button>${u.perfil!=="Administrador"&&u.clienteId?`<button class="btn small" onclick="gerarPacoteAcessoCliente('${u.id}')">Gerar acesso</button>`:""}<button class="btn small danger" onclick="excluirUsuario('${u.id}')">Excluir</button></td></tr>`).join("");
  document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><div><h3>Acessos do sistema</h3><p class="muted">O Administrador possui acesso total. Para cada cliente, crie um usuário de Consulta vinculado diretamente ao cadastro desse cliente.</p></div><button class="btn" onclick="formUsuario()">Novo acesso</button></div><div class="table-wrap"><table><thead><tr><th>Nome</th><th>Usuário</th><th>Perfil</th><th>Cliente vinculado</th><th>Status</th><th>Ações</th></tr></thead><tbody>${linhas||'<tr><td colspan="6">Nenhum acesso cadastrado.</td></tr>'}</tbody></table></div></div>`;
}
function formUsuario(id="",clienteIdInicial=""){
  if(!egEhAdmin())return;
  egNormalizarUsuariosCliente();
  const u=(db.usuarios||[]).find(x=>x.id===id)||{};
  const perfil=u.perfil||"Consulta";
  const clienteId=perfil==="Administrador"?"":(u.clienteId||clienteIdInicial||"");
  const clienteCampo=select("Cliente vinculado","clienteId",db.clientes,clienteId);
  modal(id?"Editar acesso":"Novo acesso",`<div class="form-grid">${campo("Nome","nome",u.nome|| (clienteId?clienteNome(clienteId):""))}${campo("Usuário","usuario",u.usuario||"")}${select("Perfil","perfil",EG_PERFIS,perfil)}${clienteCampo}<div><label>${id?"Nova senha (deixe em branco para manter)":"Senha"}</label><input name="senha" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres"></div>${select("Status","ativo",["Ativo","Inativo"],u.ativo===false?"Inativo":"Ativo")}</div><br><div class="note"><strong>Consulta:</strong> o usuário verá somente os dados do cliente selecionado e não poderá criar, editar ou excluir registros.</div><br><button class="btn" onclick="salvarUsuarioSistema('${id}')">Salvar acesso</button>`);
  const perfilEl=document.querySelector('[name="perfil"]');
  const clienteEl=document.querySelector('[name="clienteId"]');
  const atualizar=()=>{if(!perfilEl||!clienteEl)return;clienteEl.disabled=perfilEl.value==="Administrador";if(perfilEl.value==="Administrador")clienteEl.value="";};
  perfilEl?.addEventListener('change',atualizar);atualizar();
}
async function salvarUsuarioSistema(id=""){
  if(!egEhAdmin())return;
  const get=n=>document.querySelector(`[name="${n}"]`)?.value.trim()||"";
  const nome=get("nome"),usuario=get("usuario").toLowerCase(),perfil=get("perfil")||"Consulta",clienteId=get("clienteId"),senha=document.querySelector('[name="senha"]')?.value||"";
  if(!nome||!usuario){alert("Informe nome e usuário.");return;}
  if(!EG_PERFIS.includes(perfil)){alert("Perfil inválido.");return;}
  if(perfil==="Consulta"&&!clienteId){alert("Selecione o cliente que este login poderá consultar.");return;}
  if((!id||senha)&&senha.length<6){alert("A senha deve possuir pelo menos 6 caracteres.");return;}
  if((db.usuarios||[]).some(x=>x.id!==id&&String(x.usuario).toLowerCase()===usuario)){alert("Este usuário já existe.");return;}
  if(perfil==="Consulta"&&(db.usuarios||[]).some(x=>x.id!==id&&x.perfil!=="Administrador"&&x.clienteId===clienteId&&x.ativo!==false)){
    if(!confirm("Este cliente já possui outro acesso ativo. Deseja criar/manter mais de um login de consulta para ele?"))return;
  }
  const atual=(db.usuarios||[]).find(x=>x.id===id);
  const senhaHash=senha?(typeof egHash==="function"?await egHash(senha):""):(atual?.senhaHash||"");
  const obj={id:id||idNovo("USR",db.usuarios),nome,usuario,perfil,clienteId:perfil==="Administrador"?"":clienteId,profissionalId:"",senhaHash,ativo:get("ativo")!=="Inativo",criadoEm:atual?.criadoEm||new Date().toISOString(),atualizadoEm:new Date().toISOString()};
  if(id&&atual)Object.assign(atual,obj);else db.usuarios.push(obj);
  fecharModal();salvarBanco();
}
function gerarPacoteClientePorCliente(clienteId){
  if(!egEhAdmin())return;
  const u=(db.usuarios||[]).find(x=>x.perfil!=="Administrador"&&x.clienteId===clienteId&&x.ativo!==false);
  if(!u){alert("Este cliente ainda não possui um acesso ativo. Clique em Acesso do cliente, crie usuário e senha e depois gere o pacote.");return;}
  gerarPacoteAcessoCliente(u.id);
}

function gerarPacoteAcessoCliente(usuarioId){
  if(!egEhAdmin())return;
  const u=(db.usuarios||[]).find(x=>x.id===usuarioId);
  if(!u||u.perfil==="Administrador"||!u.clienteId){alert("Selecione um acesso de Consulta vinculado a um cliente.");return;}
  const cid=u.clienteId;
  const cliente=(db.clientes||[]).find(c=>c.id===cid);if(!cliente){alert("Cliente vinculado não encontrado.");return;}
  const doadoras=(db.doadoras||[]).filter(x=>x.clienteId===cid);
  const doadoraIds=new Set(doadoras.map(x=>x.id));
  const estoque=(db.estoque||[]).filter(x=>x.clienteId===cid);
  const estoqueIds=new Set(estoque.map(x=>x.id));
  const producoes=(db.producoes||[]).filter(x=>x.clienteId===cid);
  const transferencias=(db.transferencias||[]).filter(x=>x.clienteId===cid);
  const aspiracoes=(db.aspiracoes||[]).filter(x=>x.clienteId===cid);
  const estoqueEmbrioes=(db.estoqueEmbrioes||[]).filter(x=>x.clienteId===cid);
  const movimentacoes=(db.movimentacoes||[]).filter(x=>x.clienteId===cid||estoqueIds.has(x.estoqueId));
  const servicosSemen=(db.servicosSemen||[]).filter(x=>x.clienteId===cid);
  const touroIds=new Set([...estoque,...producoes,...transferencias,...aspiracoes,...estoqueEmbrioes,...servicosSemen].map(x=>x.touroId).filter(Boolean));
  const touros=(db.touros||[]).filter(t=>touroIds.has(t.id));
  const racas=[...new Set([...doadoras.map(d=>d.raca),...touros.map(t=>t.raca)].filter(Boolean))];
  const banco={versao:9,clientes:[cliente],fazendas:[],doadoras,touros,racas,profissionais:[],usuarios:[],estoque,movimentacoes,estoqueEmbrioes,aspiracoes,producoes,transferencias,congelamentos:[],servicosSemen};
  const usuario={...u,perfil:"Consulta",clienteId:cid,profissionalId:""};
  const pacote={formato:"EmbrioGestorClienteAccess",versaoPacote:1,geradoEm:new Date().toISOString(),cliente:{id:cliente.id,nome:cliente.nome},usuario,banco};
  const blob=new Blob([JSON.stringify(pacote,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`EmbrioGestor_Acesso_${String(cliente.nome||cid).replace(/[^a-zA-Z0-9_-]+/g,"_")}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  alert("Arquivo de acesso gerado. Envie este arquivo ao cliente junto com o link e o usuário/senha.");
}

function excluirUsuario(id){
  if(!egEhAdmin())return;
  const sess=egSessaoApp();if(sess?.id===id){alert("Você não pode excluir o usuário que está conectado.");return;}
  const u=(db.usuarios||[]).find(x=>x.id===id);if(!u)return;
  if(!confirmarExclusao(`Excluir o acesso ${u.nome||u.usuario}?`))return;
  db.usuarios=db.usuarios.filter(x=>x.id!==id);salvarBanco();
}

// Consulta: bloqueio efetivo de mutações, mesmo que algum botão antigo permaneça visível.
if(!window.__EG_MUTACOES_PROTEGIDAS__){
  window.__EG_MUTACOES_PROTEGIDAS__=true;
  ["salvarCliente","salvarDoadora","salvarTouro","salvarRaca","salvarProfissional","salvarEstoque","salvarMovimentacao","salvarAspiracao","salvarProducao","salvarTransferencia","salvarDiagnostico","salvarEstoqueEmbriao","salvarDoseServico",
   "excluirCliente","excluirDoadora","excluirTouro","excluirRaca","excluirProfissional","excluirEstoque","excluirMovimentacao","excluirAspiracao","excluirProducao","excluirTransferencia","excluirEstoqueEmbriao"].forEach(nome=>{
      const original=window[nome];if(typeof original!=="function")return;
      window[nome]=function(...args){if(!egPodeEditar())return egNegarEdicao();return original.apply(this,args);};
   });
}

function egAtualizarInterfacePerfil(){
  egNormalizarUsuariosCliente();
  if(!egEhAdmin()) profissionalAtivoId="";
  egAplicarMenuAcesso();
  if(!egPaginaPermitida(page))page="dashboard";
  if(egSomenteConsulta())document.body.classList.add("eg-readonly");else document.body.classList.remove("eg-readonly");
  const exportBtn=[...document.querySelectorAll(".topbar-actions button")].find(b=>/exportar backup/i.test(b.textContent||""));
  if(exportBtn)exportBtn.style.display=egEhAdmin()?"":"none";
}


// ============================================================
// V2.7 — ACESSO EXCLUSIVO DO ADMINISTRADOR
// ============================================================
function egPerfilAtual(){return "Administrador";}
function egEhAdmin(){return true;}
function egSomenteConsulta(){return false;}
function egPodeEditar(){return true;}
function egPaginaPermitida(id){return MENU.some(([menuId])=>menuId===id);}
function egClienteSessaoId(){return "";}
function egNormalizarUsuariosCliente(){
  if(!Array.isArray(db.usuarios))db.usuarios=[];
  db.usuarios.forEach(u=>{if(u.perfil==="Administrador")u.clienteId="";});
}
function egAplicarMenuAcesso(){
  const menu=document.getElementById("menu");if(!menu)return;
  menu.innerHTML=MENU.map(([id,nome])=>`<button data-page="${id}" onclick="irPara('${id}')">${nome}</button>`).join("");
  const sair=document.createElement("button");sair.type="button";sair.className="menu-sair";sair.textContent="Sair";
  sair.onclick=()=>{if(typeof egSair==="function")egSair();else{sessionStorage.removeItem("embriogestor_auth");location.reload();}};
  menu.appendChild(sair);
  const rodape=document.querySelector(".sidebar-footer"),s=typeof egSessaoApp==="function"?egSessaoApp():null;
  if(rodape)rodape.innerHTML=s?`<strong>${esc(s.nome||s.usuario||"Administrador")}</strong><br>Administrador`:'Dados locais + Google Drive opcional';
}
function egAtualizarInterfacePerfil(){
  egNormalizarUsuariosCliente();egAplicarMenuAcesso();document.body.classList.remove("eg-readonly");
  const exportBtn=[...document.querySelectorAll(".topbar-actions button")].find(b=>/exportar backup/i.test(b.textContent||""));if(exportBtn)exportBtn.style.display="";
}

// Atualiza dados antigos na abertura da v1.9.
db.producoes.forEach(p=>{if(!Number.isFinite(Number(p.doseUtilizada)))p.doseUtilizada=0;});
sincronizarTodasTransferenciasFresco();
db.versao=9;localStorage.setItem(DB_KEY,JSON.stringify(db));
if(typeof egAtualizarInterfacePerfil==="function")egAtualizarInterfacePerfil();
render();

// ============================================================
// V2.8 — AJUSTES DE OPU, ABAS MINIMIZADAS E SÊMEN AUTOMÁTICO
// ============================================================

function egNomeComInicialMaiuscula(nome){
  return String(nome||"").trim().replace(/(^|\s)([a-zà-öø-ÿ])/g,(m,p,l)=>p+l.toUpperCase());
}

function egChaveServicoProducao(p){
  return `${String(p?.clienteId||"")}|${String(p?.data||"")}`;
}

function egContarServicosProducao(lista){
  return new Set((lista||[]).filter(p=>p?.clienteId&&p?.data).map(egChaveServicoProducao)).size;
}

function egDetalhesCliente(clienteId, tituloExtra, conteudo, quantidade=0){
  const nome=nomeClienteOrdenacao(clienteId);
  return `<details class="eg-client-collapsible"><summary><span class="eg-client-chevron">›</span><strong>${esc(nome)}</strong><span class="eg-client-count">${quantidade}${tituloExtra?` · ${esc(tituloExtra)}`:""}</span></summary><div class="eg-client-collapsible-body">${conteudo}</div></details>`;
}

function doadoras(){
  header("Doadoras","Doadoras organizadas por cliente");
  const clientes=[...db.clientes].sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
  const blocos=clientes.map(c=>{
    const itens=db.doadoras.filter(d=>d.clienteId===c.id).sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
    if(!itens.length)return "";
    return egDetalhesCliente(c.id,"doadoras",tabelaDoadoras(itens),itens.length);
  }).join("");
  const semCliente=db.doadoras.filter(d=>!db.clientes.some(c=>c.id===d.clienteId));
  const extra=semCliente.length?`<details class="eg-client-collapsible"><summary><span class="eg-client-chevron">›</span><strong>Sem cliente vinculado</strong><span class="eg-client-count">${semCliente.length} doadoras</span></summary><div class="eg-client-collapsible-body">${tabelaDoadoras(semCliente)}</div></details>`:"";
  document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><h3>Doadoras por cliente</h3><button class="btn" onclick="formDoadora()">Nova doadora</button></div><div class="eg-client-list">${blocos}${extra}</div>${!blocos&&!extra?'<div class="empty-state">Nenhuma doadora cadastrada.</div>':''}</div>`;
}

function estoque(){
  recalcularTodosEstoques();
  header("Estoque de Sêmen","Estoque separado por cliente — recipiente: CANECA");
  const clientes=[...db.clientes].sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
  const blocos=clientes.map(c=>{
    const itens=db.estoque.filter(e=>e.clienteId===c.id);
    if(!itens.length)return "";
    const saldo=itens.reduce((a,e)=>a+numeroNaoNegativo(e.saldo),0);
    const tabela=`<div class="table-wrap"><table><thead><tr><th>Touro</th><th>Raça</th><th>Central</th><th>Partida / lote</th><th>Quantidade</th><th>Usadas</th><th>Saldo</th><th>Caneca</th><th>Observações</th><th>Ações</th></tr></thead><tbody>${itens.map(x=>`<tr><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${esc(x.central||"")}</td><td>${esc(x.partida||"")}</td><td>${formatarDose(x.quantidade)}</td><td>${formatarDose(x.usadas)}</td><td><strong>${formatarDose(x.saldo)}</strong></td><td>${esc(x.recipiente||"")}</td><td>${esc(x.obs||"")}</td><td><button class="btn small secondary" onclick="formEstoque('${x.id}')">Editar</button><button class="btn small danger" onclick="excluirEstoque('${x.id}')">Excluir</button></td></tr>`).join("")}</tbody></table></div>`;
    return egDetalhesCliente(c.id,`saldo ${formatarDose(saldo)} doses`,tabela,itens.length);
  }).join("");
  document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><h3>Estoque de sêmen por cliente</h3><button class="btn" onclick="formEstoque()">Nova entrada</button></div><div class="eg-client-list">${blocos}</div>${!blocos?'<div class="empty-state">Nenhum estoque de sêmen cadastrado.</div>':''}</div>`;
}

function estoqueEmbrioes(){
  header("Estoque de Embriões","Embriões DT e VT separados por cliente e localização");
  const clientes=[...db.clientes].sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
  const blocos=clientes.map(c=>{
    const itens=db.estoqueEmbrioes.filter(e=>e.clienteId===c.id);
    if(!itens.length)return "";
    const totalDT=itens.filter(e=>e.tipo==="DT").reduce((a,e)=>a+numeroNaoNegativo(e.quantidade),0);
    const totalVT=itens.filter(e=>e.tipo==="VT").reduce((a,e)=>a+numeroNaoNegativo(e.quantidade),0);
    const tabela=`<div class="table-wrap"><table><thead><tr><th>Tipo</th><th>Doadora</th><th>Raça</th><th>Touro</th><th>Raça</th><th>Qtd.</th><th>Botijão</th><th>Caneca</th><th>Raque</th><th>Posição</th><th>Obs.</th><th>Ações</th></tr></thead><tbody>${itens.map(e=>`<tr><td><strong>${esc(e.tipo)}</strong></td><td>${esc(doadoraNome(e.doadoraId))}</td><td>${esc(doadoraRaca(e.doadoraId))}</td><td>${esc(touroNome(e.touroId))}</td><td>${esc(touroRaca(e.touroId))}</td><td>${numeroNaoNegativo(e.quantidade)}</td><td>${esc(e.botijao||"")}</td><td>${esc(e.caneca||"")}</td><td>${esc(e.raque||"")}</td><td>${esc(e.posicao||"")}</td><td>${esc(e.obs||"")}</td><td><button class="btn small secondary" onclick="formEstoqueEmbriao('${e.id}')">Editar</button><button class="btn small danger" onclick="excluirEstoqueEmbriao('${e.id}')">Excluir</button></td></tr>`).join("")}</tbody></table></div>`;
    return egDetalhesCliente(c.id,`DT ${totalDT} · VT ${totalVT}`,tabela,itens.length);
  }).join("");
  document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><h3>Estoque de embriões por cliente</h3><button class="btn" onclick="formEstoqueEmbriao()">Novo estoque de embriões</button></div><div class="eg-client-list">${blocos}</div>${!blocos?'<div class="empty-state">Nenhum embrião DT/VT em estoque.</div>':''}</div>`;
}

function producoes(){
  header("Produção de Embriões",`Separada por cliente e data — ${resumoFiltroGlobal()}`);
  const lista=listaNoPeriodo(db.producoes),grupos=agrupadoPorClienteEData(lista);
  const clienteIds=Object.keys(grupos).sort((a,b)=>nomeClienteOrdenacao(a).localeCompare(nomeClienteOrdenacao(b),"pt-BR"));
  const blocos=clienteIds.map(cid=>{
    const datas=grupos[cid];
    const porData=Object.keys(datas).sort((a,b)=>b.localeCompare(a)).map(data=>{
      const itens=datas[data];
      const tabela=`<div class="client-date-subgroup"><div class="client-date-title">${esc(dataBR(data))} — ${itens.length} doadora(s)</div><div class="table-wrap"><table><thead><tr><th>Doadora</th><th>Raça</th><th>Touro</th><th>Raça</th><th>Oócitos totais</th><th>Viáveis</th><th>Clivados</th><th>% Cliv.</th><th>Embriões D7</th><th>% Prod.</th><th>Fresco</th><th>Cong. DT</th><th>Cong. VT</th><th>Total cong.</th><th>Ações</th></tr></thead><tbody>${itens.map(x=>{const dt=numeroNaoNegativo(x.congeladosDT??x.transferidosDT),vt=numeroNaoNegativo(x.congeladosVT??x.transferidosVT);return `<tr><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(doadoraRaca(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(touroRaca(x.touroId))}</td><td>${numeroNaoNegativo(x.oocitos)}</td><td>${numeroNaoNegativo(x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.clivados)}</td><td>${percentual(x.clivados,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.embriõesD7)}</td><td>${percentual(x.embriõesD7,x.oocitosViaveis)}</td><td>${numeroNaoNegativo(x.transferidosFresco)}</td><td>${dt}</td><td>${vt}</td><td><strong>${dt+vt}</strong></td><td><button class="btn small secondary" onclick="formProducao('${x.id}')">Editar</button><button class="btn small danger" onclick="excluirProducao('${x.id}')">Excluir</button></td></tr>`}).join("")}</tbody></table></div>${blocoSemenServico(cid,data,itens)}</div>`;
      return tabela;
    }).join("");
    const qtdAnimais=Object.values(datas).reduce((a,itens)=>a+itens.length,0);
    return egDetalhesCliente(cid,`${Object.keys(datas).length} serviço(s) no período`,porData,qtdAnimais);
  }).join("");
  document.getElementById("content").innerHTML=`<div class="global-filter-banner">Mostrando: <strong>${esc(resumoFiltroGlobal())}</strong></div><div class="card"><div class="section-title"><h3>Produção por cliente e data</h3><button class="btn" onclick="formProducao()">Nova produção</button></div><div class="eg-client-list">${blocos}</div>${!blocos?'<div class="empty-state">Nenhuma produção no período selecionado.</div>':''}</div>`;
}

function transferencias(){
  header("Transferência de Embriões",`Separada por cliente e data — ${resumoFiltroGlobal()}`);
  const lista=listaNoPeriodo(db.transferencias),grupos=agrupadoPorClienteEData(lista);
  const clienteIds=Object.keys(grupos).sort((a,b)=>nomeClienteOrdenacao(a).localeCompare(nomeClienteOrdenacao(b),"pt-BR"));
  const blocos=clienteIds.map(cid=>{
    const datas=grupos[cid];
    const porData=Object.keys(datas).sort((a,b)=>b.localeCompare(a)).map(data=>{
      const itens=datas[data];
      return `<div class="client-date-subgroup"><div class="client-date-title">${esc(dataBR(data))} — ${itens.length} transferência(ões)</div><div class="table-wrap"><table><thead><tr><th>Doadora</th><th>Touro</th><th>Receptora</th><th>Grau D7</th><th>Estágio D7</th><th>Ovário / CL</th><th>Destino</th><th>Diagnóstico</th><th>Ações</th></tr></thead><tbody>${itens.map(x=>`<tr class="${x.autoFresco?'auto-row':''}"><td>${esc(doadoraNome(x.doadoraId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(x.receptora||'<preencher>')}</td><td>${esc(x.embriãoGrau||"")}</td><td>${esc(x.embriãoEstagio||"")}</td><td>${esc(transferenciaCLTexto(x)||"")}</td><td>${esc(x.destino||"")}</td><td>${badge(x.diagnostico||"Pendente")}</td><td><button class="btn small secondary" onclick="formTransferencia('${x.id}')">Editar</button><button class="btn small secondary" onclick="editarDiagnostico('${x.id}')">Diagnóstico</button><button class="btn small danger" onclick="excluirTransferencia('${x.id}')">Excluir</button></td></tr>`).join("")}</tbody></table></div></div>`;
    }).join("");
    const total=Object.values(datas).reduce((a,itens)=>a+itens.length,0);
    return egDetalhesCliente(cid,`${Object.keys(datas).length} data(s)`,porData,total);
  }).join("");
  document.getElementById("content").innerHTML=`<div class="global-filter-banner">Mostrando: <strong>${esc(resumoFiltroGlobal())}</strong></div><div class="card"><div class="section-title"><h3>Transferências por cliente e data</h3><button class="btn" onclick="formTransferencia()">Nova transferência</button></div><div class="eg-client-list">${blocos}</div>${!blocos?'<div class="empty-state">Nenhuma transferência no período selecionado.</div>':''}</div>`;
}

function egProducoesPorMesSvg(ano){
  const dados=Array.from({length:12},(_,i)=>{
    const mes=String(i+1).padStart(2,"0");
    const doMes=db.producoes.filter(p=>String(p.data||"").slice(0,7)===`${ano}-${mes}`);
    return egContarServicosProducao(doMes);
  });
  const nomes=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"],max=Math.max(1,...dados);
  const W=720,H=230,padL=38,padR=18,padT=18,padB=34,plotW=W-padL-padR,plotH=H-padT-padB;
  const pts=dados.map((v,i)=>({x:padL+(plotW*i/11),y:padT+plotH-(v/max)*plotH,v,i}));
  const poly=pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "),area=`${padL},${padT+plotH} ${poly} ${padL+plotW},${padT+plotH}`;
  const grid=[0,.25,.5,.75,1].map(fr=>{const y=padT+plotH-fr*plotH,val=Math.round(max*fr);return `<line x1="${padL}" y1="${y}" x2="${padL+plotW}" y2="${y}" class="eg-chart-grid"/><text x="${padL-8}" y="${y+4}" text-anchor="end" class="eg-chart-axis">${val}</text>`}).join("");
  const labels=pts.map(p=>`<text x="${p.x}" y="${H-10}" text-anchor="middle" class="eg-chart-axis">${nomes[p.i]}</text>`).join("");
  const dots=pts.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="4" class="eg-chart-dot"><title>${nomes[p.i]}: ${p.v} serviço(s)/OPU(s)</title></circle>`).join("");
  return `<svg class="eg-monthly-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Serviços de produção por mês em ${esc(ano)}">${grid}<polygon points="${area}" class="eg-chart-area"/><polyline points="${poly}" class="eg-chart-line"/>${dots}${labels}</svg>`;
}

function egUltimasProducoesHTML(){
  const mapa=new Map();
  (db.producoes||[]).filter(p=>p.data&&p.clienteId).forEach(p=>{
    const k=egChaveServicoProducao(p);if(!mapa.has(k))mapa.set(k,[]);mapa.get(k).push(p);
  });
  const grupos=[...mapa.entries()].map(([k,itens])=>({k,itens,data:itens[0].data,clienteId:itens[0].clienteId})).sort((a,b)=>String(b.data).localeCompare(String(a.data))).slice(0,5);
  if(!grupos.length)return `<div class="empty-state">Nenhuma produção cadastrada.</div>`;
  return `<div class="table-wrap"><table class="eg-latest-table"><thead><tr><th>Data</th><th>Cliente</th><th>Doadoras</th><th>Embriões D7</th><th>Congelados</th><th>Tipo</th></tr></thead><tbody>${grupos.map(g=>{const emb=g.itens.reduce((a,p)=>a+numeroNaoNegativo(p.embriõesD7),0),dt=g.itens.reduce((a,p)=>a+numeroNaoNegativo(p.congeladosDT??p.transferidosDT),0),vt=g.itens.reduce((a,p)=>a+numeroNaoNegativo(p.congeladosVT??p.transferidosVT),0),tipo=dt&&vt?"DT + VT":dt?"DT":vt?"VT":"—";return `<tr><td>${esc(dataBR(g.data))}</td><td>${esc(clienteNome(g.clienteId))}</td><td>${g.itens.length}</td><td>${emb}</td><td>${dt+vt}</td><td>${tipo}</td></tr>`}).join("")}</tbody></table></div><div class="eg-latest-actions"><button class="btn small secondary" onclick="irPara('producoes')">Ver todas as produções</button></div>`;
}

function aplicarDashboard(persistir=true){
  const {tipo,valor}=lerPeriodo("dash");if(!valor)return;
  if(persistir)salvarFiltroGlobal(tipo,valor);
  const prod=db.producoes.filter(x=>dataNoPeriodo(x.data,tipo,valor)),te=db.transferencias.filter(x=>dataNoPeriodo(x.data,tipo,valor));
  const opu=egContarServicosProducao(prod);
  const oocitosViaveis=prod.reduce((a,x)=>a+numeroNaoNegativo(x.oocitosViaveis),0),oocitosTotais=prod.reduce((a,x)=>a+numeroNaoNegativo(x.oocitos),0),embrioes=prod.reduce((a,x)=>a+numeroNaoNegativo(x.embriõesD7),0),fresco=prod.reduce((a,x)=>a+numeroNaoNegativo(x.transferidosFresco),0),dt=prod.reduce((a,x)=>a+numeroNaoNegativo(x.congeladosDT??x.transferidosDT),0),vt=prod.reduce((a,x)=>a+numeroNaoNegativo(x.congeladosVT??x.transferidosVT),0),doses=db.estoque.reduce((a,x)=>a+numeroNaoNegativo(x.saldo),0),embEstoque=db.estoqueEmbrioes.reduce((a,x)=>a+numeroNaoNegativo(x.quantidade),0),ano=egDashboardAno(tipo,valor);
  const out=document.getElementById("dashboardResultado");if(!out)return;
  out.innerHTML=`<div class="filter-summary">Período: <strong>${esc(rotuloPeriodo(tipo,valor))}</strong></div><div class="grid kpis"><div class="card"><strong>OPUs / Produções</strong><h2>${opu}</h2><small>Cliente + data = 1 OPU</small></div><div class="card"><strong>Oócitos coletados (viáveis)</strong><h2>${oocitosViaveis}</h2></div><div class="card"><strong>Oócitos coletados totais</strong><h2>${oocitosTotais}</h2></div><div class="card"><strong>Embriões D7</strong><h2>${embrioes}</h2></div><div class="card"><strong>Transferidos a fresco</strong><h2>${fresco}</h2></div><div class="card"><strong>Congelados DT</strong><h2>${dt}</h2></div><div class="card"><strong>Congelados VT</strong><h2>${vt}</h2></div><div class="card"><strong>Transferências</strong><h2>${te.length}</h2></div><div class="card"><strong>Estoque sêmen</strong><h2>${formatarDose(doses)}</h2></div><div class="card"><strong>Estoque embriões DT/VT</strong><h2>${embEstoque}</h2></div></div><div class="eg-dashboard-insights"><section class="card eg-chart-card"><div class="section-title"><div><h3>Produções por mês</h3><p class="muted">Cada cliente + data conta como um único serviço/OPU em ${esc(ano)}.</p></div></div>${egProducoesPorMesSvg(ano)}</section><section class="card eg-latest-card"><div class="section-title"><div><h3>Últimas produções</h3><p class="muted">Cinco serviços mais recentes, agrupados por cliente e data.</p></div></div>${egUltimasProducoesHTML()}</section></div>`;
}

function egSaldoLoteIgnorandoMovimento(estoqueId,movimentoIgnoradoId=""){
  const e=db.estoque.find(x=>x.id===estoqueId);if(!e)return 0;
  let saldo=numeroNaoNegativo(e.quantidade??e.entrada??0);
  (db.movimentacoes||[]).filter(m=>m.estoqueId===estoqueId&&m.id!==movimentoIgnoradoId).forEach(m=>{const q=numeroNaoNegativo(m.quantidade);if(m.tipo==="Uso"||m.tipo==="Ajuste negativo")saldo-=q;else if(m.tipo==="Devolução"||m.tipo==="Ajuste positivo")saldo+=q;});
  return Math.max(0,saldo);
}

function atualizarLotesServicoSemen(selecionado=""){
  const cid=document.querySelector('[name="clienteId"]')?.value||"",tid=document.querySelector('[name="touroId"]')?.value||"",sel=document.querySelector('[name="estoqueId"]');if(!sel)return;
  recalcularTodosEstoques();
  const itens=db.estoque.filter(e=>e.clienteId===cid&&(!tid||e.touroId===tid));
  sel.innerHTML='<option value="">Selecione o lote...</option>'+itens.map(e=>`<option value="${esc(e.id)}" ${e.id===selecionado?'selected':''}>${esc(touroNome(e.touroId))} | ${esc(e.partida||'Sem partida')} | saldo ${formatarDose(e.saldo)} | caneca ${esc(e.recipiente||'-')}</option>`).join('');
}

function formDoseServico(clienteId="",data="",id=""){
  const s=(db.servicosSemen||[]).find(x=>x.id===id)||{};clienteId=s.clienteId||clienteId;data=s.data||data||(filtroGlobal.tipo==='dia'?filtroGlobal.valor:hoje());
  modal(id?"Editar sêmen usado no serviço":"Doses usadas no serviço",`<div class="form-grid">${campo("Data do serviço","data",data,"date")}${select("Cliente","clienteId",db.clientes,clienteId)}${select("Touro","touroId",db.touros,s.touroId||"")}<div><label>Lote do estoque</label><select name="estoqueId"><option value="">Selecione cliente e touro...</option></select><small class="field-help">A partida e o saldo serão vinculados diretamente ao estoque.</small></div><div><label>Quantidade de doses utilizadas no serviço</label><input name="doses" type="text" inputmode="decimal" value="${esc(s.doses??'1,0')}" placeholder="Ex.: 0,5; 1,0; 1,5"><small class="field-help">O lançamento gera automaticamente uma movimentação de Uso e reduz o saldo.</small></div></div><br><button class="btn" onclick="salvarDoseServico('${id}')">Salvar doses do serviço</button>`);
  const clienteEl=document.querySelector('[name="clienteId"]'),touroEl=document.querySelector('[name="touroId"]');
  clienteEl?.addEventListener('change',()=>atualizarLotesServicoSemen(""));touroEl?.addEventListener('change',()=>atualizarLotesServicoSemen(""));
  atualizarLotesServicoSemen(s.estoqueId||"");
}

function salvarDoseServico(id=""){
  const get=n=>document.querySelector(`[name="${n}"]`)?.value.trim()||"",doses=numeroDecimal(get("doses")),estoque=db.estoque.find(e=>e.id===get("estoqueId"));
  if(!exigir(get("data"),"Informe a data do serviço."))return;if(!exigir(get("clienteId"),"Selecione o cliente."))return;if(!exigir(get("touroId"),"Selecione o touro."))return;if(!exigir(estoque&&estoque.clienteId===get("clienteId")&&estoque.touroId===get("touroId"),"Selecione um lote de sêmen deste cliente e touro."))return;if(!exigir(doses>0,"Informe uma quantidade de doses maior que zero."))return;
  const atual=(db.servicosSemen||[]).find(x=>x.id===id),movAtual=(db.movimentacoes||[]).find(m=>m.origemServicoSemenId===id),saldoDisponivel=egSaldoLoteIgnorandoMovimento(estoque.id,movAtual?.id||"");
  if(!exigir(doses<=saldoDisponivel,`Saldo insuficiente neste lote. Disponível: ${formatarDose(saldoDisponivel)} dose(s).`))return;
  const servicoId=id||idNovo("SRV",db.servicosSemen);
  const obj={id:servicoId,data:get("data"),clienteId:get("clienteId"),touroId:get("touroId"),estoqueId:estoque.id,partida:estoque.partida||"",doses};
  if(atual)Object.assign(atual,obj);else db.servicosSemen.push(obj);
  db.movimentacoes=(db.movimentacoes||[]).filter(m=>m.origemServicoSemenId!==servicoId);
  db.movimentacoes.push({id:idNovo("MOV",db.movimentacoes),estoqueId:estoque.id,clienteId:estoque.clienteId,touroId:estoque.touroId,partida:estoque.partida||"",tipo:"Uso",quantidade:doses,data:get("data"),obs:`Uso automático — produção ${clienteNome(estoque.clienteId)} em ${dataBR(get("data"))}`,origemServicoSemenId:servicoId,automatico:true});
  fecharModal();salvarBanco();
}

function excluirDoseServico(id){
  if(!confirm("Excluir este registro de doses do serviço? A movimentação automática também será removida e o saldo será recalculado."))return;
  db.servicosSemen=(db.servicosSemen||[]).filter(x=>x.id!==id);db.movimentacoes=(db.movimentacoes||[]).filter(m=>m.origemServicoSemenId!==id);salvarBanco();
}

function egEncontrarLoteServico(s){
  if(s.estoqueId){const e=db.estoque.find(x=>x.id===s.estoqueId);if(e)return e;}
  let itens=db.estoque.filter(e=>e.clienteId===s.clienteId&&e.touroId===s.touroId);
  if(s.partida)itens=itens.filter(e=>String(e.partida||"").trim()===String(s.partida||"").trim());
  return itens.length===1?itens[0]:null;
}

function egReconciliarMovimentacoesSemenAuto(){
  if(!Array.isArray(db.servicosSemen))db.servicosSemen=[];if(!Array.isArray(db.movimentacoes))db.movimentacoes=[];
  let mudou=false;
  for(const s of db.servicosSemen){
    if(db.movimentacoes.some(m=>m.origemServicoSemenId===s.id))continue;
    const lote=egEncontrarLoteServico(s);if(!lote)continue;
    const equivalente=db.movimentacoes.find(m=>!m.origemServicoSemenId&&m.tipo==="Uso"&&m.estoqueId===lote.id&&m.data===s.data&&Math.abs(numeroNaoNegativo(m.quantidade)-numeroDecimal(s.doses))<0.0001);
    if(equivalente){equivalente.origemServicoSemenId=s.id;equivalente.automatico=true;s.estoqueId=lote.id;s.partida=lote.partida||s.partida||"";mudou=true;continue;}
    const saldo=egSaldoLoteIgnorandoMovimento(lote.id,"");if(numeroDecimal(s.doses)<=0||numeroDecimal(s.doses)>saldo)continue;
    s.estoqueId=lote.id;s.partida=lote.partida||s.partida||"";
    db.movimentacoes.push({id:idNovo("MOV",db.movimentacoes),estoqueId:lote.id,clienteId:lote.clienteId,touroId:lote.touroId,partida:lote.partida||"",tipo:"Uso",quantidade:numeroDecimal(s.doses),data:s.data||"",obs:`Uso automático — produção ${clienteNome(lote.clienteId)} em ${dataBR(s.data||"")}`,origemServicoSemenId:s.id,automatico:true});mudou=true;
  }
  if(mudou){recalcularTodosEstoques();localStorage.setItem(DB_KEY,JSON.stringify(db));}
}

function movimentacoes(){
  recalcularTodosEstoques();
  header("Movimentações","Histórico do estoque de sêmen, incluindo usos automáticos da produção");
  const lista=[...(db.movimentacoes||[])].sort((a,b)=>String(b.data||"").localeCompare(String(a.data||""))||String(b.id||"").localeCompare(String(a.id||"")));
  document.getElementById("content").innerHTML=`<div class="card"><div class="section-title"><div><h3>Histórico de movimentações</h3><p class="muted">Ao registrar doses no serviço de produção, o uso aparece aqui automaticamente e reduz o saldo do lote.</p></div><button class="btn" onclick="formMovimentacao()">Nova movimentação manual</button></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Cliente</th><th>Touro</th><th>Partida</th><th>Tipo</th><th>Quantidade</th><th>Origem</th><th>Observação</th><th>Ações</th></tr></thead><tbody>${lista.map(x=>`<tr><td>${esc(dataBR(x.data)||x.data||"")}</td><td>${esc(clienteNome(x.clienteId))}</td><td>${esc(touroNome(x.touroId))}</td><td>${esc(x.partida||"")}</td><td>${esc(x.tipo)}</td><td>${formatarDose(x.quantidade)}</td><td>${x.origemServicoSemenId?'<span class="badge">Produção automática</span>':'Manual'}</td><td>${esc(x.obs||"")}</td><td>${x.origemServicoSemenId?'<span class="muted">Editar pela Produção</span>':`<button class="btn small secondary" onclick="formMovimentacao('${x.id}')">Editar</button><button class="btn small danger" onclick="excluirMovimentacao('${x.id}')">Excluir</button>`}</td></tr>`).join("")}</tbody></table></div></div>`;
}

function egAplicarMenuAcesso(){
  const menu=document.getElementById("menu");if(!menu)return;
  const itens=MENU.filter(([id])=>id!=="sair"&&id!=="usuarios");
  menu.innerHTML=itens.map(([id,nome])=>`<button data-page="${id}" onclick="irPara('${id}')">${nome}</button>`).join("");
  const sair=document.createElement("button");sair.type="button";sair.className="menu-sair";sair.textContent="Sair";sair.onclick=()=>{if(typeof egSair==="function")egSair();else{sessionStorage.removeItem("embriogestor_auth");location.reload();}};menu.appendChild(sair);
  const rodape=document.querySelector(".sidebar-footer"),s=typeof egSessaoApp==="function"?egSessaoApp():null;
  if(rodape&&s){const nome=egNomeComInicialMaiuscula(s.nome||s.usuario||"Administrador");rodape.innerHTML=`<strong>${esc(nome)}</strong><br>Administrador`;}
}

function egAtualizarInterfacePerfil(){
  egNormalizarUsuariosCliente();egAplicarMenuAcesso();document.body.classList.remove("eg-readonly");
  const exportBtn=[...document.querySelectorAll(".topbar-actions button")].find(b=>/exportar backup/i.test(b.textContent||""));if(exportBtn)exportBtn.style.display="";
}

egReconciliarMovimentacoesSemenAuto();
recalcularTodosEstoques();
localStorage.setItem(DB_KEY,JSON.stringify(db));
