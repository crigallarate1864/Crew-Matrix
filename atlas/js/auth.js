import {
  SERVER_SESSION_KEY,
  SERVER_URL_STORAGE_KEY
} from './config.js';

import { loadApplicationSnapshot } from './persistence.js';

import {
  loginServer,
  logoutServer,
  verifyServerSession
} from './google-sheet-service.js';

let initialized = false;
let currentUser = null;
let currentToken = '';
let currentServerUrl = '';

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
}

function discoverServerUrl() {
  const fieldValue = $('#loginServerUrl')?.value.trim() || '';
  if (fieldValue) return fieldValue;

  const remembered = localStorage.getItem(SERVER_URL_STORAGE_KEY) || '';
  if (remembered) return remembered;

  const snapshot = loadApplicationSnapshot();
  return String(snapshot?.settings?.appsScriptUrl || '').trim();
}

function prefillServerUrl() {
  const field = $('#loginServerUrl');
  const advanced = $('#authServerAdvanced');
  if (!field) return;

  const url = discoverServerUrl();

  if (url) {
    field.value = url;
    if (advanced) advanced.open = false;
  } else if (advanced) {
    advanced.open = true;
  }
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

function unlockAtlas(user, token, serverUrl, onAuthenticated) {
  renderAuthenticatedUser(user);
  currentToken = token || currentToken;
  currentServerUrl = serverUrl || currentServerUrl;

  document.body.classList.remove('auth-locked');
  document.body.classList.add('authenticated');

  const app = $('#atlasApp');
  if (app) app.inert = false;

  $('#authScreen')?.setAttribute('aria-hidden', 'true');

  if (!initialized) {
    initialized = true;
    onAuthenticated?.(user);
  }
}

async function handleLogin(event, onAuthenticated) {
  event.preventDefault();
  clearLoginError();

  const username = $('#loginUsername')?.value.trim() || '';
  const password = $('#loginPassword')?.value || '';
  const serverUrl = discoverServerUrl();

  if (!serverUrl) {
    const advanced = $('#authServerAdvanced');
    if (advanced) advanced.open = true;
    showLoginError(
      'Server non configurato. Apri “Configurazione avanzata” e inserisci l’URL /exec.'
    );
    $('#loginServerUrl')?.focus();
    return;
  }

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
    localStorage.setItem(SERVER_URL_STORAGE_KEY, serverUrl);

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
  const serverUrl =
    session?.serverUrl ||
    currentServerUrl ||
    discoverServerUrl();

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
  $('#loginServerUrl')?.addEventListener('input', clearLoginError);
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

  if (session?.token && session?.serverUrl) {
    try {
      const result = await verifyServerSession({
        url: session.serverUrl,
        token: session.token
      });

      storeSession({
        ...session,
        user: result.user,
        expiresAt: result.expiresAt
      });

      localStorage.setItem(SERVER_URL_STORAGE_KEY, session.serverUrl);

      unlockAtlas(
        result.user,
        session.token,
        session.serverUrl,
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
    serverUrl:
      currentServerUrl ||
      session?.serverUrl ||
      localStorage.getItem(SERVER_URL_STORAGE_KEY) ||
      ''
  };
}

export function rememberServerUrl(url) {
  const clean = String(url || '').trim();
  if (!clean) return;

  currentServerUrl = clean;
  localStorage.setItem(SERVER_URL_STORAGE_KEY, clean);

  const field = $('#loginServerUrl');
  if (field) field.value = clean;
}
