/* Shared kit for the hero options: WebGL boilerplate, the name mask, and
   chrome-lettering GLSL. Each option page supplies its own fragment shader
   and its own 2D effects layer. */

export const VERT = `attribute vec2 p;varying vec2 vUv;void main(){vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;

export const NOISE = `
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
`;

/* Classic 80s chrome: sky above the horizon, a hot white horizon line, dark ground below.
   Needs uniforms: sampler2D uMask (R body, G glow, B bevel height), vec4 uBox (glyph box, uv), vec2 uRes. */
export const CHROME = `
vec3 chromeEnv(float y, vec3 skyTop, vec3 skyLow, vec3 ground){
  vec3 sky=mix(skyLow,skyTop,smoothstep(0.,.9,y));
  vec3 gnd=mix(ground*1.9,ground*.35,smoothstep(0.,.9,-y));
  vec3 c=y>0.?sky:gnd;
  c+=vec3(1.,.98,.95)*exp(-abs(y)*26.)*1.25;
  return c;
}
// returns rgb (unpremultiplied); body coverage written to cov
vec3 chrome(vec2 uv, vec2 tilt, float bevel, vec3 skyTop, vec3 skyLow, vec3 ground, out float cov, out vec3 nOut){
  vec2 px=1./uRes;
  vec4 m=texture2D(uMask,uv); cov=m.r;
  float hx=texture2D(uMask,uv+vec2(px.x*1.5,0.)).b-texture2D(uMask,uv-vec2(px.x*1.5,0.)).b;
  float hy=texture2D(uMask,uv+vec2(0.,px.y*1.5)).b-texture2D(uMask,uv-vec2(0.,px.y*1.5)).b;
  vec3 n=normalize(vec3(-hx*bevel,-hy*bevel,1.)); nOut=n;
  float yn=clamp((uv.y-uBox.y)/max(uBox.w,1e-3),0.,1.);
  float ry=n.y*1.5+(yn-.52)*1.7+tilt.y*.35+n.x*tilt.x*.6;
  vec3 c=chromeEnv(ry,skyTop,skyLow,ground);
  // bevel edges catch a little extra light; flat face stays clean
  c+=vec3(.9,.95,1.)*pow(1.-n.z,1.5)*.35;
  return c;
}
`;

export function createGL(canvas, frag){
  const gl = canvas.getContext('webgl', {premultipliedAlpha:true, alpha:true, antialias:false});
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){ console.error(gl.getShaderInfoLog(s)); return null; } return s; };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, frag);
  if (!vs || !fs) return null;
  const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)){ console.error(gl.getProgramInfoLog(prog)); return null; }
  gl.useProgram(prog);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const cache = {};
  const U = n => (n in cache) ? cache[n] : (cache[n] = gl.getUniformLocation(prog, n));
  return { gl, prog, U, tex };
}

/* Draws the name into a mask canvas sized to the hero and returns layout info.
   R = letter body, G = soft glow, B = bevel height. */
export function buildMask(maskCanvas, W, H, dpr, opts = {}){
  const ctx = maskCanvas.getContext('2d', {willReadFrequently:true});
  maskCanvas.width = W; maskCanvas.height = H;
  const stacked = W / H < .82;
  const lines = stacked ? ['Al', 'Atkins'] : ['Al Atkins'];
  const font = s => `900 ${s}px "Grenze Gotisch"`;
  ctx.font = font(100);
  const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
  const size = Math.min((W * (stacked ? .84 : (opts.widthFrac || .82))) / widest * 100, H * (stacked ? .25 : .34));
  const lh = size * .86;
  const centerY = H * (stacked ? .44 : (opts.centerY || .47));
  const top = centerY - lh * lines.length / 2;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const draw = (color, blur) => {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = color; ctx.font = font(size);
    if (blur) ctx.filter = `blur(${blur}px)`;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, top + lh * (i + 1) - size * .12));
    ctx.restore();
  };
  draw('#ff0000', 0);
  draw('#00ff00', size * .16);
  draw('#00ff00', size * .045);
  draw('#0000ff', Math.max(2, size * .032));

  const ascent = size * .78, descent = size * .1;
  const yTop = top + lh - size * .12 - ascent, yBot = top + lh * lines.length - size * .12 + descent;
  const halfW = widest / 100 * size / 2;
  const ink = { x0: (W / 2 - halfW) / dpr, x1: (W / 2 + halfW) / dpr, yTop: yTop / dpr, yBot: yBot / dpr, base: (yBot - descent) / dpr, size: size / dpr };

  // top-edge points of the letters (CSS px) for flares, strikes and sparks
  const img = ctx.getImageData(0, 0, W, H).data;
  const edges = [];
  for (let k = 0; k < 400 && edges.length < 40; k++){
    const x = Math.round(W / 2 - halfW + Math.random() * halfW * 2);
    for (let y = Math.max(0, Math.round(yTop - size * .1)); y < yBot; y += 2){
      if (img[(y * W + x) * 4] > 140){ edges.push({ x: x / dpr, y: y / dpr }); break; }
    }
  }
  return { box: [0, 1 - yBot / H, 1, (yBot - yTop) / H], ink, edges, stacked };
}

export function uploadMask(gl, tex, maskCanvas){
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, maskCanvas);
}

export function sizeCanvases(hero, canvases){
  const r = hero.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, innerWidth < 760 ? 1.25 : 1.6);
  const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
  canvases.forEach(c => { c.width = W; c.height = H; });
  return { W, H, dpr, rect: r };
}

export function placeCopy(copy, ink, rect){
  copy.style.top = `${Math.min(ink.yBot + Math.max(18, rect.height * .035), rect.height - 230)}px`;
  copy.style.bottom = 'auto';
}

export function shake(el, px = 6, ms = 340){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  el.animate([{transform:'translate(0,0)'},{transform:`translate(${-px}px,${px*.6}px)`},{transform:`translate(${px*.8}px,${-px*.5}px)`},{transform:`translate(${-px*.4}px,${px*.3}px)`},{transform:'translate(0,0)'}],
    {duration:ms, easing:'cubic-bezier(.2,.9,.25,1)'});
}

/* Pauses the loop when the hero is off screen or the tab is hidden. */
export function loop(hero, frame){
  let running = true, visible = true, raf = 0;
  const tick = now => { if (!running) return; frame(now); raf = requestAnimationFrame(tick); };
  const resume = () => { if (!running && visible && !document.hidden){ running = true; raf = requestAnimationFrame(tick); } };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) resume(); else running = false; }).observe(hero);
  document.addEventListener('visibilitychange', () => { if (document.hidden) running = false; else resume(); });
  raf = requestAnimationFrame(tick);
}
