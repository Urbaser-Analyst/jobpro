/**
 * api.js
 * -----------------------------------------------------------------------
 * Thin wrapper around the Apps Script Web App backend.
 *
 * IMPORTANT: set API_URL below to your deployed Apps Script Web App URL
 * (ends in /exec) after you deploy Code.gs. See README.md.
 * -----------------------------------------------------------------------
 */

const API_URL = 'https://script.google.com/macros/s/AKfycby-eSBQFL1rRlHmBMWHofU5Tr2J0IjVi-me10kB94V3lZseFbzkG12n8blFrtCZmcgA5A/exec';

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

async function apiCall(action, payload, _attempt) {
  const attempt = _attempt || 1;
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

  const rawText = await res.text();
  let json;
  try {
    json = JSON.parse(rawText);
  } catch (parseErr) {
    // Apps Script occasionally returns an HTML error page instead of JSON
    // under load or during a brief redeploy window. Retry a couple of
    // times with backoff before surfacing an error — this clears up most
    // of these transient failures without the user noticing.
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 500 * attempt));
      return apiCall(action, payload, attempt + 1);
    }
    throw new Error('The server returned an unexpected response (not JSON). This is usually temporary — please try again in a few seconds.');
  }

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

/**
 * Disables (or re-enables) every input/button/select/textarea inside a
 * container. Use this on ANY form's submit handler: lock the whole
 * container before the await, unlock in a finally block. This is the
 * standard pattern for every form in this app — nothing should be
 * editable while a submission is in flight.
 */
function lockControls(container, disabled) {
  container.querySelectorAll('input, button, select, textarea').forEach(el => { el.disabled = disabled; });
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
