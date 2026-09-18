# 事故证据链编排器（Evidence Chain Orchestrator）

用「必须早于」关系编排事故证据的 Web 应用：每次连线都会校验有向图，合法连线按拓扑层级自动重排为可解释时间线；会产生环的连线被拒绝保存，并高亮完整冲突闭环。

技术栈：**React + TypeScript（Vite） · Express · SQLite（better-sqlite3）**

## 快速开始（Docker，单条命令）

```bash
docker compose up --build
```

启动后访问 **http://localhost:8080**

- SQLite 数据文件持久化在命名卷 `evidence-data`（容器内 `/data`）。
- 首次启动且数据库为空时，会自动载入一组示例事故证据（支付服务宕机）。

也可以不用 Compose，直接构建运行：

```bash
docker build -t evidence-chain . && docker run -p 8080:8080 -v evidence-data:/data evidence-chain
```

## 本地开发

```bash
npm run setup          # 安装 server 与 client 依赖
npm run dev:server     # 终端 1：API 服务，http://localhost:8080
npm run dev:client     # 终端 2：前端热更新，http://localhost:5173（/api 已代理到 8080）
```

生产模式本地运行：

```bash
npm run build && npm start   # 构建前后端后，访问 http://localhost:8080
```

## 功能说明

| 功能 | 说明 |
| --- | --- |
| 证据卡片 | 新建 / 编辑 / 删除；含标题、发生时间、描述 |
| 绘制关系 | 点击卡片上的「⇢ 连线」，再点击目标卡片，即建立「A 必须早于 B」 |
| 环校验 | 服务端在保存前检测有向图：成环则返回 409 与完整闭环节点序列，前端以红色高亮闭环上的卡片与连线，并用虚线画出被拒绝的那条边 |
| 拓扑重排 | 每次变更后按 Kahn + 最长路径分层计算层级，卡片按层级分列（越靠右越晚），列内按发生时间排序 |
| 可解释时间线 | 层标题说明依赖关系（如「依赖第 N 层及之前」），悬停连线可查看「谁必须早于谁」 |
| 删除关系 | 点击任意连线选中后删除，时间线自动重排 |
| 导入 / 导出 | 导出为 JSON 快照；导入时做结构、引用完整性与无环校验，含环快照整体拒绝 |
| 示例数据 | 「载入示例」一键重置为内置事故时间线 |

## API 概览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/state` | 全部证据、关系与拓扑层级 |
| POST | `/api/evidence` | 新建证据 |
| PUT | `/api/evidence/:id` | 编辑证据 |
| DELETE | `/api/evidence/:id` | 删除证据（级联删除关系） |
| POST | `/api/edges` | 建立「必须早于」关系；成环返回 `409 { message, cycle }` |
| DELETE | `/api/edges/:id` | 删除关系 |
| GET | `/api/export` | 导出 JSON 快照 |
| POST | `/api/import` | 导入快照（覆盖式，含环拒绝） |
| POST | `/api/seed` | 重置为内置示例数据 |

## 目录结构

```
├── Dockerfile            # 多阶段构建：前端 Vite 构建 + 后端 tsc + 精简运行时
├── docker-compose.yml    # 单服务，映射 8080 端口，命名卷持久化 SQLite
├── server/               # Express + better-sqlite3 + 图算法（graph.ts）
│   └── src/{index,db,graph}.ts
└── client/               # React + Vite 前端
    └── src/{App.tsx,components/…}
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 服务监听端口 |
| `DATA_DIR` | `/data`（容器）/ `server/data`（本地） | SQLite 数据目录 |
