import * as fs from 'fs';
import * as os from 'os';
import * as zlib from 'zlib';
import * as path from 'path';
import * as http from 'http';
import * as http2 from 'http2';
import * as process from 'process';
import type { TLSSocket } from 'tls';
import * as log from '@vladmandic/pilogger';
import logger from './logger';
import proxy from './proxy';
import * as middleware from './middleware';
import * as errors from './errors';
import * as answers from './answers';
import * as config from './config';

export type Req = http.IncomingMessage | http2.Http2ServerRequest;
export type Res = http.ServerResponse | http2.Http2ServerResponse;
export type Headers = http.IncomingHttpHeaders | http2.IncomingHttpHeaders;

let app;
let server;
let ssl;
let cfg = config.get();

function errorHandler(err, req: Req, res: Res) {
  if (err) {
    const client = `${req.headers[':scheme'] || ((req.socket as TLSSocket).encrypted ? 'https' : 'http')}://${req.headers[':authority'] || req.headers.host}${req.url}`;
    if (err.statusCode) log.error('proxy', { client, status: err.statusCode, code: err.code, address: err.address, port: err.port });
    else log.error('proxy', { client, err });
    res.setHeader('proxy-error', err);
    if (err.statusCode) res.writeHead(err.statusCode, req.headers);
    res.end();
  }
}

function redirectSecure() {
  if (!cfg.redirectHTTP) return;
  const redirector = http.createServer((req: Req, res: Res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
    logger(req, req);
  });
  redirector.on('error', (err) => log.error('server', { message: err.message || err }));
  redirector.on('close', () => log.state('server', { status: 'closed' }));
  redirector.listen(80);
}

function writeHeaders(input: Req, output: Res, compress: boolean) {
  // some heads are in input and some are already present in output, but no longer in input
  const tempHeaders = [...Object.entries(output.getHeaders())];
  for (const key of Object.keys(output.getHeaders())) output.removeHeader(key);
  for (const [key, val] of Object.entries(input.headers)) {
    if (compress && key.toLowerCase().includes('content-length')) output.setHeader('content-size', val as string);
    else output.setHeader(key, val as string);
    delete input.headers[key];
  }
  // rewrite original headers
  for (const header of tempHeaders) {
    output.setHeader(header[0], header[1] || '');
  }
  if (!output.getHeader('content-type')?.toString().startsWith('text/html')) output.removeHeader('content-security-policy');
  output.setHeader('x-content-type-options', 'nosniff');
  if (compress) output.setHeader('content-encoding', 'br'); // brotli compression
}

function writeData(req: Req, input: Req, output: Res) {
  const encoding = (input.headers['content-encoding'] || '').length > 0; // is content already compressed?
  const accept = req.headers['accept-encoding'] ? req.headers['accept-encoding'].includes('br') : false; // does target accept compressed data? // gzip
  const acceptCompress = cfg.compress ? ((cfg.compress > 0) && !encoding && accept) : false; // is compression enabled, data uncompressed and target accepts compression?
  writeHeaders(input, output, acceptCompress); // copy headers from original response
  // override cors headers
  output.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  output.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  output.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  const compress = zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: cfg.compress } }); // zlib.createGzip({ level: cfg.compress });
  if (!acceptCompress) input.pipe(output); // don't compress data
  else input.pipe(compress).pipe(output); // compress data
  return output;
}

type Target = { timestamp: bigint; onReq: (input: Req, output: Req) => void; onRes: (req: Req, output: Res, proxyReq: Req) => Res; }; // eslint-disable-line no-unused-vars

