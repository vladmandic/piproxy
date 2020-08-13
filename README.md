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

## Statistics

You can access PiProxy statistics on any domain it serves under `/piproxy`.  
Example: <https://test.example.com>

```json
PiProxy Statistics
Records: 3735 Unique IPs: 6 ASNs: 4 Continents: 3 Agents: 7 Devices: 5
Last log:
2020-08-13T15:30:41.578Z method:GET protocol:h2 status:200 client:https://pimiami.ddns.net/piproxy ip:::ffff:192.168.0.200 length:0 agent:AppleWebKit/537.36 Chrome/84.0.4147.125 Safari/537.36 Edg/84.0.522.59 device:Windows NT 10.0; Win64; x64 duration:null _id:09gXzAyv56dHLe25
Error log:
2020-08-13T15:07:20.817Z method:GET protocol:h2 status:404 client:https://pimiami.ddns.net/test ip:::ffff:127.0.0.1 length:0 agent:curl/7.68.0 device:unknown duration:4 _id:MooAnQF74aZuzWo4
````

## Configuration

Entire configuration is inside `server/piproxy.js` config object and all values are *optional*

- **logFile**: string  
  Proxy application and access log
- **noip**: object  
  If list of hosts exists, piproxy will update dynamic ip for those hosts with no-ip as needed
- **acme**: object  
  If object exists, piproxy will use piacme module for automatic key and certificate management
- **ssl**: object  
  Used to manually specify server key and certificate if acme module is not used
- **http2**: object  
  Object passed to [http2.createSecureServer](https://nodejs.org/api/http2.html#http2_http2_createsecureserver_options_onrequesthandler)
- **redirectHTTP**: boolean   
  Should http://* requests be redirected to https://
- **redirects**: array  
  List of redirects using `url(source) -> target:port` mapping.  
  Default object is used when there are no strict rule matches.
- **limiter**: object  
  If present, piproxy will use token-bucket style of http request limiting.  
  `tokens` is maximum number of requests a client can make within the `interval` seconds before server starts returning error 429.
- **helmet**: object  
  Enables [Helmet](https://helmetjs.github.io/) and strict CSP protection.  
  Disable or configure manually in `server/middleware.js` `options.helmet` object if you have access permission errors on your site because security is too strict.
- **brotli**: boolean  
  Enable passthrough compression using brotli. Only used if data is uncompressed and target accepts encoding.
- **db**: string  
  Filename for database log, used by statistics module
- **geoIP**: object  
  If optional `city` and `asn` databases are present, proxy will attempt reverse GeoIP lookup on access

### Example configuration

```json
  {
    logFile: 'piproxy.log',
    noip: {
      host: ['pidash.ddns.net', 'pigallery.ddns.net', 'pimiami.ddns.net'],
      user: 'username',
      password: 'password,
    },
    acme: {
      application: 'piproxy/1.0.0',
      domains: ['pidash.ddns.net', 'pigallery.ddns.net', 'pimiami.ddns.net'],
      maintainer: 'mandic00@live.com',
      subscriber: 'mandic00@live.com',
      accountFile: './cert/account.json',
      accountKeyFile: './cert/account.pem',
      ServerKeyFile: './cert//private.pem',
      fullChain: './cert/fullchain.pem',
    },
      ssl: {
        Key: './cert//private.pem',
        Crt: './cert/fullchain.pem',
    },
    http2: {
      allowHTTP1: true,
      port: 443,
      secureOptions: crypto.constants.SSL_OP_NO_TLSv1 | crypto.constants.SSL_OP_NO_TLSv1_1,
    },
    redirectHTTP: true, // redirect http to https
    redirects: [
      { url: 'example1.com', target: 'localhost', port: '10000' },
      { url: 'example2.com', target: 'localhost', port: '10001' },
      { default: true, target: 'localhost', port: '1002' },
    ],
    limiter: {
      interval: 10,
      tokens: 500,
    },
    helmet: true,
    brotli: true,
    db: 'piproxy.db',
    geoIP: {
      city: './geoip/GeoLite2-City.mmdb',
      asn: './geoip/GeoLite2-ASN.mmdb',
    },
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

```js
  2020-08-06 12:06:45 STATE:  Application log set to /home/vlado/dev/piproxy/piproxy.log
  2020-08-06 12:06:45 INFO:  @vladmandic/piproxy version 1.0.4
  2020-08-06 12:06:45 INFO:  Platform: linux Arch: x64 Node: v14.4.0
  2020-08-06 12:06:45 INFO:  ACME certificate: check: ./cert/fullchain.pem
  2020-08-06 12:06:45 STATE:  Change log updated: /home/vlado/dev/piproxy/CHANGELOG.md
  2020-08-06 12:06:45 INFO:  SSL account: mailto:mandic00@live.com created: 2020-04-23 21:55:15
  2020-08-06 12:06:45 INFO:  SSL keys server:RSA account:EC
  2020-08-06 12:06:45 INFO:  SSL certificate subject:pidash.ddns.net issuer:Let's Encrypt Authority X3
  2020-08-06 12:06:45 STATE:  SSL certificate expires in 47.3 days, skipping renewal
  2020-08-06 12:06:45 STATE:  GeoIP databases loaded
  2020-08-06 12:06:46 INFO:  Enabling rate limiter: { interval: 10, tokens: 500 }
  2020-08-06 12:06:46 INFO:   Rule: { url: 'pidash.ddns.net', target: 'localhost', port: '10000' }
  2020-08-06 12:06:46 INFO:   Rule: { url: 'pigallery.ddns.net', target: 'localhost', port: '10010' }
  2020-08-06 12:06:46 INFO:   Rule: { url: 'pimiami.ddns.net', target: 'localhost', port: '10020' }
  2020-08-06 12:06:46 INFO:   Rule: { url: 'wyse', target: 'localhost', port: '10010' }
  2020-08-06 12:06:46 INFO:   Rule: { default: true, target: 'localhost', port: '10010' }
  2020-08-06 12:06:46 INFO:  Activating reverse proxy
  2020-08-06 12:06:46 STATE:  Proxy listening: { address: '::', family: 'IPv6', port: 443 }
  2020-08-06 12:06:47 STATE:  NoIP {"hostname":"pigallery.ddns.net","status":200,"text":"nochg 138.207.150.136"}
  2020-08-06 12:06:47 STATE:  NoIP {"hostname":"pidash.ddns.net","status":200,"text":"nochg 138.207.150.136"}
  2020-08-06 12:06:47 STATE:  NoIP {"hostname":"pimiami.ddns.net","status":200,"text":"nochg 138.207.150.136"}
  ...
  2020-08-06 12:09:22 DATA:  GET/h2 Code:200 https://pigallery.ddns.net/ From:::ffff:172.58.11.104 Size:0 OS:'Android' Device:'Samsung' Agent:'Chrome Mobile.77.0' Geo:'NA/US/Miami' ASN:'T-Mobile USA, Inc.' Loc:25.8119,-80.2318
  2020-08-06 12:09:23 DATA:  GET/h2 Code:200 https://pigallery.ddns.net/dist/gallery.js From:::ffff:172.58.11.104 Size:0 OS:'Android' Device:'Samsung' Agent:'Chrome Mobile.77.0' Geo:'NA/US/Miami' ASN:'T-Mobile USA, Inc.' Loc:25.8119,-80.2318
  2020-08-06 12:09:24 DATA:  GET/h2 Code:401 https://pigallery.ddns.net/api/user From:::ffff:172.58.11.104 Size:0 OS:'Android' Device:'Samsung' Agent:'Chrome Mobile.77.0' Geo:'NA/US/Miami' ASN:'T-Mobile USA, Inc.' Loc:25.8119,-80.2318
  2020-08-06 12:09:24 DATA:  GET/h2 Code:404 https://pigallery.ddns.net/missing From:::ffff:172.58.11.104 Size:151 OS:'Android' Device:'Samsung' Agent:'Chrome Mobile.77.0' Geo:'NA/US/Miami' ASN:'T-Mobile USA, Inc.' Loc:25.8119,-80.2318
  2020-08-06 12:09:27 DATA:  POST/h2 Code:302 https://pigallery.ddns.net/api/auth From:::ffff:172.58.11.104 Size:46 OS:'Android' Device:'Samsung' Agent:'Chrome Mobile.77.0' Geo:'NA/US/Miami' ASN:'T-Mobile USA, Inc.' Loc:25.8119,-80.2318
  ...
```

**Change log: <https://github.com/vladmandic/piproxy/CHANGELOG.md>**
