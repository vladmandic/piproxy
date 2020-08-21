const nedb = require('nedb-promises');
const logger = require('./logger');

const limit = 20;
const filtered = ['::ffff:127.0.0.1', '::ffff:192.168.0.1', '::ffff:192.168.0.200'];

function str(input) {
  // eslint-disable-next-line prefer-template
  const output = JSON.stringify(input).replace(/\{|\}|"|\[|\]/g, '').replace(/,/g, ' | ').replace('timestamp:', '') + '\n';
  return output;
}

function table(input) {
  if (input.length === 0) return '<table></table>\n';
  let tbl = '<table style="text-align: left; font-size: 0.7rem; font-family: monospace; white-space: nowrap">\n';
  tbl += ' <tr style="background: dimgrey;">';
  for (const key of Object.keys(input[0])) tbl += `<th>${key}</th>`;
  tbl += ' </tr>\n';
  for (const rec of input) {
    tbl += ' <tr>';
    tbl += `<td>${new Date(Object.values(rec)[0]).toLocaleString('en-US', { hour12: false })}</td>`;
    for (let i = 1; i < Object.values(rec).length - 1; i++) tbl += `<td>${Object.values(rec)[i]}</td>`;
    // for (const val of Object.values(rec)) tbl += `<td>${val}</td>`;
    tbl += ' </tr>\n';
  }
  tbl += '</table>\n';
  return tbl;
}

async function html(url) {
  if (!global.db) return '';
  const ips = [];
  const asn = [];
  const continent = [];
  const country = [];
  const agent = [];
  const device = [];
  const last = [];
  const errors = [];
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
  for (const i in db) {
    const rec = db[i];
    if (rec.ip && filtered.includes(rec.ip.toString().trim())) continue;
    if (rec.ip && !ips.includes(rec.ip)) ips.push(rec.ip);
    if (rec.asn && !asn.includes(rec.asn)) asn.push(rec.asn);
    if (rec.continent && !continent.includes(rec.continent)) continent.push(rec.continent);
    if (rec.country && (rec.country !== 'unknown') && !country.includes(rec.country)) country.push(rec.country);
    if (rec.agent && !agent.includes(rec.agent)) agent.push(rec.agent);
    if (rec.device && !device.includes(rec.device)) device.push(rec.device);
    if (i < limit) last.push(rec); // last += str(rec);
    if (rec.status >= 400) errors.push(rec); // errors += str(rec);
  }
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
      <link rel="shortcut icon" href="favicon.ico" type="image/x-icon">
    </head>
    <body style="background: black; margin: 0; padding: 0; color: #ebebeb; font-family: sans-serif">
      <div style="display: block; margin: 10px">
        <h1>PiProxy Statistics</h1>
        <h3>DB Start: ${new Date(db[db.length - 1].timestamp).toLocaleString('en-US', { hour12: false })}</h2>
        <h3>Records: ${db.length} Unique IPs: ${ips.length} ASNs: ${asn.length} Continents: ${continent.length} Countries: ${country.length} Agents: ${agent.length} Devices: ${device.length}</h2>
        <h3>Last log:</h3>${table(last)}
        <h3>Error log:</h3>${table(errors)}
        <h3>ASNs:</h3>${str(asn)}
        <h3>Agents:</h3>${str(agent)}
        <h3>Devices:</h3>${str(device)}
        <h3>Countries:</h3>${str(country)}
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
  res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache', 'X-Powered-By': `NodeJS/${process.version}` });
  logger(req, res);
  res.end(await html(req.url), 'utf-8');
}

async function test() {
  if (!global.db) {
    global.db = nedb.create({ filename: 'piproxy.db', inMemoryOnly: false, timestampData: false, autoload: false });
    await global.db.loadDatabase();
  }
  // eslint-disable-next-line no-console
  console.log(await html());
  // const db = await global.db.find({}).sort({ timestamp: -1 });
  // console.log(table(db));
}

if (!module.parent) test();

exports.get = get;
