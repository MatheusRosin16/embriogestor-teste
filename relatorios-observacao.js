/* ============================================================
   EmbrioGestor — Observação manual nos relatórios
   Arquivo separado para não alterar o app.js
   ============================================================ */

(function () {
  "use strict";

  function escObs(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      }[c];
    });
  }

  // ----------------------------------------------------------
  // 1) Substitui somente o bloco visual dos relatórios
  //    para acrescentar o textarea de observação.
  // ----------------------------------------------------------

  window.blocoPeriodoRelatorio = function (clienteId, tipo, titulo) {
    const h = typeof hoje === "function"
      ? hoje()
      : new Date().toISOString().slice(0, 10);

    return `
      <div class="report-choice">
        <h3>${titulo}</h3>

        <label>Período</label>
        <select
          id="rel_${tipo}_tipo"
          onchange="atualizarPeriodoRel('${tipo}')"
        >
          <option value="dia">Dia</option>
          <option value="mes">Mês</option>
          <option value="ano">Ano</option>
        </select>

        <div id="rel_${tipo}_dia_wrap">
          <label>Data</label>
          <input
            id="rel_${tipo}_dia"
            type="date"
            value="${h}"
          >
        </div>

        <div
          id="rel_${tipo}_mes_wrap"
          style="display:none"
        >
          <label>Mês</label>
          <input
            id="rel_${tipo}_mes"
            type="month"
            value="${h.slice(0, 7)}"
          >
        </div>

        <div
          id="rel_${tipo}_ano_wrap"
          style="display:none"
        >
          <label>Ano</label>
          <input
            id="rel_${tipo}_ano"
            type="number"
            min="2000"
            max="2100"
            value="${h.slice(0, 4)}"
          >
        </div>

        <label style="margin-top:12px;">
          Observação do relatório
        </label>

        <textarea
          id="rel_${tipo}_obs"
          rows="4"
          placeholder="Digite uma observação para este relatório..."
          style="
            width:100%;
            box-sizing:border-box;
            resize:vertical;
            min-height:90px;
            margin-bottom:12px;
          "
        ></textarea>

        <button
          class="btn"
          onclick="gerarRelatorioPeriodo('${clienteId}','${tipo}')"
        >
          Gerar relatório
        </button>
      </div>
    `;
  };

  // ----------------------------------------------------------
  // 2) Usa as funções de relatório que já existem no app.js.
  //    Depois que o relatório abrir, acrescenta a observação
  //    antes do rodapé, sem reescrever o relatório inteiro.
  // ----------------------------------------------------------

  function inserirObservacaoNoRelatorio(texto) {
    if (!texto) return;

    const area = document.getElementById("reportPrintable");
    if (!area) return;

    // Evita duplicar a observação se a função for chamada novamente.
    const antiga = area.querySelector(".eg-observacao-manual-relatorio");
    if (antiga) antiga.remove();

    const bloco = document.createElement("div");
    bloco.className = "report-note eg-observacao-manual-relatorio";
    bloco.innerHTML =
      "<b>OBSERVAÇÃO DO RELATÓRIO:</b> " + escObs(texto);

    // Coloca antes do rodapé, se houver.
    const footer =
      area.querySelector(".report-footer") ||
      area.querySelector(".seminna-report-footer");

    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(bloco, footer);
    } else {
      area.appendChild(bloco);
    }
  }

  window.gerarRelatorioPeriodo = function (clienteId, tipo) {
    const periodoTipo =
      document.getElementById(`rel_${tipo}_tipo`)?.value || "dia";

    const valor =
      document.getElementById(`rel_${tipo}_${periodoTipo}`)?.value || "";

    const observacao =
      document.getElementById(`rel_${tipo}_obs`)?.value?.trim() || "";

    if (!valor) {
      alert("Informe o período.");
      return;
    }

    if (tipo === "producao") {
      if (typeof relatorioProducao !== "function") {
        alert("Função de relatório de produção não encontrada.");
        return;
      }
      relatorioProducao(clienteId, valor, periodoTipo);
    }

    else if (tipo === "congelamento") {
      if (typeof relatorioCongelamento !== "function") {
        alert("Função de relatório de congelamento não encontrada.");
        return;
      }
      relatorioCongelamento(clienteId, valor, periodoTipo);
    }

    else {
      if (typeof relatorioTransferencia !== "function") {
        alert("Função de relatório de transferência não encontrada.");
        return;
      }
      relatorioTransferencia(clienteId, valor, periodoTipo);
    }

    // As funções atuais abrem o relatório de forma síncrona.
    // Um pequeno atraso garante que o conteúdo já esteja no DOM.
    setTimeout(function () {
      inserirObservacaoNoRelatorio(observacao);
    }, 50);
  };

})();
