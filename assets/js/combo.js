/**
 * combo.js
 * -----------------------------------------------------------------------
 * A dependency-free searchable dropdown for picking a product.
 * Displays "ItemCode | ItemName" and returns the full product object
 * on selection so the caller can auto-populate Image/UOM/Category/Rate.
 *
 * Usage:
 *   ProductCombo.mount(containerEl, products, (product) => { ... });
 * -----------------------------------------------------------------------
 */

const ProductCombo = {
  mount(container, products, onSelect) {
    container.classList.add('combo');
    container.innerHTML = `
      <input type="text" class="combo-input" placeholder="Search Item Code or Name…" autocomplete="off">
      <div class="combo-panel"></div>
    `;
    const input = container.querySelector('.combo-input');
    const panel = container.querySelector('.combo-panel');
    let hiIndex = -1;
    let filtered = [];

    function render(list) {
      filtered = list;
      hiIndex = -1;
      if (!list.length) {
        panel.innerHTML = `<div class="combo-empty">No matching products</div>`;
        panel.classList.add('open');
        return;
      }
      panel.innerHTML = list.slice(0, 50).map((p, i) => `
        <div class="combo-option" data-i="${i}">
          <img src="${driveThumb(p['Image'], 60) || ''}" onerror="this.style.visibility='hidden'">
          <div>
            <span class="code">${escapeHtml(p['Item Code'])}</span>
            &nbsp;|&nbsp; ${escapeHtml(p['Item Name'])}
          </div>
        </div>
      `).join('');
      panel.classList.add('open');
    }

    function filter(q) {
      q = q.trim().toLowerCase();
      if (!q) { render(products); return; }
      render(products.filter(p =>
        String(p['Item Code']).toLowerCase().includes(q) ||
        String(p['Item Name']).toLowerCase().includes(q)
      ));
    }

    input.addEventListener('focus', () => filter(input.value));
    input.addEventListener('input', () => filter(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { hiIndex = Math.min(hiIndex + 1, filtered.length - 1); highlight(); e.preventDefault(); }
      if (e.key === 'ArrowUp')   { hiIndex = Math.max(hiIndex - 1, 0); highlight(); e.preventDefault(); }
      if (e.key === 'Enter' && hiIndex >= 0) { pick(filtered[hiIndex]); e.preventDefault(); }
      if (e.key === 'Escape') panel.classList.remove('open');
    });
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) panel.classList.remove('open');
    });
    panel.addEventListener('click', (e) => {
      const opt = e.target.closest('.combo-option');
      if (opt) pick(filtered[Number(opt.dataset.i)]);
    });

    function highlight() {
      panel.querySelectorAll('.combo-option').forEach((el, i) => el.classList.toggle('hi', i === hiIndex));
      const hiEl = panel.querySelector('.combo-option.hi');
      if (hiEl) hiEl.scrollIntoView({ block: 'nearest' });
    }

    function pick(product) {
      input.value = `${product['Item Code']} | ${product['Item Name']}`;
      panel.classList.remove('open');
      onSelect(product);
    }

    return {
      reset() { input.value = ''; },
      setProducts(list) { products = list; }
    };
  }
};
