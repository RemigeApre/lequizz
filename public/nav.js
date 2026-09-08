// ── Drawer mobile ────────────────────────────────────────────────────────────
(function () {
  var burger = document.getElementById("nav-burger");
  var drawer = document.getElementById("nav-drawer");
  var backdrop = document.getElementById("nav-backdrop");
  var closeBtn = document.getElementById("nav-drawer-close");
  if (!burger || !drawer || !backdrop) return;

  function openDrawer() {
    drawer.classList.add("open");
    backdrop.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    burger.setAttribute("aria-expanded", "true");
    document.body.classList.add("nav-drawer-locked");
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    backdrop.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    burger.setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-drawer-locked");
  }

  burger.addEventListener("click", openDrawer);
  backdrop.addEventListener("click", closeDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDrawer();
  });
})();

// ── Recherche globale (overlay desktop) ─────────────────────────────────────
(function () {
  var overlay  = document.getElementById("pc-search-overlay");
  var input    = document.getElementById("pc-search-input");
  var closeBtn = document.getElementById("pc-search-close");
  var results  = document.getElementById("pc-search-results");
  var openBtn  = document.getElementById("pc-search-btn");
  if (!overlay || !input || !results) return;

  function open() {
    overlay.hidden = false;
    input.focus();
    input.select();
  }

  function close() {
    overlay.hidden = true;
    results.innerHTML = "";
    input.value = "";
  }

  if (openBtn) openBtn.addEventListener("click", open);
  if (closeBtn) closeBtn.addEventListener("click", close);

  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) close();
  });

  document.addEventListener("keydown", function (e) {
    // Ctrl+K ou Cmd+K pour ouvrir la recherche
    if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      open();
    }
    if (e.key === "Escape" && !overlay.hidden) close();
  });

  var timer;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    var q = input.value.trim();
    if (q.length < 2) { results.innerHTML = ""; return; }
    timer = setTimeout(function () { fetchSearch(q); }, 280);
  });

  function fetchSearch(q) {
    fetch("/api/search?q=" + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (data) { render(data.results || {}); })
      .catch(function () {});
  }

  var LABELS = {
    wiki:    "Wiki",
    galerie: "Galerie",
    bd:      "BD",
    liens:   "Liens",
    quizz:   "Quizz"
  };

  function render(data) {
    while (results.firstChild) results.removeChild(results.firstChild);
    var keys = Object.keys(data);
    if (!keys.length) {
      var empty = document.createElement("p");
      empty.className = "pc-search-empty";
      empty.textContent = "Aucun r\u00e9sultat";
      results.appendChild(empty);
      return;
    }
    keys.forEach(function (k) {
      var items = data[k];
      var sec = document.createElement("div");
      sec.className = "pc-search-section";

      var lbl = document.createElement("div");
      lbl.className = "pc-search-section-label";
      lbl.textContent = LABELS[k] || k;
      sec.appendChild(lbl);

      items.forEach(function (item) {
        var a = document.createElement("a");
        a.className = "pc-search-result-link";
        a.href = item.url;
        a.textContent = item.title;
        a.addEventListener("click", close);
        sec.appendChild(a);
      });

      results.appendChild(sec);
    });
  }
})();
