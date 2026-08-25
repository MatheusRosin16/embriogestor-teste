/* ============================================================
   EmbrioGestor v2.4 - Importador de dados antigos (Excel)
   Modelos suportados:
   1) Estoque de sêmen Laboratório.xlsx
   2) _Relatório Sêminna 2026 PIVE.xlsx
   3) Controle estoque embrião botijão ABS.xlsx
   4) Registros doadoras.xlsx
   ============================================================ */

const EG_IMPORT = {
  arquivo: null,
  tipo: "",
  resultado: null,
  avisos: []
};

function impNorm(v){
  return String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/guzatto/g,"gusatto").replace(/plucinski/g,"plusinski").replace(/&/g," e ").replace(/[^a-z0-9]+/g," ").trim();
}
function impBaseCliente(v){
  return impNorm(v)
    .replace(/\b(fazenda|faz|cabanha|granja|propriedade|agro)\b/g," ")
    .replace(/\b(naidiel|dioni|rio bonito)\b/g," ")
    .replace(/\b\d+\b$/g," ").replace(/\s+/g," ").trim();
}
function impNum(v){
  if(typeof v==="number") return Number.isFinite(v)?v:0;
  const s=String(v??"").replace(/\./g,"").replace(",",".").match(/-?\d+(?:\.\d+)?/);
  return s?Number(s[0]):0;
}
function impDose(v){
  if(v===null||v===undefined||v==="") return {valor:0, aviso:"Dose não informada"};
  if(typeof v==="number"){
    if(v>1000){
      const d=window.XLSX?.SSF?.parse_date_code?.(v);
      // O Excel costuma transformar a digitação 1/2 em 01/02 do ano corrente.
      // Nos modelos históricos esse padrão aparece no campo DOSES; tratamos 1/2 como 0,5 dose.
      if(d?.d>0 && d?.m>0 && d.d<d.m && d.d<=12 && d.m<=12){
        return {valor:d.d/d.m,aviso:`Dose ${v} foi reconhecida como fração ${d.d}/${d.m} = ${(d.d/d.m).toLocaleString("pt-BR")} dose`};
      }
      return {valor:0,aviso:`Quantidade de dose suspeita (${v}); revisar manualmente`};
    }
    return {valor:v,aviso:""};
  }
  const s=String(v).trim();
  if(/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(s)) return {valor:0,aviso:`Dose parece data (${s}); revisar manualmente`};
  const n=impNum(s);
  return {valor:n,aviso:n>1000?`Quantidade de dose suspeita (${s}); revisar manualmente`:""};
}
function impDataISO(v){
  if(!v) return "";
  if(typeof v==="number" && window.XLSX?.SSF?.parse_date_code){
    const d=XLSX.SSF.parse_date_code(v);
    if(d?.y) return `${String(d.y).padStart(4,"0")}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  if(v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  const s=String(v).trim();
  let m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m) return `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;
  m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if(m)return s;
  return "";
}
function impRacaNome(v){
  const s=String(v??"").trim(); if(!s)return "";
  const mapa={HO:"Holandês",HOL:"Holandês",JE:"Jersey",AN:"Aberdeen Angus",HH:"Hereford",BO:"Braford",BF:"Braford",BN:"Brangus",BR:"Brangus",NE:"Nelore",GI:"Gir",GL:"Gir Leiteiro",SI:"Simental",SE:"Senepol",GU:"Guzerá",CA:"Canchim",CH:"Charolês",LI:"Limousin",RA:"Red Angus",TB:"Tabapuã"};
  const up=s.toUpperCase().replace(/\s+/g,"");
  if(mapa[up])return mapa[up];
  const existente=(db.racas||[]).find(r=>impNorm(r)===impNorm(s));
  return existente||s.replace(/\w/g,c=>c.toUpperCase());
}
function impCliente(label, profissionalId=""){
  label=String(label??"").trim(); if(!label)return null;
  const n=impNorm(label), b=impBaseCliente(label);
  let candidatos=(db.clientes||[]).filter(c=>{
    const vals=[c.nome,c.propriedade].filter(Boolean);
    return vals.some(x=>impNorm(x)===n || (b.length>=3 && impBaseCliente(x)===b));
  });
  if(candidatos.length===1){
    if(profissionalId&&!candidatos[0].profissionalId)candidatos[0].profissionalId=profissionalId;
    return candidatos[0];
  }
  candidatos=(db.clientes||[]).filter(c=>{
    const vals=[c.nome,c.propriedade].filter(Boolean).map(impBaseCliente).filter(x=>x.length>=4);
    return b.length>=4 && vals.some(x=>x.includes(b)||b.includes(x)||x.startsWith(b)||b.startsWith(x));
  });
  if(candidatos.length===1){
    if(profissionalId&&!candidatos[0].profissionalId)candidatos[0].profissionalId=profissionalId;
    return candidatos[0];
  }
  const novo={id:idNovo("CLI",db.clientes),nome:label,cpf:"",propriedade:label,municipio:"",uf:"",telefone:"",email:"",profissionalId:profissionalId||"",origemImportacao:"Excel"};
  db.clientes.push(novo); return novo;
}
function impProfissionalPorTexto(texto){
  const n=impNorm(texto); if(!n)return "";
  const p=(db.profissionais||[]).find(p=>n.includes(impNorm(p.nome)) || impNorm(p.nome).split(" ").some(t=>t.length>=5&&n.includes(t)));
  return p?.id||"";
}
function impTouro(nome,raca="",registro=""){
  nome=String(nome??"").trim(); if(!nome)return null;
  // números grandes na coluna de touro normalmente são datas/erros históricos, não animais.
  if(/^\d+$/.test(nome) && Number(nome)>30000) return null;
  let t=(db.touros||[]).find(x=>impNorm(x.nome)===impNorm(nome));
  if(t){ if(!t.raca&&raca)t.raca=impRacaNome(raca); if(!t.registro&&registro)t.registro=String(registro); return t; }
  t={id:idNovo("TOU",db.touros),nome,registro:String(registro||""),raca:impRacaNome(raca)||"Outra",central:"Outra",codigo:"",obs:"Importado de planilha histórica"};
  db.touros.push(t);
  if(t.raca&&!db.racas.includes(t.raca))db.racas.push(t.raca);
  return t;
}
function impDoadora(clienteId,nome,raca="",registro="",obsExtra="",categoria=""){
  nome=String(nome??"").trim(); if(!nome)return null;
  const rn=impRacaNome(raca)||"Outra"; if(rn&&!db.racas.includes(rn))db.racas.push(rn);
  const categoriasValidas=["Vaca","Bezerra","Novilha","Primípara"];
  const cat=categoriasValidas.includes(String(categoria||"").trim())?String(categoria).trim():"Vaca";
  let d=(db.doadoras||[]).find(x=>x.clienteId===clienteId&&impNorm(x.nome)===impNorm(nome));
  if(d){
    if((!d.raca||d.raca==="Outra")&&raca)d.raca=rn;
    if(!d.registro&&registro)d.registro=String(registro).trim();
    if(obsExtra&&!String(d.obs||"").includes(obsExtra))d.obs=[d.obs,obsExtra].filter(Boolean).join(" | ");
    return d;
  }
  d={id:idNovo("DOA",db.doadoras),clienteId,nome,registro:String(registro||"").trim(),raca:rn,categoria:cat,nascimento:"",status:"Ativo",obs:["Importada de planilha histórica",obsExtra].filter(Boolean).join(" | ")};
  db.doadoras.push(d); return d;
}
function impTemChave(lista,chave){return (lista||[]).some(x=>x.importKey===chave);}
function impPlanilhaArray(sheet){return XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null,blankrows:true});}

