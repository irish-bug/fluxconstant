/* Grokwell device-feed: the erratic metro-rail as cycling 16-bit "CCTV" camera feeds.

   A tiny software 3D renderer: the Shinkansen is an extruded model (tapered nose, cockpit
   glass, window panes, stripe) projected through a perspective camera and scan-converted
   into a low-res portrait framebuffer with flat 3-step shading + checker dither, then
   scaled up with image-rendering:pixelated. A real camera is what makes the comic-book
   angles (worm's-eye, bird's-eye, track-level, dutch tilt) and the foreshortening genuine.

   window.GrokTrain.mount(stageEl) runs it; .destroy() stops it. No assets, no libraries.
   mount(stageEl, {mode:"saved"}) plays the win sequence instead: a 16:9 framebuffer, the
   scenes in scenesSaved played in order; a scene marked hold waits there, calls
   opts.onHold(index, isLast) once, and moves on when the caller calls GrokTrain.next(). */
(function () {
  var W = 320, H = 384, NEAR = 0.25;   // W/H switch to 640x360 for the saved (16:9) sequence

  // ---------- palette (ABGR uint32 ramps: dark, mid, light) ----------
  function hex(h){ var n=parseInt(h.slice(1),16); return (255<<24 | (n&255)<<16 | (n>>8&255)<<8 | (n>>16&255))>>>0; }
  function ramp(a,b,c){ return [hex(a),hex(b),hex(c)]; }
  var M = {
    white:ramp("#8497ad","#c6d2de","#f4f7fa"), roof:ramp("#66778b","#98a8b9","#cbd6e0"),
    blue:ramp("#122c6a","#2050b2","#3a80ee"), glass:ramp("#060e18","#0e2034","#1b3a58"),
    skirt:ramp("#252e3b","#414e61","#5e6f85"), under:ramp("#05070b","#080b11","#0d1118"),
    seam:ramp("#161b24","#262e3a","#38424f"), door:ramp("#74859b","#b2c0cf","#dfe7ee"),
    amber:ramp("#ffb648","#ffb648","#ffd68a"), win:ramp("#f6c56a","#f6c56a","#ffe2a0"),
    tile:ramp("#2c2f38","#474a55","#6b6a70"), bldA:ramp("#2a2740","#3a3454","#4d4468"), bldB:ramp("#3a2b3c","#51394a","#6b4a58"),
    lampW:ramp("#fff2b0","#fff2b0","#fffbe0"), lampR:ramp("#ff4a3a","#ff4a3a","#ff7a66"),
    conc:ramp("#333943","#505966","#76818e"), concD:ramp("#1c2028","#2a303a","#3b434f"),
    warn:ramp("#a57c18","#e2b230","#f8d44c"), steel:ramp("#181d26","#2a323f","#445062"),
    dark:ramp("#0b0e14","#12161e","#1a202a"), sign:ramp("#07110b","#0a1a10","#0e2416"),
    red:ramp("#7a2018","#c43a2c","#ee5e4a"), grass:ramp("#1f5236","#2e7748","#48a264"),
    grass2:ramp("#1a4630","#27683f","#3c8c56"), water:ramp("#235a66","#34808a","#55a8ae"),
    road:ramp("#1e2229","#2c313a","#3c424d"), line:ramp("#8a8f98","#c8ccd2","#eef0f2"),
    ballast:ramp("#35312b","#524b41","#6f6657"), rail:ramp("#586270","#8894a4","#c2ccd8"),
    sleeper:ramp("#241f1b","#372f29","#4b4037"), plank:ramp("#3c3228","#5a4a3a","#78644e"),
    wall:ramp("#5e4234","#886250","#b4866a"), wall2:ramp("#4a4f5c","#6e7484","#989fae"),
    troof:ramp("#232f45","#374866","#52678c"), troof2:ramp("#4a2c30","#6e4046","#925860"),
    carR:ramp("#7a2018","#c43a2c","#ee5e4a"), carW:ramp("#7c8894","#b9c3cc","#eceff2"),
    carB:ramp("#1c3c66","#2c5c9a","#4a84cc"), tree:ramp("#17402a","#235c3a","#34804e"),
    trunk:ramp("#2a1f18","#3f2f24","#574232")
  };
  var C = { ink:hex("#0a0d14"), skin:hex("#e6b893"), hair:hex("#2a2020"), warn:hex("#f8d44c"),
            white:hex("#eef2f6"), pale:hex("#b9c8dc"), blade:hex("#3c8c56"), blade2:hex("#1f5236") };
  var BAYER = [0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5];

  // ---------- framebuffer + rasteriser ----------
  var fb = null, cam = null, list = [], Lx=0.4, Ly=0.85, Lz=-0.3;
  var calm = false;           // the win: no alarm marks over people's heads
  var soft = false;           // post-credits push-in: blend instead of dither, as the feed stops being a game
  function mix(a,b,t){ var u=1-t; return (255<<24 | ((a>>16&255)*u+(b>>16&255)*t)<<16 | ((a>>8&255)*u+(b>>8&255)*t)<<8 | ((a&255)*u+(b&255)*t))>>>0; }
  var cxs = W/2, cys = H/2;   // projection centre (shake moves it)

  function fillPoly(S, n, cA, cB, mode){
    var ymin=1e9, ymax=-1e9, i, y, x;
    if(mode&&soft){ cA=mix(cA,cB,0.5); mode=0; }
    for(i=0;i<n;i++){ y=S[i*2+1]; if(y<ymin) ymin=y; if(y>ymax) ymax=y; }
    var y0=Math.max(0,Math.ceil(ymin-0.5)), y1=Math.min(H-1,Math.floor(ymax-0.5));
    for(y=y0;y<=y1;y++){
      var yy=y+0.5, xl=1e9, xr=-1e9;
      for(i=0;i<n;i++){
        var j=(i+1)%n, ax=S[i*2], ay=S[i*2+1], bx=S[j*2], by=S[j*2+1];
        if((ay<=yy&&by>yy)||(by<=yy&&ay>yy)){ x=ax+(yy-ay)*(bx-ax)/(by-ay); if(x<xl) xl=x; if(x>xr) xr=x; }
      }
      if(xr<xl) continue;
      var xs=Math.round(xl), xe=Math.round(xr); if(xe<=xs) xe=xs+1;
      if(xs<0) xs=0; if(xe>W) xe=W; if(xe<=xs) continue;
      var row=y*W;
      if(mode){ for(x=xs;x<xe;x++) fb[row+x]=((x+y)&1)?cA:cB; }
      else fb.fill(cA,row+xs,row+xe);
    }
  }
  function rect(x,y,w,h,col){ x=Math.round(x); y=Math.round(y); w=Math.max(1,Math.round(w)); h=Math.max(1,Math.round(h));
    var x0=Math.max(0,x), x1=Math.min(W,x+w), y0=Math.max(0,y), y1=Math.min(H,y+h);
    if(x1<=x0) return;   // off-screen: a negative end index would make fill() wrap round the buffer
    for(var yy=y0;yy<y1;yy++) fb.fill(col,yy*W+x0,yy*W+x1); }
  function line(x0,y0,x1,y1,col){ x0|=0;y0|=0;x1|=0;y1|=0; var dx=Math.abs(x1-x0), dy=-Math.abs(y1-y0), sx=x0<x1?1:-1, sy=y0<y1?1:-1, e=dx+dy, k=0;
    while(k++<900){ if(x0>=0&&x0<W&&y0>=0&&y0<H) fb[y0*W+x0]=col; if(x0===x1&&y0===y1) break; var e2=2*e; if(e2>=dy){e+=dy;x0+=sx;} if(e2<=dx){e+=dx;y0+=sy;} } }
  function sky(stops){ // [[yFrac,"#hex"],...] dithered vertical gradient
    var cs=stops.map(function(s){return [s[0]*H,hex(s[1])];});
    for(var y=0;y<H;y++){ var k=0; while(k<cs.length-2 && y>=cs[k+1][0]) k++;
      var a=cs[k], b=cs[k+1], t=(y-a[0])/Math.max(1,b[0]-a[0]); t=t<0?0:t>1?1:t;
      if(soft){ fb.fill(mix(a[1],b[1],t),y*W,y*W+W); continue; }
      for(var x=0;x<W;x++) fb[y*W+x]=(t*16>BAYER[(y&3)*4+(x&3)]+0.5)?b[1]:a[1]; } }

  // ---------- camera ----------
  function setCam(px,py,pz, tx,ty,tz, roll, fov){
    var fx=tx-px, fy=ty-py, fz=tz-pz, l=Math.sqrt(fx*fx+fy*fy+fz*fz); fx/=l; fy/=l; fz/=l;
    var rx=fz, rz=-fx, rl=Math.sqrt(rx*rx+rz*rz)||1; rx/=rl; rz/=rl;          // right = up x fwd
    var ux=fy*rz, uy=fz*rx-fx*rz, uz=-fy*rx;                                    // up = fwd x right
    cam={px:px,py:py,pz:pz,fx:fx,fy:fy,fz:fz,rx:rx,rz:rz,ux:ux,uy:uy,uz:uz,
         c:Math.cos(roll),s:Math.sin(roll),f:(H/2)/Math.tan(fov*Math.PI/360)};
    list.length=0;
  }
  function toCam(x,y,z,o,k){ var dx=x-cam.px, dy=y-cam.py, dz=z-cam.pz;
    var X=dx*cam.rx+dz*cam.rz, Y=dx*cam.ux+dy*cam.uy+dz*cam.uz, Z=dx*cam.fx+dy*cam.fy+dz*cam.fz;
    o[k]=X*cam.c-Y*cam.s; o[k+1]=X*cam.s+Y*cam.c; o[k+2]=Z; }
  var T3=new Float64Array(3);
  function proj(x,y,z){ toCam(x,y,z,T3,0); if(T3[2]<NEAR) return null;
    return [cxs+cam.f*T3[0]/T3[2], cys-cam.f*T3[1]/T3[2], T3[2]]; }

  var CA=new Float64Array(96), CB=new Float64Array(96);
  // P: flat world xyz (n points). normal (nx,ny,nz). b<0 => lit. flags: 1=no cull, 2=draw now
  function poly(P,n,nx,ny,nz,mat,b,flags){
    var i, cx=0, cy=0, cz=0;
    for(i=0;i<n;i++){ cx+=P[i*3]; cy+=P[i*3+1]; cz+=P[i*3+2]; } cx/=n; cy/=n; cz/=n;
    if(!(flags&1) && ((cam.px-cx)*nx+(cam.py-cy)*ny+(cam.pz-cz)*nz)<=0) return;
    var d=0, front=0;
    for(i=0;i<n;i++){ toCam(P[i*3],P[i*3+1],P[i*3+2],CA,i*3); d+=CA[i*3+2]; if(CA[i*3+2]>NEAR) front++; }
    if(!front) return; d/=n;
    var m=n, A=CA;
    if(front<n){ m=0; // clip against the near plane
      for(i=0;i<n;i++){ var j=(i+1)%n, az=CA[i*3+2], bz=CA[j*3+2], ain=az>NEAR, bin=bz>NEAR;
        if(ain){ CB[m*3]=CA[i*3]; CB[m*3+1]=CA[i*3+1]; CB[m*3+2]=az; m++; }
        if(ain!==bin){ var t=(NEAR-az)/(bz-az); CB[m*3]=CA[i*3]+t*(CA[j*3]-CA[i*3]); CB[m*3+1]=CA[i*3+1]+t*(CA[j*3+1]-CA[i*3+1]); CB[m*3+2]=NEAR; m++; } }
      A=CB; if(m<3) return; }
    var S=new Float32Array(m*2), minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
    for(i=0;i<m;i++){ var sx=cxs+cam.f*A[i*3]/A[i*3+2], sy=cys-cam.f*A[i*3+1]/A[i*3+2];
      S[i*2]=sx; S[i*2+1]=sy; if(sx<minx)minx=sx; if(sx>maxx)maxx=sx; if(sy<miny)miny=sy; if(sy>maxy)maxy=sy; }
    if(maxx<0||minx>W||maxy<0||miny>H) return;
    if(b<0){ var dl=nx*Lx+ny*Ly+nz*Lz; b=0.2+0.8*(dl>0?dl:0); }
    var it={d:d,S:S,m:m,mat:mat,b:b,fn:null};
    if(flags&2) drawItem(it); else list.push(it);
  }
  function drawItem(it){
    if(it.fn){ it.fn(); return; }
    var r=M[it.mat], L=it.b*2; if(L>2) L=2; var i=Math.floor(L), fr=L-i; if(i>=2){ i=1; fr=1; }
    if(soft){ fillPoly(it.S,it.m,mix(r[i],r[i+1],fr),0,0); return; }
    if(fr<0.3) fillPoly(it.S,it.m,r[i],0,0); else if(fr<0.7) fillPoly(it.S,it.m,r[i],r[i+1],1); else fillPoly(it.S,it.m,r[i+1],0,0);
  }
  function flush(){ list.sort(function(a,b){return b.d-a.d;}); for(var i=0;i<list.length;i++) drawItem(list[i]); list.length=0; }

  var Q=new Float64Array(12);
  function quad(a,b,c,d,nx,ny,nz,mat,bb,fl){ Q[0]=a[0];Q[1]=a[1];Q[2]=a[2];Q[3]=b[0];Q[4]=b[1];Q[5]=b[2];Q[6]=c[0];Q[7]=c[1];Q[8]=c[2];Q[9]=d[0];Q[10]=d[1];Q[11]=d[2]; poly(Q,4,nx,ny,nz,mat,bb,fl); }
  // axis-aligned box. opt: b (fixed brightness), fl (flags), top (material override for the top face)
  function box(x0,y0,z0,x1,y1,z1,mat,opt){ opt=opt||{}; var b=opt.b===undefined?-1:opt.b, fl=opt.fl||0, tm=opt.top||mat;
    quad([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],0,1,0,tm,b,fl);
    quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],0,-1,0,mat,b,fl);
    quad([x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1],-1,0,0,mat,b,fl);
    quad([x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],1,0,0,mat,b,fl);
    quad([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],0,0,-1,mat,b,fl);
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],0,0,1,mat,b,fl); }
  // flat ground-level quad, drawn immediately (ground layer is painted in call order)
  function flat(x0,z0,x1,z1,y,mat,b){ quad([x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1],0,1,0,mat,b,3); }
  function bill(x,y,z,fn){ var p=proj(x,y,z); if(!p) return; var k=cam.f/p[2];
    list.push({d:p[2],fn:function(){ fn(p[0],p[1],k); }}); }

  // ---------- the Shinkansen model (local: front tip at z=0, body toward -z) ----------
  var PROF=[[1.4,0.35],[1.7,0.85],[1.7,1.75],[1.7,1.98],[1.7,2.2],[1.66,2.78],[1.45,3.35],[0.85,3.72]];
  var EDGE=["skirt","white","blue","white","win","white","white","roof","white","white","win","white","blue","white","skirt","under"];
  var NOSE=11, CAR=14, CARS=6, TLEN=NOSE*2+CAR*CARS, TRAIN=[];
  function ring(z,u){ var sx=1-0.9*Math.pow(u,2.4), sy=1-0.82*Math.pow(u,1.2), o=[], i;
    for(i=0;i<8;i++) o.push([PROF[i][0]*sx, 0.35+(PROF[i][1]-0.35)*sy, z]);
    for(i=7;i>=0;i--) o.push([-PROF[i][0]*sx, 0.35+(PROF[i][1]-0.35)*sy, z]); return o; }
  function matFor(e,seg){ var nm=EDGE[e];
    if(seg.zone==="B"){ var m=seg.s%CAR; if(nm==="under") return "under"; if(m===0) return "seam";
      if(m===2||m===12){ if(e>=1&&e<=4||e>=10&&e<=13) return nm==="win"?"glass":nm==="blue"?"blue":"door"; return nm==="win"?"white":nm; }
      if(nm==="win") return (m>=4&&m<=10&&m%2===0)?"glass":"white"; return nm; }
    var u=seg.u;
    if(nm==="win") return (u>0.70&&u<0.86)?(seg.zone==="F"?"lampF":"lampK"):"white";
    if(e>=5&&e<=9&&u>0.26&&u<0.60) return "glass";
    if(nm==="blue"&&u>0.9) return "white";
    return nm; }
  (function build(){
    var rings=[], segs=[], i, k;
    for(i=0;i<=NOSE;i++) rings.push(ring(-i,1-i/NOSE));
    for(i=0;i<NOSE;i++) segs.push({zone:"F",u:1-(i+0.5)/NOSE});
    for(k=1;k<=CAR*CARS;k++){ rings.push(ring(-NOSE-k,0)); segs.push({zone:"B",s:k-1}); }
    for(i=1;i<=NOSE;i++){ rings.push(ring(-NOSE-CAR*CARS-i,i/NOSE)); segs.push({zone:"K",u:(i-0.5)/NOSE}); }
    for(var j=0;j<segs.length;j++){ var A=rings[j], B=rings[j+1];
      for(var e=0;e<16;e++){ var e2=(e+1)%16, a=A[e], b=A[e2], c=B[e2], d=B[e];
        var ux=b[0]-a[0], uy=b[1]-a[1], uz=b[2]-a[2], vx=d[0]-a[0], vy=d[1]-a[1], vz=d[2]-a[2];
        var nx=uy*vz-uz*vy, ny=uz*vx-ux*vz, nz=ux*vy-uy*vx, nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1; nx/=nl; ny/=nl; nz/=nl;
        var mx=(a[0]+b[0]+c[0]+d[0])/4, my=(a[1]+b[1]+c[1]+d[1])/4, ay=(A[0][1]+A[7][1])/2;
        if(nx*mx+ny*(my-ay)<0){ nx=-nx; ny=-ny; nz=-nz; }
        TRAIN.push({p:[a,b,c,d],n:[nx,ny,nz],mat:matFor(e,segs[j]),z:(a[2]+d[2])/2}); } }
    TRAIN.push({p:rings[0],n:[0,0,1],mat:"white",z:0});
    TRAIN.push({p:rings[rings.length-1],n:[0,0,-1],mat:"white",z:-TLEN});
    function lb(x0,y0,z0,x1,y1,z1,mat){ var f=[
        [[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1],[0,1,0]],[[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1],[-1,0,0]],
        [[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],[1,0,0]],[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[0,0,-1]],
        [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]]];
      f.forEach(function(q){ TRAIN.push({p:q.slice(0,4),n:q[4],mat:mat,z:(z0+z1)/2}); }); }
    for(k=0;k<CARS;k++){ var z0=-NOSE-k*CAR; lb(-0.7,3.7,z0-9.5,0.7,3.98,z0-4.5,"roof");   // roof AC units
      if(k===1||k===4){ lb(-0.9,3.7,z0-11.6,0.9,3.82,z0-11.2,"steel"); lb(-0.08,3.8,z0-12.6,0.08,4.5,z0-12.4,"steel"); lb(-0.8,4.44,z0-12.7,0.8,4.54,z0-12.3,"steel"); } }
  })();
  var TP=new Float64Array(48);
  // zN = world z of the front tip. dir=+1: body extends toward -z; dir=-1: toward +z.
  function train(zN,dir,lampF,lampK,ox){ ox=ox||0;
    for(var i=0;i<TRAIN.length;i++){ var q=TRAIN[i], wz=zN+dir*q.z;
      if(Math.abs(wz-cam.pz)>170) continue;
      var n=q.p.length, mat=q.mat; if(mat==="lampF") mat=lampF; else if(mat==="lampK") mat=lampK;
      for(var j=0;j<n;j++){ TP[j*3]=q.p[j][0]+ox; TP[j*3+1]=q.p[j][1]; TP[j*3+2]=zN+dir*q.p[j][2]; }
      poly(TP,n,q.n[0],q.n[1],dir*q.n[2],mat,(mat==="lampW"||mat==="lampR")?1:-1,0); } }

  // ---------- scenery helpers ----------
  function tracks(x,range,asBoxes){ var z0=Math.floor((cam.pz-range)/1.6)*1.6, z;
    flat(x-2.5,cam.pz-range,x+2.5,cam.pz+range,0.02,"ballast",0.5);
    for(z=z0;z<cam.pz+range;z+=1.6) flat(x-1.3,z,x+1.3,z+0.5,0.05,"sleeper",0.55);
    if(asBoxes){ box(x-0.8,0.05,cam.pz-range,x-0.66,0.24,cam.pz+range,"rail",{fl:2}); box(x+0.66,0.05,cam.pz-range,x+0.8,0.24,cam.pz+range,"rail",{fl:2}); }
    else { flat(x-0.8,cam.pz-range,x-0.66,cam.pz+range,0.2,"rail",0.85); flat(x+0.66,cam.pz-range,x+0.8,cam.pz+range,0.2,"rail",0.85); } }
  function ground(mat,b){ var R=600; flat(cam.px-R,cam.pz-R,cam.px+R,cam.pz+R,0,mat,b); }
  function person(x,y,z,cloth,pose,lean,back){ bill(x,y,z,function(sx,sy,k){
      var u=k, lx=(lean||0)*0.22*u, col=hex(cloth);
      rect(sx-0.2*u,sy-0.78*u,0.16*u,0.78*u,C.ink); rect(sx+0.04*u,sy-0.78*u,0.16*u,0.78*u,C.ink);
      rect(sx-0.27*u+lx,sy-1.42*u,0.54*u,0.68*u,col);
      rect(sx-0.15*u+lx*1.4,sy-1.74*u,0.3*u,0.3*u,back?C.hair:C.skin); rect(sx-0.16*u+lx*1.4,sy-1.8*u,0.32*u,0.1*u,C.hair);
      if(back) rect(sx-0.1*u+lx*1.4,sy-1.5*u,0.2*u,0.08*u,C.skin);   // nape
      if(pose===2){ rect(sx-0.42*u+lx,sy-1.95*u,0.14*u,0.6*u,col); rect(sx+0.28*u+lx,sy-1.95*u,0.14*u,0.6*u,col); }
      else { rect(sx-0.42*u+lx,sy-1.4*u,0.14*u,0.5*u,col); rect(sx+0.28*u+lx,sy-1.4*u,0.14*u,0.5*u,col); }
      if(u>9 && !calm){ rect(sx-0.06*u+lx,sy-2.6*u,0.13*u,0.42*u,C.warn); rect(sx-0.06*u+lx,sy-2.12*u,0.13*u,0.1*u,C.warn); } }); }
  function car(xc,zc,mat,brake,dirX){ // car body aligned along x; dirX = which way it faces
    box(xc-2.1,0.3,zc-0.9,xc+2.1,1.2,zc+0.9,mat);
    box(xc-1.2-dirX*0.2,1.2,zc-0.8,xc+1.2-dirX*0.2,1.9,zc+0.8,"glass",{top:mat});
    var bx=xc-dirX*2.12; if(brake){ box(bx-0.05,0.75,zc-0.8,bx+0.05,1.0,zc-0.45,"lampR",{b:1}); box(bx-0.05,0.75,zc+0.45,bx+0.05,1.0,zc+0.8,"lampR",{b:1}); }
    var hx=xc+dirX*2.12; box(hx-0.05,0.7,zc-0.8,hx+0.05,0.95,zc-0.5,"lampW",{b:1}); box(hx-0.05,0.7,zc+0.5,hx+0.05,0.95,zc+0.8,"lampW",{b:1}); }
  function house(x0,z0,x1,z1,h,wall,rf){ box(x0,0,z0,x1,h,z1,wall); box(x0-0.4,h,z0-0.4,x1+0.4,h+0.5,z1+0.4,rf); box(x0+1,h+0.5,z0+1,x1-1,h+1.1,z1-1,rf); }
  function tree(x,z,s){ box(x-0.2,0,z-0.2,x+0.2,1.6*s,z+0.2,"trunk"); box(x-1.3*s,1.4*s,z-1.3*s,x+1.3*s,3.4*s,z+1.3*s,"tree"); box(x-0.8*s,3.4*s,z-0.8*s,x+0.8*s,4.4*s,z+0.8*s,"tree"); }
  var seed=1; function rnd(){ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; }
  function speedLines(vx,vy,n,col,t,rmin){ seed=(Math.floor(t*16)*7919+13)>>>0;
    for(var i=0;i<n;i++){ var a=rnd()*6.283, r=(rmin||50)+rnd()*150, len=24+rnd()*110, c=Math.cos(a), s=Math.sin(a);
      line(vx+c*r,vy+s*r,vx+c*(r+len),vy+s*(r+len),col); } }
  function vanish(dir){ var p=proj(0,2,cam.pz+dir*4000); return p||[W/2,H/2,1]; }
  function clamp01(x){ return x<0?0:x>1?1:x; }
  function lerp(a,b,t){ return a+(b-a)*t; }

  // Distant range: two hazy layers of overlapping peaks (each peak its own convex poly, since
  // fillPoly spans min..max per scanline), snow only on the tallest far peaks.
  var PEAKS_FAR=[[-300,58],[-236,80],[-178,62],[-118,94],[-52,70],[8,100],[74,78],[132,90],[196,66],[258,84],[322,60],[384,74]];
  var PEAKS_NEAR=[[-286,38],[-206,52],[-130,34],[-66,48],[2,40],[70,56],[146,38],[224,50],[300,36],[372,46]];
  function peak(x,base,ht,hw,skew,c1,c2){ var t=x+skew*hw;
    fillPoly(new Float32Array([x-hw,base, x-hw*0.45,base-ht*0.62, t,base-ht, x+hw,base]),4,c1,c2,1); return t; }
  function mountains(hx,hy){
    var base=hy+2, i, p, t;
    for(i=0;i<PEAKS_FAR.length;i++){ p=PEAKS_FAR[i]; var hw=p[1]*1.3, sk=((i*37)%7-3)*0.06;
      t=peak(hx+p[0],base,p[1],hw,sk,hex("#8193b6"),hex("#8ea0c2"));
      if(p[1]>76){ var d=p[1]*0.26, w=d*hw/p[1];
        fillPoly(new Float32Array([t-w,base-p[1]+d, t,base-p[1], t+w*0.9,base-p[1]+d*0.8, t+w*0.2,base-p[1]+d*1.15]),4,hex("#eef3f8"),hex("#d6e0eb"),1); } }
    for(i=0;i<PEAKS_NEAR.length;i++){ p=PEAKS_NEAR[i]; peak(hx+p[0],base,p[1],p[1]*1.7,((i*53)%5-2)*0.07,hex("#55678b"),hex("#607396")); }
  }

  // ---------- SCENES (each sets a camera, paints ground layer, queues objects, flushes) ----------
  // CAM 08, low in the grass by the nose. Erratic: it sits dead, then lurches. Held (after
  // the shaker is stopped, before the firmware revert, operations keeps it stopped out here):
  // it just sits there, lamps steady, while the grass moves and the camera breathes.
  function fieldShot(t,stranded){
    var tc = stranded ? 1.6 : t;
    var lurch = !stranded && t>3.25 ? 5.2*(1-Math.pow(1-clamp01((t-3.25)/0.35),3)) : 0;
    var sh = !stranded && (t>3.25&&t<3.8)?3:0;
    cxs=W/2+(Math.random()*2-1)*sh; cys=H/2+(Math.random()*2-1)*sh;
    setCam(3.1+0.35*Math.sin((stranded?t*0.25:t)*0.6),0.4,5.2-0.3*tc, -0.5,3.0,-7, 0.1, 80);
    Lx=0.5; Ly=0.75; Lz=0.43;
    sky([[0,"#4f9ad2"],[0.45,"#9fd0ea"],[0.62,"#d8eef6"]]);
    var h=proj(cam.px-900,0,cam.pz-2400);                      // a mountain range on the horizon
    if(h) mountains(h[0],h[1]);
    ground("grass",0.5);
    for(var k=-8;k<10;k++){ flat(6+k*0,k*14,60,k*14+7,0.02,"grass2",0.5); flat(6,k*14+7,60,k*14+7.6,0.03,"water",0.7);
                            flat(-60,k*14+3,-6,k*14+10,0.02,"grass2",0.5); flat(-60,k*14+10,-6,k*14+10.6,0.03,"water",0.7); }
    tracks(0,90,true);
    for(var z=-90;z<30;z+=18){ box(-3.5,0,z,-3.3,7,z+0.2,"steel"); box(-3.5,6.2,z,0.6,6.35,z+0.2,"steel"); }
    var tufts=[[2.6,3.9],[3.6,4.3],[2.1,3.1],[4.2,3.6],[1.8,4.5],[3.0,2.6],[3.9,4.9]];
    tufts.forEach(function(p,i){ bill(p[0],0,p[1]-0.3*tc,function(sx,sy,k){ for(var b=0;b<5;b++){ var o=(b-2)*0.09*k, hh=(0.35+((i+b)%3)*0.12)*k;
        line(sx+o,sy,sx+o+Math.sin(t*2+b+i)*0.05*k,sy-hh,(b%2)?C.blade:C.blade2); } }); });
    train(2.6+lurch,1,!stranded&&(Math.floor(t*7)%5===0)?"white":"lampW","lampR",0);
    flush();
  }
  var sceneStranded = { id:"CAM 08", label:"OPEN FIELD", tag:"■ HELD", dur:1e9, draw:function(t){ fieldShot(t,true); } };

  var scenes = [
    // 1. Platform edge, crouched, looking up-track: the nose lunges past and the body roars by.
    { id:"CAM 02", label:"MARKET STATION — PLATFORM 3", tag:"!! NOT STOPPING", dur:4.6,
      draw:function(t){
        var zF = t<1.25 ? lerp(72,-4,t/1.25)
               : t<2.3 ? lerp(-4,-56,1-Math.pow(1-(t-1.25)/1.05,2))
               : t<2.9 ? -56+4.5*Math.sin((t-2.3)/0.6*Math.PI/2)
               : -51.5-95*Math.pow((t-2.9)/1.7,2);
        var hot = t>0.9 && t<4.3, sh = hot?2.4:0.5;
        cxs=W/2+(Math.random()*2-1)*sh; cys=H/2+(Math.random()*2-1)*sh;
        setCam(3.25,1.95,0, 0.1,3.1,11, 0.13, 80);
        Lx=0.45; Ly=0.8; Lz=-0.4;
        sky([[0,"#0b0e15"],[0.55,"#161c27"],[1,"#1f2632"]]);
        ground("dark",0.4); tracks(0,90,false);
        var z;
        for(z=-12;z<96;z+=12){ box(2.05,0,z,9,1.1,z+12,"conc"); box(2.45,1.1,z,2.9,1.13,z+12,"warn",{b:0.85});
          box(-9,0,z,-2.05,1.1,z+12,"concD"); box(-9,6.4,z,9,6.7,z+12,"dark"); box(0.9,6.3,z+1,1.3,6.4,z+10,"lampW",{b:1}); }
        for(z=4;z<96;z+=8) box(-9,5.9,z,9,6.4,z+0.5,"steel");
        for(z=14;z<96;z+=16){ box(5.6,1.1,z,6.1,5.9,z+0.5,"steel"); box(-6.1,1.1,z,-5.6,5.9,z+0.5,"steel"); }
        box(3.3,4.5,9.0,6.4,5.4,9.2,"sign"); box(3.5,4.95,8.95,5.2,5.25,9.0,"warn",{b:1}); box(5.35,4.95,8.95,6.2,5.25,9.0,"lampR",{b:1}); box(3.5,4.62,8.95,4.6,4.82,9.0,"warn",{b:1});
        var ln = hot?1:0, P=person;
        P(4.45,1.1,2.3,"#4a8f6a",1,ln); P(4.7,1.1,3.9,"#d85a4a",2,ln); P(3.7,1.1,6.2,"#3f7fae",ln?2:0,ln); P(4.9,1.1,8.4,"#c7913a",1,ln);
        P(3.4,1.1,11.5,"#9c5aa0",2,ln); P(4.2,1.1,16,"#4a8f6a",1,ln); P(3.6,1.1,22,"#d85a4a",2,ln); P(5,1.1,30,"#3f7fae",1,ln);
        train(zF,-1,"lampW","lampR",0);
        flush();
        if(hot){ var v=vanish(1); speedLines(v[0],v[1],26,C.pale,t,60); }
      }},

    // 2. High angle over a neighbourhood crossing: the train tears through BACKWARDS, cars brake just in time.
    { id:"CAM 05", label:"COURT-HIGH XING", tag:"<< REVERSE", dur:4.8,
      draw:function(t){
        var zF = t<2.0 ? lerp(150,22,t/2.0) : t<2.6 ? lerp(22,13,1-Math.pow(1-(t-2.0)/0.6,2)) : t<3.2 ? 13 : 13+120*Math.pow((t-3.2)/1.6,2);
        var moving = t<2.5 || t>3.2, sh=moving?1.8:0.4;
        cxs=W/2+(Math.random()*2-1)*sh; cys=H/2+(Math.random()*2-1)*sh;
        setCam(-8.5,10.5,-5.5, 0.6,1.2,6.5, -0.2, 66);
        Lx=-0.5; Ly=0.75; Lz=-0.4;
        sky([[0,"#2a1f48"],[0.3,"#7a4470"],[0.5,"#e8935a"]]);
        ground("grass2",0.45);
        flat(-60,2.3,60,8.7,0.03,"road",0.55);
        for(var x=-58;x<60;x+=4){ if(Math.abs(x+1)>4) flat(x,5.4,x+2,5.6,0.04,"line",0.8); }
        tracks(0,80,false);
        flat(-2.4,2.3,2.4,8.7,0.22,"plank",0.6);
        var ax = 6.0+15*Math.pow(clamp01(1-t/1.15),2);            // red car skids in and stops at the gate
        if(t>0.25){ flat(ax+2,3.35,ax+9,3.5,0.045,"dark",0.2); flat(ax+2,4.5,ax+9,4.65,0.045,"dark",0.2); }
        car(ax,4.0,"carR",true,-1); car(-6.3,7.1,"carW",true,1); car(-11.6,7.0,"carB",true,1);
        var z, bl=Math.floor(t*5)%2;
        for(z=0;z<6;z++){ box(3.45,1.0,2.4+z*1.05,3.65,1.16,3.45+z*1.05,(z%2)?"lampR":"line",{b:0.95});
                          box(-3.65,1.0,2.4+z*1.05,-3.45,1.16,3.45+z*1.05,(z%2)?"line":"lampR",{b:0.95}); }
        box(3.35,0,8.8,3.75,2.9,9.2,"steel"); box(3.2,2.9,8.7,3.9,3.4,9.3,bl?"lampR":"dark",{b:bl?1:0.3});
        box(-3.75,0,1.8,-3.35,2.9,2.2,"steel"); box(-3.9,2.9,1.7,-3.2,3.4,2.3,bl?"dark":"lampR",{b:bl?0.3:1});
        house(6.5,11.5,13.5,19,4,"wall","troof"); house(-15,11,-7.5,18,3.6,"wall2","troof2"); house(7,-10,14.5,-2.5,4.4,"wall2","troof");
        house(15.5,11,22,18,3.4,"wall","troof2"); house(-16,-12,-8,-4,3.8,"wall","troof"); house(8,21,16,28,4.2,"wall2","troof2");
        tree(5.2,10.4,1); tree(-5.6,10.2,1.2); tree(5.6,-1.2,0.9); tree(-6,-2.6,1.1);
        person(4.6,0,9.6,"#d85a4a",2,1); person(-4.8,0,1.4,"#3f7fae",2,-1); person(5.3,0,10.0,"#c7913a",1,1);
        train(zF,1,"lampW","lampR",0);
        flush();
        if(moving){ var v=vanish(t<2.6?-1:1); speedLines(v[0],v[1],18,C.pale,t,70); }
      }},

    // 3. Low in the grass by the nose: the train sits dead in a field, towering... then lurches.
    { id:"CAM 08", label:"OPEN FIELD", tag:"■ HOLDING", dur:4.2, draw:function(t){ fieldShot(t,false); } },


    // 4. Pursuit: a low camera retreats down the track just ahead of the nose as it gains on the lens.
    { id:"DRN 03", label:"PURSUIT \u2014 TRACK LEVEL", tag:"!! CLOSING", dur:3.4,
      draw:function(t){
        var cz = -58*t;                                                        // camera flees toward -z
        var gap = 4.3+1.5*Math.sin(t*2.3)-2.9*Math.pow(clamp01((t-2.0)/1.2),2);  // nose lunges, eases, then closes
        var sh = 1.2+2.4*clamp01(t/3);
        cxs=W/2+(Math.random()*2-1)*sh; cys=H/2+(Math.random()*2-1)*sh;
        setCam(1.15+0.25*Math.sin(t*1.7),0.7,cz, -0.3,2.5,cz+9, 0.16+0.05*Math.sin(t*3.1), 84);
        Lx=0.45; Ly=0.62; Lz=-0.64;
        sky([[0,"#151538"],[0.35,"#4a2f62"],[0.52,"#d9774a"],[0.6,"#f0b060"]]);
        seed=77; for(var i=0;i<46;i++){ var px=rnd()*W, py=H*0.5+rnd()*18; rect(px,py,1+(i%3===0),1,(i%4)?C.white:C.warn); }
        ground("dark",0.45); tracks(0,170,true);
        for(var z=Math.floor(cz/14)*14-14;z<cz+170;z+=14){ box(-3.6,0,z,-3.35,7.2,z+0.25,"steel"); box(3.35,0,z,3.6,7.2,z+0.25,"steel"); box(-3.6,6.6,z,3.6,6.85,z+0.25,"steel"); }
        train(cz+gap,-1,"lampW","lampR",0);
        flush();
        var v=vanish(1); speedLines(v[0],v[1],26,C.pale,t,70);
      }},

    // 5. Straight down from an overpass, frame rolled diagonal: it surges under, stops, and backs up.
    { id:"CAM 14", label:"CHURCH ST OVERPASS — TOP VIEW", tag:"ERRATIC", dur:4.4,
      draw:function(t){
        var zF = t<1.4 ? lerp(-40,64,1-Math.pow(1-t/1.4,2)) : t<2.2 ? 64+1.2*Math.sin((t-1.4)*26)*(2.2-t) : 64-118*Math.pow((t-2.2)/2.2,1.6);
        var moving = t<1.3||t>2.3, sh=moving?1.6:0.6;
        cxs=W/2+(Math.random()*2-1)*sh; cys=H/2+(Math.random()*2-1)*sh;
        setCam(1.6,18,-1.5, 0,0,2.5, 0.62, 60);
        Lx=0.35; Ly=0.9; Lz=0.25;
        ground("grass",0.5);
        flat(-3.2,-80,9.2,80,0.01,"ballast",0.42);
        tracks(0,60,false); tracks(6,60,false);
        flat(11,-80,16,80,0.02,"road",0.55); for(var z=-78;z<80;z+=5) flat(13.4,z,13.6,z+2.4,0.03,"line",0.8);
        box(11.7,0.3,6,13.3,1.2,10,"carW"); box(11.9,1.2,6.9,13.1,1.8,9.2,"glass",{top:"carW"});
        tree(-7,-6,1.3); tree(-9,6,1.1); tree(-6.5,14,1.2); tree(-8,-16,1); house(-18,-4,-11,4,3.6,"wall","troof");
        person(10.2,0,3,"#d85a4a",2,0); person(10.4,0,4.4,"#3f7fae",2,0);
        for(var s=-30;s<30;s+=1.2) box(s,15.2,-2.0,s+0.1,15.9,-1.9,"steel");   // overpass railing in the foreground
        box(-30,15.9,-2.05,30,16.02,-1.85,"steel"); box(-30,15.0,-4.2,30,15.2,-1.9,"concD");
        train(zF,1,"lampW","lampR",0);
        flush();
        if(moving){ var d=t<1.4?1:-1, v=proj(0,2,cam.pz+d*400)||[W/2,H/2]; speedLines(v[0],v[1],16,C.pale,t,90); }
      }}
  ];


  // ---------- the win: Market Station near sunset; the train arrives and stops on its marks ----------
  // Car 3's third window (segment 34) is the one the ending pushes in on: at the stop it sits
  // at z=0, dead centre of the final square-on frame, a hooded passenger's back to the platform.
  // The train runs toward -z here (dir=-1), the same way it tears through in the erratic CAM 02.
  var HERO_S=2*CAR+6, HERO_STOP=-(NOSE+HERO_S+0.5);
  var SUNSET={ white:ramp("#7d7f9e","#dcc6b8","#fff0dc"), roof:ramp("#5c5e78","#a39390","#dec6b0"), door:ramp("#5f6284","#ac9894","#d4beb0"),
               conc:ramp("#3a3742","#655c64","#978883"), concD:ramp("#25232c","#3d3840","#585058"), steel:ramp("#1b1c28","#34323e","#585060") };
  function easeOut3(u){ u=clamp01(u); return 1-Math.pow(1-u,3); }
  function smooth(u){ u=clamp01(u); return u*u*(3-2*u); }
  function cheer(x,z,cloth,t,ph,go,back){   // bounce + arms up once the train is safely in
    var up=go&&(Math.floor(t*3+ph)%2===0), hop=go?0.08*Math.abs(Math.sin(t*6+ph)):0;
    person(x,1.1+hop,z,cloth,up?2:1,0,back); }
  // The far side and the track: everything a camera on platform 3 sees beyond its own edge.
  function stationFar(t){
    var fl=Math.sqrt(cam.fx*cam.fx+cam.fz*cam.fz)||1, hp=proj(cam.px+cam.fx/fl*9000,cam.py,cam.pz+cam.fz/fl*9000), hy=(hp?hp[1]:H/2)/H, q=360/H/360;
    // the glow hangs on the horizon wherever the camera puts it
    sky([[hy-250*q,"#27356e"],[hy-150*q,"#6a4f8e"],[hy-75*q,"#d9774f"],[hy-28*q,"#f4b862"],[hy,"#f8dc9a"],[hy+0.01,"#f8dc9a"]]);
    var hz=proj(cam.px-2400,0,cam.pz-500); if(hz) mountains(hz[0],hz[1]+6);
    ground("dark",0.42);
    var z, i;
    seed=4242;                                                           // skyline, windows coming on
    for(z=-150;z<150;z+=17){ var h=9+rnd()*16, w=9+rnd()*6, x1=-30-rnd()*26, mt=(rnd()<0.5)?"bldA":"bldB";
      box(x1-w,0,z,x1,h,z+12,mt,{b:0.5});
      for(var wy=2.5;wy<h-1.5;wy+=2.6) for(var wz=z+1.4;wz<z+11;wz+=2.4) if(rnd()<0.5) box(x1,wy,wz,x1+0.05,wy+1.2,wz+1.1,"win",{b:1}); }
    for(z=-144;z<144;z+=24){ tree(-17,z+5,1.5); tree(-20,z+16,1.2); }
    tracks(0,110,false);
    for(z=-96;z<96;z+=12){ box(-9,0,z,-2.05,1.1,z+12,"conc",{top:"tile"}); box(-2.5,1.1,z,-2.25,1.13,z+12,"warn",{b:0.8}); // platform 4
      box(-9.3,1.1,z,-9,3.2,z+12,"concD"); box(-9.02,1.7,z+1.5,-8.98,2.9,z+4.5,"sign",{b:0.7}); box(-9.02,1.7,z+7,-8.98,2.9,z+10.5,"red",{b:0.6}); }
    for(z=-89.6;z<96;z+=12.8){ box(-3.5,1.1,z,-3.3,6.3,z+0.2,"steel"); box(-3.5,5.9,z,0.5,6.05,z+0.2,"steel");   // catenary masts
      box(-6.6,1.1,z+6,-6.5,4.6,z+6.1,"steel"); box(-6.9,4.6,z+5.7,-6.2,4.75,z+6.4,"lampW",{b:1}); }                   // platform lamps
    box(-0.04,5.55,-110,0.04,5.6,110,"steel",{b:0.5});                                                           // contact wire
    person(-5.2,1.1,-14,"#9c5aa0",1,0); person(-4.6,1.1,-12.6,"#3f7fae",2,0); person(-5.6,1.1,9,"#c7913a",2,0); person(-4.9,1.1,22,"#4a8f6a",1,0);
  }
  // Platform 3 itself, painted over the far side: valid from any camera standing on it,
  // because nothing beyond its edge can be in front of anything on it.
  function stationNear(){
    var z;
    flat(2.05,-96,14.5,96,1.1,"conc",0.62);
    for(z=-96;z<96;z+=2) flat(2.95,z,14.5,z+0.07,1.105,"tile",0.5);
    for(var x=4.3;x<14.5;x+=2.4) flat(x,-96,x+0.05,96,1.105,"tile",0.5);
    flat(2.05,-96,2.28,96,1.105,"line",0.9); flat(2.5,-96,2.95,96,1.105,"warn",0.85);
    for(z=-96;z<96;z+=1.2) flat(2.5,z,2.95,z+0.08,1.108,"tile",0.7);     // tactile strip ribs
    for(z=-92.8;z<96;z+=6.4){ box(5.85,1.1,z-0.15,6.15,5.4,z+0.15,"steel"); box(5.7,1.1,z-0.3,6.3,1.35,z+0.3,"concD"); box(2.4,5.15,z-0.1,14.5,5.4,z+0.1,"steel"); }
    for(z=-96;z<96;z+=12.8){ box(2.4,5.4,z,14.5,5.62,z+12.8,"concD",{b:0.35}); box(2.4,5.3,z,2.6,5.62,z+12.8,"steel");
      box(4.2,5.3,z+1.2,4.5,5.4,z+5.4,"lampW",{b:1}); box(4.2,5.3,z+7.6,4.5,5.4,z+11.8,"lampW",{b:1}); box(9,5.3,z+1.2,9.3,5.4,z+5.4,"lampW",{b:1}); box(9,5.3,z+7.6,9.3,5.4,z+11.8,"lampW",{b:1}); }
    for(z=-96;z<96;z+=12.8){ box(14.5,1.1,z,15,5.4,z+12.8,"wall2",{b:0.45});                                       // the station building behind
      box(14.44,1.1,z+1.2,14.5,3.4,z+2.8,"glass",{b:0.6}); box(14.44,2.0,z+4.4,14.5,3.6,z+7.6,"win",{b:1}); box(14.44,1.9,z+9.2,14.5,3.5,z+11.4,"sign",{b:0.7}); }
    box(8.3,1.1,-13.6,8.9,2.0,-12.9,"steel"); box(8.3,1.1,12.9,8.9,2.0,13.6,"steel");                              // bins
    box(10.4,1.1,-5.4,11.2,1.6,-1.8,"plank"); box(10.4,1.1,1.8,11.2,1.6,5.4,"plank");                              // benches
  }
  function board(x,z0,z1,y0,y1){   // hanging departure board, amber rows
    box(x-0.1,y0,z0,x+0.1,y1,z1,"sign",{b:0.6}); box(x-0.03,y1,z0+0.3,x+0.03,5.3,z0+0.36,"steel"); box(x-0.03,y1,z1-0.36,x+0.03,5.3,z1-0.3,"steel");
    var rows=Math.max(1,Math.floor((y1-y0-0.16)/0.26)), i;
    for(i=0;i<rows;i++){ var yy=y1-0.2-i*0.26, len=(z1-z0)*(0.5+((i*37)%5)*0.08);
      box(x+0.1,yy-0.11,z0+0.2,x+0.13,yy,z0+0.2+len*0.45,"amber",{b:1}); box(x+0.1,yy-0.11,z1-0.2-len*0.22,x+0.13,yy,z1-0.2,i?"amber":"grass",{b:1});
      box(x-0.13,yy-0.11,z0+0.2,x-0.1,yy,z0+0.2+len*0.45,"amber",{b:1}); } }
  // riders behind the glass, platform side (x=+1.7). The hero is a hood from behind.
  function paneRect(zN,s){ var zc=zN+(NOSE+s+0.5), a=proj(1.69,2.76,zc-0.5), b=proj(1.69,2.22,zc+0.5);
    if(!a||!b) return null; return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1]),(a[2]+b[2])/2]; }
  var NOHERO=false;   // mount opts.nohero: no hood in the window (mid-game views mustn't give the ending away)
  function riders(zN){
    for(var k=0;k<CARS;k++) for(var m=4;m<=10;m+=2){ var sg=k*CAR+m, r=paneRect(zN,sg); if(!r) continue;
      if(r[2]<0||r[0]>W||r[2]-r[0]<5) continue;
      var hero=(sg===HERO_S)&&!NOHERO; if(!hero && ((sg*7+3)%5)>2) continue;
      (function(r,hero,sg){ list.push({d:r[4]-0.05,fn:function(){
        var w=r[2]-r[0], h=r[3]-r[1], x0=r[0], y1=r[3], i, a;
        if(w>150){                                                                  // close: the cabin beyond the glass
          rect(x0,r[1],w,h,hex("#141a26"));
          for(i=0;i<3;i++){ rect(x0+w*(0.04+i*0.33),r[1]+h*0.10,w*0.26,h*0.34,hex("#c98a5e")); rect(x0+w*(0.04+i*0.33),r[1]+h*0.10,w*0.26,h*0.10,hex("#6a4f8e")); }
          rect(x0,r[1]+h*0.03,w,h*0.035,hex("#f3e2b0"));                              // ceiling light strip
          rect(x0,r[1]+h*0.56,w,h*0.16,hex("#1c2f5a")); rect(x0,r[1]+h*0.72,w,h*0.28,hex("#10131b"));   // far bench, floor
        } else rect(x0+1,r[1]+1,w-2,Math.max(1,h*0.16),hex("#3b4a5e"));               // far-side windows glimpsed through
        if(hero){ var ink=hex("#05070b"), rim=hex("#f2a45a"), cx=x0+w*0.5, pts=[];
          fillPoly(new Float32Array([cx-w*0.18,y1, cx-w*0.16,y1-h*0.30, cx-w*0.09,y1-h*0.36, cx+w*0.09,y1-h*0.36, cx+w*0.16,y1-h*0.30, cx+w*0.18,y1]),6,ink,0,0);
          for(i=0;i<=10;i++){ a=Math.PI*(1-i/10); pts.push(cx+Math.cos(a)*w*0.082, y1-h*0.30-Math.sin(a)*h*0.38); }
          fillPoly(new Float32Array(pts),11,ink,0,0);
          for(i=6;i<10;i++) line(pts[i*2],pts[i*2+1],pts[i*2+2],pts[i*2+3],rim);     // sunset catching the hood's edge
          // no laptop glow here: from square-on, her back hides the screen; it appears only once the zoom gets over her shoulder
        } else { var sil=hex("#0b1420"), fx=x0+(0.3+((sg*13)%4)*0.12)*w;
          rect(fx-0.2*w,y1-0.32*h,0.4*w,0.32*h,sil); rect(fx-0.1*w,y1-0.68*h,0.2*w,0.38*h,sil); } }}); })(r,hero,sg); } }

  // placed so that, from the final square-on camera, everyone stands between windows and clear of the door
  // Where the zoom stops: the whole window and a little of its frame, matching the realistic
  // start image clip 1 is generated from (art/ending-frames/5-handoff-window-real.jpg).
  var ZOOM_END_FOV=3.55;
  var CROWD=[[3.4,-4.55,"#4a8f6a"],[3.4,-2.6,"#d85a4a"],[3.6,2.55,"#c7913a"],[3.4,4.3,"#9c5aa0"],[6.9,2.85,"#3f7fae"],[4.6,-7.4,"#4a8f6a"],
             [4.5,-6.6,"#e0a040"],[4.3,6.7,"#5a7fbe"],[3.6,-8.6,"#d85a4a"],[3.8,9.1,"#3f7fae"],[5.0,-11,"#c7913a"],[4.6,12,"#9c5aa0"],
             [3.5,-14,"#4a8f6a"],[3.9,16,"#d85a4a"],[4.4,-19,"#3f7fae"],[3.6,21,"#e0a040"],[4.9,-9.8,"#5a7fbe"],[5.2,8.2,"#d85a4a"]];
  var scenesSaved = [
    // 1. Crouched at the platform edge looking up-track: it comes in under the wire, lamps
    //    steady, and the nose glides past the lens, slowing. The platform starts to cheer.
    { id:"CAM 02", label:"MARKET STATION — PLATFORM 3", tag:"▶ ARRIVING", dur:4.6,
      draw:function(t){
        var u=clamp01(t/4.6), zF=34-62*u*(1.6-0.6*u);
        cxs=W/2; cys=H/2;
        setCam(5.0,1.5,0, 0.2,2.7,13, 0.07, 60);
        Lx=0.5; Ly=0.5; Lz=-0.7;
        stationFar(t);
        train(zF,-1,"lampW","lampR",0);
        flush();
        stationNear();
        board(4.6,13,17.5,4.2,5.0);
        for(var i=0;i<CROWD.length;i++){ var c=CROWD[i], z=c[1]+22; if(z<4) continue; cheer(c[0]+0.5,z,c[2],t,i*0.7,zF<z-2,false); }
        cheer(4.9,5.2,"#d85a4a",t,0.3,zF<3,false); cheer(5.6,8.0,"#3f7fae",t,1.1,zF<6,false);
        flush();
      }},

    // 2. The camera swings off the three-quarter and settles level and square-on as the train
    //    eases to a dead stop, car 3's window centred. The platform erupts. Pre-credits hold.
    { id:"CAM 03", label:"MARKET STATION — PLATFORM 3", tag:"■ ON SCHEDULE", dur:6.2, hold:true,
      draw:function(t){
        var u=smooth(t/4.7), zN=HERO_STOP+30*(1-easeOut3(t/5.0)), go=t>4.4;
        cxs=W/2; cys=H/2;
        setCam(lerp(8.2,13,u),lerp(1.9,2.49,u),lerp(11,0,u), 0,lerp(2.7,2.49,u),lerp(-5,0,u), lerp(-0.07,0,u), lerp(52,30,u));
        Lx=0.6; Ly=0.5; Lz=-0.62;
        stationFar(t);
        train(zN,-1,"lampW","lampR",0);
        riders(zN);
        flush();
        stationNear();
        board(5.0,-2.3,2.3,4.12,4.95);
        for(var i=0;i<CROWD.length;i++){ var c=CROWD[i]; cheer(c[0],c[1],c[2],t,i*0.7,go,true); }
        flush();
      }},

    // 3. After the credits, the same frame: the doors open, passengers step off, the platform
    //    settles -- and the camera starts one straight push (a pure zoom, so perspective never
    //    changes) on the centre window, the picture sharpening as it goes, until the pane
    //    fills the frame. That last frame is where footage from outside the engine takes over.
    { id:"CAM 03", label:"MARKET STATION — PLATFORM 3", tag:"■ ON SCHEDULE", dur:11.2, hold:true,
      zoom:function(t){ return smooth((t-3.4)/7.4); },
      res:function(t){ var z=this.zoom(t); return z<0.28?640:z<0.6?960:1280; },
      soft:function(t){ return this.zoom(t)>=0.28; },
      nohud:function(t){ return this.zoom(t)>0.12; },
      draw:function(t){
        var z=this.zoom(t), fov=30*Math.pow(ZOOM_END_FOV/30,z), zN=HERO_STOP, i;
        cxs=W/2; cys=H/2;
        setCam(13,2.49,0, 0,2.49,0, 0, fov);
        Lx=0.6; Ly=0.5; Lz=-0.62;
        stationFar(t);
        train(zN,-1,"lampW","lampR",0);
        riders(zN);
        var o=smooth(t/1.1)*0.5, dz=zN+NOSE+2*CAR+2.5;                    // car 3's door slides open
        if(o>0.02) quad([1.705,1.12,dz-o],[1.705,3.02,dz-o],[1.705,3.02,dz+o],[1.705,1.12,dz+o],1,0,0,"wall",0.45,1);
        flush();
        stationNear();
        board(5.0,-2.3,2.3,4.12,4.95);
        for(i=0;i<CROWD.length;i++){ var c=CROWD[i]; cheer(c[0],c[1],c[2],t,i*0.7,t<2.2,true); }
        // stepping off, then away up the platform -- all to the left, so nobody crosses the window the camera is closing on
        var OFF=[["#e0a040",0.2],["#5a7fbe",0.75],["#d85a4a",0.4],["#4a8f6a",1.0],["#9c5aa0",0.55]];
        for(i=0;i<OFF.length;i++){ var p=(t-1.0-i*0.95); if(p<0) continue;
          var out=clamp01(p/0.9), walk=Math.max(0,p-0.9);
          person(1.85+1.3*out+OFF[i][1]*walk, 1.1+0.03*Math.abs(Math.sin(p*7)), dz-0.2-1.2*walk, OFF[i][0], 1, 0, false); }
        flush();
      }}
  ];

  // ---------- mount / loop / HUD ----------
  var inst=null, M0=null;
  function mount(stage,opts){
    destroy();
    var saved=!!(opts&&opts.mode==="saved"), stranded=!!(opts&&opts.mode==="stranded"),
        list0=saved?scenesSaved:stranded?[sceneStranded]:scenes, hs=saved?1.7:1, k;
    NOHERO=!!(opts&&opts.nohero);
    W=saved?640:320; H=saved?360:384; cxs=W/2; cys=H/2; calm=saved||stranded; soft=false;
    if(!M0){ M0={}; for(k in SUNSET) M0[k]=M[k]; }                       // the win is lit warm; swap ramps in and out
    for(k in SUNSET) M[k]=saved?SUNSET[k]:M0[k];
    var cv=document.createElement("canvas"); cv.width=W; cv.height=H;
    cv.style.cssText="display:block;width:100%;height:100%;object-fit:cover;image-rendering:pixelated;background:#05070c";
    stage.appendChild(cv);
    var ctx=cv.getContext("2d"); ctx.imageSmoothingEnabled=false;
    var img=ctx.createImageData(W,H); fb=new Uint32Array(img.data.buffer);
    function setRes(w){ W=w; H=Math.round(w*9/16); cv.width=W; cv.height=H; ctx.imageSmoothingEnabled=false;
      img=ctx.createImageData(W,H); fb=new Uint32Array(img.data.buffer); cxs=W/2; cys=H/2; hs=W/376;
      cv.style.imageRendering=W>640?"auto":"pixelated"; }
    var told={};
    var reduce=false; try{ reduce=matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){}
    var start=performance.now()/1000, raf=0, idx=Math.min((opts&&opts.from)||0,list0.length-1), sceneStart=0, running=true;   // opts.from: start at scene i (dev)

    function hud(sc,t){
      var q=function(v){ return Math.round(v*hs); };
      ctx.globalAlpha=0.10; ctx.fillStyle="#000"; for(var y=0;y<H;y+=2) ctx.fillRect(0,y,W,1);
      ctx.globalAlpha=0.22; ctx.fillRect(0,0,W,q(12)); ctx.fillRect(0,H-q(12),W,q(12)); ctx.fillRect(0,0,q(9),H); ctx.fillRect(W-q(9),0,q(9),H); ctx.globalAlpha=1;
      if(Math.floor(t*2)%2){ ctx.fillStyle="#e0443a"; ctx.fillRect(q(12),q(12),q(6),q(6)); }
      ctx.font=q(10)+"px monospace"; ctx.textBaseline="top"; ctx.textAlign="left"; ctx.fillStyle="#e8eef5"; ctx.fillText("REC",q(22),q(11));
      var tc=Math.floor(performance.now()/1000), mm=("0"+(Math.floor(tc/60)%60)).slice(-2), ss=("0"+(tc%60)).slice(-2), ff=("0"+(Math.floor(performance.now()/40)%25)).slice(-2);
      ctx.textAlign="right"; ctx.fillText("00:"+mm+":"+ss+":"+ff,W-q(12),q(11));
      if(sc.tag && (saved || Math.floor(t*3)%2)){ ctx.fillStyle=saved?"#7fe0a0":"#f8d44c"; ctx.fillText(sc.tag,W-q(12),q(24)); }
      ctx.textAlign="left"; ctx.fillStyle="rgba(4,8,14,0.74)"; ctx.fillRect(0,H-q(20),W,q(20));
      ctx.fillStyle="#f8d44c"; ctx.fillText(sc.id,q(12),H-q(17)); ctx.fillStyle="#cdd8e4"; ctx.fillText(sc.label,q(54),H-q(17));
    }
    function glitch(){
      for(var i=0;i<70;i++){ var y=(Math.random()*H)|0, h=1+(Math.random()*4|0); ctx.fillStyle=Math.random()<0.5?"#0a0d14":"#283142"; ctx.fillRect(0,y,W,h); }
      ctx.globalAlpha=0.6; ctx.fillStyle="#cdd8e4"; for(var j=0;j<50;j++) ctx.fillRect((Math.random()*W)|0,(Math.random()*H)|0,2,1); ctx.globalAlpha=1;
      ctx.fillStyle="#f8d44c"; ctx.font="10px monospace"; ctx.textAlign="center"; ctx.fillText("◉ ACQUIRING SIGNAL…",W/2,H/2-5); ctx.textAlign="left";
    }
    function render(sc,st,bare){
      if(saved){ var want=sc.res?sc.res(st):640; if(want!==W) setRes(want); soft=sc.soft?sc.soft(st):false; }
      sc.draw(st); ctx.putImageData(img,0,0); if(!bare && !(sc.nohud&&sc.nohud(st))) hud(sc,st); }
    function frame(now){ if(!running) return;
      var tt=now/1000-start, sc=list0[idx], st=tt-sceneStart;
      render(sc,st);
      // the erratic feeds cut with signal loss; the win just cuts, and holds on its last scene
      if(!saved && (sc.dur-st<0.28 || st<0.12)) glitch();
      if(st>=sc.dur && !sc.hold){ idx=(idx+1)%list0.length; sceneStart=tt; }
      // a held scene reports once: opts.onHold(i) -- the caller decides when to call next()
      if(st>=sc.dur && sc.hold && !told[idx]){ told[idx]=1; if(opts&&opts.onHold) opts.onHold(idx,idx===list0.length-1); }
      raf=requestAnimationFrame(frame);
    }
    if(reduce) render(saved?list0[list0.length-1]:scenes[2],saved?5:1.2); else raf=requestAnimationFrame(frame);
    inst={ destroy:function(){ running=false; cancelAnimationFrame(raf); if(cv.parentNode) cv.parentNode.removeChild(cv); },
           next:function(){ if(idx<list0.length-1){ idx++; sceneStart=performance.now()/1000-start; } },
           canvas:cv,
           // dev hook for web/train-preview.html: freeze on scene i at time t
           still:function(i,t,bare){ running=false; cancelAnimationFrame(raf); render(list0[i%list0.length],t,bare); } };
    return inst;
  }
  function destroy(){ if(inst){ inst.destroy(); inst=null; } }
  window.GrokTrain={ mount:mount, destroy:destroy, next:function(){ if(inst) inst.next(); }, still:function(i,t,bare){ if(inst) inst.still(i,t,bare); },
    // dev: the train's body colours as rrggbb, for the contact-sheet tool's coverage figure
    trainHex:function(){ var o=[]; ["white","roof","blue","glass","skirt","door"].forEach(function(n){ M[n].forEach(function(v){
      o.push(((1<<24)|((v&255)<<16)|((v>>8&255)<<8)|(v>>16&255)).toString(16).slice(1)); }); }); return o; } };
})();
