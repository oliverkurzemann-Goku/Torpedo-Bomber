'use strict';
// Build 282: the shipped three r128 carries the instancing patch, and reversing it gives
// the original r128 file byte for byte (the pixel comparison is three-instancing-browser.cjs).
const assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {patch,unpatch}=require('../../scripts/patch-three-instancing.cjs');
const shipped=fs.readFileSync(path.join(__dirname,'../../vendor/three-r128.min.js'),'utf8');
assert.equal(patch(shipped),shipped,'vendor/three-r128.min.js must be patched (node scripts/patch-three-instancing.cjs)');
const original=unpatch(shipped);
assert.equal(crypto.createHash('sha256').update(original).digest('hex'),'9274bbcec8d96168626c732b5d31c775aa8cfb7eaa0599bec0c175908a2c1ce2');
assert.equal(patch(original),shipped,'patching the original reproduces the shipped file');
// both games load the patched file under a new cache key
for(const page of ['remagen-mission.html','torpedo-carrier.html'])
  assert.match(fs.readFileSync(path.join(__dirname,'../..',page),'utf8'),/vendor\/three-r128\.min\.js\?v=282/);
console.log('three r128 instancing patch: present, reversible to the original r128 file');
