import { appendFileSync } from 'node:fs';
const marker = process.argv[2];
if (!marker) process.exit(2);
appendFileSync(marker, `worker:${process.pid}\n`);
setInterval(() => undefined, 1000);
