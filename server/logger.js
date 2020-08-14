const log = require('@vladmandic/pilogger');
const geoip = require('./geoip.js');

function parse(req, res) {
  const obj = {};
  obj.head = req.headers;
  const agent = (req.headers['user-agent'] || '').replace('(KHTML, like Gecko)', '').replace('Mozilla/5.0', '').replace('/  /g', ' ');
  const device = agent.match(/\((.*)\)/);
  obj.device = device && device.length > 0 ? device[1] : 'unknown';
  obj.agent = agent.replace(/\(.*\)/, '').replace(/  /g, ' ').trim();
  obj.peer = req.socket._peername || {};
  obj.ip = obj.peer.address || req.socket.remoteAddress;
  obj.geo = obj.ip ? geoip.get(obj.ip) : {};
  obj.client = `${obj.head[':scheme'] || (req.socket.encrypted ? 'https' : 'http')}://${obj.head[':authority'] || obj.head.host}${req.url}`;
  obj.size = res.headers ? (res.headers['content-length'] || res.headers['content-size'] || 0) : 0;
  obj.etag = res.headers ? res.headers['etag'] : undefined;
  obj.type = res.headers ? res.headers['content-type'] : undefined;
  return obj;
}

function logger(req, res) {
  const obj = parse(req, res);
  const geoDetails = obj.geo.country ? `Geo:'${obj.geo.continent}/${obj.geo.country}/${obj.geo.city}' ASN:'${obj.geo.asn}' Loc:${obj.geo.lat},${obj.geo.lon}` : '';
  log.data(`${req.method}/${req.socket.alpnProtocol || req.httpVersion} Code:${res.statusCode} ${obj.client} From:${obj.ip} Length:${obj.size} Agent:${obj.agent} Device:${obj.device} ${geoDetails}`);
  const record = {
    timestamp: new Date(),
    method: req.method,
    protocol: (req.socket.alpnProtocol || req.httpVersion),
    status: res.statusCode,
    scheme: obj.head[':scheme'] || (req.socket.encrypted ? 'https' : 'http'),
    host: obj.head[':authority'] || obj.head.host,
    url: req.url,
    ip: obj.ip,
    length: obj.size,
    agent: obj.agent,
    device: obj.device,
    country: obj.geo.country,
    continent: obj.geo.continent,
    city: obj.geo.city,
    asn: obj.geo.asn,
    lat: obj.geo.lat,
    lon: obj.geo.lon,
    accuracy: obj.geo.accuracy,
    etag: obj.etag,
    mime: obj.type,
    duration: Math.trunc(parseFloat(res.performance) / 1000000),
  };
  if (global.db) global.db.insert(record);
  return obj;
}

module.exports = logger;
