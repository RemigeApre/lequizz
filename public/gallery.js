(function () {
  "use strict";

  // ══════════════════════════════════════════════════
  // 1. TAG WIDGET (même logique que wiki.js)
  // ══════════════════════════════════════════════════
  function tagHue(tag) {
    var TAG_HUES = [4, 28, 48, 140, 175, 210, 270, 330];
    var h = 0, s = tag.toLowerCase();
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return TAG_HUES[Math.abs(h) % TAG_HUES.length];
  }

  document.querySelectorAll(".wiki-tags-widget").forEach(function (widget) {
    var board   = widget.querySelector(".wiki-tags-board");
    var typing  = widget.querySelector(".wiki-tags-typing");
    var hidden  = widget.querySelector(".wiki-tags-hidden");
    var suggest = widget.querySelector(".wiki-tag-suggestions");
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

    function addTag(t) {
      t = t.trim();
      if (t && !tags.includes(t)) { tags.push(t); render(); }
    }

    typing.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addTag(typing.value);
        typing.value = "";
      } else if (e.key === "Backspace" && !typing.value && tags.length) {
        tags.pop();
        hidden.value = tags.join(", ");
        render();
      }
    });
    typing.addEventListener("blur", function () {
      if (typing.value.trim()) { addTag(typing.value); typing.value = ""; }
    });

    if (suggest) {
      suggest.querySelectorAll(".wiki-tag-suggest-chip").forEach(function (chip) {
        chip.addEventListener("click", function () { addTag(chip.dataset.tag); });
      });
    }

    render();
  });

  // ══════════════════════════════════════════════════
  // 2. FAB + PANEL UPLOAD
  // ══════════════════════════════════════════════════
  var fabMain     = document.getElementById("gallery-fab-main");
  var fabMenu     = document.getElementById("gallery-fab-menu");
  var fabImage    = document.getElementById("gallery-fab-image");
  var fabBd       = document.getElementById("gallery-fab-bd");
  var uploadPanel = document.getElementById("gallery-upload-panel");
  var uploadType  = document.getElementById("gallery-upload-type");
  var uploadLabel = document.getElementById("gallery-upload-type-label");
  var cancelBtn   = document.getElementById("gallery-upload-cancel");
  var fileInput   = uploadPanel ? uploadPanel.querySelector(".gallery-file-input") : null;
  var previewZone = document.getElementById("gallery-upload-previews");

  function closeUpload() {
    if (uploadPanel) uploadPanel.hidden = true;
    if (fabMenu) fabMenu.hidden = true;
    if (fabMain) fabMain.textContent = "+";
  }

  function openUploadAs(type) {
    if (uploadType) uploadType.value = type;
    if (uploadLabel) { uploadLabel.textContent = type === "bd" ? "BD" : "Image"; uploadLabel.className = "gallery-upload-type-chip gallery-upload-type-" + type; }
    if (uploadPanel) uploadPanel.hidden = false;
    if (fabMenu) fabMenu.hidden = true;
    if (fabMain) fabMain.textContent = "\u00d7";
  }

  if (fabMain && fabMenu) {
    fabMain.addEventListener("click", function () {
      if (uploadPanel && !uploadPanel.hidden) { closeUpload(); return; }
      fabMenu.hidden = !fabMenu.hidden;
    });
  }
  if (fabImage) fabImage.addEventListener("click", function () { openUploadAs("image"); });
  if (fabBd)    fabBd.addEventListener("click",    function () { openUploadAs("bd"); });
  if (cancelBtn) cancelBtn.addEventListener("click", closeUpload);

  // Ferme le menu si on clique en dehors
  document.addEventListener("click", function (e) {
    if (!fabMenu || fabMenu.hidden) return;
    var wrap = document.getElementById("gallery-fab-wrap");
    if (wrap && !wrap.contains(e.target)) fabMenu.hidden = true;
  });

  if (fileInput && previewZone) {
    fileInput.addEventListener("change", function () {
      previewZone.innerHTML = "";
      Array.from(fileInput.files || []).forEach(function (file) {
        var wrap = document.createElement("div");
        wrap.className = "gallery-preview-wrap";
        var img = document.createElement("img");
        img.src = URL.createObjectURL(file);
        img.alt = "";
        img.className = "gallery-preview-img";
        wrap.appendChild(img);
        previewZone.appendChild(wrap);
      });
    });
  }

  // ══════════════════════════════════════════════════
  // 3. FILTRES
  // ══════════════════════════════════════════════════
  var grid           = document.getElementById("gallery-grid");
  var tagFilter      = document.getElementById("gallery-tag-filter");
  var typeFilter     = document.getElementById("gallery-type-filter");
  var categoryFilter = document.getElementById("gallery-category-filter");
  var searchInput    = document.getElementById("gallery-search");
  var searchClear    = document.getElementById("gallery-search-clear");
  var resultCount    = document.getElementById("gallery-result-count");
  var countHero      = document.getElementById("gallery-count-hero");

  var activeTag      = "";
  var activeType     = "";
  var activeCategory = "";
  var searchQ        = "";
  var hideUltra      = localStorage.getItem("gallery-hide-ultra") !== "0";
  var hideIrrealiste = localStorage.getItem("gallery-hide-irrealiste") === "1";
  var activeRating   = 0;
  var sortMode       = "date-desc";

  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function applyFilters() {
    if (!grid) return;
    var cards = Array.from(grid.querySelectorAll(".gallery-card"));
    var q = norm(searchQ);
    var shown = 0;

    cards.forEach(function (card) {
      var cardTags   = (card.dataset.tags || "").split("|").filter(Boolean);
      var okTag      = !activeTag || cardTags.indexOf(norm(activeTag)) !== -1;
      var okType     = !activeType || card.dataset.type === activeType;
      var okCategory = !activeCategory || card.dataset.category === activeCategory;
      var okSearch   = !q || norm(card.dataset.title).includes(q) || cardTags.some(function(t){ return norm(t).includes(q); });
      var okUltra    = !hideUltra || card.dataset.ultra !== "1";
      var okBd       = !hideIrrealiste || card.dataset.bd !== "1";
      var okRating   = !activeRating || Number(card.dataset.rating) >= activeRating;
      card.hidden = !(okTag && okType && okCategory && okSearch && okUltra && okBd && okRating);
      if (!card.hidden) shown++;
    });

    var total = cards.length;
    var hasFilter = activeTag || activeType || activeCategory || q || hideUltra || hideIrrealiste || activeRating;
    if (countHero) countHero.textContent = hasFilter ? (shown + "/" + total) : total;
    if (resultCount) {
      resultCount.hidden = !hasFilter;
      if (hasFilter) resultCount.textContent = shown + " / " + total;
    }

    sortCards();
  }

  function sortCards() {
    if (!grid) return;
    var cards = Array.from(grid.querySelectorAll(".gallery-card"));
    cards.sort(function(a, b) {
      if (sortMode === "alpha-asc") return (a.dataset.title || "").localeCompare(b.dataset.title || "", "fr");
      if (sortMode === "rating-desc") return (Number(b.dataset.rating) || 0) - (Number(a.dataset.rating) || 0);
      if (sortMode === "date-asc") return (a.dataset.date || "").localeCompare(b.dataset.date || "");
      // date-desc (default)
      return (b.dataset.date || "").localeCompare(a.dataset.date || "");
    });
    cards.forEach(function(c) { grid.appendChild(c); });
  }

  // Type filter — toggle (cliquer sur actif = désactiver)
  if (typeFilter) {
    typeFilter.querySelectorAll(".tag-chip[data-type]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var t = chip.dataset.type || "";
        if (activeType === t) {
          chip.classList.remove("active");
          activeType = "";
        } else {
          typeFilter.querySelectorAll(".tag-chip").forEach(function(c){ c.classList.remove("active"); });
          chip.classList.add("active");
          activeType = t;
        }
        applyFilters();
      });
    });
  }

  // Category filter — toggle
  if (categoryFilter) {
    categoryFilter.querySelectorAll(".tag-chip[data-category]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var t = chip.dataset.category || "";
        if (activeCategory === t) {
          chip.classList.remove("active");
          activeCategory = "";
        } else {
          categoryFilter.querySelectorAll(".tag-chip").forEach(function(c){ c.classList.remove("active"); });
          chip.classList.add("active");
          activeCategory = t;
        }
        applyFilters();
      });
    });
  }

  // Tag filter (wiki-tag-chip style)
  if (tagFilter) {
    tagFilter.querySelectorAll(".wiki-tag-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var t = (chip.dataset.tag || "").toLowerCase();
        if (activeTag === t) {
          activeTag = "";
          chip.dataset.state = "0";
          chip.classList.remove("active");
        } else {
          tagFilter.querySelectorAll(".wiki-tag-chip").forEach(function(c){ c.dataset.state = "0"; c.classList.remove("active"); });
          activeTag = t;
          chip.dataset.state = "1";
          chip.classList.add("active");
        }
        applyFilters();
      });
    });
  }

  // Search
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      searchQ = searchInput.value;
      if (searchClear) searchClear.hidden = !searchQ;
      applyFilters();
    });
  }
  if (searchClear) {
    searchClear.addEventListener("click", function () {
      if (searchInput) { searchInput.value = ""; searchQ = ""; }
      searchClear.hidden = true;
      applyFilters();
    });
  }

  // Ultra toggle
  var ultraToggle = document.getElementById("gallery-ultra-toggle");
  function syncUltraBtn() {
    if (!ultraToggle) return;
    ultraToggle.textContent = hideUltra ? "Masquer Ultra" : "Afficher Ultra";
    ultraToggle.classList.toggle("active", hideUltra);
  }
  if (ultraToggle) {
    ultraToggle.addEventListener("click", function() {
      hideUltra = !hideUltra;
      localStorage.setItem("gallery-hide-ultra", hideUltra ? "1" : "0");
      syncUltraBtn();
      applyFilters();
    });
  }
  syncUltraBtn();

  // Irréaliste toggle
  var irrealisteToggle = document.getElementById("gallery-irrealiste-toggle");
  function syncIrrealisteBtn() {
    if (!irrealisteToggle) return;
    irrealisteToggle.textContent = hideIrrealiste ? "Masquer Irr\u00e9aliste" : "Afficher Irr\u00e9aliste";
    irrealisteToggle.classList.toggle("active", hideIrrealiste);
  }
  if (irrealisteToggle) {
    irrealisteToggle.addEventListener("click", function() {
      hideIrrealiste = !hideIrrealiste;
      localStorage.setItem("gallery-hide-irrealiste", hideIrrealiste ? "1" : "0");
      syncIrrealisteBtn();
      applyFilters();
    });
  }
  syncIrrealisteBtn();

  // Sort
  var sortSelect = document.getElementById("gallery-sort-select");
  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      sortMode = sortSelect.value;
      sortCards();
    });
  }

  applyFilters();

  // ══════════════════════════════════════════════════
  // 4. LIGHTBOX
  // ══════════════════════════════════════════════════
  var lightbox  = document.getElementById("gallery-lightbox");
  var lbImg     = lightbox ? lightbox.querySelector(".gallery-lb-img")       : null;
  var lbDots    = document.getElementById("gallery-lb-dots");
  var lbTitle   = lightbox ? lightbox.querySelector(".gallery-lb-title")     : null;
  var lbTags    = lightbox ? lightbox.querySelector(".gallery-lb-tags")      : null;
  var lbLink    = lightbox ? lightbox.querySelector(".gallery-lb-wiki-link") : null;
  var lbNotes   = lightbox ? lightbox.querySelector(".gallery-lb-notes")     : null;
  var lbClose   = lightbox ? lightbox.querySelector(".gallery-lb-close")     : null;
  var lbPrev    = lightbox ? lightbox.querySelector(".gallery-lb-prev")      : null;
  var lbNext    = lightbox ? lightbox.querySelector(".gallery-lb-next")      : null;

  var lbVisible    = [];
  var lbCardIndex  = 0;
  var lbImgIndex   = 0;

  function buildVisible() {
    if (!grid) return;
    lbVisible = Array.from(grid.querySelectorAll(".gallery-card:not([hidden])"));
  }

  function tagHueColor(t) {
    var TAG_HUES = [4, 28, 48, 140, 175, 210, 270, 330];
    var h = 0, s = t.toLowerCase();
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return "hsl(" + TAG_HUES[Math.abs(h) % TAG_HUES.length] + ", 55%, 42%)";
  }

  function currentCard() { return lbVisible[lbCardIndex]; }
  function currentImages() {
    var card = currentCard();
    return card ? (card.dataset.images || "").split("|").filter(Boolean) : [];
  }

  function renderLightbox() {
    var card = currentCard();
    if (!lightbox || !card) return;
    var images  = currentImages();
    var src     = images[lbImgIndex] || "";
    var title   = card.dataset.title || "";
    var tags    = (card.dataset.tags || "").split("|").filter(Boolean);
    var wikiId  = card.dataset.wikiId || "";

    if (lbImg) lbImg.src = src;
    if (lbTitle) lbTitle.textContent = title || "";
    if (lbTags) {
      lbTags.innerHTML = "";
      tags.forEach(function(t) {
        var pill = document.createElement("span");
        pill.className = "link-tag-pill";
        pill.style.background = tagHueColor(t);
        pill.style.color = "#fff";
        pill.textContent = t;
        lbTags.appendChild(pill);
      });
    }
    if (lbLink) {
      lbLink.hidden = !wikiId;
      if (wikiId) lbLink.href = "/wiki/" + wikiId;
    }

    if (lbDots) {
      lbDots.innerHTML = "";
      lbDots.hidden = images.length <= 1;
      images.forEach(function (_, i) {
        var d = document.createElement("button");
        d.type = "button";
        d.className = "gallery-lb-dot" + (i === lbImgIndex ? " active" : "");
        d.addEventListener("click", function () { lbImgIndex = i; renderLightbox(); });
        lbDots.appendChild(d);
      });
    }

    var atFirst = lbCardIndex === 0 && lbImgIndex === 0;
    var atLast  = lbCardIndex === lbVisible.length - 1 && lbImgIndex === images.length - 1;
    if (lbPrev) lbPrev.hidden = atFirst;
    if (lbNext) lbNext.hidden = atLast;
  }

  function openLightbox(cardIdx, imgIdx) {
    if (!lightbox || !lbVisible.length) return;
    lbCardIndex = Math.max(0, Math.min(cardIdx, lbVisible.length - 1));
    var images = currentImages();
    lbImgIndex = Math.max(0, Math.min(imgIdx || 0, Math.max(images.length - 1, 0)));
    renderLightbox();
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    document.body.style.overflow = "";
    if (lbImg) lbImg.src = "";
  }

  function navigate(dir) {
    var images = currentImages();
    var nextImgIdx = lbImgIndex + dir;
    if (nextImgIdx >= 0 && nextImgIdx < images.length) {
      lbImgIndex = nextImgIdx;
      renderLightbox();
      return;
    }
    var nextCardIdx = lbCardIndex + dir;
    if (nextCardIdx < 0 || nextCardIdx >= lbVisible.length) return;
    lbCardIndex = nextCardIdx;
    var nextImages = currentImages();
    lbImgIndex = dir > 0 ? 0 : Math.max(nextImages.length - 1, 0);
    renderLightbox();
  }

  if (lbClose)  lbClose.addEventListener("click", closeLightbox);
  if (lbPrev)   lbPrev.addEventListener("click", function(){ navigate(-1); });
  if (lbNext)   lbNext.addEventListener("click", function(){ navigate(1);  });
  if (lightbox) {
    lightbox.addEventListener("click", function(e) {
      if (e.target === lightbox) closeLightbox();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (!lightbox || lightbox.hidden) return;
    if (e.key === "Escape")     closeLightbox();
    if (e.key === "ArrowLeft")  navigate(-1);
    if (e.key === "ArrowRight") navigate(1);
  });

  var touchStartX = 0;
  if (lightbox) {
    lightbox.addEventListener("touchstart", function(e){ touchStartX = e.touches[0].clientX; }, { passive: true });
    lightbox.addEventListener("touchend", function(e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) navigate(dx < 0 ? 1 : -1);
    });
  }

  if (grid) {
    grid.addEventListener("click", function (e) {
      var card = e.target.closest(".gallery-card");
      if (!card) return;
      if (e.target.closest("a, button, form, label, input")) return;
      buildVisible();
      var idx = lbVisible.indexOf(card);
      if (idx !== -1) openLightbox(idx, 0);
    });
  }

  // ══════════════════════════════════════════════════
  // 5. SÉLECTION GROUPÉE
  // ══════════════════════════════════════════════════
  (function () {
    var selectToggle = document.getElementById("gallery-select-toggle");
    var bulkBar       = document.getElementById("gallery-bulk-bar");
    var bulkCount     = document.getElementById("gallery-bulk-count");
    var bulkCancel    = document.getElementById("gallery-bulk-cancel");
    var bulkDelete    = document.getElementById("gallery-bulk-delete");
    var bulkUltraOn   = document.getElementById("gallery-bulk-ultra-on");
    var bulkUltraOff  = document.getElementById("gallery-bulk-ultra-off");
    if (!grid || !bulkBar) return;

    var checkboxes = Array.from(grid.querySelectorAll(".gallery-select-input"));
    if (selectToggle) selectToggle.hidden = checkboxes.length === 0;

    function selectedIds() {
      return checkboxes.filter(function (cb) { return cb.checked; }).map(function (cb) { return cb.value; });
    }

    function syncBar() {
      var ids = selectedIds();
      bulkBar.hidden = ids.length === 0;
      if (bulkCount) bulkCount.textContent = ids.length + " s\u00e9lectionn\u00e9e" + (ids.length > 1 ? "s" : "");
    }

    checkboxes.forEach(function (cb) { cb.addEventListener("change", syncBar); });

    if (bulkCancel) {
      bulkCancel.addEventListener("click", function () {
        checkboxes.forEach(function (cb) { cb.checked = false; });
        syncBar();
      });
    }

    function runBulk(action) {
      var ids = selectedIds();
      if (!ids.length) return;
      fetch("/galerie/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ids, action: action }),
      }).then(function () { window.location.reload(); });
    }

    if (bulkDelete)  bulkDelete.addEventListener("click", function () { if (window.confirm("Supprimer les images s\u00e9lectionn\u00e9es ?")) runBulk("delete"); });
    if (bulkUltraOn)  bulkUltraOn.addEventListener("click", function () { runBulk("ultra-on"); });
    if (bulkUltraOff) bulkUltraOff.addEventListener("click", function () { runBulk("ultra-off"); });
  })();

  // ══════════════════════════════════════════════════
  // 6. FAVORIS
  // ══════════════════════════════════════════════════
  if (grid) {
    grid.addEventListener("click", function (e) {
      var btn = e.target.closest(".gallery-fav-btn");
      if (!btn) return;
      e.stopPropagation();
      var itemId = btn.dataset.itemId;
      var isActive = btn.classList.contains("active");
      fetch("/favoris/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_type: "gallery", item_id: Number(itemId), action: isActive ? "remove" : "add" }),
      }).then(function(r){ return r.json(); }).then(function(data){
        if (data.ok) btn.classList.toggle("active", !isActive);
      });
    });
  }

})();
