/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-use-before-define */

/* based on https://github.com/nxtedition/node-http2-proxy by https://github.com/ronag */

import * as net from 'net';
import * as http from 'http';
import * as https from 'https';
import type { TlsOptions, TLSSocket } from 'tls';
import type { Req, Res, Headers } from './server';

const tlsOptions = [
  'ca',
  'cert',
  'ciphers',
  'clientCertEngine',
  'crl',
  'dhparam',
  'ecdhCurve',
  'honorCipherOrder',
  'key',
  'passphrase',
  'pfx',
  'rejectUnauthorized',
  'secureOptions',
  'secureProtocol',
  'servername',
  'sessionIdContext',
  'highWaterMark',
  'checkServerIdentity',
];

const kReq = Symbol('req');
const kRes = Symbol('res');
const kProxyCallback = Symbol('callback');
const kProxyReq = Symbol('proxyReq');
const kProxyRes = Symbol('proxyRes');
const kProxySocket = Symbol('proxySocket');
const kConnected = Symbol('connected');
const kOnRes = Symbol('onRes');

async function request({ req, socket, res = socket, head, proxyName }, onReq, onRes) {
  if (req.aborted) return null;
  const headers: Headers = getRequestHeaders(req, proxyName);
  if (head) {
    if (req.method !== 'GET') throw new HttpError('only GET request allowed', undefined, 405);
    if (req.headers['upgrade'] !== 'websocket') throw new HttpError('missing upgrade header', undefined, 400);
    if (head && head.length) res.unshift(head);
    setupSocket(res);
    headers['connection'] = 'upgrade';
    headers['upgrade'] = 'websocket';
  }
  const proxyReq = await onReq({ method: req.method, path: req.originalUrl || req.url, headers });
  if (req.aborted) {
    if (proxyReq?.abort) proxyReq.abort();
    else if (proxyReq?.destroy) proxyReq.destroy();
    return null;
  }
  if (req.headers['unknown-protocol']) {
    res.statusCode = 421;
    res.end('uknown target');
    return null;
  }
  let callback;
  const promise = new Promise((resolve, reject) => {
    callback = (err) => (err ? reject(err) : resolve(true));
  });
  req[kRes] = res;
  req[kProxyReq] = proxyReq;
  res[kReq] = req;
  res[kRes] = res;
  res[kProxySocket] = null;
  res[kProxyRes] = null;
  // @ts-ignore callback is assigned in promise
  res[kProxyCallback] = callback;
  proxyReq[kReq] = req;
  proxyReq[kRes] = res;
  proxyReq[kConnected] = false;
  proxyReq[kOnRes] = onRes;
  res
    .on('close', onComplete)
    .on('finish', onComplete)
    .on('error', onComplete);
  req
    .on('close', onComplete)
    .on('aborted', onComplete)
    .on('error', onComplete);
  proxyReq
    .on('error', onProxyReqError)
    .on('timeout', onProxyReqTimeout)
    .on('response', onProxyReqResponse)
    .on('upgrade', onProxyReqUpgrade);
  deferToConnect.call(proxyReq);
  return promise;
}

function onSocket(this: any, socket: TLSSocket) {
  if (!socket.connecting) onProxyConnect.call(this);
  else socket.once('connect', onProxyConnect.bind(this));
}

function deferToConnect(this: any) { // eslint-disable-line no-unused-vars
  if (this.socket) onSocket.call(this, this.socket);
  else this.once('socket', onSocket);
}

function onComplete(this: any, err) {
  const res = this[kRes];
  const req = res[kReq];
  if (!res[kProxyCallback]) return;
  const proxyReq = req[kProxyReq];
  const proxySocket = res[kProxySocket];
  const proxyRes = res[kProxyRes];
  const callback = res[kProxyCallback];
  req[kProxyReq] = null;
  res[kProxySocket] = null;
  res[kProxyRes] = null;
  res[kProxyCallback] = null;
  res
    .off('close', onComplete)
    .off('finish', onComplete)
    .off('error', onComplete);
  req
    .off('close', onComplete)
    .off('aborted', onComplete)
    .off('error', onComplete)
    .off('data', onReqData)
    .off('end', onReqEnd);
  if (err) {
    err.connectedSocket = Boolean(proxyReq && proxyReq[kConnected]);
    err.reusedSocket = Boolean(proxyReq && proxyReq.reusedSocket);
  }
  if (proxyReq) {
    proxyReq.off('drain', onProxyReqDrain);
    if (proxyReq.abort) proxyReq.abort();
    else if (proxyReq.destroy) proxyReq.destroy();
  }
  if (proxySocket) proxySocket.destroy();
  if (proxyRes) proxyRes.destroy();
  callback(err);
}

