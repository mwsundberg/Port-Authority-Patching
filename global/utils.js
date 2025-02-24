/**
 * Call from a scope which has access to `browser.tabs`
 * @returns {string} The id number of the focused tab
*/
export async function getActiveTabId() {
    const querying = await browser.tabs.query({
        currentWindow: true,
        active: true,
    });
    const tab = querying[0];
    return tab.id;
}

/**
 * Get a well-formed host to match against from a URL user- or code-supplied
 * @param {string} text A URL-like value (eg `ftp://example.com/file/path/etc`, `google.com/`)
 * @returns {string} Well formatted host portion of url (eg `example.com`, `google.com`)
 * 
 * @throws Parsing an invalid URL
 */
export function extractURLHost(text) {
    let url = text + ""; // cast to string (is this needed?)

    // We don't actually care about the protocol as we only compare url.host
    // But the URL object will fail to create if no protocol is provided
    if (!url.startsWith("http")) {
        url = "https://" + url;
    }
    const newUrl = new URL(url);
    return newUrl.host;
}