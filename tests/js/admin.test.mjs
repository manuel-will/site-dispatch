// Behaviour of assets/admin.js without a browser: the script runs in a vm sandbox with a fake
// document, fake timers and a scripted fetch. Every case drives one poll and checks what the
// script showed, whether it kept polling and where it navigated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..', '..' );
const SOURCE = fs.readFileSync( path.join( ROOT, 'assets', 'admin.js' ), 'utf8' );

const CONFIG = {
	ajaxUrl: 'https://example.test/wp-admin/admin-ajax.php',
	pageUrl: 'https://example.test/wp-admin/tools.php?page=site-dispatch',
	nonce: 'nonce-canary',
	interval: 3000,
	maxTime: 120000,
	textWaiting: 'waiting text',
	textFailed: 'failed text',
	textPaused: 'paused text',
};

const settle = () => new Promise( ( resolve ) => setImmediate( resolve ) );

/**
 * Runs admin.js once and returns handles to drive it.
 *
 * @param {object} options config: window.siteDispatchAdmin (null for none); responses: queue of
 *                         fetch outcomes, each { json } or { reject: true }; withButton: bool.
 */
function boot( options = {} ) {
	const responses = options.responses ?? [];
	const requests = [];
	const elements = {};
	const makeElement = () => {
		const listeners = {};
		return {
			textContent: '',
			addEventListener: ( type, handler ) => {
				listeners[ type ] = handler;
			},
			click: () => listeners.click && listeners.click(),
		};
	};
	elements[ 'site-dispatch-enroll-status' ] = makeElement();
	if ( options.withButton !== false ) {
		elements[ 'site-dispatch-check' ] = makeElement();
	}
	let now = 1000;
	let intervalHandler = null;
	let intervalMs = null;
	let cleared = 0;
	const assigned = [];
	const window = {
		siteDispatchAdmin: options.config === undefined ? CONFIG : options.config,
		setInterval: ( handler, ms ) => {
			intervalHandler = handler;
			intervalMs = ms;
			return 7;
		},
		clearInterval: ( id ) => {
			assert.equal( id, 7 );
			cleared++;
			intervalHandler = null;
		},
		fetch: ( url, init ) => {
			requests.push( { url, init } );
			const next = responses.shift();
			if ( ! next ) {
				return new Promise( () => {} );
			}
			if ( next.reject ) {
				return Promise.reject( new Error( 'network' ) );
			}
			return Promise.resolve( { json: () => Promise.resolve( next.json ) } );
		},
		location: { assign: ( url ) => assigned.push( url ) },
	};
	const sandbox = {
		window,
		document: { getElementById: ( id ) => elements[ id ] ?? null },
		Date: { now: () => now },
		URLSearchParams,
	};
	vm.runInNewContext( SOURCE, sandbox, { filename: 'admin.js' } );
	return {
		status: elements[ 'site-dispatch-enroll-status' ],
		button: elements[ 'site-dispatch-check' ],
		requests,
		assigned,
		get polling() {
			return null !== intervalHandler;
		},
		get intervalMs() {
			return intervalMs;
		},
		get cleared() {
			return cleared;
		},
		advance: ( ms ) => {
			now += ms;
		},
		tick: async () => {
			assert.ok( intervalHandler, 'the interval is still armed' );
			intervalHandler();
			await settle();
			await settle();
		},
	};
}

test( 'without the config object the script does nothing', () => {
	const run = boot( { config: null } );
	assert.equal( run.polling, false );
	assert.equal( run.requests.length, 0 );
	assert.equal( run.status.textContent, '' );
} );

test( 'polls admin-ajax with the redeem action, the nonce and same-origin credentials', async () => {
	const run = boot( { responses: [ { json: { status: 'pending' } } ] } );
	assert.equal( run.intervalMs, CONFIG.interval );
	await run.tick();
	assert.equal( run.requests.length, 1 );
	const { url, init } = run.requests[ 0 ];
	assert.equal( url, CONFIG.ajaxUrl );
	assert.equal( init.method, 'POST' );
	assert.equal( init.credentials, 'same-origin' );
	assert.equal( init.body.get( 'action' ), 'site_dispatch_redeem' );
	assert.equal( init.body.get( 'nonce' ), CONFIG.nonce );
	assert.deepEqual( [ ...init.body.keys() ].sort(), [ 'action', 'nonce' ] );
} );

test( 'pending and retry keep polling and show the waiting text', async () => {
	const run = boot( { responses: [ { json: { status: 'pending' } }, { json: { status: 'retry' } } ] } );
	await run.tick();
	assert.equal( run.status.textContent, CONFIG.textWaiting );
	assert.equal( run.polling, true );
	await run.tick();
	assert.equal( run.status.textContent, CONFIG.textWaiting );
	assert.equal( run.polling, true );
	assert.equal( run.requests.length, 2 );
} );

test( 'connected stops polling and reloads the plugin page', async () => {
	const run = boot( { responses: [ { json: { status: 'connected' } } ] } );
	await run.tick();
	assert.equal( run.cleared, 1 );
	assert.equal( run.polling, false );
	assert.deepEqual( run.assigned, [ CONFIG.pageUrl ] );
} );

test( 'any other status stops polling and shows the failed text', async () => {
	const run = boot( { responses: [ { json: { status: 'failed' } } ] } );
	await run.tick();
	assert.equal( run.cleared, 1 );
	assert.equal( run.polling, false );
	assert.equal( run.status.textContent, CONFIG.textFailed );
	assert.deepEqual( run.assigned, [] );
} );

test( 'a response without a status counts as failure, not as connected', async () => {
	const run = boot( { responses: [ { json: {} } ] } );
	await run.tick();
	assert.equal( run.polling, false );
	assert.equal( run.status.textContent, CONFIG.textFailed );
	assert.deepEqual( run.assigned, [] );
} );

test( 'a network error shows the waiting text and keeps polling', async () => {
	const run = boot( { responses: [ { reject: true } ] } );
	await run.tick();
	assert.equal( run.status.textContent, CONFIG.textWaiting );
	assert.equal( run.polling, true );
} );

test( 'after maxTime the script stops without another request and shows the paused text', async () => {
	const run = boot( { responses: [ { json: { status: 'pending' } } ] } );
	await run.tick();
	assert.equal( run.requests.length, 1 );
	run.advance( CONFIG.maxTime + 1 );
	await run.tick();
	assert.equal( run.requests.length, 1 );
	assert.equal( run.polling, false );
	assert.equal( run.status.textContent, CONFIG.textPaused );
} );

test( 'the check button triggers a poll immediately', async () => {
	const run = boot( { responses: [ { json: { status: 'pending' } } ] } );
	run.button.click();
	await settle();
	assert.equal( run.requests.length, 1 );
	assert.equal( run.status.textContent, CONFIG.textWaiting );
} );

test( 'a page without the button still polls', async () => {
	const run = boot( { withButton: false, responses: [ { json: { status: 'pending' } } ] } );
	await run.tick();
	assert.equal( run.requests.length, 1 );
} );

test( 'server text is written as text, never as HTML', async () => {
	const run = boot( { responses: [ { json: { status: 'failed', message: '<img src=x onerror=alert(1)>' } } ] } );
	await run.tick();
	assert.equal( run.status.textContent, CONFIG.textFailed );
	assert.equal( run.status.innerHTML, undefined );
	assert.ok( ! /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function/.test( SOURCE ) );
} );
