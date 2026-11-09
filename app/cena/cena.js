// Cena 3D: um único carro acompanha as três telas, mudando só de enquadramento.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { validarMetaModelo } from '../dominio/config.js';
import { referenciasExternas } from './glb.js';

const COMPRIMENTO = 4.4;
const FOV = 24;
const DIRECAO_HERO = new THREE.Vector3(-0.62, 0.3, 0.72).normalize();
const SEM_MOVIMENTO = matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer, cena, camera, controles, suporte, sombra;
let aoDesenhar = () => {};
let precisa = true;
let caixa = new THREE.Box3();
let vista = { livre: 1, sobeY: 0.05 };
let desloc = { x: 0, y: 0 };
let tween = null;
let rotacaoAtual = 0;
let objetoAtual = null;

export function iniciarCena(canvas, cb) {
  aoDesenhar = cb;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  cena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const sol = new THREE.DirectionalLight(0xffffff, 1.1);
  sol.position.set(-3, 6, 4);
  cena.add(sol);

  camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  controles = new OrbitControls(camera, canvas);
  controles.target.set(0, 0.72, 0);
  controles.enableDamping = true;
  controles.dampingFactor = 0.08;
  controles.enablePan = false;
  controles.minPolarAngle = 0.5;
  controles.maxPolarAngle = Math.PI / 2 - 0.02;
  controles.addEventListener('change', () => { precisa = true; });

  suporte = new THREE.Group();
  cena.add(suporte);
  sombra = criarSombra();
  cena.add(sombra);

  new ResizeObserver(redimensionar).observe(canvas.parentElement);
  redimensionar();
  camera.position.copy(controles.target).addScaledVector(DIRECAO_HERO, distanciaIdeal());
  usarGenerico();
  renderer.setAnimationLoop(quadro);
}

function quadro(agora) {
  if (tween) avancarTween(agora);
  controles.update();
  if (!precisa) return;
  precisa = false;
  renderer.render(cena, camera);
  aoDesenhar();
}

function redimensionar() {
  const el = renderer.domElement.parentElement;
  const w = el.clientWidth, h = el.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  aplicarDesloc();
  limitesZoom();
  if (vista.pequeno && !tween) camera.position.sub(controles.target).setLength(distanciaIdeal()).add(controles.target);
  precisa = true;
}

function aplicarDesloc() {
  const el = renderer.domElement.parentElement;
  const w = el.clientWidth, h = el.clientHeight;
  camera.setViewOffset(w, h, desloc.x * w, desloc.y * h, w, h);
}

function distanciaIdeal() {
  const el = renderer.domElement.parentElement;
  const aspecto = (el.clientWidth * vista.livre) / el.clientHeight;
  const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  if (vista.pequeno) return Math.max(6.4 / (2 * tan * aspecto), 3.1 / (2 * tan));
  return Math.max(5.9 / (2 * tan * aspecto), 4.9 / (2 * tan));
}

function limitesZoom() {
  const d = distanciaIdeal();
  controles.minDistance = d * 0.55;
  controles.maxDistance = d * 1.5;
}

// livre = fração da largura disponível para o carro; o restante fica à esquerda, para o painel.
// pequeno = o palco virou uma miniatura, e o carro precisa preenchê-la.
export function definirVista({ livre, sobeY = 0, voltarAoHero = false, pequeno = false }) {
  vista = { livre, sobeY, pequeno };
  sombra.visible = !pequeno;
  limitesZoom();
  const alvoDesloc = { x: -(1 - livre) / 2, y: sobeY };
  const dirInicio = camera.position.clone().sub(controles.target);
  const distInicio = dirInicio.length();
  dirInicio.normalize();
  const dirFim = voltarAoHero ? DIRECAO_HERO.clone() : dirInicio.clone();
  const distFim = distanciaIdeal();
  if (SEM_MOVIMENTO) {
    desloc = alvoDesloc;
    camera.position.copy(controles.target).addScaledVector(dirFim, distFim);
    aplicarDesloc();
    precisa = true;
    return;
  }
  tween = { t0: performance.now(), dur: 650, dirInicio, dirFim, distInicio, distFim, deslocInicio: { ...desloc }, alvoDesloc };
  controles.enabled = false;
}

