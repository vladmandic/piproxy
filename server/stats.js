const nedb = require('nedb-promises');
const logger = require('./logger');

const limit = 20;
function str(input) {
  // eslint-disable-next-line prefer-template
  const output = JSON.stringify(input).replace(/\{|\}|"/g, '').replace(/,/g, ' ').replace('timestamp:', '') + '\n';
  return output;
}

async function html() {
  if (!global.db) return '';
  const ips = [];
  const asn = [];
  const continent = [];
  const agent = [];
  const device = [];
  let last = '';
  let errors = '';
  const db = await global.db.find({}).sort({ timestamp: -1 });
  for (const i in db) {
    const rec = db[i];
    if (!ips.includes(rec.ip)) ips.push(rec.ip);
    if (!asn.includes(rec.asn)) asn.push(rec.asn);
    if (!continent.includes(rec.continent)) continent.push(rec.continent);
    if (!agent.includes(rec.agent)) agent.push(rec.agent);
    if (!device.includes(rec.device)) device.push(rec.device);
    if (i < limit) last += str(rec);
    if (rec.status >= 400) errors += str(rec);
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
        <h2>Records: ${await global.db.count({})} Unique IPs: ${ips.length} ASNs: ${asn.length} Continents: ${continent.length} Agents: ${agent.length} Devices: ${device.length}</h2>
        <h3>Last log:</h3><pre>${last}</pre>
        <h3>Error log:</h3><pre>${errors}</pre>
      </div>
    </body>
    </html>`;
  return text;
}

async function get(req, res, next) {
  if (req.url !== '/piproxy') {
    next();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache', 'X-Powered-By': `NodeJS/${process.version}` });
  logger(req, res);
  res.end(await html(), 'utf-8');
}

async function test() {
  if (!global.db) {
    global.db = nedb.create({ filename: 'piproxy.db', inMemoryOnly: false, timestampData: false, autoload: false });
    await global.db.loadDatabase();
  }
  console.log(await html());
}

if (!module.parent) test();

exports.get = get;

/*

  global.db = nedb.create({ filename: global.config.server.db, inMemoryOnly: false, timestampData: true, autoload: false });
  await global.db.ensureIndex({ fieldName: 'image', unique: true, sparse: true });
  await global.db.ensureIndex({ fieldName: 'processed', unique: false, sparse: false });
  const records = await global.db.count({});
  log.state('Image cache loaded:', global.config.server.db, 'records:', records);
  const shares = await global.db.find({ images: { $exists: true } });

*/
