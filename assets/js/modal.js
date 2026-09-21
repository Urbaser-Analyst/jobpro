/**
 * modal.js — minimal reusable overlay modal.
 * Modal.open(innerHtml) shows it; clicking the overlay, the close button,
 * or pressing Escape closes it.
 */
const Modal = {
  open(innerHtml) {
    this.close(); // ensure only one at a time
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'activeModalOverlay';
    overlay.innerHTML = `<div class="modal-card">${innerHtml}</div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });
    document.addEventListener('keydown', this._escHandler = (e) => { if (e.key === 'Escape') this.close(); });
    document.body.appendChild(overlay);
    const closeBtn = overlay.querySelector('.modal-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
  },
  close() {
    const existing = document.getElementById('activeModalOverlay');
    if (existing) existing.remove();
    if (this._escHandler) document.removeEventListener('keydown', this._escHandler);
  }
};
