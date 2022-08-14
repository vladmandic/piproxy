export function get404(obj): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>proxy Error</title>
      <meta http-equiv="content-type">
      <meta content="text/html; charset=utf-8">
      <meta name="Description" content="proxy Error">
      <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=yes">
      <link rel="shortcut icon" href="/favicon.ico" type="image/x-icon">
    </head>
    <body style="background: black; color: #ebebeb; line-height: 2rem; font-family: sans-serif; text-align: center; letter-spacing: 2px">
      <div style="font-size: 1.3rem; margin-top: 40px">
        <font color="lightcoral"><b>Error 404</b> for URL: <b>${obj.scheme}://${obj.host}${obj.url}</b><br>
        The requested URL was not found on this server. That's it.</font><br>
      </div>
      <div style="font-size: 1.0rem; margin-top: 40px">
        Client IP</b>: <b>${obj.ip}</b><br>
        ${obj.agent ? 'Agent: <b>' + obj.agent + '</b><br>' : ''}
        ${obj.device ? 'Device: <b>' + obj.device + '</b><br>' : ''}
        ${obj.geo?.city ? 'Location: <b>' + obj.geo.city + '</b>, <b>' + obj.geo.country + '</b><br>' : ''}
        ${obj.geo?.asn ? 'ASN: <b>' + obj.geo.asn + '</b>' : ''}
        ${obj.geo?.lat ? 'Coordinates: <b>' + obj.geo.lat + '°</b>, <b>' + obj.geo.lon + '°</b><br>' : ''}
      </div>
    </body>
    </html>
  `;
}
