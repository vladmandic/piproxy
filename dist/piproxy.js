/*
  proxy
  homepage: <https://github.com/vladmandic/piproxy>
  author: <https://github.com/vladmandic>'
*/

"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};

// src/index.ts
var log9 = __toESM(require("@vladmandic/pilogger"));
var acme = __toESM(require("@vladmandic/piacme"));

// src/noip.ts
var superagent = __toESM(require("superagent"));
var log2 = __toESM(require("@vladmandic/pilogger"));

// src/scan.ts
var log = __toESM(require("@vladmandic/pilogger"));
async function scan(host, startPort, endPort) {
  try {
    const res = await fetch("https://www.ipfingerprints.com/scripts/getPortsInfo.php", {
      headers: {
        accept: "application/json, text/javascript, */*; q=0.01",
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded",
        pragma: "no-cache",
        Referer: "https://www.ipfingerprints.com/portscan.php"
      },
      body: `remoteHost=${host}&start_port=${startPort}&end_port=${endPort}&normalScan=Yes&scan_type=connect&ping_type=none`,
      method: "POST"
    });
    if (!res?.ok)
      return [];
    const html = await res.text();
    const text = html.replace(/<[^>]*>/g, "");
    const lines = text.split("\\n").map((line) => line.replace("'", "").trim()).filter((line) => line.includes("tcp "));
    const parsed = lines.map((line) => line.replace("\\/tcp", "").split(" ").filter((str) => str.length > 0));
    const services = parsed.map((line) => ({ host, port: Number(line[0]), state: line[1], service: line[2] }));
    log.state("Scan", services);
    return services;
  } catch {
    return [];
  }
}

// package.json
var name = "@vladmandic/piproxy";
var version = "2.0.1";

// src/noip.ts
var config = { host: [], user: "", password: "" };
var results = [];
async function update(initial) {
  if (initial && initial.host)
    config = initial;
  for (const hostname of config.host) {
    superagent.get("dynupdate.no-ip.com/nic/update").set("User-Agent", `${name}/${version}`).auth(config.user, config.password).query({ hostname }).then((res) => {
      const text = res && res.text ? res.text.replace("\r\n", "").split(" ") : ["unknown", "unknown"];
      const status = res && res.status ? res.status : "unknown";
      const rec = { hostname, status, text: text[0], ip: text[1] };
      if (!results.map((r) => r.ip).includes(rec.ip))
        scan(rec.ip, 80, 80);
      results.push(rec);
      log2.state("NoIP", rec);
    }).catch((err) => {
      log2.warn(`NoIP error: ${err}`);
    });
  }
  setTimeout(update, 3600 * 1e3 * 2);
  return results;
}

// src/geoip.ts
var fs = __toESM(require("fs"));
var maxmind = __toESM(require("maxmind"));
var log3 = __toESM(require("@vladmandic/pilogger"));
var geoCity;
var geoASN;
async function init(geoIPCityDB, geoIPASNDB) {
  try {
    if (fs.existsSync(geoIPCityDB) && fs.existsSync(geoIPASNDB)) {
      geoCity = await maxmind.open(geoIPCityDB);
      geoASN = await maxmind.open(geoIPASNDB);
      log3.state("GeoIP", { city: geoIPCityDB, asn: geoIPASNDB });
    } else {
      log3.warn("GeoIP missing", { city: geoIPCityDB, asn: geoIPASNDB });
    }
  } catch {
    log3.warn("GeoIP failed", { city: geoIPCityDB, asn: geoIPASNDB });
  }
}
function get2(addr) {
  let ip = "127.0.0.1";
  if (!addr)
    addr = ip;
  if (addr.startsWith("::")) {
    const partial = addr.split(":");
    ip = partial[partial.length - 1];
    if (ip.split(".").length !== 4) {
      ip = "127.0.0.1";
    }
  }
  const loc = { ip };
  if (!geoCity || !geoASN)
    return loc;
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.") || ip.startsWith("169."))
    return loc;
  try {
    const geo = geoCity.get(ip);
    const asn = geoASN.get(ip);
    loc.asn = asn.autonomous_system_organization;
    loc.continent = geo.continent?.code;
    loc.country = geo.country?.iso_code;
    loc.city = geo.city?.names.en;
    loc.lat = geo.location?.latitude;
    loc.lon = geo.location?.longitude;
    loc.accuracy = geo.location?.accuracy_radius;
  } catch {
  }
  return loc;
}

// src/monitor.ts
var net = __toESM(require("net"));
var log5 = __toESM(require("@vladmandic/pilogger"));

