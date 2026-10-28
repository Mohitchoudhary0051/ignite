import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const rooms = new Map();
const attempts = new Map();
const defaultTtlMs = 10 * 60 * 1000;
const maxTtlMs = 24 * 60 * 60 * 1000;
const maxMessage = 1024 * 1024;
const symbols = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function rateAllowed(ip) {
  const now = Date.now();
  const entry = attempts.get(ip) || { start: now, count: 0 };
  if (now - entry.start > 60_000) { entry.start = now; entry.count = 0; }
  entry.count++;
  attempts.set(ip, entry);
  return entry.count <= 30;
}
function send(ws, data) {
  if (ws.destroyed) return;
  const payload = Buffer.from(JSON.stringify(data));
  let header;
  if (payload.length < 126) header = Buffer.from([0x81, payload.length]);
  else if (payload.length < 65536) { header = Buffer.alloc(4); header[0]=0x81; header[1]=126; header.writeUInt16BE(payload.length,2); }
  else { header = Buffer.alloc(10); header[0]=0x81; header[1]=127; header.writeBigUInt64BE(BigInt(payload.length),2); }
  ws.write(Buffer.concat([header, payload]));
}
function closeRoom(code, reason) {
  const room = rooms.get(code);
  if (!room) return;
  rooms.delete(code);
  clearTimeout(room.timer);
  for (const peer of [room.sender, room.receiver]) {
    if (peer && !peer.destroyed) { send(peer, { type: 'room:closed', reason }); peer.end(); }
  }
}
function generateCode() {
  let code;
  do { code = Array.from(crypto.randomBytes(10), b => symbols[b % symbols.length]).join(''); } while (rooms.has(code));
  return code;
}
function routeMessage(ws, message) {
  const ip = ws.remoteAddress || 'unknown';
  if (message.type === 'room:create') {
    if (!rateAllowed(ip)) return send(ws, { type: 'error', message: 'Too many signaling actions. Wait a minute and retry.' });
    if (ws.roomCode) return send(ws, { type: 'error', message: 'This socket already owns a session.' });
    const code = generateCode();
    const requestedTtl = Number(message.ttlMs);
    const ttlMs = Number.isFinite(requestedTtl) ? Math.min(maxTtlMs, Math.max(60_000, requestedTtl)) : defaultTtlMs;
    const room = { code, sender: ws, receiver: null, pending: [], expiresAt: Date.now() + ttlMs, timer: null };
    room.timer = setTimeout(() => closeRoom(code, 'expired'), ttlMs);
    rooms.set(code, room); ws.roomCode = code; ws.role = 'sender';
    return send(ws, { type: 'room:created', code, expiresAt: room.expiresAt });
  }
  if (message.type === 'room:join') {
    if (!rateAllowed(ip)) return send(ws, { type: 'error', message: 'Too many signaling actions. Wait a minute and retry.' });
    const code = String(message.code || '').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '');
    const room = rooms.get(code);
    if (!room || room.expiresAt < Date.now()) return send(ws, { type: 'error', message: 'That handoff code is unavailable or expired.' });
    if (room.receiver || ws.roomCode) return send(ws, { type: 'error', message: 'This handoff already has a receiver.' });
    room.receiver = ws; ws.roomCode = code; ws.role = 'receiver';
    send(ws, { type: 'room:joined', code, expiresAt: room.expiresAt });
    send(room.sender, { type: 'peer:joined' });
    for (const pending of room.pending.splice(0)) send(ws, pending);
    return;
  }
  const room = rooms.get(ws.roomCode);
  if (!room || (ws !== room.sender && ws !== room.receiver)) return send(ws, { type: 'error', message: 'The handoff session is no longer active.' });
  if (message.type === 'session:revoke') return closeRoom(room.code, 'revoked');
  if (message.type === 'signal') {
    if (!['offer', 'answer', 'candidate'].includes(message.signalType)) return;
    const peer = ws === room.sender ? room.receiver : room.sender;
    const signal = { type: 'signal', signalType: message.signalType, data: message.data };
    if (peer && !peer.destroyed) send(peer, signal);
    else if (ws === room.sender && room.pending.length < 128) room.pending.push(signal);
  }
}
function attachWebSocket(server) {
  server.on('upgrade', (req, socket) => {
    const origin = req.headers.origin;
    let originAllowed = true;
    if (origin) { try { originAllowed = new URL(origin).host === req.headers.host; } catch { originAllowed = false; } }
    if (!originAllowed || req.url !== '/signal' || !rateAllowed(socket.remoteAddress || 'unknown')) { socket.destroy(); return; }
    const key = req.headers['sec-websocket-key'];
    if (!key || req.headers.upgrade?.toLowerCase() !== 'websocket') { socket.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    socket.roomCode = null; socket.role = null; socket.buffer = Buffer.alloc(0);
    socket.on('data', chunk => {
      socket.buffer = Buffer.concat([socket.buffer, chunk]);
      while (socket.buffer.length >= 2) {
        const b0=socket.buffer[0], b1=socket.buffer[1], opcode=b0 & 15, masked=!!(b1 & 128);
        let length=b1 & 127, offset=2;
        if (length===126) { if(socket.buffer.length<4) return; length=socket.buffer.readUInt16BE(2); offset=4; }
        else if(length===127) { if(socket.buffer.length<10) return; const wide=socket.buffer.readBigUInt64BE(2); if(wide>BigInt(maxMessage)){socket.destroy();return} length=Number(wide); offset=10; }
        if (length>maxMessage) { socket.destroy(); return; }
        const maskBytes=masked?4:0, total=offset+maskBytes+length;
        if(socket.buffer.length<total) return;
        let payload=socket.buffer.subarray(offset+maskBytes,total);
        if(masked){const mask=socket.buffer.subarray(offset,offset+4);payload=Buffer.from(payload);for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4]}
        socket.buffer=socket.buffer.subarray(total);
        if(opcode===8){socket.end();return}
        if(opcode===9){socket.write(Buffer.from([0x8a,0]));continue}
        if(opcode!==1) continue;
        try { routeMessage(socket, JSON.parse(payload.toString('utf8'))); }
        catch { send(socket, { type:'error', message:'Invalid signaling message.' }); }
      }
    });
    socket.on('close', () => { const room=rooms.get(socket.roomCode); if(!room)return; const other=socket===room.sender?room.receiver:room.sender; rooms.delete(room.code);clearTimeout(room.timer);if(other&&!other.destroyed)send(other,{type:'peer:disconnected'}); });
    socket.on('error', () => {});
  });
}
const publicFiles = new Map([
  ['/','index.html'], ['/index.html','index.html'], ['/app.js','app.js'],
  ['/sw.js','sw.js'], ['/manifest.webmanifest','manifest.webmanifest'], ['/icon.svg','icon.svg']
]);
const mimeTypes = { 'index.html':'text/html; charset=utf-8', 'app.js':'text/javascript; charset=utf-8', 'sw.js':'text/javascript; charset=utf-8', 'manifest.webmanifest':'application/manifest+json; charset=utf-8', 'icon.svg':'image/svg+xml' };
function serve(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') { res.writeHead(200, {'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({ok:true,signaling:'memory-only'}));return; }
  const requested = publicFiles.get(url.pathname);
  if (!requested) { res.writeHead(404, {'x-content-type-options':'nosniff'});res.end('Not found');return; }
  res.writeHead(200, {'content-type':mimeTypes[requested],'cache-control':requested==='sw.js'?'no-cache':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','service-worker-allowed':'/'});
  fs.createReadStream(path.join(root,requested)).pipe(res);
}
const cert=process.env.OMNIDROP_TLS_CERT, key=process.env.OMNIDROP_TLS_KEY;
const server=cert&&key?https.createServer({cert:fs.readFileSync(cert),key:fs.readFileSync(key)},serve):http.createServer(serve);
attachWebSocket(server);
const port=Number(process.env.PORT||4173), host=process.env.HOST||'0.0.0.0';
server.listen(port,host,()=>console.log(`OmniDrop signaling ready at ${cert&&key?'https':'http'}://${host}:${port} (files never pass through this server)`));
