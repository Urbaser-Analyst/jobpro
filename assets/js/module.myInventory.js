/**
 * module.myInventory.js
 * -----------------------------------------------------------------------
 * Shows the logged-in user's own personal stock — credited automatically
 * whenever they verify a received Issue as "OK". This is what Job Card
 * (Phase 4) will draw spares from, and it can never go negative.
 * -----------------------------------------------------------------------
 */

Dashboard.modules.myInventory = {
  title: 'My Inventory',

  async render(mount) {
    const items = await apiCall('inventory.mine');
    let searchQ = '';
    let sortKey = 'itemName', sortDir = 1;

    mount.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3>My personal stock <span class="muted" style="font-weight:500;" id="invCountLabel">(${items.length})</span></h3>
        </div>
        <div class="filter-bar">
          <input type="text" id="invSearch" placeholder="Search item code or name…">
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th class="sortable" data-key="itemCode">Item Code <span class="arrow">▲</span></th>
              <th class="sortable" data-key="itemName">Item Name <span class="arrow">▲</span></th>
              <th class="sortable" data-key="uom">UOM <span class="arrow">▲</span></th>
              <th class="sortable" data-key="qty">Qty on hand <span class="arrow">▲</span></th>
            </tr></thead>
            <tbody id="invRows"></tbody>
          </table>
        </div>
      </div>
    `;

    const tbody = mount.querySelector('#invRows');

    function render() {
      let list = items.filter(it => {
        if (!searchQ) return true;
        const q = searchQ.toLowerCase();
        return String(it.itemCode).toLowerCase().includes(q) || String(it.itemName).toLowerCase().includes(q);
      });
      list = list.slice().sort((a, b) => {
        let av = a[sortKey], bv = b[sortKey];
        if (sortKey === 'qty') { av = Number(av || 0); bv = Number(bv || 0); }
        else { av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase(); }
        if (av < bv) return -1 * sortDir;
        if (av > bv) return 1 * sortDir;
        return 0;
      });

      mount.querySelector('#invCountLabel').textContent = `(${list.length} of ${items.length})`;
      tbody.innerHTML = list.length
        ? list.map(it => `
          <tr>
            <td><span class="id-tag">${escapeHtml(it.itemCode)}</span></td>
            <td>${escapeHtml(it.itemName)}</td>
            <td>${escapeHtml(it.uom)}</td>
            <td style="font-weight:700;">${it.qty}</td>
          </tr>
        `).join('')
        : `<tr><td colspan="4"><div class="empty-state">Nothing in your personal stock yet. Verify a received Issue to add stock here.</div></td></tr>`;

      mount.querySelectorAll('th.sortable').forEach(th => {
        th.classList.toggle('sort-active', th.dataset.key === sortKey);
        th.querySelector('.arrow').textContent = (th.dataset.key === sortKey && sortDir === -1) ? '▼' : '▲';
      });
    }

    mount.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        if (sortKey === th.dataset.key) sortDir *= -1;
        else { sortKey = th.dataset.key; sortDir = 1; }
        render();
      });
    });
    mount.querySelector('#invSearch').addEventListener('input', e => { searchQ = e.target.value; render(); });

    render();
  }
};
