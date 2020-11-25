const nedb = require('nedb-promises');
const logger = require('./logger');
const monitor = require('./monitor');

const limit = 50;
// const filtered = ['::ffff:127.0.0.1', '::ffff:192.168.0.1', '::ffff:192.168.0.200'];

function str(input) {
  // eslint-disable-next-line prefer-template
  const output = JSON.stringify(input).replace(/\{|\}|"|\[|\]/g, '').replace(/,/g, ' | ').replace('timestamp:', '') + '\n';
  return output;
}

function table(input) {
  if (input.length === 0) return '<table></table>\n';
  const json = (obj) => JSON.stringify(obj)
    .replace(/{|}|"|\[|\]/g, '')
    .replace(/,/g, ', ')
    .replace(/:true/g, '<font color="lightgreen">:■</font>')
    .replace(/:false/g, '<font color="lightcoral">:■</font>');
  let tbl = '<table style="text-align: left; font-size: 0.7rem; font-family: monospace; white-space: nowrap">\n';
  tbl += ' <tr style="background: dimgrey;">';
  for (const key of Object.keys(input[0])) tbl += `<th>${key}</th>`;
  tbl += ' </tr>\n';
  for (const rec of input) {
    tbl += ' <tr>';
    tbl += `<td>${new Date(Object.values(rec)[0]).toLocaleString('en-US', { hour12: false })}</td>`;
    for (let i = 1; i < Object.values(rec).length; i++) {
      const field = typeof Object.values(rec)[i] === 'object' ? json(Object.values(rec)[i]) : Object.values(rec)[i];
      tbl += `<td>${field}</td>`;
    }
    // for (const val of Object.values(rec)) tbl += `<td>${val}</td>`;
    tbl += ' </tr>\n';
  }
  tbl += '</table>\n';
  return tbl;
}

async function html(url) {
  if (!global.db) return '';
  const stat = {
    ips: [],
    asn: [],
    continent: [],
    country: [],
    agent: [],
    device: [],
    last: [],
    errors: [],
  };
  let query = {};
  try {
    const uri = decodeURIComponent(url.includes('?') ? url.split('?')[1] : '');
    query = JSON.parse(`{ ${uri} }`);
  } catch { /**/ }
  let db = [];
  try {
    db = await global.db.find(query).sort({ timestamp: -1 });
  } catch { /**/ }
  if (db.length <= 0) return '';
  let i = 0;
  for (const rec of db) {
    // if (rec.ip && filtered.includes(rec.ip.toString().trim())) continue;
    i += 1;
    if (rec.ip && !stat.ips.includes(rec.ip)) stat.ips.push(rec.ip);
    if (rec.asn && !stat.asn.includes(rec.asn)) stat.asn.push(rec.asn);
    if (rec.continent && !stat.continent.includes(rec.continent)) stat.continent.push(rec.continent);
    if (rec.country && (rec.country !== 'unknown') && !stat.country.includes(rec.country)) stat.country.push(rec.country);
    if (rec.agent && !stat.agent.includes(rec.agent)) stat.agent.push(rec.agent);
    if (rec.device && !stat.device.includes(rec.device)) stat.device.push(rec.device);
    if (i < limit) stat.last.push(rec); // last += str(rec);
    if (rec.status >= 400) stat.errors.push(rec); // errors += str(rec);
    if (stat.errors.length > limit) stat.errors.length = limit;
  }
  stat.asn = stat.asn.sort((a, b) => (a > b ? 1 : -1));
  stat.continent = stat.continent.sort((a, b) => (a > b ? 1 : -1));
  stat.country = stat.country.sort((a, b) => (a > b ? 1 : -1));
  stat.agent = stat.agent.sort((a, b) => (a > b ? 1 : -1));
  stat.device = stat.device.sort((a, b) => (a > b ? 1 : -1));
  const text = `<!DOCTYPE html>
    <html lang="en">
    <head>
      <title>PiProxy Statistics</title>
      <meta http-equiv="content-type">
      <meta content="text/html">
      <meta charset="UTF-8">
      <meta name="Description" content="PiProxy Statistics">
      <meta name="viewport" content="width=device-width, initial-scale=0.4, minimum-scale=0.1, maximum-scale=2.0, shrink-to-fit=yes, user-scalable=yes">
      <meta name="theme-color" content="#555555"/>
      <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon">
    </head>
    <body style="background: black; margin: 0; padding: 0; color: #ebebeb; font-family: sans-serif">
      <div style="display: block; margin: 10px">
        <h1>PiProxy Statistics</h1>
        <h3>DB Start: ${new Date(db[db.length - 1].timestamp).toLocaleString('en-US', { hour12: false })}</h2>
        <h3>Records: ${db.length} | Unique IPs: ${stat.ips.length} | ASNs: ${stat.asn.length} | Continents: ${stat.continent.length} | Countries: ${stat.country.length} | Agents: ${stat.agent.length} | Devices: ${stat.device.length}</h2>
        <h3>Status:</h3><div id="log-status">${table(await monitor.get())}</div>
        <h3>Last log:</h3><div id="log-last">${table(stat.last)}</div>
        <h3>Error log:</h3><div id="log-err">${table(stat.errors)}</div>
        <h3>ASNs:</h3>${str(stat.asn)}
        <h3>Agents:</h3>${str(stat.agent)}
        <h3>Devices:</h3>${str(stat.device)}
        <h3>Countries:</h3>${str(stat.country)}
      </div>
    </body>
    </html>
  `;
  return text;
}

async function get(req, res, next) {
  if (!req.url.startsWith('/piproxy')) {
    next();
    return;
  }
  const text = await html(req.url);
  res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache', 'Content-Length': `${text.length}`, 'X-Powered-By': `NodeJS/${process.version}` });
  res.end(text, 'utf-8');
  logger(req, res);
}

async function test() {
  if (!global.db) {
    global.db = nedb.create({ filename: 'piproxy.db', inMemoryOnly: false, timestampData: false, autoload: false });
    await global.db.loadDatabase();
  }
  // await global.db.remove({ ip: '::ffff:192.168.0.1' }, { multi: true });
  // eslint-disable-next-line no-console
  // console.log(await html());
  // const db = await global.db.find({}).sort({ timestamp: -1 });
  // console.log(table(db));
}

try {
  if (require.main === module) test();
} catch {
  //
}

exports.get = get;
