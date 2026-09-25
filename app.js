const storeKey = 'creda-data-v1';
const savedState = JSON.parse(localStorage.getItem(storeKey) || '{}');
let state = {
  user: savedState.user || null,
  debts: (savedState.debts || []).map(debt => ({ kind: 'receivable', urgency: 'normal', payments: [], ...debt })),
  expenses: savedState.expenses || [],
  budgets: savedState.budgets || {},
  settings: { currency: 'USD', darkMode: false, ...savedState.settings }
};
let authMode = 'signup';
const $ = id => document.getElementById(id);
const cloudEnabled = Boolean(window.firebase && window.CREDA_FIREBASE_CONFIG && !window.CREDA_FIREBASE_CONFIG.apiKey.includes('VOTRE_'));

function cloudSave() {
  if (!cloudEnabled || !state.user?.uid) return Promise.resolve();
  return firebase.firestore().collection('users').doc(state.user.uid).set({
    name: state.user.name,
    email: state.user.email,
    debts: state.debts,
    expenses: state.expenses,
    budgets: state.budgets,
    settings: state.settings,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

async function loadCloudUser(authUser) {
  const snapshot = await firebase.firestore().collection('users').doc(authUser.uid).get();
  const data = snapshot.exists ? snapshot.data() : {};
  state.user = { uid: authUser.uid, name: data.name || authUser.displayName || 'Utilisateur', email: authUser.email };
  state.debts = (data.debts || []).map(debt => ({ kind: 'receivable', urgency: 'normal', payments: [], ...debt }));
  state.expenses = data.expenses || [];
  state.budgets = data.budgets || {};
  state.settings = { currency: 'USD', darkMode: false, ...(data.settings || {}) };
  save();
}

async function handleCloudAuth(email, password, name) {
  try {
    let credential;
    if (authMode === 'signup') {
      credential = await firebase.auth().createUserWithEmailAndPassword(email, password);
      await credential.user.updateProfile({ displayName: name });
      state.user = { uid: credential.user.uid, name, email };
      state.debts = [];
      state.expenses = [];
      state.budgets = {};
      state.settings = { currency: 'USD', darkMode: false };
      await cloudSave();
    } else {
      credential = await firebase.auth().signInWithEmailAndPassword(email, password);
      await loadCloudUser(credential.user);
    }
    $('auth-error').textContent = '';
    showDashboard();
    if (authMode === 'signup') {
      try {
        const sent = await sendWelcomeEmail(state.user);
        showToast(sent ? 'Compte créé, vérifiez votre e-mail' : 'Compte créé');
      } catch (error) {
        showToast('Compte créé, mais l’e-mail de bienvenue a échoué');
        console.error('EmailJS error:', error);
      }
    }
  } catch (error) {
    $('auth-error').textContent = error.code === 'auth/email-already-in-use' ? 'Un compte existe déjà pour cet e-mail.' : 'E-mail ou mot de passe incorrect.';
    console.error('Firebase auth error:', error);
  }
}

function save() {
  localStorage.setItem(storeKey, JSON.stringify(state));
  cloudSave().catch(error => console.error('Cloud sync error:', error));
}
function initials(name = '') { return name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
function formatMoney(amount, currency = 'USD') { return `${Number(amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`; }
function formatDate(value) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Sans date'; }
function toUsd(debt) { const rate = Number(debt.exchangeRate) || 1; return Number(debt.amount) / (debt.currency === 'USD' ? 1 : rate); }
function showToast(message) { $('toast').textContent = message; $('toast').classList.add('show'); setTimeout(() => $('toast').classList.remove('show'), 2600); }
function emailIsConfigured() { return window.CREDA_EMAIL_CONFIG && window.CREDA_EMAIL_CONFIG.publicKey && window.CREDA_EMAIL_CONFIG.serviceId && window.CREDA_EMAIL_CONFIG.templateId && !window.CREDA_EMAIL_CONFIG.publicKey.includes('VOTRE_'); }
async function sendWelcomeEmail(user) {
  if (!emailIsConfigured() || !window.emailjs) return false;
  const config = window.CREDA_EMAIL_CONFIG;
  emailjs.init({ publicKey: config.publicKey });
  await emailjs.send(config.serviceId, config.templateId, { to_email: user.email, email: user.email, user_email: user.email, to_name: user.name, user_name: user.name, app_name: 'Creda' });
  return true;
}
function debtPaid(debt) { return (debt.payments || []).reduce((sum, payment) => sum + Number(payment.amount), 0); }
function debtStatus(debt) { const paid = debtPaid(debt); if (paid >= Number(debt.amount)) return 'settled'; if (paid > 0) return 'partial'; if (debt.dueDate && new Date(`${debt.dueDate}T23:59:59`) < new Date()) return 'late'; return 'pending'; }
function statusLabel(status) { return ({ pending: 'En cours', partial: 'Remboursé en partie', settled: 'Soldé', late: 'En retard' })[status]; }

function showDashboard() {
  $('auth-screen').classList.add('hidden'); $('dashboard').classList.remove('hidden');
  const name = state.user.name; const firstName = name.split(' ')[0];
  $('profile-name').textContent = firstName; $('welcome-name').textContent = firstName; $('profile-initials').textContent = initials(name);
  $('profile-large-name').textContent = name; $('profile-email').textContent = state.user.email; $('profile-large-initials').textContent = initials(name);
  $('client-count').textContent = `${new Set(state.debts.map(debt => debt.client)).size} client(s) enregistré(s)`;
  applySettings(); renderHome();
}
function setAuthMode(mode) { authMode = mode; const signup = mode === 'signup'; $('auth-title').textContent = signup ? 'Créer votre compte' : 'Ravi de vous revoir'; $('auth-subtitle').textContent = signup ? 'Commencez à suivre vos dettes en toute simplicité.' : 'Connectez-vous pour retrouver votre carnet.'; $('name-field').classList.toggle('hidden', !signup); $('name').required = signup; $('auth-action').textContent = signup ? 'Créer mon compte' : 'Se connecter'; $('switch-copy').textContent = signup ? 'Vous avez déjà un compte ?' : 'Pas encore de compte ?'; $('switch-auth').textContent = signup ? 'Se connecter' : 'Créer un compte'; $('auth-error').textContent = ''; $('mail-config-notice').classList.toggle('hidden', emailIsConfigured()); }
function renderHome() {
  const pendingReceivable = state.debts.filter(debt => debt.kind === 'receivable' && debtStatus(debt) !== 'settled');
  const pendingPayable = state.debts.filter(debt => debt.kind === 'payable' && debtStatus(debt) !== 'settled');
  const total = pendingReceivable.reduce((sum, debt) => sum + (Number(debt.amount) - debtPaid(debt)) / (debt.currency === 'USD' ? 1 : Number(debt.exchangeRate || 1)), 0);
  $('total-amount').textContent = total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); $('currency-label').textContent = state.settings.currency;
  $('active-count').textContent = pendingReceivable.length + pendingPayable.length;
  const soon = new Date(); soon.setDate(soon.getDate() + 7); $('due-count').textContent = state.debts.filter(debt => debtStatus(debt) !== 'settled' && debt.dueDate && new Date(`${debt.dueDate}T12:00:00`) <= soon).length;
  $('debt-list').innerHTML = renderDebtRows(state.debts.slice(0, 5));
  $('feature-view').classList.add('hidden'); $('feature-view').innerHTML = '';
  $('stats-grid').classList.remove('hidden'); document.querySelector('.module-grid').classList.remove('hidden'); document.querySelector('.list-section').classList.remove('hidden');
  setActiveNav('nav-home');
}
function renderDebtRows(debts) { if (!debts.length) return '<div class="empty-state"><strong>Aucune dette trouvée</strong><span>Ajoutez un premier enregistrement pour commencer.</span></div>'; return debts.map(debt => { const status = debtStatus(debt); const remaining = Number(debt.amount) - debtPaid(debt); return `<article class="debt-row"><div class="client-cell"><span class="avatar">${initials(debt.client)}</span><div><strong>${debt.client}</strong><small>${debt.kind === 'payable' ? 'Je dois' : 'On me doit'} · ${debt.identification}</small></div></div><div class="product-cell"><strong>${debt.product}</strong><small>${debt.urgency === 'urgent' ? 'Urgent · ' : ''}${debt.note || 'Aucune note'}</small></div><div class="date-cell"><small>Échéance</small><strong>${formatDate(debt.dueDate)}</strong></div><div class="amount-cell"><strong>${formatMoney(remaining, debt.currency)}</strong><small>${debt.currency === 'USD' ? 'Devise de référence' : `1 USD = ${debt.exchangeRate} ${debt.currency}`}</small></div><span class="status ${status}">${statusLabel(status)}</span><button class="row-action" data-pay="${debt.id || ''}" aria-label="Ajouter un paiement">＋</button></article>`; }).join(''); }
function setActiveNav(id) { document.querySelectorAll('.bottom-nav button').forEach(button => button.classList.toggle('active', button.id === id)); }
function hideHome() { $('stats-grid').classList.add('hidden'); document.querySelector('.module-grid').classList.add('hidden'); document.querySelector('.list-section').classList.add('hidden'); $('feature-view').classList.remove('hidden'); }
function renderDebtsView() { hideHome(); setActiveNav('nav-debts'); $('feature-content').innerHTML = `<div class="feature-heading"><div><p class="eyebrow">SUIVI FINANCIER</p><h2>Dettes & créances</h2><p class="muted">Suivez ce que vous devez et ce qu'on vous doit.</p></div><button class="button primary" id="feature-add-debt">＋ Ajouter</button></div><div class="filter-tabs"><button class="selected" data-debt-filter="all">Tout</button><button data-debt-filter="receivable">À recouvrer</button><button data-debt-filter="payable">À payer</button></div><div id="full-debt-list" class="debt-list">${renderDebtRows(state.debts)}</div>`; $('feature-add-debt').addEventListener('click', openDebtModal); document.querySelectorAll('[data-debt-filter]').forEach(button => button.addEventListener('click', () => { document.querySelectorAll('[data-debt-filter]').forEach(item => item.classList.remove('selected')); button.classList.add('selected'); $('full-debt-list').innerHTML = renderDebtRows(button.dataset.debtFilter === 'all' ? state.debts : state.debts.filter(debt => debt.kind === button.dataset.debtFilter)); })); }
function renderExpensesView() { hideHome(); setActiveNav('nav-expenses'); const month = new Date().toISOString().slice(0, 7); const transactions = state.expenses.filter(item => item.date.startsWith(month)); const spent = transactions.filter(item => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0); const income = transactions.filter(item => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0); $('feature-content').innerHTML = `<div class="feature-heading"><div><p class="eyebrow">FLUX DE TRÉSORERIE</p><h2>Dépenses & revenus</h2><p class="muted">${formatMoney(income)} de revenus · ${formatMoney(spent)} de dépenses ce mois.</p></div></div><form id="transaction-form" class="inline-form"><select id="transaction-type"><option value="expense">Dépense</option><option value="income">Revenu</option></select><input id="transaction-amount" type="number" min="0" step="0.01" placeholder="Montant" required><select id="transaction-category"><option>Alimentation</option><option>Transport</option><option>Logement</option><option>Équipement</option><option>Santé</option><option>Autre</option></select><input id="transaction-note" type="text" placeholder="Note"><input id="transaction-date" type="date" required><button class="button primary" type="submit">Ajouter</button></form><div class="transaction-list">${transactions.length ? transactions.slice().reverse().map(item => `<div class="transaction-row"><span class="transaction-icon ${item.type}">${item.type === 'income' ? '↗' : '↘'}</span><div><strong>${item.category}</strong><small>${item.note || 'Sans note'} · ${formatDate(item.date)}</small></div><b class="${item.type}">${item.type === 'income' ? '+' : '-'} ${formatMoney(item.amount, item.currency)}</b></div>`).join('') : '<div class="empty-state"><strong>Aucune transaction ce mois-ci</strong><span>Ajoutez votre première dépense ou votre premier revenu.</span></div>'}</div>`; $('transaction-date').value = new Date().toISOString().slice(0, 10); $('transaction-form').addEventListener('submit', event => { event.preventDefault(); state.expenses.push({ id: Date.now(), type: $('transaction-type').value, amount: $('transaction-amount').value, category: $('transaction-category').value, note: $('transaction-note').value, date: $('transaction-date').value, currency: state.settings.currency }); save(); renderExpensesView(); showToast('Transaction ajoutée'); }); }
function renderReportsView() { hideHome(); setActiveNav('nav-reports'); const month = new Date().toISOString().slice(0, 7); const expenses = state.expenses.filter(item => item.type === 'expense' && item.date.startsWith(month)); const byCategory = expenses.reduce((result, item) => { result[item.category] = (result[item.category] || 0) + Number(item.amount); return result; }, {}); const totalExpenses = expenses.reduce((sum, item) => sum + Number(item.amount), 0); const pendingReceivable = state.debts.filter(debt => debt.kind === 'receivable' && debtStatus(debt) !== 'settled').reduce((sum, debt) => sum + Number(debt.amount) - debtPaid(debt), 0); const pendingPayable = state.debts.filter(debt => debt.kind === 'payable' && debtStatus(debt) !== 'settled').reduce((sum, debt) => sum + Number(debt.amount) - debtPaid(debt), 0); $('feature-content').innerHTML = `<div class="feature-heading"><div><p class="eyebrow">VUE D'ENSEMBLE</p><h2>Rapports & budgets</h2><p class="muted">Vos indicateurs financiers, actualisés localement.</p></div><button class="button secondary" id="export-csv">↓ Exporter CSV</button></div><div class="report-grid"><div class="report-kpi"><small>À recouvrer</small><strong>${formatMoney(pendingReceivable)}</strong></div><div class="report-kpi"><small>À payer</small><strong>${formatMoney(pendingPayable)}</strong></div><div class="report-kpi"><small>Dépenses du mois</small><strong>${formatMoney(totalExpenses)}</strong></div></div><div class="report-panel"><h3>Dépenses par catégorie</h3>${Object.keys(byCategory).length ? Object.entries(byCategory).map(([category, amount]) => `<div class="budget-line"><div><span>${category}</span><b>${formatMoney(amount)}</b></div><div class="progress"><i style="width:${Math.min(100, amount / (Number(state.budgets[category]) || amount) * 100)}%"></i></div></div>`).join('') : '<p class="muted">Aucune dépense enregistrée ce mois-ci.</p>'}</div><div class="report-panel"><h3>Définir un plafond mensuel</h3><form id="budget-form" class="inline-form"><select id="budget-category"><option>Alimentation</option><option>Transport</option><option>Logement</option><option>Équipement</option><option>Santé</option><option>Autre</option></select><input id="budget-limit" type="number" min="0" step="0.01" placeholder="Plafond" required><button class="button primary" type="submit">Enregistrer</button></form></div>`; $('export-csv').addEventListener('click', exportCsv); $('budget-form').addEventListener('submit', event => { event.preventDefault(); state.budgets[$('budget-category').value] = $('budget-limit').value; save(); renderReportsView(); showToast('Budget enregistré'); }); }
function renderSettingsView() { hideHome(); setActiveNav('nav-profile'); $('feature-content').innerHTML = `<div class="feature-heading"><div><p class="eyebrow">PRÉFÉRENCES</p><h2>Paramètres</h2><p class="muted">Adaptez Creda à votre manière de travailler.</p></div></div><div class="settings-list"><label class="setting-row">Devise principale<select id="settings-currency"><option ${state.settings.currency === 'USD' ? 'selected' : ''}>USD</option><option ${state.settings.currency === 'CDF' ? 'selected' : ''}>CDF</option><option ${state.settings.currency === 'EUR' ? 'selected' : ''}>EUR</option><option ${state.settings.currency === 'XAF' ? 'selected' : ''}>XAF</option></select></label><label class="setting-row">Mode sombre<input id="dark-toggle" type="checkbox" ${state.settings.darkMode ? 'checked' : ''}></label><button class="button primary" id="settings-profile">Modifier mon profil</button><p class="settings-note">Vos données sont sauvegardées localement sur cet appareil. La synchronisation cloud et la biométrie seront ajoutées dans une prochaine version mobile native.</p></div>`; $('settings-currency').addEventListener('change', event => { state.settings.currency = event.target.value; save(); applySettings(); showToast('Devise principale mise à jour'); }); $('dark-toggle').addEventListener('change', event => { state.settings.darkMode = event.target.checked; save(); applySettings(); }); $('settings-profile').addEventListener('click', openProfile); }
function applySettings() { document.body.classList.toggle('dark-mode', Boolean(state.settings.darkMode)); }
function openDebtModal() { $('debt-modal').classList.remove('hidden'); }
function openProfile() { if (!state.user) return; $('profile-edit-name').value = state.user.name; $('profile-edit-email').value = state.user.email; $('profile-modal').classList.remove('hidden'); }
function exportCsv() { const rows = [['Type', 'Client', 'Produit', 'Montant', 'Devise', 'Échéance', 'Statut'], ...state.debts.map(debt => [debt.kind, debt.client, debt.product, debt.amount, debt.currency, debt.dueDate, statusLabel(debtStatus(debt))]), ['', '', '', '', '', '', ''], ['Type', 'Catégorie', 'Montant', 'Devise', 'Date', 'Note'], ...state.expenses.map(item => [item.type, item.category, item.amount, item.currency, item.date, item.note])]; const csv = rows.map(row => row.map(value => `"${String(value || '').replaceAll('"', '""')}"`).join(';')).join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'creda-export.csv'; link.click(); URL.revokeObjectURL(link.href); showToast('Export CSV téléchargé'); }

$('auth-form').addEventListener('submit', async event => { event.preventDefault(); const email = $('email').value.trim(); const password = $('password').value; const name = $('name').value.trim(); if (cloudEnabled) return handleCloudAuth(email, password, name); if (authMode === 'signup') { if (!name) return; const user = { name, email, password }; state.user = user; save(); showDashboard(); $('auth-error').textContent = ''; try { const sent = await sendWelcomeEmail(user); showToast(sent ? 'Compte créé, vérifiez votre e-mail' : 'Compte créé. Configurez EmailJS pour activer les e-mails'); } catch (error) { showToast('Compte créé, mais l’e-mail n’a pas pu être envoyé'); console.error('EmailJS error:', error); } } else if (state.user && state.user.email === email && state.user.password === password) showDashboard(); else $('auth-error').textContent = 'E-mail ou mot de passe incorrect.'; });
$('switch-auth').addEventListener('click', () => setAuthMode(authMode === 'signup' ? 'login' : 'signup'));
$('open-add').addEventListener('click', openDebtModal); if ($('nav-add')) $('nav-add').addEventListener('click', openDebtModal); $('close-modal').addEventListener('click', () => $('debt-modal').classList.add('hidden'));
$('currency').addEventListener('change', event => { $('form-currency').textContent = event.target.value; $('rate-status').textContent = event.target.value === 'USD' ? '1 USD = 1 USD' : `Saisissez votre taux : 1 USD = ... ${event.target.value}`; }); $('exchange-rate').addEventListener('input', () => { $('rate-status').textContent = `Votre taux : 1 USD = ${$('exchange-rate').value || '...'} ${$('currency').value}`; });
$('debt-form').addEventListener('submit', event => { event.preventDefault(); state.debts.unshift({ id: Date.now(), kind: $('debt-kind').value, urgency: $('urgency').value, client: $('client').value.trim(), identification: $('identification').value.trim(), product: $('product').value.trim(), amount: $('amount').value, exchangeRate: $('exchange-rate').value, dueDate: $('due-date').value, currency: $('currency').value, note: $('note').value.trim(), payments: [] }); save(); event.target.reset(); $('exchange-rate').value = '1'; $('form-currency').textContent = 'USD'; $('rate-status').textContent = 'Ex. 1 USD = 2400 CDF'; $('debt-modal').classList.add('hidden'); renderHome(); showToast('Enregistrement ajouté'); });
$('profile-button').addEventListener('click', openProfile); $('nav-profile').addEventListener('click', renderSettingsView); $('close-profile').addEventListener('click', () => $('profile-modal').classList.add('hidden'));
$('profile-form').addEventListener('submit', event => { event.preventDefault(); state.user.name = $('profile-edit-name').value.trim(); state.user.email = $('profile-edit-email').value.trim(); save(); $('profile-modal').classList.add('hidden'); showDashboard(); showToast('Profil mis à jour'); }); $('logout-button').addEventListener('click', () => { if (cloudEnabled) firebase.auth().signOut(); $('profile-modal').classList.add('hidden'); $('dashboard').classList.add('hidden'); $('auth-screen').classList.remove('hidden'); setAuthMode('login'); });
$('resend-welcome').addEventListener('click', async () => { if (!emailIsConfigured()) return showToast('Configurez d’abord EmailJS dans mail-config.js'); try { await sendWelcomeEmail(state.user); showToast('E-mail de bienvenue renvoyé'); } catch (error) { showToast('Envoi impossible, vérifiez EmailJS'); console.error('EmailJS error:', error); } });
$('clients-module').addEventListener('click', renderDebtsView); $('payments-module').addEventListener('click', renderDebtsView); $('reports-module').addEventListener('click', renderReportsView); $('nav-home').addEventListener('click', renderHome); $('nav-expenses').addEventListener('click', renderExpensesView); $('nav-debts').addEventListener('click', renderDebtsView); $('nav-reports').addEventListener('click', renderReportsView);
$('notifications').addEventListener('click', () => { const late = state.debts.filter(debt => debtStatus(debt) === 'late').length; showToast(late ? `${late} échéance(s) en retard` : 'Aucune échéance urgente'); });
+document.addEventListener('click', event => { const button = event.target.closest('[data-pay]'); if (!button) return; const debt = state.debts.find(item => String(item.id) === button.dataset.pay); if (!debt) return; const remaining = Number(debt.amount) - debtPaid(debt); const amount = prompt(`Montant du paiement (${remaining} ${debt.currency} restant) :`); if (!amount || Number(amount) <= 0) return; debt.payments = debt.payments || []; debt.payments.push({ amount: Math.min(Number(amount), remaining), date: new Date().toISOString().slice(0, 10) }); save(); renderHome(); showToast('Paiement partiel enregistré'); });
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  showToast('Application installée');
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker:', error));
async function promptInstall() {
  if (!deferredInstallPrompt) {
    showToast('Dans le menu du navigateur, choisissez « Installer Creda » ou « Ajouter à l’écran d’accueil ».');
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
}
$('install-app').addEventListener('click', promptInstall);
$('install-app-top').addEventListener('click', promptInstall);
if (cloudEnabled) {
  firebase.initializeApp(window.CREDA_FIREBASE_CONFIG);
  firebase.auth().onAuthStateChanged(async authUser => {
    if (!authUser) {
      $('dashboard').classList.add('hidden');
      $('auth-screen').classList.remove('hidden');
      setAuthMode('signup');
      return;
    }
    try {
      await loadCloudUser(authUser);
      showDashboard();
    } catch (error) {
      $('auth-error').textContent = 'Impossible de charger vos données cloud.';
      console.error('Firestore load error:', error);
    }
  });
} else if (state.user) showDashboard(); else setAuthMode('signup');
