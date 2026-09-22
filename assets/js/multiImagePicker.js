/**
 * multiImagePicker.js
 * -----------------------------------------------------------------------
 * Like imagePicker.js but for an unbounded list of photos (DC copies).
 * Selecting photos only compresses + previews them locally — nothing
 * uploads to Drive until the caller calls uploadAll(dcNumber), which the
 * Issue form's submit handler does, sequentially, only after "Confirm &
 * Submit" is clicked.
 * -----------------------------------------------------------------------
 */

const MultiImagePicker = {
  mount(container, { label }) {
    container.innerHTML = `
      <label>${escapeHtml(label)}</label>
      <div class="img-slot">
        <div class="flex gap-8" style="flex-wrap:wrap;" id="miThumbs"></div>
        <input type="file" accept="image/*" multiple class="img-slot-input" style="display:none;">
        <div class="flex gap-8" style="margin-top:8px;">
          <button type="button" class="btn btn-outline btn-sm mi-pick">+ Add photo(s)</button>
          <span class="muted mi-status" style="font-size:11.5px;"></span>
        </div>
      </div>
    `;
    const thumbs = container.querySelector('#miThumbs');
    const input = container.querySelector('.img-slot-input');
    const pickBtn = container.querySelector('.mi-pick');
    const status = container.querySelector('.mi-status');
    let items = []; // { blob, previewUrl, uploadedUrl }

    pickBtn.addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      pickBtn.disabled = true;
      status.textContent = 'Preparing…';
      for (const file of files) {
        try {
          const blob = await compressImageFile(file, 1280, 0.8);
          items.push({ blob: blob, previewUrl: URL.createObjectURL(blob), uploadedUrl: '' });
        } catch (err) {
          showToast('Could not read one of the photos: ' + err.message, 'error');
        }
      }
      input.value = '';
      status.textContent = '';
      pickBtn.disabled = false;
      render();
    });

    function render() {
      thumbs.innerHTML = items.map((it, i) => `
        <div style="position:relative;">
          <div class="img-slot-preview" style="width:70px; height:70px; background-image:url('${it.previewUrl}');"></div>
          <button type="button" class="mi-remove" data-i="${i}" style="position:absolute; top:-6px; right:-6px; width:20px; height:20px; border-radius:50%; background:#F26A8D; color:#fff; border:none; cursor:pointer; font-size:11px; line-height:1;">✕</button>
        </div>
      `).join('');
      thumbs.querySelectorAll('.mi-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          items.splice(Number(btn.dataset.i), 1);
          render();
        });
      });
    }

    return {
      hasFiles: () => items.length > 0,
      count: () => items.length,

      // Uploads every not-yet-uploaded photo, in order, one at a time.
      // Called by the form's submit handler after Confirm & Submit.
      async uploadAll(dcNumber) {
        const urls = [];
        for (let i = 0; i < items.length; i++) {
          status.textContent = `Uploading photo ${i + 1} of ${items.length}…`;
          if (!items[i].uploadedUrl) {
            const base64 = await blobToBase64(items[i].blob);
            const result = await apiCall('files.uploadDcPic', {
              base64: base64,
              mimeType: 'image/jpeg',
              dcNumber: dcNumber,
              index: i + 1
            });
            items[i].uploadedUrl = result.url;
          }
          urls.push(items[i].uploadedUrl);
        }
        status.textContent = urls.length ? `${urls.length} photo(s) uploaded ✓` : '';
        return urls;
      },

      reset: () => {
        items = [];
        input.value = '';
        status.textContent = '';
        render();
      }
    };
  }
};
