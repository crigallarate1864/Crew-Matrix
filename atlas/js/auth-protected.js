import {api} from '../../portal/js/api.js';
import {
  readSession,
  storeSession,
  clearSession,
  routeForProfile,
  logout
} from '../../portal/js/session.js';

let currentUser=null;
let currentToken='';
let bootOverlay=null;

function requiredProfile(){
  return String(document.body.dataset.requiredProfile||'').toUpperCase();
}

function ensureBootOverlay(){
  if(bootOverlay&&document.body.contains(bootOverlay))return bootOverlay;

  if(!document.querySelector('#atlasBootLoaderStyle')){
    const style=document.createElement('style');
    style.id='atlasBootLoaderStyle';
    style.textContent=`
      #atlasBootLoader{
        position:fixed;inset:0;z-index:100000;display:grid;place-items:center;
        padding:24px;background:rgba(2,12,20,.84);backdrop-filter:blur(15px);
        color:#ecf8fc;font-family:Inter,Segoe UI,Arial,sans-serif;
        transition:opacity .22s ease,visibility .22s ease
      }
      #atlasBootLoader.atlas-boot-hide{opacity:0;visibility:hidden;pointer-events:none}
      #atlasBootLoader .atlas-boot-card{
        width:min(520px,calc(100vw - 36px));padding:24px;border-radius:20px;
        border:1px solid rgba(122,201,228,.20);background:linear-gradient(145deg,rgba(8,31,46,.98),rgba(5,22,34,.98));
        box-shadow:0 30px 90px rgba(0,0,0,.42)
      }
      #atlasBootLoader .atlas-boot-top{display:flex;align-items:center;gap:14px}
      #atlasBootLoader .atlas-boot-spinner{
        width:42px;height:42px;flex:0 0 42px;border-radius:50%;
        border:3px solid rgba(125,211,252,.18);border-top-color:#38bdf8;
        animation:atlasBootSpin .8s linear infinite
      }
      #atlasBootLoader.atlas-boot-error .atlas-boot-spinner{
        display:grid;place-items:center;border:1px solid rgba(251,113,133,.28);
        background:rgba(251,113,133,.09);animation:none
      }
      #atlasBootLoader.atlas-boot-error .atlas-boot-spinner::after{
        content:'!';color:#fda4af;font-size:22px;font-weight:900
      }
      #atlasBootLoader .atlas-boot-copy{min-width:0}
      #atlasBootLoader .atlas-boot-kicker{color:#7dd3fc;font-size:9px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}
      #atlasBootLoader .atlas-boot-title{margin-top:5px;font-size:18px;font-weight:900;line-height:1.2}
      #atlasBootLoader .atlas-boot-detail{margin-top:6px;color:#91a9b7;font-size:11px;line-height:1.55}
      #atlasBootLoader .atlas-boot-progress{height:5px;margin-top:18px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.06)}
      #atlasBootLoader .atlas-boot-progress>i{display:block;height:100%;width:8%;border-radius:inherit;background:linear-gradient(90deg,#06b6d4,#3b82f6);transition:width .25s ease}
      #atlasBootLoader .atlas-boot-status{display:flex;align-items:center;gap:7px;margin-top:10px;color:#6f8c9b;font-size:9px}
      #atlasBootLoader .atlas-boot-status-dot{width:7px;height:7px;border-radius:50%;background:#6ee7b7;box-shadow:0 0 0 4px rgba(110,231,183,.07)}
      #atlasBootLoader .atlas-boot-actions{display:none;gap:8px;margin-top:18px}
      #atlasBootLoader .atlas-boot-cancel-row{display:flex;justify-content:flex-end;margin-top:14px}
      #atlasBootLoader.atlas-boot-error .atlas-boot-actions{display:flex}
      #atlasBootLoader .atlas-boot-btn{min-height:40px;padding:8px 13px;border:1px solid rgba(145,188,214,.17);border-radius:10px;background:rgba(255,255,255,.035);color:#edf8fc;font-weight:800;cursor:pointer}
      #atlasBootLoader .atlas-boot-btn.primary{border-color:transparent;background:linear-gradient(135deg,#0891b2,#2563eb)}
      @keyframes atlasBootSpin{to{transform:rotate(360deg)}}
      @media(max-width:560px){#atlasBootLoader .atlas-boot-card{padding:19px}#atlasBootLoader .atlas-boot-actions{display:grid!important;grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  bootOverlay=document.createElement('div');
  bootOverlay.id='atlasBootLoader';
  bootOverlay.innerHTML=`
    <section class="atlas-boot-card" role="status" aria-live="polite" aria-busy="true">
      <div class="atlas-boot-top">
        <div class="atlas-boot-spinner" aria-hidden="true"></div>
        <div class="atlas-boot-copy">
          <div class="atlas-boot-kicker">ATLAS 118</div>
          <div class="atlas-boot-title" id="atlasBootTitle">Avvio in corso…</div>
          <div class="atlas-boot-detail" id="atlasBootDetail">Sto preparando l'applicazione.</div>
        </div>
      </div>
      <div class="atlas-boot-progress"><i id="atlasBootProgress"></i></div>
      <div class="atlas-boot-status"><span class="atlas-boot-status-dot"></span><span id="atlasBootStatus">Non chiudere la pagina</span></div>
      <div class="atlas-boot-cancel-row"><button class="atlas-boot-btn" id="atlasBootCancel" type="button">Annulla</button></div>
      <div class="atlas-boot-actions">
        <button class="atlas-boot-btn primary" id="atlasBootRetry" type="button">Riprova</button>
        <button class="atlas-boot-btn" id="atlasBootLogin" type="button">Torna al login</button>
      </div>
    </section>`;

  document.body.appendChild(bootOverlay);

  bootOverlay.querySelector('#atlasBootCancel')?.addEventListener('click',()=>{
    clearSession();
    location.replace('index.html');
  });
  bootOverlay.querySelector('#atlasBootRetry')?.addEventListener('click',()=>location.reload());
  bootOverlay.querySelector('#atlasBootLogin')?.addEventListener('click',()=>{
    clearSession();
    location.replace('index.html');
  });

  return bootOverlay;
}

export function setBootLoadingStep(title,detail='',progress=10,status='Non chiudere la pagina'){
  const overlay=ensureBootOverlay();
  overlay.classList.remove('atlas-boot-error','atlas-boot-hide');
  const card=overlay.querySelector('.atlas-boot-card');
  if(card)card.setAttribute('aria-busy','true');
  const t=overlay.querySelector('#atlasBootTitle');
  const d=overlay.querySelector('#atlasBootDetail');
  const p=overlay.querySelector('#atlasBootProgress');
  const s=overlay.querySelector('#atlasBootStatus');
  if(t)t.textContent=title||'Caricamento…';
  if(d)d.textContent=detail||'';
  if(p)p.style.width=`${Math.max(4,Math.min(100,Number(progress)||0))}%`;
  if(s)s.textContent=status||'Non chiudere la pagina';
}

export function finishBootLoading(detail='Calendario e dati pronti.'){
  const overlay=ensureBootOverlay();
  setBootLoadingStep('ATLAS 118 è pronto',detail,100,'Caricamento completato');
  setTimeout(()=>{
    overlay.classList.add('atlas-boot-hide');
    setTimeout(()=>overlay.remove(),260);
  },420);
}

export function failBootLoading(error,{title='Caricamento non completato'}={}){
  const overlay=ensureBootOverlay();
  overlay.classList.add('atlas-boot-error');
  const card=overlay.querySelector('.atlas-boot-card');
  if(card)card.setAttribute('aria-busy','false');
  const t=overlay.querySelector('#atlasBootTitle');
  const d=overlay.querySelector('#atlasBootDetail');
  const p=overlay.querySelector('#atlasBootProgress');
  const s=overlay.querySelector('#atlasBootStatus');
  if(t)t.textContent=title;
  if(d)d.textContent=String(error?.message||error||'Errore non specificato.');
  if(p)p.style.width='100%';
  if(s)s.textContent='La sessione non viene cancellata automaticamente. Puoi riprovare.';
}

function isDefinitiveAuthError(error){
  return /(sessione\s+(assente|scaduta|non valida)|utente non autorizzato)/i.test(String(error?.message||error||''));
}

function redirectLogin(){
  clearSession();
  location.replace('index.html');
}

function renderUser(user){
  const avatar=document.querySelector('#operatorAvatar');
  const name=document.querySelector('#operatorName');
  const role=document.querySelector('#operatorRole');

  if(avatar)avatar.textContent=user.initials||'UT';
  if(name)name.textContent=user.displayName||user.username||'Utente';
  if(role)role.textContent=user.role||user.profileType||'';
}

function unlock(){
  document.body.classList.remove('auth-locked');
  document.body.classList.add('authenticated');
  const app=document.querySelector('#atlasApp');
  if(app)app.inert=false;
}

export async function bootAuthentication({beforeBoot,onAuthenticated}={}){
  beforeBoot?.();
  ensureBootOverlay();
  setBootLoadingStep(
    'Verifica accesso',
    'Controllo la sessione e il profilo autorizzato.',
    10
  );

  document.querySelector('#logoutBtn')
    ?.addEventListener('click',logout);

  const session=readSession();
  if(!session?.token){
    setBootLoadingStep('Accesso richiesto','Non trovo una sessione attiva. Ti porto alla pagina di accesso.',10);
    setTimeout(redirectLogin,450);
    return;
  }

  let result;
  try{
    result=await api({
      action:'session',
      token:session.token
    },{timeout:20000});
  }catch(error){
    console.error('Verifica sessione fallita:',error);
    if(isDefinitiveAuthError(error)){
      setBootLoadingStep('Sessione scaduta','La sessione non è più valida. Ti riporto al login.',10);
      setTimeout(redirectLogin,700);
    }else{
      failBootLoading(error,{title:'Non riesco a verificare la sessione'});
    }
    return;
  }

  const user=result.user;
  const required=requiredProfile();
  const actual=String(user.profileType||'').toUpperCase();

  if(actual!==required){
    storeSession({
      token:session.token,
      user,
      expiresAt:result.expiresAt
    });
    setBootLoadingStep('Apro il profilo corretto','Il tuo account usa una pagina ATLAS diversa.',18);
    location.replace(routeForProfile(actual));
    return;
  }

  currentUser=user;
  currentToken=session.token;

  storeSession({
    token:currentToken,
    user,
    expiresAt:result.expiresAt
  });

  renderUser(user);
  unlock();

  try{
    await onAuthenticated?.(user);
  }catch(error){
    // IMPORTANTE: un errore nel caricamento dei dati non deve espellere l'utente.
    console.error('Inizializzazione ATLAS non completata:',error);
    failBootLoading(error,{title:'ATLAS non ha completato il caricamento'});
  }
}

export function getServerAuthContext(){
  const session=readSession();
  return{
    token:session?.token||currentToken,
    user:session?.user||currentUser,
    serverUrl:''
  };
}

export function rememberServerUrl(){
  return true;
}
