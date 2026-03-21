const { pool } = require('../config/database')

const createTables = async () => {
  const connection = await pool.getConnection()
  
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS drone_nest_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    await connection.query(`USE drone_nest_system`)
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100),
        role ENUM('admin', 'operator', 'enterprise') DEFAULT 'operator',
        enterprise VARCHAR(100),
        phone VARCHAR(20),
        email VARCHAR(100),
        status TINYINT DEFAULT 1,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS drones (
        id INT PRIMARY KEY AUTO_INCREMENT,
        drone_id VARCHAR(20) NOT NULL UNIQUE,
        drone_type TINYINT DEFAULT 1 COMMENT '1:固定路线 2:周期性 3:临时',
        belong_enterprise VARCHAR(100),
        battery_capacity INT DEFAULT 5000,
        current_battery INT DEFAULT 100,
        max_flight_time INT DEFAULT 30,
        max_speed INT DEFAULT 50,
        status TINYINT DEFAULT 0 COMMENT '0:空闲 1:工作中 2:充电中 3:维护中',
        bind_nest_id VARCHAR(20),
        longitude DECIMAL(10, 6),
        latitude DECIMAL(10, 6),
        last_location VARCHAR(100),
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_drone_id (drone_id),
        INDEX idx_status (status),
        INDEX idx_enterprise (belong_enterprise)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS nests (
        id INT PRIMARY KEY AUTO_INCREMENT,
        nest_id VARCHAR(20) NOT NULL UNIQUE,
        nest_name VARCHAR(100),
        location VARCHAR(100),
        longitude DECIMAL(10, 6),
        latitude DECIMAL(10, 6),
        charge_power INT DEFAULT 1500,
        max_drones INT DEFAULT 5 COMMENT '机巢最大充电容量，默认5架(范围4-6)',
        current_charging INT DEFAULT 0 COMMENT '当前正在充电的无人机数量',
        status TINYINT DEFAULT 0 COMMENT '0:离线 1:空闲 2:占用 3:故障',
        online_time DATETIME,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_nest_id (nest_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT PRIMARY KEY AUTO_INCREMENT,
        order_id VARCHAR(30) NOT NULL UNIQUE,
        drone_id VARCHAR(20),
        nest_id VARCHAR(20),
        enterprise_id VARCHAR(100),
        order_type TINYINT DEFAULT 1,
        start_location VARCHAR(100),
        end_location VARCHAR(100),
        distance DECIMAL(10, 2),
        status TINYINT DEFAULT 0 COMMENT '0:待处理 1:进行中 2:已完成 3:已取消',
        priority TINYINT DEFAULT 1,
        scheduled_time DATETIME,
        start_time DATETIME,
        end_time DATETIME,
        charge_duration INT DEFAULT 0,
        fee DECIMAL(10, 2) DEFAULT 0,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_order_id (order_id),
        INDEX idx_drone_id (drone_id),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS charging_records (
        id INT PRIMARY KEY AUTO_INCREMENT,
        record_id VARCHAR(30) NOT NULL UNIQUE,
        drone_id VARCHAR(20) NOT NULL,
        nest_id VARCHAR(20) NOT NULL,
        start_battery INT,
        current_battery INT,
        end_battery INT,
        charge_power INT,
        start_time DATETIME,
        end_time DATETIME,
        charge_duration INT DEFAULT 0,
        status TINYINT DEFAULT 0 COMMENT '0:充电中 1:已完成 2:已中断',
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_drone_id (drone_id),
        INDEX idx_nest_id (nest_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        alert_id VARCHAR(30) NOT NULL UNIQUE,
        type VARCHAR(20) NOT NULL,
        level TINYINT DEFAULT 1 COMMENT '1:信息 2:警告 3:错误 4:严重',
        title VARCHAR(200),
        message TEXT,
        source VARCHAR(50),
        related_id VARCHAR(30),
        is_read TINYINT DEFAULT 0,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_type (type),
        INDEX idx_level (level),
        INDEX idx_is_read (is_read)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    
    await connection.query(`
      CREATE TABLE IF NOT EXISTS scheduling_records (
        id INT PRIMARY KEY AUTO_INCREMENT,
        schedule_id VARCHAR(30) NOT NULL UNIQUE,
        drone_id VARCHAR(20),
        nest_id VARCHAR(20),
        algorithm_type VARCHAR(50),
        action_type VARCHAR(50),
        reward DECIMAL(10, 4),
        state_data JSON,
        action_data JSON,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_drone_id (drone_id),
        INDEX idx_algorithm (algorithm_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    
    console.log('数据库表创建成功')
    
    await initDefaultData(connection)
    
  } finally {
    connection.release()
  }
}

async function initDefaultData(connection) {
  const [users] = await connection.query('SELECT COUNT(*) as count FROM users')
  if (users[0].count === 0) {
    const bcrypt = require('bcryptjs')
    const hashedPassword = await bcrypt.hash('admin123', 10)
    
    await connection.query(`
      INSERT INTO users (username, password, name, role, enterprise) VALUES
      ('admin', ?, '系统管理员', 'admin', NULL),
      ('operator', ?, '运维人员', 'operator', NULL),
      ('enterprise', ?, '企业用户', 'enterprise', '顺丰速运')
    `, [hashedPassword, hashedPassword, hashedPassword])
    
    console.log('默认用户数据初始化完成')
  }
  
  const [nests] = await connection.query('SELECT COUNT(*) as count FROM nests')
  if (nests[0].count === 0) {
    await connection.query(`
      INSERT INTO nests (nest_id, nest_name, location, longitude, latitude, charge_power, max_drones, current_charging, status, online_time) VALUES
      ('NT001', '翡翠湖充电站A', '117.260,31.780', 117.260, 31.780, 1500, 5, 0, 1, NOW()),
      ('NT002', '大学城充电站B', '117.245,31.792', 117.245, 31.792, 1800, 6, 2, 2, NOW()),
      ('NT003', '经开区充电站C', '117.278,31.768', 117.278, 31.768, 2000, 5, 1, 2, NOW()),
      ('NT004', '高新区充电站D', '117.252,31.795', 117.252, 31.795, 1500, 4, 0, 1, NOW()),
      ('NT005', '政务区充电站E', '117.285,31.772', 117.285, 31.772, 1800, 5, 0, 0, NULL),
      ('NT006', '蜀山区充电站F', '117.238,31.785', 117.238, 31.785, 2000, 6, 0, 1, NOW()),
      ('NT007', '包河区充电站G', '117.295,31.758', 117.295, 31.758, 2000, 5, 1, 2, NOW()),
      ('NT008', '瑶海区充电站H', '117.225,31.802', 117.225, 31.802, 1500, 4, 0, 3, NOW()),
      ('NT009', '庐阳区充电站I', '117.305,31.765', 117.305, 31.765, 1800, 5, 0, 1, NOW()),
      ('NT010', '肥西县充电站J', '117.215,31.810', 117.215, 31.810, 1500, 4, 0, 0, NULL)
    `)
    console.log('默认机巢数据初始化完成')
  }
  
  const [drones] = await connection.query('SELECT COUNT(*) as count FROM drones')
  if (drones[0].count === 0) {
    await connection.query(`
      INSERT INTO drones (drone_id, drone_type, belong_enterprise, battery_capacity, current_battery, status, bind_nest_id, longitude, latitude) VALUES
      ('DR001', 1, '顺丰速运', 5000, 85, 0, 'NT001', 117.260, 31.780),
      ('DR002', 1, '京东物流', 6000, 72, 1, 'NT002', 117.200, 31.750),
      ('DR003', 2, '美团配送', 4500, 45, 2, 'NT003', 117.278, 31.768),
      ('DR004', 2, '饿了么', 4800, 90, 0, NULL, 117.300, 31.800),
      ('DR005', 3, '滴滴出行', 5500, 20, 2, 'NT007', 117.295, 31.758),
      ('DR006', 3, '顺丰速运', 5200, 65, 0, NULL, 117.270, 31.790),
      ('DR007', 1, '京东物流', 5800, 30, 0, 'NT004', 117.252, 31.795),
      ('DR008', 2, '美团配送', 4600, 55, 1, NULL, 117.240, 31.770)
    `)
    console.log('默认无人机数据初始化完成')
  }
}

module.exports = { createTables }

createTables().then(() => {
  console.log('数据库初始化完成')
  process.exit(0)
}).catch(err => {
  console.error('数据库初始化失败:', err.message)
  process.exit(1)
})
