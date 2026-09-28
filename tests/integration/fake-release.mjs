// Fake of the release host and its asset host, and on request of api.wordpress.org. Listens on
// 127.0.0.1 only and records every request. The test reroute names the host in X-Test-Host.
import http from 'node:http';

export const RELEASE_HOST = 'github.example.test';
export const ASSET_HOST = 'assets.example.test';
export const REPO_PATH = '/manuel-will/site-dispatch';

export async function startRelease() {
	const release = {
		requests: [],
		port: 0,
		reset() {
			this.requests = [];
			this.manifest = null;
			this.signature = null;
			this.version = null;
			this.zipName = null;
			this.zip = null;
			// Faults a test can switch on.
			this.down = false; // no answer at all
			this.status = null; // this status for every request to the release host
			this.extraHops = 0; // more redirects on the asset host
			this.redirectTo = null; // ( file ) => address, replaces the redirect to the asset host
			this.wporg = null; // body for the update check of wordpress.org
		},
		// Puts a release in place, as "latest" and under its tag.
		publish( { manifest, signature, zip, zipName, version } ) {
			this.manifest = manifest;
			this.signature = signature;
			this.zip = zip;
			this.zipName = zipName;
			this.version = version;
		},
		remove() {
			this.manifest = null;
			this.signature = null;
			this.zip = null;
			this.zipName = null;
			this.version = null;
		},
		to( host, part = '' ) {
			return this.requests.filter( ( request ) => request.host === host && request.path.includes( part ) );
		},
		stop() {
			return new Promise( ( resolve ) => server.close( resolve ) );
		},
	};
	release.reset();

	const redirect = ( location ) => ( { status: 302, headers: { Location: location }, body: '' } );
	const bytes = ( body ) => ( { status: 200, headers: { 'Content-Type': 'application/octet-stream' }, body } );
	const missing = { status: 404, headers: {}, body: 'Not Found' };

	function asset( file ) {
		if ( 'manifest.json' === file ) {
			return release.manifest;
		}
		if ( 'manifest.json.sig' === file ) {
			return release.signature;
		}
		return file === release.zipName ? release.zip : null;
	}

	function toAsset( file ) {
		if ( null === asset( file ) ) {
			return missing;
		}
		if ( release.redirectTo ) {
			return redirect( release.redirectTo( file ) );
		}
		const hops = release.extraHops > 0 ? '/hop/' + release.extraHops : '';
		return redirect( 'https://' + ASSET_HOST + hops + '/asset/' + file );
	}

	function answer( request ) {
		if ( 'api.wordpress.org' === request.host ) {
			const asked = request.path.startsWith( '/plugins/update-check/' ) && null !== release.wporg;
			return asked ? { status: 200, headers: { 'Content-Type': 'application/json' }, body: release.wporg } : missing;
		}
		if ( RELEASE_HOST === request.host ) {
			if ( null !== release.status ) {
				return { status: release.status, headers: {}, body: 'fault' };
			}
			const latest = REPO_PATH + '/releases/latest/download/';
			const tagged = REPO_PATH + '/releases/download/v' + release.version + '/';
			if ( request.path.startsWith( latest ) ) {
				return toAsset( request.path.slice( latest.length ) );
			}
			if ( null !== release.version && request.path.startsWith( tagged ) && request.path.slice( tagged.length ) === release.zipName ) {
				return toAsset( release.zipName );
			}
			return missing;
		}
		if ( ASSET_HOST === request.host ) {
			const hop = /^\/hop\/([0-9]+)(\/asset\/.+)$/.exec( request.path );
			if ( hop ) {
				const left = Number( hop[ 1 ] ) - 1;
				return redirect( 'https://' + ASSET_HOST + ( left > 0 ? '/hop/' + left : '' ) + hop[ 2 ] );
			}
			const file = request.path.startsWith( '/asset/' ) ? asset( request.path.slice( 7 ) ) : null;
			return null === file ? missing : bytes( file );
		}
		return missing;
	}

	const server = http.createServer( ( req, res ) => {
		const chunks = [];
		req.on( 'data', ( chunk ) => chunks.push( chunk ) );
		req.on( 'end', () => {
			let args = null;
			try {
				args = JSON.parse( req.headers[ 'x-test-args' ] ?? 'null' );
			} catch {
				args = null;
			}
			const request = {
				method: req.method,
				host: req.headers[ 'x-test-host' ] ?? null,
				path: req.url,
				body: Buffer.concat( chunks ),
				args,
			};
			release.requests.push( request );
			if ( release.down ) {
				req.socket.destroy();
				return;
			}
			const reply = answer( request );
			res.writeHead( reply.status, reply.headers );
			res.end( reply.body );
		} );
	} );

	await new Promise( ( resolve ) => server.listen( 0, '127.0.0.1', resolve ) );
	release.port = server.address().port;
	return release;
}
