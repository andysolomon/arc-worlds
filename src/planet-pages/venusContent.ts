export interface PlanetPageAsset {
  id: 'clouds' | 'radar'
  source: string
  credit: string
  licence: { label: string; url: string }
  transformation: string
  caption: string
  alt: string
  sources: {
    avif: string
    webp: string
    fallback: string
    srcSet: string
  }
}

/** Venus-only metadata stays with the lazy lesson rather than the app entry. */
export const VENUS_CONTENT = {
  key: 'venus',
  path: '/venus',
  title: 'Venus: the world beneath the veil',
  beatIds: ['veil', 'crush', 'heat-trap', 'missing-water', 'radar-world', 'scan'],
  beatTitles: [
    'The Veil',
    'The Crush',
    'The Heat Trap',
    'The Missing Water',
    'The Radar World',
    'Scan: Why Venus Is Hell',
  ],
  assets: [
    {
      id: 'clouds',
      source: 'https://science.nasa.gov/photojournal/venus-from-mariner-10/',
      credit: 'NASA/JPL-Caltech; image processing by Kevin M. Gill',
      licence: {
        label: 'NASA media usage guidelines',
        url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
      },
      transformation:
        'Contrast-enhanced half of PIA23791 cropped from the NASA comparison, resized, stripped of metadata, and encoded as responsive AVIF/WebP.',
      caption:
        'Mariner 10 orange-and-ultraviolet data, shown in a false-colour composite that reveals cloud structure.',
      alt:
        'False-colour Mariner 10 view of Venus, with pale cream and amber bands in the planet-wide cloud deck.',
      sources: {
        avif: '/venus/mariner-clouds-640.avif 640w, /venus/mariner-clouds-1080.avif 1080w',
        webp: '/venus/mariner-clouds-640.webp 640w, /venus/mariner-clouds-1080.webp 1080w',
        fallback: '/venus/mariner-clouds-1080.webp',
        srcSet: '/venus/mariner-clouds-640.webp 640w, /venus/mariner-clouds-1080.webp 1080w',
      },
    },
    {
      id: 'radar',
      source:
        'https://astrogeology.usgs.gov/search/map/venus_magellan_global_c3_mdir_synthetic_color_mosaic_4641m',
      credit: 'USGS Astrogeology Science Center / NASA Magellan / PDS',
      licence: {
        label: 'Public domain',
        url: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
      },
      transformation:
        'Public-domain 8192×4096 equirectangular C3-MDIR synthetic-colour mosaic resized to 1280×640 and 640×320, stripped of metadata, and encoded as AVIF/WebP.',
      caption:
        'A synthetic-colour Magellan radar mosaic. Brightness records radar return, not visible colour or elevation.',
      alt:
        'Equirectangular synthetic-colour Magellan radar mosaic of Venus, patterned with bright ridges, plains, craters, and dark patches.',
      sources: {
        avif: '/venus/magellan-radar-640.avif 640w, /venus/magellan-radar-1280.avif 1280w',
        webp: '/venus/magellan-radar-640.webp 640w, /venus/magellan-radar-1280.webp 1280w',
        fallback: '/venus/magellan-radar-1280.webp',
        srcSet: '/venus/magellan-radar-640.webp 640w, /venus/magellan-radar-1280.webp 1280w',
      },
    },
  ] satisfies readonly PlanetPageAsset[],
} as const
