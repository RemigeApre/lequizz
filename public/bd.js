(function () {
  "use strict";

  // ══════════════════════════════════════════════════
  // TAG WIDGET (same as gallery.js)
  // ══════════════════════════════════════════════════
  function tagHue(tag) {
    var TAG_HUES = [4, 28, 48, 140, 175, 210, 270, 330];
    var h = 0, s = tag.toLowerCase();
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return TAG_HUES[Math.abs(h) % TAG_HUES.length];
  }

  document.querySelectorAll(".wiki-tags-widget").forEach(function (widget) {
    var board  = widget.querySelector(".wiki-tags-board");
    var typing = widget.querySelector(".wiki-tags-typing");
    var hidden = widget.querySelector(".wiki-tags-hidden");
    if (!board || !typing || !hidden) return;

    var tags = hidden.value ? hidden.value.split(",").map(function(t){ return t.trim(); }).filter(Boolean) : [];

    function render() {
      board.querySelectorAll(".wiki-tag-pill-btn").forEach(function(el){ el.remove(); });
      tags.forEach(function (t) {
        var pill = document.createElement("span");
        pill.className = "link-tag-pill wiki-tag-pill-btn";
        pill.style.background = "hsl(" + tagHue(t) + ", 55%, 42%)";
        pill.style.color = "#fff";
        pill.style.cursor = "pointer";
        pill.textContent = t + " ×";
        pill.addEventListener("click", function () {
          tags = tags.filter(function(x){ return x !== t; });
          hidden.value = tags.join(", ");
          render();
        });
        board.insertBefore(pill, typing);
      });
      hidden.value = tags.join(", ");
    }

    typing.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        var t = typing.value.trim();
        if (t && !tags.includes(t)) { tags.push(t); render(); }
        typing.value = "";
      } else if (e.key === "Backspace" && !typing.value && tags.length) {
        tags.pop();
        hidden.value = tags.join(", ");
        render();
      }
    });
    typing.addEventListener("blur", function () {
      var t = typing.value.trim();
      if (t && !tags.includes(t)) { tags.push(t); render(); }
      typing.value = "";
    });

    render();
  });

  // ══════════════════════════════════════════════════
  // DRAG-AND-DROP ORDER FOR EXISTING IMAGES
  // ══════════════════════════════════════════════════
  var sortGrid   = document.getElementById("bd-sort-grid");
  var orderInput = document.getElementById("bd-image-order");

  function syncOrder() {
    if (!sortGrid || !orderInput) return;
    var items = Array.from(sortGrid.querySelectorAll(".bd-sort-item:not(.bd-sort-item-removed)"));
    // Existing images: use their data-src. New images: use __new__:N
    var parts = items.map(function(item) {
      return item.dataset.src;
    });
    orderInput.value = parts.join(",");
    // Update numbering
    var num = 1;
    Array.from(sortGrid.querySelectorAll(".bd-sort-item")).forEach(function(item) {
      var n = item.querySelector(".bd-sort-num");
      var removed = item.classList.contains("bd-sort-item-removed");
      if (n) n.textContent = removed ? "✕" : num++;
    });
  }

  if (sortGrid) {
    var dragSrc = null;

    sortGrid.addEventListener("dragstart", function(e) {
      dragSrc = e.target.closest(".bd-sort-item");
      if (!dragSrc) return;
      dragSrc.classList.add("bd-dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    sortGrid.addEventListener("dragover", function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      var target = e.target.closest(".bd-sort-item");
      if (!target || target === dragSrc) return;
      sortGrid.querySelectorAll(".bd-sort-item").forEach(function(el){ el.classList.remove("bd-drop-over"); });
      target.classList.add("bd-drop-over");
    });

    sortGrid.addEventListener("dragleave", function(e) {
      var target = e.target.closest(".bd-sort-item");
      if (target) target.classList.remove("bd-drop-over");
    });

    sortGrid.addEventListener("drop", function(e) {
      e.preventDefault();
      var target = e.target.closest(".bd-sort-item");
      if (!target || !dragSrc || target === dragSrc) return;
      sortGrid.querySelectorAll(".bd-sort-item").forEach(function(el){ el.classList.remove("bd-drop-over"); });
      // Insert dragSrc before or after target
      var items = Array.from(sortGrid.querySelectorAll(".bd-sort-item"));
      var srcIdx = items.indexOf(dragSrc);
      var tgtIdx = items.indexOf(target);
      if (srcIdx < tgtIdx) {
        sortGrid.insertBefore(dragSrc, target.nextSibling);
      } else {
        sortGrid.insertBefore(dragSrc, target);
      }
      syncOrder();
    });

    sortGrid.addEventListener("dragend", function() {
      sortGrid.querySelectorAll(".bd-sort-item").forEach(function(el){
        el.classList.remove("bd-dragging");
        el.classList.remove("bd-drop-over");
      });
      dragSrc = null;
    });

    // Mark removed items
    sortGrid.querySelectorAll(".bd-remove-cb").forEach(function(cb) {
      cb.addEventListener("change", function() {
        var item = cb.closest(".bd-sort-item");
        if (item) item.classList.toggle("bd-sort-item-removed", cb.checked);
        syncOrder();
      });
    });

    syncOrder();
  }

  // ══════════════════════════════════════════════════
  // NEW IMAGE PREVIEWS WITH ORDERING
  // ══════════════════════════════════════════════════
  var fileInput   = document.getElementById("bd-file-input");
  var previewZone = document.getElementById("bd-new-previews");

  // Track order of new files as indices
  var newFileOrder = []; // array of original file indices in current order

  function syncNewOrder() {
    if (!orderInput || !previewZone) return;
    // Build order string: existing items first (from sortGrid), then new items
    var existingParts = [];
    if (sortGrid) {
      var items = Array.from(sortGrid.querySelectorAll(".bd-sort-item:not(.bd-sort-item-removed)"));
      existingParts = items.map(function(item) { return item.dataset.src; });
    }
    var newParts = newFileOrder.map(function(idx) { return "__new__:" + idx; });
    orderInput.value = existingParts.concat(newParts).join(",");

    // Update numbering on new previews
    var baseNum = existingParts.length;
    Array.from(previewZone.querySelectorAll(".bd-preview-item")).forEach(function(item, i) {
      var n = item.querySelector(".bd-sort-num");
      if (n) n.textContent = baseNum + i + 1;
    });
  }

  function buildPreviews(files) {
    if (!previewZone) return;
    previewZone.innerHTML = "";
    newFileOrder = files.map(function(_, i) { return i; });

    newFileOrder.forEach(function(origIdx) {
      var file = files[origIdx];
      var item = document.createElement("div");
      item.className = "bd-sort-item bd-preview-item";
      item.draggable = true;
      item.dataset.newIdx = origIdx;

      var handle = document.createElement("div");
      handle.className = "bd-sort-handle";
      handle.innerHTML = "&#8597;";

      var img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.alt = "";
      img.className = "bd-sort-img";

      var num = document.createElement("span");
      num.className = "bd-sort-num";

      item.appendChild(handle);
      item.appendChild(img);
      item.appendChild(num);
      previewZone.appendChild(item);
    });

    // Drag for new previews
    var dragSrcNew = null;
    previewZone.addEventListener("dragstart", function(e) {
      dragSrcNew = e.target.closest(".bd-preview-item");
      if (dragSrcNew) dragSrcNew.classList.add("bd-dragging");
    });
    previewZone.addEventListener("dragover", function(e) {
      e.preventDefault();
      var target = e.target.closest(".bd-preview-item");
      if (!target || target === dragSrcNew) return;
      previewZone.querySelectorAll(".bd-preview-item").forEach(function(el){ el.classList.remove("bd-drop-over"); });
      target.classList.add("bd-drop-over");
    });
    previewZone.addEventListener("drop", function(e) {
      e.preventDefault();
      var target = e.target.closest(".bd-preview-item");
      if (!target || !dragSrcNew || target === dragSrcNew) return;
      previewZone.querySelectorAll(".bd-preview-item").forEach(function(el){ el.classList.remove("bd-drop-over"); });
      var items = Array.from(previewZone.querySelectorAll(".bd-preview-item"));
      var srcIdx = items.indexOf(dragSrcNew);
      var tgtIdx = items.indexOf(target);
      if (srcIdx < tgtIdx) previewZone.insertBefore(dragSrcNew, target.nextSibling);
      else previewZone.insertBefore(dragSrcNew, target);
      // Rebuild newFileOrder from current DOM order
      newFileOrder = Array.from(previewZone.querySelectorAll(".bd-preview-item")).map(function(el) {
        return Number(el.dataset.newIdx);
      });
      syncNewOrder();
    });
    previewZone.addEventListener("dragend", function() {
      if (dragSrcNew) dragSrcNew.classList.remove("bd-dragging");
      previewZone.querySelectorAll(".bd-preview-item").forEach(function(el){ el.classList.remove("bd-drop-over"); });
      dragSrcNew = null;
    });

    syncNewOrder();
  }

  if (fileInput) {
    fileInput.addEventListener("change", function() {
      buildPreviews(Array.from(fileInput.files || []));
    });
  }

  // ══════════════════════════════════════════════════
  // FILTRE ULTRA (liste BD)
  // ══════════════════════════════════════════════════
  var bdGrid       = document.getElementById("bd-grid");
  var bdUltraToggle = document.getElementById("bd-ultra-toggle");
  var hideUltra    = localStorage.getItem("bd-hide-ultra") !== "0";

  function syncUltraBtn() {
    if (!bdUltraToggle) return;
    bdUltraToggle.textContent = hideUltra ? "\uD83D\uDD12 Masquer Ultra" : "\uD83D\uDD13 Afficher Ultra";
    bdUltraToggle.classList.toggle("active", hideUltra);
  }

  function applyUltra() {
    if (!bdGrid) return;
    bdGrid.querySelectorAll(".bd-card").forEach(function(card) {
      card.hidden = hideUltra && card.dataset.ultra === "1";
    });
  }

  if (bdUltraToggle) {
    bdUltraToggle.addEventListener("click", function() {
      hideUltra = !hideUltra;
      localStorage.setItem("bd-hide-ultra", hideUltra ? "1" : "0");
      syncUltraBtn();
      applyUltra();
    });
  }

  syncUltraBtn();
  applyUltra();

  // ══════════════════════════════════════════════════
  // BASCULE ULTRA PAR BD (bouton sur chaque carte)
  // ══════════════════════════════════════════════════
  document.querySelectorAll(".bd-ultra-toggle-btn").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var card = btn.closest(".bd-card");
      var id = card ? card.dataset.id : "";
      if (!id) return;
      fetch("/bd/" + id + "/toggle-ultra", { method: "POST" })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.ok) return;
          btn.classList.toggle("active", d.ultra);
          btn.title = d.ultra ? "Retirer Ultra" : "Marquer Ultra";
          card.dataset.ultra = d.ultra ? "1" : "0";
          applyUltra();
        });
    });
  });

})();
