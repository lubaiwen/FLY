import request from './request'

export const droneApi = {
  getList: (params) => request.get('/drones', { params }),
  
  getById: (id) => request.get(`/drones/${id}`),
  
  create: (data) => request.post('/drones', data),
  
  update: (id, data) => request.put(`/drones/${id}`, data),
  
  delete: (id) => request.delete(`/drones/${id}`),
  
  getByStatus: (status) => request.get('/drones', { params: { status } }),
  
  getByType: (drone_type) => request.get('/drones', { params: { drone_type } }),
  
  bindNest: (droneId, nestId) => request.post('/drones/bind-nest', { droneId, nestId }),
}
