const bcrypt = require('bcryptjs')

const MemoryStore = {
  users: [
    { id: 1, username: 'admin', password: '$2a$10$8K1p/a0dL1.LPR9GLgr0R.1nIGvRj5J5Y3j8EYxG4pFO7p0G6c4y', name: '管理员', role: 'admin', enterprise: null },
    { id: 2, username: 'operator', password: '$2a$10$N9qo8uLOickgx2ZMRZoMye1sLPOcF4g4p.VYtTBQbqrR6G1LqlxSi', name: '运维人员', role: 'operator', enterprise: null },
    { id: 3, username: 'enterprise', password: '$2a$10$fVFE3aLneHnLA0vJULVdwu5sKb7p7T0x7lQDXu5cJPm0q3U7kqAe', name: '企业用户', role: 'enterprise', enterprise: '顺丰速运' }
  ],
  
  drones: [
    { id: 1, drone_id: 'DR001', drone_type: 1, belong_enterprise: '顺丰速运', battery_capacity: 5000, current_battery: 85, status: 0, bind_nest_id: 'NT001', longitude: 117.260, latitude: 31.780, create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 2, drone_id: 'DR002', drone_type: 1, belong_enterprise: '京东物流', battery_capacity: 6000, current_battery: 72, status: 1, bind_nest_id: 'NT002', longitude: 117.200, latitude: 31.750, create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 3, drone_id: 'DR003', drone_type: 2, belong_enterprise: '美团配送', battery_capacity: 4500, current_battery: 45, status: 2, bind_nest_id: 'NT003', longitude: 117.278, latitude: 31.768, create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 4, drone_id: 'DR004', drone_type: 2, belong_enterprise: '饿了么', battery_capacity: 4800, current_battery: 90, status: 0, bind_nest_id: null, longitude: 117.300, latitude: 31.800, create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 5, drone_id: 'DR005', drone_type: 3, belong_enterprise: '滴滴出行', battery_capacity: 5500, current_battery: 20, status: 2, bind_nest_id: 'NT007', longitude: 117.295, latitude: 31.758, create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 6, drone_id: 'DR006', drone_type: 3, belong_enterprise: '顺丰速运', battery_capacity: 5200, current_battery: 65, status: 0, bind_nest_id: null, longitude: 117.270, latitude: 31.790, create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 7, drone_id: 'DR007', drone_type: 1, belong_enterprise: '京东物流', battery_capacity: 5800, current_battery: 30, status: 0, bind_nest_id: 'NT004', longitude: 117.252, latitude: 31.795, create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 8, drone_id: 'DR008', drone_type: 2, belong_enterprise: '美团配送', battery_capacity: 4600, current_battery: 55, status: 1, bind_nest_id: null, longitude: 117.240, latitude: 31.770, create_time: new Date().toISOString(), update_time: new Date().toISOString() }
  ],
  
  nests: [
    { id: 1, nest_id: 'NT001', nest_name: '翡翠湖充电站A', location: '117.260,31.780', longitude: 117.260, latitude: 31.780, charge_power: 1500, max_drones: 5, current_charging: 0, status: 1, online_time: new Date().toISOString(), create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 2, nest_id: 'NT002', nest_name: '大学城充电站B', location: '117.245,31.792', longitude: 117.245, latitude: 31.792, charge_power: 1800, max_drones: 6, current_charging: 2, status: 2, online_time: new Date().toISOString(), create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 3, nest_id: 'NT003', nest_name: '经开区充电站C', location: '117.278,31.768', longitude: 117.278, latitude: 31.768, charge_power: 2000, max_drones: 5, current_charging: 1, status: 2, online_time: new Date().toISOString(), create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 4, nest_id: 'NT004', nest_name: '高新区充电站D', location: '117.252,31.795', longitude: 117.252, latitude: 31.795, charge_power: 1500, max_drones: 4, current_charging: 0, status: 1, online_time: new Date().toISOString(), create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 5, nest_id: 'NT005', nest_name: '政务区充电站E', location: '117.285,31.772', longitude: 117.285, latitude: 31.772, charge_power: 1800, max_drones: 5, current_charging: 0, status: 0, online_time: null, create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 6, nest_id: 'NT006', nest_name: '蜀山区充电站F', location: '117.238,31.785', longitude: 117.238, latitude: 31.785, charge_power: 2000, max_drones: 6, current_charging: 0, status: 1, online_time: new Date().toISOString(), create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 7, nest_id: 'NT007', nest_name: '包河区充电站G', location: '117.295,31.758', longitude: 117.295, latitude: 31.758, charge_power: 2000, max_drones: 5, current_charging: 1, status: 2, online_time: new Date().toISOString(), create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 8, nest_id: 'NT008', nest_name: '瑶海区充电站H', location: '117.225,31.802', longitude: 117.225, latitude: 31.802, charge_power: 1500, max_drones: 4, current_charging: 0, status: 3, online_time: new Date().toISOString(), create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 9, nest_id: 'NT009', nest_name: '庐阳区充电站I', location: '117.305,31.765', longitude: 117.305, latitude: 31.765, charge_power: 1800, max_drones: 5, current_charging: 0, status: 1, online_time: new Date().toISOString(), create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 10, nest_id: 'NT010', nest_name: '肥西县充电站J', location: '117.215,31.810', longitude: 117.215, latitude: 31.810, charge_power: 1500, max_drones: 4, current_charging: 0, status: 0, online_time: null, create_time: new Date().toISOString(), update_time: new Date().toISOString() }
  ],
  
  orders: [
    { id: 1, order_id: 'ORD001', drone_id: 'DR001', nest_id: 'NT001', enterprise: '顺丰速运', order_type: 1, status: 1, priority: 1, scheduled_time: null, start_time: null, end_time: null, create_time: new Date(Date.now() - 60 * 60 * 1000).toISOString(), update_time: new Date().toISOString() },
    { id: 2, order_id: 'ORD002', drone_id: 'DR003', nest_id: 'NT003', enterprise: '美团配送', order_type: 2, status: 2, priority: 2, scheduled_time: null, start_time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), end_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), create_time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), update_time: new Date().toISOString() },
    { id: 3, order_id: 'ORD003', drone_id: 'DR005', nest_id: 'NT007', enterprise: '滴滴出行', order_type: 3, status: 0, priority: 1, scheduled_time: null, start_time: null, end_time: null, create_time: new Date().toISOString(), update_time: new Date().toISOString() },
    { id: 4, order_id: 'ORD004', drone_id: 'DR002', nest_id: 'NT002', enterprise: '京东物流', order_type: 1, status: 2, priority: 1, scheduled_time: null, start_time: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), end_time: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), create_time: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), update_time: new Date().toISOString() },
    { id: 5, order_id: 'ORD005', drone_id: 'DR004', nest_id: 'NT004', enterprise: '饿了么', order_type: 2, status: 2, priority: 2, scheduled_time: null, start_time: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), end_time: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(), create_time: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), update_time: new Date().toISOString() },
    { id: 6, order_id: 'ORD006', drone_id: 'DR006', nest_id: 'NT006', enterprise: '顺丰速运', order_type: 3, status: 3, priority: 1, scheduled_time: null, start_time: null, end_time: null, create_time: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), update_time: new Date().toISOString() }
  ],
  
  chargingRecords: [
    { id: 1, record_id: 'CR001', drone_id: 'DR001', nest_id: 'NT001', start_battery: 30, end_battery: 75, charge_power: 1500, start_time: new Date(Date.now() - 45 * 60 * 1000).toISOString(), end_time: null, charge_duration: 45, status: 0, create_time: new Date().toISOString() },
    { id: 2, record_id: 'CR002', drone_id: 'DR003', nest_id: 'NT003', start_battery: 15, end_battery: 45, charge_power: 1800, start_time: new Date(Date.now() - 20 * 60 * 1000).toISOString(), end_time: null, charge_duration: 20, status: 0, create_time: new Date().toISOString() },
    { id: 3, record_id: 'CR003', drone_id: 'DR005', nest_id: 'NT007', start_battery: 5, end_battery: 20, charge_power: 2000, start_time: new Date(Date.now() - 10 * 60 * 1000).toISOString(), end_time: null, charge_duration: 10, status: 0, create_time: new Date().toISOString() },
    { id: 4, record_id: 'CR004', drone_id: 'DR004', nest_id: 'NT002', start_battery: 20, end_battery: 100, charge_power: 1800, start_time: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), end_time: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), charge_duration: 75, status: 1, create_time: new Date().toISOString() },
    { id: 5, record_id: 'CR005', drone_id: 'DR006', nest_id: 'NT005', start_battery: 15, end_battery: 100, charge_power: 1800, start_time: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), end_time: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), charge_duration: 80, status: 1, create_time: new Date().toISOString() }
  ],
  
  alerts: [
    { id: 1, alert_id: 'ALT001', type: 'error', level: 3, title: '机巢NT005充电异常', message: '机巢NT005充电功率异常下降，当前功率仅500W，请检查充电模块', source: 'NT005', related_id: 'NT005', is_read: 0, create_time: new Date(Date.now() - 5 * 60 * 1000).toISOString() },
    { id: 2, alert_id: 'ALT002', type: 'warning', level: 2, title: '无人机DR003电量过低', message: '无人机DR003当前电量仅15%，建议尽快安排充电', source: 'DR003', related_id: 'DR003', is_read: 0, create_time: new Date(Date.now() - 15 * 60 * 1000).toISOString() },
    { id: 3, alert_id: 'ALT003', type: 'error', level: 3, title: '机巢NT008离线', message: '机巢NT008已离线超过30分钟，请检查网络连接', source: 'NT008', related_id: 'NT008', is_read: 0, create_time: new Date(Date.now() - 35 * 60 * 1000).toISOString() },
    { id: 4, alert_id: 'ALT004', type: 'warning', level: 2, title: '充电排队过长', message: '当前有5架无人机等待充电，建议增加调度资源', source: 'system', related_id: null, is_read: 1, create_time: new Date(Date.now() - 60 * 60 * 1000).toISOString() },
    { id: 5, alert_id: 'ALT005', type: 'info', level: 1, title: '系统维护通知', message: '系统将于今晚22:00-23:00进行例行维护', source: 'system', related_id: null, is_read: 1, create_time: new Date(Date.now() - 120 * 60 * 1000).toISOString() },
    { id: 6, alert_id: 'ALT006', type: 'warning', level: 2, title: '机巢NT002温度过高', message: '机巢NT002内部温度达到45°C，已启动散热系统', source: 'NT002', related_id: 'NT002', is_read: 1, create_time: new Date(Date.now() - 180 * 60 * 1000).toISOString() }
  ],
  
  schedulingRecords: []
}

module.exports = MemoryStore
