import * as log from '@vladmandic/pilogger';

export type Service = { host: string, port: number, state: string, service: string };

export async function scan(host, startPort, endPort): Promise<Service[]> {
  try {
    const res = await fetch('https://www.ipfingerprints.com/scripts/getPortsInfo.php', {
      headers: {
        accept: 'application/json, text/javascript, */*; q=0.01',
        'cache-control': 'no-cache',
        'content-type': 'application/x-www-form-urlencoded',
        pragma: 'no-cache',
        Referer: 'https://www.ipfingerprints.com/portscan.php',
      },
      body: `remoteHost=${host}&start_port=${startPort}&end_port=${endPort}&normalScan=Yes&scan_type=connect&ping_type=none`,
      method: 'POST',
    });
    if (!res?.ok) return [];
    const html = await res.text();
    const text = html.replace(/<[^>]*>/g, '');
    const lines = text.split('\\n').map((line) => line.replace('\'', '').trim()).filter((line) => line.includes('tcp '));
    const parsed = lines.map((line) => line.replace('\\/tcp', '').split(' ').filter((str) => str.length > 0));
    const services: Service[] = parsed.map((line) => ({ host, port: Number(line[0]), state: line[1], service: line[2] }));
    log.state('Scan', services);
    return services;
  } catch {
    return [];
  }
}

// scan('pidash.ddns.net', 80, 80); // 164.68.154.59
