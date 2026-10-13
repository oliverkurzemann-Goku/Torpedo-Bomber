/* Only injected into the native/offline payload; the Pages game stays buildless. */
import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {Preferences} from '@capacitor/preferences';
if(Capacitor.isNativePlatform()){
 window.SquadronNative={
  async get(key){return (await Preferences.get({key})).value;},
  async set(key,value){await Preferences.set({key,value});},
  async remove(key){await Preferences.remove({key});}
 };
 App.addListener('appStateChange',({isActive})=>{
  if(!isActive)window.dispatchEvent(new Event('squadronbackground'));
 }).catch(error=>console.warn('Native lifecycle:',error));
}
