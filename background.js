import { getItemFromLocal, setItemInLocal, modifyItemInLocal,
    addBlockedPortToHost, addBlockedTrackingHost, increaseBadge } from "./BrowserStorageManager.js";

async function startup(){
    // No need to check and initialize notification, state, and allow list values as they will 
    // fall back to the default values until explicitly set
    console.log("Startup called");

	// Get the blocking state from cold storage
    const state = await getItemFromLocal("blocking_enabled", true); 
	if (state === true) {
	    start();
	} else {
	    stop();
	}
}

const oldRegex = new RegExp("\\b(^(http|https|wss|ws|ftp|ftps):\/\/127[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|^(http|https|wss|ws|ftp|ftps):\/\/0.0.0.0|^(http|https|wss|ws|ftp|ftps):\/\/(10)([.](25[0-5]|2[0-4][0-9]|1[0-9]{1,2}|[0-9]{1,2})){3}|^(http|https|wss|ws|ftp|ftps):\/\/localhost|^(http|https|wss|ws|ftp|ftps):\/\/172[.](0?16|0?17|0?18|0?19|0?20|0?21|0?22|0?23|0?24|0?25|0?26|0?27|0?28|0?29|0?30|0?31)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|^(http|https|wss|ws|ftp|ftps):\/\/192[.]168[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|^(http|https|wss|ws|ftp|ftps):\/\/169[.]254[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)[.](?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?))(?:\/([789]|1?[0-9]{2}))?\\b", "i");
/**
 * isLocalURL aims to replace the current Regex based host matching
 * @remarks
 * The js `URL` object applies heavy normalization, so there's no need to worry about:
 *     exotic domain forms like `https://✉.gg`, `https://regular%2Dexpressions.info` (percent-encoding in hostname), `https://はじめよう.みんな`, `https://כולנו.ישראל` (RTL characters (including TLDs)),
 *     exotic IPv4s like `http://127.1`, `http://2130706433`, `http://0x7F000001`, `http://0177.1`,
 *     exotic IPv6s like // TODO
 * ({@link https://developer.mozilla.org/en-US/docs/Web/API/URL/hostname#:~:text=IPv4%20and%20IPv6%20addresses%20are%20normalized%2C%20such%20as%20stripping%20leading%20zeros%2C%20and%20domain%20names%20are%20converted%20to%20IDN | MDN citation})
 * 
 * @param {URL} url
 * @returns {boolean}
 */
