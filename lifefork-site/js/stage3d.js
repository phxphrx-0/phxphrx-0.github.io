import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
/* v0.26 現成人物模型：Quaternius「Universal Base Characters」免費版（CC0 1.0，quaternius.com）。
   放在 assets/models/。載入時：拿掉原始貼圖、把衣服區塊抹平並加一點厚度、把眼睛和嘴巴的形狀抹平（不畫五官） */
const MODEL_URL = { male: "assets/models/male.glb", female: "assets/models/female.glb", hShort: "assets/models/hShort.glb", hBuzz: "assets/models/hBuzz.glb", hLong: "assets/models/hLong.glb", hBuns: "assets/models/hBuns.glb" };
const KIT = {}; const _kv = new THREE.Vector3();
function kitWeld(geo){ geo = geo.clone(); for (const k of Object.keys(geo.attributes)) if (!["position", "skinIndex", "skinWeight"].includes(k)) geo.deleteAttribute(k); return mergeVertices(geo, 1e-5); }
function kitNb(geo){ const n = geo.attributes.position.count, idx = geo.index.array, A = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < idx.length; t += 3){ const a = idx[t], b = idx[t + 1], c = idx[t + 2]; A[a].add(b).add(c); A[b].add(a).add(c); A[c].add(a).add(b); } return A.map(x => [...x]); }
function kitSmooth(pos, nb, sel, it, f){ const n = pos.count, P = pos.array;
  for (let k = 0; k < it; k++){ const Q = P.slice(); for (let i = 0; i < n; i++){ const w = sel[i]; if (!w) continue; const L = nb[i]; if (!L.length) continue; let x = 0, y = 0, z = 0;
      for (const j of L){ x += P[j * 3]; y += P[j * 3 + 1]; z += P[j * 3 + 2]; } const m = L.length, a = f * w; Q[i * 3] = P[i * 3] * (1 - a) + x / m * a; Q[i * 3 + 1] = P[i * 3 + 1] * (1 - a) + y / m * a; Q[i * 3 + 2] = P[i * 3 + 2] * (1 - a) + z / m * a; }
    P.set(Q); } pos.needsUpdate = true; }
