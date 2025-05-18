/**
 * Cloudflare Worker: 图片处理工具（全站部署版）
 * 
 * 解析图集API已集成抖音/douyin.wtf方案。
 */

const STATIC_FILES = {
  "/": "imgsteak.html",
  "/imgsteak.html": "imgsteak.html",
  "/imgsteak.js": "imgsteak.js",
  "/bootstrap.min.css": "bootstrap.min.css",
  "/fontawesome.min.css": "fontawesome.min.css",
  "/fontawesome-all.min.js": "fontawesome-all.min.js"
};

const STATIC_CONTENT = {
  "imgsteak.html": `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>图片处理工具 Cloudflare</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="/bootstrap.min.css" rel="stylesheet">
  <link href="/fontawesome.min.css" rel="stylesheet">
  <style>
    .image-thumb {
      max-width: 100%;
      max-height: 120px;
      border-radius: 0.5rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      margin: 0 auto;
      display: block;
    }
    .img-card {
      position: relative;
      border: 1px solid #eee;
      border-radius: 0.5rem;
      padding: 0.5rem;
      background: #fff;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
    }
    .img-remove {
      position: absolute;
      right: 6px;
      top: 6px;
      background: #fff;
      border: none;
      border-radius: 50%;
      color: #dc3545;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0.8;
      transition: opacity 0.2s;
    }
    .img-remove:hover {
      opacity: 1;
      color: #fff;
      background: #dc3545;
    }
    #toastContainer { z-index: 2000; }
  </style>
</head>
<body class="bg-light">
  <div class="container py-4">
    <header class="mb-4 text-center">
      <h1 class="display-5 fw-bold text-primary">图片处理工具 (Cloudflare版)</h1>
      <p class="text-secondary">由 Cloudflare Worker 托管与处理</p>
    </header>

    <div class="card shadow mb-4">
      <div class="card-body">
        <label for="albumUrl" class="form-label">图集URL</label>
        <div class="input-group mb-3">
          <input type="url" id="albumUrl" class="form-control" placeholder="请输入图集URL">
          <button id="fetchBtn" class="btn btn-primary">解析</button>
        </div>
      </div>
    </div>

    <div class="card shadow mb-4">
      <div class="card-body">
        <div class="mb-3">
          <label class="form-label">上传图片</label>
          <input type="file" id="fileInput" accept="image/*" multiple class="form-control">
        </div>
        <div id="imageList" class="row g-3"></div>
        <button id="clearImagesBtn" class="btn btn-outline-danger mt-2" style="display:none;">清空图片</button>
      </div>
    </div>

    <div class="card shadow mb-4">
      <div class="card-body row g-3">
        <div class="col-md-4">
          <label class="form-label">叠加方式</label>
          <select id="blendMode" class="form-select">
            <option value="normal">正常</option>
            <option value="multiply">正片叠底</option>
          </select>
        </div>
        <div class="col-md-4 form-check form-switch">
          <input class="form-check-input" type="checkbox" id="removeBg">
          <label class="form-check-label" for="removeBg">去除背景</label>
        </div>
        <div class="col-md-4 form-check form-switch">
          <input class="form-check-input" type="checkbox" id="invertColors">
          <label class="form-check-label" for="invertColors">反转颜色</label>
        </div>
        <div id="bgOptions" class="col-12" style="display:none;">
          <label class="form-label">背景色</label>
          <input type="color" id="bgColor" value="#FFFFFF" class="form-control form-control-color" style="width:3rem;">
          <label class="form-label mt-2">容差 <span id="toleranceValue">30</span></label>
          <input type="range" id="tolerance" min="0" max="100" value="30" class="form-range">
        </div>
        <div class="col-12">
          <button id="processBtn" class="btn btn-success w-100">处理图片</button>
        </div>
      </div>
    </div>

    <div class="card shadow mb-4">
      <div class="card-body text-center">
        <canvas id="previewCanvas" class="border rounded shadow" style="max-width:100%; display:none;"></canvas>
        <div id="noPreview" class="text-secondary py-5">上传图片并处理后预览</div>
        <button id="downloadBtn" class="btn btn-primary mt-3" style="display:none;">下载处理后图片</button>
      </div>
    </div>
  </div>
  <div id="toastContainer" class="position-fixed bottom-0 end-0 p-3"></div>
  <script src="/imgsteak.js"></script>
</body>
</html>
`,
  "imgsteak.js": `const toastContainer = document.getElementById('toastContainer');
function showToast(msg, type='info') {
  const icon = type === 'success'
    ? 'fa-circle-check'
    : type === 'error'
      ? 'fa-circle-xmark'
      : 'fa-circle-info';
  const toast = document.createElement('div');
  toast.className = \`toast align-items-center show text-bg-\${type==='error'?'danger':type==='success'?'success':'secondary'}\`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = \`
    <div class="d-flex">
      <div class="toast-body"><i class="fa-solid \${icon} me-2"></i>\${msg}</div>
      <button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>\`;
  toastContainer.appendChild(toast);
  setTimeout(()=>toast.remove(), 3500);
}
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

let uploadedImages = []; // {file, url, width, height}
let processedBlob = null;

// 图集解析
document.getElementById('fetchBtn').onclick = async () => {
  const albumUrl = document.getElementById('albumUrl').value.trim();
  if (!albumUrl) return showToast('请输入图集URL','error');
  showToast('正在解析，请稍候...');
  try {
    const res = await fetch('/api/parse-album', {
      method: 'POST',
      body: JSON.stringify({url: albumUrl}),
      headers: {'Content-Type':'application/json'}
    });
    if (!res.ok) throw new Error('解析失败');
    const data = await res.json();
    if (!data.images || !data.images.length) throw new Error('未解析到图片');
    // 下载图片并加入上传队列
    for (const imgUrl of data.images) {
      const resp = await fetch(imgUrl);
      const blob = await resp.blob();
      const file = new File([blob], imgUrl.split('/').pop(), {type:blob.type});
      await addImageFile(file);
    }
    showToast('图集解析完成','success');
  } catch(e) {
    showToast('图集解析失败: '+String(e),'error');
  }
};

// 上传图片
document.getElementById('fileInput').addEventListener('change', async e => {
  for(const file of e.target.files) await addImageFile(file);
});
async function addImageFile(file) {
  return new Promise(resolve=>{
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      uploadedImages.push({file, url, width:img.width, height:img.height});
      renderImageList();
      resolve();
    };
    img.onerror = () => {
      showToast('图片加载失败','error');
      resolve();
    };
    img.src = url;
  });
}
function renderImageList() {
  const list = document.getElementById('imageList');
  list.innerHTML = '';
  if (!uploadedImages.length) {
    list.innerHTML = \`<div class="text-secondary text-center">未上传图片</div>\`;
    document.getElementById('clearImagesBtn').style.display = 'none';
    return;
  }
  document.getElementById('clearImagesBtn').style.display = '';
  uploadedImages.forEach((item, i) => {
    const col = document.createElement('div');
    col.className = 'col-6 col-sm-4 col-md-3';
    col.innerHTML = \`
      <div class="img-card">
        <img class="image-thumb" src="\${item.url}" title="\${item.file.name}">
        <button class="img-remove" data-idx="\${i}" title="移除图片"><i class="fa fa-times"></i></button>
        <div class="small mt-1">\${item.file.name}<br>\${formatFileSize(item.file.size)}<br>\${item.width}×\${item.height}</div>
      </div>\`;
    list.appendChild(col);
  });
  list.querySelectorAll('.img-remove').forEach(btn=>{
    btn.onclick = e=>{
      const idx = parseInt(btn.getAttribute('data-idx'));
      URL.revokeObjectURL(uploadedImages[idx].url);
      uploadedImages.splice(idx,1);
      renderImageList();
    };
  });
}

// 清空图片
document.getElementById('clearImagesBtn').onclick = () => {
  uploadedImages.forEach(item=>URL.revokeObjectURL(item.url));
  uploadedImages = []; renderImageList();
  document.getElementById('previewCanvas').style.display='none';
  document.getElementById('downloadBtn').style.display='none';
  document.getElementById('noPreview').style.display='';
  processedBlob = null;
  showToast('已清空所有图片','success');
};

// 去除背景选项
const removeBg = document.getElementById('removeBg');
removeBg.onchange = ()=> {
  document.getElementById('bgOptions').style.display = removeBg.checked?'':'none';
};
// 容差同步
document.getElementById('tolerance').oninput = e=>{
  document.getElementById('toleranceValue').textContent = e.target.value;
};

// 处理图片
document.getElementById('processBtn').onclick = async () => {
  if (!uploadedImages.length) return showToast('请先上传图片','error');
  const blendMode = document.getElementById('blendMode').value;
  const removeBgChecked = removeBg.checked;
  const bgColor = document.getElementById('bgColor').value;
  const tolerance = document.getElementById('tolerance').value;
  const invertColors = document.getElementById('invertColors').checked;

  const form = new FormData();
  form.append('blendMode', blendMode);
  form.append('removeBg', removeBgChecked?'1':'0');
  form.append('bgColor', bgColor);
  form.append('tolerance', tolerance);
  form.append('invertColors', invertColors?'1':'0');
  uploadedImages.forEach(img=>form.append('images', img.file, img.file.name));
  showToast('正在处理图片...');
  try {
    const res = await fetch('/api/process', {method:'POST', body:form});
    if (!res.ok) throw new Error('处理失败');
    const blob = await res.blob();
    processedBlob = blob;
    showOnCanvas(blob);
    document.getElementById('downloadBtn').style.display='';
    showToast('图片处理完成','success');
  } catch(e) {
    showToast('处理图片失败: '+e,'error');
  }
};
function showOnCanvas(blob) {
  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');
  const img = new window.Image();
  img.onload = function() {
    canvas.width = img.width; canvas.height = img.height;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0);
    canvas.style.display='';
    document.getElementById('noPreview').style.display='none';
  };
  img.src = URL.createObjectURL(blob);
}

// 下载
document.getElementById('downloadBtn').onclick = ()=>{
  if (!processedBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(processedBlob);
  a.download = 'processed.png';
  a.click();
  showToast('图片已下载','success');
};
`,

  // Bootstrap 5.3.3 (minified CSS)
  "bootstrap.min.css": `/* CDN内容太长，建议生产环境用CDN。这里只留链接指引 */
@import url('https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css');
`,
  // FontAwesome 6.5.0 (minified CSS)
  "fontawesome.min.css": `/* CDN内容太长，建议生产环境用CDN。这里只留链接指引 */
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css');
`,
  // FontAwesome script fallback（其实用不到，但可补全）
  "fontawesome-all.min.js": ""
};

