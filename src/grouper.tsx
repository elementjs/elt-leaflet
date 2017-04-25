
import {
  BasicAttributes,
  Component,
  d,
  MaybeObservable,
  o,
  Observable,
  onmount,
  onunmount,
  Repeat,
} from 'domic'

import {Map} from './map'

function is_near(point1: L.Point, point2: L.Point, epsilon: number): boolean {
  var dx = point1.x - point2.x
  var dy = point1.y - point2.y
  return dx * dx + dy * dy <= epsilon * epsilon
}

export interface GroupPoint<T> extends L.Point {
  x: number
  y: number

  visited: boolean

  items: T[]
  x_index: number
  y_index: number
}

export type Cluster<T> = {
  latlng: L.LatLng
  items: T[]
}


/////////////////////////////////////

export interface GrouperAttributes<T> extends BasicAttributes {
  list: MaybeObservable<T[]>
  epsilon?: number
  single?: (latlng: L.LatLng, item: T) => Node
  multi?: (latlng: L.LatLng, items: T[]) => Node
  grouped?: (latlng: L.LatLng, items: T[]) => Node
}

export class Grouper<T extends HasLatLng> extends Component {

  attrs: GrouperAttributes<T>

  map: L.Map
  lst_x: GroupPoint<T>[] = []
  lst_y: GroupPoint<T>[] = []

  o_singles: Observable<GroupPoint<T>[]> = o([])
  o_multi: Observable<GroupPoint<T>[]> = o([])
  o_clusters: Observable<GroupPoint<T>[]> = o([])

  /**
   *
   * @param point
   * @param epsilon Une distance en pixels
   */
  query(point: GroupPoint<T>, epsilon: number) {
    // On explore les x et les y à proximité dont la distance reste inférieure
    // ou égale à epsilon.
    var i = 0
    var result: GroupPoint<T>[] = []
    var p: GroupPoint<T>

    var lst_x = this.lst_x

    for (i = point.x_index + 1; i < lst_x.length; i++) {
      // On a dépassé la limite
      p = lst_x[i]
      if (p.visited) continue
      if (Math.abs(p.x - point.x) > epsilon) break

      if (is_near(p, point, epsilon)) {
        // On peut rajouter ce point à la liste de résultats
        // Est-ce qu'il faudrait les splicer ?
        result.push(p)
        p.visited = true
      }
    }

    for (i = point.x_index - 1; i >= 0; i--) {
      // On a dépassé la limite
      p = lst_x[i]
      if (p.visited) continue
      if (Math.abs(p.x - point.x) > epsilon) break

      if (is_near(p, point, epsilon)) {
        // On peut rajouter ce point à la liste de résultats
        // Est-ce qu'il faudrait les splicer ?
        result.push(p)
        p.visited = true
      }
    }

    var lst_y = this.lst_y
    for (i = point.y_index + 1; i < lst_y.length; i++) {
      // On a dépassé la limite
      p = lst_y[i]
      if (p.visited) continue
      if (Math.abs(p.y - point.y) > epsilon) break

      if (is_near(p, point, epsilon)) {
        // On peut rajouter ce point à la liste de résultats
        // Est-ce qu'il faudrait les splicer ?
        result.push(p)
        p.visited = true
      }
    }

    for (i = point.y_index - 1; i >= 0; i--) {
      // On a dépassé la limite
      p = lst_y[i]
      if (p.visited) continue
      if (Math.abs(p.y - point.y) > epsilon) break

      if (is_near(p, point, epsilon)) {
        // On peut rajouter ce point à la liste de résultats
        // Est-ce qu'il faudrait les splicer ?
        result.push(p)
        p.visited = true
      }
    }

    return result
  }

