const http = require('http');

const data = JSON.stringify({
  drone_id: 'DR001',
  nest_id: 'NT001',
  path_type: 'straight',
  start_position: { lat: 31.78, lng: 117.26, altitude: 100 }
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/path/plan',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
  });
});

req.on('error', err => console.error('Error:', err));
req.write(data);
req.end();