function onProxyConnect(this: any) { // eslint-disable-line no-unused-vars
  this[kConnected] = true;
  if (this['method'] === 'GET' || this['method'] === 'HEAD' || this['method'] === 'OPTIONS') {
    this[kReq].resume();
    this.end();
  } else {
    this[kReq]
      .on('data', onReqData)
      .on('end', onReqEnd);
    this
      .on('drain', onProxyReqDrain);
  }
}

function onReqEnd(this: any) { // eslint-disable-line no-unused-vars
  this[kProxyReq].end();
}

function onReqData(this: any, buf) {
  if (!this[kProxyReq].write(buf)) this.pause();
}

function onProxyReqDrain(this: any) { // eslint-disable-line no-unused-vars
  this[kReq].resume();
}

function onProxyReqError(this: any, err) {
  err.statusCode = this[kConnected] ? 502 : 503;
  onComplete.call(this, err);
}

function onProxyReqTimeout(this: any) { // eslint-disable-line no-unused-vars
  onComplete.call(this, new HttpError('proxy timeout', 'ETIMEDOUT', 504));
}

async function onProxyReqResponse(this: any, proxyRes) {
  const res = this[kRes];
  res[kProxyRes] = proxyRes;
  proxyRes[kRes] = res;
  const headers: Headers = setupHeaders(proxyRes.headers);
  proxyRes.on('aborted', onProxyResAborted).on('error', onProxyResError);
  if (this[kOnRes]) {
    try {
      await this[kOnRes](proxyRes, headers);
    } catch (err) {
      onComplete.call(this, err);
    }
  } else if (!res.writeHead) {
    if (!proxyRes.upgrade) {
      res.write(createHttpHeader(`HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}`, proxyRes.headers));
      proxyRes.pipe(res);
    }
  } else {
    res.statusCode = proxyRes.statusCode;
    for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
    proxyRes.on('end', onProxyResEnd).pipe(res);
  }
}

function onProxyReqUpgrade(this: any, proxyRes, proxySocket, proxyHead) {
  const res = this[kRes];
  res[kProxySocket] = proxySocket;
  proxySocket[kRes] = res;
  setupSocket(proxySocket);
  if (proxyHead && proxyHead.length) proxySocket.unshift(proxyHead);
  res.write(createHttpHeader('HTTP/1.1 101 Switching Protocols', proxyRes.headers));
  proxySocket
    .on('error', onProxyResError)
    .on('close', onProxyResAborted)
    .pipe(res)
    .pipe(proxySocket);
}

function onProxyResError(this: any, err) {
  err.statusCode = 502;
  onComplete.call(this, err);
}

function onProxyResAborted(this: any) { // eslint-disable-line no-unused-vars
  onComplete.call(this, new HttpError('proxy aborted', 'ECONNRESET', 502));
}

function onProxyResEnd(this: any) { // eslint-disable-line no-unused-vars
  if (this.trailers) this[kRes].addTrailers(this.trailers);
}

function createHttpHeader(line: string, headers: Headers) {
  let head = line;
  for (const [key, value] of Object.entries(headers)) {
    if (!Array.isArray(value)) {
      head += `\r\n${key}: ${value}`;
    } else {
      for (let i = 0; i < value.length; i++) head += `\r\n${key}: ${value[i]}`;
    }
  }
  head += '\r\n\r\n';
  return Buffer.from(head, 'ascii');
}

function getRequestHeaders(req: { headers: Headers; httpVersion: any; socket: { localAddress: any; localPort: any; remoteAddress: any; remotePort: any; encrypted: any; }; }, proxyName: any) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.charAt(0) !== ':' && key !== 'host') headers[key] = value;
  }

  if (proxyName) {
    if (headers['via']) {
      for (const name of headers['via'].split(',')) {
        if (name.endsWith(proxyName)) throw new HttpError('loop detected', undefined, 508);
      }
      headers['via'] += ',';
    } else {
      headers['via'] = '';
    }
    headers['via'] += `${req.httpVersion} ${proxyName}`;
  }

  function printIp(address: string, port?: number) {
    const isIPv6 = net.isIPv6(address);
    let str = `${address}`;
    if (isIPv6) str = `[${str}]`;
    if (port) str = `${str}:${port}`;
    if (isIPv6 || port) str = `"${str}"`;
    return str;
  }

  const forwarded = [
    `by=${printIp(req.socket.localAddress, req.socket.localPort)}`,
    `for=${printIp(req.socket.remoteAddress, req.socket.remotePort)}`,
    `proto=${req.socket.encrypted ? 'https' : 'http'}`,
    `host=${printIp(req.headers[':authority'] as string || req.headers['host'] as string || '')}`,
  ].join(';');
  if (headers['forwarded']) headers['forwarded'] += `, ${forwarded}`;
  else headers['forwarded'] = `${forwarded}`;
  return setupHeaders(headers);
}

