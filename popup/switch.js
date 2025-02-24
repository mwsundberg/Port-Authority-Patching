// Can attach options page link instantly
document.getElementById('settings').addEventListener("click", () =>
    browser.runtime.openOptionsPage());

// Await at the top level to prevent attaching listeners that won't match storage state
const fetched_settings = await browser.runtime.sendMessage({ type: 'popupInit' });

// Blocking switch bindings
const blocking_switch = document.getElementById("blocking_switch");
blocking_switch.checked = fetched_settings.isListening;
blocking_switch.addEventListener("change", (ev) =>
    browser.runtime.sendMessage({
        type: 'toggleEnabled',
        value: ev.target.checked
    }));

// Notifications switch bindings
const notifications_switch = document.getElementById("notifications_switch");
notifications_switch.checked = fetched_settings.notificationsAllowed;
notifications_switch.addEventListener("change", (ev) =>
    browser.runtime.sendMessage({
        type: 'setNotificationsAllowed',
        value: ev.target.checked
    }));