function impClientePlanilhaDoadoras(sheetName){
  const aliases={
    "candido":"Candido Scholl",
    "mario medina":"Mario Medina",
    "fran gusatto":"Franciele Gusatto",
    "faz campo novo":"Geraldo Junior Fontanela",
    "campo novo":"Geraldo Junior Fontanela",
    "extang":"Odair Extang",
    "2a":"Ademir Hoinaski",
    "leandro":"Leandro",
    "matteus scopel":"Matteus Scopel"
  };
  const n=impNorm(sheetName);
  const alias=aliases[n];
  if(alias){
    const existente=(db.clientes||[]).find(c=>impNorm(c.nome)===impNorm(alias)||impNorm(c.propriedade)===impNorm(alias));
    if(existente)return existente;
    return impCliente(alias);
  }
  return impCliente(sheetName);
}
function impCategoriaHistorica(v){
  const s=String(v??"").trim();
  if(!s)return {categoria:"Vaca",obs:""};
  const mapa={VACA:"Vaca",NOVILHA:"Novilha",BEZERRA:"Bezerra",PRIMIPARA:"Primípara","PRIMÍPARA":"Primípara"};
  const up=s.toUpperCase();
  if(mapa[up])return {categoria:mapa[up],obs:""};
  return {categoria:"Vaca",obs:`Categoria/registro histórico: ${s}`};
}
function importarRegistrosDoadoras(wb,nomeArquivo,simular=false){
  const out={tipo:"Registros de doadoras",linhas:0,novos:0,atualizados:0,duplicados:0,clientes:new Set(),doadoras:new Set(),avisos:[]};
  wb.SheetNames.forEach(sheetName=>{
    const rows=impPlanilhaArray(wb.Sheets[sheetName]);
    const h=rows.findIndex(r=>r.some(c=>impNorm(c).includes("doadora"))&&r.some(c=>impNorm(c).includes("registro")||impNorm(c).includes("raca")||impNorm(c).includes("tatuagem")));
    if(h<0)return;
    const hdr=(rows[h]||[]).map(impNorm);
    const idxD=hdr.findIndex(x=>x.includes("doadora"));
    const idxTat=hdr.findIndex(x=>x.includes("tatuagem"));
    const idxReg=hdr.findIndex(x=>x.includes("registro"));
    const idxRaca=hdr.findIndex(x=>x.includes("raca"));
    const idxCat=hdr.findIndex(x=>x.includes("categoria"));
    if(idxD<0)return;
    const cliente=impClientePlanilhaDoadoras(sheetName); if(!cliente)return; out.clientes.add(cliente.id);
    for(let i=h+1;i<rows.length;i++){
      const r=rows[i]||[];
      const nome=String(r[idxD]??"").trim(); if(!nome)continue;
      if(/^(total|doadoras?)$/i.test(nome))continue;
      const registro=idxReg>=0?String(r[idxReg]??"").trim():"";
      const tatuagem=idxTat>=0?String(r[idxTat]??"").trim():"";
      const raca=idxRaca>=0?String(r[idxRaca]??"").trim():"";
      const catInfo=impCategoriaHistorica(idxCat>=0?r[idxCat]:"");
      const obs=[tatuagem?`Tatuagem: ${tatuagem}`:"",catInfo.obs].filter(Boolean).join(" | ");
      const key=`xls:doadora:${impNorm(nomeArquivo)}:${impNorm(sheetName)}:${i+1}`;
      if(impTemChave(db.doadoras,key)){out.duplicados++;continue;}
      const existente=(db.doadoras||[]).find(x=>x.clienteId===cliente.id&&impNorm(x.nome)===impNorm(nome));
      out.linhas++;
      if(!simular){
        const d=impDoadora(cliente.id,nome,raca,registro,obs,catInfo.categoria); if(!d)continue;
        d.importKey=d.importKey||key; d.origemImportacao=nomeArquivo;
        out.doadoras.add(d.id);
        if(existente)out.atualizados++;else out.novos++;
      }else{
        if(existente)out.atualizados++;else out.novos++;
      }
    }
  });
  return out;
}