function setupSocket(socket: TLSSocket) {
  socket.setTimeout(0);
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 0);
}

function setupHeaders(headers: Headers) {
  if (headers['connection'] && headers['connection'] !== 'connection' && headers['connection'] !== 'keep-alive') {
    for (const name of headers['connection'].toLowerCase().split(',')) delete headers[name.trim()];
  }
  delete headers['connection'];
  delete headers['proxy-connection'];
  delete headers['keep-alive'];
  delete headers['proxy-authenticate'];
  delete headers['proxy-authorization'];
  delete headers['te'];
  delete headers['trailer'];
  delete headers['transfer-encoding'];
  delete headers['upgrade'];
  delete headers['http2-settings'];
  return headers;
}

class HttpError extends Error {
  code: string | undefined;
  statusCode: number;

  constructor(msg: string | undefined, code: string | undefined, statusCode: number) {
    super(msg);
    this.code = code;
    this.statusCode = statusCode || 500;
  }
}

type Proxy = {
  ({ req, socket, res, head, proxyName }: { req: Req; socket: TlsOptions; res?: Res; head: Headers; proxyName: string; }, onReq, onRes): Promise<unknown>; // eslint-disable-line no-unused-vars
  (arg0, arg1, arg2); // eslint-disable-line no-unused-vars
  (arg0, arg1, arg2); // eslint-disable-line no-unused-vars
  ws?;
  web?;
}

export function process(proxy: Proxy) {
  proxy.ws = function ws(req: Req, socket: TLSSocket, head: Headers, options: any, callback) {
    const promise = compat({ req, socket, head }, options);
    if (!callback) return promise;
    return promise
      .then(() => callback(null, req, socket, head))
      .catch((err) => callback(err, req, socket, head));
  };

  proxy.web = function web(req: Req, res: Res, options: any, callback) {
    const promise = compat({ req, res }, options);
    if (!callback) return promise;
    return promise
      .then(() => callback(null, req, res))
      .catch((err) => callback(err, req, res));
  };

  type Options = {
    hostname: string,
    port: number,
    path: string,
    socketPath: string,
    protocol: string,
    timeout: number,
    proxyTimeout: number,
    proxyName: string,
    onReq,
    onRes,
  }

  async function compat(ctx: { req: Req; socket?: TLSSocket; head?: Headers; res?: Res; }, options: Options) {
    const { req, res } = ctx;
    const { hostname, port, path, socketPath, protocol, timeout, proxyTimeout, proxyName, onReq, onRes } = options;
    if (timeout) req.setTimeout(timeout);
    await proxy(
      { ...ctx, proxyName },
      async (ureq: https.RequestOptions) => {
        for (const key of tlsOptions) {
          if (Reflect.has(options, key)) {
            const value = Reflect.get(options, key);
            Reflect.set(ureq, key, value);
          }
        }
        if (hostname) ureq.hostname = hostname;
        if (port) ureq.port = port;
        if (path) ureq.path = path;
        if (proxyTimeout) ureq.timeout = proxyTimeout;
        if (socketPath) ureq.socketPath = socketPath;
        let ret: http.ClientRequest | undefined;
        if (onReq) {
          if (onReq.length <= 2) {
            ret = await onReq(req, ureq);
          } else {
            ret = await new Promise((resolve, reject) => {
              const promiseOrReq = onReq(req, ureq, (err, val: http.ClientRequest | Promise<http.ClientRequest>) => (err ? reject(err) : resolve(val)));
              if (promiseOrReq) {
                if (promiseOrReq.then) promiseOrReq.then(resolve).catch(reject);
                else if (promiseOrReq.abort) resolve(promiseOrReq);
                else throw new Error('onReq must return a promise or a request object');
              } else {
                reject();
              }
            });
          }
        }
        if (!ret) {
          let agent;
          if (protocol == null || /^(http|ws):?$/.test(protocol)) agent = http;
          else if (/^(http|ws)s:?$/.test(protocol)) agent = https;
          else throw new Error('invalid protocol');
          if (ureq.hostname && ureq.port) ret = agent.request(ureq);
          else req.headers['unknown-protocol'] = 'true';
        }
        return ret;
      },
      onRes ? async (proxyRes: { headers: Headers }, headers: Headers) => {
        proxyRes.headers = headers;
        if (onRes.length <= 3) return onRes(req, res, proxyRes);
        return new Promise((resolve, reject) => {
          const promise = onRes(req, res, proxyRes, (err, val) => (err ? reject(err) : resolve(val)));
          if (promise && promise.then) {
            promise.then(resolve).catch(reject);
          }
        });
      } : null,
    );
  }
  return proxy;
}

export default process(request);
