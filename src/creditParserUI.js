import { addMessageToEditNote } from './editNote.js';
import { parserDefaults } from './parseCopyrightNotice.js';
import { readyRelationshipEditor } from './reactHydration.js';
import { automaticHeight, automaticWidth } from '@kellnerd/es-utils/dom/autoResize.js';
import { createElement, injectStylesheet } from '@kellnerd/es-utils/dom/create.js';
import { dom, qs, qsa } from '@kellnerd/es-utils/dom/select.js';
import { getPattern, getPatternAsRegExp } from '@kellnerd/es-utils/regex/parse.js';
import { slugify } from '@kellnerd/es-utils/string/casingStyle.js';
import {
	persistCheckbox,
	persistDetails,
	persistInput,
} from '@kellnerd/es-utils/userscript/persistElement.js';

const creditParserUI = `
<details id="credit-parser">
<summary>
	<h2>Credit Parser</h2>
</summary>
<form>
	<details id="credit-parser-config">
		<summary><h3>Advanced configuration</h3></summary>
		<ul id="credit-patterns"></ul>
	</details>
	<div class="row">
		<textarea name="credit-input" id="credit-input" cols="120" rows="1" placeholder="Paste credits here…"></textarea>
	</div>
	<div class="row">
		Identified relationships will be added to the release and/or the matching recordings and works (only if these are selected).
	</div>
	<div class="row">
		<input type="checkbox" name="remove-parsed-lines" id="remove-parsed-lines" />
		<label class="inline" for="remove-parsed-lines">Remove parsed lines</label>
		<input type="checkbox" name="parser-autofocus" id="parser-autofocus" />
		<label class="inline" for="parser-autofocus">Autofocus the parser on page load</label>
	</div>
	<div class="row buttons">
	</div>
</form>
</details>`;

const css = `
details#credit-parser summary {
	cursor: pointer;
	display: block;
}
details#credit-parser summary > h2, details#credit-parser summary > h3 {
	display: list-item;
}
textarea#credit-input {
	overflow-y: hidden;
}
#credit-parser label[title] {
	border-bottom: 1px dotted;
	cursor: help;
}`;

const uiReadyEventType = 'credit-parser-ui-ready';

/**
 * Injects the basic UI of the credit parser and waits until the UI has been expanded before it continues with the build tasks.
 * @param {...(() => void)} buildTasks Handlers which can be registered for additional UI build tasks.
 */
export async function buildCreditParserUI(...buildTasks) {
	await readyRelationshipEditor();

	/** @type {HTMLDetailsElement} */
	const existingUI = dom('credit-parser');

	// possibly called by multiple userscripts, do not inject the UI again
	if (!existingUI) {
		// inject credit parser between the sections for track and release relationships,
		// use the "Release Relationships" heading as orientation since #tracklist is missing for releases without mediums
		qs('.release-relationship-editor > h2:nth-of-type(2)').insertAdjacentHTML('beforebegin', creditParserUI);
		injectStylesheet(css, 'credit-parser');
	}

	// execute all additional build tasks once the UI is open and ready
	if (existingUI && existingUI.open) {
		// our custom event already happened because the UI builder code is synchronous
		buildTasks.forEach((task) => task());
	} else {
		// wait for our custom event if the UI is not (fully) initialized or is collapsed
		buildTasks.forEach((task) => document.addEventListener(uiReadyEventType, () => task(), { once: true }));
	}

	if (existingUI) return;

	// continue initialization of the UI once it has been opened
	persistDetails('credit-parser', true).then((UI) => {
		if (UI.open) {
			initializeUI();
		} else {
			UI.addEventListener('toggle', initializeUI, { once: true });
		}
	});
}

