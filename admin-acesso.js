/* ============================================================
   EmbrioGestor — Acesso ADM em dois modos v1
   Arquivo separado. Não altera app.js.
   Carregar APÓS app.js e ANTES do login.js, se possível.
   ============================================================ */
(function(){
"use strict";

const CFG = window.EMBRIO_ADMIN_FIXO || {};
const DB_CANDIDATAS = [
  "embriogestor_v9",
  "embriogestor_v8",
  "embriogestor_v7",
  "embriogestor_v6",
  "embriogestor_v5",
  "embriogestor_v4",
  "embriogestor_v3",
  "embriogestor_v2",
  "embriogestor_v1"
];

function adminId(lista){
  const usados = new Set((lista||[]).map(x=>String(x.id||"")));
  let n=1, id="";
  do { id="USR"+String(n++).padStart(5,"0"); } while(usados.has(id));
  return id;
}

function localizarBanco(){
  for(const chave of DB_CANDIDATAS){
    const raw=localStorage.getItem(chave);
    if(!raw) continue;
    try{
      const data=JSON.parse(raw);
      if(data && typeof data==="object") return {chave,data};
    }catch{}
  }

  // Em aparelho novo cria somente uma casca compatível com a versão atual.
  return {
    chave:"embriogestor_v9",
    data:{
      versao:9,
      clientes:[],fazendas:[],doadoras:[],touros:[],racas:[],
      profissionais:[],usuarios:[],estoque:[],movimentacoes:[],
      estoqueEmbrioes:[],aspiracoes:[],producoes:[],transferencias:[],
      congelamentos:[],servicosSemen:[]
    }
  };
}

function configValida(){
  return !!(
    String(CFG.nome||"").trim() &&
    String(CFG.usuario||"").trim() &&
    /^[a-f0-9]{64}$/i.test(String(CFG.senhaHash||"").trim())
  );
}

function garantirAdminFixo(){
  if(!configValida()) return false;

  const {chave,data}=localizarBanco();
  if(!Array.isArray(data.usuarios)) data.usuarios=[];

  const usuario=String(CFG.usuario).trim().toLowerCase();
  let u=data.usuarios.find(x=>String(x.usuario||"").trim().toLowerCase()===usuario);

  if(!u){
    u={
      id:adminId(data.usuarios),
      nome:String(CFG.nome).trim(),
      usuario,
      perfil:"Administrador",
      clienteId:"",
      profissionalId:"",
      senhaHash:String(CFG.senhaHash).trim().toLowerCase(),
      ativo:CFG.ativo!==false,
      criadoEm:new Date().toISOString(),
      atualizadoEm:new Date().toISOString(),
      origem:"Administrador fixo"
    };
    data.usuarios.push(u);
  }else{
    u.nome=String(CFG.nome).trim();
    u.perfil="Administrador";
    u.clienteId="";
    u.profissionalId="";
    u.senhaHash=String(CFG.senhaHash).trim().toLowerCase();
    u.ativo=CFG.ativo!==false;
    u.atualizadoEm=new Date().toISOString();
  }

  localStorage.setItem(chave,JSON.stringify(data));
  return true;
}

function sha256(texto){
  const bytes=new TextEncoder().encode(texto);
  return crypto.subtle.digest("SHA-256",bytes).then(buf=>
    [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("")
  );
}

function criarNovoAdmin(nome,usuario,senha){
  nome=String(nome||"").trim();
  usuario=String(usuario||"").trim().toLowerCase();

  if(!nome || !usuario){
    alert("Informe nome e usuário.");
    return Promise.resolve(false);
  }
  if(String(senha||"").length<6){
    alert("A senha deve possuir pelo menos 6 caracteres.");
    return Promise.resolve(false);
  }

  const {chave,data}=localizarBanco();
  if(!Array.isArray(data.usuarios)) data.usuarios=[];

  if(data.usuarios.some(x=>String(x.usuario||"").trim().toLowerCase()===usuario)){
    alert("Este usuário já existe neste aparelho.");
    return Promise.resolve(false);
  }

  return sha256(senha).then(hash=>{
    data.usuarios.push({
      id:adminId(data.usuarios),
      nome,
      usuario,
      perfil:"Administrador",
      clienteId:"",
      profissionalId:"",
      senhaHash:hash,
      ativo:true,
      criadoEm:new Date().toISOString(),
      atualizadoEm:new Date().toISOString(),
      origem:"Criado manualmente"
    });
    localStorage.setItem(chave,JSON.stringify(data));
    alert("Novo administrador criado. Agora você pode entrar com esse usuário.");
    location.reload();
    return true;
  });
}

function estilizar(){
  if(document.getElementById("eg-admin-duas-opcoes-css")) return;
  const s=document.createElement("style");
  s.id="eg-admin-duas-opcoes-css";
  s.textContent=`
    .eg-admin-choice{margin-top:18px;border-top:1px solid #d8e2ec;padding-top:16px}
    .eg-admin-choice-title{font-weight:800;color:#17496f;margin-bottom:8px}
    .eg-admin-choice-text{font-size:13px;color:#64748b;line-height:1.45;margin-bottom:12px}
    .eg-admin-choice-buttons{display:grid;grid-template-columns:1fr;gap:9px}
    .eg-admin-secondary{width:100%;min-height:46px;border-radius:10px;border:1px solid #b9cee1;background:#eef5fb;color:#17496f;font-weight:800;cursor:pointer}
    .eg-admin-modal{position:fixed;inset:0;background:#0f172a99;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px}
    .eg-admin-box{width:min(430px,100%);background:white;border-radius:18px;padding:24px;box-shadow:0 22px 70px #0005}
    .eg-admin-box h2{margin:0 0 8px;color:#17496f}
    .eg-admin-box p{color:#64748b;font-size:14px;line-height:1.45}
    .eg-admin-field{margin-top:12px}
    .eg-admin-field label{display:block;font-size:12px;font-weight:800;color:#246da8;margin-bottom:5px;text-transform:uppercase}
    .eg-admin-field input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #cbd9e6;border-radius:10px}
    .eg-admin-actions{display:flex;gap:10px;margin-top:18px}
    .eg-admin-actions button{flex:1;min-height:44px;border-radius:10px;font-weight:800;cursor:pointer}
    .eg-admin-cancel{background:#eef3f8;border:1px solid #cbd9e6;color:#17496f}
    .eg-admin-save{background:#2f7fbd;border:0;color:white}
  `;
  document.head.appendChild(s);
}

function fecharModal(){
  document.getElementById("eg-admin-modal")?.remove();
}

function abrirCriacao(){
  fecharModal();
  const el=document.createElement("div");
  el.id="eg-admin-modal";
  el.className="eg-admin-modal";
  el.innerHTML=`
    <div class="eg-admin-box">
      <h2>Criar novo administrador</h2>
      <p>Crie outro acesso administrativo somente se desejar. O administrador existente continuará disponível.</p>

      <div class="eg-admin-field">
        <label>Nome</label>
        <input id="egNovoAdminNome" autocomplete="name">
      </div>

      <div class="eg-admin-field">
        <label>Usuário</label>
        <input id="egNovoAdminUsuario" autocomplete="username">
      </div>

      <div class="eg-admin-field">
        <label>Senha</label>
        <input id="egNovoAdminSenha" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres">
      </div>

      <div class="eg-admin-field">
        <label>Confirmar senha</label>
        <input id="egNovoAdminSenha2" type="password" autocomplete="new-password">
      </div>

      <div class="eg-admin-actions">
        <button class="eg-admin-cancel" id="egCancelarAdmin">Cancelar</button>
        <button class="eg-admin-save" id="egSalvarAdmin">Criar administrador</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  el.querySelector("#egCancelarAdmin").onclick=fecharModal;
  el.addEventListener("click",e=>{if(e.target===el)fecharModal();});
  el.querySelector("#egSalvarAdmin").onclick=async()=>{
    const nome=document.getElementById("egNovoAdminNome")?.value||"";
    const usuario=document.getElementById("egNovoAdminUsuario")?.value||"";
    const s1=document.getElementById("egNovoAdminSenha")?.value||"";
    const s2=document.getElementById("egNovoAdminSenha2")?.value||"";
    if(s1!==s2){alert("As senhas não coincidem.");return;}
    await criarNovoAdmin(nome,usuario,s1);
  };
}

function encontrarCartaoLogin(){
  const inputs=[...document.querySelectorAll('input[type="password"]')];
  if(!inputs.length) return null;

  // Escolhe o contêiner visual mais provável do login.
  let el=inputs[0];
  for(let i=0;i<6 && el;i++,el=el.parentElement){
    const txt=(el.textContent||"").toLowerCase();
    if(txt.includes("entrar") || txt.includes("acesse sua conta") || txt.includes("configuração inicial")){
      return el;
    }
  }
  return inputs[0].parentElement?.parentElement || null;
}

function instalarEscolhas(){
  estilizar();
  garantirAdminFixo();

  if(document.getElementById("eg-admin-choice")) return true;

  const card=encontrarCartaoLogin();
  if(!card) return false;

  const bloco=document.createElement("div");
  bloco.id="eg-admin-choice";
  bloco.className="eg-admin-choice";
  bloco.innerHTML=`
    <div class="eg-admin-choice-title">Opções de acesso</div>
    <div class="eg-admin-choice-text">
      Você pode entrar com o administrador já existente ou criar outro administrador neste aparelho.
    </div>
    <div class="eg-admin-choice-buttons">
      <button type="button" class="eg-admin-secondary" id="egUsarAdminExistente">
        Entrar com administrador existente
      </button>
      <button type="button" class="eg-admin-secondary" id="egCriarOutroAdmin">
        Criar novo administrador
      </button>
    </div>
  `;

  card.appendChild(bloco);

  bloco.querySelector("#egUsarAdminExistente").onclick=()=>{
    // Apenas garante que o ADM fixo exista e deixa o formulário de login atual ser usado.
    garantirAdminFixo();

    const userInput =
      document.querySelector('input[name="usuario"]') ||
      document.querySelector('input[autocomplete="username"]') ||
      [...document.querySelectorAll("input")].find(x=>
        x.type!=="password" && /usu[aá]rio/i.test(
          (x.placeholder||"")+" "+(x.getAttribute("aria-label")||"")
        )
      );

    if(userInput && CFG.usuario){
      userInput.value=String(CFG.usuario).trim();
      userInput.dispatchEvent(new Event("input",{bubbles:true}));
      userInput.focus();
    }

    const senhaInput=document.querySelector('input[type="password"]');
    if(senhaInput) senhaInput.focus();
  };

  bloco.querySelector("#egCriarOutroAdmin").onclick=abrirCriacao;
  return true;
}

// Injeta o ADM antes mesmo de a tela de login decidir se é "primeiro acesso".
garantirAdminFixo();

// A tela de login pode ser montada depois.
let tentativas=0;
const timer=setInterval(()=>{
  tentativas++;
  if(instalarEscolhas() || tentativas>80) clearInterval(timer);
},250);

const observer=new MutationObserver(()=>instalarEscolhas());
observer.observe(document.documentElement,{childList:true,subtree:true});

})();
