const fs = require('fs');
const path = require('path');
const http = require('http');
const http2 = require('http2');
const log = require('@vladmandic/pilogger');
const proxy = require('http2-proxy');
const middleware = require('./middleware.js');
const logger = require('./logger.js');
const errors = require('./errors.js');

let app;

function errorHandler(err, req, res) {
  if (err) {
    log.error('Proxy error', err.statusCode, err.code, err.address, err.port);
    res.setHeader('proxy-error', err);
    if (err.statusCode) res.writeHead(err.statusCode, res.headers);
    res.end();
  }
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
      const obj = logger(outReq, origRes);
      switch (origRes.statusCode) {
        case 404:
          outRes.write(errors.get404(obj));
          outRes.end();
          break;
        default:
          outRes.writeHead(origRes.statusCode, origRes.headers);
          origRes.pipe(outRes);
      }
    },
  };
  return res;
}

function dropPriviledges() {
  const uid = parseInt(process.env.SUDO_UID, 10);
  if (uid) {
    process.setuid(uid);
    log.state('Reducing runtime priviledges');
    log.state(`Running as UID:${process.getuid()}`);
  }
}

function startServer(ssl) {
// Start Proxy web server
  global.config.http2.key = fs.readFileSync(path.join(__dirname, ssl.Key));
  global.config.http2.cert = fs.readFileSync(path.join(__dirname, ssl.Crt));
  const server = http2.createSecureServer(global.config.http2);
  server.on('listening', () => {
    log.state('Proxy listening:', server.address());
    dropPriviledges();
  });
  server.on('error', (err) => log.error('Proxy error', err.message));
  server.on('close', () => log.state('Proxy closed'));
  // server.on('request', (req, res) => proxy.web(req, res, findTarget(req), errorHandler));
  server.on('request', app);
  server.listen(global.config.http2.port);
}

async function init(ssl) {
// Redirect HTTP to HTTPS
  redirectSecure();

  // Start proxy web server
  app = await middleware.init();
  startServer(ssl);

  // Log all redirect rules
  for (const rule of global.config.redirects) log.info(' Rule:', rule);

  // Actual proxy calls
  log.info('Activating reverse proxy');
  // eslint-disable-next-line no-unused-vars
  app.use((req, res, next) => proxy.web(req, res, findTarget(req), errorHandler));
}

exports.init = init;
exports.logger = logger;