// src/config.ts
var fs2 = __toESM(require("fs"));
var crypto = __toESM(require("crypto"));
var log4 = __toESM(require("@vladmandic/pilogger"));
var config2 = {
  logFile: "logs/proxy.log",
  noip: {
    host: [],
    user: "",
    password: ""
  },
  acme: {
    domains: [],
    application: "piproxy/1.0.0",
    accountFile: "./cert/account.json",
    accountKeyFile: "./cert/account.pem",
    ServerKeyFile: "./cert/private.pem",
    fullChain: "./cert/fullchain.pem"
  },
  ssl: {
    key: "../cert/private.pem",
    crt: "../cert/fullchain.pem"
  },
  http2: {
    allowHTTP1: true,
    port: 443,
    key: "",
    cert: "",
    secureOptions: crypto.constants.SSL_OP_NO_TLSv1 | crypto.constants.SSL_OP_NO_TLSv1_1
  },
  redirectHTTP: true,
  redirects: [],
  limiter: {
    interval: 10,
    tokens: 500
  },
  compress: 5,
  monitor: true,
  geoIP: {
    city: "./geoip/GeoLite2-City.mmdb",
    asn: "./geoip/GeoLite2-ASN.mmdb"
  },
  helmet: {
    frameguard: false,
    xssFilter: false,
    dnsPrefetchControl: { allow: true },
    noSniff: false,
    hsts: { maxAge: 15552e3, preload: true },
    referrerPolicy: { policy: "no-referrer" },
    expectCt: { enforce: true },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        fontSrc: ["'self'", "http:", "https:"],
        imgSrc: ["'self'", "data:", "http:", "https:"],
        mediaSrc: ["'self'", "data:", "http:", "https:"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:", "blob:"],
        styleSrc: ["'self'", "https:", "'unsafe-inline'"],
        connectSrc: ["'self'", "http:", "https:", "data:"],
        workerSrc: ["'self'", "blob:", "https:"],
        frameAncestors: ["'self'"],
        "upgrade-insecure-requests": []
      }
    }
  },
  answers: {
    "security.txt": "Contact: mailto:mandic00@live.com\nPreferred-Languages: en\n",
    "humans.txt": "/* TEAM */\nChef: Vladimir Mandic\nContact: mandic00@live.com\nGitHub: https://github.com/vladmandic\n",
    "robots.txt": "User-agent: *\nDisallow: /private\nCrawl-delay: 10\n",
    "git.head": "ref: refs/heads/master\n",
    "sitemap.xml": '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url>\n<loc>URL</loc>\n</url>\n</urlset>',
    version: { name: "", version: "" }
  }
};
function merge(...objects) {
  const isObject = (obj) => obj && typeof obj === "object";
  return objects.reduce((prev, obj) => {
    Object.keys(obj || {}).forEach((key) => {
      const pVal = prev[key];
      const oVal = obj[key];
      if (Array.isArray(pVal) && Array.isArray(oVal))
        prev[key] = pVal.concat(...oVal);
      else if (isObject(pVal) && isObject(oVal))
        prev[key] = merge(pVal, oVal);
      else
        prev[key] = oVal;
    });
    return prev;
  }, {});
}
function init2() {
  if (fs2.existsSync("config.json")) {
    try {
      const blob = fs2.readFileSync("config.json");
      const obj = JSON.parse(blob.toString());
      config2 = merge(config2, obj);
    } catch (err) {
      log4.info("Configuration error", { file: "config.json", err });
    }
    config2.answers.version = { name, version };
    log4.info("Configuration", { file: "config.json" });
  } else {
    log4.info("Configuration missing", { file: "config.json" });
  }
}
var get3 = () => config2;

// src/monitor.ts
var timeout = 250;
async function checkSocket(server2) {
  return new Promise((resolve) => {
    const srcStatus = { lookup: false, connect: false, error: "", ready: false, data: false };
    const src = net.connect(get3().http2.port, server2.url);
    src.on("lookup", () => {
      srcStatus.lookup = true;
    });
    src.on("connect", () => {
      srcStatus.connect = true;
    });
    src.on("error", (error4) => {
      srcStatus.error = error4.message || JSON.stringify(error4, null, 2);
    });
    src.on("ready", () => {
      srcStatus.ready = true;
    });
    const tgtStatus = { lookup: false, connect: false, error: "", ready: false, data: false };
    const tgt = net.connect(server2.port, server2.target);
    tgt.on("lookup", () => {
      tgtStatus.lookup = true;
    });
    tgt.on("connect", () => {
      tgtStatus.connect = true;
    });
    tgt.on("data", (data2) => {
      tgtStatus.data = data2.toString().startsWith("HTTP");
    });
    tgt.on("error", (error4) => {
      tgtStatus.error = error4.message || JSON.stringify(error4, null, 2);
    });
    tgt.on("ready", () => {
      tgtStatus.ready = true;
      tgt.end();
    });
    setTimeout(() => {
      tgt.destroy();
      src.destroy();
      resolve({ timestamp: new Date(), server: server2, url: srcStatus, target: tgtStatus });
    }, timeout);
  });
}
async function check() {
  const out = [];
  if (!get3().redirects || get3().redirects.length <= 0)
    log5.warn("monitor", { targets: 0 });
  for (const server2 of get3().redirects) {
    const res = await checkSocket(server2);
    out.push(res);
    if (!res.url.error && !res.target.error)
      log5.state("monitor", { server: server2, url: res.url, target: res.target });
    else
      log5.warn("monitor", { server: server2, url: res.url, target: res.target });
  }
  return out;
}
async function start() {
  check();
  if (get3().monitor)
    setInterval(check, 5 * 60 * 60 * 1e3);
}

