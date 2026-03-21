# 无人机共享充电机巢管理系统

基于 **GAT（图注意力网络）+ KM（匈牙利算法）** 的智能调度系统，实现无人机与共享机巢的最优匹配。

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    前端 (Vue3 + Element Plus)                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 实时监控  │ │ 智能调度  │ │ 数据统计  │ │ 地图展示  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    后端 (Node.js + Express)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   API 服务层                          │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐     │  │
│  │  │ 无人机管理  │  │ 机巢管理    │  │ 订单管理    │     │  │
│  │  └────────────┘  └────────────┘  └────────────┘     │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │                   调度引擎 (Python)                  │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐     │  │
│  │  │ GAT网络    │  │ KM算法     │  │ 贪心算法    │     │  │
│  │  └────────────┘  └────────────┘  └────────────┘     │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 目录结构

```
FLY/
├── drone-nest-backend/          # Node.js 后端服务
│   ├── config/                 # 数据库配置
│   ├── controllers/            # 控制器
│   ├── routes/                 # 路由
│   ├── services/               # WebSocket服务
│   ├── store/                  # 内存数据存储
│   ├── scripts/                # 数据库初始化脚本
│   ├── server.js               # 服务器入口
│   └── package.json
│
├── drone-nest-management/      # Vue3 前端管理界面
│   ├── src/
│   │   ├── api/               # API模块
│   │   ├── store/             # Pinia状态管理
│   │   ├── views/             # 页面组件
│   │   └── ...
│   ├── package.json
│   └── vite.config.js
│
├── drone-scheduling-engine/     # Python 调度引擎
│   ├── algorithms/            # 核心算法
│   ├── models/                 # GAT模型
│   ├── simulation/             # 数据模拟
│   ├── training/               # 训练模块
│   └── main.py
│
├── docker-compose.yml          # Docker 部署配置
├── DEPLOY.md                   # 部署指南
└── README.md
```

## 核心算法

### 1. 优势函数 (Advantage Function)

优势函数 $A(i,j)$ 作为匹配决策的核心指标：

$$A(i,j) = \gamma^{\Delta t_{ij}} V(s'_{ij}) - V(s_i) + R(i, j)$$

### 2. KM算法 (Kuhn-Munkres)

基于优势函数构建二分图权重矩阵，使用匈牙利算法求解全局最优匹配。

### 3. GAT图注意力网络

用于预测机巢未来价值的深度学习模型。

## 快速开始

### 环境要求

- Python 3.9+
- Node.js 18+
- MySQL 8.0
- Docker & Docker Compose

### Docker 部署（推荐）

```bash
# 克隆仓库
git clone https://github.com/lubaiwen/FLY.git
cd FLY

# 配置环境变量
cp .env.example .env  # 编辑 .env 文件

# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps
```

### 手动部署

```bash
# 1. 启动后端
cd drone-nest-backend
npm install
npm run init-db  # 初始化数据库
npm start

# 2. 启动前端
cd ../drone-nest-management
npm install
npm run dev
```

### 访问地址

- 前端界面：http://localhost:80
- 后端API：http://localhost:3000/api
- 健康检查：http://localhost:3000/api/health

## 技术栈

### 后端
- Node.js 18+
- Express
- MySQL 8.0
- WebSocket
- JWT 认证

### 前端
- Vue 3
- Vite
- Pinia
- Element Plus
- ECharts
- 高德地图 API

### 调度引擎
- Python 3.9+
- PyTorch
- PyTorch Geometric
- FastAPI

## 功能模块

- **无人机管理**：无人机的增删改查、状态监控
- **机巢管理**：机巢信息、充电状态、在线管理
- **订单管理**：充电订单、计费、统计
- **充电监控**：实时充电进度、功率统计
- **智能调度**：基于GAT+KM算法的最优匹配
- **告警管理**：异常告警、状态提醒

## 开发计划

- [x] 基础架构搭建
- [x] 前后端API对接
- [x] 核心业务逻辑
- [x] Docker部署配置
- [x] GAT调度算法
- [ ] 模型训练优化
- [ ] 性能优化
- [ ] 单元测试

## 许可证

MIT License
