const path = require('path');
const crypto = require('crypto');
const useragent = require('useragent');
const log = require('pilogger');
const acme = require('piacme');
const redbird = require('redbird');
const http = require('http');
const noip = require('./noip.js');
const geoip = require('./geoip.js');
const changelog = require('./changelog.js');
const node = require('../package.json');
// eslint-disable-next-line node/no-unpublished-require
const secrets = require('../cert/secrets.json'); // create private secrets file as required

global.config = {
  logFile: 'piproxy.log',
  noip: {
    host: ['pidash.ddns.net', 'pigallery.ddns.net', 'pimiami.ddns.net'],
    user: secrets.noip.user,
    password: secrets.noip.password,
  },
  acme: {
    application: 'piproxy/1.0.0',
    domains: ['pidash.ddns.net', 'pigallery.ddns.net', 'pimiami.ddns.net'],
    maintainer: 'mandic00@live.com',
    subscriber: 'mandic00@live.com',
    accountFile: './cert/account.json',
    accountKeyFile: './cert/account.pem',
    ServerKeyFile: './cert//private.pem',
    fullChain: './cert/fullchain.pem',
  },
};

global.options = {
  redirect: true,
  // port: 80, // disable proxy on port 80 and use redirect http -> https instead
  secure: true,
  bunyan: false,
  xfwd: true,
  ssl: {
    http2: false,
    port: 443,
    redirectPort: 443,
    key: '',
    cert: '',
    redirect: true,
    secureOptions: crypto.constants.SSL_OP_NO_TLSv1,
    allowHTTP1: true,
    // serverModule: http2,
  },
  // using my piacme module instead
  // letsencrypt: { path: path.join(__dirname, '/cert'), port: 9999, email: '', production: true },
};

global.redirects = [
  { source: 'pimiami.ddns.net/dashboard', target: 'http://127.0.0.1:10000' },
  { source: 'pimiami.ddns.net/gallery', target: 'http://127.0.0.1:10010' },

  { source: 'pidash.ddns.net', target: 'http://127.0.0.1:10000' },
  { source: 'pigallery.ddns.net', target: 'http://127.0.0.1:10010' },

  // { source: 'pidash.ddns.net', target: 'https://127.0.0.1:10001' },
  // { source: 'pigallery.ddns.net', target: 'https://127.0.0.1:10011' },
];

function logger(res, req) {
  const ip = req.socket.remoteAddress;
  const head = req.headers;
  const agent = useragent.lookup(head['user-agent']);
  const agentDetails = `OS:'${agent.os.family}' Device:'${agent.device.family}' Agent:'${agent.family}.${agent.major}.${agent.minor}'`;
  const peer = req.socket._peername || {};
  const geo = peer.address ? geoip.get(peer.address) : {};
  const geoDetails = geo.country ? `Geo:'${geo.country}/${geo.city}' ASN:'${geo.asn}' Loc:${geo.lat},${geo.lon}` : '';
  const size = head['content-length'] || head['content-size'] || 0;
  log.data(`${req.method}/${req.socket.alpnProtocol || req.httpVersion} Code:${res.statusCode} ${head['x-forwarded-proto'] || 'http'}://${head.host}${req.url} From:${peer.family}${peer.address || ip}:${peer.port} Size:${size} ${agentDetails} ${geoDetails}`);
}

function redirect() {
  if (!global.options.redirect) return;
  const server = http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
    logger(res, req);
  });
  server.listen(80);
}

async function main() {
  log.logFile(global.config.logFile);
  log.info(node.name, 'version', node.version);
  log.info('Platform:', process.platform, 'Arch:', process.arch, 'Node:', process.version);

  changelog.update('CHANGELOG.md');
  await noip.update(global.config.noip);
  await acme.init(global.config.acme);
  const ssl = await acme.getCert();
  global.options.ssl.key = path.join(__dirname, ssl.Key);
  global.options.ssl.cert = path.join(__dirname, ssl.Crt);
  acme.monitorCert();
  await geoip.init();

  // log.info('Proxy options', JSON.stringify(global.options));
  const proxy = redbird(global.options);
  proxy.notFound((req, res) => {
    res.statusCode = 404;
    res.write('Error: 404 Not found');
    res.end();
  });
  // proxy.proxy.on('proxyReq', logger);
  proxy.proxy.on('proxyRes', logger);
  redirect();

  for (const entry of global.redirects) {
    log.state(`Redirecting ${entry.source} to ${entry.target}`);
    proxy.register(entry.source, entry.target);
  }
}

main();
