/**
 * Polls the redeem action while an enrollment is open. Writes text only, never HTML.
 */
( function () {
	var config = window.siteDispatchAdmin;
	if ( ! config ) {
		return;
	}
	var status = document.getElementById( 'site-dispatch-enroll-status' );
	var button = document.getElementById( 'site-dispatch-check' );
	var started = Date.now();
	var timer = null;

	function show( text ) {
		if ( status ) {
			status.textContent = text;
		}
	}

	function stop() {
		if ( timer ) {
			window.clearInterval( timer );
			timer = null;
		}
	}

	function check() {
		var body = new URLSearchParams();
		body.append( 'action', 'site_dispatch_redeem' );
		body.append( 'nonce', config.nonce );
		window
			.fetch( config.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: body } )
			.then( function ( response ) {
				return response.json();
			} )
			.then( function ( data ) {
				if ( 'connected' === data.status ) {
					stop();
					window.location.assign( config.pageUrl );
					return;
				}
				if ( 'pending' === data.status || 'retry' === data.status ) {
					show( config.textWaiting );
					return;
				}
				stop();
				show( config.textFailed );
			} )
			.catch( function () {
				show( config.textWaiting );
			} );
	}

	timer = window.setInterval( function () {
		if ( Date.now() - started > config.maxTime ) {
			stop();
			show( config.textPaused );
			return;
		}
		check();
	}, config.interval );

	if ( button ) {
		button.addEventListener( 'click', check );
	}
}() );
