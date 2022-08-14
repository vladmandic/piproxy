import * as log from '@vladmandic/pilogger';
import type { TLSSocket } from 'tls';
import * as geoip from './geoip';
import type { Req } from './server';

export class Record {
  timestamp: Date | undefined;
  method: string | undefined;
  protocol: string | undefined;
  status: number | undefined;
  scheme: string | undefined;
  host: string | undefined;
  url: string | undefined;
  ip: string | undefined;
  length: string | undefined;
  agent: string[] | undefined;
  device: string | undefined;
  country: string | undefined;
  continent: string | undefined;
  city: string | undefined;
  asn: string | undefined;
  lat: number | undefined;
  lon: number | undefined;
  accuracy: number | undefined;
  etag: string | undefined;
  mime: string | undefined;
  cookie: boolean | undefined;
  jwt: boolean | undefined;
  duration: number | undefined;

  constructor(clientReq: Req, proxyReq: Req) {
    const head = clientReq.headers;
    const agent = (clientReq.headers['user-agent'] || '').replace('(KHTML, like Gecko)', '').replace('Mozilla/5.0', '').replace('/  /g', ' ');
    const device = agent.match(/\((.*)\)/);
    this.device = device && device.length > 0 ? device[1] : undefined;
    this.agent = agent.replace(/\(.*\)/, '').replace(/  /g, ' ').trim().split(' ');
    // @ts-ignore optional and rare
    const peer = clientReq.socket._peername; // eslint-disable-line no-underscore-dangle
    this.ip = peer?.address || clientReq?.socket?.remoteAddress;
    const geo = geoip.get(this.ip || '127.0.0.1');
    this.country = geo.country;
    this.continent = geo.continent;
    this.city = geo.city;
    this.asn = geo.asn;
    this.lat = geo.lat;
    this.lon = geo.lon;
    this.scheme = head[':scheme'] as string || ((clientReq.socket as TLSSocket).encrypted ? 'https' : 'http');
    this.host = head[':authority'] as string || head.host;
    this.length = proxyReq.headers ? (proxyReq.headers['content-length'] || proxyReq.headers['content-size']) as string : undefined;
    this.etag = proxyReq.headers ? proxyReq.headers['etag'] : undefined;
    this.mime = proxyReq.headers ? proxyReq.headers['content-type'] : undefined;
    this.cookie = head['cookie'] ? true : undefined;
    this.jwt = head['authorization'] ? true : undefined;
    this.method = clientReq.method;
    this.protocol = (clientReq.socket as TLSSocket).alpnProtocol || clientReq.httpVersion;
    // @ts-ignore yes it exists
    this.status = proxyReq.statusCode;
    this.url = clientReq.url || '';
    if (this.url.length > 64) this.url = this.url.substring(0, 64) + '...';
    this.duration = clientReq.headers['timestamp'] ? Number((process.hrtime.bigint() - BigInt(clientReq.headers['timestamp'] as string || 0)) / 1000000n) : 0;
  }
}

export default function logger(clientReq: Req, proxyReq: Req) {
  const record = new Record(clientReq, proxyReq);
  const data = Object.fromEntries(Object.entries(record).filter(([_key, val]) => val)); // eslint-disable-line no-unused-vars, @typescript-eslint/no-unused-vars
  log.data(data);
  return record;
}
