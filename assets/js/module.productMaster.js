/**
 * module.productMaster.js
 * -----------------------------------------------------------------------
 * - Store, Store Admin, Admin can add new products.
 * - Mandatory fields: Item Code, Item Name, UOM, Brand, UOQ, Rate.
 * - Nobody can edit/delete a product, EXCEPT Rate, editable only by
 *   Store Admin and Admin (enforced again server-side — this is just UX).
 * - Images come from camera or gallery (native picker), uploaded to
 *   Drive, never typed as a URL.
 * - Table supports column sort + Brand/Category filters + search.
 * -----------------------------------------------------------------------
 */

Dashboard.modules.productMaster = {
  title: 'Product Master',

  async render(mount) {
    const session = Dashboard.session;
    const canAdd = ['Admin', 'Store Admin', 'Store'].includes(session.role);
    const canEditRate = ['Admin', 'Store Admin'].includes(session.role);

    const allProducts = await apiCall('productMaster.list');
    let sortKey = 'Item Code';
    let sortDir = 1;
    let filterBrand = '';
    let filterCategory = '';
    let searchQ = '';
    let imagePickers = [];

    const brands = [...new Set(allProducts.map(p => p['Brand']).filter(Boolean))].sort();
    const categories = [...new Set(allProducts.map(p => p['L1 Category']).filter(Boolean))].sort();

    mount.innerHTML = `
      ${canAdd ? `
      <div class="card">
        <div class="card-header">
          <h3>Add new product</h3>
          <span class="muted" style="font-size:12px;">* Required — Item Code is permanent once saved</span>
        </div>
        <form id="addProductForm" novalidate>
          <div class="form-row">
            <div class="field">
              <label>Item Code *</label>
              <input type="text" id="f_itemCode" required placeholder="e.g. F001">
            </div>
            <div class="field">
              <label>Item Name *</label>
              <input type="text" id="f_itemName" required placeholder="e.g. Brake Shoe">
            </div>
            <div class="field">
              <label>Brand *</label>
              <input type="text" id="f_brand" required>
            </div>
            <div class="field">
              <label>UOM *</label>
              <input type="text" id="f_uom" required placeholder="e.g. PCS, LTR">
            </div>
            <div class="field">
              <label>UOQ *</label>
              <input type="text" id="f_uoq" required placeholder="e.g. 1, 10">
            </div>
            <div class="field">
              <label>Rate (₹) *</label>
              <input type="number" id="f_rate" min="0" step="0.01" required>
            </div>
            <div class="field">
              <label>L1 Category</label>
              <input type="text" id="f_l1">
            </div>
            <div class="field">
              <label>L2 Category</label>
              <input type="text" id="f_l2">
            </div>
            <div class="field">
              <label>L3 Category</label>
              <input type="text" id="f_l3">
            </div>
          </div>

          <div class="form-row" style="margin-top:6px;">
            <div class="field" id="img1"></div>
            <div class="field" id="img2"></div>
            <div class="field" id="img3"></div>
          </div>

          <div class="flex gap-8">
            <button type="submit" class="btn btn-primary">Add product</button>
            <button type="button" class="btn btn-outline" id="clearFormBtn">Clear</button>
          </div>
        </form>
      </div>` : ''}

      <div class="card">
        <div class="card-header">
          <h3>All products <span class="muted" style="font-weight:500;" id="countLabel">(${allProducts.length})</span></h3>
        </div>

        <div class="filter-bar">
          <input type="text" id="searchBox" placeholder="Search item code or name…">
          <select id="brandFilter">
            <option value="">All brands</option>
            ${brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('')}
          </select>
          <select id="categoryFilter">
            <option value="">All categories</option>
            ${categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
          </select>
          <button type="button" class="btn btn-outline btn-sm" id="clearFilters">Clear filters</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th class="sortable" data-key="Item Code">Item Code <span class="arrow">▲</span></th>
                <th class="sortable" data-key="Item Name">Item Name <span class="arrow">▲</span></th>
                <th class="sortable" data-key="Brand">Brand <span class="arrow">▲</span></th>
                <th class="sortable" data-key="UOM">UOM <span class="arrow">▲</span></th>
                <th>Category</th>
                <th class="sortable" data-key="Rate">Rate (₹) <span class="arrow">▲</span></th>
                <th class="sortable" data-key="Total Stock Qty">Stock (all users) <span class="arrow">▲</span></th>
                <th>Added by</th>
              </tr>
            </thead>
            <tbody id="productRows"></tbody>
          </table>
        </div>
      </div>
    `;

    // ---- Image pickers (add form) ----
    if (canAdd) {
      const codeGetter = () => mount.querySelector('#f_itemCode').value.trim() || 'unfiled';
      imagePickers = [
        ImagePicker.mount(mount.querySelector('#img1'), { label: 'Image 1', itemCodeGetter: codeGetter }),
        ImagePicker.mount(mount.querySelector('#img2'), { label: 'Image 2', itemCodeGetter: codeGetter }),
        ImagePicker.mount(mount.querySelector('#img3'), { label: 'Image 3', itemCodeGetter: codeGetter }),
      ];
    }

    // ---- Table render with sort/filter/search applied ----
    function applyAndRender() {
      let list = allProducts.filter(p => {
        if (filterBrand && p['Brand'] !== filterBrand) return false;
        if (filterCategory && p['L1 Category'] !== filterCategory) return false;
        if (searchQ) {
          const q = searchQ.toLowerCase();
          if (!String(p['Item Code']).toLowerCase().includes(q) &&
              !String(p['Item Name']).toLowerCase().includes(q)) return false;
        }
        return true;
      });

      list = list.slice().sort((a, b) => {
        let av = a[sortKey], bv = b[sortKey];
        if (sortKey === 'Rate' || sortKey === 'Total Stock Qty') { av = Number(av || 0); bv = Number(bv || 0); }
        else { av = String(av || '').toLowerCase(); bv = String(bv || '').toLowerCase(); }
        if (av < bv) return -1 * sortDir;
        if (av > bv) return 1 * sortDir;
        return 0;
      });

      mount.querySelector('#countLabel').textContent = `(${list.length} of ${allProducts.length})`;
      tbody.innerHTML = rowsHtml(list);
      bindRateInputs();

      mount.querySelectorAll('th.sortable').forEach(th => {
        th.classList.toggle('sort-active', th.dataset.key === sortKey);
        th.querySelector('.arrow').textContent = (th.dataset.key === sortKey && sortDir === -1) ? '▼' : '▲';
      });
    }

    function rowsHtml(list) {
      if (!list.length) {
        return `<tr><td colspan="8"><div class="empty-state">No products match your filters.</div></td></tr>`;
      }
      return list.map(p => `
        <tr class="product-row" data-code="${escapeHtml(p['Item Code'])}" style="cursor:pointer;">
          <td><span class="id-tag">${escapeHtml(p['Item Code'])}</span></td>
          <td>${escapeHtml(p['Item Name'])}</td>
          <td>${escapeHtml(p['Brand'])}</td>
          <td>${escapeHtml(p['UOM'])}</td>
          <td class="muted">${[p['L1 Category'], p['L2 Category'], p['L3 Category']].filter(Boolean).join(' / ')}</td>
          <td>
            ${canEditRate
              ? `<input type="number" class="rate-input" data-code="${escapeHtml(p['Item Code'])}" value="${Number(p['Rate'] || 0)}" style="width:90px; padding:4px 8px;">`
              : `₹${Number(p['Rate'] || 0).toFixed(2)}`}
          </td>
          <td>${p['Total Stock Qty'] || 0}</td>
          <td class="muted">${escapeHtml(p['Created By'])}</td>
        </tr>
      `).join('');
    }

    function openProductDetail(p) {
      const images = [p['Image'], p['Image2'], p['Image3']].filter(Boolean);
      const imagesHtml = images.length
        ? `<div class="modal-images">${images.map(src => `<img src="${escapeHtml(src)}" onerror="this.style.visibility='hidden'">`).join('')}</div>`
        : `<div class="muted" style="margin-bottom:16px; font-size:12.5px;">No photos uploaded for this item.</div>`;

      Modal.open(`
        <div class="modal-header">
          <div>
            <span class="id-tag" style="font-size:13px;">${escapeHtml(p['Item Code'])}</span>
            <h2 style="margin-top:8px;">${escapeHtml(p['Item Name'])}</h2>
          </div>
          <button class="modal-close">✕</button>
        </div>
        ${imagesHtml}
        <div class="detail-grid">
          <div class="detail-item"><div class="k">Brand</div><div class="v">${escapeHtml(p['Brand']) || '—'}</div></div>
          <div class="detail-item"><div class="k">UOM</div><div class="v">${escapeHtml(p['UOM']) || '—'}</div></div>
          <div class="detail-item"><div class="k">UOQ</div><div class="v">${escapeHtml(p['UOQ']) || '—'}</div></div>
          <div class="detail-item"><div class="k">Rate</div><div class="v">₹${Number(p['Rate'] || 0).toFixed(2)}</div></div>
          <div class="detail-item"><div class="k">L1 Category</div><div class="v">${escapeHtml(p['L1 Category']) || '—'}</div></div>
          <div class="detail-item"><div class="k">L2 Category</div><div class="v">${escapeHtml(p['L2 Category']) || '—'}</div></div>
          <div class="detail-item"><div class="k">L3 Category</div><div class="v">${escapeHtml(p['L3 Category']) || '—'}</div></div>
          <div class="detail-item"><div class="k">Total stock (all users)</div><div class="v">${p['Total Stock Qty'] || 0}</div></div>
          <div class="detail-item"><div class="k">Added by</div><div class="v">${escapeHtml(p['Created By']) || '—'}</div></div>
          <div class="detail-item"><div class="k">Added on</div><div class="v">${fmtDate(p['Timestamp'])}</div></div>
        </div>
      `);
    }

    const tbody = mount.querySelector('#productRows');

    function bindRateInputs() {
      tbody.querySelectorAll('.rate-input').forEach(inp => {
        inp.addEventListener('click', (e) => e.stopPropagation());
        inp.addEventListener('change', async () => {
          try {
            await apiCall('productMaster.updateRate', { itemCode: inp.dataset.code, rate: Number(inp.value) });
            const p = allProducts.find(x => x['Item Code'] === inp.dataset.code);
            if (p) p['Rate'] = Number(inp.value);
            showToast('Rate updated for ' + inp.dataset.code, 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    }

    // Delegated click on the table body so it keeps working after re-renders
    tbody.addEventListener('click', (e) => {
      const row = e.target.closest('.product-row');
      if (!row) return;
      const p = allProducts.find(x => x['Item Code'] === row.dataset.code);
      if (p) openProductDetail(p);
    });

    // ---- Wire up sort/filter/search controls ----
    if (canAdd) {
      mount.querySelector('#clearFormBtn').addEventListener('click', () => {
        form.reset();
        imagePickers.forEach(p => p.reset());
      });
    }
    mount.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        if (sortKey === th.dataset.key) sortDir *= -1;
        else { sortKey = th.dataset.key; sortDir = 1; }
        applyAndRender();
      });
    });
    mount.querySelector('#searchBox').addEventListener('input', (e) => { searchQ = e.target.value; applyAndRender(); });
    mount.querySelector('#brandFilter').addEventListener('change', (e) => { filterBrand = e.target.value; applyAndRender(); });
    mount.querySelector('#categoryFilter').addEventListener('change', (e) => { filterCategory = e.target.value; applyAndRender(); });
    mount.querySelector('#clearFilters').addEventListener('click', () => {
      searchQ = ''; filterBrand = ''; filterCategory = '';
      mount.querySelector('#searchBox').value = '';
      mount.querySelector('#brandFilter').value = '';
      mount.querySelector('#categoryFilter').value = '';
      applyAndRender();
    });

    applyAndRender();

    // ---- Add product form ----
    const form = mount.querySelector('#addProductForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const values = {
          itemCode: mount.querySelector('#f_itemCode').value.trim(),
          itemName: mount.querySelector('#f_itemName').value.trim(),
          brand: mount.querySelector('#f_brand').value.trim(),
          uom: mount.querySelector('#f_uom').value.trim(),
          uoq: mount.querySelector('#f_uoq').value.trim(),
          rate: mount.querySelector('#f_rate').value,
          l1: mount.querySelector('#f_l1').value.trim(),
          l2: mount.querySelector('#f_l2').value.trim(),
          l3: mount.querySelector('#f_l3').value.trim(),
        };

        const missing = [];
        if (!values.itemCode) missing.push('Item Code');
        if (!values.itemName) missing.push('Item Name');
        if (!values.brand) missing.push('Brand');
        if (!values.uom) missing.push('UOM');
        if (!values.uoq) missing.push('UOQ');
        if (values.rate === '' || isNaN(Number(values.rate))) missing.push('Rate');
        if (missing.length) {
          showToast('Please fill in: ' + missing.join(', '), 'error');
          return;
        }

        const btn = form.querySelector('button[type=submit]');
        const allControls = form.querySelectorAll('input, button, select, textarea');
        allControls.forEach(el => el.disabled = true);
        btn.textContent = 'Saving…';
        try {
          values.image = imagePickers[0] ? imagePickers[0].getUrl() : '';
          values.image2 = imagePickers[1] ? imagePickers[1].getUrl() : '';
          values.image3 = imagePickers[2] ? imagePickers[2].getUrl() : '';

          await apiCall('productMaster.add', values);
          showToast('Product added.', 'success');
          Dashboard.route(); // reload the list
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          allControls.forEach(el => el.disabled = false);
          btn.textContent = 'Add product';
        }
      });
    }
  }
};
