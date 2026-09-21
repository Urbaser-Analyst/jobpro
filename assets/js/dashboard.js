/**
 * dashboard.js
 * -----------------------------------------------------------------------
 * Builds the sidebar nav from the logged-in user's role, wires up simple
 * client-side routing (#hash based) between modules, and mounts each
 * module's render function into #contentMount.
 *
 * Each module (module.productMaster.js, module.mrf.js, ...) registers
 * itself into Dashboard.modules[name] = { title, render(mount) }.
 * -----------------------------------------------------------------------
 */

const Dashboard = {
  session: null,
  modules: {},
  _navToken: 0,

  // Full nav structure. `roles` = which roles see this item.
  NAV: [
    {
      group: 'Operations',
      items: [
        { key: 'productMaster', label: 'Product Master', roles: 'all' },
        { key: 'myInventory',   label: 'My Inventory',   roles: 'all' },
        { key: 'mrf',           label: 'MRF',             roles: 'all' },
        { key: 'issue',         label: 'Stock Issue',     roles: ['Admin','Store Admin','Store'] },
        { key: 'jobcard',       label: 'Job Card',         roles: 'all' },
      ]
    },
    {
      group: 'Requests',
      items: [
        { key: 'newProductRequest', label: 'New Product Request', roles: 'all' },
        { key: 'stockReturn',       label: 'Stock Return',        roles: 'all' },
      ]
    },
    {
      group: 'Admin',
      items: [
        { key: 'users',    label: 'Users',          roles: ['Admin'] },
        { key: 'admin',    label: 'Admin Console',  roles: ['Admin'] },
        { key: 'reports',  label: 'Reports',         roles: ['Admin','Store Admin','Viewer','MRF Approver & Viewer'] },
      ]
    }
  ],

  init() {
    this.session = Session.requireLogin();
    if (!this.session) return;

    document.getElementById('whoName').textContent = this.session.name || this.session.userId;
    document.getElementById('whoRole').textContent = this.session.role;

    document.getElementById('logoutLink').addEventListener('click', (e) => {
      e.preventDefault();
      Session.clear();
      window.location.href = 'index.html';
    });

    this.renderNav();
    this.startClock();

    window.addEventListener('hashchange', () => this.route());
    this.route();
  },

  canSee(item) {
    return item.roles === 'all' || item.roles.indexOf(this.session.role) !== -1;
  },

  renderNav() {
    const mount = document.getElementById('navMount');
    mount.innerHTML = '';
    this.NAV.forEach(group => {
      const visibleItems = group.items.filter(i => this.canSee(i));
      if (!visibleItems.length) return;

      const groupEl = document.createElement('div');
      groupEl.className = 'nav-group';
      groupEl.innerHTML = `<div class="nav-label">${group.group}</div>`;

      visibleItems.forEach(item => {
        const a = document.createElement('div');
        a.className = 'nav-item';
        a.dataset.key = item.key;
        a.innerHTML = `<span class="dot"></span><span>${item.label}</span>`;
        a.addEventListener('click', () => { window.location.hash = item.key; });
        groupEl.appendChild(a);
      });

      mount.appendChild(groupEl);
    });
  },

  route() {
    const key = (window.location.hash || '#productMaster').replace('#', '');

    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.key === key);
    });

    const mod = this.modules[key];
    const container = document.getElementById('contentMount');
    const titleEl = document.getElementById('pageTitle');

    // Give this navigation its own token + its own DOM node. If a
    // previous (slow) render finishes AFTER the user has navigated away,
    // it will write into its own now-detached node instead of clobbering
    // whatever the user is currently looking at.
    const myToken = ++this._navToken;
    const localMount = document.createElement('div');
    container.innerHTML = '';
    container.appendChild(localMount);

    if (!mod) {
      titleEl.textContent = 'Coming soon';
      localMount.innerHTML = `
        <div class="card empty-state">
          <h3>This module is on the build roadmap</h3>
          <p>“${escapeHtml(key)}” will be wired up in the next phase.</p>
        </div>`;
      return;
    }

    titleEl.textContent = mod.title;
    localMount.innerHTML = '<div class="card"><p>Loading…</p></div>';

    Promise.resolve(mod.render(localMount)).catch(err => {
      if (myToken !== this._navToken) return; // a newer navigation already happened — ignore
      localMount.innerHTML = `<div class="card"><p style="color:#F26A8D">${escapeHtml(err.message)}</p></div>`;
    });
  },

  startClock() {
    const el = document.getElementById('clock');
    const tick = () => { el.textContent = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); };
    tick();
    setInterval(tick, 30000);
  }
};