// src/server.ts
var fs3 = __toESM(require("fs"));
var os = __toESM(require("os"));
var zlib = __toESM(require("zlib"));
var path = __toESM(require("path"));
var http2 = __toESM(require("http"));
var http22 = __toESM(require("http2"));
var process3 = __toESM(require("process"));
var log8 = __toESM(require("@vladmandic/pilogger"));

// src/logger.ts
var log6 = __toESM(require("@vladmandic/pilogger"));
var Record = class {
  constructor(clientReq, proxyReq) {
    __publicField(this, "timestamp");
    __publicField(this, "method");
    __publicField(this, "protocol");
    __publicField(this, "status");
    __publicField(this, "scheme");
    __publicField(this, "host");
    __publicField(this, "url");
    __publicField(this, "ip");
    __publicField(this, "length");
    __publicField(this, "agent");
    __publicField(this, "device");
    __publicField(this, "country");
    __publicField(this, "continent");
    __publicField(this, "city");
    __publicField(this, "asn");
    __publicField(this, "lat");
    __publicField(this, "lon");
    __publicField(this, "accuracy");
    __publicField(this, "etag");
    __publicField(this, "mime");
    __publicField(this, "cookie");
    __publicField(this, "jwt");
    __publicField(this, "duration");
    const head = clientReq.headers;
    const agent = (clientReq.headers["user-agent"] || "").replace("(KHTML, like Gecko)", "").replace("Mozilla/5.0", "").replace("/  /g", " ");
    const device = agent.match(/\((.*)\)/);
    this.device = device && device.length > 0 ? device[1] : void 0;
    this.agent = agent.replace(/\(.*\)/, "").replace(/  /g, " ").trim().split(" ");
    const peer = clientReq.socket._peername;
    this.ip = peer?.address || clientReq?.socket?.remoteAddress;
    const geo = get2(this.ip || "127.0.0.1");
    this.country = geo.country;
    this.continent = geo.continent;
    this.city = geo.city;
    this.asn = geo.asn;
    this.lat = geo.lat;
    this.lon = geo.lon;
    this.scheme = head[":scheme"] || (clientReq.socket.encrypted ? "https" : "http");
    this.host = head[":authority"] || head.host;
    this.length = proxyReq.headers ? proxyReq.headers["content-length"] || proxyReq.headers["content-size"] : void 0;
    this.etag = proxyReq.headers ? proxyReq.headers["etag"] : void 0;
    this.mime = proxyReq.headers ? proxyReq.headers["content-type"] : void 0;
    this.cookie = head["cookie"] ? true : void 0;
    this.jwt = head["authorization"] ? true : void 0;
    this.method = clientReq.method;
    this.protocol = clientReq.socket.alpnProtocol || clientReq.httpVersion;
    this.status = proxyReq.statusCode;
    this.url = clientReq.url || "";
    if (this.url.length > 64)
      this.url = this.url.substring(0, 64) + "...";
    this.duration = clientReq.headers["timestamp"] ? Number((process.hrtime.bigint() - BigInt(clientReq.headers["timestamp"] || 0)) / 1000000n) : 0;
  }
};
function logger(clientReq, proxyReq) {
  const record = new Record(clientReq, proxyReq);
  const data2 = Object.fromEntries(Object.entries(record).filter(([_key, val]) => val));
  log6.data(data2);
  return record;
}

