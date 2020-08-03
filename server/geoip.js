const maxmind = require('maxmind');
const log = require('pilogger');
const proc = require('process');

let geoCity;
let geoASN;

async function init() {
  try {
    geoCity = await maxmind.open('./geoip/GeoLite2-City.mmdb');
    geoASN = await maxmind.open('./geoip/GeoLite2-ASN.mmdb');
    log.state('GeoIP databases loaded');
  } catch {
    log.warn('GeoIP failed to open database');
  }
}

function get(addr) {
  // fix ip address and allow ipv6
  let ip = '127.0.0.1';
  if (!addr) addr = ip;
  if (addr.startsWith('::')) {
    const partial = addr.split(':');
    ip = partial[partial.length - 1];
    if (ip.split('.').length !== 4) {
      ip = '127.0.0.1';
    }
  }
  // init default values
  const loc = { ip };
  // if database not initialized, return just ip
  if (!geoCity || !geoASN) return loc;
  // skip for lan
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.') || ip.startsWith('169.')) return loc;
  // try normal lookup
  try {
    const geo = geoCity.get(ip);
    const asn = geoASN.get(ip);
    // if (!module.parent) console.log('Geo', geo, 'ASN', asn);
    loc.asn = asn.autonomous_system_organization;
    loc.continent = geo.continent ? geo.continent.code : 'unknown';
    loc.country = geo.country ? geo.country.iso_code : 'unknown';
    loc.city = geo.city ? geo.city.names.en : 'unknown';
    loc.lat = geo.location ? geo.location.latitude : 'unknown';
    loc.lon = geo.location ? geo.location.longitude : 'unknown';
    loc.accuracy = geo.location ? geo.location.accuracy_radius : 'unknown';
  } catch { /**/ }
  return loc;
}

async function test(ip) {
  await init();
  log.info(ip, get(ip));
}

if (!module.parent) test(proc.argv[2]);

exports.get = get;
exports.init = init;