function detectarTipoImportacao(wb,nomeArquivo){
  const names=wb.SheetNames||[];
  if(names.some(n=>/caneca\s*\d+/i.test(n)) && names.some(n=>/botij[aã]o abs/i.test(n))) return "embrioes";
  const primeira=names[0]&&impPlanilhaArray(wb.Sheets[names[0]])||[];
  if(primeira.some(r=>r.some(c=>impNorm(c).includes("relatorio producao in vitro")))) return "pive";
  if(primeira.some(r=>impNorm(r[0]).includes("touro")&&impNorm(r[3]).includes("doses em estoque"))) return "semen";
  const variasDoadoras=names.filter(n=>{const rows=impPlanilhaArray(wb.Sheets[n]);return rows.slice(0,4).some(r=>r.some(c=>impNorm(c).includes("doadora"))&&r.some(c=>impNorm(c).includes("registro")||impNorm(c).includes("raca")||impNorm(c).includes("tatuagem")));}).length;
  if(variasDoadoras>=Math.max(1,Math.ceil(names.length*0.35)))return "doadoras";
  const nf=impNorm(nomeArquivo);
  if(nf.includes("estoque de semen"))return "semen";
  if(nf.includes("pive"))return "pive";
  if(nf.includes("estoque embriao"))return "embrioes";
  if(nf.includes("registro")&&nf.includes("doadora"))return "doadoras";
  return "";
}

