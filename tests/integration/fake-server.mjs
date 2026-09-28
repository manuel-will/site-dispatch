// Fake of the three server endpoints. Listens on 127.0.0.1 only and records every request.
// All key shaped values are the canary values of PROTOCOL.md, never anything real.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const vector = JSON.parse( fs.readFileSync( path.join( here, '..', 'vectors', 'report-hmac.json' ), 'utf8' ) );

export const CANARY_SITE_KEY = vector.site_key;
export const CANARY_WEBSITE_ID = vector.website_id;
export const REQUEST_ID = '00000000-0000-4000-8000-0000000000aa';
export const USER_CODE = 'ABCDEFGH';

const json = ( status, data ) => ( { status, body: JSON.stringify( data ) } );

export async function startFake() {
	const fake = {
		requests: [],
		port: 0,
		reset() {
			this.requests = [];
			this.reportAnswer = json( 200, { ok: true } );
			this.requestAnswer = null;
			this.redeemAnswer = null;
			this.keyVersion = 1;
			this.secretHash = null;
			this.approved = false;
			this.expired = false;
		},
		approve() {
			this.approved = true;
		},
		expire() {
			this.expired = true;
		},
		to( route ) {
			return this.requests.filter( ( request ) => request.path === route );
		},
		stop() {
			return new Promise( ( resolve ) => server.close( resolve ) );
		},
	};
	fake.reset();

	function answer( request ) {
		let data = null;
		try {
			data = JSON.parse( request.body.toString( 'utf8' ) );
		} catch {
			data = null;
		}
		if ( '/webhook/plugin-report' === request.path ) {
			return fake.reportAnswer;
		}
		if ( '/webhook/site-dispatch-enroll-request' === request.path ) {
			if ( data && 'string' === typeof data.secret_hash ) {
				fake.secretHash = data.secret_hash;
				fake.approved = false;
				fake.expired = false;
			}
			return fake.requestAnswer ?? json( 200, { ok: true, request_id: REQUEST_ID, user_code: USER_CODE } );
		}
		if ( '/webhook/site-dispatch-enroll-redeem' === request.path ) {
			const sent = data && 'string' === typeof data.secret ? data.secret : '';
			const hash = crypto.createHash( 'sha256' ).update( sent, 'utf8' ).digest( 'hex' );
			if ( fake.expired || ! data || data.request_id !== REQUEST_ID || hash !== fake.secretHash ) {
				return json( 401, { ok: false } );
			}
			if ( fake.redeemAnswer ) {
				return fake.redeemAnswer;
			}
			if ( ! fake.approved ) {
				return json( 202, { ok: false, pending: true } );
			}
			fake.secretHash = null;
			return json( 200, {
				ok: true,
				site_key: CANARY_SITE_KEY,
				key_version: fake.keyVersion,
				website_id: CANARY_WEBSITE_ID,
			} );
		}
		return json( 404, { ok: false } );
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
				path: req.url,
				headers: req.headers,
				body: Buffer.concat( chunks ),
				args,
			};
			fake.requests.push( request );
			const reply = answer( request );
			res.writeHead( reply.status, { 'Content-Type': reply.type ?? 'application/json' } );
			res.end( reply.body );
		} );
	} );

	await new Promise( ( resolve ) => server.listen( 0, '127.0.0.1', resolve ) );
	fake.port = server.address().port;
	return fake;
}
