import * as net from 'net';
import * as log from '@vladmandic/pilogger';
import * as config from './config';

const timeout = 250;

type SocketStatus = {
  lookup: boolean,
  connect: boolean,
  error: string,
  ready: boolean,
  data: boolean,
}

async function checkSocket(server): Promise<{ timestamp: Date, server: string, url: SocketStatus, target: SocketStatus }> {
  return new Promise((resolve) => {
    const srcStatus: SocketStatus = { lookup: false, connect: false, error: '', ready: false, data: false };
    const src = net.connect(config.get().http2.port, server.url);
    src.on('lookup', () => { srcStatus.lookup = true; });
    src.on('connect', () => { srcStatus.connect = true; });
    src.on('error', (error) => { srcStatus.error = error.message || JSON.stringify(error, null, 2); });
    src.on('ready', () => { srcStatus.ready = true; });
    const tgtStatus: SocketStatus = { lookup: false, connect: false, error: '', ready: false, data: false };
    const tgt = net.connect(server.port, server.target);
    tgt.on('lookup', () => { tgtStatus.lookup = true; });
    tgt.on('connect', () => { tgtStatus.connect = true; });
    tgt.on('data', (data) => { tgtStatus.data = data.toString().startsWith('HTTP'); });
    tgt.on('error', (error) => { tgtStatus.error = error.message || JSON.stringify(error, null, 2); });
    tgt.on('ready', () => {
      tgtStatus.ready = true;
      // const head = `HEAD /favicon.ico HTTP/1.1\r\nHost: ${server.target}\r\nUser-Agent: proxy\r\nAccept: */*\r\nConnection: close\r\n\r\n`;
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

export async function check() {
  const out: Array<{ timestamp: Date, server: string, url: SocketStatus, target: SocketStatus }> = [];
  if (!config.get().redirects || (config.get().redirects.length <= 0)) log.warn('monitor', { targets: 0 });
  for (const server of config.get().redirects) {
    const res = await checkSocket(server);
    out.push(res);
    if (!res.url.error && !res.target.error) log.state('monitor', { server, url: res.url, target: res.target });
    else log.warn('monitor', { server, url: res.url, target: res.target });
  }
  return out;
}

export async function start() {
  check();
  if (config.get().monitor) setInterval(check, 5 * 60 * 1000);
}
