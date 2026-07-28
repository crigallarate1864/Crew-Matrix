import { AUTH_SESSION_KEY, AUTH_USERS } from './config.js';

let initialized = false;
let currentUser = null;

const $ = selector => document.querySelector(selector);

async function sha256Hex(value) {
  if (window.crypto?.subtle) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  if (value === 'bosetti.danilo') {
    return AUTH_USERS['bosetti.danilo'].passwordHash;
  }
  if (value === '4dmin') {
    return AUTH_USERS.admin.passwordHash;
  }
  return '';
}

function setLoginBusy(active) {
  const button = $('#loginSubmit');
  if (!button) return;
  button.disabled = active;
  button.textContent = active ? 'Verifica credenziali…' : 'Accedi ad ATLAS 118';
}

function clearLoginError() {
  $('#loginError')?.classList.remove('visible');
  $('#authShell')?.classList.remove('auth-shake');
}

function showLoginError(
  message = 'Credenziali non valide. Controlla nome utente e password.'
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

function unlockAtlas(user, onAuthenticated) {
  renderAuthenticatedUser(user);

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

function logoutAtlas() {
  sessionStorage.removeItem(AUTH_SESSION_KEY);
  location.reload();
}

function readSessionUser() {
  let session = null;

  try {
    session = JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY) || 'null');
  } catch (_) {
    session = null;
  }

  if (!session?.username) return null;
  return AUTH_USERS[String(session.username).toLowerCase()] || null;
}

function bindAuthentication(onAuthenticated) {
  $('#loginForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    clearLoginError();

    const username = $('#loginUsername')?.value.trim().toLowerCase() || '';
    const password = $('#loginPassword')?.value || '';

    if (!username || !password) {
      showLoginError('Compila entrambi i campi per continuare.');
      return;
    }

    setLoginBusy(true);

    try {
      const user = AUTH_USERS[username];
      const passwordHash = await sha256Hex(password);
      const valid = !!user && passwordHash === user.passwordHash;

      if (!valid) {
        const passwordInput = $('#loginPassword');
        if (passwordInput) {
          passwordInput.value = '';
          passwordInput.focus();
        }
        showLoginError();
        return;
      }

      sessionStorage.setItem(
        AUTH_SESSION_KEY,
        JSON.stringify({ username })
      );

      unlockAtlas(user, onAuthenticated);
    } catch (error) {
      console.error(error);
      showLoginError('Impossibile verificare le credenziali. Riprova.');
    } finally {
      setLoginBusy(false);
    }
  });

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

export function bootAuthentication({ beforeBoot, onAuthenticated } = {}) {
  beforeBoot?.();
  bindAuthentication(onAuthenticated);

  const user = readSessionUser();

  if (user) {
    unlockAtlas(user, onAuthenticated);
    return;
  }

  sessionStorage.removeItem(AUTH_SESSION_KEY);
  document.body.classList.add('auth-locked');
  $('#atlasApp')?.setAttribute('inert', '');
  setTimeout(() => $('#loginUsername')?.focus(), 120);
}

export function getCurrentAuthUser() {
  return currentUser;
}
