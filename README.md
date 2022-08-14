# PiProxy

*Reverse Proxy in NodeJS for HTTP/HTTPS/HTTP2 with Automatic SSL Management, Compression, Security Enforcement and Rate Limiting*

When you run a server app that runs as web server, you want a way to expose it using user-friendly URL  
And typically this is done using and configuring a commerical grade server such as [nginx](https://nginx.org/en/) that will perform reverse proxy functions from user-friendly URL to your local server  

But what if you want to do it all in `NodeJS`?  
And have automatic handling of dynamic DNS and SSL certificates?  

<br>

## Features

- Native HTTP2 support as front-end
- Can proxy to HTTP2, HTTPS or HTTP destinations
- ACME/LetsEncrypt support for automatic creation and renewal of free, valid and signed SSL certificates
- No-IP support for automatic dynamic IP updates such as ddns.net and others
- Configurable passthrough compression using Brotli algorithm
- Optional rate limiting using sliding window
- TLS version protection (TLS v1.2 and higher are allowed)
- Helmet and CSP protection
- GeoIP reverse lookups on access (large package size is due to GeoIP lite databases included in the package)
- Custom error handling
- Agent analysis on access
- Full logging support

<br>

## Install & Run

### Prerequisites

1. Install [NodeJS](https://nodejs.org/en/)  
2. Set [NodeJS](https://nodejs.org/en/) permissions  
   See section [Permissions](###Permissions) for options  
3. Choose how you want to handle SSL certificates  
   See section [SSL Options](###SSL-Options) for options  
4. Set your **router** to redirect all HTTPS traffic to your proxy server
   This will allow secure access from internet  
   Alternatively, run without external access  
   Note that external access is required to require valid signed SSL certificate  
5. If you want to perform optional location lookups based on IP,  
   download [MaxMind](https://dev.maxmind.com/geoip/geolite2-free-geolocation-data?lang=en) city and ASN databases

### Install & Run

1. Clone latest version of `piproxy`
    > git clone --depth 1 https://github.com/vladmandic/piproxy`  
2. Create configuration  
   Rename `config.json.sample` to `config.json` and modify it as needed  
   See section [Configuration](##Configuration) for details
3. Start `piproxy`:
    > `npm start`  

    or use `piproxy.service` as a template (notes are within service file) to create a Linux `systemd` service  

<br>

## Configuration

Example of minimum configuration from `config.json.sample`:

```json
{
  // main section that controls all reverse proxy functions
  "redirects": [
    // for any request matching `weather.ddns.net` fetch data from `locahost:10000`
    { "url": "weather.ddns.net", "target": "localhost", "port": "10000" },
    { "url": "clock.ddns.net", "target": "localhost", "port": "10010" },
    { "url": "profile.ddns.net", "target": "localhost", "port": "10020" },
    // for any request that does not match any rule fetch data from `locahost:10000`
    { "default": true, "target": "localhost", "port": "10000" }
  ],
  // optional: update dynamic ip for a listed hosts using provided username and password at no-ip service
  "noip": {
    "host": [ "weather.ddns.net", "clock.ddns.net", "profile.ddns.net" ],
    "user": "me@example.com",
    "password": "password"
  },
  // optional: automatically handle ssl certificates for listsed domains using let's encrypt service
  "acme": {
    "domains": [ "weather.ddns.net", "clock.ddns.net", "profile.ddns.net" ],
    "maintainer": "me@example.com",
    "subscriber": "me@example.com"
  },
  // optional: provide predefined http responses on some well known static paths
  "answers": {
    "security.txt": "Contact: mailto:me@example.com\nPreferred-Languages: en\n"
  }
}
```

Default locations (can be changed in advanced configuration):
- Certificates are stored in `/cert`
- Logs are stored in `/logs`
- GeoIP databases are stored in `/geoip`

Full configuration details can be seen at [https://github.com/vladmandic/piproxy/tree/master/src/config.ts]

<br>

## Notes
### SSL Options

- Provide your own private key and server certificate 

- Generate self-signed private key and server certificate

  > openssl req -x509 -newkey rsa:4096 -nodes -days 365 \
    -keyout https.key -out https.crt \
    -subj "/C=US/ST=Florida/L=Miami/O=@vladmandic"

- Allow `piproxy` to automatically get signed certificate from [Let's Encypt](https://letsencrypt.org/)  
  In this case, `piproxy` will automatically handle certificate renewals

### Permissions

To allow the server to listen on privledged ports (TCP ports below 1024), you need to either:

- Configure your system so node process can bind to priviledged ports without running as root:  
  (you only need to do this once)
  > sudo setcap 'cap_net_bind_service=+ep' `which node`

- Run node as root with sudo:
  > sudo node server/proxy.js
  In that case, proxy will automatically try to drop priviledges as soon as server is started

- Run node on a non-priviledged port and  
  forward a desired priviledged port to a non-priviledged one using firewall NAT configuration  
  For example, to route TCP port 443 (https) to port 8000:

  > sudo iptables -t nat -A PREROUTING -i eth0 -p tcp --dport 80 -j REDIRECT --to-port 8000  

  or  

  > sudo ipfw add 100 fwd 127.0.0.1,8000 tcp from any to any 80 in


### Compression

proxy uses Brotli algorithm with a configurable level of compression.
Example of compression efficiency on pure html:

- L0: 2.1 MB (original without compression)
- L1: 692 kB
- L3: 577 kB
- L5: 516 kB
- L9: 494 kB

### GeoIP

GeoIP databases are not included in the package and should be provided by user.
Once databases are available, they can be specified in the configuration:

```js
  // use geoip reverse lookups to locate requests
  // databases can be obtained for free from maxmind at <https://dev.maxmind.com/geoip/geoip2/geolite2/>
  geoIP: {
    city: './geoip/GeoLite2-City.mmdb',
    asn: './geoip/GeoLite2-ASN.mmdb',
  },
```

## Example Log

### Startup

```js
2022-08-14 11:01:13 INFO:  configuration { file: 'config.json' }
2022-08-14 11:01:13 INFO:  { application: '@vladmandic/piproxy', version: '2.0.0' }
2022-08-14 11:01:13 INFO:  { user: 'vlado', platform: 'linux', arch: 'x64', node: 'v18.7.0' }
2022-08-14 11:01:13 STATE: { log: '/home/vlado/dev/piproxy/logs/proxy.log', access: '/home/vlado/dev/piproxy', client: '/home/vlado/dev/piproxy' }
2022-08-14 11:01:13 INFO:  ssl { key: '../cert/private.pem', crt: '../cert/fullchain.pem' }
2022-08-14 11:01:13 INFO:  ssl account { contact: 'mailto:mandic00@live.com', status: 'valid', type: 'EC', crv: 'P-256' }
2022-08-14 11:01:13 INFO:  ssl server { subject: 'pidash.ddns.net', issuer: "C=US, O=Let's Encrypt, CN=R3", algorithm: 'sha256WithRSAEncryption', from: 2022-07-12T12:09:02.000Z, until: 2022-10-10T12:09:01.000Z, type: 'RSA', use: 'sig' }
2022-08-14 11:01:13 INFO:  ssl certificate { check: './cert/fullchain.pem' }
2022-08-14 11:01:13 STATE: ssl certificate validity { days: 57, renew: 'skip' }
2022-08-14 11:01:13 STATE: geoip { city: './geoip/GeoLite2-City.mmdb', asn: './geoip/GeoLite2-ASN.mmdb' }
2022-08-14 11:01:13 INFO:  helmet { frameguard: false, xssFilter: false, dnsPrefetchControl: { allow: true }, noSniff: false, hsts: { maxAge: 15552000, preload: true }, referrerPolicy: { policy: 'no-referrer' }, expectCt: { enforce: true }, contentSecurityPolicy: { directives: { count: [ '10' ] } } }
2022-08-14 11:01:13 INFO:  limiter { interval: 10, tokens: 500 }
2022-08-14 11:01:13 INFO:  compression { brotli: 5 }
2022-08-14 11:01:13 INFO:  proxy { url: 'pimiami.ddns.net', target: 'localhost', port: '10060' }
2022-08-14 11:01:13 INFO:  proxy { url: 'weather.local', target: 'localhost', port: '10060' }
2022-08-14 11:01:13 INFO:  proxy { url: 'stocks.local', target: 'localhost', port: '10040' }
2022-08-14 11:01:13 INFO:  proxy { url: 'pi.hole', target: 'localhost', port: '10050' }
2022-08-14 11:01:13 INFO:  proxy { default: true, target: 'localhost', port: '10020' }
2022-08-14 11:01:13 INFO:  static { paths: [ 'security.txt', 'humans.txt', 'robots.txt', 'git.head', 'sitemap.xml', 'version' ] }
2022-08-14 11:01:13 STATE: server { status: 'listening', address: '::', family: 'IPv6', port: 443 }
2022-08-14 11:01:13 STATE: server { user: { uid: 1000, gid: 1000, username: 'vlado', homedir: '/home/vlado', shell: '/bin/bash' } }
2022-08-14 11:01:13 STATE: noip { hostname: 'pimiami.ddns.net', status: 200, text: 'nochg 159.250.178.205' }
2022-08-14 11:01:15 STATE: monitor { server: { url: 'pimiami.ddns.net', target: 'localhost', port: '10060' }, url: { lookup: false, connect: false, error: '', ready: false, data: false }, target: { lookup: false, connect: false, error: '', ready: false, data: false } }
2022-08-14 11:01:16 STATE: monitor { server: { url: 'weather.local', target: 'localhost', port: '10060' }, url: { lookup: false, connect: false, error: '', ready: false, data: false }, target: { lookup: false, connect: false, error: '', ready: false, data: false } }
2022-08-14 11:01:16 STATE: monitor { server: { url: 'stocks.local', target: 'localhost', port: '10040' }, url: { lookup: false, connect: false, error: '', ready: false, data: false }, target: { lookup: false, connect: false, error: '', ready: false, data: false } }
2022-08-14 11:01:16 STATE: monitor { server: { url: 'pi.hole', target: 'localhost', port: '10050' }, url: { lookup: false, connect: false, error: '', ready: false, data: false }, target: { lookup: false, connect: false, error: '', ready: false, data: false } }
2022-08-14 11:01:17 STATE: monitor { server: { default: true, target: 'localhost', port: '10020' }, url: { lookup: false, connect: false, error: '', ready: false, data: false }, target: { lookup: false, connect: false, error: '', ready: false, data: false } }
2022-08-14 11:01:18 STATE: server { status: 'active', connections: 0, error: null }
```

### Client Requests

```js
2022-08-14 11:05:33 DATA:  { method: 'GET', protocol: 'h2', status: 200, scheme: 'https', host: 'pimiami.ddns.net', url: '/', ip: '::ffff:192.168.0.201', agent: [ 'AppleWebKit/537.36', 'Chrome/104.0.5112.81', 'Safari/537.36', 'Edg/104.0.1293.54' ], client: 'https://pimiami.ddns.net/', device: 'Windows NT 10.0; Win64; x64', mime: 'text/html; charset=utf-8', duration: 550 }
2022-08-14 11:05:33 DATA:  { method: 'GET', protocol: 'h2', status: 200, scheme: 'https', host: 'pimiami.ddns.net', url: '/index.css', ip: '::ffff:192.168.0.201', agent: [ 'AppleWebKit/537.36', 'Chrome/104.0.5112.81', 'Safari/537.36', 'Edg/104.0.1293.54' ], client: 'https://pimiami.ddns.net/index.css', device: 'Windows NT 10.0; Win64; x64', mime: 'text/css; charset=utf-8', duration: 11 }
2022-08-14 11:05:33 DATA:  { method: 'GET', protocol: 'h2', status: 200, scheme: 'https', host: 'pimiami.ddns.net', url: '/assets/leaflet.css', ip: '::ffff:192.168.0.201', agent: [ 'AppleWebKit/537.36', 'Chrome/104.0.5112.81', 'Safari/537.36', 'Edg/104.0.1293.54' ], client: 'https://pimiami.ddns.net/assets/leaflet.css', device: 'Windows NT 10.0; Win64; x64', mime: 'text/css; charset=utf-8', duration: 12 }
2022-08-14 11:05:34 DATA:  { method: 'GET', protocol: 'h2', status: 200, scheme: 'https', host: 'pimiami.ddns.net', url: '/dist/index.js', ip: '::ffff:192.168.0.201', agent: [ 'AppleWebKit/537.36', 'Chrome/104.0.5112.81', 'Safari/537.36', 'Edg/104.0.1293.54' ], client: 'https://pimiami.ddns.net/dist/index.js', device: 'Windows NT 10.0; Win64; x64', mime: 'text/javascript; charset=utf-8', duration: 35 }
2022-08-14 11:05:34 DATA:  { method: 'GET', protocol: 'h2', status: 200, scheme: 'https', host: 'pimiami.ddns.net', url: '/favicon.ico', ip: '::ffff:192.168.0.201', agent: [ 'AppleWebKit/537.36', 'Chrome/104.0.5112.81', 'Safari/537.36', 'Edg/104.0.1293.54' ], client: 'https://pimiami.ddns.net/favicon.ico', device: 'Windows NT 10.0; Win64; x64', mime: 'image/x-icon', duration: 9 }
2022-08-14 11:05:34 DATA:  { method: 'GET', protocol: 'h2', status: 200, scheme: 'https', host: 'pimiami.ddns.net', url: '/dist/pwa-serviceworker.js', ip: '::ffff:192.168.0.201', agent: [ 'AppleWebKit/537.36', 'Chrome/104.0.5112.81', 'Safari/537.36', 'Edg/104.0.1293.54' ], client: 'https://pimiami.ddns.net/dist/pwa-serviceworker.js', device: 'Windows NT 10.0; Win64; x64', mime: 'text/javascript; charset=utf-8', duration: 11 }
2022-08-14 11:05:34 DATA:  { method: 'GET', protocol: 'h2', status: 200, scheme: 'https', host: 'pimiami.ddns.net', url: '/weather.webmanifest', ip: '::ffff:192.168.0.201', agent: [ 'AppleWebKit/537.36', 'Chrome/104.0.5112.81', 'Safari/537.36', 'Edg/104.0.1293.54' ], client: 'https://pimiami.ddns.net/weather.webmanifest', device: 'Windows NT 10.0; Win64; x64', mime: 'application/manifest+json', duration: 5 }
2022-08-14 11:05:34 DATA:  { method: 'GET', protocol: 'h2', status: 200, scheme: 'https', host: 'pimiami.ddns.net', url: '/assets/icons/dash-256.png', ip: '::ffff:192.168.0.201', agent: [ 'AppleWebKit/537.36', 'Chrome/104.0.5112.81', 'Safari/537.36', 'Edg/104.0.1293.54' ], client: 'https://pimiami.ddns.net/assets/icons/dash-256.png', device: 'Windows NT 10.0; Win64; x64', mime: 'image/png', duration: 6 }
```

## Links

- [License](https://github.com/vladmandic/proxy/LICENSE)
- [Contributing Guidelines](https://github.com/vladmandic/proxy/CONTRIBUTING)
- [Security Policy](https://github.com/vladmandic/proxy/SECURITY)
- [Code of Conduct](https://github.com/vladmandic/proxy/CODE_OF_CONDUCT)
- [Change Log](https://github.com/vladmandic/proxy/CHANGELOG.md)