// src/proxy.ts
var net2 = __toESM(require("net"));
var http = __toESM(require("http"));
var https = __toESM(require("https"));
var tlsOptions = [
  "ca",
  "cert",
  "ciphers",
  "clientCertEngine",
  "crl",
  "dhparam",
  "ecdhCurve",
  "honorCipherOrder",
  "key",
  "passphrase",
  "pfx",
  "rejectUnauthorized",
  "secureOptions",
  "secureProtocol",
  "servername",
  "sessionIdContext",
  "highWaterMark",
  "checkServerIdentity"
];
var kReq = Symbol("req");
var kRes = Symbol("res");
var kProxyCallback = Symbol("callback");
var kProxyReq = Symbol("proxyReq");
var kProxyRes = Symbol("proxyRes");
var kProxySocket = Symbol("proxySocket");
var kConnected = Symbol("connected");
var kOnRes = Symbol("onRes");
async function request({ req, socket, res = socket, head, proxyName }, onReq, onRes) {
  if (req.aborted)
    return null;
  const headers = getRequestHeaders(req, proxyName);
  if (head) {
    if (req.method !== "GET")
      throw new HttpError("only GET request allowed", void 0, 405);
    if (req.headers["upgrade"] !== "websocket")
      throw new HttpError("missing upgrade header", void 0, 400);
    if (head && head.length)
      res.unshift(head);
    setupSocket(res);
    headers["connection"] = "upgrade";
    headers["upgrade"] = "websocket";
  }
  const proxyReq = await onReq({ method: req.method, path: req.originalUrl || req.url, headers });
  if (req.aborted) {
    if (proxyReq?.abort)
      proxyReq.abort();
    else if (proxyReq?.destroy)
      proxyReq.destroy();
    return null;
  }
  if (req.headers["unknown-protocol"]) {
    res.statusCode = 421;
    res.end("uknown target");
    return null;
  }
  let callback;
  const promise = new Promise((resolve, reject) => {
    callback = (err) => err ? reject(err) : resolve(true);
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
  res.on("close", onComplete).on("finish", onComplete).on("error", onComplete);
  req.on("close", onComplete).on("aborted", onComplete).on("error", onComplete);
  proxyReq.on("error", onProxyReqError).on("timeout", onProxyReqTimeout).on("response", onProxyReqResponse).on("upgrade", onProxyReqUpgrade);
  deferToConnect.call(proxyReq);
  return promise;
}
function onSocket(socket) {
  if (!socket.connecting)
    onProxyConnect.call(this);
  else
    socket.once("connect", onProxyConnect.bind(this));
}
function deferToConnect() {
  if (this.socket)
    onSocket.call(this, this.socket);
  else
    this.once("socket", onSocket);
}
function onComplete(err) {
  const res = this[kRes];
  const req = res[kReq];
  if (!res[kProxyCallback])
    return;
  const proxyReq = req[kProxyReq];
  const proxySocket = res[kProxySocket];
  const proxyRes = res[kProxyRes];
  const callback = res[kProxyCallback];
  req[kProxyReq] = null;
  res[kProxySocket] = null;
  res[kProxyRes] = null;
  res[kProxyCallback] = null;
  res.off("close", onComplete).off("finish", onComplete).off("error", onComplete);
  req.off("close", onComplete).off("aborted", onComplete).off("error", onComplete).off("data", onReqData).off("end", onReqEnd);
  if (err) {
    err.connectedSocket = Boolean(proxyReq && proxyReq[kConnected]);
    err.reusedSocket = Boolean(proxyReq && proxyReq.reusedSocket);
  }
  if (proxyReq) {
    proxyReq.off("drain", onProxyReqDrain);
    if (proxyReq.abort)
      proxyReq.abort();
    else if (proxyReq.destroy)
      proxyReq.destroy();
  }
  if (proxySocket)
    proxySocket.destroy();
  if (proxyRes)
    proxyRes.destroy();
  callback(err);
}
function onProxyConnect() {
  this[kConnected] = true;
  if (this["method"] === "GET" || this["method"] === "HEAD" || this["method"] === "OPTIONS") {
    this[kReq].resume();
    this.end();
  } else {
    this[kReq].on("data", onReqData).on("end", onReqEnd);
    this.on("drain", onProxyReqDrain);
  }
}
function onReqEnd() {
  this[kProxyReq].end();
}
function onReqData(buf) {
  if (!this[kProxyReq].write(buf))
    this.pause();
}
function onProxyReqDrain() {
  this[kReq].resume();
}
function onProxyReqError(err) {
  err.statusCode = this[kConnected] ? 502 : 503;
  onComplete.call(this, err);
}
function onProxyReqTimeout() {
  onComplete.call(this, new HttpError("proxy timeout", "ETIMEDOUT", 504));
}
async function onProxyReqResponse(proxyRes) {
  const res = this[kRes];
  res[kProxyRes] = proxyRes;
  proxyRes[kRes] = res;
  const headers = setupHeaders(proxyRes.headers);
  proxyRes.on("aborted", onProxyResAborted).on("error", onProxyResError);
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
    for (const [key, value] of Object.entries(headers))
      res.setHeader(key, value);
    proxyRes.on("end", onProxyResEnd).pipe(res);
  }
}
function onProxyReqUpgrade(proxyRes, proxySocket, proxyHead) {
  const res = this[kRes];
  res[kProxySocket] = proxySocket;
  proxySocket[kRes] = res;
  setupSocket(proxySocket);
  if (proxyHead && proxyHead.length)
    proxySocket.unshift(proxyHead);
  res.write(createHttpHeader("HTTP/1.1 101 Switching Protocols", proxyRes.headers));
  proxySocket.on("error", onProxyResError).on("close", onProxyResAborted).pipe(res).pipe(proxySocket);
}
function onProxyResError(err) {
  err.statusCode = 502;
  onComplete.call(this, err);
}
function onProxyResAborted() {
  onComplete.call(this, new HttpError("proxy aborted", "ECONNRESET", 502));
}
function onProxyResEnd() {
  if (this.trailers)
    this[kRes].addTrailers(this.trailers);
}
function createHttpHeader(line, headers) {
  let head = line;
  for (const [key, value] of Object.entries(headers)) {
    if (!Array.isArray(value)) {
      head += `\r
${key}: ${value}`;
    } else {
      for (let i = 0; i < value.length; i++)
        head += `\r
${key}: ${value[i]}`;
    }
  }
  head += "\r\n\r\n";
  return Buffer.from(head, "ascii");
}
function getRequestHeaders(req, proxyName) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (key.charAt(0) !== ":" && key !== "host")
      headers[key] = value;
  }
  if (proxyName) {
    if (headers["via"]) {
      for (const name2 of headers["via"].split(",")) {
        if (name2.endsWith(proxyName))
          throw new HttpError("loop detected", void 0, 508);
      }
      headers["via"] += ",";
    } else {
      headers["via"] = "";
    }
    headers["via"] += `${req.httpVersion} ${proxyName}`;
  }
  function printIp(address, port) {
    const isIPv62 = net2.isIPv6(address);
    let str = `${address}`;
    if (isIPv62)
      str = `[${str}]`;
    if (port)
      str = `${str}:${port}`;
    if (isIPv62 || port)
      str = `"${str}"`;
    return str;
  }
  const forwarded = [
    `by=${printIp(req.socket.localAddress, req.socket.localPort)}`,
    `for=${printIp(req.socket.remoteAddress, req.socket.remotePort)}`,
    `proto=${req.socket.encrypted ? "https" : "http"}`,
    `host=${printIp(req.headers[":authority"] || req.headers["host"] || "")}`
  ].join(";");
  if (headers["forwarded"])
    headers["forwarded"] += `, ${forwarded}`;
  else
    headers["forwarded"] = `${forwarded}`;
  return setupHeaders(headers);
}
function setupSocket(socket) {
  socket.setTimeout(0);
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 0);
}
function setupHeaders(headers) {
  if (headers["connection"] && headers["connection"] !== "connection" && headers["connection"] !== "keep-alive") {
    for (const name2 of headers["connection"].toLowerCase().split(","))
      delete headers[name2.trim()];
  }
  delete headers["connection"];
  delete headers["proxy-connection"];
  delete headers["keep-alive"];
  delete headers["proxy-authenticate"];
  delete headers["proxy-authorization"];
  delete headers["te"];
  delete headers["trailer"];
  delete headers["transfer-encoding"];
  delete headers["upgrade"];
  delete headers["http2-settings"];
  return headers;
}
var HttpError = class extends Error {
  constructor(msg, code, statusCode) {
    super(msg);
    __publicField(this, "code");
    __publicField(this, "statusCode");
    this.code = code;
    this.statusCode = statusCode || 500;
  }
};
function process2(proxy) {
  proxy.ws = function ws(req, socket, head, options, callback) {
    const promise = compat({ req, socket, head }, options);
    if (!callback)
      return promise;
    return promise.then(() => callback(null, req, socket, head)).catch((err) => callback(err, req, socket, head));
  };
  proxy.web = function web(req, res, options, callback) {
    const promise = compat({ req, res }, options);
    if (!callback)
      return promise;
    return promise.then(() => callback(null, req, res)).catch((err) => callback(err, req, res));
  };
  async function compat(ctx, options) {
    const { req, res } = ctx;
    const { hostname, port, path: path2, socketPath, protocol, timeout: timeout2, proxyTimeout, proxyName, onReq, onRes } = options;
    if (timeout2)
      req.setTimeout(timeout2);
    await proxy(
      { ...ctx, proxyName },
      async (ureq) => {
        for (const key of tlsOptions) {
          if (Reflect.has(options, key)) {
            const value = Reflect.get(options, key);
            Reflect.set(ureq, key, value);
          }
        }
        if (hostname)
          ureq.hostname = hostname;
        if (port)
          ureq.port = port;
        if (path2)
          ureq.path = path2;
        if (proxyTimeout)
          ureq.timeout = proxyTimeout;
        if (socketPath)
          ureq.socketPath = socketPath;
        let ret;
        if (onReq) {
          if (onReq.length <= 2) {
            ret = await onReq(req, ureq);
          } else {
            ret = await new Promise((resolve, reject) => {
              const promiseOrReq = onReq(req, ureq, (err, val) => err ? reject(err) : resolve(val));
              if (promiseOrReq) {
                if (promiseOrReq.then)
                  promiseOrReq.then(resolve).catch(reject);
                else if (promiseOrReq.abort)
                  resolve(promiseOrReq);
                else
                  throw new Error("onReq must return a promise or a request object");
              } else {
                reject();
              }
            });
          }
        }
        if (!ret) {
          let agent;
          if (protocol == null || /^(http|ws):?$/.test(protocol))
            agent = http;
          else if (/^(http|ws)s:?$/.test(protocol))
            agent = https;
          else
            throw new Error("invalid protocol");
          if (ureq.hostname && ureq.port)
            ret = agent.request(ureq);
          else
            req.headers["unknown-protocol"] = "true";
        }
        return ret;
      },
      onRes ? async (proxyRes, headers) => {
        proxyRes.headers = headers;
        if (onRes.length <= 3)
          return onRes(req, res, proxyRes);
        return new Promise((resolve, reject) => {
          const promise = onRes(req, res, proxyRes, (err, val) => err ? reject(err) : resolve(val));
          if (promise && promise.then) {
            promise.then(resolve).catch(reject);
          }
        });
      } : null
    );
  }
  return proxy;
}
var proxy_default = process2(request);