// Gira a câmera para o lado do carro onde a âncora está, sem mudar o enquadramento da tela.
function avancarTween(agora) {
  const p = Math.min(1, (agora - tween.t0) / tween.dur);
  const e = 1 - Math.pow(1 - p, 3);
  const dir = tween.dirInicio.clone().lerp(tween.dirFim, e).normalize();
  camera.position.copy(controles.target).addScaledVector(dir, THREE.MathUtils.lerp(tween.distInicio, tween.distFim, e));
  desloc = {
    x: THREE.MathUtils.lerp(tween.deslocInicio.x, tween.alvoDesloc.x, e),
    y: THREE.MathUtils.lerp(tween.deslocInicio.y, tween.alvoDesloc.y, e),
  };
  aplicarDesloc();
  precisa = true;
  if (p === 1) { tween = null; controles.enabled = true; }
}

// Âncora em coordenadas relativas à caixa do carro: x lateral, y altura, z frente (+1) e traseira (-1).
export function projetar(ancora) {
  const c = caixa.getCenter(new THREE.Vector3());
  const m = caixa.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const p = new THREE.Vector3(c.x + m.x * ancora[0], c.y + m.y * ancora[1], c.z + m.z * ancora[2]).project(camera);
  const el = renderer.domElement.parentElement;
  return { x: ((p.x + 1) / 2) * el.clientWidth, y: ((1 - p.y) / 2) * el.clientHeight };
}

function trocarObjeto(obj, rotacaoGraus = 0) {
  suporte.clear();
  objetoAtual = obj;
  const giro = new THREE.Group();
  giro.add(obj);
  suporte.add(giro);
  rotacaoAtual = rotacaoGraus;
  encaixar();
}

function encaixar() {
  const giro = suporte.children[0];
  const obj = objetoAtual;
  obj.scale.setScalar(1);
  obj.position.set(0, 0, 0);
  giro.rotation.y = THREE.MathUtils.degToRad(rotacaoAtual);
  giro.updateMatrixWorld(true);
  let b = new THREE.Box3().setFromObject(giro);
  const t = b.getSize(new THREE.Vector3());
  const maior = Math.max(t.x, t.z);
  if (maior > 0) obj.scale.setScalar(COMPRIMENTO / maior);
  giro.updateMatrixWorld(true);
  b = new THREE.Box3().setFromObject(giro);
  const c = b.getCenter(new THREE.Vector3());
  giro.position.set(-c.x, -b.min.y, -c.z);
  giro.updateMatrixWorld(true);
  caixa = new THREE.Box3().setFromObject(giro);
  const s = caixa.getSize(new THREE.Vector3());
  sombra.scale.set(s.x * 1.42, s.z * 1.26, 1);
  precisa = true;
}

export function definirRotacao(graus) {
  rotacaoAtual = graus;
  encaixar();
}

export function usarGenerico() {
  trocarObjeto(criarCarroGenerico());
}

export function carregarGLB(buffer, rotacaoGraus = 0) {
  return new Promise((ok, falha) => {
    if (referenciasExternas(buffer).length) return falha(Object.assign(new Error('externo'), { erros: ['o arquivo aponta para conteúdo fora dele; exporte tudo dentro do .glb'] }));
    new GLTFLoader().parse(buffer, '', (gltf) => {
      const meta = gltf.asset?.extras?.obd_auto_check;
      const erros = validarMetaModelo(meta);
      if (erros.length) return falha(Object.assign(new Error('metadados'), { erros }));
      trocarObjeto(gltf.scene, rotacaoGraus);
      ok(meta);
    }, falha);
  });
}

export function intensidadeSombra(valor) {
  if (sombra) { sombra.material.opacity = valor; precisa = true; }
}

function criarSombra() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(128, 128, 18, 128, 128, 128);
  r.addColorStop(0, 'rgba(0,0,0,.72)');
  r.addColorStop(0.55, 'rgba(0,0,0,.42)');
  r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.6 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  return m;
}

// ---- Carro genérico: fictício, não reproduz nenhum modelo real. Frente em +Z, como pede o formato.

const LARG = 1.82;
const EIXO_X = 1.36;
const RODA_R = 0.365;

function extrudar(forma, largura, chanfro = 0.06, curvas = 24) {
  const g = new THREE.ExtrudeGeometry(forma, {
    depth: largura - chanfro * 2, bevelEnabled: chanfro > 0, bevelSize: chanfro * 0.75,
    bevelThickness: chanfro, bevelSegments: 4, curveSegments: curvas,
  });
  g.translate(0, 0, -(largura - chanfro * 2) / 2);
  return g;
}

function afinarTeto(g) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = THREE.MathUtils.clamp((p.getY(i) - 1.04) / 0.56, 0, 1);
    p.setZ(i, p.getZ(i) * (1 - 0.17 * k));
  }
  g.computeVertexNormals();
  return g;
}

