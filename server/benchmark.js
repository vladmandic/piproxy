const log = require('@vladmandic/pilogger');
const http2 = require('http2');

const options = {
  tries: 100,
  http2: {
    target: 'https://pigallery.ddns.net',
    ':path': '/',
    // rejectUnauthorized: false,
  },
  https: {
    hostname: 'localhost',
    method: 'GET',
    port: '10011',
    path: '/true',
    protocol: 'https:',
    rejectUnauthorized: false,
  },
};

function get(i) {
  return new Promise((resolve) => {
    // eslint-disable-next-line no-unused-vars
    let data = [];
    const client = http2.connect(options.http2.target);
    const req = client.request(options.http2);
    // https.request(options.https, (req) => { });
    let status = false;
    req.on('response', (headers) => {
      if (i === 0) log.data('Headers:', headers);
      status = headers[':status'] === 200;
      // log.data(headers[':status']);
    });
    // eslint-disable-next-line no-unused-vars
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      client.close();
      resolve(status);
    });
  });
}

async function main() {
  // process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  if (process.argv[2]) options.http2.target = process.argv[2];
  // options.https.hostname = options.target;
  log.info(`Starting benchmark: tries: ${options.tries} target ${options.http2.target}`);
  const t0 = process.hrtime.bigint();
  let count = 0;
  for (let i = 0; i < options.tries; i++) {
    // await superagent.get(options.target);
    const ok = await get(i);
    if (ok) count += 1;
  }
  const t1 = process.hrtime.bigint();
  const ms = Math.trunc(parseFloat((t1 - t0).toString()) / 1000000);
  const total = Math.round(1000 * options.tries / ms);
  const rate = Math.round(1000 * count / ms);
  log.info(`Completed in ${ms.toLocaleString()}ms with total ${options.tries} / ${total.toLocaleString()} success ${count} / ${rate.toLocaleString()} requests/second`);
}

main();
