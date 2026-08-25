/* ============================================================
   EmbrioGestor v2.2 - Google Drive / sincronização / importação
   ============================================================ */

const CLOUD_CFG = window.EMBRIO_CLOUD_CONFIG || {};
let driveToken = null;
let driveTokenClient = null;
let driveFolderId = null;
let driveScriptPromise = null;
let cloudBusy = false;
let autoBackupTimer = null;
const AUTO_BACKUP_KEY = "embriogestor_drive_auto_backup";

function cloudEsc(v){ return typeof esc === "function" ? esc(v) : String(v??"").replace(/[&<>\"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#039;"}[c])); }
function cloudConfigured(){ return !!String(CLOUD_CFG.GOOGLE_CLIENT_ID||"").trim(); }
function autoBackupAtivo(){ return localStorage.getItem(AUTO_BACKUP_KEY)==="1"; }
function setAutoBackup(v){ localStorage.setItem(AUTO_BACKUP_KEY,v?"1":"0"); paginaNuvem(); }
function agoraArquivo(){ const d=new Date(); const p=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`; }

function cloudStatus(texto,tipo="info"){
  const el=document.getElementById("cloudStatus");
  if(!el) return;
  el.className=`cloud-status ${tipo}`;
  el.textContent=texto;
}

function carregarGoogleIdentity(){
  if(window.google?.accounts?.oauth2) return Promise.resolve();
  if(driveScriptPromise) return driveScriptPromise;
  driveScriptPromise=new Promise((resolve,reject)=>{
    const s=document.createElement("script");
    s.src="https://accounts.google.com/gsi/client";
    s.async=true;
    s.defer=true;
    s.onload=()=>resolve();
    s.onerror=()=>reject(new Error("Não foi possível carregar o Google Identity Services."));
    document.head.appendChild(s);
  });
  return driveScriptPromise;
}

async function conectarGoogleDrive(){
  if(!cloudConfigured()){
    cloudStatus("Falta configurar o GOOGLE_CLIENT_ID no arquivo config.js.","erro");
    return false;
  }
  cloudStatus("Abrindo conexão segura com o Google...","info");
  try{
    await carregarGoogleIdentity();
    return await new Promise((resolve)=>{
      driveTokenClient=google.accounts.oauth2.initTokenClient({
        client_id:CLOUD_CFG.GOOGLE_CLIENT_ID,
        scope:"https://www.googleapis.com/auth/drive.file",
        callback:(resp)=>{
          if(resp?.access_token){
            driveToken=resp.access_token;
            driveFolderId=null;
            paginaNuvem();
            setTimeout(()=>cloudStatus("Google Drive conectado.","ok"),0);
            resolve(true);
          } else {
            cloudStatus("A conexão com o Google Drive não foi concluída.","erro");
            resolve(false);
          }
        }
      });
      driveTokenClient.requestAccessToken({prompt:driveToken?"":"consent"});
    });
  }catch(e){
    console.error(e);
    cloudStatus(e.message||"Erro ao conectar ao Google Drive.","erro");
    return false;
  }
}

async function driveFetch(url,options={}){
  if(!driveToken){
    const ok=await conectarGoogleDrive();
    if(!ok) throw new Error("Google Drive não conectado.");
  }
  const headers=new Headers(options.headers||{});
  headers.set("Authorization",`Bearer ${driveToken}`);
  const r=await fetch(url,{...options,headers});
  if(r.status===401){
    driveToken=null;
    throw new Error("A sessão do Google expirou. Conecte novamente.");
  }
  if(!r.ok){
    let t="";
    try{ t=await r.text(); }catch{}
    throw new Error(`Google Drive: ${r.status} ${t}`.slice(0,350));
  }
  return r;
}

async function obterPastaDrive(){
  if(driveFolderId) return driveFolderId;
  const nome=CLOUD_CFG.DRIVE_FOLDER_NAME||"EmbrioGestor";
  const q=`mimeType='application/vnd.google-apps.folder' and name='${nome.replace(/'/g,"\\'")}' and trashed=false`;
  const u=`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name)&pageSize=10`;
  const data=await (await driveFetch(u)).json();
  if(data.files?.length){
    driveFolderId=data.files[0].id;
    return driveFolderId;
  }
  const created=await (await driveFetch("https://www.googleapis.com/drive/v3/files?fields=id,name",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({name:nome,mimeType:"application/vnd.google-apps.folder"})
  })).json();
  driveFolderId=created.id;
  return driveFolderId;
}

