import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { zipList, zipStore } from '../../tools/lib/zip.mjs';
import { makeKeyPair, readArmored, sshsigBlob, verifyRaw } from '../../tools/lib/sshsig.mjs';
import { buildRelease, filesFromCommit, filesFromFolder, manifestBytes, readMain, setVersion } from '../../tools/lib/release.mjs';
import { testFiles, testRelease } from '../../tools/build-test-zip.mjs';
import { ROOT, SSH_KEYGEN, armor, makeRepo, removeFolder } from './helpers.mjs';

const entries = () => [
	{ name: 'site-dispatch/site-dispatch.php', data: Buffer.from( '<?php\n// main\n' ) },
	{ name: 'site-dispatch/includes/verify.php', data: Buffer.from( '<?php\n// verify\n' ) },
	{ name: 'site-dispatch/LICENSE', data: Buffer.from( 'text with ö and ß\n', 'utf8' ) },
	{ name: 'site-dispatch/assets/empty.js', data: Buffer.alloc( 0 ) },
];

test( 'zip: the same entries give the same bytes', () => {
	assert.ok( zipStore( entries() ).equals( zipStore( entries() ) ) );
} );

test( 'zip: the order of the input does not matter', () => {
	assert.ok( zipStore( entries() ).equals( zipStore( entries().reverse() ) ) );
} );

test( 'zip: every entry is stored with its bytes, without compression, with the fixed date', () => {
	const list = zipList( zipStore( entries() ) );
	const names = entries().map( ( entry ) => entry.name ).sort();
	assert.deepEqual( list.map( ( entry ) => entry.name ), names );
	for ( const entry of entries() ) {
		const found = list.find( ( item ) => item.name === entry.name );
		assert.ok( found.data.equals( entry.data ), entry.name );
		assert.equal( found.method, 0 );
		assert.equal( found.time, 0 );
		assert.equal( found.date, 33 );
	}
} );

test( 'zip: one changed byte changes the archive', () => {
	const changed = entries();
	changed[ 0 ].data = Buffer.from( '<?php\n// maim\n' );
	assert.ok( ! zipStore( entries() ).equals( zipStore( changed ) ) );
} );

test( 'sshsig: the blob equals the vector of PROTOCOL.md', () => {
	const manifest = fs.readFileSync( path.join( ROOT, 'tests', 'vectors', 'manifest.json' ) );
	const expected =
		'535348534947' +
		'00000014736974652d64697370617463682d757064617465' +
		'00000000' +
		'00000006736861353132' +
		'0000004030ec898be6a6fa822f22053b62001701b367c643527a5a0dfcf738ff51e273d4' +
		'028cfdc226086b0cb6adf7956502b14c2419e326a914e8ef7917db874445b542';
	const blob = sshsigBlob( manifest );
	assert.equal( blob.length, 112 );
	assert.equal( blob.toString( 'hex' ), expected );
} );

test( 'sshsig: the vector verifies, and not for another namespace or a flipped bit', () => {
	const folder = path.join( ROOT, 'tests', 'vectors' );
	const manifest = fs.readFileSync( path.join( folder, 'manifest.json' ) );
	const signature = fs.readFileSync( path.join( folder, 'manifest.json.sig' ) );
	const key = Buffer.from( fs.readFileSync( path.join( folder, 'manifest-pubkey.b64' ), 'utf8' ).trim(), 'base64' );
	assert.equal( verifyRaw( manifest, signature, [ key ] ), true );
	assert.equal( verifyRaw( manifest, signature, [ key ], 'git' ), false );
	const flipped = Buffer.from( manifest );
	flipped[ 0 ] ^= 1;
	assert.equal( verifyRaw( flipped, signature, [ key ] ), false );
	assert.equal( verifyRaw( manifest, signature.subarray( 0, 63 ), [ key ] ), false );
	assert.equal( verifyRaw( manifest, signature, [] ), false );
	assert.equal( verifyRaw( manifest, signature, [ key, key.subarray( 1 ) ] ), false );
} );

test( 'sshsig: an armored file is read back', () => {
	const pair = makeKeyPair();
	const manifest = Buffer.from( '{"x":1}' );
	const read = readArmored( armor( { publicRaw: pair.publicRaw, signature: pair.sign( manifest ) } ) );
	assert.equal( read.namespace, 'site-dispatch-update' );
	assert.ok( read.publicRaw.equals( pair.publicRaw ) );
	assert.equal( verifyRaw( manifest, read.signature, [ pair.publicRaw ] ), true );
} );

