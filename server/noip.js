const superagent = require('superagent');
const log = require('pilogger');
const node = require('../package.json');

let hosts = [];

function update(config) {
  if (config && config.host) hosts = config.host;
  for (const hostname of hosts) {
    superagent
      .get('dynupdate.no-ip.com/nic/update')
      .set('User-Agent', `${node.name}/${node.version}`)
      .auth(config.user, config.password)
      .query({ hostname })
      .then((res) => {
        const text = (res && res.text) ? res.text.replace('\r\n', '') : 'unknown';
        const status = (res && res.status) ? res.status : 'unknown';
        log.state(`NoIP host: ${hostname} status:${status} ${text}`);
      })
      .catch((err) => {
        log.warn(`NoIP error: ${err}`);
      });
  }
  setTimeout(update, 3600 * 1000 * 2);
}

exports.update = update;