const MIME_MAP = {
  ".html": "text/html;charset=UTF-8",
  ".js":   "application/javascript",
  ".css":  "text/css",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml"
};

function ext(path) {
  return path.slice(path.lastIndexOf('.')).toLowerCase();
}
function staticResp(path) {
  const file = STATIC_FILES[path] || STATIC_FILES["/"];
  let body = STATIC_CONTENT[file];
  if (!body) return new Response("Not found", { status: 404 });
  let type = MIME_MAP[ext(file)] || "application/octet-stream";
  return new Response(body, { headers: { "content-type": type, "cache-control":"public, max-age=86400" } });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // API 路径优先
    if (url.pathname.startsWith("/api/")) {
      // --------- 图集解析 API -----------
      if (url.pathname === "/api/parse-album" && request.method === "POST") {
        const { url: albumUrl } = await request.json();
        // 优先尝试 douyin.wtf 图集API
        try {
          const apiResp = await fetch(
            `https://douyin.wtf/api/hybrid/video_data?url=${encodeURIComponent(albumUrl)}`,
            { headers: { "Referer": "https://douyin.wtf/", "Origin": "https://douyin.wtf" } }
          );
          if (apiResp.ok) {
            const data = await apiResp.json();
            if (data.images && data.images.length > 0) {
              // 取 download_url_list[1]
              const images = data.images.map(el => el.download_url_list?.[1] || el.download_url_list?.[0]);
              return Response.json({ images });
            }
          }
        } catch (e) {
          // 如果API失败，则继续用html方式兜底
        }
        // Fallback: 普通网页图片提取
        try {
          const html = await fetch(albumUrl).then(r=>r.text());
          const images = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
            .map(m=>m[1])
            .filter(src => /\.(jpg|jpeg|png|gif|webp)$/i.test(src));
          return Response.json({ images });
        } catch(e) {
          return Response.json({ images: [] });
        }
      }

      // --------- 图片处理 API -----------
      if (url.pathname === "/api/process" && request.method === "POST") {
        const form = await request.formData();
        const blendMode = form.get('blendMode') || 'normal';
        const removeBg = form.get('removeBg') === '1';
        const bgColor = form.get('bgColor') || '#ffffff';
        const tolerance = parseInt(form.get('tolerance')) || 30;
        const invertColors = form.get('invertColors') === '1';
        const files = form.getAll('images');
        if (!files.length) return new Response('No images', {status:400});

        // 解码所有图片
        const bitmaps = [];
        for (const file of files) {
          try {
            const arr = new Uint8Array(await file.arrayBuffer());
            const bitmap = await createImageBitmap(new Blob([arr]));
            bitmaps.push(bitmap);
          } catch(e) {}
        }
        if (!bitmaps.length) return new Response('图片解码失败',{status:400});

        // 合成
        const w = bitmaps[0].width, h = bitmaps[0].height;
        const offscreen = new OffscreenCanvas(w, h);
        const ctx2d = offscreen.getContext('2d');
        ctx2d.clearRect(0,0,w,h);
        ctx2d.globalCompositeOperation = 'source-over';
        ctx2d.drawImage(bitmaps[0],0,0);

        for(let i=1; i<bitmaps.length; ++i) {
          ctx2d.globalCompositeOperation = blendMode;
          ctx2d.drawImage(bitmaps[i],0,0);
        }
        ctx2d.globalCompositeOperation = 'source-over';

        // 像素级处理
        if (removeBg || invertColors) {
          const imgData = ctx2d.getImageData(0,0,w,h);
          const data = imgData.data;
          const bgR = parseInt(bgColor.substr(1,2),16);
          const bgG = parseInt(bgColor.substr(3,2),16);
          const bgB = parseInt(bgColor.substr(5,2),16);
          for(let i=0; i<data.length; i+=4) {
            const r=data[i],g=data[i+1],b=data[i+2];
            // 去背景
            if (removeBg) {
              const diff = Math.sqrt(
                (r-bgR)*(r-bgR)+(g-bgG)*(g-bgG)+(b-bgB)*(b-bgB)
              );
              if (diff < tolerance) data[i+3]=0;
            }
            // 反色
            if (invertColors) {
              data[i]=255-r; data[i+1]=255-g; data[i+2]=255-b;
            }
          }
          ctx2d.putImageData(imgData,0,0);
        }
        // 输出PNG
        const blob = await offscreen.convertToBlob({type:'image/png'});
        return new Response(blob, {headers:{'content-type':'image/png'}});
      }
      return new Response("Not found", {status:404});
    }
    // 静态资源
    if (STATIC_FILES[url.pathname] || url.pathname === "/") {
      return staticResp(url.pathname);
    }
    // 404
    return new Response("Not found", { status: 404 });
  }
};
