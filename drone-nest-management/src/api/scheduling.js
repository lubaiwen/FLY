import request from './request'

export const schedulingApi = {
  runScheduling: (data) => request.post('/scheduling/run', data),
  
  startScheduler: () => request.post('/scheduling/start'),
  
  stopScheduler: () => request.post('/scheduling/stop'),
  
  getSchedulerStatus: () => request.get('/scheduling/status'),
  
  getMetrics: () => request.get('/scheduling/metrics'),
  
  startSimulation: (config) => request.post('/scheduling/simulation/start', config),
  
  stopSimulation: () => request.post('/scheduling/simulation/stop'),
  
  getSimulationStatus: () => request.get('/scheduling/simulation/status'),
}

export const websocketApi = {
  connect: (onMessage, onError) => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//localhost:3000/api/ws`
    
    const ws = new WebSocket(wsUrl)
    
    ws.onopen = () => {
      console.log('WebSocket connected')
    }
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (onMessage) {
          onMessage(data)
        }
      } catch (e) {
        console.error('WebSocket message parse error:', e)
      }
    }
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
      if (onError) {
        onError(error)
      }
    }
    
    ws.onclose = () => {
      console.log('WebSocket disconnected')
    }
    
    return {
      send: (data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(data))
        }
      },
      close: () => {
        ws.close()
      },
      getState: () => {
        return ws.readyState
      }
    }
  }
}
