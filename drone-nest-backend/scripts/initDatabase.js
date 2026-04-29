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
      CREATE TABLE IF NOT EXISTS bookings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        booking_id VARCHAR(30) NOT NULL UNIQUE,
        drone_id VARCHAR(20) NOT NULL,
        nest_id VARCHAR(20) NOT NULL,
        enterprise VARCHAR(100),
        booking_type TINYINT DEFAULT 1 COMMENT '1:固定路线 2:周期性 3:临时性',
        scheduled_time DATETIME NOT NULL,
        estimated_duration INT DEFAULT 60,
        notes TEXT,
        status TINYINT DEFAULT 0 COMMENT '0:待确认 1:已确认 2:已完成 3:已取消',
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_booking_id (booking_id),
        INDEX idx_drone_id (drone_id),
        INDEX idx_nest_id (nest_id),
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
        record_id VARCHAR(30) NOT NULL UNIQUE,
        task_type VARCHAR(50),
        drone_ids JSON,
        assignments JSON,
        priority TINYINT DEFAULT 1,
        status VARCHAR(20) DEFAULT 'pending',
        wait_time INT,
        execution_time INT,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_record_id (record_id),
        INDEX idx_status (status),
        INDEX idx_create_time (create_time)
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
    const hashedPassword = await bcrypt.hash('123456', 10)
    
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
      ('NT001', '翡翠湖充电站A', '117.2272,31.8206', 117.2272, 31.8206, 1500, 5, 0, 1, NOW()),
      ('NT002', '大学城充电站B', '117.1689,31.8421', 117.1689, 31.8421, 1800, 6, 2, 2, NOW()),
      ('NT003', '经开区充电站C', '117.2701,31.8198', 117.2701, 31.8198, 2000, 5, 1, 2, NOW()),
      ('NT004', '高新区充电站D', '117.1523,31.8456', 117.1523, 31.8456, 1500, 4, 0, 1, NOW()),
      ('NT005', '政务区充电站E', '117.2198,31.8612', 117.2198, 31.8612, 1800, 5, 0, 1, NOW()),
      ('NT006', '滨湖新区充电站F', '117.3089,31.7312', 117.3089, 31.7312, 2000, 6, 0, 1, NOW()),
      ('NT007', '庐阳区充电站G', '117.2272,31.8612', 117.2272, 31.8612, 1500, 4, 0, 3, NOW()),
      ('NT008', '包河区充电站H', '117.3012,31.8198', 117.3012, 31.8198, 1800, 5, 0, 0, NOW()),
      ('NT009', '蜀山区充电站I', '117.1989,31.8523', 117.1989, 31.8523, 2000, 6, 0, 1, NOW()),
      ('NT010', '瑶海区充电站J', '117.3198,31.8612', 117.3198, 31.8612, 1500, 4, 0, 1, NOW())
    `)
    console.log('默认机巢数据初始化完成')
  }
  
  const [drones] = await connection.query('SELECT COUNT(*) as count FROM drones')
  if (drones[0].count === 0) {
    await connection.query(`
      INSERT INTO drones (drone_id, drone_type, belong_enterprise, battery_capacity, current_battery, status, bind_nest_id, longitude, latitude) VALUES
      ('DR001', 1, '顺丰速运', 5000, 85, 0, 'NT001', 117.2285, 31.8198),
      ('DR002', 1, '京东物流', 6000, 72, 1, 'NT002', 117.1712, 31.8435),
      ('DR003', 2, '美团配送', 4500, 45, 2, 'NT003', 117.2689, 31.8212),
      ('DR004', 2, '饿了么', 4800, 90, 0, NULL, 117.1545, 31.8468),
      ('DR005', 3, '顺丰速运', 5200, 30, 1, 'NT005', 117.2215, 31.8598),
      ('DR006', 1, '京东物流', 5500, 60, 0, 'NT006', 117.3102, 31.7325),
      ('DR007', 3, '美团配送', 4200, 95, 0, 'NT009', 117.2001, 31.8512),
      ('DR008', 2, '美团配送', 4600, 55, 1, NULL, 117.3185, 31.8625)
    `)
    console.log('默认无人机数据初始化完成')
  }

  const [orders] = await connection.query('SELECT COUNT(*) as count FROM orders')
  if (orders[0].count === 0) {
    await connection.query(`
      INSERT INTO orders (order_id, drone_id, nest_id, enterprise_id, order_type, status, priority, start_time, end_time, create_time, update_time) VALUES
      ('ORD001','DR001','NT001','顺丰速运',1,2,1, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR), NOW()),
      ('ORD002','DR002','NT002','京东物流',2,1,2, DATE_SUB(NOW(), INTERVAL 30 MINUTE), NULL, DATE_SUB(NOW(), INTERVAL 1 HOUR), NOW()),
      ('ORD003','DR003','NT003','美团配送',1,1,1, DATE_SUB(NOW(), INTERVAL 15 MINUTE), NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR), NOW()),
      ('ORD004','DR005','NT007','滴滴出行',3,1,3, DATE_SUB(NOW(), INTERVAL 10 MINUTE), NULL, DATE_SUB(NOW(), INTERVAL 4 HOUR), NOW()),
      ('ORD005','DR007','NT004','京东物流',1,2,1, DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 8 HOUR), NOW()),
      ('ORD006','DR006','NT006','顺丰速运',3,3,1, NULL, NULL, DATE_SUB(NOW(), INTERVAL 12 HOUR), NOW())
    `)
    console.log('默认订单数据初始化完成')
  }

  const [chargingRecords] = await connection.query('SELECT COUNT(*) as count FROM charging_records')
  if (chargingRecords[0].count === 0) {
    await connection.query(`
      INSERT INTO charging_records (record_id, drone_id, nest_id, start_battery, current_battery, end_battery, charge_power, start_time, end_time, charge_duration, status) VALUES
      ('CR001','DR001','NT001',30,75,NULL,1500, DATE_SUB(NOW(), INTERVAL 45 MINUTE), NULL, 45, 0),
      ('CR002','DR003','NT003',15,45,NULL,1800, DATE_SUB(NOW(), INTERVAL 20 MINUTE), NULL, 20, 0),
      ('CR003','DR005','NT007',5,20,NULL,2000, DATE_SUB(NOW(), INTERVAL 10 MINUTE), NULL, 10, 0),
      ('CR004','DR004','NT002',20,100,100,1800, DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), 75, 1),
      ('CR005','DR006','NT005',15,100,100,1800, DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 4 HOUR), 80, 1)
    `)
    console.log('默认充电记录数据初始化完成')
  }

  const [alerts] = await connection.query('SELECT COUNT(*) as count FROM alerts')
  if (alerts[0].count === 0) {
    await connection.query(`
      INSERT INTO alerts (alert_id, type, level, title, message, source, related_id, is_read, create_time) VALUES
      ('ALT001','error',3,'机巢NT005充电异常','机巢NT005充电功率异常下降，当前功率仅500W，请检查充电模块','NT005','NT005',0, DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
      ('ALT002','warning',2,'无人机DR003电量过低','无人机DR003当前电量仅15%，建议尽快安排充电','DR003','DR003',0, DATE_SUB(NOW(), INTERVAL 15 MINUTE)),
      ('ALT003','error',3,'机巢NT008离线','机巢NT008已离线超过30分钟，请检查网络连接','NT008','NT008',0, DATE_SUB(NOW(), INTERVAL 35 MINUTE)),
      ('ALT004','warning',2,'充电排队过长','当前有5架无人机等待充电，建议增加调度资源','system',NULL,1, DATE_SUB(NOW(), INTERVAL 1 HOUR)),
      ('ALT005','info',1,'系统维护通知','系统将于今晚22:00-23:00进行例行维护','system',NULL,1, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
      ('ALT006','warning',2,'机巢NT002温度过高','机巢NT002内部温度达到45°C，已启动散热系统','NT002','NT002',1, DATE_SUB(NOW(), INTERVAL 3 HOUR))
    `)
    console.log('默认告警数据初始化完成')
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
