/**
 * 高德地图 JSAPI v2.0 工具模块
 * 基于 @amap/amap-jsapi-loader 规范实现
 */

// 地图配置
export const AMAP_CONFIG = {
  key: import.meta.env.VITE_AMAP_KEY || '',
  securityJsCode: import.meta.env.VITE_AMAP_SECURITY_CODE || '',
  version: '2.0',
  plugins: [
    'AMap.Scale',
    'AMap.ToolBar',
    'AMap.ControlBar',
    'AMap.Geolocation',
    'AMap.PlaceSearch',
    'AMap.Geocoder',
    'AMap.DistrictSearch',
    'AMap.MoveAnimation'
  ]
}

// 默认中心点（合肥）
export const MAP_CENTER = [117.2272, 31.8206]

// 状态颜色配置
export const MARKER_COLORS = {
  idle: '#00e676',
  flying: '#00d4ff',
  charging: '#ffab00',
  offline: '#607d8b',
  fault: '#ff5252',
  available: '#00e676',
  occupied: '#ff9800'
}

// 无人机状态配置
export const DRONE_STATUS_CONFIG = {
  0: { color: '#00e676', bgColor: 'rgba(0, 230, 118, 0.15)', label: '空闲', icon: 'idle' },
  1: { color: '#00d4ff', bgColor: 'rgba(0, 212, 255, 0.15)', label: '飞行中', icon: 'flying' },
  2: { color: '#ffab00', bgColor: 'rgba(255, 171, 0, 0.15)', label: '充电中', icon: 'charging' },
  3: { color: '#ff5252', bgColor: 'rgba(255, 82, 82, 0.15)', label: '故障', icon: 'fault' }
}

// 机巢状态配置
export const NEST_STATUS_CONFIG = {
  0: { color: '#78909c', bgColor: 'rgba(120, 144, 156, 0.15)', label: '离线' },
  1: { color: '#00e676', bgColor: 'rgba(0, 230, 118, 0.15)', label: '可用' },
  2: { color: '#ff9800', bgColor: 'rgba(255, 152, 0, 0.15)', label: '占用' },
  3: { color: '#f44336', bgColor: 'rgba(244, 67, 54, 0.15)', label: '故障' }
}

/**
 * 加载高德地图 JSAPI
 * 使用 AMapLoader 规范方式加载
 */
export function loadAmap() {
  if (window.AMap) return Promise.resolve(window.AMap)

  if (!AMAP_CONFIG.key || !AMAP_CONFIG.securityJsCode) {
    return Promise.reject(new Error('缺少高德地图环境变量 VITE_AMAP_KEY 或 VITE_AMAP_SECURITY_CODE'))
  }

  // 设置安全密钥（v2.0 必须）
  window._AMapSecurityConfig = {
    securityJsCode: AMAP_CONFIG.securityJsCode
    // 生产环境建议使用代理：
    // serviceHost: 'https://your-proxy-domain/_AMapService'
  }

  return new Promise((resolve, reject) => {
    // 检查是否已有 loader
    if (window.AMapLoader) {
      window.AMapLoader.load({
        key: AMAP_CONFIG.key,
        version: AMAP_CONFIG.version,
        plugins: AMAP_CONFIG.plugins
      }).then(AMap => {
        // 埋点：设置应用标识
        AMap.getConfig().appname = 'drone-nest-management'
        resolve(AMap)
      }).catch(reject)
      return
    }

    // 动态加载 loader.js
    const script = document.createElement('script')
    script.src = 'https://webapi.amap.com/loader.js'
    script.onload = () => {
      if (!window.AMapLoader) {
        reject(new Error('AMapLoader 加载失败'))
        return
      }
      window.AMapLoader.load({
        key: AMAP_CONFIG.key,
        version: AMAP_CONFIG.version,
        plugins: AMAP_CONFIG.plugins
      }).then(AMap => {
        // 埋点：设置应用标识
        AMap.getConfig().appname = 'drone-nest-management'
        resolve(AMap)
      }).catch(reject)
    }
    script.onerror = () => reject(new Error('高德地图 Loader 加载失败'))
    document.head.appendChild(script)
  })
}

