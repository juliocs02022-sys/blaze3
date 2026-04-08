const WebSocket = require('ws');
const http = require('http');

let results = [];
let wsStatus = 'disconnected';

function connect() {
  wsStatus = 'connecting';
  const ws = new WebSocket(
    'wss://api-v2.blaze.com/replication/?EIO=3&transport=websocket',
    { headers: { 'Origin': 'https://blaze.com', 'Host': 'api-v2.blaze.com' } }
  );

  ws.on('open', () => {
    console.log('[proxy] conectado ao Blaze');
    ws.send('40'); // namespace connect
  });

  ws.on('message', (data) => {
    const msg = String(data);

    if (msg === '2') { ws.send('3'); return; } // ping/pong

    if (msg === '40' || msg.startsWith('40{')) {
      ws.send('421["cmd",{"id":"subscribe","payload":{"room":"double_v2"}}]');
      wsStatus = 'subscribed';
      console.log('[proxy] subscrito double_v2');
      return;
    }

    if (msg.includes('double.tick')) {
      try {
        const arr = JSON.parse(msg.replace(/^\d+/, ''));
        const p = arr[1]?.payload ?? arr[1];
        if (!p || (p.status !== 'rolling' && p.status !== 'complete')) return;
        const row = {
          number: p.roll ?? 0,
          color: p.color === 1 ? 'red' : p.color === 2 ? 'black' : 'white',
          time: p.updated_at ? new Date(p.updated_at).toISOString() : '',
          id: p.id || Date.now()
        };
        if (results.length && results[0].id === row.id) return;
        results = [row, ...results].slice(0, 300);
        console.log('[proxy] rodada:', row.color, row.number);
      } catch (e) { console.log('[proxy] parse error', e.message); }
    }
  });

  ws.on('close', (code) => {
    wsStatus = 'disconnected';
    console.log('[proxy] fechado code=' + code + ' reconectando em 3s');
    setTimeout(connect, 3000);
  });

  ws.on('error', (e) => {
    console.log('[proxy] erro:', e.message);
  });
}

// HTTP server
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/double' || req.url === '/') {
    res.end(JSON.stringify({ status: wsStatus, count: results.length, results }));
  } else if (req.url === '/health') {
    res.end(JSON.stringify({ ok: true, status: wsStatus, count: results.length }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'not found' }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('[proxy] servidor HTTP na porta ' + PORT);
  connect();
});