async function initializeUI() {
	const creditInput = dom('credit-input');

	// persist the state of the UI
	persistCheckbox('remove-parsed-lines');
	await persistCheckbox('parser-autofocus');
	persistDetails('credit-parser-config').then((config) => {
		// hidden pattern inputs have a zero width, so they have to be resized if the config has not been open initially
		if (!config.open) {
			config.addEventListener('toggle', () => {
					qsa('input.pattern', config).forEach((input) => automaticWidth.call(input));
				}, { once: true });
		}
	});

	// auto-resize the credit textarea on input
	creditInput.addEventListener('input', automaticHeight);

	// load seeded data from hash
	const seededData = new URLSearchParams(window.location.hash.slice(1));
	const seededCredits = seededData.get('credits');
	if (seededCredits) {
		setTextarea(creditInput, seededCredits);
		const seededEditNote = seededData.get('edit-note');
		if (seededEditNote) {
			addMessageToEditNote(seededEditNote);
		}
	}

	addButton('Load annotation', (creditInput) => {
		/** @type {ReleaseT} */
		const release = MB.getSourceEntityInstance();
		const annotation = release.latest_annotation;
		if (annotation) {
			setTextarea(creditInput, annotation.text);
		}
	});

	addPatternInput({
		label: 'Credit terminator',
		description: 'Matches the end of a credit (default when empty: end of line)',
		defaultValue: parserDefaults.terminatorRE,
	});

	addPatternInput({
		label: 'Credit separator',
		description: 'Splits a credit into role and artist (disabled when empty)',
		defaultValue: /\s[–-]\s|:\s|\t+/,
	});

	addPatternInput({
		label: 'Name separator',
		description: 'Splits the extracted name into multiple names (disabled when empty)',
		defaultValue: parserDefaults.nameSeparatorRE,
	});

	// trigger all additional UI build tasks
	document.dispatchEvent(new CustomEvent(uiReadyEventType));

	// focus the credit parser input (if this setting is enabled)
	if (dom('parser-autofocus').checked) {
		creditInput.scrollIntoView();
		creditInput.focus();
	}
}

/**
 * Adds a new button with the given label and click handler to the credit parser UI.
 * @param {string} label
 * @param {(creditInput: HTMLTextAreaElement, event: MouseEvent) => any} clickHandler
 * @param {string} [description] Description of the button, shown as tooltip.
 */
export function addButton(label, clickHandler, description) {
	/** @type {HTMLTextAreaElement} */
	const creditInput = dom('credit-input');

	/** @type {HTMLButtonElement} */
	const button = createElement(`<button type="button">${label}</button>`);
	if (description) {
		button.title = description;
	}

	button.addEventListener('click', (event) => clickHandler(creditInput, event));

	return qs('#credit-parser .buttons').appendChild(button);
}

/**
 * Adds a new parser button with the given label and handler to the credit parser UI.
 * @param {string} label
 * @param {(creditLine: string, event: MouseEvent) => import('@kellnerd/es-utils').MaybePromise<CreditParserLineStatus>} parser
 * Handler which parses the given credit line and returns whether it was successful.
 * @param {string} [description] Description of the button, shown as tooltip.
 */
export function addParserButton(label, parser, description) {
	/** @type {HTMLInputElement} */
	const removeParsedLines = dom('remove-parsed-lines');

	return addButton(label,	async (creditInput, event) => {
		const parsedLines = [],	skippedLines = [];
			// Check ob CreditInput ein JSON String ist
			if (checkJSON(creditInput.value)) {
				// Wenn im CreditInput ein JSON string steht
				// erzeuge daraus ein Object ...
				const credits = JSON.parse(creditInput.value);
				// durchlaufe alle Credit Objekte
				for (const line of credits) {
					// Übergebe das Credit Object
					const parserStatus = await parser(line, event);
					// Wenn Credit 'done' ist...
					if (parserStatus !== 'skipped') {
						// ...füge den Job + Künstler + Rollennamen als String ins Parsed Array
						parsedLines.push(`${line.linktype}: ${line.name}${
							line.attributesTypes[0]?.text ? ' - ' + line.attributesTypes[0].text : ''
						}`);
					}
					// Wenn Credit übersprungen wurde...
					if (parserStatus !== 'done') {
						// ...füge das Objekt ins Skipped Array
						skippedLines.push(line);
					}
				}
			} else {
				// ...ansonsten führe Kellnerds Code aus
				const credits = creditInput.value.split('\n').map((line) => line.trim());
				const parsedLines = [], skippedLines = [];

				for (const line of credits) {
					// skip empty lines, but keep them for display of skipped lines
					if (!line) {
						skippedLines.push(line);
						continue;
					}
					// treat partially parsed lines as both skipped and parsed
					const parserStatus = await parser(line, event);
					if (parserStatus !== 'skipped') {
						parsedLines.push(line);
					}
					if (parserStatus !== 'done') {
						skippedLines.push(line);
					}
				}

				if (parsedLines.length) {
					addMessageToEditNote(parsedLines.join('\n'));
				}

				if (removeParsedLines.checked) {
					// Wenn es Übersprungene Credozs als Objekte gibt
					if (skippedLines.length && typeof skippedLines[0] === 'object') {
						// ...setze diese Credits als JSON String in Textarea
						setTextarea(creditInput, JSON.stringify(skippedLines));
					} else {
						// ...ansonsten trenne die Textzeile mit Umbruch
						setTextarea(creditInput, skippedLines.join('\n'));
					}
				}
			}
		}, description);
}

