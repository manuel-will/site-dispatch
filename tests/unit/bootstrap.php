<?php
/**
 * Loads the pure functions. No WordPress, no autoloader magic.
 *
 * The files under includes/ only declare functions, so the ones that need WordPress at run time
 * can be loaded here as well. The tests call their pure helpers only.
 *
 * @package Site_Dispatch
 */

require dirname( __DIR__, 2 ) . '/includes/verify.php';
require dirname( __DIR__, 2 ) . '/includes/hosts.php';
require dirname( __DIR__, 2 ) . '/includes/responses.php';
require dirname( __DIR__, 2 ) . '/includes/report.php';
