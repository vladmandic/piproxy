const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git/promise');
const log = require('@vladmandic/pilogger');

async function update(f) {
  const git = simpleGit();
  let text = '# PiProxy Change Log\n';
  const gitLog = await git.log();
  const sorted = gitLog.all.sort((a, b) => (new Date(b.date).getTime() - new Date(a.date).getTime()));
  for (const entry of sorted) {
    if (entry.refs !== '') {
      let ver = entry.refs.split(' ');
      ver = ver[ver.length - 1];
      const dt = new Date(entry.date);
      const date = `${dt.getMonth()}/${dt.getDate()}/${dt.getFullYear()}`;
      if (ver !== 'master') text += `\n### **${ver}** ${date} ${entry.author_email}\n`;
    } else if (entry.message !== '') {
      text += `\n- ${entry.message}\n`;
    }
  }
  const name = path.join(__dirname, '../', f);
  fs.writeFileSync(name, text);
  log.state('Change log updated:', name);
}

exports.update = update;
