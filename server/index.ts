/**
 * WebSocket Server - メッセージ配信サーバー
 * 
 * 使い方:
 *   npm run server
 * 
 * メッセージ送信例（別ターミナルから）:
 *   curl -X POST http://localhost:8080/send \
 *     -H "Content-Type: application/json" \
 *     -d '{"type":"text","content":"Hello!","sound":"default"}'
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage, ServerResponse } from 'http';

const PORT = parseInt(process.env.PORT || '8080', 10);

// 接続中のクライアント
const clients = new Set<WebSocket>();

// HTTPサーバー（REST API用）
const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // POST /send - メッセージ送信
  if (req.method === 'POST' && req.url === '/send') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const message = JSON.parse(body);
        broadcast(message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, clients: clients.size }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // GET /status - 状態確認
  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      clients: clients.size,
      uptime: process.uptime(),
    }));
    return;
  }

  // GET / - 簡易UI
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>Display Server</title>
  <meta charset="UTF-8">
  <style>
    body { font-family: system-ui; max-width: 600px; margin: 2rem auto; padding: 1rem; }
    h1 { font-size: 1.5rem; }
    .status { background: #f0f0f0; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
    form { display: flex; flex-direction: column; gap: 0.5rem; }
    textarea { height: 100px; font-family: monospace; }
    button { padding: 0.5rem 1rem; cursor: pointer; }
    .presets { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 1rem 0; }
    .presets button { font-size: 0.8rem; }
  </style>
</head>
<body>
  <h1>📺 Display Server</h1>
  <div class="status">
    <strong>接続クライアント:</strong> <span id="clients">-</span>
  </div>
  
  <h3>メッセージ送信</h3>
  <div class="presets">
    <button onclick="sendPreset('text')">テキスト</button>
    <button onclick="sendPreset('alert')">アラート</button>
    <button onclick="sendPreset('clear')">クリア</button>
  </div>
  
  <form onsubmit="sendMessage(event)">
    <textarea id="message" placeholder='{"type":"text","content":"Hello!","sound":"default"}'></textarea>
    <button type="submit">送信</button>
  </form>
  
  <script>
    const presets = {
      text: { type: 'text', content: 'Hello, World!', style: { fontSize: 'large' }, sound: 'default', duration: 5000 },
      alert: { type: 'alert', title: '警告', body: 'これはアラートです', sound: 'alert' },
      clear: { type: 'clear' }
    };
    
    function sendPreset(name) {
      document.getElementById('message').value = JSON.stringify(presets[name], null, 2);
    }
    
    async function sendMessage(e) {
      e.preventDefault();
      const text = document.getElementById('message').value;
      try {
        const res = await fetch('/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: text
        });
        const data = await res.json();
        if (!data.ok) alert('Error: ' + data.error);
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }
    
    async function updateStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        document.getElementById('clients').textContent = data.clients;
      } catch (err) {}
    }
    
    updateStatus();
    setInterval(updateStatus, 3000);
  </script>
</body>
</html>
    `);
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// WebSocket サーバー
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  console.log(`[WS] Client connected from ${req.socket.remoteAddress}`);
  clients.add(ws);

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('[WS] Received:', message);
      
      // クライアントからのステータスは無視（必要なら処理追加）
      if (message.type === 'hello' || message.type === 'status') {
        return;
      }
      
      // それ以外はブロードキャスト
      broadcast(message);
    } catch (err) {
      console.error('[WS] Invalid message:', err);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (err) => {
    console.error('[WS] Error:', err);
    clients.delete(ws);
  });
});

/**
 * 全クライアントにメッセージを送信
 */
function broadcast(message: object): void {
  const data = JSON.stringify(message);
  console.log(`[WS] Broadcasting to ${clients.size} clients:`, message);
  
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });
}

// サーバー起動
httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║         Display Server Started                 ║
╠════════════════════════════════════════════════╣
║  HTTP:      http://localhost:${PORT}              ║
║  WebSocket: ws://localhost:${PORT}                ║
╠════════════════════════════════════════════════╣
║  Endpoints:                                    ║
║    GET  /        - Web UI                      ║
║    GET  /status  - Server status               ║
║    POST /send    - Send message                ║
╚════════════════════════════════════════════════╝
  `);
});
