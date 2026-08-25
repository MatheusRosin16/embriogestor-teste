/* ============================================================
   EmbrioGestor - Observacao manual nos relatorios v2
   Arquivo separado: nao altera o app.js
   Carregar DEPOIS do app.js.
   ============================================================ */
(function () {
  "use strict";

  function escapar(valor) {
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

  // Mantem a tela de escolha de periodo e acrescenta o campo de observacao.
  window.blocoPeriodoRelatorio = function (clienteId, tipo, titulo) {
    const h = typeof hoje === "function"
      ? hoje()
      : new Date().toISOString().slice(0, 10);

    return `
      <div class="report-choice">
        <h3>${titulo}</h3>

        <label>Período</label>
        <select id="rel_${tipo}_tipo" onchange="atualizarPeriodoRel('${tipo}')">
          <option value="dia">Dia</option>
          <option value="mes">Mês</option>
          <option value="ano">Ano</option>
        </select>

        <div id="rel_${tipo}_dia_wrap">
          <label>Data</label>
          <input id="rel_${tipo}_dia" type="date" value="${h}">
        </div>

        <div id="rel_${tipo}_mes_wrap" style="display:none">
          <label>Mês</label>
          <input id="rel_${tipo}_mes" type="month" value="${h.slice(0, 7)}">
        </div>

        <div id="rel_${tipo}_ano_wrap" style="display:none">
          <label>Ano</label>
          <input id="rel_${tipo}_ano" type="number" min="2000" max="2100" value="${h.slice(0, 4)}">
        </div>

        <label style="margin-top:12px">Observação do relatório</label>
        <textarea
          id="rel_${tipo}_obs"
          rows="4"
          placeholder="Digite a observação que deverá aparecer no campo OBS do relatório..."
          style="width:100%;box-sizing:border-box;resize:vertical;min-height:90px;margin-bottom:12px"
        ></textarea>

        <button class="btn" onclick="gerarRelatorioPeriodo('${clienteId}','${tipo}')">
          Gerar relatório
        </button>
      </div>
    `;
  };

  function blocoObs(texto) {
    const div = document.createElement("div");
    div.className = "report-note eg-observacao-manual-relatorio";
    div.innerHTML = "<b>OBS.:</b> " + escapar(texto);
    return div;
  }

  function aplicarObservacao(tipo, texto) {
    if (!texto) return;

    const area = document.getElementById("reportPrintable");
    if (!area) return;

    // Remove apenas blocos manuais de uma execucao anterior.
    area.querySelectorAll(".eg-observacao-manual-relatorio").forEach(function (el) {
      el.remove();
    });

    const notas = Array.from(area.querySelectorAll(".report-note"));

    if (tipo === "producao") {
      // No relatorio de producao ja existe o campo OBS exatamente entre
      // a tabela das doadoras e a tabela dos touros. Substitui o conteudo
      // desse campo pela observacao digitada.
      if (notas.length) {
        notas[0].innerHTML = "<b>OBS.:</b> " + escapar(texto);
        notas[0].classList.add("eg-observacao-manual-relatorio");
        return;
      }
    }

    if (tipo === "transferencia") {
      // O relatorio de transferencia ja possui OBSERVACOES apos o resumo.
      // Usa esse mesmo campo.
      if (notas.length) {
        const nota = notas[notas.length - 1];
        nota.innerHTML = "<b>OBSERVAÇÕES:</b> " + escapar(texto);
        nota.classList.add("eg-observacao-manual-relatorio");
        return;
      }
    }

    if (tipo === "congelamento") {
      // O modelo atual de congelamento possui OBS por linha, mas nao um
      // campo geral. Cria um campo OBS logo depois da tabela e antes do
      // total do periodo, mantendo o restante do relatorio intacto.
      const totalPeriodo = area.querySelector(".report-grand-total");
      const novo = blocoObs(texto);

      if (totalPeriodo && totalPeriodo.parentNode) {
        totalPeriodo.parentNode.insertBefore(novo, totalPeriodo);
      } else {
        area.appendChild(novo);
      }
      return;
    }

    // Fallback seguro caso o layout seja alterado no futuro.
    const totalPeriodo = area.querySelector(".report-grand-total");
    const novo = blocoObs(texto);
    if (totalPeriodo && totalPeriodo.parentNode) {
      totalPeriodo.parentNode.insertBefore(novo, totalPeriodo);
    } else {
      area.appendChild(novo);
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
    } else if (tipo === "congelamento") {
      if (typeof relatorioCongelamento !== "function") {
        alert("Função de relatório de congelamento não encontrada.");
        return;
      }
      relatorioCongelamento(clienteId, valor, periodoTipo);
    } else {
      if (typeof relatorioTransferencia !== "function") {
        alert("Função de relatório de transferência não encontrada.");
        return;
      }
      relatorioTransferencia(clienteId, valor, periodoTipo);
    }

    // O modal do relatorio e montado imediatamente; pequeno atraso apenas
    // garante que o DOM esteja pronto antes de localizar o campo OBS.
    setTimeout(function () {
      aplicarObservacao(tipo, observacao);
    }, 80);
  };
})();
