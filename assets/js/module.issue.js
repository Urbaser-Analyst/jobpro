/**
 * module.issue.js
 * -----------------------------------------------------------------------
 * - Store/Store Admin/Admin create an Issue against one OPEN MRF at a
 *   time (partial issue allowed — multiple Issues per MRF are fine,
 *   never one Issue split across MRFs).
 * - "Confirm & Submit Issue" is the one-way lock, same pattern as MRF.
 * - The receiver (any user) verifies what they physically received:
 *   every issued unit must be marked OK or Defective — no partial skip.
 *   OK quantities are credited straight into their personal inventory.
 *   Defective quantities wait for Store to acknowledge the return.
 * -----------------------------------------------------------------------
 */

const ISSUE_CREATOR_ROLES = ['Admin', 'Store Admin', 'Store'];
const ISSUE_WIDE_ROLES = ['Admin', 'Store Admin', 'Store', 'Viewer'];

Dashboard.modules.issue = {
  title: 'Stock Issue',

  async render(mount) {
    const session = Dashboard.session;
    const canCreate = ISSUE_CREATOR_ROLES.includes(session.role);
    const canSeeAll = ISSUE_WIDE_ROLES.includes(session.role);

    const [eligibleMRFs, users, toReceive, issuedByMe, mineOrAll] = await Promise.all([
      canCreate ? apiCall('issue.eligibleMRFs') : Promise.resolve([]),
      canCreate ? apiCall('users.listBasic') : Promise.resolve([]),
      apiCall('issue.list', { scope: 'toReceive' }),
      canCreate ? apiCall('issue.list', { scope: 'issuedByMe' }) : Promise.resolve([]),
      apiCall('issue.list', { scope: canSeeAll ? 'all' : 'mine' })
    ]);

    let selectedMrf = null;
    const lineQtyMap = {}; // itemCode -> qty to issue

    mount.innerHTML = `
      ${canCreate ? `
      <div class="card" id="createIssueCard">
        <div class="card-header"><h3>Create Issue against MRF</h3></div>

        <div class="field">
          <label>MRF to issue against *</label>
          <select id="mrfPicker">
            <option value="">— Select an open MRF —</option>
            ${eligibleMRFs.map(m => `<option value="${escapeHtml(m['MRF Id'])}">${escapeHtml(m['MRF Id'])} — requested by ${escapeHtml(m['User Id'])} (${m.lines.length} item${m.lines.length === 1 ? '' : 's'} remaining)</option>`).join('')}
          </select>
          ${!eligibleMRFs.length ? '<p class="hint">No open MRFs with a remaining balance right now.</p>' : ''}
        </div>

        <div id="mrfLinesArea"></div>

        <div class="form-row" style="margin-top:14px;">
          <div class="field">
            <label>Receiver *</label>
            <select id="receiverPicker">
              <option value="">— Select receiver —</option>
              ${users.map(u => `<option value="${escapeHtml(u.userId)}">${escapeHtml(u.name)} (${escapeHtml(u.userId)}) — ${escapeHtml(u.role)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>DC Number *</label>
            <input type="text" id="dcNumber" placeholder="Delivery challan no.">
          </div>
          <div class="field">
            <label>Gate Pass No.</label>
            <input type="text" id="gatePassNo">
          </div>
        </div>

        <div class="field" id="dcPicsArea"></div>

        <div class="flex gap-8" style="margin-top:10px;">
          <button type="button" class="btn btn-outline" id="clearIssueBtn">Clear</button>
          <button type="button" class="btn btn-final" id="submitIssueBtn">Confirm &amp; Submit Issue</button>
        </div>
        <p class="hint" style="margin-top:8px;">Once submitted, this Issue is locked — nothing about it can be changed by anyone.</p>
      </div>` : ''}

      ${toReceive.length ? `
      <div class="card">
        <div class="card-header"><h3>Awaiting your verification <span class="muted" style="font-weight:500;">(${toReceive.length})</span></h3></div>
        <div id="toReceiveList"></div>
      </div>` : ''}

      ${canCreate ? `<div class="card" id="defectAckCard"><div class="card-header"><h3>Defective returns to acknowledge</h3></div><div id="defectAckList"></div></div>` : ''}

      <div class="card">
        <div class="card-header">
          <h3>${canSeeAll ? 'All Issues' : 'My Issues'} <span class="muted" style="font-weight:500;" id="issueCountLabel"></span></h3>
        </div>
        <div class="filter-bar">
          <input type="text" id="issueSearch" placeholder="Search Issue ID or MRF ID…">
          <select id="issueStatusFilter">
            <option value="">All statuses</option>
            <option value="AWAITING_VERIFICATION">Awaiting Verification</option>
            <option value="VERIFIED_PENDING_RETURN">Verified — Return Pending</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr>
              <th class="sortable" data-key="Issue Id">Issue ID <span class="arrow">▲</span></th>
              <th class="sortable" data-key="MRF Id">MRF ID <span class="arrow">▲</span></th>
              <th class="sortable" data-key="Status">Status <span class="arrow">▲</span></th>
              <th>Lines</th>
              <th class="sortable" data-key="Receiver User Id">Receiver <span class="arrow">▲</span></th>
              <th class="sortable" data-key="Created At">Created <span class="arrow">▲</span></th>
            </tr></thead>
            <tbody id="issueListRows"></tbody>
          </table>
        </div>
      </div>
    `;

    function statusChip(status) {
      const map = {
        AWAITING_VERIFICATION: ['chip-pending', 'Awaiting Verification'],
        VERIFIED_PENDING_RETURN: ['chip-defect', 'Return Pending'],
        COMPLETED: ['chip-done', 'Completed']
      };
      const pair = map[status] || ['chip-open', status];
      return `<span class="chip ${pair[0]}">${pair[1]}</span>`;
    }

    // ===================== CREATE ISSUE =====================
    let dcPics = null;
    if (canCreate) {
      dcPics = MultiImagePicker.mount(mount.querySelector('#dcPicsArea'), { label: 'DC Photo(s) — multiple allowed' });

      function renderMrfLines() {
        const area = mount.querySelector('#mrfLinesArea');
        if (!selectedMrf) { area.innerHTML = ''; return; }
        area.innerHTML = `
          <div class="table-wrap" style="margin-top:10px;">
            <table>
              <thead><tr><th>Item Code</th><th>Item Name</th><th>UOM</th><th>Requested</th><th>Remaining</th><th>Issue Qty</th></tr></thead>
              <tbody>
                ${selectedMrf.lines.map(l => `
                  <tr>
                    <td><span class="id-tag">${escapeHtml(l.itemCode)}</span></td>
                    <td>${escapeHtml(l.itemName)}</td>
                    <td>${escapeHtml(l.uom)}</td>
                    <td>${l.qtyRequested}</td>
                    <td>${l.remaining}</td>
                    <td><input type="number" class="issue-qty-input" data-code="${escapeHtml(l.itemCode)}" data-max="${l.remaining}" min="0" max="${l.remaining}" value="0" style="width:80px;"></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        area.querySelectorAll('.issue-qty-input').forEach(inp => {
          inp.addEventListener('input', () => {
            const max = Number(inp.dataset.max);
            let v = Number(inp.value);
            if (v > max) { v = max; inp.value = max; showToast('Cannot exceed remaining quantity (' + max + ').', 'error'); }
            if (v < 0) { v = 0; inp.value = 0; }
            lineQtyMap[inp.dataset.code] = v;
          });
        });
      }

      mount.querySelector('#mrfPicker').addEventListener('change', (e) => {
        selectedMrf = eligibleMRFs.find(m => m['MRF Id'] === e.target.value) || null;
        Object.keys(lineQtyMap).forEach(k => delete lineQtyMap[k]);
        renderMrfLines();
      });

      mount.querySelector('#clearIssueBtn').addEventListener('click', () => {
        mount.querySelector('#mrfPicker').value = '';
        mount.querySelector('#receiverPicker').value = '';
        mount.querySelector('#dcNumber').value = '';
        mount.querySelector('#gatePassNo').value = '';
        selectedMrf = null;
        Object.keys(lineQtyMap).forEach(k => delete lineQtyMap[k]);
        renderMrfLines();
        dcPics.reset();
      });

      mount.querySelector('#submitIssueBtn').addEventListener('click', async () => {
        if (!selectedMrf) { showToast('Select an MRF first.', 'error'); return; }
        const receiverUserId = mount.querySelector('#receiverPicker').value;
        const dcNumber = mount.querySelector('#dcNumber').value.trim();
        const gatePassNo = mount.querySelector('#gatePassNo').value.trim();
        const linesToIssue = Object.keys(lineQtyMap).filter(code => lineQtyMap[code] > 0).map(code => ({ itemCode: code, qtyIssued: lineQtyMap[code] }));

        if (!receiverUserId) { showToast('Select a receiver.', 'error'); return; }
        if (!dcNumber) { showToast('DC Number is required.', 'error'); return; }
        if (!linesToIssue.length) { showToast('Enter a quantity greater than 0 for at least one item.', 'error'); return; }
        if (!confirm('Submit this Issue? Once submitted it cannot be edited by anyone.')) return;

        const createCard = mount.querySelector('#createIssueCard');
        const btn = mount.querySelector('#submitIssueBtn');
        lockControls(createCard, true);
        try {
          let dcPicUrls = [];
          if (dcPics.hasFiles()) {
            btn.textContent = 'Uploading DC photos…';
            dcPicUrls = await dcPics.uploadAll(dcNumber);
          }
          btn.textContent = 'Saving issue…';
          const result = await apiCall('issue.create', {
            mrfId: selectedMrf['MRF Id'], receiverUserId, dcNumber, gatePassNo, dcPicUrls, lines: linesToIssue
          });
          showToast(`Issue ${result.issueId} created.`, 'success');
          Dashboard.route();
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          lockControls(createCard, false);
          btn.textContent = 'Confirm & Submit Issue';
        }
      });
    }

    // ===================== AWAITING MY VERIFICATION =====================
    if (toReceive.length) {
      const list = mount.querySelector('#toReceiveList');
      list.innerHTML = toReceive.map(i => `
        <div class="card" style="box-shadow:none; border:1px solid var(--line); margin-bottom:10px;" id="verify-${escapeHtml(i['Issue Id'])}">
          <div class="flex-between">
            <div>
              <span class="id-tag">${escapeHtml(i['Issue Id'])}</span>
              <span class="muted" style="margin-left:8px; font-size:12.5px;">MRF ${escapeHtml(i['MRF Id'])} · DC ${escapeHtml(i['DC Number'])} · ${fmtDate(i['Created At'])}</span>
            </div>
          </div>
          ${i.dcPicList.length ? `<div class="modal-images" style="margin-top:10px;">${i.dcPicList.map(u => `<img src="${escapeHtml(driveThumb(u, 150))}">`).join('')}</div>` : ''}
          <div class="table-wrap" style="margin-top:10px;">
            <table>
              <thead><tr><th>Item</th><th>Issued</th><th>Qty OK</th><th>Qty Defective</th><th>Defect remarks</th></tr></thead>
              <tbody>
                ${i.lines.map(l => `
                  <tr>
                    <td>${escapeHtml(l.itemCode)} — ${escapeHtml(l.itemName)}</td>
                    <td>${l.qtyIssued} ${escapeHtml(l.uom)}</td>
                    <td><input type="number" class="v-ok" data-code="${escapeHtml(l.itemCode)}" data-max="${l.qtyIssued}" min="0" max="${l.qtyIssued}" value="${l.qtyIssued}" style="width:70px;"></td>
                    <td><input type="number" class="v-defect" data-code="${escapeHtml(l.itemCode)}" min="0" max="${l.qtyIssued}" value="0" style="width:70px;"></td>
                    <td><input type="text" class="v-remark" data-code="${escapeHtml(l.itemCode)}" placeholder="Required if defective" style="width:100%;"></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <button type="button" class="btn btn-primary btn-sm confirm-verify-btn" data-id="${escapeHtml(i['Issue Id'])}" style="margin-top:10px;">Confirm verification</button>
        </div>
      `).join('');

      // Keep OK/Defective in sync (editing one adjusts the other to always sum to issued)
      list.querySelectorAll('.v-ok, .v-defect').forEach(inp => {
        inp.addEventListener('input', () => {
          const card = inp.closest('[id^="verify-"]');
          const code = inp.dataset.code;
          const okInput = card.querySelector(`.v-ok[data-code="${CSS.escape(code)}"]`);
          const defInput = card.querySelector(`.v-defect[data-code="${CSS.escape(code)}"]`);
          const max = Number(okInput.dataset.max);
          if (inp.classList.contains('v-ok')) {
            let v = Math.min(Math.max(Number(inp.value) || 0, 0), max);
            okInput.value = v;
            defInput.value = max - v;
          } else {
            let v = Math.min(Math.max(Number(inp.value) || 0, 0), max);
            defInput.value = v;
            okInput.value = max - v;
          }
        });
      });

      list.querySelectorAll('.confirm-verify-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const card = mount.querySelector(`#verify-${CSS.escape(btn.dataset.id)}`);
          const lines = Array.from(card.querySelectorAll('.v-ok')).map(okInput => {
            const code = okInput.dataset.code;
            const defInput = card.querySelector(`.v-defect[data-code="${CSS.escape(code)}"]`);
            const remarkInput = card.querySelector(`.v-remark[data-code="${CSS.escape(code)}"]`);
            return { itemCode: code, qtyOk: Number(okInput.value), qtyDefective: Number(defInput.value), defectRemarks: remarkInput.value.trim() };
          });
          const missingRemark = lines.find(l => l.qtyDefective > 0 && !l.defectRemarks);
          if (missingRemark) { showToast('Add a remark for the defective quantity on ' + missingRemark.itemCode, 'error'); return; }
          if (!confirm('Confirm this verification? This cannot be edited afterward.')) return;

          lockControls(card, true);
          try {
            await apiCall('issue.verify', { issueId: btn.dataset.id, lines });
            showToast('Verification recorded.', 'success');
            Dashboard.route();
          } catch (err) {
            showToast(err.message, 'error');
            lockControls(card, false);
          }
        });
      });
    }

    // ===================== DEFECTIVE RETURNS TO ACKNOWLEDGE =====================
    if (canCreate) {
      const pendingDefects = [];
      mineOrAll.forEach(i => {
        i.lines.forEach(l => {
          if (l.defectReturnStatus === 'PENDING_ACK') pendingDefects.push({ issueId: i['Issue Id'], mrfId: i['MRF Id'], ...l });
        });
      });
      const ackList = mount.querySelector('#defectAckList');
      if (!pendingDefects.length) {
        ackList.innerHTML = `<div class="empty-state">Nothing waiting on acknowledgment.</div>`;
      } else {
        ackList.innerHTML = `
          <div class="table-wrap">
            <table>
              <thead><tr><th>Issue</th><th>MRF</th><th>Item</th><th>Qty Defective</th><th>Remarks</th><th></th></tr></thead>
              <tbody>
                ${pendingDefects.map(d => `
                  <tr>
                    <td><span class="id-tag">${escapeHtml(d.issueId)}</span></td>
                    <td class="muted">${escapeHtml(d.mrfId)}</td>
                    <td>${escapeHtml(d.itemCode)} — ${escapeHtml(d.itemName)}</td>
                    <td>${d.qtyDefective} ${escapeHtml(d.uom)}</td>
                    <td class="muted">${escapeHtml(d.defectRemarks)}</td>
                    <td><button type="button" class="btn btn-primary btn-sm ack-btn" data-issue="${escapeHtml(d.issueId)}" data-item="${escapeHtml(d.itemCode)}">Acknowledge</button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
        ackList.querySelectorAll('.ack-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            btn.disabled = true;
            try {
              await apiCall('issue.acknowledgeDefect', { issueId: btn.dataset.issue, itemCode: btn.dataset.item });
              showToast('Acknowledged.', 'success');
              Dashboard.route();
            } catch (err) {
              showToast(err.message, 'error');
              btn.disabled = false;
            }
          });
        });
      }
    }

    // ===================== ISSUE LIST (sort/filter/search) =====================
    let sortKey = 'Created At', sortDir = -1, searchQ = '', statusF = '';
    const rowsBody = mount.querySelector('#issueListRows');

    function renderList() {
      let list = mineOrAll.filter(i => {
        if (statusF && i['Status'] !== statusF) return false;
        if (searchQ) {
          const q = searchQ.toLowerCase();
          if (!String(i['Issue Id']).toLowerCase().includes(q) && !String(i['MRF Id']).toLowerCase().includes(q)) return false;
        }
        return true;
      });
      list = list.slice().sort((a, b) => {
        let av = a[sortKey], bv = b[sortKey];
        if (sortKey === 'Created At') { av = new Date(av); bv = new Date(bv); }
        else { av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase(); }
        if (av < bv) return -1 * sortDir;
        if (av > bv) return 1 * sortDir;
        return 0;
      });

      mount.querySelector('#issueCountLabel').textContent = `(${list.length} of ${mineOrAll.length})`;
      if (!list.length) {
        rowsBody.innerHTML = `<tr><td colspan="6"><div class="empty-state">No issues match.</div></td></tr>`;
      } else {
        rowsBody.innerHTML = list.map(i => `
          <tr class="issue-row" data-id="${escapeHtml(i['Issue Id'])}" style="cursor:pointer;">
            <td><span class="id-tag">${escapeHtml(i['Issue Id'])}</span></td>
            <td class="muted">${escapeHtml(i['MRF Id'])}</td>
            <td>${statusChip(i['Status'])}</td>
            <td>${i.lines.length}</td>
            <td class="muted">${escapeHtml(i['Receiver User Id'])}</td>
            <td class="muted">${fmtDate(i['Created At'])}</td>
          </tr>
        `).join('');
        rowsBody.querySelectorAll('.issue-row').forEach(row => {
          row.addEventListener('click', () => {
            const i = mineOrAll.find(x => x['Issue Id'] === row.dataset.id);
            if (i) openIssueDetail(i);
          });
        });
      }
      mount.querySelectorAll('th.sortable').forEach(th => {
        th.classList.toggle('sort-active', th.dataset.key === sortKey);
        th.querySelector('.arrow').textContent = (th.dataset.key === sortKey && sortDir === -1) ? '▼' : '▲';
      });
    }

    mount.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        if (sortKey === th.dataset.key) sortDir *= -1;
        else { sortKey = th.dataset.key; sortDir = 1; }
        renderList();
      });
    });
    mount.querySelector('#issueSearch').addEventListener('input', e => { searchQ = e.target.value; renderList(); });
    mount.querySelector('#issueStatusFilter').addEventListener('change', e => { statusF = e.target.value; renderList(); });
    renderList();

    function openIssueDetail(i) {
      Modal.open(`
        <div class="modal-header">
          <div>
            <span class="id-tag" style="font-size:13px;">${escapeHtml(i['Issue Id'])}</span>
            <h2 style="margin-top:8px;">${statusChip(i['Status'])}</h2>
          </div>
          <button class="modal-close">✕</button>
        </div>
        ${i.dcPicList.length ? `<div class="modal-images">${i.dcPicList.map(u => `<img src="${escapeHtml(driveThumb(u, 300))}">`).join('')}</div>` : ''}
        <div class="detail-grid" style="margin-bottom:16px;">
          <div class="detail-item"><div class="k">MRF</div><div class="v">${escapeHtml(i['MRF Id'])}</div></div>
          <div class="detail-item"><div class="k">Receiver</div><div class="v">${escapeHtml(i['Receiver User Id'])}</div></div>
          <div class="detail-item"><div class="k">Issued by</div><div class="v">${escapeHtml(i['Issued By'])}</div></div>
          <div class="detail-item"><div class="k">DC Number</div><div class="v">${escapeHtml(i['DC Number'])}</div></div>
          <div class="detail-item"><div class="k">Gate Pass No.</div><div class="v">${escapeHtml(i['Gate Pass No']) || '—'}</div></div>
          <div class="detail-item"><div class="k">Created</div><div class="v">${fmtDate(i['Created At'])}</div></div>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>Issued</th><th>OK</th><th>Defective</th><th>Remarks</th></tr></thead>
            <tbody>
              ${i.lines.map(l => `
                <tr>
                  <td><span class="id-tag">${escapeHtml(l.itemCode)}</span> ${escapeHtml(l.itemName)}</td>
                  <td>${l.qtyIssued} ${escapeHtml(l.uom)}</td>
                  <td>${l.qtyVerifiedOk}</td>
                  <td>${l.qtyDefective > 0 ? `<span class="chip chip-defect">${l.qtyDefective}</span>` : '0'}</td>
                  <td class="muted">${escapeHtml(l.defectRemarks)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `);
    }
  }
};
