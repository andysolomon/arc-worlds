/** Value-noise helpers used by the procedural sun. */
export const GNOISE = /* glsl */ `
float hsh(vec3 p){p=fract(p*0.3183099+vec3(0.11,0.27,0.53));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hsh(i),hsh(i+vec3(1,0,0)),f.x),mix(hsh(i+vec3(0,1,0)),hsh(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hsh(i+vec3(0,0,1)),hsh(i+vec3(1,0,1)),f.x),mix(hsh(i+vec3(0,1,1)),hsh(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm3(vec3 p){float a=0.0,w=0.5;for(int i=0;i<5;i++){a+=vn(p)*w;p*=2.03;w*=0.5;}return a;}
`

/**
 * Shared ring GLSL: fine striations plus a radial profile per planet.
 *
 * The profiles are the real structures — Saturn's C/B/A rings with the Cassini
 * division and Encke gap, Uranus's ten narrow ringlets, Neptune's clumpy Adams
 * arcs — rather than a texture lookup, so they stay sharp at any zoom.
 */
export const RING_GLSL = /* glsl */ `
float rhash(float x){return fract(sin(x*127.1)*43758.5453);}
float rnoise(float x){float i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);return mix(rhash(i),rhash(i+1.0),f);}
float striate(float u){return 0.70+0.30*(0.6*rnoise(u*180.0)+0.4*rnoise(u*640.0));}
float saturnA(float u){
 float a=0.13*smoothstep(0.0,0.035,u)*smoothstep(0.20,0.165,u);
 a+=0.95*smoothstep(0.165,0.205,u)*smoothstep(0.545,0.522,u);
 a+=0.60*smoothstep(0.565,0.60,u)*smoothstep(0.975,0.952,u);
 a*=1.0-0.85*exp(-pow((u-0.888)/0.006,2.0));
 return a*striate(u);}
vec3 saturnC(float u){
 vec3 c=mix(vec3(0.60,0.53,0.40),vec3(0.88,0.81,0.65),smoothstep(0.15,0.30,u));
 return mix(c,vec3(0.79,0.71,0.55),smoothstep(0.55,0.63,u));}
float rline(float u,float c,float w){return exp(-pow((u-c)/w,2.0));}
float uranusA(float u){
 float a=0.34*rline(u,0.088,0.011)+0.32*rline(u,0.124,0.011)+0.34*rline(u,0.157,0.011);
 a+=0.46*rline(u,0.357,0.012)+0.44*rline(u,0.443,0.012);
 a+=0.28*rline(u,0.586,0.010)+0.48*rline(u,0.626,0.011)+0.52*rline(u,0.690,0.013);
 a+=0.20*rline(u,0.850,0.009)+1.00*rline(u,0.955,0.021);
 return a;}
float neptuneA(float u,float ang){
 float a=0.17*rline(u,0.02,0.095);
 a+=0.42*rline(u,0.533,0.013);
 a+=0.10*smoothstep(0.53,0.57,u)*smoothstep(0.73,0.69,u);
 a+=0.30*rline(u,0.721,0.011);
 float arc=0.22+0.78*pow(max(sin(ang*3.0+0.6),0.0),8.0)+0.60*pow(max(sin(ang*9.0+2.0),0.0),16.0);
 a+=0.62*rline(u,0.985,0.014)*arc;
 return a;}
`

export const RING_VERT = /* glsl */ `
varying vec3 vP;varying vec2 vUv;
void main(){vP=position;vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`

export const RING_FRAG = /* glsl */ `${RING_GLSL}
uniform sampler2D uMap;uniform float uHasMap;uniform vec3 uColor;uniform float uOpacity;
uniform vec3 uL;uniform float uFace;uniform float uProfile;
uniform float uBandCount;uniform vec4 uBands[4];
varying vec3 vP;varying vec2 vUv;
void main(){
 float u=clamp(vUv.x,0.0,1.0);
 vec3 c=uColor; float a=uOpacity;
 if(uBandCount>0.5){
  float acc=0.0,sh=1.0;
  for(int i=0;i<4;i++){ if(float(i)<uBandCount-0.5){ vec4 b=uBands[i];
   float m=smoothstep(b.x,b.x+0.014,u)*smoothstep(b.y,b.y-0.014,u);
   acc=max(acc,m*b.z); sh=mix(sh,b.w,m); }}
  a=acc*striate(u); c=uColor*sh;
 }
 else if(uHasMap>0.5){ vec4 t=texture2D(uMap,vec2(u,0.5)); c=t.rgb*uColor; a=t.a*uOpacity; }
 else if(uProfile>5.5){ a*=neptuneA(u,atan(vP.y,vP.x)); }
 else if(uProfile>4.5){ a*=uranusA(u); }
 else if(uProfile>3.5){ a*=saturnA(u); c=uColor*saturnC(u); }
 else if(uProfile>2.5){ a*=exp(-pow((u-0.55)/0.42,2.0)); }
 else if(uProfile>1.5){ a*=0.10+0.90*exp(-pow((u-1.0)/0.045,2.0))+0.30*exp(-pow((u-0.53)/0.05,2.0))+0.18*exp(-pow((u-0.02)/0.05,2.0)); }
 else if(uProfile>0.5){ a*=0.16+0.84*exp(-pow((u-1.0)/0.05,2.0))+0.22*exp(-pow((u-0.62)/0.06,2.0)); }
 a*=smoothstep(0.0,0.012,u)*smoothstep(1.0,0.988,u);
 vec3 P=vec3(vP.xy,0.0); vec3 L=normalize(uL);
 float t=dot(P,L); float d=length(P-L*t);
 float sh=(t<0.0)?smoothstep(1.03,0.95,d):0.0;
 c*=mix(1.0,0.09,sh);
 a*=uFace*mix(1.0,0.86,sh);
 if(a<0.004) discard;
 gl_FragColor=vec4(c,a);}
`

