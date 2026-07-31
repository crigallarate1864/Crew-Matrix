import {
  ATLAS_SERVER_URL,
  SERVER_SESSION_KEY
} from './config.js';

import {
  loginServer,
  logoutServer,
  verifyServerSession
} from './google-sheet-service.js';

let initialized = false;
let currentUser = null;
let currentToken = '';
let currentServerUrl = '';
let currentAccessMode = 'authenticated';

const $ = selector => document.querySelector(selector);

function readStoredSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SERVER_SESSION_KEY) || 'null');
  } catch (_) {
    return null;
  }
}

function storeSession(session) {
  sessionStorage.setItem(SERVER_SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  sessionStorage.removeItem(SERVER_SESSION_KEY);
  currentToken = '';
  currentUser = null;
  currentAccessMode = 'authenticated';
}

function discoverServerUrl() {
  return ATLAS_SERVER_URL;
}

function prefillServerUrl() {
  currentServerUrl = ATLAS_SERVER_URL;
}

function setLoginBusy(active) {
  const button = $('#loginSubmit');
  if (!button) return;

  button.disabled = active;
  button.textContent = active
    ? 'Verifica sul server…'
    : 'Accedi ad ATLAS 118';
}

function clearLoginError() {
  $('#loginError')?.classList.remove('visible');
  $('#authShell')?.classList.remove('auth-shake');
}

function showLoginError(
  message = 'Credenziali non valide o server non raggiungibile.'
) {
  const error = $('#loginError');
  const shell = $('#authShell');

  if (error) {
    error.textContent = message;
    error.classList.add('visible');
  }

  shell?.classList.remove('auth-shake');
  void shell?.offsetWidth;
  shell?.classList.add('auth-shake');
}

function renderAuthenticatedUser(user) {
  if (!user) return;

  currentUser = user;

  const avatar = $('#operatorAvatar');
  const name = $('#operatorName');
  const role = $('#operatorRole');

  if (avatar) avatar.textContent = user.initials || 'UT';
  if (name) name.textContent = user.displayName || user.username || 'Utente ATLAS';
  if (role) role.textContent = user.role || 'Accesso autorizzato';
}

function unlockAtlas(
  user,
  token,
  serverUrl,
  onAuthenticated,
  accessMode = 'authenticated'
) {
  renderAuthenticatedUser(user);
  currentToken = token || '';
  currentServerUrl = serverUrl || currentServerUrl;
  currentAccessMode = accessMode;

  document.body.classList.remove('auth-locked');
  document.body.classList.add('authenticated');
  document.body.classList.toggle(
    'temporary-access',
    accessMode === 'temporary'
  );

  const app = $('#atlasApp');
  if (app) app.inert = false;

  $('#authScreen')?.setAttribute('aria-hidden', 'true');

  if (!initialized) {
    initialized = true;
    onAuthenticated?.(user);
  }
}

function handleTemporaryAccess(onAuthenticated) {
  clearLoginError();

  const user = {
    username: 'temporaneo',
    displayName: 'Accesso temporaneo',
    initials: 'TMP',
    role: 'Modalità locale · nessuna sincronizzazione'
  };

  storeSession({
    temporary: true,
    user,
    serverUrl: ATLAS_SERVER_URL
  });

  unlockAtlas(
    user,
    '',
    ATLAS_SERVER_URL,
    onAuthenticated,
    'temporary'
  );
}

async function handleLogin(event, onAuthenticated) {
  event.preventDefault();
  clearLoginError();

  const username = $('#loginUsername')?.value.trim() || '';
  const password = $('#loginPassword')?.value || '';
  const serverUrl = discoverServerUrl();

  if (!username || !password) {
    showLoginError('Compila nome utente e password.');
    return;
  }

  setLoginBusy(true);

  try {
    const result = await loginServer({
      url: serverUrl,
      username,
      password
    });

    const session = {
      token: result.token,
      user: result.user,
      expiresAt: result.expiresAt,
      serverUrl
    };

    storeSession(session);
    const passwordInput = $('#loginPassword');
    if (passwordInput) passwordInput.value = '';

    unlockAtlas(
      result.user,
      result.token,
      serverUrl,
      onAuthenticated
    );
  } catch (error) {
    console.error(error);

    const passwordInput = $('#loginPassword');
    if (passwordInput) {
      passwordInput.value = '';
      passwordInput.focus();
    }

    showLoginError(error.message || 'Accesso non riuscito.');
  } finally {
    setLoginBusy(false);
  }
}

async function logoutAtlas() {
  const session = readStoredSession();
  const serverUrl = ATLAS_SERVER_URL;

  try {
    if (session?.token && serverUrl) {
      await logoutServer({
        url: serverUrl,
        token: session.token
      });
    }
  } catch (error) {
    console.warn('Logout server non completato', error);
  } finally {
    clearSession();
    location.reload();
  }
}

function bindAuthentication(onAuthenticated) {
  $('#loginForm')?.addEventListener(
    'submit',
    event => handleLogin(event, onAuthenticated)
  );

  $('#temporaryAccessBtn')?.addEventListener(
    'click',
    () => handleTemporaryAccess(onAuthenticated)
  );

  $('#passwordToggle')?.addEventListener('click', () => {
    const input = $('#loginPassword');
    const button = $('#passwordToggle');
    if (!input || !button) return;

    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.textContent = show ? 'Nascondi' : 'Mostra';
    button.setAttribute(
      'aria-label',
      show ? 'Nascondi password' : 'Mostra password'
    );
    input.focus();
  });

  $('#loginPassword')?.addEventListener('keyup', event => {
    $('#capsWarning')?.classList.toggle(
      'visible',
      event.getModifierState?.('CapsLock') === true
    );
  });

  $('#loginUsername')?.addEventListener('input', clearLoginError);
  $('#loginPassword')?.addEventListener('input', clearLoginError);
  $('#logoutBtn')?.addEventListener('click', logoutAtlas);
}

export async function bootAuthentication({
  beforeBoot,
  onAuthenticated
} = {}) {
  beforeBoot?.();
  prefillServerUrl();
  bindAuthentication(onAuthenticated);

  const session = readStoredSession();

  if (session?.temporary === true) {
    const user = session.user || {
      username: 'temporaneo',
      displayName: 'Accesso temporaneo',
      initials: 'TMP',
      role: 'Modalità locale · nessuna sincronizzazione'
    };

    unlockAtlas(
      user,
      '',
      ATLAS_SERVER_URL,
      onAuthenticated,
      'temporary'
    );
    return;
  }

  if (session?.token) {
    try {
      const result = await verifyServerSession({
        url: ATLAS_SERVER_URL,
        token: session.token
      });

      storeSession({
        ...session,
        serverUrl: ATLAS_SERVER_URL,
        user: result.user,
        expiresAt: result.expiresAt
      });

      unlockAtlas(
        result.user,
        session.token,
        ATLAS_SERVER_URL,
        onAuthenticated
      );
      return;
    } catch (error) {
      console.warn('Sessione server non valida', error);
      clearSession();
    }
  }

  document.body.classList.add('auth-locked');
  $('#atlasApp')?.setAttribute('inert', '');
  setTimeout(() => $('#loginUsername')?.focus(), 120);
}

export function getServerAuthContext() {
  const session = readStoredSession();

  return {
    token: currentToken || session?.token || '',
    user: currentUser || session?.user || null,
    serverUrl: ATLAS_SERVER_URL,
    temporary:
      currentAccessMode === 'temporary' ||
      session?.temporary === true
  };
}

export function rememberServerUrl() {
  currentServerUrl = ATLAS_SERVER_URL;
  return ATLAS_SERVER_URL;
}