function importarSemen(wb,nomeArquivo,simular=false){
  const out={tipo:"Estoque de sêmen",linhas:0,novos:0,duplicados:0,clientes:new Set(),touros:new Set(),avisos:[]};
  wb.SheetNames.forEach(sheetName=>{
    if(impNorm(sheetName)==="modelo")return;
    const rows=impPlanilhaArray(wb.Sheets[sheetName]);
    const h=rows.findIndex(r=>impNorm(r[0]).includes("touro")&&impNorm(r[3]).includes("doses")); if(h<0)return;
    const cliente=impCliente(sheetName); if(!cliente)return; out.clientes.add(cliente.id);
    for(let i=h+1;i<rows.length;i++){
      const r=rows[i]; const nome=String(r[0]??"").trim(); if(!nome)continue;
      const registro=r[1]??"", raca=r[2]??""; const dose=impDose(r[3]);
      if(!(dose.valor>0)){ if(dose.aviso)out.avisos.push(`${sheetName}, linha ${i+1}: ${dose.aviso}`); continue; }
      const touro=impTouro(nome,raca,registro); if(!touro)continue; out.touros.add(touro.id);
      const key=`xls:semen:${impNorm(nomeArquivo)}:${impNorm(sheetName)}:${i+1}`;
      if(impTemChave(db.estoque,key)){out.duplicados++;continue;}
      out.linhas++;
      if(!simular){
        db.estoque.push({id:idNovo("EST",db.estoque),clienteId:cliente.id,touroId:touro.id,central:touro.central||"",partida:"IMPORTADO",quantidade:dose.valor,entrada:dose.valor,data:"",recipienteTipo:"CANECA",recipiente:sheetName,obs:String(r[4]??"").trim(),usadas:0,saldo:dose.valor,importKey:key,origemImportacao:nomeArquivo});
        out.novos++;
      }
    }
  }); return out;
}

