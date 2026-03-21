import request from './request'

export const alertApi = {
  getList: (params) => request.get('/alerts', { params }),
  getById: (id) => request.get(`/alerts/${id}`),
  getStats: () => request.get('/alerts/stats'),
  create: (data) => request.post('/alerts', data),
  markAsRead: (id) => request.put(`/alerts/${id}/read`),
  markAllAsRead: () => request.put('/alerts/read-all'),
  resolve: (id, data) => request.put(`/alerts/${id}/resolve`, data),
  delete: (id) => request.delete(`/alerts/${id}`)
}