/**
 * 创建地图实例
 */
export function createMap(container, options = {}) {
  const defaultOptions = {
    zoom: 13,
    center: MAP_CENTER,
    mapStyle: 'amap://styles/dark',
    viewMode: '3D',
    pitch: 45,
    rotation: 0,
    resizeEnable: true,
    showBuildingBlock: true,
    showIndoorMap: false,
    skyColor: '#1a1a2e',
    features: ['bg', 'road', 'building', 'point']
  }

  return new AMap.Map(container, { ...defaultOptions, ...options })
}

/**
 * 创建比例尺控件
 */
export function createScaleControl() {
  return new AMap.Scale({
    position: {
      bottom: '20px',
      left: '20px'
    }
  })
}

/**
 * 创建工具条控件
 */
export function createToolBarControl() {
  return new AMap.ToolBar({
    position: {
      top: '120px',
      right: '40px'
    },
    liteStyle: true
  })
}

/**
 * 创建控制罗盘控件
 */
export function createControlBarControl() {
  return new AMap.ControlBar({
    position: {
      top: '10px',
      right: '10px'
    },
    showZoomBar: false,
    showControlButton: true,
    liteStyle: true
  })
}

/**
 * 创建无人机标记 SVG 图标
 * 只返回纯SVG，不包含任何CSS容器或3D变换，确保AMap能正常追踪marker位置
 * @param {Object} drone - 无人机数据
 * @param {number} scale - 缩放比例
 * @param {number} pitch - 地图倾斜角度（保留参数，由AMap 3D引擎原生处理透视）
 * @returns {string} SVG HTML
 */
export function createDroneIcon(drone, scale = 1, pitch = 0) {
  const status = drone.signal?.connected ? drone.status : -1
  const battery = drone.battery?.current || 0
  const heading = drone.velocity?.heading || 0

  let color, bgColor, borderColor, glowColor
  if (status === -1) {
    color = '#607d8b'
    bgColor = 'rgba(96, 125, 139, 0.2)'
    borderColor = '#607d8b'
    glowColor = 'rgba(96, 125, 139, 0.35)'
  } else if (battery < 20) {
    color = '#ff5252'
    bgColor = 'rgba(255, 82, 82, 0.25)'
    borderColor = '#ff5252'
    glowColor = 'rgba(255, 82, 82, 0.4)'
  } else {
    const config = DRONE_STATUS_CONFIG[status] || DRONE_STATUS_CONFIG[0]
    color = config.color
    bgColor = config.bgColor
    borderColor = config.color
    glowColor = `${color}66`
  }

  const size = 36 * scale

  return `<svg width="${size}" height="${size}" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" style="display:block; filter:drop-shadow(0 0 6px ${glowColor});">
    <circle cx="18" cy="18" r="17" fill="none" stroke="${color}" stroke-width="1" opacity="0.3">
      <animate attributeName="r" values="15;18;15" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="18" cy="18" r="14" fill="${bgColor}" stroke="${borderColor}" stroke-width="2"/>
    <g transform="rotate(${heading}, 18, 18)">
      <path d="M18 8 L14 26 L18 23 L22 26 Z" fill="${color}" stroke="${color}" stroke-width="0.5"/>
      <circle cx="18" cy="12" r="2" fill="${color}"/>
    </g>
    ${battery < 30 ? `<rect x="12" y="30" width="12" height="4" rx="2" fill="rgba(0,0,0,0.5)"/><rect x="12" y="30" width="${12 * battery / 100}" height="4" rx="2" fill="${battery < 20 ? '#ff5252' : '#ffab00'}"/>` : ''}
  </svg>`
}

/**
 * 创建机巢标记 SVG 图标
 * 只返回纯SVG，不包含任何CSS容器或3D变换，确保AMap能正常追踪marker位置
 * @param {Object} nest - 机巢数据
 * @param {number} scale - 缩放比例
 * @param {number} pitch - 地图倾斜角度（保留参数，由AMap 3D引擎原生处理透视）
 * @returns {string} SVG HTML
 */
