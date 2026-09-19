/**
 * api.js
 * -----------------------------------------------------------------------
 * Thin wrapper around the Apps Script Web App backend.
 *
 * IMPORTANT: set API_URL below to your deployed Apps Script Web App URL
 * (ends in /exec) after you deploy Code.gs. See README.md.
 * -----------------------------------------------------------------------
 */

const API_URL = 'https://script.google.com/macros/s/AKfycbz1KD1iEbMmyA7cC5kFElixo1N0WNyaVmlNGOK4RgkyMxA8d2WkqLv2wQMNOkVtAjW4Fw/exec';

const Session = {
  KEY: 'fims_session',

  save(session) {
    sessionStorage.setItem(this.KEY, JSON.stringify(session));
  },
  get() {
    const raw = sessionStorage.getItem(this.KEY);
    return raw ? JSON.parse(raw) : null;
  },
  clear() {
    sessionStorage.removeItem(this.KEY);
  },
  requireLogin() {
    const s = this.get();
    if (!s) {
      window.location.href = 'index.html';
      return null;
    }
    return s;
  }
};

async function apiCall(action, payload) {
  const session = Session.get();
  const body = {
    action: action,
    payload: payload || {},
    token: session ? session.token : ''
  };

  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      // Apps Script Web Apps don't support custom headers well with CORS
      // preflight, so we send text/plain and parse JSON on the backend.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    throw new Error('Network error — check your connection or API_URL in api.js');
  }

  const json = await res.json();

  if (!json.ok) {
    if (json.error === 'AUTH') {
      Session.clear();
      window.location.href = 'index.html?expired=1';
    }
    throw new Error(json.message || json.error || 'Request failed');
  }
  return json.data;
}

function showToast(message, type) {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' ' + type : '');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt)) return String(d);
  return dt.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
