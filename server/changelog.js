const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git/promise');
const logger = require('@vladmandic/pilogger');

const git = simpleGit();

async function update(f) {
  let text = '# PiGallery Change Log\n';
  const all = await git.log();
  const log = all.all.sort((a, b) => (new Date(b.date).getTime() - new Date(a.date).getTime()));

  let previous = '';
  for (const l of log) {
    const msg = l.message.toLowerCase();
    if ((l.refs !== '') || msg.match(/^[0-9].[0-9].[0-9]/)) {
      // const dt = moment(l.date).format('YYYY/MM/DD');
      const d = new Date(l.date);
      const dt = `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, 0)}/${d.getDate().toString().padStart(2, 0)}`;
      const ver = msg.match(/[0-9].[0-9].[0-9]/) ? msg : l.refs;
      text += `\n### **${ver}** ${dt} ${l.author_email}\n`;
    } else if ((msg.length > 2) && !msg.startsWith('update') && (previous !== msg)) {
      // console.log('text', previous, l.message, 'qqq');
      previous = msg;
      text += `- ${msg}\n`;
    }
  }

  // process.stdout.write(text);
  const name = path.join(__dirname, '../', f);
  fs.writeFileSync(name, text);
  logger.state('Change log updated:', name);
}

exports.update = update;

if (!module.parent) {
  update('CHANGELOG.md');
}
