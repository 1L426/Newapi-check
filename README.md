# New-API Checkin

New-API 多账号自动签到工具，支持定时签到、Cloudflare 绕过、实时进度追踪。

## 功能特性

- **多账号管理** - 支持添加多个 New-API 站点账号，支持密码登录和 Session Token 两种方式
- **自动签到** - 基于 Cron 表达式的定时签到，支持随机延迟防检测
- **Cloudflare 绕过** - 双层策略：直接 API 签到 + Puppeteer 浏览器兜底（Stealth 模式）
- **实时进度** - 通过 SSE（Server-Sent Events）实时推送批量签到进度
- **数据看板** - 签到统计、余额汇总、14天趋势图、日历热力图
- **数据安全** - AES-256-GCM 加密存储账号密码和 Token
- **导入导出** - 支持 JSON 格式的数据备份与恢复
- **暗色模式** - 支持亮色/暗色主题切换
- **Frutiger Aero 设计** - 毛玻璃拟态 UI 风格

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + Vite + TailwindCSS |
| 后端 | Node.js + Express |
| 数据库 | SQLite (better-sqlite3) |
| 浏览器自动化 | Puppeteer + Stealth Plugin |
| 定时任务 | node-cron |
| 图表 | Recharts |

## 部署方式

### 方式一：Docker 部署（推荐）

#### 前置要求
- Docker
- Docker Compose

#### 步骤

1. 克隆仓库

```bash
git clone https://github.com/<your-username>/Newapi-check.git
cd Newapi-check
```

2. （可选）配置加密密钥

编辑 `docker-compose.yml`，取消 `ENCRYPT_KEY` 的注释并设置自定义密钥：

```yaml
environment:
  - ENCRYPT_KEY=your-custom-key-here
```

> 如果不设置，系统会自动生成密钥并存入数据库。

3. 构建并启动

```bash
docker-compose up -d --build
```

4. 访问面板

打开浏览器访问 `http://your-server-ip:3211`

#### Docker 常用命令

```bash
# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 更新版本
git pull
docker-compose up -d --build
```

#### 数据持久化

数据库文件存储在 `./data` 目录，通过 Docker Volume 挂载，容器重建不会丢失数据。

---

### 方式二：本地部署

#### 前置要求

- Node.js >= 18
- npm
- (可选) Chromium / Google Chrome（Puppeteer 浏览器签到需要）

#### Linux / macOS

1. 克隆仓库

```bash
git clone https://github.com/<your-username>/Newapi-check.git
cd Newapi-check
```

2. 安装依赖

```bash
npm install
```

3. 配置环境变量

```bash
cp .env.example .env
# 按需编辑 .env
```

`.env` 文件说明：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ENCRYPT_KEY` | AES 加密密钥，留空自动生成 | - |
| `PORT` | 后端端口 | `3211` |
| `NODE_ENV` | 运行环境 | `development` |

4. 构建前端

```bash
npm run build
```

5. 启动服务

```bash
# 生产模式（前端由后端静态托管）
NODE_ENV=production node server/index.js
```

6. 访问面板

打开浏览器访问 `http://localhost:3211`

**开发模式：**

```bash
# 同时启动前端 (3210) 和后端 (3211)
npm run dev
```

#### Windows

1. 克隆仓库

```powershell
git clone https://github.com/<your-username>/Newapi-check.git
cd Newapi-check
```

2. 安装依赖

```powershell
npm install
```

3. 配置环境变量

复制 `.env.example` 为 `.env` 并按需编辑。

4. 构建前端

```powershell
npm run build
```

5. 启动服务

使用提供的批处理脚本：

```powershell
# 启动（开发模式，同时启动前端和后端）
start.bat

# 停止
stop.bat
```

或手动启动生产模式：

```powershell
set NODE_ENV=production
node server/index.js
```

6. 访问面板

- 开发模式：`http://127.0.0.1:3210`
- 生产模式：`http://127.0.0.1:3211`

---

## 使用说明

1. **添加账号** - 在「账号管理」页面添加 New-API 站点账号，填写站点地址、用户名密码或 Session Token
2. **手动签到** - 点击账号卡片上的签到按钮，或使用「全部签到」批量执行
3. **定时签到** - 在「设置」页面配置 Cron 表达式，开启自动定时签到
4. **查看记录** - 在「签到记录」页面查看历史记录、日历视图和趋势图
5. **数据备份** - 在「设置」页面导出/导入数据

## 项目结构

```
├── server/                 # 后端代码
│   ├── index.js           # Express 入口
│   ├── db/                # 数据库初始化
│   ├── routes/            # API 路由
│   ├── services/          # 业务逻辑
│   └── utils/             # 工具函数
├── src/                    # 前端代码 (React)
│   ├── components/        # UI 组件
│   ├── contexts/          # React Context
│   ├── hooks/             # 自定义 Hooks
│   └── pages/             # 页面组件
├── docker-compose.yml      # Docker Compose 配置
├── Dockerfile              # Docker 构建文件
├── package.json            # 项目配置
├── vite.config.js          # Vite 构建配置
├── tailwind.config.js      # TailwindCSS 配置
└── index.html              # HTML 入口
```

## License

MIT