function isLocalURL(url) {
    if (!(url instanceof URL)) console.warn("Passed non-URL to isLocalURL", {url});

    // Catch `file:///` urls
    if (url.protocol === "file:") {
        console.warn("New matcher hit a file:/// URL, deferring to regex: '" + url + "'");
        return oldRegex.test(url);
    }

    // URL.hostname is what we need to compare against when blocking:
    // `protocol://user:pass@ [sub.example.tld.] :1234/path/#hash`
    const _hostname = url.hostname;
    // Remove trailing dot on fully qualified domains: https://en.wikipedia.org/wiki/Fully_qualified_domain_name
    const hostname = _hostname.replace(/\.*$/, '');

    // Extract the TLD (note this doesn't get the *true* TLD since `.co.uk` is captured just as `.uk`)
    const hostname_dot_chunks = hostname.split('.');
    const tld = hostname_dot_chunks.at(-1);

    ////////////// Non-IP LAN access
    // IANA list of TLD-esques and relevant RFC numbers: https://www.iana.org/assignments/special-use-domain-names/special-use-domain-names.xhtml
    if (
        // Loopback, see: https://datatracker.ietf.org/doc/html/rfc6761#section-6.3
        // Still using `tld` over `hostname` to support VMs' use of subdomains, eg. `http://wsl.localhost`, see: https://learn.microsoft.com/en-us/windows/wsl/release-notes#:~:text=Switch%20the%20%5Cwsl%20prefix%20to%20%5Cwsl%2Elocalhost
        tld === "localhost" ||
        // Link-local/mDNS, see: https://datatracker.ietf.org/doc/html/rfc6762
        tld === "local" ||
        // Proposed private but not solely LAN TLD, see: https://en.wikipedia.org/wiki/.internal, https://datatracker.ietf.org/doc/html/draft-davies-internal-tld-03
        tld === "internal" ||
        // Alternative home networking method, see: https://datatracker.ietf.org/doc/html/rfc8375 or https://en.wikipedia.org/wiki/.arpa
        hostname.endsWith(".home.arpa")
        // IPv4 `.in-addr.arpa` and IPv6 `.ip6.arpa` domains handled below with other addresses of their type
    ) {
        console.debug("New matcher TLD success:  ✔️: '" + hostname + "'");
        return true;
    }


    // Resolve IPv4 via `.in-addr.arpa` or directly parsed
    const ip4_numeric_chunks = (hostname.endsWith('.in-addr.arpa') ? (
        // Cut the end off and flip since `.in-addr.arpa` displays in little-endian
        hostname_dot_chunks
            .toSpliced(-2) // As to not mutate `hostname_dot_chunks`
            .reverse()
    ) : hostname_dot_chunks)
        // Parse as numbers
        .map((b) => parseInt(b));

    ////////////// IPv4
    // Compiled list on Wikipedia: https://en.wikipedia.org/wiki/IPv4#Special-use_addresses
    // RFC 1918: 'Address Allocation for Private Internets' (1996): https://datatracker.ietf.org/doc/html/rfc1918#section-3
    // RFC 6890: 'Special-Purpose IP Address Registries' (2013): https://datatracker.ietf.org/doc/html/rfc6890
    if (
        // Must match the *full* hostname, not just the start. Otherwise `127.0.0.1.example.com` will be misinterpreted
        ip4_numeric_chunks.length === 4 &&
        // Check that everything is a number and byte-sized
        ip4_numeric_chunks.every((b) => (!isNaN(b) && 0 <= b && b < 256))
    ) {
        // Since the `if` guarantees only 4 values it's safe to extract now
        const [ip_1, ip_2, ip_3, ip_4] = ip4_numeric_chunks;

        // // Parse into a 32bit big-endian integer (would be easier for bitmask based matching yet sacrifices readability, put on hold)
        // // TODO reconsider after speed profiling, bitwise operations are *very* fast
        // const ip_32bit = ip4_numeric_chunks.reduce((accumulated, current) => (accumulated * 256 + current), 0);

        // Actual matching
        if (
            // Loopback
            /* 127.  0.0.0 /8  */ (ip_1 === 127) ||
            /*   0.  0.0.0 /8  */ (ip_1 === 0) ||
            // Link-local/mDNS related
            /* 169.254.0.0 /16 */ (ip_1 === 169 && ip_2 === 254) ||
            /* 224.0.0.251 /32 */ (ip_1 === 224 && ip_2 === 0 && ip_3 === 0 && ip_4 === 251) ||
            // Private use 
            /*  10.  0.0.0 /8  */ (ip_1 === 10) ||
            /* 172. 16.0.0 /12 */ (ip_1 === 172 && (ip_2 >= 16 && ip_2 < 32)) ||
            /* 192.168.0.0 /16 */ (ip_1 === 192 && ip_2 === 168)
        ) {
            console.debug("New matcher IPv4 success: ✔️: '" + hostname + "'");
            return true;
        }
    }

    ////////////// IPv4
    if (false) {
        // Link-local/mDNS related: FE80::/10
    }

    // Fallback on the regex (with a warning to track down the last cases)
    console.warn("New matcher fallback:      ❌: '" + url + "'");
    return oldRegex.test(url);
}

// To smooth transition to new function
const isLocalWrapper = {
    test: (string) => {
        try {
            return isLocalURL(new URL(string));
        } catch (e) {
            console.error("Error in wrapper for `isLocalURL`, defering to regex: '" + string + "'", e);
            return oldRegex.test(string);
        }
    }
}

/**
 * The main function that is called on every request and determines if it should be blocked or not
 * @param {Object} requestDetails Full specification of `requestDetails`: {@link https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/onBeforeRequest#details | MDN page}
 * @returns 
 */
async function cancel(requestDetails) {
    // Request logging (for debug purposes) hacked onto the notifications setting
    if (await getItemFromLocal("notificationsAllowed", false)) {
        console.debug("requestDetails:", requestDetails);
    }

    // First check the whitelist
    let check_allowed_url;
    try {
        check_allowed_url = new URL(requestDetails.originUrl);
    } catch {
        console.error("Aborted filtering on domain due to unparseable domain: ", requestDetails.originUrl);
        return { cancel: false }; // invalid origin
    }

    const allowed_domains_list = await getItemFromLocal("allowed_domain_list", []);
    // Perform an exact match against the whitelisted domains (dont assume subdomains are allowed)
    const domainIsWhiteListed = allowed_domains_list.some(
        (domain) => check_allowed_url.host === domain
    );
    if (domainIsWhiteListed){
        console.debug("Aborted filtering on domain due to whitelist: ", check_allowed_url);
        return { cancel: false };
    }

    // This regex is explained here https://regex101.com/r/LSL180/1 below I needed to change \b -> \\b
    let local_filter = isLocalWrapper;
    // Create a regex to find all sub-domains for online-metrix.net  Explained here https://regex101.com/r/f8LSTx/2
    let thm = new RegExp("online-metrix[.]net$", "i");

    // This reduces having to check this conditional multiple times
    let is_requested_local = local_filter.test(requestDetails.url);
    // Make sure we are not searching the CNAME of local addresses
    if (!is_requested_local) {
        let url = new URL(requestDetails.url);
        // Send a request to get the CNAME of the webrequest
        let resolving = await browser.dns.resolve(url.host, ["canonical_name"]);
        // If the CNAME redirects to a online-metrix.net domain -> Block
        if (thm.test(resolving.canonicalName)) {
            console.debug("Blocking domain for being a threatmetrix match: ", {url: url, cname: resolving.canonicalName});
            increaseBadge(requestDetails, true); // increment badge and alert
            addBlockedTrackingHost(url, requestDetails.tabId);
            return { cancel: true };
        }
    }

    // Check if the network request is going to a local address
    if (is_requested_local) {
        // If URL in the address bar is a local address dont block the request
        if (!local_filter.test(requestDetails.originUrl)) {
            let url = new URL(requestDetails.url);
            console.debug("Blocking domain for portscanning: ", url);
            increaseBadge(requestDetails, false); // increment badge and alert
            addBlockedPortToHost(url, requestDetails.tabId);
            return { cancel: true };
        }
    }
    // Dont block sites that don't alert the detection
    return { cancel: false };
} // end cancel()

