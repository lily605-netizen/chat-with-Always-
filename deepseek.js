// Vercel Serverless Function
// 部署时这个文件要放在仓库根目录的 api 文件夹里，路径是 /api/deepseek.js
// Vercel 会自动把它变成一个后端接口：https://你的网址/api/deepseek
// 作用：接住前端的请求，代替前端去调用 DeepSeek 官方接口，
// 因为服务器和服务器之间互相请求不受浏览器的 CORS 限制，前端直连会被浏览器拦截，但这里不会。

export default async function handler(req, res) {
  // 允许你自己的前端跨域调用这个接口
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "只支持 POST 请求" } });
    return;
  }

  try {
    const { apiKey, model, messages, temperature, max_tokens } = req.body || {};

    if (!apiKey) {
      res.status(400).json({ error: { message: "缺少 API Key" } });
      return;
    }

    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "deepseek-chat",
        messages,
        temperature: temperature ?? 1,
        max_tokens: max_tokens || 800,
      }),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(500).json({ error: { message: "代理请求失败：" + e.message } });
  }
}
