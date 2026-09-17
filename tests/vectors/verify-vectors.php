<?php
/**
 * Recomputes every test vector from PROTOCOL.md. No network, no WordPress, no secrets:
 * all keys in this folder are throwaway or canary values.
 *
 * Run: php tests/vectors/verify-vectors.php   (needs the sodium extension)
 */

$dir    = __DIR__ . '/';
$failed = 0;
$check  = static function ( string $name, bool $ok ) use ( &$failed ): void {
	echo ( $ok ? '  ok    ' : '  FAIL  ' ) . $name . "\n";
	$failed += $ok ? 0 : 1;
};
$str    = static function ( string $x ): string {
	return pack( 'N', strlen( $x ) ) . $x;
};
$blob   = static function ( string $message, string $ns ) use ( $str ): string {
	return 'SSHSIG' . $str( $ns ) . $str( '' ) . $str( 'sha512' ) . $str( hash( 'sha512', $message, true ) );
};

// Update: manifest signature.
$manifest = file_get_contents( $dir . 'manifest.json' );
$sig      = file_get_contents( $dir . 'manifest.json.sig' );
$pub      = base64_decode( trim( file_get_contents( $dir . 'manifest-pubkey.b64' ) ), true );

$check( 'signature is 64 bytes, public key is 32 bytes', 64 === strlen( $sig ) && 32 === strlen( $pub ) );
$check( 'manifest verifies in namespace site-dispatch-update', sodium_crypto_sign_verify_detached( $sig, $blob( $manifest, 'site-dispatch-update' ), $pub ) );
$check( 'same signature fails in namespace git', ! sodium_crypto_sign_verify_detached( $sig, $blob( $manifest, 'git' ), $pub ) );
$flipped    = $manifest;
$flipped[0] = chr( ord( $flipped[0] ) ^ 1 );
$check( 'one flipped bit in the manifest fails', ! sodium_crypto_sign_verify_detached( $sig, $blob( $flipped, 'site-dispatch-update' ), $pub ) );
$badsig    = $sig;
$badsig[0] = chr( ord( $badsig[0] ) ^ 1 );
$check( 'one flipped bit in the signature fails', ! sodium_crypto_sign_verify_detached( $badsig, $blob( $manifest, 'site-dispatch-update' ), $pub ) );
$check( 'manifest has no trailing newline', "\n" !== substr( $manifest, -1 ) && "\r" !== substr( $manifest, -1 ) );

// Report: key derivation and HMAC over the body bytes.
$v    = json_decode( file_get_contents( $dir . 'report-hmac.json' ), true );
$body = file_get_contents( $dir . $v['body_file'] );

$check( 'body file has the documented length and hash', strlen( $body ) === $v['body_bytes'] && hash( 'sha256', $body ) === $v['body_sha256'] );
$check( 'key input is website_id:key_version', $v['website_id'] . ':' . $v['key_version'] === $v['key_input'] );
$check( 'site key derives from the canary master key', hash_hmac( 'sha256', $v['key_input'], $v['master_key'] ) === $v['site_key'] );
$check( 'signature header is the HMAC over the body bytes', 'sha256=' . hash_hmac( 'sha256', $body, $v['site_key'] ) === $v['signature_header'] );

// Enrollment: hash of the secret.
$check( 'enrollment secret hash is SHA-256 over the hex text', hash( 'sha256', $v['enroll_secret'] ) === $v['enroll_secret_hash'] );

echo 0 === $failed ? "all vectors hold\n" : $failed . " vector(s) broken\n";
exit( 0 === $failed ? 0 : 1 );