async function start() {  // Enables blocking
    try {
        //Add event listener
        browser.webRequest.onBeforeRequest.addListener(
            cancel,
            { urls: ["<all_urls>"] }, // Match all HTTP, HTTPS, FTP, FTPS, WS, WSS URLs.
            ["blocking"] // if cancel() returns true block the request.
        );

        console.log("Attached `onBeforeRequest` listener successfully: blocking enabled");
        await setItemInLocal("blocking_enabled", true);
    } catch (e) {
        console.error("START() ", e);
    }
}

async function stop() {  // Disables blocking
    try {
        //Remove event listener
        browser.webRequest.onBeforeRequest.removeListener(cancel);

        console.log("Removed `onBeforeRequest` listener successfully: blocking disabled");
        await setItemInLocal("blocking_enabled", false);
    } catch (e) {
        console.error("STOP() ", e);
    }
}

async function isListening() { // returns if blocking is on
    const storage_state = await getItemFromLocal("blocking_enabled", true);
    const listener_attached_state = browser.webRequest.onBeforeRequest.hasListener(cancel);

    // If storage says that blocking is enabled when it actually isn't, soft throw an error to the console
    if (storage_state !== listener_attached_state) {
        console.error("Mismatch in blocking state according to storage value and listener attached status:", {
            storage_state,
            listener_attached_state
        });
    }

    // Rely on the actual listener being attached as the ground source of truth over what storage says
    return listener_attached_state;
}

/**
 * Call by each tab is updated.
 * And if url has changed.
 * Borrowed and modified from https://gitlab.com/KevinRoebert/ClearUrls/-/blob/master/core_js/badgedHandler.js
 */
async function handleUpdated(tabId, changeInfo, tabInfo) {
    // TODO investigate a better way to interact with current locking practices
    const badges = await getItemFromLocal("badges", {});
    if (!badges[tabId] || !changeInfo.url) return;

    if (badges[tabId].lastURL !== changeInfo.url) {
        badges[tabId] = {
            counter: 0,
            alerted: 0,
            lastURL: tabInfo.url
        };
        await setItemInLocal("badges", badges);

        // Clear out the blocked ports for the current tab
        await modifyItemInLocal("blocked_ports", {},
            (blocked_ports_object) => {
                delete blocked_ports_object[tabId];
                return blocked_ports_object;
            });

        // Clear out the hosts for the current tab
        await modifyItemInLocal("blocked_hosts", {},
            (blocked_hosts_object) => {
                delete blocked_hosts_object[tabId];
                return blocked_hosts_object;
            });
    }
}

async function onMessage(message, sender) {
  // Add origin check for security
  const extensionOrigin = new URL(browser.runtime.getURL("")).origin;
  if (sender.url !== `${extensionOrigin}/popup/popup.html`) {
    console.warn('Message from unexpected origin:', sender.url);
    return;
  }

  switch(message.type) {
    case 'popupInit':
      return {
        isListening: await isListening(),
        notificationsAllowed: await getItemFromLocal("notificationsAllowed", true),
      };
    case 'toggleEnabled':
      message.value ? await start() : await stop();
      break;
    case 'setItemInLocal':
      await setItemInLocal(message.key, message.value);
      break;
    case 'setNotificationsAllowed':
      await setItemInLocal("notificationsAllowed", message.value);
      break;
    case 'getItemInLocal':
      return await getItemFromLocal(message.key, message.defaultValue);
    default:
      console.warn('Port Authority: unknown message: ', message);
      break;
  }
}
browser.runtime.onMessage.addListener(onMessage);

startup();
// Call by each tab is updated.
browser.tabs.onUpdated.addListener(handleUpdated);
