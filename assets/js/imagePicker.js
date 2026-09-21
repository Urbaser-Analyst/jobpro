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
      status.textContent = 'Compressing…';
      pickBtn.disabled = true;

      try {
        const compressedBlob = await compressImageFile(file, 1280, 0.8);
        status.textContent = 'Uploading… (' + Math.round(compressedBlob.size / 1024) + ' KB)';
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
 * JPEG before upload. Camera photos are often 3-8MB; this typically
 * brings them under ~300KB, which makes uploads faster, keeps Apps
 * Script's request size well within limits, and makes every later page
 * that displays these photos (Product Master, MRF's product browser)
 * load noticeably faster since there's just less data to fetch.
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
        resolve(blob); // a Blob with type image/jpeg
      }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not read image')); };
    img.src = objectUrl;
  });
}
