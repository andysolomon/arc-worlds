import * as THREE from 'three'
import type { BakeWorkerRequest, BakeWorkerResponse } from './bake.worker'
import { customRing, moonGeo, ringGeo, ringMaterial, toneTex } from './materials'
import { mulberry32, type Noise3 } from './noise'
import { makeSurface, noiseFor } from './surface'
import { REAL, realFor } from './planets'
import { isGas, PALETTES } from './palettes'
import {
  D2R, DAY_SEC, kepler, moonDist, moonPeriodSec, moonRad, sameDist,
  SIZE_MAX, sizeMap, starSize, systemStretch, tempoFor, visDist, YEAR_SEC,
} from './scale'
import { ATMO_FRAG, ATMO_VERT, GAS_FRAG, GAS_VERT, SUN_FRAG, SUN_VERT } from './shaders'
import { effectiveTier } from './tiers'
import type { Moon, PlanetParams, RingConfig, SystemBody, SystemDef } from './types'

interface MoonInstance {
  orbit: THREE.Group
  mesh: THREE.Mesh
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>
  d: number
  e: number
  P: number
  phase: number
}

/** Orbit-path opacity when shown. Hidden paths fade to 0 and back on hover. */
const PATH_OPACITY = 0.55

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
}

/**
 * Identity of the expensive, baked part of a body's appearance. Lighting,
 * animation and labels deliberately do not belong here: changing one of those
 * must not recreate materials or re-bake every procedural planet.
 */
