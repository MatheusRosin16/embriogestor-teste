/* ============================================================
   EmbrioGestor v2.7 - Portal inicial / acesso Administrador
   ============================================================ */
const EG_AUTH_KEY="embriogestor_auth";
const EG_USUARIOS_KEY_ANTIGA="embriogestor_usuarios";
function egUsuarios(){
  let lista=[];
  if(typeof db!=="undefined"){
    if(!Array.isArray(db.usuarios))db.usuarios=[];
    if(!db.usuarios.some(u=>u.perfil==="Administrador")){
      try{
        const antigos=JSON.parse(localStorage.getItem(EG_USUARIOS_KEY_ANTIGA)||"[]");
        const admins=(Array.isArray(antigos)?antigos:[]).filter(u=>u.perfil==="Administrador");
        if(admins.length){db.usuarios.push(...admins);egPersistirUsuarios();}
      }catch(e){console.warn("Falha ao migrar Administrador antigo",e);}
    }
    lista=db.usuarios.filter(u=>u.perfil==="Administrador");
  }else{
    try{lista=(JSON.parse(localStorage.getItem(EG_USUARIOS_KEY_ANTIGA)||"[]")||[]).filter(u=>u.perfil==="Administrador");}catch{lista=[];}
  }
  return lista;
}
function egPersistirUsuarios(){if(typeof db!=="undefined"){db.versao=9;localStorage.setItem(typeof DB_KEY!=="undefined"?DB_KEY:"embriogestor_v9",JSON.stringify(db));}}
function egSessaoAtiva(){try{const s=JSON.parse(sessionStorage.getItem(EG_AUTH_KEY))||null;return s?.perfil==="Administrador"?s:null;}catch{return null;}}
function egSalvarSessao(u){sessionStorage.setItem(EG_AUTH_KEY,JSON.stringify({id:u.id,nome:u.nome,usuario:u.usuario,perfil:"Administrador",entrada:new Date().toISOString()}));}
function egSair(){sessionStorage.removeItem(EG_AUTH_KEY);location.reload();}
async function egHash(t){const b=new TextEncoder().encode(t),h=await crypto.subtle.digest("SHA-256",b);return Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,"0")).join("");}
function egPrimeiroAcesso(){return egUsuarios().length===0;}
function egMensagem(t){const el=document.getElementById("egLoginMensagem");if(!el)return;el.textContent=t;el.hidden=false;}
function egMostrarSenha(id="egSenha"){const c=document.getElementById(id);if(c)c.type=c.type==="password"?"text":"password";}
function egFecharOverlay(){document.getElementById("egAuthOverlay")?.remove();document.documentElement.classList.remove("eg-auth-locked");document.body.classList.remove("eg-auth-locked");}
function egCriarOverlay(c){document.getElementById("egAuthOverlay")?.remove();document.documentElement.classList.add("eg-auth-locked");document.body.classList.add("eg-auth-locked");const o=document.createElement("div");o.id="egAuthOverlay";o.className="eg-auth-overlay";o.innerHTML=c;document.body.appendChild(o);}
function egMarcaLogin(){return `<div class="eg-login-brand"><img src="logo-seminna.png" alt="Sêminna"><h1>EmbrioGestor</h1><p>Sistema de Gestão de Produção de Embriões</p></div>`;}
function egRodapeLogin(){return `<footer class="eg-login-footer"><div><strong>Sêminna</strong><small>Biotecnologia em Reprodução Animal</small></div><div>🔒 Acesso exclusivo do Administrador</div><div>EmbrioGestor v2.7</div></footer>`;}
function egTelaPrimeiroAcesso(){egCriarOverlay(`<div class="eg-login-page"><div class="eg-login-card">${egMarcaLogin()}<h2>Configuração inicial</h2><p class="eg-login-sub">Crie o usuário Administrador deste aparelho.</p><label>Nome</label><input id="egNovoNome" type="text" autocomplete="name" placeholder="Nome do administrador"><label>Usuário</label><input id="egNovoUsuario" type="text" autocomplete="username" placeholder="Escolha um usuário"><label>Senha</label><div class="eg-password-wrap"><input id="egNovaSenha" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres"><button type="button" class="eg-eye" onclick="egMostrarSenha('egNovaSenha')">👁</button></div><label>Confirmar senha</label><input id="egConfirmaSenha" type="password" autocomplete="new-password" placeholder="Digite novamente" onkeydown="if(event.key==='Enter')egCriarAdministrador()"><div id="egLoginMensagem" class="eg-login-error" hidden></div><button class="eg-login-button" onclick="egCriarAdministrador()">CRIAR ADMINISTRADOR</button><div class="eg-login-security"><strong>Acesso administrativo</strong><span>Esta versão não cria acessos de cliente ou perfis de consulta.</span></div></div>${egRodapeLogin()}</div>`);}
function egTelaLogin(){egCriarOverlay(`<div class="eg-login-page"><div class="eg-login-card">${egMarcaLogin()}<h2>Acesse sua conta</h2><p class="eg-login-sub">Acesso exclusivo para o Administrador do EmbrioGestor.</p><label>Usuário</label><input id="egUsuario" type="text" autocomplete="username" placeholder="Digite seu usuário"><label>Senha</label><div class="eg-password-wrap"><input id="egSenha" type="password" autocomplete="current-password" placeholder="Digite sua senha" onkeydown="if(event.key==='Enter')egEntrar()"><button type="button" class="eg-eye" onclick="egMostrarSenha('egSenha')">👁</button></div><div id="egLoginMensagem" class="eg-login-error" hidden></div><button class="eg-login-button" onclick="egEntrar()">ENTRAR</button><div class="eg-login-security"><strong>Seus dados sempre protegidos</strong><span>Backup e sincronização continuam disponíveis através do Google Drive.</span></div></div>${egRodapeLogin()}</div>`);}
async function egCriarAdministrador(){const nome=document.getElementById("egNovoNome")?.value.trim()||"",usuario=document.getElementById("egNovoUsuario")?.value.trim().toLowerCase()||"",senha=document.getElementById("egNovaSenha")?.value||"",confirma=document.getElementById("egConfirmaSenha")?.value||"";if(!nome||!usuario||!senha)return egMensagem("Preencha todos os campos.");if(senha.length<6)return egMensagem("A senha deve possuir pelo menos 6 caracteres.");if(senha!==confirma)return egMensagem("As senhas não conferem.");const novo={id:"USR"+String(Date.now()).slice(-8),nome,usuario,senhaHash:await egHash(senha),perfil:"Administrador",clienteId:"",profissionalId:"",ativo:true,criadoEm:new Date().toISOString()};if(typeof db!=="undefined"){if(!Array.isArray(db.usuarios))db.usuarios=[];db.usuarios.push(novo);egPersistirUsuarios();}else localStorage.setItem(EG_USUARIOS_KEY_ANTIGA,JSON.stringify([novo]));egSalvarSessao(novo);egFecharOverlay();if(typeof egAtualizarInterfacePerfil==="function")egAtualizarInterfacePerfil();if(typeof render==="function")render();}
async function egEntrar(){const ui=document.getElementById("egUsuario")?.value.trim().toLowerCase()||"",senha=document.getElementById("egSenha")?.value||"";if(!ui||!senha)return egMensagem("Informe usuário e senha.");const u=egUsuarios().find(x=>x.ativo!==false&&String(x.usuario).toLowerCase()===ui);if(!u)return egMensagem("Administrador não encontrado.");if((await egHash(senha))!==u.senhaHash)return egMensagem("Senha incorreta.");egSalvarSessao(u);egFecharOverlay();if(typeof egAtualizarInterfacePerfil==="function")egAtualizarInterfacePerfil();if(typeof render==="function")render();}
function egInicializarLogin(){egUsuarios();if(egPrimeiroAcesso())egTelaPrimeiroAcesso();else if(!egSessaoAtiva())egTelaLogin();else{egFecharOverlay();if(typeof egAtualizarInterfacePerfil==="function")egAtualizarInterfacePerfil();}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",egInicializarLogin);else egInicializarLogin();