/** Banded gas-giant surface with differential rotation and a storm vortex. */
export const GAS_VERT = /* glsl */ `
varying vec2 vUv;varying vec3 vN;varying vec3 vLp;
void main(){vUv=uv;vLp=position;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`

export const GAS_FRAG = /* glsl */ `${RING_GLSL}
uniform sampler2D uMap;uniform float uTime;uniform vec3 uLight;uniform float uFlow;
uniform vec4 uRing;uniform vec3 uLL;
varying vec2 vUv;varying vec3 vN;varying vec3 vLp;
void main(){
 vec2 uv=vUv;
 float lat=uv.y;
 float speed=uFlow*(0.010*sin(lat*19.0)+0.014*sin(lat*7.0+1.7)+0.006*sin(lat*31.0+4.0));
 uv.x=uv.x+uTime*speed;
 uv.y+=uFlow*0.0035*sin(uv.x*42.0+uTime*0.45+lat*33.0);
 vec2 sc=vec2(0.60,0.36);
 vec2 d=uv-sc; d.x*=2.0;
 float rr=dot(d,d);
 float ang=uFlow*1.4*exp(-rr/0.006)*sin(uTime*0.22);
 float ca=cos(ang),sa=sin(ang);
 vec2 dr=vec2(ca*d.x-sa*d.y,sa*d.x+ca*d.y); dr.x*=0.5;
 uv=sc+vec2(dr.x,dr.y);
 vec3 c=texture2D(uMap,vec2(fract(uv.x),clamp(uv.y,0.0,1.0))).rgb;
 float l=max(dot(normalize(vN),uLight),0.0)*1.05+0.07;
 if(uRing.x>0.5){
  vec3 L=normalize(uLL);
  if(abs(L.y)>0.002){
   float t=-vLp.y/L.y;
   if(t>0.0){
    float r=length(vLp.xz+t*L.xz);
    float ru=(r-uRing.y)/max(0.001,uRing.z-uRing.y);
    if(ru>0.0&&ru<1.0){
     float sa2=(uRing.w>3.5)?saturnA(ru):0.5*striate(ru);
     l*=1.0-0.85*clamp(sa2,0.0,1.0);
    }}}}
 gl_FragColor=vec4(c*l,1.0);}
`

/** Fiery star: granulation, sunspots and limb darkening. No halo sprite. */
export const SUN_VERT = /* glsl */ `
varying vec3 vP;varying vec3 vW;varying vec3 vC;
void main(){vP=normalize(position);vec4 w=modelMatrix*vec4(position,1.0);vW=w.xyz;vC=(modelMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;gl_Position=projectionMatrix*viewMatrix*w;}
`

export const SUN_FRAG = /* glsl */ `${GNOISE}
uniform float uTime;varying vec3 vP;varying vec3 vW;varying vec3 vC;
void main(){
 vec3 n=vP; float t=uTime*0.06;
 float g=fbm3(n*8.0+vec3(0.0,t,0.0));
 float g2=fbm3(n*26.0-vec3(t*1.7,0.0,t*0.9));
 float v=g*0.62+g2*0.38;
 vec3 c=mix(vec3(0.70,0.14,0.02),vec3(1.0,0.52,0.07),smoothstep(0.30,0.66,v));
 c=mix(c,vec3(1.0,0.88,0.58),smoothstep(0.60,0.86,v));
 c=mix(c,vec3(1.0,0.99,0.92),smoothstep(0.80,0.95,v));
 c=mix(c,vec3(0.24,0.06,0.02),smoothstep(0.34,0.24,fbm3(n*3.2+vec3(0.0,t*0.35,5.0)))*0.9);
 vec3 vd=normalize(cameraPosition-vW);
 float mu=max(dot(normalize(vW-vC),vd),0.0);
 c*=0.52+0.48*pow(mu,0.42);
 gl_FragColor=vec4(c,1.0);}
`

/** Rim-lit atmospheric shell, brighter on the sunward limb. */
export const ATMO_VERT = /* glsl */ `
varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`

export const ATMO_FRAG = /* glsl */ `
uniform vec3 uC;uniform float uI;uniform vec3 uLv;varying vec3 vN;
void main(){float i=pow(max(0.74-dot(vN,vec3(0.,0.,1.)),0.),2.2)*uI;
i*=0.16+0.84*smoothstep(-0.45,0.40,dot(normalize(vN),normalize(uLv)));
gl_FragColor=vec4(uC,1.0)*i;}
`
