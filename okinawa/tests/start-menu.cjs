const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

for(const file of ['torpedo-carrier.html','remagen-mission.html']){
  const html=fs.readFileSync(path.resolve(__dirname,'../../',file),'utf8');
  const menu=html.match(/<div class="overlay(?: hidden)?" id="menu"[^>]*>([\s\S]*?)<!-- (?:Briefing|---------------- BRIEFING)/);
  assert(menu,`${file}: start menu found`);
  assert(menu[1].indexOf('id="selBtn"')<menu[1].indexOf('class="card menuCard"'),`${file}: Change Game above scrolling missions`);
  assert.match(html,/#menu:not\(\.hidden\)\{display:block;overscroll-behavior:contain;/,`${file}: menu scrolls on landscape iPad`);
  assert.match(menu[1],/<details class="quickGuide"><summary>Controls &amp; landing guide/,`${file}: guide remains one tap away without crowding missions`);
  const build=html.match(/BUILD (\d+)/)[1];
  assert(html.includes('<link rel="stylesheet" href="menu-layout.css?v='+build+'">'));
  assert.match(menu[1],/class="menuOverview"/);
  assert.match(menu[1],/class="missionPanel"/);
  assert.match(html,/id="pauseMainMenu">Main Menu · Change Game/);
  assert.match(html,/class="btn abortBtn"[^>]*>Abort Mission/);
  assert.match(html,/id="menuLandingSpeed"/);
  assert.match(html,/id="briefLandingSpeed"/);
  assert.match(html,/state!==ST\.FLIGHT&&!steeringParachute\(\)/,`${file}: zoom guard limited to flight and active parachute`);
}
const css=fs.readFileSync(path.resolve(__dirname,'../../menu-layout.css'),'utf8');
assert.match(css,/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
assert.match(css,/min-width:184px;min-height:50px/);
for(const region of ['pacific','europe']){
  const file=path.resolve(__dirname,'../../assets/',region+'-campaign.webp');
  const data=fs.readFileSync(file);assert.equal(data.subarray(8,12).toString(),'WEBP');
  assert(data.length<250000,'campaign art is optimized for tablet loading');
}
console.log('Shared landscape menu, larger navigation, accessible guides, realistic art and explicit pause exits');
