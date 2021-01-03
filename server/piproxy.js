const fs = require('fs');
const log = require('@vladmandic/pilogger');
const acme = require('@vladmandic/piacme');
const crypto = require('crypto');
const noip = require('./noip.js');
const geoip = require('./geoip.js');
const changelog = require('./changelog.js');
const monitor = require('./monitor.js');
const server = require('./server.js');

let secrets = {};
if (fs.existsSync('./cert/secrets.json')) { // create private secrets file as required
  const blob = fs.readFileSync('./cert/secrets.json');
  secrets = JSON.parse(blob.toString());
}

// @ts-ignore
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
  ssl: {
    Key: 'file-with-server-private-key',
    Crt: 'file-with-server-certificate',
  },
  http2: {
    allowHTTP1: true,
    port: 443,
    secureOptions: crypto.constants.SSL_OP_NO_TLSv1 | crypto.constants.SSL_OP_NO_TLSv1_1,
  },
  redirectHTTP: true, // redirect http to https
  redirects: [
    { url: 'pidash.ddns.net', target: 'localhost', port: '10000' },
    { url: 'pidash.local', target: 'localhost', port: '10000' },
    { url: 'pigallery.ddns.net', target: 'localhost', port: '10010' },
    { url: 'pigallery.local', target: 'localhost', port: '10010' },
    { url: 'piclock.ddns.net', target: 'localhost', port: '10020' },
    { url: 'piclock.local', target: 'localhost', port: '10020' },
    { url: 'human.ddns.net', target: 'localhost', port: '10030' },
    { url: 'human.local', target: 'localhost', port: '10030' },
    { url: 'stocks.local', target: 'localhost', port: '10040' },
    { url: 'pimiami.ddns.net', target: 'localhost', port: '10040' },
    { default: true, target: 'localhost', port: '10020' },
  ],
  limiter: {
    interval: 10,
    tokens: 500,
  },
  compress: 5,
  db: 'piproxy.db',
  monitor: true,
  geoIP: {
    city: './geoip/GeoLite2-City.mmdb',
    asn: './geoip/GeoLite2-ASN.mmdb',
  },
  helmet: {
    frameguard: { action: 'deny' },
    xssFilter: false,
    dnsPrefetchControl: { allow: 'true' },
    noSniff: false,
    hsts: { maxAge: 15552000, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
    expectCt: { enforce: true },
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'http:', 'https:'],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https:'],
        'style-src': ["'self'", 'https:', "'unsafe-inline'"],
        'connect-src': ["'self'", 'http:', 'https:', 'data:'],
        'upgrade-insecure-requests': [],
      },
    },
  },
  'security.txt': 'Contact: mailto:mandic00@live.com\nPreferred-Languages: en\n',
  'humans.txt': '/* TEAM */\nChef: Vladimir Mandic\nContact: mandic00@live.com\nGitHub: https://github.com/vladmandic\n',
  'robots.txt': 'User-agent: *\nDisallow: /private\nCrawl-delay: 10\n',
  'git.head': 'ref: refs/heads/master\n',
  'sitemap.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url>\n<loc>URL</loc>\n</url>\n</urlset>',
};

async function main() {
  // Log startup
  // @ts-ignore
  log.configure({ logFile: global.config.logFile });
  log.header();
  // Update changelog from git repository
  await changelog.update('CHANGELOG.md');
  // update NoIP
  // @ts-ignore
  await noip.update(global.config.noip);
  // Check & Update SSL Certificate
  let ssl = {};
  // @ts-ignore
  if (global.config.acme && global.config.acme.application) {
    // @ts-ignore
    await acme.init(global.config.acme);
    ssl = await acme.getCert();
  } else {
    // @ts-ignore
    ssl = global.config.ssl;
  }
  // Load GeoIP DB
  await geoip.init();
  // Start actual redirector
  await server.init(ssl);
  // Monitor SSL Certificates
  await acme.monitorCert(server.restart);
  // Monitor target servers
  await monitor.start();
}

main();
