// ZIP writer for releases: stored entries only (no compression), one fixed time stamp, entries
// sorted by name. The same files give the same bytes on every machine and with every Node version.
import zlib from 'node:zlib';

const DOS_TIME = 0;
const DOS_DATE = ( 0 << 9 ) | ( 1 << 5 ) | 1; // 1980-01-01
const UTF8_NAMES = 0x0800;

function compareBytes( left, right ) {
	return Buffer.compare( Buffer.from( left.name, 'utf8' ), Buffer.from( right.name, 'utf8' ) );
}

// entries: [ { name: 'folder/file', data: Buffer } ]. With keepOrder the given order is written,
// that is for tests that need a malformed archive.
export function zipStore( entries, { keepOrder = false } = {} ) {
	const list = keepOrder ? [ ...entries ] : [ ...entries ].sort( compareBytes );
	const locals = [];
	const central = [];
	let offset = 0;
	for ( const entry of list ) {
		const name = Buffer.from( entry.name, 'utf8' );
		const data = entry.data;
		const crc = zlib.crc32( data );

		const local = Buffer.alloc( 30 );
		local.writeUInt32LE( 0x04034b50, 0 );
		local.writeUInt16LE( 20, 4 );
		local.writeUInt16LE( UTF8_NAMES, 6 );
		local.writeUInt16LE( 0, 8 );
		local.writeUInt16LE( DOS_TIME, 10 );
		local.writeUInt16LE( DOS_DATE, 12 );
		local.writeUInt32LE( crc, 14 );
		local.writeUInt32LE( data.length, 18 );
		local.writeUInt32LE( data.length, 22 );
		local.writeUInt16LE( name.length, 26 );
		local.writeUInt16LE( 0, 28 );
		locals.push( local, name, data );

		const head = Buffer.alloc( 46 );
		head.writeUInt32LE( 0x02014b50, 0 );
		head.writeUInt16LE( 20, 4 );
		head.writeUInt16LE( 20, 6 );
		head.writeUInt16LE( UTF8_NAMES, 8 );
		head.writeUInt16LE( 0, 10 );
		head.writeUInt16LE( DOS_TIME, 12 );
		head.writeUInt16LE( DOS_DATE, 14 );
		head.writeUInt32LE( crc, 16 );
		head.writeUInt32LE( data.length, 20 );
		head.writeUInt32LE( data.length, 24 );
		head.writeUInt16LE( name.length, 28 );
		head.writeUInt32LE( offset, 42 );
		central.push( head, name );
		offset += 30 + name.length + data.length;
	}
	const centralBytes = Buffer.concat( central );
	const end = Buffer.alloc( 22 );
	end.writeUInt32LE( 0x06054b50, 0 );
	end.writeUInt16LE( list.length, 8 );
	end.writeUInt16LE( list.length, 10 );
	end.writeUInt32LE( centralBytes.length, 12 );
	end.writeUInt32LE( offset, 16 );
	return Buffer.concat( [ ...locals, centralBytes, end ] );
}

// Reads the central directory of a ZIP written by zipStore. For checks, not a general reader.
export function zipList( bytes ) {
	const end = bytes.length - 22;
	if ( end < 0 || 0x06054b50 !== bytes.readUInt32LE( end ) ) {
		throw new Error( 'Not a ZIP without comment.' );
	}
	const count = bytes.readUInt16LE( end + 10 );
	let at = bytes.readUInt32LE( end + 16 );
	const entries = [];
	for ( let i = 0; i < count; i++ ) {
		if ( 0x02014b50 !== bytes.readUInt32LE( at ) ) {
			throw new Error( 'Broken central directory.' );
		}
		const size = bytes.readUInt32LE( at + 24 );
		const nameLength = bytes.readUInt16LE( at + 28 );
		const extra = bytes.readUInt16LE( at + 30 ) + bytes.readUInt16LE( at + 32 );
		const local = bytes.readUInt32LE( at + 42 );
		const name = bytes.subarray( at + 46, at + 46 + nameLength ).toString( 'utf8' );
		const dataAt = local + 30 + bytes.readUInt16LE( local + 26 ) + bytes.readUInt16LE( local + 28 );
		entries.push( {
			name,
			data: Buffer.from( bytes.subarray( dataAt, dataAt + size ) ),
			method: bytes.readUInt16LE( at + 10 ),
			time: bytes.readUInt16LE( at + 12 ),
			date: bytes.readUInt16LE( at + 14 ),
		} );
		at += 46 + nameLength + extra;
	}
	return entries;
}
