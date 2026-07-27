import * as THREE from 'three'
import { customRing, moonGeo, ringGeo, ringMaterial, toneTex } from './materials'
import { fbm, makeNoise, mulberry32, type Noise3 } from './noise'
import { ORBITS, REAL, realKeyFor } from './planets'
import { isGas, PALETTES } from './palettes'
import {
  D2R, DAY_SEC, kepler, moonDist, moonPeriodSec, moonRad,
  sameDist, SIZE_MAX, sizeMap, visDist, YEAR_SEC,
} from './scale'
import { ATMO_FRAG, ATMO_VERT, GAS_FRAG, GAS_VERT, SUN_FRAG, SUN_VERT } from './shaders'
import type { Moon, PlanetParams, RingConfig } from './types'

interface MoonInstance {
  orbit: THREE.Group
  mesh: THREE.Mesh
  d: number
  e: number
  P: number
  phase: number
}

interface SysNode {
  index: number
  node: THREE.Group
  tilt: THREE.Group
  spin: THREE.Group
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
  lineSame: THREE.Line
  lineScale: THREE.Line
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
  private sunMesh?: THREE.Mesh
  private sunMat?: THREE.ShaderMaterial
  private sysPlanets: THREE.Mesh[] = []
  private sysNodes: SysNode[] = []

  private p: PlanetParams | null = null
  private dirty = false
  private stopped = false
  private raf = 0
  private frames = 0

  private seed: number | null = null
  private detail = ''
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
  private nc: Noise3 | null = null

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

  private ro: ResizeObserver
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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
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

