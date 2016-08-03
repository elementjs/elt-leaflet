
import {c, Atom, ArrayObservable, Observable, click, Appendable} from 'carbyne'
import {Column, scrollable} from 'carbyne-material'

import {} from './carbyne-marker'

///////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////

/**
 * Constructeur de Popup qui attend à la fois un observable de liste
 * et un item. Doit faire un item.set() d'un élément de sa liste pour être
 * plus logique.
 */
export type PopupFn<T> = (list: Observable<T[]>, item: Observable<T>) => Atom
export type MarkerFn<T> = (o: Observable<T[]>) => Appendable

export interface ILocatable {
	latlng(items?: ILocatable[]): L.LatLng
}

export type MarkerAndObs<T> = {
	marker: L.Marker,
	obs: ArrayObservable<T>
}

/**
 *
 */
export class MarkerStore<T extends ILocatable> {

	public ᐅselected: Observable<T>

	protected map: L.Map
	protected layer: L.FeatureGroup<L.Marker>
	protected popup: Atom
	protected markerfn: MarkerFn<T>

	protected llmap: Map<string, MarkerAndObs<T>>
	protected itemmap: Map<T, L.Marker>

	protected ᐅselected_list: Observable<T[]>

	constructor(popup: PopupFn<T>, marker_fn: MarkerFn<T>) {

		this.markerfn = marker_fn
		this.ᐅselected = new Observable<T>(null)
		this.ᐅselected_list = new Observable<T[]>(null)

		// On gruge ici en construisant un popup qui sera complètement réutilisé
		// en ne changeant que les éléments sélectionnés.
		this.popup = popup(this.ᐅselected_list, this.ᐅselected)
		this.popup.mount(document.createDocumentFragment())

		this.llmap = new Map<string, MarkerAndObs<T>>()
		this.itemmap = new Map<T, L.Marker>()

		this.layer = L.featureGroup<L.Marker>()

		this.layer.on('click', (e: L.LeafletMouseEvent) => {
			let ll = e.latlng.toString()
			let marker = this.llmap.get(ll).marker
			this.selectMarker(marker)
		})

	}

	setMap(map: L.Map) {
		this.map = map
		map.addLayer(this.layer)
	}

	/**
	 * Sélectionne un target, centre la map et fait apparaître le popup le concernant.
	 * Nota : ceci ignore donc forcément le fait qu'il peut y avoir d'autres objets au
	 * même endroit.
	 */
	selectItem(item: T) {
		// récupération du marker
		let marker = this.itemmap.get(item)
		setTimeout(() => marker.openPopup(), 10)

		this.ᐅselected_list.set(null)
		this.ᐅselected.set(item)
	}

	/**
	 * Sélectionne un marqueur. Aboutit à l'affichage du popup en mode
	 * liste ou single dépendamment du nombre de points enregistrés sur cette
	 * même position.
	 */
	selectMarker(marker: L.Marker) {
		let list = this.llmap.get(marker.getLatLng().toString()).obs.get()

		if (!list) return // do nothing

		if (list.length === 1) {
			this.ᐅselected.set(list[0])
			this.ᐅselected_list.set(null)
		} else {
			this.ᐅselected.set(null)
			this.ᐅselected_list.set(list)
		}
	}

	closePopup() {
		this.map.closePopup()
	}

	/**
	 * Mise à jour des marqueurs présents sur la map.
	 *
	 * 1. Groupement des marqueurs par latitude et longitude.
	 * 2. Récupération des marqueurs existants pour savoir ceux qu'on peut réutiliser.
	 * 		/!\ certains marqueurs peuvent devenir multiples et doivent donc être supprimés (?)
	 * 3. Création des marqueurs manquants
	 * 4. Suppression des marqueurs superflus
	 */
	updateItems(items: T[]) {
		let old_map = this.llmap
		let new_map = new Map<string, MarkerAndObs<T>>()
		let newitem_map = new Map<T, L.Marker>()

		// On commence par construire la nouvelle map en reprenant les anciens éléments
		// si c'est possible.
		for (let item of items) {
			// Certaines contraintes ne sont pas localisées, mais il faut quand même pouvoir
			// les afficher.
			let ll = item.latlng(items)
			let lls = ll.toString()
			if (!new_map.has(lls)) {
				if (old_map.has(lls)) {
					let mm = old_map.get(lls)
					newitem_map.set(item, mm.marker)
					mm.obs.set([item])
					new_map.set(lls, {
						marker: old_map.get(lls).marker,
						obs: mm.obs
					})
					// On a récupéré ce qu'il y avait à récupérer, donc on l'enlève de la old_map
					old_map.delete(lls)
				} else {
					let obs = new ArrayObservable<T>([item])
					let marker = this.getMarker(ll, obs)
					newitem_map.set(item, marker)
					new_map.set(lls, {
						marker: marker,
						obs: obs
					})
				}
			} else {
				let mm = new_map.get(lls)
				newitem_map.set(item, mm.marker)
				mm.obs.push(item)
			}
		}

		// Pour tous ceux qui n'ont pas été flaggués, on les tue.
		old_map.forEach((val, ll) => {
			this.layer.removeLayer(val.marker)
		})

		// Il semblerait que supprimer des éléments désactive le popup, donc
		// on le rebind après cette opération.
		// Update: Il y a bien une issue ouverte sur github où le dev suggère d'attendre
		// la 1.0 pour que ce soit résolu.
		this.layer.bindPopup(this.popup.element as any, {
			closeButton: false,
			autoPan: true,
			autoPanPadding: L.point(30, 30),
			className: 'map-popup',
			minWidth: 340,
			maxHeight: 420
		})

		this.llmap = new_map
		this.itemmap = newitem_map
	}

	fitBounds() {
		this.map.fitBounds(this.layer.getBounds(), {
			maxZoom: 10
		})
	}

	/**
	 * Ne sélectionne pas un target, mais potentiellement une liste de ceux-ci
	 */
	handleClick(event: L.LeafletMouseEvent) {
		let marker: L.Marker = event.target
		this.selectMarker(marker)
	}

	/**
	 * Crée ou récupère un marqueur pour un Step donné.
	 */
	private getMarker(ll: L.LatLng, obs: ArrayObservable<T>): L.Marker {

		let icon = L.carbyneIcon({
			marker: () => <div class='leaflet-marker-icon'>
					{this.markerfn(obs)}
			</div>,
			iconAnchor: [0, 0],
			popupAnchor: [0, 0] // FIXME, this can't be right...
		})

		let m = L.carbyneMarker(ll, {
			icon: icon
		})

		this.layer.addLayer(m)
		return m
	}

	/**
	 * Nettoyage du popup pour éviter les memory leaks et suppression
	 */
	destroy() {
		// on nettoie tous les observables
		this.popup.broadcast('destroy')
		this.map.removeLayer(this.layer)
	}

}