function pacoteBackup(){
  return {
    formato:"EmbrioGestorBackup",
    versaoPacote:1,
    exportadoEm:new Date().toISOString(),
    banco:db
  };
}

function extrairBancoBackup(data){
  if(data?.formato==="EmbrioGestorBackup" && data.banco) return data.banco;
  if(data && typeof data==="object" && Array.isArray(data.clientes)) return data;
  throw new Error("O arquivo não parece ser um backup válido do EmbrioGestor.");
}

function aplicarBackupCloud(data){
  const bruto=extrairBancoBackup(data);
  const novo=typeof normalizarBanco==="function" ? normalizarBanco(bruto) : bruto;

  if(!novo || typeof novo!=="object" || !Array.isArray(novo.clientes)){
    throw new Error("O backup não contém uma base válida do EmbrioGestor.");
  }

  Object.keys(db).forEach(k=>delete db[k]);
  Object.assign(db,novo);
  salvarBanco();

  // força atualização visual após importar/restaurar
  try{
    if(typeof render==="function") render();
  }catch(e){
    console.warn("Não foi possível atualizar a tela automaticamente após a importação.",e);
  }
}

function abrirImportacaoBackup(){
  const input=document.getElementById("cloudImportBackup");
  if(input) input.click();
}

async function importarBackupArquivo(input){
  const file=input?.files?.[0];
  if(!file) return;

  try{
    const txt=await file.text();
    const data=JSON.parse(txt);

    // valida antes de perguntar/alterar
    const bruto=extrairBancoBackup(data);
    if(!bruto || !Array.isArray(bruto.clientes)){
      throw new Error("Arquivo de backup inválido.");
    }

    const qtdClientes=bruto.clientes?.length||0;
    const qtdDoadoras=bruto.doadoras?.length||0;
    const qtdProducoes=bruto.producoes?.length||0;

    const ok=confirm(
      `Importar este backup?\n\n`+
      `Clientes: ${qtdClientes}\n`+
      `Doadoras: ${qtdDoadoras}\n`+
      `Produções: ${qtdProducoes}\n\n`+
      `Os dados atuais deste aparelho serão substituídos.`
    );
    if(!ok) return;

    // salva uma cópia local de emergência antes de substituir
    try{
      localStorage.setItem(
        "embriogestor_backup_antes_importacao",
        JSON.stringify(pacoteBackup())
      );
    }catch(e){
      console.warn("Não foi possível criar backup local de emergência.",e);
    }

    aplicarBackupCloud(data);
    localStorage.setItem("embriogestor_ultima_importacao",new Date().toISOString());

    alert("Backup importado com sucesso.");
    paginaNuvem();
    setTimeout(()=>cloudStatus("Backup importado e salvo neste aparelho.","ok"),0);
  }catch(e){
    console.error(e);
    alert(e.message||"Não foi possível importar o backup.");
  }finally{
    if(input) input.value="";
  }
}

async function uploadMultipartDrive(nome,conteudo,mime="application/json",pastaId=null){
  const boundary="eg_"+Math.random().toString(36).slice(2);
  const meta={name:nome};
  if(pastaId) meta.parents=[pastaId];

  const blob=new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    conteudo,
    `\r\n--${boundary}--`
  ],{type:`multipart/related; boundary=${boundary}`});

  return await (await driveFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime",{
    method:"POST",
    headers:{"Content-Type":`multipart/related; boundary=${boundary}`},
    body:blob
  })).json();
}

