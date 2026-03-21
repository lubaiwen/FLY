import request from './request'

export const nestApi = {
  getList: (params) => request.get('/nests', { params }),
  
  getById: (id) => request.get(`/nests/${id}`),
  
  create: (data) => request.post('/nests', data),
  
  update: (id, data) => request.put(`/nests/${id}`, data),
  
  delete: (id) => request.delete(`/nests/${id}`),
  
  getByRegion: (region_type) => request.get('/nests', { params: { region_type } }),
  
  getAvailable: (params) => request.get('/nests', { params: { status: 'available', ...params } }),
  
  getStatistics: () => request.get('/nests/statistics'),
}