function acharCelula(rows,rotulo){
  const alvo=impNorm(rotulo);
  for(let i=0;i<Math.min(rows.length,15);i++)for(let j=0;j<(rows[i]||[]).length;j++)if(impNorm(rows[i][j])===alvo)return {i,j,v:rows[i][j+1]};
  return null;
}
function importarPIVE(wb,nomeArquivo,simular=false){
  const out={tipo:"Produção PIVE",linhas:0,novos:0,duplicados:0,clientes:new Set(),touros:new Set(),doadoras:new Set(),servicos:0,avisos:[]};
  wb.SheetNames.forEach(sheetName=>{
    const rows=impPlanilhaArray(wb.Sheets[sheetName]);
    const hi=rows.findIndex(r=>impNorm(r[0])==="n"&&impNorm(r[1]).includes("doadora")&&r.some(c=>impNorm(c).includes("oocitos totais")));
    if(hi<0)return;
    const cc=acharCelula(rows,"CLIENTE:"); const dc=acharCelula(rows,"DATA:");
    const nomeCliente=String(cc?.v??sheetName).trim(); const data=impDataISO(dc?.v);
    if(!data){out.avisos.push(`${sheetName}: data da produção não reconhecida`);return;}
    const pid=impProfissionalPorTexto(sheetName); const cliente=impCliente(nomeCliente,pid); if(!cliente)return; out.clientes.add(cliente.id);
    for(let i=hi+1;i<rows.length;i++){
      const r=rows[i]; if(impNorm(r[1])==="total")break;
      const nrow=impNum(r[0]); const doadoraNome=String(r[1]??"").trim(); if(!nrow||!doadoraNome)continue;
      const raca=r[2]??"", touroNome=String(r[3]??"").trim();
      const d=impDoadora(cliente.id,doadoraNome,raca); const t=impTouro(touroNome,"",""); if(!d||!t)continue;
      out.doadoras.add(d.id); out.touros.add(t.id);
      const key=`xls:pive:${impNorm(nomeArquivo)}:${impNorm(sheetName)}:${i+1}`;
      if(impTemChave(db.producoes,key)){out.duplicados++;continue;}
      const te=Math.max(0,Math.round(impNum(r[10]))), dt=Math.max(0,Math.round(impNum(r[11])));
      const oo=Math.max(0,Math.round(impNum(r[4]))), ov=Math.max(0,Math.round(impNum(r[5]))), cl=Math.max(0,Math.round(impNum(r[6]))), ed7=Math.max(0,Math.round(impNum(r[8])));
      const inconsist=[];
      if(ov>oo)incons.push(`viáveis ${ov} > totais ${oo}`);
      if(cl>ov)incons.push(`clivagem ${cl} > viáveis ${ov}`);
      if(ed7>cl)incons.push(`embriões D7 ${ed7} > clivados ${cl}`);
      if(te+dt>ed7)incons.push(`TE+DT ${te+dt} > embriões D7 ${ed7}`);
      if(incons.length)out.avisos.push(`${sheetName}, doadora ${doadoraNome}: ${incons.join("; ")} — valores originais preservados para revisão`);
      const obsOrig=String(r[12]??"").trim();
      const obj={id:idNovo("PROD",db.producoes),data,clienteId:cliente.id,doadoraId:d.id,touroId:t.id,oocitos:oo,oocitosViaveis:ov,clivados:cl,embriõesD7:ed7,transferidosFresco:te,congeladosDT:dt,congeladosVT:0,transferidosDT:0,transferidosVT:0,congelados:dt,tipoCongelamento:dt>0?"DT":"",obs:obsOrig+(incons.length?`${obsOrig?" | ":""}REVISAR DADO HISTÓRICO: ${incons.join("; ")}`:""),doseUtilizada:0,importKey:key,origemImportacao:nomeArquivo};
      out.linhas++; if(!simular){db.producoes.push(obj);out.novos++;}
    }
    // tabela de sêmen do serviço
    const hs=rows.findIndex(r=>r.some((c,j)=>j>=2&&impNorm(c)==="touro")&&r.some(c=>impNorm(c)==="partida")&&r.some(c=>impNorm(c)==="doses"));
    if(hs>=0){
      for(let i=hs+1;i<rows.length;i++){
        const r=rows[i]; const nome=String(r[2]??"").trim(); if(!nome||impNorm(nome).includes("total geral"))break;
        const partida=String(r[3]??"").trim(); const dose=impDose(r[4]); const raca=r[5]??""; const t=impTouro(nome,raca,""); if(!t)continue;
        if(dose.aviso)out.avisos.push(`${sheetName}, serviço ${nome}: ${dose.aviso}`);
        if(!(dose.valor>0))continue;
        const key=`xls:servico:${impNorm(nomeArquivo)}:${impNorm(sheetName)}:${i+1}`;
        if(impTemChave(db.servicosSemen,key))continue;
        if(!simular){db.servicosSemen.push({id:idNovo("SRV",db.servicosSemen),data,clienteId:cliente.id,touroId:t.id,partida,doses:dose.valor,importKey:key,origemImportacao:nomeArquivo});}
        out.servicos++;
      }
    }
  }); return out;
}

