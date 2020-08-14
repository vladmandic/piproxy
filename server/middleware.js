const connect = require('connect');
const helmet = require('helmet');
const log = require('@vladmandic/pilogger');
const logger = require('./logger.js');

const options = {
  helmet: {
    frameguard: { action: 'deny' },
    xssFilter: false,
    dnsPrefetchControl: { allow: 'true' },
    noSniff: false,
    hsts: { maxAge: 15552000, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
    expectCt: { enforce: true },
    contentSecurityPolicy: {
      directives: {
        'default-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'http:', 'https:'],
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", 'https:', "'unsafe-inline'"],
        'connect-src': ["'self'", 'http:', 'https:'],
        'upgrade-insecure-requests': [],
      },
    },
  },
};

const bucket = [];

function limiter(req, res, next) {
  if (!global.config.limiter) next();
  const ip = req.socket.remoteAddress;
  const now = Math.trunc(new Date().getTime() / 1000);
  let i = bucket.findIndex((a) => a[0] === ip); // find exising client (based on IP)
  if (i === -1) {
    bucket.push([ip, now, global.config.limiter.tokens]); // or create a new client
    i = bucket.findIndex((a) => a[0] === ip);
  }
  const consume = now - bucket[i][1] < global.config.limiter.interval; // should we reduce tokens for the client?
  if (consume) {
    bucket[i][2] -= 1;
    bucket[i][2] = Math.max(bucket[i][2], 0); // limit to zero
  } else {
    bucket[i][2] += Math.trunc((now - bucket[i][1]) / global.config.limiter.interval); // return x tokens depending on elapsed time
    bucket[i][2] = Math.min(bucket[i][2], global.config.limiter.tokens); // limit to max tokens
  }
  if (bucket[i][2] === global.config.limiter.tokens) bucket[i][1] = now; // reset time only when tokens are not used
  if (bucket[i][2] === 0) {
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
  if (global.config.helmet) {
    log.info('Enabling Helmet protection:' /* , options.helmet */);
    app.use(helmet(options.helmet));
  }
  if (global.config.limiter) {
    log.info('Enabling rate limiter:', global.config.limiter);
    app.use(limiter);
  }
  return app;
}

exports.init = init;
