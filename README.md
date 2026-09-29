# 变电站指示灯序列切换复核

变电站切换试验后，继保工程师在网页录入 **4~8 个运行状态**、每状态 **3~8 路二值灯态**、
允许的**有向状态切换关系**与 **6~20 帧观测**，点击「复核」查看逐帧状态与转移证据。

应用在本机**联合选择全程状态**：每帧可保持原状态（自环始终允许）或沿登记的有向边切换。
故障模型只允许：

- **零次故障**：所有帧、所有灯路与所在状态精确吻合；
- **一条灯路卡滞**：某一路灯在**连续至少两帧**内观测为同一固定值；故障窗内该路读数忽略
  （但窗内读数须恒定），故障窗外及其他灯路必须精确吻合。

## 裁决优先级（存在多解时）

1. 无故障解优先；
2. 故障窗最短优先；
3. 灯路按**登记顺序**靠前优先；
4. 故障起帧更早优先；
5. 全程状态序列按状态名字典序最小。

任何解释都不存在时，页面指出**按帧顺序最早已无可达状态的观测位置（第几帧）与该帧灯态**
——判定时联合考虑零故障与所有合法卡滞窗（窗口可跨越零故障死点之后再闭合）。

## 草稿持久化

所有录入自动保存于浏览器 **IndexedDB**；任一编辑立即撤销当前旧报告（需重新点击复核）。

## 本地开发

```bash
npm install
npm run dev       # 开发服务器
npm test          # 求解器单元测试（vitest）
npm run build     # tsc 类型检查 + vite 生产构建
npm run smoke     # 轨迹求解冒烟（正常/故障/不可解释，非零退出码表示失败）
npm start         # 托管 dist/ 的静态站点（PORT 环境变量，默认 8080）
npm run healthcheck  # 请求 /healthz，以退出码报告结果
```

## Docker 部署

```bash
cp .env.example .env   # 可修改 WEB_PORT
docker compose build
docker compose run --rm verify   # 一次性校验：测试 → 构建 → 求解冒烟 → 健康请求
docker compose up -d web          # 启动健康站点
```

- 宿主机访问端口由 `WEB_PORT`（默认 `8080`）配置，容器内固定监听 8080；
- 健康端点：`GET /healthz` → `200 {"status":"ok"}`；
- `verify` 为一次性服务：依次执行代码测试、生产构建、轨迹求解冒烟、对 `web` 发起健康请求，
  全部成功后自行退出并以退出码 0 报告；任一步失败以非零码报告（`restart: "no"`）。

## 目录结构

```
src/
  solver/          # 纯 TypeScript 求解核心（无浏览器依赖，含单元测试）
    types.ts       # 领域模型
    solver.ts      # 假设枚举 + 前向/反向可达 + 字典序贪心 + 死帧联合判定
    validation.ts  # 录入范围与完整性校验
    defaults.ts    # 内置示例
  components/      # React 编辑器与复核报告
  db.ts            # IndexedDB 草稿
server.mjs         # 静态站点 + /healthz
scripts/smoke.ts   # 轨迹求解冒烟
scripts/healthcheck.mjs
Dockerfile         # deps / builder（verify 用） / runner 多阶段
docker-compose.yml # web + 一次性 verify
```