function criarCarroGenerico() {
  const mat = {
    pintura: new THREE.MeshPhysicalMaterial({ color: 0xf1f2f3, metalness: 0.05, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.08 }),
    vidro: new THREE.MeshPhysicalMaterial({ color: 0x14181d, metalness: 0.1, roughness: 0.16, envMapIntensity: 0.3, specularIntensity: 0.3 }),
    preto: new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.62 }),
    junta: new THREE.MeshStandardMaterial({ color: 0x8d9299, roughness: 0.7 }),
    pneu: new THREE.MeshStandardMaterial({ color: 0x101113, roughness: 0.9 }),
    aro: new THREE.MeshStandardMaterial({ color: 0xc4c8cd, metalness: 0.92, roughness: 0.28 }),
    farol: new THREE.MeshStandardMaterial({ color: 0xf6fbff, emissive: 0xdcecff, emissiveIntensity: 0.55, metalness: 0.2, roughness: 0.12 }),
    lanterna: new THREE.MeshStandardMaterial({ color: 0xa8161f, emissive: 0x6d0a10, emissiveIntensity: 0.5, roughness: 0.22 }),
  };
  const carro = new THREE.Group();
  const add = (geo, m) => { const o = new THREE.Mesh(geo, m); carro.add(o); return o; };

  // Carroceria: perfil lateral com os dois arcos de roda
  const c = new THREE.Shape();
  c.moveTo(-2.14, 0.33);
  c.lineTo(-EIXO_X - 0.44, 0.33);
  c.absarc(-EIXO_X, 0.37, 0.44, Math.PI, 0, true);
  c.lineTo(EIXO_X - 0.44, 0.33);
  c.absarc(EIXO_X, 0.37, 0.44, Math.PI, 0, true);
  c.lineTo(2.08, 0.33);
  c.bezierCurveTo(2.17, 0.36, 2.2, 0.6, 2.18, 0.8);
  c.bezierCurveTo(2.16, 0.9, 2.04, 0.95, 1.86, 0.97);
  c.bezierCurveTo(1.45, 1.01, 1.1, 1.04, 0.82, 1.06);
  c.lineTo(-1.82, 1.1);
  c.bezierCurveTo(-2.02, 1.09, -2.13, 1.02, -2.17, 0.84);
  c.bezierCurveTo(-2.21, 0.62, -2.2, 0.42, -2.14, 0.33);
  c.closePath();
  add(toCreasedNormals(extrudar(c, LARG, 0.075, 40), 0.7), mat.pintura);

  // Saia preta: o mesmo perfil, cortado na parte baixa, um pouco mais larga que a carroceria
  const trecho = (x0, x1) => {
    const f = new THREE.Shape();
    f.moveTo(x0, 0.31);
    f.lineTo(x1, 0.31);
    f.lineTo(x1, 0.47);
    f.lineTo(x0, 0.47);
    f.closePath();
    return f;
  };
  add(extrudar(trecho(-EIXO_X + 0.46, EIXO_X - 0.46), LARG + 0.03, 0.012), mat.preto);
  add(extrudar(trecho(EIXO_X + 0.46, 2.2), LARG + 0.02, 0.012), mat.preto);
  add(extrudar(trecho(-2.2, -EIXO_X - 0.46), LARG + 0.02, 0.012), mat.preto);
  [1, -1].forEach((fx) => [1, -1].forEach((lado) => {
    const a = new THREE.Mesh(new THREE.TorusGeometry(0.455, 0.035, 10, 40, Math.PI), mat.preto);
    a.position.set(fx * EIXO_X, 0.37, lado * (LARG / 2 - 0.005));
    carro.add(a);
  }));

  // Cabine de vidro, afinando em direção ao teto
  const v = new THREE.Shape();
  v.moveTo(0.92, 1.03);
  v.bezierCurveTo(0.62, 1.22, 0.32, 1.46, 0.1, 1.56);
  v.lineTo(-1.5, 1.57);
  v.bezierCurveTo(-1.72, 1.5, -1.9, 1.28, -2.0, 1.05);
  v.closePath();
  add(toCreasedNormals(afinarTeto(extrudar(v, LARG * 0.9, 0.04)), 0.6), mat.vidro);

  // Teto
  const t = new THREE.Shape();
  t.moveTo(0.2, 1.53);
  t.bezierCurveTo(0.08, 1.585, -0.1, 1.61, -0.35, 1.615);
  t.lineTo(-1.42, 1.61);
  t.bezierCurveTo(-1.58, 1.59, -1.66, 1.56, -1.72, 1.5);
  t.closePath();
  add(toCreasedNormals(afinarTeto(extrudar(t, LARG * 0.88, 0.05)), 0.7), mat.pintura);

  // Colunas: moldura lateral com recortes para as janelas
  const moldura = new THREE.Shape();
  moldura.moveTo(0.94, 1.03);
  moldura.bezierCurveTo(0.64, 1.23, 0.33, 1.48, 0.1, 1.59);
  moldura.lineTo(-1.52, 1.6);
  moldura.bezierCurveTo(-1.74, 1.52, -1.93, 1.29, -2.04, 1.03);
  moldura.closePath();
  const janela = (pts) => {
    const j = new THREE.Path();
    j.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach((p) => j.lineTo(p[0], p[1]));
    j.closePath();
    moldura.holes.push(j);
  };
  janela([[0.68, 1.13], [0.46, 1.3], [0.12, 1.5], [-0.3, 1.51], [-0.3, 1.13]]);
  janela([[-0.38, 1.13], [-0.38, 1.51], [-1.08, 1.515], [-1.08, 1.13]]);
  janela([[-1.16, 1.13], [-1.16, 1.515], [-1.46, 1.51], [-1.62, 1.42], [-1.8, 1.15]]);
  [1, -1].forEach((lado) => {
    const g = extrudar(moldura, 0.02, 0, 16);
    g.translate(0, 0, lado * (LARG * 0.45 + 0.002));
    add(afinarTeto(g), mat.pintura);
  });

  // Fundo escuro dos arcos, rodas e detalhes
  add(new THREE.BoxGeometry(4.0, 0.56, LARG - 0.56).translate(0, 0.54, 0), mat.preto);
  add(new THREE.BoxGeometry(3.9, 0.12, LARG - 0.2).translate(0, 0.27, 0), mat.preto);
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([fx, lado]) => {
    carro.add(criarRoda(fx * EIXO_X, lado * (LARG / 2 - 0.135), lado, mat));
  });

  // Frente, traseira e laterais
  add(new THREE.BoxGeometry(0.08, 0.2, LARG - 0.34).translate(2.235, 0.73, 0), mat.preto);
  add(new THREE.BoxGeometry(0.05, 0.12, 1.0).translate(2.21, 0.54, 0), mat.preto);
  add(new THREE.BoxGeometry(0.05, 0.1, 1.05).translate(-2.215, 0.56, 0), mat.preto);
  add(new THREE.BoxGeometry(0.08, 0.12, LARG - 0.34).translate(-2.215, 0.86, 0), mat.lanterna);
  add(new THREE.BoxGeometry(0.03, 0.018, LARG - 0.38).translate(2.27, 0.8, 0), mat.farol);
  [1, -1].forEach((lado) => {
    add(new THREE.BoxGeometry(0.03, 0.09, 0.34).translate(2.27, 0.73, lado * 0.54), mat.farol);
    add(new THREE.BoxGeometry(0.16, 0.08, 0.13).translate(0.7, 1.09, lado * (LARG / 2 + 0.03)), mat.preto);
    [0.72, -0.34, -1.14].forEach((x) => {
      add(new THREE.BoxGeometry(0.006, 0.54, 0.006).translate(x, 0.76, lado * (LARG / 2 + 0.001)), mat.junta);
    });
    [0.42, -0.62].forEach((x) => {
      add(new THREE.BoxGeometry(0.13, 0.022, 0.012).translate(x, 0.92, lado * (LARG / 2 + 0.004)), mat.junta);
    });
  });

  carro.rotation.y = -Math.PI / 2;
  const envoltorio = new THREE.Group();
  envoltorio.add(carro);
  return envoltorio;
}

function criarRoda(x, z, lado, mat) {
  const roda = new THREE.Group();
  const pneu = new THREE.Mesh(new THREE.CylinderGeometry(RODA_R, RODA_R, 0.26, 48), mat.pneu);
  pneu.rotation.x = Math.PI / 2;
  roda.add(pneu);
  const face = new THREE.Group();
  face.position.z = lado * 0.131;
  const aro = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.016, 12, 48), mat.aro);
  face.add(aro);
  const miolo = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.058, 0.03, 24), mat.aro);
  miolo.rotation.x = Math.PI / 2;
  face.add(miolo);
  for (let i = 0; i < 5; i++) {
    const raio = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.038, 0.016).translate(0.13, 0, 0), mat.aro);
    raio.rotation.z = (i / 5) * Math.PI * 2 + 0.3;
    face.add(raio);
  }
  roda.add(face);
  roda.position.set(x, RODA_R, z);
  return roda;
}
