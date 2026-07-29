(function () {
  var form = document.querySelector("form[data-autosave-url]");
  if (!form) return;

  var url = form.dataset.autosaveUrl;
  var statusEl = document.getElementById("autosave-status");
  var timer = null;

  function showStatus(text) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.add("visible");
    clearTimeout(statusEl._hideTimer);
    statusEl._hideTimer = setTimeout(function () {
      statusEl.classList.remove("visible");
    }, 1500);
  }

  function save() {
    var params = new URLSearchParams(new FormData(form));
    fetch(url, { method: "POST", body: params, credentials: "same-origin" })
      .then(function (res) {
        if (res.ok) showStatus("Enregistre");
      })
      .catch(function () {});
  }

  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(save, 500);
  }

  form.addEventListener("change", scheduleSave);

  window.addEventListener("pagehide", function () {
    clearTimeout(timer);
    var params = new URLSearchParams(new FormData(form));
    navigator.sendBeacon(url, params);
  });
})();
