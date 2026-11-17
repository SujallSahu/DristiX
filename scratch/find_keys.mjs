import fs from 'node:fs';
import path from 'node:path';

function search(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'node_modules' && f !== '.git' && f !== 'dist') search(full);
    } else if (f.endsWith('.ts') || f.endsWith('.tsx')) {
      const c = fs.readFileSync(full, 'utf8');
      const lines = c.split('\n');
      lines.forEach((line, i) => {
        if (/KeyS|KeyV|key.*['"](s|v)['"]/i.test(line)) {
          console.log(`${full}:${i + 1}: ${line.trim()}`);
        }
      });
    }
  }
}

search('src');
