const logger = require('./proxy.js').logger;

const options = {
  interval: 10, // in seconds
  tokens: 100, // number of requests per interval
};
const bucket = [];

function limiter(req, res, next) {
  const ip = req.socket.remoteAddress;
  // const now = process.hrtime.bigint();
  const now = Math.trunc(new Date().getTime() / 1000);
  let i = bucket.findIndex((a) => a[0] === ip); // find exising client (based on IP)
  if (i === -1) {
    bucket.push([ip, now, options.tokens]); // or create a new client
    i = bucket.findIndex((a) => a[0] === ip);
  }
  const consume = now - bucket[i][1] < options.interval; // should we reduce tokens for the client?
  if (consume) {
    bucket[i][2] -= 1;
    bucket[i][2] = Math.max(bucket[i][2], 0); // limit to zero
  } else {
    bucket[i][2] += Math.trunc((now - bucket[i][1]) / options.interval); // return x tokens depending on elapsed time
    bucket[i][2] = Math.min(bucket[i][2], options.tokens); // limit to max tokens
  }
  if (bucket[i][2] === options.tokens) bucket[i][1] = now; // reset time only when tokens are not used
  if (bucket[i][2] === 0) {
    res.setHeader('Retry-After', options.interval);
    res.writeHead(429);
    res.end();
    logger(req, res);
  } else {
    next();
  }
}

exports.limiter = limiter;
