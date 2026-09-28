// Starts the fake server and a Playground site with the plugin and keeps both running, so the
// admin page can be looked at in a browser. Local only, canary values only.
//
//   npm run playground
//
// Enter approves the open enrollment (what the operator does in the approval form of a real
// server). Ctrl+C stops everything.
import readline from 'node:readline';
import { startFake } from './fake-server.mjs';
import { startSite, SERVER_HOST } from './harness.mjs';

const fake = await startFake();
const site = await startSite( { fake, defines: { SITE_DISPATCH_TEST_AUTOLOGIN: '1' } } );

console.log( '' );
console.log( 'Admin page:  ' + site.url + '/wp-admin/tools.php?page=site-dispatch' );
console.log( 'Host to type into the form:  ' + SERVER_HOST );
console.log( 'The approval link on the page does not exist, it points to the made up test host.' );
console.log( '' );
console.log( 'Enter   approve the open enrollment' );
console.log( 'r       send a report now' );
console.log( 'Ctrl+C  stop' );
console.log( '' );

const input = readline.createInterface( { input: process.stdin } );
input.on( 'line', async ( line ) => {
	if ( 'r' === line.trim() ) {
		await site.php( `do_action( 'site_dispatch_daily' ); return true;` );
		console.log( 'Report triggered. The fake server has seen ' + fake.to( '/webhook/plugin-report' ).length + ' so far.' );
		return;
	}
	fake.approve();
	console.log( 'Approved. The page collects the key at its next check.' );
} );

// Without a terminal nobody can press Enter. Then every enrollment is approved after 10 seconds.
if ( ! process.stdin.isTTY || process.env.SITE_DISPATCH_AUTO_APPROVE ) {
	console.log( 'No terminal input: an open enrollment is approved by itself after 10 seconds.' );
	let seen = 0;
	setInterval( () => {
		const count = fake.to( '/webhook/site-dispatch-enroll-request' ).length;
		if ( count > seen ) {
			seen = count;
			setTimeout( () => {
				fake.approve();
				console.log( 'Approved by itself.' );
			}, 10000 );
		}
	}, 500 );
}

let stopping = false;
async function stop() {
	if ( stopping ) {
		return;
	}
	stopping = true;
	input.close();
	await site.stop();
	await fake.stop();
	process.exit( 0 );
}
process.on( 'SIGINT', stop );
process.on( 'SIGTERM', stop );
