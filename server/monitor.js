const net = require('net');
const log = require('@vladmandic/pilogger');

async function monitor() {
  for (const server of global.config.redirects) {
    const srcStatus = {};
    const src = net.connect(global.config.http2.port, server.url);
    src.on('lookup', () => { srcStatus.lookup = true; });
    src.on('connect', () => { srcStatus.connect = true; });
    src.on('ready', () => { srcStatus.ready = true; });
    src.on('error', () => { srcStatus.error = true; });
    // src.on('close', () => log.state('Monitoring', server, srcStatus));
    const tgtStatus = {};
    const tgt = net.connect(server.port, server.target);
    tgt.on('lookup', () => { tgtStatus.lookup = true; });
    tgt.on('connect', () => { tgtStatus.connect = true; });
    tgt.on('ready', () => { tgtStatus.ready = true; });
    tgt.on('error', () => { tgtStatus.error = true; });
    // tgt.on('close', () => log.state('Monitoring', server, tgtStatus));
    // sock.on('end', () => log.data('end'));
    // sock.on('data', (data) => log.data('data', data));
    setTimeout(() => {
      src.end();
      tgt.end();
      if (!srcStatus.error && !tgtStatus.error) log.state('Monitoring:', server, 'URL:', srcStatus, 'Target:', tgtStatus);
      else log.warn('Monitoring:', server, 'URL:', srcStatus, 'Target:', tgtStatus);
    }, 250);
  }
}

async function start() {
  monitor();
  if (global.config.monitor) setInterval(monitor, 5 * 60 * 1000);
}

async function test() {
  global.config = {
    redirects: [
      { url: 'pidash.ddns.net', target: 'localhost', port: '10000' },
      { url: 'pigallery.ddns.net', target: 'localhost', port: '10010' },
      { url: 'pimiami.ddns.net', target: 'localhost', port: '10050' },
      { default: true, target: 'localhost', port: '10010' },
    ],
    http2: {
      allowHTTP1: true,
      port: 443,
    },
  };
  monitor();
}

if (!module.parent) test();

exports.start = start;
