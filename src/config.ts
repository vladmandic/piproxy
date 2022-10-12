import * as fs from 'fs';
import * as crypto from 'crypto';
import * as log from '@vladmandic/pilogger';
import * as node from '../package.json';

type Redirect = { url?: string, default?: boolean, target: string, port: string };
type Directives = Record<string, string[]>;
type Answers = Record<string, string | object>;

let config = {
  logFile: 'logs/proxy.log' as string, // where to log all actions
  noip: {
    host: [] as string[], // if host array is non-empty piproxy will try to update dynamic ip for all listed hosts
    user: '' as string, // username for noip services
    password: '' as string, // password for noip services
  },
  acme: {
    domains: [] as string[], // if domains array is non-empty piproxy will try to request signed certificate valid for all listed domains from let's encrypt ssl authority
    application: 'piproxy/1.0.0' as string, // signature to use when requesting certificate
    accountFile: './cert/account.json' as string, // path to use
    accountKeyFile: './cert/account.pem' as string, // path to use
    ServerKeyFile: './cert/private.pem' as string, // path to use
    fullChain: './cert/fullchain.pem' as string, // path to use
  },
  ssl: {
    key: '../cert/private.pem' as string, // use this private key when starting https server
    crt: '../cert/fullchain.pem' as string, // use this server certificate when starting https server
  },
  http2: {
    allowHTTP1: true as boolean, // should we allow http1 traffic or force http2 only
    port: 443 as number, // start https server on port
    key: '' as string, // internal
    cert: '' as string, // internal
    secureOptions: crypto.constants.SSL_OP_NO_TLSv1 | crypto.constants.SSL_OP_NO_TLSv1_1, // disallow unsecure protocols
  },
  redirectHTTP: true, // redirect http to https
  redirects: [] as Array<Redirect>, // list of proxy redirects
  limiter: { // if present and vales are non-zero run proxy with per-session rate limiting
    interval: 10 as number, // how long before tokens are reset in seconds
    tokens: 500 as number, // how many requests can a single session request within interval
  },
  compress: 5 as number, // if present and non-zero run brotli compression on outgoing http responses
  monitor: true as boolean, // run monitor function on all source and target hosts/urls listed in redirects
  geoIP: { // use geoip to lookup locations based on ip
    city: './geoip/GeoLite2-City.mmdb' as string, // path to database
    asn: './geoip/GeoLite2-ASN.mmdb' as string, // path to database
  },
  helmet: { // piproxy uses helmet to configure public facing http response options
    frameguard: false as boolean,
    xssFilter: false as boolean,
    dnsPrefetchControl: { allow: true as boolean },
    noSniff: false as boolean,
    hsts: { maxAge: 15552000 as number, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
    expectCt: { enforce: true },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        fontSrc: ["'self'", 'http:', 'https:'],
        imgSrc: ["'self'", 'data:', 'http:', 'https:'],
        mediaSrc: ["'self'", 'data:', 'http:', 'https:'],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https:', 'blob:'],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
        connectSrc: ["'self'", 'http:', 'https:', 'data:'],
        workerSrc: ["'self'", 'blob:', 'https:'],
        frameAncestors: ["'self'"],
        'upgrade-insecure-requests': [],
      } as Directives,
    },
  },
  answers: { // predefined answers to common static paths
    'security.txt': 'Contact: mailto:mandic00@live.com\nPreferred-Languages: en\n',
    'humans.txt': '/* TEAM */\nChef: Vladimir Mandic\nContact: mandic00@live.com\nGitHub: https://github.com/vladmandic\n',
    'robots.txt': 'User-agent: *\nDisallow: /private\nCrawl-delay: 10\n',
    'git.head': 'ref: refs/heads/master\n',
    'sitemap.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url>\n<loc>URL</loc>\n</url>\n</urlset>',
    version: { name: '', version: '' },
  } as Answers,
};

export function merge(...objects) { // helper function: perform deep merge of multiple objects so it allows full inheritance with overrides
  const isObject = (obj) => obj && typeof obj === 'object';
  return objects.reduce((prev, obj) => {
    Object.keys(obj || {}).forEach((key) => {
      const pVal = prev[key];
      const oVal = obj[key];
      if (Array.isArray(pVal) && Array.isArray(oVal)) prev[key] = pVal.concat(...oVal);
      else if (isObject(pVal) && isObject(oVal)) prev[key] = merge(pVal, oVal);
      else prev[key] = oVal;
    });
    return prev;
  }, {});
}

export function init() {
  if (fs.existsSync('config.json')) { // create private secrets file as required
    try {
      const blob = fs.readFileSync('config.json');
      const obj = JSON.parse(blob.toString());
      config = merge(config, obj);
    } catch (err) {
      log.info('Configuration error', { file: 'config.json', err });
    }
    config.answers.version = { name: node.name, version: node.version };
    log.info('Configuration', { file: 'config.json' });
  } else {
    log.info('Configuration missing', { file: 'config.json' });
  }
}

export const get = () => config;

export const set = (obj) => {
  config = merge(config, obj);
};
