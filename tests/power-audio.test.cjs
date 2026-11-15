'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const elements=Object.fromEntries(['voice-enabled','voice-volume','voice-status'].map(id=>[id,{}])),listeners={},notes=[];let now=100000;
class AudioContext{
 constructor(){this.state='running';this.currentTime=1;this.destination={};}
 createOscillator(){const note={frequency:{},connect(){},disconnect(){},start(t){notes.push({frequency:this.frequency.value,time:t});},stop(){}};return note;}
 createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
}
const c={window:{AudioContext},document:{hidden:false,getElementById:id=>elements[id],addEventListener:(key,fn)=>listeners[key]=fn},localStorage:{getItem:()=>null,setItem(){}},FIELD_DATA:{units:{},buildings:{}},Date:{now:()=>now},setTimeout:()=>1,clearTimeout(){}};
vm.runInNewContext(fs.readFileSync(require.resolve('../voice.js'),'utf8'),c);const voice=c.window.FieldVoice;voice.setActive(true);
voice.notify({type:'lowPower'});assert.equal(notes.length,0,'audio waits for user interaction');
listeners.pointerdown({target:{}});voice.notify({type:'lowPower'});assert.equal(notes.length,4,'warning plays without speech-synthesis support');assert.deepEqual(notes.map(n=>n.frequency),[660,440,660,440]);
voice.notify({type:'lowPower'});assert.equal(notes.length,4,'cooldown prevents repeated warning spam');voice.discard('lowPower');
now+=20000;elements['voice-volume'].value='0';elements['voice-volume'].oninput();voice.notify({type:'lowPower'});assert.equal(notes.length,4,'zero volume mutes tone');
elements['voice-volume'].value='80';elements['voice-volume'].oninput();now+=20000;voice.setActive(false);voice.notify({type:'lowPower'});assert.equal(notes.length,4,'pause suppresses warnings');
console.log('PASS gesture unlock, low-power tone without speech, cooldown, volume and pause.');