  /**
   * C'est dans cette méthode qu'on regroupe les items par liste et qu'on rassemble
   * ceux qui ont la même localisation exactement.
   *
   * @param lst La liste à rentrer
   */
  computeLists(lst: T[]) {

    // Un premier regroupement a d'abord lieu ici, où les items qui sont sur exactement les
    // mêmes latitudes / longitudes sont regroupés.
    var coords: {[coords: string]: GroupPoint<T>} = {}
    var point_list: GroupPoint<T>[] = []

    lst.forEach(item => {
      var point = this.map.project(item.latlng()) as GroupPoint<T>
      var crds = `${point.x},${point.y}`

      if (crds in coords) {
        point = coords[crds]
        point.items.push(item)
      } else {
        point.items = [item]
        point.x_index = -1
        point.y_index = -1
        point.visited = false
        coords[crds] = point
        point_list.push(point)
      }
    })

    // Ici on contruit les listes pour checking
    this.lst_x = point_list
    this.lst_y = point_list.slice()

    this.lst_x.sort((a, b) => a.x < b.x ? -1 : a.x > b.x ? 1 : 0)
    this.lst_x.forEach((item, index) => item.x_index = index)
    this.lst_y.sort((a, b) => a.y < b.y ? -1 : a.y > b.y ? 1 : 0)
    this.lst_y.forEach((item, index) => item.y_index = index)

  }

  recompute(lst: T[]) {
    this.computeLists(lst)

    var singles: GroupPoint<T>[] = []
    var multis: GroupPoint<T>[] = []
    var clusters: GroupPoint<T>[][] = []

    for (var point of this.lst_x) {
      if (point.visited) continue
      point.visited = true

      var cluster = [point]

      for (var i = 0; i < cluster.length; i++) {
        var p2 = cluster[i]
        var neighbors = this.query(p2, this.attrs.epsilon || 15)
        for (var n of neighbors) {
          cluster.push(n)
        }
      }

      if (cluster.length > 1)
        clusters.push(cluster)
      else if (point.items.length > 1)
        multis.push(point)
      else
        singles.push(point)
    }

    this.o_singles.set(singles)
    this.o_multi.set(multis)
    this.o_clusters.set(clusters.map(cluster => {
      var p = L.point(0, 0) as GroupPoint<T>
      var x = 0
      var y = 0

      var items: T[] = p.items = []
      for (var point of cluster) {
        x += point.x
        y += point.y

        for (var it of point.items)
          items.push(it)
      }

      // On fait le barycentre
      p.x = x / cluster.length
      p.y = y / cluster.length
      return p
    }))
  }

  @onmount
  protected connectToMap() {
    this.map = Map.get(this.node).leafletMap
  }

  @onunmount
  protected unconnectMap() {
    this.map = null!
  }

  /**
   *
   */
  render() {

    // On observe la liste originale
    this.observe(this.attrs.list, lst => {
      this.recompute(lst)
    }, {debounce: 5})

    var singlefn = this.attrs.single
    var multifn = this.attrs.multi
    var groupedfn = this.attrs.grouped || this.attrs.multi

    return <div>

      {singlefn ?
        Repeat(this.o_singles, o_point =>
          singlefn!(
            this.map.unproject(o_point.get()) ,
            o_point.get().items[0]
          )
        )
      : null}

      {multifn ?
        Repeat(this.o_multi, o_point =>
          multifn!(
            this.map.unproject(o_point.get()) ,
            o_point.get().items
          )
        )
      : null}

      {groupedfn ?
        Repeat(this.o_clusters, o_point =>
          groupedfn!(
            this.map.unproject(o_point.get()) ,
            o_point.get().items
          )
        )
      : null}
    </div>
  }

}


export interface HasLatLng {
  latlng(): L.LatLng
}


/**
 *
 * @param items La liste d'items que l'on va vouloir regrouper
 * @param single  L'affichage d'un item simple
 * @param multi L'affichage d'une liste d'items sur les mêmes coordonnées
 * @param regrouped L'affichage de plusieurs points regroupés par distance
 */
export function GeoGroup<T extends HasLatLng>(
  items: Observable<T[]>,
  single?: (latlng: L.LatLng, item: T) => Node,
  multi?: (latlng: L.LatLng, items: T[]) => Node,
  grouped?: (latlng: L.LatLng, items: T[]) => Node,
  options = {
    // Tous les points à moins de 15 pixels de distance les uns des autres
    //
    epsilon: 20
  }
): Node {
  return d(Grouper, {list: items, single, multi, grouped, epsilon: options.epsilon})
}
