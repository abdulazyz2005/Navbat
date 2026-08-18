import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

/**
 * .env monorepo ildizida turadi, lekin apps/bot o'z papkasidan ishga tushadi —
 * shuning uchun faylni yuqoriga qarab qidiramiz.
 */
export function loadRootEnv(): void {
  let dir = process.cwd();
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}
