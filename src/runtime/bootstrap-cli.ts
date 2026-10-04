import { bootstrap } from '../bootstrap/bootstrap.js';

try { await bootstrap(process.argv.slice(2)); }
catch (error) { console.error(error instanceof Error ? error.message : 'BOOTSTRAP_FAILED'); process.exitCode = 1; }
