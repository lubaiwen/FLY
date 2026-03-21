import request from './request'

export const pathApi = {
  plan: (data) => request.post('/path/plan', data),
  batch: (data) => request.post('/path/batch', data),
  optimize: (data) => request.post('/path/optimize', data),
  intelligentMatch: (data) => request.post('/path/intelligent-match', data),
  getBestNest: (droneId) => request.get(`/path/best-nest/${droneId}`)
}
