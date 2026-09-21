/**
 * imagePicker.js
 * -----------------------------------------------------------------------
 * Renders an image slot that lets the user pick from Camera or Gallery.
 *
 * IMPORTANT: selecting a photo does NOT touch Drive. It only compresses
 * the file and previews it locally. The actual upload only happens when
 * the caller explicitly calls picker.upload() — which the product form's
 * submit handler does, one slot at a time, in order, only after the
 * person clicks "Add product". This guarantees:
 *   - Nothing is written to Drive unless the form is actually submitted.
 *   - There's no race where clicking Submit mid-upload saves a product
 *     with a missing image — the submit handler awaits each upload
 *     before saving, so the button is doing the uploading itself.
 *   - Images always upload in slot order (1, then 2, then 3), never in
 *     parallel, since the submit handler awaits them sequentially.
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
    let compressedBlob = null;
    let uploadedUrl = '';

    pickBtn.addEventListener('click', () => input.click());

    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;

      uploadedUrl = ''; // a newly picked file invalidates any previous upload
      status.style.color = '';
      status.textContent = 'Preparing…';
      pickBtn.disabled = true;

      try {
        compressedBlob = await compressImageFile(file, 1280, 0.8);
        const localUrl = URL.createObjectURL(compressedBlob);
        preview.style.backgroundImage = `url(${localUrl})`;
        preview.removeAttribute('data-empty');
        preview.textContent = '';
        status.textContent = `Ready (${Math.round(compressedBlob.size / 1024)} KB) — uploads when you click Add product`;
      } catch (err) {
        status.textContent = 'Could not read this image: ' + err.message;
        status.style.color = '#F26A8D';
        compressedBlob = null;
      } finally {
        pickBtn.disabled = false;
      }
    });

    return {
      hasPendingFile: () => !!compressedBlob,
      getUrl: () => uploadedUrl,

      // Called by the form's submit handler, one slot at a time, in
      // order. Actually uploads to Drive and returns the resulting URL.
      async upload() {
        if (!compressedBlob) return '';
        if (uploadedUrl) return uploadedUrl; // already uploaded, don't re-upload

        status.style.color = '';
        status.textContent = 'Uploading…';
        try {
          const base64 = await blobToBase64(compressedBlob);
          const result = await apiCall('files.uploadImage', {
            base64: base64,
            mimeType: 'image/jpeg',
            slot: slot || 1,
            itemCode: itemCodeGetter ? itemCodeGetter() : 'unfiled'
          });
          uploadedUrl = result.url;
          status.textContent = 'Uploaded ✓';
          status.style.color = '#2E9E6D';
          return uploadedUrl;
        } catch (err) {
          status.textContent = 'Upload failed: ' + err.message;
          status.style.color = '#F26A8D';
          throw err;
        }
      },

      reset: () => {
        compressedBlob = null;
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

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Resizes an image file down to a max dimension and re-compresses it as
 * JPEG. Camera photos are often 3-8MB; this typically brings them under
 * ~300KB, which makes uploads faster, keeps Apps Script's request size
 * well within limits, and makes every later page that displays these
 * photos load noticeably faster since there's just less data to fetch.
 * This runs immediately on selection (cheap, local, no network) — only
 * the actual Drive upload is deferred to submit time.
 */
function compressImageFile(file, maxDimension, quality) {
  maxDimension = maxDimension || 1280;
  quality = quality || 0.8;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDimension) {
        height = Math.round(height * (maxDimension / width));
        width = maxDimension;
      } else if (height > maxDimension) {
        width = Math.round(width * (maxDimension / height));
        height = maxDimension;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob) { reject(new Error('Image compression failed')); return; }
        resolve(blob);
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not read image')); };
    img.src = objectUrl;
  });
}
