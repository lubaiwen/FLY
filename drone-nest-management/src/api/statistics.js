import request from './request'

export const statisticsApi = {
  getOverview: () => request.get('/statistics/overview'),
  getTrend: (params) => request.get('/statistics/trend', { params }),
  getDistribution: () => request.get('/statistics/distribution'),
  getHeatmap: () => request.get('/statistics/heatmap'),
  getRevenue: (params) => request.get('/statistics/revenue', { params })
}
