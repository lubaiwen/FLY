import request from './request'

export const deviceApi = {
  syncStatus: (data) => request.post('/devices/status', data),
  getStatus: (params) => request.get('/devices/status', { params }),
  heartbeat: (deviceId) => request.post(`/devices/${deviceId}/heartbeat`),
  command: (deviceId, data) => request.post(`/devices/${deviceId}/command`, data)
}