    this.water = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 64),
      new THREE.MeshPhongMaterial({
        color: 0x3f86c9, transparent: true, opacity: 0.72, shininess: 90, specular: 0x555555,
      }),
    )
    this.spinG.add(this.water)

    this.clouds = new THREE.Mesh(
      new THREE.SphereGeometry(1.16, 80, 56),
      new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.95, depthWrite: false }),
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

    // Fixed starfield, far enough out that it never intersects anything.
    const sg = new THREE.BufferGeometry()
    const sp = new Float32Array(1400 * 3)
    const rs = mulberry32(42)
    for (let k = 0; k < 1400; k++) {
      const u = rs() * 2 - 1
      const ph = rs() * Math.PI * 2
      const rr = Math.sqrt(1 - u * u)
      const rad = 320 + rs() * 260
      sp[k * 3] = rr * Math.cos(ph) * rad
      sp[k * 3 + 1] = u * rad
      sp[k * 3 + 2] = rr * Math.sin(ph) * rad
    }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3))
    this.stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({
        color: 0xffe9c4, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0.85,
      }),
    )
    this.scene.add(this.stars)

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
      new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }),
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

    this.bindPointer(cv)
    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()

    this.loop = this.loop.bind(this)
    this.raf = requestAnimationFrame(this.loop)
  }

  /* --- public API ------------------------------------------------------- */

  setParams(p: PlanetParams) {
    this.p = { ...p }
    this.dirty = true
  }

  /** Run the spectrometer sweep animation. */
  scan(dur = 2000) {
    this.scanT0 = performance.now()
    this.scanDur = dur
    this.scanRing.visible = true
  }

  resetView() {
    const z = this.fitZ || (this.mode === 'system' ? (this.sizeMode === 'scale' ? 86 : 11) : 3.15)
    this.tgt = { y: 0, x: 0.16, z }
  }

  dispose() {
    this.stopped = true
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    for (const t of Object.values(this.texCache)) t.dispose()
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
    })

    cv.addEventListener('pointermove', (e) => {
      const p = this.ptrs.get(e.pointerId)
      if (!p) return
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
    })

    const up = (e: PointerEvent) => {
      this.ptrs.delete(e.pointerId)
      if (this.ptrs.size === 0) {
        this.dragging = false
        cv.style.cursor = 'grab'
        if (this.sys?.visible && this.moved < 6) this.pick(e)
      }
    }
    cv.addEventListener('pointerup', up)
    cv.addEventListener('pointercancel', up)

    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.tgt = null
        this.camZ = Math.max(1.9, Math.min(this.zMax(), this.camZ * (1 + e.deltaY * 0.001)))
      },
      { passive: false },
    )
  }

  private zMax() {
    return this.p?.mode === 'system' ? 260 : 9
  }

  private pick(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.v2.set(
      ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1,
      -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1,
    )
    this.ray.setFromCamera(this.v2, this.camera)
    const hits = this.ray.intersectObjects(this.sysPlanets, false)
    if (hits.length) this.onPick?.((hits[0].object.userData as SysNode).index)
  }

  private resize() {
    const w = this.container.clientWidth || 300
    const h = this.container.clientHeight || 300
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
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
  }

  private loadTex(url: string, repeat?: boolean): THREE.Texture {
    if (!this.texCache[url]) {
      const t = this.texLoader.load(url)
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
    this.ring.visible = !!cfg
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
    this.ring.material.needsUpdate = true
  }

  /** Returns the outermost moon distance, used to frame the camera. */
  private setMoons(list: Moon[]): number {
    const key = list.map((m) => m.n + m.a).join('|')
    if (key === this.moonKey) return 0
    this.moonKey = key

    for (const old of this.moons) {
      this.moonRoot.remove(old.orbit)
      old.mesh.geometry.dispose()
      ;(old.mesh.material as THREE.Material).dispose()
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

      const mmat = new THREE.MeshStandardMaterial({ color: d.c, roughness: 0.98, metalness: 0 })
      if (d.tone) {
        mmat.map = toneTex(d.tone[0], d.tone[1])
        mmat.color.set(0xffffff)
      }
      const mesh = new THREE.Mesh(moonGeo(rd, d.irr), mmat)
      orbit.add(mesh)
      this.moonRoot.add(orbit)
      this.moons.push({ orbit, mesh, d: dist, e: d.e || 0, P: d.P, phase: (i * 2.1) % 6.283 })
    }
    return maxD
  }

  private ensureSystem() {
    if (this.sys) return
    this.sys = new THREE.Group()
    this.group.add(this.sys)

    this.sunMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
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

    this.sysPlanets = []
    this.sysNodes = []

    for (let i = 0; i < 8; i++) {
      const o = ORBITS[i]
      const key = realKeyFor(o[0])
      const R = REAL[key]

      const aSame = sameDist(o[1])
      const aScale = visDist(o[1])

      const plane = new THREE.Group()
      plane.rotation.y = o[5] * D2R // longitude of ascending node
      plane.rotation.x = o[4] * D2R // inclination to the ecliptic
      this.sys.add(plane)

      const node = new THREE.Group()
      plane.add(node)
      const tilt = new THREE.Group()
      tilt.rotation.z = R.ob * D2R
      node.add(tilt)
      const spin = new THREE.Group()
      tilt.add(spin)

      const m = new THREE.Mesh(
        new THREE.SphereGeometry(1, 48, 32),
        new THREE.MeshStandardMaterial({
          map: this.loadTex(`images2k/${o[0]}.jpg`), roughness: 1, metalness: 0,
        }),
      )
      m.scale.set(1, 1 - R.f, 1)
      spin.add(m)

      const peri = (o[6] - o[5]) * D2R
      const cp = Math.cos(peri)
      const spp = Math.sin(peri)
      const ecc = o[3]

      const mkLine = (AA: number) => {
        const pts: THREE.Vector3[] = []
        for (let k = 0; k <= 200; k++) {
          const E = (k / 200) * 6.2832
          const x = AA * (Math.cos(E) - ecc)
          const z = AA * Math.sqrt(1 - ecc * ecc) * Math.sin(E)
          pts.push(new THREE.Vector3(x * cp - z * spp, 0, x * spp + z * cp))
        }
        return new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0x6a5a80, transparent: true, opacity: 0.4 }),
        )
      }

      const lineSame = mkLine(aSame)
      const lineScale = mkLine(aScale)
      lineScale.visible = false
      plane.add(lineSame)
      plane.add(lineScale)

      const ud: SysNode = {
        index: i, node, tilt, spin, a: aSame, e: o[3], period: o[2],
        aSame, aScale, rSame: 0.24, rScale: sizeMap(o[7] * 6371) * 0.85,
        peri, angle: Math.random() * 6.283, day: R.day, f: R.f, lineSame, lineScale,
      }
      m.userData = ud

      if (R.ring) {
        const rm = new THREE.Mesh(ringGeo(R.ring.inner, R.ring.outer), ringMaterial())
        rm.rotation.x = -Math.PI / 2
        rm.material.uniforms.uColor.value.set(R.ring.color)
        rm.material.uniforms.uOpacity.value = R.ring.opacity
        rm.material.uniforms.uProfile.value = R.ring.profile || 0
        if (R.ring.map) {
          rm.material.uniforms.uMap.value = this.loadTex(R.ring.map)
          rm.material.uniforms.uHasMap.value = 1
        }
        rm.material.uniforms.uL.value.set(1, 0, 0)
        tilt.add(rm)
      }

      this.sysPlanets.push(m)
      this.sysNodes.push(ud)
    }
  }

  /* --- regeneration ----------------------------------------------------- */

  private regen() {
    const P = this.p
    if (!P) return

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
      this.n1 = makeNoise(P.seed | 0)
      this.n2 = makeNoise((P.seed | 0) ^ 0x51ed270b)
      this.nc = makeNoise((P.seed | 0) + 777)
      this.seed = P.seed
      this.cloudKey = ''
    }

    // Real bodies only apply when we're showing their real photographic map.
    const R = P.texture ? REAL[P.preset] : null
    this.real = R ?? null
    this.amb.intensity = R ? 0.17 : 0.34

    const flat = R ? 1 - R.f : 1
    this.dayH = R ? R.day : 0
    this.tiltG.rotation.z = R ? R.ob * D2R : 0
    this.spinG.scale.set(1, flat, 1)
    this.atmo.scale.set(1, flat, 1)

    if (R) {
      const md = this.setMoons(R.moons)
      if (md) {
        const want = Math.min(8.4, Math.max(3.15, md * 1.32))
        this.fitZ = want
        if (Math.abs(want - this.camZ) > 0.05 && !this.dragging) this.camZ = want
      } else if (this.camZ > 4) this.camZ = 3.15
    } else {
      const mc = Math.min(3, P.moons | 0)
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

    if (P.texture) return this.regenTextured(P, R)

    this.regenProcedural(P)
  }

  /** A real planet shown with its photographic map. */
  private regenTextured(P: PlanetParams, R: (typeof REAL)[string] | null) {
    const pal = PALETTES[P.preset] ?? PALETTES.temperate
    const gas = isGas(pal)

    if (this.texUrl !== P.texture) {
      this.texUrl = P.texture!
      this.texMesh.material.map = this.loadTex(P.texture!)
      this.texMesh.material.needsUpdate = true
      this.gasMesh.material.uniforms.uMap.value = this.loadTex(P.texture!, true)
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
      mat.map = ct ? this.loadTex(ct) : null
      mat.alphaMap = null
      mat.needsUpdate = true
      this.cloudKey = ''
    }
    const cmat = this.clouds.material as THREE.MeshLambertMaterial
    this.clouds.visible = !!ct && (P.clouds || 0) > 0.04
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
    this.atmo.visible = (P.glow ?? 0.5) > 0.02
    this.stars.visible = P.stars !== false
  }

  /** A sculpted world: displace and colour the sphere from noise. */
  private regenProcedural(P: PlanetParams) {
    const pal = PALETTES[P.preset] ?? PALETTES.temperate
    this.texMesh.visible = false
    this.gasMesh.visible = false
    this.planet.visible = true
    this.clouds.scale.setScalar(1)

    const cmat = this.clouds.material as THREE.MeshLambertMaterial
    if (this.cloudTexUrl) {
      this.cloudTexUrl = null
      cmat.map = null
      cmat.needsUpdate = true
      this.cloudKey = ''
    }

    const pa = this.geo!.attributes.position.array as Float32Array
    const ca = this.geo!.attributes.color.array as Float32Array
    const dirs = this.dirs!
    const f = 1.15 + (P.roughness || 0) * 2.5
    const amp = 0.12
    const sea = (P.water || 0) * 1.5 - 0.75
    const mtn = P.mountains || 0
    const n1 = this.n1!
    const n2 = this.n2!
    const tmp = new THREE.Color()

    if (isGas(pal)) {
      const gasStops = pal.bands.map((b) => [b[0], new THREE.Color(b[1])] as const)
      for (let i = 0; i < dirs.length; i += 3) {
        const gx = dirs[i], gy = dirs[i + 1], gz = dirs[i + 2]
        const wob =
          (fbm(n1, gx * 2.2, gy * 7, gz * 2.2, 4) * 0.07 +
            fbm(n2, gx * 4 + 9, gy * 4 + 9, gz * 4 + 9, 3) * 0.03) *
          (0.35 + (P.roughness || 0) * 1.7)
        const gt = Math.min(1, Math.max(0, gy * 0.5 + 0.5 + wob))
        const gr = 1 + fbm(n1, gx * 1.3, gy * 1.3, gz * 1.3, 3) * 0.012
        pa[i] = gx * gr
        pa[i + 1] = gy * gr
        pa[i + 2] = gz * gr

        let a = gasStops[0]
        let b = gasStops[gasStops.length - 1]
        for (let gs = 0; gs < gasStops.length - 1; gs++) {
          if (gt >= gasStops[gs][0] && gt <= gasStops[gs + 1][0]) {
            a = gasStops[gs]
            b = gasStops[gs + 1]
            break
          }
        }
        tmp.copy(a[1]).lerp(b[1], Math.min(1, (gt - a[0]) / Math.max(1e-6, b[0] - a[0])))
        ca[i] = tmp.r
        ca[i + 1] = tmp.g
        ca[i + 2] = tmp.b
      }
    } else {
      const C = (k: keyof typeof pal) => new THREE.Color(pal[k] as number)
      const cDeep = C('deep'), cWater = C('water'), cSand = C('sand')
      const cLow = C('low'), cMid = C('mid'), cHigh = C('high'), cSnow = C('snow')
      const cShal = cWater.clone().lerp(cSand, 0.5)
      const stops: Array<[number, THREE.Color]> = [
        [0, cSand], [0.1, cSand], [0.18, cLow], [0.45, cMid],
        [0.72, cHigh], [0.88, cSnow], [1.01, cSnow],
      ]

      for (let i = 0; i < dirs.length; i += 3) {
        const x = dirs[i], y = dirs[i + 1], z = dirs[i + 2]
        const cont = fbm(n1, x * f, y * f, z * f, 5)
        const rr = 1 - Math.abs(fbm(n2, x * f * 1.8 + 5.2, y * f * 1.8 + 5.2, z * f * 1.8 + 5.2, 4))
        const e = cont * 0.62 + rr * rr * mtn * 0.9 - mtn * 0.2
        const r = 1 + e * amp
        pa[i] = x * r
        pa[i + 1] = y * r
        pa[i + 2] = z * r

        if (e < sea) {
          tmp.copy(cShal).lerp(cDeep, Math.min(1, (sea - e) * 3.5))
        } else {
          const t = Math.min(1, (e - sea) / Math.max(0.25, (1 - sea) * 0.95))
          let a = stops[0]
          let b = stops[stops.length - 1]
          for (let s = 0; s < stops.length - 1; s++) {
            if (t >= stops[s][0] && t <= stops[s + 1][0]) {
              a = stops[s]
              b = stops[s + 1]
              break
            }
          }
          tmp.copy(a[1]).lerp(b[1], Math.min(1, (t - a[0]) / Math.max(1e-6, b[0] - a[0])))
        }

        const ay = Math.abs(y)
        const iceAmt = P.ice || 0
        const iceTh = 1 - iceAmt * 0.6
        if (iceAmt > 0 && ay > iceTh) {
          tmp.lerp(cSnow, Math.min(1, (ay - iceTh) / 0.08) * 0.95)
        }
        ca[i] = tmp.r
        ca[i + 1] = tmp.g
        ca[i + 2] = tmp.b
      }
    }

    this.geo!.attributes.position.needsUpdate = true
    this.geo!.attributes.color.needsUpdate = true
    this.geo!.computeVertexNormals()

    const wr = 1 + sea * amp
    const wmat = this.water.material as THREE.MeshPhongMaterial
    this.water.visible = !isGas(pal) && (P.water || 0) > 0.03
    this.water.scale.setScalar(Math.max(0.88, wr))
    if (!isGas(pal)) {
      wmat.color.set(pal.water)
      wmat.emissive.set(pal.emissive ?? 0x000000)
      wmat.opacity = pal.waterOpacity ?? 0.72
    }

    this.setRing(P.rings ? customRing(P, pal) : null)
    this.ringG.rotation.z = ((P.ringTilt ?? 0.5) - 0.5) * 1.5708
    this.spinRate = 0.1 * (P.spinSpeed != null ? P.spinSpeed * 2 : 1) * (P.spinDir === -1 ? -1 : 1)

    const amat = this.atmo.material as THREE.ShaderMaterial
    amat.uniforms.uC.value.set(P.atmoColor ?? pal.atmo)
    amat.uniforms.uI.value = 0.3 + (P.glow ?? 0.5) * 1.6
    this.atmo.visible = (P.glow ?? 0.5) > 0.02
    this.stars.visible = P.stars !== false

    this.clouds.visible = (P.clouds || 0) > 0.04
    cmat.opacity = pal.cloudO ?? 0.9
    cmat.color.set(('cloudTint' in pal && pal.cloudTint) || 0xffffff)

    const ck = `${P.seed}:${Math.round((P.clouds || 0) * 20)}`
    if (ck !== this.cloudKey) {
      this.cloudKey = ck
      this.cloudsPending = true
    }
  }

  private regenSystem(P: PlanetParams) {
    this.ensureSystem()
    if (this.mode !== 'system') {
      this.mode = 'system'
      this.rotX = 0.5
      this.rotY = 0
      this.velX = 0
      this.velY = 0
      this.sizeMode = ''
    }
    this.sys!.visible = true
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
      this.sizeMode = sm
      this.camZ = sm === 'scale' ? 86 : 11
      this.fitZ = this.camZ
      for (const u of this.sysNodes) {
        u.a = sm === 'scale' ? u.aScale : u.aSame
        u.tilt.scale.setScalar(sm === 'scale' ? u.rScale : u.rSame) // scales rings too
        u.lineSame.visible = sm === 'same'
        u.lineScale.visible = sm === 'scale'
      }
      this.sunMesh!.scale.setScalar(sm === 'scale' ? SIZE_MAX : 1.15)
    }
    this.stars.visible = P.stars !== false
  }

  private makeClouds() {
    const P = this.p!
    const n = this.nc!
    const w = 384
    const h = 192
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d')!
    const img = ctx.createImageData(w, h)
    const cov = P.clouds || 0
    const th = 0.78 - cov * 0.55

    for (let y = 0; y < h; y++) {
      const phi = ((y + 0.5) / h) * Math.PI
      const sp = Math.sin(phi)
      const cp = Math.cos(phi)
      for (let x = 0; x < w; x++) {
        const t2 = ((x + 0.5) / w) * 2 * Math.PI
        const v = fbm(n, sp * Math.cos(t2) * 1.7, cp * 1.7, sp * Math.sin(t2) * 1.7, 4) * 0.5 + 0.5
        const a = Math.min(1, Math.max(0, (v - th) / 0.22))
        const o = (y * w + x) * 4
        img.data[o] = 255
        img.data[o + 1] = 255
        img.data[o + 2] = 255
        img.data[o + 3] = a * 235
      }
    }
    ctx.putImageData(img, 0, 0)

    const mat = this.clouds.material as THREE.MeshLambertMaterial
    mat.map?.dispose()
    mat.map = new THREE.CanvasTexture(cv)
    mat.needsUpdate = true
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

  private loop() {
    if (this.stopped) return
    this.raf = requestAnimationFrame(this.loop)

    if (this.dirty && this.p) {
      this.dirty = false
      this.regen()
    }

    const now = performance.now()
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 0.016
    this.lastT = now

    const running = !this.p || this.p.autoRotate !== false
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
      for (const child of this.sysPlanets[5].userData.tilt.children as THREE.Object3D[]) {
        const m = child as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
        if (m.material?.uniforms?.uFace) this.ringLight(m)
      }
    }

    this.renderer.render(this.scene, this.camera)

    // Observability hook: WebGL does not preserve its drawing buffer, so the
    // canvas cannot be read back after the frame. Publishing the frame count
    // and triangles drawn gives tests (and debugging) a truthful signal that
    // geometry is actually reaching the GPU.
    this.frames++
    const cv = this.renderer.domElement
    cv.dataset.frames = String(this.frames)
    cv.dataset.triangles = String(this.renderer.info.render.triangles)
  }
}
