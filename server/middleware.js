const connect = require('connect');
const helmet = require('helmet');
const log = require('@vladmandic/pilogger');
const logger = require('./logger.js');

const bucket = [];

function limiter(req, res, next) {
  // @ts-ignore
  if (!global.config.limiter) next();
  const ip = req.socket.remoteAddress;
  const now = Math.trunc(new Date().getTime() / 1000);
  let i = bucket.findIndex((a) => a[0] === ip); // find exising client (based on IP)
  if (i === -1) {
    // @ts-ignore
    bucket.push([ip, now, global.config.limiter.tokens]); // or create a new client
    i = bucket.findIndex((a) => a[0] === ip);
  }
  // @ts-ignore
  const consume = now - bucket[i][1] < global.config.limiter.interval; // should we reduce tokens for the client?
  if (consume) {
    bucket[i][2] -= 1;
    bucket[i][2] = Math.max(bucket[i][2], 0); // limit to zero
  } else {
    // @ts-ignore
    bucket[i][2] += Math.trunc((now - bucket[i][1]) / global.config.limiter.interval); // return x tokens depending on elapsed time
    // @ts-ignore
    bucket[i][2] = Math.min(bucket[i][2], global.config.limiter.tokens); // limit to max tokens
  }
  // @ts-ignore
  if (bucket[i][2] === global.config.limiter.tokens) bucket[i][1] = now; // reset time only when tokens are not used
  if (bucket[i][2] === 0) {
    // @ts-ignore
    res.setHeader('Retry-After', global.config.limiter.interval);
    res.writeHead(429);
    res.end();
    logger(req, res);
  } else {
    next();
  }
}

async function init() {
  const app = connect();
  // @ts-ignore
  if (global.config.helmet) {
    log.info('Enabling Helmet protection'); // global.config.helmet.contentSecurityPolicy.directives);
    // @ts-ignore
    app.use(helmet(global.config.helmet));
  }
  // @ts-ignore
  if (global.config.limiter) {
    // @ts-ignore
    log.info('Enabling Rate limiter:', global.config.limiter);
    app.use(limiter);
  }
  // @ts-ignore
  if (global.config.brotli) {
    // @ts-ignore
    log.info('Enabling Brotli compression:', global.config.brotli);
  }
  return app;
}

exports.init = init;
