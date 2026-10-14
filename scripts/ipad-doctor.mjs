/* Read-only local readiness checks. No account access or credential handling. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const projectOnly=process.argv.includes('--project-only');
let failed=false;
function check(ok,label,fix){console.log(`${ok?'OK':'FEHLT'} · ${label}${!ok&&fix?' — '+fix:''}`);if(!ok)failed=true;}
const config=JSON.parse(await fs.readFile(path.join(root,'capacitor.config.json'),'utf8'));
const pbx=await fs.readFile(path.join(root,'ios/App/App.xcodeproj/project.pbxproj'),'utf8');
const plist=await fs.readFile(path.join(root,'ios/App/App/Info.plist'),'utf8');
check(config.webDir==='dist-app'&&!config.server?.url,'Lokales Offline-Paket');
check((pbx.match(/TARGETED_DEVICE_FAMILY = 2;/g)||[]).length===2&&!plist.includes('UIInterfaceOrientationPortrait'),'iPad / Querformat');
check((pbx.match(/CODE_SIGN_STYLE = Automatic;/g)||[]).length===2,'Automatische Signierung vorbereitet');
check(!pbx.includes('CODE_SIGN_ENTITLEMENTS'),'Keine zusätzlichen Entitlements für den Gerätetest');
for(const file of ['app/release/IPAD-INSTALLATION-DE.md','app/release/DEVICE-TEST-DE.md','app/release/rights-requests.md']){
 check(await fs.access(path.join(root,file)).then(()=>true,()=>false),file);
}
if(!projectOnly){
 check(Number(process.versions.node.split('.')[0])>=22,'Node.js 22 oder neuer','Node.js installieren/aktualisieren.');
 check(process.platform==='darwin','macOS für Xcode','Installation auf deinem Mac vorbereiten.');
 if(process.platform==='darwin'){
  const xcode=spawnSync('xcodebuild',['-version'],{encoding:'utf8'});
  const major=Number(xcode.stdout?.match(/Xcode (\d+)/)?.[1]||0);
  check(xcode.status===0&&major>=26,'Vollständiges Xcode 26+ ausgewählt','Xcode öffnen und unter Settings > Locations die Command Line Tools auswählen.');
  if(xcode.status===0)console.log(xcode.stdout.trim());
  const sdk=spawnSync('xcrun',['--sdk','iphoneos','--show-sdk-version'],{encoding:'utf8'});
  check(sdk.status===0,'iPad-Geräte-SDK vorhanden','Xcode vollständig installieren und einmal öffnen.');
  if(sdk.status===0)console.log('Geräte-SDK: '+sdk.stdout.trim()+'; Kompatibilität mit deinem iPadOS separat prüfen.');
  const packages=await fs.access(path.join(root,'node_modules/@capacitor/cli/package.json')).then(()=>true,()=>false);
  check(packages,'Projektabhängigkeiten installiert','Im Projektordner npm ci ausführen.');
 }
 console.log('\nIn Xcode bleibt: Apple Account anmelden, Personal Team wählen, iPad verbinden und Run drücken.');
 console.log('Diese Prüfung bestätigt keine Signierung, Geräteinstallation, Modellrechte oder iPad-Spieltests.');
}
process.exitCode=failed?1:0;
