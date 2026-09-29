# 变电站切换试验 · 指示灯序列复核

继保工程师在切换试验后复核采样到的指示灯序列：联合选择全程运行状态（允许**保持原状态**或**沿登记的有向边切换**），检查观测是否只能用“某一路灯卡在固定值”来解释，避免把本应不可能的切换过程误记为正常。

## 复核规则

- 录入 4～8 个运行状态、每状态 3～8 路二值灯态（0/1）、允许的有向状态切换关系、6～20 帧观测。
- 应用在本机联合选择全程状态：
  - 帧间仅允许保持原状态，或沿一条登记边切换；
  - 允许**零次故障**，或**一条灯路在连续至少两帧内卡为同一观测值**；
  - 故障窗外、以及其余灯路，必须与所选状态的灯态**精确吻合**。
- 多解择优顺序：无故障优先 → 故障窗最短 → 灯路登记顺序 → 起帧最早 → 状态序列（按登记顺序）字典序最小。
- 任何假设都无法解释时，报告**按帧顺序最早已无可达状态的观测位置**及该帧灯态。
- 草稿自动保存在浏览器 IndexedDB；任一编辑会立即撤销旧的复核报告。

## 本地开发

```bash
npm install
npm run dev      # 开发服务器
npm test         # 求解器单元测试
npm run build    # 类型检查 + 生产构建
npm run smoke    # 轨迹求解冒烟（不依赖浏览器）
```

## Docker

宿主机暴露端口由环境变量 `WEB_PORT` 配置（默认 8080）：

```bash
WEB_PORT=8080 docker compose up web -d
# 健康检查端点：http://localhost:8080/healthz → 200 ok
```

一次性验收服务 `verify` 会依次执行 **单元测试 → 生产构建 → 轨迹求解冒烟 → 对 web 的健康请求**，全部通过后自行以退出码 0 结束，任一步失败以非零退出码报告：

```bash
docker compose up --build verify
docker compose ps   # verify 为 Exited (0)
```

## 目录结构

```
src/
  solver/          纯 TypeScript 求解器（前向可达 + 反向可行 DP、故障窗枚举、择优）
  storage/         IndexedDB 草稿持久化
  components/      复核结果面板
  App.tsx          题面录入与复核触发
scripts/
  smoke.ts         三类关键轨迹的冒烟断言
  healthcheck.ts   一次性健康请求，按响应码决定退出码
Dockerfile         deps → builder（verify 镜像）→ nginx 静态运行时
docker-compose.yml web（WEB_PORT + /healthz 健康检查）与一次性 verify
```
