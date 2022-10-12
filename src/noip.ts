import * as superagent from 'superagent';
import * as log from '@vladmandic/pilogger';
import * as scan from './scan';
import * as node from '../package.json';

type NoIPConfig = { host: string[], user: string, password: string };
type Result = { hostname: string, status: string, text: string, ip: string };
let config: NoIPConfig = { host: [], user: '', password: '' };
const results: Result[] = [];

export async function update(initial: NoIPConfig): Promise<Result[]> {
  if (initial && initial.host) config = initial;
  for (const hostname of config.host) {
    superagent
      .get('dynupdate.no-ip.com/nic/update')
      .set('User-Agent', `${node.name}/${node.version}`)
      .auth(config.user, config.password)
      .query({ hostname })
      .then((res) => {
        const text = (res && res.text) ? res.text.replace('\r\n', '').split(' ') : ['unknown', 'unknown'];
        const status = (res && res.status) ? res.status : 'unknown';
        const rec = { hostname, status, text: text[0], ip: text[1] };
        if (!results.map((r) => r.ip).includes(rec.ip)) scan.scan(rec.ip, 80, 80); // run scan first time we see a new ip
        results.push(rec);
        log.state('NoIP', rec);
      })
      .catch((err) => {
        log.warn(`NoIP error: ${err}`);
      });
  }
  setTimeout(update, 3600 * 1000 * 2);
  return results;
}