async function salvarBackupDrive(silencioso=false){
  if(cloudBusy) return;
  cloudBusy=true;
  try{
    if(!silencioso) cloudStatus("Salvando backup no Google Drive...","info");
    const pasta=await obterPastaDrive();
    const nome=`${CLOUD_CFG.BACKUP_PREFIX||"EmbrioGestor_Backup_"}${agoraArquivo()}.json`;
    const txt=JSON.stringify(pacoteBackup(),null,2);
    const file=await uploadMultipartDrive(nome,txt,"application/json",pasta);
    localStorage.setItem("embriogestor_drive_ultimo_backup",new Date().toISOString());

    if(!silencioso){
      cloudStatus(`Backup salvo no Drive: ${file.name}`,"ok");
      await listarBackupsDrive();
    }
  }catch(e){
    console.error(e);
    if(!silencioso) cloudStatus(e.message||"Falha ao salvar backup.","erro");
  }finally{
    cloudBusy=false;
  }
}

async function buscarArquivoPorNome(nome){
  const pasta=await obterPastaDrive();
  const q=`name='${nome.replace(/'/g,"\\'")}' and '${pasta}' in parents and trashed=false`;
  const u=`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc&pageSize=10`;
  const data=await (await driveFetch(u)).json();
  return data.files||[];
}

async function salvarDadosPrincipaisDrive(){
  if(cloudBusy) return;
  cloudBusy=true;
  try{
    cloudStatus("Sincronizando arquivo principal com o Drive...","info");
    const nome=CLOUD_CFG.DRIVE_MASTER_FILE||"EmbrioGestor_Dados_Principais.json";
    const txt=JSON.stringify(pacoteBackup(),null,2);
    const achados=await buscarArquivoPorNome(nome);

    if(achados.length){
      await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${achados[0].id}?uploadType=media`,{
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:txt
      });
    }else{
      await uploadMultipartDrive(nome,txt,"application/json",await obterPastaDrive());
    }

    localStorage.setItem("embriogestor_drive_ultima_sync",new Date().toISOString());
    paginaNuvem();
    setTimeout(()=>cloudStatus("Dados principais sincronizados com o Google Drive.","ok"),0);
  }catch(e){
    console.error(e);
    cloudStatus(e.message||"Falha na sincronização.","erro");
  }finally{
    cloudBusy=false;
  }
}

async function carregarDadosPrincipaisDrive(){
  if(cloudBusy) return;

  const confirmou=confirm(
    "Carregar os dados do Drive substituirá os dados atuais deste aparelho.\n\n"+
    "Deseja continuar?"
  );
  if(!confirmou) return;

  cloudBusy=true;
  try{
    cloudStatus("Carregando dados principais do Drive...","info");

    const nome=CLOUD_CFG.DRIVE_MASTER_FILE||"EmbrioGestor_Dados_Principais.json";
    const achados=await buscarArquivoPorNome(nome);

    if(!achados.length){
      throw new Error("Ainda não existe um arquivo principal no Drive.");
    }

    const resposta=await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${achados[0].id}?alt=media`
    );
    const texto=await resposta.text();

    let data;
    try{
      data=JSON.parse(texto);
    }catch{
      throw new Error("O arquivo principal do Drive não contém JSON válido.");
    }

    // cópia local de emergência antes de substituir
    try{
      localStorage.setItem(
        "embriogestor_backup_antes_drive",
        JSON.stringify(pacoteBackup())
      );
    }catch(e){
      console.warn("Não foi possível criar backup local de emergência.",e);
    }

    aplicarBackupCloud(data);
    localStorage.setItem("embriogestor_drive_ultima_sync",new Date().toISOString());

    alert("Dados do Google Drive carregados com sucesso.");
    paginaNuvem();
    setTimeout(()=>cloudStatus("Dados do Drive carregados com sucesso.","ok"),0);
  }catch(e){
    console.error(e);
    alert(e.message||"Falha ao carregar dados do Drive.");
    cloudStatus(e.message||"Falha ao carregar dados.","erro");
  }finally{
    cloudBusy=false;
  }
}

