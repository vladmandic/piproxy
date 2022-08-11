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
    if (err.statusCode) log.error('Proxy error', client, err.statusCode, err.code, `${err.address}:${err.port}`);
    else log.error('Proxy error', client, err);
    res.setHeader('proxy-error', err);
    if (err.statusCode) res.writeHead(err.statusCode, res.headers);
    res.end();
  }
}

function redirectSecure() {
  // @ts-ignore
  if (!global.config.redirectHTTP) return;
  const redirector = http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
    logger(req, res);
  });
  redirector.listen(80);
}

function writeHeaders(input, output, compress) {
  // some heads are in input and some are already present in output, but no longer in input
  const tempHeaders = [...Object.entries(output.getHeaders())];
  for (const key of Object.keys(output.getHeaders())) output.removeHeader(key);
  for (const [key, val] of Object.entries(input.headers)) {
    if (compress && key.toLowerCase().includes('content-length')) output.setHeader('content-size', val);
    else output.setHeader(key, val);
    delete input.headers[key];
  }
  // rewrite original headers
  for (const header of tempHeaders) {
    output.setHeader(header[0], header[1]);
  }
  if (!output.getHeader('content-type')?.startsWith('text/html')) output.removeHeader('content-security-policy');
  // output.setHeader('x-powered-by', 'PiProxy');
  output.setHeader('x-content-type-options', 'nosniff');
  if (compress) output.setHeader('content-encoding', 'br'); // gzip
}

function writeData(req, input, output) {
  const encoding = (input.headers['content-encoding'] || '').length > 0; // is content already compressed?
  const accept = req.headers['accept-encoding'] ? req.headers['accept-encoding'].includes('br') : false; // does target accept compressed data? // gzip
  // @ts-ignore
  const acceptCompress = global.config.compress && (global.config.compress > 0) && !encoding && accept; // is compression enabled, data uncompressed and target accepts compression?
  writeHeaders(input, output, acceptCompress); // copy headers from original response
  // override cors headers
  output.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  output.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  output.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  // @ts-ignore
  const compress = zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: global.config.compress } }); // zlib.createGzip({ level: global.config.compress });
  if (!acceptCompress) input.pipe(output); // don't compress data
  else input.pipe(compress).pipe(output); // compress data
  return output;
}

const findTarget = {
  timestamp: 0,
  onReq: (input, output) => { // add headers to request going to target server
    this.timestamp = process.hrtime.bigint();
    const url = `${input.headers[':scheme']}://${input.headers[':authority']}${input.headers[':path']}`;
    // @ts-ignore
    const tgt = (global.config.redirects.find((a) => url.match(a.url))) || (global.config.redirects.find((a) => a.default === true));
    output.hostname = tgt.target;
    output.port = tgt.port;
    output.headers['x-forwarded-for'] = input.socket.remoteAddress;
    output.headers['x-forwarded-proto'] = input.socket.encrypted ? 'https' : 'http';
    output.headers['x-forwarded-host'] = input.headers[':authority'] || input.headers.host;
  },
  onRes: (req, output, input) => {
    output.statusCode = input.statusCode;
    const t1 = process.hrtime.bigint();
    input.performance = t1 - (this.timestamp || process.hrtime.bigint());
    output.performance = t1 - (this.timestamp || process.hrtime.bigint());
    const obj = logger(req, input);
    switch (input.statusCode) {
      case 404:
        output.setHeader('content-security-policy', "default-src 'self' 'unsafe-inline'");
        output.setHeader('content-type', 'text/html');
        output.end(errors.get404(obj));
        return output;
      default:
        return writeData(req, input, output);
    }
  },
};

function dropPriviledges() {
  const uid = parseInt(process.env.SUDO_UID || '', 10);
  if (uid) {
    process.setuid(uid);
    log.state('Reducing runtime priviledges');
    log.state(`Running as UID:${process.getuid()}`);
  }
}

function startServer() {
// Start Proxy web server
  // @ts-ignore
  global.config.http2.key = fs.readFileSync(path.join(__dirname, ssl.Key));
  // @ts-ignore
  global.config.http2.cert = fs.readFileSync(path.join(__dirname, ssl.Crt));
  // @ts-ignore
  server = http2.createSecureServer(global.config.http2);
  server.on('listening', () => {
    log.state('Proxy listening:', server.address());
    dropPriviledges();
  });
  server.on('error', (err) => log.error('Proxy error', err.message || err));
  server.on('close', () => log.state('Proxy closed'));
  server.on('request', app);
  // @ts-ignore
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
  // @ts-ignore
  log.info('Log database:', path.resolve(global.config.db));
  // @ts-ignore
  global.db = nedb.create({ filename: path.resolve(global.config.db), inMemoryOnly: false, timestampData: false, autoload: false });
  // @ts-ignore
  await global.db.loadDatabase();

  // @ts-ignore
  log.info('Compression:', global.config.compress);

  // Start proxy web server
  app = await middleware.init();
  ssl = sslOptions;
  startServer();

  // Log all redirect rules
  // @ts-ignore
  for (const rule of global.config.redirects) log.info(' Rule:', rule);

  // Actual proxy calls
  log.info('Activating reverse proxy');
  // eslint-disable-next-line no-unused-vars
  app.use((req, res, next) => predefined.get(req, res, next));
  app.use((req, res, next) => stats.get(req, res, next));
  app.use((req, res) => proxy.web(req, res, findTarget, errorHandler));
}

exports.init = init;
exports.logger = logger;
exports.restart = restartServer;
