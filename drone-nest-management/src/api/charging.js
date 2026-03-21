import request from './request'

export const chargingApi = {
  getList: (params) => request.get('/charging', { params }),
  getById: (id) => request.get(`/charging/${id}`),
  getStats: () => request.get('/charging/stats'),
  create: (data) => request.post('/charging', data),
  update: (id, data) => request.put(`/charging/${id}`, data),
  stop: (id) => request.post(`/charging/${id}/stop`)
}
