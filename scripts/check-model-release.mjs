import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['scripts/audit-model-delivery.mjs','--release'],{stdio:'inherit'});process.exit(result.status??1);