function bodyKey(b: SystemBody): string {
  const p = b.params
  const baked = [
    p.seed, p.preset, p.mountains, p.water, p.roughness, p.ice, p.clouds,
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
    detail, p.seed, p.preset, p.mountains, p.water, p.roughness, p.ice,
  ].join(':')
}

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
  private orbitFirstRenderPending = false
  private orbitMaxRenderMs = 0

  /**
   * Fluid motion: one clock for every moving surface, driven from `this.t` so
   * pause, hidden and offscreen stop it exactly the way they stop rotation.
   * Style is 0 for water and 1 for lava, which ripples slower and heavier.
   */
  private fluidTime = { value: 0 }
  private fluidStyle = { value: 0 }
  /** The flat tier's baked map for the current single world. */
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
  private moonKey = ''
  private moons: MoonInstance[] = []
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
  private m3g = new THREE.Matrix3()
  private ray = new THREE.Raycaster()
  private v2 = new THREE.Vector2()

  /** Fired when a planet is clicked in the orbit view. */
  onPick: ((index: number) => void) | null = null

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
    this.amb = new THREE.AmbientLight(0x9a8fb8, 0.34)
    this.scene.add(this.amb)

    this.planet = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
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
      sh.vertexShader = `varying vec3 vFluidP;\n${sh.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n\tvFluidP = position;',
      )}`
      sh.fragmentShader = `uniform float uFluidT;uniform float uFluidS;varying vec3 vFluidP;\n${sh.fragmentShader.replace(
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
		normal = normalize(normal + (fT*w1 + fB*w2) * fa);
	}`,
      )}`
    }
    wmat.customProgramCacheKey = () => 'fluid-shell'
    this.water = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), wmat)
    this.spinG.add(this.water)

    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.16, 80, 56),
      new THREE.MeshLambertMaterial({
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

    this.loop = this.loop.bind(this)
    this.bindPointer(cv)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.io = new IntersectionObserver(([entry]) => {
      this.inView = entry?.isIntersecting ?? true
      if (this.inView) this.invalidate()
      else if (this.raf) {
        cancelAnimationFrame(this.raf)
        this.raf = 0
      }
    })
    this.io.observe(container)
    this.visibilityHandler = () => {
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
    this.clearBodies()
    this.flatMap?.dispose()
    this.flatSolid?.dispose()
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
        // No button down: this is a hover, which only means something when the
        // orbit view is hiding its paths and one can be glimpsed.
        if (this.sys?.visible && !this.showPaths && !this.dragging) {
          this.setHover(this.planetAt(e))
        }
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
        if (this.sys?.visible && this.moved < 6) this.pick(e)
      }
      this.invalidate()
    }
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', up)
    cv.addEventListener('pointerleave', () => this.setHover(-1))

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

  /** Which planet is under this pointer event, or -1. */
  private planetAt(e: PointerEvent): number {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.v2.set(
      ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1,
      -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1,
    )
    this.ray.setFromCamera(this.v2, this.camera)
    const hits = this.ray.intersectObjects(this.sysPlanets, false)
    return hits.length ? (hits[0].object.userData as SysNode).index : -1
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

  private resize() {
    const w = this.container.clientWidth || 300
    const h = this.container.clientHeight || 300
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
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
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
      orbit.rotation.y = i * 2.399 + 0.7 // spread ascending nodes
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
      this.moons.push({ orbit, mesh, line, d: dist, e: ecc, P: d.P, phase: (i * 2.1) % 6.283 })
    }
    if (list.length) this.compileNeeded = true
    return maxD
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

      // The single view's flat tier shares the worker; latest request wins,
      // and a bake landing after the view moved on is kept for the next visit.
      if (response.id === this.flatBakeId && this.flatKey) {
        const texture = dataTexture(
          new Uint8Array(response.pixels), response.width, response.height,
        )
        texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
        this.flatMap?.dispose()
        this.flatMap = texture
        const P = this.p
        if (P && this.mode === 'single' && !P.texture && effectiveTier(P) === 'flat') {
          const pal = PALETTES[P.preset] ?? PALETTES.temperate
          if (isGas(pal)) this.gasMesh.material.uniforms.uMap.value = texture
          else {
            this.texMesh.material.map = texture
            this.texMesh.material.color.set(0xffffff)
          }
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
    const id = ++this.bakeId
    this.bakeTargets.set(id, { generation: this.bakeGeneration, node })
    const request: BakeWorkerRequest = { id, kind: 'world', params }
    this.ensureWorldWorker().postMessage(request)
  }

  /**
   * Build one mesh per body. Measured bodies get their photographic map;
   * sculpted ones get a map baked from the very same `Surface` the single-world
   * view uses, so a world looks like itself wherever you meet it.
   */
  private buildBodies(def: SystemDef) {
    const buildStart = performance.now()
    let labelDuration = 0
    this.clearBodies()
    this.orbitFirstRenderPending = true
    this.orbitMaxRenderMs = 0

    def.bodies.forEach((b, i) => {
      const plane = new THREE.Group()
      this.sysRoot!.add(plane)

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
        rSame: 0.24, rScale: sizeMap(b.radius * 6371) * 0.85,
        peri: 0, angle: (i * 2.3994) % 6.2832, day: b.day, f: b.flattening,
        lineSame, lineScale, lineTarget: lineOpacity, label, labelName: b.name,
      }
      m.userData = ud

      if (!b.texture) this.queueWorldBake(ud, b.params)

      this.sysPlanets.push(m)
      this.sysNodes.push(ud)
    })
    this.compileNeeded = true
    recordOrbitMeasure('label-creation', performance.now() - labelDuration)
    recordOrbitMeasure('build-bodies', buildStart)
  }

  /** Apply the orbital elements, which can change without a rebuild. */
  private applyOrbits(def: SystemDef) {
    this.fitSame = 0
    this.fitScale = 0

    // Compact systems are stretched and slowed as a whole — one factor each,
    // so internal geometry and relative pacing survive exactly.
    const aMax = def.bodies.reduce((m, b) => Math.max(m, b.a), 0)
    const pMin = def.bodies.reduce((m, b) => Math.min(m, b.period), Infinity)
    const stretch = systemStretch(aMax)
    const tempo = tempoFor(pMin)

    def.bodies.forEach((b, i) => {
      const u = this.sysNodes[i]
      if (!u) return

      u.plane.rotation.y = b.node * D2R // longitude of ascending node
      u.plane.rotation.x = b.inc * D2R // inclination to the reference plane
      u.e = b.e
      // The drawn period; the body list keeps quoting the measured one.
      u.period = b.period * tempo
      u.peri = (b.peri - b.node) * D2R
      u.aSame = sameDist(b.a * stretch)
      u.aScale = visDist(b.a * stretch)

      const cp = Math.cos(u.peri)
      const sp = Math.sin(u.peri)
      const apo = 1 + b.e
      this.fitSame = Math.max(this.fitSame, u.aSame * apo)
      this.fitScale = Math.max(this.fitScale, u.aScale * apo)

      const shape = (line: THREE.Line<THREE.BufferGeometry>, AA: number) => {
        const pts: THREE.Vector3[] = []
        for (let k = 0; k <= 200; k++) {
          const E = (k / 200) * 6.2832
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

  /** Apply cheap body properties without rebuilding materials or baked maps. */
  private applyBodyProperties(def: SystemDef) {
    def.bodies.forEach((body, i) => {
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

    const fit = scaled ? this.fitScale * 0.97 : this.frameFor(this.fitSame)
    this.fitZ = Math.max(4, fit)
    if (reframe) this.camZ = this.fitZ
  }

  /* --- regeneration ----------------------------------------------------- */

  private regen() {
    const P = this.p
    if (!P) return

    // Display toggles are read before either branch: paths and moons matter in
    // both views, and none of them participates in any bake or surface key.
    this.showPaths = P.showPaths !== false
    this.showLabels = P.showLabels === true
    this.showMoons = P.showMoons !== false

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
    this.amb.intensity = R ? 0.17 : 0.34

    const flat = R ? 1 - R.f : 1
    this.dayH = R ? R.day : 0
    this.tiltG.rotation.z = R ? R.ob * D2R : 0
    this.spinG.scale.set(1, flat, 1)
    this.atmo.scale.set(1, flat, 1)

    if (R) {
      // Moons off skips building them at all — Saturn carries six and Jupiter
      // four, and their meshes and per-frame Kepler work are the cost.
      const md = this.setMoons(this.showMoons ? R.moons : [])
      if (md) {
        const want = Math.min(8.4, Math.max(3.15, md * 1.32))
        this.fitZ = want
        if (Math.abs(want - this.camZ) > 0.05 && !this.dragging) this.camZ = want
      } else if (this.camZ > 4) this.camZ = 3.15
    } else {
      const mc = this.showMoons ? Math.min(3, P.moons | 0) : 0
      const gm: Moon[] = []
      for (let gi = 0; gi < mc; gi++) {
        gm.push({
          n: `m${gi}`, r: 0.02, a: 3, rd: 0.05 + gi * 0.012, dd: 1.78 + gi * 0.38,
          P: 2.6 + gi * 1.7, inc: 6 + gi * 9, c: [0xb8b0b2, 0xa89f9c, 0xc4bcb4][gi],
        })
      }
      if (this.setMoons(gm) && this.camZ > 4) this.camZ = 3.15
      this.fitZ = 3.15
    }

    // Toggling paths must not rebuild moons, so visibility is applied here too.
    for (const mo of this.moons) mo.line.visible = this.showPaths

    // The tier decides the pipeline, never the world: a photograph on the
    // flat tier renders as itself; a photographed planet forced detailed
    // renders the procedural interpretation its own params already encode;
    // a procedural world on the flat tier renders its baked orbit-view map.
    const tier = effectiveTier(P)
    if (P.texture && tier === 'flat') return this.regenTextured(P, R)
    if (tier === 'flat') return this.regenFlat(P)
    this.regenProcedural(P)
  }

  /** A real planet shown with its photographic map. */
  private regenTextured(P: PlanetParams, R: (typeof REAL)[string] | null) {
    const pal = PALETTES[P.preset] ?? PALETTES.temperate
    const gas = isGas(pal)

    if (this.texUrl !== P.texture) {
      const prev = this.texMesh.material.map
      if (!this.texUrl && prev) {
        // The un-owned map is a placeholder or the flat tier's baked map;
        // either way it is ours to release, and the flat state must forget
        // it so a return to the flat tier starts clean.
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
      const mat = this.clouds.material as THREE.MeshLambertMaterial
      if (!this.cloudTexUrl && mat.map) mat.map.dispose()
      this.cloudTexUrl = ct
      mat.map = ct ? this.loadTex(ct) : solidTexture(0xffffff, 0)
      mat.alphaMap = null
      this.cloudKey = ''
    }
    const cmat = this.clouds.material as THREE.MeshLambertMaterial
    const showClouds = !!ct && (P.clouds || 0) > 0.04
    if (showClouds && !this.clouds.visible) this.compileNeeded = true
    this.clouds.visible = showClouds
    this.clouds.scale.setScalar(0.888) // cloud deck just above the surface
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
   * The flat tier: the world's baked equirectangular map — the very map the
   * orbit view draws — on a smooth sphere. Cheap by construction: no displaced
   * geometry and no water or cloud shells (clouds are baked into the map).
   * Gas worlds put the map on the gas shader instead, which is the animated
   * one: differential band drift and the storm vortex live there.
   */
  private regenFlat(P: PlanetParams) {
    const pal = PALETTES[P.preset] ?? PALETTES.temperate
    const gas = isGas(pal)

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
      P.seed, P.preset, P.mountains, P.water, P.roughness, P.ice, P.clouds,
    ].join(':')
    if (key !== this.flatKey) {
      this.flatKey = key
      this.flatBakeId = ++this.bakeId
      const request: BakeWorkerRequest = { id: this.flatBakeId, kind: 'world', params: { ...P } }
      this.ensureWorldWorker().postMessage(request)
    }

    // Sculpted giants swirl by their own roughness; a photograph keeps 1.
    this.gasMesh.material.uniforms.uFlow.value = 0.55 + (P.roughness ?? 0.5) * 0.9
    this.gasMesh.material.uniforms.uRing.value.set(0, 0, 0, 0)

    this.setRing(P.rings ? customRing(P, pal) : null)
    this.ringG.rotation.z = ((P.ringTilt ?? 0.5) - 0.5) * 1.5708
    this.spinRate = 0.1 * (P.spinSpeed != null ? P.spinSpeed * 2 : 1) * (P.spinDir === -1 ? -1 : 1)

    const amat = this.atmo.material as THREE.ShaderMaterial
    amat.uniforms.uC.value.set(P.atmoColor ?? pal.atmo)
    amat.uniforms.uI.value = 0.3 + (P.glow ?? 0.5) * 1.6
    const showAtmo = (P.glow ?? 0.5) > 0.02
    if (showAtmo && !this.atmo.visible) this.compileNeeded = true
    this.atmo.visible = showAtmo
    this.stars.visible = P.stars !== false
  }

  /** A sculpted world: displace and colour the sphere from noise. */
  private regenProcedural(P: PlanetParams) {
    const pal = PALETTES[P.preset] ?? PALETTES.temperate
    this.texMesh.visible = false
    this.gasMesh.visible = false
    if (!this.planet.visible) this.compileNeeded = true
    this.planet.visible = true
    this.clouds.scale.setScalar(1)

    const cmat = this.clouds.material as THREE.MeshLambertMaterial
    if (this.cloudTexUrl) {
      this.cloudTexUrl = null
      cmat.map = solidTexture(0xffffff, 0)
      this.cloudKey = ''
    }

    const surface = makeSurface(P, this.n1!, this.n2!)
    const nextSurfaceKey = surfaceKey(P, this.detail)
    if (nextSurfaceKey !== this.surfaceKey) {
      this.surfaceKey = nextSurfaceKey
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

    const wmat = this.water.material as THREE.MeshPhongMaterial
    this.water.visible = !isGas(pal) && (P.water || 0) > 0.03
    this.water.scale.setScalar(Math.max(0.88, surface.seaRadius))
    if (!isGas(pal)) {
      wmat.color.set(pal.water)
      wmat.emissive.set(pal.emissive ?? 0x000000)
      wmat.opacity = pal.waterOpacity ?? 0.72
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
    amat.uniforms.uI.value = 0.3 + (P.glow ?? 0.5) * 1.6
    const showAtmo = (P.glow ?? 0.5) > 0.02
    if (showAtmo && !this.atmo.visible) this.compileNeeded = true
    this.atmo.visible = showAtmo
    this.stars.visible = P.stars !== false

    const showClouds = (P.clouds || 0) > 0.04
    if (showClouds && !this.clouds.visible) this.compileNeeded = true
    this.clouds.visible = showClouds
    cmat.opacity = pal.cloudO ?? 0.9
    cmat.color.set(('cloudTint' in pal && pal.cloudTint) || 0xffffff)

    const ck = `${P.seed}:${Math.round((P.clouds || 0) * 20)}`
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

    const shape = def.bodies.map(bodyKey).join('~')
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
      this.applyBodyProperties(def)
    }
    const orbits = def.bodies
      .map((b) => `${b.a}:${b.e}:${b.inc}:${b.node}:${b.peri}:${b.period}`)
      .join('~')
    if (orbits !== this.sysOrbitKey) {
      this.sysOrbitKey = orbits
      this.applyOrbits(def)
      this.sizeMode = '' // distances moved, so the size mode has to be reapplied
    }
    this.amb.intensity = 0.16
    this.sun.visible = false
    this.sunDir.set(5, 3, 4).normalize()

    this.planet.visible = false
    this.water.visible = false
    this.clouds.visible = false
    this.atmo.visible = false
    this.ring.visible = false
    this.texMesh.visible = false
    this.gasMesh.visible = false
    this.moonRoot.visible = false

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
    const names = def.bodies.map((b) => b.name).join('~')
    if (names !== this.sysLabelKey) {
      this.sysLabelKey = names
      def.bodies.forEach((b, i) => {
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

      const mat = this.clouds.material as THREE.MeshLambertMaterial
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

  private shouldContinue() {
    const running = !this.p || this.p.autoRotate !== false
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
    job.finally(() => {
      if (this.compiling === job) this.compiling = null
      recordOrbitMeasure('shader-ready', compileStart)
      const canvas = this.renderer.domElement
      canvas.dataset.compileProgramsBefore = String(programsBefore)
      canvas.dataset.compileProgramsAfter = String(this.renderer.info.programs?.length ?? 0)
      this.invalidate()
    })
    return true
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

    const running = !this.p || this.p.autoRotate !== false
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
      const ang = mo.phase + this.t * (6.2832 / moonPeriodSec(mo.P)) * (mo.P < 0 ? -1 : 1)
      if (mo.e > 0.001) {
        const Em = kepler(ang, mo.e)
        mo.mesh.position.set(
          mo.d * (Math.cos(Em) - mo.e), 0, mo.d * Math.sqrt(1 - mo.e * mo.e) * Math.sin(Em),
        )
        mo.mesh.rotation.y = -Math.atan2(mo.mesh.position.z, mo.mesh.position.x)
      } else {
        mo.mesh.position.set(Math.cos(ang) * mo.d, 0, Math.sin(ang) * mo.d)
        mo.mesh.rotation.y = -ang // tidally locked: one face always inward
      }
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
        u.node.position.set(x * cp - z * sp2, 0, x * sp2 + z * cp)
        u.spin.rotation.y += sdt * (6.2832 / ((Math.abs(u.day) / 24) * DAY_SEC)) * (u.day < 0 ? -1 : 1)
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

    const frameGap = this.lastRender ? now - this.lastRender : 0
    this.lastRender = now
    if (running) this.adaptQuality(frameGap)
    if (this.shouldContinue()) this.scheduleFrame()
  }
}
