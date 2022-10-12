import * as log from '@vladmandic/pilogger';
import * as acme from '@vladmandic/piacme/src/piacme';
import * as noip from './noip';
import * as geoip from './geoip';
import * as monitor from './monitor';
import * as server from './server';
import * as config from './config';

function exit(signal: string) {
  log.warn('exit', { signal });
  process.exit(0);
}

function error(err: Error) {
  log.error('exception');
  for (const line of (err.stack || '').split('\n')) log.error(line);
  process.exit(1);
}

async function main() {
  // register exit handler
  process.on('SIGINT', () => exit('sigint'));
  process.on('SIGHUP', () => exit('sighup'));
  process.on('SIGTERM', () => exit('sigterm'));
  process.on('uncaughtException', (err) => error(err));

  // load use configuration
  config.init();

  const cfg = config.get();

  // configure logging
  log.configure({ logFile: cfg.logFile, inspect: { breakLength: 1024 } });
  log.headerJson();

  // update dynamic dns
  await noip.update(cfg.noip);

  // check and auto-update certificates
  log.info('SSL', cfg.ssl);
  await acme.init(cfg.acme);
  const cert = await acme.parseCert();
  if (cert.account.error) log.warn('SSL Account', { code: cert?.account?.error?.code, syscall: cert?.account?.error?.syscall, path: cert?.account?.error?.path });
  else log.info('SSL Account', { contact: cert.account.contact, status: cert.account.status, type: cert.accountKey.type, crv: cert.accountKey.crv });
  if (cert.fullChain.error) log.warn('SSL Server', { code: cert?.fullChain?.error?.code, syscall: cert?.fullChain?.error?.syscall, path: cert?.fullChain?.error?.path });
  else log.info('SSL Server', { subject: cert.fullChain.subject, issuer: cert.fullChain.issuer, algorithm: cert.fullChain.algorithm, from: cert.fullChain.notBefore, until: cert.fullChain.notAfter, type: cert.serverKey.type, use: cert.serverKey.use });
  await acme.getCert(); // validate & auto-renew
  await acme.monitorCert(server.restartServer); // start ssl certificate monitoring for expiration

  // load geoip database
  await geoip.init(cfg.geoIP.city, cfg.geoIP.asn);

  // start proxy server
  await server.init(cfg.ssl); // Start actual redirector

  // start server monitoring
  await monitor.start();
}

main();
