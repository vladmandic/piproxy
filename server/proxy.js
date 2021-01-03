/* based on https://github.com/nxtedition/node-http2-proxy by https://github.com/ronag */
/* eslint-disable no-use-before-define */

const net = require('net');
const http = require('http');
const https = require('https');

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
  const headers = getRequestHeaders(req, proxyName);
  if (head !== undefined) {
    if (req.method !== 'GET') throw new HttpError('only GET request allowed', null, 405);
    if (req.headers['upgrade'] !== 'websocket') throw new HttpError('missing upgrade header', null, 400);
    if (head && head.length) res.unshift(head);
    setupSocket(res);
    headers['connection'] = 'upgrade';
    headers['upgrade'] = 'websocket';
  }
  const proxyReq = await onReq({ method: req.method, path: req.originalUrl || req.url, headers });
  if (req.aborted) {
    if (proxyReq.abort) proxyReq.abort();
    else if (proxyReq.destroy) proxyReq.destroy();
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

function onSocket(socket) {
  if (!socket.connecting) onProxyConnect.call(this);
  else socket.once('connect', onProxyConnect.bind(this));
}

function deferToConnect() {
  if (this.socket) onSocket.call(this, this.socket);
  else this.once('socket', onSocket);
}

function onComplete(err) {
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

function onProxyConnect() {
  this[kConnected] = true;
  if (this.method === 'GET' || this.method === 'HEAD' || this.method === 'OPTIONS') {
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

function onReqEnd() {
  this[kProxyReq].end();
}

function onReqData(buf) {
  if (!this[kProxyReq].write(buf)) this.pause();
}

function onProxyReqDrain() {
  this[kReq].resume();
}

function onProxyReqError(err) {
  err.statusCode = this[kConnected] ? 502 : 503;
  onComplete.call(this, err);
}

function onProxyReqTimeout() {
  onComplete.call(this, new HttpError('proxy timeout', 'ETIMEDOUT', 504));
}

async function onProxyReqResponse(proxyRes) {
  const res = this[kRes];
  res[kProxyRes] = proxyRes;
  proxyRes[kRes] = res;
  const headers = setupHeaders(proxyRes.headers);
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

function onProxyReqUpgrade(proxyRes, proxySocket, proxyHead) {
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

function onProxyResError(err) {
  err.statusCode = 502;
  onComplete.call(this, err);
}

function onProxyResAborted() {
  onComplete.call(this, new HttpError('proxy aborted', 'ECONNRESET', 502));
}

function onProxyResEnd() {
  if (this.trailers) this[kRes].addTrailers(this.trailers);
}

function createHttpHeader(line, headers) {
  let head = line;
  for (const [key, value] of Object.entries(headers)) {
    if (!Array.isArray(value)) {
      head += `\r\n${key}: ${value}`;
    } else {
      for (let i = 0; i < value.length; i++) {
        head += `\r\n${key}: ${value[i]}`;
      }
    }
  }
  head += '\r\n\r\n';
  return Buffer.from(head, 'ascii');
}

function getRequestHeaders(req, proxyName) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.charAt(0) !== ':' && key !== 'host') headers[key] = value;
  }

  if (proxyName) {
    if (headers['via']) {
      for (const name of headers['via'].split(',')) {
        if (name.endsWith(proxyName)) throw new HttpError('loop detected', null, 508);
      }
      headers['via'] += ',';
    } else {
      headers['via'] = '';
    }
    headers['via'] += `${req.httpVersion} ${proxyName}`;
  }

  function printIp(address, port) {
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
    `host=${printIp(req.headers[':authority'] || req.headers['host'] || '')}`,
  ].join(';');
  if (headers['forwarded']) headers['forwarded'] += `, ${forwarded}`;
  else headers['forwarded'] = `${forwarded}`;
  return setupHeaders(headers);
}

function setupSocket(socket) {
  socket.setTimeout(0);
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 0);
}

function setupHeaders(headers) {
  const connection = headers['connection'];
  if (connection && connection !== 'connection' && connection !== 'keep-alive') {
    for (const name of connection.toLowerCase().split(',')) delete headers[name.trim()];
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
  constructor(msg, code, statusCode) {
    super(msg);
    this.code = code;
    this.statusCode = statusCode || 500;
  }
}

function process(proxy) {
  proxy.ws = function ws(req, socket, head, options, callback) {
    const promise = compat({ req, socket, head }, options);
    if (!callback) return promise;
    return promise
      .then(() => callback(null, req, socket, head))
      .catch((err) => callback(err, req, socket, head));
  };

  proxy.web = function web(req, res, options, callback) {
    const promise = compat({ req, res }, options);
    if (!callback) return promise;
    return promise
      .then(() => callback(null, req, res))
      .catch((err) => callback(err, req, res));
  };
  async function compat(ctx, options) {
    const { req, res } = ctx;
    const {
      hostname,
      port,
      path,
      socketPath,
      protocol,
      timeout,
      proxyTimeout,
      proxyName,
      onReq,
      onRes,
    } = options;
    if (timeout != null) req.setTimeout(timeout);
    await proxy(
      { ...ctx, proxyName },
      async (ureq) => {
        for (const key of tlsOptions) {
          if (Reflect.has(options, key)) {
            const value = Reflect.get(options, key);
            Reflect.set(ureq, key, value);
          }
        }
        if (hostname !== undefined) ureq.hostname = hostname;
        if (port !== undefined) ureq.port = port;
        if (path !== undefined) ureq.path = path;
        if (proxyTimeout !== undefined) ureq.timeout = proxyTimeout;
        if (socketPath !== undefined) ureq.socketPath = socketPath;
        let ret;
        if (onReq) {
          if (onReq.length <= 2) {
            ret = await onReq(req, ureq);
          } else {
            ret = await new Promise((resolve, reject) => {
              const promiseOrReq = onReq(req, ureq, (err, val) => (err ? reject(err) : resolve(val)));
              if (promiseOrReq) {
                if (promiseOrReq.then) promiseOrReq.then(resolve).catch(reject);
                else if (promiseOrReq.abort) resolve(promiseOrReq);
                else throw new Error('onReq must return a promise or a request object');
              } else {
                resolve(true);
              }
            });
          }
        }
        if (!ret) {
          let agent;
          if (protocol == null || /^(http|ws):?$/.test(protocol)) agent = http;
          else if (/^(http|ws)s:?$/.test(protocol)) agent = https;
          else throw new Error('invalid protocol');
          ret = agent.request(ureq);
        }
        return ret;
      },
      onRes ? async (proxyRes, headers) => {
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

module.exports = process(request);
