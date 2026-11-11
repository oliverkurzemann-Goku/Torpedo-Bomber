'use strict';
const path = require('node:path');
const {Scene} = require('./mesh.cjs');
const {Atlas} = require('./atlas.cjs');

const author='Torpedo-Bomber project';
const license='project-own (original mesh and paint)';
const changes='New procedural exterior game mesh and original baked albedo. References used only to compare proportions and appearance.';
const reference=(title,url,license,role)=>({title,url,license,role});

function make(info, surfaces, dimensions){
  const source=info.references[0].url;
  const atlas=new Atlas(info.texture,info.seed,surfaces);
  const asset={title:info.title,author,license,source,changes,units:'metres',dimensions,
    sources:info.references.map(ref=>ref.url),references:info.references,...(info.ship?{markers:[]}: {})};
  const scene=new Scene(asset,atlas);
  const extras=info.aircraft?{
    rigContract:1,class:info.class,nativeAircraft:info.id,kind:info.kind,title:info.title,
    author,license,source,provenance:changes,references:info.references,dimensions,
  }:info.ship?{class:info.class}:{class:info.class,vehicle:{kind:info.kind,length:dimensions.length,width:dimensions.width,height:dimensions.height}};
  const root=info.kit?null:scene.node(info.id,null,{extras});
  const paint=scene.material('Painted exterior atlas');
  return {scene,root,paint,uv:atlas.uv.bind(atlas),write(file=process.argv[2]) {
    scene.write(file||path.resolve(__dirname,'..',info.id+'.glb'));
  }};
}
const rig=(drive,axis,properties={})=>({rig:{drive,axis,...properties}});
module.exports={make,reference,rig};