function kitBody(scene){
  const V3 = THREE.Vector3;
  scene.updateMatrixWorld(true); let body, eyes; scene.traverse(o => { if (o.isSkinnedMesh){ if (/Eye/i.test(o.name)) eyes = o; else body = o; } });
  const fem = /female/i.test(body.name), sk = body.skeleton, names = sk.bones.map(b => b.name), J = {}; sk.boneInverses.forEach((m, i) => { J[names[i]] = new THREE.Vector3().setFromMatrixPosition(m.clone().invert()); });
  const geo = kitWeld(body.geometry), pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, n = pos.count, BM = body.bindMatrix, BMi = BM.clone().invert();
  const W = i => _kv.fromBufferAttribute(pos, i).applyMatrix4(BM).clone(), SET = (i, q) => pos.setXYZ(i, ...q.clone().applyMatrix4(BMi).toArray());
  const seg = (p, a, b) => { const ab = J[b].clone().sub(J[a]); return p.clone().sub(J[a]).dot(ab) / ab.lengthSq(); };
  const dom = i => { let b = 0, w = -1; for (let k = 0; k < 4; k++){ const ww = sw.getComponent(i, k); if (ww > w){ w = ww; b = si.getComponent(i, k); } } return names[b]; };
  const wOf = (i, re) => { let w = 0; for (let k = 0; k < 4; k++) if (re.test(names[si.getComponent(i, k)])) w += sw.getComponent(i, k); return w; };
  // ── 1. 改骨架比例：免費版只有「超級英雄」體型，把肩膀往內收、斜方肌壓低（連骨頭一起移，動作才對得上）
  const SH = fem ? .012 : .028;
  for (const c of ["l", "r"]){ const sx = Math.sign(J["upperarm_" + c].x - J.spine_03.x), D = new V3(-sx * SH, fem ? 0 : -.006, 0), re = new RegExp(`^(upperarm|lowerarm|hand|index|middle|ring|pinky|thumb)_.*${c}$|^(upperarm|lowerarm|hand)_${c}$`);
    for (let i = 0; i < n; i++){ const w = wOf(i, re) + .55 * wOf(i, new RegExp(`^clavicle_${c}$`)); if (w > 0) SET(i, W(i).addScaledVector(D, Math.min(1, w))); }
    names.forEach((nm, k) => { if (re.test(nm)){ sk.boneInverses[k].multiply(new THREE.Matrix4().makeTranslation(-D.x, -D.y, -D.z)); J[nm].add(D); } });
    const ua = sk.bones[names.indexOf("upperarm_" + c)], uw = ua.getWorldPosition(new V3()).add(_kv.copy(D).applyMatrix4(new THREE.Matrix4().extractRotation(BM)).multiplyScalar(1));
    ua.position.copy(ua.parent.worldToLocal(uw)); scene.updateMatrixWorld(true); }
  if (!fem) for (let i = 0; i < n; i++){ const nm = dom(i); if (!/clavicle|spine_03|neck/.test(nm)) continue; const p = W(i), ax = Math.abs(p.x - J.spine_03.x), sx = Math.abs(J.upperarm_l.x - J.spine_03.x);
    const k = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (ax - .045) / (sx - .045))))) * Math.max(0, Math.min(1, (p.y - (J.clavicle_l.y - .03)) / .05)); if (k > 0) SET(i, p.setY(p.y - .014 * k)); }
  // ── 2. 手臂、脖子、胸背收細
  { const ka = fem ? .92 : .86, kt = fem ? .97 : .94;
    for (let i = 0; i < n; i++){ const nm = dom(i), sd = nm.slice(-1), p = W(i); let a, b;
      if (/^upperarm/.test(nm)){ a = "upperarm_" + sd; b = "lowerarm_" + sd; } else if (/^lowerarm/.test(nm)){ a = "lowerarm_" + sd; b = "hand_" + sd; }
      if (a){ const A = J[a], AB = J[b].clone().sub(A), t = Math.max(0, Math.min(1, p.clone().sub(A).dot(AB) / AB.lengthSq())), c = A.clone().addScaledVector(AB, t); SET(i, c.add(p.sub(c).multiplyScalar(ka))); continue; }
      if (/neck/.test(nm) && !fem){ const N = J.neck_01; p.x = N.x + (p.x - N.x) * .9; p.z = N.z + (p.z - N.z) * .92; SET(i, p); continue; }
      if (/spine_0[23]|clavicle/.test(nm) && !fem){ p.x = J.spine_03.x + (p.x - J.spine_03.x) * kt; p.z = J.spine_03.z + (p.z - J.spine_03.z) * .96; SET(i, p); } } }
  // ── 3. 連續的區域場：手臂程度、沿手臂的位置（0 肩、1 手肘、2 手腕）——著色和加厚都用同一套，邊界才會是平滑曲線
  const N = J.neck_01, waistY = J.pelvis.y + .075, shoeY = J.foot_l.y + .02, kneeY = J.calf_l.y, sideX = Math.abs(J.upperarm_l.x - J.spine_03.x);
  const armA = new Float32Array(n), armT = new Float32Array(n), kind = new Uint8Array(n);   // kind：0 皮膚 1 上衣 2 褲 3 鞋 4 袖
  for (let i = 0; i < n; i++){ const p = W(i), sd = p.x - J.spine_03.x > 0 === J.upperarm_l.x - J.spine_03.x > 0 ? "l" : "r";
    const a = Math.max(0, Math.min(1, (Math.abs(p.x - J.spine_03.x) - (sideX - .015)) / .03)) * (p.y > J.spine_02.y ? 1 : 0); armA[i] = a;
    const t = seg(p, "upperarm_" + sd, "lowerarm_" + sd); armT[i] = t < 1 ? Math.max(0, t) : 1 + Math.max(0, seg(p, "lowerarm_" + sd, "hand_" + sd));
    if (a > .5) kind[i] = armT[i] < 1.93 ? 4 : 0;
    else if (p.y < shoeY) kind[i] = 3; else if (p.y < waistY) kind[i] = 2;
    else { const cd = Math.hypot(p.x - N.x, (p.z - N.z) * 1.2), rc = .074 + .01 * Math.max(0, Math.min(1, (p.z - N.z + .03) / .07)); kind[i] = (p.y > N.y + .05 || (p.y > N.y - .08 && cd < rc)) ? 0 : 1; } }
  const nb = kitNb(geo);
  // ── 4. 臉：把眼縫和嘴唇抹平，只留臉型和鼻子
  if (eyes){ const ep = eyes.geometry.attributes.position, L = new V3(), R = new V3(); let nl = 0, nr = 0;
    for (let i = 0; i < ep.count; i++){ const v = _kv.fromBufferAttribute(ep, i).applyMatrix4(eyes.bindMatrix); if (v.x < 0){ L.add(v); nl++; } else { R.add(v); nr++; } }
    L.divideScalar(nl || 1); R.divideScalar(nr || 1); const ey = (L.y + R.y) / 2, ez = (L.z + R.z) / 2, sel = new Float32Array(n);
    for (let i = 0; i < n; i++){ if (kind[i] || armA[i] > .5) continue; const p = W(i); if (p.z < ez - .02) continue;
      for (const c of [L, R]){ const d = ((p.x - c.x) / .034) ** 2 + ((p.y - c.y) / .024) ** 2 + ((p.z - c.z) / .04) ** 2; if (d < 1) sel[i] = Math.max(sel[i], 1 - d * .6); }
      const d2 = (p.x / .038) ** 2 + ((p.y - (ey - .08)) / .026) ** 2; if (d2 < 1 && p.z > ez) sel[i] = Math.max(sel[i], 1 - d2 * .6); }
    kitSmooth(pos, nb, sel, 45, .7); }
  // ── 5. 衣服：抹掉肌肉線條；加厚的量先在網格上擴散，交界處才不會出現台階
  const cl = new Float32Array(n); for (let i = 0; i < n; i++){ const k = kind[i]; cl[i] = k === 1 || k === 2 || k === 3 ? 1 : k === 4 ? .6 : 0; } kitSmooth(pos, nb, cl, 10, .5);
  const shoe = new Float32Array(n); for (let i = 0; i < n; i++) shoe[i] = kind[i] === 3 ? 1 : 0; kitSmooth(pos, nb, shoe, 20, .6);
  { const cs = new Float32Array(n); for (let i = 0; i < n; i++){ if (armA[i] > .5) continue; const p = W(i), cd = Math.hypot(p.x - N.x, (p.z - N.z) * 1.2);   // 領口前方的胸骨凹陷抹平，領線才不會出現 V 形缺口
      if (p.z > N.z && p.y > N.y - .12 && p.y < N.y + .02 && cd < .12) cs[i] = Math.max(0, 1 - Math.abs(p.x - N.x) / .06); } kitSmooth(pos, nb, cs, 25, .6); }
  let off = Float32Array.from(kind, k => [0, .006, .005, .012, .004][k]);
  for (let it = 0; it < 4; it++){ const o2 = off.slice(); for (let i = 0; i < n; i++){ const L = nb[i]; let m = 0; for (const j of L) m += off[j]; if (L.length) o2[i] = off[i] * .5 + m / L.length * .5; } off = o2; }
  geo.computeVertexNormals(); const nr = geo.attributes.normal;
  for (let i = 0; i < n; i++) if (off[i] > 1e-5) pos.setXYZ(i, pos.getX(i) + nr.getX(i) * off[i], pos.getY(i) + nr.getY(i) * off[i], pos.getZ(i) + nr.getZ(i) * off[i]);
  geo.computeVertexNormals();
  const bp = new Float32Array(n * 3); for (let i = 0; i < n; i++) bp.set(W(i).toArray(), i * 3);
  geo.setAttribute("bpos", new THREE.BufferAttribute(bp, 3)); geo.setAttribute("arm", new THREE.BufferAttribute(Float32Array.from({ length: n * 2 }, (_, k) => k % 2 ? armT[k >> 1] : armA[k >> 1]), 2));
  return { scene, geo, kind, armA, J, names, fem, bodyName: body.name, eyesName: eyes?.name, BM: body.bindMatrix.clone(), inverses: sk.boneInverses, F: { N: N.clone(), waistY, shoeY, kneeY } };
}
/* 衣服材質：顏色邊界在像素層級用連續的場決定（領口、袖口、腰帶、鞋口都是平滑曲線），再用程序化的布料皺褶擾動法線 */
const CLOTH_GLSL = `
float clHash(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float clNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(clHash(i), clHash(i + vec3(1,0,0)), f.x), mix(clHash(i + vec3(0,1,0)), clHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(clHash(i + vec3(0,0,1)), clHash(i + vec3(1,0,1)), f.x), mix(clHash(i + vec3(0,1,1)), clHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float clAA(float v){ float w = max(fwidth(v), 1e-5); return smoothstep(-w, w, v); }
`;
function clothMaterial(kit, o){
  const U = { uNeck: { value: kit.F.N }, uWaistY: { value: kit.F.waistY }, uShoeY: { value: kit.F.shoeY }, uKneeY: { value: kit.F.kneeY }, uCuff: { value: 1.93 },
    uShirt: { value: new THREE.Color(o.col || "#5b6b7a") }, uPants: { value: new THREE.Color(o.pants || "#30353e") }, uShoes: { value: new THREE.Color(RIG_COL.shoes) }, uSkin: { value: new THREE.Color(SKIN3) } };
  const m = new THREE.MeshStandardMaterial({ roughness: .8, metalness: 0 });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 bpos; attribute vec2 arm; varying vec3 vBp; varying vec2 vArm;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvBp = bpos; vArm = arm;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vBp; varying vec2 vArm; uniform vec3 uNeck, uShirt, uPants, uShoes, uSkin; uniform float uWaistY, uShoeY, uKneeY, uCuff;" + CLOTH_GLSL)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", `
        vec3 p = vBp; float aA = clAA(vArm.x - .5);
        float sleeve = 1. - clAA(vArm.y - uCuff);
        float shoes = 1. - clAA(p.y - uShoeY);
        float pants = (1. - clAA(p.y - uWaistY)) * (1. - shoes);
        float cd = length(vec2(p.x - uNeck.x, (p.z - uNeck.z) * 1.2));
        float rc = mix(.074, .084, smoothstep(uNeck.z - .03, uNeck.z + .04, p.z));   // 領口：以脖子為軸的半徑，前面略寬
        float skinT = max(clAA(rc - cd) * clAA(p.y - (uNeck.y - .08)), clAA(p.y - (uNeck.y + .05))) * (1. - pants) * (1. - shoes);
        vec3 cT = mix(mix(mix(uShirt, uPants, pants), uShoes, shoes), uSkin, skinT);
        vec3 col = mix(cT, mix(uSkin, uShirt, sleeve), aA);
        float clothM = mix(1. - skinT, sleeve, aA);
        float isShirt = (1. - pants) * (1. - shoes) * (1. - aA);
        vec4 diffuseColor = vec4(col, opacity);`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(.62, .86, clothM);")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        {
          float t = vArm.y, nz = clNoise(p * 38.) * 3., nz2 = clNoise(p * 11.) * 4.;
          float ring = sin(t * 52. + nz) * (exp(-pow((t - 1.) / .16, 2.)) * .0026 + exp(-pow((t - 1.85) / .1, 2.)) * .0018 + .0002) + sin(t * 9. + nz2) * .0008;
          float drape = sin(p.x * 64. + nz2) * smoothstep(uWaistY + .32, uWaistY + .04, p.y) * .0024;
          float bunch = sin(p.y * 150. + nz) * exp(-pow((p.y - uWaistY - .035) / .035, 2.)) * .0022;
          float pit = sin((p.y - p.x * .6) * 90. + nz) * exp(-pow((p.y - uNeck.y + .2) / .06, 2.)) * smoothstep(.1, .16, abs(p.x - uNeck.x)) * .0016;
          float knee = sin(p.y * 115. + nz) * exp(-pow((p.y - uKneeY) / .11, 2.)) * .0026 + sin(p.y * 130. + nz) * exp(-pow((p.y - uShoeY - .07) / .06, 2.)) * .0024;
          float hip = sin((p.y + abs(p.x - uNeck.x) * 1.4) * 80. + nz2) * exp(-pow((p.y - uWaistY + .1) / .08, 2.)) * .0014;
          float h = mix(p.y > uWaistY ? drape + bunch + pit : knee + hip, ring, aA) * clothM * (1. - shoes);
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float dhx = dFdx(h), dhy = dFdy(h);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
          normal = normalize(abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2) * 1.0);
        }`); };
  m.customProgramCacheKey = () => "cloth-v1";
  return m;
}
function kitHair(scene, bodyKit){
  scene.updateMatrixWorld(true); let h; scene.traverse(o => { if (o.isSkinnedMesh) h = o; });
  const names = h.skeleton.bones.map(b => b.name), hi = names.indexOf("Head"), hh = new THREE.Vector3().setFromMatrixPosition(h.skeleton.boneInverses[hi].clone().invert());
  const geo = h.geometry.clone(); for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv", "skinIndex", "skinWeight"].includes(k)) geo.deleteAttribute(k);
  return { geo, names, map: h.material.map, nmap: h.material.normalMap, inverses: h.skeleton.boneInverses.map(m => m.clone()), BM: h.bindMatrix.clone() };
}
try { const L = new GLTFLoader(); const load = async u => (await L.loadAsync(u)).scene;
  KIT.male = kitBody(await load(MODEL_URL.male)); KIT.female = kitBody(await load(MODEL_URL.female));
  KIT.hShort = kitHair(await load(MODEL_URL.hShort), KIT.male); KIT.hBuzz = kitHair(await load(MODEL_URL.hBuzz), KIT.male);
  KIT.hLong = kitHair(await load(MODEL_URL.hLong), KIT.female); KIT.hBuns = kitHair(await load(MODEL_URL.hBuns), KIT.female);
  KIT.ok = true; } catch (e) { console.warn("model load failed", e); }

/* ============================================================
   Stage3D：即時 3D 場景。房間、光影、天氣、人物全身關節（IK 手臂、
   走路、坐下起身、手勢、拿杯子）。人物不畫五官。
   ============================================================ */
const V3 = THREE.Vector3, DOWN = new V3(0, -1, 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
function hash(n){ let x = Math.imul((n | 0) ^ 0x9E3779B9, 2654435761) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; }

/* ---------------- 材質與程式產生的貼圖 ---------------- */
const MC = new Map();
/* v0.26 程序化材質層：用世界座標的雜訊，讓牆面、家具有細微的明暗斑駁、粗糙度變化和表面顆粒，牆腳略髒（不需要貼圖） */
const GRIME_GLSL = `
float grH(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float grN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(grH(i), grH(i + vec3(1,0,0)), f.x), mix(grH(i + vec3(0,1,0)), grH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(grH(i + vec3(0,0,1)), grH(i + vec3(1,0,1)), f.x), mix(grH(i + vec3(0,1,1)), grH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float grF(vec3 p){ return grN(p) * .5 + grN(p * 2.03 + 1.7) * .3 + grN(p * 4.1 + 3.1) * .2; }`;
function grime(m, amt = 1){
  m.onBeforeCompile = sh => { sh.uniforms.uGrime = { value: amt };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vGW;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.)).xyz;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying vec3 vGW; uniform float uGrime;" + GRIME_GLSL)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float gLow = grF(vGW * 1.6), gFine = grN(vGW * 55.);
        diffuseColor.rgb *= 1. + ((gLow - .5) * .14 + (gFine - .5) * .05) * uGrime;
        diffuseColor.rgb *= 1. - .1 * uGrime * smoothstep(.16, .0, vGW.y) * grF(vGW * 6.);`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * (1. + (grF(vGW * 7.) - .5) * .35 * uGrime), .04, 1.);")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        { float h = (grN(vGW * 140.) * .6 + grN(vGW * 37.) * .4) * .00045 * uGrime;
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); float dhx = dFdx(h), dhy = dFdy(h);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx); float det = dot(dpx, r1);
          normal = normalize(abs(det) * normal - sign(det) * (dhx * r1 + dhy * r2)); }`); };
  m.customProgramCacheKey = () => "grime1"; return m;
}
function mat(color, rough = .8, metal = 0, opt){
  const k = `${color}|${rough}|${metal}|${opt ? opt.key : ""}`;
  if (!MC.has(k)){ const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...(opt ? opt.p : {}) });
    if (!(opt && (opt.p?.emissive || opt.p?.transparent)) && metal < .5 && !window.__noGrime) grime(m, rough < .3 ? .4 : 1); MC.set(k, m); }
  return MC.get(k);
}
function canvasTex(w, h, draw, repeat){
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat){ t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const TEX = {};
function woodTex(base = [150, 108, 72]){
  const k = "wood" + base; if (TEX[k]) return TEX[k];
  return TEX[k] = canvasTex(512, 512, (g, w, h) => {
    for (let i = 0; i < 8; i++){ const v = (hash(i * 7 + 3) - .5) * 26;
      g.fillStyle = `rgb(${base[0] + v},${base[1] + v * .8},${base[2] + v * .6})`; g.fillRect(0, i * 64, w, 64);
      for (let j = 0; j < 40; j++){ g.strokeStyle = `rgba(60,35,20,${.04 + hash(i * 99 + j) * .06})`; g.beginPath(); const y = i * 64 + hash(i * 31 + j) * 64; g.moveTo(0, y); g.bezierCurveTo(w * .3, y + 4, w * .6, y - 4, w, y + 2); g.stroke(); }
      g.fillStyle = "rgba(40,25,15,.35)"; g.fillRect(0, i * 64, w, 2); g.fillRect(hash(i) * w, i * 64, 2, 64); }
  }, [3, 3]);
}
function noiseTex(rgb, amt = 10, key = ""){
  const k = "n" + rgb + key; if (TEX[k]) return TEX[k];
  return TEX[k] = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = `rgb(${rgb})`; g.fillRect(0, 0, w, h); const d = g.getImageData(0, 0, w, h);
    for (let i = 0; i < d.data.length; i += 4){ const n = (Math.random() - .5) * amt; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; }
    g.putImageData(d, 0, 0);
  }, [4, 4]);
}
function tileTex(){ if (TEX.tile) return TEX.tile; return TEX.tile = canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#d9dfdc"; g.fillRect(0, 0, w, h); g.strokeStyle = "#b9c2bf"; g.lineWidth = 3; for (let i = 0; i <= 4; i++){ g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); } }, [6, 6]); }
function carpetTex(){ if (TEX.carpet) return TEX.carpet; return TEX.carpet = noiseTex("120,128,136", 22, "c"); }
function dotTex(){ if (TEX.dot) return TEX.dot; return TEX.dot = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }
function textTex(lines, opt = {}){
  return canvasTex(opt.w || 512, opt.h || 256, (g, w, h) => {
    g.fillStyle = opt.bg || "#fbfbf8"; g.fillRect(0, 0, w, h);
    g.fillStyle = opt.fg || "#333"; g.font = `${opt.size || 34}px "Noto Sans TC", sans-serif`; g.textBaseline = "top";
    lines.forEach((l, i) => g.fillText(l, opt.x || 24, (opt.y || 24) + i * (opt.lh || 48)));
    if (opt.scribble) for (let i = 0; i < 5; i++){ g.strokeStyle = ["#2f6db0", "#b0443a", "#2e7d4f"][i % 3]; g.lineWidth = 3; g.beginPath(); let x = 30, y = 70 + i * 34; g.moveTo(x, y); for (let k = 0; k < 14; k++){ x += 26; g.lineTo(x, y + (Math.random() - .5) * 18); } g.stroke(); }
  });
}
function skyTex(hour, weather, season){
  return canvasTex(1024, 512, (g, w, h) => {
    const t = timeOf(hour);
    const SK = { morning: ["#a9cfe8", "#f3dcc0"], day: ["#6fb0e0", "#d6ecf7"], evening: ["#e9925a", "#5d5f9e"], night: ["#0b1026", "#1f2a52"] }[t];
    let top = SK[0], bot = SK[1];
    if (weather === "rain"){ top = t === "night" ? "#0a0d18" : "#7b8794"; bot = t === "night" ? "#1a2030" : "#aab4bd"; }
    else if (weather === "cloud" && t !== "night"){ top = "#9fb1c0"; bot = "#d5dde3"; }
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    if (weather === "clear"){ g.fillStyle = t === "night" ? "#f1eed8" : t === "evening" ? "#ffc27a" : "#fff1c2"; g.beginPath(); g.arc(w * .72, t === "evening" ? h * .62 : h * .2, t === "night" ? 16 : 26, 0, 7); g.fill(); }
    if (weather !== "clear") for (let i = 0; i < 9; i++){ g.fillStyle = weather === "rain" ? (t === "night" ? "rgba(40,46,64,.8)" : "rgba(110,120,132,.7)") : "rgba(255,255,255,.75)"; g.beginPath(); g.ellipse(hash(i) * w, 40 + hash(i + 9) * 140, 90 + hash(i + 3) * 80, 22 + hash(i + 5) * 14, 0, 0, 7); g.fill(); }
    for (let layer = 0; layer < 2; layer++) for (let i = 0; i < 22; i++){
      const bw = 40 + hash(i * 3 + layer) * 60, bh = (layer ? 120 : 60) + hash(i * 5 + layer * 7) * (layer ? 200 : 160), bx = hash(i * 11 + layer * 3) * w, by = h - bh;
      g.fillStyle = t === "night" ? (layer ? "#1c2340" : "#2a3155") : weather === "rain" ? (layer ? "#6f7984" : "#8c96a0") : (layer ? "#7f8fa0" : "#a7b4c1"); g.fillRect(bx, by, bw, bh);
      for (let yy = by + 8; yy < h - 8; yy += 14) for (let xx = bx + 6; xx < bx + bw - 6; xx += 12){
        if (t === "night" ? hash(xx * 7 + yy * 13) < .38 : hash(xx * 7 + yy * 13) < .15){ g.fillStyle = t === "night" ? "#f5d676" : "rgba(220,235,245,.6)"; g.fillRect(xx, yy, 5, 7); } }
    }
    const tree = { spring: "#86c178", summer: "#3e8450", autumn: "#c9803a", winter: "#7d8a72" }[season || "summer"];
    for (let i = 0; i < 5; i++){ g.fillStyle = tree; g.beginPath(); g.arc(80 + i * 220 + hash(i) * 60, h - 40, 50 + hash(i + 2) * 20, 0, 7); g.fill(); }
  });
}
const timeOf = h => h >= 5 && h < 9 ? "morning" : h >= 9 && h < 17 ? "day" : h >= 17 && h < 19 ? "evening" : "night";

/* ---------------- 幾何小工具 ---------------- */
function box(w, h, d, m, x, y, z, parent, shadow = true){ const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; if (parent) parent.add(o); return o; }
function cyl(rt, rb, h, m, x, y, z, parent, seg = 20, shadow = true){ const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y, z); o.castShadow = shadow; o.receiveShadow = true; if (parent) parent.add(o); return o; }
function capsule(r, len, m, parent){ const o = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 12), m); o.castShadow = true; o.receiveShadow = true; if (parent) parent.add(o); return o; }
function sphere(r, m, parent, seg = 20){ const o = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg * .75 | 0), m); o.castShadow = true; o.receiveShadow = true; if (parent) parent.add(o); return o; }

/* ---------------- 家具與物件 ---------------- */
function chair(parent, x, z, yaw, col = "#6b4f38"){
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; parent.add(g); const m = mat(col, .7);
  box(.44, .05, .42, m, 0, .45, 0, g); box(.44, .48, .04, m, 0, .72, -.2, g);
  for (const [a, b] of [[-.19, -.18], [.19, -.18], [-.19, .18], [.19, .18]]) box(.035, .45, .035, m, a, .225, b, g);
  return g;
}
function bowl(parent, x, y, z, food){
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const b = new THREE.Mesh(new THREE.SphereGeometry(.065, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat("#f4f1ea", .35)); b.position.y = .065; b.castShadow = true; g.add(b);
  if (food){ const f = cyl(.058, .058, .01, mat(food, .9), 0, .058, 0, g); f.castShadow = false; }
  return g;
}
function cup(parent, x, y, z, col = "#ffffff"){
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  cyl(.038, .032, .09, mat(col, .4), 0, .045, 0, g); cyl(.033, .033, .005, mat("#5a3a24", .3), 0, .086, 0, g, 16, false);
  const h = new THREE.Mesh(new THREE.TorusGeometry(.022, .006, 6, 12, Math.PI), mat(col, .4)); h.position.set(.04, .05, 0); h.rotation.z = -Math.PI / 2; g.add(h);
  return g;
}
function chopsticks(parent, x, y, z){ const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); for (const dx of [-.008, .008]){ const c = cyl(.003, .003, .22, mat("#c8a46a", .6), dx, .005, 0, g, 6); c.rotation.x = Math.PI / 2; } return g; }
function plant(parent, x, y, z, s = 1){ const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); parent.add(g); cyl(.09, .07, .18, mat("#b5763f", .8), 0, .09, 0, g); for (let i = 0; i < 7; i++){ const l = sphere(.08, mat(i % 2 ? "#4f8f52" : "#3f7a46", .8), g, 10); l.position.set((hash(i) - .5) * .16, .26 + hash(i + 4) * .16, (hash(i + 8) - .5) * .16); l.scale.set(1, .7, 1); } return g; }
function laptop(parent, x, y, z, yaw = 0, glow = 0){
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; parent.add(g);
  box(.33, .015, .23, mat("#3a3f47", .4, .3), 0, .008, 0, g);
  const scr = new THREE.Group(); scr.position.set(0, .015, -.11); scr.rotation.x = -.25; g.add(scr);
  box(.33, .22, .012, mat("#2d3138", .4, .3), 0, .11, 0, scr);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(.3, .19), new THREE.MeshStandardMaterial({ color: "#dfe9f5", emissive: "#bcd6ff", emissiveIntensity: .35 + glow, roughness: .3 })); s.position.set(0, .11, .007); scr.add(s);
  return g;
}
function monitor(parent, x, y, z, yaw = 0){
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw; parent.add(g);
  box(.16, .01, .14, mat("#2b2f36", .5), 0, .005, 0, g); box(.03, .22, .03, mat("#2b2f36", .5), 0, .12, -.03, g);
  box(.56, .34, .03, mat("#22262d", .4), 0, .38, 0, g);
  const s = new THREE.Mesh(new THREE.PlaneGeometry(.52, .3), new THREE.MeshStandardMaterial({ color: "#e4ecf5", emissive: "#c9dcf5", emissiveIntensity: .45, roughness: .3 })); s.position.set(0, .38, .016); g.add(s);
  return g;
}
function shelf(parent, x, z, yaw, w = 1.2, h = 1.8){
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; parent.add(g); const m = mat("#9c7d5a", .7);
  box(w, h, .03, m, 0, h / 2, -.15, g); box(.03, h, .32, m, -w / 2, h / 2, 0, g); box(.03, h, .32, m, w / 2, h / 2, 0, g);
  for (let r = 0; r < 4; r++){ box(w, .025, .3, m, 0, .05 + r * h / 4, 0, g);
    let bx = -w / 2 + .05; let i = 0; while (bx < w / 2 - .08){ const bw = .03 + hash(r * 50 + i) * .03, bh = .2 + hash(r * 70 + i) * .14;
      box(bw, bh, .2, mat(["#4c6a8c", "#8c5a4c", "#6c8c5a", "#c9a44c", "#5a5a7a", "#a0a4a8"][(r + i) % 6], .8), bx + bw / 2, .065 + r * h / 4 + bh / 2, 0, g); bx += bw + .005; i++; } }
  return g;
}

/* ---------------- 房間 ---------------- */
function room(s, o){
  const g = s.world; const W = o.w || 7, D = o.d || 6, H = 2.7; s.roomDims = { W, D, back: -D + 2.5 };
  const floorM = o.floor === "tile" ? new THREE.MeshStandardMaterial({ map: tileTex(), roughness: .6 }) : o.floor === "carpet" ? new THREE.MeshStandardMaterial({ map: carpetTex(), roughness: .95 }) : new THREE.MeshStandardMaterial({ map: woodTex(o.wood), roughness: .7 });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), floorM); fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0, -D / 2 + 2.5); fl.receiveShadow = true; g.add(fl);
  const wallM = new THREE.MeshStandardMaterial({ map: noiseTex(o.wall || "232,226,214", 8, o.wall), roughness: .95 });
  const back = -D + 2.5;
  // 後牆，留窗洞
  const win = o.window || { x: -1.4, w: 1.6, y: .85, h: 1.3 };
  const wl = win.x - win.w / 2 + W / 2, wr = W / 2 - (win.x + win.w / 2);
  box(wl, H, .1, wallM, -W / 2 + wl / 2, H / 2, back, g, false);
  box(wr, H, .1, wallM, W / 2 - wr / 2, H / 2, back, g, false);
  box(win.w, win.y, .1, wallM, win.x, win.y / 2, back, g, false);
  box(win.w, H - win.y - win.h, .1, wallM, win.x, (win.y + win.h + H) / 2, back, g, false);
  // 側牆與天花板
  box(.1, H, D, wallM, -W / 2, H / 2, back + D / 2, g, false);
  box(.1, H, D, wallM, W / 2, H / 2, back + D / 2, g, false);
  box(W, H, .1, wallM, 0, H / 2, back + D, g, false).castShadow = false;
  const ceil = box(W, .05, D, mat("#f2f0ea", .95), 0, H, back + D / 2, g, false); ceil.receiveShadow = false;
  box(W, .08, .02, mat("#d8d2c6", .8), 0, .04, back + .06, g, false);
  // 窗框與窗外
  const fm = mat("#f4f2ee", .6);
  box(win.w + .1, .06, .16, fm, win.x, win.y, back, g); box(win.w + .1, .06, .16, fm, win.x, win.y + win.h, back, g);
  box(.06, win.h, .16, fm, win.x - win.w / 2, win.y + win.h / 2, back, g); box(.06, win.h, .16, fm, win.x + win.w / 2, win.y + win.h / 2, back, g);
  box(.04, win.h, .06, fm, win.x, win.y + win.h / 2, back, g); box(win.w, .04, .06, fm, win.x, win.y + win.h * .55, back, g);
  box(win.w + .3, .04, .22, fm, win.x, win.y - .02, back + .08, g);
  const outM = new THREE.MeshBasicMaterial({ map: skyTex(o.hour, o.weather, o.season) });
  const out = new THREE.Mesh(new THREE.PlaneGeometry(win.w * 4.5, win.h * 3.2), outM); out.position.set(win.x, win.y + win.h / 2 + .3, back - 2.2); g.add(out); s.sky = out;
  s.winInfo = { x: win.x, y: win.y, w: win.w, h: win.h, back };
  s.winHot = new THREE.Mesh(new THREE.PlaneGeometry(win.w, win.h), new THREE.MeshBasicMaterial({ visible: false })); s.winHot.position.set(win.x, win.y + win.h / 2, back + .06); g.add(s.winHot);
  // 窗外的雨
  if (o.weather === "rain"){
    const n = 260, pos = new Float32Array(n * 6);
    for (let i = 0; i < n; i++){ const x = win.x + (Math.random() - .5) * win.w * 1.6, y = Math.random() * 3 + .2, z = back - .2 - Math.random() * 1.6; pos.set([x, y, z, x - .01, y - .12, z], i * 6); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#c9d8e6", transparent: true, opacity: .55 })); g.add(rain); s.rain = rain;
  }
  // 門
  if (o.door){ const d = o.door; const dg = new THREE.Group(); dg.position.set(d.x, 0, d.z); dg.rotation.y = d.yaw || 0; g.add(dg); s.doorObj = dg;
    box(.9, 2.05, .05, mat("#8a6a4a", .6), 0, 1.025, 0, dg); cyl(.025, .025, .06, mat("#c9c4b8", .3, .8), .36, 1.0, .04, dg, 10).rotation.x = Math.PI / 2;
    box(1.0, .06, .1, mat("#f4f2ee", .6), 0, 2.08, 0, dg); }
  return { W, D, H, back };
}
function pendant(s, x, y, z, warm = true, shadow = true){
  const g = s.world;
  cyl(.004, .004, 2.7 - y, mat("#333", .5), x, (2.7 + y) / 2, z, g, 6, false);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(.22, .18, 24, 1, true), new THREE.MeshStandardMaterial({ color: "#e9d9b8", roughness: .6, side: THREE.DoubleSide, emissive: "#ffcf80", emissiveIntensity: 0 })); shade.position.set(x, y + .06, z); g.add(shade);
  const bulb = sphere(.04, new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#ffd9a0", emissiveIntensity: 0 }), g, 12); bulb.position.set(x, y, z); bulb.castShadow = false;
  const L = new THREE.SpotLight(warm ? "#ffd2a0" : "#eef4ff", 0, 7, Math.PI / 2.6, .7, 1.6); L.position.set(x, y, z); L.target.position.set(x, 0, z); g.add(L); g.add(L.target);
  if (shadow){ L.castShadow = true; L.shadow.mapSize.set(s.q.shadow, s.q.shadow); L.shadow.bias = -.0008; L.shadow.radius = 4; }
  s.lamps.push({ L, shade, bulb, base: 30 });
}
function ceilingPanel(s, x, z, w = 1.2, d = .5){
  const m = new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#f4f8ff", emissiveIntensity: 0 });
  const p = box(w, .02, d, m, x, 2.68, z, s.world, false); p.castShadow = false;
  const pl = new THREE.PointLight("#f2f6ff", 0, 7, 1.7); pl.position.set(x, 2.5, z); s.world.add(pl);
  s.lamps.push({ L: pl, shade: p, bulb: null, base: 12, panel: true });
}

/* ---------------- 人物骨架 ---------------- */
const SKIN = "#d8b796", SKIN3 = "#c99d7d";
let SKIN_MAT = null; const SKIN_M = () => SKIN_MAT || (SKIN_MAT = new THREE.MeshStandardMaterial({ color: SKIN3, roughness: .7 }));
/* ---- 連續的身體：用一圈圈斷面做出肩膀、手肘、膝蓋的形狀，再讓骨架帶著網格變形 ---- */
const cmr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return .5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
function mixW(a, b, t){ const m = new Map(); for (const [i, w] of a) m.set(i, (m.get(i) || 0) + w * (1 - t)); for (const [i, w] of b) m.set(i, (m.get(i) || 0) + w * t);
  const arr = [...m.entries()].filter(e => e[1] > .001).sort((x, y) => y[1] - x[1]).slice(0, 4); const s = arr.reduce((q, e) => q + e[1], 0); return arr.map(([i, w]) => [i, w / s]); }
function smoothRings(tab, sub = 3){
  const out = [];
  for (let i = 0; i < tab.length - 1; i++){ const a = tab[i], b = tab[i + 1], a0 = tab[i - 1] || a, b1 = tab[i + 2] || b;
    const same = a.y === b.y && a.rx === b.rx; const n = same ? 1 : sub;
    for (let k = 0; k < n; k++){ const t = k / n, r = {}; for (const key of ["y", "x", "z", "rx", "rz"]) r[key] = cmr(a0[key], a[key], b[key], b1[key], t);
      r.rx = Math.max(.004, r.rx); r.rz = Math.max(.004, r.rz); r.w = mixW(a.w, b.w, t); r.col = t < .5 ? a.col : b.col; out.push(r); } }
  out.push(tab.at(-1)); return out;
}
function addSweep(D, tab, segs, capStart, capEnd, vw){
  const rings = smoothRings(tab); const base = D.pos.length / 3;
  const push = (x, y, z, r, sx, cz) => { D.pos.push(x, y, z); const ao = D.aoF && sx !== undefined ? D.aoF(sx, cz, y) : 1; D.col.push(r.col.r * ao, r.col.g * ao, r.col.b * ao);
    let w = r.w; const ex = vw && sx !== undefined ? vw(sx, cz, y) : null;
    if (ex && ex.length){ const e = ex.reduce((q, v) => q + v[1], 0); const m = new Map(); for (const [i, v] of w) m.set(i, (m.get(i) || 0) + v * (1 - e)); for (const [i, v] of ex) m.set(i, (m.get(i) || 0) + v);
      w = [...m.entries()].filter(v => v[1] > .001).sort((a, b) => b[1] - a[1]).slice(0, 4); const t = w.reduce((q, v) => q + v[1], 0); w = w.map(([i, v]) => [i, v / t]); }
    w = w.concat([[0, 0], [0, 0], [0, 0], [0, 0]]).slice(0, 4); D.si.push(...w.map(e => e[0])); D.sw.push(...w.map(e => e[1])); };
  for (const r of rings) for (let k = 0; k < segs; k++){ const a = k / segs * Math.PI * 2; push(r.x + Math.sin(a) * r.rx, r.y, r.z + Math.cos(a) * r.rz, r, Math.sin(a), Math.cos(a)); }
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < segs; k++){ const a = base + i * segs + k, b = base + i * segs + (k + 1) % segs, c = a + segs, d = b + segs;
    if (rings[i].y > rings[i + 1].y) D.idx.push(a, c, b, b, c, d); else D.idx.push(a, b, c, b, d, c); }
  const cap = (ri, flip) => { const r = rings[ri]; const ci = D.pos.length / 3; push(r.x, r.y, r.z, r); for (let k = 0; k < segs; k++){ const a = base + ri * segs + k, b = base + ri * segs + (k + 1) % segs; if (flip) D.idx.push(ci, b, a); else D.idx.push(ci, a, b); } };
  if (capStart) cap(0, rings[0].y < rings[1].y); if (capEnd) cap(rings.length - 1, rings.at(-1).y > rings.at(-2).y);
}
function makeBody(P, o){
  const fem = !!o.long, C = { s: new THREE.Color(o.col || "#5b6b7a"), p: new THREE.Color(o.pants || "#30353e"), k: new THREE.Color(SKIN3) };
  const old = P.older ? 1 : 0, wb = 1 + old * .09, W = P.shW;   // v0.24 肩膀：軀幹上緣加寬成肩頭，把手臂上端包進去   // v0.24 年長者：腰腹略寬
  const H = 0, S = 1, CH = 2, N = 3, HD = 4; const D = { pos: [], col: [], si: [], sw: [], idx: [] };
  const R = (y, x, z, rx, rz, w, c) => ({ y, x, z, rx, rz, w, col: C[c] });
  const hx = fem ? 1.07 : 1, cx = fem ? .93 : 1, cz = fem ? .012 : 0;
  // v0.24 假的環境遮蔽：腋下、胸下、領口下、下巴下稍暗，讓衣服和身體有起伏
  D.aoF = (sx, cz, y) => { let a = 1; const side = Math.abs(sx);
    a -= .1 * Math.max(0, (side - .8) / .2) * Math.max(0, 1 - Math.abs(y - 1.25) / .05);
    a -= (fem ? .12 : .06) * Math.max(0, cz) * Math.max(0, 1 - Math.abs(y - 1.14) / .05);
    a -= .1 * Math.max(0, 1 - Math.abs(y - .99) / .025);
    a -= .07 * Math.max(0, cz) * Math.max(0, 1 - Math.abs(y - 1.452) / .03);
    a -= .12 * Math.max(0, cz) * Math.max(0, (y - 1.52) / .045);
    return a; };
  addSweep(D, [
    R(.80, 0, -.01, .11 * hx, .09, [[H, 1]], "p"), R(.86, 0, -.015, .152 * hx, .108, [[H, 1]], "p"), R(.93, 0, -.018, .162 * hx, .115, [[H, 1]], "p"),
    R(.985, 0, -.008, .148 * (fem ? .97 : 1), .103, [[H, .6], [S, .4]], "p"), R(.985, 0, -.008, .148 * (fem ? .97 : 1), .103, [[H, .6], [S, .4]], "s"),
    R(1.06, 0, -.002 + old * .01, .14 * (fem ? .9 : 1) * wb, .098 * wb, [[S, 1]], "s"), R(1.15, 0, .006, .15 * cx, .104 + cz * .5, [[S, .5], [CH, .5]], "s"),
    R(1.23, 0, .014, .162 * cx, .115 + cz, [[CH, 1]], "s"), R(1.27, 0, .012, .167 * cx, .115 + cz * .6, [[CH, 1]], "s"), R(1.30, 0, .01, .17 * cx, .112, [[CH, 1]], "s"), R(1.335, 0, .005, .165 * cx, .106, [[CH, 1]], "s"),
    R(1.365, 0, .0, .148 * cx, .098, [[CH, 1]], "s"), R(1.39, 0, -.006, .122 * cx, .086, [[CH, .9], [N, .1]], "s"), R(1.41, 0, -.008, .1, .076, [[CH, .7], [N, .3]], "s"), R(1.428, 0, -.004, .085, .067, [[CH, .45], [N, .55]], "s"),
    R(1.44, 0, -.002, .07, .066, [[CH, .3], [N, .7]], "s"), R(1.445, 0, -.002, .068, .064, [[CH, .3], [N, .7]], "s"), R(1.445, 0, -.002, .058, .056, [[CH, .3], [N, .7]], "k"),
    R(1.50, 0, .002, .053, .054, [[N, .85], [HD, .15]], "k"), R(1.565, 0, .01, .048, .05, [[N, .3], [HD, .7]], "k"),
  ], 22, true, false, (sx, cz, y) => { const ex = [];
    const sd = Math.max(0, (Math.abs(sx) - .55) / .45), hump = Math.max(0, 1 - Math.abs(y - 1.31) / .07);   // 肩膀外側跟著上臂動
    if (sd * hump > 0) ex.push([sx < 0 ? 6 : 10, .5 * sd * hump]);
    const sd2 = Math.max(0, (Math.abs(sx) - .15) / .85), hy = Math.max(0, Math.min(1, (.95 - y) / .14));       // 臀部下緣跟著大腿動
    if (sd2 * hy > 0) ex.push([sx < 0 ? 13 : 16, .45 * sd2 * hy]);
    return ex; });
  const arm = (side, shI) => { const ua = shI + 1, el = shI + 2, wr = shI + 3, x = side * P.shW; const sl = o.short ? "k" : "s";
    D.aoF = (sx, cz, y) => 1 - .1 * Math.max(0, -sx * side) * Math.max(0, (y - 1.2) / .14) - .1 * Math.max(0, cz) * Math.max(0, 1 - Math.abs(y - 1.07) / .03) - .04 * Math.max(0, 1 - Math.abs(y - .85) / .012);
    addSweep(D, [
      R(1.408, x - side * .04, -.004, .008, .009, [[CH, .9], [ua, .1]], "s"), R(1.398, x - side * .034, -.003, .028, .029, [[CH, .75], [ua, .25]], "s"),
      R(1.378, x - side * .022, -.001, .039, .04, [[CH, .5], [ua, .5]], "s"), R(1.345, x - side * .008, 0, .046, .048, [[CH, .25], [ua, .75]], "s"), R(1.3, x + side * .004, 0, .048, .05, [[CH, .05], [ua, .95]], "s"),
      R(1.22, x + side * .004, .003, .043, .046, [[ua, 1]], "s"), R(1.19, x + side * .003, .003, .041, .044, [[ua, 1]], sl),
      R(1.11, x, .001, .037, .039, [[ua, .75], [el, .25]], sl), R(1.06, x, -.002, .035, .037, [[ua, .5], [el, .5]], sl), R(1.0, x, .002, .037, .04, [[ua, .2], [el, .8]], sl),
      R(.94, x, .003, .036, .038, [[el, 1]], sl), R(.885, x, 0, .031, .03, [[el, 1]], sl), R(.865, x, 0, .033, .032, [[el, 1]], sl), R(.852, x, 0, .032, .031, [[el, 1]], sl), R(.852, x, 0, .026, .025, [[el, 1]], "k"),
      R(.815, x, 0, .024, .021, [[el, .4], [wr, .6]], "k"), R(.79, x, 0, .025, .02, [[wr, 1]], "k"), R(.77, x, 0, .026, .019, [[wr, 1]], "k"),
    ], 16, true, true); };
  arm(-1, 5); arm(1, 9);
  const leg = (side, thI) => { const kn = thI + 1, an = thI + 2, x = side * P.hipW;
    addSweep(D, [
      R(.97, x * .9, -.012, .078, .085, [[H, .75], [thI, .25]], "p"), R(.89, x, -.01, .088 * hx, .093, [[H, .35], [thI, .65]], "p"), R(.80, x, -.004, .083 * hx, .087, [[thI, 1]], "p"),
      R(.68, x * .98, .002, .071, .074, [[thI, 1]], "p"), R(.55, x * .96, .006, .058, .061, [[thI, .8], [kn, .2]], "p"), R(.47, x * .95, .008, .052, .056, [[thI, .5], [kn, .5]], "p"),
      R(.41, x * .95, .002, .053, .056, [[thI, .2], [kn, .8]], "p"), R(.31, x * .95, -.01, .055, .06, [[kn, 1]], "p"), R(.19, x * .95, -.004, .043, .044, [[kn, 1]], "p"),
      R(.09, x * .95, 0, .035, .036, [[kn, .8], [an, .2]], "p"), R(.04, x * .95, 0, .033, .034, [[kn, .5], [an, .5]], "p"),
    ], 16, false, true); };
  D.aoF = null; leg(-1, 13); leg(1, 16);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(D.pos, 3)); geo.setAttribute("color", new THREE.Float32BufferAttribute(D.col, 3));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(D.si, 4)); geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(D.sw, 4));
  geo.setIndex(D.idx); geo.computeVertexNormals();
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .78 }));
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
  return mesh;
}
function headGeo(hi){
  const key = hi ? "headGeoHi" : "headGeo"; if (TEX[key]) return TEX[key];
  let prof = [[0, .128], [.045, .124], [.074, .108], [.091, .082], [.098, .05], [.097, .018], [.091, -.012], [.08, -.04], [.064, -.066], [.044, -.086], [.022, -.098], [0, -.101]].map(([r, y]) => new THREE.Vector2(r, y)).reverse();
  if (hi) prof = new THREE.SplineCurve(prof).getPoints(44);
  const g = new THREE.LatheGeometry(prof, hi ? 96 : 40); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++){ let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    x *= .86 * (y < 0 ? lerp(1, .8, Math.min(1, -y / .1)) : 1);                       // 下顎收窄
    if (z < 0 && y > -.04) z *= 1.1;                                                   // 後腦較圓
    const f = Math.max(0, z / .098);                                                    // 臉的正面
    z += f * f * .012 * Math.exp(-((y - .045) ** 2) / .0004) * Math.exp(-(x * x) / .0035); // 眉骨
    z += f ** 3 * .016 * Math.exp(-((y + .005) ** 2) / .0011) * Math.exp(-(x * x) / .0004); // 鼻樑（不畫五官）
    if (y < -.03) z += f * .006;                                                        // 下巴略往前
    if (!hi){ const cheek = f * Math.exp(-((y + .02) ** 2) / .0012) * Math.exp(-((Math.abs(x) - .05) ** 2) / .0008); z += cheek * .005; x += Math.sign(x) * cheek * .003; } // 顴骨
    p.setXYZ(i, x, y, z); }
  g.computeVertexNormals(); return TEX[key] = g;
}
/* v0.24 頭髮：高解析度殼＋不規則髮際線＋髮束起伏＋髮絲貼圖 */
function hairGeo(long){
  const k = "hair" + !!long; if (TEX[k]) return TEX[k];
  const src = headGeo(true), pos = src.attributes.position, idx = [];
  const lineAt = (a, side) => { const A = Math.abs(a);
    let l = A < 1.1 ? .074 - .02 * Math.cos(a * 1.6) + .03 * (1 - Math.cos(a)) : A < 2.0 ? .035 - (A - 1.1) * .06 : (long ? -.1 : -.05);
    if (A < 1.0) l += .006 * Math.sin(a * 19 + 1) + .004 * Math.sin(a * 37) - (long ? .012 * Math.max(0, 1 - Math.abs(a - .25) / .35) : 0);   // 瀏海鋸齒、分線
    if (A > 2.3 && !long) l += .008 * Math.sin(a * 13);
    return l; };
  const keep = i => { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); return y > lineAt(Math.atan2(x, z)); };
  const ii = src.index.array;
  for (let t = 0; t < ii.length; t += 3) if (keep(ii[t]) && keep(ii[t + 1]) && keep(ii[t + 2])) idx.push(ii[t], ii[t + 1], ii[t + 2]);
  const g = src.clone(); g.setIndex(idx); const p = g.attributes.position; const n = src.attributes.normal;
  for (let i = 0; i < p.count; i++){ const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z);
    const crown = Math.max(0, y / .128), clump = .0028 * Math.sin(a * 11 + y * 40) + .0018 * Math.sin(a * 23 - y * 25);
    const off = .006 + crown * .004 + clump + (long ? .002 : 0);
    p.setXYZ(i, x + n.getX(i) * off, y + n.getY(i) * (off + .002), z + n.getZ(i) * off); }
  g.computeVertexNormals(); return TEX[k] = g;
}
function hairTex(){
  if (TEX.hairTex) return TEX.hairTex;
  const c = document.createElement("canvas"); c.width = 256; c.height = 256; const x = c.getContext("2d");
  x.fillStyle = "#c8c8c8"; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++){ const u = Math.random() * 256, w = .6 + Math.random() * 1.4, l = 150 + Math.random() * 105;
    x.strokeStyle = `rgba(${l},${l},${l},${.25 + Math.random() * .4})`; x.lineWidth = w; const e = Math.random() * 4 - 2; for (const o of [-256, 0, 256]){ x.beginPath(); x.moveTo(u + o, 0); x.bezierCurveTo(u + o + 3, 90, u + o - 3, 170, u + o + e, 256); x.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); t.colorSpace = THREE.SRGBColorSpace; return TEX.hairTex = t;
}
function hairMat(col, older){
  const k = col + "|" + !!older; TEX.hairM = TEX.hairM || {}; if (TEX.hairM[k]) return TEX.hairM[k];
  const c = new THREE.Color(col); if (older) c.lerp(new THREE.Color("#7d7873"), .12);
  return TEX.hairM[k] = new THREE.MeshStandardMaterial({ color: c, map: hairTex(), bumpMap: hairTex(), bumpScale: 1.2, roughness: .66, side: THREE.DoubleSide });
}
function makeHead(P, o){
  const skin = SKIN_M(), hair = hairMat(o.hair || "#22252b", P.older); const g = new THREE.Group(); P.head.add(g); P.headGroup = g;
  const hd = new THREE.Mesh(headGeo(), skin); hd.position.set(0, .025, .006); hd.castShadow = true; hd.receiveShadow = true; g.add(hd);
  for (const s of [-1, 1]){ const e = sphere(.021, skin, g, 10); e.castShadow = true; e.scale.set(.42, 1, .72); e.position.set(s * .083, .03, -.006); }
  const hr = new THREE.Mesh(hairGeo(o.long), hair); hr.position.copy(hd.position); hr.scale.set(1.02, 1.02, 1.03); hr.castShadow = true; g.add(hr);
  if (o.long){ const cg = new THREE.CylinderGeometry(.104, .118, .24, 40, 8, true, Math.PI * .42, Math.PI * 1.16); const cp = cg.attributes.position;
      for (let i = 0; i < cp.count; i++){ const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), a = Math.atan2(x, z), q = (.12 - y) / .24;
        const tip = q > .85 ? (Math.sin(a * 17) * .5 + .5) * .01 : 0; cp.setY(i, y + tip * (q > .97 ? 1 : 0)); cp.setX(i, x * (1 + .03 * Math.sin(a * 9 + y * 20))); cp.setZ(i, z * .78 - q * q * .02); }
      cg.computeVertexNormals(); const lh = new THREE.Mesh(cg, hair); lh.position.set(0, -.085, -.012); lh.castShadow = true; g.add(lh); }
}
function fingerGeo(L, r, flat = .82){
  // 一根手指＝一個連續的蒙皮網格，三節骨頭讓它彎；關節處只有輕微隆起，不會一節一節斷開
  const k = L.join(",") + r; TEX.fg = TEX.fg || {}; if (TEX.fg[k]) return TEX.fg[k];
  const tot = L.reduce((a, b) => a + b, 0), J1 = L[0], J2 = L[0] + (L[1] || 0), rt = r * .78, pts = [];
  for (let i = 0; i <= 6; i++){ const a = i / 6 * Math.PI / 2; pts.push(new THREE.Vector2(rt * Math.sin(a), -tot + rt * (1 - Math.cos(a)))); }
  const n = 14; for (let i = 1; i <= n; i++){ const d = tot - rt - (tot - rt) * i / n; const t = d / tot;
    const knob = .05 * (Math.exp(-((d - J1) ** 2) / .00002) + (L[2] ? Math.exp(-((d - J2) ** 2) / .00002) : 0));
    pts.push(new THREE.Vector2(r * (lerp(1, .8, t) + knob), -d)); }
  pts.push(new THREE.Vector2(r * .9, .004));
  const g = new THREE.LatheGeometry(pts, 10); const p = g.attributes.position, si = [], sw = [], w = .005;
  for (let i = 0; i < p.count; i++){ p.setZ(i, p.getZ(i) * flat); const d = -p.getY(i);
    let a = 0, b = 1, t = 0;
    if (d < J1 - w){ a = 0; t = 0; } else if (d < J1 + w){ a = 0; b = 1; t = (d - J1 + w) / (2 * w); }
    else if (!L[2] || d < J2 - w){ a = 1; b = L[2] ? 2 : 1; t = 0; } else if (d < J2 + w){ a = 1; b = 2; t = (d - J2 + w) / (2 * w); } else { a = 2; b = 2; t = 0; }
    si.push(a, b, 0, 0); sw.push(1 - t, t, 0, 0); }
  g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4)); g.computeVertexNormals();
  return TEX.fg[k] = g;
}
const HAND_M = () => TEX.handM || (TEX.handM = new THREE.MeshStandardMaterial({ color: new THREE.Color(SKIN3).multiplyScalar(.86), roughness: .72 }));
function makeFinger(parent, L, r, flat){
  const m = new THREE.SkinnedMesh(fingerGeo(L, r, flat), HAND_M()); m.castShadow = true; m.frustumCulled = false; parent.add(m);
  const bs = [new THREE.Bone()]; m.add(bs[0]); for (let i = 1; i < L.length; i++){ const b = new THREE.Bone(); b.position.y = -L[i - 1]; bs[i - 1].add(b); bs.push(b); }
  m.updateMatrixWorld(true); m.bind(new THREE.Skeleton(bs)); return bs;
}
function makeHand(wr, side){
  // v0.24 手：手掌＋四根連續彎曲的手指＋有肉的拇指根部
  const skin = HAND_M(); const g = new THREE.Group(); wr.add(g); g.rotation.y = -side * Math.PI / 2;
  const pg = new THREE.BoxGeometry(.025, .08, .07, 2, 4, 4); rbox(pg, .011); { const q = pg.attributes.position; for (let i = 0; i < q.count; i++){ const t = (q.getY(i) + .04) / .08; q.setZ(i, q.getZ(i) * lerp(1, .84, t)); q.setX(i, q.getX(i) * lerp(1, 1.12, t) - side * .002 * (1 - Math.abs(q.getZ(i)) / .035)); } pg.computeVertexNormals(); }
  const palm = new THREE.Mesh(pg, skin); palm.position.set(0, -.046, .002); palm.castShadow = true; g.add(palm);
  const F = [[.025, -.083, [.028, .02, .017], .0084], [.0085, -.086, [.031, .022, .018], .0087], [-.0075, -.084, [.029, .02, .017], .0082], [-.0225, -.079, [.022, .016, .014], .0071]];
  const fingers = F.map(([z, y, L, r], i) => { const k = new THREE.Group(); k.position.set(0, y, z); k.rotation.x = (1.5 - i) * .045; g.add(k); return makeFinger(k, L, r, .8); });
  const th = new THREE.Mesh(new THREE.SphereGeometry(.02, 12, 10), skin); th.scale.set(.8, 1.3, .9); th.position.set(-side * .006, -.034, .024); g.add(th);
  const tk = new THREE.Group(); tk.position.set(-side * .007, -.035, .033); tk.rotation.set(-.42, 0, -side * .22); g.add(tk);
  const thumb = makeFinger(tk, [.03, .02], .0098, .85);
  return { g, fingers, thumb, side, curl: .45, roll: 1 };
}
function rbox(geo, r){ const p = geo.attributes.position; geo.computeBoundingBox(); const b = geo.boundingBox, h = b.max.clone().sub(b.min).multiplyScalar(.5);
  for (let i = 0; i < p.count; i++){ const v = new V3(p.getX(i), p.getY(i), p.getZ(i)); const q = new V3(Math.max(-h.x + r, Math.min(h.x - r, v.x)), Math.max(-h.y + r, Math.min(h.y - r, v.y)), Math.max(-h.z + r, Math.min(h.z - r, v.z)));
    const d = v.clone().sub(q); if (d.lengthSq() > 1e-9) v.copy(q.add(d.setLength(r))); p.setXYZ(i, v.x, v.y, v.z); } geo.computeVertexNormals(); }
function curlHand(H, c, roll = 1){ H.curl += (c - H.curl) * .2; H.roll += (roll - H.roll) * .15; const k = H.curl;
  H.g.rotation.y = -H.side * Math.PI / 2 * H.roll;
  H.fingers.forEach((j, i) => { const ci = Math.min(1.25, k * (1 + i * .1)) + .08; j[0].rotation.z = -H.side * ci * .7; j[1].rotation.z = -H.side * ci * 1.0; j[2].rotation.z = -H.side * ci * .75; });
  H.thumb[0].rotation.z = H.side * k * .25; H.thumb[1].rotation.z = H.side * k * .45; }
const CUPLOC = side => new V3(-side * .05, -.05, .006);
function makeShoe(an){ const g = new THREE.Group(); an.add(g); const m = mat("#2a2a2a", .55);
  const up = sphere(.05, m, g, 16); up.scale.set(.92, .8, 1.95); up.position.set(0, -.008, .045);
  box(.08, .016, .22, mat("#1a1a1a", .7), 0, -.036, .046, g); }
/* v0.26 把現成模型接到原本的程序骨架：骨架照模型比例重設，動作照舊由原本系統算，每格把旋轉複製到模型上 */
const _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), _rv = new V3();
const RIG_COL = { shoes: "#2b2b2e" };
function buildRig(P, o, fem){
  const kit = fem ? KIT.female : KIT.male, model = SkeletonUtils.clone(kit.scene); P.root.add(model);
  const B = {}; let body, eyes; model.traverse(x => { if (x.isBone) B[x.name] = x; if (x.isSkinnedMesh){ if (x.name === kit.eyesName) eyes = x; else if (x.name === kit.bodyName) body = x; } });
  // 衣服：材質在像素層級上色、加皺褶
  const geo = kit.geo.clone(), n = geo.attributes.position.count;
  if (P.older){ const p = geo.attributes.position, bp = geo.attributes.bpos, J = kit.J; for (let i = 0; i < n; i++){ if (kit.armA[i] > .5) continue; const k0 = kit.kind[i]; if (k0 !== 1 && k0 !== 2) continue;   // 年長：小腹
      const y = bp.getY(i), z = bp.getZ(i), k = Math.max(0, 1 - Math.abs(y - (J.pelvis.y + .13)) / .12); if (k > 0 && z > J.spine_01.z - .02){ const d = .022 * k * Math.min(1, (z - J.spine_01.z + .02) / .08); p.setZ(i, p.getZ(i) + d); bp.setZ(i, z + d); } } geo.computeVertexNormals(); }
  body.geometry = geo; body.material = clothMaterial(kit, o); body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  if (eyes) eyes.visible = false;   // 不畫眼睛
  // 頭髮：綁到同一副骨架的 Head
  const hk = fem ? (hash((o.name || "").length * 7 + 3) < .5 ? KIT.hBuns : KIT.hLong) : (P.older || o.name === "me" || hash((o.name || "").length * 13 + 1) < .4 ? KIT.hBuzz : KIT.hShort);
  const hc = new THREE.Color(o.hair || "#22252b"); if (P.older) hc.lerp(new THREE.Color("#8a857f"), .18);
  const hm = new THREE.MeshStandardMaterial({ color: hc, map: hk.map, normalMap: hk.nmap, roughness: .55, side: THREE.DoubleSide });
  const hair = new THREE.SkinnedMesh(hk.geo, hm); hair.castShadow = true; hair.frustumCulled = false; body.parent.add(hair);
  hair.bind(new THREE.Skeleton(hk.names.map(nm => B[nm]), hk.inverses.map(m => m.clone())), hk.BM.clone());
  P.root.updateMatrixWorld(true);
  const W = nm => P.root.worldToLocal(B[nm].getWorldPosition(new V3()));
  const sOf = sd => (W("upperarm_l").x < 0) === (sd < 0) ? "l" : "r";
  // 手指彎曲軸（T 字姿勢時掌心朝下）
  const fing = [], down = new V3(0, -1, 0);
  for (const sd of [-1, 1]){ const c = sOf(sd);
    for (const f of ["index", "middle", "ring", "pinky", "thumb"]) for (let j = 1; j <= 3; j++){ const b = B[`${f}_0${j}_${c}`], ch = B[`${f}_0${j + 1}_${c}`] || B[`${f}_04_leaf_${c}`]; if (!b || !ch) continue;
      const dir = ch.getWorldPosition(new V3()).sub(b.getWorldPosition(new V3())).normalize(), ax = dir.clone().cross(down).normalize().applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert());
      fing.push({ b, ax, rest: b.quaternion.clone(), k: f === "thumb" ? [.25, .45, .35][j - 1] : [.8, 1.1, .75][j - 1], side: sd < 0 ? "L" : "R", tf: f === "thumb" ? [-.75, -.25, 0][j - 1] : 0 }); } }
  // 手掌座標（T 字姿勢時掌心朝下）：掌心法線、手指方向，抓東西時用模型真正的手來定位
  const hf = {};
  for (const sd of [-1, 1]){ const c = sOf(sd), hb = B["hand_" + c], q0 = hb.getWorldQuaternion(new THREE.Quaternion()).invert();
    hf[sd < 0 ? "L" : "R"] = { hb, mid: B["middle_01_" + c], idx: B["index_01_" + c], pnk: B["pinky_01_" + c], th3: B["thumb_03_" + c], ix2: B["index_02_" + c], ua: B["upperarm_" + c], la: B["lowerarm_" + c], tip: B["middle_04_leaf_" + c] || B["middle_03_" + c], ttip: B["thumb_04_leaf_" + c] || B["thumb_03_" + c],
      xtra: [[B["index_04_leaf_" + c], .008], [B["ring_04_leaf_" + c], .008], [B["pinky_04_leaf_" + c], .007], [B["pinky_03_" + c], .009], [B["ring_03_" + c], .01], [B["thumb_02_" + c], .014], [B["thumb_01_" + c], .018]].filter(e => e[0]),
      nL: new V3(0, -1, 0).applyQuaternion(q0), fL: B["middle_01_" + c].getWorldPosition(new V3()).sub(hb.getWorldPosition(new V3())).normalize().applyQuaternion(q0) }; }
  // 1. 原本骨架改成模型的比例
  const pel = W("pelvis"), s1 = W("spine_01"), s3 = W("spine_03"), nk = W("neck_01"), hd = W("Head");
  P.spine.position.set(0, s1.y - pel.y, 0); P.chest.position.set(0, s3.y - s1.y, 0); P.neck.position.set(0, nk.y - s3.y, 0); P.head.position.set(0, hd.y - nk.y, 0);
  for (const [A, sd] of [[P.armL, -1], [P.armR, 1]]){ const c = sOf(sd), ua = W("upperarm_" + c), la = W("lowerarm_" + c), ha = W("hand_" + c);
    A.sh.position.set(ua.x, ua.y - s3.y, 0); A.len = [ua.distanceTo(la), la.distanceTo(ha)]; A.el.position.set(0, -A.len[0], 0); A.wr.position.set(0, -A.len[1], 0); }
  for (const [Lg, sd] of [[P.legL, -1], [P.legR, 1]]){ const c = sOf(sd), th = W("thigh_" + c), ca = W("calf_" + c), ft = W("foot_" + c);
    Lg.th.position.set(th.x, th.y - pel.y, 0); Lg.len = [th.distanceTo(ca), ca.distanceTo(ft), ft.y]; Lg.kn.position.set(0, -Lg.len[0], 0); Lg.an.position.set(0, -Lg.len[1], 0); }
  P.standHip = P.legL.len[0] + P.legL.len[1] + P.legL.len[2] - P.legL.th.position.y; P.hips.position.set(0, P.standHip, 0);
  for (const b of [P.hips, P.spine, P.chest, P.neck, P.head, P.armL.ua, P.armL.el, P.armL.wr, P.armR.ua, P.armR.el, P.armR.wr, P.legL.th, P.legL.kn, P.legL.an, P.legR.th, P.legR.kn, P.legR.an]) b.rotation.set(0, 0, 0);
  P.root.updateMatrixWorld(true);
  // 2. 對應表：[原骨頭, 模型骨頭, 原子節點, 模型子骨頭, 手的左右]
  const M = [[P.hips, "pelvis"], [P.spine, "spine_01", P.chest, "spine_03"], [P.chest, "spine_03", P.neck, "neck_01"], [P.neck, "neck_01", P.head, "Head"], [P.head, "Head"]];
  for (const [A, sd] of [[P.armL, -1], [P.armR, 1]]){ const c = sOf(sd); M.push([A.ua, "upperarm_" + c, A.el, "lowerarm_" + c], [A.el, "lowerarm_" + c, A.wr, "hand_" + c], [A.wr, "hand_" + c, null, "middle_01_" + c, sd]); }
  for (const [Lg, sd] of [[P.legL, -1], [P.legR, 1]]){ const c = sOf(sd); M.push([Lg.th, "thigh_" + c, Lg.kn, "calf_" + c], [Lg.kn, "calf_" + c, Lg.an, "foot_" + c], [Lg.an, "foot_" + c]); }
  // 3. 模型從 T 字姿勢轉成原骨架的靜止姿勢（手臂下垂），記下兩邊的旋轉差
  const map = [];
  for (const [d, mn, dc, mc, sd] of M){ const m = B[mn]; if (!m) continue;
    if (mc && B[mc] && /arm|hand|thigh|calf/.test(mn)){ const dd = (dc ? dc.getWorldPosition(new V3()) : d.localToWorld(new V3(0, -.1, 0))).sub(d.getWorldPosition(new V3())).normalize();
      const md = B[mc].getWorldPosition(new V3()).sub(m.getWorldPosition(new V3())).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(md, dd), wq = m.getWorldQuaternion(new THREE.Quaternion()).premultiply(q);
      m.quaternion.copy(m.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq)); m.updateMatrixWorld(true); }
    const off = d.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(m.getWorldQuaternion(new THREE.Quaternion()));
    const pos = mn === "pelvis" ? d.worldToLocal(m.getWorldPosition(new V3())) : null;
    map.push({ d, m, off, pos, palm: sd ? (sd < 0 ? "L" : "R") : null }); }
  // 4. 藏起原本的程序人形（骨架仍在）
  P.body.visible = false; P.headGroup.visible = false; for (const H of Object.values(P.handM)) H.g.visible = false;
  for (const Lg of [P.legL, P.legR]) Lg.an.children.forEach(c => { if (!c.isBone) c.visible = false; });
  // 坐姿貼合用：主要綁在骨盆／大腿上的頂點（之後用來量屁股、大腿底面離椅面多高）
  const seatIdx = [], bones = body.skeleton.bones, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  for (let i = 0; i < n; i++){ let w = 0; const ix = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)], ww = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
    for (let k = 0; k < 4; k++) if (/thigh|pelvis/.test(bones[ix[k]]?.name || "")) w += ww[k]; if (w > .6) seatIdx.push(i); }
  return { model, map, fing, hf, headBone: B.Head, body, seatIdx };
}
function syncRig(P){
  const R = P.rig; if (!R) return; P.root.updateMatrixWorld(true);
  for (const e of R.map){ const { d, m } = e; d.getWorldQuaternion(_rq);
    if (e.palm){ const H = P.handM[e.palm]; _rq2.setFromAxisAngle(_rv.set(0, 1, 0), -H.side * Math.PI / 2 * H.roll); _rq.multiply(_rq2); }
    _rq.multiply(e.off); m.parent.getWorldQuaternion(_rq2).invert(); m.quaternion.copy(_rq2.multiply(_rq));
    if (e.pos){ const w = d.localToWorld(e.pos.clone()); m.position.copy(m.parent.worldToLocal(w)); }
    m.updateMatrixWorld(true);
    if (e.palm && P.handM[e.palm].flex > .01){ const F = R.hf[e.palm], wq = m.getWorldQuaternion(new THREE.Quaternion()), f = F.fL.clone().applyQuaternion(wq);   // 手腕往上翻，手掌接近水平（抓桌上東西時不會插進桌面）
      const f2 = new V3(f.x, f.y * (1 - .85 * Math.min(1, P.handM[e.palm].flex)) - .06 * Math.max(0, P.handM[e.palm].flex - 1), f.z).normalize(); wq.premultiply(new THREE.Quaternion().setFromUnitVectors(f, f2));
      m.quaternion.copy(m.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq)); m.updateMatrixWorld(true); } }
  for (const f of R.fing){ const H = P.handM[f.side], c = H.curl * f.k * (window.__fs ?? 1) + f.tf * (H.tflat || 0); f.b.quaternion.copy(f.rest).multiply(_rq.setFromAxisAngle(f.ax, c)); }
}
function rigHand(P, side){ const F = P.rig.hf[side], q = F.hb.getWorldQuaternion(new THREE.Quaternion());
  const c = F.hb.getWorldPosition(new V3()).add(F.mid.getWorldPosition(new V3())).add(F.idx.getWorldPosition(new V3())).add(F.pnk.getWorldPosition(new V3())).multiplyScalar(.25);
  return { c, n: F.nL.clone().applyQuaternion(q), f: F.fL.clone().applyQuaternion(q), pinch: F.th3.getWorldPosition(new V3()).lerp(F.ix2.getWorldPosition(new V3()), .5) }; }
// 桌面、櫃台：手要停在上面，不能插進去
function collectSurfaces(s){ const out = [], skip = new Set(); for (const P of [...s.people.values(), s.me, ...(s.npcList || [])]) if (P?.root) P.root.traverse(o => skip.add(o));
  s.world.updateMatrixWorld(true);
  s.world.traverse(o => { if (!o.isMesh || o.isSkinnedMesh || skip.has(o) || o.geometry?.type !== "BoxGeometry" || o.userData.person) return; let pp = false; o.traverseAncestors(a => { if (a.userData?.person) pp = true; }); if (pp) return;
    const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld), sz = bb.getSize(new V3());
    if (sz.x < .25 || sz.z < .25 || sz.x > 3.2 || sz.z > 3.2 || bb.max.y < .6 || bb.max.y > 1.25) return;
    out.push({ inv: o.matrixWorld.clone().invert(), lb: g.boundingBox.clone(), top: bb.max.y, bot: bb.min.y }); });
  // 桌上的小東西（杯子、碗、筆電⋯）：手放桌上時要避開
  s.props = []; s.world.traverse(o => { if (!o.isMesh || o.isSkinnedMesh || skip.has(o)) return; let pp = false; o.traverseAncestors(a => { if (a.userData?.person) pp = true; }); if (pp || !o.visible) return;
    const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); const bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld), sz = bb.getSize(new V3());
    if (Math.max(sz.x, sz.z) > .45 || sz.y > .4 || sz.y < .005) return; if (out.some(T => Math.abs(bb.min.y - T.top) < .03)) s.props.push(bb); });
  return out; }
function surfPen(P, sd){ const S = P.s.surfaces; if (!S || !S.length) return 0; const F = P.rig.hf[sd], h = rigHand(P, sd), hp = F.hb.getWorldPosition(new V3());
  const pts = [[h.c.clone().addScaledVector(h.n, .017), .002], [h.c.clone().addScaledVector(h.n, -.017), .002], [F.tip.getWorldPosition(new V3()), .009], [F.ttip.getWorldPosition(new V3()), .009],
    [F.mid.getWorldPosition(new V3()), .016], [F.idx.getWorldPosition(new V3()), .014], [F.pnk.getWorldPosition(new V3()), .014], [F.la.getWorldPosition(new V3()).lerp(hp, .62), .032], [hp, .026], ...F.xtra.map(([b, r]) => [b.getWorldPosition(new V3()), r])];
  let up = 0, dn = 0; const l = new V3();
  for (const T of S){ const under = hp.y < (T.top + T.bot) / 2 && h.c.y < T.top;   // 手掌中心在桌面下：往下躲；在上面：往上抬
    for (const [pi, [p, r]] of pts.entries()){ l.copy(p).applyMatrix4(T.inv); if (l.x < T.lb.min.x - .004 || l.x > T.lb.max.x + .004 || l.z < T.lb.min.z - .004 || l.z > T.lb.max.z + .004) continue;
      if (under){ if (p.y - r < T.top) dn = Math.max(dn, p.y + r - T.bot); } else if (p.y + r > T.bot - .06){ const u = T.top + r - p.y; if (u > up){ up = u; if (window.__penDbg) P._penI = pi; } } } }
  return up > .0008 ? up : dn > .0008 ? -dn : 0; }
// 躺床：被子依身體形狀蓋上去（從身體高度圖做出一塊有起伏、邊緣垂下床的布）
function drapeBlanket(s, P){ const B = s.blanket; if (!B || !P.rig) return; const D = B.userData.bed, nx = 40, nz = 52, x0 = D.x - .62, x1 = D.x + .62, z0 = D.z0, z1 = D.z1 + .2;
  const H = new Float32Array((nx + 1) * (nz + 1)).fill(D.top + .022), b = P.rig.body, v = new V3(); b.skeleton.update(); P.root.updateMatrixWorld(true);
  const pos = b.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++){ b.getVertexPosition(i, v); v.applyMatrix4(b.matrixWorld); if (v.z < z0 - .05 || v.z > z1 || v.y > D.top + .55) continue;
    const gx = Math.round((v.x - x0) / (x1 - x0) * nx), gz = Math.round((v.z - z0) / (z1 - z0) * nz); if (gx < 0 || gx > nx || gz < 0 || gz > nz) continue; const k = gz * (nx + 1) + gx; H[k] = Math.max(H[k], v.y + .02); }
  // 布有厚度、會撐開：先擴張再模糊幾次
  const R0 = H.slice();
  for (let pass = 0; pass < 6; pass++){ const T = H.slice(); for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++){ let m = T[z * (nx + 1) + x], sum = 0, c = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++){ const xx = x + dx, zz = z + dz; if (xx < 0 || xx > nx || zz < 0 || zz > nz) continue; const h = T[zz * (nx + 1) + xx]; if (pass < 2) m = Math.max(m, h - .012); sum += h; c++; }
      H[z * (nx + 1) + x] = pass < 2 ? m : Math.max(T[z * (nx + 1) + x] * .35 + sum / c * .65, D.top + .022); } }
  for (let i = 0; i < H.length; i++) H[i] = Math.max(H[i], R0[i] + .004);   // 腳尖等尖端不能被模糊掉而穿出來
  const g = new THREE.PlaneGeometry(1, 1, nx, nz), p = g.attributes.position, hw = D.w / 2 + .01;
  for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++){ const i = z * (nx + 1) + x; let wx = x0 + (x1 - x0) * x / nx, wz = z0 + (z1 - z0) * z / nz, wy = H[i];
    const ox = Math.abs(wx - D.x) - hw, oz = wz - (D.foot + .01); if (ox > 0){ wy = Math.min(wy, D.top + .022) - ox * 1.6; wx = D.x + Math.sign(wx - D.x) * (hw + ox * .12); }   // 兩側垂下
    if (oz > 0){ wy -= oz * 1.6; wz = D.foot + .01 + oz * .12; }   // 床尾垂下
    p.setXYZ(i, wx, wy, wz); }
  g.computeVertexNormals(); const m = new THREE.Mesh(g, B.material); m.material.side = THREE.DoubleSide; m.castShadow = m.receiveShadow = true; B.parent.add(m); B.visible = false; if (s.blanketMesh) s.blanketMesh.parent?.remove(s.blanketMesh); s.blanketMesh = m; }
// 坐姿：量屁股（後段）與大腿（前段）底面離椅面的高度
function seatGap(P, top){ const R = P.rig, b = R.body, v = new V3(); b.skeleton.update(); let rear = 9, front = 9;
  for (const i of R.seatIdx){ b.getVertexPosition(i, v); v.applyMatrix4(b.matrixWorld); const l = P.root.worldToLocal(v.clone()); if (Math.abs(l.x) > .24) continue;
    if (l.z > -.09 && l.z < .04) rear = Math.min(rear, v.y); else if (l.z > .1 && l.z < .24) front = Math.min(front, v.y); }
  return [rear - top, front - top]; }
class Person {
  constructor(s, o){
    this.s = s; this.name = o.name; this.o = o;
    const root = this.root = new THREE.Group(); root.userData.person = true; s.world.add(root);
    const fem = !!o.long; const B = () => new THREE.Bone(); this.older = o.older ?? /媽|爸|母|父|阿嬤|阿公|奶奶|爺爺|外婆|外公|主管|老闆|經理|教授|老師|伯|叔|姑|阿姨|舅/.test(o.name || "");
    this.shW = fem ? .172 : .184; this.hipW = fem ? .1 : .095;
    this.hips = B(); this.hips.position.y = .92; root.add(this.hips);
    this.spine = B(); this.hips.add(this.spine);
    this.chest = B(); this.chest.position.y = .2; this.spine.add(this.chest);
    this.neck = B(); this.neck.position.y = .3; this.chest.add(this.neck);
    this.head = B(); this.head.position.y = .12; this.neck.add(this.head);
    const arm = side => { const sh = B(); sh.position.set(side * this.shW, .23, 0); this.chest.add(sh); const ua = B(); sh.add(ua); const el = B(); el.position.y = -.28; ua.add(el); const wr = B(); wr.position.y = -.26; el.add(wr); return { sh, ua, el, wr }; };
    this.armL = arm(-1); this.armR = arm(1);
    const leg = side => { const th = B(); th.position.set(side * this.hipW, -.03, 0); this.hips.add(th); const kn = B(); kn.position.y = -.44; th.add(kn); const an = B(); an.position.y = -.43; kn.add(an); return { th, kn, an }; };
    this.legL = leg(-1); this.legR = leg(1);
    root.updateMatrixWorld(true);
    const body = makeBody(this, o); root.add(body); root.updateMatrixWorld(true);
    const A = this.armL, Bb = this.armR, L = this.legL, R2 = this.legR;
    body.bind(new THREE.Skeleton([this.hips, this.spine, this.chest, this.neck, this.head, A.sh, A.ua, A.el, A.wr, Bb.sh, Bb.ua, Bb.el, Bb.wr, L.th, L.kn, L.an, R2.th, R2.kn, R2.an]));
    this.body = body;
    makeHead(this, o); this.handM = { L: makeHand(A.wr, -1), R: makeHand(Bb.wr, 1) }; makeShoe(L.an); makeShoe(R2.an);
    root.scale.setScalar(o.scale || (fem ? .96 : 1));
    if (KIT.ok && !o.proc) this.rig = buildRig(this, o, fem);
    // 動作狀態
    this.seat = null; this.state = "seated"; this.sitT = 0; this.path = []; this.yaw = 0; this.speed = .95; this.phase = 0;
    this.hand = { L: new V3(-.16, .77, .34), R: new V3(.16, .77, .34) }; this.handV = { L: new V3(), R: new V3() };
    this.look = new V3(0, 1.1, 2); this.lookCur = { yaw: 0, pitch: 0 }; this.lean = 0; this.leanV = 0; this.turn = 0;
    this.gest = null; this.speaking = false; this.thinking = false; this.pose = "normal"; this.leave = false; this.gone = false;
    this.nextFidget = 2 + Math.random() * 4; this.fidget = null; this.beatAt = 0; this.beat = new V3(); this.held = null; this.idle = o.idle || null; this.seed = Math.random() * 100;
  }
  sitAt(seat){ this.restTop = undefined; this.restDx = null; this.seat = seat; this.root.position.copy(seat.pos); this.yaw = seat.yaw; this.root.rotation.y = this.yaw; this.state = "seated"; this.sitT = 0; }
  standAt(pos, yaw){ this.root.position.copy(pos); this.yaw = yaw; this.root.rotation.y = yaw; this.state = "standing"; this.sitT = 1; }
  local(v){ return this.root.localToWorld(v.clone()); }
  headWorld(){ return this.head.getWorldPosition(new V3()); }
  walkTo(points, done){ this.path = points.map(p => p.clone()); this.onArrive = done; if (this.state === "seated") this.rise(() => { this.state = "walking"; }); else this.state = "walking"; }
  rise(done){ this.state = "rising"; this.onRisen = done; this.s.sound("chair"); if (this.seat?.chair) this.seat.chairOut = true; }
  sitDown(){ if (!this.seat) return; this.state = "sitting"; this.s.sound("chair"); }
  update(dt, t){
    const s = this.s; if (this.gone) return;
    const fwd = new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    // ---- 坐下 / 起身 ----
    if (this.state === "rising"){ this.sitT = Math.min(1, this.sitT + dt / .9); if (this.sitT >= 1){ this.state = "standing"; const f = this.onRisen; this.onRisen = null; f && f(); } }
    if (this.state === "sitting"){
      const target = this.seat.pos; const d = target.clone().sub(this.root.position); d.y = 0;
      this.yaw += angDiff(this.yaw, this.seat.yaw) * Math.min(1, dt * 6);
      if (Math.abs(angDiff(this.yaw, this.seat.yaw)) < .08){ this.sitT = Math.max(0, this.sitT - dt / .9); this.seat.chairOut = this.sitT > .3; if (this.sitT <= 0){ this.state = "seated"; } }
    }
    // ---- 走路 ----
    let walking = false;
    if (this.state === "walking"){
      const tgt = this.path[0];
      if (!tgt){ this.state = "standing"; const f = this.onArrive; this.onArrive = null; f && f(); }
      else {
        const d = tgt.clone().sub(this.root.position); d.y = 0; const dist = d.length();
        const want = Math.atan2(d.x, d.z); this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * 5);
        if (Math.abs(angDiff(this.yaw, want)) < .7){ const step = Math.min(dist, this.speed * dt); this.root.position.addScaledVector(d.normalize(), step); walking = true;
          const prev = Math.sin(this.phase); this.phase += Math.PI * 2 * step / 1.25; if (Math.sign(Math.sin(this.phase)) !== Math.sign(prev)) s.sound("step"); }
        if (dist < .05) this.path.shift();
      }
    }
    if (this.state === "standing" && this.faceYaw !== undefined) this.yaw += angDiff(this.yaw, this.faceYaw) * Math.min(1, dt * 4);
    this.root.rotation.y = this.yaw + (this.state === "seated" ? this.turn : 0);
    // 坐下時人在椅子前，站起來時往前一點
    const st = ease(this.sitT);
    if (this.seat && (this.state === "seated" || this.state === "rising" || this.state === "sitting")){
      const sf = new V3(Math.sin(this.seat.yaw), 0, Math.cos(this.seat.yaw));
      if (this.state !== "sitting") this.root.position.copy(this.seat.pos).addScaledVector(sf, -.08 * st);
      else this.root.position.lerp(this.seat.pos.clone().addScaledVector(sf, -.08 * st), Math.min(1, dt * 6));
    }
    if (this.seat?.chair){ const out = this.seat.chairOut ? .45 : 0; const cb = this.seat.chairBase; const cf = new V3(Math.sin(this.seat.yaw), 0, Math.cos(this.seat.yaw));
      this.seat.chair.position.lerp(cb.clone().addScaledVector(cf, -out), Math.min(1, dt * 5)); }
    // ---- 身體 ----
    const breath = Math.sin(t * 1.7 + this.seed);
    const ph = this.phase;
    // v0.24 坐高：骨盆放在椅面上方（臀部厚度約 11cm），大腿微微往下斜讓腳踩到地，不再陷進椅子
    const LT = this.legL.len ? this.legL.len[0] : .44, LS = this.legL.len ? this.legL.len[1] + this.legL.len[2] + .005 : .476, TY = this.legL.th.position.y;
    const seatTop = this.seat?.sofa ? .43 : this.seat?.h ?? .474, hs = seatTop + (this.rig ? .1 + (this.seatDy || 0) : .115), sa = Math.asin(clamp((hs + TY - LS) / LT, -.3, .5));
    this.hips.position.y = lerp(hs, this.standHip || .92, st) + (walking ? Math.abs(Math.cos(ph)) * .02 - .01 : 0);
    const seatedLegs = [-Math.PI / 2 + sa, Math.PI / 2 - sa - .04];
    const setLeg = (L, th, kn, ank = 0) => { L.th.rotation.x = th; L.kn.rotation.x = kn; L.an.rotation.x = -(th + kn) + ank; };
    const gait = q => { const s1 = Math.sin(q); const swing = Math.max(0, Math.sin(q - 1.95)); return [.38 * s1, .1 + .88 * swing * swing, s1 > 0 ? -.12 * s1 : .25 * -s1 * (1 - swing)]; };
    if (walking){ const a = gait(ph), b = gait(ph + Math.PI);
      setLeg(this.legL, lerp(seatedLegs[0], a[0], st), lerp(seatedLegs[1], a[1], st), a[2] * st); setLeg(this.legR, lerp(seatedLegs[0], b[0], st), lerp(seatedLegs[1], b[1], st), b[2] * st); }
    else { const w8 = this.state === "standing" ? (Math.sin(t * .33 + this.seed) + 1) / 2 : 0;
      setLeg(this.legL, lerp(seatedLegs[0], .02 + .04 * w8, st), lerp(seatedLegs[1], .03 + .1 * w8, st)); setLeg(this.legR, lerp(seatedLegs[0], .02 + .04 * (1 - w8), st), lerp(seatedLegs[1], .03 + .1 * (1 - w8), st));
      if (this.state === "seated"){ const k2 = Math.sin(t * .21 + this.seed) * .06; this.legL.kn.rotation.x += k2; this.legR.kn.rotation.x -= k2 * .7; this.legL.an.rotation.x -= k2; this.legR.an.rotation.x += k2 * .7; } }
    // 骨盆：走路時轉動與傾斜，站著時換重心
    const sway = this.state === "standing" && !walking ? (Math.sin(t * .33 + this.seed)) : 0;
    this.hips.rotation.y = walking ? Math.sin(ph) * .11 : 0; this.hips.rotation.z = walking ? Math.sin(ph) * .035 : sway * .025;
    this.hips.position.x = sway * .018;
    if (this.lying){ setLeg(this.legL, 0, .05); setLeg(this.legR, 0, .1); }
    // 手勢時間軸
    const g = this.gest && t - this.gest.t0 < this.gest.dur ? this.gest : null; if (!g && this.gest){ const fin = this.gest.end; this.gest = null; fin && fin(); }
    if (this.held && this.held.k && (!g || g.k !== this.held.k)){ const H = this.held; H.obj.position.copy(H.home); if (H.hq) H.obj.quaternion.copy(H.hq); else H.obj.quaternion.identity(); this.held = null; }   // 動作中斷時把東西放回原位
    const p = g ? (t - g.t0) / g.dur : 0; const env = g ? Math.sin(clamp(p, 0, 1) * Math.PI) : 0;
    // 傾身
    let lean = this.pose === "lean" ? .16 : 0; let nod = 0, shake = 0, tilt = 0, raise = 0;
    if (this.state === "rising" || this.state === "sitting") lean += Math.sin(st * Math.PI) * .45;
    if (this.thinking){ tilt = .18; }
    if (this.speaking && this.turnT0 !== undefined && t - this.turnT0 < .6){ const q = (t - this.turnT0) / .6; raise += Math.sin(q * Math.PI) * .018; lean += Math.sin(q * Math.PI) * .05; }
    if (g){ const k = g.k;
      if (k === "lean") lean += .25 * env; if (k === "head") { lean += .12 * env; nod += .35 * env; }
      if (k === "sigh"){ raise = Math.sin(p * Math.PI) * .03; nod += .2 * ease(p * 2) * (1 - ease((p - .6) * 3)); }
      if (k === "nod") nod += Math.max(0, Math.sin(p * Math.PI * 4)) * .22;
      if (k === "shake") shake += Math.sin(p * Math.PI * 6) * .35 * (1 - p);
      if (k === "look") this.lookAway = 1; if (k === "slam") lean += .12 * env; if (k === "point") lean += .1 * env;
      if (k === "phone") nod += .45 * env; if (k === "pour") lean += .3 * env;
      if (k === "ack") nod += Math.max(0, Math.sin(p * Math.PI * 2)) * .13;
      if (k === "tilt"){ tilt += .17 * env; lean -= .03 * env; }
      if (k === "laugh"){ lean -= .1 * env; nod -= .2 * env; raise = Math.abs(Math.sin(p * Math.PI * 8)) * .012 * env; }
      if (k === "cheer") nod -= .15 * env; }
    if (walking) lean += .05; if (this.state === "seated" && !this.speaking) lean += .05 + Math.sin(t * .17 + this.seed) * .03;
    // v0.24 情緒姿勢：反對時坐直往後、下巴抬高；鬆口時肩膀放鬆、微低頭；驚訝時往後一縮
    const PO = { cross: { lean: -.06, chin: -.07, drop: 0, br: 2.3 }, soft: { lean: .05, chin: .09, drop: .012, br: 1.3 }, startle: { lean: -.09, chin: -.04, drop: -.008, br: 2.6 }, away: { lean: .02, chin: .06, drop: .016, br: 1.5 }, lean: { lean: 0, chin: 0, drop: 0, br: 1.7 } }[this.pose] || { lean: 0, chin: 0, drop: 0, br: 1.7 };
    this.poseC = this.poseC || { lean: 0, chin: 0, drop: 0, br: 1.7 }; for (const k in PO) this.poseC[k] += (PO[k] - this.poseC[k]) * Math.min(1, dt * 1.5);
    if (this.state === "seated") lean += this.poseC.lean;
    // v0.24 說話節奏：觸發排好的小動作，衝量隨時間衰減
    this.imp = this.imp || { nod: 0, tilt: 0, lean: 0, down: 0 };
    if (this.speech){ for (const b of this.speech.beats) if (!b.done && t >= b.at){ b.done = true;
        if (b.k === "comma") this.imp.nod += .07; else if (b.k === "ask"){ this.imp.tilt += .14 * (this.seed % 2 > 1 ? 1 : -1); this.imp.lean += .07; } else if (b.k === "stress"){ this.imp.nod += .16; this.imp.lean += .05; } else if (b.k === "pause") this.imp.down += .14; else if (b.k === "start") this.imp.lean += .04; }
      if (t > this.speech.end + 1.5) this.speech = null; }
    for (const k in this.imp) this.imp[k] *= Math.exp(-dt * (k === "down" ? 1.6 : 4));
    lean += this.imp.lean; nod += this.imp.nod + this.imp.down; tilt += this.imp.tilt;
    this.attendC = (this.attendC || 0) + ((this.attend || 0) - (this.attendC || 0)) * Math.min(1, dt * 2); lean += this.attendC * .07;
    this.lean += (lean - this.lean) * Math.min(1, dt * 6);
    const breath2 = Math.sin(t * (this.poseC?.br || 1.7) + this.seed);
    this.spine.rotation.x = this.lean * .6 + breath2 * .012; this.chest.rotation.x = this.lean * .4;
    this.chest.position.y = .2 + raise + breath2 * .004;
    this.spine.rotation.z = walking ? Math.sin(ph) * .03 : Math.sin(t * .4 + this.seed) * .01;
    // ---- 視線 ----
    let lookTarget = this.look.clone();
    if (this.lookAway || this.pose === "away") lookTarget = this.local(new V3(1.6, 1.0, 1.0));
    if (this.fidget?.look) lookTarget = this.fidget.look;
    if (this.state === "walking" && this.path[0]) lookTarget = this.path[0].clone().setY(1.5);
    const lt = this.root.worldToLocal(lookTarget.clone()); const neckY = this.rig ? this.root.worldToLocal(this.neck.getWorldPosition(new V3())).y : lerp(1.05, 1.5, st);
    let yaw = Math.atan2(lt.x, lt.z), pitch = Math.atan2(neckY - lt.y, Math.hypot(lt.x, lt.z));
    yaw = clamp(yaw, -1.3, 1.3); pitch = clamp(pitch, -.5, .7);
    this.lookCur.yaw += (yaw - this.lookCur.yaw) * Math.min(1, dt * 5); this.lookCur.pitch += (pitch - this.lookCur.pitch) * Math.min(1, dt * 5);
    const ly = this.lookCur.yaw, lp = this.lookCur.pitch;
    this.chest.rotation.y = ly * .18 - this.hips.rotation.y * 1.1; this.chest.rotation.z = -this.hips.rotation.z * .8; this.neck.rotation.y = ly * .35; this.head.rotation.y = ly * .4 + shake;
    this.neck.rotation.x = lp * .4; this.head.rotation.x = lp * .5 + nod - this.lean * .5 + (this.poseC?.chin || 0); this.head.rotation.z = tilt + (this.speaking ? Math.sin(t * 5.3) * .04 : 0);
    if (this.lying){ this.neck.rotation.x = .28; this.head.rotation.x = .32; this.head.rotation.y *= .3; this.neck.rotation.y *= .3; }   // 躺著滑手機：頭靠枕頭、下巴微收看手機
    if (this.speaking){ const talking = !this.speech || t < this.speech.end; const a = talking ? 1 : .3; this.head.rotation.x += (Math.sin(t * 7.3) * .6 + Math.sin(t * 11.7 + 1.3) * .4) * .02 * a; }
    this.lookAway = 0;
    // ---- 手 ----
    const H = this.handTargets(t, st, walking, g, p);
    if (g && g.k === "sip" && this.gripFix) H.R.add(this.gripFix); else if (this.gripFix) this.gripFix.multiplyScalar(.9);
    for (const side of ["L", "R"]){
      const tgt = H[side], cur = this.hand[side], v = this.handV[side];
      const k = g && g.k === "slam" ? 26 : 9; const n = Math.ceil(dt / .008), h = dt / n;
      for (let i = 0; i < n; i++){ const acc = tgt.clone().sub(cur).multiplyScalar(k * k).addScaledVector(v, -2 * k); v.addScaledVector(acc, h); cur.addScaledVector(v, h); }
    }
    // 肩膀跟著手抬起來；比劃時掌心朝上
    const shY = lerp(.91, 1.35, st), shrug = g && g.k === "shrug" ? .035 * env : 0;
    const drop = this.poseC?.drop || 0; this.armL.sh.position.y = .23 + clamp((this.hand.L.y - shY) * .3, 0, .04) + shrug - drop; this.armR.sh.position.y = .23 + clamp((this.hand.R.y - shY) * .3, 0, .04) + shrug - drop;
    const palm = (this.speaking && this.pose !== "cross") || (g && g.k === "shrug") ? 1 : 0; this.palm = (this.palm || 0) + (palm - (this.palm || 0)) * Math.min(1, dt * 4);
    this.armR.wr.rotation.y = -this.palm * 1.1; this.armL.wr.rotation.y = (this.beatBoth || (g && g.k === "shrug") ? this.palm : 0) * 1.1;
    { const hold = this.held || (g && (g.k === "sip" || g.k === "pour")) ? 1 : 0; const open = this.palm, phone = g && g.k === "phone";
      const pinch = g && g.k === "chop" && this.rig; const rcR = this.onT?.R ? .1 : .42, rcL = this.onT?.L ? .1 : .42;   // 手平放桌上時手指只微彎
      if (this.palmGoal){ curlHand(this.handM.R, .62, 1); curlHand(this.handM.L, .62, 1); }
      else { curlHand(this.handM.R, pinch ? .55 : hold ? .95 : phone ? .7 : lerp(rcR, .12, open), pinch ? .35 : 1 - Math.max(hold, open)); curlHand(this.handM.L, lerp(rcL, .12, this.beatBoth ? open : 0), 1 - (this.beatBoth ? open : 0)); } }
    this.root.updateMatrixWorld(true);
    this.corrR = this.corrR || new V3(); const GW = this.rig ? this.grasp : null;
    if (!GW) this.corrR.multiplyScalar(Math.max(0, 1 - dt * 6));
    const fR = GW ? 1 : this.onT?.R ? 1.15 : 0, fL = this.onT?.L ? 1.15 : 0;   // 手放桌上時手掌放平
    this.handM.R.flex = (this.handM.R.flex || 0) + (fR - (this.handM.R.flex || 0)) * Math.min(1, dt * 6); this.handM.L.flex = (this.handM.L.flex || 0) + (fL - (this.handM.L.flex || 0)) * Math.min(1, dt * 6);
    for (const [H, w] of [[this.handM.L, fL && !GW ? 1 : 0], [this.handM.R, fR && !GW ? 1 : 0]]) H.tflat = (H.tflat || 0) + (w - (H.tflat || 0)) * Math.min(1, dt * 6);   // 手平放時大拇指收進手掌平面
    // v0.28 模型的肩膀和原骨架的肩膀不在同一點（差幾公分），手會比目標低、比目標近 → 每幀量差距補回去，讓模型的手真的到目標
    if (this.rig){ syncRig(this); for (const [A, sd] of [[this.armL, "L"], [this.armR, "R"]]) A.off = this.rig.hf[sd].ua.getWorldPosition(new V3()).sub(A.ua.getWorldPosition(new V3())); }
    this.corrP = this.corrP || { L: new V3(), R: new V3() };
    // 手的最終目標 = 動作目標 + 抓握修正 + 拿手機修正 + 桌面往上推
    const tgtOf = sd => { const v = this.hand[sd].clone().add(this.corrP[sd]); if (sd === "R") v.add(GW ? this.corrR.clone().multiplyScalar(GW.w) : this.corrR); v.y += (this.corrS ? this.corrS[sd] : 0); return v; };
    const solveSide = sd => this.solveArm(sd === "L" ? this.armL : this.armR, sd === "L" ? -1 : 1, this.local(tgtOf(sd)));
    solveSide("L"); solveSide("R");
    // v0.28 手不穿過桌面：手掌、指尖、手腕、前臂的最低點要在桌面上，不夠就把手往上抬
    if (this.rig){ if (!this.s.surfaces) this.s.surfaces = collectSurfaces(this.s); const cs = this.corrS || (this.corrS = { L: 0, R: 0 }), up = new V3(0, 1, 0);
      for (let it = 0; it < 4; it++){ syncRig(this); let moved = false;
        for (const sd of ["L", "R"]){ if (sd === "R" && GW && GW.w > .85) continue; const pen = surfPen(this, sd); let nv = cs[sd];
          if (it === 0) nv = nv > 0 ? Math.max(0, nv - dt * .25) : Math.min(0, nv + dt * .25);   // 慢慢放回原本位置，碰到桌子再推開
          nv = clamp(nv + pen * 1.05, -.25, .3); if (Math.abs(nv - cs[sd]) > .0003){ cs[sd] = nv; moved = true; solveSide(sd); } }
        if (!moved) break; } }
    // v0.28 兩手拿手機：讓模型的兩個掌心真的貼在手機兩側
    if (this.rig && this.palmGoal){
      for (let it = 0; it < 4; it++){ syncRig(this); let mx = 0;
        for (const sd of ["L", "R"]){ const err = this.palmGoal[sd].clone().sub(this.root.worldToLocal(rigHand(this, sd).c)); mx = Math.max(mx, err.length()); this.corrP[sd].add(err).clampLength(0, .25); solveSide(sd); }
        if (mx < .003) break; } }
    else for (const sd of ["L", "R"]) this.corrP[sd].multiplyScalar(Math.max(0, 1 - dt * 6));
    // v0.27 抓握：用模型真正的手掌位置迭代修正手腕目標，讓手確實落在物件上；拿著的物件跟著手走
    if (GW){ const at = () => { const h = rigHand(this, "R"); return GW.mode === "pinch" ? h.pinch : h.c.addScaledVector(h.n, GW.r + .013); };
      GW.pt = GW.pt.clone(); GW.pt.y += this.gripLift || 0;   // 手指會碰到桌面時，改握杯子高一點的地方
      for (let it = 0; it < 4; it++){ syncRig(this); const err = this.root.worldToLocal(GW.pt.clone()).sub(this.root.worldToLocal(at()));
        if (err.length() < .002 && GW.w > .99) break; this.corrR.add(err.multiplyScalar(1 / Math.max(.25, GW.w))).clampLength(0, .3);
        solveSide("R"); }
      syncRig(this); { const pen = surfPen(this, "R"); this.gripLift = clamp((this.gripLift || 0) + (pen > 0 ? pen : -Math.min(dt * .05, this.gripLift || 0)), 0, GW.mode === "pinch" ? .09 : .035); }
      const h = rigHand(this, "R");
      if (this.held && this.held.mode === "cyl"){ const o = this.held.obj, w = h.c.clone().addScaledVector(h.n, this.held.r + .013).add(new V3(0, -this.held.cy - (this.gripLift || 0), 0)); o.position.copy(o.parent.worldToLocal(w));
        const tilt = this.held.tilt || 0, toF = this.held.face ? this.held.face.clone().sub(w).setY(0).normalize() : null;
        if (toF && tilt > .001){ const ax = new V3(0, 1, 0).cross(toF).normalize(); const pq = o.parent.getWorldQuaternion(new THREE.Quaternion()).invert(); o.quaternion.copy(pq.multiply(new THREE.Quaternion().setFromAxisAngle(ax, tilt))); } else o.quaternion.identity(); }
      if (this.held && this.held.mode === "pinch"){ const o = this.held.obj, f2 = h.f.clone().add(new V3(0, -.45, 0)).normalize(), w = h.pinch.clone().addScaledVector(f2, .05);
        o.position.copy(o.parent.worldToLocal(w)); o.quaternion.copy(o.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), f2))); }
      this.grasp = null; } else if (this.gripLift) this.gripLift = Math.max(0, this.gripLift - dt * .1);
    // 握著的物件（沒有模型時的舊做法）
    if (!this.rig && (this.gripWant || this.held)){ this.handM.R.g.updateMatrixWorld(true); const at = this.handM.R.g.localToWorld(CUPLOC(1));
      if (this.gripWant){ const err = this.root.worldToLocal(this.gripWant.clone()).sub(this.root.worldToLocal(at.clone())); this.gripFix = (this.gripFix || new V3()).addScaledVector(err, Math.min(1, dt * 8)); this.gripFix.clampLength(0, .15); this.gripWant = null; }
      if (this.held) this.held.obj.position.copy(this.held.obj.parent.worldToLocal(at.add(new V3(0, -.045, 0)))); }
    // 小動作
    if (!g && this.state === "seated" && !this.speaking && !this.thinking && !this.idle && !(this.s.msg && this === this.s.me)){
      this.nextFidget -= dt;
      if (this.nextFidget < 0){ this.nextFidget = 4 + Math.random() * 6; const r = Math.random();
        if (r < .35 && this.cup) this.gesture("sip", 2.8);
        else if (r < .6) this.fidget = { look: this.local(new V3((Math.random() - .5) * 1.2, .75, .45)), until: t + 1.6 };
        else if (r < .8) this.gesture("adjust", 1.4);
        else this.fidget = { look: s.windowLook || this.local(new V3(-2, 1.4, 0)), until: t + 2.2 }; }
    }
    if (this.fidget && t > this.fidget.until) this.fidget = null;
    if (this.rig) syncRig(this);
    // v0.28 躺床：量背部最低點，讓身體剛好壓在床墊上；量好之後蓋被子
    if (this.rig && this.lying && (this.lieCal || 0) < 7){ const b = this.rig.body, v = new V3(), pos = b.geometry.attributes.position; b.skeleton.update(); let mn = 9;
      for (let i = 0; i < pos.count; i += 3){ b.getVertexPosition(i, v); v.applyMatrix4(b.matrixWorld); const l = this.root.worldToLocal(v.clone()); if (l.y < .55 || l.y > 1.5) continue; mn = Math.min(mn, v.y); }   // 只看骨盆到肩膀
      const top = this.s.blanket?.userData.bed?.top ?? .51; if (mn < 5) this.root.position.y += (top - .008 - mn) * .9; this.lieCal = (this.lieCal || 0) + 1; if (this.lieCal === 7) drapeBlanket(this.s, this); }
    // v0.28 坐姿貼合：剛坐穩時量幾次屁股、大腿離椅面的距離，調整骨盆高度（每個模型體型不同）
    if (this.rig && this.seat && this.state === "seated" && this.sitT === 0 && !this.seat.bed && (this.seatCal || 0) < 8){ const top = this.seat.sofa ? .43 : this.seat.h ?? .474;
      const [gr, gf] = seatGap(this, top); if (gr < 5){ let d = -(gr + .004); if (gf < -.012) d = Math.max(d, .004); this.seatDy = clamp((this.seatDy || 0) + d * .9, -.08, .05); } this.seatCal = (this.seatCal || 0) + 1; }
  }
  handTargets(t, st, walking, g, p){
    // v0.28 坐著的手：前面有桌子就平放在桌面上（高度由桌面碰撞決定），沒有桌子就放在大腿上
    if (this.restTop === undefined && this.rig && this.s.surfaces && this.state === "seated"){ const l = new V3(); this.restTop = null;
      for (let z = .12; z < .62 && this.restTop === null; z += .01) for (const T of this.s.surfaces){ l.copy(this.local(new V3(0, .8, z))).applyMatrix4(T.inv);
        if (l.x > T.lb.min.x && l.x < T.lb.max.x && l.z > T.lb.min.z && l.z < T.lb.max.z && T.top < 1){ this.restTop = T.top; this.restZ = z; } } }
    const rz = (this.restZ || .4) - .005;
    if (this.restTop && !this.restDx && this.s.props){ this.restDx = { L: 0, R: 0 };   // 手的位置避開桌上的杯子、碗；左右都找不到空位就放腿上
      const free = (x) => { for (const dz of [.04, .1, .15]){ const c = this.local(new V3(x, 0, rz + dz)); for (const b of this.s.props) if (c.x > b.min.x - .055 && c.x < b.max.x + .055 && c.z > b.min.z - .03 && c.z < b.max.z + .03 && b.max.y < this.restTop + .4) return false; } return true; };
      for (const [sd, sx] of [["L", -.16], ["R", .16]]){ let d = null; for (const o of [0, .04, -.04, .08, -.08, .12, -.12, .16]){ const x = sx + o * Math.sign(sx); if (Math.abs(x) < .05) continue; if (free(x)){ d = o * Math.sign(sx); break; } } this.restDx[sd] = d; } }
    const dxL = this.restDx?.L || 0, dxR = this.restDx?.R || 0;   // 手腕靠在桌緣，手掌在桌面上（前臂不會壓穿桌緣）
    const seatedRest = this.restHands || (this.restTop ? { L: this.restDx?.L === null ? new V3(-.13, .69, .3) : new V3(-.16 + dxL, this.restTop + .02, rz), R: this.restDx?.R === null ? new V3(.13, .69, .3) : new V3(.16 + dxR, this.restTop + .02, rz), table: true } : this.restTop === null ? { L: new V3(-.13, .69, .3), R: new V3(.13, .69, .3) } : { L: new V3(-.15, .78, .36), R: new V3(.15, .78, .36) });
    const standRest = { L: new V3(-.22, .82, .02), R: new V3(.22, .82, .02) };
    let L = seatedRest.L.clone().lerp(standRest.L, st), R = seatedRest.R.clone().lerp(standRest.R, st);
    if (walking){ const sw = Math.sin(this.phase) * .16; L.z -= sw; R.z += sw; L.y += Math.abs(sw) * .2; R.y += Math.abs(sw) * .2; }
    if (this.lying){ L = new V3(-.08, 1.42, .32); R = new V3(.08, 1.42, .32); }
    if (this.idle === "work"){ L = new V3(-.15, 1.02 + Math.max(0, Math.sin(t * 2.1)) * .05, .38); R = new V3(.12 + Math.sin(t * 1.3) * .06, 1.03, .4 + Math.sin(t * 1.7) * .05); }
    if (this.idle === "type"){ const zz = this.typeZ || .34; L = new V3(-.11, .78 + Math.max(0, Math.sin(t * 12)) * .012, zz); R = new V3(.11, .78 + Math.max(0, Math.sin(t * 11 + 1)) * .012, zz); }
    const M = this.s.msg; this.palmGoal = null; if (M && this === this.s.me){ const ty = M.typing > 0 ? .007 : 0;
      if (M.up){ if (this.lying){ L = new V3(-.07, 1.36, .27); R = new V3(.07, 1.37, .27); } else { L = new V3(-.05, .93, .27); R = new V3(.05, .95, .27); }
        if (this.rig){ const cy = this.lying ? 1.3 : .97, cz = this.lying ? .3 : .3; this.palmGoal = { L: new V3(-.052, cy, cz), R: new V3(.052, cy + .005, cz) }; }   // 兩手掌夾住手機兩側
        L.y += Math.max(0, Math.sin(t * 15)) * ty; R.y += Math.max(0, Math.sin(t * 13 + 1.7)) * ty; L.z += ty * .5; R.z += ty * .5; }
      else if (this.lying){ L = new V3(-.09, 1.0, .12); R = new V3(.07, 1.1, .14); }
      else { L = new V3(-.15, .79, .36); R = new V3(.12, .79, .38); } }
    if (this.idle === "phone" || (this.fidget && this.fidget.phone)){ L = new V3(-.05, .9, .3); R = new V3(.05, .92, .3); this.look = this.local(new V3(0, .8, .5)); }
    if (this.state === "seated" || this.state === "standing"){
      if (this.pose === "cross" && !(g && ["sip", "point", "slam", "head"].includes(g.k))){ L = new V3(.1, lerp(.93, 1.25, st), .2); R = new V3(-.1, lerp(.91, 1.23, st), .21); }
      if (this.speaking && this.pose !== "cross" && (!g || g.k === "nod" || g.k === "shake" || g.k === "look")){
        if (t > this.beatAt){ this.beatAt = t + .45 + Math.random() * .7; const big = Math.random() < .35;
          this.beat.set(.18 + Math.random() * .1, lerp(.86, 1.2, st) + Math.random() * .1, .38 + Math.random() * .12); this.beatBoth = big; }
        R = this.beat.clone(); if (this.beatBoth) L = new V3(-this.beat.x, this.beat.y - .02, this.beat.z);
      }
      if (this.thinking){ R = new V3(.03, lerp(1.04, 1.48, st), .12); }
    }
    if (g){ const k = g.k, e = ease(Math.min(1, p * 3)) * (1 - ease((p - .8) * 5));
      const mouth = new V3(.02, lerp(1.07, 1.5, st), .14);
      if (k === "sip" && this.cup && this.rig){   // 喝水：伸手→握住杯身→送到嘴邊、杯子傾向臉→放回原位
        const home = this.held ? this.cup.parent.localToWorld(this.held.home.clone()) : this.cup.getWorldPosition(new V3()), cc = home.clone().add(new V3(0, .045, 0));
        const mw = this.head.localToWorld(new V3(0, -.03, .12)), c = this.root.worldToLocal(cc.clone()).add(new V3(.07, .0, -.06)), mo = this.root.worldToLocal(mw.clone()).add(new V3(.07, -.02, -.06));
        if (p < .22){ R = R.lerp(c, ease(p / .22)); this.grasp = { pt: cc, mode: "cyl", r: .036, w: ease(p / .22) }; }
        else if (p < .78){ if (!this.held) this.held = { k: "sip", obj: this.cup, home: this.cup.position.clone(), hq: this.cup.quaternion.clone(), mode: "cyl", r: .036, cy: .045 };
          const u = p < .5 ? ease((p - .22) / .28) : 1 - ease((p - .58) / .2) * (p > .58 ? 1 : 0); R = c.clone().lerp(mo, u);
          this.grasp = { pt: cc.clone().lerp(mw, u), mode: "cyl", r: .036, w: 1 }; this.held.face = this.head.getWorldPosition(new V3()); this.held.tilt = .55 * Math.max(0, (u - .6) / .4); }
        else if (p < .95){ R = c.clone(); this.grasp = { pt: cc, mode: "cyl", r: .036, w: 1 }; if (this.held) this.held.tilt = 0; }
        else { if (this.held){ this.held.obj.position.copy(this.held.home); this.held.obj.quaternion.identity(); this.held = null; this.s.sound("clink"); } R = R.lerp(c, 1 - ease((p - .95) / .05)); } }
      else if (k === "sip" && this.cup){ const cw = this.held ? this.cup.parent.localToWorld(this.held.home.clone()) : this.cup.getWorldPosition(new V3()); const c = this.root.worldToLocal(cw.clone()).add(new V3(-.02, .06, -.05));
        if (p < .25 || p > .75) this.gripWant = cw.add(new V3(0, .045, 0));
        if (p < .25) R = R.lerp(c, ease(p * 4)); else if (p < .75){ R = c.clone().lerp(mouth, ease((p - .25) * 4)); if (!this.held){ this.held = { obj: this.cup, home: this.cup.position.clone() }; } }
        else { R = mouth.clone().lerp(c, ease((p - .75) * 4)); if (p > .95 && this.held){ this.held.obj.position.copy(this.held.home); this.held = null; this.s.sound("clink"); } } }
      if (k === "chop" && this.chop && this.rig){   // 吃飯：拿起筷子→夾碗裡的菜→送到嘴邊→回碗→放下筷子
        const home = this.held ? this.chop.parent.localToWorld(this.held.home.clone()) : this.chop.getWorldPosition(new V3());
        const bw = this.bowl ? this.bowl.getWorldPosition(new V3()).add(new V3(0, .2, 0)) : home.clone().add(new V3(0, .2, 0));
        const toMe = this.root.getWorldPosition(new V3()).sub(bw).setY(0).normalize(); bw.addScaledVector(toMe, .12);
        const mw = this.head.localToWorld(new V3(0, -.04, .2)), pk = home.clone().add(new V3(0, .006, -.04 * Math.sign(toMe.z || 1)));
        const L2 = v => this.root.worldToLocal(v.clone()).add(new V3(.05, .02, -.07));
        let pt, w = 1;
        if (p < .16){ w = ease(p / .16); pt = pk; R = R.lerp(L2(pk), w); }
        else { if (!this.held) this.held = { k: "chop", obj: this.chop, home: this.chop.position.clone(), hq: this.chop.quaternion.clone(), mode: "pinch" };
          const segs = [[.16, pk], [.36, bw], [.6, mw], [.78, bw], [.94, pk]]; let i = 0; while (i < segs.length - 1 && p > segs[i + 1][0]) i++;
          const a = segs[i], b = segs[Math.min(i + 1, segs.length - 1)], u = b === a ? 1 : ease(Math.min(1, (p - a[0]) / (b[0] - a[0])));
          pt = a[1].clone().lerp(b[1], u); R = L2(pt);
          if (p > .96 && this.held){ this.held.obj.position.copy(this.held.home); this.held.obj.quaternion.copy(this.held.hq); this.held = null; } }
        if (this.held || p < .16) this.grasp = { pt, mode: "pinch", w }; }
      else if (k === "chop" && this.chop){ const c = this.root.worldToLocal(this.chop.getWorldPosition(new V3())); R = R.clone().lerp(c.add(new V3(0, .03, 0)), e); }
      if (k === "head") R = R.clone().lerp(new V3(.02, lerp(1.17, 1.6, st), .12), e);
      if (k === "point") R = R.clone().lerp(new V3(.12, lerp(1.0, 1.35, st), .62), e);
      if (k === "shrug"){ R = R.clone().lerp(new V3(.32, lerp(.9, 1.15, st), .3), e); L = L.clone().lerp(new V3(-.32, lerp(.9, 1.15, st), .3), e); }
      if (k === "slam"){ R = p < .45 ? new V3(.16, lerp(1.08, 1.4, st), .36) : new V3(.16, .765, .38); if (!g.hit && p >= .5){ g.hit = true; this.s.thump(); } }
      if (k === "cross"){ L = new V3(.1, lerp(.93, 1.25, st), .2); R = new V3(-.1, lerp(.91, 1.23, st), .21); }
      if (k === "adjust"){ R = R.clone().add(new V3(0, .05 * e, -.05 * e)); L = L.clone().add(new V3(0, .03 * e, .02 * e)); }
      if (k === "clap"){ const c = Math.abs(Math.sin(p * Math.PI * 9)) * e; const y = lerp(.98, 1.3, st); L = L.clone().lerp(new V3(-.03 - c * .09, y, .3), e); R = R.clone().lerp(new V3(.03 + c * .09, y + .01, .3), e); }
      if (k === "cheer"){ R = R.clone().lerp(new V3(.26, lerp(1.45, 1.92, st), .12), e); L = L.clone().lerp(new V3(-.26, lerp(1.45, 1.92, st), .12), e); }
      if (k === "laugh"){ R = R.clone().lerp(new V3(.06, lerp(.74, 1.02, st), .22), e * .6); }
      if (k === "wave"){ R = new V3(.25, lerp(1.2, 1.55, st), .25 + Math.sin(p * 20) * .04); }
      if (k === "phone"){ L = L.clone().lerp(new V3(-.05, lerp(.93, 1.25, st), .27), e); R = R.clone().lerp(new V3(.05, lerp(.95, 1.27, st), .27), e); }
      if (k === "pour" && g.reach){ const tl = this.root.worldToLocal(g.reach.clone()).add(new V3(0, .14, 0)); R = R.clone().lerp(tl, e); }
    }
    this.onT = seatedRest.table && st < .05 ? { L: L.distanceTo(seatedRest.L) < .04 && this.hand.L.distanceTo(seatedRest.L) < .08, R: R.distanceTo(seatedRest.R) < .04 && this.hand.R.distanceTo(seatedRest.R) < .08 } : null;   // 哪隻手正平放在桌上
    return { L, R };
  }
  solveArm(A, side, T){
    if (A.off) T = T.clone().sub(A.off);
    const S = A.sh.getWorldPosition(new V3());
    let D = T.clone().sub(S), d = D.length(); const a = A.len ? A.len[0] : .28, b = A.len ? A.len[1] : .3, mx = a + b - .01;
    if (d > mx){ D.multiplyScalar(mx / d); d = mx; } if (d < .08){ D.setLength(.08); d = .08; }
    const dir = D.clone().normalize();
    const pole = new V3(side * .45, -1, -.55).applyQuaternion(this.root.quaternion).normalize();
    const perp = pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    const A0 = Math.acos(clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1));
    const E = S.clone().addScaledVector(dir, Math.cos(A0) * a).addScaledVector(perp, Math.sin(A0) * a);
    setBone(A.ua, E.clone().sub(S)); A.ua.updateMatrixWorld(true);
    setBone(A.el, S.clone().add(D).sub(E)); A.el.updateMatrixWorld(true);
  }
  gesture(k, dur = 1.6, end, opt){ this.gest = { k, t0: this.s.time, dur, end, ...(opt || {}) }; if (k === "sip" && !this.cup) this.gest = { k: "adjust", t0: this.s.time, dur: 1.2 }; else if (k === "sip" && this.s.after) this.s.after(dur * .88, () => this.s.sound("cup")); }
}
const _q = new THREE.Quaternion();
function setBone(bone, worldDir){ bone.parent.getWorldQuaternion(_q); bone.quaternion.setFromUnitVectors(DOWN, worldDir.normalize().applyQuaternion(_q.invert())); }

/* ---------------- 地點 ---------------- */
// 回傳：對面座位（最多 3）、玩家座位、門、窗邊位置、桌上物件
const LAYOUT = {
  dinner(s, o){
    const r = room(s, { ...o, wall: "236,226,208", wood: [150, 108, 72], window: { x: -1.5, w: 1.5, y: .9, h: 1.25 }, door: { x: 3.45, z: -1.2, yaw: -Math.PI / 2 } });
    const tm = new THREE.MeshStandardMaterial({ map: woodTex([128, 86, 54]), roughness: .55 });
    box(1.7, .05, .82, tm, 0, .74, -.3, s.world); for (const [x, z] of [[-.78, -.65], [.78, -.65], [-.78, .05], [.78, .05]]) box(.06, .72, .06, tm, x, .36, z, s.world);
    pendant(s, 0, 1.75, -.35);
    // 背景：碗櫃、電鍋、時鐘、照片、盆栽
    const sb = box(1.6, .85, .45, mat("#8a6a4a", .6), 1.6, .425, r.back + .3, s.world); box(1.6, .03, .47, mat("#6b4f38", .5), 1.6, .86, r.back + .3, s.world);
    cyl(.13, .13, .22, mat("#f0f0ee", .35), 1.25, .98, r.back + .3, s.world); cyl(.12, .1, .04, mat("#d9d9d6", .4), 1.25, 1.11, r.back + .3, s.world);
    for (let i = 0; i < 3; i++) box(.2, .26, .02, mat(["#b9c6d3", "#d3c5b0", "#c6d3b9"][i], .5), 1.35 + i * .3, 1.6, r.back + .07, s.world);
    const clock = cyl(.17, .17, .03, mat("#fafafa", .4), 0, 2.05, r.back + .07, s.world, 32); clock.rotation.x = Math.PI / 2;
    s.clockHands = [box(.01, .12, .005, mat("#222", .5), 0, 2.05, r.back + .09, s.world, false), box(.008, .15, .005, mat("#222", .5), 0, 2.05, r.back + .095, s.world, false)];
    plant(s.world, -2.9, 0, r.back + .5, 1.6); plant(s.world, -.2, .86, r.back + .3, .7);
    const seats = [-0.5, 0, .5].map(x => ({ x, z: -1.02, yaw: 0 })), me = { x: -.55, z: .42, yaw: Math.PI };
    return { seats, me, door: new V3(3.1, 0, -1.2), windowSpot: new V3(-1.5, 0, r.back + .65), tableY: .765, tableFar: -.71, food: true };
  },
  cafe(s, o){
    const r = room(s, { ...o, w: 8, wall: "214,196,170", wood: [120, 84, 58], window: { x: -1.2, w: 2.6, y: .55, h: 1.7 }, door: { x: -3.95, z: .2, yaw: Math.PI / 2 } });
    box(1.3, .04, .8, mat("#4a3426", .45), 0, .74, -.35, s.world); cyl(.04, .04, .72, mat("#2b2b2b", .5, .5), 0, .36, -.35, s.world); cyl(.17, .2, .02, mat("#2b2b2b", .5, .5), 0, .01, -.35, s.world);   // 底座小一點，對面的腳不會踩進去
    pendant(s, -.3, 1.8, -.35); pendant(s, .4, 1.8, -.35, true, false);
    // 吧檯、咖啡機、菜單
    box(2.4, 1.0, .6, mat("#5c4030", .6), 2.1, .5, r.back + 1.0, s.world); box(2.5, .04, .66, mat("#2c2c2c", .3, .2), 2.1, 1.02, r.back + 1.0, s.world);
    box(.45, .4, .35, mat("#b9b9b9", .25, .8), 1.5, 1.24, r.back + .95, s.world); box(1.6, .04, .3, mat("#6b4f38", .6), 2.4, 1.5, r.back + .15, s.world);
    for (let i = 0; i < 6; i++) cup(s.world, 1.8 + i * .12, 1.52, r.back + .15, ["#ffffff", "#e8d8c4"][i % 2]);
    const menu = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .7), new THREE.MeshStandardMaterial({ map: textTex(["今日咖啡", "美式　90", "拿鐵　120", "手沖　150"], { bg: "#3b2a20", fg: "#f3e3c8", size: 40, lh: 52 }), roughness: .8 }));
    menu.position.set(2.2, 1.85, r.back + .06); s.world.add(menu);
    // 另一桌客人
    box(.8, .04, .6, mat("#4a3426", .45), 2.2, .74, -1.0, s.world); cyl(.035, .035, .72, mat("#2b2b2b", .5, .5), 2.2, .36, -1.0, s.world);
    chair(s.world, 2.2, -1.45, 0, "#3a2a20"); chair(s.world, 2.2, -.55, Math.PI, "#3a2a20");
    cup(s.world, 2.1, .76, -1.05); cup(s.world, 2.3, .76, -.9);
    s.npcs.push({ name: "_c1", col: "#7a6a8c", hair: "#3b2f2a", long: true, seat: { x: 2.2, z: -1.45, yaw: 0 }, idle: "phone", noChair: true });
    s.npcs.push({ name: "_c2", col: "#6a8c7a", seat: { x: 2.2, z: -.55, yaw: Math.PI }, idle: null, noChair: true });
    s.npcs.push({ name: "_barista", col: "#2f2f2f", stand: new V3(2.5, 0, r.back + .45), yaw: 0, idle: "work" });
    plant(s.world, -3.4, 0, r.back + .5, 1.8);
    const seats = [-.4, .05, .5].map(x => ({ x, z: -1.08, yaw: 0 })), me = { x: -.5, z: .38, yaw: Math.PI };
    return { seats, me, door: new V3(-3.6, 0, .2), windowSpot: new V3(-1.2, 0, r.back + .6), tableY: .76, tableFar: -.75, cups: true };
  },
  office(s, o){
    const r = room(s, { ...o, w: 9, wall: "214,210,201", floor: "carpet", window: { x: -2.2, w: 2.4, y: .8, h: 1.5 }, door: { x: 4.45, z: -.5, yaw: -Math.PI / 2 } });
    // v0.24 辦公室重新配色：主管桌改成胡桃木桌面＋黑色鐵腳，桌上放文件、馬克杯、筆筒、檯燈
    const deskM = new THREE.MeshStandardMaterial({ map: woodTex([112, 74, 46]), roughness: .45 });
    box(1.6, .045, .8, deskM, 0, .74, -.35, s.world); for (const x of [-.75, .75]) box(.04, .72, .7, mat("#1e2125", .35, .6), x, .36, -.35, s.world);
    box(1.46, .34, .02, mat("#2b2f35", .5, .3), 0, .55, -.35, s.world);   // 擋板放桌子中間，兩邊的腳都不會穿過去
    for (let i = 0; i < 4; i++){ const d = box(.22, .006, .3, mat(["#f4f1ea", "#e9edf2", "#f6efe0", "#eef2ea"][i], .9), -.55 + (i % 2) * .02, .768 + i * .007, -.5 - i * .01, s.world); d.rotation.y = (i - 1.5) * .06; }
    cup(s.world, -.18, .76, -.58, "#c4553f");
    cyl(.035, .035, .1, mat("#3a3f46", .4, .5), -.3, .81, -.66, s.world, 16); for (let i = 0; i < 3; i++){ const pen = cyl(.004, .004, .14, mat(["#d9a441", "#2f5f8a", "#c4553f"][i], .5), -.3 + (i - 1) * .012, .86, -.66, s.world, 6); pen.rotation.z = (i - 1) * .18; }
    { const lg = new THREE.Group(); lg.position.set(.72, .76, -.62); s.world.add(lg); cyl(.07, .08, .02, mat("#1e2125", .4, .5), 0, .01, 0, lg); const arm = cyl(.008, .008, .4, mat("#1e2125", .4, .5), 0, .21, 0, lg); arm.rotation.z = .25;
      const head = new THREE.Mesh(new THREE.ConeGeometry(.07, .1, 20, 1, true), new THREE.MeshStandardMaterial({ color: "#1e2125", roughness: .4, metalness: .5, side: THREE.DoubleSide })); head.position.set(-.06, .42, 0); head.rotation.z = -2.4; lg.add(head);
      const bulb = sphere(.022, new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#ffd9a0", emissiveIntensity: 12 }), lg, 10); bulb.position.set(-.09, .39, 0); bulb.castShadow = false;
      const dl = new THREE.PointLight("#ffd2a0", 1.6, 1.6, 1.8); dl.position.set(-.12, .36, 0); lg.add(dl); }
    // 背牆：木作書架、裱框、時鐘
    shelf(s.world, .5, r.back + .22, 0, 1.4, 1.9); shelf(s.world, 1.95, r.back + .22, 0, 1.4, 1.9);
    for (const [x, y, w, h, c] of [[3.45, 1.7, .55, .75, "#b58b5a"]]){ box(w + .06, h + .06, .03, mat("#2a2420", .5), x, y, r.back + .02, s.world, false); box(w, h, .02, mat(c, .9), x, y, r.back + .035, s.world, false); }
    monitor(s.world, .55, .76, -.6, -.4); box(.4, .02, .14, mat("#2a2e35", .5), .5, .77, -.35, s.world);
    for (const [x, z] of [[-1.2, -2.4], [.2, -2.4], [1.6, -2.4]]){ box(1.2, .04, .7, mat("#cdbfa8", .6), x, .74, z, s.world); box(1.2, .3, .04, mat("#55707c", .95), x, .89, z + .36, s.world); box(1.16, .5, .02, mat("#b9ab94", .7), x, .47, z + .33, s.world); monitor(s.world, x, .76, z + .12, Math.PI); chair(s.world, x, z - .62, 0, "#7a7f88"); }
    s.npcs.push({ name: "_w1", col: "#7a8b6e", seat: { x: -1.2, z: -3.0, yaw: 0 }, idle: "type", noChair: true });
    s.npcs.push({ name: "_w2", col: "#8b6e7a", hair: "#4a3226", long: true, seat: { x: 1.6, z: -3.0, yaw: 0 }, idle: "type", noChair: true });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) ceilingPanel(s, -2.4 + i * 2.4, -2.6 + j * 2.4);
    plant(s.world, 3.6, 0, r.back + .5, 1.7);
    const seats = [-.45, 0, .45].map(x => ({ x, z: -1.1, yaw: 0 })), me = { x: -.5, z: .38, yaw: Math.PI };
    return { seats, me, door: new V3(4.1, 0, -.5), windowSpot: new V3(-2.2, 0, r.back + .6), tableY: .76, tableFar: -.75, office: true };
  },
  lab(s, o){
    const r = room(s, { ...o, w: 8, wall: "222,230,224", floor: "tile", window: { x: 1.8, w: 2, y: .85, h: 1.3 }, door: { x: -3.95, z: -.4, yaw: Math.PI / 2 } });
    box(1.6, .04, .8, mat("#c9cfc8", .5), 0, .74, -.35, s.world); for (const x of [-.75, .75]) box(.04, .72, .7, mat("#8f9890", .4, .4), x, .36, -.35, s.world);
    laptop(s.world, .45, .76, -.5, -.3);
    const wb = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshStandardMaterial({ map: textTex(["loss ↓", "baseline vs ours", "TODO: ablation"], { scribble: true, size: 30, y: 150 }), roughness: .4 }));
    wb.position.set(-1.0, 1.55, r.back + .06); s.world.add(wb); box(2.3, 1.2, .03, mat("#c0c4c2", .4, .5), -1.0, 1.55, r.back + .04, s.world);
    shelf(s.world, -3.2, r.back + .35, 0, 1.3, 2.0);
    const rack = box(.6, 1.9, .6, mat("#2a2d33", .4, .4), 3.2, .95, r.back + .5, s.world); s.leds = [];
    for (let i = 0; i < 18; i++){ const l = new THREE.Mesh(new THREE.BoxGeometry(.02, .02, .01), new THREE.MeshStandardMaterial({ color: "#1f3", emissive: i % 4 ? "#22ff66" : "#ffaa22", emissiveIntensity: 1 })); l.position.set(3.0 + (i % 3) * .08, .3 + Math.floor(i / 3) * .28, r.back + .81); s.world.add(l); s.leds.push(l); }
    box(1.4, .04, .7, mat("#c9cfc8", .5), 1.8, .74, -2.2, s.world); laptop(s.world, 1.8, .76, -2.15, Math.PI); chair(s.world, 1.8, -2.85, 0, "#3b3f46");
    s.npcs.push({ name: "_s1", col: "#8c7a5a", seat: { x: 1.8, z: -2.85, yaw: 0 }, idle: "type", noChair: true, faceAway: true });
    for (let i = 0; i < 2; i++) ceilingPanel(s, -1.2 + i * 2.4, -1.4);
    const seats = [-.45, 0, .45].map(x => ({ x, z: -1.1, yaw: 0 })), me = { x: -.5, z: .38, yaw: Math.PI };
    return { seats, me, door: new V3(-3.6, 0, -.4), windowSpot: new V3(1.8, 0, r.back + .6), tableY: .76, tableFar: -.75, cups: true };
  },
  hospital(s, o){
    const r = room(s, { ...o, w: 9, wall: "226,236,233", floor: "tile", window: { x: -2.6, w: 1.6, y: .9, h: 1.2 }, door: { x: 4.45, z: -.8, yaw: -Math.PI / 2 } });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.0, .5), new THREE.MeshBasicMaterial({ map: textTex(["目前看診", "0 3 7 號"], { bg: "#0d2a24", fg: "#5cf2b0", size: 64, lh: 80, y: 30, x: 60 }) })); board.position.set(.6, 2.0, r.back + .06); s.world.add(board); s.board = board;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, .35), new THREE.MeshStandardMaterial({ map: textTex(["候診區　內科"], { bg: "#2e7d6f", fg: "#ffffff", size: 56, y: 40 }), roughness: .6 })); sign.position.set(-.9, 2.1, r.back + .06); s.world.add(sign);
    const rowChairs = (z, yaw) => { for (let i = 0; i < 6; i++){ const x = -1.6 + i * .62; const cm = mat("#3f7fb0", .5); box(.5, .05, .45, cm, x, .45, z, s.world); box(.5, .45, .05, cm, x, .7, z - Math.cos(yaw) * .22, s.world); box(.04, .45, .04, mat("#7a8a96", .4, .6), x, .225, z, s.world); } };
    rowChairs(-1.15, 0); rowChairs(.5, Math.PI);
    s.npcs.push({ name: "_p1", col: "#9a8a6e", hair: "#8a8a8a", seat: { x: 1.5, z: -1.15, yaw: 0 }, idle: "phone", noChair: true });
    s.npcs.push({ name: "_p2", col: "#6e7a9a", seat: { x: 2.1, z: -1.15, yaw: 0 }, idle: null, noChair: true });
    for (let i = 0; i < 3; i++) ceilingPanel(s, -2.4 + i * 2.4, -1.0);
    plant(s.world, 3.8, 0, r.back + .5, 1.5);
    const seats = [-.36, .26, .88].map(x => ({ x, z: -1.15, yaw: 0 })), me = { x: -.98, z: .5, yaw: Math.PI };
    return { seats, me, door: new V3(4.1, 0, -.8), windowSpot: new V3(-2.6, 0, r.back + .6), tableY: null, noChairs: true, hospital: true };
  },
  // 每天：自己的房間、公司座位、實驗室座位
  home(s, o){
    const rented = o.rented;
    const r = room(s, { ...o, w: rented ? 5 : 6, d: 5, wall: rented ? "226,222,214" : "238,228,212", wood: rented ? [160, 130, 100] : [150, 108, 72], window: { x: -.6, w: 1.4, y: .9, h: 1.25 }, door: { x: rented ? 2.45 : 2.95, z: -.3, yaw: -Math.PI / 2 } });
    const dm = new THREE.MeshStandardMaterial({ map: woodTex([140, 100, 66]), roughness: .6 });
    box(1.3, .04, .62, dm, .4, .74, r.back + .45, s.world); for (const [x, z] of [[-.22, .2], [1.02, .2], [-.22, .7], [1.02, .7]]) box(.04, .72, .04, dm, x, .36, r.back + z, s.world);
    s.laptopObj = laptop(s.world, .45, .76, r.back + .42, 0, o.hour >= 19 || o.hour < 6 ? .4 : 0);
    s.phoneObj = box(.075, .008, .15, mat("#1e2228", .3, .3), -.12, .765, r.back + .62, s.world); s.phoneObj.rotation.y = .3;
    const lampG = new THREE.Group(); lampG.position.set(.95, .76, r.back + .35); s.world.add(lampG); cyl(.07, .08, .02, mat("#333", .5), 0, .01, 0, lampG); cyl(.008, .008, .4, mat("#333", .5), 0, .2, 0, lampG); const ls = new THREE.Mesh(new THREE.ConeGeometry(.09, .12, 16, 1, true), new THREE.MeshStandardMaterial({ color: "#555", side: THREE.DoubleSide })); ls.position.set(0, .42, .04); ls.rotation.x = .5; lampG.add(ls);
    const dl = new THREE.SpotLight("#ffd9a8", 0, 4, Math.PI / 3, .7, 1.5); dl.position.set(.95, 1.15, r.back + .4); dl.target.position.set(.5, .7, r.back + .5); dl.castShadow = true; dl.shadow.mapSize.set(s.q.shadow, s.q.shadow); s.world.add(dl, dl.target); s.lamps.push({ L: dl, shade: ls, bulb: null, base: 7 });
    // 床
    const bx = rented ? -1.6 : -2.1;
    s.bedObj = box(1.05, .65, 2.05, new THREE.MeshBasicMaterial({ visible: false }), bx, .33, r.back + 1.6, s.world, false);
    box(1.0, .35, 2.0, mat("#8a6a4a", .6), bx, .175, r.back + 1.6, s.world); box(.96, .16, 1.96, mat("#eceae4", .9), bx, .43, r.back + 1.6, s.world);
    s.blanket = box(.94, .1, 1.3, mat(rented ? "#7c8fa6" : "#a6927c", .95), bx, .53, r.back + 1.95, s.world); s.blanket.userData.bed = { x: bx, z0: r.back + 1.3, z1: r.back + 2.6, w: .96, top: .51, foot: r.back + 2.6 };
    s.pillow = box(.6, .1, .3, mat("#f5f3ee", .9), bx, .56, r.back + .76, s.world);
    if (!rented){ shelf(s.world, 2.2, r.back + .3, 0, 1.0, 1.9); }
    else { box(.8, 1.9, .55, mat("#d8d2c6", .7), 1.9, .95, r.back + .35, s.world); }
    if (o.props?.plant) plant(s.world, -.1, .76, r.back + .35, .55);
    if (o.props?.noodles){ const nb = cyl(.06, .05, .1, mat("#f1eadb", .6), .1, .81, r.back + .62, s.world); cyl(.061, .061, .02, mat("#c8473b", .6), .1, .84, r.back + .62, s.world); }
    if (o.props?.books) for (let i = 0; i < 4; i++) box(.24, .04, .17, mat(["#4c6a8c", "#8c5a4c", "#6c8c5a", "#c9a44c"][i], .8), .95, .78 + i * .042, r.back + .7, s.world).rotation.y = (i - 1.5) * .08;
    if (o.props?.frame){ const f = box(.12, .16, .015, mat("#8b6b4a", .6), -.05, .84, r.back + .25, s.world); f.rotation.x = -.2; }
    if (o.props?.mess) for (let i = 0; i < 8; i++){ const p = box(.21, .003, .3, mat(["#ffffff", "#e9e2d0", "#6b7a99", "#c9a06b"][i % 4], .9), (hash(i) - .5) * 2.4, .003, r.back + 1.6 + (hash(i + 5) - .5) * 1.6, s.world, false); p.rotation.y = hash(i + 3) * 3; }
    if (o.props?.bills) for (let i = 0; i < 4; i++){ const p = box(.21, .003, .3, mat("#ffffff", .9), .1 + i * .06, .765 + i * .002, r.back + .55, s.world, false); p.rotation.y = (i - 1.5) * .2; }
    chair(s.world, .45, r.back + 1.0, Math.PI, "#5a4636");
    const bedSeat = { x: bx, z: r.back + 1.4, yaw: 0, bed: true };
    return { me: { x: .45, z: r.back + .93, yaw: Math.PI }, meChair: true, bed: bedSeat, back: r.back, deskZ: r.back + .45, door: new V3(2.6, 0, -.3), windowSpot: new V3(-.6, 0, r.back + .6), day: true };
  },
};

/* ---------------- 理想畫面用的場景（戶外、舞台、新家⋯） ---------------- */
function groundPlane(s, w, d, m, x = 0, z = 0, y = 0){ const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m); g.rotation.x = -Math.PI / 2; g.position.set(x, y, z); g.receiveShadow = true; s.world.add(g); return g; }
function backdrop(s, o, x, y, z, w, h){ const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: skyTex(o.hour, o.weather, o.season), fog: false })); m.position.set(x, y, z); s.world.add(m); s.sky = m; return m; }
function grassTex(season){ const c = { spring: "112,160,86", summer: "84,138,72", autumn: "142,140,82", winter: "128,132,110" }[season || "summer"]; return noiseTex(c, 26, "g"); }
function facadeTex(seed, night){ // 窗戶格子；夜晚另一張只畫亮著的窗
  const k = `fac${seed}${night ? "n" : "d"}`; if (TEX[k]) return TEX[k];
  const base = ["#b9b2a6", "#a7aeb6", "#c4b49c", "#9fa59a", "#d0c8bc"][seed % 5];
  return TEX[k] = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = night ? "#000" : base; g.fillRect(0, 0, w, h);
    for (let y = 10; y < h - 8; y += 22) for (let x = 8; x < w - 8; x += 20){ const lit = hash(seed * 977 + x * 13 + y * 7) < .42;
      if (night){ if (lit){ g.fillStyle = hash(x + y + seed) < .5 ? "#ffd98a" : "#f4e6c4"; g.fillRect(x, y, 12, 14); } }
      else { g.fillStyle = "#5d6b78"; g.fillRect(x, y, 12, 14); g.fillStyle = "rgba(255,255,255,.25)"; g.fillRect(x, y, 12, 4); } }
  });
}
function building(s, x, z, w, d, h, seed, night){
  const day = facadeTex(seed, false), em = facadeTex(seed, true);
  const m = new THREE.MeshStandardMaterial({ map: day, roughness: .85, emissive: "#ffd98a", emissiveMap: em, emissiveIntensity: night ? 1.1 : 0 });
  day.wrapS = day.wrapT = em.wrapS = em.wrapT = THREE.RepeatWrapping; day.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 6))); em.repeat.copy(day.repeat);
  const b = box(w, h, d, m, x, h / 2, z, s.world, false); b.receiveShadow = true; (s.vfacades || (s.vfacades = [])).push(m); return b;
}
function streetLamp(s, x, z, side = 1, shadow = false){
  const pm = mat("#3a3d42", .5, .6); cyl(.05, .07, 3.6, pm, x, 1.8, z, s.world, 10);
  box(.9, .05, .06, pm, x - side * .45, 3.58, z, s.world);
  const head = box(.34, .08, .18, new THREE.MeshStandardMaterial({ color: "#f6f2e8", emissive: "#ffd9a0", emissiveIntensity: 0 }), x - side * .85, 3.54, z, s.world, false);
  const L = new THREE.SpotLight("#ffd5a0", 0, 12, Math.PI / 3, .6, 1.4); L.position.set(x - side * .85, 3.45, z); L.target.position.set(x - side * 1.1, 0, z); s.world.add(L, L.target);
  if (shadow){ L.castShadow = true; L.shadow.mapSize.set(s.q.shadow, s.q.shadow); L.shadow.bias = -.001; }
  s.lamps.push({ L, shade: head, bulb: null, base: 45, night: true });
}
function tree(s, x, z, sc = 1, season = "summer"){
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(sc); s.world.add(g);
  cyl(.09, .14, 1.7, mat("#6b5040", .9), 0, .85, 0, g, 8);
  const col = { spring: ["#7fb86a", "#94c97c"], summer: ["#3e7a46", "#4f8f52"], autumn: ["#c47a35", "#d39a45"], winter: ["#6f7a66", "#7d8774"] }[season] || ["#3e7a46", "#4f8f52"];
  for (let i = 0; i < 6; i++){ const l = sphere(.55 + hash(i + x * 3) * .25, mat(col[i % 2], .9), g, 10); l.position.set((hash(i * 3 + z) - .5) * 1.0, 2.0 + hash(i + 7) * .8, (hash(i * 5) - .5) * 1.0); }
  return g;
}
function bench(s, x, z, yaw, w = 1.5){
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; s.world.add(g); const wm = mat("#8a6142", .7), im = mat("#3a3d42", .5, .5);
  for (let i = 0; i < 3; i++) box(w, .035, .12, wm, 0, .45, -.14 + i * .14, g);
  for (let i = 0; i < 2; i++) box(w, .1, .03, wm, 0, .62 + i * .14, -.24, g);
  for (const sx of [-1, 1]){ box(.05, .45, .4, im, sx * (w / 2 - .1), .225, -.02, g); box(.05, .4, .05, im, sx * (w / 2 - .1), .6, -.24, g); }
  return g;
}
function sofa(s, x, z, yaw, w, col){
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; s.world.add(g); const m = mat(col, .95);
  box(w, .22, .8, m, 0, .2, 0, g); for (let i = 0; i < 3; i++) box(w / 3 - .02, .12, .6, mat(col, .9), (i - 1) * w / 3, .37, .08, g);
  box(w, .5, .2, m, 0, .55, -.32, g); for (const sx of [-1, 1]) box(.18, .58, .8, m, sx * (w / 2 + .05), .29, 0, g);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.05, .1, .05, mat("#3a2a20", .6), sx * (w / 2 - .05), .05, sz * .33, g);
  return g;
}
function floorLamp(s, x, z){
  const pm = mat("#2f2f2f", .5, .4); cyl(.13, .15, .03, pm, x, .015, z, s.world); cyl(.012, .012, 1.5, pm, x, .76, z, s.world, 8);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(.16, .22, .28, 20, 1, true), new THREE.MeshStandardMaterial({ color: "#efe4cc", side: THREE.DoubleSide, emissive: "#ffcf80", emissiveIntensity: 0 })); shade.position.set(x, 1.55, z); s.world.add(shade);
  const L = new THREE.PointLight("#ffcf98", 0, 5, 1.6); L.position.set(x, 1.5, z); s.world.add(L); s.lamps.push({ L, shade, bulb: null, base: 9 });
}
function hall(s, o, W, D, H, wallCol, floorM, backWall){ // 比一般房間高大的空間（禮堂、航廈）
  const back = -D + 2.5, g = s.world; const wm = new THREE.MeshStandardMaterial({ map: noiseTex(wallCol, 8, "h" + wallCol), roughness: .95 });
  groundPlane(s, W, D, floorM, 0, back + D / 2);
  box(.2, H, D, wm, -W / 2, H / 2, back + D / 2, g, false); box(.2, H, D, wm, W / 2, H / 2, back + D / 2, g, false); box(W, H, .2, wm, 0, H / 2, back + D, g, false);
  if (backWall) box(W, H, .2, wm, 0, H / 2, back - .1, g, false);
  const c = box(W, .1, D, mat("#e9e6df", .95), 0, H, back + D / 2, g, false); c.receiveShadow = false;
  return { back, wm };
}
function hallLight(s, x, y, z, base = 14, col = "#f4f1ea"){ const p = box(1.0, .03, .4, new THREE.MeshStandardMaterial({ color: "#fff", emissive: "#f4f8ff", emissiveIntensity: 0 }), x, y, z, s.world, false); p.castShadow = false;
  const L = new THREE.PointLight(col, 0, 9, 1.5); L.position.set(x, y - .25, z); s.world.add(L); s.lamps.push({ L, shade: p, bulb: null, base, panel: true }); }
function suitcase(s, x, z, col, yaw = 0){ const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = yaw; s.world.add(g);
  box(.42, .62, .25, mat(col, .5, .1), 0, .36, 0, g); for (const sx of [-1, 1]) cyl(.025, .025, .03, mat("#222", .6), sx * .16, .03, .1, g, 8).rotation.z = Math.PI / 2;
  box(.02, .3, .02, mat("#555", .4, .6), -.08, .82, -.1, g); box(.02, .3, .02, mat("#555", .4, .6), .08, .82, -.1, g); box(.18, .025, .025, mat("#333", .5), 0, .97, -.1, g); return g; }
function aroundTable(cx, cz, r, angles, extra = {}){ return angles.map(a => ({ x: cx + Math.sin(a) * r, z: cz + Math.cos(a) * r, yaw: a + Math.PI, chair: true, table: true, ...extra })); }
function signBoard(s, lines, x, y, z, w, h, opt = {}, yaw = 0){ const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: textTex(lines, { w: 1024, h: Math.round(1024 * h / w), size: opt.size || 72, lh: opt.lh || 96, x: opt.x || 48, y: opt.y || 40, bg: opt.bg, fg: opt.fg }), fog: false })); m.position.set(x, y, z); m.rotation.y = yaw; s.world.add(m); return m; }
const clip = (t, n) => String(t || "").replace(/\s+/g, " ").trim().slice(0, n);

const VKIT = {
  apartment(s, o){ // 自己的新家：客廳
    const r = room(s, { ...o, w: 7, d: 6, wall: "240,236,228", wood: [176, 138, 98], window: { x: -.2, w: 3.2, y: .45, h: 1.9 }, door: { x: 3.45, z: .2, yaw: -Math.PI / 2 } });
    const B = r.back, wm = new THREE.MeshStandardMaterial({ map: woodTex([150, 112, 76]), roughness: .55 });
    box(2.8, .01, 1.9, mat("#cdbda4", .95), 0, .005, B + 1.95, s.world, false);
    sofa(s, 0, B + .95, 0, 2.1, o.props.sofa || "#7d8a96");
    box(1.1, .04, .55, wm, 0, .42, B + 2.05, s.world); for (const [x, z] of [[-.5, -.22], [.5, -.22], [-.5, .22], [.5, .22]]) box(.04, .4, .04, wm, x, .2, B + 2.05 + z, s.world);
    cup(s.world, -.2, .44, B + 2.0); cup(s.world, .25, .44, B + 2.1, "#e8d8c4"); box(.22, .03, .3, mat("#4c6a8c", .8), .05, .455, B + 1.95, s.world).rotation.y = .3;
    floorLamp(s, -1.55, B + .75); plant(s.world, 1.55, 0, B + .65, 1.9); shelf(s.world, -3.25, B + 2.4, Math.PI / 2, 1.3, 1.9);
    const dt = box(1.0, .04, .8, wm, 2.35, .74, B + 2.6, s.world); for (const [x, z] of [[-.45, -.35], [.45, -.35], [-.45, .35], [.45, .35]]) box(.04, .72, .04, wm, 2.35 + x, .36, B + 2.6 + z, s.world);
    pendant(s, 2.35, 1.75, B + 2.6);
    if (o.props.flowers){ cyl(.06, .05, .2, mat("#dfe8ee", .2), 2.35, .86, B + 2.6, s.world); for (let i = 0; i < 6; i++){ const f = sphere(.045, mat(["#e86a7c", "#f2c14e", "#f4f1ea"][i % 3], .8), s.world, 8); f.position.set(2.35 + (hash(i) - .5) * .14, 1.0 + hash(i + 3) * .08, B + 2.6 + (hash(i + 6) - .5) * .14); } }
    return { seats: [{ x: 0, z: B + 1.02, yaw: 0, table: false, sofa: true }, { x: -.62, z: B + 1.02, yaw: 0, table: false, sofa: true }, { x: .62, z: B + 1.02, yaw: 0, table: false, sofa: true },
      { x: 2.35, z: B + 1.98, yaw: 0, chair: true, table: true }, { x: 2.35, z: B + 3.22, yaw: Math.PI, chair: true, table: true }],
      stands: [{ x: -1.0, z: B + .75, yaw: Math.PI }, { x: -.4, z: B + .78, yaw: Math.PI }, { x: 1.3, z: B + 2.9, yaw: -2.4 }],
      walk: [new V3(3.0, 0, B + 3.7), new V3(.9, 0, B + 2.7)], cam: { pos: new V3(1.15, 1.5, B + 4.9), look: new V3(0, .85, B + 1.5) }, view: new V3(-.2, 1.4, B - 3), dinner: { cx: 2.35, cz: B + 2.6, y: .76 } };
  },
  stage(s, o){ // 發表、上台、典禮
    const W = 12, D = 14, H = 5; const { back: B } = hall(s, o, W, D, H, "58,61,72", new THREE.MeshStandardMaterial({ map: woodTex([110, 76, 52]), roughness: .6 }), true);
    box(7, .5, 3, mat("#4a3426", .6), 0, .25, B + 1.5, s.world); box(7.1, .04, .08, mat("#c9a44c", .4, .5), 0, .5, B + 3.0, s.world);
    for (const sx of [-1, 1]) box(1.6, H, .3, mat("#7a1f2a", .9), sx * 4.2, H / 2, B + .4, s.world);
    const sc = o.texts.screen ? [clip(o.texts.screen, 12)] : ["　"]; if (o.texts.sub) sc.push(clip(o.texts.sub, 18));
    signBoard(s, sc, 0, 2.75, B + .12, 4.4, 2.2, { bg: "#16263a", fg: "#f4f1ea", size: 92, lh: 120, x: 70, y: 150 });
    box(.62, 1.05, .45, mat("#6b4a32", .6), -1.6, 1.025, B + 2.2, s.world); cyl(.01, .01, .3, mat("#222", .5), -1.6, 1.68, B + 2.1, s.world, 6).rotation.x = .5;
    for (const [x, tx, sh] of [[-2.4, -1.6, true], [2.4, .6, false]]){ const L = new THREE.SpotLight("#fff2dc", 0, 16, Math.PI / 9, .5, 1.2); L.position.set(x, 4.7, B + 7); L.target.position.set(tx, .5, B + 1.8); s.world.add(L, L.target);
      if (sh){ L.castShadow = true; L.shadow.mapSize.set(s.q.shadow, s.q.shadow); L.shadow.bias = -.0008; } s.lamps.push({ L, shade: { material: {} }, bulb: null, base: 160, always: true }); }
    for (let i = 0; i < 3; i++) hallLight(s, -3 + i * 3, H - .05, B + 6.5, 10, "#ffe6c8");
    const rows = [], tm = mat("#7a2e2e", .85);
    for (let r = 0; r < 5; r++) for (let x = -4.1; x <= 4.15; x += .62){ if (Math.abs(x) < .45) continue; const z = B + 4.6 + r * 1.0;
      box(.5, .08, .45, tm, x, .44, z, s.world); box(.5, .55, .07, tm, x, .75, z + .24, s.world); box(.06, .44, .4, mat("#333", .5), x - .27, .22, z, s.world); rows.push({ x, z, r }); }
    const near = rows.filter(q => q.r === 0 && Math.abs(q.x) < 2.5).sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
    const crowd = rows.filter(q => !near.slice(0, 4).includes(q)).sort((a, b) => hash(a.x * 9 + a.z) - hash(b.x * 9 + b.z));
    return { seats: near.slice(0, 4).map(q => ({ x: q.x, z: q.z, yaw: Math.PI, table: false })), stands: [{ x: -1.6, z: B + 1.7, y: .5, yaw: 0, podium: true }, { x: .3, z: B + 1.8, y: .5, yaw: -.25 }, { x: 1.2, z: B + 1.8, y: .5, yaw: -.35 }, { x: -.6, z: B + 1.9, y: .5, yaw: .1 }],
      crowdSeats: crowd.map(q => ({ x: q.x, z: q.z, yaw: Math.PI })), bgLook: new V3(-1.6, 1.9, B + 1.7), mePlace: "stand",
      cam: { pos: new V3(1.3, 1.75, B + 7.4), look: new V3(-.6, 1.5, B + 1.9) }, view: new V3(0, 2.6, B), hall: { W, D, B } };
  },
  street(s, o){ // 城市街道、下班回家的路
    const night = timeOf(o.hour) === "night" || timeOf(o.hour) === "evening";
    groundPlane(s, 80, 90, mat("#34363a", .9), 0, -20, -.01);
    groundPlane(s, 6, 44, mat(o.weather === "rain" ? "#2c2e32" : "#3b3d41", o.weather === "rain" ? .25 : .85), 0, -14);
    for (const sx of [-1, 1]){ groundPlane(s, 3, 44, new THREE.MeshStandardMaterial({ map: tileTex(), color: "#b8b2a6", roughness: .8 }), sx * 4.5, -14, .12); box(.2, .14, 44, mat("#9a968e", .8), sx * 3.05, .07, -14, s.world); }
    for (let z = 4; z > -36; z -= 3) box(.12, .005, 1.4, mat("#e6e2d6", .7), 0, .01, z, s.world, false);
    let i = 0; for (const sx of [-1, 1]) for (let z = 3; z > -36; z -= 5.6){ const h = 6 + hash(i * 7 + sx) * 9; building(s, sx * 7.6, z, 3.2, 5.4, h, i, night); i++; }
    box(.1, 2.4, 3.6, new THREE.MeshStandardMaterial({ color: "#f4f0e2", emissive: "#fff3d6", emissiveIntensity: night ? .9 : .15 }), 5.98, 1.32, -8.2, s.world, false);
    if (o.texts.sign) signBoard(s, [clip(o.texts.sign, 8)], 5.96, 2.95, -8.2, 3.4, .6, { bg: "#2e6f5e", fg: "#ffffff", size: 120, lh: 130, x: 60, y: 30 }, -Math.PI / 2);
    for (let z = -1.8; z > -32; z -= 7.5){ streetLamp(s, 3.25, z, 1, z === -1.8); streetLamp(s, -3.25, z - 3.7, -1); }
    bench(s, 5.4, -5.6, -Math.PI / 2, 1.6);
    backdrop(s, o, 0, 6.5, -38, 70, 24);
    return { seats: [{ x: 5.4, z: -5.3, yaw: -Math.PI / 2, table: false, y: .12 }, { x: 5.4, z: -5.9, yaw: -Math.PI / 2, table: false, y: .12 }],
      stands: [{ x: 4.1, z: -.6, y: .12 }, { x: 3.65, z: -1.2, y: .12 }, { x: 4.6, z: -1.3, y: .12 }, { x: 4.2, z: -1.8, y: .12 }], faceGroup: true,
      walk: [new V3(4.3, .12, -9), new V3(4.3, .12, 1.4)], bgWalk: [[new V3(-4.4, .12, -16), new V3(-4.4, .12, 2)], [new V3(4.9, .12, 2.5), new V3(4.9, .12, -14)]],
      cam: { pos: new V3(2.3, 1.6, 3.4), look: new V3(3.9, 1.15, -2.2) }, view: new V3(0, 3, -30), outdoor: true, fog: [10, 36] };
  },
  park(s, o){ // 河濱公園、散步
    groundPlane(s, 60, 50, new THREE.MeshStandardMaterial({ map: grassTex(o.season), roughness: .95 }), 0, -8);
    groundPlane(s, 60, 2.2, mat("#c9b99a", .9), 0, .2, .01);
    groundPlane(s, 70, 14, new THREE.MeshStandardMaterial({ color: o.weather === "rain" ? "#4a5a66" : "#4d7d9a", roughness: .15, metalness: .35 }), 0, -16, -.05);
    box(70, .3, .4, mat("#9a968e", .8), 0, .1, -9.1, s.world);
    for (let i = 0; i < 9; i++){ const x = -14 + i * 3.6 + hash(i) * 1.5, z = -3.5 - hash(i + 4) * 4.5; tree(s, x, z, .9 + hash(i + 2) * .5, o.season); }
    for (const [x, z] of [[-6, 3.5], [5.5, 4.2]]) tree(s, x, z, 1.1, o.season);
    bench(s, -1.2, -1.75, 0, 1.6); bench(s, 2.6, -1.75, 0, 1.6);
    streetLamp(s, 4.4, -1.3, 1, true);
    backdrop(s, o, 0, 6, -26, 80, 20);
    return { seats: [{ x: -1.5, z: -1.6, yaw: 0, table: false }, { x: -.9, z: -1.6, yaw: 0, table: false }, { x: 2.3, z: -1.6, yaw: 0, table: false }, { x: 2.9, z: -1.6, yaw: 0, table: false }],
      stands: [{ x: .7, z: -.2 }, { x: 1.3, z: -.55 }, { x: .2, z: -.7 }, { x: 1.1, z: .2 }], faceGroup: true,
      walk: [new V3(-7, 0, .1), new V3(5, 0, .1)], bgWalk: [[new V3(9, 0, .5), new V3(-9, 0, .5)]],
      cam: { pos: new V3(1.0, 1.55, 4.4), look: new V3(.2, .95, -1.6) }, view: new V3(0, 1.5, -16), outdoor: true, fog: [14, 40] };
  },
  station(s, o){ // 機場、車站：出發或回來
    const W = 14, D = 15, H = 4.6; const { back: B } = hall(s, o, W, D, H, "214,216,214", new THREE.MeshStandardMaterial({ map: tileTex(), color: "#e8e8e4", roughness: .5 }));
    const gm = new THREE.MeshStandardMaterial({ color: "#bcd6e6", transparent: true, opacity: .18, roughness: .05, metalness: .2 });
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(W, H), gm); gl.position.set(0, H / 2, B); s.world.add(gl);
    for (let x = -W / 2; x <= W / 2; x += 2) box(.08, H, .12, mat("#8e959c", .4, .6), x, H / 2, B, s.world);
    box(W, .1, .14, mat("#8e959c", .4, .6), 0, 2.6, B, s.world);
    groundPlane(s, 60, 30, mat("#7d7f80", .9), 0, B - 15, -.02);
    const pg = new THREE.Group(); pg.position.set(-2, 0, B - 13); pg.rotation.y = .35; s.world.add(pg); const wm = mat("#f2f4f6", .4, .2);
    const fu = cyl(1.1, 1.1, 18, wm, 0, 2.6, 0, pg, 20); fu.rotation.z = Math.PI / 2; box(5, .15, 20, wm, 0, 2.3, -1, pg).rotation.x = 0; box(1, 3.2, 1.6, mat("#2f6db0", .5), -8.6, 4.4, 0, pg);
    backdrop(s, o, 0, 7, B - 30, 90, 26);
    const lines = (o.texts.board ? [clip(o.texts.board, 14)] : []).concat(["台北　　08:45　準時", "大阪　　10:20　登機中", "新加坡　11:05　準時"]).slice(0, 4);
    box(3.5, 1.7, .12, mat("#1a1a1a", .4), 3.6, 3.1, B + 3.0, s.world); signBoard(s, lines, 3.6, 3.1, B + 3.07, 3.3, 1.5, { bg: "#0c0c0c", fg: "#ffc24a", size: 70, lh: 100, x: 40, y: 50 });
    cyl(.04, .04, 1.4, mat("#555", .4, .6), 3.6, 4.0, B + 3.0, s.world, 6);
    const seatRow = (z, yaw, n, x0) => { for (let i = 0; i < n; i++){ const x = x0 + i * .6; box(.52, .06, .46, mat("#3d4f63", .5), x, .45, z, s.world); box(.52, .45, .06, mat("#3d4f63", .5), x, .72, z - Math.cos(yaw) * .22, s.world); }
      box(n * .6, .05, .1, mat("#9aa0a6", .4, .6), x0 + (n - 1) * .3, .2, z, s.world); };
    seatRow(B + 3.4, 0, 7, -2.6); seatRow(B + 4.7, Math.PI, 7, -2.6);
    suitcase(s, -2.9, B + 3.9, "#c9473b", .3); suitcase(s, 1.6, B + 4.15, "#2f6db0", -.2);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) hallLight(s, -4 + i * 4, H - .06, B + 4 + j * 5, 14);
    return { seats: [-.2, .4, -.8, 1.0].map(x => ({ x, z: B + 3.48, yaw: 0, table: false })), stands: [{ x: -2.2, z: B + 6.4 }, { x: -1.6, z: B + 6.9 }, { x: -2.7, z: B + 7.0 }, { x: -1.4, z: B + 6.2 }], faceGroup: true,
      walk: [new V3(4.5, 0, B + 10), new V3(-1.8, 0, B + 6.6)], bgWalk: [[new V3(-5, 0, B + 8), new V3(5, 0, B + 8)]], luggage: true, crowdSeats: [-2.6, -2.0, 1.6, 2.2].map(x => ({ x, z: B + 4.62, yaw: Math.PI })),
      cam: { pos: new V3(2.6, 1.75, B + 11.3), look: new V3(-.8, 1.15, B + 4.6) }, view: new V3(-2, 2.6, B - 13), hall: { W, D, B } };
  },
  classroom(s, o){ // 教室：上課或教課
    const r = room(s, { ...o, w: 8, d: 7, wall: "232,234,226", floor: "tile", window: { x: -2.6, w: 1.8, y: .9, h: 1.3 }, door: { x: 3.95, z: .6, yaw: -Math.PI / 2 } });
    const B = r.back; const bl = (o.texts.board ? [clip(o.texts.board, 14)] : []).concat([]);
    box(3.6, 1.3, .05, mat("#6b4f38", .6), .6, 1.55, B + .05, s.world); signBoard(s, bl.length ? bl : ["　"], .6, 1.55, B + .09, 3.4, 1.15, { bg: "#2e4a3a", fg: "#f2f2e8", size: 96, lh: 110, x: 60, y: 90 });
    box(1.2, .76, .55, mat("#9c7d5a", .6), 2.1, .38, B + 1.3, s.world);
    for (let rr = 0; rr < 3; rr++) for (let c = 0; c < 4; c++){ const x = -2.3 + c * 1.45, z = B + 2.7 + rr * 1.15; box(.62, .04, .45, mat("#c9a77c", .6), x, .72, z, s.world); box(.05, .7, .05, mat("#777", .5, .5), x, .35, z, s.world); }
    for (let i = 0; i < 2; i++) ceilingPanel(s, -1.2 + i * 2.6, B + 3);
    const studs = []; for (let rr = 0; rr < 3; rr++) for (let c = 0; c < 4; c++) studs.push({ x: -2.3 + c * 1.45, z: B + 2.7 + rr * 1.15 + .48, yaw: Math.PI, chair: true, table: true, r: rr, c });
    const order = studs.slice().sort((a, b) => a.r - b.r || Math.abs(a.x - .2) - Math.abs(b.x - .2));
    return { seats: order.slice(0, 4), crowdSeats: order.slice(4), crowdChairs: true, crowdIdle: ["type", null, "phone"],
      stands: [{ x: -.2, z: B + 1.15, yaw: 0, front: true }, { x: 1.2, z: B + 1.3, yaw: -.3 }], mePlaceFor: { present: "stand", talk: "stand" },
      cam: { pos: new V3(2.8, 1.7, B + 6.6), look: new V3(-.3, 1.05, B + 1.9) }, view: new V3(-2.6, 1.5, B - 3), bgLook: new V3(-.2, 1.5, B + 1.15) };
  },
  rooftop(s, o){ // 頂樓、陽台：夜景
    const night = timeOf(o.hour) === "night" || timeOf(o.hour) === "evening";
    groundPlane(s, 16, 12, new THREE.MeshStandardMaterial({ map: noiseTex("150,150,146", 18, "r"), roughness: .9 }), 0, -1);
    box(16, .9, .22, mat("#a5a39c", .9), 0, .45, -4.0, s.world); cyl(.025, .025, 16, mat("#555", .4, .6), 0, 1.1, -4.0, s.world, 6).rotation.z = Math.PI / 2;
    for (let x = -7.5; x <= 7.5; x += 1.5) box(.03, .25, .03, mat("#555", .4, .6), x, 1.0, -4.0, s.world);
    let i = 0; for (let z = -9; z > -24; z -= 4.5) for (let x = -16; x < 16; x += 4.2){ building(s, x + hash(i) * 1.5, z, 3, 3, 4 + hash(i * 3) * 14, i + 20, night); i++; }
    backdrop(s, o, 0, 8, -30, 90, 26);
    const bulbs = new THREE.MeshStandardMaterial({ color: "#fff2c4", emissive: "#ffcf70", emissiveIntensity: 0 }); const holder = { material: bulbs };
    for (let k = 0; k <= 22; k++){ const t = k / 22, x = -5 + t * 10, y = 2.5 - Math.sin(t * Math.PI) * .45; const b = sphere(.035, bulbs, s.world, 8); b.castShadow = false; b.position.set(x, y, -2.6); }
    for (const x of [-5, 5]) cyl(.04, .05, 2.6, mat("#3a3d42", .5, .5), x, 1.3, -2.6, s.world, 8);
    for (const x of [-2.5, 2.5]){ const L = new THREE.PointLight("#ffd28a", 0, 6, 1.6); L.position.set(x, 2.2, -2.6); s.world.add(L); s.lamps.push({ L, shade: holder, bulb: null, base: 6, night: true }); }
    const tm = mat("#e9e4da", .5); cyl(.42, .42, .03, tm, 0, .74, -1.4, s.world, 24); cyl(.04, .04, .72, mat("#333", .5, .5), 0, .36, -1.4, s.world);
    plant(s.world, -4, 0, -3.4, 1.6); plant(s.world, 4.2, 0, -3.3, 1.4); box(1.4, 1.6, 1.4, mat("#b9bcc0", .6, .3), -6.4, .8, -1.5, s.world);
    return { seats: aroundTable(0, -1.4, .78, [Math.PI, Math.PI - 1.1, Math.PI + 1.1, .25]), stands: [{ x: .4, z: -3.5, yaw: Math.PI }, { x: 1.05, z: -3.5, yaw: Math.PI }, { x: -.3, z: -3.5, yaw: Math.PI }],
      cups: true, tableY: .755, cam: { pos: new V3(1.6, 1.5, 1.5), look: new V3(0, 1.0, -2.0) }, view: new V3(0, 2, -20), outdoor: true, fog: [14, 40] };
  },
  party(s, o){ // 聚餐、慶祝、團圓
    const r = room(s, { ...o, w: 9, d: 7, wall: "236,214,190", wood: [120, 80, 52], window: { x: -2.8, w: 1.6, y: .9, h: 1.3 }, door: { x: 4.45, z: .4, yaw: -Math.PI / 2 } });
    const B = r.back, cz = B + 3.0;
    cyl(.9, .9, .05, mat("#f3ede2", .7), 0, .74, cz, s.world, 40); cyl(.1, .3, .72, mat("#6b4a32", .6), 0, .36, cz, s.world, 16);
    cyl(.42, .42, .03, mat("#d9d2c4", .4), 0, .78, cz, s.world, 32);
    for (let i = 0; i < 4; i++){ const a = i * Math.PI / 2 + .4; bowl(s.world, Math.sin(a) * .22, .79, cz + Math.cos(a) * .22, ["#c25b3f", "#7fa35a", "#d9a441", "#e8e1cf"][i]); }
    if (o.props.cake){ cyl(.16, .16, .14, mat("#f6efe4", .6), 0, .87, cz, s.world, 24); cyl(.165, .165, .02, mat("#e86a7c", .6), 0, .95, cz, s.world, 24); }
    pendant(s, 0, 1.85, cz);
    for (const [x, z] of [[-2.2, B + 1.0], [2.4, B + 1.0], [-3.4, cz + 1.4]]){ const ln = sphere(.22, new THREE.MeshStandardMaterial({ color: "#c8352d", emissive: "#ff5a3a", emissiveIntensity: .5, roughness: .6 }), s.world, 14); ln.position.set(x, 2.1, z); ln.scale.y = .85; cyl(.004, .004, .45, mat("#333", .5), x, 2.5, z, s.world, 4, false); }
    if (o.texts.sign) signBoard(s, [clip(o.texts.sign, 8)], .4, 2.05, B + .07, 2.6, .55, { bg: "#a8262a", fg: "#ffd36b", size: 120, lh: 130, x: 70, y: 30 });
    plant(s.world, 3.8, 0, B + .5, 1.6);
    return { seats: aroundTable(0, cz, 1.12, [Math.PI, Math.PI - .85, Math.PI + .85, Math.PI - 1.7, Math.PI + 1.7, -.55, .55, 0]), food: true, tableY: .765, tableC: new V3(0, 0, cz),
      stands: [{ x: 1.6, z: cz - 1.4, yaw: -2.6 }, { x: -1.6, z: cz - 1.4, yaw: 2.6 }],
      cam: { pos: new V3(1.7, 1.95, cz + 3.4), look: new V3(0, .85, cz - .3) }, view: new V3(-2.8, 1.5, B - 3) };
  },
};
// 沿用原本的房間：家裡餐桌、咖啡廳、辦公室、實驗室、醫院、自己的房間
for (const k of ["dinner", "cafe", "office", "lab", "hospital", "home"]) VKIT[k] = (s, o) => {
  const L = LAYOUT[k](s, { ...o, rented: o.rented }); const seats = [];
  const meSeat = { ...L.me, chair: !L.noChairs && !L.meChair, table: !!L.tableY || !!L.day }; if (L.day) meSeat.chair = false;
  seats.push(meSeat); for (const q of L.seats || []) seats.push({ ...q, chair: !L.noChairs, table: !!L.tableY });
  const w = L.windowSpot; const m = L.me;
  const K = { seats, stands: [{ x: w.x - .3, z: w.z + .1, yaw: Math.PI }, { x: w.x + .35, z: w.z + .15, yaw: Math.PI }], food: L.food, cups: L.cups, tableY: L.tableY || (L.day ? .76 : null),
    cam: L.day ? { pos: new V3(m.x + 1.5, 1.5, m.z + 1.7), look: new V3(m.x - .2, .85, m.z - .5) } : { pos: new V3(1.9, 1.65, 2.1), look: new V3(-.1, .9, -.5) }, view: s.winInfo ? new V3(s.winInfo.x, s.winInfo.y + s.winInfo.h / 2, s.winInfo.back - 3) : new V3(w.x, 1.5, w.z - 3), hospital: L.hospital };
  if (L.hospital) K.seats.forEach(q => { q.chair = false; q.table = false; });
  return K;
};
const VKIT_NAMES = { apartment: "自己的新家（客廳）", stage: "台上（發表、典禮、演出）", street: "城市街道", park: "河濱公園", station: "機場或車站", classroom: "教室", rooftop: "頂樓或陽台", party: "聚餐、慶祝、團圓", dinner: "家裡的餐桌", cafe: "咖啡廳", office: "辦公室", lab: "研究室", hospital: "醫院", home: "自己的房間" };

/* v0.24 接觸陰影：放在地上的柔和圓形陰影，讓人和椅子不會像浮在地上 */
let BLOB_TEX = null;
function blobTex(){ if (BLOB_TEX) return BLOB_TEX; const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(.55, "rgba(0,0,0,.22)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); BLOB_TEX = new THREE.CanvasTexture(c); BLOB_TEX.colorSpace = THREE.SRGBColorSpace; return BLOB_TEX; }
function blob(world, x, z, rx, rz, op = 1){ const m = new THREE.Mesh(new THREE.PlaneGeometry(rx * 2, rz * 2), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, opacity: op, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, .004, z); m.renderOrder = 1; world.add(m); return m; }
/* ---------------- 舞台 ---------------- */
class Stage {
  constructor(container, opts = {}){
    this.el = container; this.opts = opts;
    const small = Math.min(innerWidth, innerHeight) < 600;
    this.q = { shadow: small ? 512 : 1024, dpr: Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75) };
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    r.setPixelRatio(this.q.dpr); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.domElement.style.cssText = "display:block;width:100%;height:100%"; container.appendChild(r.domElement);
    // v0.24 暗角：CSS 漸層疊在畫面上，邊角稍暗、視線集中在中間，不增加 GPU 負擔
    { const vg = document.createElement("div"); vg.className = "vignette"; vg.style.cssText = "position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 50%, rgba(10,8,6,.45) 100%)"; if (getComputedStyle(container).position === "static") container.style.position = "relative"; container.appendChild(vg); }
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(48, 16 / 9, .05, 60);
    // v0.24 光照打底：用程式產生的室內環境貼圖，讓材質有柔和反光（不載入 HDRI）
    try { const pm = new THREE.PMREMGenerator(r); this.envTex = pm.fromScene(new RoomEnvironment(r), .04).texture; pm.dispose(); this.scene.environment = this.envTex; } catch (e) { this.envTex = null; }
    // v0.24 泛光：只讓燈泡、窗外亮光這類最亮的地方微微暈開；小螢幕不開
    this.fx = null;
    // v0.26 背景擬真：環境遮蔽（角落、接縫、物件底下的柔和陰影）＋景深（對焦說話的人，背景微糊）；小螢幕不開
    if (!small) try { const rt = new THREE.WebGLRenderTarget(640, 360, { type: THREE.HalfFloatType, samples: 4 }); const c = new EffectComposer(r, rt); c.addPass(new RenderPass(this.scene, this.camera));
      const ao = new GTAOPass(this.scene, this.camera, 640, 360, undefined, { radius: .6, distanceExponent: 2, thickness: 2.5, scale: 2.2, samples: 16 }); ao.blendIntensity = 1; c.addPass(ao); this.ao = ao;
      ao.overrideVisibility = function(){ const cache = this._visibilityCache; this.scene.traverse(o => { cache.set(o, o.visible); const m = o.material; if (o.isPoints || o.isLine || o.isSprite || (m && !Array.isArray(m) && m.transparent && m.opacity < .97)) o.visible = false; }); };
      const bp = new UnrealBloomPass(new THREE.Vector2(640, 360), .5, .4, 4); c.addPass(bp);
      const bk = new BokehPass(this.scene, this.camera, { focus: 2.5, aperture: .0018, maxblur: .003 }); c.addPass(bk); this.bokeh = bk;
      c.addPass(new OutputPass()); this.fx = c; this.bloom = bp; } catch (e) { console.warn("fx off", e); this.fx = null; }
    this.time = 0; this.people = new Map(); this.running = false; this.onSound = null; this.shakeT = 0;
    this.camT = new V3(); this.camLook = new V3(); this.camInit = false;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(container); this.resize();
    this.loop = this.loop.bind(this); this.hot = []; this.ray = new THREE.Raycaster();
    const cv = r.domElement; cv.style.touchAction = opts.touch || "none";
    this.view = { yaw: 0, pitch: 0, zoom: 1 }; this.viewMode = "shoulder"; let drag = null;
    cv.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, yaw: this.view.yaw, pitch: this.view.pitch, moved: false, id: e.pointerId, touch: e.pointerType !== "mouse" }; });
    cv.addEventListener("pointermove", e => {
      if (drag && e.pointerId === drag.id){ const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (!drag.moved && Math.hypot(dx, dy) > 6 && !(drag.touch && opts.touch === "pan-y" && Math.abs(dy) > Math.abs(dx))){ drag.moved = true; try { cv.setPointerCapture(e.pointerId); } catch {} this.onHover && this.onHover(null); }
        if (drag.moved){ this.dragAt = this.time; this.view.yaw = clamp(drag.yaw - dx * .006, -1.9, 1.9); this.view.pitch = clamp(drag.pitch + dy * .004, -.35, .9); cv.style.cursor = "grabbing"; return; } }
      if (e.pointerType === "mouse") this.pointer(e, false); });
    const end = () => { if (drag && drag.moved){ this.suppressClick = true; setTimeout(() => { this.suppressClick = false; }, 60); cv.style.cursor = ""; } drag = null; };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    cv.addEventListener("click", e => { if (!this.suppressClick) this.pointer(e, true); });
    cv.addEventListener("dblclick", () => this.resetView());
    if (opts.wheel) cv.addEventListener("wheel", e => { e.preventDefault(); this.view.zoom = clamp(this.view.zoom * (e.deltaY > 0 ? 1.08 : .93), .5, 1.8); }, { passive: false });
    cv.addEventListener("pointerleave", () => { cv.style.cursor = ""; this.onHover && this.onHover(null); });
  }
  sound(k){ try { this.onSound && this.onSound(k); } catch {} }
  resetView(){ this.view = { yaw: 0, pitch: 0, zoom: 1 }; }
  setViewMode(m){ this.viewMode = m; this.resetView(); this.camInit = false; }
  pointer(e, click){
    const cv = this.renderer.domElement, rc = cv.getBoundingClientRect(); const x = (e.clientX - rc.left) / rc.width, y = (e.clientY - rc.top) / rc.height;
    this.ray.setFromCamera(new THREE.Vector2(x * 2 - 1, -(y * 2 - 1)), this.camera);
    const live = this.hot.filter(h => !(h.person && (h.person.gone || h.person.leave)));
    const hits = this.ray.intersectObjects(live.map(h => h.obj), true); let hot = null;
    if (hits.length){ let o = hits[0].object; while (o && !hot){ hot = live.find(h => h.obj === o); o = o.parent; } }
    cv.style.cursor = hot ? "pointer" : "";
    const at = { x: x * 100, y: y * 100 };
    if (click){ if (hot) this.onHot && this.onHot(hot.id, at, hot.label); else this.onHot && this.onHot(null, at); }
    else this.onHover && this.onHover(hot ? { id: hot.id, label: hot.label, ...at } : null);
  }
  after(sec, fn){ (this.timers || (this.timers = [])).push({ at: this.time + sec, fn }); }
  thump(){ this.shakeT = .35; this.sound("thump"); for (const b of this.wobble || []) b.v = .02; }
  resize(){ const w = this.el.clientWidth || 640, h = this.el.clientHeight || 300; this.renderer.setSize(w, h, false); if (this.fx){ this.fx.setPixelRatio(this.renderer.getPixelRatio()); this.fx.setSize(w, h); } this.camera.aspect = w / h;
    const pad = Math.min(this.padLeft || 0, w * .5), vis = (w - pad) / h; this.camera.fov = vis < 1.2 ? 64 : pad > 0 ? 56 : 48; this.shotMul = pad > 0 ? 1.35 : 1;
    if (pad > 0) this.camera.setViewOffset(w, h, -pad / 2, 0, w, h); else this.camera.clearViewOffset(); this.camera.updateProjectionMatrix(); }
  setPadLeft(px){ px = Math.max(0, Math.round(px || 0)); if (px === (this.padLeft || 0)) return; this.padLeft = px; this.renderer.setPixelRatio(px > 0 ? Math.min(this.q.dpr, 1.25) : this.q.dpr); this.resize(); }
  build(spec){
    // 清空
    if (this.world){ this.scene.remove(this.world); this.world.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.timers = []; this.world = new THREE.Group(); this.scene.add(this.world); this.people.clear(); this.lamps = []; this.npcs = []; this.sky = null; this.rain = null; this.leds = null; this.board = null; this.clockHands = null; this.steams = []; this.wobble = [];
    this.vis = null; this.scene.fog = null; this.surfaces = null;
    this.spec = spec; const loc = spec.loc; this.doorObj = this.winHot = this.laptopObj = this.phoneObj = this.bedObj = this.dayLaptop = null;
    const kind = ["family", "rented"].includes(loc) ? "home" : loc;
    const L = this.layout = (LAYOUT[kind] || LAYOUT.dinner)(this, { hour: spec.hour, weather: spec.weather, season: spec.season, rented: loc === "rented", props: spec.props || {} });
    // 光
    this.hemi = new THREE.HemisphereLight("#dfe8f0", "#6b5a48", .6); this.world.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff3e0", 2); this.sun.castShadow = true; this.sun.shadow.mapSize.set(this.q.shadow * 2, this.q.shadow * 2);
    Object.assign(this.sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: .5, far: 20 }); this.sun.shadow.bias = -.0006; this.sun.shadow.normalBias = .02;
    const wi = this.winInfo; this.sun.position.set(wi.x - 1.2, 4.2, wi.back - 4); this.sun.target.position.set(wi.x + .8, 0, wi.back + 2.5); this.world.add(this.sun, this.sun.target);
    this.fill = new THREE.PointLight("#ffe9cc", 0, 9, 1.8); this.fill.position.set(.3, 2.4, .6); this.world.add(this.fill);
    this.amb = new THREE.AmbientLight("#ffffff", .12); this.world.add(this.amb);
    this.windowLook = new V3(wi.x, wi.y + wi.h / 2, wi.back - 3);
    // 人物
    const seats = L.seats || []; const n = (spec.people || []).length;
    const pick = n === 1 ? [1] : n === 2 ? [0, 2] : [0, 1, 2];
    (spec.people || []).forEach((pp, i) => {
      const sd = seats[pick[i]]; const p = new Person(this, pp); const pos = new V3(sd.x, 0, sd.z);
      let ch = null; if (!L.noChairs){ ch = chair(this.world, sd.x, sd.z - .02, sd.yaw, pp.chair || "#6b4f38"); }
      p.seat = { pos, yaw: sd.yaw, chair: ch, chairBase: ch ? ch.position.clone() : null }; if (!L.day) blob(this.world, sd.x, sd.z, .42, .42, .9);
      if (L.food){ p.bowl = bowl(this.world, sd.x, L.tableY - .025, L.tableFar + .2, ["#e8e1cf", "#d9a441", "#7fa35a"][i % 3]); p.chop = chopsticks(this.world, sd.x + .11, L.tableY - .02, L.tableFar + .22); this.steams.push(p.bowl); this.wobble.push({ o: p.bowl, base: p.bowl.position.y, v: 0 }); }
      if (L.cups){ p.cup = cup(this.world, sd.x + .14, L.tableY - .02, L.tableFar + .18, i % 2 ? "#f3e7d6" : "#ffffff"); this.steams.push(p.cup); }
      if (L.food && !p.cup){ p.cup = cup(this.world, sd.x - .16, L.tableY - .02, L.tableFar + .16, "#e8f0f4"); }
      if (L.hospital) p.restHands = { L: new V3(-.12, .55, .3), R: new V3(.12, .55, .3) };
      if (spec.enter){ p.standAt(L.door.clone(), -Math.PI / 2); p.pending = true; } else p.sitAt(p.seat);
      this.people.set(pp.name, p);
    });
    if (L.food){ for (let i = 0; i < 3; i++){ const b = bowl(this.world, -.45 + i * .45, L.tableY - .025, -.4, ["#c25b3f", "#7fa35a", "#d9a441"][i]); this.steams.push(b); this.wobble.push({ o: b, base: b.position.y, v: 0 }); } }
    // 玩家（自己）
    const me = this.me = new Person(this, { name: "me", col: spec.meCol || "#4f6d8a", hair: "#1f2228" });
    const mp = L.me; me.seat = { pos: new V3(mp.x, 0, mp.z), yaw: mp.yaw, chair: null };
    if (!L.noChairs && !L.day){ me.seat.chair = chair(this.world, mp.x, mp.z + .02, mp.yaw, "#5a4636"); me.seat.chairBase = me.seat.chair.position.clone(); }
    me.sitAt(me.seat); if (!L.day) blob(this.world, mp.x, mp.z, .42, .42, .9);
    if (!L.day && spec.dayMode){ this.dayCam = true; me.idle = "type"; me.typeZ = .36; this.dayLaptop = laptop(this.world, mp.x, L.tableY - .005, mp.z - .42, Math.PI); if (spec.props?.noodles){ cyl(.06, .05, .1, mat("#f1eadb", .6), mp.x + .3, L.tableY + .05, mp.z - .35, this.world); cyl(.061, .061, .02, mat("#c8473b", .6), mp.x + .3, L.tableY + .08, mp.z - .35, this.world); } }
    else this.dayCam = false;
    if (L.cups && !L.day){ me.cup = cup(this.world, mp.x + .18, L.tableY - .02, -.05); this.steams.push(me.cup); }
    if (L.food && !L.day){ me.cup = cup(this.world, mp.x + .2, L.tableY - .02, mp.z - .42, "#e8f0f4"); }
    if (!L.day && !this.dayCam && L.tableY){ this.phoneObj = box(.075, .008, .15, mat("#1e2228", .3, .3), mp.x - .22, L.tableY + .004, mp.z - .38, this.world); this.phoneObj.rotation.y = -.25; }
    if (L.day){ me.idle = spec.dayMode === "bed" || spec.dayMode === "phone" ? null : "type"; me.typeZ = .4;
      if (spec.dayMode === "bills"){ me.idle = null; me.restHands = { L: new V3(-.15, .79, .38), R: new V3(.05, 1.12, .2) }; }
      if (spec.dayMode === "bed" || spec.dayMode === "phone"){ me.lying = true; me.seat = null; me.root.position.set(L.bed.x, .6, L.bed.z + 1.1); me.yaw = 0; me.root.rotation.set(-Math.PI / 2, 0, 0); me.state = "lying"; me.sitT = 1; me.hips.position.y = .92; }
      if (spec.props?.cup !== false){ me.cup = cup(this.world, mp.x - .25, .76, L.deskZ + .1, "#ffffff"); this.steams.push(me.cup); } }
    this.msg = null;
    if (L.day && spec.msg){ me.idle = null; me.restHands = null; if (this.phoneObj) this.phoneObj.visible = false; this.msg = { up: !spec.msgDown, typing: 0, buzz: 0, glow: spec.msgDown ? 0 : 1, kind: me.lying ? "bed" : "desk" }; this.makePhone(); this.phoneObj = this.msg.body; }
    // 背景人物
    if (L.hospital){ const lap = { L: new V3(-.12, .56, .3), R: new V3(.12, .56, .3) }; this.me.restHands = lap; }
    for (const nn of this.npcs){ const p = new Person(this, nn); if (L.hospital) p.restHands = { L: new V3(-.12, .56, .3), R: new V3(.12, .56, .3) }; if (nn.stand){ p.standAt(nn.stand, nn.yaw); } else { p.seat = { pos: new V3(nn.seat.x, 0, nn.seat.z), yaw: nn.seat.yaw }; p.sitAt(p.seat); }
      p.idle = nn.idle; p.bg = true; p.faceAway = nn.faceAway; this.people.set(nn.name, p); }
    // 熱氣粒子
    this.steamPts = []; const sm = new THREE.SpriteMaterial({ map: dotTex(), color: "#ffffff", transparent: true, opacity: .25, depthWrite: false });
    for (const src of this.steams) for (let i = 0; i < 6; i++){ const sp = new THREE.Sprite(sm.clone()); sp.scale.setScalar(.06); this.world.add(sp); this.steamPts.push({ sp, src, t: Math.random() * 3 }); }
    // 灰塵（白天陽光）
    this.dust = null; if (timeOf(spec.hour) !== "night" && spec.weather === "clear"){ const n2 = 140, pos = new Float32Array(n2 * 3); for (let i = 0; i < n2; i++) pos.set([wi.x + (Math.random() - .3) * 2, Math.random() * 2.2, wi.back + Math.random() * 3], i * 3);
      const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.BufferAttribute(pos, 3)); this.dust = new THREE.Points(gg, new THREE.PointsMaterial({ map: dotTex(), size: .02, transparent: true, opacity: .5, depthWrite: false, color: "#fff4d8" })); this.world.add(this.dust); }
    this.applyLight(spec, true);
    this.hot = []; const HOT = (obj, id, label, person) => { if (obj) this.hot.push({ obj, id, label, person }); };
    for (const [n, p] of this.people) if (!p.bg) HOT(p.root, "person:" + n, n, p);
    HOT(this.me.cup, "cup", "你的杯子"); HOT(this.phoneObj, "phone", "你的手機"); HOT(this.winHot, "window", "窗戶"); HOT(this.doorObj, "door", "門");
    HOT(this.laptopObj || this.dayLaptop, "laptop", "筆電"); HOT(this.bedObj, "bed", "床");
    this.camInit = false;
    if (spec.enter) this.enterAll();
  }
  applyLight(spec, instant){
    const t = timeOf(spec.hour), rain = spec.weather === "rain", cloud = spec.weather === "cloud";
    const SUN = { morning: ["#ffd9b0", 2.2], day: ["#fff4e2", 3.0], evening: ["#ff9a5a", 1.6], night: ["#8fa6ff", .25] }[t];
    let si = SUN[1] * (rain ? .25 : cloud ? .55 : 1);
    this.sun.color.set(SUN[0]); this.sun.intensity = si;
    const HEMI = { morning: ["#dfe8f0", "#7a6a58", .8], day: ["#e6eef5", "#7a6a58", 1.0], evening: ["#f0c8a8", "#5a4a3e", .7], night: ["#4a5578", "#2a2420", .45] }[t];
    this.hemi.color.set(HEMI[0]); this.hemi.groundColor.set(HEMI[1]); this.hemi.intensity = HEMI[2] * (rain ? .75 : 1);
    const lampsOn = spec.msg === "bed" && t === "night" ? false : t === "night" || t === "evening" || rain || this.layout.office || this.layout.hospital || (this.spec.loc === "lab");
    for (const l of this.lamps){ const on = lampsOn || l.panel; l.L.intensity = on ? l.base * (l.panel ? 1 : 1) : 0; if (l.shade.material.emissive) l.shade.material.emissiveIntensity = on ? (l.panel ? 1.2 : .6) : 0; if (l.bulb) l.bulb.material.emissiveIntensity = on ? (this.fx ? 14 : 2.5) : 0; }
    this.fill.intensity = lampsOn ? (t === "night" ? 9 : 6) : 3;
    this.amb.intensity = t === "night" ? .1 : .18;
    this.scene.background = new THREE.Color(t === "night" ? "#0b0f1c" : "#cfd8df");
    this.renderer.toneMappingExposure = t === "night" ? 1.25 : 1.05;
    // 夜晚房間沒開燈時太暗：補一點
    if (t === "night" && !this.lamps.length) this.fill.intensity = 12;
    if (spec.msg === "bed" && t === "night"){ this.fill.intensity = .2; this.hemi.intensity = .12; this.amb.intensity = .05; this.renderer.toneMappingExposure = 1.3; }
    // v0.24 光線對比：夜晚把環境光壓低、燈光加強，做出燈下的暖色光區；辦公室降曝光避免整片死白
    if (t === "night" && !(spec.msg === "bed")){ this.hemi.intensity *= .6; this.amb.intensity *= .5; for (const l of this.lamps) if (l.L.intensity > 0) l.L.intensity *= 1.35; this.fill.intensity *= .5; }
    if (this.layout.office) this.renderer.toneMappingExposure *= .86;
    this.setEnv(t === "night" ? (spec.msg === "bed" ? .02 : .06) : t === "evening" ? .12 : .22);
  }
  // v0.24：環境貼圖強度隨時間變化；環境貼圖本身會補光，所以半球光同步調低
  setEnv(k){ if (this.bloom) this.bloom.enabled = k <= .06; if (!this.envTex) return; this.hemi.intensity *= .9; this.world.traverse(o => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) if (m.isMeshStandardMaterial) m.envMapIntensity = k; }); }
  makePhone(){ const M = this.msg, g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(.072, .148, .009), mat("#16191e", .35, .4)); body.castShadow = true; g.add(body);
    const cv = document.createElement("canvas"); cv.width = 64; cv.height = 128; const x = cv.getContext("2d");
    x.fillStyle = "#eef2f7"; x.fillRect(0, 0, 64, 128); x.fillStyle = "#c9d3de"; x.fillRect(0, 0, 64, 12);
    const rows = [[4, 20, 34, "#ffffff"], [26, 34, 34, "#9fd88c"], [4, 48, 40, "#ffffff"], [4, 60, 24, "#ffffff"], [30, 76, 30, "#9fd88c"], [4, 92, 38, "#ffffff"]];
    for (const [rx, ry, rw, c] of rows){ x.fillStyle = c; x.fillRect(rx, ry, rw, 9); }
    x.fillStyle = "#ffffff"; x.fillRect(0, 114, 64, 14);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(.064, .136), new THREE.MeshBasicMaterial({ map: tex, color: "#ffffff" })); scr.position.z = .0047; g.add(scr);
    const light = new THREE.PointLight("#bcd0ff", 0, 1.3, 2); light.position.z = .14; g.add(light);
    this.world.add(g); Object.assign(M, { g, body, scr, light }); }
  setPhone(o){ const M = this.msg; if (!M) return; if ("down" in o) M.up = !o.down; if (o.typing) M.typing = .7; }
  buzz(){ const M = this.msg; if (!M) return; M.buzz = .9; this.sound("buzz"); if (!M.up) this.after(.7, () => { M.up = true; }); }
  updatePhone(dt, t){ const M = this.msg; if (!M || !M.g) return; const me = this.me;
    const bodyUp = new V3(0, 1, 0).applyQuaternion(me.root.quaternion);
    M.typing = Math.max(0, M.typing - dt); M.buzz = Math.max(0, M.buzz - dt);
    const grip = arm => { const w = arm.wr.getWorldPosition(new V3()), e = arm.el.getWorldPosition(new V3()); return w.addScaledVector(w.clone().sub(e).normalize(), .055); };
    if (M.up){ const mid = me.rig && me.rig.hf ? rigHand(me, "L").c.add(rigHand(me, "R").c).multiplyScalar(.5) : grip(me.armL).add(grip(me.armR)).multiplyScalar(.5);   // 用模型手掌中心，手機才會真的在掌心
      M.g.position.lerp(mid, Math.min(1, dt * 14)); M.g.up.copy(bodyUp); M.g.lookAt(me.headWorld()); }
    else { const rest = M.kind === "bed" ? me.local(new V3(.03, 1.2, .15)) : me.local(new V3(.14, .772, .4));
      M.g.position.lerp(rest, Math.min(1, dt * 6)); M.g.up.copy(M.kind === "bed" ? bodyUp : new V3(0, 0, -1)); M.g.lookAt(M.g.position.clone().add(new V3(0, 1, 0))); }
    if (M.buzz > 0){ M.g.position.x += Math.sin(t * 90) * .0025 * (M.buzz / .9); }
    const want = M.buzz > 0 ? 1 : M.up ? 1 : 0; M.glow += (want - M.glow) * Math.min(1, dt * (want > M.glow ? 10 : 1.2));
    const k = M.glow; M.scr.material.color.setRGB(.05 + k * .95, .06 + k * .94, .08 + k * .92);
    M.light.intensity = k * (M.kind === "bed" ? .45 : .35) * (M.buzz > 0 ? 1.3 : 1); }
  /* ---- 理想畫面：沒有對話、沒有點選，只是演一段 ---- */
  buildVision(spec){
    if (this.world){ this.scene.remove(this.world); this.world.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.timers = []; this.world = new THREE.Group(); this.scene.add(this.world); this.people.clear(); this.lamps = []; this.npcs = []; this.sky = null; this.rain = null; this.leds = null; this.board = null; this.clockHands = null; this.steams = []; this.wobble = []; this.vfacades = [];
    this.spec = spec; this.msg = null; this.dayCam = false; this.dust = null; this.hot = []; this.roomDims = null; this.winInfo = null; this.meSpeaking = false;
    this.doorObj = this.winHot = this.laptopObj = this.phoneObj = this.bedObj = this.dayLaptop = null;
    const o = { hour: spec.hour ?? 19, weather: spec.weather || "clear", season: spec.season || "summer", rented: !!spec.rented, props: spec.props || {}, texts: spec.texts || {} };
    const kit = VKIT[spec.kit] ? spec.kit : "apartment";
    const K = this.layout = VKIT[kit](this, o); K.kit = kit; if (K.hall) this.roomDims = null;
    // 光
    this.hemi = new THREE.HemisphereLight("#dfe8f0", "#6b5a48", .6); this.world.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff3e0", 2); this.sun.castShadow = true; this.sun.shadow.mapSize.set(this.q.shadow * 2, this.q.shadow * 2);
    const ext = K.outdoor || K.hall ? 9 : 5; Object.assign(this.sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: .5, far: 40 }); this.sun.shadow.bias = -.0006; this.sun.shadow.normalBias = .02;
    const T = timeOf(o.hour), wi = this.winInfo, foc = K.cam.look;
    if (K.outdoor){ const sp = T === "evening" ? new V3(-9, 3.2, -14) : T === "morning" ? new V3(9, 4, -8) : T === "night" ? new V3(-5, 9, -6) : new V3(5, 11, 3); this.sun.position.copy(foc).add(sp); this.sun.target.position.copy(foc); }
    else if (wi){ this.sun.position.set(wi.x - 1.2, 4.2, wi.back - 4); this.sun.target.position.set(wi.x + .8, 0, wi.back + 2.5); }
    else { this.sun.position.set(foc.x - 2, 9, (K.hall ? K.hall.B : -6) - 8); this.sun.target.position.copy(foc); }
    this.world.add(this.sun, this.sun.target);
    this.fill = new THREE.PointLight("#ffe9cc", 0, 12, 1.6); this.fill.position.copy(K.cam.pos).lerp(foc, .35).add(new V3(0, 1.3, 0)); this.world.add(this.fill);
    this.amb = new THREE.AmbientLight("#ffffff", .15); this.world.add(this.amb);
    this.windowLook = K.view.clone();
    // 人
    const V = this.vis = { K, cast: [], talkers: [], turn: 0, nextTurn: 0, cam: K.cam };
    const usedS = new Set(), usedT = new Set(); const lap = () => ({ L: new V3(-.12, .56, .3), R: new V3(.12, .56, .3) });
    const takeSeat = () => { const i = K.seats.findIndex((q, j) => !usedS.has(j)); if (i < 0) return null; usedS.add(i); return K.seats[i]; };
    const takeStand = pref => { let i = pref ? K.stands.findIndex((q, j) => !usedT.has(j) && q[pref]) : -1; if (i < 0) i = K.stands.findIndex((q, j) => !usedT.has(j)); if (i < 0) return null; usedT.add(i); return K.stands[i]; };
    const seatP = (p, q) => { const pos = new V3(q.x, q.y || 0, q.z), f = new V3(Math.sin(q.yaw), 0, Math.cos(q.yaw));
      const ch = q.chair ? chair(this.world, q.x - f.x * .02, q.z - f.z * .02, q.yaw, "#5a4636") : null; if (ch) ch.position.y = q.y || 0;
      p.seat = { pos, yaw: q.yaw, chair: ch, chairBase: ch ? ch.position.clone() : null }; p.sitAt(p.seat); if (!q.table) p.restHands = lap();
      const ty = q.tableY || K.tableY || (K.dinner ? K.dinner.y : .76);
      if (q.table && K.food){ const b = pos.clone().addScaledVector(f, .42); p.bowl = bowl(this.world, b.x, ty - .025, b.z, ["#e8e1cf", "#d9a441", "#7fa35a"][this.people.size % 3]); p.chop = chopsticks(this.world, b.x + f.z * .1, ty - .02, b.z - f.x * .1); this.steams.push(p.bowl); }
      if (q.table && (K.cups || K.food || K.dinner)){ const c = pos.clone().addScaledVector(f, .4).add(new V3(f.z * -.16, 0, f.x * .16)); p.cup = cup(this.world, c.x, ty - .02, c.z, "#ffffff"); if (K.cups) this.steams.push(p.cup); }
      p.visSeat = q; };
    const standP = (p, q) => { p.standAt(new V3(q.x, q.y || 0, q.z), q.yaw ?? 0); p.visStand = q; };
    const cast = (spec.cast || []).slice(0, 6).map(c => ({ ...c }));
    if (!cast.some(c => c.me)) cast.unshift({ me: true, act: "idle" });
    cast.sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0));
    const walkers = []; let k = 0;
    const PAL = ["#8c6e5a", "#6e7f8c", "#7a8c6e", "#8c7a9a", "#9a7a5a", "#5a7a8c"];
    for (const c of cast){
      const lk = c.look || {}; const p = new Person(this, c.me ? { name: "me", col: spec.meCol || "#4f6d8a", hair: "#1f2228" } : { name: c.name || `_v${k}`, col: lk.col || PAL[k % PAL.length], hair: lk.hair, long: lk.long, scale: lk.scale }); k++;
      if (c.me) this.me = p; else this.people.set(p.name, p);
      p.visAct = c.act || "idle";
      let place = c.place || (c.act === "walk" ? "walk" : null);
      if (!place && c.me) place = (K.mePlaceFor && K.mePlaceFor[c.act]) || K.mePlace || "seat";
      if (c.act === "present" && K.stands.some(q => q.podium || q.front)) place = "stand";
      if (place === "walk" && !K.walk) place = "stand";
      if (place === "walk"){ walkers.push(p); }
      else if (place === "stand"){ const q = takeStand(c.me && (c.act === "present" || c.act === "talk") ? (K.stands.some(z => z.podium) ? "podium" : "front") : null); if (q) standP(p, q); else { const q2 = takeSeat(); q2 ? seatP(p, q2) : walkers.push(p); } }
      else { const q = takeSeat(); if (q) seatP(p, q); else { const q2 = takeStand(); q2 ? standP(p, q2) : walkers.push(p); } }
      const A = p.visAct, every = (g, e, d) => V.cast.push({ p, g, every: e, dur: d, next: this.time + 1 + Math.random() * e * .6 });
      if (A === "talk" || A === "present") V.talkers.push(p);
      if (A === "present") every("point", 5.5, 1.6);
      if (A === "listen") every("nod", 4, 1.1);
      if (A === "laugh"){ every("laugh", 4.2, 1.5); V.talkers.push(p); }
      if (A === "clap") every("clap", 5, 2.2);
      if (A === "cheer") every("cheer", 6, 1.8);
      if (A === "wave") every("wave", 6, 1.8);
      if (A === "hug") every("nod", 5, 1.1);
      if (A === "type") p.idle = p.visSeat?.table ? "type" : "phone";
      if (A === "phone" || A === "read") p.idle = "phone";
      if (A === "eat") every(p.chop ? "chop" : "sip", 5, p.chop ? 3.4 : 2.6);
      if (A === "sip") every("sip", 6, 2.8);
      if (A === "look") p.visLook = K.view.clone();
    }
    // 站著的人彼此面對
    const standers = [this.me, ...this.people.values()].filter(p => p.visStand);
    for (const p of standers){ if (p.visStand.yaw !== undefined && !K.faceGroup) continue;
      const others = standers.filter(q => q !== p); let tgt;
      if (others.length){ tgt = others.reduce((a, q) => a.add(q.root.position), new V3()).divideScalar(others.length); }
      else tgt = K.cam.pos.clone().lerp(K.cam.look, .5);
      const d = tgt.sub(p.root.position); const yaw = Math.atan2(d.x, d.z) + (others.length ? 0 : .35); p.yaw = yaw; p.faceYaw = yaw; p.root.rotation.y = yaw; }
    // 一起走的人
    walkers.forEach((p, i) => { const [a, b] = K.walk; const side = new V3(b.z - a.z, 0, -(b.x - a.x)).normalize().multiplyScalar(i * .6); const A = a.clone().add(side), Bp = b.clone().add(side);
      p.standAt(A, Math.atan2(Bp.x - A.x, Bp.z - A.z)); const go = (from, to) => p.walkTo([to], () => this.after(2.2, () => go(to, from))); this.after(.4, () => go(A, Bp)); });
    // 背景人物
    const crowd = clamp(spec.crowd ?? (K.crowdSeats ? .6 : .3), 0, 1);
    const cs = (K.crowdSeats || []).slice(0, Math.round((K.crowdSeats || []).length * crowd)).slice(0, 9);
    cs.forEach((q, i) => { const p = new Person(this, { name: `_bg${i}`, col: PAL[(i + 3) % PAL.length], hair: hash(i) < .3 ? "#6a5a4a" : "#2a2420", long: hash(i + 7) < .45 });
      const pos = new V3(q.x, 0, q.z); const ch = K.crowdChairs ? chair(this.world, q.x, q.z + .02, q.yaw, "#5a4636") : null; p.seat = { pos, yaw: q.yaw, chair: ch, chairBase: ch ? ch.position.clone() : null }; p.sitAt(p.seat);
      p.bg = true; p.idle = K.crowdIdle ? K.crowdIdle[i % K.crowdIdle.length] : null; if (!K.crowdChairs && !K.crowdIdle) p.restHands = lap(); this.people.set(p.name, p); });
    if (K.bgWalk && crowd > 0) K.bgWalk.slice(0, crowd > .5 ? 2 : 1).forEach(([a, b], i) => { const p = new Person(this, { name: `_bw${i}`, col: PAL[(i + 4) % PAL.length], long: i % 2 === 1 }); p.bg = true; p.speed = .8 + i * .15;
      p.standAt(a.clone(), Math.atan2(b.x - a.x, b.z - a.z)); const go = (f, t2) => p.walkTo([t2], () => { p.root.position.copy(f); p.standAt(f.clone(), Math.atan2(t2.x - f.x, t2.z - f.z)); this.after(1 + i, () => go(f, t2)); }); this.after(.2 + i * 2, () => go(a, b)); this.people.set(p.name, p); });
    if (K.luggage && this.me && cast[0].act !== "walk"){ const mp = this.me.root.position; suitcase(this, mp.x + .45, mp.z + .25, "#3a6a5a", -.4); }
    // 雨
    if (o.weather === "rain" && K.outdoor){ const n = 700, pos = new Float32Array(n * 6), c = K.cam.look;
      for (let i = 0; i < n; i++){ const x = c.x + (Math.random() - .5) * 16, y = Math.random() * 3.2, z = c.z + (Math.random() - .6) * 16; pos.set([x, y, z, x - .01, y - .12, z], i * 6); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#c9d8e6", transparent: true, opacity: .45 })); this.world.add(this.rain); }
    this.steamPts = []; const sm = new THREE.SpriteMaterial({ map: dotTex(), color: "#ffffff", transparent: true, opacity: .25, depthWrite: false });
    for (const src of this.steams) for (let i = 0; i < 5; i++){ const s2 = new THREE.Sprite(sm.clone()); s2.scale.setScalar(.06); this.world.add(s2); this.steamPts.push({ sp: s2, src, t: Math.random() * 3 }); }
    this.visionLight(spec, K);
    this.camInit = false; this.time0 = this.time;
  }
  visionLight(spec, K){
    const t = timeOf(spec.hour ?? 19), rain = spec.weather === "rain", cloud = spec.weather === "cloud", out = !!K.outdoor, dim = !!spec.dim;
    const SUN = { morning: ["#ffd9b0", 2.4], day: ["#fff4e2", 3.2], evening: ["#ff9a5a", 2.0], night: ["#8fa6ff", .3] }[t];
    this.sun.color.set(SUN[0]); this.sun.intensity = SUN[1] * (rain ? .2 : cloud ? .5 : 1) * (out ? 1 : K.hall ? .45 : .9);
    const HE = { morning: ["#dfe8f0", "#7a6a58", .9], day: ["#e6eef5", "#7a6a58", 1.1], evening: ["#f0c8a8", "#5a4a3e", .75], night: ["#4a5578", "#2a2420", .4] }[t];
    this.hemi.color.set(HE[0]); this.hemi.groundColor.set(HE[1]); this.hemi.intensity = HE[2] * (out ? 1.15 : 1) * (rain ? .75 : 1) * (dim ? .6 : 1);
    const dark = t === "night" || t === "evening" || rain;
    for (const l of this.lamps){ const on = l.always || (l.panel && !out) || (l.night ? dark : (dark || !!K.hall)); l.base0 = l.base0 ?? l.base; const kk = on ? (dim ? .3 : 1) : 0;
      l.base = l.base0 * kk; l.L.intensity = l.base; const sm = l.shade && l.shade.material; if (sm && "emissiveIntensity" in sm) sm.emissiveIntensity = on ? (l.panel ? 1.2 : 1.4) * (dim ? .4 : 1) : 0; }
    for (const m of this.vfacades || []) m.emissiveIntensity = dark ? 1.1 : 0;
    this.fill.intensity = (out ? (dark ? 1.5 : 1) : K.hall ? 6 : dark ? 7 : 4) * (dim ? .35 : 1);
    this.amb.intensity = t === "night" ? .12 : .2;
    const bg = out ? ({ morning: "#cfdbe6", day: "#bcd3e6", evening: "#d9a58a", night: "#0b1026" }[t]) : (t === "night" ? "#0b0f1c" : "#cfd8df");
    this.scene.background = new THREE.Color(rain && out ? (t === "night" ? "#0a0d18" : "#8c96a0") : bg);
    this.scene.fog = K.fog ? new THREE.Fog(this.scene.background.clone(), K.fog[0], K.fog[1]) : null;
    this.renderer.toneMappingExposure = t === "night" ? 1.25 : out ? .98 : 1.05;
    this.setEnv(t === "night" ? .06 : t === "evening" ? .12 : out ? .3 : .22);
  }
  updateVision(dt, t){ const V = this.vis; if (!V) return;
    if (V.talkers.length && t > V.nextTurn){ V.turn = (V.turn + 1) % V.talkers.length; V.nextTurn = t + 2.6 + Math.random() * 2.4; }
    const sp = V.talkers[V.turn];
    for (const p of V.talkers) p.speaking = p === sp && !p.gest;
    this.meSpeaking = !!sp && sp === this.me && !this.me.gest;
    for (const c of V.cast){ if (t > c.next){ c.next = t + c.every * (.7 + Math.random() * .6); if (!c.p.gest && c.p.state !== "walking") c.p.gesture(c.g, c.dur); } }
  }
  setLighting(spec){ // 每天畫面：同一個地點只換光線與天氣
    const same = this.spec && this.spec.loc === spec.loc && this.spec.dayMode === spec.dayMode && this.spec.weather === spec.weather && JSON.stringify(this.spec.props) === JSON.stringify(spec.props) && timeOf(this.spec.hour) === timeOf(spec.hour) && this.spec.season === spec.season;
    if (!same) this.build(spec); else { this.spec.hour = spec.hour; this.applyLight(spec); }
  }
  enterAll(){ const L = this.layout; let delay = 0;
    for (const p of this.people.values()){ if (!p.pending) continue; p.pending = false; const sf = new V3(Math.sin(p.seat.yaw), 0, Math.cos(p.seat.yaw)); const stand = p.seat.pos.clone().addScaledVector(sf, -.08);
      const mid = stand.clone().addScaledVector(sf, -.55).add(new V3(L.door.x > 0 ? .5 : -.5, 0, 0)); p.seat.chairOut = true;
      this.after(delay, () => { p.state = "walking"; p.path = [mid, stand]; p.onArrive = () => { p.sitDown(); }; this.sound("door"); }); delay += .7; } }
  // 對話鏡頭：誰在說話就拍誰（中景）；玩家說完拍主要聽者的反應；其他時候回到肩後
  shotOn(p, dist){ dist *= this.shotMul || 1; const h = p.headWorld(), me = this.me.headWorld(); const d = me.clone().sub(h); d.y = 0; d.normalize();
    const D = Math.hypot(me.x - h.x, me.z - h.z); dist = Math.max(.8, Math.min(dist, D - .45));
    const side = new V3(-d.z, 0, d.x); const base = h.clone().addScaledVector(d, dist);
    const c1 = base.clone().addScaledVector(side, .5), c2 = base.clone().addScaledVector(side, -.5);
    const pos = c1.distanceTo(me) > c2.distanceTo(me) ? c1 : c2; pos.y = h.y - .02;
    return { pos, look: h.clone().add(new V3(0, -.13, 0)) }; }
  directorShot(front){ const t = this.time; let cut = null;
    if (this.dragAt !== undefined && t - this.dragAt < 8) cut = null;
    else if (front.some(p => !p.gone && (p.state === "walking" || p.state === "rising" || p.state === "sitting"))) cut = null;
    else { const sp = front.find(p => p.speaking && !p.gone);
      if (sp) cut = { k: "sp", who: sp };
      else if (this.reactShot && this.reactShot.until > t && !this.reactShot.who.gone) cut = { k: "re", who: this.reactShot.who };
      else { const last = front.find(p => p.saidEnd !== undefined && t - p.saidEnd < .9 && !p.gone); if (last) cut = { k: "sp", who: last }; } }
    const key = cut ? cut.k + cut.who.name : "wide"; if (key !== this.cutKey){ this.cutKey = key; this.camFastUntil = t + .7; }
    return cut ? this.shotOn(cut.who, cut.k === "re" ? 1.3 : 1.5) : null; }
  playerTyping(){ this.typingUntil = this.time + 2.5; }
  playerSaid(){ const front = [...this.people.values()].filter(p => !p.bg && !p.gone && !p.leave);
    front.forEach((p, i) => { this.after(.25 + i * .3 + Math.random() * .2, () => { if (p.speaking || p.gest) return; p.holdUntil = this.time + 1.4;
      const cold = p.pose === "cross" || p.pose === "away"; const r = Math.random();
      if (cold) p.gesture(r < .5 ? "tilt" : "shake", r < .5 ? 1.4 : 1.0); else p.gesture(r < .65 ? "ack" : "tilt", r < .65 ? .8 : 1.4); }); });
    const who = (this.lastSpeaker && !this.lastSpeaker.gone && front.includes(this.lastSpeaker)) ? this.lastSpeaker : front[0];
    if (who) this.reactShot = { who, until: this.time + 1.9 }; }
  setPerson(name, st){ const p = this.people.get(name); if (!p || p.gone) return;
    const was = p.speaking, now = !!st.speaking;
    if (now && !was){ p.turnT0 = this.time; this.lastSpeaker = p; }
    if (!now && was){ p.holdUntil = this.time + 1.0; p.saidEnd = this.time; }
    Object.assign(p, { speaking: now, thinking: !!st.thinking, pose: st.pose || "normal" });
    p.turn = st.pose === "away" ? .55 : 0;
    if (st.leave && !p.leave){ p.leave = true; const L = this.layout; const sf = new V3(Math.sin(p.seat.yaw), 0, Math.cos(p.seat.yaw)); const stand = p.seat.pos.clone().addScaledVector(sf, -.08);
      const side = L.door.x > 0 ? 1 : -1; const back = stand.clone().addScaledVector(sf, -.55).add(new V3(side * .5, 0, 0));
      const mid = new V3(L.door.x - side * .9, 0, Math.max(back.z, L.door.z - .4));
      p.walkTo([back, mid, L.door.clone(), L.door.clone().add(new V3(side * .8, 0, 0))], () => { p.gone = true; p.root.visible = false; this.sound("door"); }); }
  }
  // v0.24 說話節奏：依台詞的標點排出小動作（逗號輕點頭、問號歪頭前傾、驚嘆號加重、刪節號低頭停頓）
  speakText(name, text, lead = 0, msPer = 55){ const p = this.people.get(name); if (!p || p.gone) return;
    const t0 = this.time + lead, beats = []; const chars = [...String(text || "")];
    chars.forEach((c, i) => { const at = t0 + i * msPer / 1000;
      if ("，、；".includes(c)) beats.push({ at, k: "comma" }); else if ("？?".includes(c)) beats.push({ at, k: "ask" });
      else if ("！!".includes(c)) beats.push({ at, k: "stress" }); else if (c === "…") beats.push({ at, k: "pause" }); else if ("。".includes(c) && i < chars.length - 1) beats.push({ at, k: "comma" }); });
    beats.unshift({ at: t0, k: "start" }); p.speech = { t0, end: t0 + chars.length * msPer / 1000, beats }; }
  gesture(name, k, dur, target){ const p = name === "me" ? this.me : this.people.get(name); if (!p || p.gone) return;
    if (k === "pour"){ const q = this.people.get(target); const o = q && (q.cup || q.bowl); if (o){ p.gesture("pour", 2.2, () => this.sound("clink"), { reach: o.getWorldPosition(new V3()) }); return; } k = "adjust"; }
    const L = this.layout;
    if (k === "rise"){ if (p.state === "seated"){ p.rise(); this.after(3.2, () => { if (!p.leave && p.state === "standing") p.sitDown(); }); } return; }
    if (k === "pace"){ if (p.state !== "seated" || p.leave) return; const sf = new V3(Math.sin(p.seat.yaw), 0, Math.cos(p.seat.yaw)); const stand = p.seat.pos.clone().addScaledVector(sf, -.08); const w = L.windowSpot.clone();
      const back = stand.clone().addScaledVector(sf, -.55).add(new V3(w.x < stand.x ? -.45 : .45, 0, 0));
      p.walkTo([back, w], () => { p.faceYaw = Math.PI; p.fidget = { look: this.windowLook, until: this.time + 4.5 };
        this.after(4.5, () => { if (p.leave) return; p.faceYaw = undefined; p.walkTo([back, stand], () => p.sitDown()); }); }); return; }
    if (k === "chop" && p.chop) { p.gesture("chop", 3.4); return; }
    p.gesture(k, dur || ({ sip: 2.8, nod: 1.1, shake: 1.2, head: 1.9, point: 1.6, shrug: 1.6, slam: 1.1, cross: 3, look: 1.8, lean: 1.8, sigh: 1.6, adjust: 1.3, phone: 3, ack: .8, tilt: 1.4 }[k] || 1.4));
  }
  setLook(){ // 大家看說話的人；說話的人看玩家
    if (!this.me) return;
    if (this.vis){ const V = this.vis; const all = [this.me, ...this.people.values()].filter(p => p && !p.gone); const front = all.filter(p => !p.bg); const sp = front.find(p => p.speaking);
      for (const p of all){ if (p.bg){ p.look = V.K.bgLook ? V.K.bgLook.clone() : p.local(new V3(0, 1.3, 2)); continue; }
        if (p.visLook){ p.look = p.visLook.clone(); continue; }
        if (sp && sp !== p){ p.look = sp.headWorld(); continue; }
        let best = null, bd = 6; for (const q of front){ if (q === p) continue; const d = q.root.position.distanceTo(p.root.position); if (d < bd){ bd = d; best = q; } }
        p.look = best ? best.headWorld() : p.local(new V3(.25, 1.25, 2.2)); }
      return; }
    const meHead = this.me.headWorld();
    const speaker = [...this.people.values()].find(p => p.speaking && !p.bg);
    for (const p of this.people.values()){ if (p.bg){ p.look = p.idle === "type" ? p.local(new V3(0, .95, .7)) : p.local(new V3(0, .8, .5)); if (p.faceAway) p.look = p.local(new V3(0, .9, .8)); continue; }
      if (p.lying) continue; if (p.speaking) p.look = meHead; else if (p.holdUntil > this.time) p.look = meHead; else if (speaker && speaker !== p) p.look = speaker.headWorld(); else if (this.meSpeaking) p.look = meHead; else p.look = p.lookIdle || meHead;
      p.attend = !p.speaking && (this.meSpeaking || this.typingUntil > this.time) && p.pose !== "away" ? 1 : 0; }
    const front = [...this.people.values()].filter(p => !p.bg && !p.gone);
    if (this.me){ const sp = speaker || front[0]; this.me.look = sp ? sp.headWorld() : this.me.local(new V3(0, 1.0, 1.2)); if (this.layout.day || this.dayCam) this.me.look = this.me.lying ? this.me.local(new V3(0, 1.42, .4)) : this.me.local(new V3(0, .9, .7));
      const M = this.msg; if (M){ if (M.up && M.g) this.me.look = M.g.position.clone(); else this.me.look = M.kind === "bed" ? this.me.local(new V3(.25, 1.7, 1.6)) : (this.windowLook || this.me.local(new V3(-1.6, 1.35, .6))); } }
  }
  headScreen(name){ const p = this.people.get(name); if (!p || p.gone || !p.root.visible) return null; const v = p.headWorld().add(new V3(0, .2, 0)).project(this.camera);
    if (v.z > 1) return null; return { x: (v.x + 1) / 2 * 100, y: (1 - v.y) / 2 * 100 }; }
  updateCamera(dt){
    const L = this.layout, me = this.me; const t = this.time;
    let pos, look;
    if (this.vis){ const C = this.vis.cam, k = ease(Math.min(1, (t - (this.time0 || 0)) / 24)); pos = C.pos.clone().lerp(C.look, .12 * k); pos.x += Math.sin(t * .11) * .2; look = C.look.clone(); look.y += Math.sin(t * .07) * .03; }
    else if (this.dayCam){ const m = me.seat.pos.clone(); pos = m.clone().add(new V3(-1.3, 1.45, 1.5)); look = m.clone().add(new V3(.2, .8, -.5)); }
    else if (L.day && this.msg){ const hd = me.headWorld(), ph = this.msg.g ? this.msg.g.position : hd;
      if (me.lying){ pos = hd.clone().add(new V3(.8, .62, .5)); look = hd.clone().lerp(ph, .45).add(new V3(0, -.05, .1)); }
      else { pos = hd.clone().add(new V3(-.7, .12, -.62)); look = hd.clone().lerp(ph, .5).add(new V3(0, -.04, 0)); } }
    else if (L.day){ const m = me.lying ? new V3(L.bed.x, .6, L.bed.z + .2) : me.seat.pos.clone();
      pos = m.clone().add(new V3(1.6, me.lying ? 1.5 : 1.35, me.lying ? 1.2 : 1.7)); look = m.clone().add(new V3(-.15, me.lying ? .5 : .75, me.lying ? 0 : -.35)); }
    else { const head = me.seat.pos.clone().add(new V3(0, 1.16, 0));
      pos = head.clone().add(new V3(.5, .26, .95));
      const front = [...this.people.values()].filter(p => !p.bg);
      const ctr = front.length ? front.reduce((a, p) => a.add(p.seat.pos.clone().setY(1.12)), new V3()).divideScalar(front.length) : new V3(0, 1.1, -1);
      const sp = front.find(p => p.speaking && !p.gone) || front.find(p => !p.gone && p.state === "walking");
      look = sp ? ctr.clone().lerp(sp.headWorld(), .3) : ctr.clone(); look.y -= .12;
      const shot = this.viewMode === "shoulder" ? this.directorShot(front) : null;
      if (shot){ pos = shot.pos; look = shot.look; } }
    const talkCam = !L.day && !this.dayCam && !this.vis;
    if (talkCam && this.viewMode === "first"){ pos = me.seat.pos.clone().add(new V3(0, 1.2, -.06)); }
    if (talkCam && this.viewMode === "wide"){ const c = new V3(0, .9, -.4); pos = c.clone().add(new V3(2.4, 1.35, 1.5)); look = c.clone().add(new V3(0, .15, -.25)); }
    if (this.me?.headGroup) this.me.headGroup.visible = !this.me.rig && !(talkCam && this.viewMode === "first");
    if (this.me?.rig) this.me.rig.headBone.scale.setScalar(talkCam && this.viewMode === "first" ? .001 : 1);
    const V = this.view;
    if (talkCam && this.viewMode === "first"){ const d = look.clone().sub(pos); const yaw = Math.atan2(d.x, d.z) - V.yaw * .9, pit = clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)) - V.pitch * .7, -.9, .7);
      look = pos.clone().add(new V3(Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit))); }
    else if (V.yaw || V.pitch || V.zoom !== 1){ const off = pos.clone().sub(look), r0 = off.length(); const yaw = Math.atan2(off.x, off.z) + V.yaw;
      const pit = clamp(Math.asin(clamp(off.y / r0, -1, 1)) + V.pitch, -.25, 1.25), r = r0 * V.zoom;
      pos = look.clone().add(new V3(Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit)).multiplyScalar(r)); }
    const RD = this.roomDims; if (RD){ pos.x = clamp(pos.x, -RD.W / 2 + .2, RD.W / 2 - .2); pos.z = clamp(pos.z, RD.back + .2, 2.4); pos.y = clamp(pos.y, .3, 2.5); }
    if (this.camOverride){ pos = this.camOverride.pos.clone(); look = this.camOverride.look.clone(); }
    if (!this.camInit){ this.camT.copy(pos); this.camLook.copy(look); this.camInit = true; }
    const fast = this.camFastUntil > t ? 4.5 : 1.5; this.camT.lerp(pos, Math.min(1, dt * fast)); this.camLook.lerp(look, Math.min(1, dt * (fast + .3)));
    const hand = new V3(Math.sin(t * .31) * .012 + Math.sin(t * .77) * .006, Math.sin(t * .43) * .008, 0);
    let sh = new V3(); if (this.shakeT > 0){ this.shakeT -= dt; sh.set((Math.random() - .5) * .03, (Math.random() - .5) * .03, 0).multiplyScalar(this.shakeT / .35); }
    this.camera.position.copy(this.camT).add(hand).add(sh); this.camera.lookAt(this.camLook.clone().add(hand.clone().multiplyScalar(.5)));
  }
  loop(ms){
    if (!this.running) return; requestAnimationFrame(this.loop);
    if (document.hidden || !this.world) return;
    const now = ms / 1000; const dt = Math.min(.1, this.last ? now - this.last : .016); this.last = now; this.time += dt;
    const t = this.time;
    if (this.timers?.length){ const due = this.timers.filter(x => x.at <= t); this.timers = this.timers.filter(x => x.at > t); for (const x of due) try { x.fn(); } catch {} }
    this.updateVision(dt, t);
    if (!this.vis && this.people.size){ const front = [...this.people.values()].filter(p => !p.bg && !p.gone && !p.leave); const sp = front.find(p => p.speaking);
      for (const p of front){ if (p === sp || p.gest || p.thinking){ continue; }
        if (sp){ p.nextAck = p.nextAck ?? t + 1.5 + Math.random() * 2; if (t > p.nextAck){ p.nextAck = t + 2.2 + Math.random() * 1.6; if (Math.random() < .45 && p.pose !== "cross" && p.pose !== "away") p.gesture("ack", .8); } }
        else p.nextAck = undefined; } }
    this.setLook();
    for (const p of this.people.values()) p.update(dt, t);
    if (this.me){ this.me.speaking = this.meSpeaking; this.me.update(dt, t); }
    this.updatePhone(dt, t);
    // 環境動態
    if (this.rain){ const a = this.rain.geometry.attributes.position; for (let i = 0; i < a.count; i += 2){ let y = a.getY(i) - dt * 6; if (y < 0) y += 3.2; a.setY(i, y); a.setY(i + 1, y - .12); } a.needsUpdate = true; }
    for (const s of this.steamPts || []){ s.t += dt; if (s.t > 3) s.t -= 3; const w = s.src.getWorldPosition(new V3()); const k = s.t / 3;
      s.sp.position.set(w.x + Math.sin(s.t * 2 + s.src.id) * .02, w.y + .1 + k * .3, w.z); s.sp.material.opacity = .22 * Math.sin(k * Math.PI); s.sp.scale.setScalar(.04 + k * .08); }
    if (this.dust){ const a = this.dust.geometry.attributes.position; for (let i = 0; i < a.count; i++){ a.setY(i, a.getY(i) + Math.sin(t * .3 + i) * .0006); a.setX(i, a.getX(i) + Math.cos(t * .2 + i) * .0005); } a.needsUpdate = true; }
    if (this.leds) this.leds.forEach((l, i) => l.material.emissiveIntensity = hash(i * 31 + Math.floor(t * 6 + i)) < .3 ? .1 : 1.4);
    if (this.clockHands){ this.clockHands[1].rotation.z = -t * .5; }
    for (const b of this.wobble){ if (b.v){ b.o.position.y = b.base + Math.abs(Math.sin(t * 40)) * b.v; b.v *= .9; if (b.v < .001){ b.v = 0; b.o.position.y = b.base; } } }
    for (const l of this.lamps) if (l.L.intensity && !l.panel) l.L.intensity = l.base * (1 + Math.sin(t * 17) * .004);
    this.updateCamera(dt);
    // 效能保護：連續幾秒低於約 28 fps，就依序關掉景深、環境遮蔽
    if (this.fx && !window.__keepFx && dt > 0 && dt < .5){ this.perf = (this.perf ?? 1 / 60) * .97 + dt * .03; if (this.perf > 1 / 28){ this.slowT = (this.slowT || 0) + dt; if (this.slowT > 3){ this.slowT = 0; if (this.bokeh && !this.bokehOff) this.bokehOff = true; else if (this.ao) this.aoOff = true; } } else this.slowT = 0; }
    if (this.fx){ if (this.bokeh && this.bokehOff) this.bokeh.enabled = false; if (this.ao && this.aoOff) this.ao.enabled = false; }
    if (this.fx){ if (this.bokeh && !this.bokehOff){ const f = this.camLook ? this.camera.position.distanceTo(this.camLook) : 2.5; this.bokeh.uniforms.focus.value += (f - this.bokeh.uniforms.focus.value) * .1; this.bokeh.enabled = !window.__noDof; }
      if (this.ao && !this.aoOff){ this.ao.enabled = !window.__noAo; if (window.__aoOut != null) this.ao.output = window.__aoOut; } this.fx.render(); } else this.renderer.render(this.scene, this.camera);
    if (this.onFrame) this.onFrame();
  }
  start(){ if (this.running) return; this.running = true; this.last = 0; requestAnimationFrame(this.loop); }
  stop(){ this.running = false; }
  dispose(){ this.stop(); this.ro.disconnect(); this.renderer.dispose(); this.renderer.domElement.remove(); }
}

/* ---------------- 對外介面 ---------------- */
function webglOK(){ try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } }
window.Stage3D = {
  ok: webglOK(), kits: VKIT_NAMES,
  create(container, opts){ return new Stage(container, opts); },
  // 台詞動作描述 → 動作
  actFor(act){
    const A = String(act || "");
    const R = [[/走到|窗邊|走過去|踱|走來走去/, "pace"], [/站起|起身/, "rise"], [/拍桌|敲桌|拍了一下桌|捶/, "slam"], [/指/, "point"], [/攤手|聳肩/, "shrug"], [/抱胸|雙手交叉|手交叉/, "cross"],
      [/扶額|揉|太陽穴|摸頭|抓頭|按著頭/, "head"], [/喝|杯|茶|咖啡/, "sip"], [/筷子|碗|夾|吃/, "chop"], [/放下|拿起/, "sip"], [/嘆/, "sigh"], [/點頭|嗯/, "nod"], [/搖頭/, "shake"],
      [/看向|別過|轉頭|看了|瞄|望|轉開|看著窗/, "look"], [/靠近|往前|湊|傾/, "lean"], [/揮手|招手/, "wave"]];
    const hit = R.find(([re]) => re.test(A)); return hit ? hit[1] : null;
  },
};
window.dispatchEvent(new Event("stage3d-ready"));