// src/middleware.ts
var import_connect = __toESM(require("connect"));
var import_helmet = __toESM(require("helmet"));
var log7 = __toESM(require("@vladmandic/pilogger"));
var bucket = [];
var cfg = get3();
function limiter(req, res, next) {
  if (!cfg.limiter)
    next();
  const ip = req.socket.remoteAddress;
  const now = Math.trunc(new Date().getTime() / 1e3);
  let i = bucket.findIndex((a) => a[0] === ip);
  if (i === -1) {
    bucket.push([ip, now, cfg.limiter.tokens]);
    i = bucket.findIndex((a) => a[0] === ip);
  }
  const consume = now - bucket[i][1] < cfg.limiter.interval;
  if (consume) {
    bucket[i][2] -= 1;
    bucket[i][2] = Math.max(bucket[i][2], 0);
  } else {
    bucket[i][2] += Math.trunc((now - bucket[i][1]) / cfg.limiter.interval);
    bucket[i][2] = Math.min(bucket[i][2], cfg.limiter.tokens);
  }
  if (bucket[i][2] === cfg.limiter.tokens)
    bucket[i][1] = now;
  if (bucket[i][2] === 0) {
    res.setHeader("Retry-After", cfg.limiter.interval);
    res.writeHead(429);
    res.end();
    logger(req, req);
  } else {
    next();
  }
}
async function init3() {
  const app2 = (0, import_connect.default)();
  cfg = get3();
  if (cfg.helmet) {
    const short = JSON.parse(JSON.stringify(cfg.helmet));
    short.contentSecurityPolicy.directives = { count: [Object.keys(short.contentSecurityPolicy.directives).length.toString()] };
    log7.info("Helmet", short);
    app2.use((0, import_helmet.default)(cfg.helmet));
  }
  if (cfg.limiter) {
    log7.info("Limiter", cfg.limiter);
    app2.use(limiter);
  }
  if (cfg.compress) {
    log7.info("Compression", { brotli: cfg.compress });
  }
  return app2;
}

