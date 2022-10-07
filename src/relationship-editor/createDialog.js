import { waitFor } from '../../utils/async/polling.js';

/**
 * Creates a dialog to add a relationship to the given source entity.
 * @param {Object} options 
 * @param {CoreEntityT} [options.source] Source entity, defaults to the currently edited entity.
 * @param {CoreEntityT | string} [options.target] Target entity object or name.
 * @param {CoreEntityTypeT} [options.targetType] Target entity type, fallback if there is no full entity given.
 * @param {number} [options.linkTypeId]
 * @param {boolean} [options.batchSelection] Batch-edit all selected entities which have the same type as the source.
 * The source entity only acts as a placeholder in this case.
 */
export async function createDialog({
	source = MB.relationshipEditor.state.entity,
	target,
	targetType,
	linkTypeId,
	batchSelection = false,
} = {}) {
	// prefer an explicit target entity option over only a target type
	if (target && typeof target !== 'string') {
		targetType = target.entityType;
	}

	// open dialog modal for the source entity
	MB.relationshipEditor.dispatch({
		type: 'update-dialog-location',
		location: {
			source,
			batchSelection,
		},
	});

	// TODO: currently it takes ~2ms until `relationshipDialogDispatch` is exposed
	await waitFor(() => !!MB.relationshipEditor.relationshipDialogDispatch, 1);

	if (targetType) {
		MB.relationshipEditor.relationshipDialogDispatch({
			type: 'update-target-type',
			source,
			targetType,
		});
	}

	if (linkTypeId) {
		// the available items are only valid for the current target type
		// TODO: ensure that the items have already been updated after a target type change
		const availableLinkTypes = MB.relationshipEditor.relationshipDialogState.linkType.autocomplete.items;
		const linkTypeItem = availableLinkTypes.find((item) => (item.id == linkTypeId));

		if (linkTypeItem) {
			MB.relationshipEditor.relationshipDialogDispatch({
				type: 'update-link-type',
				source,
				action: {
					type: 'update-autocomplete',
					source,
					action: {
						type: 'select-item',
						item: linkTypeItem,
					},
				},
			});
		}
	}

	if (!target) return;

	/** @type {AutocompleteActionT[]} */
	const autocompleteActions = (typeof target === 'string') ? [{
		type: 'type-value',
		value: target,
	}, {
		type: 'search-after-timeout',
		searchTerm: target,
	}] : [{
		type: 'select-item',
		item: entityToSelectItem(target),
	}];

	// autofill the target entity as good as possible
	autocompleteActions.forEach((autocompleteAction) => {
		MB.relationshipEditor.relationshipDialogDispatch({
			type: 'update-target-entity',
			source,
			action: {
				type: 'update-autocomplete',
				source,
				action: autocompleteAction,
			},
		});
	});
}

/**
 * Resolves after the current/next relationship dialog has been closed.
 * @returns {Promise<RelationshipDialogFinalStateT>} The final state of the dialog when it was closed by the user.
 */
export async function closingDialog() {
	return new Promise((resolve) => {
		// wait for the user to accept or cancel the dialog
		document.addEventListener('mb-close-relationship-dialog', (event) => {
			const finalState = event.dialogState;
			finalState.closeEventType = event.closeEventType;
			resolve(finalState);
		}, { once: true });
	});
}

/** @param {string} creditedAs Credited name of the target entity. */
export function creditTargetAs(creditedAs) {
	MB.relationshipEditor.relationshipDialogDispatch({
		type: 'update-target-entity',
		source,
		action: {
			type: 'update-credit',
			action: {
				type: 'set-credit',
				creditedAs,
			},
		},
	});
}

/**
 * Sets the begin or end date of the current dialog.
 * @param {PartialDateT} date
 */
export function setDate(date, isBegin = true) {
	MB.relationshipEditor.relationshipDialogDispatch({
		type: 'update-date-period',
		action: {
			type: isBegin ? 'update-begin-date' : 'update-end-date',
			action: {
				type: 'set-date',
				date: date,
			},
		},
	});
}

/** @param {DatePeriodRoleT} datePeriod */
export function setDatePeriod(datePeriod) {
	setDate(datePeriod.begin_date, true);
	setDate(datePeriod.end_date, false);

	MB.relationshipEditor.relationshipDialogDispatch({
		type: 'update-date-period',
		action: {
			type: 'set-ended',
			enabled: datePeriod.ended,
		},
	});
}

/** @param {number} year */
export function setYear(year) {
	setDatePeriod({
		begin_date: { year },
		end_date: { year },
		ended: true,
	});
}

/**
 * @param {EntityItemT} entity 
 * @returns {OptionItemT}
 */
function entityToSelectItem(entity) {
	return {
		type: 'option',
		id: entity.id,
		name: entity.name,
		entity,
	};
}

/**
 * @typedef {import('../types/MBS/scripts/autocomplete2.js').EntityItemT}  EntityItemT
 * @typedef {import('../types/MBS/scripts/autocomplete2.js').OptionItemT<EntityItemT>} OptionItemT
 * @typedef {import('../types/MBS/scripts/autocomplete2.js').ActionT<EntityItemT>} AutocompleteActionT
 * @typedef {import('../types/MBS/scripts/relationship-editor/state.js').RelationshipDialogStateT & {closeEventType: 'accept' | 'cancel'}} RelationshipDialogFinalStateT
 */