function importarEstoqueEmbrioes(wb,nomeArquivo,simular=false){
  const out={tipo:"Estoque de embriões",linhas:0,novos:0,duplicados:0,clientes:new Set(),avisos:[]};
  wb.SheetNames.forEach(sheetName=>{
    if(!/caneca\s*\d+/i.test(sheetName))return;
    const caneca=(sheetName.match(/caneca\s*(\d+)/i)||[])[1]||""; const rows=impPlanilhaArray(wb.Sheets[sheetName]);
    const h=rows.findIndex(r=>impNorm(r[0]).includes("vt dt")&&impNorm(r[1]).includes("fazenda")); if(h<0)return;
    for(let i=h+1;i<rows.length;i++){
      const r=rows[i]; const tipo=String(r[0]??"").trim().toUpperCase(); const fazenda=String(r[1]??"").trim(); if(!["DT","VT"].includes(tipo)||!fazenda)continue;
      if(/[a-z]?\d{3,}.*\bx\b.*[a-z]?\d{3,}/i.test(fazenda)){out.avisos.push(`${sheetName}, linha ${i+1}: campo Fazenda parece identificação/acasalamento (${fazenda}); linha não importada`);continue;}
      const cliente=impCliente(fazenda); if(!cliente)continue; out.clientes.add(cliente.id);
      const data=impDataISO(r[2]); const touro=impTouro(r[3],"",""); const obs=String(r[4]??"").trim();
      if(r[3] && !touro) out.avisos.push(`${sheetName}, linha ${i+1}: touro inválido/suspeito (${r[3]})`);
      const key=`xls:embriao:${impNorm(nomeArquivo)}:${impNorm(sheetName)}:${i+1}`;
      if(impTemChave(db.estoqueEmbrioes,key)){out.duplicados++;continue;}
      out.linhas++;
      if(!simular){db.estoqueEmbrioes.push({id:idNovo("EMB",db.estoqueEmbrioes),clienteId:cliente.id,doadoraId:"",touroId:touro?.id||"",tipo,quantidade:1,data,botijao:"ABS",caneca,raque:"",posicao:"",obs,origem:"Planilha histórica",importKey:key,origemImportacao:nomeArquivo});out.novos++;}
    }
  }); return out;
}

function impResumo(out){
  const av=out.avisos||[];
  return `<div class="import-summary"><div class="grid kpis"><div class="card"><strong>Registros reconhecidos</strong><h2>${out.linhas||0}</h2></div><div class="card"><strong>Duplicados ignorados</strong><h2>${out.duplicados||0}</h2></div><div class="card"><strong>Avisos</strong><h2>${av.length}</h2></div></div>${av.length?`<div class="note"><strong>Revisar:</strong><ul>${av.slice(0,20).map(x=>`<li>${esc(x)}</li>`).join("")}</ul>${av.length>20?`<p>+ ${av.length-20} aviso(s).</p>`:""}</div>`:""}</div>`;
}

