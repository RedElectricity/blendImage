document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('fileInput');
  const imageList = document.getElementById('imageList');
  const clearImagesBtn = document.getElementById('clearImagesBtn');
  const removeBgCheckbox = document.getElementById('removeBg');
  const bgColorInput = document.getElementById('bgColor');
  const processBtn = document.getElementById('processBtn');
  const blendModeSelect = document.getElementById('blendMode');
  const invertColorsCheckbox = document.getElementById('invertColors');
  const previewCanvas = document.getElementById('previewCanvas');
  const noPreview = document.getElementById('noPreview');
  const downloadBtn = document.getElementById('downloadBtn');
  const fetchBtn = document.getElementById('fetchBtn');
  const albumUrlInput = document.getElementById('albumUrl');
  const debugToggle = document.getElementById('debugToggle');
  const debugInfoSection = document.getElementById('debugInfoSection');

  fileInput.addEventListener('change', handleFileSelect);
  clearImagesBtn.addEventListener('click', clearImages);
  removeBgCheckbox.addEventListener('change', handleRemoveBgChange);
  processBtn.addEventListener('click', processImages);
  fetchBtn.addEventListener('click', fetchAlbumImages);
  debugToggle.addEventListener('change', toggleDebugInfo);

  function handleFileSelect(event) {
    const files = event.target.files;
    for (const file of files) {
      addImageFile(file);
    }
  }

  function clearImages() {
    imageList.innerHTML = '';
    clearImagesBtn.style.display = 'none';
  }

  function handleRemoveBgChange(event) {
    if (event.target.checked) {
      const images = imageList.querySelectorAll('img');
      if (images.length > 0) {
        const mostCommonBgColor = detectMostCommonBgColor(images[0]);
        bgColorInput.value = mostCommonBgColor;
      }
    }
  }

  function addImageFile(file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = document.createElement('img');
      img.src = event.target.result;
      img.classList.add('image-thumb');
      const imgCard = document.createElement('div');
      imgCard.classList.add('col-md-3', 'img-card');
      imgCard.appendChild(img);
      const removeBtn = document.createElement('button');
      removeBtn.classList.add('img-remove');
      removeBtn.innerHTML = '<i class="fas fa-times"></i>';
      removeBtn.addEventListener('click', () => {
        imgCard.remove();
        if (imageList.children.length === 0) {
          clearImagesBtn.style.display = 'none';
        }
      });
      imgCard.appendChild(removeBtn);
      imageList.appendChild(imgCard);
      clearImagesBtn.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }

  function detectMostCommonBgColor(image) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const colorCount = {};
    let maxCount = 0;
    let mostCommonColor = '#FFFFFF';

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const color = `rgb(${r},${g},${b})`;
      colorCount[color] = (colorCount[color] || 0) + 1;
      if (colorCount[color] > maxCount) {
        maxCount = colorCount[color];
        mostCommonColor = color;
      }
    }

    return mostCommonColor;
  }

  async function processImages() {
    const images = imageList.querySelectorAll('img');
    if (images.length === 0) return;

    const blendMode = blendModeSelect.value;
    const removeBg = removeBgCheckbox.checked;
    const bgColor = bgColorInput.value;
    const invertColors = invertColorsCheckbox.checked;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const firstImage = images[0];
    canvas.width = firstImage.naturalWidth;
    canvas.height = firstImage.naturalHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(firstImage, 0, 0);

    for (let i = 1; i < images.length; i++) {
      ctx.globalCompositeOperation = blendMode;
      ctx.drawImage(images[i], 0, 0);
    }
    ctx.globalCompositeOperation = 'source-over';

    if (removeBg || invertColors) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const bgR = parseInt(bgColor.substr(1, 2), 16);
      const bgG = parseInt(bgColor.substr(3, 2), 16);
      const bgB = parseInt(bgColor.substr(5, 2), 16);
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (removeBg) {
          const diff = Math.sqrt(
            (r - bgR) * (r - bgR) + (g - bgG) * (g - bgG) + (b - bgB) * (b - bgB)
          );
          if (diff < 30) data[i + 3] = 0;
        }
        if (invertColors) {
          data[i] = 255 - r;
          data[i + 1] = 255 - g;
          data[i + 2] = 255 - b;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }

    previewCanvas.width = canvas.width;
    previewCanvas.height = canvas.height;
    const previewCtx = previewCanvas.getContext('2d');
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.drawImage(canvas, 0, 0);

    noPreview.style.display = 'none';
    previewCanvas.style.display = 'block';
    downloadBtn.style.display = 'block';

    downloadBtn.addEventListener('click', () => {
      const link = document.createElement('a');
      link.href = previewCanvas.toDataURL('image/png');
      link.download = 'processed_image.png';
      link.click();
    });
  }

  async function fetchAlbumImages() {
    const albumUrl = albumUrlInput.value;
    if (!albumUrl) return;

    try {
      const response = await fetch('/api/parse-album', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: albumUrl })
      });
      const data = await response.json();
      const images = data.images;
      const debugInfo = data.debugInfo;

      imageList.innerHTML = '';
      for (const imageUrl of images) {
        const img = document.createElement('img');
        img.src = imageUrl;
        img.classList.add('image-thumb');
        const imgCard = document.createElement('div');
        imgCard.classList.add('col-md-3', 'img-card');
        imgCard.appendChild(img);
        const removeBtn = document.createElement('button');
        removeBtn.classList.add('img-remove');
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.addEventListener('click', () => {
          imgCard.remove();
          if (imageList.children.length === 0) {
            clearImagesBtn.style.display = 'none';
          }
        });
        imgCard.appendChild(removeBtn);
        imageList.appendChild(imgCard);
      }
      clearImagesBtn.style.display = 'block';

      if (debugToggle.checked) {
        displayDebugInfo(debugInfo);
      }
    } catch (error) {
      console.error('Error fetching album images:', error);
    }
  }

  function toggleDebugInfo(event) {
    if (event.target.checked) {
      debugInfoSection.style.display = 'block';
    } else {
      debugInfoSection.style.display = 'none';
    }
  }

  function displayDebugInfo(debugInfo) {
    debugInfoSection.innerHTML = `
      <h5>Debug Information</h5>
      <pre>${JSON.stringify(debugInfo, null, 2)}</pre>
    `;
  }
});
