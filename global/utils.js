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
