/**
 * module.productMaster.js
 * -----------------------------------------------------------------------
 * - Store, Store Admin, Admin can add new products.
 * - Nobody can edit/delete a product, EXCEPT Rate, editable only by
 *   Store Admin and Admin (enforced again server-side — this is just UX).
 * -----------------------------------------------------------------------
 */

Dashboard.modules.productMaster = {
  title: 'Product Master',

  async render(mount) {
    const session = Dashboard.session;
    const canAdd = ['Admin', 'Store Admin', 'Store'].includes(session.role);
    const canEditRate = ['Admin', 'Store Admin'].includes(session.role);

    const products = await apiCall('productMaster.list');

    mount.innerHTML = `
      ${canAdd ? `
      <div class="card">
        <div class="card-header">
          <h3>Add new product</h3>
          <span class="muted" style="font-size:12px;">Item Code is permanent once saved</span>
        </div>
        <form id="addProductForm">
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
              <label>Brand</label>
              <input type="text" id="f_brand">
            </div>
            <div class="field">
              <label>UOM</label>
              <input type="text" id="f_uom" placeholder="e.g. PCS, LTR">
            </div>
            <div class="field">
              <label>UOQ</label>
              <input type="text" id="f_uoq" placeholder="e.g. 1, 10">
            </div>
            <div class="field">
              <label>Rate (₹)</label>
              <input type="number" id="f_rate" min="0" step="0.01">
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
            <div class="field">
              <label>Image URL</label>
              <input type="text" id="f_image" placeholder="Drive share link">
            </div>
            <div class="field">
              <label>Image 2 URL</label>
              <input type="text" id="f_image2">
            </div>
            <div class="field">
              <label>Image 3 URL</label>
              <input type="text" id="f_image3">
            </div>
          </div>
          <button type="submit" class="btn btn-primary">Add product</button>
        </form>
      </div>` : ''}

      <div class="card">
        <div class="card-header">
          <h3>All products <span class="muted" style="font-weight:500;">(${products.length})</span></h3>
          <input type="text" id="searchBox" placeholder="Search…" style="width:220px;">
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item Code</th><th>Item Name</th><th>Brand</th><th>UOM</th>
                <th>Category</th><th>Rate (₹)</th><th>Stock (all users)</th><th>Added by</th>
              </tr>
            </thead>
            <tbody id="productRows"></tbody>
          </table>
        </div>
      </div>
    `;

    function rowsHtml(list) {
      return list.map(p => `
        <tr>
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

    const tbody = mount.querySelector('#productRows');
    tbody.innerHTML = rowsHtml(products);

    mount.querySelector('#searchBox').addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const filtered = products.filter(p =>
        String(p['Item Code']).toLowerCase().includes(q) ||
        String(p['Item Name']).toLowerCase().includes(q));
      tbody.innerHTML = rowsHtml(filtered);
      bindRateInputs();
    });

    function bindRateInputs() {
      tbody.querySelectorAll('.rate-input').forEach(inp => {
        inp.addEventListener('change', async () => {
          try {
            await apiCall('productMaster.updateRate', { itemCode: inp.dataset.code, rate: Number(inp.value) });
            showToast('Rate updated for ' + inp.dataset.code, 'success');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    }
    bindRateInputs();

    const form = mount.querySelector('#addProductForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true; btn.textContent = 'Saving…';
        try {
          await apiCall('productMaster.add', {
            itemCode: mount.querySelector('#f_itemCode').value.trim(),
            itemName: mount.querySelector('#f_itemName').value.trim(),
            brand: mount.querySelector('#f_brand').value.trim(),
            uom: mount.querySelector('#f_uom').value.trim(),
            uoq: mount.querySelector('#f_uoq').value.trim(),
            rate: mount.querySelector('#f_rate').value,
            l1: mount.querySelector('#f_l1').value.trim(),
            l2: mount.querySelector('#f_l2').value.trim(),
            l3: mount.querySelector('#f_l3').value.trim(),
            image: mount.querySelector('#f_image').value.trim(),
            image2: mount.querySelector('#f_image2').value.trim(),
            image3: mount.querySelector('#f_image3').value.trim(),
          });
          showToast('Product added.', 'success');
          Dashboard.route(); // reload the list
        } catch (err) {
          showToast(err.message, 'error');
        } finally {
          btn.disabled = false; btn.textContent = 'Add product';
        }
      });
    }
  }
};
