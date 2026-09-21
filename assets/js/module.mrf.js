/**
 * module.mrf.js
 * -----------------------------------------------------------------------
 * - Any logged-in user can create an MRF with multiple product lines.
 * - "Confirm & Submit MRF" is the one-way lock — after this, nothing
 *   about the MRF's content can be edited by anyone (per spec).
 * - If the total value exceeds the Admin-configurable threshold, it goes
 *   to PENDING_APPROVAL; otherwise it's immediately OPEN (ready for
 *   Store to issue against, in Phase 3).
 * - Store Admin / Admin / MRF Approver & Viewer see a Pending Approvals
 *   queue with Approve/Reject.
 * -----------------------------------------------------------------------
 */

const MRF_APPROVER_ROLES = ['Admin', 'Store Admin', 'MRF Approver & Viewer'];
const MRF_WIDE_ROLES = ['Admin', 'Store Admin', 'Store', 'Viewer', 'MRF Approver & Viewer'];

Dashboard.modules.mrf = {
  title: 'Material Request (MRF)',

  async render(mount) {
    const session = Dashboard.session;
    const isApprover = MRF_APPROVER_ROLES.includes(session.role);
    const canSeeAll = MRF_WIDE_ROLES.includes(session.role);
    const isAdmin = session.role === 'Admin';

    const [products, config, mrfList, pending] = await Promise.all([
      apiCall('productMaster.list'),
      apiCall('config.get'),
      apiCall('mrf.list', { scope: canSeeAll ? 'all' : 'mine' }),
      isApprover ? apiCall('mrf.list', { scope: 'pendingApproval' }) : Promise.resolve([])
    ]);

    const threshold = Number(config['MRF_APPROVAL_THRESHOLD'] || 0);
    let draftLines = []; // { itemCode, itemName, uom, rate, qty }
    let pendingProduct = null;

    mount.innerHTML = `
      <div class="card" id="createMrfCard">
        <div class="card-header">
          <h3>Create new MRF</h3>
          <span class="muted" style="font-size:12px;">Requests over ₹${threshold.toLocaleString('en-IN')} need approval</span>
        </div>

        <div class="form-row" style="align-items:flex-end;">
          <div class="field" style="grid-column: span 2;" id="mrfCombo"></div>
          <div class="field">
            <label>Qty</label>
            <input type="number" id="mrfQty" min="1" value="1">
          </div>
          <div class="field" style="align-self:flex-end;">
            <button type="button" class="btn btn-outline" id="addLineBtn" style="width:100%;">+ Quick add</button>
          </div>
        </div>
        <button type="button" class="btn btn-navy" id="browseBtn" style="margin-top:8px;">🛒 Browse products</button>

        <div class="table-wrap" style="margin-top:10px;">
          <table>
            <thead><tr><th>Item Code</th><th>Item Name</th><th>UOM</th><th>Qty</th><th>Rate</th><th>Line Value</th><th></th></tr></thead>
            <tbody id="draftRows"><tr><td colspan="7"><div class="empty-state" style="padding:20px;">No lines added yet</div></td></tr></tbody>
          </table>
        </div>

        <div class="flex-between" style="margin-top:16px;">
          <div>
            <div class="muted" style="font-size:12px;">Total value</div>
            <div style="font-size:20px; font-weight:800; color:var(--navy);" id="totalValueLabel">₹0.00</div>
          </div>
          <div class="flex gap-8">
            <span class="chip" id="approvalHint" style="display:none;"></span>
            <button type="button" class="btn btn-outline" id="clearDraftBtn">Clear</button>
            <button type="button" class="btn btn-final" id="submitMrfBtn">Confirm &amp; Submit MRF</button>
          </div>
        </div>
        <p class="hint" style="margin-top:8px;">Once submitted, this MRF is locked — no line items, quantities, or products can be changed by anyone.</p>
      </div>

      ${isApprover ? `
      <div class="card">
        <div class="card-header">
          <h3>Pending your approval <span class="muted" style="font-weight:500;">(${pending.length})</span></h3>
        </div>
        <div id="pendingApprovalList"></div>
      </div>` : ''}

      ${isAdmin ? `
      <div class="card">
        <div class="card-header"><h3>Approval threshold (Admin)</h3></div>
        <div class="flex gap-8">
          <input type="number" id="thresholdInput" value="${threshold}" style="width:160px;">
          <button type="button" class="btn btn-outline btn-sm" id="saveThresholdBtn">Save</button>
          <span class="muted" style="font-size:12px;">MRFs above this ₹ value require approval. Applies immediately to new MRFs.</span>
        </div>
      </div>` : ''}

      <div class="card">
        <div class="card-header">
          <h3>${canSeeAll ? 'All MRFs' : 'My MRFs'} <span class="muted" style="font-weight:500;" id="mrfCountLabel"></span></h3>
        </div>
        <div class="filter-bar">
          <input type="text" id="mrfSearch" placeholder="Search MRF ID…">
          <select id="mrfStatusFilter">
            <option value="">All statuses</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="OPEN">Open</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th class="sortable" data-key="MRF Id">MRF ID <span class="arrow">▲</span></th>
              <th class="sortable" data-key="Status">Status <span class="arrow">▲</span></th>
              <th class="sortable" data-key="Total Value">Total Value <span class="arrow">▲</span></th>
              <th>Lines</th>
              <th class="sortable" data-key="Created At">Created <span class="arrow">▲</span></th>
              ${canSeeAll ? '<th class="sortable" data-key="User Id">Requested by <span class="arrow">▲</span></th>' : ''}
            </tr></thead>
            <tbody id="mrfListRows"></tbody>
          </table>
        </div>
      </div>
    `;

    // ---- Product combo for adding lines ----
    const combo = ProductCombo.mount(mount.querySelector('#mrfCombo'), products, (product) => {
      pendingProduct = product;
    });

    function addLineToDraft(product, qty) {
      const existing = draftLines.find(l => l.itemCode === product['Item Code']);
      if (existing) {
        existing.qty += qty;
      } else {
        draftLines.push({
          itemCode: product['Item Code'],
          itemName: product['Item Name'],
          uom: product['UOM'],
          rate: Number(product['Rate'] || 0),
          qty: qty
        });
      }
      renderDraft();
    }

    mount.querySelector('#browseBtn').addEventListener('click', () => {
      ProductBrowser.open(products, (product, qty) => addLineToDraft(product, qty), draftLines);
    });

    mount.querySelector('#clearDraftBtn').addEventListener('click', () => {
      if (draftLines.length && !confirm('Clear all lines from this draft MRF?')) return;
      draftLines = [];
      renderDraft();
      combo.reset();
      pendingProduct = null;
      mount.querySelector('#mrfQty').value = 1;
    });

    function renderDraft() {
      const tbody = mount.querySelector('#draftRows');
      if (!draftLines.length) {
        tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state" style="padding:20px;">No lines added yet</div></td></tr>`;
      } else {
        tbody.innerHTML = draftLines.map((l, i) => `
          <tr>
            <td><span class="id-tag">${escapeHtml(l.itemCode)}</span></td>
            <td>${escapeHtml(l.itemName)}</td>
            <td>${escapeHtml(l.uom)}</td>
            <td>${l.qty}</td>
            <td>₹${l.rate.toFixed(2)}</td>
            <td>₹${(l.qty * l.rate).toFixed(2)}</td>
            <td><button type="button" class="btn btn-danger btn-sm remove-line" data-i="${i}">Remove</button></td>
          </tr>
        `).join('');
      }
      const total = draftLines.reduce((s, l) => s + l.qty * l.rate, 0);
      mount.querySelector('#totalValueLabel').textContent = '₹' + total.toFixed(2);

      const hint = mount.querySelector('#approvalHint');
      if (draftLines.length) {
        const needsApproval = total > threshold;
        hint.style.display = 'inline-flex';
        hint.className = 'chip ' + (needsApproval ? 'chip-pending' : 'chip-done');
        hint.textContent = needsApproval ? 'Will require approval' : 'No approval needed';
      } else {
        hint.style.display = 'none';
      }

      tbody.querySelectorAll('.remove-line').forEach(btn => {
        btn.addEventListener('click', () => {
          draftLines.splice(Number(btn.dataset.i), 1);
          renderDraft();
        });
      });
    }

    mount.querySelector('#addLineBtn').addEventListener('click', () => {
      const qty = Number(mount.querySelector('#mrfQty').value);
      if (!pendingProduct) { showToast('Search and select a product first.', 'error'); return; }
      if (!qty || qty <= 0) { showToast('Enter a quantity greater than 0.', 'error'); return; }
      addLineToDraft(pendingProduct, qty);
      combo.reset();
      pendingProduct = null;
      mount.querySelector('#mrfQty').value = 1;
    });

    mount.querySelector('#submitMrfBtn').addEventListener('click', async () => {
      if (!draftLines.length) { showToast('Add at least one product line.', 'error'); return; }
      if (!confirm('Submit this MRF? Once submitted it cannot be edited by anyone.')) return;

      const btn = mount.querySelector('#submitMrfBtn');
      const createCard = mount.querySelector('#createMrfCard');
      lockControls(createCard, true);
      btn.textContent = 'Submitting…';
      try {
        const result = await apiCall('mrf.create', {
          lines: draftLines.map(l => ({ itemCode: l.itemCode, qtyRequested: l.qty }))
        });
        showToast(`MRF ${result.mrfId} submitted — status: ${result.status.replace('_', ' ')}`, 'success');
        draftLines = [];
        renderDraft();
        Dashboard.route();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        lockControls(createCard, false);
        btn.textContent = 'Confirm & Submit MRF';
      }
    });

    renderDraft();

    // ---- Admin threshold editor ----
    if (isAdmin) {
      mount.querySelector('#saveThresholdBtn').addEventListener('click', async () => {
        const val = Number(mount.querySelector('#thresholdInput').value);
        if (isNaN(val) || val < 0) { showToast('Enter a valid amount.', 'error'); return; }
        try {
          await apiCall('config.set', { key: 'MRF_APPROVAL_THRESHOLD', value: val });
          showToast('Threshold updated to ₹' + val.toLocaleString('en-IN'), 'success');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    }

    // ---- Pending approvals queue ----
    if (isApprover) {
      const list = mount.querySelector('#pendingApprovalList');
      if (!pending.length) {
        list.innerHTML = `<div class="empty-state">Nothing waiting on approval.</div>`;
      } else {
        list.innerHTML = pending.map(m => `
          <div class="card" style="box-shadow:none; border:1px solid var(--line); margin-bottom:10px;">
            <div class="flex-between">
              <div>
                <span class="id-tag">${escapeHtml(m['MRF Id'])}</span>
                <span class="muted" style="margin-left:8px; font-size:12.5px;">by ${escapeHtml(m['User Id'])} · ${fmtDate(m['Created At'])}</span>
              </div>
              <div style="font-weight:700;">₹${Number(m['Total Value']).toFixed(2)}</div>
            </div>
            <ul style="margin:10px 0; padding-left:18px; font-size:13px;">
              ${m.lines.map(l => `<li>${escapeHtml(l.itemCode)} — ${escapeHtml(l.itemName)} × ${l.qtyRequested} ${escapeHtml(l.uom)}</li>`).join('')}
            </ul>
            <div class="flex gap-8">
              <button type="button" class="btn btn-primary btn-sm approve-btn" data-id="${escapeHtml(m['MRF Id'])}">Approve</button>
              <button type="button" class="btn btn-danger btn-sm reject-btn" data-id="${escapeHtml(m['MRF Id'])}">Reject</button>
            </div>
          </div>
        `).join('');

        list.querySelectorAll('.approve-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            try {
              await apiCall('mrf.decide', { mrfId: btn.dataset.id, approve: true });
              showToast(btn.dataset.id + ' approved.', 'success');
              Dashboard.route();
            } catch (err) { showToast(err.message, 'error'); }
          });
        });
        list.querySelectorAll('.reject-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const reason = prompt('Reason for rejecting ' + btn.dataset.id + ':');
            if (reason === null) return;
            if (!reason.trim()) { showToast('A reason is required to reject.', 'error'); return; }
            try {
              await apiCall('mrf.decide', { mrfId: btn.dataset.id, approve: false, reason: reason });
              showToast(btn.dataset.id + ' rejected.', 'success');
              Dashboard.route();
            } catch (err) { showToast(err.message, 'error'); }
          });
        });
      }
    }

    // ---- My/All MRFs list ----
    const fullList = mrfList;
    let mrfSortKey = 'Created At';
    let mrfSortDir = -1; // newest first by default
    let mrfSearchQ = '';
    let mrfStatusF = '';

    const rowsBody = mount.querySelector('#mrfListRows');

    function statusChip(status) {
      const map = {
        PENDING_APPROVAL: ['chip-pending', 'Pending Approval'],
        OPEN: ['chip-open', 'Open'],
        REJECTED: ['chip-defect', 'Rejected']
      };
      const pair = map[status] || ['chip-open', status];
      return `<span class="chip ${pair[0]}">${pair[1]}</span>`;
    }

    function renderMrfList() {
      let list = fullList.filter(m => {
        if (mrfStatusF && m['Status'] !== mrfStatusF) return false;
        if (mrfSearchQ && !String(m['MRF Id']).toLowerCase().includes(mrfSearchQ.toLowerCase())) return false;
        return true;
      });

      list = list.slice().sort((a, b) => {
        let av = a[mrfSortKey], bv = b[mrfSortKey];
        if (mrfSortKey === 'Total Value') { av = Number(av || 0); bv = Number(bv || 0); }
        else if (mrfSortKey === 'Created At') { av = new Date(av); bv = new Date(bv); }
        else { av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase(); }
        if (av < bv) return -1 * mrfSortDir;
        if (av > bv) return 1 * mrfSortDir;
        return 0;
      });

      mount.querySelector('#mrfCountLabel').textContent = `(${list.length} of ${fullList.length})`;

      if (!list.length) {
        rowsBody.innerHTML = `<tr><td colspan="${canSeeAll ? 6 : 5}"><div class="empty-state">No MRFs match.</div></td></tr>`;
      } else {
        rowsBody.innerHTML = list.map(m => `
          <tr class="mrf-row" data-id="${escapeHtml(m['MRF Id'])}" style="cursor:pointer;">
            <td><span class="id-tag">${escapeHtml(m['MRF Id'])}</span></td>
            <td>${statusChip(m['Status'])}</td>
            <td>₹${Number(m['Total Value']).toFixed(2)}</td>
            <td>${m.lines.length}</td>
            <td class="muted">${fmtDate(m['Created At'])}</td>
            ${canSeeAll ? `<td class="muted">${escapeHtml(m['User Id'])}</td>` : ''}
          </tr>
        `).join('');

        rowsBody.querySelectorAll('.mrf-row').forEach(row => {
          row.addEventListener('click', () => {
            const m = fullList.find(x => x['MRF Id'] === row.dataset.id);
            if (m) openMrfDetail(m);
          });
        });
      }

      mount.querySelectorAll('th.sortable').forEach(th => {
        th.classList.toggle('sort-active', th.dataset.key === mrfSortKey);
        th.querySelector('.arrow').textContent = (th.dataset.key === mrfSortKey && mrfSortDir === -1) ? '▼' : '▲';
      });
    }

    mount.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        if (mrfSortKey === th.dataset.key) mrfSortDir *= -1;
        else { mrfSortKey = th.dataset.key; mrfSortDir = 1; }
        renderMrfList();
      });
    });
    mount.querySelector('#mrfSearch').addEventListener('input', e => { mrfSearchQ = e.target.value; renderMrfList(); });
    mount.querySelector('#mrfStatusFilter').addEventListener('change', e => { mrfStatusF = e.target.value; renderMrfList(); });

    renderMrfList();

    function openMrfDetail(m) {
      Modal.open(`
        <div class="modal-header">
          <div>
            <span class="id-tag" style="font-size:13px;">${escapeHtml(m['MRF Id'])}</span>
            <h2 style="margin-top:8px;">${statusChip(m['Status'])}</h2>
          </div>
          <button class="modal-close">✕</button>
        </div>
        <div class="detail-grid" style="margin-bottom:16px;">
          <div class="detail-item"><div class="k">Requested by</div><div class="v">${escapeHtml(m['User Id'])}</div></div>
          <div class="detail-item"><div class="k">Created</div><div class="v">${fmtDate(m['Created At'])}</div></div>
          <div class="detail-item"><div class="k">Total value</div><div class="v">₹${Number(m['Total Value']).toFixed(2)}</div></div>
          <div class="detail-item"><div class="k">Requires approval</div><div class="v">${m['Requires Approval'] ? 'Yes' : 'No'}</div></div>
          ${m['Approved By'] ? `<div class="detail-item"><div class="k">Decided by</div><div class="v">${escapeHtml(m['Approved By'])}</div></div>` : ''}
          ${m['Rejection Reason'] ? `<div class="detail-item"><div class="k">Rejection reason</div><div class="v">${escapeHtml(m['Rejection Reason'])}</div></div>` : ''}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Item Code</th><th>Item Name</th><th>Qty Requested</th><th>Qty Issued</th></tr></thead>
            <tbody>
              ${m.lines.map(l => `
                <tr>
                  <td><span class="id-tag">${escapeHtml(l.itemCode)}</span></td>
                  <td>${escapeHtml(l.itemName)}</td>
                  <td>${l.qtyRequested} ${escapeHtml(l.uom)}</td>
                  <td>${l.qtyIssuedSoFar} ${escapeHtml(l.uom)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `);
    }
  }
};
