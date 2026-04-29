const http = require('http');

http.get('http://localhost:3000/api/nests?pageSize=10', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log('API 返回的机巢数据:');
    json.data.list.forEach(nest => {
      console.log(`${nest.nest_id} | ${nest.nest_name} | 经度:${nest.longitude} | 纬度:${nest.latitude}`);
    });
  });
}).on('error', err => console.error('请求失败:', err));