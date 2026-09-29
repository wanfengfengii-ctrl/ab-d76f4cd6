// 健康请求脚本：以退出码报告健康端点状态（供 compose verify 与镜像 healthcheck 使用）。
const PORT = process.env.PORT || '8080';
const HOST = process.env.HOST || '127.0.0.1';
const url = `http://${HOST}:${PORT}/healthz`;

const deadline = Date.now() + 15000;

async function attempt() {
  try {
    const res = await fetch(url);
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || data.status !== 'ok') throw new Error('bad payload');
    console.log(`健康请求通过：GET ${url} -> 200 ${JSON.stringify(data)}`);
    return true;
  } catch (err) {
    if (Date.now() >= deadline) {
      console.error(`健康请求失败：GET ${url} -> ${err.message}`);
      return false;
    }
    await new Promise((r) => setTimeout(r, 500));
    return attempt();
  }
}

const ok = await attempt();
process.exit(ok ? 0 : 1);
