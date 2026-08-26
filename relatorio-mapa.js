/* ============================================================
   EmbrioGestor — Relatório Semestral MAPA v1
   Módulo separado. Carregar DEPOIS do app.js.
   Usa o modelo oficial Relatorio_MAPA_modelo.xlsx.
   ============================================================ */
(function(){
"use strict";

const EG_MAPA_CFG_KEY = "embriogestor_mapa_config_v1";
const EG_MAPA_TEMPLATE = "Relatorio_MAPA_modelo.xlsx";
let egMapaLinhas = [];

function mapaEsc(v){
  if (typeof esc === "function") return esc(v);
  return String(v ?? "").replace(/[&<>"']/g,c=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function mapaNum(v){
  const n=Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function mapaHoje(){
  return new Date().toISOString().slice(0,10);
}
function mapaCfg(){
  try{
    return {
      tipoProduto:"in vitro",
      classificacao:"CPIVE",
      razaoSocial:"",
      cnpj:"",
      registroMapa:"",
      uf:"PR",
      municipio:"Francisco Beltrão",
      especie:"BOVINO",
      ...JSON.parse(localStorage.getItem(EG_MAPA_CFG_KEY)||"{}")
    };
  }catch{
    return {
      tipoProduto:"in vitro",
      classificacao:"CPIVE",
      razaoSocial:"",
      cnpj:"",
      registroMapa:"",
      uf:"PR",
      municipio:"Francisco Beltrão",
      especie:"BOVINO"
    };
  }
}
function mapaSalvarCfg(){
  const g=id=>document.getElementById(id)?.value?.trim()||"";
  const cfg={
    tipoProduto:g("mapaTipoProduto")||"in vitro",
    classificacao:g("mapaClassificacao")||"CPIVE",
    razaoSocial:g("mapaRazaoSocial"),
    cnpj:g("mapaCnpj"),
    registroMapa:g("mapaRegistro"),
    uf:g("mapaUf"),
    municipio:g("mapaMunicipio"),
    especie:g("mapaEspecie")||"BOVINO"
  };
  localStorage.setItem(EG_MAPA_CFG_KEY,JSON.stringify(cfg));
  alert("Dados do estabelecimento salvos neste navegador.");
}
function mapaPeriodo(ano,semestre){
  const a=Number(ano);
  return semestre==="1"
    ? {inicio:`${a}-01-01`,fim:`${a}-06-30`}
    : {inicio:`${a}-07-01`,fim:`${a}-12-31`};
}
function mapaNoSemestre(data,ano,semestre){
  if(!data) return false;
  const p=mapaPeriodo(ano,semestre);
  return data>=p.inicio && data<=p.fim;
}
function mapaTouro(id){
  return (db.touros||[]).find(x=>x.id===id)||{};
}
function mapaDoadora(id){
  return (db.doadoras||[]).find(x=>x.id===id)||{};
}
function mapaRacaCompleta(reg){
  return String(reg?.raca||"").trim();
}
function mapaRegistroAnimal(reg){
  return String(reg?.registro||reg?.codigo||reg?.nome||"").trim();
}
function mapaEstoquePar(doadoraId,touroId){
  return (db.estoqueEmbrioes||[])
    .filter(e=>e.doadoraId===doadoraId && e.touroId===touroId)
    .reduce((a,e)=>a+mapaNum(e.quantidade),0);
}
function mapaMontarLinhas(ano,semestre){
  const prods=(db.producoes||[]).filter(p=>mapaNoSemestre(p.data,ano,semestre));
  const grupos=new Map();

  prods.forEach(p=>{
    const chave=`${p.touroId||""}|||${p.doadoraId||""}`;
    if(!grupos.has(chave)){
      grupos.set(chave,{
        touroId:p.touroId||"",
        doadoraId:p.doadoraId||"",
        produzidos:0
      });
    }
    // Conforme o modelo MAPA, "produzidos" é total de embriões produzidos.
    // No EmbrioGestor, o dado consolidado disponível é Embriões D7.
    grupos.get(chave).produzidos += mapaNum(p.embriõesD7);
  });

  return [...grupos.values()].map(g=>{
    const t=mapaTouro(g.touroId);
    const d=mapaDoadora(g.doadoraId);
    return {
      semestre:Number(semestre),
      ano:Number(ano),
      nomeReprodutor:String(t.nome||""),
      racaReprodutor:mapaRacaCompleta(t),
      rgdReprodutor:mapaRegistroAnimal(t),
      nomeReprodutora:String(d.nome||""),
      racaReprodutora:mapaRacaCompleta(d),
      rgdReprodutora:mapaRegistroAnimal(d),
      produzidos:g.produzidos,
      origem:"",
      adquiridos:0,
      importados:0,
      paisOrigem:"",
      exportados:0,
      paisDestino:"",
      comercializados:0,
      estoque:mapaEstoquePar(g.doadoraId,g.touroId)
    };
  }).sort((a,b)=>
    a.nomeReprodutor.localeCompare(b.nomeReprodutor,"pt-BR") ||
    a.nomeReprodutora.localeCompare(b.nomeReprodutora,"pt-BR")
  );
}
function mapaCampoEd(i,campo,tipo="text"){
  const v=egMapaLinhas[i]?.[campo]??"";
  const step=tipo==="number"?' min="0" step="1" inputmode="numeric"':"";
  return `<input type="${tipo}" ${step} value="${mapaEsc(v)}"
    onchange="egMapaEditar(${i},'${campo}',this.value)"
    style="min-width:${tipo==="number"?"78":"130"}px">`;
}
window.egMapaEditar=function(i,campo,valor){
  if(!egMapaLinhas[i]) return;
  if(["adquiridos","importados","exportados","comercializados","estoque"].includes(campo)){
    egMapaLinhas[i][campo]=Math.max(0,Number(valor)||0);
  }else{
    egMapaLinhas[i][campo]=String(valor||"");
  }
};
window.egMapaCopiarProduzidos=function(){
  if(!egMapaLinhas.length) return;
  if(!confirm("Copiar Embriões produzidos para Embriões comercializados em todas as linhas?\n\nUse esta opção somente se esse for o critério correto para o semestre.")) return;
  egMapaLinhas.forEach(x=>x.comercializados=x.produzidos);
  egMapaRenderPrevia();
};
window.egMapaZerarComercializados=function(){
  egMapaLinhas.forEach(x=>x.comercializados=0);
  egMapaRenderPrevia();
};

window.egMapaGerarPrevia=function(){
  const ano=document.getElementById("mapaAno")?.value||"";
  const semestre=document.getElementById("mapaSemestre")?.value||"";
  if(!ano || !semestre){alert("Informe ano e semestre.");return;}
  egMapaLinhas=mapaMontarLinhas(ano,semestre);
  if(!egMapaLinhas.length){
    document.getElementById("mapaPrevia").innerHTML=
      `<div class="card"><div class="empty-state">Nenhuma produção encontrada no semestre selecionado.</div></div>`;
    return;
  }
  egMapaRenderPrevia();
};

window.egMapaRenderPrevia=function(){
  const out=document.getElementById("mapaPrevia");
  if(!out) return;
  out.innerHTML=`
    <div class="card">
      <div class="section-title">
        <div>
          <h3>Prévia do relatório</h3>
          <p class="muted">${egMapaLinhas.length} acasalamento(s) — uma linha por reprodutor + reprodutora.</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn small secondary" onclick="egMapaCopiarProduzidos()">Copiar produzidos → comercializados</button>
          <button class="btn small secondary" onclick="egMapaZerarComercializados()">Zerar comercializados</button>
          <button class="btn" onclick="egMapaExportar()">Gerar Excel oficial</button>
        </div>
      </div>

      <div class="note" style="margin-bottom:12px">
        <strong>Automático:</strong> reprodutor, reprodutora, raças, registros, embriões produzidos e estoque atual.<br>
        <strong>Revisar antes de exportar:</strong> origem, adquiridos, importados, países, exportados e comercializados.
        O EmbrioGestor não possui dados suficientes para preencher esses campos automaticamente com segurança.
      </div>

      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>Reprodutor</th><th>Raça</th><th>RGD/CEIP</th>
            <th>Reprodutora</th><th>Raça</th><th>RGD/identificação</th>
            <th>Produzidos</th><th>Origem de outro estabelecimento</th>
            <th>Adquiridos</th><th>Importados</th><th>País origem</th>
            <th>Exportados</th><th>País destino</th><th>Comercializados BR</th><th>Estoque</th>
          </tr></thead>
          <tbody>
            ${egMapaLinhas.map((x,i)=>`<tr>
              <td>${mapaEsc(x.nomeReprodutor)}</td>
              <td>${mapaEsc(x.racaReprodutor)}</td>
              <td>${mapaEsc(x.rgdReprodutor)}</td>
              <td>${mapaEsc(x.nomeReprodutora)}</td>
              <td>${mapaEsc(x.racaReprodutora)}</td>
              <td>${mapaEsc(x.rgdReprodutora)}</td>
              <td><strong>${x.produzidos}</strong></td>
              <td>${mapaCampoEd(i,"origem")}</td>
              <td>${mapaCampoEd(i,"adquiridos","number")}</td>
              <td>${mapaCampoEd(i,"importados","number")}</td>
              <td>${mapaCampoEd(i,"paisOrigem")}</td>
              <td>${mapaCampoEd(i,"exportados","number")}</td>
              <td>${mapaCampoEd(i,"paisDestino")}</td>
              <td>${mapaCampoEd(i,"comercializados","number")}</td>
              <td>${mapaCampoEd(i,"estoque","number")}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </div>`;
};

function mapaCarregarExcelJS(){
  if(window.ExcelJS) return Promise.resolve();
  return new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js";
    s.onload=resolve;
    s.onerror=()=>reject(new Error("Não foi possível carregar a biblioteca de Excel."));
    document.head.appendChild(s);
  });
}
function mapaCopiarEstiloLinha(src,dst){
  dst.height=src.height;
  src.eachCell({includeEmpty:true},(cell,col)=>{
    const alvo=dst.getCell(col);
    if(cell.style) alvo.style=JSON.parse(JSON.stringify(cell.style));
    if(cell.numFmt) alvo.numFmt=cell.numFmt;
    if(cell.alignment) alvo.alignment=JSON.parse(JSON.stringify(cell.alignment));
    if(cell.border) alvo.border=JSON.parse(JSON.stringify(cell.border));
    if(cell.fill) alvo.fill=JSON.parse(JSON.stringify(cell.fill));
    if(cell.font) alvo.font=JSON.parse(JSON.stringify(cell.font));
  });
}
window.egMapaExportar=async function(){
  if(!egMapaLinhas.length){alert("Gere a prévia primeiro.");return;}
  const cfg=mapaCfg();
  const faltam=[];
  if(!cfg.razaoSocial) faltam.push("Razão social");
  if(!cfg.cnpj) faltam.push("CNPJ");
  if(!cfg.registroMapa) faltam.push("Nº de registro MAPA");
  if(!cfg.uf) faltam.push("UF");
  if(!cfg.municipio) faltam.push("Município");
  if(faltam.length){
    alert("Preencha e salve os dados do estabelecimento antes de exportar:\n- "+faltam.join("\n- "));
    return;
  }

  try{
    await mapaCarregarExcelJS();
    const url=new URL(EG_MAPA_TEMPLATE,location.href).href;
    const resp=await fetch(url,{cache:"no-store"});
    if(!resp.ok) throw new Error("Modelo oficial não encontrado no repositório.");
    const array=await resp.arrayBuffer();

    const wb=new ExcelJS.Workbook();
    await wb.xlsx.load(array);
    const ws=wb.getWorksheet("Embriões");
    if(!ws) throw new Error('A aba "Embriões" não foi encontrada no modelo.');

    // Mantém a linha 1 oficial e limpa somente os dados existentes.
    const modeloLinha=ws.getRow(2);
    const maxLinhas=Math.max(ws.rowCount, egMapaLinhas.length+1);
    for(let r=2;r<=maxLinhas;r++){
      const row=ws.getRow(r);
      for(let c=1;c<=25;c++) row.getCell(c).value=null;
    }

    egMapaLinhas.forEach((x,i)=>{
      const r=i+2;
      const row=ws.getRow(r);
      if(r>2) mapaCopiarEstiloLinha(modeloLinha,row);
      const vals=[
        x.semestre,
        x.ano,
        cfg.tipoProduto,
        cfg.classificacao,
        cfg.razaoSocial,
        cfg.cnpj,
        cfg.registroMapa,
        cfg.uf,
        cfg.municipio,
        cfg.especie,
        x.nomeReprodutor,
        x.racaReprodutor,
        x.rgdReprodutor,
        x.nomeReprodutora,
        x.racaReprodutora,
        x.rgdReprodutora,
        mapaNum(x.produzidos),
        x.origem||null,
        mapaNum(x.adquiridos),
        mapaNum(x.importados),
        x.paisOrigem||0,
        mapaNum(x.exportados),
        x.paisDestino||0,
        mapaNum(x.comercializados),
        mapaNum(x.estoque)
      ];
      vals.forEach((v,c)=>row.getCell(c+1).value=v);
      row.commit();
    });

    const buffer=await wb.xlsx.writeBuffer();
    const blob=new Blob([buffer],{
      type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    const ano=document.getElementById("mapaAno")?.value||new Date().getFullYear();
    const semestre=document.getElementById("mapaSemestre")?.value||"1";
    a.download=`Relatorio_MAPA_${ano}-${semestre}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }catch(e){
    console.error(e);
    alert("Não foi possível gerar o Excel do MAPA.\n\n"+(e?.message||e));
  }
};

window.paginaRelatorioMapa=function(){
  if(typeof header==="function"){
    header("Relatório Semestral MAPA","Produção de embriões no modelo oficial do Ministério da Agricultura e Pecuária");
  }
  document.querySelectorAll("#menu button").forEach(b=>b.classList.remove("active"));
  document.querySelector('#menu button[data-eg-mapa="1"]')?.classList.add("active");

  const cfg=mapaCfg();
  const agora=new Date();
  const ano=agora.getFullYear();
  const semestre=agora.getMonth()<6?"1":"2";

  document.getElementById("content").innerHTML=`
    <div class="card">
      <div class="section-title">
        <div>
          <h3>Dados do estabelecimento</h3>
          <p class="muted">Preencha uma vez. Estes dados serão usados nas colunas fixas do relatório oficial.</p>
        </div>
        <button class="btn secondary" onclick="mapaSalvarCfg()">Salvar dados</button>
      </div>
      <div class="form-grid">
        <div><label>Tipo de produto</label><select id="mapaTipoProduto">
          <option value="in vitro" ${cfg.tipoProduto==="in vitro"?"selected":""}>in vitro</option>
          <option value="in vivo" ${cfg.tipoProduto==="in vivo"?"selected":""}>in vivo</option>
        </select></div>
        <div><label>Classificação</label><select id="mapaClassificacao">
          ${["CPIVE","CCPE","EPSE"].map(v=>`<option ${cfg.classificacao===v?"selected":""}>${v}</option>`).join("")}
        </select></div>
        <div><label>Razão social do estabelecimento</label><input id="mapaRazaoSocial" value="${mapaEsc(cfg.razaoSocial)}"></div>
        <div><label>CNPJ</label><input id="mapaCnpj" value="${mapaEsc(cfg.cnpj)}"></div>
        <div><label>Nº de registro junto ao MAPA</label><input id="mapaRegistro" value="${mapaEsc(cfg.registroMapa)}"></div>
        <div><label>UF</label><input id="mapaUf" maxlength="2" value="${mapaEsc(cfg.uf)}"></div>
        <div><label>Município</label><input id="mapaMunicipio" value="${mapaEsc(cfg.municipio)}"></div>
        <div><label>Espécie</label><select id="mapaEspecie">
          ${["BOVINO","BUBALINO","CAPRINO","EQUÍDEO","OVINO","SUÍNO"].map(v=>`<option ${String(cfg.especie).toUpperCase()===v?"selected":""}>${v}</option>`).join("")}
        </select></div>
      </div>
    </div>

    <div class="card">
      <div class="section-title"><div><h3>Semestre</h3><p class="muted">O relatório agrupa todas as produções do período por touro + doadora.</p></div></div>
      <div class="form-grid">
        <div><label>Ano</label><input id="mapaAno" type="number" min="2000" max="2100" value="${ano}"></div>
        <div><label>Semestre</label><select id="mapaSemestre">
          <option value="1" ${semestre==="1"?"selected":""}>1º semestre — janeiro a junho</option>
          <option value="2" ${semestre==="2"?"selected":""}>2º semestre — julho a dezembro</option>
        </select></div>
      </div>
      <br>
      <button class="btn" onclick="egMapaGerarPrevia()">Montar prévia</button>
    </div>

    <div class="note">
      <strong>Critério automático utilizado:</strong> a coluna “Embriões produzidos” recebe a soma de
      <strong>Embriões D7</strong> cadastrados no EmbrioGestor para cada combinação de reprodutor + reprodutora
      durante o semestre. A coluna “Embriões em estoque” usa o estoque atual DT/VT da mesma combinação.
      Para relatórios retroativos, revise o estoque porque o modelo do MAPA pede a posição de estoque do semestre.
    </div>

    <div id="mapaPrevia"></div>
  `;
};

// Torna salvar config acessível ao onclick.
window.mapaSalvarCfg=mapaSalvarCfg;

function mapaInstalarMenu(){
  const menu=document.getElementById("menu");
  if(!menu || menu.querySelector('[data-eg-mapa="1"]')) return;

  const b=document.createElement("button");
  b.type="button";
  b.dataset.egMapa="1";
  b.textContent="Relatório Semestral MAPA";
  b.onclick=paginaRelatorioMapa;

  const nuvem=menu.querySelector('button[data-page="nuvem"]');
  if(nuvem) menu.insertBefore(b,nuvem);
  else menu.appendChild(b);
}

// Instala imediatamente e também após pequenas reconstruções do menu.
mapaInstalarMenu();
setTimeout(mapaInstalarMenu,500);

})();