const findTarget: Target = {
  timestamp: 0n,
  onReq: (clientReq: Req, outputReq: http.RequestOptions) => { // add headers to request going to target server
    clientReq.headers['timestamp'] = process.hrtime.bigint().toString();
    const url = `${clientReq.headers[':scheme']}://${clientReq.headers[':authority']}${clientReq.headers[':path']}`;
    const tgt = cfg.redirects.find((a) => url.match(a.url || 'missing-url-property')) || cfg.redirects.find((a) => a.default === true);
    outputReq.hostname = tgt?.target;
    outputReq.port = tgt?.port;
    if (!tgt) {
      // @ts-ignore we preset status code on request even if its not ready yet
      clientReq.statusCode = 421;
      logger(clientReq, clientReq);
    }
    if (!outputReq.headers) outputReq.headers = {};
    outputReq.headers['x-forwarded-for'] = clientReq.socket.remoteAddress;
    outputReq.headers['x-forwarded-proto'] = (clientReq.socket as TLSSocket).encrypted ? 'https' : 'http';
    outputReq.headers['x-forwarded-host'] = clientReq.headers[':authority'] || clientReq.headers.host;
  },
  onRes: (clientReq: Req, final: Res, proxyReq: Req) => {
    final.statusCode = (proxyReq as http.IncomingMessage).statusCode || 503;
    const obj = logger(clientReq, proxyReq);
    switch ((proxyReq as http.IncomingMessage).statusCode) {
      case 404:
        final.setHeader('content-security-policy', "default-src 'self' 'unsafe-inline'");
        final.setHeader('content-type', 'text/html');
        final.end(errors.get404(obj));
        return final;
      default:
        return writeData(clientReq, proxyReq, final);
    }
  },
};

function dropPriviledges() {
  log.state('server', { user: os.userInfo() });
  const uid = parseInt(process.env.SUDO_UID || '');
  if (uid) {
    if (process.setuid) process.setuid(uid);
    log.state('server user override', { uid: process.getuid ? process.getuid() : 'unknown' });
  }
}

function startServer() {
// Start Proxy web server
  let key;
  let cert;
  if (!fs.existsSync(path.join(__dirname, ssl.key))) log.warn('ssl key missing:', ssl);
  else key = fs.readFileSync(path.join(__dirname, ssl.key));
  if (!fs.existsSync(path.join(__dirname, ssl.crt))) log.warn('ssl key missing:', ssl);
  else cert = fs.readFileSync(path.join(__dirname, ssl.crt));
  if (!key || !cert) log.warn('server', { ssl: 'fail' });
  server = http2.createSecureServer({ ...cfg.http2, key, cert });
  server.on('listening', () => {
    log.state('server', { status: 'listening', ...server.address() });
    dropPriviledges();
  });
  server.on('error', (err) => log.error('server', { message: err.message || err }));
  server.on('close', () => log.state('server', { status: 'closed' }));
  // server.on('connect', (req, socket, head) => log.state('server connect', { req, socket, head }));
  // server.on('socket', (socket) => log.state('server socket', { socket }));
  server.on('request', app);
  server.listen(cfg.http2.port);
}

export function restartServer() {
  if (!server) {
    log.warn('server', { status: 'not started' });
    return;
  }
  log.info('server', { status: 'restarting' });
  server.close();
  setTimeout(() => startServer(), 2000);
}

export function checkServer() {
  server.getConnections((error, connections) => {
    if (server.listening) log.state('server', { status: 'active', connections, error });
    else log.error('server', { status: 'not listening', connections, error });
  });
  setInterval(checkServer, 60000); // Monitor server status
}

export async function init(sslOptions) {
  ssl = sslOptions;
  cfg = config.get(); // Read current config
  await redirectSecure(); // Redirect HTTP to HTTPS
  app = await middleware.init(); // Initialize server middleware
  startServer(); // Start proxy web server

  if (!cfg.redirects || (cfg.redirects.length <= 0)) log.warn('proxy', { rules: 0 });
  for (const rule of cfg.redirects) log.info('proxy', rule); // Log all redirect rules
  log.info('static', { paths: Object.keys(cfg.answers) }); // Log all predefined answers

  app.use((req: Req, res: Res, next) => answers.get(req, res, next)); // Enable predefined answers
  app.use((req: Req, res: Res) => proxy.web(req, res, findTarget, errorHandler)); // Actual proxy calls

  setTimeout(checkServer, 5000); // Check if server started correctly
}
