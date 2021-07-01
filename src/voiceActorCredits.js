import {
	buildEntityURL,
	fetchVoiceActors,
} from './discogs.js';
import {
	fetchEntityJS,
	getEntityForResourceURL,
} from './api.js'

/**
 * Creates an "Add relationship" dialogue where the type "vocals" and the attribute "spoken vocals" are pre-selected.
 * Optionally the performing artist (voice actor) and the name of the role can be pre-filled.
 * @param {Object} artistData Edit data of the performing artist (optional).
 * @param {string} roleName Credited name of the voice actor's role (optional).
 * @returns MusicBrainz "Add relationship" dialog.
 */
export function createVoiceActorDialog(artistData = {}, roleName = '') {
	const viewModel = MB.releaseRelationshipEditor;
	// let target = MB.entity({ entityType: 'artist', ...artistData });
	let target = new MB.entity.Artist(artistData);
	const gid = artistData.gid;
	// TODO: target.gid selects the correct artist but the name has to filled manually and is not highlighted green
	/* if (gid) {
		// probably the display issue is related to the caching of entities, code below does not help
		MB.entityCache[gid] = target = await fetchEntityJS(gid);
		// https://github.com/loujine/musicbrainz-scripts/blob/333a5f7c0a55454080c730b0eb7a22446d48d371/mb-reledit-guess_works.user.js#L54-L56
		target.relationships.forEach((rel) => {
			// apparently necessary to fill MB.entityCache with rels
			MB.getRelationship(rel, target);
		});
	} */
	const dialog = new MB.relationshipEditor.UI.AddDialog({
		source: viewModel.source,
		target,
		viewModel,
	});
	const rel = dialog.relationship();
	rel.linkTypeID(60); // set type: performance -> performer -> vocals
	rel.setAttributes([{
		type: { gid: 'd3a36e62-a7c4-4eb9-839f-adfebe87ac12' }, // spoken vocals
		credited_as: roleName,
	}]);
	return dialog;
}

export async function importVoiceActorsFromDiscogs(releaseURL, event = document.createEvent('MouseEvent')) {
	/** @type {[{name:string,anv:string,role:string,id:number,join:string,resource_url:string,tracks:string}]} */
	const actors = await fetchVoiceActors(releaseURL);
	for (const actor of actors) {
		console.info(actor);
		const roleName = actor.role.match(/\[(.+)\]/)?.[1] || '';
		try {
			const mbArtist = await getEntityForResourceURL('artist', buildEntityURL('artist', actor.id));
			createVoiceActorDialog({ name: actor.name, gid: mbArtist.id }, roleName).accept();
		} catch (error) {
			// createVoiceActorDialog({ name: actor.name }, roleName).open(event);
			// TODO: wait for the dialog to be closed
		}
	}
}
