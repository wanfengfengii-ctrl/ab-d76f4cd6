/**
 * 一次性健康请求：verify 服务在求解冒烟后调用，确认 web 服务可服务页面。
 * 非 2xx 响应或网络错误均以非零退出码报告。
 */
const url = process.env.HEALTH_URL ?? 'http://localhost/healthz';

try {
  const res = await fetch(url, { redirect: 'manual' });
  const body = await res.text();
  if (res.status >= 200 && res.status < 300) {
    console.log(`  ✓ 健康请求 ${url} → ${res.status}（${body.trim().slice(0, 32)}）`);
  } else {
    console.error(`  ✗ 健康请求 ${url} → ${res.status}`);
    process.exit(1);
  }
} catch (e) {
  console.error(`  ✗ 健康请求 ${url} 失败：${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