test( 'sshsig: damaged or foreign files are refused', () => {
	const pair = makeKeyPair();
	const good = armor( { publicRaw: pair.publicRaw, signature: pair.sign( Buffer.from( 'x' ) ) } );
	assert.throws( () => readArmored( 'no signature' ), /Not an armored/ );
	assert.throws( () => readArmored( good.replace( 'BEGIN SSH', 'BEGIN PGP' ) ), /Not an armored/ );
	assert.throws( () => readArmored( good.replace( /\n[A-Za-z0-9+/=]{1,70}\n-----END/, '\n-----END' ) ), /cut off|left over|Not an/ );
	assert.throws( () => readArmored( armor( { publicRaw: pair.publicRaw, signature: Buffer.alloc( 63 ) } ) ), /Not an Ed25519/ );
	assert.throws( () => readArmored( armor( { publicRaw: pair.publicRaw, signature: Buffer.alloc( 64 ), type: 'ssh-rsa' } ) ), /Not an Ed25519/ );
} );

test( 'sshsig: what OpenSSH writes is read and verifies', { skip: ! fs.existsSync( SSH_KEYGEN ) && 'Windows OpenSSH is not installed' }, () => {
	// The key lives in a temp folder outside of the repository and is deleted at the end.
	const folder = fs.mkdtempSync( path.join( os.tmpdir(), 'site-dispatch-sign-' ) );
	try {
		const key = path.join( folder, 'throwaway' );
		const file = path.join( folder, 'manifest.json' );
		const manifest = manifestBytes( { version: '1.2.3', zipHash: 'ab'.repeat( 64 ), requiresWp: '6.4', requiresPhp: '7.4' } );
		fs.writeFileSync( file, manifest );
		execFileSync( SSH_KEYGEN, [ '-q', '-t', 'ed25519', '-N', '', '-C', 'throwaway', '-f', key ], { stdio: 'ignore' } );
		execFileSync( SSH_KEYGEN, [ '-Y', 'sign', '-f', key, '-n', 'site-dispatch-update', file ], { stdio: 'ignore' } );
		const publicRaw = Buffer.from( fs.readFileSync( key + '.pub', 'utf8' ).split( ' ' )[ 1 ], 'base64' ).subarray( -32 );
		const read = readArmored( fs.readFileSync( file + '.sig', 'utf8' ) );
		assert.equal( read.namespace, 'site-dispatch-update' );
		assert.ok( read.publicRaw.equals( publicRaw ) );
		assert.equal( read.signature.length, 64 );
		assert.equal( verifyRaw( manifest, read.signature, [ publicRaw ] ), true );
		assert.equal( verifyRaw( manifest, read.signature, [ makeKeyPair().publicRaw ] ), false );

		fs.rmSync( file + '.sig' );
		execFileSync( SSH_KEYGEN, [ '-Y', 'sign', '-f', key, '-n', 'git', file ], { stdio: 'ignore' } );
		const other = readArmored( fs.readFileSync( file + '.sig', 'utf8' ) );
		assert.equal( other.namespace, 'git' );
		assert.equal( verifyRaw( manifest, other.signature, [ publicRaw ] ), false );
	} finally {
		removeFolder( folder );
	}
} );

test( 'release: the commit gives the same file set as the folder, nothing from tests, tools or docs', () => {
	const repo = makeRepo();
	try {
		const fromCommit = filesFromCommit( repo );
		const fromFolder = filesFromFolder( ROOT );
		assert.deepEqual( fromCommit.map( ( file ) => file.name ), fromFolder.map( ( file ) => file.name ) );
		for ( const file of fromCommit ) {
			assert.ok( ! /^(tests|tools|docs|\.git)/.test( file.name ), file.name );
			const twin = fromFolder.find( ( entry ) => entry.name === file.name );
			assert.ok( twin.data.equals( file.data ), file.name + ' differs between commit and folder (line endings?)' );
		}
		assert.ok( fromCommit.some( ( file ) => 'includes/updater.php' === file.name ) );
		assert.ok( fromCommit.some( ( file ) => 'site-dispatch.php' === file.name ) );
	} finally {
		removeFolder( repo );
	}
} );

