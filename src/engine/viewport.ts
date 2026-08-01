import * as THREE from 'three'
import type { BakeWorkerRequest, BakeWorkerResponse } from './bake.worker'
import { customRing, moonGeo, ringGeo, ringMaterial, toneTex } from './materials'
import { mulberry32, type Noise3 } from './noise'
import { skyFrom } from './sky'
import { makeSurface, noiseFor } from './surface'
import { parentOf, REAL, realFor } from './planets'
import { isGas, PALETTES } from './palettes'
import {
  D2R, DAY_SEC, kepler, moonDist, moonPeriodSec, moonRad, sameDist,
  satMult, satRadii, satRank, satTempo, SIZE_MAX, sizeMap, starSize,
  systemStretch, tempoFor, visDist, YEAR_SEC,
} from './scale'
import { ATMO_FRAG, ATMO_VERT, GAS_FRAG, GAS_VERT, SUN_FRAG, SUN_VERT } from './shaders'
import { heightAt, heightFieldFrom, type HeightField } from './heightfield'
import type { Moon, PlanetParams, PresetKey, RingConfig, SystemBody, SystemDef } from './types'
import { V2TerrainClient } from './v2/client'
import type { V2WorkerResponse } from './v2/protocol'
import { ecosystemStyleFor } from './v2/ecosystems'

interface MoonInstance {
  orbit: THREE.Group
  mesh: THREE.Mesh
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  /** Drawn radius, in planet radii. */
  r: number
  d: number
  e: number
  P: number
  phase: number
  /** Where the ascending node started, before precession moved it. */
  node: number
  /** Which face the surface markings are painted on. See `Moon.mark`. */
  mark: number
  /** Set for moons that are worlds, which makes them clickable. */
  world?: { preset: PresetKey; seed: number }
}

/** Orbit-path opacity when shown. Hidden paths fade to 0 and back on hover. */
const PATH_OPACITY = 0.55

/**
 * How far out the real sky is drawn — inside the starfield, so a planet passes
 * in front of the invented stars rather than behind them, and far enough that
 * nothing in the scene ever reaches it. The distance is arbitrary and has to
 * be: these things are effectively at infinity, and only their direction and
 * their angular size mean anything.
 */
const SKY_R = 300

/**
 * The smallest a sky object may be drawn, in radians.
 *
 * About two and a half pixels of a 45° view, which is the floor at which a
 * point of light still reads as one. Every planet in every system here is far
 * below it — Jupiter from Earth is a fiftieth of this — so the planets are all
 * drawn the same size, as they appear, and it is brightness that tells them
 * apart. The star is usually above it, and that is the whole point: a sun
 * really is the one thing in the sky with a size worth drawing.
 */
const SKY_MIN_ANG = 0.0025

/** The most of the frame's height a star may fill before the camera backs off. */
const STAR_FRAME_SHARE = 0.4

/**
 * How far away a moon's planet is drawn, in the moon's own radii.
 *
 * True distances run from 221 radii (Earth from the Moon) to 945 (Saturn from
 * Enceladus). At those distances the planet is the right angular size but
 * almost never on screen: with the moon filling a 45° view there is barely a
 * degree of room beside it, so the planet is only visible while it is directly
 * behind — where the moon hides it. Compressing the distance is the same
 * compromise the orbit view makes for moons, and the ratio of radius to
 * distance is kept exactly, so each planet still looms as large relative to
 * its distance as it truly does.
 */
const COMPANION_DIST = 4.6

/** How far back to sit when a moon has a planet to show beside it. */
const COMPANION_CAM = 8.5

/**
 * How many of its own orbits a moon takes to precess its node once round.
 *
 * This is why eclipses are seasons rather than a monthly event. A moon's orbit
 * is tilted out of the plane the sunlight arrives in, so most times round it
 * passes above or below its planet's shadow line and nothing happens; the plane
 * itself turns slowly, and twice per turn it lies edge-on to the sun and the
 * shadows fall. Our Moon really takes 18.6 years — 249 lunations — which is
 * hours of watching at any speed the app offers. Twelve keeps the mechanism and
 * its consequence: a season comes round while somebody is still looking, and
 * the drift is a couple of degrees an orbit rather than a tumble.
 */
const NODE_CYCLE_ORBITS = 12

/**
 * How much wider than the outermost moon the shadow camera looks.
 *
 * The shadow map is spent entirely on this box, so it is kept to what has to be
 * in it: the moons, the world, and enough margin that a moon at the edge is not
 * clipped mid-eclipse.
 */
const SHADOW_MARGIN = 0.6

/**
 * The sphere the world in the single view is hit-tested against.
 *
 * Slightly wider than the unit sphere it is drawn on, to cover displaced
 * mountains. Deliberately not the geometry: hit-testing runs on every pointer
 * move, that geometry carries tens of thousands of triangles, and the body is
 * a ball — so the analytic answer is both the cheap one and the exact one.
 */
const WORLD_HIT_R = 1.08

/**
 * How long to wait for shader compilation before drawing anyway.
 *
 * Well past any real compile — the whole orbit view, build and warmup
 * together, is budgeted at a second — so this only ever fires when the
 * promise has been abandoned rather than merely slow.
 */
const COMPILE_DEADLINE = 3000

/** The photographic map for a parent, where the file name differs from the key. */
const PARENT_MAP: Record<string, string> = {
  temperate: 'images2k/earth.jpg',
  jupiter: 'images2k/jupiter.jpg',
  saturn: 'images2k/saturn.jpg',
  neptune: 'images2k/neptune.jpg',
  uranus: 'images2k/uranus.jpg',
  mars: 'images2k/mars.jpg',
}

/** Starfield pool size; density 0.5 draws exactly the classic 1400. */
const STAR_POOL = 2800

const ORBIT_PERF_PREFIX = 'arc:orbit:'

function recordOrbitMeasure(name: string, start: number) {
  const measureName = `${ORBIT_PERF_PREFIX}${name}`
  performance.clearMeasures(measureName)
  performance.measure(measureName, { start, end: performance.now() })
}

interface SysNode {
  index: number
  plane: THREE.Group
  node: THREE.Group
  tilt: THREE.Group
  spin: THREE.Group
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  ringMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null
  /** Baked map, owned by this node so it can be freed on rebuild. */
  baked: THREE.Texture | null
  /** True for the temporary procedural placeholder; false for shared photo maps. */
  ownsMap: boolean
  a: number
  e: number
  period: number
  aSame: number
  aScale: number
  rSame: number
  rScale: number
  peri: number
  angle: number
  day: number
  f: number
  lineSame: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  lineScale: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  /** Where this body's orbit-line opacity is headed; the loop eases toward it. */
  lineTarget: number
  /** Created only after labels are requested; labels are off by default. */
  label: THREE.Sprite | null
  labelName: string
  /** Index of the body this one orbits, or -1 for the ones orbiting the star. */
  parent: number
  /** Tidally locked, so the drawn spin is read off the drawn orbit. */
  lock: boolean
}

function climateKey(p: PlanetParams): string {
  const climate = p.climate
  if (!climate) return 'unplaced'
  return [
    climate.meanSurfaceTemperatureK,
    climate.liquidWater,
    climate.surfaceIce,
    climate.vegetationPotential,
    climate.iceLineLatitudeDeg,
  ].map((value) => Math.round(value * 1000)).join(',')
}

/**
 * Identity of the expensive, baked part of a body's appearance. Lighting,
 * animation and labels deliberately do not belong here: changing one of those
 * must not recreate materials or re-bake every procedural planet.
 */
function bodyKey(b: SystemBody): string {
  const p = b.params
  const baked = [
    p.generatorVersion, p.seed, p.preset, p.mountains, p.water, p.roughness, p.ice, p.clouds,
    climateKey(p),
  ].join(':')
  const ring = b.ring ?? (p.rings
    ? [p.ringN, p.ringInner, p.ringTilt, p.ringWidth, p.ringGap, p.ringOpacity, p.ringColor]
    : null)
  return [
    b.texture ?? '', baked, p.rings ? 1 : 0, JSON.stringify(ring),
  ].join('|')
}

/** Params that require the high-detail single-world sphere to be resampled. */
function surfaceKey(p: PlanetParams, detail: string): string {
  return [
    p.generatorVersion, detail, p.seed, p.preset, p.mountains, p.water, p.roughness, p.ice,
    climateKey(p),
  ].join(':')
}

const V2_FLAT_WIDTH = 256
const V2_FLAT_HEIGHT = 128

function dataTexture(
  pixels: Uint8Array,
  width: number,
  height: number,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
): THREE.DataTexture {
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat)
  texture.colorSpace = colorSpace
  texture.flipY = true
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = width > 1 ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter
  texture.generateMipmaps = width > 1
  texture.needsUpdate = true
  return texture
}

const dotCache = new Map<number, THREE.CanvasTexture>()

/**
 * A round dot with a soft edge, for the things in the sky too small to be
 * discs — which, from any world in any of these systems, is all of them but the
 * star.
 *
 * `core` is the fraction of the radius held at full brightness before the
 * falloff begins, and it has to be most of it. These sprites are drawn at their
 * true angular size, which for the Sun from Earth is ten pixels: spend eight of
 * those on a gentle halo and what is left is a smudge nobody can find. The
 * bloom around a bright light belongs in a second, wider sprite, where it can
 * be soft without eating the disc.
 */
function skyDot(core: number): THREE.CanvasTexture {
  const hit = dotCache.get(core)
  if (hit) return hit
  const n = 64
  const cv = document.createElement('canvas')
  cv.width = n
  cv.height = n
  const ctx = cv.getContext('2d')!
  const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(core, 'rgba(255,255,255,1)')
  g.addColorStop(Math.min(0.995, core + (1 - core) * 0.55), 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, n, n)
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  dotCache.set(core, tex)
  return tex
}

/** A mapped placeholder keeps the material's shader variant stable on swaps. */
function solidTexture(color: THREE.ColorRepresentation, alpha = 255): THREE.DataTexture {
  const c = new THREE.Color(color)
  return dataTexture(
    new Uint8Array([
      Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), alpha,
    ]),
    1,
    1,
  )
}

function normalTexture(pixels: Uint8Array, width: number, height: number): THREE.DataTexture {
  const texture = dataTexture(pixels, width, height, THREE.NoColorSpace)
  texture.wrapS = THREE.RepeatWrapping
  return texture
}

/**
 * The Three.js scene for one world, or for the whole solar system.
 *
 * Owns its canvas, its animation loop and all GPU resources. Drive it by
 * calling `setParams`; it diffs against the previous params and only rebuilds
 * what changed. Call `dispose` to tear everything down.
 */
export class PlanetViewport {
  private container: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private group: THREE.Group
  private tiltG: THREE.Group
  private spinG: THREE.Group
  private moonRoot: THREE.Group
  private ringG: THREE.Group

  private sun: THREE.DirectionalLight
  private amb: THREE.AmbientLight
  private sunDir = new THREE.Vector3(5, 3, 4).normalize()

  private planet: THREE.Mesh
  /** The planet a moon orbits, shown in the moon's own view. */
  private companion: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  private companionRing: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  private companionRingKey = ''
  private companionKey = ''
  private companionDist = 0
  private companionBakeId = 0
  private companionMap: THREE.DataTexture | null = null
  /** Which world the cached companion bake belongs to. */
  private companionMapKey = ''
  private water: THREE.Mesh
  private clouds: THREE.Mesh
  private atmo: THREE.Mesh
  private stars: THREE.Points
  private scanRing: THREE.Mesh
  private ring: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  private texMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
  private gasMesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>

  private geo: THREE.SphereGeometry | null = null
  private dirs: Float32Array | null = null

  private sys?: THREE.Group
  private sysRoot?: THREE.Group
  private sunMesh?: THREE.Mesh
  private sunMat?: THREE.ShaderMaterial
  private sysGeo?: THREE.SphereGeometry
  private sysPlanets: THREE.Mesh[] = []
  private sysNodes: SysNode[] = []
  /** The bodies actually built, which is every body unless moons are off. */
  private sysBodies: SystemBody[] = []
  private sysDef: SystemDef | null = null
  private sysId = ''
  private sysShape = ''
  private sysOrbitKey = ''
  private sysPropertyKey = ''
  private sysCount = -1
  /** The star's drawn radius before its own mass is taken into account. */
  private sunBase = 1.15
  /** Set when the view has changed enough that the camera should refit. */
  private needFrame = false
  /** CPU-heavy procedural maps are produced away from the rendering thread. */
  private worldWorker: Worker | null = null
  private cloudWorker: Worker | null = null
  /** Created only for a v2 world; its canonical cache stays in the module worker. */
  private v2Terrain: V2TerrainClient | null = null
  private v2DetailKey = ''
  private v2SeaRadius = 1
  private v2NormalMap: THREE.DataTexture | null = null
  private meadowFrameKey = ''
  private v2PreviewTargets = new Map<string, { generation: number; node: SysNode }>()
  private bakeId = 0
  private bakeGeneration = 0
  private bakeTargets = new Map<number, { generation: number; node: SysNode }>()
  private fitSame = 11
  private fitScale = 86

  private p: PlanetParams | null = null
  private dirty = false
  private stopped = false
  private raf = 0
  private frames = 0
  private forceRender = true
  private lastRender = 0
  private compileNeeded = true
  private compiling: Promise<void> | null = null
  private inView = true
  private pixelRatio: number
  private slowFrames = 0
  private lastPublishedTriangles = -1
  private lastPublishedSunScale = Number.NaN
  private lastPublishedLines = -1
  private lastPublishedPoints = -1
  private lastPublishedParent = ''
  private lastPublishedSky = ''
  private orbitFirstRenderPending = false
  private orbitMaxRenderMs = 0

  /**
   * Fluid motion: one clock for every moving surface, driven from `this.t` so
   * pause, hidden and offscreen stop it exactly the way they stop rotation.
   * Style is 0 for water and 1 for lava, which ripples slower and heavier.
   */
  private fluidTime = { value: 0 }
  private fluidStyle = { value: 0 }
  private fluidAmplitude = { value: 1 }
  /** Relief taken from a photographed world's own map, cached per texture. */
  private heightFields = new Map<string, HeightField | null>()
  private heightKey = ''

  /** The focused gas world's baked weather map. */
  private flatKey = ''
  private flatBakeId = 0
  private flatMap: THREE.DataTexture | null = null
  private flatSolid: THREE.DataTexture | null = null
  private flatSolidColor = -1

  /** Display toggles: cheap render state, never part of any bake key. */
  private showPaths = true
  private showLabels = false
  private showMoons = true
  private hoverIndex = -1
  /** Stop the clock while the pointer rests on a body; a time-menu option. */
  private pauseOnHover = false
  /** Whether it is resting on one now. Only consulted while the option is on. */
  private overBody = false
  private pathAnim = false
  private sysLabelKey = ''

  private seed: number | null = null
  private detail = ''
  private surfaceKey = ''
  private cloudKey = ''
  private cloudsPending = false
  private cloudLast = 0
  private scanT0 = 0
  private scanDur = 2000
  private mode: 'single' | 'system' = 'single'
  private sizeMode = ''
  private lastT = 0
  private t = 0
  private spin = 0
  private dayH = 0
  private spinRate = 0.1
  /** The real sky: the star and the other planets, drawn where they are. */
  private skyGroup: THREE.Group
  private skyStar: THREE.Sprite
  private skyGlow: THREE.Sprite
  private skyDots: THREE.Sprite[] = []
  /** Names for the sky, made only when the labels layer is switched on. */
  private skyLabels: Array<THREE.Sprite | null> = []
  private skyStarLabel: THREE.Sprite | null = null
  /** Which world's sky is being drawn, by name in its own system. */
  private skyOf = ''
  private skyWanted = false
  /** Frames between recomputes; a sky is nearly still on this clock. */
  private skyTick = 0
  /** Published: how many bodies are up there, and how wide the sun is. */
  private skyCount = 0
  private sunAngle = 0

  private moonKey = ''
  private moons: MoonInstance[] = []
  /** How far the outermost moon reaches, for framing and for the shadow box. */
  private moonSpan = 0
  /** Whether the sun is currently casting shadows, which only moons earn. */
  private shadows = false
  /** Whether a moon's shadow is on the world right now, published for tests. */
  private eclipse = false
  private eclipseCount = 0
  private real: (typeof REAL)[string] | null = null
  private ringKey = ''
  private fitZ = 3.15

  private n1: Noise3 | null = null
  private n2: Noise3 | null = null