// src/errors.ts
function get404(obj) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>proxy Error</title>
      <meta http-equiv="content-type">
      <meta content="text/html; charset=utf-8">
      <meta name="Description" content="proxy Error">
      <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=yes">
      <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon">
    </head>
    <body style="background: black; color: #ebebeb; line-height: 2rem; font-family: sans-serif; text-align: center; letter-spacing: 2px">
      <div style="font-size: 1.3rem; margin-top: 40px">
        <font color="lightcoral"><b>Error 404</b> for URL: <b>${obj.scheme}://${obj.host}${obj.url}</b><br>
        The requested URL was not found on this server. That's it.</font><br>
      </div>
      <div style="font-size: 1.0rem; margin-top: 40px">
        Client IP</b>: <b>${obj.ip}</b><br>
        ${obj.agent ? "Agent: <b>" + obj.agent + "</b><br>" : ""}
        ${obj.device ? "Device: <b>" + obj.device + "</b><br>" : ""}
        ${obj.geo?.city ? "Location: <b>" + obj.geo.city + "</b>, <b>" + obj.geo.country + "</b><br>" : ""}
        ${obj.geo?.asn ? "ASN: <b>" + obj.geo.asn + "</b>" : ""}
        ${obj.geo?.lat ? "Coordinates: <b>" + obj.geo.lat + "\xB0</b>, <b>" + obj.geo.lon + "\xB0</b><br>" : ""}
      </div>
    </body>
    </html>
  `;
}

// src/answers.ts
async function get4(req, res, next) {
  let status = 200;
  let html;
  let type = "text/plain";
  switch (req.url) {
    case "/security.txt":
    case "/.well-known/security.txt":
      html = get3().answers["security.txt"];
      break;
    case "/robots.txt":
    case "/.well-known/robots.txt":
      html = get3().answers["robots.txt"];
      break;
    case "/humans.txt":
    case "/.well-known/humans.txt":
      html = get3().answers["humans.txt"];
      break;
    case "/sitemap.xml":
    case "/.well-known/sitemap.xml":
      const host = req.headers[":authority"]?.toString() || req.headers.host?.toString() || "";
      html = (get3().answers["sitemap.xml"] || "").replace("URL", host);
      type = "text/xml";
      status = 451;
      break;
    case "/.git/HEAD":
      html = get3().answers["git.head"];
      status = 403;
      break;
    case "/ver":
    case "/version":
      html = JSON.stringify(get3().answers["version"], null, 2);
      type = "application/json";
      break;
    default:
      next();
      return;
  }
  if (!html) {
    next();
    return;
  }
  res.writeHead(status, { "Content-Type": `'${type}'`, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" });
  logger(req, req);
  res.end(html, "utf-8");
}

// src/server.ts
var app;
var server;
var ssl;
var cfg2 = get3();
function errorHandler(err, req, res) {
  if (err) {
    const client = `${req.headers[":scheme"] || (req.socket.encrypted ? "https" : "http")}://${req.headers[":authority"] || req.headers.host}${req.url}`;
    if (err.statusCode)
      log8.error("Proxy", { client, status: err.statusCode, code: err.code, address: err.address, port: err.port });
    else
      log8.error("Proxy", { client, err });
    res.setHeader("proxy-error", err);
    if (err.statusCode)
      res.writeHead(err.statusCode, req.headers);
    res.end();
  }
}
function redirectSecure() {
  if (!cfg2.redirectHTTP)
    return;
  const redirector = http2.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
    logger(req, req);
  });
  redirector.on("error", (err) => log8.error("server", { message: err.message || err }));
  redirector.on("close", () => log8.state("server", { status: "closed" }));
  redirector.listen(80);
}
function writeHeaders(input, output, compress) {
  const tempHeaders = [...Object.entries(output.getHeaders())];
  for (const key of Object.keys(output.getHeaders()))
    output.removeHeader(key);
  for (const [key, val] of Object.entries(input.headers)) {
    if (compress && key.toLowerCase().includes("content-length"))
      output.setHeader("content-size", val);
    else
      output.setHeader(key, val);
    delete input.headers[key];
  }
  for (const header of tempHeaders) {
    output.setHeader(header[0], header[1] || "");
  }
  if (!output.getHeader("content-type")?.toString().startsWith("text/html"))
    output.removeHeader("content-security-policy");
  output.setHeader("x-content-type-options", "nosniff");
  if (compress)
    output.setHeader("content-encoding", "br");
}
function writeData(req, input, output) {
  const encoding = (input.headers["content-encoding"] || "").length > 0;
  const accept = req.headers["accept-encoding"] ? req.headers["accept-encoding"].includes("br") : false;
  const acceptCompress = cfg2.compress ? cfg2.compress > 0 && !encoding && accept : false;
  writeHeaders(input, output, acceptCompress);
  output.setHeader("Cross-Origin-Embedder-Policy", "unsafe-none");
  output.setHeader("Cross-Origin-Opener-Policy", "unsafe-none");
  output.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  const compress = zlib.createBrotliCompress({ params: { [zlib.constants.BROTLI_PARAM_QUALITY]: cfg2.compress } });
  if (!acceptCompress)
    input.pipe(output);
  else
    input.pipe(compress).pipe(output);
  return output;
}
var findTarget = {
  timestamp: 0n,
  onReq: (clientReq, outputReq) => {
    clientReq.headers["timestamp"] = process3.hrtime.bigint().toString();
    const url = `${clientReq.headers[":scheme"]}://${clientReq.headers[":authority"]}${clientReq.headers[":path"]}`;
    const tgt = cfg2.redirects.find((a) => url.match(a.url || "missing-url-property")) || cfg2.redirects.find((a) => a.default === true);
    outputReq.hostname = tgt?.target;
    outputReq.port = tgt?.port;
    if (!tgt) {
      clientReq.statusCode = 421;
      logger(clientReq, clientReq);
    }
    if (!outputReq.headers)
      outputReq.headers = {};
    outputReq.headers["x-forwarded-for"] = clientReq.socket.remoteAddress;
    outputReq.headers["x-forwarded-proto"] = clientReq.socket.encrypted ? "https" : "http";
    outputReq.headers["x-forwarded-host"] = clientReq.headers[":authority"] || clientReq.headers.host;
  },
  onRes: (clientReq, final, proxyReq) => {
    final.statusCode = proxyReq.statusCode || 503;
    const obj = logger(clientReq, proxyReq);
    switch (proxyReq.statusCode) {
      case 404:
        final.setHeader("content-security-policy", "default-src 'self' 'unsafe-inline'");
        final.setHeader("content-type", "text/html");
        final.end(get404(obj));
        return final;
      default:
        return writeData(clientReq, proxyReq, final);
    }
  }
};
function dropPriviledges() {
  log8.state("server", { user: os.userInfo() });
  const uid = parseInt(process3.env.SUDO_UID || "");
  if (uid) {
    if (process3.setuid)
      process3.setuid(uid);
    log8.state("server user override", { uid: process3.getuid ? process3.getuid() : "unknown" });
  }
}
function startServer() {
  let key;
  let cert;
  if (!fs3.existsSync(path.join(__dirname, ssl.key)))
    log8.warn("ssl key missing:", ssl);
  else
    key = fs3.readFileSync(path.join(__dirname, ssl.key));
  if (!fs3.existsSync(path.join(__dirname, ssl.crt)))
    log8.warn("ssl key missing:", ssl);
  else
    cert = fs3.readFileSync(path.join(__dirname, ssl.crt));
  if (!key || !cert)
    log8.warn("server", { ssl: "fail" });
  server = http22.createSecureServer({ ...cfg2.http2, key, cert });
  server.on("listening", () => {
    log8.state("server", { status: "listening", ...server.address() });
    dropPriviledges();
  });
  server.on("error", (err) => log8.error("server", { message: err.message || err }));
  server.on("close", () => log8.state("server", { status: "closed" }));
  server.on("request", app);
  server.listen(cfg2.http2.port);
}
function restartServer() {
  if (!server) {
    log8.warn("server", { status: "not started" });
    return;
  }
  log8.info("server", { status: "restarting" });
  server.close();
  setTimeout(() => startServer(), 2e3);
}
function checkServer() {
  server.getConnections((error4, connections) => {
    if (server.listening)
      log8.state("server", { status: "active", connections, error: error4 });
    else
      log8.error("server", { status: "not listening", connections, error: error4 });
  });
  setTimeout(checkServer, 6e4);
}
async function init4(sslOptions) {
  ssl = sslOptions;
  cfg2 = get3();
  await redirectSecure();
  app = await init3();
  startServer();
  if (!cfg2.redirects || cfg2.redirects.length <= 0)
    log8.warn("Proxy", { rules: 0 });
  for (const rule of cfg2.redirects)
    log8.info("Proxy", rule);
  log8.info("Static", { paths: Object.keys(cfg2.answers) });
  app.use((req, res, next) => get4(req, res, next));
  app.use((req, res) => proxy_default.web(req, res, findTarget, errorHandler));
  setTimeout(checkServer, 5e3);
}

