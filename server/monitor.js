const net = require('net');
const log = require('@vladmandic/pilogger');

const timeout = 250;

async function check(server) {
  return new Promise((resolve) => {
    const srcStatus = {};
    // @ts-ignore
    const src = net.connect(global.config.http2.port, server.url);
    src.on('lookup', () => { srcStatus.lookup = true; });
    src.on('connect', () => { srcStatus.connect = true; });
    src.on('error', (error) => { srcStatus.error = error.message || error; });
    src.on('ready', () => { srcStatus.ready = true; });
    const tgtStatus = {};
    const tgt = net.connect(server.port, server.target);
    tgt.on('lookup', () => { tgtStatus.lookup = true; });
    tgt.on('connect', () => { tgtStatus.connect = true; });
    tgt.on('data', (data) => { tgtStatus.data = data.toString().startsWith('HTTP'); });
    tgt.on('error', (error) => { tgtStatus.error = error.message || error; });
    tgt.on('ready', () => {
      tgtStatus.ready = true;
      // const head = `HEAD /favicon.ico HTTP/1.1\r\nHost: ${server.target}\r\nUser-Agent: PiProxy\r\nAccept: */*\r\nConnection: close\r\n\r\n`;
      // tgt.write(head);
      tgt.end();
    });
    setTimeout(() => {
      tgt.destroy();
      src.destroy();
      resolve({ timestamp: new Date(), server, url: srcStatus, target: tgtStatus });
    }, timeout);
  });
}

async function monitor() {
  const out = [];
  // @ts-ignore
  for (const server of global.config.redirects) {
    const res = await check(server);
    out.push(res);
    if (!res.url.error && !res.target.error) log.state('Monitoring:', server, 'URL:', res.url, 'Target:', res.target);
    else log.warn('Monitoring:', server, 'URL:', res.url, 'Target:', res.target);
  }
  return out;
}

async function start() {
  monitor();
  // @ts-ignore
  if (global.config.monitor) setInterval(monitor, 5 * 60 * 1000);
}

async function test() {
  // @ts-ignore
  global.config = {
    redirects: [
      { url: 'pidash.ddns.net', target: 'localhost', port: '10000' },
      { url: 'pigallery.ddns.net', target: 'localhost', port: '10010' },
      { url: 'pimiami.ddns.net', target: 'localhost', port: '10020' },
      { default: true, target: 'localhost', port: '10020' },
    ],
    http2: {
      allowHTTP1: true,
      port: 443,
    },
  };
  monitor();
}

try {
  if (require.main === module) test();
} catch {
  //
}

exports.start = start;
exports.get = monitor;
