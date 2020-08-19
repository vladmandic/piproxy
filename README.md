# PiProxy: NodeJS Web Proxy

## Features

- Native HTTP2 support as front-end
- Can proxy to HTTP2, HTTPS or HTTP destinations
- ACME/LetsEncrypt support for automatic creation and renewal of free, valid and signed SSL certificates
- No-IP support for automatic dynamic IP updates
- Passthrough compression using Brotli algorithm
- TLS version protection (TLS v1.2 and higher are allowed)
- Helmet protection
- Rate limiting
- Custom error handling
- GeoIP reverse lookups on access
- Agent analysis on access
- Text file and DB logging
- Performance and size measurements
- Built-in statistcs

## Run

Simply install and run:

- Make sure you have [NodeJS](https://nodejs.org/en/) already installed
- Clone repository  
  `git clone https://github.com/vladmandic/piproxy`  
  or download and unpack from <https://github.com/vladmandic/piproxy/releases/>
- Install using  
  `./setup.js`  
  This will install all dependencies as needed
- Run using:  
  `npm start` or  
  `node server/piproxy` or use  
  `piproxy.service` as a template (notes are within service file) to create a Linux service  
  
  (see section on security to see how to run as non-root)

## Configuration

Entire configuration is inside `server/piproxy.js` config object and all values are *optional*

### Example configuration

```js
global.config = {
  logFile: 'piproxy.log',
  // if present, piproxy will attempt regular dynamic dns updates for specified domains on no-ip service
  noip: {
    host: ['example1.ddns.net', 'example2.ddns.net', 'example3.ddns.net'],
    user: 'user',
    password: 'password',
  },
  // if present, piproxy will attempt automatic registration on letsencrypt to obtain ssl certificate
  // once certificate is obtain, it will be monitored for validity and auto-renewed as needed
  // only fields needed are maintainer/subscriber and list of domains for which to obtain certificate
  acme: {
    application: 'piproxy/1.0.0',
    domains: ['example1.ddns.net', 'example2.ddns.net', 'example3.ddns.net'],
    maintainer: 'user@example.com',
    subscriber: 'user@example.com',
    accountFile: './cert/account.json',
    accountKeyFile: './cert/account.pem',
    ServerKeyFile: './cert//private.pem',
    fullChain: './cert/fullchain.pem',
  },
  // alternatively, if you don't want to use acme module, you can specify your own ssl keys here
  ssl: {
    Key: 'file-with-server-private-key',
    Crt: 'file-with-server-certificate',
  },
  // piproxy runs as secure http2 server while target server can be anything
  http2: {
    allowHTTP1: true,
    port: 443,
    secureOptions: crypto.constants.SSL_OP_NO_TLSv1 | crypto.constants.SSL_OP_NO_TLSv1_1,
  },
  // automatically redirect http requests to https
  redirectHTTP: true,
  // this is the main redirect list for reverse proxy
  redirects: [
    { url: 'example1.ddns.net', target: 'localhost', port: '8000' },
    { url: 'example2.ddns.net', target: 'localhost', port: '8001' },
    { url: 'example3.ddns.net', target: 'localhost', port: '8002' },
    { default: true, target: 'localhost', port: '8000' },
  ],
  // automatic status monitoring of both destination urls and targets listed in redirects
  monitor: true,
  // if present, piproxy will throttle requests
  limiter: {
    interval: 10,
    tokens: 500,
  },
  // if present, piproxy will compress all responses before sending them out
  // exception is if client does not understand enhanced compression or output has already been compressed
  brotli: true,
  // log to database in addition to a log file
  db: 'piproxy.db',
  // use geoip reverse lookups to locate requests
  // databases can be obtained for free from maxmind at <https://dev.maxmind.com/geoip/geoip2/geolite2/>
  geoIP: {
    city: './geoip/GeoLite2-City.mmdb',
    asn: './geoip/GeoLite2-ASN.mmdb',
  },
  // if present, piproxy will use helmet module for additional security
  helmet: {
    frameguard: { action: 'deny' },
    xssFilter: false,
    dnsPrefetchControl: { allow: 'true' },
    noSniff: false,
    hsts: { maxAge: 15552000, preload: true },
    referrerPolicy: { policy: 'no-referrer' },
    expectCt: { enforce: true },
    contentSecurityPolicy: {
      // modify csp policies as needed to match your requirements
      directives: {
        'default-src': ["'self'"],
        'img-src': ["'self'", 'data:', 'http:', 'https:'],
        'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        'style-src': ["'self'", 'https:', "'unsafe-inline'"],
        'connect-src': ["'self'", 'http:', 'https:'],
        'upgrade-insecure-requests': [],
      },
    },
  },
  // if present, piproxy will reply with default answers to standard url requests
  // simply remove if you want to manage your own as then piproxy will perform passthrough requests
  'security.txt': 'Contact: mailto:user@example.com\nPreferred-Languages: en\n',
  'humans.txt': '/* TEAM */\nChef: Unknown chef\nContact: user@example.com\nGitHub: https://github.com/vladmandic\n',
  'robots.txt': 'User-agent: *\nDisallow: /private\nCrawl-delay: 10\n',
  'git.head': 'ref: refs/heads/master\n',
  'sitemap.xml': '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n<url>\n<loc>URL</loc>\n</url>\n</urlset>',
};
```

### Permissions

To allow the server to listen on privledged ports (TCP ports below 1024), you need to either:

1. Configure your system so node process can bind to priviledged ports without running as root:  
(you only need to do this once)

  ```shell
    sudo setcap 'cap_net_bind_service=+ep' `which node`
  ```

2. Run node as root with sudo:

  ```shell
    sudo node server/piproxy.js
  ```

   In that case, PiProxy will automatically try to drop priviledges as soon as server is started:
   Note: Do not login as root and then run node - it is highly insecure!

  ```log
    2020-08-10 15:02:19 STATE:  Reducing runtime priviledges
    2020-08-10 15:02:19 STATE:  Running as UID:1000
  ```

3. Run node on a non-priviledged port and forward a desired priviledged port to a non-priviledged one using firewall NAT configuration. For example, to route TCP port 443 (https) to port 8000:

```shell
  sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j REDIRECT --to-port 3000
  or
  sudo ipfw add 100 fwd 127.0.0.1,8000 tcp from any to any 80 in
```

### Advanced usage

For custom error handling, see `server/proxy.js:findTarget()` function which currently implements custom handler for error 404 (HTTP Not Found) by returning content of `server/error.js:get404()` instead of forwarding error as-is from a proxied server.  

## Example log

Sample PiProxy startup log:

```log
2020-08-19 12:25:10 INFO:  @vladmandic/piproxy version 1.0.13
2020-08-19 12:25:10 INFO:  User: vlado Platform: linux Arch: x64 Node: v14.8.0
2020-08-19 12:25:10 STATE:  Application log: /home/vlado/dev/piproxy/piproxy.log
2020-08-19 12:25:10 STATE:  Change log updated: /home/vlado/dev/piproxy/CHANGELOG.md
2020-08-19 12:25:10 INFO:  ACME certificate: check: ./cert/fullchain.pem
2020-08-19 12:25:10 INFO:  SSL account: mailto:mandic00@live.com created: 2020-04-23 21:55:15
2020-08-19 12:25:10 INFO:  SSL keys server:RSA account:EC
2020-08-19 12:25:10 INFO:  SSL certificate subject:pidash.ddns.net issuer:Let's Encrypt Authority X3
2020-08-19 12:25:10 STATE:  SSL certificate expires in 34.3 days, skipping renewal
2020-08-19 12:25:10 STATE:  GeoIP databases loaded
2020-08-19 12:25:10 INFO:  Log database: /home/vlado/dev/piproxy/piproxy.db
2020-08-19 12:25:10 INFO:  Enabling Helmet protection
2020-08-19 12:25:10 INFO:  Enabling rate limiter: { interval: 10, tokens: 500 }
2020-08-19 12:25:10 INFO:   Rule: { url: 'pidash.ddns.net', target: 'localhost', port: '10000' }
2020-08-19 12:25:10 INFO:   Rule: { url: 'pigallery.ddns.net', target: 'localhost', port: '10010' }
2020-08-19 12:25:10 INFO:   Rule: { url: 'pimiami.ddns.net', target: 'localhost', port: '10020' }
2020-08-19 12:25:10 INFO:   Rule: { default: true, target: 'localhost', port: '10010' }
2020-08-19 12:25:10 INFO:  Activating reverse proxy
2020-08-19 12:25:10 STATE:  Proxy listening: { address: '::', family: 'IPv6', port: 443 }
2020-08-19 12:25:17 STATE:  Monitoring { url: 'pidash.ddns.net', target: 'localhost', port: '10000' } URL: { lookup: true, connect: true, ready: true } Target: { lookup: true, connect: true, ready: true }
2020-08-19 12:25:17 STATE:  Monitoring { url: 'pigallery.ddns.net', target: 'localhost', port: '10010' } URL: { lookup: true, connect: true, ready: true } Target: { lookup: true, connect: true, ready: true }
2020-08-19 12:25:17 STATE:  Monitoring { url: 'pimiami.ddns.net', target: 'localhost', port: '10020' } URL: { lookup: true, connect: true, ready: true } Target: { lookup: true, connect: true, ready: true }
2020-08-19 12:25:17 STATE:  Monitoring { default: true, target: 'localhost', port: '10010' } URL: { lookup: true, connect: true, ready: true } Target: { lookup: true, connect: true, ready: true }
2020-08-19 12:25:17 STATE:  NoIP { hostname: 'pimiami.ddns.net', status: 200, text: 'nochg 159.250.182.243' }
2020-08-19 12:25:17 STATE:  NoIP { hostname: 'pigallery.ddns.net', status: 200, text: 'nochg 159.250.182.243' }
2020-08-19 12:25:17 STATE:  NoIP { hostname: 'pidash.ddns.net', status: 200, text: 'nochg 159.250.182.243' }```
```

Note that in addition to request analysis, note that piproxy also measures duration of the response from target server as well as the length of the response.  

Sample actual reverse proxy log:  

```log
2020-08-19 11:33:15 DATA:  GET/h2 Code: 200 https://pimiami.ddns.net/ From:::ffff:172.58.14.224 Length: 3758 Agent:AppleWebKit/537.36 Chrome/77.0.3865.116 Mobile Safari/537.36 EdgA/45.07.4.5054 Device:Linux; Android 10; SM-G975U Geo:'NA/US/Miami' ASN:'T-Mobile USA, Inc.' Loc:25.8119,-80.2318
2020-08-19 11:33:16 DATA:  GET/h2 Code: 200 https://pimiami.ddns.net/piclock.js From:::ffff:172.58.14.224 Length: 6576 Agent:AppleWebKit/537.36 Chrome/77.0.3865.116 Mobile Safari/537.36 EdgA/45.07.4.5054 Device:Linux; Android 10; SM-G975U Geo:'NA/US/Miami' ASN:'T-Mobile USA, Inc.' Loc:25.8119,-80.2318
2020-08-19 11:33:17 DATA:  GET/h2 Code: 200 https://pimiami.ddns.net/favicon.png From:::ffff:172.58.14.224 Length: 34831 Agent:AppleWebKit/537.36 Chrome/77.0.3865.116 Mobile Safari/537.36 EdgA/45.07.4.5054 Device:Linux; Android 10; SM-G975U Geo:'NA/US/Miami' ASN:'T-Mobile USA, Inc.' Loc:25.8119,-80.2318
```

## Example database record

```js
  {
    timestamp: 2020-08-14T11:36:49.503Z,
    method: 'GET',
    protocol: 'h2',
    status: 200,
    scheme: 'https',
    host: 'pimiami.ddns.net',
    url: '/',
    ip: '::ffff:172.58.173.63',
    length: '3794',
    agent: 'AppleWebKit/537.36 Chrome/77.0.3865.116 Mobile Safari/537.36 EdgA/45.07.4.5054',
    device: 'Linux; Android 10; SM-G975U',
    country: 'US',
    continent: 'NA',
    city: 'Orlando',
    asn: 'T-Mobile USA, Inc.',
    lat: 28.53,
    lon: -81.4057,
    accuracy: 500,
    etag: 'W/"1a-0BqrfQKkcPxt5MD1uQ+QrVjOnGo"',
    mime: 'text/html',
    duration: 8
  }
```

## Statistics

You can access PiProxy statistics on any domain it serves under `/piproxy`.  
Example: <https://test.example.com>

### Advanced queries

You can pass query params to statistics module directly using URL params (any database field can be queried)  
Example: <https://example1.ddns.com/piproxy?'"host":"example1.ddns.net"'>

## Change log

<https://github.com/vladmandic/piproxy/CHANGELOG.md>
