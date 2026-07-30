(function () {
  "use strict";

  // ══════════════════════════════════════════════════
  // 1. MARKDOWN RENDERER
  // ══════════════════════════════════════════════════
  function esc(s) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }
  function inline(s) {
    return s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,     "<em>$1</em>")
      .replace(/`(.+?)`/g,       "<code>$1</code>");
  }
  function renderMarkdown(text) {
    if (!text) return "";
    var lines = text.split("\n"), out = [], inList = false;
    function closeList() { if (inList) { out.push("</ul>"); inList = false; } }
    lines.forEach(function (raw) {
      var line = esc(raw);
      if      (/^## /.test(line))   { closeList(); out.push("<h2>" + inline(line.slice(3)) + "</h2>"); }
      else if (/^### /.test(line))  { closeList(); out.push("<h3>" + inline(line.slice(4)) + "</h3>"); }
      else if (/^---+\s*$/.test(line)) { closeList(); out.push("<hr />"); }
      else if (/^- /.test(line))    { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + inline(line.slice(2)) + "</li>"); }
      else if (line.trim() === "")  { closeList(); }
      else                          { closeList(); out.push("<p>" + inline(line) + "</p>"); }
    });
    closeList();
    return out.join("\n");
  }

  // Rendu du contenu dans la page détail
  document.querySelectorAll(".wiki-md").forEach(function (el) {
    var raw = el.querySelector(".wiki-md-raw");
    if (!raw) return;
    el.innerHTML = renderMarkdown(raw.textContent || raw.innerText);
  });

  // ══════════════════════════════════════════════════
  // 2. COULEURS DES TAGS (hash → teinte HSL)
  // ══════════════════════════════════════════════════
  var TAG_HUES = [4, 28, 48, 140, 175, 210, 270, 330];
  function tagHue(tag) {
    var h = 0, s = tag.toLowerCase();
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return TAG_HUES[Math.abs(h) % TAG_HUES.length];
  }
  // Applique la couleur à tous les pills existants dans le DOM
  function applyTagColors() {
    document.querySelectorAll(".link-tag-pill").forEach(function (el) {
      el.style.setProperty("--h", tagHue(el.textContent.trim()));
    });
  }
  applyTagColors();

  // ══════════════════════════════════════════════════
  // 3. WIDGET TAGS VISUELS
  // ══════════════════════════════════════════════════
  function createChipEl(tag, onRemove) {
    var hue = tagHue(tag);
    var chip = document.createElement("span");
    chip.className = "wiki-chip";
    chip.style.setProperty("--h", hue);
    chip.dataset.tag = tag;
    var text = document.createElement("span");
    text.textContent = tag;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wiki-chip-remove";
    btn.innerHTML = "&#215;";
    btn.title = "Retirer";
    btn.addEventListener("click", function () { onRemove(tag); });
    chip.appendChild(text);
    chip.appendChild(btn);
    return chip;
  }

  function initTagWidget(widget) {
    var board   = widget.querySelector(".wiki-tags-board");
    var typer   = widget.querySelector(".wiki-tags-typing");
    var hidden  = widget.querySelector(".wiki-tags-hidden");
    var suggestBox = widget.querySelector(".wiki-tag-suggestions");
    if (!board || !typer || !hidden) return;

    var tags = [];

    // Initialise depuis la valeur cachée (formulaire d'édition)
    var initVal = (hidden.value || "").trim();
    if (initVal) {
      initVal.split(/[,;]+/).forEach(function (t) {
        var clean = t.trim();
        if (clean && tags.indexOf(clean) === -1) tags.push(clean);
      });
    }

    function syncHidden() {
      hidden.value = tags.join(", ");
    }

    function renderBoard() {
      // Supprime les chips existants (pas le typer)
      Array.from(board.querySelectorAll(".wiki-chip")).forEach(function (c) { c.remove(); });
      // Recrée dans l'ordre
      tags.forEach(function (tag) {
        var chip = createChipEl(tag, removeTag);
        board.insertBefore(chip, typer);
      });
      syncSuggestions();
    }

    function syncSuggestions() {
      if (!suggestBox) return;
      suggestBox.querySelectorAll(".wiki-tag-suggest-chip").forEach(function (chip) {
        chip.classList.toggle("active", tags.indexOf(chip.dataset.tag) !== -1);
      });
    }

    function addTag(raw) {
      raw.split(/[,;]+/).forEach(function (part) {
        var t = part.trim();
        if (t && tags.indexOf(t) === -1) tags.push(t);
      });
      renderBoard();
    }

    function removeTag(tag) {
      var idx = tags.indexOf(tag);
      if (idx !== -1) tags.splice(idx, 1);
      renderBoard();
    }

    // Clavier dans le champ de saisie
    typer.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === "," || e.key === ";") {
        e.preventDefault();
        var val = typer.value.trim();
        if (val) { addTag(val); typer.value = ""; }
      } else if (e.key === "Backspace" && typer.value === "" && tags.length) {
        removeTag(tags[tags.length - 1]);
      }
    });

    // Coller une liste séparée par virgules/points-virgules
    typer.addEventListener("paste", function (e) {
      e.preventDefault();
      var pasted = (e.clipboardData || window.clipboardData).getData("text");
      if (pasted) { addTag(pasted); typer.value = ""; }
    });

    // Clic sur le board (focus le typer)
    board.addEventListener("click", function (e) {
      if (e.target === board) typer.focus();
    });

    // Suggestions
    if (suggestBox) {
      suggestBox.querySelectorAll(".wiki-tag-suggest-chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
          var tag = chip.dataset.tag;
          if (tags.indexOf(tag) === -1) { addTag(tag); }
          else { removeTag(tag); }
        });
      });
    }

    renderBoard();
  }

  document.querySelectorAll(".wiki-tags-widget").forEach(initTagWidget);

  // ══════════════════════════════════════════════════
  // 4. FLOW CRÉATION (étape 1 → étape 2)
  // ══════════════════════════════════════════════════
  var newBtn          = document.getElementById("wiki-new-btn");
  var step1           = document.getElementById("wiki-step1");
  var step2           = document.getElementById("wiki-step2");
  var catInput        = document.getElementById("wiki-new-cat-input");
  var catBadge        = document.getElementById("wiki-new-cat-badge");
  var cancelBtn       = document.getElementById("wiki-cancel-new");
  var newOwned        = document.getElementById("wiki-new-owned");
  var newPosMeta      = step2 ? step2.querySelector(".wiki-position-meta")      : null;
  var newFantasMeta   = step2 ? step2.querySelector(".wiki-fantasmes-meta")     : null;
  var newPartMeta     = step2 ? step2.querySelector(".wiki-partenaires-meta")   : null;
  var newLieuxMeta    = step2 ? step2.querySelector(".wiki-lieux-meta")         : null;

  function showStep(n) {
    if (!step1 || !step2) return;
    step1.hidden = n !== 1;
    step2.hidden = n !== 2;
    if (newBtn) newBtn.textContent = n === 0 ? "+ Nouvelle page" : "Annuler";
  }

  if (newBtn) {
    newBtn.addEventListener("click", function () {
      if (!step1.hidden || !step2.hidden) { showStep(0); }
      else { showStep(1); }
    });
  }

  if (step1) {
    step1.querySelectorAll(".wiki-cat-card").forEach(function (card) {
      card.addEventListener("click", function () {
        var key   = card.dataset.category;
        var hue   = card.dataset.hue  || 220;
        var label = card.dataset.label || key;
        if (catInput) catInput.value = key;
        if (catBadge) {
          catBadge.textContent = label;
          catBadge.style.background = "hsl(" + hue + ", 55%, 45%)";
        }
        if (newOwned)      newOwned.hidden      = key !== "objets" && key !== "tenues";
        if (newFantasMeta) newFantasMeta.hidden  = key !== "fantasmes";
        if (newPartMeta)   newPartMeta.hidden    = key !== "partenaires";
        if (newLieuxMeta)  newLieuxMeta.hidden   = key !== "lieux";
        if (newPosMeta)    newPosMeta.hidden      = key !== "position";
        showStep(2);
      });
    });
  }

  // Badge cliquable pour revenir à l'étape 1
  if (catBadge) {
    catBadge.addEventListener("click", function () { showStep(1); });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () { showStep(0); });
  }

  // ══════════════════════════════════════════════════
  // 5. FORMULAIRE ÉDITION : catégorie + champs conditionnels
  // ══════════════════════════════════════════════════
  var editCatSelect   = document.getElementById("wiki-category-select");
  var editOwned       = document.getElementById("wiki-owned-field");
  var editPosMeta     = document.querySelector("#wiki-edit-form .wiki-position-meta");
  var editFantasMeta  = document.querySelector("#wiki-edit-form .wiki-fantasmes-meta");
  var editPartMeta    = document.querySelector("#wiki-edit-form .wiki-partenaires-meta");
  var editLieuxMeta   = document.querySelector("#wiki-edit-form .wiki-lieux-meta");

  function syncEditFields() {
    if (!editCatSelect) return;
    var cat = editCatSelect.value;
    if (editOwned)      editOwned.hidden      = cat !== "objets" && cat !== "tenues";
    if (editFantasMeta) editFantasMeta.hidden  = cat !== "fantasmes";
    if (editPartMeta)   editPartMeta.hidden    = cat !== "partenaires";
    if (editLieuxMeta)  editLieuxMeta.hidden   = cat !== "lieux";
    if (editPosMeta)    editPosMeta.hidden      = cat !== "position";
    // Couleur du select (optionnel, via data-hue)
    var opt = editCatSelect.options[editCatSelect.selectedIndex];
    if (opt && opt.dataset.hue) {
      editCatSelect.style.color = "hsl(" + opt.dataset.hue + ", 55%, 40%)";
    }
  }
  if (editCatSelect) {
    editCatSelect.addEventListener("change", syncEditFields);
    syncEditFields();
  }

  // ══════════════════════════════════════════════════
  // 6. FILTRES GRILLE (catégorie + tag)
  // ══════════════════════════════════════════════════
  var categoryFilter = document.getElementById("wiki-category-filter");
  var tagFilter      = document.getElementById("wiki-tag-filter");
  var wikiList       = document.getElementById("wiki-list");
  var activeCategory = "", activeTag = "";

  function applyFilters() {
    if (!wikiList) return;
    wikiList.querySelectorAll(".wiki-card").forEach(function (card) {
      var okCat = !activeCategory ||
        (activeCategory === "__owned__" ? card.dataset.owned === "1" : card.dataset.category === activeCategory);
      var cardTags = (card.dataset.tags || "").split("|");
      var okTag  = !activeTag || cardTags.indexOf(activeTag) !== -1;
      card.hidden = !(okCat && okTag);
    });
  }

  if (categoryFilter) {
    categoryFilter.querySelectorAll(".tag-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        categoryFilter.querySelectorAll(".tag-chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        activeCategory = chip.dataset.category || "";
        applyFilters();
      });
    });
  }
  if (tagFilter) {
    tagFilter.querySelectorAll(".tag-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        tagFilter.querySelectorAll(".tag-chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        activeTag = (chip.dataset.tag || "").toLowerCase();
        applyFilters();
      });
    });
  }

  // ══════════════════════════════════════════════════
  // 7. AUTO-RESIZE TEXTAREA
  // ══════════════════════════════════════════════════
  function autoResize(ta) {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }
  document.querySelectorAll(".wiki-textarea").forEach(function (ta) {
    ta.addEventListener("input", function () { autoResize(ta); });
    autoResize(ta);
  });

  // ══════════════════════════════════════════════════
  // 8. PREVIEW IMAGES MULTIPLES + SUPPRESSION
  // ══════════════════════════════════════════════════
  document.querySelectorAll(".wiki-image-field").forEach(function (wrapper) {
    var input        = wrapper.querySelector(".wiki-image-input");
    var previewsZone = wrapper.querySelector(".wiki-new-previews");
    if (!input || !previewsZone) return;

    // DataTransfer permet de reconstruire la FileList après suppression d'un fichier
    var currentFiles = [];

    function rebuildInput() {
      var dt = new DataTransfer();
      currentFiles.forEach(function (f) { dt.items.add(f); });
      input.files = dt.files;
    }

    function renderPreviews() {
      previewsZone.innerHTML = "";
      currentFiles.forEach(function (file, idx) {
        var wrap = document.createElement("div");
        wrap.className = "wiki-new-preview-wrap";

        var img = document.createElement("img");
        img.className = "wiki-new-preview-img";
        img.src = URL.createObjectURL(file);
        img.alt = "";
        img.addEventListener("click", function () { openLightbox(img.src); });

        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "wiki-preview-remove";
        removeBtn.innerHTML = "&#215;";
        removeBtn.title = "Retirer";
        removeBtn.addEventListener("click", function () {
          currentFiles.splice(idx, 1);
          rebuildInput();
          renderPreviews();
        });

        wrap.appendChild(img);
        wrap.appendChild(removeBtn);
        previewsZone.appendChild(wrap);
      });
    }

    input.addEventListener("change", function () {
      currentFiles = Array.from(input.files || []);
      renderPreviews();
    });
  });

  // ══════════════════════════════════════════════════
  // LIGHTBOX
  // ══════════════════════════════════════════════════
  var lightbox = document.createElement("div");
  lightbox.className = "wiki-lightbox";
  lightbox.innerHTML = '<img class="wiki-lightbox-img" alt="" />';
  lightbox.hidden = true;
  document.body.appendChild(lightbox);

  var lbImg = lightbox.querySelector(".wiki-lightbox-img");

  function openLightbox(src) {
    lbImg.src = src;
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lbImg.src = "";
    document.body.style.overflow = "";
  }

  lightbox.addEventListener("click", function (e) {
    if (e.target === lightbox) closeLightbox();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !lightbox.hidden) closeLightbox();
  });

  // Rend cliquables toutes les images de la galerie et des formulaires
  function attachLightboxToImages() {
    document.querySelectorAll(".wiki-infobox-img, .wiki-gallery-img, .wiki-form-existing-image, .wiki-card-img").forEach(function (img) {
      if (img.dataset.lbBound) return;
      img.dataset.lbBound = "1";
      img.style.cursor = "zoom-in";
      img.addEventListener("click", function () { openLightbox(img.src); });
    });
  }
  attachLightboxToImages();

  // ══════════════════════════════════════════════════
  // 9. TOOLBAR MARKDOWN
  // ══════════════════════════════════════════════════
  function insertMd(ta, action) {
    var start = ta.selectionStart, end = ta.selectionEnd;
    var sel   = ta.value.slice(start, end);
    var before = ta.value.slice(0, start), after = ta.value.slice(end);
    var insert, cursor;

    switch (action) {
      case "bold":
        insert = "**" + (sel || "texte") + "**";
        cursor = sel ? start + insert.length : start + 2;
        break;
      case "italic":
        insert = "*" + (sel || "texte") + "*";
        cursor = sel ? start + insert.length : start + 1;
        break;
      case "h2": {
        var ls = before.lastIndexOf("\n") + 1;
        var lt = before.slice(ls).replace(/^#{1,6}\s*/, "");
        before = before.slice(0, ls) + "## " + lt;
        ta.value = before + sel + after;
        ta.selectionStart = ta.selectionEnd = before.length + sel.length;
        autoResize(ta); ta.focus(); return;
      }
      case "h3": {
        var ls3 = before.lastIndexOf("\n") + 1;
        var lt3 = before.slice(ls3).replace(/^#{1,6}\s*/, "");
        before = before.slice(0, ls3) + "### " + lt3;
        ta.value = before + sel + after;
        ta.selectionStart = ta.selectionEnd = before.length + sel.length;
        autoResize(ta); ta.focus(); return;
      }
      case "list":
        insert = sel ? sel.split("\n").map(function (l) { return "- " + l; }).join("\n") : "- ";
        cursor = start + insert.length;
        break;
      case "hr":
        insert = (before === "" || before.endsWith("\n") ? "" : "\n") + "---\n";
        cursor = start + insert.length;
        break;
      default: return;
    }
    ta.value = before + insert + after;
    ta.selectionStart = ta.selectionEnd = cursor;
    autoResize(ta); ta.focus();
  }

  document.querySelectorAll(".md-toolbar").forEach(function (toolbar) {
    var editor  = toolbar.closest(".wiki-editor");
    if (!editor) return;
    var ta      = editor.querySelector(".wiki-textarea");
    var preview = editor.querySelector(".wiki-md-preview");
    var prevBtn = toolbar.querySelector(".md-preview-btn");
    var showing = false;
    if (!ta) return;

    toolbar.querySelectorAll("[data-md]").forEach(function (btn) {
      btn.addEventListener("click", function (e) { e.preventDefault(); insertMd(ta, btn.dataset.md); });
    });

    ta.addEventListener("keydown", function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "b") { e.preventDefault(); insertMd(ta, "bold"); }
      if (e.key === "i") { e.preventDefault(); insertMd(ta, "italic"); }
    });

    if (prevBtn && preview) {
      prevBtn.addEventListener("click", function (e) {
        e.preventDefault();
        showing = !showing;
        if (showing) {
          preview.innerHTML = renderMarkdown(ta.value) || "<p class=\"wiki-md-empty\">Rien \u00e0 afficher.</p>";
          ta.hidden = true; preview.hidden = false;
          prevBtn.textContent = "\u00c9diter"; prevBtn.classList.add("active");
        } else {
          ta.hidden = false; preview.hidden = true;
          prevBtn.textContent = "Aper\u00e7u"; prevBtn.classList.remove("active");
        }
      });
    }
  });

  // ══════════════════════════════════════════════════
  // 10. SOUMISSION
  // ══════════════════════════════════════════════════
  document.querySelectorAll(".wiki-form").forEach(function (form) {
    form.addEventListener("submit", function () {
      // Réaffiche la textarea si en mode aperçu (sinon son contenu ne part pas)
      var ta = form.querySelector(".wiki-textarea");
      if (ta) ta.hidden = false;
      var btn = form.querySelector("button[type=\"submit\"]");
      if (btn) { btn.disabled = true; btn.textContent = "Enregistrement\u2026"; }
    });
  });

  document.querySelectorAll(".link-delete-form, .link-delete-form-inline").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      if (!window.confirm("Supprimer cette page ?")) e.preventDefault();
    });
  });

})();
