const fs = require('fs');
const path = require('path');
const useragent = require('useragent');
const http = require('http');
const http2 = require('http2');
const log = require('pilogger');
const proxy = require('http2-proxy');
const geoip = require('./geoip.js');

function errorHandler(err) {
  if (err) log.error('Proxy error', err);
}

function logger(req, res) {
  const head = req.headers;
  const agent = useragent.lookup(head['user-agent']);
  const agentDetails = `OS:'${agent.os.family}' Device:'${agent.device.family}' Agent:'${agent.family}.${agent.major}.${agent.minor}'`;
  const peer = req.socket._peername || {};
  const ip = peer.address || req.socket.remoteAddress;
  const geo = peer.address ? geoip.get(ip) : {};
  const geoDetails = geo.country ? `Geo:'${geo.continent}/${geo.country}/${geo.city}' ASN:'${geo.asn}' Loc:${geo.lat},${geo.lon}` : '';
  const size = res.headers ? (res.headers['content-length'] || res.headers['content-size'] || 0) : 0;
  const client = `${head[':scheme'] || (req.socket.encrypted ? 'https' : 'http')}://${head[':authority'] || req.headers.host}${req.url}`;
  log.data(`${req.method}/${req.socket.alpnProtocol || req.httpVersion} Code:${res.statusCode} ${client} From:${ip} Size:${size} ${agentDetails} ${geoDetails}`);
}

function redirectSecure() {
  if (!global.config.redirectHTTP) return;
  const server = http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
    logger(req, res);
  });
  server.listen(80);
}

function findTarget(req) {
  const url = `${req.headers[':scheme']}://${req.headers[':authority']}${req.headers[':path']}`;
  const tgt = (global.config.redirects.find((a) => url.match(a.url))) || (global.config.redirects.find((a) => a.default === true));
  // log.data('Proxy rule matched:', url, tgt);
  const res = {
    hostname: tgt.target,
    port: tgt.port,
    onReq: (inReq, { headers }) => { // add headers to request going to target server
      headers['x-forwarded-for'] = inReq.socket.remoteAddress;
      headers['x-forwarded-proto'] = inReq.socket.encrypted ? 'https' : 'http';
      headers['x-forwarded-host'] = inReq.headers[':authority'] || inReq.headers.host;
    },
    onRes: (outReq, outRes, origRes) => { // add headers to response returning to client
      outRes.setHeader('x-powered-by', 'PiProxy');
      outRes.writeHead(origRes.statusCode, origRes.headers);
      origRes.pipe(outRes);
      logger(outReq, origRes);
    },
  };
  return res;
}

function startServer(ssl) {
  // Start Proxy web server
  global.config.http2.key = fs.readFileSync(path.join(__dirname, ssl.Key));
  global.config.http2.cert = fs.readFileSync(path.join(__dirname, ssl.Crt));
  const server = http2.createSecureServer(global.config.http2);
  server.on('listening', () => log.state('Proxy listening:', server.address()));
  server.on('error', (err) => log.error('Proxy error', err.message));
  server.on('close', () => log.state('Proxy closed'));
  server.on('request', (req, res) => proxy.web(req, res, findTarget(req), errorHandler));
  server.listen(global.config.http2.port);
}

async function init(ssl) {
  // Redirect HTTP to HTTPS
  redirectSecure();

  // Start proxy web server
  startServer(ssl);

  // Log all redirect rules and start redirecting
  for (const rule of global.config.redirects) log.info(' Rule:', rule);
}

exports.init = init;
