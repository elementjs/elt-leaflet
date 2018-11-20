
import {
  Attrs,
  Mixin,
  instanciate_verb,
  o,
  Repeat,
} from 'elt'

import {Map} from './map'
import {domMarker} from './marker'

import * as L from 'leaflet'


function _avg(lst: number[]): number {
  var res = 0
  for (var i of lst) res += i
  return res / lst.length
}


export interface GroupPoint<T> extends L.Point {
  x: number
  y: number

  visited: boolean

  // The index in the original list
  index: number
  // The index of this point along the x axis
  x_index: number
  // The index of this point along the y axis
  y_index: number
}

export interface Cluster<T> extends L.Point {
  x: number
  y: number

  points: GroupPoint<T>[]
}


/////////////////////////////////////


function _for<T>(start: number, dir: number, lst: GroupPoint<T>[], fn: (p: GroupPoint<T>) => boolean) {
  var dst = dir < 0 ? 0 : lst.length

  for (var i = start; dir > 0 && i < dst || dir < 0 && i > 0; i += dir) {
    if (!fn(lst[i]))
      return
  }
}



export type GrouperCallbackMulti<T> = (item: o.ArrayTransformObservable<T>, latlng: L.LatLng) => (Element | L.Marker)


export class Grouper<T> extends Mixin<Comment> {

  map: L.Map
  zoom_level: number

  cluster_layer: L.LayerGroup = L.layerGroup([])
  bound_recompute: () => void = o.debounce(() => this.recompute(), 1)
  child_observables: o.Observable<any>[] = []

  lst_x: GroupPoint<T>[] = []
  lst_y: GroupPoint<T>[] = []

  o_clusters: o.Observable<Cluster<T>[]> = o([])

  constructor(
    public extractor: (a: T) => L.LatLng,
    public list: o.Observable<T[]>,
    public multi: GrouperCallbackMulti<T>,
    public epsilon: number = 35
  ) {
    super()
  }

  /**
   *
   * @param point
   * @param epsilon Une distance en pixels
   */
  query(point: GroupPoint<T>, cluster: Cluster<T>, epsilon: number) {
    var lst_x = this.lst_x
    var lst_y = this.lst_y

    function _check_include(p: GroupPoint<T>) {
      if (p.visited) return true

      if (Math.abs(p.x - cluster.x) > epsilon)
        // If we're above epsilon, we can stop right there
        return false

      var points = cluster.points
      var dx = p.x - cluster.x
      var dy = p.y - cluster.y
      var eps = epsilon + 4 * Math.log2(points.length)

      if (dx * dx + dy * dy <= eps * eps) {
        var l = points.length
        // readjust the cluster position
        // this nifty formula allows us to avoid computing the full
        // barycenter everytime the point moves.
        cluster.x = (cluster.x * l + p.x) / (l + 1)
        cluster.y = (cluster.y * l + p.y) / (l + 1)
        cluster.points.push(p)
        p.visited = true
      }

      return true
    }

    _for(point.x_index + 1, 1, lst_x, _check_include)
    _for(point.x_index - 1, -1, lst_x, _check_include)
    _for(point.y_index + 1, 1, lst_y, _check_include)
    _for(point.y_index - 1, -1, lst_y, _check_include)
  }

  /**
   * C'est dans cette méthode qu'on regroupe les items par liste et qu'on rassemble
   * ceux qui ont la même localisation exactement.
   *
   * @param lst La liste à rentrer
   */
  computeLists() {
    var lst = this.list.get()
    var bounds = this.map.getBounds()
    this.zoom_level = this.map.getZoom()

    // Un premier regroupement a d'abord lieu ici, où les items qui sont sur exactement les
    // mêmes latitudes / longitudes sont regroupés.
    var point_list: GroupPoint<T>[] = []

    const zoom_level = this.zoom_level

    for (var i = 0; i < lst.length; i++) {
      var item = lst[i]
      var ll = this.extractor(item)
      if (!ll || !bounds.contains(ll)) continue
      var point = this.map.project(ll, zoom_level) as GroupPoint<T>

      point.index = i
      point.x_index = -1
      point.y_index = -1
      point.visited = false
      point_list.push(point)
    }

    // Ici on contruit les listes pour checking
    this.lst_x = point_list
    this.lst_y = point_list.slice()

    this.lst_x.sort((a, b) => a.x < b.x ? -1 : a.x > b.x ? 1 : 0)
    this.lst_x.forEach((item, index) => item.x_index = index)
    this.lst_y.sort((a, b) => a.y < b.y ? -1 : a.y > b.y ? 1 : 0)
    this.lst_y.forEach((item, index) => item.y_index = index)

  }

