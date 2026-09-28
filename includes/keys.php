<?php
/**
 * The public keys an update has to be signed with: work key A, reserve key B.
 *
 * Raw Ed25519 keys, 32 bytes each, base64. Only a build changes this file, nothing at run time.
 *
 * @package Site_Dispatch
 */

/**
 * Work key A first, reserve key B second.
 */
const SITE_DISPATCH_PUBLIC_KEYS = array(
	'SrtmPWXaVFE/pf493gYke3MPHUsQTkFw9yopZVmu0ps=',
	'oC5qEUmBep0woFhjzuN8B3sRxIdRDCSoQNZfxZxEOnc=',
);
