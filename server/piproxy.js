const log = require('pilogger');
const acme = require('piacme');
const crypto = require('crypto');
const noip = require('./noip.js');
const geoip = require('./geoip.js');
const changelog = require('./changelog.js');
const proxy = require('./proxy.js');
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
  http2: {
    allowHTTP1: true, // allow http or just h2
    port: 443,
    secureOptions: crypto.constants.SSL_OP_NO_TLSv1 | crypto.constants.SSL_OP_NO_TLSv1_1,
    // key: fs.readFileSync(global.config.acme.ServerKeyFile),
    // cert: fs.readFileSync(global.config.acme.fullChain),
  },
  redirectHTTP: true, // redirect http to https
  redirects: [
    { url: 'pigallery.ddns.net', target: 'localhost', port: '10010' },
    { url: 'pidash.ddns.net', target: 'localhost', port: '10000' },
    { url: 'wyse', target: 'localhost', port: '10010' },
    { default: true, target: 'localhost', port: '10010' },
  ],
};

async function main() {
  // Log startup
  log.logFile(global.config.logFile);
  log.info(node.name, 'version', node.version);
  log.info('Platform:', process.platform, 'Arch:', process.arch, 'Node:', process.version);
  // Update changelog from git repository
  changelog.update('CHANGELOG.md');
  // update NoIP
  await noip.update(global.config.noip);
  // Check & Update SSL Certificate
  await acme.init(global.config.acme);
  const ssl = await acme.getCert();
  acme.monitorCert();
  // Load GeoIP DB
  await geoip.init();
  // Start actual redirector
  proxy.init(ssl);
}

main();