  private rotY = 0
  private rotX = 0.16
  private velY = 0
  private velX = 0
  private dragging = false
  private camZ = 3.15
  private camR = 3.15
  private ptrs = new Map<number, { x: number; y: number }>()
  private pinchD = 0
  private moved = 0
  private tgt: { y: number; x: number; z: number } | null = null

  private texLoader = new THREE.TextureLoader()
  private texCache: Record<string, THREE.Texture> = {}
  private texUrl: string | null = null
  private cloudTexUrl: string | null = null
  private moonGeoCache = new Map<string, THREE.BufferGeometry>()
  private moonMatCache = new Map<string, THREE.MeshStandardMaterial>()

  private ro: ResizeObserver
  private io: IntersectionObserver
  private visibilityHandler: () => void
  private ringM3 = new THREE.Matrix3()
  private ringN = new THREE.Vector3()
  private tmpV = new THREE.Vector3()
  private tmpM = new THREE.Vector3()
  private m3g = new THREE.Matrix3()
  private ray = new THREE.Raycaster()
  private v2 = new THREE.Vector2()
  private hitSphere = new THREE.Sphere()
  /** The canvas size in CSS pixels, kept so the loop never measures layout. */
  private cssW = 0
  private cssH = 0

  /** Fired when a planet is clicked in the orbit view. */
  onPick: ((index: number) => void) | null = null
  /** Fired when a moon that is a world is clicked in the single-world view. */
  onPickMoon: ((world: { preset: PresetKey; seed: number }) => void) | null = null
  /** Fired when the planet in a moon's sky is clicked, to travel to it. */
  onPickParent: (() => void) | null = null

  constructor(container: HTMLElement) {
    this.container = container
    if (!container.style.position) container.style.position = 'relative'

    const nativeDpr = window.devicePixelRatio || 1
    // High-density screens already smooth edges through their physical pixels.
    // Combining DPR 2 with MSAA made Safari composite far more samples than the
    // viewport visibly benefits from.
    const renderer = new THREE.WebGLRenderer({ antialias: nativeDpr <= 1.5, alpha: true })
    this.pixelRatio = Math.min(nativeDpr, 1.5)
    renderer.setPixelRatio(this.pixelRatio)
    const cv = renderer.domElement
    cv.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab'
    container.appendChild(cv)
    this.renderer = renderer

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1400)
    this.camera.position.set(0, 0.5, this.camZ)
    this.camera.lookAt(0, 0, 0)

    this.group = new THREE.Group()
    this.scene.add(this.group)
    this.tiltG = new THREE.Group() // axial tilt (obliquity)
    this.group.add(this.tiltG)
    this.spinG = new THREE.Group() // body rotation about the axis
    this.tiltG.add(this.spinG)

    this.sun = new THREE.DirectionalLight(0xfff2df, 2.1)
    this.sun.position.set(5, 3, 4)
    this.scene.add(this.sun)
    // Enabling the map costs nothing until a light actually casts: with no
    // shadow-casting light in the scene, three.js compiles the same programs it
    // always did. `setShadows` turns the sun into one, and only for a world
    // that has a moon to throw a shadow with.
    renderer.shadowMap.enabled = true
    // Not PCFSoftShadowMap, however much softer an eclipse edge would look for
    // it. Three.js deprecated it: asking for it gets a console warning and a
    // silent swap to this on the first shadow render, and the swap recompiles
    // every material in the scene mid-frame — which left the cloud shell
    // sampling a shadow map that was being replaced underneath it, and painted
    // Earth's weather black.
    renderer.shadowMap.type = THREE.PCFShadowMap
    // Enough to resolve a moon's silhouette across the box the shadow camera
    // covers: at 1024 over ten units, our Moon's shadow is about 60 texels.
    this.sun.shadow.mapSize.set(1024, 1024)
    // An eclipse shadow is a moon's own silhouette, so acne shows up as a rash
    // across the whole day side rather than anywhere near it. Biasing along the
    // normal moves the comparison off the surface without detaching the shadow.
    this.sun.shadow.normalBias = 0.02
    this.amb = new THREE.AmbientLight(0x9a8fb8, 0.34)
    this.scene.add(this.amb)

