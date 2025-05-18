/**
 * Cloudflare Worker: 图片处理工具（全站部署版）
 * 
 * 解析图集API已集成抖音/douyin.wtf方案。
 */

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
  return fetch(new URL(path, import.meta.url).href)
    .then(response => {
      if (!response.ok) throw new Error('Not found');
      return response;
    })
    .catch(() => new Response("Not found", { status: 404 }));
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
                (r-bgR)*(r-bgR)+(g-bgG)*(g-bgB)+(b-bgB)*(b-bgB)
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
    if (url.pathname === "/" || url.pathname.startsWith("/imgsteak.") || url.pathname.startsWith("/bootstrap.") || url.pathname.startsWith("/fontawesome.")) {
      return staticResp(url.pathname);
    }
    // 404
    return new Response("Not found", { status: 404 });
  }
};
