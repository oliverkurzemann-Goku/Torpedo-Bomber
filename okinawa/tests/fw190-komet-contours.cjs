'use strict';
const {execFileSync}=require('node:child_process'),path=require('node:path');
execFileSync(process.execPath,[path.resolve(__dirname,'../../scripts/check-fw190-komet-contours.cjs')],{stdio:'inherit'});
