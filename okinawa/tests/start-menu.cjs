const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');

for(const file of ['torpedo-carrier.html','remagen-mission.html']){
  const html=fs.readFileSync(path.resolve(__dirname,'../../',file),'utf8');
  const menu=html.match(/<div class="overlay(?: hidden)?" id="menu">([\s\S]*?)<!-- (?:Briefing|---------------- BRIEFING)/);
  assert(menu,`${file}: start menu found`);
  assert(menu[1].indexOf('id="selBtn"')<menu[1].indexOf('class="card menuCard"'),`${file}: Change Game above scrolling missions`);
  assert.match(html,/#menu:not\(\.hidden\)\{display:block;overscroll-behavior:contain;/,`${file}: menu scrolls on landscape iPad`);
  assert.match(menu[1],/<details class="quickGuide" open>/,`${file}: first-flight instructions visible`);
  assert.match(html,/id="menuLandingSpeed"/);
  assert.match(html,/id="briefLandingSpeed"/);
  assert.match(html,/state!==ST\.FLIGHT\|\|e\.changedTouches\.length!==1/,`${file}: zoom guard limited to flight`);
}
console.log('Both game menus scroll, retain Change Game, explain flight and landing, and scope zoom guard');
