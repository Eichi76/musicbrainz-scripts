import fs from 'fs';
import path from 'path';
import extractComments from 'extract-comments';

import { buildBookmarklets } from './buildBookmarklets.js';
import { buildUserscripts } from './buildUserscripts.js';
import { getMarkdownFiles } from './getFiles.js'
import { sourceAndInstallButton } from './github.js';
import { camelToTitleCase } from '../utils/string/casingStyle.js';

async function build({
	bookmarkletBasePath = 'src/bookmarklets',
	userscriptBasePath = 'src/userscripts',
	readmePath = 'README.md',
	docBasePath = 'doc',
	debug = false,
} = {}) {
	// build userscript
	const userscriptNames = await buildUserscripts(userscriptBasePath, debug);

	// prepare bookmarklets
	const bookmarklets = await buildBookmarklets(bookmarkletBasePath, debug);

	// prepare README file and write header
	const readme = fs.createWriteStream(readmePath);
	const readmeHeader = fs.readFileSync(path.join(docBasePath, '_header.md'), { encoding: 'utf-8' });
	readme.write(readmeHeader);

	// write userscripts and their extracted documentation to the README
	readme.write('\n## Userscripts\n');

	for (let baseName of userscriptNames) {
		readme.write(`\n### ${camelToTitleCase(baseName)}\n`);
		readme.write(sourceAndInstallButton(baseName));

		// also insert the code snippet if there is a bookmarklet of the same name
		const bookmarkletFileName = baseName + '.js';
		if (bookmarkletFileName in bookmarklets) {
			const bookmarkletPath = path.join(bookmarkletBasePath, bookmarkletFileName);

			readme.write('\n```js\n' + bookmarklets[bookmarkletFileName] + '\n```\n');
			readme.write(extractDocumentation(bookmarkletPath) + '\n');

			delete bookmarklets[bookmarkletFileName];
		}
	}

	// write remaining bookmarklets and their extracted documentation to the README
	readme.write('\n## Bookmarklets\n');

	for (let fileName in bookmarklets) {
		const baseName = path.basename(fileName, '.js');
		const bookmarkletPath = path.join(bookmarkletBasePath, fileName);

		readme.write(`\n### [${camelToTitleCase(baseName)}](${relevantSourceFile(fileName, bookmarkletBasePath)})\n`);

		readme.write('\n```js\n' + bookmarklets[fileName] + '\n```\n');
		readme.write(extractDocumentation(bookmarkletPath) + '\n');
	}

	// append all additional documentation files to the README
	const docs = await getMarkdownFiles(docBasePath);

	docs.map((file) => path.join(docBasePath, file)).forEach((filePath) => {
		const content = fs.readFileSync(filePath, { encoding: 'utf-8' });
		readme.write('\n' + content);
	});

	readme.close();
}


/**
 * Extract the first documentation block comment from the given JavaScript module.
 * @param {string} scriptPath Path to the script file.
 * @returns {string}
 */
function extractDocumentation(scriptPath) {
	const fileContents = fs.readFileSync(scriptPath, { encoding: 'utf-8' });
	const comments = extractComments(fileContents, { first: true, line: false });
	return comments.length ? comments[0].value : '';
}


/**
 * Returns the path to the relevant source code file for the given script.
 * This is the module of the same name inside the source directory if it exists, otherwise it is the file itself.
 * @param {string} fileName File name of the script.
 * @param {string} basePath Base path of the script file which is used as fallback.
 */
function relevantSourceFile(fileName, basePath) {
	const srcPath = path.posix.join('src', fileName);
	return fs.existsSync(srcPath) ? srcPath : path.posix.join(basePath, fileName);
}


build({ debug: process.argv.includes('-d') });
