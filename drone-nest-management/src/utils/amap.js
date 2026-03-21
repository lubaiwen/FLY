export const AMAP_CONFIG = {
  key: 'a09603580e78a0943df78cb6dd58193c',
  securityJsCode: '1d9afa9b9f55d1d28711338a0f3b68e0',
  version: '2.0',
  plugins: [
    'AMap.Scale',
    'AMap.ToolBar',
    'AMap.ControlBar',
    'AMap.Geolocation',
    'AMap.PlaceSearch',
    'AMap.Geocoder',
    'AMap.DistrictSearch',
    'AMap.Object3DLayer',
  ]
}

export const MAP_CENTER = [117.260, 31.780]

export const MARKER_COLORS = {
  idle: '#00e676',
  occupied: '#ffab00',
  offline: '#5a7aa3',
  fault: '#ff5252'
}

export function createMap(container, options = {}) {
  const defaultOptions = {
    zoom: 12,
    center: MAP_CENTER,
    mapStyle: 'amap://styles/dark',
    viewMode: '3D',
    pitch: 45,
    rotation: 0,
    showBuildingBlock: true,
    showIndoorMap: false,
    skyColor: '#1a1a2e',
    features: ['bg', 'road', 'building', 'point']
  }
  
  return new AMap.Map(container, { ...defaultOptions, ...options })
}

export function create3DLayer(map) {
  const object3DLayer = new AMap.Object3DLayer({
    zIndex: 10,
    opacity: 1
  })
  map.add(object3DLayer)
  return object3DLayer
}

export function createBuilding3D(position, height, options = {}) {
  const bounds = new AMap.Bounds(
    [position[0] - 0.001, position[1] - 0.001],
    [position[0] + 0.001, position[1] + 0.001]
  )
  
  const height3D = height || 100
  
  const prism = new AMap.Object3D.Prism({
    bounds: bounds,
    height: height3D,
    color: options.color || '#3498db',
    topColor: options.topColor || '#2980b9',
    sideColor: options.sideColor || '#1a5276'
  })
  
  return prism
}

export function createFlightPath(start, end, options = {}) {
  const path = new AMap.Object3D.Line()
  
  const startCoord = new AMap.LngLat(start[0], start[1])
  const endCoord = new AMap.LngLat(end[0], end[1])
  
  path.setPath([startCoord, endCoord])
  path.setHeight([start[2] || 100, end[2] || 100])
  path.setColor(options.color || '#00ff00')
  path.setStrokeWeight(options.width || 2)
  
  return path
}

export function createDroneMarker3D(position, options = {}) {
  const drone3D = new AMap.Object3D.Round()
  
  drone3D.setCenter(new AMap.LngLat(position[0], position[1]))
  drone3D.setRadius(options.radius || 20)
  drone3D.setHeight(position[2] || 100)
  drone3D.setColor(options.color || '#ff6b6b')
  
  return drone3D
}

export function createMarker(position, options = {}) {
  const marker = new AMap.Marker({
    position,
    offset: new AMap.Pixel(-15, -15),
    ...options
  })
  return marker
}

export function createInfoWindow(content, options = {}) {
  return new AMap.InfoWindow({
    content,
    offset: new AMap.Pixel(0, -30),
    ...options
  })
}

export function getStatusColor(status) {
  const colors = {
    0: MARKER_COLORS.offline,
    1: MARKER_COLORS.idle,
    2: MARKER_COLORS.occupied,
    3: MARKER_COLORS.fault
  }
  return colors[status] || MARKER_COLORS.offline
}

export function getStatusText(status) {
  const texts = {
    0: '离线',
    1: '空闲',
    2: '占用',
    3: '故障'
  }
  return texts[status] || '未知'
}