test( 'release: the manifest has the seven fields, no line break, and the plugin takes it', () => {
	const release = buildRelease( filesFromFolder( ROOT ) );
	const text = release.manifest.toString( 'utf8' );
	assert.ok( ! text.endsWith( '\n' ) );
	assert.deepEqual( Object.keys( JSON.parse( text ) ), [ 'schema', 'slug', 'version', 'zip', 'sha512', 'requires_wp', 'requires_php' ] );
	const folder = fs.mkdtempSync( path.join( os.tmpdir(), 'site-dispatch-manifest-' ) );
	try {
		const file = path.join( folder, 'manifest.json' );
		fs.writeFileSync( file, release.manifest );
		const code =
			'require $argv[1]; $m = site_dispatch_parse_manifest( (string) file_get_contents( $argv[2] ) );' +
			'echo null === $m ? "refused" : $m["version"] . " " . $m["zip"];';
		const out = execFileSync( 'php', [ '-r', code, path.join( ROOT, 'includes', 'verify.php' ), file ] ).toString( 'utf8' );
		assert.equal( out, release.version + ' site-dispatch-' + release.version + '.zip' );
	} finally {
		removeFolder( folder );
	}
} );

test( 'release: version is read from header and constant, and both have to agree', () => {
	const main = fs.readFileSync( path.join( ROOT, 'site-dispatch.php' ), 'utf8' );
	const read = readMain( main );
	assert.match( read.version, /^[0-9]+\.[0-9]+\.[0-9]+$/ );
	assert.equal( read.requiresWp, '6.4' );
	assert.equal( read.requiresPhp, '7.4' );
	assert.equal( readMain( setVersion( main, '9.8.7' ) ).version, '9.8.7' );
	assert.throws( () => readMain( main.replace( "const SITE_DISPATCH_VERSION = '" + read.version, "const SITE_DISPATCH_VERSION = '9.9.9" ) ), /differ/ );
	assert.throws( () => readMain( setVersion( main, '1.2' ) ), /x\.y\.z/ );
} );

test( 'test build: same keys give the same release, and only three files differ from the source', () => {
	const keys = [ makeKeyPair(), makeKeyPair() ];
	const first = testFiles( ROOT, { version: '0.1.1', keys } );
	const second = testFiles( ROOT, { version: '0.1.1', keys } );
	assert.ok( testRelease( first, keys[ 0 ] ).zip.equals( testRelease( second, keys[ 0 ] ).zip ) );

	const source = filesFromFolder( ROOT );
	const differing = first.filter( ( file ) => ! source.find( ( entry ) => entry.name === file.name ).data.equals( file.data ) );
	assert.deepEqual( differing.map( ( file ) => file.name ), [ 'includes/keys.php', 'includes/source.php', 'site-dispatch.php' ] );
	assert.equal( first.length, source.length );

	const main = first.find( ( file ) => 'site-dispatch.php' === file.name ).data.toString( 'utf8' );
	assert.equal( readMain( main ).version, '0.1.1' );
	const keysText = first.find( ( file ) => 'includes/keys.php' === file.name ).data.toString( 'utf8' );
	assert.ok( keysText.includes( keys[ 0 ].publicBase64 ) && keysText.includes( keys[ 1 ].publicBase64 ) );
	const sourceText = first.find( ( file ) => 'includes/source.php' === file.name ).data.toString( 'utf8' );
	assert.ok( sourceText.includes( "'https://github.example.test/manuel-will/site-dispatch'" ) );
} );

test( 'test build: the release verifies with its own key and carries the hash of its zip', () => {
	const keys = [ makeKeyPair(), makeKeyPair() ];
	const release = testRelease( testFiles( ROOT, { version: '0.1.1', keys } ), keys[ 1 ] );
	assert.equal( release.signature.length, 64 );
	assert.equal( verifyRaw( release.manifest, release.signature, [ keys[ 0 ].publicRaw, keys[ 1 ].publicRaw ] ), true );
	assert.equal( verifyRaw( release.manifest, release.signature, [ keys[ 0 ].publicRaw ] ), false );
	const names = zipList( release.zip ).map( ( entry ) => entry.name );
	assert.ok( names.every( ( name ) => name.startsWith( 'site-dispatch/' ) ) );
	assert.ok( names.includes( 'site-dispatch/site-dispatch.php' ) );
} );
