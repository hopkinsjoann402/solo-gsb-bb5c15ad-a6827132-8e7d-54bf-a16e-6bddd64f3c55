# 事故证据链编排器（Evidence Chain Orchestrator）

用「必须早于」约束编排事故证据：每次连线都会校验有向图，合法连线按拓扑层级自动重排为**可解释时间线**；若连线构成环，则**拒绝保存**并高亮完整冲突闭环。

技术栈：**React 18 + TypeScript + Vite**（前端） · **Express + better-sqlite3**（后端） · 单容器交付。

## 功能

- 证据卡片：创建 / 编辑 / 删除（标题、来源、发生时间、描述）
- 「必须早于」连线：拖拽卡片上的「⇢ 连线」到目标卡片，或点击连线按钮后再点击目标卡片
- 有向图校验：每次连线在服务端做环检测；成环时返回完整闭环（HTTP 409），前端将闭环中的卡片与已有连线标红、被否决的新边以红色虚线动画展示
- 拓扑分层时间线：合法连线后按 Kahn 最长路径分层自动重排为「层级 1 → 层级 N」的时间线列
- 可解释侧栏：每个层级列出卡片及其「需等待」的直接前置证据，并附完整约束清单
- 导入 / 导出 JSON 快照（导入时同样做环校验，含环快照整体拒绝，HTTP 422）
- 内置示例事故（2026-03 支付网关宕机），首次启动自动载入，也可随时一键重置

## 快速开始（Docker，单条命令）

```bash
docker compose up --build
```

然后访问 **http://localhost:8080**（数据持久化在命名卷 `evidence-data` 中）。

不使用 Compose 时：

```bash
docker build -t evidence-chain . && docker run -p 8080:8080 -v evidence-data:/data evidence-chain
```

## 本地开发

要求 Node.js ≥ 20。

```bash
npm install        # 安装全部 workspace 依赖
npm run dev        # 同时启动后端(8080)与前端 Vite(5173，代理 /api)
```

访问 http://localhost:5173 。

其他命令：

```bash
npm test           # 图算法单元测试（环检测 / 拓扑分层）
npm run build      # 构建前端静态文件 + 编译后端到 server/dist
npm start          # 生产模式启动（服务前端构建产物，端口 8080）
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | HTTP 服务端口 |
| `DB_PATH` | `./data/evidence.db`（容器内 `/data/evidence.db`） | SQLite 数据库文件路径 |
| `CLIENT_DIST` | `client/dist` | 前端构建产物目录 |

## API 摘要

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/state` | 全量状态：证据、连线、拓扑层级 |
| POST | `/api/evidence` | 新建证据卡片 |
| PUT | `/api/evidence/:id` | 编辑证据卡片 |
| DELETE | `/api/evidence/:id` | 删除卡片（级联删除相关连线） |
| POST | `/api/edges` | 新建「必须早于」连线；成环返回 `409 { message, cycle }` |
| DELETE | `/api/edges/:id` | 删除连线 |
| GET | `/api/export` | 导出 JSON 快照（附件下载） |
| POST | `/api/import` | 导入快照（整体替换）；含环返回 `422 { message, cycle }` |
| POST | `/api/seed` | 重置为内置示例数据 |

所有变更类接口均返回最新全量状态，前端直接替换本地状态。

## 快照格式

```json
{
  "app": "evidence-chain-orchestrator",
  "version": 1,
  "exportedAt": "2026-09-18T00:00:00.000Z",
  "evidence": [
    {
      "id": "uuid",
      "title": "发布支付服务 v2.3.1",
      "description": "…",
      "source": "CI/CD 流水线",
      "occurredAt": "2026-03-12T02:15",
      "createdAt": "…",
      "updatedAt": "…"
    }
  ],
  "edges": [{ "from": "前置证据id", "to": "后续证据id" }]
}
```

## 环检测与分层算法

- **连线校验**（`server/src/graph.ts`）：新增边 `A → B` 前，沿已有边从 `B` 出发 BFS 寻找回到 `A` 的路径；找到即构成环，返回闭环节点序列 `[A, B, …, A]` 供前端高亮。
- **拓扑分层**：Kahn 算法 + 最长路径分层，`level(n) = max(level(前置)) + 1`，保证每条边都严格从左指向右，层级即「最早可发生轮次」。