// src/index.ts
function exit(signal) {
  log9.warn("exit", { signal });
  process.exit(0);
}
function error3(err) {
  log9.error("exception");
  for (const line of (err.stack || "").split("\n"))
    log9.error(line);
  process.exit(1);
}
async function main() {
  process.on("SIGINT", () => exit("sigint"));
  process.on("SIGHUP", () => exit("sighup"));
  process.on("SIGTERM", () => exit("sigterm"));
  process.on("uncaughtException", (err) => error3(err));
  init2();
  const cfg3 = get3();
  log9.configure({ logFile: cfg3.logFile, inspect: { breakLength: 1024 } });
  log9.headerJson();
  await update(cfg3.noip);
  log9.info("SSL", cfg3.ssl);
  if (cfg3?.acme?.domains?.length > 0) {
    await acme.setConfig(cfg3.acme);
    const reverseRouteOK = await acme.testConnection(cfg3.acme.domains[0]);
    const cert = await acme.parseCert();
    if (cert.account.error)
      log9.warn("SSL Account", { code: cert?.account?.error?.code, syscall: cert?.account?.error?.syscall, path: cert?.account?.error?.path });
    else
      log9.info("SSL Account", { contact: cert.account.contact, status: cert.account.status, type: cert.accountKey.type, crv: cert.accountKey.crv });
    if (cert.fullChain.error)
      log9.warn("SSL Server", { code: cert?.fullChain?.error?.code, syscall: cert?.fullChain?.error?.syscall, path: cert?.fullChain?.error?.path });
    else
      log9.info("SSL Server", { subject: cert.fullChain.subject, issuer: cert.fullChain.issuer, algorithm: cert.fullChain.algorithm, from: cert.fullChain.notBefore, until: cert.fullChain.notAfter, type: cert.serverKey.type, use: cert.serverKey.use });
    if (reverseRouteOK) {
      await acme.getCert();
      await acme.monitorCert(restartServer);
    } else {
      log9.warn("No reverse route to server, skipping certificate monitoring and auto-renewal");
    }
  }
  await init(cfg3.geoIP.city, cfg3.geoIP.asn);
  await init4(cfg3.ssl);
  await start();
}
main();
//# sourceMappingURL=piproxy.js.map