async function listarBackupsDrive(){
  const lista=document.getElementById("cloudBackupList");
  if(lista) lista.innerHTML="<p>Carregando backups...</p>";

  try{
    const pasta=await obterPastaDrive();
    const prefix=CLOUD_CFG.BACKUP_PREFIX||"EmbrioGestor_Backup_";
    const q=`name contains '${prefix.replace(/'/g,"\\'")}' and '${pasta}' in parents and trashed=false`;
    const u=`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc&pageSize=30`;
    const data=await (await driveFetch(u)).json();

    if(!lista) return;

    if(!data.files?.length){
      lista.innerHTML="<p>Nenhum backup encontrado no Drive.</p>";
      return;
    }

    lista.innerHTML=`<div class="cloud-backup-table">${
      data.files.map(f=>`
        <div class="cloud-backup-row">
          <div>
            <b>${cloudEsc(f.name)}</b>
            <small>${new Date(f.modifiedTime).toLocaleString("pt-BR")}</small>
          </div>
          <button class="btn secondary" onclick="restaurarBackupDrive('${f.id}')">Restaurar</button>
        </div>
      `).join("")
    }</div>`;
  }catch(e){
    if(lista) lista.innerHTML=`<p class="text-danger">${cloudEsc(e.message)}</p>`;
  }
}

async function restaurarBackupDrive(fileId){
  try{
    if(!confirm("Restaurar este backup substituirá os dados atuais deste aparelho. Continuar?")) return;

    const resposta=await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
    );
    const texto=await resposta.text();

    let data;
    try{
      data=JSON.parse(texto);
    }catch{
      throw new Error("O backup selecionado não contém JSON válido.");
    }

    try{
      localStorage.setItem(
        "embriogestor_backup_antes_restauracao",
        JSON.stringify(pacoteBackup())
      );
    }catch(e){
      console.warn("Não foi possível criar backup local de emergência.",e);
    }

    aplicarBackupCloud(data);
    alert("Backup restaurado com sucesso.");
    paginaNuvem();
  }catch(e){
    alert(e.message||"Falha ao restaurar backup.");
  }
}

function agendarAutoBackupDrive(){
  if(!autoBackupAtivo() || !driveToken) return;
  clearTimeout(autoBackupTimer);
  autoBackupTimer=setTimeout(()=>salvarBackupDrive(true),12000);
}

// Salvar local continua imediato. Se o usuário ativar backup automático e estiver
// conectado ao Drive, uma cópia é enviada alguns segundos depois.
if(typeof salvarBanco==="function"){
  const _salvarBancoLocal=salvarBanco;
  salvarBanco=function(){
    _salvarBancoLocal();
    agendarAutoBackupDrive();
  };
}

