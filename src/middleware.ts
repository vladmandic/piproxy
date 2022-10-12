import connect from 'connect';
import helmet, { HelmetOptions } from 'helmet';
import * as log from '@vladmandic/pilogger';
import logger from './logger';
import * as config from './config';

const bucket: number[][] = [];
let cfg = config.get();

function limiter(req, res, next) {
  if (!cfg.limiter) next();
  const ip = req.socket.remoteAddress;
  const now = Math.trunc(new Date().getTime() / 1000);
  let i = bucket.findIndex((a) => a[0] === ip); // find exising client (based on IP)
  if (i === -1) {
    bucket.push([ip, now, cfg.limiter.tokens]); // or create a new client
    i = bucket.findIndex((a) => a[0] === ip);
  }
  const consume = now - bucket[i][1] < cfg.limiter.interval; // should we reduce tokens for the client?
  if (consume) {
    bucket[i][2] -= 1;
    bucket[i][2] = Math.max(bucket[i][2], 0); // limit to zero
  } else {
    bucket[i][2] += Math.trunc((now - bucket[i][1]) / cfg.limiter.interval); // return x tokens depending on elapsed time
    bucket[i][2] = Math.min(bucket[i][2], cfg.limiter.tokens); // limit to max tokens
  }
  if (bucket[i][2] === cfg.limiter.tokens) bucket[i][1] = now; // reset time only when tokens are not used
  if (bucket[i][2] === 0) {
    res.setHeader('Retry-After', cfg.limiter.interval);
    res.writeHead(429);
    res.end();
    logger(req, req);
  } else {
    next();
  }
}

export async function init() {
  const app = connect();
  cfg = config.get();
  if (cfg.helmet) {
    const short = JSON.parse(JSON.stringify(cfg.helmet));
    short.contentSecurityPolicy.directives = { count: [Object.keys(short.contentSecurityPolicy.directives).length.toString()] };
    log.info('Helmet', short);
    app.use(helmet(cfg.helmet as HelmetOptions));
  }
  if (cfg.limiter) {
    log.info('Limiter', cfg.limiter);
    app.use(limiter);
  }
  if (cfg.compress) {
    log.info('Compression', { brotli: cfg.compress });
  }
  return app;
}
