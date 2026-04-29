import request from './request'

export const orderApi = {
  getList: (params) => request.get('/orders', { params }),
  getById: (id) => request.get(`/orders/${id}`),
  getStats: () => request.get('/orders/stats'),
  create: (data) => request.post('/orders', data),
  update: (id, data) => request.put(`/orders/${id}`, data),
  cancel: (id) => request.post(`/orders/${id}/cancel`),
  export: (params) => request.get('/orders/export', { params, responseType: 'blob' })
}
