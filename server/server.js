const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const http = require('http');
const http2 = require('http2');
const log = require('@vladmandic/pilogger');
const nedb = require('nedb-promises');
const middleware = require('./middleware.js');
const logger = require('./logger.js');
const errors = require('./errors.js');
const stats = require('./stats.js');
const predefined = require('./predefined.js');
const proxy = require('./proxy.js');

let app;
let server;
let ssl;

function errorHandler(err, req, res) {
  if (err) {
    const client = `${req.headers[':scheme'] || (req.socket.encrypted ? 'https' : 'http')}://${req.headers[':authority'] || req.headers.host}${req.url}`;
    log.error('Proxy error', client, err.statusCode, err.code, `${err.address}:${err.port}`);
    res.setHeader('proxy-error', err);
    if (err.statusCode) res.writeHead(err.statusCode, res.headers);
    res.end();
  }
}

function redirectSecure() {
  if (!global.config.redirectHTTP) return;
  const redirector = http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
    logger(req, res);
  });
  redirector.listen(80);
}

function writeHeaders(input, output, compress) {
  for (const [key, val] of Object.entries(input.headers)) {
    if (compress && key.toLowerCase().includes('content-length')) output.setHeader('content-size', val);
    else output.setHeader(key, val);
  }
  output.setHeader('x-powered-by', 'PiProxy');
  if (compress) output.setHeader('content-encoding', 'br'); // gzip
}

function writeData(_req, output, input) {
  const encoding = (input.headers['content-encoding'] || '').length > 0; // is content already compressed?
  const accept = _req.headers['accept-encoding'] ? _req.headers['accept-encoding'].includes('br') : false; // does target accept compressed data? // gzip
  const enabled = global.config.compress && (global.config.compress > 0) && !encoding && accept; // is compression enabled, data uncompressed and target accepts compression?
  writeHeaders(input, output, enabled); // copy all headers from original response
  const compress = zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: global.config.compress } }); // zlib.createGzip({ level: global.config.compress });
  if (!enabled) input.pipe(output); // don't compress data
  else input.pipe(compress).pipe(output); // compress data
}

function findTarget(req) {
  const url = `${req.headers[':scheme']}://${req.headers[':authority']}${req.headers[':path']}`;
  const tgt = (global.config.redirects.find((a) => url.match(a.url))) || (global.config.redirects.find((a) => a.default === true));
  // log.data('Proxy rule matched:', url, tgt);
  const t0 = process.hrtime.bigint();
  const res = {
    hostname: tgt.target,
    port: tgt.port,
    onReq: (_req) => { // add headers to request going to target server
      _req.headers['x-forwarded-for'] = _req.socket.remoteAddress;
      _req.headers['x-forwarded-proto'] = _req.socket.encrypted ? 'https' : 'http';
      _req.headers['x-forwarded-host'] = _req.headers[':authority'] || _req.headers.host;
    },
    onRes: (_req, output, input) => {
      output.statusCode = input.statusCode;
      const t1 = process.hrtime.bigint();
      input.performance = t1 - t0;
      output.performance = t1 - t0;
      const obj = logger(_req, input);
      switch (input.statusCode) {
        case 200:
          writeData(_req, output, input);
          break;
        case 404:
          writeHeaders(input, output, false);
          output.setHeader('content-security-policy', "default-src 'self' 'unsafe-inline'");
          output.end(errors.get404(obj));
          break;
        default:
          writeHeaders(input, output, false);
          input.pipe(output);
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

function startServer() {
// Start Proxy web server
  global.config.http2.key = fs.readFileSync(path.join(__dirname, ssl.Key));
  global.config.http2.cert = fs.readFileSync(path.join(__dirname, ssl.Crt));
  server = http2.createSecureServer(global.config.http2);
  server.on('listening', () => {
    log.state('Proxy listening:', server.address());
    dropPriviledges();
  });
  server.on('error', (err) => log.error('Proxy error', err.message || err));
  server.on('close', () => log.state('Proxy closed'));
  server.on('request', app);
  server.listen(global.config.http2.port);
}

function restartServer() {
  if (!server) {
    log.warn('Server not started');
    return;
  }
  log.info('Proxy restart requested');
  server.close();
  setTimeout(() => startServer(), 2000);
}

async function init(sslOptions) {
// Redirect HTTP to HTTPS
  redirectSecure();

  // Load log database
  log.info('Log database:', path.resolve(global.config.db));
  global.db = nedb.create({ filename: path.resolve(global.config.db), inMemoryOnly: false, timestampData: false, autoload: false });
  await global.db.loadDatabase();

  log.info('Compression:', global.config.compress);

  // Start proxy web server
  app = await middleware.init();
  ssl = sslOptions;
  startServer();

  // Log all redirect rules
  for (const rule of global.config.redirects) log.info(' Rule:', rule);

  // Actual proxy calls
  log.info('Activating reverse proxy');
  // eslint-disable-next-line no-unused-vars
  app.use((req, res, next) => predefined.get(req, res, next));
  app.use((req, res, next) => stats.get(req, res, next));
  app.use((req, res) => proxy.web(req, res, findTarget(req), errorHandler));
}

exports.init = init;
exports.logger = logger;
exports.restart = restartServer;
