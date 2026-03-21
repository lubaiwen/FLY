import request from './request'

export const userApi = {
  login: (data) => request.post('/auth/login', data),
  register: (data) => request.post('/auth/register', data),
  logout: () => request.post('/auth/logout'),
  getInfo: () => request.get('/auth/info'),
  updateInfo: (data) => request.put('/auth/info', data),
  changePassword: (data) => request.put('/auth/password', data),
  getList: (params) => request.get('/users', { params }),
  getById: (id) => request.get(`/users/${id}`),
  create: (data) => request.post('/users', data),
  update: (id, data) => request.put(`/users/${id}`, data),
  delete: (id) => request.delete(`/users/${id}`)
}
