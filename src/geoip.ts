// https://github.com/du5/geoip
// https://github.com/clashdev/geolite.clash.dev

import * as fs from 'fs';
import * as maxmind from 'maxmind';
import * as log from '@vladmandic/pilogger';

let geoCity;
let geoASN;

export type Location = { ip: string, asn?: string | undefined, continent?: string | undefined, country?: string | undefined, city?: string | undefined, lat?: number | undefined, lon?: number | undefined, accuracy?: number | undefined };

export async function init(geoIPCityDB: string, geoIPASNDB: string): Promise<void> {
  try {
    if (fs.existsSync(geoIPCityDB) && fs.existsSync(geoIPASNDB)) {
      geoCity = await maxmind.open(geoIPCityDB);
      geoASN = await maxmind.open(geoIPASNDB);
      log.state('GeoIP', { city: geoIPCityDB, asn: geoIPASNDB });
    } else {
      log.warn('GeoIP missing', { city: geoIPCityDB, asn: geoIPASNDB });
    }
  } catch {
    log.warn('GeoIP failed', { city: geoIPCityDB, asn: geoIPASNDB });
  }
}

export function get(addr: string): Location {
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
  const loc: Location = { ip };
  // if database not initialized, return just ip
  if (!geoCity || !geoASN) return loc;
  // skip for lan
  if (ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.') || ip.startsWith('169.')) return loc;
  // try normal lookup
  try {
    const geo = geoCity.get(ip);
    const asn = geoASN.get(ip);
    loc.asn = asn.autonomous_system_organization;
    loc.continent = geo.continent?.code;
    loc.country = geo.country?.iso_code;
    loc.city = geo.city?.names.en;
    loc.lat = geo.location?.latitude;
    loc.lon = geo.location?.longitude;
    loc.accuracy = geo.location?.accuracy_radius;
  } catch { /**/ }
  return loc;
}
