const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI
const EARTH_RADIUS = 6371000

export class CoordinateTransformer {
  constructor(referenceLng, referenceLat) {
    this.refLng = referenceLng
    this.refLat = referenceLat
    this.cosRefLat = Math.cos(referenceLat * DEG_TO_RAD)
    this.metersPerDegLng = (Math.PI / 180) * EARTH_RADIUS * this.cosRefLat
    this.metersPerDegLat = (Math.PI / 180) * EARTH_RADIUS
  }

  wgs84ToLocal(lng, lat, altitude = 0) {
    const x = (lng - this.refLng) * this.metersPerDegLng
    const y = (lat - this.refLat) * this.metersPerDegLat
    const z = altitude
    return { x, y, z }
  }

  localToWgs84(x, y, z = 0) {
    const lng = this.refLng + x / this.metersPerDegLng
    const lat = this.refLat + y / this.metersPerDegLat
    const altitude = z
    return { lng, lat, altitude }
  }

  wgs84ToAmap3D(lng, lat, altitude = 0) {
    return {
      lngLat: new AMap.LngLat(lng, lat),
      height: altitude
    }
  }

  bearingBetween(lng1, lat1, lng2, lat2) {
    const dLng = (lng2 - lng1) * DEG_TO_RAD
    const lat1Rad = lat1 * DEG_TO_RAD
    const lat2Rad = lat2 * DEG_TO_RAD
    const y = Math.sin(dLng) * Math.cos(lat2Rad)
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng)
    return (Math.atan2(y, x) * RAD_TO_DEG + 360) % 360
  }

  distanceBetween(lng1, lat1, lng2, lat2) {
    const dLat = (lat2 - lat1) * DEG_TO_RAD
    const dLng = (lng2 - lng1) * DEG_TO_RAD
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
              Math.sin(dLng / 2) ** 2
    return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  altitudeScale(zoom) {
    const baseZoom = 15
    const scale = Math.pow(2, baseZoom - zoom)
    return Math.max(0.5, Math.min(5, scale))
  }

  pixelToWgs84(pixelX, pixelY, map) {
    if (!map) return null
    return map.containerToLngLat(new AMap.Pixel(pixelX, pixelY))
  }

  wgs84ToPixel(lng, lat, map) {
    if (!map) return null
    return map.lngLatToContainer(new AMap.LngLat(lng, lat))
  }

  validateCoordinate(lng, lat, altitude = 0) {
    const errors = []
    if (typeof lng !== 'number' || isNaN(lng) || lng < -180 || lng > 180) {
      errors.push(`经度无效: ${lng}`)
    }
    if (typeof lat !== 'number' || isNaN(lat) || lat < -90 || lat > 90) {
      errors.push(`纬度无效: ${lat}`)
    }
    if (typeof altitude !== 'number' || isNaN(altitude) || altitude < 0) {
      errors.push(`高度无效: ${altitude}`)
    }
    return { valid: errors.length === 0, errors }
  }

  validateMatchAccuracy(entity, mapEntity, toleranceMeters = 5) {
    const dist = this.distanceBetween(
      entity.lng, entity.lat,
      mapEntity.lng, mapEntity.lat
    )
    const altDiff = Math.abs((entity.altitude || 0) - (mapEntity.altitude || 0))
    return {
      positionMatch: dist <= toleranceMeters,
      altitudeMatch: altDiff <= toleranceMeters,
      positionError: dist,
      altitudeError: altDiff,
      overallMatch: dist <= toleranceMeters && altDiff <= toleranceMeters
    }
  }
}

export class Scene3DMatcher {
  constructor(map, transformer) {
    this.map = map
    this.transformer = transformer
    this.entities = new Map()
    this.syncTimer = null
    this.lastCameraState = null
  }

  registerEntity(id, type, lngLatAlt, options = {}) {
    const validation = this.transformer.validateCoordinate(lngLatAlt.lng, lngLatAlt.lat, lngLatAlt.altitude)
    if (!validation.valid) {
      console.warn(`实体 ${id} 坐标验证失败:`, validation.errors)
      return null
    }

    this.entities.set(id, {
      id,
      type,
      geoCoord: { ...lngLatAlt },
      localCoord: this.transformer.wgs84ToLocal(lngLatAlt.lng, lngLatAlt.lat, lngLatAlt.altitude),
      options,
      lastUpdate: Date.now()
    })

    return this.entities.get(id)
  }

  updateEntityPosition(id, lngLatAlt) {
    const entity = this.entities.get(id)
    if (!entity) return false

    const validation = this.transformer.validateCoordinate(lngLatAlt.lng, lngLatAlt.lat, lngLatAlt.altitude)
    if (!validation.valid) {
      console.warn(`实体 ${id} 坐标更新失败:`, validation.errors)
      return false
    }

    entity.geoCoord = { ...lngLatAlt }
    entity.localCoord = this.transformer.wgs84ToLocal(lngLatAlt.lng, lngLatAlt.lat, lngLatAlt.altitude)
    entity.lastUpdate = Date.now()
    return true
  }

  removeEntity(id) {
    return this.entities.delete(id)
  }

  getCameraState() {
    if (!this.map) return null
    return {
      center: this.map.getCenter(),
      zoom: this.map.getZoom(),
      pitch: this.map.getPitch(),
      rotation: this.map.getRotation()
    }
  }

  hasCameraChanged() {
    const current = this.getCameraState()
    if (!current || !this.lastCameraState) return true

    const centerChanged =
      Math.abs(current.center.lng - this.lastCameraState.center.lng) > 0.00001 ||
      Math.abs(current.center.lat - this.lastCameraState.center.lat) > 0.00001
    const zoomChanged = Math.abs(current.zoom - this.lastCameraState.zoom) > 0.1
    const pitchChanged = Math.abs(current.pitch - this.lastCameraState.pitch) > 0.5
    const rotationChanged = Math.abs(current.rotation - this.lastCameraState.rotation) > 0.5

    return centerChanged || zoomChanged || pitchChanged || rotationChanged
  }

  startSync(onSync) {
    this.stopSync()
    this.syncTimer = setInterval(() => {
      if (this.hasCameraChanged()) {
        this.lastCameraState = this.getCameraState()
        if (onSync) onSync(this.lastCameraState)
      }
    }, 200)
  }

  stopSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
  }

  verifyAllEntities() {
    const results = []
    this.entities.forEach((entity, id) => {
      const geo = entity.geoCoord
      const local = entity.localCoord
      const backConvert = this.transformer.localToWgs84(local.x, local.y, local.z)

      const posError = this.transformer.distanceBetween(
        geo.lng, geo.lat,
        backConvert.lng, backConvert.lat
      )
      const altError = Math.abs((geo.altitude || 0) - (backConvert.altitude || 0))

      results.push({
        id,
        type: entity.type,
        positionError: posError,
        altitudeError: altError,
        passed: posError < 1 && altError < 1
      })
    })
    return results
  }

  destroy() {
    this.stopSync()
    this.entities.clear()
    this.map = null
    this.transformer = null
  }
}

export function createTransformer(referenceLng, referenceLat) {
  return new CoordinateTransformer(referenceLng, referenceLat)
}

export function createSceneMatcher(map, transformer) {
  return new Scene3DMatcher(map, transformer)
}
