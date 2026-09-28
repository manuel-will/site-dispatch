// SSHSIG as PROTOCOL.md describes it: the signed blob, reading the armored file that
// "ssh-keygen -Y sign" writes, verifying a raw Ed25519 signature. No private key is read here.
import crypto from 'node:crypto';

export const NAMESPACE = 'site-dispatch-update';
const SPKI_ED25519 = Buffer.from( '302a300506032b6570032100', 'hex' );

function sshString( bytes ) {
	const length = Buffer.alloc( 4 );
	length.writeUInt32BE( bytes.length, 0 );
	return Buffer.concat( [ length, bytes ] );
}

export function sshsigBlob( message, namespace = NAMESPACE ) {
	return Buffer.concat( [
		Buffer.from( 'SSHSIG', 'ascii' ),
		sshString( Buffer.from( namespace, 'utf8' ) ),
		sshString( Buffer.alloc( 0 ) ),
		sshString( Buffer.from( 'sha512', 'ascii' ) ),
		sshString( crypto.createHash( 'sha512' ).update( message ).digest() ),
	] );
}

export function verifyRaw( message, signature, rawKeys, namespace = NAMESPACE ) {
	if ( ! Buffer.isBuffer( signature ) || 64 !== signature.length || 0 === rawKeys.length ) {
		return false;
	}
	const blob = sshsigBlob( message, namespace );
	let valid = false;
	for ( const raw of rawKeys ) {
		if ( ! Buffer.isBuffer( raw ) || 32 !== raw.length ) {
			return false;
		}
		const key = crypto.createPublicKey( { key: Buffer.concat( [ SPKI_ED25519, raw ] ), format: 'der', type: 'spki' } );
		if ( crypto.verify( null, blob, key, signature ) ) {
			valid = true;
		}
	}
	return valid;
}

// A key pair for tests, made at run time. The private half never leaves this closure.
export function makeKeyPair() {
	const { publicKey, privateKey } = crypto.generateKeyPairSync( 'ed25519' );
	const publicRaw = Buffer.from( publicKey.export( { format: 'der', type: 'spki' } ).subarray( SPKI_ED25519.length ) );
	return {
		publicRaw,
		publicBase64: publicRaw.toString( 'base64' ),
		sign: ( message, namespace = NAMESPACE ) => crypto.sign( null, sshsigBlob( message, namespace ), privateKey ),
	};
}

function reader( bytes ) {
	let at = 0;
	return {
		take( count ) {
			if ( at + count > bytes.length ) {
				throw new Error( 'Signature file is cut off.' );
			}
			const part = bytes.subarray( at, at + count );
			at += count;
			return part;
		},
		string() {
			return this.take( this.take( 4 ).readUInt32BE( 0 ) );
		},
		done() {
			return at === bytes.length;
		},
	};
}

// Reads the armored file. Throws a fixed text on anything unexpected.
export function readArmored( text ) {
	const match = /^-----BEGIN SSH SIGNATURE-----\r?\n([A-Za-z0-9+/=\r\n]+)-----END SSH SIGNATURE-----\s*$/.exec( text );
	if ( ! match ) {
		throw new Error( 'Not an armored SSH signature.' );
	}
	const body = match[ 1 ].replace( /[\r\n]/g, '' );
	const bytes = Buffer.from( body, 'base64' );
	if ( bytes.toString( 'base64' ) !== body ) {
		throw new Error( 'Not an armored SSH signature.' );
	}
	const outer = reader( bytes );
	if ( 'SSHSIG' !== outer.take( 6 ).toString( 'ascii' ) || 1 !== outer.take( 4 ).readUInt32BE( 0 ) ) {
		throw new Error( 'Not an SSHSIG version 1 file.' );
	}
	const keyBlob = reader( outer.string() );
	const namespace = outer.string().toString( 'utf8' );
	const reserved = outer.string();
	const hashAlgorithm = outer.string().toString( 'ascii' );
	const signatureBlob = reader( outer.string() );
	const keyType = keyBlob.string().toString( 'ascii' );
	const publicRaw = Buffer.from( keyBlob.string() );
	const signatureType = signatureBlob.string().toString( 'ascii' );
	const signature = Buffer.from( signatureBlob.string() );
	if ( ! outer.done() || ! keyBlob.done() || ! signatureBlob.done() ) {
		throw new Error( 'Signature file has bytes left over.' );
	}
	if ( 'ssh-ed25519' !== keyType || 'ssh-ed25519' !== signatureType || 32 !== publicRaw.length || 64 !== signature.length ) {
		throw new Error( 'Not an Ed25519 signature.' );
	}
	if ( 0 !== reserved.length || 'sha512' !== hashAlgorithm ) {
		throw new Error( 'Unexpected hash algorithm or reserved field.' );
	}
	return { namespace, publicRaw, signature };
}
