import request from './request'

export const bookingApi = {
  getList: (params) => request.get('/bookings', { params }),
  getById: (id) => request.get(`/bookings/${id}`),
  create: (data) => request.post('/bookings/create', data),
  update: (id, data) => request.put(`/bookings/${id}`, data),
  cancel: (id) => request.post(`/bookings/${id}/cancel`),
  confirm: (id) => request.post(`/bookings/${id}/confirm`),
  getSchedule: (params) => request.get('/bookings/schedule', { params }),
  checkAvailability: (data) => request.post('/bookings/check-availability', data)
}
