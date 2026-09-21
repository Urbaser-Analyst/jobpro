/**
 * imagePicker.js
 * -----------------------------------------------------------------------
 * Renders an image slot that lets the user pick from Camera or Gallery
 * (native OS picker via <input type=file accept="image/*">), previews it,
 * uploads it to Drive through files.uploadImage, and exposes the
 * resulting Drive URL via getUrl().
 * -----------------------------------------------------------------------
 */

const ImagePicker = {
  mount(container, { label, slot, itemCodeGetter }) {
    container.innerHTML = `
      <label>${escapeHtml(label)}</label>
      <div class="img-slot">
        <div class="img-slot-preview" data-empty="1">No image</div>
        <input type="file" accept="image/*" class="img-slot-input" style="display:none;">
        <div class="flex gap-8" style="margin-top:6px;">
          <button type="button" class="btn btn-outline btn-sm img-slot-pick">Choose photo</button>
          <span class="muted img-slot-status" style="font-size:11.5px;"></span>
        </div>
      </div>
    `;
    const preview = container.querySelector('.img-slot-preview');
    const input = container.querySelector('.img-slot-input');
    const pickBtn = container.querySelector('.img-slot-pick');
    const status = container.querySelector('.img-slot-status');
    let uploadedUrl = '';

    pickBtn.addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;

      // Local preview immediately
      const localUrl = URL.createObjectURL(file);
      preview.style.backgroundImage = `url(${localUrl})`;
      preview.removeAttribute('data-empty');
      preview.textContent = '';
      status.textContent = 'Uploading…';
      pickBtn.disabled = true;

      try {
        const base64 = await fileToBase64(file);
        const result = await apiCall('files.uploadImage', {
          base64: base64,
          mimeType: file.type || 'image/jpeg',
          slot: slot || 1,
          itemCode: itemCodeGetter ? itemCodeGetter() : 'unfiled'
        });
        uploadedUrl = result.url;
        status.textContent = 'Uploaded ✓';
        status.style.color = '#2E9E6D';
      } catch (err) {
        status.textContent = 'Upload failed: ' + err.message;
        status.style.color = '#F26A8D';
        uploadedUrl = '';
      } finally {
        pickBtn.disabled = false;
      }
    });

    return {
      getUrl: () => uploadedUrl,
      reset: () => {
        uploadedUrl = '';
        input.value = '';
        preview.style.backgroundImage = '';
        preview.setAttribute('data-empty', '1');
        preview.textContent = 'No image';
        status.textContent = '';
      }
    };
  }
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
