/**
 * productBrowser.js
 * -----------------------------------------------------------------------
 * A shopping-catalog style picker: search/filter a grid of product cards
 * (image, name, brand, category, rate) each with a qty stepper and an
 * Add button. Stays open so the user can keep adding multiple items,
 * like a cart, then closes when they hit Done.
 *
 * Usage:
 *   ProductBrowser.open(products, (product, qty) => { ...add to draft... }, currentDraftLines)
 * -----------------------------------------------------------------------
 */

const ProductBrowser = {
  open(products, onAdd, currentLines) {
    currentLines = currentLines || [];
    const brands = [...new Set(products.map(p => p['Brand']).filter(Boolean))].sort();
    const categories = [...new Set(products.map(p => p['L1 Category']).filter(Boolean))].sort();

    Modal.open(`
      <div class="modal-header">
        <div><h2>Browse products</h2><p style="margin:0;">Search, check details, and add straight to your MRF</p></div>
        <button class="modal-close">✕</button>
      </div>
      <div class="browser-toolbar">
        <input type="text" id="pbSearch" placeholder="Search item code or name…" style="flex:1; min-width:200px;">
        <select id="pbBrand"><option value="">All brands</option>${brands.map(b => `<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('')}</select>
        <select id="pbCategory"><option value="">All categories</option>${categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}</select>
      </div>
      <div class="product-grid" id="pbGrid"></div>
      <div class="cart-strip">
        <span id="pbCartCount">0 lines in this MRF so far</span>
        <button type="button" class="btn btn-navy btn-sm" id="pbDoneBtn">Done browsing</button>
      </div>
    `);

    const overlay = document.getElementById('activeModalOverlay');
    const grid = overlay.querySelector('#pbGrid');
    const cartCountEl = overlay.querySelector('#pbCartCount');
    let q = '', brand = '', category = '';

    function updateCartCount() {
      cartCountEl.textContent = `${currentLines.length} line${currentLines.length === 1 ? '' : 's'} in this MRF so far`;
    }
    updateCartCount();

    function render() {
      const list = products.filter(p => {
        if (brand && p['Brand'] !== brand) return false;
        if (category && p['L1 Category'] !== category) return false;
        if (q) {
          const qq = q.toLowerCase();
          if (!String(p['Item Code']).toLowerCase().includes(qq) && !String(p['Item Name']).toLowerCase().includes(qq)) return false;
        }
        return true;
      });

      if (!list.length) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No products match your search.</div>`;
        return;
      }

      grid.innerHTML = list.map(p => {
        const inCart = currentLines.some(l => l.itemCode === p['Item Code']);
        return `
        <div class="product-card ${inCart ? 'in-cart' : ''}" data-code="${escapeHtml(p['Item Code'])}">
          <div class="thumb" style="${p['Image'] ? `background-image:url('${escapeHtml(p['Image'])}')` : ''}">${p['Image'] ? '' : 'No photo'}</div>
          <div class="body">
            <span class="id-tag" style="width:fit-content;">${escapeHtml(p['Item Code'])}</span>
            <div class="name">${escapeHtml(p['Item Name'])}</div>
            <div class="meta">${escapeHtml(p['Brand'] || '—')} · ${escapeHtml(p['UOM'] || '')}</div>
            <div class="rate">₹${Number(p['Rate'] || 0).toFixed(2)}</div>
            <div class="add-row">
              <input type="number" min="1" value="1" class="pb-qty">
              <button type="button" class="btn btn-primary btn-sm pb-add">${inCart ? 'Add more' : 'Add'}</button>
            </div>
          </div>
        </div>`;
      }).join('');

      grid.querySelectorAll('.product-card').forEach(card => {
        const code = card.dataset.code;
        const product = products.find(p => p['Item Code'] === code);
        card.querySelector('.pb-add').addEventListener('click', () => {
          const qtyInput = card.querySelector('.pb-qty');
          const qty = Number(qtyInput.value);
          if (!qty || qty <= 0) { showToast('Enter a quantity greater than 0.', 'error'); return; }
          onAdd(product, qty);
          showToast(`Added ${qty} × ${product['Item Name']}`, 'success');
          card.classList.add('in-cart');
          card.querySelector('.pb-add').textContent = 'Add more';
          updateCartCount();
        });
      });
    }

    overlay.querySelector('#pbSearch').addEventListener('input', e => { q = e.target.value; render(); });
    overlay.querySelector('#pbBrand').addEventListener('change', e => { brand = e.target.value; render(); });
    overlay.querySelector('#pbCategory').addEventListener('change', e => { category = e.target.value; render(); });
    overlay.querySelector('#pbDoneBtn').addEventListener('click', () => Modal.close());

    render();
  }
};
