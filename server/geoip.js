const maxmind = require('maxmind');
const log = require('pilogger');

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
  // try normal lookup
  try {
    const geo = geoCity.get(ip);
    const asn = geoASN.get(ip);
    loc.country = geo.country.iso_code;
    loc.city = geo.city.names.en;
    loc.asn = asn.autonomous_system_organization;
    loc.lat = geo.location.latitude;
    loc.lon = geo.location.longitude;
    loc.accuracy = geo.location.accuracy_radius;
  } catch { /**/ }
  return loc;
}

exports.get = get;
exports.init = init;
