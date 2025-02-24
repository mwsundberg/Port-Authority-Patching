import { getItemFromLocal } from "../global/BrowserStorageManager.js";
import { getActiveTabId, isObjectEmpty } from "../global/utils.js";

function buildSectionWrapper() {
    return document.createElement("div");
}

/**
 * Collapsing container component
 * <details>
 *     <summary>${collapse_title}</summary>
 *     <!--add here-->
 * </details>
 *
 * @param {string} summary_contents What's not collapsed
 * @returns {Element} A collapse Wrapper with a button to toggle the collapse
 */
function buildCollapseWrapperAndToggle(summary_contents) {
    const container = document.createElement("details");
    const summary = document.createElement("summary");
    // TODO handle nodes rather than text
    summary.innerText = summary_contents;
    container.appendChild(summary);

    return container;
}

/**
 * Data fetching only, separated from rendering
 * @returns {Array<string> | void} Ports blocked by the current tab
 */
async function getCurrentTabsBlockedPorts(data_type) {
    const tabId = getActiveTabId();

    const all_tabs_data = await getItemFromLocal(data_type, {});
    if (isObjectEmpty(all_tabs_data)) return;

    return all_tabs_data[tabId];
}

/**
 * Displays a list of blocked ports in the popup UI.
 * Data is re-rendered each time the popup is opened.
 */
const blocked_ports_display = document.getElementById("blocked_ports");
const blocked_ports_inner = document.querySelector("#blocked_ports .dropzone");
async function renderBlockedPorts() {
    const data_blocked_ports = await getCurrentTabsBlockedPorts("blocked_ports");
    if(!data_blocked_ports) return;

    const hosts = Object.keys(data_blocked_ports);

    // Build a tree for each host that was blocked
    for (let i_host = 0; i_host < hosts.length; i_host++) {
        // Build the wrapper for displaying the host name and ports blocked
        const host = hosts[i_host];
        const host_wrapper = buildCollapseWrapperAndToggle(
            host + "View Ports"
        );

        const ports = data_blocked_ports[host];

        // Add each port to the HTML
        for (let i_port = 0; i_port < ports.length; i_port++) {
            const port = ports[i_port];
            const port_element = document.createElement("div");
            port_element.innerText = port;
            port_element.classList.add("ps-2");
            hosts_ul.appendChild(port_element);
        }

        host_wrapper.appendChild(hosts_ul);
        blocked_ports_inner.appendChild(host_wrapper);
    }

    // Toggle visibility on the container wrapper at end
    blocked_ports_display.classList.remove("unpopulated");
}

const blocked_hosts_display = document.getElementById("blocked_hosts");
const blocked_hosts_inner = document.querySelector("#blocked_hosts .dropzone");
async function updateBlockedHostsDisplay() {
    const data_blocked_hosts = await getCurrentTabsBlockedPorts("blocked_hosts");
    if(!data_blocked_hosts) return;
    console.log(data_blocked_hosts)

    // Build a list of host names as li elements
    for (const host_name of data_blocked_hosts) {
        // Create the list element for the blocked host and set the text to the hosts name
        const host_li = document.createElement("li");
        host_li.innerText = host_name;

        // Add the list element to the hosts UL
        blocked_hosts_inner.appendChild(host_li);
    }
    // Toggle visibility on the container wrapper at end
    blocked_hosts_display.classList.remove("unpopulated");
}

// Helper function for calling all DOM-Modifying functions
function buildDataMarkup() {
    // Shows any and all hosts that attempted to connect to a tracking service
    updateBlockedHostsDisplay();
    // Shows any and all ports that were blocked from scanning. Ports are sorted based on host that attempted the port scan
    renderBlockedPorts();
}

buildDataMarkup();
