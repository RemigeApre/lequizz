(function () {
  "use strict";

  var CAT_HUES = { fantasmes:330, jeu_de_role:60, partenaires:210, pratique:5, position:270, lieux:140, objets:28, tenues:175, autre:220 };

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
  // 2. UPLOAD FORM TOGGLE + PRÉVISUALISATIONS
  // ══════════════════════════════════════════════════
  var newBtn      = document.getElementById("gallery-new-btn");
  var uploadPanel = document.getElementById("gallery-upload-panel");
  var cancelBtn   = document.getElementById("gallery-upload-cancel");
  var fileInput   = uploadPanel ? uploadPanel.querySelector(".gallery-file-input") : null;
  var previewZone = document.getElementById("gallery-upload-previews");

  if (newBtn && uploadPanel) {
    newBtn.addEventListener("click", function () {
      uploadPanel.hidden = !uploadPanel.hidden;
      newBtn.textContent = uploadPanel.hidden ? "+ Ajouter des images" : "Annuler";
    });
  }
  if (cancelBtn && uploadPanel) {
    cancelBtn.addEventListener("click", function () {
      uploadPanel.hidden = true;
      if (newBtn) newBtn.textContent = "+ Ajouter des images";
    });
  }

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
  // 3. FILTRES (source, catégorie, tag, recherche, ultra)
  // ══════════════════════════════════════════════════
  var grid            = document.getElementById("gallery-grid");
  var tagFilter        = document.getElementById("gallery-tag-filter");
  var sourceFilter     = document.getElementById("gallery-source-filter");
  var categoryFilter   = document.getElementById("gallery-category-filter");
  var searchInput      = document.getElementById("gallery-search");
  var countEl          = document.getElementById("gallery-count");
  var filtersPanel     = document.getElementById("gallery-filters-panel");

  var activeTag      = "";
  var activeSource    = "";
  var activeCategory  = "";
  var searchQ         = "";
  var hideUltra        = localStorage.getItem("gallery-hide-ultra") !== "0";

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
      var okTag      = !activeTag || cardTags.indexOf(activeTag) !== -1;
      var okSource   = !activeSource || card.dataset.source === activeSource;
      var okCategory = !activeCategory || card.dataset.category === activeCategory;
      var okSearch   = !q || norm(card.dataset.title).includes(q) ||
                       cardTags.some(function(t){ return norm(t).includes(q); });
      var okUltra    = !hideUltra || card.dataset.ultra !== "1";
      card.hidden = !(okTag && okSource && okCategory && okSearch && okUltra);
      if (!card.hidden) shown++;
    });

    if (countEl) {
      var hasFilter = activeTag || activeSource || activeCategory || q || hideUltra;
      countEl.hidden = !hasFilter;
      if (hasFilter) countEl.textContent = shown + " image" + (shown > 1 ? "s" : "");
    }
  }

  if (tagFilter) {
    tagFilter.querySelectorAll(".tag-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        tagFilter.querySelectorAll(".tag-chip").forEach(function(c){ c.classList.remove("active"); });
        chip.classList.add("active");
        activeTag = (chip.dataset.tag || "").toLowerCase();
        applyFilters();
      });
    });
  }

  if (sourceFilter) {
    sourceFilter.querySelectorAll(".tag-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        sourceFilter.querySelectorAll(".tag-chip").forEach(function(c){ c.classList.remove("active"); });
        chip.classList.add("active");
        activeSource = chip.dataset.source || "";
        applyFilters();
      });
    });
  }

  if (categoryFilter) {
    categoryFilter.querySelectorAll(".tag-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        categoryFilter.querySelectorAll(".tag-chip").forEach(function(c){ c.classList.remove("active"); });
        chip.classList.add("active");
        activeCategory = chip.dataset.category || "";
        applyFilters();
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      searchQ = searchInput.value;
      applyFilters();
    });
  }

  var ultraToggle = document.getElementById("gallery-ultra-toggle");
  function syncUltraBtn() {
    if (!ultraToggle) return;
    ultraToggle.textContent = hideUltra ? "🔒 Masquer Ultra" : "🔓 Afficher Ultra";
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

  // Ouvre le volet filtres tout seul si un filtre est déjà actif au chargement
  if (filtersPanel && (activeTag || activeSource || activeCategory || searchQ || hideUltra)) {
    filtersPanel.open = true;
  }

  applyFilters();

  // ══════════════════════════════════════════════════
  // 4. LIGHTBOX (album-aware : plusieurs images par carte)
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

  var lbVisible    = []; // cartes actuellement visibles
  var lbCardIndex  = 0;
  var lbImgIndex   = 0;  // position dans l'album de la carte courante

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

  // Swipe tactile
  var touchStartX = 0;
  if (lightbox) {
    lightbox.addEventListener("touchstart", function(e){ touchStartX = e.touches[0].clientX; }, { passive: true });
    lightbox.addEventListener("touchend", function(e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) navigate(dx < 0 ? 1 : -1);
    });
  }

  // Ouvrir sur clic de la carte image
  if (grid) {
    grid.addEventListener("click", function (e) {
      var card = e.target.closest(".gallery-card");
      if (!card) return;
      // Ne pas ouvrir si on clique sur un lien/bouton/form/case à cocher
      if (e.target.closest("a, button, form, label, input")) return;
      buildVisible();
      var idx = lbVisible.indexOf(card);
      if (idx !== -1) openLightbox(idx, 0);
    });
  }

  // ══════════════════════════════════════════════════
  // 5. SÉLECTION GROUPÉE (cartes de galerie uniquement, jamais le wiki)
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
      if (bulkCount) bulkCount.textContent = ids.length + " sélectionnée" + (ids.length > 1 ? "s" : "");
    }

    checkboxes.forEach(function (cb) {
      cb.addEventListener("change", syncBar);
    });

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

    if (bulkDelete) {
      bulkDelete.addEventListener("click", function () {
        if (window.confirm("Supprimer les images sélectionnées ?")) runBulk("delete");
      });
    }
    if (bulkUltraOn)  bulkUltraOn.addEventListener("click", function () { runBulk("ultra-on"); });
    if (bulkUltraOff) bulkUltraOff.addEventListener("click", function () { runBulk("ultra-off"); });
  })();

  // ══════════════════════════════════════════════════
  // 6. LIER UNE PAGE WIKI (formulaire d'édition d'une image)
  // ══════════════════════════════════════════════════
  (function () {
    var hidden     = document.getElementById("gallery-wiki-link-hidden");
    var currentBox = document.getElementById("gallery-wiki-link-current");
    var removeBtn  = document.getElementById("gallery-wiki-link-remove");
    var searchWrap = document.getElementById("gallery-wiki-link-search-wrap");
    var searchIn   = document.getElementById("gallery-wiki-link-search");
    var resultsEl  = document.getElementById("gallery-wiki-link-results");
    if (!hidden || !searchWrap || !searchIn || !resultsEl) return;

    var searchTimer;

    if (removeBtn) {
      removeBtn.addEventListener("click", function () {
        hidden.value = "";
        if (currentBox) currentBox.hidden = true;
        searchWrap.hidden = false;
      });
    }

    searchIn.addEventListener("input", function () {
      clearTimeout(searchTimer);
      var q = searchIn.value.trim();
      if (!q) { resultsEl.innerHTML = ""; return; }
      searchTimer = setTimeout(function () {
        fetch("/wiki/search?q=" + encodeURIComponent(q))
          .then(function (r) { return r.json(); })
          .then(function (pages) {
            resultsEl.innerHTML = "";
            pages.forEach(function (p) {
              var hue = CAT_HUES[p.category] || 220;
              var li = document.createElement("li");
              li.className = "wiki-pl-result-item";
              li.innerHTML = '<span class="wiki-pl-result-badge" style="background:hsl(' + hue + ',55%,45%)">' + p.category + '</span><span>' + p.title + '</span>';
              li.addEventListener("click", function () {
                hidden.value = p.id;
                searchIn.value = "";
                resultsEl.innerHTML = "";
                searchWrap.hidden = true;
                if (currentBox) {
                  currentBox.hidden = false;
                  currentBox.innerHTML = "";
                  var a = document.createElement("a");
                  a.href = "/wiki/" + p.id;
                  a.target = "_blank";
                  a.rel = "noopener";
                  a.className = "wiki-pl-card";
                  var badge = document.createElement("span");
                  badge.className = "wiki-pl-badge";
                  badge.style.background = "hsl(" + hue + ",55%,45%)";
                  badge.textContent = p.category;
                  var titleEl = document.createElement("span");
                  titleEl.className = "wiki-pl-title";
                  titleEl.textContent = p.title;
                  a.appendChild(badge);
                  a.appendChild(titleEl);
                  var rm = document.createElement("button");
                  rm.type = "button";
                  rm.className = "item-wiki-popover-remove";
                  rm.title = "Retirer le lien";
                  rm.innerHTML = "&#215;";
                  rm.addEventListener("click", function () {
                    hidden.value = "";
                    currentBox.hidden = true;
                    searchWrap.hidden = false;
                  });
                  currentBox.appendChild(a);
                  currentBox.appendChild(rm);
                }
              });
              resultsEl.appendChild(li);
            });
          });
      }, 200);
    });
  })();

  // ══════════════════════════════════════════════════
  // 7. FAVORI — bouton sur chaque carte galerie
  // ══════════════════════════════════════════════════
  (function () {
    document.querySelectorAll(".gallery-fav-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        fetch("/favoris/toggle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemType: "gallery", itemId: Number(btn.dataset.itemId) }),
        })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d.ok) btn.classList.toggle("active", d.active);
          });
      });
    });
  })();

})();
