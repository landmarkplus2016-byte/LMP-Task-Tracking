function getCurrentUser() {
  const raw = localStorage.getItem('pt_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function requireRole(roles) {
  const user = getCurrentUser();
  if (!user || !roles.includes(user.role)) {
    if (typeof window.redirectToDashboard === 'function') {
      window.redirectToDashboard();
    }
    return false;
  }
  return true;
}

function logout() {
  if (typeof window.stopPresenceHeartbeat === 'function') window.stopPresenceHeartbeat();
  localStorage.removeItem('pt_user');
  renderLoginScreen();
}

function completeAuth(session) {
  if (typeof window.onLoginSuccess === 'function') {
    window.onLoginSuccess(session);
  } else {
    renderAuthPlaceholder(session);
  }
}

async function initAuth() {
  const { needsSetup } = await runSeed();
  if (needsSetup) {
    renderSetupWizard();
  } else {
    renderLoginScreen();
  }
}

function showError(id, message) {
  const el = document.getElementById(id);
  el.textContent = message;
  el.classList.remove('hidden');
}

function clearError(id) {
  const el = document.getElementById(id);
  el.textContent = '';
  el.classList.add('hidden');
}

function authCardWrapperHtml(innerHtml) {
  return `
    <div class="h-full w-full flex items-center justify-center bg-[var(--bg)]">
      <div class="fade-in w-full max-w-[400px] bg-[var(--surface)] border border-[var(--line)] rounded-[10px] p-8" style="box-shadow:var(--shadow)">
        ${innerHtml}
      </div>
    </div>`;
}

function fieldHtml(id, label, type, autocomplete) {
  return `
    <label class="flex flex-col gap-[5px] mb-4">
      <span class="text-[11.5px] font-semibold text-[var(--ink-2)] tracking-[.01em]">${label} <span class="text-[var(--red)]">*</span></span>
      <input id="${id}" type="${type}" autocomplete="${autocomplete}"
        class="h-[34px] px-[10px] rounded-[7px] border border-[var(--line)] bg-[var(--surface)] text-[13px] text-[var(--ink)] outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-bg)] transition-colors">
    </label>`;
}

function errorBoxHtml(id) {
  return `<div id="${id}" class="hidden text-[12.5px] text-[var(--red)] bg-[var(--red-bg)] border border-[var(--red)] rounded-[7px] px-3 py-2 mb-4"></div>`;
}

function primaryButtonHtml(label) {
  return `<button type="submit" class="w-full h-[34px] rounded-[7px] bg-[var(--accent)] hover:bg-[var(--accent-ink)] text-white text-[13px] font-semibold transition-colors" style="box-shadow:var(--shadow-sm)">${label}</button>`;
}

function renderSetupWizard() {
  const app = document.getElementById('app');
  app.innerHTML = authCardWrapperHtml(`
    <form id="setup-form">
      <h1 class="text-[22px] font-bold text-[var(--ink)] tracking-[-0.01em]">Welcome to Project Tracker</h1>
      <p class="text-[13px] text-[var(--ink-2)] mt-1 mb-6">Create your PM account.</p>
      ${errorBoxHtml('setup-error')}
      ${fieldHtml('setup-name', 'Full Name', 'text', 'name')}
      ${fieldHtml('setup-email', 'Email', 'email', 'email')}
      ${fieldHtml('setup-password', 'Password', 'password', 'new-password')}
      ${fieldHtml('setup-confirm', 'Confirm Password', 'password', 'new-password')}
      ${primaryButtonHtml('Create Account')}
    </form>
  `);
  document.getElementById('setup-form').addEventListener('submit', handleSetupSubmit);
}

function renderLoginScreen() {
  const app = document.getElementById('app');
  app.innerHTML = authCardWrapperHtml(`
    <form id="login-form">
      <h1 class="text-[22px] font-bold text-[var(--ink)] tracking-[-0.01em]">Project Tracker</h1>
      <p class="text-[13px] text-[var(--ink-2)] mt-1 mb-6">Sign in to continue.</p>
      ${errorBoxHtml('login-error')}
      ${fieldHtml('login-email', 'Email', 'email', 'email')}
      ${fieldHtml('login-password', 'Password', 'password', 'current-password')}
      ${primaryButtonHtml('Sign In')}
    </form>
  `);
  document.getElementById('login-form').addEventListener('submit', handleLoginSubmit);
}

function renderChangePasswordScreen(user) {
  const app = document.getElementById('app');
  app.innerHTML = authCardWrapperHtml(`
    <form id="changepw-form">
      <h1 class="text-[22px] font-bold text-[var(--ink)] tracking-[-0.01em]">Set a New Password</h1>
      <p class="text-[13px] text-[var(--ink-2)] mt-1 mb-6">You must change your password before continuing.</p>
      ${errorBoxHtml('changepw-error')}
      ${fieldHtml('changepw-new', 'New Password', 'password', 'new-password')}
      ${fieldHtml('changepw-confirm', 'Confirm Password', 'password', 'new-password')}
      <div class="flex gap-[10px]">
        <button type="button" id="changepw-back" class="h-[34px] px-[14px] rounded-[7px] border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[13px] font-semibold text-[var(--ink)] transition-colors">Back</button>
        <div class="flex-1">${primaryButtonHtml('Update Password')}</div>
      </div>
    </form>
  `);
  document.getElementById('changepw-form').addEventListener('submit', (e) => handleChangePasswordSubmit(e, user));
  document.getElementById('changepw-back').addEventListener('click', renderLoginScreen);
}

function renderAuthPlaceholder(user) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="h-full w-full flex items-center justify-center bg-[var(--bg)]">
      <div class="fade-in w-full max-w-[400px] bg-[var(--surface)] border border-[var(--line)] rounded-[10px] p-8 text-center" style="box-shadow:var(--shadow)">
        <p class="text-[13px] text-[var(--ink-2)]">Signed in as</p>
        <p class="text-[18px] font-semibold text-[var(--ink)] mt-1">${escapeHtml(user.name)}</p>
        <p class="text-[11.5px] text-[var(--ink-3)] mt-1">${escapeHtml(user.role)}</p>
        <button id="auth-placeholder-logout" class="mt-5 h-[34px] px-[14px] rounded-[7px] border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[13px] font-semibold text-[var(--ink)] transition-colors">Log out</button>
      </div>
    </div>`;
  document.getElementById('auth-placeholder-logout').addEventListener('click', logout);
}

async function handleSetupSubmit(e) {
  e.preventDefault();
  clearError('setup-error');

  const name = document.getElementById('setup-name').value.trim();
  const email = document.getElementById('setup-email').value.trim().toLowerCase();
  const password = document.getElementById('setup-password').value;
  const confirm = document.getElementById('setup-confirm').value;

  if (!name || !email || !password || !confirm) {
    showError('setup-error', 'All fields are required.');
    return;
  }
  if (password !== confirm) {
    showError('setup-error', 'Passwords do not match.');
    return;
  }
  if (password.length < 8) {
    showError('setup-error', 'Password must be at least 8 characters.');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  setButtonLoading(submitBtn, true);

  try {
    const password_hash = await hashPassword(password);
    const id = await db.users.add({
      name,
      email,
      password_hash,
      role: 'project_manager',
      is_active: true,
      must_change_password: false,
      created_at: new Date()
    });

    const session = { id, name, role: 'project_manager', prefix: null };
    localStorage.setItem('pt_user', JSON.stringify(session));
    completeAuth(session);
  } catch (err) {
    setButtonLoading(submitBtn, false);
    showError('setup-error', 'Could not create your account. Please try again.');
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  clearError('login-error');

  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    showError('login-error', 'Email and password are required.');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  setButtonLoading(submitBtn, true);

  try {
    const hash = await hashPassword(password);
    const user = await db.users.where('email').equals(email).first();

    if (!user || user.password_hash !== hash) {
      setButtonLoading(submitBtn, false);
      showError('login-error', 'Invalid email or password');
      return;
    }

    if (!user.is_active) {
      setButtonLoading(submitBtn, false);
      showError('login-error', 'Account is deactivated. Contact PM.');
      return;
    }

    await writeAuditLog({ user_id: user.id, action: 'login' });

    if (user.must_change_password) {
      renderChangePasswordScreen(user);
      return;
    }

    const session = { id: user.id, name: user.name, role: user.role, prefix: user.prefix };
    localStorage.setItem('pt_user', JSON.stringify(session));
    completeAuth(session);
  } catch (err) {
    setButtonLoading(submitBtn, false);
    showError('login-error', 'Could not log in. Please try again.');
  }
}

async function handleChangePasswordSubmit(e, user) {
  e.preventDefault();
  clearError('changepw-error');

  const password = document.getElementById('changepw-new').value;
  const confirm = document.getElementById('changepw-confirm').value;

  if (!password || !confirm) {
    showError('changepw-error', 'Both fields are required.');
    return;
  }
  if (password !== confirm) {
    showError('changepw-error', 'Passwords do not match.');
    return;
  }
  if (password.length < 8) {
    showError('changepw-error', 'Password must be at least 8 characters.');
    return;
  }

  const submitBtn = e.target.querySelector('button[type="submit"]');
  setButtonLoading(submitBtn, true);

  try {
    const password_hash = await hashPassword(password);
    await db.users.update(user.id, { password_hash, must_change_password: false });
    await writeAuditLog({ user_id: user.id, action: 'password_changed' });

    const session = { id: user.id, name: user.name, role: user.role, prefix: user.prefix };
    localStorage.setItem('pt_user', JSON.stringify(session));
    completeAuth(session);
  } catch (err) {
    setButtonLoading(submitBtn, false);
    showError('changepw-error', 'Could not update your password. Please try again.');
  }
}

window.getCurrentUser = getCurrentUser;
window.requireRole = requireRole;
window.logout = logout;
window.initAuth = initAuth;
window.renderSetupWizard = renderSetupWizard;
window.renderLoginScreen = renderLoginScreen;
window.renderChangePasswordScreen = renderChangePasswordScreen;