export function createNestIcon(nest, scale = 1, pitch = 0) {
  const config = NEST_STATUS_CONFIG[nest.status] || NEST_STATUS_CONFIG[0]
  const size = 40 * scale
  const availableSlots = nest.available_slots || 0

  // 根据状态选择不同的图案
  let pattern = ''
  if (nest.status === 0) {
    pattern = `<pattern id="offline-${nest.nest_id}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="${config.color}" stroke-width="1" opacity="0.3"/></pattern>`
  } else if (nest.status === 2) {
    pattern = `<pattern id="occupied-${nest.nest_id}" patternUnits="userSpaceOnUse" width="6" height="6"><line x1="0" y1="3" x2="6" y2="3" stroke="${config.color}" stroke-width="1" opacity="0.3"/></pattern>`
  } else if (nest.status === 3) {
    pattern = `<pattern id="fault-${nest.nest_id}" patternUnits="userSpaceOnUse" width="8" height="8"><line x1="0" y1="0" x2="8" y2="8" stroke="${config.color}" stroke-width="1" opacity="0.3"/><line x1="8" y1="0" x2="0" y2="8" stroke="${config.color}" stroke-width="1" opacity="0.3"/></pattern>`
  }

  const glowColor = `${config.color}66`

  return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style="display:block; filter:drop-shadow(0 0 6px ${glowColor});">
    <defs>${pattern}</defs>
    <rect x="4" y="4" width="32" height="32" rx="6" fill="${config.bgColor}" stroke="${config.color}" stroke-width="2"/>
    ${nest.status !== 1 ? `<rect x="4" y="4" width="32" height="32" rx="6" fill="url(#${nest.status === 0 ? 'offline' : nest.status === 2 ? 'occupied' : 'fault'}-${nest.nest_id})"/>` : ''}
    <path d="M20 10 L12 18 L12 28 L28 28 L28 18 Z" fill="none" stroke="${config.color}" stroke-width="2" stroke-linejoin="round"/>
    <rect x="16" y="22" width="8" height="6" fill="${config.color}" opacity="0.5"/>
    ${nest.status === 1 ? `<path d="M22 14 L18 20 L21 20 L19 26" fill="none" stroke="${config.color}" stroke-width="1.5" stroke-linecap="round"/>` : ''}
    ${nest.status === 3 ? `<circle cx="32" cy="8" r="6" fill="#f44336"/><text x="32" y="11" text-anchor="middle" fill="white" font-size="8" font-weight="bold">!</text>` : ''}
    ${nest.status === 1 && availableSlots > 0 ? `<circle cx="32" cy="8" r="6" fill="#00e676"/><text x="32" y="11" text-anchor="middle" fill="#0a1628" font-size="8" font-weight="bold">${availableSlots}</text>` : ''}
  </svg>`
}

/**
 * 创建信息窗口内容（深色毛玻璃风格）
 * @param {Object} data - 数据对象
 * @param {string} type - 类型 'drone' | 'nest'
 * @returns {string} HTML 内容
 */
export function createInfoWindowContent(data, type) {
  if (type === 'drone') {
    const statusConfig = DRONE_STATUS_CONFIG[data.status] || DRONE_STATUS_CONFIG[0]
    const battery = data.battery?.current || 0
    const batteryColor = battery < 20 ? '#ff5252' : battery < 50 ? '#ffab00' : '#00e676'

    return `
      <div style="
        padding: 16px;
        min-width: 250px;
        font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
        background: rgba(13, 18, 32, 0.88);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(0, 212, 255, 0.08);
        color: #f0f4f8;
      ">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px;">
          <div style="width: 40px; height: 40px; background: ${statusConfig.bgColor}; border: 2px solid ${statusConfig.color}; border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 12px ${statusConfig.color}33;">
            <svg width="20" height="20" viewBox="0 0 36 36">
              <path d="M18 8 L14 26 L18 23 L22 26 Z" fill="${statusConfig.color}"/>
            </svg>
          </div>
          <div>
            <div style="font-size: 15px; font-weight: 600; color: #f0f4f8;">${data.drone_id}</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.5);">${statusConfig.label}</div>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
          <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <div style="color: rgba(255,255,255,0.45); margin-bottom: 4px;">电量</div>
            <div style="color: ${batteryColor}; font-weight: 600; font-size: 14px;">${battery.toFixed(1)}%</div>
          </div>
          <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <div style="color: rgba(255,255,255,0.45); margin-bottom: 4px;">速度</div>
            <div style="color: #f0f4f8; font-weight: 600; font-size: 14px;">${(data.velocity?.speed || 0).toFixed(1)} m/s</div>
          </div>
          <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <div style="color: rgba(255,255,255,0.45); margin-bottom: 4px;">高度</div>
            <div style="color: #f0f4f8; font-weight: 600; font-size: 14px;">${(data.position?.altitude || 0).toFixed(1)} m</div>
          </div>
          <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <div style="color: rgba(255,255,255,0.45); margin-bottom: 4px;">信号</div>
            <div style="color: ${data.signal?.connected ? '#00e676' : '#ff5252'}; font-weight: 600; font-size: 14px;">${data.signal?.connected ? '已连接' : '已断开'}</div>
          </div>
        </div>
        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 11px; color: rgba(255,255,255,0.35);">
          坐标: ${(data.position?.lng || 0).toFixed(6)}, ${(data.position?.lat || 0).toFixed(6)}
        </div>
      </div>
    `
  }

  if (type === 'nest') {
    const config = NEST_STATUS_CONFIG[data.status] || NEST_STATUS_CONFIG[0]

    return `
      <div style="
        padding: 16px;
        min-width: 230px;
        font-family: 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
        background: rgba(13, 18, 32, 0.88);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(0, 212, 255, 0.08);
        color: #f0f4f8;
      ">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px;">
          <div style="width: 40px; height: 40px; background: ${config.bgColor}; border: 2px solid ${config.color}; border-radius: 10px; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 12px ${config.color}33;">
            <svg width="20" height="20" viewBox="0 0 40 40">
              <path d="M20 10 L12 18 L12 28 L28 28 L28 18 Z" fill="none" stroke="${config.color}" stroke-width="2"/>
            </svg>
          </div>
          <div>
            <div style="font-size: 15px; font-weight: 600; color: #f0f4f8;">${data.nest_name || data.nest_id}</div>
            <div style="font-size: 12px; color: rgba(255,255,255,0.5);">${config.label}</div>
          </div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
          <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <div style="color: rgba(255,255,255,0.45); margin-bottom: 4px;">充电功率</div>
            <div style="color: #f0f4f8; font-weight: 600; font-size: 14px;">${data.charge_power || 0}W</div>
          </div>
          <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <div style="color: rgba(255,255,255,0.45); margin-bottom: 4px;">最大无人机</div>
            <div style="color: #f0f4f8; font-weight: 600; font-size: 14px;">${data.max_drones || 0}</div>
          </div>
          <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <div style="color: rgba(255,255,255,0.45); margin-bottom: 4px;">当前充电</div>
            <div style="color: #ffab00; font-weight: 600; font-size: 14px;">${data.current_charging || 0}</div>
          </div>
          <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
            <div style="color: rgba(255,255,255,0.45); margin-bottom: 4px;">可用槽位</div>
            <div style="color: #00e676; font-weight: 600; font-size: 14px;">${data.available_slots || 0}</div>
          </div>
        </div>
        ${data.location ? `
          <div style="margin-top: 12px; padding: 10px; background: rgba(255,255,255,0.05); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06); font-size: 12px;">
            <div style="color: rgba(255,255,255,0.45); margin-bottom: 4px;">位置</div>
            <div style="color: #f0f4f8;">${data.location}</div>
          </div>
        ` : ''}
        <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 11px; color: rgba(255,255,255,0.35);">
          坐标: ${parseFloat(data.longitude || 0).toFixed(6)}, ${parseFloat(data.latitude || 0).toFixed(6)}
        </div>
      </div>
    `
  }

  return ''
}

/**
 * 创建路径样式
 * @param {string} type - 路径类型 'executed' | 'remaining' | 'planned'
 * @returns {Object} 样式配置
 */
export function getPathStyle(type) {
  const styles = {
    executed: {
      strokeColor: '#546e7a',
      strokeWeight: 4,
      strokeOpacity: 0.5,
      strokeStyle: 'solid',
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 18
    },
    remaining: {
      strokeColor: '#ff9800',
      strokeWeight: 5,
      strokeOpacity: 0.95,
      strokeStyle: 'solid',
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 22
    },
    planned: {
      strokeColor: '#00d4ff',
      strokeWeight: 4,
      strokeOpacity: 0.8,
      strokeStyle: 'dashed',
      lineJoin: 'round',
      lineCap: 'round',
      zIndex: 20
    }
  }
  return styles[type] || styles.planned
}

/**
 * 创建路径边框样式
 */
export function getPathBorderStyle() {
  return {
    strokeColor: '#ffffff',
    strokeWeight: 7,
    strokeOpacity: 0.15,
    strokeStyle: 'solid',
    lineJoin: 'round',
    lineCap: 'round',
    zIndex: 19
  }
}

/**
 * 创建航点标记
 * @param {Array} position - 坐标 [lng, lat]
 * @param {string} type - 类型 'start' | 'end' | 'waypoint'
 * @param {number} index - 索引
 * @returns {Object} AMap.Marker 配置
 */
export function createWaypointMarkerConfig(position, type, index) {
  const configs = {
    start: {
      content: `
        <div style="width: 16px; height: 16px; background: #4caf50; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 8px rgba(76, 175, 80, 0.6);"></div>
      `,
      offset: new AMap.Pixel(-8, -8),
      zIndex: 30
    },
    end: {
      content: `
        <div style="width: 20px; height: 20px; background: #ff9800; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 12px rgba(255, 152, 0, 0.8);"></div>
      `,
      offset: new AMap.Pixel(-10, -10),
      zIndex: 30
    },
    waypoint: {
      content: `
        <div style="width: 12px; height: 12px; background: #00d4ff; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 0 6px rgba(0, 212, 255, 0.5); opacity: 0.7;"></div>
      `,
      offset: new AMap.Pixel(-6, -6),
      zIndex: 25
    }
  }

  return {
    position,
    ...configs[type],
    extData: { type: 'waypoint', waypointType: type, index }
  }
}

/**
 * 获取状态文本
 */
export function getStatusText(status) {
  const texts = {
    0: '离线',
    1: '空闲',
    2: '占用',
    3: '故障'
  }
  return texts[status] || '未知'
}

/**
 * 获取无人机状态文本
 */
export function getDroneStatusText(status) {
  const texts = {
    0: '空闲',
    1: '飞行中',
    2: '充电中',
    3: '故障'
  }
  return texts[status] || '未知'
}

/**
 * 获取状态颜色
 */
export function getStatusColor(status) {
  const colors = {
    0: MARKER_COLORS.offline,
    1: MARKER_COLORS.idle,
    2: MARKER_COLORS.charging,
    3: MARKER_COLORS.fault
  }
  return colors[status] || MARKER_COLORS.offline
}

/**
 * 计算两点间距离（米）
 */
export function calculateDistance(point1, point2) {
  if (!window.AMap) return 0
  const lnglat1 = new AMap.LngLat(point1[0], point1[1])
  const lnglat2 = new AMap.LngLat(point2[0], point2[1])
  return lnglat1.distance(lnglat2)
}

/**
 * 创建无人机移动动画
 */
export function createDroneMoveAnimation(marker, targetPosition, duration = 1000) {
  return new Promise((resolve) => {
    marker.moveTo(targetPosition, {
      duration,
      easing: 'easeInOutCubic'
    })
    marker.on('moveend', resolve, { once: true })
  })
}
