const log = require('pilogger');
const useragent = require('useragent');
const geoip = require('./geoip.js');

function parse(req) {
  const obj = {};
  obj.head = req.headers;
  obj.agent = useragent.lookup(obj.head['user-agent']);
  obj.peer = req.socket._peername || {};
  obj.ip = obj.peer.address || req.socket.remoteAddress;
  obj.geo = obj.ip ? geoip.get(obj.ip) : {};
  obj.client = `${obj.head[':scheme'] || (req.socket.encrypted ? 'https' : 'http')}://${obj.head[':authority'] || obj.head.host}${req.url}`;
  return obj;
}

function logger(req, res) {
  const obj = parse(req);
  const agentDetails = `OS:'${obj.agent.os.family}' Device:'${obj.agent.device.family}' Agent:'${obj.agent.family}.${obj.agent.major}.${obj.agent.minor}'`;
  const geoDetails = obj.geo.country ? `Geo:'${obj.geo.continent}/${obj.geo.country}/${obj.geo.city}' ASN:'${obj.geo.asn}' Loc:${obj.geo.lat},${obj.geo.lon}` : '';
  const size = res.headers ? (res.headers['content-length'] || res.headers['content-size'] || 0) : 0;
  log.data(`${req.method}/${req.socket.alpnProtocol || req.httpVersion} Code:${res.statusCode} ${obj.client} From:${obj.ip} Size:${size} ${agentDetails} ${geoDetails}`);
  return obj;
}

module.exports = logger;
