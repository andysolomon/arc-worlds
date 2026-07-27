(function(){
'use strict';
function ready(cb){ if(window.THREE) cb(); else setTimeout(function(){ready(cb)},40); }
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function makeNoise(seed){
  var r=mulberry32(seed),i,j,t,p=[],perm=new Uint8Array(512);
  for(i=0;i<256;i++)p[i]=i;
  for(i=255;i>0;i--){j=(r()*(i+1))|0;t=p[i];p[i]=p[j];p[j]=t;}
  for(i=0;i<512;i++)perm[i]=p[i&255];
  var G=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
  var F=1/3,Gc=1/6;
  return function(xin,yin,zin){
    var n0,n1,n2,n3;
    var s=(xin+yin+zin)*F;
    var i0=Math.floor(xin+s),j0=Math.floor(yin+s),k0=Math.floor(zin+s);
    var tt=(i0+j0+k0)*Gc;
    var x0=xin-(i0-tt),y0=yin-(j0-tt),z0=zin-(k0-tt);
    var i1,j1,k1,i2,j2,k2;
    if(x0>=y0){ if(y0>=z0){i1=1;j1=0;k1=0;i2=1;j2=1;k2=0}
      else if(x0>=z0){i1=1;j1=0;k1=0;i2=1;j2=0;k2=1}
      else{i1=0;j1=0;k1=1;i2=1;j2=0;k2=1}}
    else{ if(y0<z0){i1=0;j1=0;k1=1;i2=0;j2=1;k2=1}
      else if(x0<z0){i1=0;j1=1;k1=0;i2=0;j2=1;k2=1}
      else{i1=0;j1=1;k1=0;i2=1;j2=1;k2=0}}
    var x1=x0-i1+Gc,y1=y0-j1+Gc,z1=z0-k1+Gc;
    var x2=x0-i2+2*Gc,y2=y0-j2+2*Gc,z2=z0-k2+2*Gc;
    var x3=x0-1+3*Gc,y3=y0-1+3*Gc,z3=z0-1+3*Gc;
    var ii=i0&255,jj=j0&255,kk=k0&255;
    var gi0=perm[ii+perm[jj+perm[kk]]]%12;
    var gi1=perm[ii+i1+perm[jj+j1+perm[kk+k1]]]%12;
    var gi2=perm[ii+i2+perm[jj+j2+perm[kk+k2]]]%12;
    var gi3=perm[ii+1+perm[jj+1+perm[kk+1]]]%12;
    var t0=0.6-x0*x0-y0*y0-z0*z0;
    if(t0<0)n0=0;else{t0*=t0;n0=t0*t0*(G[gi0][0]*x0+G[gi0][1]*y0+G[gi0][2]*z0)}
    var t1=0.6-x1*x1-y1*y1-z1*z1;
    if(t1<0)n1=0;else{t1*=t1;n1=t1*t1*(G[gi1][0]*x1+G[gi1][1]*y1+G[gi1][2]*z1)}
    var t2=0.6-x2*x2-y2*y2-z2*z2;
    if(t2<0)n2=0;else{t2*=t2;n2=t2*t2*(G[gi2][0]*x2+G[gi2][1]*y2+G[gi2][2]*z2)}
    var t3=0.6-x3*x3-y3*y3-z3*z3;
    if(t3<0)n3=0;else{t3*=t3;n3=t3*t3*(G[gi3][0]*x3+G[gi3][1]*y3+G[gi3][2]*z3)}
    return 32*(n0+n1+n2+n3);
  };
}
function fbm(n,x,y,z,o){var a=0,f=1,w=0.5,s=0,i;for(i=0;i<o;i++){a+=n(x*f,y*f,z*f)*w;s+=w;f*=2;w*=0.5}return a/s}
var PALETTES={
  temperate:{water:0x3f86c9,deep:0x1d3a5f,sand:0xe8d8a8,low:0x7fae62,mid:0x4e8a4e,high:0x8a7f6d,snow:0xf5f2ec,atmo:0x8fc7ff,waterOpacity:0.72,cloudO:0.95},
  desert:{water:0x3fae9e,deep:0x1f5f57,sand:0xf0d9a0,low:0xe0b070,mid:0xc08850,high:0x8f5f3f,snow:0xf7e9c9,atmo:0xffcf8f,waterOpacity:0.75,cloudO:0.5},
  ice:{water:0x4a7fbf,deep:0x27476e,sand:0xdfe8ef,low:0xc9d9e4,mid:0xaebfd0,high:0x8fa3b8,snow:0xffffff,atmo:0xbfe4ff,waterOpacity:0.8,cloudO:0.85},
  lava:{water:0xff5a1f,deep:0x8a1f00,sand:0x4a3a35,low:0x5a4540,mid:0x3a2d2a,high:0x241b19,snow:0xffb35a,atmo:0xff8a5f,waterOpacity:0.96,emissive:0xd93a00,cloudO:0.3},
  candy:{water:0xff9fd0,deep:0xc75a9e,sand:0xffe4f0,low:0xa88fe8,mid:0x7f6fd0,high:0x5f4fae,snow:0xfff4fa,atmo:0xffb7dd,waterOpacity:0.8,cloudO:0.95},
  gasAmber:{gas:true,bands:[[0,0x8f6a48],[0.14,0xd9b184],[0.28,0xf0dcbc],[0.40,0xc98a5f],[0.5,0xa85f3f],[0.6,0xe8cba4],[0.74,0xf4e6cc],[0.88,0xc9a077],[1,0x8f6a48]],atmo:0xf0c9a0,cloudO:0.2},
  gasMist:{gas:true,bands:[[0,0x6f9fa8],[0.18,0xa8dcd8],[0.34,0xd9f2ee],[0.48,0x8fc4c4],[0.62,0xe4f4f0],[0.78,0xa0cfd0],[1,0x74a4ac]],atmo:0xc4f0ee,cloudO:0.2},
  gasStorm:{gas:true,bands:[[0,0x2a1f4a],[0.16,0x4a3480],[0.3,0x7a4fae],[0.42,0xb06fc4],[0.52,0x5f3f96],[0.66,0x8f5fbc],[0.82,0x3f2a6a],[1,0x271c44]],atmo:0xb48fff,cloudO:0.25},
  mercury:{water:0x555055,deep:0x3a3538,sand:0x8f8788,low:0x7a7274,mid:0x655d60,high:0x9a9294,snow:0xb8b0b2,atmo:0x8a8090,waterOpacity:0.7,cloudO:0.2},
  venus:{water:0xc98f4f,deep:0x8a5f2f,sand:0xe8c088,low:0xd0a060,mid:0xb08048,high:0x8f6538,snow:0xf0d8a8,atmo:0xffd98f,waterOpacity:0.8,cloudO:1,cloudTint:0xf0dca8},
  mars:{water:0x7a5f50,deep:0x5f4438,sand:0xd08858,low:0xc07040,mid:0x9a5530,high:0x784028,snow:0xe8d8c8,atmo:0xe8a878,waterOpacity:0.75,cloudO:0.25},
  jupiter:{gas:true,bands:[[0,0xb08a60],[0.18,0xe0c9a0],[0.32,0xb87850],[0.42,0xecdfc4],[0.5,0xc08455],[0.58,0xf0e4cc],[0.7,0xc9a878],[0.84,0xa8886a],[1,0xc9b090]],atmo:0xe8c9a0,cloudO:0.25},
  saturn:{gas:true,bands:[[0,0xc9ae7f],[0.25,0xe4d0a4],[0.45,0xd4ba88],[0.55,0xeddcb4],[0.7,0xd9c298],[1,0xc4a878]],atmo:0xf0dcac,cloudO:0.15},
  uranus:{gas:true,bands:[[0,0x9fd8dc],[0.4,0xb4e2e4],[0.6,0xa8dcde],[1,0x8fccd2]],atmo:0xbfeef0,cloudO:0.2},
  neptune:{gas:true,bands:[[0,0x2f5fc9],[0.3,0x4a7fdd],[0.5,0x3a6ad0],[0.65,0x5f8fe4],[0.85,0x2f55b8],[1,0x3f6fd0]],atmo:0x8fb4ff,cloudO:0.3}
};
/* Measured values. f = oblateness (flattening), ob = axial tilt in degrees,
   day = sidereal rotation period in hours (negative = retrograde),
   ring radii and moon a/r are in equatorial planet radii, moon P in days
   (negative = retrograde), inc in degrees from the planet's equator. */
var REAL={
  mercury:{f:0.0009,ob:0.034,day:1407.6,moons:[]},
  venus:{f:0.000,ob:177.36,day:-5832.5,moons:[]},
  temperate:{f:0.00335,ob:23.44,day:23.934,moons:[
    {n:'Moon',r:0.2727,a:60.34,P:27.322,inc:23.4,c:0x9a9490,rough:1}]},
  mars:{f:0.00589,ob:25.19,day:24.623,moons:[
    {n:'Phobos',r:0.00332,a:2.76,P:0.3189,inc:1.08,c:0x6d6157,irr:[1,0.81,0.67]},
    {n:'Deimos',r:0.00183,a:6.92,P:1.2624,inc:1.79,c:0x7d7268,irr:[1,0.81,0.73]}]},
  jupiter:{f:0.06487,ob:3.13,day:9.925,
    ring:{inner:1.72,outer:1.81,color:0xb08a70,opacity:0.10,profile:3},
    moons:[
    {n:'Io',r:0.02605,a:6.03,P:1.769,inc:0.05,c:0xd9c162},
    {n:'Europa',r:0.02233,a:9.60,P:3.551,inc:0.47,c:0xcdbda6},
    {n:'Ganymede',r:0.03768,a:15.31,P:7.155,inc:0.20,c:0x9a8b7c},
    {n:'Callisto',r:0.03448,a:26.93,P:16.689,inc:0.19,c:0x6a5f55}]},
  saturn:{f:0.09796,ob:26.73,day:10.656,
    ring:{inner:1.11,outer:2.32,color:0xffffff,opacity:1,profile:4},
    moons:[
    {n:'Enceladus',r:0.00433,a:4.09,P:1.370,inc:0.02,c:0xf4f2ec},
    {n:'Tethys',r:0.00912,a:5.06,P:1.888,inc:1.09,c:0xd8d4cb},
    {n:'Dione',r:0.00964,a:6.48,P:2.737,inc:0.02,c:0xcfcabf},
    {n:'Rhea',r:0.01312,a:9.05,P:4.518,inc:0.35,c:0xc6c0b5},
    {n:'Titan',r:0.04422,a:20.98,P:15.945,inc:0.33,c:0xd9a054},
    {n:'Iapetus',r:0.01261,a:61.15,P:79.32,inc:15.47,c:0xffffff,tone:[0xb9ae96,0x2e2620]}]},
  uranus:{f:0.02293,ob:97.77,day:-17.24,
    ring:{inner:1.60,outer:2.02,color:0xb4c0c4,opacity:1,profile:5},
    moons:[
    {n:'Miranda',r:0.00930,a:5.12,P:1.413,inc:4.23,c:0xb0aca6},
    {n:'Ariel',r:0.02283,a:7.53,P:2.520,inc:0.26,c:0xc4c0b8},
    {n:'Umbriel',r:0.02305,a:10.49,P:4.144,inc:0.13,c:0x76726c},
    {n:'Titania',r:0.03109,a:17.20,P:8.706,inc:0.34,c:0xa8a29a},
    {n:'Oberon',r:0.03002,a:23.01,P:13.463,inc:0.06,c:0x968f88}]},
  neptune:{f:0.01708,ob:28.32,day:16.11,
    ring:{inner:1.69,outer:2.55,color:0x9fb0d4,opacity:1,profile:6},
    moons:[
    {n:'Proteus',r:0.00848,a:4.75,P:1.122,inc:0.52,c:0x605c58,irr:[1,0.92,0.94]},
    {n:'Triton',r:0.05465,a:14.33,P:-5.877,inc:156.9,c:0xd8cfc4},
    {n:'Nereid',r:0.00686,a:222.7,P:360.14,e:0.751,inc:32.6,c:0x8d8880,irr:[1,0.9,0.86]}]}
};
/* Solar-system orbits: a (AU), period (yr), eccentricity, inclination to the
   ecliptic, longitude of ascending node, longitude of perihelion (deg),
   and equatorial radius in Earth radii. */
var ORBITS=[
  ['mercury',0.3871,0.2408,0.2056,7.005,48.33,77.46,0.383],
  ['venus',0.7233,0.6152,0.0068,3.395,76.68,131.60,0.949],
  ['earth',1.0000,1.0000,0.0167,0.000,0.00,102.95,1.000],
  ['mars',1.5237,1.8808,0.0934,1.850,49.56,336.06,0.532],
  ['jupiter',5.2029,11.862,0.0485,1.303,100.46,14.33,11.209],
  ['saturn',9.5367,29.457,0.0555,2.485,113.66,93.06,9.449],
  ['uranus',19.189,84.011,0.0464,0.773,74.01,173.01,4.007],
  ['neptune',30.070,164.79,0.0095,1.770,131.78,48.12,3.883]
];
var D2R=Math.PI/180;
var DAY_SEC=14;      // seconds of wall clock per planetary day (spin)
var MOON_DAY=2.2;    // seconds of wall clock per day of moon orbital motion
var YEAR_SEC=14;     // seconds per Earth year in the orbit view
function moonDist(a){ return 2.35+0.62*Math.log(a/2.8); }        // compressed, order-preserving
function moonRad(r){ return Math.max(0.010,0.030*Math.pow(r/0.02,0.42)); }
/* Long-period moons are eased in wall-clock time so Iapetus and Nereid still
   visibly move without hurrying the inner moons. */
function moonPeriodSec(P){ var p=Math.abs(P); return MOON_DAY*(p<=20?p:20+18*Math.log(1+(p-20)/18)); }
function kepler(M,e){ var E=M,i; for(i=0;i<5;i++){ E=E-(E-e*Math.sin(E)-M)/(1-e*Math.cos(E)); } return E; }
/* Orbit-view scale models. "Same size" keeps the old cosy compressed spacing;
   "To scale" uses a monotonic radial remap (d = B·AU^0.62) with a logarithmic
   size map, so the Sun and Mercury are both visible and the giants read big. */
var VIS_BASE=11.0, VIS_EXP=0.62, SIZE_MIN=0.30, SIZE_MAX=2.80, SUN_KM=696340, MIN_KM=2440;
function visDist(au){ return VIS_BASE*Math.pow(au,VIS_EXP); }
function sizeMap(km){ var t=(Math.log(km)-Math.log(MIN_KM))/(Math.log(SUN_KM)-Math.log(MIN_KM));
  return SIZE_MIN+Math.min(1,Math.max(0,t))*(SIZE_MAX-SIZE_MIN); }
var GNOISE=[
'float hsh(vec3 p){p=fract(p*0.3183099+vec3(0.11,0.27,0.53));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}',
'float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);',
' return mix(mix(mix(hsh(i),hsh(i+vec3(1,0,0)),f.x),mix(hsh(i+vec3(0,1,0)),hsh(i+vec3(1,1,0)),f.x),f.y),',
'            mix(mix(hsh(i+vec3(0,0,1)),hsh(i+vec3(1,0,1)),f.x),mix(hsh(i+vec3(0,1,1)),hsh(i+vec3(1,1,1)),f.x),f.y),f.z);}',
'float fbm3(vec3 p){float a=0.0,w=0.5;for(int i=0;i<5;i++){a+=vn(p)*w;p*=2.03;w*=0.5;}return a;}'
].join('\n');
/* Shared ring GLSL: fine striations, a Saturn radial profile (C ring, bright B
   ring, Cassini division, A ring with the Encke gap), and custom band support. */
var RING_GLSL=[
'float rhash(float x){return fract(sin(x*127.1)*43758.5453);}',
'float rnoise(float x){float i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);return mix(rhash(i),rhash(i+1.0),f);}',
'float striate(float u){return 0.70+0.30*(0.6*rnoise(u*180.0)+0.4*rnoise(u*640.0));}',
'float saturnA(float u){',
' float a=0.13*smoothstep(0.0,0.035,u)*smoothstep(0.20,0.165,u);',
' a+=0.95*smoothstep(0.165,0.205,u)*smoothstep(0.545,0.522,u);',
' a+=0.60*smoothstep(0.565,0.60,u)*smoothstep(0.975,0.952,u);',
' a*=1.0-0.85*exp(-pow((u-0.888)/0.006,2.0));',
' return a*striate(u);}',
'vec3 saturnC(float u){',
' vec3 c=mix(vec3(0.60,0.53,0.40),vec3(0.88,0.81,0.65),smoothstep(0.15,0.30,u));',
' return mix(c,vec3(0.79,0.71,0.55),smoothstep(0.55,0.63,u));}',
'float rline(float u,float c,float w){return exp(-pow((u-c)/w,2.0));}',
/* Uranus: ten narrow, very dark ringlets — 6,5,4,alpha,beta,eta,gamma,delta,lambda,epsilon */
'float uranusA(float u){',
' float a=0.34*rline(u,0.088,0.011)+0.32*rline(u,0.124,0.011)+0.34*rline(u,0.157,0.011);',
' a+=0.46*rline(u,0.357,0.012)+0.44*rline(u,0.443,0.012);',
' a+=0.28*rline(u,0.586,0.010)+0.48*rline(u,0.626,0.011)+0.52*rline(u,0.690,0.013);',
' a+=0.20*rline(u,0.850,0.009)+1.00*rline(u,0.955,0.021);',
' return a;}',
/* Neptune: broad faint Galle, narrow Le Verrier and Arago, dusty Lassell sheet,
   and the clumpy Adams ring whose arcs are far brighter than the rest of it */
'float neptuneA(float u,float ang){',
' float a=0.17*rline(u,0.02,0.095);',
' a+=0.42*rline(u,0.533,0.013);',
' a+=0.10*smoothstep(0.53,0.57,u)*smoothstep(0.73,0.69,u);',
' a+=0.30*rline(u,0.721,0.011);',
' float arc=0.22+0.78*pow(max(sin(ang*3.0+0.6),0.0),8.0)+0.60*pow(max(sin(ang*9.0+2.0),0.0),16.0);',
' a+=0.62*rline(u,0.985,0.014)*arc;',
' return a;}'
].join('\n');
function customRing(P,pal){
  var n=Math.max(1,Math.min(4,(P.ringN||2)|0));
  var inner=1.14+(P.ringInner!=null?P.ringInner:0.24)*1.05;
  var width=0.07+(P.ringWidth!=null?P.ringWidth:0.5)*1.55;
  var g=P.ringGap!=null?P.ringGap:0.35, op=P.ringOpacity!=null?P.ringOpacity:0.7;
  var bands=[],i,gap=n>1?g*0.5/n:0;
  for(i=0;i<n;i++){
    var u0=i/n+(i>0?gap:0), u1=(i+1)/n-(i<n-1?gap:0);
    bands.push([u0,u1,Math.max(0.06,op*(0.82+0.18*((i*73)%3)/2)),0.82+0.18*(i%2)]);
  }
  return {inner:inner,outer:inner+width,color:P.ringColor||pal.sand,opacity:1,bands:bands};
}

ready(function(){
var THREE=window.THREE;
var mNoise=makeNoise(9182);

function ringMaterial(){
  return new THREE.ShaderMaterial({
    uniforms:{uMap:{value:null},uHasMap:{value:0},uColor:{value:new THREE.Color(0xffffff)},
      uOpacity:{value:1},uL:{value:new THREE.Vector3(1,0,0)},uFace:{value:1},uProfile:{value:0},
      uBandCount:{value:0},uBands:{value:[new THREE.Vector4(),new THREE.Vector4(),new THREE.Vector4(),new THREE.Vector4()]}},
    vertexShader:'varying vec3 vP;varying vec2 vUv;void main(){vP=position;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:[RING_GLSL,
      'uniform sampler2D uMap;uniform float uHasMap;uniform vec3 uColor;uniform float uOpacity;',
      'uniform vec3 uL;uniform float uFace;uniform float uProfile;',
      'uniform float uBandCount;uniform vec4 uBands[4];',
      'varying vec3 vP;varying vec2 vUv;',
      'void main(){',
      ' float u=clamp(vUv.x,0.0,1.0);',
      ' vec3 c=uColor; float a=uOpacity;',
      ' if(uBandCount>0.5){',
      '  float acc=0.0,sh=1.0;',
      '  for(int i=0;i<4;i++){ if(float(i)<uBandCount-0.5){ vec4 b=uBands[i];',
      '   float m=smoothstep(b.x,b.x+0.014,u)*smoothstep(b.y,b.y-0.014,u);',
      '   acc=max(acc,m*b.z); sh=mix(sh,b.w,m); }}',
      '  a=acc*striate(u); c=uColor*sh;',
      ' }',
      ' else if(uHasMap>0.5){ vec4 t=texture2D(uMap,vec2(u,0.5)); c=t.rgb*uColor; a=t.a*uOpacity; }',
      ' else if(uProfile>5.5){ a*=neptuneA(u,atan(vP.y,vP.x)); }',
      ' else if(uProfile>4.5){ a*=uranusA(u); }',
      ' else if(uProfile>3.5){ a*=saturnA(u); c=uColor*saturnC(u); }',
      ' else if(uProfile>2.5){ a*=exp(-pow((u-0.55)/0.42,2.0)); }',
      ' else if(uProfile>1.5){ a*=0.10+0.90*exp(-pow((u-1.0)/0.045,2.0))+0.30*exp(-pow((u-0.53)/0.05,2.0))+0.18*exp(-pow((u-0.02)/0.05,2.0)); }',
      ' else if(uProfile>0.5){ a*=0.16+0.84*exp(-pow((u-1.0)/0.05,2.0))+0.22*exp(-pow((u-0.62)/0.06,2.0)); }',
      ' a*=smoothstep(0.0,0.012,u)*smoothstep(1.0,0.988,u);',
      ' vec3 P=vec3(vP.xy,0.0); vec3 L=normalize(uL);',
      ' float t=dot(P,L); float d=length(P-L*t);',
      ' float sh=(t<0.0)?smoothstep(1.03,0.95,d):0.0;',
      ' c*=mix(1.0,0.09,sh);',
      ' a*=uFace*mix(1.0,0.86,sh);',
      ' if(a<0.004) discard;',
      ' gl_FragColor=vec4(c,a);}'
    ].join('\n'),
    side:THREE.DoubleSide,transparent:true,depthWrite:false});
}
function ringGeo(inner,outer){
  var g=new THREE.RingGeometry(inner,outer,192,1);
  var p=g.attributes.position,uv=g.attributes.uv,i;
  for(i=0;i<p.count;i++){var d=(Math.hypot(p.getX(i),p.getY(i))-inner)/Math.max(1e-6,outer-inner);
    uv.setXY(i,Math.min(1,Math.max(0,d)),0.5);}
  return g;
}
var _toneCache={};
function toneTex(light,dark){
  var key=light+':'+dark; if(_toneCache[key])return _toneCache[key];
  var w=384,h=192,cv=document.createElement('canvas');cv.width=w;cv.height=h;
  var ctx=cv.getContext('2d'),img=ctx.createImageData(w,h);
  var lr=(light>>16&255),lg=(light>>8&255),lb=light&255;
  var dr=(dark>>16&255),dg=(dark>>8&255),db=dark&255;
  var x,y;
  for(y=0;y<h;y++){
    var phi=(y+0.5)/h*Math.PI,sp=Math.sin(phi),cp=Math.cos(phi);
    for(x=0;x<w;x++){
      var th=(x+0.5)/w*2*Math.PI;
      var dx=sp*Math.cos(th),dy=cp,dz=sp*Math.sin(th);
      // Cassini Regio: dark cap centred on the leading hemisphere, ragged edge, bright poles
      var lead=dx;
      var edge=lead+fbm(mNoise,dx*3.1,dy*3.1,dz*3.1,4)*0.55;
      var t=Math.min(1,Math.max(0,(edge-0.05)/0.42));
      t*=Math.min(1,Math.max(0,(0.80-Math.abs(dy))/0.22));
      var g=fbm(mNoise,dx*9+4,dy*9+4,dz*9+4,3)*0.10+0.95;
      var o=(y*w+x)*4;
      img.data[o]=Math.min(255,(lr+(dr-lr)*t)*g);
      img.data[o+1]=Math.min(255,(lg+(dg-lg)*t)*g);
      img.data[o+2]=Math.min(255,(lb+(db-lb)*t)*g);
      img.data[o+3]=255;
    }
  }
  ctx.putImageData(img,0,0);
  var tex=new THREE.CanvasTexture(cv);
  if(THREE.SRGBColorSpace)tex.colorSpace=THREE.SRGBColorSpace;
  _toneCache[key]=tex; return tex;
}
function moonGeo(r,irr){
  if(!irr) return new THREE.SphereGeometry(r,22,16);
  var g=new THREE.IcosahedronGeometry(r,2),p=g.attributes.position,i,x,y,z,n;
  for(i=0;i<p.count;i++){
    x=p.getX(i);y=p.getY(i);z=p.getZ(i);
    n=1+fbm(mNoise,x/r*1.6,y/r*1.6,z/r*1.6,3)*0.22;
    p.setXYZ(i,x*n*irr[0],y*n*irr[1],z*n*irr[2]);
  }
  g.computeVertexNormals();
  return g;
}

class PlanetViewport extends HTMLElement{
  constructor(){super();this._p=null;this._dirty=false;this._seed=null;this._detail='';this._cloudKey='';this._cloudsPending=false;this._cloudLast=0;this._scanT0=0;this._mode='single';this._lastT=0;this._moved=0;
    this._rotY=0;this._rotX=0.16;this._velY=0;this._velX=0;this._dragging=false;this._camZ=3.15;this._camR=3.15;this._ptrs=new Map();this._pinchD=0;
    this._spin=0;this._dayH=0;this._moonKey='';this._moons=[];this._real=null;this._t=0;}
  connectedCallback(){
    if(this._init)return; this._init=true;
    this.style.display='block'; this.style.width='100%'; this.style.height='100%'; if(!this.style.position)this.style.position='relative';
    var renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
    var cv=renderer.domElement;
    cv.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab';
    this.appendChild(cv);
    this.renderer=renderer;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(45,1,0.1,1400);
    this.camera.position.set(0,0.5,this._camZ);
    this.camera.lookAt(0,0,0);
    this.group=new THREE.Group(); this.scene.add(this.group);
    this.tiltG=new THREE.Group(); this.group.add(this.tiltG);   // axial tilt (obliquity)
    this.spinG=new THREE.Group(); this.tiltG.add(this.spinG);   // body rotation about the axis
    this.sunDir=new THREE.Vector3(5,3,4).normalize();
    this.sun=new THREE.DirectionalLight(0xfff2df,2.1); this.sun.position.set(5,3,4); this.scene.add(this.sun);
    this.amb=new THREE.AmbientLight(0x9a8fb8,0.34); this.scene.add(this.amb);
    this.geo=null; this.dirs=null;
    this.planet=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshStandardMaterial({vertexColors:true,roughness:0.95,metalness:0}));
    this.spinG.add(this.planet);
    this.water=new THREE.Mesh(new THREE.SphereGeometry(1,96,64),new THREE.MeshPhongMaterial({color:0x3f86c9,transparent:true,opacity:0.72,shininess:90,specular:0x555555}));
    this.spinG.add(this.water);
    this.clouds=new THREE.Mesh(new THREE.SphereGeometry(1.16,80,56),new THREE.MeshLambertMaterial({transparent:true,opacity:0.95,depthWrite:false}));
    this.spinG.add(this.clouds);
    this.atmo=new THREE.Mesh(new THREE.SphereGeometry(1.35,64,48),new THREE.ShaderMaterial({
      uniforms:{uC:{value:new THREE.Color(0x8fc7ff)},uI:{value:1},uLv:{value:new THREE.Vector3(0,0,1)}},
      vertexShader:'varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'uniform vec3 uC;uniform float uI;uniform vec3 uLv;varying vec3 vN;void main(){float i=pow(max(0.74-dot(vN,vec3(0.,0.,1.)),0.),2.2)*uI;i*=0.16+0.84*smoothstep(-0.45,0.40,dot(normalize(vN),normalize(uLv)));gl_FragColor=vec4(uC,1.0)*i;}',
      side:THREE.BackSide,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false}));
    this.tiltG.add(this.atmo);
    var sg=new THREE.BufferGeometry(),sp=new Float32Array(1400*3),rs=mulberry32(42),k;
    for(k=0;k<1400;k++){var u=rs()*2-1,ph=rs()*Math.PI*2,rr2=Math.sqrt(1-u*u),rad=320+rs()*260;
      sp[k*3]=rr2*Math.cos(ph)*rad;sp[k*3+1]=u*rad;sp[k*3+2]=rr2*Math.sin(ph)*rad;}
    sg.setAttribute('position',new THREE.BufferAttribute(sp,3));
    this.stars=new THREE.Points(sg,new THREE.PointsMaterial({color:0xffe9c4,size:1.7,sizeAttenuation:false,transparent:true,opacity:0.85}));
    this.scene.add(this.stars);
    this.scanRing=new THREE.Mesh(new THREE.TorusGeometry(1,0.012,8,90),new THREE.MeshBasicMaterial({color:0xaff0d0,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));
    this.scanRing.rotation.x=Math.PI/2; this.scanRing.visible=false; this.scene.add(this.scanRing);
    // rings sit in the equatorial plane, outside the spinning body — they do not wobble
    this.ringG=new THREE.Group(); this.tiltG.add(this.ringG);
    this.ring=new THREE.Mesh(ringGeo(1.11,2.32),ringMaterial());
    this.ring.rotation.x=-Math.PI/2; this.ring.visible=false; this.ringG.add(this.ring);
    this._ringKey='';
    this._ringN=new THREE.Vector3(); this._ringM3=new THREE.Matrix3(); this._tmpV=new THREE.Vector3();
    this.texMesh=new THREE.Mesh(new THREE.SphereGeometry(1,96,64),new THREE.MeshStandardMaterial({roughness:1,metalness:0}));
    this.texMesh.visible=false; this.spinG.add(this.texMesh);
    this.gasMesh=new THREE.Mesh(new THREE.SphereGeometry(1,96,64),new THREE.ShaderMaterial({
      uniforms:{uMap:{value:null},uTime:{value:0},uLight:{value:new THREE.Vector3(5,3,4).normalize()},uFlow:{value:1},
        uRing:{value:new THREE.Vector4(0,0,0,0)},uLL:{value:new THREE.Vector3(0,1,0)}},
      vertexShader:'varying vec2 vUv;varying vec3 vN;varying vec3 vLp;void main(){vUv=uv;vLp=position;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:[RING_GLSL,
        'uniform sampler2D uMap;uniform float uTime;uniform vec3 uLight;uniform float uFlow;',
        'uniform vec4 uRing;uniform vec3 uLL;',
        'varying vec2 vUv;varying vec3 vN;varying vec3 vLp;',
        'void main(){',
        ' vec2 uv=vUv;',
        ' float lat=uv.y;',
        ' float speed=uFlow*(0.010*sin(lat*19.0)+0.014*sin(lat*7.0+1.7)+0.006*sin(lat*31.0+4.0));',
        ' uv.x=uv.x+uTime*speed;',
        ' uv.y+=uFlow*0.0035*sin(uv.x*42.0+uTime*0.45+lat*33.0);',
        ' vec2 sc=vec2(0.60,0.36);',
        ' vec2 d=uv-sc; d.x*=2.0;',
        ' float rr=dot(d,d);',
        ' float ang=uFlow*1.4*exp(-rr/0.006)*sin(uTime*0.22);',
        ' float ca=cos(ang),sa=sin(ang);',
        ' vec2 dr=vec2(ca*d.x-sa*d.y,sa*d.x+ca*d.y); dr.x*=0.5;',
        ' uv=sc+vec2(dr.x,dr.y);',
        ' vec3 c=texture2D(uMap,vec2(fract(uv.x),clamp(uv.y,0.0,1.0))).rgb;',
        ' float l=max(dot(normalize(vN),uLight),0.0)*1.05+0.07;',
        ' if(uRing.x>0.5){',
        '  vec3 L=normalize(uLL);',
        '  if(abs(L.y)>0.002){',
        '   float t=-vLp.y/L.y;',
        '   if(t>0.0){',
        '    float r=length(vLp.xz+t*L.xz);',
        '    float ru=(r-uRing.y)/max(0.001,uRing.z-uRing.y);',
        '    if(ru>0.0&&ru<1.0){',
        '     float sa=(uRing.w>3.5)?saturnA(ru):0.5*striate(ru);',
        '     l*=1.0-0.85*clamp(sa,0.0,1.0);',
        '    }}}}',
        ' gl_FragColor=vec4(c*l,1.0);}'
      ].join('\n')}));
    this.gasMesh.visible=false; this.spinG.add(this.gasMesh);
    this.moonRoot=new THREE.Group(); this.tiltG.add(this.moonRoot);
    this._texLoader=new THREE.TextureLoader(); this._texCache={}; this._texUrl=null; this._cloudTexUrl=null;
    var self=this;
    cv.addEventListener('pointerdown',function(e){cv.setPointerCapture(e.pointerId);self._ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});self._moved=0;
      if(self._ptrs.size===1){self._dragging=true;self._tgt=null;cv.style.cursor='grabbing';}
      if(self._ptrs.size===2){var a=[...self._ptrs.values()];self._pinchD=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);}});
    cv.addEventListener('pointermove',function(e){var p=self._ptrs.get(e.pointerId);if(!p)return;
      var dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;
      if(self._ptrs.size===1){self._moved+=Math.abs(dx)+Math.abs(dy);self._velY=dx*0.005;self._velX=dy*0.004;self._rotY+=self._velY;self._rotX=Math.max(-1.32,Math.min(1.32,self._rotX+self._velX));}
      else if(self._ptrs.size===2){var a=[...self._ptrs.values()];var d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
        self._camZ=Math.max(1.9,Math.min(self._zMax(),self._camZ*(self._pinchD/Math.max(1,d))));self._pinchD=d;}});
    function up(e){self._ptrs.delete(e.pointerId);if(self._ptrs.size===0){self._dragging=false;cv.style.cursor='grab';
      if(self.sys&&self.sys.visible&&self._moved<6)self._pick(e);}}
    cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
    cv.addEventListener('wheel',function(e){e.preventDefault();self._tgt=null;self._camZ=Math.max(1.9,Math.min(self._zMax(),self._camZ*(1+e.deltaY*0.001)));},{passive:false});
    this._ro=new ResizeObserver(function(){self._resize()}); this._ro.observe(this);
    this._resize();
    this._loop=this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }
  disconnectedCallback(){ if(this._ro)this._ro.disconnect(); this._stopped=true; }
  set params(p){ this._p=Object.assign({},p); this._dirty=true; }
  get params(){ return this._p; }
  scan(dur){ this._scanT0=performance.now(); this._scanDur=dur||2000; if(this.scanRing)this.scanRing.visible=true; }
  resetView(){ this._tgt={y:0,x:0.16,z:this._fitZ||(this._mode==='system'?(this._sizeMode==='scale'?86:11):3.15)}; }
  _zMax(){ return this._p&&this._p.mode==='system'?260:9; }
  _pick(e){
    var r=this.renderer.domElement.getBoundingClientRect();
    this._v2=this._v2||new THREE.Vector2();
    this._v2.set(((e.clientX-r.left)/Math.max(1,r.width))*2-1,-((e.clientY-r.top)/Math.max(1,r.height))*2+1);
    this._ray=this._ray||new THREE.Raycaster();
    this._ray.setFromCamera(this._v2,this.camera);
    var hits=this._ray.intersectObjects(this.sysPlanets,false);
    if(hits.length)this.dispatchEvent(new CustomEvent('planet-pick',{detail:{index:hits[0].object.userData.index}}));
  }
  _ensureSystem(){
    if(this.sys)return;
    this.sys=new THREE.Group(); this.group.add(this.sys);
    // Fiery star: animated granulation, sunspots and limb darkening — no halo.
    this.sunMat=new THREE.ShaderMaterial({uniforms:{uTime:{value:0}},
      vertexShader:'varying vec3 vP;varying vec3 vW;varying vec3 vC;void main(){vP=normalize(position);vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;vC=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
      fragmentShader:[GNOISE,
      'uniform float uTime;varying vec3 vP;varying vec3 vW;varying vec3 vC;',
      'void main(){',
      ' vec3 n=vP; float t=uTime*0.06;',
      ' float g=fbm3(n*8.0+vec3(0.0,t,0.0));',
      ' float g2=fbm3(n*26.0-vec3(t*1.7,0.0,t*0.9));',
      ' float v=g*0.62+g2*0.38;',
      ' vec3 c=mix(vec3(0.70,0.14,0.02),vec3(1.0,0.52,0.07),smoothstep(0.30,0.66,v));',
      ' c=mix(c,vec3(1.0,0.88,0.58),smoothstep(0.60,0.86,v));',
      ' c=mix(c,vec3(1.0,0.99,0.92),smoothstep(0.80,0.95,v));',
      ' c=mix(c,vec3(0.24,0.06,0.02),smoothstep(0.34,0.24,fbm3(n*3.2+vec3(0.0,t*0.35,5.0)))*0.9);',
      ' vec3 vd=normalize(cameraPosition-vW);',
      ' float mu=max(dot(normalize(vW-vC),vd),0.0);',
      ' c*=0.52+0.48*pow(mu,0.42);',
      ' gl_FragColor=vec4(c,1.0);}'].join('\n')});
    this.sunMesh=new THREE.Mesh(new THREE.SphereGeometry(1,72,48),this.sunMat);
    this.sys.add(this.sunMesh);
    var sunLight=new THREE.PointLight(0xffe8c9,2.1,0); sunLight.decay=0; this.sys.add(sunLight);
    this.sysPlanets=[]; this.sysNodes=[];
    for(var i=0;i<8;i++){
      var o=ORBITS[i],key=o[0]==='earth'?'temperate':o[0],R=REAL[key];
      var Asame=1.9+2.9*Math.log(1+o[1]*3)/Math.LN10, Ascale=visDist(o[1]), A=Asame;
      var plane=new THREE.Group();
      plane.rotation.y=o[5]*D2R;             // longitude of ascending node
      plane.rotation.x=o[4]*D2R;             // inclination to the ecliptic
      this.sys.add(plane);
      var node=new THREE.Group(); plane.add(node);
      var tilt=new THREE.Group(); tilt.rotation.z=R.ob*D2R; node.add(tilt);
      var spin=new THREE.Group(); tilt.add(spin);
      var m=new THREE.Mesh(new THREE.SphereGeometry(1,48,32),new THREE.MeshStandardMaterial({map:this._loadTex('images2k/'+o[0]+'.jpg'),roughness:1,metalness:0}));
      m.scale.set(1,1-R.f,1);
      spin.add(m);
      m.userData={index:i,node:node,tilt:tilt,spin:spin,a:A,e:o[3],period:o[2],
        aSame:Asame,aScale:Ascale,rSame:0.24,rScale:sizeMap(o[7]*6371)*0.85,
        peri:(o[6]-o[5])*D2R,angle:Math.random()*6.283,day:R.day,f:R.f};
      if(R.ring){
        var rm=new THREE.Mesh(ringGeo(R.ring.inner,R.ring.outer),ringMaterial());
        rm.rotation.x=-Math.PI/2;
        rm.material.uniforms.uColor.value.set(R.ring.color);
        rm.material.uniforms.uOpacity.value=R.ring.opacity;
        rm.material.uniforms.uProfile.value=R.ring.profile||0;
        if(R.ring.map){rm.material.uniforms.uMap.value=this._loadTex(R.ring.map);rm.material.uniforms.uHasMap.value=1;}
        rm.material.uniforms.uL.value.set(1,0,0);
        tilt.add(rm);
      }
      this.sysPlanets.push(m); this.sysNodes.push(m.userData);
      var cp=Math.cos(m.userData.peri),spp=Math.sin(m.userData.peri),ecc=o[3];
      var mkLine=function(AA){var pts=[],k2,E,x,z;
        for(k2=0;k2<=200;k2++){E=k2/200*6.2832;
          x=AA*(Math.cos(E)-ecc); z=AA*Math.sqrt(1-ecc*ecc)*Math.sin(E);
          pts.push(new THREE.Vector3(x*cp-z*spp,0,x*spp+z*cp));}
        return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x6a5a80,transparent:true,opacity:0.4}));};
      m.userData.lineSame=mkLine(Asame); m.userData.lineScale=mkLine(Ascale);
      m.userData.lineScale.visible=false;
      plane.add(m.userData.lineSame); plane.add(m.userData.lineScale);
    }
  }
  _resize(){ var w=this.clientWidth||300,h=this.clientHeight||300;
    this.renderer.setSize(w,h,false); this.camera.aspect=w/h; this.camera.updateProjectionMatrix(); }
  _buildGeo(det){
    var seg=det==='high'?220:150, hseg=det==='high'?150:104;
    if(this.geo)this.geo.dispose();
    var g=new THREE.SphereGeometry(1,seg,hseg);
    var n=g.attributes.position.count;
    this.dirs=new Float32Array(g.attributes.position.array);
    g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(n*3),3));
    this.geo=g; this.planet.geometry=g;
  }
  _loadTex(url,repeat){
    if(!this._texCache[url]){
      var t=this._texLoader.load(url);
      if(THREE.SRGBColorSpace)t.colorSpace=THREE.SRGBColorSpace;
      t.anisotropy=8; this._texCache[url]=t;
    }
    if(repeat)this._texCache[url].wrapS=THREE.RepeatWrapping;
    return this._texCache[url];
  }
  _setRing(cfg){
    var key=cfg?(cfg.inner+':'+cfg.outer+':'+(cfg.map||'')+':'+(cfg.profile||0)+':'+cfg.color+':'+cfg.opacity+':'+JSON.stringify(cfg.bands||0)):'';
    this.ring.visible=!!cfg;
    if(!cfg||key===this._ringKey)return;
    this._ringKey=key;
    this.ring.geometry.dispose();
    this.ring.geometry=ringGeo(cfg.inner,cfg.outer);
    var u=this.ring.material.uniforms;
    u.uColor.value.set(cfg.color);
    u.uOpacity.value=cfg.opacity;
    u.uProfile.value=cfg.profile||0;
    u.uMap.value=cfg.map?this._loadTex(cfg.map):null;
    u.uHasMap.value=cfg.map?1:0;
    u.uBandCount.value=cfg.bands?cfg.bands.length:0;
    if(cfg.bands)for(var bi=0;bi<cfg.bands.length;bi++)u.uBands.value[bi].set(cfg.bands[bi][0],cfg.bands[bi][1],cfg.bands[bi][2],cfg.bands[bi][3]);
    this.ring.material.needsUpdate=true;
  }
  _setMoons(list){
    var key=list.map(function(m){return m.n+m.a}).join('|');
    if(key===this._moonKey)return 0;
    this._moonKey=key;
    var i;
    for(i=0;i<this._moons.length;i++){var old=this._moons[i];
      this.moonRoot.remove(old.orbit); old.mesh.geometry.dispose(); old.mesh.material.dispose();}
    this._moons=[];
    var maxD=0;
    for(i=0;i<list.length;i++){
      var d=list[i], rd=d.rd!=null?d.rd:moonRad(d.r), dist=d.dd!=null?d.dd:moonDist(d.a);
      maxD=Math.max(maxD,dist*(1+(d.e||0)*0.5));
      var orbit=new THREE.Group();
      orbit.rotation.y=(i*2.399+0.7);            // spread ascending nodes
      orbit.rotation.x=(d.inc||0)*D2R;
      var mmat=new THREE.MeshStandardMaterial({color:d.c,roughness:0.98,metalness:0});
      if(d.tone){mmat.map=toneTex(d.tone[0],d.tone[1]);mmat.color.set(0xffffff);}
      var mesh=new THREE.Mesh(moonGeo(rd,d.irr),mmat);
      orbit.add(mesh);
      this.moonRoot.add(orbit);
      this._moons.push({orbit:orbit,mesh:mesh,d:dist,e:d.e||0,P:d.P,phase:(i*2.1)%6.283});
    }
    return maxD;
  }
  _regen(){
    var P=this._p; if(!P)return;
    if(P.mode==='system'){
      this._ensureSystem();
      if(this._mode!=='system'){this._mode='system';this._rotX=0.5;this._rotY=0;this._velX=0;this._velY=0;this._sizeMode='';}
      this.sys.visible=true;
      this.amb.intensity=0.16;
      this.sun.visible=false;
      this.sunDir.set(5,3,4).normalize();
      this.planet.visible=false;this.water.visible=false;this.clouds.visible=false;this.atmo.visible=false;
      this.ring.visible=false;this.texMesh.visible=false;this.gasMesh.visible=false;
      this.moonRoot.visible=false;
      var sm=P.sizeMode==='scale'?'scale':'same',pi2;
      if(sm!==this._sizeMode){
        this._sizeMode=sm;
        this._camZ=sm==='scale'?86:11;
        this._fitZ=this._camZ;
        for(pi2=0;pi2<8;pi2++){
          var u2=this.sysNodes[pi2];
          u2.a=sm==='scale'?u2.aScale:u2.aSame;
          u2.tilt.scale.setScalar(sm==='scale'?u2.rScale:u2.rSame);   // scales the rings too
          u2.lineSame.visible=sm==='same'; u2.lineScale.visible=sm==='scale';
        }
        this.sunMesh.scale.setScalar(sm==='scale'?SIZE_MAX:1.15);
      }
      this.stars.visible=P.stars!==false;
      return;
    }
    if(this._mode!=='single'){this._mode='single';this._camZ=3.15;this._rotX=0.16;}
    if(this.sys)this.sys.visible=false;
    this.sun.visible=true;
    // user-aimed sunlight: azimuth around the world, elevation above its equator
    var laz=(P.lightAz!=null?P.lightAz:0.107)*6.28319, lel=((P.lightEl!=null?P.lightEl:0.639)-0.5)*Math.PI;
    this.sunDir.set(Math.cos(lel)*Math.cos(laz),Math.sin(lel),Math.cos(lel)*Math.sin(laz)).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(7);
    this.gasMesh.material.uniforms.uLight.value.copy(this.sunDir);
    this.moonRoot.visible=true;
    var det=P.detail==='high'?'high':'standard';
    if(det!==this._detail){this._buildGeo(det);this._detail=det;}
    if(P.seed!==this._seed){this._n1=makeNoise(P.seed|0);this._n2=makeNoise((P.seed|0)^0x51ed270b);this._nc=makeNoise((P.seed|0)+777);this._seed=P.seed;this._cloudKey='';}
    var pal=PALETTES[P.preset]||PALETTES.temperate;
    var R=P.texture?REAL[P.preset]:null;     // real body only when showing its real map
    this._real=R;
    this.amb.intensity=R?0.17:0.34;
    var flat=R?1-R.f:1;
    this._dayH=R?R.day:0;
    this.tiltG.rotation.z=R?R.ob*D2R:0;
    this.spinG.scale.set(1,flat,1);
    this.atmo.scale.set(1,flat,1);
    if(R){
      var md=this._setMoons(R.moons);
      if(md){var want=Math.min(8.4,Math.max(3.15,md*1.32)); this._fitZ=want; if(Math.abs(want-this._camZ)>0.05&&!this._dragging)this._camZ=want;}
      else if(this._camZ>4)this._camZ=3.15;
    }else{
      var mc=Math.min(3,P.moons|0),gm=[],gi;
      for(gi=0;gi<mc;gi++)gm.push({n:'m'+gi,r:0.02,a:3,rd:0.05+gi*0.012,dd:1.78+gi*0.38,P:2.6+gi*1.7,inc:6+gi*9,c:[0xb8b0b2,0xa89f9c,0xc4bcb4][gi]});
      if(this._setMoons(gm)&&this._camZ>4)this._camZ=3.15;
      this._fitZ=3.15;
    }
    if(P.texture){
      var gas=!!pal.gas;
      if(this._texUrl!==P.texture){this._texUrl=P.texture;
        this.texMesh.material.map=this._loadTex(P.texture);this.texMesh.material.needsUpdate=true;
        this.gasMesh.material.uniforms.uMap.value=this._loadTex(P.texture,true);}
      this.texMesh.visible=!gas; this.gasMesh.visible=gas;
      this.planet.visible=false; this.water.visible=false;
      var ct=P.cloudTexture||null;
      if(ct!==this._cloudTexUrl){
        if(!this._cloudTexUrl&&this.clouds.material.map)this.clouds.material.map.dispose();
        this._cloudTexUrl=ct;
        this.clouds.material.map=ct?this._loadTex(ct):null;
        this.clouds.material.alphaMap=null;
        this.clouds.material.needsUpdate=true; this._cloudKey='';}
      this.clouds.visible=!!ct&&(P.clouds||0)>0.04;
      this.clouds.scale.setScalar(0.888);   // cloud deck just above the surface
      this.clouds.material.color.set(0xffffff);
      this.clouds.material.opacity=Math.min(1,(P.clouds||0)*1.8);
      this._setRing(R&&R.ring?R.ring:(P.rings?customRing(P,pal):null));
      this.ringG.rotation.z=R&&R.ring?0:((P.ringTilt!=null?P.ringTilt:0.5)-0.5)*1.5708;
      var rc=R&&R.ring?R.ring:null;
      this.gasMesh.material.uniforms.uRing.value.set(rc?1:0,rc?rc.inner:0,rc?rc.outer:0,rc?(rc.profile||0):0);
      this.atmo.material.uniforms.uC.value.set(P.atmoColor||pal.atmo);
      this.atmo.material.uniforms.uI.value=0.25+(P.glow!=null?P.glow:0.5)*1.1;
      this.atmo.visible=(P.glow!=null?P.glow:0.5)>0.02;
      this.stars.visible=P.stars!==false;
      return;
    }
    this.texMesh.visible=false; this.gasMesh.visible=false; this.planet.visible=true;
    this.clouds.scale.setScalar(1);
    if(this._cloudTexUrl){this._cloudTexUrl=null;this.clouds.material.map=null;this.clouds.material.needsUpdate=true;this._cloudKey='';}
    var pa=this.geo.attributes.position.array,ca=this.geo.attributes.color.array,dirs=this.dirs;
    var f=1.15+(P.roughness||0)*2.5, amp=0.12, sea=(P.water||0)*1.5-0.75, mtn=P.mountains||0;
    var C=function(k){return new THREE.Color(pal[k])};
    var cDeep=C('deep'),cWater=C('water'),cSand=C('sand'),cLow=C('low'),cMid=C('mid'),cHigh=C('high'),cSnow=C('snow');
    var cShal=cWater.clone().lerp(cSand,0.5);
    var stops=[[0,cSand],[0.10,cSand],[0.18,cLow],[0.45,cMid],[0.72,cHigh],[0.88,cSnow],[1.01,cSnow]];
    var tmp=new THREE.Color(),n1=this._n1,n2=this._n2,i;
    var gasStops=null;
    if(pal.gas){gasStops=pal.bands.map(function(b){return [b[0],new THREE.Color(b[1])]});}
    if(gasStops){
      for(i=0;i<dirs.length;i+=3){
        var gx=dirs[i],gy=dirs[i+1],gz=dirs[i+2];
        var wob=(fbm(n1,gx*2.2,gy*7,gz*2.2,4)*0.07+fbm(n2,gx*4+9,gy*4+9,gz*4+9,3)*0.03)*(0.35+(P.roughness||0)*1.7);
        var gt=Math.min(1,Math.max(0,gy*0.5+0.5+wob));
        var gr=1+fbm(n1,gx*1.3,gy*1.3,gz*1.3,3)*0.012;
        pa[i]=gx*gr;pa[i+1]=gy*gr;pa[i+2]=gz*gr;
        var ga=gasStops[0],gb=gasStops[gasStops.length-1],gs;
        for(gs=0;gs<gasStops.length-1;gs++){if(gt>=gasStops[gs][0]&&gt<=gasStops[gs+1][0]){ga=gasStops[gs];gb=gasStops[gs+1];break}}
        tmp.copy(ga[1]).lerp(gb[1],Math.min(1,(gt-ga[0])/Math.max(1e-6,gb[0]-ga[0])));
        ca[i]=tmp.r;ca[i+1]=tmp.g;ca[i+2]=tmp.b;
      }
    }
    else for(i=0;i<dirs.length;i+=3){
      var x=dirs[i],y=dirs[i+1],z=dirs[i+2];
      var cont=fbm(n1,x*f,y*f,z*f,5);
      var rr=1-Math.abs(fbm(n2,x*f*1.8+5.2,y*f*1.8+5.2,z*f*1.8+5.2,4));
      var e=cont*0.62+rr*rr*mtn*0.9-mtn*0.2;
      var r=1+e*amp;
      pa[i]=x*r;pa[i+1]=y*r;pa[i+2]=z*r;
      if(e<sea){var d=Math.min(1,(sea-e)*3.5);tmp.copy(cShal).lerp(cDeep,d);}
      else{var t=Math.min(1,(e-sea)/Math.max(0.25,(1-sea)*0.95));
        var a=stops[0],b=stops[stops.length-1],s;
        for(s=0;s<stops.length-1;s++){if(t>=stops[s][0]&&t<=stops[s+1][0]){a=stops[s];b=stops[s+1];break}}
        tmp.copy(a[1]).lerp(b[1],Math.min(1,(t-a[0])/Math.max(1e-6,b[0]-a[0])));}
      var ay=Math.abs(y),iceAmt=P.ice||0,iceTh=1-iceAmt*0.6;
      if(iceAmt>0&&ay>iceTh)tmp.lerp(cSnow,Math.min(1,(ay-iceTh)/0.08)*0.95);
      ca[i]=tmp.r;ca[i+1]=tmp.g;ca[i+2]=tmp.b;
    }
    this.geo.attributes.position.needsUpdate=true;
    this.geo.attributes.color.needsUpdate=true;
    this.geo.computeVertexNormals();
    var wr=1+sea*amp;
    this.water.visible=!pal.gas&&(P.water||0)>0.03;
    this.water.scale.setScalar(Math.max(0.88,wr));
    this.water.material.color.set(pal.water);
    this.water.material.emissive.set(pal.emissive||0x000000);
    this.water.material.opacity=pal.waterOpacity||0.72;
    this._setRing(P.rings?customRing(P,pal):null);
    this.ringG.rotation.z=((P.ringTilt!=null?P.ringTilt:0.5)-0.5)*1.5708;
    this._spinRate=0.10*(P.spinSpeed!=null?P.spinSpeed*2:1)*((P.spinDir|0)===-1?-1:1);
    this.atmo.material.uniforms.uC.value.set(P.atmoColor||pal.atmo);
    this.atmo.material.uniforms.uI.value=0.3+(P.glow!=null?P.glow:0.5)*1.6;
    this.atmo.visible=(P.glow!=null?P.glow:0.5)>0.02;
    this.stars.visible=P.stars!==false;
    this.clouds.visible=(P.clouds||0)>0.04;
    this.clouds.material.opacity=pal.cloudO!=null?pal.cloudO:0.9;
    this.clouds.material.color.set(pal.cloudTint||0xffffff);
    var ck=P.seed+':'+Math.round((P.clouds||0)*20);
    if(ck!==this._cloudKey){this._cloudKey=ck;this._cloudsPending=true;}
  }
  _makeClouds(){
    var P=this._p,n=this._nc,w=384,h=192;
    var cv=document.createElement('canvas');cv.width=w;cv.height=h;
    var ctx=cv.getContext('2d'),img=ctx.createImageData(w,h);
    var cov=P.clouds||0,th=0.78-cov*0.55,x,y;
    for(y=0;y<h;y++){var phi=(y+0.5)/h*Math.PI,sp=Math.sin(phi),cp=Math.cos(phi);
      for(x=0;x<w;x++){var t2=(x+0.5)/w*2*Math.PI;
        var v=fbm(n,sp*Math.cos(t2)*1.7,cp*1.7,sp*Math.sin(t2)*1.7,4)*0.5+0.5;
        var a=Math.min(1,Math.max(0,(v-th)/0.22));
        var o=(y*w+x)*4;img.data[o]=255;img.data[o+1]=255;img.data[o+2]=255;img.data[o+3]=a*235;}}
    ctx.putImageData(img,0,0);
    if(this.clouds.material.map)this.clouds.material.map.dispose();
    var tex=new THREE.CanvasTexture(cv);
    this.clouds.material.map=tex;
    this.clouds.material.needsUpdate=true;
  }
  _ringLight(mesh){
    // planet-shadow direction, expressed in the ring's own local frame
    this._ringM3.setFromMatrix4(mesh.matrixWorld).invert();
    mesh.material.uniforms.uL.value.copy(this.sunDir).applyMatrix3(this._ringM3).normalize();
    this._ringN.set(0,0,1).applyMatrix4(mesh.matrixWorld).sub(this._tmpV.setFromMatrixPosition(mesh.matrixWorld)).normalize();
    var toCam=this._tmpV.copy(this.camera.position).sub(this._tmpV.setFromMatrixPosition(mesh.matrixWorld)).normalize();
    var lit=this._ringN.dot(this.sunDir)*this._ringN.dot(toCam);
    mesh.material.uniforms.uFace.value=lit>0?1.0:0.42;   // unlit face of a ring is much dimmer
  }
  _loop(){
    if(this._stopped)return;
    requestAnimationFrame(this._loop);
    if(this._dirty&&this._p){this._dirty=false;this._regen();}
    var now=performance.now();
    var dt=this._lastT?Math.min(0.1,(now-this._lastT)/1000):0.016;
    this._lastT=now;
    var running=!this._p||this._p.autoRotate!==false;
    var tScale=this._p&&this._p.timeScale!=null?this._p.timeScale:1;
    var sdt=dt*tScale;
    if(running)this._t+=sdt;
    if(this._cloudsPending&&now-this._cloudLast>160){this._cloudsPending=false;this._cloudLast=now;this._makeClouds();}
    if(!this._dragging){
      if(this._tgt){
        var T=this._tgt,done=true;
        this._rotY+=(T.y-this._rotY)*0.10; if(Math.abs(T.y-this._rotY)>0.002)done=false;
        this._rotX+=(T.x-this._rotX)*0.10; if(Math.abs(T.x-this._rotX)>0.002)done=false;
        this._camZ+=(T.z-this._camZ)*0.10; if(Math.abs(T.z-this._camZ)>0.01)done=false;
        this._velY=0;this._velX=0;
        if(done){this._rotY=T.y;this._rotX=T.x;this._camZ=T.z;this._tgt=null;}
      }else{
        this._velY*=0.94;this._velX*=0.94;
        this._rotY+=this._velY;
        this._rotX=Math.max(-1.32,Math.min(1.32,this._rotX+this._velX));
      }
    }
    // the camera flies around the world; the sun stays put, so the night side is reachable
    this._camR+=(this._camZ-this._camR)*0.12;
    var ca=-this._rotY,ce=this._rotX,cc=Math.cos(ce);
    this.camera.position.set(this._camR*cc*Math.sin(ca),this._camR*Math.sin(ce),this._camR*cc*Math.cos(ca));
    this.camera.lookAt(0,0,0);
    if(this._dayH){                                  // real sidereal rotation, correct direction
      this._spin=this._t*(6.2832/((Math.abs(this._dayH)/24)*DAY_SEC))*(this._dayH<0?-1:1);
    }else if(running){ this._spin+=sdt*(this._spinRate!=null?this._spinRate:0.10); }
    this.spinG.rotation.y=this._spin;
    this.clouds.rotation.y=this._real?this._spin*0.06:this._spin*0.25;
    this.gasMesh.material.uniforms.uTime.value=this._t;
    var mi,mo;
    for(mi=0;mi<this._moons.length;mi++){
      mo=this._moons[mi];
      var ang=mo.phase+this._t*(6.2832/moonPeriodSec(mo.P))*(mo.P<0?-1:1);
      if(mo.e>0.001){                                  // eccentric orbit, Kepler-solved
        var Em=kepler(ang,mo.e);
        mo.mesh.position.set(mo.d*(Math.cos(Em)-mo.e),0,mo.d*Math.sqrt(1-mo.e*mo.e)*Math.sin(Em));
        mo.mesh.rotation.y=-Math.atan2(mo.mesh.position.z,mo.mesh.position.x);
      }else{
        mo.mesh.position.set(Math.cos(ang)*mo.d,0,Math.sin(ang)*mo.d);
        mo.mesh.rotation.y=-ang;                       // tidally locked: one face always inward
      }
    }
    if(this.sys&&this.sys.visible){
      var si;
      this.sunMat.uniforms.uTime.value=this._t;
      this.sunMesh.rotation.y=this._t*0.07;          // slow stellar rotation, ~25-day period eased
      for(si=0;si<this.sysNodes.length;si++){
        var u=this.sysNodes[si];
        u.angle+=sdt*6.2832/(u.period*YEAR_SEC);
        var E=kepler(u.angle,u.e);
        var x=u.a*(Math.cos(E)-u.e), z=u.a*Math.sqrt(1-u.e*u.e)*Math.sin(E);
        var cp=Math.cos(u.peri),sp2=Math.sin(u.peri);
        u.node.position.set(x*cp-z*sp2,0,x*sp2+z*cp);
        u.spin.rotation.y+=sdt*(6.2832/((Math.abs(u.day)/24)*DAY_SEC))*(u.day<0?-1:1);
      }
    }
    if(this._scanT0){
      var t=(now-this._scanT0)/this._scanDur;
      if(t>=1){this._scanT0=0;this.scanRing.visible=false;}
      else{var Rr=1.3,yy=(t*2-1)*Rr,s2=Math.sqrt(Math.max(0.001,Rr*Rr-yy*yy));
        this.scanRing.position.y=yy;this.scanRing.scale.set(s2,s2,s2);
        this.scanRing.material.opacity=0.15+0.85*Math.sin(t*Math.PI);}
    }
    this.scene.updateMatrixWorld();
    if(this.atmo.visible)this.atmo.material.uniforms.uLv.value.copy(this.sunDir).transformDirection(this.camera.matrixWorldInverse);
    if(this.ring.visible)this._ringLight(this.ring);
    if(this.gasMesh.visible&&this.ring.visible){
      this._m3g=this._m3g||new THREE.Matrix3();
      this._m3g.setFromMatrix4(this.gasMesh.matrixWorld).invert();
      this.gasMesh.material.uniforms.uLL.value.copy(this.sunDir).applyMatrix3(this._m3g).normalize();
    }
    if(this.sys&&this.sys.visible){
      var sr=this.sysPlanets[5].userData.tilt.children;
      for(var q=0;q<sr.length;q++)if(sr[q].material&&sr[q].material.uniforms&&sr[q].material.uniforms.uFace)this._ringLight(sr[q]);
    }
    this.renderer.render(this.scene,this.camera);
  }
}
if(!customElements.get('planet-viewport'))customElements.define('planet-viewport',PlanetViewport);
});
})();