function paginaNuvem(){
  header("Nuvem & Backup","Google Drive, segurança, importação e sincronização entre dispositivos");

  const c=document.getElementById("content");
  const ultimoBackup=localStorage.getItem("embriogestor_drive_ultimo_backup");
  const ultimaSync=localStorage.getItem("embriogestor_drive_ultima_sync");
  const ultimaImportacao=localStorage.getItem("embriogestor_ultima_importacao");
  const configurado=cloudConfigured();

  c.innerHTML=`
    <div class="cloud-grid">
      <section class="card">
        <h3>Google Drive</h3>
        <p class="muted">Guarde cópias de segurança e um arquivo principal para abrir os mesmos dados em outro celular ou computador.</p>

        <div class="cloud-kv"><span>Configuração</span><b>${configurado?"Client ID informado":"Ainda não configurado"}</b></div>
        <div class="cloud-kv"><span>Conexão</span><b>${driveToken?"Conectado":"Desconectado"}</b></div>
        <div class="cloud-kv"><span>Último backup</span><b>${ultimoBackup?new Date(ultimoBackup).toLocaleString("pt-BR"):"Nenhum"}</b></div>
        <div class="cloud-kv"><span>Última sincronização</span><b>${ultimaSync?new Date(ultimaSync).toLocaleString("pt-BR"):"Nenhuma"}</b></div>
        <div class="cloud-kv"><span>Última importação</span><b>${ultimaImportacao?new Date(ultimaImportacao).toLocaleString("pt-BR"):"Nenhuma"}</b></div>

        <div class="cloud-actions">
          <button class="btn primary" onclick="conectarGoogleDrive()">${driveToken?"Reconectar Google Drive":"Conectar Google Drive"}</button>
          <button class="btn secondary" onclick="salvarBackupDrive()" ${driveToken?"":"disabled"}>Salvar backup agora</button>
        </div>

        <label class="cloud-toggle">
          <input type="checkbox" ${autoBackupAtivo()?"checked":""} onchange="setAutoBackup(this.checked)">
          Fazer backup automático após alterações, quando o Drive estiver conectado
        </label>

        ${!configurado?`
          <div class="cloud-help">
            <b>Para ativar:</b> abra <code>config.js</code> e preencha <code>GOOGLE_CLIENT_ID</code>.
            O aplicativo precisa estar publicado em HTTPS para o login do Google funcionar corretamente.
          </div>`:""}
      </section>

      <section class="card">
        <h3>Dados principais</h3>
        <p class="muted">Use este arquivo como ponto de encontro entre seus aparelhos. Salve no computador e carregue no celular, ou o contrário.</p>

        <div class="cloud-actions vertical">
          <button class="btn primary" onclick="salvarDadosPrincipaisDrive()" ${driveToken?"":"disabled"}>
            Enviar dados deste aparelho
          </button>
          <button class="btn secondary" onclick="carregarDadosPrincipaisDrive()" ${driveToken?"":"disabled"}>
            Carregar dados do Drive
          </button>
        </div>

        <div class="cloud-warning">
          <b>Importante:</b> esta versão faz sincronização por arquivo.
          Não é edição simultânea em tempo real.
          Antes de trocar de aparelho, envie os dados atuais; no outro aparelho, carregue a versão mais recente.
        </div>
      </section>
    </div>

    <section class="card">
      <div class="section-head">
        <div>
          <h3>Importar backup do aparelho</h3>
          <p class="muted">Use um arquivo JSON exportado anteriormente pelo EmbrioGestor para restaurar clientes, doadoras, touros, estoques, produções, transferências e demais cadastros.</p>
        </div>
        <button class="btn primary" onclick="abrirImportacaoBackup()">Importar arquivo de backup</button>
      </div>

      <input
        id="cloudImportBackup"
        type="file"
        accept=".json,application/json"
        style="display:none"
        onchange="importarBackupArquivo(this)"
      >

      <div class="cloud-warning">
        Antes de importar, mantenha uma cópia de segurança. A importação substitui os dados atuais deste aparelho.
      </div>
    </section>

    <section class="card">
      <div class="section-head">
        <div>
          <h3>Backups no Google Drive</h3>
          <p class="muted">As cópias ficam dentro da pasta ${cloudEsc(CLOUD_CFG.DRIVE_FOLDER_NAME||"EmbrioGestor")}.</p>
        </div>
        <button class="btn secondary" onclick="listarBackupsDrive()" ${driveToken?"":"disabled"}>
          Atualizar lista
        </button>
      </div>

      <div id="cloudBackupList">
        <p>${driveToken?"Clique em Atualizar lista.":"Conecte o Google Drive para visualizar os backups."}</p>
      </div>
    </section>

    <section class="card">
      <h3>Banco online — estrutura preparada</h3>
      <p class="muted">
        A versão atual continua gravando imediatamente no aparelho e pode sincronizar o arquivo principal pelo Drive.
        A camada de nuvem foi separada do restante do sistema para permitir uma futura etapa de banco online com login
        e edição simultânea sem alterar os cadastros atuais.
      </p>

      <div id="cloudStatus" class="cloud-status info">
        ${driveToken?"Google Drive conectado e pronto.":"Os dados locais continuam protegidos neste aparelho. Conecte o Drive para criar cópias externas."}
      </div>
    </section>
  `;
}
