export function formatDateTime(date, format = 'YYYY-MM-DD HH:mm:ss') {
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds)
}

export function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0分钟'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) {
    return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`
  }
  return `${mins}分钟`
}

export function formatMoney(amount) {
  if (amount === null || amount === undefined) return '¥0.00'
  return `¥${Number(amount).toFixed(2)}`
}

export function getDroneTypeText(type) {
  const types = {
    1: '固定路线',
    2: '周期性',
    3: '临时性'
  }
  return types[type] || '未知'
}

export function getDroneStatusText(status) {
  const statuses = {
    0: '待机',
    1: '飞行中',
    2: '充电中'
  }
  return statuses[status] || '未知'
}

export function getNestStatusText(status) {
  const statuses = {
    0: '离线',
    1: '空闲',
    2: '占用',
    3: '故障'
  }
  return statuses[status] || '未知'
}

export function getOrderStatusText(status) {
  const statuses = {
    0: '待支付',
    1: '充电中',
    2: '已完成',
    3: '已取消'
  }
  return statuses[status] || '未知'
}

export function getAlertTypeText(type) {
  const types = {
    fault: '故障',
    warning: '警告',
    info: '信息',
    success: '成功'
  }
  return types[type] || '未知'
}

export function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c * 1000
}

export function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

export function throttle(func, limit) {
  let inThrottle
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => inThrottle = false, limit)
    }
  }
}

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

export function downloadFile(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export function getBatteryColor(level) {
  if (level <= 20) return '#ff5252'
  if (level <= 50) return '#ffab00'
  return '#00e676'
}

export function getBatteryIcon(level) {
  if (level <= 20) return 'el-icon-warning'
  return 'el-icon-battery'
}
