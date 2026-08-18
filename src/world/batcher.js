import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * A sprawling world means thousands of trees, rocks and fence posts. Adding
 * them as individual meshes would blow the draw-call budget on a tablet, so
 * static scenery is baked: every instance is flattened into world space and
 * merged into one mesh per material.
 *
 * Trade-off: baked props can't move or be removed individually. That's fine
 * for scenery — anything the player interacts with stays a real object.
 */
export class StaticBatcher {
  constructor() {
    this.groups = new Map()   // material -> { material, geoms: [] }
    this.count = 0
  }

  /** Flatten `source` (a loaded model) at the given transform into the batch. */
  add(source, matrix) {
    source.updateMatrixWorld(true)
    source.traverse((o) => {
      if (!o.isMesh || !o.geometry) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      // Local transform of this mesh within its model, then the placement.
      const m = new THREE.Matrix4().multiplyMatrices(matrix, o.matrixWorld)

      const pushGeo = (geo, material) => {
        if (!material || !geo) return
        geo.applyMatrix4(m)
        if (!geo.attributes.normal) geo.computeVertexNormals()
        if (!geo.attributes.uv) {
          const n = geo.attributes.position.count
          geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2))
        }
        let bucket = this.groups.get(material)
        if (!bucket) { bucket = { material, geoms: [] }; this.groups.set(material, bucket) }
        bucket.geoms.push(geo)
        this.count++
      }

      const groups = o.geometry.groups
      if (groups?.length > 1 && mats.length > 1) {
        /* Multi-material mesh: each group must become its own geometry so it
           lands in the right material bucket. Group start/count are in index
           units when the geometry is indexed and vertex units when it isn't,
           so expand first and the two cases become one. Getting this wrong
           silently stacks the whole mesh once per material. */
        const src = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry
        for (const g of groups) {
          const sub = new THREE.BufferGeometry()
          let ok = false
          for (const name of ['position', 'normal', 'uv']) {
            const a = src.getAttribute(name)
            if (!a) continue
            const from = g.start * a.itemSize
            const to = (g.start + g.count) * a.itemSize
            if (to > a.array.length) continue
            sub.setAttribute(name, new THREE.BufferAttribute(a.array.slice(from, to), a.itemSize))
            if (name === 'position') ok = true
          }
          if (ok) pushGeo(sub, mats[g.materialIndex] ?? mats[0])
        }
        if (src !== o.geometry) src.dispose()
      } else {
        // Single material: clone and strip anything that would block merging.
        const geo = o.geometry.clone()
        for (const name of Object.keys(geo.attributes)) {
          if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name)
        }
        geo.clearGroups()
        pushGeo(geo, mats[0])
      }
    })
  }

  /** Build the merged meshes and hand them back as one group. */
  build(name = 'scenery') {
    const out = new THREE.Group()
    out.name = name
    for (const { material, geoms } of this.groups.values()) {
      if (!geoms.length) continue
      let merged
      try {
        merged = mergeGeometries(geoms, false)
      } catch (e) {
        console.warn('[batcher] merge failed, falling back', e)
        merged = null
      }
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      out.add(mesh)
      for (const g of geoms) g.dispose()
    }
    this.groups.clear()
    return out
  }
}
