function geo(obj) {
  const html = (obj.geo && obj.geo.country) ? `
    Location: <b>${obj.geo.city}</b>, <b>${obj.geo.country}</b><br>
    ASN: <b>${obj.geo.asn}</b><br>
    Coordinates: <b>${obj.geo.lat}°</b> Lat <b>${obj.geo.lon}°</b> Lon<br>
  ` : '';
  return html;
}

function agent(obj) {
  const html = obj.agent ? `
    Agent: <b>${obj.agent}</b><br>
    Device: <b>${obj.device}</b><br>
  ` : '';
  return html;
}

function get404(obj) {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>PiProxy Error</title>
      <meta http-equiv="content-type">
      <meta content="text/html; charset=utf-8">
      <meta name="Description" content="PiProxy Error">
      <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=yes">
      <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon">
    </head>
    <body style="background: black; padding: 40px; color: #ebebeb; line-height: 2rem; font-family: sans-serif;">
      <div style="display: block; margin-left: 20px; width: 80%">
        <div style="font-size: 1.3rem; margin-top: 20px">
          <font color="lightcoral"><b>Error 404</b> for URL: <b>${obj.scheme}://${obj.host}${obj.url}</b><br>
          The requested URL was not found on this server. That's it.</font><br>
        </div>
        <div style="font-size: 1.0rem; margin-top: 30px">
          IP</b>: <b>${obj.ip}</b><br>
          ${agent(obj)}
          ${geo(obj)}
        </div>
      </div>
    </body>
    </html>
  `;
  return html;
}

exports.get404 = get404;
