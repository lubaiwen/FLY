# 无人机共享充电机巢管理系统 - 部署指南

## 目录结构

```
FLY/
├── drone-nest-backend/      # 后端服务
├── drone-nest-management/   # 前端服务
├── drone-scheduling-engine/ # 调度引擎
├── docker-compose.yml       # Docker编排文件
└── .env                     # 环境变量配置
```

## 部署方式

### 方式一：Docker Compose 部署（推荐）

#### 1. 环境要求
- Docker 20.10+
- Docker Compose 2.0+
- 服务器内存至少 2GB

#### 2. 配置环境变量

编辑项目根目录的 `.env` 文件：

```env
NODE_ENV=production
DB_USER=drone_user
DB_PASSWORD=你的安全密码
JWT_SECRET=你的JWT密钥
```

#### 3. 一键部署

```bash
# 进入项目目录
cd FLY

# 构建并启动所有服务
docker-compose up -d --build

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

#### 4. 访问应用
- 前端地址: http://服务器IP
- 后端API: http://服务器IP:3000/api

---

### 方式二：传统部署

#### 1. 服务器环境准备

```bash
# 安装 Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 MySQL 8.0
sudo apt install mysql-server

# 安装 PM2（进程管理）
sudo npm install -g pm2

# 安装 Nginx
sudo apt install nginx
```

#### 2. 数据库配置

```bash
# 登录 MySQL
sudo mysql -u root -p

# 创建数据库和用户
CREATE DATABASE drone_nest_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'drone_user'@'localhost' IDENTIFIED BY '你的密码';
GRANT ALL PRIVILEGES ON drone_nest_system.* TO 'drone_user'@'localhost';
FLUSH PRIVILEGES;
```

#### 3. 后端部署

```bash
# 进入后端目录
cd drone-nest-backend

# 安装依赖
npm install --production

# 配置环境变量
cp .env.production .env
# 编辑 .env 文件，填入正确的数据库配置

# 初始化数据库
npm run init-db

# 使用 PM2 启动
pm2 start server.js --name drone-nest-backend

# 设置开机自启
pm2 startup
pm2 save
```

#### 4. 前端部署

```bash
# 进入前端目录
cd drone-nest-management

# 安装依赖
npm install

# 配置生产环境变量
# 编辑 .env.production，设置正确的API地址

# 构建
npm run build

# 将 dist 目录复制到 Nginx
sudo cp -r dist/* /var/www/html/
```

#### 5. Nginx 配置

```bash
# 创建 Nginx 配置
sudo nano /etc/nginx/sites-available/drone-nest

# 写入以下配置：
```

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/html;
    index index.html;

    # 前端静态文件
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}
```

```bash
# 启用配置
sudo ln -s /etc/nginx/sites-available/drone-nest /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重载 Nginx
sudo systemctl reload nginx
```

---

## 常用命令

### Docker 部署

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看日志
docker-compose logs -f backend
docker-compose logs -f frontend

# 进入容器
docker exec -it drone-nest-backend sh
```

### PM2 部署

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs drone-nest-backend

# 重启服务
pm2 restart drone-nest-backend

# 停止服务
pm2 stop drone-nest-backend
```

---

## 安全建议

1. **修改默认密码**: 更改数据库密码和JWT密钥
2. **配置防火墙**: 只开放必要端口（80, 443）
3. **启用HTTPS**: 使用 Let's Encrypt 免费证书
4. **定期备份**: 备份数据库数据

```bash
# 启用 HTTPS（使用 Let's Encrypt）
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## 故障排查

### 后端无法连接数据库
- 检查 MySQL 服务是否运行
- 验证数据库用户名密码
- 检查防火墙端口 3306

### 前端无法访问API
- 检查 Nginx 代理配置
- 验证后端服务是否运行
- 检查跨域配置

### WebSocket 连接失败
- 检查 Nginx WebSocket 代理配置
- 验证防火墙是否允许 WebSocket
