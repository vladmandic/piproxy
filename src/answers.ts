import type { Req, Res } from './server';
import * as config from './config';
import logger from './logger';

export async function get(req: Req, res: Res, next) {
  let status = 200;
  let html;
  let type = 'text/plain';
  switch (req.url) {
    case '/security.txt':
    case '/.well-known/security.txt':
      html = config.get().answers['security.txt'];
      break;
    case '/robots.txt':
    case '/.well-known/robots.txt':
      html = config.get().answers['robots.txt'];
      break;
    case '/humans.txt':
    case '/.well-known/humans.txt':
      html = config.get().answers['humans.txt'];
      break;
    case '/sitemap.xml':
    case '/.well-known/sitemap.xml':
      const host: string = req.headers[':authority']?.toString() || req.headers.host?.toString() || '';
      html = ((config.get().answers['sitemap.xml'] || '') as string).replace('URL', host);
      type = 'text/xml';
      status = 451;
      break;
    case '/.git/HEAD':
      html = config.get().answers['git.head'];
      status = 403;
      break;
    case '/ver':
    case '/version':
      html = JSON.stringify(config.get().answers['version'], null, 2);
      type = 'application/json';
      break;
    default:
      next();
      return;
  }
  if (!html) {
    next();
    return;
  }
  res.writeHead(status, { 'Content-Type': `'${type}'`, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
  logger(req, req);
  res.end(html, 'utf-8');
}

// https://en.wikipedia.org/wiki/List_of_HTTP_status_codes
