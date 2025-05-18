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
