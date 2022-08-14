import * as superagent from 'superagent';
import * as log from '@vladmandic/pilogger';
import * as node from '../package.json';

type NoIPConfig = { host: string[], user: string, password: string };
let config: NoIPConfig = { host: [], user: '', password: '' };

export async function update(initial: NoIPConfig): Promise<void> {
  if (initial && initial.host) config = initial;
  for (const hostname of config.host) {
    superagent
      .get('dynupdate.no-ip.com/nic/update')
      .set('User-Agent', `${node.name}/${node.version}`)
      .auth(config.user, config.password)
      .query({ hostname })
      .then((res) => {
        const text = (res && res.text) ? res.text.replace('\r\n', '') : 'unknown';
        const status = (res && res.status) ? res.status : 'unknown';
        const rec = { hostname, status, text };
        log.state('noip', rec);
      })
      .catch((err) => {
        log.warn(`noip error: ${err}`);
      });
  }
  setTimeout(update, 3600 * 1000 * 2);
}
