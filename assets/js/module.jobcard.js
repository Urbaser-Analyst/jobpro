/**
 * module.jobcard.js
 * -----------------------------------------------------------------------
 * - One vehicle can have only one open (In Progress) Job Card at a time.
 * - Unlike MRF/Issue, a Job Card is NOT locked at creation — it starts
 *   In Progress and stays open (spares can keep being consumed,
 *   employees keep being added) until its owner clicks Final
 *   Completion, which locks it and moves it to the Completed column.
 * - Spares are consumed from the creator's own personal inventory only,
 *   and can never go negative (enforced server-side).
 * - A Job Card can spawn its own MRF when a part isn't in personal
 *   stock — "Request Stock" inside the detail view.
 * - Kanban board: In Progress | Completed, click any card for detail.
 * - Same lazy-loading shape as MRF/Issue: the board loads a lightweight
 *   summary; full detail (employees, spares, linked MRFs) loads only
 *   for the one card someone opens.
 * -----------------------------------------------------------------------
 */

const JOBCARD_WIDE_ROLES = ['Admin', 'Store Admin', 'Store', 'Viewer'];

Dashboard.modules.jobcard = {
  title: 'Job Card',

  async render(mount) {
    const session = Dashboard.session;
    const canSeeAll = JOBCARD_WIDE_ROLES.includes(session.role);
    const canAddMasters = !['Viewer', 'MRF Approver & Viewer'].includes(session.role);

    const [vehiclesInit, employeesInit, cardList] = await Promise.all([
      apiCall('vehicle.list'),
      apiCall('employee.list'),
      apiCall('jobcard.list', { scope: canSeeAll ? 'all' : 'mine' })
    ]);

    let vehicles = vehiclesInit;
    let employees = employeesInit;
    let selectedVehicle = null;
    let employeeRows = []; // { empId, name, startTime, endTime, picked }
    let products = null;
    let productsLoadingPromise = null;

    function ensureProducts() {
      if (products) return Promise.resolve(products);
      if (!productsLoadingPromise) {
        productsLoadingPromise = apiCall('productMaster.list').then(list => { products = list; return products; });
      }
      return productsLoadingPromise;
    }

    mount.innerHTML = `
      <div class="card" id="createJobCard">
        <div class="card-header"><h3>Start a new Job Card</h3></div>

        <div class="form-row">
          <div class="field">
            <label>Vehicle *</label>
            <div id="vehicleCombo"></div>
            ${canAddMasters ? `<button type="button" class="btn btn-outline btn-sm" id="newVehicleToggle" style="margin-top:6px;">+ Add a new vehicle</button>` : ''}
            <div id="newVehicleForm" style="display:none; margin-top:8px;">
              <div class="form-row">
                <input type="text" id="nvRegNo" placeholder="Reg No">
                <input type="text" id="nvType" placeholder="Vehicle Type">
                <button type="button" class="btn btn-primary btn-sm" id="nvSaveBtn">Add vehicle</button>
              </div>
            </div>
          </div>
          <div class="field">
            <label>Job Type *</label>
            <input type="text" id="jobType" placeholder="e.g. Preventive Maintenance">
          </div>
          <div class="field">
            <label>Job Mode</label>
            <input type="text" id="jobMode" placeholder="e.g. In-house, Outsourced">
          </div>
        </div>
        <div class="field">
          <label>Job Description</label>
          <textarea id="jobDescription" rows="2"></textarea>
        </div>
        <div class="field">
          <label>Remarks</label>
          <textarea id="remarks" rows="2"></textarea>
        </div>

        <div class="field">
          <label>Employees (Mechanic / Helper)</label>
          <div id="employeeRows"></div>
          <button type="button" class="btn btn-outline btn-sm" id="addEmployeeRowBtn">+ Add employee</button>
          ${canAddMasters ? `<button type="button" class="btn btn-outline btn-sm" id="newEmployeeToggle" style="margin-left:8px;">+ New employee</button>` : ''}
          <div id="newEmployeeForm" style="display:none; margin-top:8px;">
            <div class="form-row">
              <input type="text" id="neId" placeholder="Employee ID">
              <input type="text" id="neName" placeholder="Name">
              <button type="button" class="btn btn-primary btn-sm" id="neSaveBtn">Add employee</button>
            </div>
          </div>
        </div>

        <div class="flex gap-8" style="margin-top:14px;">
          <button type="button" class="btn btn-outline" id="clearJobBtn">Clear</button>
          <button type="button" class="btn btn-final" id="startJobBtn">Start Job Card</button>
        </div>
        <p class="hint" style="margin-top:8px;">This creates the Job Card as In Progress — you can keep adding employees and consuming spares until you click Final Completion on it.</p>
      </div>

      <div class="card">
        <div class="card-header"><h3>${canSeeAll ? 'All Job Cards' : 'My Job Cards'}</h3></div>
        <div class="kanban-board">
          <div class="kanban-column">
            <div class="kanban-column-header"><span>In Progress</span><span id="ipCount"></span></div>
            <div id="ipColumn"></div>
          </div>
          <div class="kanban-column">
            <div class="kanban-column-header"><span>Completed</span><span id="compCount"></span></div>
            <div id="compColumn"></div>
          </div>
        </div>
      </div>
    `;

    // ===================== VEHICLE PICKER =====================
    const vehicleCombo = GenericCombo.mount(
      mount.querySelector('#vehicleCombo'), vehicles,
      v => v['Reg No'], v => { selectedVehicle = v; }, v => v['Vehicle Type']
    );

    if (canAddMasters) {
      mount.querySelector('#newVehicleToggle').addEventListener('click', () => {
        const f = mount.querySelector('#newVehicleForm');
        f.style.display = f.style.display === 'none' ? 'block' : 'none';
      });
      mount.querySelector('#nvSaveBtn').addEventListener('click', async () => {
        const regNo = mount.querySelector('#nvRegNo').value.trim();
        const vehicleType = mount.querySelector('#nvType').value.trim();
        if (!regNo || !vehicleType) { showToast('Enter both Reg No and Vehicle Type.', 'error'); return; }
        try {
          await apiCall('vehicle.add', { regNo, vehicleType });
          vehicles = await apiCall('vehicle.list');
          vehicleCombo.setItems(vehicles);
          mount.querySelector('#nvRegNo').value = '';
          mount.querySelector('#nvType').value = '';
          showToast('Vehicle added.', 'success');
        } catch (err) { showToast(err.message, 'error'); }
      });
    }

    // ===================== EMPLOYEE ROWS =====================
    function renderEmployeeRows() {
      const container = mount.querySelector('#employeeRows');
      container.innerHTML = '';
      employeeRows.forEach((row, i) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'employee-row';
        rowEl.innerHTML = `
          <div class="emp-combo-${i}"></div>
          <input type="time" class="emp-start-${i}">
          <input type="time" class="emp-end-${i}">
          <button type="button" class="btn btn-danger btn-sm remove-emp-row" data-i="${i}">✕</button>
        `;
        container.appendChild(rowEl);
        GenericCombo.mount(
          rowEl.querySelector(`.emp-combo-${i}`), employees,
          e => e['Name'], e => { employeeRows[i].empId = e['Emp Id']; employeeRows[i].name = e['Name']; }, e => e['Emp Id']
        );
        rowEl.querySelector(`.emp-start-${i}`).addEventListener('change', e => { employeeRows[i].startTime = e.target.value; });
        rowEl.querySelector(`.emp-end-${i}`).addEventListener('change', e => { employeeRows[i].endTime = e.target.value; });
        rowEl.querySelector('.remove-emp-row').addEventListener('click', () => { employeeRows.splice(i, 1); renderEmployeeRows(); });
      });
    }
    mount.querySelector('#addEmployeeRowBtn').addEventListener('click', () => {
      employeeRows.push({ empId: '', name: '', startTime: '', endTime: '' });
      renderEmployeeRows();
    });

    if (canAddMasters) {
      mount.querySelector('#newEmployeeToggle').addEventListener('click', () => {
        const f = mount.querySelector('#newEmployeeForm');
        f.style.display = f.style.display === 'none' ? 'block' : 'none';
      });
      mount.querySelector('#neSaveBtn').addEventListener('click', async () => {
        const empId = mount.querySelector('#neId').value.trim();
        const name = mount.querySelector('#neName').value.trim();
        if (!empId || !name) { showToast('Enter both Employee ID and Name.', 'error'); return; }
        try {
          await apiCall('employee.add', { empId, name });
          employees = await apiCall('employee.list');
          renderEmployeeRows(); // remount combos with fresh list
          mount.querySelector('#neId').value = '';
          mount.querySelector('#neName').value = '';
          showToast('Employee added.', 'success');
        } catch (err) { showToast(err.message, 'error'); }
      });
    }

    mount.querySelector('#clearJobBtn').addEventListener('click', () => {
      mount.querySelector('#jobType').value = '';
      mount.querySelector('#jobMode').value = '';
      mount.querySelector('#jobDescription').value = '';
      mount.querySelector('#remarks').value = '';
      selectedVehicle = null;
      vehicleCombo.reset();
      employeeRows = [];
      renderEmployeeRows();
    });

    mount.querySelector('#startJobBtn').addEventListener('click', async () => {
      const jobType = mount.querySelector('#jobType').value.trim();
      if (!selectedVehicle) { showToast('Select a vehicle.', 'error'); return; }
      if (!jobType) { showToast('Job Type is required.', 'error'); return; }
      if (!confirm('Start this Job Card for ' + selectedVehicle['Reg No'] + '?')) return;

      const card = mount.querySelector('#createJobCard');
      const btn = mount.querySelector('#startJobBtn');
      lockControls(card, true);
      btn.textContent = 'Starting…';
      try {
        const result = await apiCall('jobcard.create', {
          vehicleRegNo: selectedVehicle['Reg No'],
          jobType,
          jobMode: mount.querySelector('#jobMode').value.trim(),
          jobDescription: mount.querySelector('#jobDescription').value.trim(),
          remarks: mount.querySelector('#remarks').value.trim(),
          employees: employeeRows.filter(e => e.name)
        });
        showToast(`Job Card ${result.jid} started.`, 'success');
        Dashboard.route();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        lockControls(card, false);
        btn.textContent = 'Start Job Card';
      }
    });

    // ===================== KANBAN BOARD =====================
    const inProgress = cardList.filter(j => j['Status'] === 'IN_PROGRESS');
    const completed = cardList.filter(j => j['Status'] === 'COMPLETED');
    mount.querySelector('#ipCount').textContent = `(${inProgress.length})`;
    mount.querySelector('#compCount').textContent = `(${completed.length})`;

    function cardHtml(j) {
      return `
        <div class="kanban-card" data-jid="${escapeHtml(j['JID'])}">
          <div class="veh">${escapeHtml(j['Vehicle Reg No'])} <span class="muted" style="font-weight:400;">(${escapeHtml(j['Vehicle Type'])})</span></div>
          <div class="meta">${escapeHtml(j['Job Type'])}${j['Job Mode'] ? ' · ' + escapeHtml(j['Job Mode']) : ''}</div>
          <div class="meta">${escapeHtml(j['JID'])} · ${fmtDate(j['Start Timestamp'])}</div>
          ${canSeeAll ? `<div class="meta">by ${escapeHtml(j['User Id'])}</div>` : ''}
        </div>`;
    }

    mount.querySelector('#ipColumn').innerHTML = inProgress.length
      ? inProgress.map(cardHtml).join('')
      : `<div class="empty-state" style="padding:20px;">No open Job Cards</div>`;
    mount.querySelector('#compColumn').innerHTML = completed.length
      ? completed.map(cardHtml).join('')
      : `<div class="empty-state" style="padding:20px;">Nothing completed yet</div>`;

    mount.querySelectorAll('.kanban-card').forEach(el => {
      el.addEventListener('click', () => openJobCardDetail(el.dataset.jid));
    });

    // ===================== LAZY DETAIL MODAL =====================
    async function openJobCardDetail(jid) {
      Modal.open(`<div class="modal-header"><h2>Loading…</h2></div><p class="muted">Fetching ${escapeHtml(jid)}…</p>`);
      let j;
      try {
        j = await apiCall('jobcard.get', { jid });
      } catch (err) {
        Modal.open(`<div class="modal-header"><h2>Error</h2><button class="modal-close">✕</button></div><p style="color:#F26A8D">${escapeHtml(err.message)}</p>`);
        return;
      }

      const isOpen = j['Status'] === 'IN_PROGRESS';
      const canAct = isOpen && j.isOwner;

      renderDetailModal(j, canAct);
    }

    function renderDetailModal(j, canAct) {
      Modal.open(`
        <div class="modal-header">
          <div>
            <span class="id-tag" style="font-size:13px;">${escapeHtml(j['JID'])}</span>
            <h2 style="margin-top:8px;">${escapeHtml(j['Vehicle Reg No'])} <span class="chip ${j['Status'] === 'IN_PROGRESS' ? 'chip-pending' : 'chip-done'}">${j['Status'] === 'IN_PROGRESS' ? 'In Progress' : 'Completed'}</span></h2>
          </div>
          <button class="modal-close">✕</button>
        </div>
        <div class="detail-grid" style="margin-bottom:16px;">
          <div class="detail-item"><div class="k">Vehicle Type</div><div class="v">${escapeHtml(j['Vehicle Type'])}</div></div>
          <div class="detail-item"><div class="k">Job Type</div><div class="v">${escapeHtml(j['Job Type'])}</div></div>
          <div class="detail-item"><div class="k">Job Mode</div><div class="v">${escapeHtml(j['Job Mode']) || '—'}</div></div>
          <div class="detail-item"><div class="k">Started</div><div class="v">${fmtDate(j['Start Timestamp'])}</div></div>
          <div class="detail-item"><div class="k">Ended</div><div class="v">${j['End Timestamp'] ? fmtDate(j['End Timestamp']) : '—'}</div></div>
          <div class="detail-item"><div class="k">Created by</div><div class="v">${escapeHtml(j['User Id'])}</div></div>
        </div>
        ${j['Job Description'] ? `<div class="field"><label>Description</label><p>${escapeHtml(j['Job Description'])}</p></div>` : ''}
        ${j['Remarks'] ? `<div class="field"><label>Remarks</label><p>${escapeHtml(j['Remarks'])}</p></div>` : ''}

        <h3 style="margin-top:16px;">Employees</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Emp ID</th><th>Start</th><th>End</th></tr></thead>
          <tbody>
            ${j.employees.length ? j.employees.map(e => `<tr><td>${escapeHtml(e['Name'])}</td><td class="muted">${escapeHtml(e['Emp Id'])}</td><td>${escapeHtml(e['Start Time'])}</td><td>${escapeHtml(e['End Time'])}</td></tr>`).join('') : '<tr><td colspan="4"><div class="empty-state">None added yet</div></td></tr>'}
          </tbody>
        </table></div>
        ${canAct ? `
          <div class="flex gap-8" style="margin-top:10px;" id="addEmpArea">
            <div id="modalEmpCombo" style="flex:2;"></div>
            <input type="time" id="modalEmpStart" style="flex:1;">
            <input type="time" id="modalEmpEnd" style="flex:1;">
            <button type="button" class="btn btn-outline btn-sm" id="modalAddEmpBtn">Add</button>
          </div>` : ''}

        <h3 style="margin-top:20px;">Spares consumed</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>Item</th><th>Qty</th><th>When</th></tr></thead>
          <tbody>
            ${j.spares.length ? j.spares.map(s => `<tr><td>${escapeHtml(s.itemCode)} — ${escapeHtml(s.itemName)}</td><td>${s.qtyConsumed} ${escapeHtml(s.uom)}</td><td class="muted">${fmtDate(s.timestamp)}</td></tr>`).join('') : '<tr><td colspan="3"><div class="empty-state">None consumed yet</div></td></tr>'}
          </tbody>
        </table></div>
        ${canAct ? `
          <div class="flex gap-8" style="margin-top:10px;">
            <div id="modalSpareCombo" style="flex:2;"></div>
            <input type="number" id="modalSpareQty" min="1" value="1" style="flex:1;">
            <button type="button" class="btn btn-outline btn-sm" id="modalConsumeBtn">Consume</button>
          </div>
          <p class="hint" style="margin-top:6px;">Only shows items currently in your personal inventory. Cannot exceed what you have.</p>` : ''}

        <h3 style="margin-top:20px;">Linked MRFs</h3>
        <div class="table-wrap"><table>
          <thead><tr><th>MRF</th><th>Status</th><th>Value</th></tr></thead>
          <tbody>
            ${j.linkedMRFs.length ? j.linkedMRFs.map(m => `<tr><td><span class="id-tag">${escapeHtml(m.mrfId)}</span></td><td>${escapeHtml(m.status)}</td><td>₹${Number(m.totalValue).toFixed(2)}</td></tr>`).join('') : '<tr><td colspan="3"><div class="empty-state">None yet</div></td></tr>'}
          </tbody>
        </table></div>
        ${canAct ? `<button type="button" class="btn btn-outline btn-sm" id="requestStockBtn" style="margin-top:10px;">Request stock (MRF) for this job</button>` : ''}

        ${canAct ? `<div style="margin-top:24px; padding-top:16px; border-top:1px solid var(--line);">
          <button type="button" class="btn btn-final" id="finalizeBtn">Double-Check &amp; Final Completion</button>
          <p class="hint" style="margin-top:8px;">Once finalized, this Job Card is locked and moves to Completed — nothing about it can be changed.</p>
        </div>` : ''}
      `);

      const overlay = document.getElementById('activeModalOverlay');
      if (!canAct) return;

      // ---- Add employee ----
      let pickedEmp = null;
      const empCombo = GenericCombo.mount(overlay.querySelector('#modalEmpCombo'), employees, e => e['Name'], e => { pickedEmp = e; }, e => e['Emp Id']);
      overlay.querySelector('#modalAddEmpBtn').addEventListener('click', async () => {
        if (!pickedEmp) { showToast('Select an employee.', 'error'); return; }
        try {
          await apiCall('jobcard.addEmployee', {
            jid: j['JID'], empId: pickedEmp['Emp Id'], name: pickedEmp['Name'],
            startTime: overlay.querySelector('#modalEmpStart').value, endTime: overlay.querySelector('#modalEmpEnd').value
          });
          showToast('Employee added.', 'success');
          const refreshed = await apiCall('jobcard.get', { jid: j['JID'] });
          renderDetailModal(refreshed, canAct);
        } catch (err) { showToast(err.message, 'error'); }
      });

      // ---- Consume spare (lazy-loads the user's own inventory only) ----
      apiCall('inventory.mine').then(myInventory => {
        let pickedItem = null;
        const spareCombo = GenericCombo.mount(
          overlay.querySelector('#modalSpareCombo'), myInventory,
          it => `${it.itemCode} | ${it.itemName}`, it => { pickedItem = it; }, it => `In stock: ${it.qty}`
        );
        overlay.querySelector('#modalConsumeBtn').addEventListener('click', async () => {
          const qty = Number(overlay.querySelector('#modalSpareQty').value);
          if (!pickedItem) { showToast('Select a product from your inventory.', 'error'); return; }
          if (!qty || qty <= 0) { showToast('Enter a quantity greater than 0.', 'error'); return; }
          try {
            await apiCall('jobcard.consumeSpare', { jid: j['JID'], itemCode: pickedItem.itemCode, qty });
            showToast('Spare consumed.', 'success');
            const refreshed = await apiCall('jobcard.get', { jid: j['JID'] });
            renderDetailModal(refreshed, canAct);
          } catch (err) { showToast(err.message, 'error'); }
        });
      });

      // ---- Request stock (MRF) for this job ----
      overlay.querySelector('#requestStockBtn').addEventListener('click', async () => {
        const list = await ensureProducts();
        const draft = [];
        ProductBrowser.open(list, (product, qty) => {
          const existing = draft.find(d => d.itemCode === product['Item Code']);
          if (existing) existing.qty += qty;
          else draft.push({ itemCode: product['Item Code'], itemName: product['Item Name'], qty });
        }, []);
        // Give the person a moment to browse; when they close the browser,
        // offer to submit whatever they picked as an MRF linked to this job.
        const checkClosed = setInterval(async () => {
          if (!document.getElementById('activeModalOverlay')) {
            clearInterval(checkClosed);
            if (draft.length && confirm(`Submit an MRF for ${draft.length} item(s) linked to ${j['JID']}?`)) {
              try {
                const result = await apiCall('mrf.create', { lines: draft.map(d => ({ itemCode: d.itemCode, qtyRequested: d.qty })), sourceJobCardId: j['JID'] });
                showToast(`MRF ${result.mrfId} submitted for this job.`, 'success');
                const refreshed = await apiCall('jobcard.get', { jid: j['JID'] });
                renderDetailModal(refreshed, canAct);
              } catch (err) { showToast(err.message, 'error'); }
            }
          }
        }, 400);
      });

      // ---- Finalize ----
      overlay.querySelector('#finalizeBtn').addEventListener('click', async () => {
        if (!confirm('Finalize this Job Card? Once completed it cannot be edited by anyone.')) return;
        try {
          await apiCall('jobcard.finalize', { jid: j['JID'] });
          showToast(j['JID'] + ' completed.', 'success');
          Modal.close();
          Dashboard.route();
        } catch (err) { showToast(err.message, 'error'); }
      });
    }
  }
};
