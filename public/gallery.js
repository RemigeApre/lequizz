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
  // 3. FILTRES
  // ══════════════════════════════════════════════════
  var grid         = document.getElementById("gallery-grid");
  var tagFilter    = document.getElementById("gallery-tag-filter");
  var sourceFilter = document.getElementById("gallery-source-filter");
  var searchInput  = document.getElementById("gallery-search");
  var countEl      = document.getElementById("gallery-count");

  var activeTag    = "";
  var activeSource = "";
  var searchQ      = "";

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
      var okSearch   = !q || norm(card.dataset.title).includes(q) ||
                       cardTags.some(function(t){ return norm(t).includes(q); });
      card.hidden = !(okTag && okSource && okSearch);
      if (!card.hidden) shown++;
    });

    if (countEl) {
      var hasFilter = activeTag || activeSource || q;
      countEl.hidden = !hasFilter;
      if (hasFilter) countEl.textContent = shown + "\u00a0image" + (shown > 1 ? "s" : "");
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

  if (searchInput) {
    searchInput.addEventListener("input", function () {
      searchQ = searchInput.value;
      applyFilters();
    });
  }

  // ══════════════════════════════════════════════════
  // 4. LIGHTBOX
  // ══════════════════════════════════════════════════
  var lightbox  = document.getElementById("gallery-lightbox");
  var lbImg     = lightbox ? lightbox.querySelector(".gallery-lb-img")       : null;
  var lbTitle   = lightbox ? lightbox.querySelector(".gallery-lb-title")     : null;
  var lbTags    = lightbox ? lightbox.querySelector(".gallery-lb-tags")      : null;
  var lbLink    = lightbox ? lightbox.querySelector(".gallery-lb-wiki-link") : null;
  var lbNotes   = lightbox ? lightbox.querySelector(".gallery-lb-notes")     : null;
  var lbClose   = lightbox ? lightbox.querySelector(".gallery-lb-close")     : null;
  var lbPrev    = lightbox ? lightbox.querySelector(".gallery-lb-prev")      : null;
  var lbNext    = lightbox ? lightbox.querySelector(".gallery-lb-next")      : null;

  var lbVisible = []; // cards currently visible
  var lbIndex   = 0;

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

  function openLightbox(idx) {
    if (!lightbox || !lbVisible.length) return;
    lbIndex = Math.max(0, Math.min(idx, lbVisible.length - 1));
    var card = lbVisible[lbIndex];
    var src     = card.dataset.src || "";
    var title   = card.dataset.title || "";
    var tags    = (card.dataset.tags || "").split("|").filter(Boolean);
    var wikiId  = card.dataset.wikiId || "";

    if (lbImg)   lbImg.src = src;
    if (lbTitle) lbTitle.textContent = title || "";
    if (lbTags)  {
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

    lbPrev.hidden = lbIndex === 0;
    lbNext.hidden = lbIndex === lbVisible.length - 1;

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
    openLightbox(lbIndex + dir);
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
      // Ne pas ouvrir si on clique sur un lien/bouton/form
      if (e.target.closest("a, button, form")) return;
      buildVisible();
      var idx = lbVisible.indexOf(card);
      if (idx !== -1) openLightbox(idx);
    });
  }

  // ══════════════════════════════════════════════════
  // 5. CONFIRMATION SUPPRESSION
  // ══════════════════════════════════════════════════
  document.querySelectorAll(".gallery-delete-form").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      if (!confirm("Supprimer cette image définitivement ?")) e.preventDefault();
    });
  });

})();