  /**
   * Recompute the clusters or single points.
   */
  recompute() {
    var clusters: Cluster<T>[] = []
    this.computeLists()

    for (var point of this.lst_x) {
      if (point.visited) continue
      point.visited = true

      var cluster = {
        x: point.x,
        y: point.y,
        points: [point]
      } as Cluster<T>
      var points = cluster.points

      for (var i = 0; i < points.length; i++) {
        this.query(points[i], cluster, this.epsilon)
      }

      clusters.push(cluster)
    }

    this.o_clusters.set(clusters)
  }

  inserted(node: Node) {
    this.map = Map.get(node)!.leafletMap

    this.map.addLayer(this.cluster_layer)

    // Whenever the zoom level changes, we want to recompute
    // the point clouds.
    this.map.on('moveend', this.bound_recompute)
    this.map.on('zoomend', this.bound_recompute)
  }

  removed() {
    for (var co of this.child_observables)
      co.stopObservers()
    this.cluster_layer.remove()
    this.map.off('moveend', this.bound_recompute)
    this.map.off('zoomend', this.bound_recompute)
    this.map = null!
  }

  /**
   *
   */
  init() {
    // We have to track the observables we send back to the marker functions,
    // as they may be out of sync with the new list when it changes. When that
    // happens, we just disable them.

    // On observe la liste originale
    this.observe(this.list, (lst, chg) => {

      var same = !chg.changed(l => l.length)
      if (same) {
        var different = false
        const old = chg.oldValue()
        for (var i = 0; i < lst.length; i++) {
          if (!this.extractor(lst[i])) continue
          if (!this.extractor(lst[i]).equals(this.extractor(old[i]))) {
            same = false
            break
          }
        }
      }

      if (!same) {
        // We want to make sure that our previously sent
        // observers are not going to mess up our list.
        o.foreach(this.child_observables, c => c.stopObservers())
        this.bound_recompute()
      }

    })

    var multifn = this.multi

    this.observe(this.o_clusters, (clusters, previous) => {
      this.cluster_layer.clearLayers()

      for (var c of clusters) {
        var ll = this.map.unproject(c, this.zoom_level)

        // For clusters, we create an virtual observable that remembers what the original
        // elements indices were and map them back to the original list if they change.
        let indices = c.points.map(c => c.index).sort()
        indices = indices.sort((a, b) => a < b ? -1 : a > b ? 1 : 0) // Keep the original sorting.
        let obs = this.list.arrayTransform(indices)
        this.child_observables.push(obs)

        var eltmarker = multifn(obs, ll)
        var marker = eltmarker instanceof L.Marker ? eltmarker : domMarker(ll, eltmarker)
        this.cluster_layer.addLayer(marker)
      }
    })

  }

}


/**
 *
 * @param items La liste d'items que l'on va vouloir regrouper
 * @param single  L'affichage d'un item simple
 * @param multi L'affichage d'une liste d'items sur les mêmes coordonnées
 * @param regrouped L'affichage de plusieurs points regroupés par distance
 */
export function GeoGroup<T>(
  extractor: (a: T) => L.LatLng,
  items: o.Observable<T[]>,
  multi: GrouperCallbackMulti<T>,
  options?: {
    // Tous les points à moins de 15 pixels de distance les uns des autres
    //
    epsilon: number
  }
): Node
 export function GeoGroup<T>(
  extractor: (a: any) => L.LatLng,
  items: o.Observable<T[]>,
  multi: GrouperCallbackMulti<T>,
  options = {
    // Tous les points à moins de 15 pixels de distance les uns des autres
    //
    epsilon: 35
  }
): Node {
  return instanciate_verb(new Grouper(extractor, items, multi, options.epsilon))
}