function paginaImportarDados(){
  if(typeof egEhAdmin==="function"&&!egEhAdmin()){alert("Somente Administradores podem importar dados históricos.");page="dashboard";return dashboard();}
  header("Importar Dados Antigos","Excel: sêmen, PIVE, estoque de embriões ABS e registros de doadoras");
  document.getElementById("content").innerHTML=`<div class="card"><h3>Importar planilha Excel</h3><p class="muted">O importador <b>mescla</b> os registros com a base atual. Ele não apaga seus clientes, produções ou usuários. Registros já importados do mesmo arquivo/linha são ignorados.</p><input id="impArquivo" type="file" accept=".xlsx,.xls" onchange="impLerArquivo(this)"><div id="impResultado" style="margin-top:16px"></div><div class="cloud-warning"><b>Antes de importar:</b> mantenha um backup no Google Drive. Quantidades de sêmen fracionadas (ex.: 2,5 doses) são aceitas. O modelo Registros doadoras.xlsx também é reconhecido; tatuagem e categorias históricas são preservadas nas observações quando não correspondem aos campos atuais.</div></div>`;
}

async function impLerArquivo(input){
  const file=input.files?.[0]; if(!file)return;
  const area=document.getElementById("impResultado"); area.innerHTML="<p>Analisando planilha...</p>";
  try{
    if(!window.XLSX)throw new Error("Biblioteca de Excel não carregada. Conecte o aparelho à internet e atualize a página.");
    const buf=await file.arrayBuffer(); const wb=XLSX.read(buf,{type:"array",cellDates:false});
    const tipo=detectarTipoImportacao(wb,file.name); if(!tipo)throw new Error("Este modelo de Excel ainda não foi reconhecido pelo EmbrioGestor.");
    EG_IMPORT.arquivo=file;EG_IMPORT.tipo=tipo;EG_IMPORT.wb=wb;
    // Simulação usa snapshot para não deixar novos clientes/touros/doadoras criados pela análise.
    const snap=JSON.stringify(db); let out;
    if(tipo==="semen")out=importarSemen(wb,file.name,true);
    else if(tipo==="pive")out=importarPIVE(wb,file.name,true);
    else if(tipo==="doadoras")out=importarRegistrosDoadoras(wb,file.name,true);
    else out=importarEstoqueEmbrioes(wb,file.name,true);
    const restaurado=normalizarBanco(JSON.parse(snap));Object.keys(db).forEach(k=>delete db[k]);Object.assign(db,restaurado);
    EG_IMPORT.resultado=out;
    area.innerHTML=`<div class="note"><strong>Modelo identificado:</strong> ${esc(out.tipo)}</div>${impResumo(out)}<button class="btn" onclick="impConfirmar()">Importar e mesclar com a base</button>`;
  }catch(e){console.error(e);area.innerHTML=`<div class="cloud-status erro">${esc(e.message||"Erro ao analisar a planilha.")}</div>`;}
}

function impConfirmar(){
  if(!EG_IMPORT.wb||!EG_IMPORT.arquivo)return;
  if(!confirm("Importar os registros reconhecidos e mesclar com a base atual?\n\nUm backup no Google Drive é recomendado antes de continuar."))return;
  try{
    let out; const f=EG_IMPORT.arquivo;
    if(EG_IMPORT.tipo==="semen")out=importarSemen(EG_IMPORT.wb,f.name,false);
    else if(EG_IMPORT.tipo==="pive")out=importarPIVE(EG_IMPORT.wb,f.name,false);
    else if(EG_IMPORT.tipo==="doadoras")out=importarRegistrosDoadoras(EG_IMPORT.wb,f.name,false);
    else out=importarEstoqueEmbrioes(EG_IMPORT.wb,f.name,false);
    db.racas=[...new Set(db.racas)].sort((a,b)=>a.localeCompare(b,"pt-BR"));
    if(typeof sincronizarTodosEstoquesEmbrioes==="function")sincronizarTodosEstoquesEmbrioes();
    salvarBanco();
    alert(`Importação concluída. ${out.novos||out.linhas||0} registro(s) novo(s) incluído(s).`);
    paginaImportarDados();
  }catch(e){console.error(e);alert(e.message||"Falha durante a importação.");}
}