/**
 * Adds a persisted input field for regular expressions with a validation handler to the credit parser UI.
 * @param {object} config
 * @param {string} [config.id] ID and name of the input element (derived from `label` if missing).
 * @param {string} config.label Content of the label (without punctuation).
 * @param {string} config.description Description which should be used as tooltip.
 * @param {string} config.defaultValue Default value of the input.
 */
function addPatternInput(config) {
	const id = config.id || slugify(config.label);
	/** @type {HTMLInputElement} */
	const patternInput = createElement(`<input type="text" class="pattern" name="${id}" id="${id}" placeholder="String or /RegExp/" />`);

	const explanationLink = document.createElement('a');
	explanationLink.innerText = 'help';
	explanationLink.target = '_blank';
	explanationLink.title = 'Displays a diagram representation of this RegExp';

	const resetButton = createElement(`<button type="button" title="Reset the input to its default value">Reset</button>`);
	resetButton.addEventListener('click', () => setInput(patternInput, config.defaultValue));

	// auto-resize the pattern input on input
	patternInput.addEventListener('input', automaticWidth);

	// validate pattern and update explanation link on change
	patternInput.addEventListener('change', function () {
		explanationLink.href = 'https://kellnerd.github.io/regexper/#' + encodeURIComponent(getPatternAsRegExp(this.value) ?? this.value);
		this.classList.remove('error', 'success');
		this.title = '';

		try {
			if (getPattern(this.value) instanceof RegExp) {
				this.classList.add('success');
				this.title = 'Valid regular expression';
			}
		} catch (error) {
			this.classList.add('error');
			this.title = `Invalid regular expression: ${error.message}\nThe default value will be used.`;
		}
	});

	// inject label, input, reset button and explanation link
	const container = document.createElement('li');
	container.insertAdjacentHTML('beforeend', `<label for="${id}" title="${config.description}">${config.label}:</label>`);
	container.append(' ', patternInput, ' ', resetButton, ' ', explanationLink);
	dom('credit-patterns').appendChild(container);

	// persist the input and calls the setter for the initial value (persisted value or the default)
	persistInput(patternInput, config.defaultValue).then(setInput);

	return patternInput;
}

/**
 * Sets the input to the given value (optional), resizes it and triggers persister and validation.
 * @param {HTMLInputElement} input
 * @param {string} [value]
 */
function setInput(input, value) {
	if (value) input.value = value;
	automaticWidth.call(input);
	input.dispatchEvent(new Event('change'));
}

/**
 * Sets the textarea to the given value and adjusts the height.
 * @param {HTMLTextAreaElement} textarea
 * @param {string} value
 */
function setTextarea(textarea, value) {
	textarea.value = value;
	automaticHeight.call(textarea);
}

/**
 * @description Check ob ein String ein JSON String ist
 * @author Eichi76
 * @date 2025-04-05
 * @param {string} str
 * @returns {boolean}
 */
function checkJSON(str) {
	try {
		JSON.parse(str);
	} catch (e) {
		return false;
	}
	return true;
}