    this.v2NormalMap = normalTexture(new Uint8Array([128, 128, 255, 255]), 1, 1)
    this.planet = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0,
        normalMap: this.v2NormalMap,
        normalScale: new THREE.Vector2(0, 0),
      }),
    )
    this.spinG.add(this.planet)

    const wmat = new THREE.MeshPhongMaterial({
      color: 0x3f86c9, transparent: true, opacity: 0.72, shininess: 90, specular: 0x555555,
    })
    // Visible fluid motion: perturb the shell's normal over time, the way a
    // normal map would, so specular light moves across water and lava. The
    // injection is part of the material from construction, so there is exactly
    // one program variant and the pre-presentation warmup covers it.
    wmat.onBeforeCompile = (sh) => {
      sh.uniforms.uFluidT = this.fluidTime
      sh.uniforms.uFluidS = this.fluidStyle
      sh.uniforms.uFluidA = this.fluidAmplitude
      sh.vertexShader = `varying vec3 vFluidP;\n${sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\tvFluidP = position;',
      )}`
      sh.fragmentShader = `uniform float uFluidT;uniform float uFluidS;uniform float uFluidA;varying vec3 vFluidP;\n${sh.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
	{
		vec3 fp = normalize(vFluidP);
		float ft = uFluidT * mix(0.9, 0.16, uFluidS);
		float fa = mix(0.05, 0.11, uFluidS);
		float w1 = sin(fp.x*46.0 + ft*2.1) + sin(fp.y*39.0 - ft*1.6) + sin(fp.z*44.0 + ft*1.3);
		float w2 = sin((fp.x+fp.y)*61.0 - ft*2.6) + sin((fp.y+fp.z)*53.0 + ft*2.2);
		vec3 fT = normalize(cross(fp, vec3(0.0, 1.0, 0.0)) + vec3(1.0e-4));
		vec3 fB = cross(fp, fT);
		normal = normalize(normal + (fT*w1 + fB*w2) * fa * uFluidA);
	}`,
      )}`
    }
    wmat.customProgramCacheKey = () => 'fluid-shell'
    this.water = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), wmat)
    this.spinG.add(this.water)

    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1, 80, 56),
      new THREE.MeshBasicMaterial({
        map: solidTexture(0xffffff, 0),
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    )
    this.spinG.add(this.clouds)

    this.atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.35, 64, 48),
      new THREE.ShaderMaterial({
        uniforms: {
          uC: { value: new THREE.Color(0x8fc7ff) },
          uI: { value: 1 },
          uLv: { value: new THREE.Vector3(0, 0, 1) },
        },
        vertexShader: ATMO_VERT,
        fragmentShader: ATMO_FRAG,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      }),
    )
    this.tiltG.add(this.atmo)

    // Fixed starfield, far enough out that it never intersects anything. The
    // pool holds twice the classic count and density draws a prefix of it via
    // setDrawRange — the same RNG sequence means the first 1400 stars are
    // exactly the ones the app has always drawn.
    const sg = new THREE.BufferGeometry()
    const sp = new Float32Array(STAR_POOL * 3)
    const rs = mulberry32(42)
    for (let k = 0; k < STAR_POOL; k++) {
      const u = rs() * 2 - 1
      const ph = rs() * Math.PI * 2
      const rr = Math.sqrt(1 - u * u)
      const rad = 320 + rs() * 260
      sp[k * 3] = rr * Math.cos(ph) * rad
      sp[k * 3 + 1] = u * rad
      sp[k * 3 + 2] = rr * Math.sin(ph) * rad
    }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    sg.setDrawRange(0, STAR_POOL / 2)
    this.stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        color: 0xffe9c4, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0.85,
      }),
    )
    this.scene.add(this.stars)

    // The real sky, when it is asked for: the star this world orbits and the
    // other planets of its system, in the directions they actually lie. It
    // hangs off the scene rather than the world, because it does not turn with
    // it — a day passes underneath a sky that is very nearly still.
    this.skyGroup = new THREE.Group()
    this.skyGroup.visible = false
    this.scene.add(this.skyGroup)
    const skySprite = (core: number) =>
      new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: skyDot(core),
          sizeAttenuation: false,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      )
    // The star is two sprites: the disc at the size it really subtends, and a
    // soft bloom around it. Ten pixels of sun would be a dull smudge without
    // the second one and a lie without the first.
    this.skyStar = skySprite(0.55)
    this.skyStar.visible = false
    this.skyGroup.add(this.skyStar)
    this.skyGlow = skySprite(0.04)
    this.skyGlow.material.opacity = 0.5
    this.skyGlow.visible = false
    this.skyGroup.add(this.skyGlow)

    // Exposure rides the tone-mapping stage. Linear at 1.0 is exactly the
    // identity, so the neutral setting cannot change a single pixel.
    renderer.toneMapping = THREE.LinearToneMapping
    renderer.toneMappingExposure = 1

    this.scanRing = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.012, 8, 90),
      new THREE.MeshBasicMaterial({
        color: 0xaff0d0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    )
    this.scanRing.rotation.x = Math.PI / 2
    this.scanRing.visible = false
    this.scene.add(this.scanRing)

    // Rings sit in the equatorial plane, outside the spinning body, so they
    // do not wobble with the surface rotation.
    this.ringG = new THREE.Group()
    this.tiltG.add(this.ringG)
    this.ring = new THREE.Mesh(ringGeo(1.11, 2.32), ringMaterial())
    this.ring.rotation.x = -Math.PI / 2
    this.ring.visible = false
    this.ringG.add(this.ring)

    this.texMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.MeshStandardMaterial({
        map: solidTexture(0xffffff),
        roughness: 1,
        metalness: 0,
      }),
    )
    this.texMesh.visible = false
    this.spinG.add(this.texMesh)

    this.gasMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: null },
          uTime: { value: 0 },
          uLight: { value: new THREE.Vector3(5, 3, 4).normalize() },
          uFlow: { value: 1 },
          uRing: { value: new THREE.Vector4(0, 0, 0, 0) },
          uLL: { value: new THREE.Vector3(0, 1, 0) },
        },
        vertexShader: GAS_VERT,
        fragmentShader: GAS_FRAG,
      }),
    )
    this.gasMesh.visible = false
    this.spinG.add(this.gasMesh)

    this.moonRoot = new THREE.Group()
    this.tiltG.add(this.moonRoot)

    // The planet a moon belongs to. Outside tiltG, because it must not inherit
    // the moon's axial tilt or its spin — it keeps its own place in the sky.
    this.companion = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 48),
      new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }),
    )
    this.companion.visible = false
    this.group.add(this.companion)

    // Saturn without its rings is not Saturn. The companion carries its own,
    // parented to it so they travel and tilt together.
    this.companionRing = new THREE.Mesh(ringGeo(1.11, 2.32), ringMaterial())
    this.companionRing.rotation.x = -Math.PI / 2
    this.companionRing.visible = false
    this.companion.add(this.companionRing)

    this.loop = this.loop.bind(this)
    this.bindPointer(cv)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.io = new IntersectionObserver(([entry]) => {
      this.inView = entry?.isIntersecting ?? true
      this.v2Terrain?.setSuspended(
        document.hidden || !this.inView || this.p?.autoRotate === false,
      )
      if (this.inView) this.invalidate()
      else if (this.raf) {
        cancelAnimationFrame(this.raf)
        this.raf = 0
      }
    })
    this.io.observe(container)
    this.visibilityHandler = () => {
      this.v2Terrain?.setSuspended(
        document.hidden || !this.inView || this.p?.autoRotate === false,
      )
      if (document.hidden && this.raf) {
        cancelAnimationFrame(this.raf)
        this.raf = 0
      } else if (!document.hidden) {
        this.lastT = 0
        this.invalidate()
      }
    }
    document.addEventListener('visibilitychange', this.visibilityHandler)
    this.resize()

    this.scheduleFrame()
  }

  /* --- public API ------------------------------------------------------- */

  setParams(p: PlanetParams) {
    this.p = { ...p }
    this.dirty = true
    this.invalidate()
  }

  /**
   * Hand the orbit view a system to draw. Held by reference and diffed on the
   * next frame, so passing an unchanged definition costs nothing.
   */
  setSystem(def: SystemDef) {
    this.sysDef = def
    this.dirty = true
    this.invalidate()
  }

  /** Run the spectrometer sweep animation. */
  scan(dur = 2000) {
    this.scanT0 = performance.now()
    this.scanDur = dur
    this.scanRing.visible = true
    this.invalidate()
  }

  resetView() {
    const z = this.fitZ || (this.mode === 'system' ? (this.sizeMode === 'scale' ? 86 : 11) : 3.15)
    this.tgt = { y: 0, x: 0.16, z }
    this.invalidate()
  }

  dispose() {
    this.stopped = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.io.disconnect()
    document.removeEventListener('visibilitychange', this.visibilityHandler)
    this.worldWorker?.terminate()
    this.cloudWorker?.terminate()
    this.v2Terrain?.dispose()
    this.v2Terrain = null
    this.clearBodies()
    this.flatMap?.dispose()
    this.flatSolid?.dispose()
    this.companionMap?.dispose()
    this.v2NormalMap?.dispose()
    for (const t of Object.values(this.texCache)) t.dispose()
    for (const g of this.moonGeoCache.values()) g.dispose()
    for (const m of this.moonMatCache.values()) m.dispose()
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
      const mat = m.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
      else if (mat) mat.dispose()
    })
    this.renderer.dispose()
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement)
    }
  }

  /* --- input ------------------------------------------------------------ */

  private bindPointer(cv: HTMLCanvasElement) {
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId)
      this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY })
      this.moved = 0
      if (this.ptrs.size === 1) {
        this.dragging = true
        this.tgt = null
        cv.style.cursor = 'grabbing'
      }
      if (this.ptrs.size === 2) {
        const a = [...this.ptrs.values()]
        this.pinchD = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y)
      }
      this.invalidate()
    })

    cv.addEventListener('pointermove', (e) => {
      const p = this.ptrs.get(e.pointerId)
      if (!p) {
        // No button down: this is a hover, which means something when the orbit
        // view is hiding its paths and one can be glimpsed, when what is under
        // the pointer can be clicked — and, with the option on, always, since
        // resting on a body is what stops the clock.
        if (!this.dragging) this.readHover(e, cv)
        return
      }
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      p.x = e.clientX
      p.y = e.clientY
      if (this.ptrs.size === 1) {
        this.moved += Math.abs(dx) + Math.abs(dy)
        this.velY = dx * 0.005
        this.velX = dy * 0.004
        this.rotY += this.velY
        this.rotX = Math.max(-1.32, Math.min(1.32, this.rotX + this.velX))
      } else if (this.ptrs.size === 2) {
        const a = [...this.ptrs.values()]
        const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y)
        this.camZ = Math.max(1.9, Math.min(this.zMax(), this.camZ * (this.pinchD / Math.max(1, d))))
        this.pinchD = d
      }
      this.invalidate()
    })

    const up = (e: PointerEvent) => {
      this.ptrs.delete(e.pointerId)
      if (this.ptrs.size === 0) {
        this.dragging = false
        cv.style.cursor = 'grab'
        if (this.moved < 6) {
          if (this.sys?.visible) this.pick(e)
          else {
            const m = this.moonAt(e)
            if (m?.world) this.onPickMoon?.(m.world)
            // The planet in a moon's sky is a place, not scenery: clicking it
            // travels there, which is the trip the back button also makes.
            else if (this.companionAt(e)) this.onPickParent?.()
          }
        }
        // The pointer is still wherever the drag left it, and it may be resting
        // on something — worth knowing, since that is what holds the clock.
        this.readHover(e, cv)
      }
      this.invalidate()
    }
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', up)
    cv.addEventListener('pointerleave', () => {
      this.setHover(-1)
      this.setOverBody(false)
    })

    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.tgt = null
        this.camZ = Math.max(1.9, Math.min(this.zMax(), this.camZ * (1 + e.deltaY * 0.001)))
        this.invalidate()
      },
      { passive: false },
    )
  }

  private zMax() {
    // Far enough out to see the whole system, whatever shape it is.
    return this.p?.mode === 'system' ? Math.max(260, this.fitScale * 3) : 9
  }

  /** Point the shared raycaster at whatever is under this pointer event. */
  private aim(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.v2.set(
      ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1,
      -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1,
    )
    this.ray.setFromCamera(this.v2, this.camera)
  }

  /** Which planet is under this pointer event, or -1. */
  private planetAt(e: PointerEvent): number {
    this.aim(e)
    const hits = this.ray.intersectObjects(this.sysPlanets, false)
    return hits.length ? (hits[0].object.userData as SysNode).index : -1
  }

  /**
   * The moon under the pointer in the single-world view, if any.
   *
   * Every moon counts, not only the ones that are worlds: a moon you cannot
   * visit is still a moon you can rest the pointer on. Callers that need a
   * destination check `world` themselves.
   */
  private moonAt(e: PointerEvent): MoonInstance | null {
    if (!this.moons.length || this.sys?.visible || !this.moonRoot.visible) return null
    this.aim(e)
    const hits = this.ray.intersectObjects(this.moons.map((m) => m.mesh), false)
    if (!hits.length) return null
    return this.moons.find((m) => m.mesh === hits[0].object) ?? null
  }

  /**
   * True when the pointer is over the planet a moon orbits.
   *
   * The companion is a plain ball, so it is tested as the sphere it is. Its
   * rings are left out on purpose: clicking Saturn should mean clicking Saturn,
   * not clicking the sixty degrees of empty sky its rings sweep through.
   */
  private companionAt(e: PointerEvent): boolean {
    if (!this.companion.visible) return false
    this.aim(e)
    this.companion.getWorldPosition(this.hitSphere.center)
    this.hitSphere.radius = this.companion.scale.x
    return this.ray.ray.intersectsSphere(this.hitSphere)
  }

  /** True when the pointer is over the world the single view is showing. */
  private worldAt(e: PointerEvent): boolean {
    if (this.sys?.visible) return false
    this.aim(e)
    this.hitSphere.center.set(0, 0, 0)
    this.hitSphere.radius = WORLD_HIT_R
    return this.ray.ray.intersectsSphere(this.hitSphere)
  }

  /**
   * What the pointer is resting on, and what that means.
   *
   * Three answers come out of one read: which orbit path to reveal, whether
   * the cursor should offer a click, and whether a body is under the pointer
   * at all — which is what stops the clock when that option is on. Each test
   * is skipped when nothing would use its answer, so a plain hover over the
   * orbit view with paths shown still costs nothing.
   */
  private readHover(e: PointerEvent, cv: HTMLCanvasElement) {
    if (this.sys?.visible) {
      if (this.showPaths && !this.pauseOnHover) return
      const i = this.planetAt(e)
      if (!this.showPaths) this.setHover(i)
      this.setOverBody(i >= 0)
      return
    }
    // A moon you can visit should say so before you click it, and so should
    // the planet it belongs to.
    const moon = this.moonAt(e)
    const parent = !moon && this.companionAt(e)
    cv.style.cursor = moon?.world || parent ? 'pointer' : 'grab'
    if (this.pauseOnHover) this.setOverBody(!!moon || parent || this.worldAt(e))
  }

  private pick(e: PointerEvent) {
    const i = this.planetAt(e)
    if (i >= 0) this.onPick?.(i)
  }

  private setHover(index: number) {
    if (index === this.hoverIndex) return
    this.hoverIndex = index
    this.syncPathTargets()
    this.invalidate()
  }

  /** Note whether a body is under the pointer, and wake the loop if it matters. */
  private setOverBody(over: boolean) {
    if (over === this.overBody) return
    this.overBody = over
    // Stopping needs a frame as much as starting does: the loop has to run
    // once more to notice it should not run again.
    if (this.pauseOnHover) this.invalidate()
  }

  private resize() {
    const w = this.container.clientWidth || 300
    const h = this.container.clientHeight || 300
    this.cssW = w
    this.cssH = h
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.invalidate()
  }

  /* --- resource building ------------------------------------------------ */

  private buildGeo(det: string) {
    const seg = det === 'high' ? 220 : 150
    const hseg = det === 'high' ? 150 : 104
    this.geo?.dispose()
    const g = new THREE.SphereGeometry(1, seg, hseg)
    const n = g.attributes.position.count
    this.dirs = new Float32Array(g.attributes.position.array)
    // White vertex colour lets a first-use v2 world show its palette fallback
    // while the worker compiles, without changing material shader topology.
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3))
    this.geo = g
    this.planet.geometry = g
    this.surfaceKey = ''
    this.compileNeeded = true
  }

  private loadTex(url: string, repeat?: boolean): THREE.Texture {
    if (!this.texCache[url]) {
      const t = this.texLoader.load(url, () => this.invalidate())
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = 8
      this.texCache[url] = t
    }
    if (repeat) this.texCache[url].wrapS = THREE.RepeatWrapping
    return this.texCache[url]
  }

  private setRing(cfg: RingConfig | null) {
    const key = cfg
      ? `${cfg.inner}:${cfg.outer}:${cfg.map || ''}:${cfg.profile || 0}:${cfg.color}:${cfg.opacity}:${JSON.stringify(cfg.bands || 0)}`
      : ''
    const wasVisible = this.ring.visible
    this.ring.visible = !!cfg
    if (!wasVisible && this.ring.visible) this.compileNeeded = true
    if (!cfg || key === this.ringKey) return
    this.ringKey = key

    this.ring.geometry.dispose()
    this.ring.geometry = ringGeo(cfg.inner, cfg.outer)
    const u = this.ring.material.uniforms
    u.uColor.value.set(cfg.color)
    u.uOpacity.value = cfg.opacity
    u.uProfile.value = cfg.profile || 0
    u.uMap.value = cfg.map ? this.loadTex(cfg.map) : null
    u.uHasMap.value = cfg.map ? 1 : 0
    u.uBandCount.value = cfg.bands ? cfg.bands.length : 0
    if (cfg.bands) {
      for (let i = 0; i < cfg.bands.length; i++) {
        const b = cfg.bands[i]
        u.uBands.value[i].set(b[0], b[1], b[2], b[3])
      }
    }
  }

  /** Returns the outermost moon distance, used to frame the camera. */
  private setMoons(list: Moon[]): number {
    const key = list.map((m) => m.n + m.a).join('|')
    if (key === this.moonKey) return 0
    this.moonKey = key

    for (const old of this.moons) {
      // Meshes reuse cached geometry/materials; the path line is per-instance.
      old.line.geometry.dispose()
      old.line.material.dispose()
      this.moonRoot.remove(old.orbit)
    }
    this.moons = []

    let maxD = 0
    for (let i = 0; i < list.length; i++) {
      const d = list[i]
      const rd = d.rd ?? moonRad(d.r)
      const dist = d.dd ?? moonDist(d.a)
      maxD = Math.max(maxD, dist * (1 + (d.e || 0) * 0.5))

      const orbit = new THREE.Group()
      // The node has to turn the tilted plane, not spin the moon inside it, so
      // it must be the outer rotation of the two. Default Euler order applies
      // X last, which quietly made the node a phase offset and nothing else —
      // every moon of a planet shared one plane, and precessing it did nothing.
      const node = i * 2.399 + 0.7
      orbit.rotation.order = 'YXZ'
      orbit.rotation.y = node // longitude of the ascending node
      orbit.rotation.x = (d.inc || 0) * D2R

      const geoKey = `${rd}:${d.irr?.join(':') ?? ''}`
      let geo = this.moonGeoCache.get(geoKey)
      if (!geo) {
        geo = moonGeo(rd, d.irr)
        this.moonGeoCache.set(geoKey, geo)
      }
      const matKey = d.tone ? `tone:${d.tone.join(':')}` : `color:${d.c}`
      let mmat = this.moonMatCache.get(matKey)
      if (!mmat) {
        mmat = new THREE.MeshStandardMaterial({ color: d.c, roughness: 0.98, metalness: 0 })
        if (d.tone) {
          mmat.map = toneTex(d.tone[0], d.tone[1])
          mmat.color.set(0xffffff)
        }
        this.moonMatCache.set(matKey, mmat)
        this.compileNeeded = true
      }
      const mesh = new THREE.Mesh(geo, mmat)
      // A moon is the only thing here small enough to throw a shadow worth
      // looking at, and cheap enough to be worth rendering twice for it.
      mesh.castShadow = true
      orbit.add(mesh)

      // The moon's path, in its own orbital plane and its own colour, traced
      // with the same eccentric-anomaly stepping the loop moves the moon by.
      const ecc = d.e || 0
      const pts: THREE.Vector3[] = []
      for (let k = 0; k <= 128; k++) {
        const E = (k / 128) * 6.2832
        pts.push(new THREE.Vector3(
          dist * (Math.cos(E) - ecc), 0, dist * Math.sqrt(1 - ecc * ecc) * Math.sin(E),
        ))
      }
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({
          color: d.tone ? d.tone[0] : d.c, transparent: true, opacity: 0.38,
        }),
      )
      line.visible = this.showPaths
      orbit.add(line)

      this.moonRoot.add(orbit)
      this.moons.push({
        orbit, mesh, line, r: rd, d: dist, e: ecc, P: d.P, phase: (i * 2.1) % 6.283,
        node, mark: d.mark ?? 0, world: d.world,
      })
    }
    if (list.length) this.compileNeeded = true
    this.moonSpan = maxD
    return maxD
  }

  /**
   * Let the moons throw shadows, or stop paying for them.
   *
   * Only a world with moons turns this on. A shadow map is a second render of
   * everything that casts and a second program for everything that receives,
   * which is a real price to pay on a world with nothing to cast. The world
   * itself does not cast: its shadow would fall on a moon behind it, which is a
   * lunar eclipse and worth having, but the world is the tens of thousands of
   * triangles in this scene and drawing them twice a frame is the one cost this
   * engine has always refused. A moon is a 22-segment sphere.
   *
   * Gas giants are the other gap: their bands come from a hand-written shader
   * that samples no shadow map, so Io's shadow does not cross Jupiter. That is
   * a shader to be written, not a decision.
   */
  private setShadows(on: boolean, md: number) {
    if (on) {
      // The map is spent entirely on this box, so it holds only what has to be
      // in it — the moons and the world — with room for a moon at the edge.
      const c = this.sun.shadow.camera
      const r = Math.max(1.5, md) + SHADOW_MARGIN
      c.left = -r
      c.right = r
      c.top = r
      c.bottom = -r
      c.near = 0.5
      c.far = 14
      c.updateProjectionMatrix()
    }
    for (const mo of this.moons) mo.mesh.receiveShadow = on
    if (on === this.shadows) return
    this.shadows = on
    this.sun.castShadow = on
    for (const m of [this.planet, this.texMesh, this.water, this.clouds]) m.receiveShadow = on
    // Sampling a shadow map is a different program from not sampling one, so
    // the warmup has to run again before the first frame that needs it.
    this.compileNeeded = true
    if (!on) this.setEclipse(false)
  }

  /**
   * Decide whether this world has a sky to show, and make room for it.
   *
   * A world has one when it is a body of the system currently loaded — which is
   * how it knows where it stands. A world you have only sculpted is nowhere in
   * particular, and gets the invented starfield it always had.
   */
  private syncSky(P: PlanetParams) {
    const def = this.sysDef
    const me = def?.bodies.find(
      (b) => b.params.preset === P.preset && b.params.seed === P.seed,
    )
    this.skyWanted = P.sky === true && !!me
    this.skyGroup.visible = this.skyWanted
    if (!this.skyWanted || !me || !def) {
      this.skyOf = ''
      return
    }
    if (me.name === this.skyOf) return
    this.skyOf = me.name

    // One sprite per body that could be up there. The set only changes with
    // the system, so this runs on arrival rather than per frame.
    const want = Math.max(0, def.bodies.filter((b) => !b.orbits).length - 1)
    while (this.skyDots.length > want) {
      const s = this.skyDots.pop()!
      this.skyGroup.remove(s)
      s.material.dispose()
      const lab = this.skyLabels.pop()
      if (lab) {
        this.skyGroup.remove(lab)
        lab.material.map?.dispose()
        lab.material.dispose()
      }
    }
    while (this.skyDots.length < want) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: skyDot(0.5),
          sizeAttenuation: false,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      )
      s.visible = false
      this.skyGroup.add(s)
      this.skyDots.push(s)
      this.skyLabels.push(null)
    }
    // A name changes which body each sprite is, so the old ones are wrong.
    for (let i = 0; i < this.skyLabels.length; i++) {
      const lab = this.skyLabels[i]
      if (!lab) continue
      this.skyGroup.remove(lab)
      lab.material.map?.dispose()
      lab.material.dispose()
      this.skyLabels[i] = null
    }
    this.skyTick = 0
    this.compileNeeded = true
  }

  /**
   * Put the sky where it belongs, for the moment the clock is at.
   *
   * Two things are being reconciled. The geometry knows where the star is in
   * the system's own frame; the view has a sun the user aims with a pair of
   * sliders, and has had since long before any of this. So the whole sky is
   * turned by the one rotation that lands the star on the light — after which
   * every angle within it is the true one, measured from a sun that is where
   * you put it. What that leaves free is the roll about the sun's own axis,
   * and nothing observable depends on it.
   */
  private updateSky() {
    const def = this.sysDef
    if (!this.skyWanted || !def || !this.skyOf) return
    // A drawn year is 365.25 drawn days, and a drawn day is DAY_SEC — which
    // makes this the one clock in the app running at the rate a person on the
    // surface would experience. The sky barely moves over a day, and that is
    // exactly right; leave it at 20x for a while and the planets wander.
    const sky = skyFrom(def, this.skyOf, this.t / (365.25 * DAY_SEC))
    if (!sky) return

    this.tmpV.set(...sky.star.dir)
    this.skyGroup.quaternion.setFromUnitVectors(this.tmpV, this.sunDir)

    const starAng = Math.max(SKY_MIN_ANG * 1.6, 2 * sky.star.ang)
    this.skyStar.position.set(...sky.star.dir).multiplyScalar(SKY_R)
    this.skyStar.scale.set(starAng, starAng, 1)
    this.skyStar.material.color.set(def.star.color)
    this.skyStar.visible = true
    // The bloom is a fixed multiple of the disc, so a small sun glows small.
    const glow = starAng * 4.5
    this.skyGlow.position.copy(this.skyStar.position)
    this.skyGlow.scale.set(glow, glow, 1)
    this.skyGlow.material.color.set(def.star.color)
    this.skyGlow.visible = true
    this.skyStarLabel = this.nameInSky(this.skyStarLabel, sky.star.name, this.skyStar.position, starAng)
    this.sunAngle = 2 * sky.star.ang

    // Brightness spans decades, so it is read the way magnitudes are: the
    // brightest thing up there sets the top, and four decades below it is the
    // bottom of the scale. Everything is drawn at the same size, because
    // everything is the same size — a point — and the bright ones bloom a
    // little wider only because that is what brightness looks like.
    const top = Math.log10(Math.max(1e-30, sky.bodies[0]?.bright ?? 1))
    for (let i = 0; i < this.skyDots.length; i++) {
      const b = sky.bodies[i]
      const s = this.skyDots[i]
      if (!b) {
        s.visible = false
        continue
      }
      const norm = Math.min(1, Math.max(0, (Math.log10(Math.max(1e-30, b.bright)) - top + 4) / 4))
      const ang = SKY_MIN_ANG * (1 + 0.7 * norm)
      s.position.set(...b.dir).multiplyScalar(SKY_R)
      s.scale.set(ang, ang, 1)
      s.material.opacity = 0.28 + 0.72 * norm
      // Its own colour, the one its orbit line wears in the system view. Mars
      // is ruddy from anywhere, and it is the only thing telling one point of
      // light from another once they are all the same size.
      const pal = PALETTES[def.bodies[b.index].params.preset] ?? PALETTES.temperate
      s.material.color.set(isGas(pal) ? pal.bands[(pal.bands.length / 2) | 0][1] : pal.mid)
      s.visible = true
      // Named, when names are switched on. Without them the sky is honest and
      // illegible: a planet at its true size is a point, and a point among
      // fourteen hundred invented stars is not a planet anybody can find. This
      // is the one place a label is not decoration but the whole difference
      // between showing something and only having drawn it.
      this.skyLabels[i] = this.nameInSky(this.skyLabels[i], b.name, s.position, ang)
    }
    this.skyCount = 1 + Math.min(this.skyDots.length, sky.bodies.length)
  }

  /**
   * Keep one sky body's name beside it, making the sprite the first time it is
   * needed and freeing it when the names go away again.
   */
  private nameInSky(
    existing: THREE.Sprite | null,
    name: string,
    at: THREE.Vector3,
    ang: number,
  ): THREE.Sprite | null {
    if (!this.showLabels) {
      if (existing) {
        this.skyGroup.remove(existing)
        existing.material.map?.dispose()
        existing.material.dispose()
      }
      return null
    }
    const label = existing ?? this.makeLabel(name)
    if (!existing) {
      // The orbit view's labels deliberately ignore depth, so a name is never
      // lost behind the body it belongs to. Up here the opposite is wanted: a
      // planet round the back of the world is not visible, and a name floating
      // over the world's face claiming otherwise is a lie the picture tells.
      label.material.depthTest = true
      this.skyGroup.add(label)
    }
    label.position.copy(at)
    // Clear of the dot, whatever size the dot came out: a sun wants more room
    // than a planet, and both want the name above rather than across them.
    // Closer than the orbit view's labels sit, because the thing being named
    // is three pixels wide and a name floating far above it names nothing.
    label.center.set(0.5, 0.5 - (0.75 + ang * 60))
    return label
  }

  /**
   * Where the star is on screen, in canvas pixels, or `off` when it is not.
   *
   * The same reasoning as the parent planet's position: the drawing buffer
   * cannot be read back, and a thing whose whole claim is *where it is* has to
   * say so somehow. It is off screen more often than not — the default light
   * comes over the viewer's shoulder, which is what makes these worlds look
   * lit, and a sun behind you is a sun you have to turn round for.
   */
  private projectSky(): string {
    if (!this.skyStar.visible) return 'off'
    this.skyStar.getWorldPosition(this.tmpV).project(this.camera)
    if (this.tmpV.z > 1 || Math.abs(this.tmpV.x) > 1 || Math.abs(this.tmpV.y) > 1) return 'off'
    const x = Math.round(((this.tmpV.x + 1) / 2) * this.cssW)
    const y = Math.round(((1 - this.tmpV.y) / 2) * this.cssH)
    return `${x},${y}`
  }

  /**
   * Whether a moon is standing between the sun and the world.
   *
   * The same arithmetic the shadow map is about to do, and the only way to say
   * so out loud: WebGL discards its drawing buffer, so no test can look at the
   * canvas and see an eclipse. The sunlight here is parallel, so a moon's
   * shadow is a cylinder of its own width — it falls on the world exactly when
   * the moon is on the lit side and within a world's radius of the axis.
   */
  private shadowOnTheWorld(): boolean {
    for (const mo of this.moons) {
      mo.mesh.getWorldPosition(this.tmpM)
      const along = this.tmpM.dot(this.sunDir)
      if (along <= 0) continue
      // Within one radius of the axis, which is where the shadow's own centre
      // strikes the world. Any overlap at all would be truthful and useless:
      // a moon a whisker outside this clips the limb with an edge of penumbra
      // nobody would call an eclipse.
      if (this.tmpM.lengthSq() - along * along < 1) return true
    }
    return false
  }

  /**
   * Publish the eclipse, on the change rather than every frame.
   *
   * The running total is the half that can be relied on. An eclipse is over in
   * a tenth of an orbit, so anything sampling `eclipse` on a timer will mostly
   * find it false and conclude, wrongly, that shadows never fall.
   */
  private setEclipse(on: boolean) {
    if (on === this.eclipse) return
    this.eclipse = on
    const cv = this.renderer.domElement
    if (!on) {
      delete cv.dataset.eclipse
      return
    }
    cv.dataset.eclipse = '1'
    cv.dataset.eclipses = String(++this.eclipseCount)
  }

  /**
   * Frame the whole of a moon's orbit.
   *
   * The difference between watching a moon go round and catching sight of it in
   * the corner twice a lap. The old rule multiplied the orbit by 1.32, which
   * bears no relation to the field of view: at 45° a camera `d` back shows
   * `0.41·d` either side of the middle, so 1.32 left two thirds of every orbit
   * off screen. The orbit is drawn nearly edge-on, so width binds and height
   * rarely does. The world is smaller in frame for this, which is the trade —
   * a planet and its moon are a pair, and a pair has to fit.
   */
  private frameForMoons(md: number): number {
    const halfV = Math.tan((this.camera.fov * D2R) / 2)
    const byWidth = (md + 0.4) / (halfV * Math.max(0.4, this.camera.aspect))
    const byHeight = (md * Math.abs(Math.sin(this.rotX)) + 1.35) / halfV
    return Math.min(9.8, Math.max(3.15, byWidth, byHeight))
  }

  /** Create the star and the container everything orbits in, once. */
  private ensureSystem() {
    if (this.sys) return
    this.sys = new THREE.Group()
    this.group.add(this.sys)

    this.sunMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uTint: { value: new THREE.Color(0xffffff) } },
      vertexShader: SUN_VERT,
      fragmentShader: SUN_FRAG,
    })
    this.sunMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 72, 48), this.sunMat)
    this.sys.add(this.sunMesh)

    // Three.js dropped `useLegacyLights` after r164, so punctual lights are
    // always in physical units now. The prototype's 2.1 was tuned under the
    // old legacy scaling; the 4π factor converts it back to the same look.
    const sunLight = new THREE.PointLight(0xffe8c9, 2.1 * 4 * Math.PI, 0)
    sunLight.decay = 0
    this.sys.add(sunLight)

    // One sphere serves every planet; only the material and scale differ.
    this.sysGeo = new THREE.SphereGeometry(1, 48, 32)
    this.sysRoot = new THREE.Group()
    this.sys.add(this.sysRoot)
    this.compileNeeded = true
  }

  /** Tear down the current bodies. Called before rebuilding, and on dispose. */
  private clearBodies() {
    this.bakeGeneration++
    this.bakeTargets.clear()
    for (const slot of this.v2PreviewTargets.keys()) this.v2Terrain?.cancel(slot)
    this.v2PreviewTargets.clear()
    this.worldWorker?.terminate()
    this.worldWorker = null
    for (const u of this.sysNodes) {
      u.mesh.material.dispose()
      u.baked?.dispose()
      if (!u.baked && u.ownsMap && u.mesh.material.map) u.mesh.material.map.dispose()
      if (u.ringMesh) {
        u.ringMesh.geometry.dispose()
        u.ringMesh.material.dispose()
      }
      for (const l of [u.lineSame, u.lineScale]) {
        l.geometry.dispose()
        l.material.dispose()
      }
      u.label?.material.map?.dispose()
      u.label?.material.dispose()
      u.plane.removeFromParent()
    }
    this.sysNodes = []
    this.sysPlanets = []
    // Whatever was hovered no longer exists at that index.
    this.hoverIndex = -1
  }

  private ensureWorldWorker(): Worker {
    if (this.worldWorker) return this.worldWorker
    const worker = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<BakeWorkerResponse>) => {
      const response = event.data

      // A focused gas world shares the worker; latest request wins, and a
      // bake landing after the view moved on is kept for the next visit.
      if (response.id === this.flatBakeId && this.flatKey) {
        const texture = dataTexture(
          new Uint8Array(response.pixels), response.width, response.height,
        )
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
        this.flatMap?.dispose()
        this.flatMap = texture
        const P = this.p
        const pal = P ? PALETTES[P.preset] ?? PALETTES.temperate : null
        if (P && this.mode === 'single' && !P.texture && pal && isGas(pal)) {
          this.gasMesh.material.uniforms.uMap.value = texture
          this.invalidate()
        }
        return
      }

      if (response.id === this.companionBakeId) {
        const texture = dataTexture(
          new Uint8Array(response.pixels), response.width, response.height,
        )
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
        this.companionMap?.dispose()
        this.companionMap = texture
        if (this.companion.visible) {
          this.companion.material.map = texture
          this.companion.material.color.set(0xffffff)
          this.companion.material.needsUpdate = true
          this.invalidate()
        }
        return
      }

      const target = this.bakeTargets.get(response.id)
      this.bakeTargets.delete(response.id)
      if (
        !target ||
        target.generation !== this.bakeGeneration ||
        !this.sysNodes.includes(target.node)
      ) return

      const texture = dataTexture(
        new Uint8Array(response.pixels),
        response.width,
        response.height,
      )
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
      const mat = target.node.mesh.material
      if (mat.map && mat.map !== target.node.baked) mat.map.dispose()
      target.node.baked?.dispose()
      target.node.baked = texture
      mat.map = texture
      mat.color.set(0xffffff)
      this.invalidate()
    }
    worker.onerror = () => {
      // The palette-coloured mapped placeholder remains a valid fallback.
      worker.terminate()
      if (this.worldWorker === worker) this.worldWorker = null
    }
    this.worldWorker = worker
    return worker
  }

  private queueWorldBake(node: SysNode, params: PlanetParams) {
    if (params.generatorVersion === 2) {
      const slot = `preview:${node.index}`
      this.v2PreviewTargets.set(slot, { generation: this.bakeGeneration, node })
      this.ensureV2Terrain().request(slot, {
        params,
        priority: 'preview',
        artifact: { kind: 'flat', width: V2_FLAT_WIDTH, height: V2_FLAT_HEIGHT },
      })
      return
    }
    const id = ++this.bakeId
    this.bakeTargets.set(id, { generation: this.bakeGeneration, node })
    const request: BakeWorkerRequest = { id, kind: 'world', params }
    this.ensureWorldWorker().postMessage(request)
  }

  /** Lazily create the separately bundled v2 compiler on its first v2 world. */
  private ensureV2Terrain(): V2TerrainClient {
    if (this.v2Terrain) return this.v2Terrain
    const client = new V2TerrainClient({
      onArtifact: (response) => this.acceptV2Artifact(response),
      // The last complete artifact (or palette placeholder) remains visible on
      // failure, so worker errors do not turn an interaction into a blank globe.
      onError: () => this.invalidate(),
    })
    client.setSuspended(
      this.stopped || document.hidden || !this.inView || this.p?.autoRotate === false,
    )
    this.v2Terrain = client
    return client
  }

  /** Install only current, complete v2 artifacts; stale filtering lives in the client too. */
  private acceptV2Artifact(response: Extract<V2WorkerResponse, { type: 'artifact' }>) {
    if (this.stopped) return
    const artifact = response.artifact
    if (artifact.kind === 'flat') {
      const texture = dataTexture(
        new Uint8Array(artifact.rgba), artifact.width, artifact.height,
      )
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())

      if (response.slot === 'single:gas') {
        const P = this.p
        const pal = P ? PALETTES[P.preset] ?? PALETTES.temperate : null
        if (!P || P.generatorVersion !== 2 || this.mode !== 'single' || !pal || !isGas(pal)) {
          texture.dispose()
          return
        }
        this.flatMap?.dispose()
        this.flatMap = texture
        this.gasMesh.material.uniforms.uMap.value = texture
        this.invalidate()
        return
      }

      if (response.slot === 'companion') {
        if (!this.companion.visible) {
          texture.dispose()
          return
        }
        this.companionMap?.dispose()
        this.companionMap = texture
        this.companion.material.map = texture
        this.companion.material.color.set(0xffffff)
        this.companion.material.needsUpdate = true
        this.invalidate()
        return
      }

      const target = this.v2PreviewTargets.get(response.slot)
      this.v2PreviewTargets.delete(response.slot)
      if (
        !target ||
        target.generation !== this.bakeGeneration ||
        !this.sysNodes.includes(target.node)
      ) {
        texture.dispose()
        return
      }
      const mat = target.node.mesh.material
      if (mat.map && mat.map !== target.node.baked) mat.map.dispose()
      target.node.baked?.dispose()
      target.node.baked = texture
      mat.map = texture
      mat.color.set(0xffffff)
      this.invalidate()
      return
    }

    const P = this.p
    if (
      response.slot !== 'single:detailed' ||
      !P ||
      P.generatorVersion !== 2 ||
      this.mode !== 'single' ||
      !!P.texture ||
      isGas(PALETTES[P.preset] ?? PALETTES.temperate) ||
      surfaceKey(P, this.detail) !== this.v2DetailKey
    ) return

    const geometry = this.geo
    if (!geometry) return
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(artifact.positions), 3),
    )
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(artifact.colors), 3),
    )
    geometry.setAttribute(
      'normal',
      new THREE.BufferAttribute(new Float32Array(artifact.normals), 3),
    )
    // Relief is bounded by the compiler; avoid a main-thread bounds scan.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.08)
    const material = this.planet.material as THREE.MeshStandardMaterial
    const nextNormalMap = normalTexture(
      new Uint8Array(artifact.normalMap), artifact.detailMapWidth, artifact.detailMapHeight,
    )
    nextNormalMap.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    this.v2NormalMap?.dispose()
    this.v2NormalMap = nextNormalMap
    material.normalMap = nextNormalMap
    material.normalScale.setScalar(ecosystemStyleFor(P.seed, P.preset) ? 0.85 : 0.55)
    material.color.set(0xffffff)
    this.v2SeaRadius = artifact.seaRadius
    this.water.scale.setScalar(Math.max(0.88, artifact.seaRadius))
    this.invalidate()
  }

  /**
   * Build one mesh per body. Measured bodies get their photographic map;
   * v1 worlds bake the same `Surface` as the single view, while v2 worlds
   * resample their worker-owned canonical model. Either way a world keeps one
   * identity wherever you meet it.
   */
  private buildBodies(def: SystemDef) {
    const buildStart = performance.now()
    let labelDuration = 0
    this.clearBodies()
    this.orbitFirstRenderPending = true
    this.orbitMaxRenderMs = 0

    // Satellites are moons, and the moons toggle is what turns moons off.
    const shown = def.bodies.filter((b) => this.showMoons || !b.orbits)
    this.sysBodies = shown
    const indexOf = new Map(shown.map((b, i) => [b.name, i]))

    shown.forEach((b, i) => {
      const parent = b.orbits ? indexOf.get(b.orbits) ?? -1 : -1
      const plane = new THREE.Group()
      // A satellite's plane hangs off its planet's node rather than the star's
      // root, so it inherits the planet's position every frame — orbit line
      // included — and nothing has to be ordered by hand.
      if (parent >= 0) this.sysNodes[parent].node.add(plane)
      else this.sysRoot!.add(plane)

      const node = new THREE.Group()
      plane.add(node)
      const tilt = new THREE.Group()
      tilt.rotation.z = b.tilt * D2R
      node.add(tilt)
      const spin = new THREE.Group()
      tilt.add(spin)

      const pal = PALETTES[b.params.preset] ?? PALETTES.temperate
      const fallback = isGas(pal) ? pal.bands[(pal.bands.length / 2) | 0][1] : pal.mid
      const mat = new THREE.MeshStandardMaterial({
        map: b.texture ? this.loadTex(b.texture) : solidTexture(fallback),
        roughness: 1,
        metalness: 0,
      })
      if (b.texture) {
        mat.color.set(0xffffff)
      } else {
        // Until the bake lands, show the world's own mid-tone rather than a
        // placeholder grey, so the system reads correctly on the first frame.
        mat.color.set(isGas(pal) ? pal.bands[(pal.bands.length / 2) | 0][1] : pal.mid)
      }
      const m = new THREE.Mesh(this.sysGeo!, mat)
      m.scale.set(1, 1 - b.flattening, 1)
      spin.add(m)

      // The orbit path wears the same colour the planet itself falls back to,
      // so line and body read as one thing. Textured bodies have palettes too.
      const lineOpacity = this.showPaths ? PATH_OPACITY : 0
      const mkLine = () =>
        new THREE.Line(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({ color: fallback, transparent: true, opacity: lineOpacity }),
        )
      const lineSame = mkLine()
      const lineScale = mkLine()
      plane.add(lineSame)
      plane.add(lineScale)

      const labelStart = performance.now()
      const label = this.showLabels ? this.makeLabel(b.name) : null
      labelDuration += performance.now() - labelStart
      if (label) node.add(label)

      const ring = b.ring ?? (b.params.rings ? customRing(b.params, pal) : null)
      let ringMesh: SysNode['ringMesh'] = null
      if (ring) {
        ringMesh = new THREE.Mesh(ringGeo(ring.inner, ring.outer), ringMaterial())
        // Rings lie in the body's equatorial plane; a sculpted world may cant
        // them further, exactly as it does in the single-world view.
        ringMesh.rotation.x = -Math.PI / 2
        ringMesh.rotation.z = b.ring ? 0 : ((b.params.ringTilt ?? 0.5) - 0.5) * 1.5708
        const u = ringMesh.material.uniforms
        u.uColor.value.set(ring.color)
        u.uOpacity.value = ring.opacity
        u.uProfile.value = ring.profile || 0
        u.uBandCount.value = ring.bands ? ring.bands.length : 0
        if (ring.bands) {
          for (let k = 0; k < ring.bands.length; k++) {
            const bd = ring.bands[k]
            u.uBands.value[k].set(bd[0], bd[1], bd[2], bd[3])
          }
        }
        if (ring.map) {
          u.uMap.value = this.loadTex(ring.map)
          u.uHasMap.value = 1
        }
        u.uL.value.set(1, 0, 0)
        tilt.add(ringMesh)
      }

      const ud: SysNode = {
        index: i, plane, node, tilt, spin, mesh: m, ringMesh, baked: null,
        ownsMap: !b.texture,
        a: 0, e: b.e, period: b.period, aSame: 0, aScale: 0,
        // Same-size mode draws every planet alike so the small ones stay
        // findable; a moon drawn the size of its planet would undo that, so
        // satellites get their own smaller flat size.
        rSame: parent >= 0 ? 0.092 : 0.24, rScale: sizeMap(b.radius * 6371) * 0.85,
        peri: 0, angle: (i * 2.3994) % 6.2832, day: b.day, f: b.flattening,
        lineSame, lineScale, lineTarget: lineOpacity, label, labelName: b.name,
        parent, lock: false,
      }
      m.userData = ud

      // A satellite is a handful of pixels wide at system scale, where the
      // palette tone it already wears is indistinguishable from a baked map.
      // It gets the real surface in the single-world view, where it is big
      // enough to deserve one.
      if (!b.texture && parent < 0) this.queueWorldBake(ud, b.params)

      this.sysPlanets.push(m)
      this.sysNodes.push(ud)
    })
    this.compileNeeded = true
    recordOrbitMeasure('label-creation', performance.now() - labelDuration)
    recordOrbitMeasure('build-bodies', buildStart)
  }

  /** Apply the orbital elements, which can change without a rebuild. */
  private applyOrbits() {
    this.fitSame = 0
    this.fitScale = 0
    const bodies = this.sysBodies

    // Compact systems are stretched and slowed as a whole — one factor each,
    // so internal geometry and relative pacing survive exactly.
    // Satellites sit inside their planet's neighbourhood and orbit in days,
    // so they must not drive the whole system's stretch or its tempo.
    const orbiting = bodies.filter((b) => !b.orbits)
    const aMax = orbiting.reduce((m, b) => Math.max(m, b.a), 0)
    const pMin = orbiting.reduce((m, b) => Math.min(m, b.period), Infinity)
    const stretch = systemStretch(aMax)
    const tempo = tempoFor(pMin)

    // Each planet's moons share one clock factor of their own, so a family
    // keeps its internal ratios exactly and only its overall pace is eased.
    const famMin = new Map<string, number>()
    for (const b of bodies) {
      if (b.orbits) famMin.set(b.orbits, Math.min(famMin.get(b.orbits) ?? Infinity, b.period))
    }

    // Parents first: a satellite's drawn orbit is measured against its
    // planet's, so the planet's has to exist by the time the moon asks.
    const order = bodies
      .map((_, i) => i)
      .sort((x, y) => (bodies[x].orbits ? 1 : 0) - (bodies[y].orbits ? 1 : 0))

    order.forEach((i) => {
      const b = bodies[i]
      const u = this.sysNodes[i]
      if (!u) return

      u.plane.rotation.y = b.node * D2R // longitude of ascending node
      u.plane.rotation.x = b.inc * D2R // inclination to the reference plane
      u.e = b.e
      // The drawn period; the body list keeps quoting the measured one. A
      // satellite's real year is days, which at the system's pace would be a
      // blur — so its family is slowed together, which is the one easing that
      // leaves a moon's pace tied to its planet's. The easing it used to borrow
      // from the single-world view was in wall-clock seconds and knew nothing
      // about the planet at all: it put the Moon round Earth once every four
      // Earth years, which is why it read as not going round at all.
      u.period = b.orbits
        ? b.period * tempo * satTempo((famMin.get(b.orbits) ?? b.period) * tempo)
        : b.period * tempo
      // Every measured satellite here is tidally locked, and the table says so:
      // its sidereal day is its orbital period. Drawn, that has to be a
      // consequence of the orbit rather than a second clock that happens to
      // agree, because the two are compressed differently and a spin of its own
      // drifts — the Moon showed Earth every face it has, several times a lap.
      const days = b.period * 365.25
      u.lock = u.parent >= 0 && Math.abs(Math.abs(b.day) / 24 - days) < days * 0.02
      u.peri = (b.peri - b.node) * D2R
      if (u.parent >= 0) {
        // A satellite's true distance is unusable at system scale — the Moon
        // would sit a fraction of a pixel from Earth — so it is mapped into a
        // band starting clear of the planet's drawn disc. The band's outer
        // edge is whatever room there actually is before the nearest other
        // orbit, which is generous to scale and nothing at all to same size.
        const p = this.sysNodes[u.parent]
        const siblings = bodies.filter((x) => x.orbits === b.orbits)
        const radii = siblings.map((x) => satRadii(x.a, bodies[u.parent].radius))
        const t = satRank(
          satRadii(b.a, bodies[u.parent].radius),
          Math.min(...radii), Math.max(...radii),
        )
        u.aSame = p.rSame * satMult(t, p.rSame, this.roomAt(bodies, u.parent, 'same'))
        u.aScale = p.rScale * satMult(t, p.rScale, this.roomAt(bodies, u.parent, 'scale'))
      } else {
        u.aSame = sameDist(b.a * stretch)
        u.aScale = visDist(b.a * stretch)
      }

      const cp = Math.cos(u.peri)
      const sp = Math.sin(u.peri)
      const apo = 1 + b.e
      // Satellites live inside their planet's neighbourhood, so they must not
      // pull the camera back — the frame is set by what orbits the star.
      if (u.parent < 0) {
        this.fitSame = Math.max(this.fitSame, u.aSame * apo)
        this.fitScale = Math.max(this.fitScale, u.aScale * apo)
      }

      const steps = u.parent >= 0 ? 64 : 200
      const shape = (line: THREE.Line<THREE.BufferGeometry>, AA: number) => {
        const pts: THREE.Vector3[] = []
        for (let k = 0; k <= steps; k++) {
          const E = (k / steps) * 6.2832
          const x = AA * (Math.cos(E) - b.e)
          const z = AA * Math.sqrt(1 - b.e * b.e) * Math.sin(E)
          pts.push(new THREE.Vector3(x * cp - z * sp, 0, x * sp + z * cp))
        }
        line.geometry.dispose()
        line.geometry = new THREE.BufferGeometry().setFromPoints(pts)
      }
      shape(u.lineSame, u.aSame)
      shape(u.lineScale, u.aScale)
    })
  }

  /**
   * How much space a planet has around it before the nearest other orbit:
   * half the distance to it, less the planet's own drawn radius. Negative
   * means the planet is already wider than its share of the gap, which is
   * ordinary in same-size mode — adjacent planets there overlap at
   * conjunction — and the satellite band falls back to its floor.
   */
  private roomAt(bodies: SystemBody[], index: number, mode: 'same' | 'scale'): number {
    const u = this.sysNodes[index]
    const mine = mode === 'same' ? u.aSame : u.aScale
    let gap = Infinity
    for (let k = 0; k < this.sysNodes.length; k++) {
      const o = this.sysNodes[k]
      if (k === index || !o || o.parent >= 0 || bodies[k]?.orbits) continue
      const d = Math.abs((mode === 'same' ? o.aSame : o.aScale) - mine)
      if (d > 1e-6) gap = Math.min(gap, d)
    }
    if (!Number.isFinite(gap)) return (mode === 'same' ? u.rSame : u.rScale) * 3
    return gap / 2 - (mode === 'same' ? u.rSame : u.rScale)
  }

  /** Apply cheap body properties without rebuilding materials or baked maps. */
  private applyBodyProperties() {
    this.sysBodies.forEach((body, i) => {
      const node = this.sysNodes[i]
      if (!node) return
      node.tilt.rotation.z = body.tilt * D2R
      node.mesh.scale.set(1, 1 - body.flattening, 1)
      node.day = body.day
      node.f = body.flattening
      node.rScale = sizeMap(body.radius * 6371) * 0.85
      node.tilt.scale.setScalar(this.sizeMode === 'scale' ? node.rScale : node.rSame)
    })
  }

  /**
   * How far back to sit so the whole system is on screen.
   *
   * A system is a disc seen from above at `rotX`, so its on-screen height is
   * only a fraction of its radius and the width is what binds. Deriving this
   * rather than hard-coding a distance is what lets a five-world system you
   * built yourself frame as well as the eight-planet one.
   */
  private frameFor(radius: number): number {
    const halfV = Math.tan((this.camera.fov * D2R) / 2)
    const byWidth = radius / (halfV * Math.max(0.4, this.camera.aspect))
    const byHeight = (radius * Math.abs(Math.sin(this.rotX)) + 1.2) / halfV
    return Math.max(byWidth, byHeight) * 1.06
  }

  /**
   * Draw the star at its own size.
   *
   * Both inputs move independently — the size mode changes the base, editing
   * the system changes the mass — so this is the one place that combines them.
   * Stars are sized against each other, not against their planets: at true
   * scale even a red dwarf would swallow every orbit in the view.
   */
  private sizeSun() {
    this.sunMesh!.scale.setScalar(this.sunBase * starSize(this.sysDef?.star.mass ?? 1))
  }

  /**
   * A planet's name, drawn once to a small canvas and shown as a sprite with
   * `sizeAttenuation` off, so it reads the same at any zoom. Deliberately not
   * DOM: overlay elements would mean per-frame style writes, which the
   * performance work went to some lengths to remove.
   */
  private labelTexture(name: string): THREE.CanvasTexture {
    const text = name.trim() || 'Unnamed'
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const font = '600 26px system-ui, -apple-system, sans-serif'
    ctx.font = font
    canvas.width = Math.ceil(ctx.measureText(text).width) + 18
    canvas.height = 38
    ctx.font = font // canvas resize resets context state
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.shadowColor = 'rgba(8, 6, 18, 0.9)'
    ctx.shadowBlur = 6
    ctx.fillStyle = '#efeafd'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.generateMipmaps = false
    texture.minFilter = THREE.LinearFilter
    return texture
  }

  /** Constant screen height; the width follows the drawn text's shape. */
  private scaleLabel(sprite: THREE.Sprite) {
    const img = sprite.material.map!.image as HTMLCanvasElement
    const h = 0.032
    sprite.scale.set(h * (img.width / img.height), h, 1)
  }

  private makeLabel(name: string): THREE.Sprite {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.labelTexture(name),
        transparent: true,
        depthTest: false,
        sizeAttenuation: false,
      }),
    )
    // Anchor below centre, so the text hangs above the body in screen space.
    sprite.center.set(0.5, -0.9)
    sprite.renderOrder = 10
    this.scaleLabel(sprite)
    return sprite
  }

  /** Materialise label canvases only when the opt-in display layer is used. */
  private syncLabels() {
    let created = false
    for (const u of this.sysNodes) {
      if (this.showLabels && !u.label) {
        u.label = this.makeLabel(u.labelName)
        u.label.position.y = this.sizeMode === 'scale' ? u.rScale : u.rSame
        u.node.add(u.label)
        created = true
      }
      if (u.label) u.label.visible = this.showLabels
    }
    // The first visible sprite introduces one shared sprite program. Warm it
    // when labels are explicitly enabled, never on the default Orbit path.
    if (created) this.compileNeeded = true
  }

  /** Where each orbit line is headed: shown, hidden, or revealed by hover. */
  private syncPathTargets() {
    for (const u of this.sysNodes) {
      u.lineTarget = this.showPaths || u.index === this.hoverIndex ? PATH_OPACITY : 0
    }
    this.pathAnim = true
  }

  /**
   * Frame the system. "Same size" fits the whole thing; "to scale" deliberately
   * starts inside the outermost orbit, because at true relative spacing a view
   * wide enough to contain Neptune leaves the inner planets subpixel.
   */
  private applySizeMode(sm: 'same' | 'scale', reframe: boolean) {
    this.sizeMode = sm
    const scaled = sm === 'scale'
    for (const u of this.sysNodes) {
      u.a = scaled ? u.aScale : u.aSame
      u.tilt.scale.setScalar(scaled ? u.rScale : u.rSame) // scales rings too
      const o = u.lineSame.material.opacity
      u.lineSame.visible = !scaled && o > 0.01
      u.lineScale.visible = scaled && o > 0.01
      // The label floats off the pole; its screen offset comes from the sprite's
      // own anchor, so this world-space lift only needs to clear the body.
      if (u.label) u.label.position.y = scaled ? u.rScale : u.rSame
    }
    this.sunBase = scaled ? SIZE_MAX : 1.15
    this.sizeSun()

    // Scale mode parks the camera at the outermost orbit, which works while
    // the star is a speck against it — the Sun is 3% of Pluto's orbit. It
    // stops working when a system's only planet is close in: Alpha Centauri A
    // has one at 1.25 AU now that Pandora orbits it rather than the star, and
    // the frame ended up inside the star itself. So the star is also held to
    // a share of the frame, which costs the Solar System nothing.
    const sun = this.sunBase * starSize(this.sysDef?.star.mass ?? 1)
    const halfV = Math.tan((this.camera.fov * D2R) / 2)
    const byStar = sun / (STAR_FRAME_SHARE * halfV)
    const fit = scaled
      ? Math.max(this.fitScale * 0.97, byStar)
      : this.frameFor(this.fitSame)
    this.fitZ = Math.max(4, fit)
    if (reframe) this.camZ = this.fitZ
  }

  /* --- regeneration ----------------------------------------------------- */

  private regen() {
    const P = this.p
    if (!P) return

    // Pause is a worker lifecycle boundary too: retain the previous artifact,
    // start no new v2 phase, and resume only the latest desired job.
    this.v2Terrain?.setSuspended(
      P.autoRotate === false || document.hidden || !this.inView,
    )

    // Display toggles are read before either branch: paths and moons matter in
    // both views, and none of them participates in any bake or surface key.
    this.showPaths = P.showPaths !== false
    this.showLabels = P.showLabels === true
    this.showMoons = P.showMoons !== false

    // A hover must not outlive what it was over. Switching views, or turning
    // the option off, would otherwise leave the clock held by a body that is
    // no longer under the pointer — or no longer on screen at all.
    const wantedMode = P.mode === 'system' ? 'system' : 'single'
    this.pauseOnHover = P.pauseOnHover === true
    if (!this.pauseOnHover || wantedMode !== this.mode) this.overBody = false

    // Universe appearance: cheap uniforms and a draw range, applied in both
    // views. Every default is the exact look the app has always had.
    this.stars.geometry.setDrawRange(0, Math.round(STAR_POOL * (P.starDensity ?? 0.5)))
    const bright = P.starBright ?? 0.5
    const smat = this.stars.material as THREE.PointsMaterial
    smat.opacity = Math.min(1, 0.25 + bright * 1.2)
    smat.size = 1.4 + bright * 0.6
    this.renderer.toneMappingExposure = 0.7 + (P.exposure ?? 0.5) * 0.6

    if (P.mode === 'system') return this.regenSystem(P)

    if (this.mode !== 'single') {
      for (const slot of this.v2PreviewTargets.keys()) this.v2Terrain?.cancel(slot)
      this.v2PreviewTargets.clear()
      this.mode = 'single'
      this.camZ = 3.15
      this.rotX = 0.16
    }
    if (this.sys) this.sys.visible = false
    this.sun.visible = true

    // User-aimed sunlight: azimuth around the world, elevation above its equator.
    const laz = (P.lightAz ?? 0.107) * 6.28319
    const lel = ((P.lightEl ?? 0.639) - 0.5) * Math.PI
    this.sunDir
      .set(Math.cos(lel) * Math.cos(laz), Math.sin(lel), Math.cos(lel) * Math.sin(laz))
      .normalize()
    this.sun.position.copy(this.sunDir).multiplyScalar(7)
    this.gasMesh.material.uniforms.uLight.value.copy(this.sunDir)
    this.moonRoot.visible = true

    const det = P.detail === 'high' ? 'high' : 'standard'
    if (det !== this.detail) {
      this.buildGeo(det)
      this.detail = det
    }
    if (P.seed !== this.seed) {
      const n = noiseFor(P.seed)
      this.n1 = n.n1
      this.n2 = n.n2
      this.seed = P.seed
      this.cloudKey = ''
    }

    // Real bodies apply when the params still carry their measured identity —
    // a photographic map, or the canonical seed for texture-less Pluto.
    const R = realFor(P)
    this.real = R
    const meadowV2 = !R && P.generatorVersion === 2 && P.preset === 'temperate'
    const meadowFrameKey = meadowV2 ? `${P.seed}` : ''
    const frameNewMeadow = meadowFrameKey !== '' && meadowFrameKey !== this.meadowFrameKey
    this.meadowFrameKey = meadowFrameKey
    this.amb.intensity = R ? 0.17 : meadowV2 ? 0.2 : 0.34
    this.sun.intensity = 2.1

    const flat = R ? 1 - R.f : 1
    this.dayH = R ? R.day : 0
    this.tiltG.rotation.z = R ? R.ob * D2R : 0
    this.spinG.scale.set(1, flat, 1)
    const atmosphereScale = meadowV2 ? 0.88 : 1
    this.atmo.scale.set(atmosphereScale, flat * atmosphereScale, atmosphereScale)

    if (R) {
      // Moons off skips building them at all — Saturn carries six and Jupiter
      // four, and their meshes and per-frame Kepler work are the cost.
      // `md` is only non-zero when the set of moons actually changed, which is
      // the only time the camera may be moved: every later pass — a time scale,
      // a toggle, a slider — has to leave the framing where it found it. It
      // used to reach the second branch instead and slam the camera to 3.15,
      // so a moon system framed itself once and lost it at the next keystroke.
      const md = this.setMoons(this.showMoons ? R.moons : [])
      if (this.moons.length) {
        const want = this.frameForMoons(this.moonSpan)
        this.fitZ = want
        if (md && Math.abs(want - this.camZ) > 0.05 && !this.dragging) this.camZ = want
      } else {
        this.fitZ = 3.15
        if (this.camZ > 4) this.camZ = 3.15
      }
    } else {
      const mc = this.showMoons ? Math.min(3, P.moons | 0) : 0
      const gm: Moon[] = []
      for (let gi = 0; gi < mc; gi++) {
        gm.push({
          n: `m${gi}`, r: 0.02, a: 3, rd: 0.05 + gi * 0.012, dd: 1.78 + gi * 0.38,
          P: 2.6 + gi * 1.7, inc: 6 + gi * 9, c: [0xb8b0b2, 0xa89f9c, 0xc4bcb4][gi],
        })
      }
      const moonsChanged = this.setMoons(gm)
      if (mc === 0 && meadowV2) {
        this.fitZ = 3.4
        if (frameNewMeadow && !this.dragging) this.camZ = 3.4
      } else if (moonsChanged && this.camZ > 4) {
        this.camZ = 3.15
      }
      this.fitZ = 3.15
    }

    // Toggling paths must not rebuild moons, so visibility is applied here too.
    for (const mo of this.moons) mo.line.visible = this.showPaths
    this.setShadows(this.moons.length > 0, this.moonSpan)

    this.syncCompanion(P)
    this.syncSky(P)

    // A moon with a planet beside it needs room for both. Framed tight, the
    // planet sits outside the view for all but a sliver of each orbit.
    if (this.companion.visible) {
      this.fitZ = COMPANION_CAM
      if (!this.dragging && Math.abs(this.camZ - COMPANION_CAM) > 0.05 && this.camZ < COMPANION_CAM) {
        this.camZ = COMPANION_CAM
      }
    }

    // There is one rich presentation path per physical world type. Rocky
    // photographs keep their real map and gain relief/shells; procedural rock
    // uses canonical displaced terrain; gas remains smooth because its bands
    // are weather rather than mountains.
    const pal = PALETTES[P.preset] ?? PALETTES.temperate
    if (P.texture && isGas(pal)) return this.regenTextured(P, R)
    if (P.texture) return this.regenPhotoDetailed(P, R)
    if (isGas(pal)) return this.regenGas(P)
    this.regenProcedural(P)
  }

  /** A real planet shown with its photographic map. */
  private regenTextured(P: PlanetParams, R: (typeof REAL)[string] | null) {
    this.v2Terrain?.cancel('single:gas')
    this.v2Terrain?.cancel('single:detailed')
    const pal = PALETTES[P.preset] ?? PALETTES.temperate
    const gas = isGas(pal)

    if (this.texUrl !== P.texture) {
      const prev = this.texMesh.material.map
      if (!this.texUrl && prev) {
        // The un-owned map is a placeholder or the focused gas bake; either
        // way it is ours to release before another renderer takes the mesh.
        if (prev === this.flatMap) {
          this.flatMap = null
          this.flatKey = ''
        }
        if (prev === this.flatSolid) {
          this.flatSolid = null
          this.flatSolidColor = -1
        }
        prev.dispose()
      }
      this.texUrl = P.texture!
      this.texMesh.material.map = this.loadTex(P.texture!)
      this.texMesh.material.color.set(0xffffff)
      this.gasMesh.material.uniforms.uMap.value = this.loadTex(P.texture!, true)
    }
    this.gasMesh.material.uniforms.uFlow.value = 1
    if ((!gas && !this.texMesh.visible) || (gas && !this.gasMesh.visible)) {
      this.compileNeeded = true
    }
    this.texMesh.visible = !gas
    this.gasMesh.visible = gas
    this.planet.visible = false
    this.water.visible = false

    const ct = P.cloudTexture || null
    if (ct !== this.cloudTexUrl) {
      const mat = this.clouds.material as THREE.MeshBasicMaterial
      if (!this.cloudTexUrl && mat.map) mat.map.dispose()
      this.cloudTexUrl = ct
      mat.map = ct ? this.loadTex(ct) : solidTexture(0xffffff, 0)
      mat.alphaMap = null
      this.cloudKey = ''
    }
    const cmat = this.clouds.material as THREE.MeshBasicMaterial
    const showClouds = !!ct && (P.clouds || 0) > 0.04
    if (showClouds && !this.clouds.visible) this.compileNeeded = true
    this.clouds.visible = showClouds
    this.clouds.scale.setScalar(1.03) // cloud deck just above the surface
    cmat.color.set(0xffffff)
    cmat.opacity = Math.min(1, (P.clouds || 0) * 1.8)

    this.setRing(R?.ring ?? (P.rings ? customRing(P, pal) : null))
    this.ringG.rotation.z = R?.ring ? 0 : ((P.ringTilt ?? 0.5) - 0.5) * 1.5708

    const rc = R?.ring ?? null
    this.gasMesh.material.uniforms.uRing.value.set(
      rc ? 1 : 0, rc ? rc.inner : 0, rc ? rc.outer : 0, rc ? rc.profile || 0 : 0,
    )

    const amat = this.atmo.material as THREE.ShaderMaterial
    amat.uniforms.uC.value.set(P.atmoColor ?? pal.atmo)
    amat.uniforms.uI.value = 0.25 + (P.glow ?? 0.5) * 1.1
    const showAtmo = (P.glow ?? 0.5) > 0.02
    if (showAtmo && !this.atmo.visible) this.compileNeeded = true
    this.atmo.visible = showAtmo
    this.stars.visible = P.stars !== false
  }

  /**
   * A gas giant's detailed presentation. Its visible surface is an atmosphere,
   * so a smooth sphere with differential band drift and a storm vortex is the
   * physically appropriate rich renderer; displaced rock and water shells are
   * not meaningful for a gas world.
   */
  private regenGas(P: PlanetParams) {
    const pal = PALETTES[P.preset] ?? PALETTES.temperate
    const gas = isGas(pal)
    this.texMesh.material.roughness = P.generatorVersion === 2 && P.preset === 'temperate' ? 0.72 : 1
    this.v2Terrain?.cancel('single:detailed')

    this.planet.visible = false
    this.water.visible = false
    this.clouds.visible = false
    this.cloudsPending = false
    if ((!gas && !this.texMesh.visible) || (gas && !this.gasMesh.visible)) {
      this.compileNeeded = true
    }
    this.texMesh.visible = !gas
    this.gasMesh.visible = gas

    // The photo pipeline owns texUrl; hand the mesh over to the flat bake.
    // A photograph left on the mesh belongs to the shared cache — it is
    // detached here, never disposed.
    if (this.texUrl) this.texUrl = null

    // Show the best thing already in hand: the last bake if there is one —
    // better a stale sea than a grey flash — or the world's own mid-tone,
    // the same first-frame treatment the orbit view gives a body.
    const fallback = gas ? pal.bands[(pal.bands.length / 2) | 0][1] : pal.mid
    if (!this.flatMap && this.flatSolidColor !== fallback) {
      this.flatSolid?.dispose()
      this.flatSolid = solidTexture(fallback)
      this.flatSolidColor = fallback
    }
    const map: THREE.Texture = this.flatMap ?? this.flatSolid!
    if (gas) this.gasMesh.material.uniforms.uMap.value = map
    else {
      this.texMesh.material.map = map
      this.texMesh.material.color.set(this.flatMap ? 0xffffff : fallback)
    }

    const key = [
      P.generatorVersion, P.seed, P.preset, P.mountains, P.water, P.roughness, P.ice, P.clouds,
      climateKey(P),
    ].join(':')
    if (key !== this.flatKey) {
      this.flatKey = key
      if (P.generatorVersion === 2) {
        this.ensureV2Terrain().request('single:gas', {
          params: P,
          priority: 'focused',
          artifact: { kind: 'flat', width: V2_FLAT_WIDTH, height: V2_FLAT_HEIGHT },
        })
      } else {
        this.v2Terrain?.cancel('single:gas')
        this.flatBakeId = ++this.bakeId
        const request: BakeWorkerRequest = { id: this.flatBakeId, kind: 'world', params: { ...P } }
        this.ensureWorldWorker().postMessage(request)
      }
    }

    // Sculpted giants swirl by their own roughness; a photograph keeps 1.
    this.gasMesh.material.uniforms.uFlow.value = 0.55 + (P.roughness ?? 0.5) * 0.9
    this.gasMesh.material.uniforms.uRing.value.set(0, 0, 0, 0)

    this.setRing(P.rings ? customRing(P, pal) : null)
    this.ringG.rotation.z = ((P.ringTilt ?? 0.5) - 0.5) * 1.5708
    this.spinRate = 0.1 * (P.spinSpeed != null ? P.spinSpeed * 2 : 1) * (P.spinDir === -1 ? -1 : 1)

    const amat = this.atmo.material as THREE.ShaderMaterial
    amat.uniforms.uC.value.set(P.atmoColor ?? pal.atmo)
    amat.uniforms.uI.value = P.generatorVersion === 2 && P.preset === 'temperate'
      ? 0.2 + (P.glow ?? 0.5) * 0.75
      : 0.3 + (P.glow ?? 0.5) * 1.6
    const showAtmo = (P.glow ?? 0.5) > 0.02
    if (showAtmo && !this.atmo.visible) this.compileNeeded = true
    this.atmo.visible = showAtmo
    this.stars.visible = P.stars !== false
  }

  /**
   * Show the planet a moon belongs to, in the moon's own view.
   *
   * A moon on its own says nothing about being a moon. The camera has to stay
   * on the world being sculpted, and from the moon's own frame of reference
   * "the moon goes round the planet" and "the planet wheels around the moon"
   * are the same motion — so the relationship can be drawn truthfully without
   * moving the subject at all.
   *
   * Everything here is measured: the distance and both radii come from the
   * same moon tables the orbit view uses, so each planet appears at its real
   * angular size. Jupiter really is 12° wide from Europa, and Saturn 28° from
   * Enceladus, against the 0.5° our own Moon manages from here.
   */
  private syncCompanion(P: PlanetParams) {
    const parent = P.mode === 'system' ? null : (parentOf(P) ?? this.systemParentOf(P))
    this.companion.visible = !!parent
    if (!parent) {
      this.v2Terrain?.cancel('companion')
      this.companionKey = ''
      return
    }

    // The ratio is what carries the truth: Jupiter fills 12° of Europa's sky
    // and Saturn 28° of Enceladus's, and keeping radius-over-distance exact
    // preserves that however far away it is drawn.
    this.companionDist = COMPANION_DIST
    this.companion.scale.setScalar(COMPANION_DIST * (parent.radius / parent.distance))

    if (parent.key === this.companionKey) return
    this.companionKey = parent.key

    // The measured planets carry hand-built rings; an invented one derives
    // its own from the params it was sculpted with.
    const ring = REAL[parent.key]?.ring
      ?? (parent.params?.rings
        ? customRing(parent.params, PALETTES[parent.params.preset] ?? PALETTES.temperate)
        : null)
    const wasRing = this.companionRing.visible
    this.companionRing.visible = !!ring
    if (ring) {
      const rk = `${ring.inner}:${ring.outer}:${ring.color}:${ring.opacity}:${ring.profile ?? 0}`
      if (rk !== this.companionRingKey) {
        this.companionRingKey = rk
        this.companionRing.geometry.dispose()
        this.companionRing.geometry = ringGeo(ring.inner, ring.outer)
        const ru = this.companionRing.material.uniforms
        ru.uColor.value.set(ring.color)
        ru.uOpacity.value = ring.opacity
        ru.uProfile.value = ring.profile || 0
        ru.uHasMap.value = ring.map ? 1 : 0
        ru.uMap.value = ring.map ? this.loadTex(ring.map) : null
        ru.uBandCount.value = ring.bands ? ring.bands.length : 0
        if (ring.bands) {
          for (let i = 0; i < ring.bands.length; i++) {
            const b = ring.bands[i]
            ru.uBands.value[i].set(b[0], b[1], b[2], b[3])
          }
        }
      }
      // The shader shades the ring against the planet's own shadow, and that
      // planet is the companion, so the light arrives in its local frame.
      this.companionRing.material.uniforms.uL.value.copy(this.sunDir)
      this.companionRing.material.uniforms.uFace.value = 1
    }
    if (!wasRing && this.companionRing.visible) this.compileNeeded = true

    const url = parent.texture ?? PARENT_MAP[parent.key]
    const mat = this.companion.material
    const pal = PALETTES[parent.key as PlanetParams['preset']] ?? PALETTES.temperate
    // The measured planets have photographs. An invented one has params, and
    // those are enough: the same worker that paints a body for the orbit view
    // paints this one, so Polyphemus arrives with its bands rather than as a
    // flat disc of its own average colour.
    if (url) {
      mat.map = this.loadTex(url)
      mat.color.set(0xffffff)
    } else {
      mat.map = null
      mat.color.set(isGas(pal) ? pal.bands[(pal.bands.length / 2) | 0][1] : pal.mid)
      if (parent.params) {
        const q = parent.params
        const key = [
          q.generatorVersion, q.seed, q.preset, q.mountains, q.water, q.roughness, q.ice, q.clouds,
          climateKey(q),
        ].join(':')
        if (key === this.companionMapKey && this.companionMap) {
          // Already painted this world: leaving and coming back should not
          // send the worker off to paint it again.
          mat.map = this.companionMap
          mat.color.set(0xffffff)
        } else {
          this.companionMapKey = key
          if (q.generatorVersion === 2) {
            this.ensureV2Terrain().request('companion', {
              params: q,
              priority: 'focused',
              artifact: { kind: 'flat', width: V2_FLAT_WIDTH, height: V2_FLAT_HEIGHT },
            })
          } else {
            this.v2Terrain?.cancel('companion')
            this.companionBakeId = ++this.bakeId
            const request: BakeWorkerRequest = {
              id: this.companionBakeId, kind: 'world', params: { ...q },
            }
            this.ensureWorldWorker().postMessage(request)
          }
        }
      }
    }
    mat.needsUpdate = true
    this.compileNeeded = true
  }

  /**
   * The same relationship for a satellite of the system on screen rather than
   * of the measured tables — Pandora around Polyphemus, or any moon somebody
   * built themselves. The elements live on the body instead of in
   * `engine/planets.ts`, and are converted into the moon's own radii here,
   * which is the frame this view draws in.
   */
  private systemParentOf(P: PlanetParams): {
    key: string
    radius: number
    distance: number
    texture?: string | null
    params?: PlanetParams
  } | null {
    const def = this.sysDef
    if (!def) return null
    const me = def.bodies.find(
      (b) => b.orbits && b.params.preset === P.preset && b.params.seed === P.seed &&
        b.params.generatorVersion === P.generatorVersion,
    )
    if (!me || !(me.radius > 0)) return null
    const host = def.bodies.find((b) => b.name === me.orbits)
    if (!host) return null
    return {
      key: host.params.preset,
      radius: host.radius / me.radius,
      distance: satRadii(me.a, me.radius),
      texture: host.texture ?? host.params.texture ?? null,
      params: host.params,
    }
  }

  /** Relief amplitude for a photographed world: subtle, and honestly derived. */
  private static readonly PHOTO_AMP = 0.02

  /**
   * A real planet, in detail: its own photograph on displaced geometry.
   *
   * The map supplies both the colour and — through its luminance — the
   * relief, so the mountains sit where the picture says land is rather than
   * where a noise field happened to put them. Clouds move onto their own
   * shell here instead of being baked flat into the map, which is most of
   * what makes this read as a world rather than a decal on a ball.
   */
  private regenPhotoDetailed(P: PlanetParams, R: (typeof REAL)[string] | null) {
    this.v2Terrain?.cancel('single:gas')
    this.v2Terrain?.cancel('single:detailed')
    const pal = PALETTES[P.preset] ?? PALETTES.temperate
    const url = P.texture!

    this.texMesh.visible = false
    this.gasMesh.visible = false
    this.water.visible = false
    if (!this.planet.visible) this.compileNeeded = true
    this.planet.visible = true

    const mat = this.planet.material as THREE.MeshStandardMaterial
    mat.normalScale.set(0, 0)
    const tex = this.loadTex(url)
    if (mat.map !== tex || mat.vertexColors) {
      mat.map = tex
      // Colour now comes from the map, so the per-vertex colours must stop
      // multiplying it — that switches shader variant, hence the warm.
      mat.vertexColors = false
      mat.color.set(0xffffff)
      mat.needsUpdate = true
      this.compileNeeded = true
    }

    // A gas giant's bands are weather, not landscape: embossing them would
    // invent mountains out of cloud. Those stay perfectly smooth.
    const gas = isGas(pal)

    // The height field needs the decoded image, which may not have arrived.
    // Until it does the world is drawn as a smooth sphere wearing its map,
    // which is correct in every respect except relief.
    let field = gas ? null : this.heightFields.get(url)
    if (!gas && field === undefined) {
      const img = tex.image as (TexImageSource & { width: number; height: number }) | undefined
      if (img?.width) {
        field = heightFieldFrom(img)
        this.heightFields.set(url, field)
      } else {
        field = null
        this.heightKey = ''
        // Re-run once it lands; loadTex caches, so this costs one decode.
        this.texLoader.load(url, () => this.invalidate())
      }
    }

    const key = `${url}:${this.detail}:${field ? 1 : 0}:${gas ? 'g' : 'r'}`
    if (key !== this.heightKey) {
      this.heightKey = key
      const pa = this.geo!.attributes.position.array as Float32Array
      const uv = this.geo!.attributes.uv.array as Float32Array
      const dirs = this.dirs!
      for (let i = 0, k = 0; i < dirs.length; i += 3, k += 2) {
        const r = field
          ? 1 + heightAt(field, uv[k], uv[k + 1]) * PlanetViewport.PHOTO_AMP
          : 1
        pa[i] = dirs[i] * r
        pa[i + 1] = dirs[i + 1] * r
        pa[i + 2] = dirs[i + 2] * r
      }
      this.geo!.attributes.position.needsUpdate = true
      this.geo!.computeVertexNormals()
      this.surfaceKey = '' // the procedural path must rebuild if we go back
    }

    // Clouds get their own shell, which is the visible gain over the flat
    // view: they sit above the ground and drift at their own rate.
    const cmat = this.clouds.material as THREE.MeshBasicMaterial
    const ct = P.cloudTexture || null
    if (ct !== this.cloudTexUrl) {
      if (!this.cloudTexUrl && cmat.map) cmat.map.dispose()
      this.cloudTexUrl = ct
      cmat.map = ct ? this.loadTex(ct) : solidTexture(0xffffff, 0)
      cmat.alphaMap = null
      this.cloudKey = ''
    }
    const showClouds = !!ct && (P.clouds || 0) > 0.04
    if (showClouds && !this.clouds.visible) this.compileNeeded = true
    this.clouds.visible = showClouds
    this.clouds.scale.setScalar(1.018)
    cmat.color.set(0xffffff)
    cmat.opacity = Math.min(1, (P.clouds || 0) * 1.8)
    this.cloudsPending = false

    this.setRing(R?.ring ?? (P.rings ? customRing(P, pal) : null))
    this.ringG.rotation.z = R?.ring ? 0 : ((P.ringTilt ?? 0.5) - 0.5) * 1.5708

    const amat = this.atmo.material as THREE.ShaderMaterial
    amat.uniforms.uC.value.set(P.atmoColor ?? pal.atmo)
    amat.uniforms.uI.value = 0.25 + (P.glow ?? 0.5) * 1.1
    const showAtmo = (P.glow ?? 0.5) > 0.02
    if (showAtmo && !this.atmo.visible) this.compileNeeded = true
    this.atmo.visible = showAtmo
    this.stars.visible = P.stars !== false
  }

  /** A sculpted world: displace and colour the sphere from noise. */
  private regenProcedural(P: PlanetParams) {
    const pal = PALETTES[P.preset] ?? PALETTES.temperate
    const ecosystem = P.generatorVersion === 2 ? ecosystemStyleFor(P.seed, P.preset) : null
    const livingV2 = !!ecosystem
    this.v2Terrain?.cancel('single:gas')
    this.texMesh.visible = false
    this.gasMesh.visible = false
    if (!this.planet.visible) this.compileNeeded = true
    this.planet.visible = true

    // A photographed world may have left its map on this mesh; a sculpted one
    // is coloured per vertex and must take it back.
    const pmat = this.planet.material as THREE.MeshStandardMaterial
    pmat.roughness = livingV2 ? 0.72 : 0.95
    if (P.generatorVersion !== 2) pmat.normalScale.set(0, 0)
    if (!pmat.vertexColors) {
      pmat.map = null
      pmat.vertexColors = true
      pmat.color.set(0xffffff)
      pmat.needsUpdate = true
      this.heightKey = ''
      this.surfaceKey = ''
      this.compileNeeded = true
    }
    this.clouds.scale.setScalar(livingV2 ? 1.035 : 1.025)

    const cmat = this.clouds.material as THREE.MeshBasicMaterial
    if (this.cloudTexUrl) {
      this.cloudTexUrl = null
      cmat.map = solidTexture(0xffffff, 0)
      this.cloudKey = ''
    }

    const nextSurfaceKey = surfaceKey(P, this.detail)
    let seaRadius: number
    if (P.generatorVersion === 2) {
      seaRadius = this.v2SeaRadius
      if (nextSurfaceKey !== this.surfaceKey) {
        const firstArtifact = this.surfaceKey === ''
        this.surfaceKey = nextSurfaceKey
        this.v2DetailKey = nextSurfaceKey
        if (firstArtifact) {
          pmat.color.set(
            isGas(pal) ? pal.bands[(pal.bands.length / 2) | 0][1] : ecosystem?.grass ?? pal.mid,
          )
        }
        const widthSegments = this.detail === 'high' ? 220 : 150
        const heightSegments = this.detail === 'high' ? 150 : 104
        this.ensureV2Terrain().request('single:detailed', {
          params: P,
          priority: 'focused',
          artifact: { kind: 'detailed', widthSegments, heightSegments },
        })
      }
    } else {
      this.v2Terrain?.cancel('single:detailed')
      const surface = makeSurface(P, this.n1!, this.n2!)
      seaRadius = surface.seaRadius
      if (nextSurfaceKey !== this.surfaceKey) {
        this.surfaceKey = nextSurfaceKey
        pmat.color.set(0xffffff)
        const pa = this.geo!.attributes.position.array as Float32Array
        const ca = this.geo!.attributes.color.array as Float32Array
        const dirs = this.dirs!
        const tmp = new THREE.Color()

        for (let i = 0; i < dirs.length; i += 3) {
          const x = dirs[i], y = dirs[i + 1], z = dirs[i + 2]
          const r = surface.sample(x, y, z, tmp)
          pa[i] = x * r
          pa[i + 1] = y * r
          pa[i + 2] = z * r
          ca[i] = tmp.r
          ca[i + 1] = tmp.g
          ca[i + 2] = tmp.b
        }

        this.geo!.attributes.position.needsUpdate = true
        this.geo!.attributes.color.needsUpdate = true
        this.geo!.computeVertexNormals()
      }
    }

    const wmat = this.water.material as THREE.MeshPhongMaterial
    const liquidWater = P.climate?.liquidWater ?? 1
    this.water.visible = !isGas(pal) && (P.water || 0) > 0.03 && (pal.emissive ? true : liquidWater > 0.03)
    this.water.scale.setScalar(Math.max(0.88, seaRadius))
    if (!isGas(pal)) {
      wmat.color.set(ecosystem?.waterShell ?? pal.water)
      wmat.emissive.set(pal.emissive ?? 0x000000)
      wmat.opacity = (livingV2 ? 0.9 : pal.waterOpacity ?? 0.72) * (pal.emissive ? 1 : liquidWater)
      wmat.shininess = livingV2 ? 180 : 90
      wmat.specular.set(livingV2 ? 0x376b70 : 0x555555)
      this.fluidAmplitude.value = livingV2 ? 0.42 : 1
      // An emissive palette means the "sea" is molten: ripple slow and heavy,
      // and let the loop pulse the glow. Water ripples fast and stays steady.
      this.fluidStyle.value = pal.emissive ? 1 : 0
      if (!pal.emissive) wmat.emissiveIntensity = 1
    }

    this.setRing(P.rings ? customRing(P, pal) : null)
    this.ringG.rotation.z = ((P.ringTilt ?? 0.5) - 0.5) * 1.5708
    this.spinRate = 0.1 * (P.spinSpeed != null ? P.spinSpeed * 2 : 1) * (P.spinDir === -1 ? -1 : 1)

    const amat = this.atmo.material as THREE.ShaderMaterial
    amat.uniforms.uC.value.set(P.atmoColor ?? pal.atmo)
    amat.uniforms.uI.value = livingV2
      ? 0.2 + (P.glow ?? 0.5) * 0.75
      : 0.3 + (P.glow ?? 0.5) * 1.6
    const showAtmo = (P.glow ?? 0.5) > 0.02
    if (showAtmo && !this.atmo.visible) this.compileNeeded = true
    this.atmo.visible = showAtmo
    this.stars.visible = P.stars !== false

    const showClouds = (P.clouds || 0) > 0.04
    if (showClouds && !this.clouds.visible) this.compileNeeded = true
    this.clouds.visible = showClouds
    const waterCloudFactor = 'emissive' in pal && pal.emissive ? 1 : 0.12 + liquidWater * 0.88
    const v2CloudOpacity = P.preset === 'temperate'
      ? (pal.cloudO ?? 0.9) * 0.58
      : (pal.cloudO ?? 0.9) * (235 / 255)
    cmat.opacity = P.generatorVersion === 2
      ? v2CloudOpacity
      : (pal.cloudO ?? 0.9) * waterCloudFactor
    cmat.color.set(('cloudTint' in pal && pal.cloudTint) || 0xffffff)

    const ck = `${P.generatorVersion}:${P.preset}:${P.seed}:${Math.round((P.clouds || 0) * 20)}:${climateKey(P)}`
    if (ck !== this.cloudKey) {
      this.cloudKey = ck
      this.cloudsPending = this.clouds.visible
    }
  }

  private regenSystem(P: PlanetParams) {
    const def = this.sysDef
    // Nothing to draw until a system has been handed to us. Falling back to a
    // built-in here would make the engine depend on the app's data.
    if (!def) return
    const regenStart = performance.now()
    let rebuilt = false
    this.ensureSystem()
    if (this.mode !== 'system') {
      this.v2Terrain?.cancel('single:gas')
      this.v2Terrain?.cancel('single:detailed')
      this.mode = 'system'
      this.rotX = 0.5
      this.rotY = 0
      this.velX = 0
      this.velY = 0
      this.sizeMode = ''
      // Arriving from the single-world view, the camera is still parked a
      // planet's width away. It has to be pulled back to see a whole system.
      this.needFrame = true
    }
    this.sys!.visible = true

    // Colour and size are both properties of the star, so they move together —
    // and an empty system has no orbits to diff, so this cannot wait for those.
    this.sunMat!.uniforms.uTint.value.set(def.star.color)
    this.sizeSun()
    if (def.id !== this.sysId) {
      this.sysId = def.id
      this.needFrame = true
    }

    const shape = `${this.showMoons ? 'm' : ''}|${def.bodies.map(bodyKey).join('~')}`
    if (shape !== this.sysShape) {
      // A system gaining or losing a world should come back into frame; nudging
      // an existing one's distance should not yank the camera about.
      if (def.bodies.length !== this.sysCount) this.needFrame = true
      this.sysCount = def.bodies.length
      this.sysShape = shape
      this.buildBodies(def)
      rebuilt = true
      this.sysOrbitKey = ''
      this.sysPropertyKey = ''
    }
    const properties = def.bodies
      .map((b) => `${b.radius}:${b.tilt}:${b.flattening}:${b.day}`)
      .join('~')
    if (properties !== this.sysPropertyKey) {
      this.sysPropertyKey = properties
      this.applyBodyProperties()
    }
    const orbits = def.bodies
      .map((b) => `${b.a}:${b.e}:${b.inc}:${b.node}:${b.peri}:${b.period}`)
      .join('~')
    if (orbits !== this.sysOrbitKey) {
      this.sysOrbitKey = orbits
      this.applyOrbits()
      this.sizeMode = '' // distances moved, so the size mode has to be reapplied
    }
    this.amb.intensity = 0.16
    this.sun.visible = false
    // The sky belongs to standing on a world, not to looking down on a system.
    this.skyGroup.visible = false
    this.skyWanted = false
    this.sunDir.set(5, 3, 4).normalize()

    this.planet.visible = false
    this.water.visible = false
    this.clouds.visible = false
    this.atmo.visible = false
    this.ring.visible = false
    this.texMesh.visible = false
    this.gasMesh.visible = false
    this.moonRoot.visible = false
    this.companion.visible = false

    const sm = P.sizeMode === 'scale' ? 'scale' : 'same'
    if (sm !== this.sizeMode) {
      // `sizeMode` is also blanked when the orbits move, so this runs on any
      // change; whether the camera actually jumps is a separate question.
      if (this.sizeMode !== '') this.needFrame = true
      this.applySizeMode(sm, this.needFrame)
      this.needFrame = false
    }

    // Names are deliberately not in the bake key, so a rename reaches its
    // label here: a small canvas redraw, never a material or texture rebuild.
    const names = this.sysBodies.map((b) => b.name).join('~')
    if (names !== this.sysLabelKey) {
      this.sysLabelKey = names
      this.sysBodies.forEach((b, i) => {
        const u = this.sysNodes[i]
        if (!u || u.labelName === b.name) return
        u.labelName = b.name
        if (u.label) {
          u.label.material.map?.dispose()
          u.label.material.map = this.labelTexture(b.name)
          this.scaleLabel(u.label)
        }
      })
    }
    this.syncLabels()

    // With paths shown there is nothing for hover to reveal.
    if (this.showPaths) this.hoverIndex = -1
    this.syncPathTargets()

    // Preview work is cancelled while the single-world view is active. When
    // Orbit returns, resume only still-missing v2 textures.
    this.sysBodies.forEach((body, index) => {
      const node = this.sysNodes[index]
      const slot = `preview:${node?.index ?? index}`
      if (
        node && node.parent < 0 && !body.texture && body.params.generatorVersion === 2 &&
        !node.baked && !this.v2PreviewTargets.has(slot)
      ) this.queueWorldBake(node, body.params)
    })

    this.stars.visible = P.stars !== false
    if (rebuilt) recordOrbitMeasure('regen-system', regenStart)
  }

  private makeClouds() {
    const P = this.p
    if (!P || P.texture) return
    const requestKey = this.cloudKey
    const id = ++this.bakeId
    this.cloudWorker?.terminate()
    const worker = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' })
    this.cloudWorker = worker
    worker.onmessage = (event: MessageEvent<BakeWorkerResponse>) => {
      const response = event.data
      worker.terminate()
      if (this.cloudWorker === worker) this.cloudWorker = null
      if (
        this.stopped ||
        response.id !== id ||
        requestKey !== this.cloudKey ||
        this.p?.texture
      ) return

      const mat = this.clouds.material as THREE.MeshBasicMaterial
      mat.map?.dispose()
      mat.map = dataTexture(new Uint8Array(response.pixels), response.width, response.height)
      mat.map.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
      this.invalidate()
    }
    worker.onerror = () => {
      worker.terminate()
      if (this.cloudWorker === worker) this.cloudWorker = null
    }
    const request: BakeWorkerRequest = {
      id,
      kind: 'clouds',
      seed: P.seed,
      cover: P.clouds || 0,
      style: P.generatorVersion === 2 ? 'v2' : 'classic',
      liquidWater: P.climate?.liquidWater ?? 1,
    }
    worker.postMessage(request)
  }

  /** Planet-shadow direction in the ring's own frame, plus lit/unlit face. */
  private ringLight(mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>) {
    this.ringM3.setFromMatrix4(mesh.matrixWorld).invert()
    mesh.material.uniforms.uL.value.copy(this.sunDir).applyMatrix3(this.ringM3).normalize()

    this.ringN
      .set(0, 0, 1)
      .applyMatrix4(mesh.matrixWorld)
      .sub(this.tmpV.setFromMatrixPosition(mesh.matrixWorld))
      .normalize()
    const toCam = this.tmpV
      .copy(this.camera.position)
      .sub(this.tmpV.setFromMatrixPosition(mesh.matrixWorld))
      .normalize()
    const lit = this.ringN.dot(this.sunDir) * this.ringN.dot(toCam)
    mesh.material.uniforms.uFace.value = lit > 0 ? 1.0 : 0.42
  }

  /* --- frame ------------------------------------------------------------ */

  private scheduleFrame() {
    if (this.stopped || this.raf || document.hidden || !this.inView) return
    this.raf = requestAnimationFrame(this.loop)
  }

  private invalidate() {
    this.forceRender = true
    this.scheduleFrame()
  }

  /**
   * Whether the clock should advance.
   *
   * Two ways to stop it: the time bar, and — with the option on — the pointer
   * resting on a planet or a moon. They are the same stop, so everything that
   * rides on `t` freezes together: rotation, orbits, water, cloud, lava.
   */
  private isRunning() {
    if (this.p && this.p.autoRotate === false) return false
    return !(this.pauseOnHover && this.overBody)
  }

  private shouldContinue() {
    const running = this.isRunning()
    return (
      running ||
      this.dirty ||
      this.dragging ||
      !!this.tgt ||
      Math.abs(this.velX) > 0.0001 ||
      Math.abs(this.velY) > 0.0001 ||
      !!this.scanT0 ||
      this.cloudsPending ||
      this.compileNeeded ||
      this.pathAnim
    )
  }

  /** Start parallel shader compilation and render only after it has settled. */
  private warmShaders(): boolean {
    if (!this.compileNeeded || this.compiling) return !!this.compiling
    this.compileNeeded = false
    const compileStart = performance.now()
    const programsBefore = this.renderer.info.programs?.length ?? 0
    // WebGLRenderer.compileAsync traverses hidden objects too. Restrict Orbit
    // warmup to the system subtree so the transition does not compile every
    // hidden single-world material and shader variant.
    const job: Promise<void> = (
      this.mode === 'system' && this.sys
        ? this.renderer.compileAsync(this.sys, this.camera, this.scene)
        : this.renderer.compileAsync(this.scene, this.camera)
    ).then(() => undefined, () => undefined)
    recordOrbitMeasure('shader-kickoff', compileStart)
    this.compiling = job
    // A deadline, because this promise is not always kept. Three polls the
    // programs for readiness on its own timer, and that poll reads material
    // state a rebuild can free underneath it — travelling to a moon while the
    // orbit view is still warming up is enough. When it throws in there the
    // promise never settles, and the frame loop, which waits on it before
    // drawing anything, stops for good. Giving up after a while turns a
    // viewport frozen until reload into one late frame.
    const giveUp = window.setTimeout(() => {
      if (this.compiling !== job) return
      this.compiling = null
      this.invalidate()
    }, COMPILE_DEADLINE)
    job.finally(() => {
      window.clearTimeout(giveUp)
      if (this.compiling === job) this.compiling = null
      recordOrbitMeasure('shader-ready', compileStart)
      const canvas = this.renderer.domElement
      canvas.dataset.compileProgramsBefore = String(programsBefore)
      canvas.dataset.compileProgramsAfter = String(this.renderer.info.programs?.length ?? 0)
      this.invalidate()
    })
    return true
  }

  /**
   * The parent planet's centre in canvas pixels, or '' while it is behind us.
   *
   * Rounded to whole pixels so a planet drifting a hundredth of a pixel does
   * not write to the DOM on every frame.
   */
  private projectCompanion(): string {
    this.companion.getWorldPosition(this.tmpV).project(this.camera)
    if (this.tmpV.z > 1) return ''
    const x = Math.round(((this.tmpV.x + 1) / 2) * this.cssW)
    const y = Math.round(((1 - this.tmpV.y) / 2) * this.cssH)
    return `${x},${y}`
  }

  private adaptQuality(frameGap: number) {
    if (frameGap > 50 && frameGap < 250) this.slowFrames++
    else this.slowFrames = Math.max(0, this.slowFrames - 1)
    if (this.slowFrames < 8 || this.pixelRatio <= 1) return

    this.slowFrames = 0
    this.pixelRatio = Math.max(1, this.pixelRatio - 0.25)
    this.renderer.setPixelRatio(this.pixelRatio)
    this.invalidate()
  }

  private loop(now: number) {
    this.raf = 0
    if (this.stopped || document.hidden || !this.inView) return

    const running = this.isRunning()
    const urgent =
      this.forceRender ||
      this.dirty ||
      this.dragging ||
      !!this.tgt ||
      Math.abs(this.velX) > 0.0001 ||
      Math.abs(this.velY) > 0.0001 ||
      !!this.scanT0
    // Passive rotation is intentionally 30fps; direct manipulation and
    // regeneration remain full-rate and responsive.
    // A slightly sub-33ms threshold avoids slipping to 20fps on 60Hz panels
    // when the second RAF lands a fraction before the exact 30fps boundary.
    if (!urgent && running && this.lastRender && now - this.lastRender < 1000 / 32) {
      this.scheduleFrame()
      return
    }
    this.forceRender = false

    if (this.dirty && this.p) {
      this.dirty = false
      this.regen()
    }

    if (this.warmShaders()) return

    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 0.016
    this.lastT = now

    const tScale = this.p?.timeScale ?? 1
    const sdt = dt * tScale
    if (running) this.t += sdt

    if (this.cloudsPending && now - this.cloudLast > 160) {
      this.cloudsPending = false
      this.cloudLast = now
      this.makeClouds()
    }

    if (!this.dragging) {
      if (this.tgt) {
        const T = this.tgt
        let done = true
        this.rotY += (T.y - this.rotY) * 0.1
        if (Math.abs(T.y - this.rotY) > 0.002) done = false
        this.rotX += (T.x - this.rotX) * 0.1
        if (Math.abs(T.x - this.rotX) > 0.002) done = false
        this.camZ += (T.z - this.camZ) * 0.1
        if (Math.abs(T.z - this.camZ) > 0.01) done = false
        this.velY = 0
        this.velX = 0
        if (done) {
          this.rotY = T.y
          this.rotX = T.x
          this.camZ = T.z
          this.tgt = null
        }
      } else {
        this.velY *= 0.94
        this.velX *= 0.94
        if (Math.abs(this.velY) < 0.0001) this.velY = 0
        if (Math.abs(this.velX) < 0.0001) this.velX = 0
        this.rotY += this.velY
        this.rotX = Math.max(-1.32, Math.min(1.32, this.rotX + this.velX))
      }
    }

    // The camera flies around the world; the sun stays put, so the night side
    // is reachable by dragging rather than by moving the light.
    this.camR += (this.camZ - this.camR) * 0.12
    const ca = -this.rotY
    const ce = this.rotX
    const cc = Math.cos(ce)
    this.camera.position.set(
      this.camR * cc * Math.sin(ca), this.camR * Math.sin(ce), this.camR * cc * Math.cos(ca),
    )
    this.camera.lookAt(0, 0, 0)

    if (this.dayH) {
      // Real sidereal rotation, correct direction.
      this.spin = this.t * (6.2832 / ((Math.abs(this.dayH) / 24) * DAY_SEC)) * (this.dayH < 0 ? -1 : 1)
    } else if (running) {
      this.spin += sdt * this.spinRate
    }
    this.spinG.rotation.y = this.spin
    // A real moon keeps one face toward its planet, so the planet's place in
    // the sky follows the moon's own rotation exactly. Sharing `spin` is what
    // makes that lock true rather than approximated.
    if (this.companion.visible) {
      this.companion.position.set(
        Math.cos(this.spin) * this.companionDist, 0, Math.sin(this.spin) * this.companionDist,
      )
    }
    this.clouds.rotation.y = this.real ? this.spin * 0.06 : this.spin * 0.25
    this.gasMesh.material.uniforms.uTime.value = this.t
    // Fluid motion rides the same clock as rotation: paused, hidden and
    // offscreen all freeze `t`, which freezes the water and the lava with it.
    this.fluidTime.value = this.t
    if (this.water.visible && this.fluidStyle.value > 0.5) {
      // Lava breathes: a slow pulse of the molten glow, on top of the ripple.
      ;(this.water.material as THREE.MeshPhongMaterial).emissiveIntensity =
        0.86 + 0.14 * Math.sin(this.t * 0.5)
    }

    for (const mo of this.moons) {
      const P = moonPeriodSec(mo.P)
      const ang = mo.phase + this.t * (6.2832 / P) * (mo.P < 0 ? -1 : 1)
      // The node regresses, which is the whole reason eclipses arrive in
      // seasons instead of once a month.
      mo.orbit.rotation.y = mo.node - (this.t * 6.2832) / (P * NODE_CYCLE_ORBITS)
      let face = ang
      if (mo.e > 0.001) {
        const Em = kepler(ang, mo.e)
        mo.mesh.position.set(
          mo.d * (Math.cos(Em) - mo.e), 0, mo.d * Math.sqrt(1 - mo.e * mo.e) * Math.sin(Em),
        )
        face = Math.atan2(mo.mesh.position.z, mo.mesh.position.x)
      } else {
        mo.mesh.position.set(Math.cos(ang) * mo.d, 0, Math.sin(ang) * mo.d)
      }
      // Tidally locked: one face always inward, and whatever that face is
      // marked with stays where the moon really wears it.
      mo.mesh.rotation.y = mo.mark - face
    }

    if (this.sys?.visible) {
      this.sunMat!.uniforms.uTime.value = this.t
      this.sunMesh!.rotation.y = this.t * 0.07
      for (const u of this.sysNodes) {
        u.angle += (sdt * 6.2832) / (u.period * YEAR_SEC)
        const E = kepler(u.angle, u.e)
        const x = u.a * (Math.cos(E) - u.e)
        const z = u.a * Math.sqrt(1 - u.e * u.e) * Math.sin(E)
        const cp = Math.cos(u.peri)
        const sp2 = Math.sin(u.peri)
        const px = x * cp - z * sp2
        const pz = x * sp2 + z * cp
        u.node.position.set(px, 0, pz)
        // A locked moon's spin is its orbit: one turn a lap, the same face
        // inward, whichever way round the drawn orbit happens to go.
        if (u.lock) u.spin.rotation.y = -Math.atan2(pz, px)
        else u.spin.rotation.y += sdt * (6.2832 / ((Math.abs(u.day) / 24) * DAY_SEC)) * (u.day < 0 ? -1 : 1)
      }
    }

    // Orbit paths ease toward their targets — hidden, shown, or hover-revealed.
    // Both size-mode lines share one opacity; visibility keeps them per-mode.
    if (this.pathAnim && this.sysNodes.length) {
      const scaled = this.sizeMode === 'scale'
      let moving = false
      for (const u of this.sysNodes) {
        let o = u.lineSame.material.opacity
        const d = u.lineTarget - o
        if (Math.abs(d) > 0.02) {
          o += d * 0.25
          moving = true
        } else o = u.lineTarget
        u.lineSame.material.opacity = o
        u.lineScale.material.opacity = o
        u.lineSame.visible = !scaled && o > 0.01
        u.lineScale.visible = scaled && o > 0.01
      }
      this.pathAnim = moving
    }

    if (this.scanT0) {
      const t = (now - this.scanT0) / this.scanDur
      if (t >= 1) {
        this.scanT0 = 0
        this.scanRing.visible = false
      } else {
        const Rr = 1.3
        const yy = (t * 2 - 1) * Rr
        const s2 = Math.sqrt(Math.max(0.001, Rr * Rr - yy * yy))
        this.scanRing.position.y = yy
        this.scanRing.scale.set(s2, s2, s2)
        ;(this.scanRing.material as THREE.MeshBasicMaterial).opacity =
          0.15 + 0.85 * Math.sin(t * Math.PI)
      }
    }

    this.scene.updateMatrixWorld()
    if (this.shadows) this.setEclipse(this.shadowOnTheWorld())
    // A sky moves a degree a day, so recomputing it every frame would be work
    // spent on a picture nobody could tell from the last one.
    if (this.skyWanted && this.skyTick-- <= 0) {
      this.skyTick = 8
      this.updateSky()
    }

    if (this.atmo.visible) {
      const amat = this.atmo.material as THREE.ShaderMaterial
      amat.uniforms.uLv.value.copy(this.sunDir).transformDirection(this.camera.matrixWorldInverse)
    }
    if (this.ring.visible) this.ringLight(this.ring)
    if (this.gasMesh.visible && this.ring.visible) {
      this.m3g.setFromMatrix4(this.gasMesh.matrixWorld).invert()
      this.gasMesh.material.uniforms.uLL.value.copy(this.sunDir).applyMatrix3(this.m3g).normalize()
    }
    if (this.sys?.visible) {
      for (const u of this.sysNodes) if (u.ringMesh) this.ringLight(u.ringMesh)
    }

    const renderStart = performance.now()
    this.renderer.render(this.scene, this.camera)
    if (this.sys?.visible) {
      const renderDuration = performance.now() - renderStart
      if (this.orbitFirstRenderPending) {
        this.orbitFirstRenderPending = false
        recordOrbitMeasure('first-render', renderStart)
      }
      if (renderDuration > this.orbitMaxRenderMs) {
        this.orbitMaxRenderMs = renderDuration
        this.renderer.domElement.dataset.orbitMaxRenderMs = String(renderDuration)
      }
    }

    // Observability hook: WebGL does not preserve its drawing buffer, so the
    // canvas cannot be read back after the frame. Publishing the frame count
    // and triangles drawn gives tests (and debugging) a truthful signal that
    // geometry is actually reaching the GPU. The star's drawn radius is here
    // for the same reason — it is otherwise only visible as coloured pixels.
    this.frames++
    const cv = this.renderer.domElement
    // Publish every warm-up frame so readiness checks do not wait for a batch,
    // then drop to three inexpensive writes per second during passive motion.
    if (this.frames <= 20 || this.frames % 10 === 0) cv.dataset.frames = String(this.frames)
    const triangles = this.renderer.info.render.triangles
    if (triangles !== this.lastPublishedTriangles) {
      this.lastPublishedTriangles = triangles
      cv.dataset.triangles = String(triangles)
    }
    // Orbit paths draw as lines, not triangles, so they get their own signal.
    const lines = this.renderer.info.render.lines
    if (lines !== this.lastPublishedLines) {
      this.lastPublishedLines = lines
      cv.dataset.lines = String(lines)
    }
    // The starfield draws as points; density changes show up here.
    const points = this.renderer.info.render.points
    if (points !== this.lastPublishedPoints) {
      this.lastPublishedPoints = points
      cv.dataset.points = String(points)
    }
    const sunScale = this.sunMesh?.scale.x ?? 0
    if (sunScale !== this.lastPublishedSunScale) {
      this.lastPublishedSunScale = sunScale
      cv.dataset.sunScale = String(sunScale)
    }
    // Where the parent planet landed on screen, in canvas pixels, for the same
    // reason as everything above: the frame cannot be read back, and this one
    // is a place you can click. It wanders — a moon carries its planet around
    // the sky as it turns — so nothing outside the engine can work out where
    // it is without doing the engine's arithmetic over again.
    const parentXY = this.companion.visible ? this.projectCompanion() : ''
    if (parentXY !== this.lastPublishedParent) {
      this.lastPublishedParent = parentXY
      if (parentXY) cv.dataset.parent = parentXY
      else delete cv.dataset.parent
    }
    // What is in the sky and how wide its sun is, in degrees. The angle is the
    // claim worth checking from outside: half a degree from Earth and a
    // hundredth from Pluto is the fact the whole option exists to show, and no
    // count of triangles can tell you whether it came out right.
    const skyNow = this.skyWanted
      ? `${this.skyCount}|${(this.sunAngle * (180 / Math.PI)).toFixed(3)}|${this.projectSky()}`
      : ''
    if (skyNow !== this.lastPublishedSky) {
      this.lastPublishedSky = skyNow
      if (skyNow) cv.dataset.sky = skyNow
      else delete cv.dataset.sky
    }

    const frameGap = this.lastRender ? now - this.lastRender : 0
    this.lastRender = now
    if (running) this.adaptQuality(frameGap)
    if (this.shouldContinue()) this.scheduleFrame()
  }
}
