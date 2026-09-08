(function () {
  "use strict";

  // ══════════════════════════════════════════════════
  // 1. MARKDOWN RENDERER
  // ══════════════════════════════════════════════════
  function esc(s) {
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  // Table titre (minuscules) → id, lue depuis #wiki-existing-pages si présent
  // sur la page (détail d'une page, formulaire d'édition/création).
  var wikiTitleMap = null;
  function getWikiTitleMap() {
    if (wikiTitleMap) return wikiTitleMap;
    wikiTitleMap = {};
    var el = document.getElementById("wiki-existing-pages");
    if (el) {
      try {
        JSON.parse(el.textContent || el.innerText).forEach(function (p) {
          wikiTitleMap[String(p.title).toLowerCase().trim()] = p.id;
        });
      } catch (_) {}
    }
    return wikiTitleMap;
  }

  function inline(s) {
    return s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g,     "<em>$1</em>")
      .replace(/`(.+?)`/g,       "<code>$1</code>")
      // [[Titre d'une autre page]] → lien élégant, intégrable dans une phrase
      .replace(/\[\[(.+?)\]\]/g, function (m, title) {
        var id = getWikiTitleMap()[title.toLowerCase().trim()];
        return id ? '<a class="wiki-inline-link" href="/wiki/' + id + '">' + title + '</a>' : title;
      });
  }
  // Rend une suite de lignes (déjà échappées) en HTML ; ## n'est pas géré
  // ici, il sert de séparateur de section plus haut dans renderMarkdown.
  function renderLines(lines) {
    var out = [], inList = false;
    function closeList() { if (inList) { out.push("</ul>"); inList = false; } }
    lines.forEach(function (line) {
      if      (/^### /.test(line))  { closeList(); out.push("<h3>" + inline(line.slice(4)) + "</h3>"); }
      else if (/^---+\s*$/.test(line)) { closeList(); out.push("<hr />"); }
      else if (/^- /.test(line))    { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + inline(line.slice(2)) + "</li>"); }
      else if (line.trim() === "")  { closeList(); }
      else                          { closeList(); out.push("<p>" + inline(line) + "</p>"); }
    });
    closeList();
    return out.join("\n");
  }

  // Un "## Titre" démarre une nouvelle section repliable (accordéon) ;
  // tout ce qui précède le premier "##" est la section principale,
  // toujours affichée, jamais repliable.
  function renderMarkdown(text) {
    if (!text) return "";
    var lines = text.split("\n");
    var sections = [{ heading: null, lines: [] }];
    lines.forEach(function (raw) {
      var line = esc(raw);
      if (/^## /.test(line)) {
        sections.push({ heading: inline(line.slice(3)), lines: [] });
      } else {
        sections[sections.length - 1].lines.push(line);
      }
    });
    return sections.map(function (sec, i) {
      var body = renderLines(sec.lines);
      if (i === 0) return body;
      return '<details class="wiki-section">' +
        '<summary class="wiki-section-summary">' + sec.heading + '</summary>' +
        '<div class="wiki-section-body">' + body + '</div>' +
      '</details>';
    }).join("\n");
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
  // isDerived : widget des synonymes, où chaque terme peut être marqué
  // "anglais" individuellement via un petit bouton EN sur sa puce
  // (remplace l'ancien réglage global qui s'appliquait à tort à tous
  // les synonymes en même temps).
  function createChipEl(item, onRemove, isDerived, onToggleEn) {
    var hue = tagHue(item.term);
    var chip = document.createElement("span");
    chip.className = "wiki-chip";
    chip.style.setProperty("--h", hue);
    chip.dataset.tag = item.term;
    var text = document.createElement("span");
    text.textContent = item.term;
    chip.appendChild(text);
    if (isDerived) {
      var enBtn = document.createElement("button");
      enBtn.type = "button";
      enBtn.className = "wiki-chip-en" + (item.en ? " active" : "");
      enBtn.textContent = "EN";
      enBtn.title = item.en ? "Terme anglais (cliquer pour retirer)" : "Marquer comme terme anglais";
      enBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        onToggleEn(item.term);
      });
      chip.appendChild(enBtn);
    }
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wiki-chip-remove";
    btn.innerHTML = "&#215;";
    btn.title = "Retirer";
    btn.addEventListener("click", function () { onRemove(item.term); });
    chip.appendChild(btn);
    return chip;
  }

  function initTagWidget(widget) {
    var board   = widget.querySelector(".wiki-tags-board");
    var typer   = widget.querySelector(".wiki-tags-typing");
    var hidden  = widget.querySelector(".wiki-tags-hidden");
    var suggestBox = widget.querySelector(".wiki-tag-suggestions");
    if (!board || !typer || !hidden) return;

    var isDerived = widget.classList.contains("wiki-derived-widget");
    var tags = []; // { term, en }

    function findTag(term) {
      for (var i = 0; i < tags.length; i++) if (tags[i].term === term) return tags[i];
      return null;
    }

    // Initialise depuis la valeur cachée (formulaire d'édition) ; un
    // terme dérivé anglais porte le suffixe interne "::en".
    var initVal = (hidden.value || "").trim();
    if (initVal) {
      initVal.split(/[,;]+/).forEach(function (raw) {
        var t = raw.trim();
        if (!t) return;
        var en = false;
        if (isDerived && /::en$/.test(t)) { en = true; t = t.replace(/::en$/, "").trim(); }
        if (t && !findTag(t)) tags.push({ term: t, en: en });
      });
    }

    function syncHidden() {
      hidden.value = tags.map(function (t) {
        return isDerived && t.en ? t.term + "::en" : t.term;
      }).join(", ");
    }

    function renderBoard() {
      // Supprime les chips existants (pas le typer)
      Array.from(board.querySelectorAll(".wiki-chip")).forEach(function (c) { c.remove(); });
      // Recrée dans l'ordre
      tags.forEach(function (t) {
        var chip = createChipEl(t, removeTag, isDerived, toggleEn);
        board.insertBefore(chip, typer);
      });
      syncHidden();
      syncSuggestions();
    }

    function syncSuggestions() {
      if (!suggestBox) return;
      suggestBox.querySelectorAll(".wiki-tag-suggest-chip").forEach(function (chip) {
        chip.classList.toggle("active", !!findTag(chip.dataset.tag));
      });
    }

    function addTag(raw) {
      raw.split(/[,;]+/).forEach(function (part) {
        var t = part.trim();
        if (t && !findTag(t)) tags.push({ term: t, en: false });
      });
      renderBoard();
    }

    function removeTag(term) {
      var idx = -1;
      for (var i = 0; i < tags.length; i++) if (tags[i].term === term) { idx = i; break; }
      if (idx !== -1) tags.splice(idx, 1);
      renderBoard();
    }

    function toggleEn(term) {
      var item = findTag(term);
      if (item) { item.en = !item.en; renderBoard(); }
    }

    // Clavier dans le champ de saisie
    typer.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === "," || e.key === ";") {
        e.preventDefault();
        var val = typer.value.trim();
        if (val) { addTag(val); typer.value = ""; }
      } else if (e.key === "Backspace" && typer.value === "" && tags.length) {
        removeTag(tags[tags.length - 1].term);
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
          if (!findTag(tag)) { addTag(tag); }
          else { removeTag(tag); }
        });
      });
    }

    renderBoard();
  }

  document.querySelectorAll(".wiki-tags-widget").forEach(initTagWidget);

  // ══════════════════════════════════════════════════
  // 3b. AVERTISSEMENT TITRE DUPLIQUÉ
  // ══════════════════════════════════════════════════
  (function () {
    var titleInput = document.getElementById("wiki-new-title");
    var warnBox    = document.getElementById("wiki-title-warn");
    var pagesEl    = document.getElementById("wiki-existing-pages");
    if (!titleInput || !warnBox || !pagesEl) return;

    var existingPages = [];
    try { existingPages = JSON.parse(pagesEl.textContent); } catch (_) {}

    // Flag : l'utilisateur a explicitement confirmé la création malgré le doublon
    var userConfirmed = false;

    function normalize(s) {
      return s.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    function findSimilar(query) {
      var q = normalize(query);
      if (q.length < 2) return [];
      return existingPages.filter(function (p) {
        var t = normalize(p.title);
        return t === q || t.includes(q) || q.includes(t);
      });
    }

    function renderWarn(matches) {
      userConfirmed = false;
      warnBox.innerHTML = "";

      var msg = document.createElement("span");
      msg.innerHTML = "\u26A0\uFE0F Page similaire d\u00e9j\u00e0 existante\u00a0: " +
        matches.map(function (p) {
          return '<a href="/wiki/' + p.id + '" target="_blank" class="wiki-warn-link">' + p.title + "</a>";
        }).join(", ");
      warnBox.appendChild(msg);

      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wiki-warn-confirm";
      btn.textContent = "Cr\u00e9er quand m\u00eame";
      btn.addEventListener("click", function () {
        userConfirmed = true;
        warnBox.hidden = true;
        // Soumettre le formulaire directement
        var form = document.getElementById("wiki-new-form");
        if (form) form.submit();
      });
      warnBox.appendChild(btn);
      warnBox.hidden = false;
    }

    var warnTimer;
    titleInput.addEventListener("input", function () {
      userConfirmed = false;
      clearTimeout(warnTimer);
      warnTimer = setTimeout(function () {
        var matches = findSimilar(titleInput.value.trim());
        if (!matches.length) { warnBox.hidden = true; warnBox.innerHTML = ""; return; }
        renderWarn(matches);
      }, 350);
    });

    // Bloque la soumission si warning visible et non confirmé
    var form = document.getElementById("wiki-new-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        if (!warnBox.hidden && !userConfirmed) {
          e.preventDefault();
          var btn = warnBox.querySelector(".wiki-warn-confirm");
          if (btn) {
            btn.style.outline = "2px solid #e53";
            setTimeout(function () { btn.style.outline = ""; }, 1200);
          }
        }
      });
    }
  })();

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
  var newObjetsMeta   = step2 ? step2.querySelector(".wiki-objets-meta")        : null;

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
        if (newObjetsMeta) newObjetsMeta.hidden   = key !== "objets";
        // Cache la catégorie principale dans les options supplémentaires
        var newExtraOpts = document.querySelectorAll("#wiki-new-extra-cats .wiki-extra-cat-option");
        newExtraOpts.forEach(function (opt) {
          var hide = opt.dataset.cat === key;
          opt.hidden = hide;
          if (hide) opt.querySelector("input").checked = false;
        });
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
  var editObjetsMeta  = document.querySelector("#wiki-edit-form .wiki-objets-meta");

  function syncEditFields() {
    if (!editCatSelect) return;
    var cat = editCatSelect.value;
    if (editOwned)      editOwned.hidden      = cat !== "objets" && cat !== "tenues";
    if (editFantasMeta) editFantasMeta.hidden  = cat !== "fantasmes";
    if (editPartMeta)   editPartMeta.hidden    = cat !== "partenaires";
    if (editLieuxMeta)  editLieuxMeta.hidden   = cat !== "lieux";
    if (editPosMeta)    editPosMeta.hidden      = cat !== "position";
    if (editObjetsMeta) editObjetsMeta.hidden   = cat !== "objets";
    // Cache la catégorie principale dans les options supplémentaires
    var editExtraOpts = document.querySelectorAll("#wiki-edit-extra-cats .wiki-extra-cat-option");
    editExtraOpts.forEach(function (opt) {
      var hide = opt.dataset.cat === cat;
      opt.hidden = hide;
      if (hide) opt.querySelector("input").checked = false;
    });
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
  // 6. RÉACTIONS (étoiles, flamme, intérêt)
  // La note (étoiles) vit désormais dans son propre bloc, au-dessus de
  // l'image principale ; flamme/intérêt restent dans .wiki-react plus
  // bas. Les deux partagent le même data-id et sont sauvegardés
  // ensemble via le même endpoint.
  // ══════════════════════════════════════════════════
  var ratingWidget = document.querySelector(".wiki-detail-rating");
  var reactWidget  = document.querySelector(".wiki-react");
  if (ratingWidget || reactWidget) {
    var reactId       = (ratingWidget || reactWidget).dataset.id;
    var reactRating   = Number((ratingWidget || reactWidget).dataset.rating) || 0;
    var reactFlame    = reactWidget ? reactWidget.dataset.flame === "1" : false;
    var reactInterest = reactWidget ? reactWidget.dataset.interested === "1" : false;

    var starBtns = (ratingWidget || reactWidget).querySelectorAll(".wiki-star");
    var flamBtn  = reactWidget ? reactWidget.querySelector("[data-key='flame']") : null;
    var intrBtn  = reactWidget ? reactWidget.querySelector("[data-key='interested']") : null;

    function save() {
      fetch("/wiki/" + reactId + "/react", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: reactRating, flame: reactFlame, interested: reactInterest }),
      });
    }

    function renderStars() {
      starBtns.forEach(function (btn) {
        var v = Number(btn.dataset.value);
        btn.innerHTML = v <= reactRating ? "&#9733;" : "&#9734;";
        btn.classList.toggle("active", v <= reactRating);
      });
    }
    // Sans cet appel initial, les étoiles déjà notées gardaient la
    // couleur "vide" tant qu'on n'avait pas survolé/cliqué une fois :
    // le glyphe ★ était bon mais la classe "active" (donc l'or) ne
    // s'appliquait qu'après une première interaction.
    renderStars();

    // Étoiles : hover pour preview, clic pour valider
    // Si on reclique la même étoile → remet à 0
    starBtns.forEach(function (btn) {
      var v = Number(btn.dataset.value);

      btn.addEventListener("mouseenter", function () {
        starBtns.forEach(function (b) {
          b.innerHTML = Number(b.dataset.value) <= v ? "&#9733;" : "&#9734;";
        });
      });

      btn.addEventListener("mouseleave", renderStars);

      btn.addEventListener("click", function () {
        reactRating = (reactRating === v) ? 0 : v;
        renderStars();
        save();
      });
    });

    // Flamme
    if (flamBtn) {
      flamBtn.addEventListener("click", function () {
        reactFlame = !reactFlame;
        flamBtn.classList.toggle("active", reactFlame);
        save();
      });
    }

    // Intérêt
    if (intrBtn) {
      intrBtn.addEventListener("click", function () {
        reactInterest = !reactInterest;
        intrBtn.classList.toggle("active", reactInterest);
        save();
      });
    }
  }

  // ══════════════════════════════════════════════════
  // 6. FILTRES + RECHERCHE + TRI DE LA GRILLE
  // ══════════════════════════════════════════════════
  var categoryFilter  = document.getElementById("wiki-category-filter");
  var tagFilter       = document.getElementById("wiki-tag-filter");
  var sortSelect      = document.getElementById("wiki-sort-select");
  var ultraToggle      = document.getElementById("wiki-ultra-toggle");
  var irrealisteToggle = document.getElementById("wiki-irrealiste-toggle");
  var wikiList        = document.getElementById("wiki-list");
  var searchInput     = document.getElementById("wiki-search-input");
  var searchClear     = document.getElementById("wiki-search-clear");
  var resultCount     = document.getElementById("wiki-result-count");
  var advToggle       = document.getElementById("wiki-adv-toggle");
  var advPanel        = document.getElementById("wiki-adv-panel");
  var advStarsWrap    = document.getElementById("wiki-adv-stars");
  var advStarReset    = document.getElementById("wiki-adv-star-reset");
  var propGrid        = document.getElementById("wiki-prop-grid");
  var tagSearchInput  = document.getElementById("wiki-tag-search");
  var colsSelect      = document.getElementById("wiki-cols-select");
  var paginationEl    = document.getElementById("wiki-pagination");
  var paginationTopEl = document.getElementById("wiki-pagination-top");
  var specialFilter   = document.getElementById("wiki-special-filter");
  var extraCatFilter  = document.getElementById("wiki-extra-cat-filter");

  var activeCategory  = localStorage.getItem("wiki-filter-cat") || "";
  var propStates = {
    "not-rated": Number(localStorage.getItem("wiki-prop-not-rated") || "0"),
    "owned":     Number(localStorage.getItem("wiki-prop-owned")     || "0"),
    "flame":     Number(localStorage.getItem("wiki-prop-flame")     || "0"),
    "interested":Number(localStorage.getItem("wiki-prop-interested")|| "0")
  };
  var includedTagsSet = new Set(JSON.parse(localStorage.getItem("wiki-filter-tags-inc") || "[]"));
  var excludedTagsSet = new Set(JSON.parse(localStorage.getItem("wiki-filter-tags-exc") || "[]"));
  var activeSort      = localStorage.getItem("wiki-filter-sort") || "alpha-asc";
  // Par défaut : ultra masqué. Seulement "0" explicite = affiché.
  var hideUltra       = localStorage.getItem("wiki-hide-ultra") !== "0";
  var hideIrrealiste  = localStorage.getItem("wiki-hide-irrealiste") !== "0";
  var searchQuery     = localStorage.getItem("wiki-filter-search") || "";
  var advMinRating    = Number(localStorage.getItem("wiki-filter-rating")) || 0;
  var activeCols      = Number(localStorage.getItem("wiki-cols")) || 3;
  var activeSpecialFilter = localStorage.getItem("wiki-filter-special") || "";
  var includedExtraCats = new Set();
  var excludedExtraCats = new Set();
  var currentPage     = 1;
  var _paginationNavigation = false;

  // La recherche du sommaire (page d'accueil) arrive ici en ?q=... : elle
  // prend le pas sur la recherche mémorisée et devient la nouvelle valeur.
  var urlSearchQuery = new URLSearchParams(window.location.search).get("q");
  if (urlSearchQuery !== null) {
    searchQuery = urlSearchQuery;
    localStorage.setItem("wiki-filter-search", searchQuery);
  }

  // Normalise une chaîne : minuscules + sans accents
  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // ── Trigrammes : tolérance aux fautes de frappe ───────────────────────
  // Génère l'ensemble des trigrammes d'un mot (ex: "assis" → {" as","ass","ssi","sis","is "})
  function trigrams(w) {
    var s = " " + w + " ";
    var set = {};
    for (var i = 0; i < s.length - 2; i++) set[s.slice(i, i + 3)] = true;
    return set;
  }

  // Similarité de Jaccard sur les trigrammes, entre 0 et 1
  function trigramSim(a, b) {
    if (!a || !b) return 0;
    var ta = trigrams(a);
    var tb = trigrams(b);
    var inter = 0, union = 0;
    var all = {};
    Object.keys(ta).forEach(function (k) { all[k] = true; });
    Object.keys(tb).forEach(function (k) { all[k] = true; });
    Object.keys(all).forEach(function (k) {
      if (ta[k] && tb[k]) inter++;
      union++;
    });
    return union ? inter / union : 0;
  }

  // Score fuzzy d'un mot de query contre un champ texte.
  // Retourne 0..1 : 1 = correspondance exacte, >0.4 = faute tolérable.
  function fuzzyScore(word, field) {
    if (!word || !field) return 0;
    if (field.includes(word)) return 1; // correspondance exacte → priorité
    var best = 0;
    field.split(/\s+/).forEach(function (fw) {
      if (!fw) return;
      var sim = trigramSim(word, fw);
      if (sim > best) best = sim;
    });
    return best;
  }

  // Score de pertinence d'une carte pour un terme de recherche
  function scoreCard(card, q) {
    if (!q) return 1;
    var words = q.split(/\s+/).filter(Boolean);
    var title     = norm(card.dataset.title || "");
    var derived   = norm(card.dataset.derived || "");
    var tags      = norm(card.dataset.tags || "").replace(/\|/g, " ");
    var content   = norm(card.dataset.content || "");
    var variantes = norm(card.dataset.variantes || "");
    var cat       = norm(card.dataset.category || "");

    // Texte combiné pour détecter les requêtes multi-mots réparties
    // entre le titre et les variantes (ex: "assis de dos")
    var combined  = title + " " + variantes;

    var score = 0;

    // Bonus si la requête complète apparaît dans le texte combiné
    var fullQ = words.join(" ");
    if (combined.includes(fullQ))     score += 10;
    else if (title.includes(fullQ))   score += 10;

    words.forEach(function (w) {
      // ── Correspondances exactes (titre) ──
      if (title === w)                score += 12;
      else if (title.startsWith(w))   score += 8;
      else if (title.includes(w))     score += 5;

      // ── Correspondances exactes (autres champs) ──
      if (derived.includes(w))        score += 4;
      if (tags.includes(w))           score += 3;
      if (variantes.includes(w))      score += 3;
      if (content.includes(w))        score += 2;
      if (cat.includes(w))            score += 1;

      // ── Fuzzy (seulement si pas de correspondance exacte) ──
      // Tolère ~1 caractère de différence (sim > 0.5)
      var titleSim = fuzzyScore(w, title);
      if (titleSim >= 0.5 && !title.includes(w))  score += titleSim * 4;

      var varSim = fuzzyScore(w, variantes);
      if (varSim >= 0.5 && !variantes.includes(w)) score += varSim * 2;

      var derSim = fuzzyScore(w, derived);
      if (derSim >= 0.5 && !derived.includes(w))  score += derSim * 2;
    });
    return score;
  }

  function updateTagChipVisibility(baseCards) {
    if (!tagFilter) return;
    var chips = tagFilter.querySelectorAll(".wiki-tag-chip[data-tag]");
    if (includedTagsSet.size === 0 && excludedTagsSet.size === 0) {
      chips.forEach(function(chip) {
        var t = (chip.dataset.tag || "").toLowerCase();
        chip.hidden = !baseCards.some(function(c) {
          return (c.dataset.tags || "").split("|").indexOf(t) !== -1;
        });
      });
      return;
    }
    chips.forEach(function(chip) {
      var chipTag = (chip.dataset.tag || "").toLowerCase();
      var chipState = chip.dataset.state || "0";
      if (chipState !== "0") {
        chip.hidden = false; // always show active chips
        return;
      }
      // Would adding this chip as "include" still yield cards?
      var wouldYield = baseCards.some(function(card) {
        var cardTags = (card.dataset.tags || "").split("|");
        if (cardTags.indexOf(chipTag) === -1) return false;
        // Must have all currently included tags
        for (var incT of includedTagsSet) {
          if (cardTags.indexOf(incT) === -1) return false;
        }
        // Must not have any excluded tags
        for (var excT of excludedTagsSet) {
          if (cardTags.indexOf(excT) !== -1) return false;
        }
        return true;
      });
      chip.hidden = !wouldYield;
    });
  }

  function applyFilters() {
    if (!wikiList) return;
    if (!_paginationNavigation) currentPage = 1;
    var cards   = Array.from(wikiList.querySelectorAll(".wiki-card"));
    var q       = norm(searchQuery);
    var _anyPropAdv = false;
    for (var _pk in propStates) { if (propStates[_pk] !== 0) { _anyPropAdv = true; break; } }
    var hasAdv  = advMinRating > 0 || _anyPropAdv;

    var scores = new Map();

    // Filtrage
    cards.forEach(function (card) {
      var extraCats = (card.dataset.extraCats || "").split("|").filter(Boolean);
      var okCat = !activeCategory ||
        (activeCategory === "__owned__" ? card.dataset.owned === "1"
          : card.dataset.category === activeCategory || extraCats.indexOf(activeCategory) !== -1);
      var cardTags  = (card.dataset.tags || "").split("|");
      var okTag = true;
      if (includedTagsSet.size > 0) {
        okTag = Array.from(includedTagsSet).every(function(t) { return cardTags.indexOf(t) !== -1; });
      }
      if (okTag && excludedTagsSet.size > 0) {
        okTag = !Array.from(excludedTagsSet).some(function(t) { return cardTags.indexOf(t) !== -1; });
      }
      // Ultra toggle only applies to cards that are ultra but NOT irréaliste
      var okUltra = !hideUltra || card.dataset.ultra !== "1" || card.dataset.irrealiste === "1";
      // Irréaliste toggle controls all irréaliste cards
      var okIrrealiste = !hideIrrealiste || card.dataset.irrealiste !== "1";

      // Filtre spécial (ultra/irréaliste inclusif)
      var okSpecial = true;
      if (activeSpecialFilter === "ultra") {
        okSpecial = card.dataset.ultra === "1" && card.dataset.irrealiste !== "1";
      } else if (activeSpecialFilter === "irrealiste") {
        okSpecial = card.dataset.irrealiste === "1";
      } else if (activeSpecialFilter === "both") {
        okSpecial = card.dataset.ultra === "1" || card.dataset.irrealiste === "1";
      }

      // Filtre catégories liées (3 états : inclure / exclure / neutre)
      var okExtraCat = true;
      if (includedExtraCats.size > 0) {
        var ecList = (card.dataset.extraCats || "").split("|").filter(Boolean);
        okExtraCat = Array.from(includedExtraCats).some(function(ec) { return ecList.indexOf(ec) !== -1; });
      }
      if (okExtraCat && excludedExtraCats.size > 0) {
        var ecList2 = (card.dataset.extraCats || "").split("|").filter(Boolean);
        okExtraCat = !Array.from(excludedExtraCats).some(function(ec) { return ecList2.indexOf(ec) !== -1; });
      }

      // Recherche textuelle
      var sc = scoreCard(card, q);
      // Seuil ≥ 1 pour éviter les faux-positifs du fuzzy (0 < sim < 0.5)
      var okSearch = !q || sc >= 1;
      scores.set(card, sc);

      // Filtres avancés
      var okRating = !advMinRating || Number(card.dataset.rating) >= advMinRating;
      // Prop filters (3-state)
      var isUnrated = !Number(card.dataset.rating);
      var okNotRated   = propStates["not-rated"]  === 0 ? true : (propStates["not-rated"]  === 1 ? isUnrated              : !isUnrated);
      var okOwned      = propStates["owned"]      === 0 ? true : (propStates["owned"]      === 1 ? card.dataset.owned === "1"      : card.dataset.owned !== "1");
      var okFlame      = propStates["flame"]      === 0 ? true : (propStates["flame"]      === 1 ? card.dataset.flame === "1"      : card.dataset.flame !== "1");
      var okInterested = propStates["interested"] === 0 ? true : (propStates["interested"] === 1 ? card.dataset.interested === "1" : card.dataset.interested !== "1");

      // Track which cards pass all non-tag filters (for smart tag chip visibility)
      var okNonTag = okCat && okUltra && okIrrealiste && okSpecial && okExtraCat && okSearch && okRating && okNotRated && okOwned && okFlame && okInterested;
      card._passesNonTag = okNonTag;
      card.hidden = !(okNonTag && okTag);
    });

    var baseCards = cards.filter(function(c) { return c._passesNonTag; });
    updateTagChipVisibility(baseCards);

    // Tri
    var visible = cards.filter(function (c) { return !c.hidden; });
    visible.sort(function (a, b) {
      // Si recherche active : d'abord par score de pertinence, puis par le tri choisi
      if (q) {
        var diff = (scores.get(b) || 0) - (scores.get(a) || 0);
        if (diff !== 0) return diff;
      }
      switch (activeSort) {
        case "alpha-asc":   return (a.dataset.title || "").localeCompare(b.dataset.title || "", "fr", { sensitivity: "base" });
        case "alpha-desc":  return (b.dataset.title || "").localeCompare(a.dataset.title || "", "fr", { sensitivity: "base" });
        case "date-desc":   return Number(b.dataset.date) - Number(a.dataset.date);
        case "date-asc":    return Number(a.dataset.date) - Number(b.dataset.date);
        case "rating-desc": return Number(b.dataset.rating) - Number(a.dataset.rating);
        case "category":    return (a.dataset.category || "").localeCompare(b.dataset.category || "", "fr");
        default:            return 0;
      }
    });
    visible.forEach(function (card) { wikiList.appendChild(card); });

    // Pagination
    applyPagination(visible);

    // Compteur
    if (resultCount) {
      var showCount = q || hasAdv;
      resultCount.hidden = !showCount;
      if (showCount) {
        var n = visible.length;
        resultCount.textContent = n + "\u00a0r\u00e9sultat" + (n > 1 ? "s" : "");
      }
    }
  }

  // ── Pagination ─────────────────────────────────────────────────────────────
  function applyPagination(visibleCards) {
    var pageSize = Math.ceil(25 / activeCols) * activeCols;
    var totalPages = Math.ceil(visibleCards.length / pageSize);
    if (totalPages <= 1) {
      visibleCards.forEach(function (c) { c.classList.remove("wiki-page-hidden"); });
      if (paginationEl) paginationEl.hidden = true;
      if (paginationTopEl) paginationTopEl.hidden = true;
      return;
    }
    if (currentPage > totalPages) currentPage = totalPages;
    var start = (currentPage - 1) * pageSize;
    var end = start + pageSize;
    visibleCards.forEach(function (c, i) {
      c.classList.toggle("wiki-page-hidden", i < start || i >= end);
    });
    if (paginationEl) { paginationEl.hidden = false; renderPaginationInto(paginationEl, totalPages); }
    if (paginationTopEl) { paginationTopEl.hidden = false; renderPaginationInto(paginationTopEl, totalPages); }
  }

  function renderPaginationInto(container, totalPages) {
    while (container.firstChild) container.removeChild(container.firstChild);
    function makePage(label, page, disabled) {
      var btn = document.createElement("button");
      btn.type = "button"; btn.textContent = label;
      btn.className = "wiki-page-btn" + (page === currentPage ? " active" : "") + (disabled ? " disabled" : "");
      if (!disabled) {
        btn.addEventListener("click", function () {
          _paginationNavigation = true;
          currentPage = page;
          applyFilters();
          _paginationNavigation = false;
          wikiList.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return btn;
    }
    container.appendChild(makePage("\u2190", currentPage - 1, currentPage <= 1));
    for (var p = 1; p <= totalPages; p++) {
      if (p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)) {
        container.appendChild(makePage(String(p), p, false));
      } else if (p === currentPage - 2 || p === currentPage + 2) {
        var ellipsis = document.createElement("span");
        ellipsis.className = "wiki-page-ellipsis"; ellipsis.textContent = "\u2026";
        container.appendChild(ellipsis);
      }
    }
    container.appendChild(makePage("\u2192", currentPage + 1, currentPage >= totalPages));
  }

  // ── Cols selector ───────────────────────────────────────────────────────────
  function applyCols() {
    if (!wikiList) return;
    wikiList.className = wikiList.className.replace(/\bwiki-grid--cols-\d\b/g, "");
    wikiList.classList.add("wiki-grid--cols-" + activeCols);
    // Carousel: only in 1-2 cols mode, max 3 images
    var doCarousel = activeCols <= 2;
    wikiList.querySelectorAll(".wiki-card-image[data-images]").forEach(function (imgDiv) {
      var paths = imgDiv.dataset.images.split("|").filter(Boolean).slice(0, 3);
      if (paths.length <= 1) return;
      if (doCarousel) {
        enableCarousel(imgDiv, paths);
      } else {
        disableCarousel(imgDiv, paths[0]);
      }
    });
    // Sync select value
    if (colsSelect) colsSelect.value = String(activeCols);
  }

  function enableCarousel(imgDiv, paths) {
    if (imgDiv.dataset.carouselActive === "1") return;
    imgDiv.dataset.carouselActive = "1";
    var idx = Number(imgDiv.dataset.imgIdx || 0);
    var img = imgDiv.querySelector(".wiki-card-img");
    if (!img) return;

    var prevBtn = document.createElement("button");
    prevBtn.type = "button"; prevBtn.className = "wiki-card-carousel-btn wiki-card-carousel-btn--prev";
    prevBtn.setAttribute("aria-label", "Image pr\u00e9c\u00e9dente"); prevBtn.textContent = "\u2039";
    var nextBtn = document.createElement("button");
    nextBtn.type = "button"; nextBtn.className = "wiki-card-carousel-btn wiki-card-carousel-btn--next";
    nextBtn.setAttribute("aria-label", "Image suivante"); nextBtn.textContent = "\u203a";

    function goTo(newIdx) {
      idx = ((newIdx % paths.length) + paths.length) % paths.length;
      img.src = paths[idx];
      imgDiv.dataset.imgIdx = idx;
    }

    prevBtn.addEventListener("click", function (e) { e.preventDefault(); goTo(idx - 1); });
    nextBtn.addEventListener("click", function (e) { e.preventDefault(); goTo(idx + 1); });

    imgDiv.appendChild(prevBtn);
    imgDiv.appendChild(nextBtn);
  }

  function disableCarousel(imgDiv, firstPath) {
    if (imgDiv.dataset.carouselActive !== "1") return;
    imgDiv.dataset.carouselActive = "0";
    imgDiv.dataset.imgIdx = "0";
    var img = imgDiv.querySelector(".wiki-card-img");
    if (img) img.src = firstPath;
    imgDiv.querySelectorAll(".wiki-card-carousel-btn").forEach(function (el) { el.remove(); });
  }

  if (colsSelect) {
    colsSelect.addEventListener("change", function () {
      activeCols = Number(colsSelect.value);
      localStorage.setItem("wiki-cols", activeCols);
      applyCols();
      applyFilters();
    });
  }

  // Barre de recherche
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      searchQuery = searchInput.value;
      localStorage.setItem("wiki-filter-search", searchQuery);
      if (searchClear) searchClear.hidden = !searchQuery;
      applyFilters();
    });
  }
  if (searchClear) {
    searchClear.addEventListener("click", function () {
      searchQuery = "";
      localStorage.setItem("wiki-filter-search", "");
      if (searchInput) searchInput.value = "";
      searchClear.hidden = true;
      applyFilters();
    });
  }

  // Panneau avancé
  if (advToggle && advPanel) {
    advToggle.addEventListener("click", function () {
      advPanel.hidden = !advPanel.hidden;
      advToggle.innerHTML = advPanel.hidden ? "Filtres avanc\u00e9s &#9662;" : "Filtres avanc\u00e9s &#9652;";
    });
  }

  // Étoiles min dans le panneau avancé
  if (advStarsWrap) {
    var advStarBtns = advStarsWrap.querySelectorAll(".wiki-adv-star");
    function renderAdvStars() {
      advStarBtns.forEach(function (btn) {
        var v = Number(btn.dataset.value);
        btn.innerHTML = v <= advMinRating ? "&#9733;" : "&#9734;";
        btn.classList.toggle("active", v <= advMinRating);
      });
    }
    renderAdvStars(); // applique l'état restauré visuellement
    advStarBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var v = Number(btn.dataset.value);
        advMinRating = advMinRating === v ? 0 : v;
        localStorage.setItem("wiki-filter-rating", advMinRating);
        renderAdvStars();
        applyFilters();
      });
    });
    if (advStarReset) {
      advStarReset.addEventListener("click", function () {
        advMinRating = 0;
        localStorage.setItem("wiki-filter-rating", "0");
        renderAdvStars();
        applyFilters();
      });
    }
  }

  // Prop buttons (3-state)
  if (propGrid) {
    propGrid.querySelectorAll(".wiki-prop-btn").forEach(function(btn) {
      var prop = btn.dataset.prop;
      var saved = propStates[prop] || 0;
      btn.dataset.state = String(saved);
      btn.addEventListener("click", function() {
        var s = Number(btn.dataset.state);
        s = (s + 1) % 3;
        btn.dataset.state = String(s);
        propStates[prop] = s;
        localStorage.setItem("wiki-prop-" + prop, String(s));
        applyFilters();
      });
    });
  }

  if (categoryFilter) {
    categoryFilter.querySelectorAll(".tag-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        categoryFilter.querySelectorAll(".tag-chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        activeCategory = chip.dataset.category || "";
        localStorage.setItem("wiki-filter-cat", activeCategory);
        applyFilters();
      });
    });
    // Restaure la catégorie active visuellement
    if (activeCategory) {
      var restoredCatChip = categoryFilter.querySelector('[data-category="' + activeCategory + '"]');
      if (restoredCatChip) {
        categoryFilter.querySelectorAll(".tag-chip").forEach(function (c) { c.classList.remove("active"); });
        restoredCatChip.classList.add("active");
      } else {
        activeCategory = "";
        localStorage.removeItem("wiki-filter-cat");
      }
    }
  }
  if (tagFilter) {
    // Restore state from localStorage
    tagFilter.querySelectorAll(".wiki-tag-chip[data-tag]").forEach(function(chip) {
      var t = (chip.dataset.tag || "").toLowerCase();
      if (includedTagsSet.has(t)) chip.dataset.state = "1";
      else if (excludedTagsSet.has(t)) chip.dataset.state = "2";
      else chip.dataset.state = "0";
      chip.addEventListener("click", function() {
        var s = Number(chip.dataset.state);
        var t2 = (chip.dataset.tag || "").toLowerCase();
        // Remove from both sets first
        includedTagsSet.delete(t2);
        excludedTagsSet.delete(t2);
        s = (s + 1) % 3;
        chip.dataset.state = String(s);
        if (s === 1) includedTagsSet.add(t2);
        else if (s === 2) excludedTagsSet.add(t2);
        // Persist
        localStorage.setItem("wiki-filter-tags-inc", JSON.stringify(Array.from(includedTagsSet)));
        localStorage.setItem("wiki-filter-tags-exc", JSON.stringify(Array.from(excludedTagsSet)));
        currentPage = 1;
        applyFilters();
      });
    });
  }
  if (tagSearchInput) {
    tagSearchInput.addEventListener("input", function () {
      var q = tagSearchInput.value.trim().toLowerCase();
      if (tagFilter) {
        tagFilter.querySelectorAll(".wiki-tag-chip").forEach(function (chip) {
          var tag = (chip.dataset.tag || "").toLowerCase();
          chip.hidden = q.length > 0 && (chip.dataset.state || "0") === "0" && tag.indexOf(q) === -1;
        });
      }
    });
  }

  if (sortSelect) {
    sortSelect.value = activeSort;
    sortSelect.addEventListener("change", function () {
      activeSort = sortSelect.value;
      localStorage.setItem("wiki-filter-sort", activeSort);
      applyFilters();
    });
  }

  function syncUltraBtn() {
    if (!ultraToggle) return;
    ultraToggle.textContent = "Ultra";
    ultraToggle.classList.toggle("active", hideUltra);
  }
  if (ultraToggle) {
    ultraToggle.addEventListener("click", function () {
      hideUltra = !hideUltra;
      localStorage.setItem("wiki-hide-ultra", hideUltra ? "1" : "0");
      syncUltraBtn();
      applyFilters();
    });
  }
  syncUltraBtn();

  // Filtre les cartes dans les strips du sommaire (wiki-index)
  function applyChapterStripFilters() {
    document.querySelectorAll(".wiki-chapter-strip .wiki-card").forEach(function (card) {
      var isI = card.dataset.irrealiste === "1";
      var isU = card.dataset.ultra === "1" && !isI; // pure ultra only (not irréaliste)
      card.hidden = (hideIrrealiste && isI) || (hideUltra && isU);
    });
  }

  function syncIrralisteBtn() {
    if (!irrealisteToggle) return;
    irrealisteToggle.textContent = "Irr\u00e9aliste";
    irrealisteToggle.classList.toggle("active", hideIrrealiste);
  }
  if (irrealisteToggle) {
    irrealisteToggle.addEventListener("click", function () {
      hideIrrealiste = !hideIrrealiste;
      localStorage.setItem("wiki-hide-irrealiste", hideIrrealiste ? "1" : "0");
      syncIrralisteBtn();
      applyFilters();
      applyChapterStripFilters();
    });
  }
  syncIrralisteBtn();
  applyChapterStripFilters();

  // Restaure la barre de recherche
  if (searchInput && searchQuery) {
    searchInput.value = searchQuery;
    if (searchClear) searchClear.hidden = false;
  }
  // Ouvre le panneau avancé si un filtre avancé est actif
  var _anyPropInit = false;
  for (var _pki in propStates) { if (propStates[_pki] !== 0) { _anyPropInit = true; break; } }
  var anyAdv = advMinRating > 0 || _anyPropInit || includedTagsSet.size > 0 || excludedTagsSet.size > 0;
  if (advPanel && anyAdv) {
    advPanel.hidden = false;
    if (advToggle) advToggle.innerHTML = "Filtres avanc\u00e9s &#9652;";
  }

  var filtersPanel = document.getElementById("wiki-filters-panel");
  if (filtersPanel && (anyAdv || activeCategory || activeSort !== "alpha-asc" || !hideUltra || !hideIrrealiste)) {
    filtersPanel.open = true;
  }

  // Filtre spécial (ultra/irréaliste inclusif)
  if (specialFilter) {
    // Restaure l'état actif
    if (activeSpecialFilter) {
      specialFilter.querySelectorAll(".tag-chip").forEach(function (chip) {
        chip.classList.toggle("active", (chip.dataset.special || "") === activeSpecialFilter);
      });
    }
    specialFilter.querySelectorAll(".tag-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        activeSpecialFilter = chip.dataset.special || "";
        localStorage.setItem("wiki-filter-special", activeSpecialFilter);
        specialFilter.querySelectorAll(".tag-chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        applyFilters();
      });
    });
  }

  // Filtre catégories liées (3 états)
  if (extraCatFilter) {
    extraCatFilter.querySelectorAll(".wiki-extra-cat-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var cat = chip.dataset.cat;
        var state = chip.dataset.state || "0";
        if (state === "0") {
          chip.dataset.state = "1";
          includedExtraCats.add(cat);
          excludedExtraCats.delete(cat);
          chip.classList.add("wiki-extra-cat-include");
          chip.classList.remove("wiki-extra-cat-exclude");
        } else if (state === "1") {
          chip.dataset.state = "2";
          includedExtraCats.delete(cat);
          excludedExtraCats.add(cat);
          chip.classList.remove("wiki-extra-cat-include");
          chip.classList.add("wiki-extra-cat-exclude");
        } else {
          chip.dataset.state = "0";
          includedExtraCats.delete(cat);
          excludedExtraCats.delete(cat);
          chip.classList.remove("wiki-extra-cat-include", "wiki-extra-cat-exclude");
        }
        applyFilters();
      });
    });
  }

  applyCols(); // applique le nombre de colonnes et les carousels
  applyFilters(); // toujours appelé au chargement

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
      // Vérifie si la couverture est déjà une image existante (radio coché hors previewsZone)
      var form = wrapper.closest("form");
      var existingCoverChecked = form && !!form.querySelector(".wiki-cover-radio:checked");

      currentFiles.forEach(function (file, idx) {
        var wrap = document.createElement("div");
        wrap.className = "wiki-new-preview-wrap";

        var img = document.createElement("img");
        img.className = "wiki-new-preview-img";
        img.src = URL.createObjectURL(file);
        img.alt = "";
        img.addEventListener("click", function () { openLightbox(img.src); });

        // Radio couverture
        var coverLabel = document.createElement("label");
        coverLabel.className = "wiki-cover-radio-label";
        coverLabel.title = "D\u00e9finir comme couverture";
        var coverRadio = document.createElement("input");
        coverRadio.type = "radio";
        coverRadio.name = "cover_image";
        coverRadio.value = "__new__:" + idx;
        coverRadio.className = "wiki-cover-radio";
        // Si aucune image existante n'est déjà couverte et c'est le premier fichier nouveau
        if (!existingCoverChecked && idx === 0) coverRadio.checked = true;
        var coverStar = document.createElement("span");
        coverStar.className = "wiki-cover-badge-icon";
        coverStar.innerHTML = "&#9733;";
        coverLabel.appendChild(coverRadio);
        coverLabel.appendChild(coverStar);

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
        wrap.appendChild(coverLabel);
        wrap.appendChild(removeBtn);
        previewsZone.appendChild(wrap);
      });
    }

    input.addEventListener("change", function () {
      Array.from(input.files || []).forEach(function (f) {
        // Évite les doublons (même nom + même taille)
        var exists = currentFiles.some(function (e) { return e.name === f.name && e.size === f.size; });
        if (!exists) currentFiles.push(f);
      });
      rebuildInput();
      renderPreviews();
    });
  });

  // ══════════════════════════════════════════════════
  // LIGHTBOX + ASSOCIATIONS + NAVIGATION
  // ══════════════════════════════════════════════════
  var lightbox = document.createElement("div");
  lightbox.className = "wiki-lightbox";
  lightbox.innerHTML = [
    '<button class="wiki-lightbox-close" title="Fermer">&#215;</button>',
    '<button class="wiki-lightbox-prev" title="Image pr\u00e9c\u00e9dente">&#8249;</button>',
    '<button class="wiki-lightbox-next" title="Image suivante">&#8250;</button>',
    '<div class="wiki-lightbox-inner">',
      '<img class="wiki-lightbox-img" alt="" />',
      '<div class="wiki-lightbox-panel" hidden>',
        '<div class="wiki-lightbox-panel-title">Pages li&#233;es</div>',
        '<ul class="wiki-lightbox-links"></ul>',
        '<div class="wiki-lightbox-search">',
          '<input type="text" class="wiki-lightbox-search-input" placeholder="Rechercher une page\u2026" autocomplete="off" />',
          '<ul class="wiki-lightbox-results"></ul>',
        '</div>',
      '</div>',
    '</div>',
  ].join("");
  lightbox.hidden = true;
  document.body.appendChild(lightbox);

  var lbImg      = lightbox.querySelector(".wiki-lightbox-img");
  var lbPanel    = lightbox.querySelector(".wiki-lightbox-panel");
  var lbLinks    = lightbox.querySelector(".wiki-lightbox-links");
  var lbSearch   = lightbox.querySelector(".wiki-lightbox-search-input");
  var lbResults  = lightbox.querySelector(".wiki-lightbox-results");
  var lbCloseBtn = lightbox.querySelector(".wiki-lightbox-close");
  var lbPrevBtn  = lightbox.querySelector(".wiki-lightbox-prev");
  var lbNextBtn  = lightbox.querySelector(".wiki-lightbox-next");

  // Liste des src de la page dans l'ordre DOM, et index courant
  var lbSrcs = [];
  var lbIndex = 0;
  var lbCurrentSrc = "";

  function lbGetSrc(img) {
    var src = img.dataset.src || img.getAttribute("src");
    if (src && !src.startsWith("blob:") && !src.startsWith("/")) src = "/" + src;
    return src || "";
  }

  function rebuildSrcList() {
    lbSrcs = [];
    document.querySelectorAll(".wiki-infobox-img, .wiki-gallery-img, .wiki-form-existing-image, .wiki-card-img, .wiki-var-img").forEach(function (img) {
      var src = lbGetSrc(img);
      if (src) lbSrcs.push(src);
    });
    // Ajoute aussi les previews de nouvelles images (blob:)
    document.querySelectorAll(".wiki-new-preview-img").forEach(function (img) {
      if (img.src) lbSrcs.push(img.src);
    });
  }

  function syncNavButtons() {
    var multi = lbSrcs.length > 1;
    lbPrevBtn.hidden = !multi;
    lbNextBtn.hidden = !multi;
  }

  // Charge et affiche les associations pour l'image en cours
  function loadLinks() {
    if (!lbCurrentSrc.startsWith("/uploads/")) return;
    lbLinks.innerHTML = "";
    fetch("/wiki/image-links?src=" + encodeURIComponent(lbCurrentSrc))
      .then(function (r) { return r.json(); })
      .then(function (pages) {
        lbLinks.innerHTML = "";
        if (!pages.length) {
          var li = document.createElement("li");
          li.className = "wiki-lb-empty";
          li.textContent = "Aucune page associ\u00e9e";
          lbLinks.appendChild(li);
          return;
        }
        pages.forEach(function (page) {
          var li = document.createElement("li");
          li.className = "wiki-lb-link-item";
          var a = document.createElement("a");
          a.href = "/wiki/" + page.id;
          a.textContent = page.title;
          a.className = "wiki-lb-page-link";
          var rm = document.createElement("button");
          rm.type = "button";
          rm.className = "wiki-lb-unlink";
          rm.innerHTML = "&#215;";
          rm.title = "D\u00e9sassocier";
          rm.addEventListener("click", function (e) {
            e.preventDefault();
            fetch("/wiki/image-links", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ src: lbCurrentSrc, page_id: page.id }),
            }).then(loadLinks);
          });
          li.appendChild(a);
          li.appendChild(rm);
          lbLinks.appendChild(li);
        });
      });
  }

  // Recherche de pages à associer
  var lbSearchTimer;
  lbSearch.addEventListener("input", function () {
    clearTimeout(lbSearchTimer);
    lbSearchTimer = setTimeout(function () {
      var q = lbSearch.value.trim();
      fetch("/wiki/search?q=" + encodeURIComponent(q))
        .then(function (r) { return r.json(); })
        .then(function (pages) {
          lbResults.innerHTML = "";
          pages.forEach(function (page) {
            var li = document.createElement("li");
            li.className = "wiki-lb-result-item";
            li.textContent = page.title;
            li.addEventListener("click", function () {
              fetch("/wiki/image-links", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ src: lbCurrentSrc, page_id: page.id }),
              }).then(function () {
                lbSearch.value = "";
                lbResults.innerHTML = "";
                loadLinks();
              });
            });
            lbResults.appendChild(li);
          });
        });
    }, 250);
  });

  function showImage(src) {
    lbCurrentSrc = src;
    lbImg.src = src;
    if (src.startsWith("/uploads/")) {
      lbPanel.hidden = false;
      lbSearch.value = "";
      lbResults.innerHTML = "";
      loadLinks();
    } else {
      lbPanel.hidden = true;
    }
  }

  function openLightbox(src) {
    rebuildSrcList();
    lbIndex = lbSrcs.indexOf(src);
    if (lbIndex === -1) lbIndex = 0;
    lightbox.hidden = false;
    document.body.style.overflow = "hidden";
    syncNavButtons();
    showImage(src);
  }

  function closeLightbox() {
    lightbox.hidden = true;
    lbImg.src = "";
    lbCurrentSrc = "";
    document.body.style.overflow = "";
  }

  function lbNavigate(dir) {
    if (!lbSrcs.length) return;
    lbIndex = (lbIndex + dir + lbSrcs.length) % lbSrcs.length;
    showImage(lbSrcs[lbIndex]);
  }

  // Boutons close / prev / next
  lbCloseBtn.addEventListener("click", function (e) { e.stopPropagation(); closeLightbox(); });
  lbPrevBtn.addEventListener("click",  function (e) { e.stopPropagation(); lbNavigate(-1); });
  lbNextBtn.addEventListener("click",  function (e) { e.stopPropagation(); lbNavigate(+1); });

  // Clic sur l'overlay (fond) → fermer
  lightbox.addEventListener("click", function (e) {
    if (e.target === lightbox) closeLightbox();
  });

  // Clavier : Échap, flèches
  document.addEventListener("keydown", function (e) {
    if (lightbox.hidden) return;
    if (e.key === "Escape")     closeLightbox();
    if (e.key === "ArrowLeft")  lbNavigate(-1);
    if (e.key === "ArrowRight") lbNavigate(+1);
  });

  // Swipe tactile
  var lbTouchStartX = 0;
  lightbox.addEventListener("touchstart", function (e) {
    lbTouchStartX = e.touches[0].clientX;
  }, { passive: true });
  lightbox.addEventListener("touchend", function (e) {
    var dx = e.changedTouches[0].clientX - lbTouchStartX;
    if (Math.abs(dx) > 50) lbNavigate(dx < 0 ? +1 : -1);
  }, { passive: true });

  // Rend cliquables toutes les images de la galerie, des formulaires et des variantes
  function attachLightboxToImages() {
    document.querySelectorAll(".wiki-infobox-img, .wiki-gallery-img, .wiki-form-existing-image, .wiki-card-img, .wiki-var-img").forEach(function (img) {
      if (img.dataset.lbBound) return;
      img.dataset.lbBound = "1";
      img.style.cursor = "zoom-in";
      img.addEventListener("click", function () {
        openLightbox(lbGetSrc(img));
      });
    });
  }
  attachLightboxToImages();

  // Rebind au premier open de chaque variante (images pas encore dans le DOM visuel)
  document.querySelectorAll(".wiki-var-detail").forEach(function (det) {
    det.addEventListener("toggle", function () {
      if (det.open) attachLightboxToImages();
    });
  });

  // ══════════════════════════════════════════════════
  // 9. NAVIGATION ENTRE PAGES WIKI (←/→ + swipe)
  // ══════════════════════════════════════════════════
  var wikiNavPrev = document.getElementById("wiki-nav-prev");
  var wikiNavNext = document.getElementById("wiki-nav-next");

  if (wikiNavPrev || wikiNavNext) {
    // Clavier : ← et → (ignoré si focus dans un champ de saisie)
    document.addEventListener("keydown", function (e) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (lightbox && !lightbox.hidden) return; // lightbox a la priorité
      if (e.key === "ArrowLeft"  && wikiNavPrev) { e.preventDefault(); location.href = wikiNavPrev.href; }
      if (e.key === "ArrowRight" && wikiNavNext) { e.preventDefault(); location.href = wikiNavNext.href; }
    });

    // Swipe horizontal sur tout le document
    var pageSwipeStartX = 0;
    var pageSwipeStartY = 0;
    document.addEventListener("touchstart", function (e) {
      pageSwipeStartX = e.touches[0].clientX;
      pageSwipeStartY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener("touchend", function (e) {
      if (lightbox && !lightbox.hidden) return; // lightbox gère son propre swipe
      var dx = e.changedTouches[0].clientX - pageSwipeStartX;
      var dy = e.changedTouches[0].clientY - pageSwipeStartY;
      // Swipe horizontal dominant (> 80px, moins de 60px vertical)
      if (Math.abs(dx) > 80 && Math.abs(dy) < 60) {
        if (dx < 0 && wikiNavNext) location.href = wikiNavNext.href; // swipe gauche = suivant
        if (dx > 0 && wikiNavPrev) location.href = wikiNavPrev.href; // swipe droit = précédent
      }
    }, { passive: true });
  }

  // ══════════════════════════════════════════════════
  // 10. TOOLBAR MARKDOWN
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
      case "link":
        insert = "[[" + (sel || "titre de la page") + "]]";
        cursor = sel ? start + insert.length : start + 2;
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

  // ══════════════════════════════════════════════════
  // 11. CARROUSEL (images suivantes)
  // ══════════════════════════════════════════════════
  (function () {
    var rail = document.querySelector(".wiki-infobox-images-rest");
    if (!rail) return;
    var imgs = rail.querySelectorAll(".wiki-infobox-img");
    if (imgs.length < 2) return;

    // Wrapper relatif pour positionner les flèches
    var wrap = document.createElement("div");
    wrap.className = "wiki-carousel-wrap";
    rail.parentNode.insertBefore(wrap, rail);
    wrap.appendChild(rail);

    // Flèches prev / next
    var btnPrev = document.createElement("button");
    btnPrev.type = "button";
    btnPrev.className = "wiki-carousel-arrow wiki-carousel-arrow--prev";
    btnPrev.setAttribute("aria-label", "Image précédente");
    btnPrev.textContent = "‹";
    wrap.appendChild(btnPrev);

    var btnNext = document.createElement("button");
    btnNext.type = "button";
    btnNext.className = "wiki-carousel-arrow wiki-carousel-arrow--next";
    btnNext.setAttribute("aria-label", "Image suivante");
    btnNext.textContent = "›";
    wrap.appendChild(btnNext);

    // Dots indicateurs
    var dotsWrap = document.createElement("div");
    dotsWrap.className = "wiki-carousel-dots";
    wrap.parentNode.insertBefore(dotsWrap, wrap.nextSibling);
    var dots = [];
    imgs.forEach(function (_, i) {
      var d = document.createElement("button");
      d.type = "button";
      d.className = "wiki-carousel-dot";
      d.addEventListener("click", function () { goTo(i); });
      dotsWrap.appendChild(d);
      dots.push(d);
    });

    var current = 0;
    var paused = false;

    function setDot(i) {
      dots.forEach(function (d, j) { d.classList.toggle("active", j === i); });
    }

    function updateArrows() {
      btnPrev.disabled = current === 0;
      btnNext.disabled = current === imgs.length - 1;
    }

    function goTo(i) {
      current = i;
      var target = imgs[i].offsetLeft - (rail.clientWidth - imgs[i].offsetWidth) / 2;
      rail.scrollTo({ left: target, behavior: "smooth" });
      setDot(i);
      updateArrows();
    }

    btnPrev.addEventListener("click", function () { if (current > 0) goTo(current - 1); });
    btnNext.addEventListener("click", function () { if (current < imgs.length - 1) goTo(current + 1); });

    setDot(0);
    updateArrows();

    // Auto-scroll toutes les 3,5 s si le carrousel est scrollable
    setInterval(function () {
      if (paused) return;
      if (rail.scrollWidth <= rail.clientWidth + 4) return;
      goTo((current + 1) % imgs.length);
    }, 3500);

    // Pause au toucher, reprise 4 s après
    rail.addEventListener("touchstart", function () { paused = true; }, { passive: true });
    rail.addEventListener("touchend",   function () { setTimeout(function () { paused = false; }, 4000); }, { passive: true });

    // Synchronise le dot au scroll manuel
    rail.addEventListener("scroll", function () {
      var mid = rail.scrollLeft + rail.clientWidth / 2;
      imgs.forEach(function (img, i) {
        if (img.offsetLeft <= mid && img.offsetLeft + img.offsetWidth > mid) {
          current = i;
          setDot(i);
          updateArrows();
        }
      });
    }, { passive: true });
  })();

  // ══════════════════════════════════════════════════
  // 12. LIENS ENTRE PAGES WIKI
  // ══════════════════════════════════════════════════
  (function () {
    var widget = document.querySelector(".wiki-page-links");
    if (!widget) return;
    var pageId      = widget.dataset.pageId;
    var linksArea   = widget.querySelector("[data-role='links']");
    var backArea    = widget.querySelector("[data-role='backlinks']");
    var backSection = widget.querySelector(".wiki-pl-backlinks-section");
    var searchInput = widget.querySelector(".wiki-pl-search");
    var resultsList = widget.querySelector(".wiki-pl-results");
    var searchTimer;

    // Hue de catégorie (doit rester cohérent avec le serveur)
    var CAT_HUES = { fantasmes:330, jeu_de_role:60, partenaires:210, pratique:5, position:270, lieux:140, objets:28, tenues:175, autre:220 };

    function makeCard(page, removable) {
      var hue = CAT_HUES[page.category] || 220;
      var a = document.createElement("a");
      a.href = "/wiki/" + page.id;
      a.className = "wiki-pl-card";
      var badge = document.createElement("span");
      badge.className = "wiki-pl-badge";
      badge.style.background = "hsl(" + hue + ",55%,45%)";
      badge.textContent = page.category;
      var title = document.createElement("span");
      title.className = "wiki-pl-title";
      title.textContent = page.title;
      a.appendChild(badge);
      a.appendChild(title);
      if (removable) {
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "wiki-pl-remove";
        rm.innerHTML = "&#215;";
        rm.title = "Retirer le lien";
        rm.addEventListener("click", function (e) {
          e.preventDefault();
          fetch("/wiki/" + pageId + "/page-links", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ linked_page_id: page.id }),
          }).then(load);
        });
        a.appendChild(rm);
      }
      return a;
    }

    function renderCards(container, pages, removable) {
      container.innerHTML = "";
      if (!pages.length) {
        var em = document.createElement("span");
        em.className = "wiki-pl-empty";
        em.textContent = removable ? "Aucune page li\u00e9e" : "";
        container.appendChild(em);
      } else {
        pages.forEach(function (p) { container.appendChild(makeCard(p, removable)); });
      }
    }

    function load() {
      fetch("/wiki/" + pageId + "/page-links")
        .then(function (r) { return r.json(); })
        .then(function (data) {
          renderCards(linksArea, data.links, true);
          renderCards(backArea, data.backlinks, false);
          backSection.hidden = data.backlinks.length === 0;
        });
    }

    searchInput.addEventListener("input", function () {
      clearTimeout(searchTimer);
      var q = searchInput.value.trim();
      if (!q) { resultsList.innerHTML = ""; return; }
      searchTimer = setTimeout(function () {
        fetch("/wiki/search?q=" + encodeURIComponent(q))
          .then(function (r) { return r.json(); })
          .then(function (pages) {
            resultsList.innerHTML = "";
            // Exclure la page courante
            pages.filter(function (p) { return String(p.id) !== pageId; })
              .forEach(function (p) {
                var li = document.createElement("li");
                li.className = "wiki-pl-result-item";
                var hue = CAT_HUES[p.category] || 220;
                li.innerHTML = '<span class="wiki-pl-result-badge" style="background:hsl(' + hue + ',55%,45%)">' + p.category + '</span><span>' + p.title + '</span>';
                li.addEventListener("click", function () {
                  fetch("/wiki/" + pageId + "/page-links", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ linked_page_id: p.id }),
                  }).then(function () {
                    searchInput.value = "";
                    resultsList.innerHTML = "";
                    load();
                  });
                });
                resultsList.appendChild(li);
              });
          });
      }, 200);
    });

    document.addEventListener("click", function (e) {
      if (!widget.contains(e.target)) resultsList.innerHTML = "";
    });

    load();
  })();

  // ══════════════════════════════════════════════════
  // 13. QUESTIONS LIÉES AU QUIZZ
  // ══════════════════════════════════════════════════
  var qlWidget = document.querySelector(".wiki-question-links");  // section 13
  if (qlWidget) {
    var qlPageId  = qlWidget.dataset.pageId;
    var qlList    = qlWidget.querySelector(".wiki-ql-list");
    var qlSearch  = qlWidget.querySelector(".wiki-ql-search");
    var qlResults = qlWidget.querySelector(".wiki-ql-results");
    var qlTimer;

    function qlLoadLinks() {
      fetch("/wiki/" + qlPageId + "/question-links")
        .then(function (r) { return r.json(); })
        .then(function (links) {
          qlList.innerHTML = "";
          if (!links.length) {
            var li = document.createElement("li");
            li.className = "wiki-ql-empty";
            li.textContent = "Aucune question associ\u00e9e";
            qlList.appendChild(li);
            return;
          }
          links.forEach(function (lk) {
            var li = document.createElement("li");
            li.className = "wiki-ql-item";
            // Ouvre dans un nouvel onglet : on est en cours d'édition, pas
            // question de perdre les modifications en cours en changeant de page.
            var label = (typeof lk.section_index === "number" && lk.section_index >= 0)
              ? document.createElement("a")
              : document.createElement("span");
            label.className = "wiki-ql-label";
            if (label.tagName === "A") {
              label.href = "/section/" + lk.section_index + "?q=" + encodeURIComponent(lk.question_id);
              label.target = "_blank";
              label.rel = "noopener";
            }
            var section = document.createElement("span");
            section.className = "wiki-ql-section";
            section.textContent = lk.section_title;
            var text = document.createElement("span");
            text.className = "wiki-ql-text";
            text.textContent = lk.question_text;
            label.appendChild(section);
            label.appendChild(text);
            var rm = document.createElement("button");
            rm.type = "button";
            rm.className = "wiki-ql-remove";
            rm.innerHTML = "&#215;";
            rm.title = "D\u00e9sassocier";
            rm.addEventListener("click", function () {
              fetch("/wiki/" + qlPageId + "/question-links", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ section_key: lk.section_key, question_id: lk.question_id }),
              }).then(qlLoadLinks);
            });
            li.appendChild(label);
            li.appendChild(rm);
            qlList.appendChild(li);
          });
        });
    }

    qlSearch.addEventListener("input", function () {
      clearTimeout(qlTimer);
      qlTimer = setTimeout(function () {
        var q = qlSearch.value.trim();
        if (!q) { qlResults.innerHTML = ""; return; }
        fetch("/wiki/question-search?q=" + encodeURIComponent(q))
          .then(function (r) { return r.json(); })
          .then(function (items) {
            qlResults.innerHTML = "";
            items.forEach(function (it) {
              var li = document.createElement("li");
              li.className = "wiki-ql-result-item";
              var s = document.createElement("span");
              s.className = "wiki-ql-result-section";
              s.textContent = it.section_title;
              var t = document.createElement("span");
              t.className = "wiki-ql-result-text";
              t.textContent = it.question_text;
              li.appendChild(s);
              li.appendChild(t);
              li.addEventListener("click", function () {
                fetch("/wiki/" + qlPageId + "/question-links", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ section_key: it.section_key, question_id: it.question_id }),
                }).then(function () {
                  qlSearch.value = "";
                  qlResults.innerHTML = "";
                  qlLoadLinks();
                });
              });
              qlResults.appendChild(li);
            });
          });
      }, 200);
    });

    // Ferme les résultats si on clique ailleurs
    document.addEventListener("click", function (e) {
      if (!qlWidget.contains(e.target)) qlResults.innerHTML = "";
    });

    qlLoadLinks();
  }

  document.querySelectorAll(".link-delete-form, .link-delete-form-inline").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      if (!window.confirm("Supprimer cette page ?")) e.preventDefault();
    });
  });

  // ══════════════════════════════════════════════════
  // 14. PAGES LIÉES / QUESTIONS LIÉES — LECTURE SEULE
  // Affichage sur la page de lecture (contrairement à l'édition, pas
  // de recherche/ajout/suppression ici). Section masquée s'il n'y a
  // rien à montrer, pour ne pas afficher un bloc vide.
  // ══════════════════════════════════════════════════
  (function () {
    var widget = document.querySelector(".wiki-page-links-view");
    if (!widget) return;
    var pageId = widget.dataset.pageId;
    var area = widget.querySelector("[data-role='links']");
    var CAT_HUES = { fantasmes:330, jeu_de_role:60, partenaires:210, pratique:5, position:270, lieux:140, objets:28, tenues:175, autre:220 };

    fetch("/wiki/" + pageId + "/page-links")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var links = (data && data.links) || [];
        if (!links.length) return;
        links.forEach(function (p) {
          var hue = CAT_HUES[p.category] || 220;
          var a = document.createElement("a");
          a.href = "/wiki/" + p.id;
          a.className = "wiki-pl-card";
          var badge = document.createElement("span");
          badge.className = "wiki-pl-badge";
          badge.style.background = "hsl(" + hue + ",55%,45%)";
          badge.textContent = p.category;
          var title = document.createElement("span");
          title.className = "wiki-pl-title";
          title.textContent = p.title;
          a.appendChild(badge);
          a.appendChild(title);
          area.appendChild(a);
        });
        widget.hidden = false;
      });
  })();

  (function () {
    var widget = document.querySelector(".wiki-question-links-view");
    if (!widget) return;
    var pageId = widget.dataset.pageId;
    var list = widget.querySelector(".wiki-ql-list");

    fetch("/wiki/" + pageId + "/question-links")
      .then(function (r) { return r.json(); })
      .then(function (links) {
        if (!links || !links.length) return;
        links.forEach(function (lk) {
          var li = document.createElement("li");
          li.className = "wiki-ql-item";
          // Sans lien réel, cliquer ne menait nulle part : on renvoie vers
          // la section, avec ?q=... pour que section.js défile jusqu'à la
          // question précise et la mette en évidence.
          var label = (typeof lk.section_index === "number" && lk.section_index >= 0)
            ? document.createElement("a")
            : document.createElement("span");
          label.className = "wiki-ql-label";
          if (label.tagName === "A") {
            label.href = "/section/" + lk.section_index + "?q=" + encodeURIComponent(lk.question_id);
          }
          var section = document.createElement("span");
          section.className = "wiki-ql-section";
          section.textContent = lk.section_title;
          var text = document.createElement("span");
          text.className = "wiki-ql-text";
          text.textContent = lk.question_text;
          label.appendChild(section);
          label.appendChild(text);
          li.appendChild(label);
          list.appendChild(li);
        });
        widget.hidden = false;
      });
  })();

  // ══════════════════════════════════════════════════
  // 6b. MESSAGE D'INTRO RÉDUCTIBLE (sommaire du wiki)
  // Pas de bouton dédié : un clic/tap n'importe où sur le bloc réduit
  // ou rouvre le message. Réduit, seul l'intitulé "Information" reste.
  // ══════════════════════════════════════════════════
  (function () {
    var hero = document.getElementById("wiki-hero");
    if (!hero) return;
    var KEY      = "wiki-hero-collapsed";
    var SEEN_KEY = "wiki-hero-seen";

    function apply(collapsed) {
      hero.classList.toggle("collapsed", collapsed);
      hero.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }

    var seen     = localStorage.getItem(SEEN_KEY) === "1";
    var explicit = localStorage.getItem(KEY);
    var startCollapsed;
    if (!seen) {
      // Première visite : on montre le message, on mémorise que c'est vu
      localStorage.setItem(SEEN_KEY, "1");
      startCollapsed = false;
    } else {
      // Visites suivantes : réduit par défaut, sauf si l'utilisateur a
      // explicitement rouvert le bloc (KEY === "0").
      startCollapsed = explicit !== "0";
    }
    apply(startCollapsed);

    hero.addEventListener("click", function () {
      var collapsed = !hero.classList.contains("collapsed");
      localStorage.setItem(KEY, collapsed ? "1" : "0");
      apply(collapsed);
    });
    hero.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      hero.click();
    });
  })();

  // ══════════════════════════════════════════════════
  // 6c. FILTRES DE RECHERCHE DU SOMMAIRE (volet replié)
  // Ces réglages ne filtrent rien ici : ils sont mémorisés dans les
  // mêmes clés localStorage que "/wiki/tous", qui les applique tout
  // seul en arrivant (comme s'ils avaient été réglés là-bas).
  // ══════════════════════════════════════════════════
  (function () {
    var form = document.getElementById("wiki-hero-search-form");
    if (!form) return;
    var heroQ         = document.getElementById("wiki-hero-q");
    var heroSort      = document.getElementById("wiki-hero-sort");
    var heroUltraBtn       = document.getElementById("wiki-hero-ultra-toggle");
    var heroIrralisteBtn   = document.getElementById("wiki-hero-irrealiste-toggle");
    var rating        = document.getElementById("wiki-hero-rating");
    var owned         = document.getElementById("wiki-hero-owned");
    var flame         = document.getElementById("wiki-hero-flame");
    var interested    = document.getElementById("wiki-hero-interested");

    // ── Restauration de l'état depuis localStorage ───────────────────
    var savedSearch = localStorage.getItem("wiki-filter-search") || "";
    if (heroQ && savedSearch) heroQ.value = savedSearch;

    var savedSort = localStorage.getItem("wiki-filter-sort") || "alpha-asc";
    if (heroSort) heroSort.value = savedSort;

    // Tri : sauvegarde à chaque changement (pas besoin de soumettre)
    if (heroSort) {
      heroSort.addEventListener("change", function () {
        localStorage.setItem("wiki-filter-sort", heroSort.value);
      });
    }

    // Ultra toggle
    var heroHideUltra = localStorage.getItem("wiki-hide-ultra") !== "0";
    function syncHeroUltraBtn() {
      if (!heroUltraBtn) return;
      heroUltraBtn.textContent = "Ultra";
      heroUltraBtn.classList.toggle("active", heroHideUltra);
    }
    if (heroUltraBtn) {
      syncHeroUltraBtn();
      heroUltraBtn.addEventListener("click", function () {
        heroHideUltra = !heroHideUltra;
        localStorage.setItem("wiki-hide-ultra", heroHideUltra ? "1" : "0");
        syncHeroUltraBtn();
      });
    }

    // Irréaliste toggle
    var heroHideIrrealiste = localStorage.getItem("wiki-hide-irrealiste") !== "0";
    function syncHeroIrralisteBtn() {
      if (!heroIrralisteBtn) return;
      heroIrralisteBtn.textContent = "Irr\u00e9aliste";
      heroIrralisteBtn.classList.toggle("active", heroHideIrrealiste);
    }
    if (heroIrralisteBtn) {
      syncHeroIrralisteBtn();
      heroIrralisteBtn.addEventListener("click", function () {
        heroHideIrrealiste = !heroHideIrrealiste;
        localStorage.setItem("wiki-hide-irrealiste", heroHideIrrealiste ? "1" : "0");
        syncHeroIrralisteBtn();
      });
    }

    // Note min : restauration visuelle
    var savedRating = localStorage.getItem("wiki-filter-rating") || "0";
    if (rating) rating.value = savedRating;

    // Checkboxes : restauration visuelle
    if (owned      && localStorage.getItem("wiki-filter-owned")      === "1") owned.checked = true;
    if (flame      && localStorage.getItem("wiki-filter-flame")      === "1") flame.checked = true;
    if (interested && localStorage.getItem("wiki-filter-interested") === "1") interested.checked = true;

    // ── Sauvegarde à la soumission ────────────────────────────────────
    form.addEventListener("submit", function () {
      if (heroSort)   localStorage.setItem("wiki-filter-sort", heroSort.value);
      if (rating)     localStorage.setItem("wiki-filter-rating", rating.value);
      if (owned)      localStorage.setItem("wiki-filter-owned", owned.checked ? "1" : "0");
      if (flame)      localStorage.setItem("wiki-filter-flame", flame.checked ? "1" : "0");
      if (interested) localStorage.setItem("wiki-filter-interested", interested.checked ? "1" : "0");
    });
  })();

  // ══════════════════════════════════════════════════
  // 7. NAVIGATION CONTEXTUELLE PRÉCÉDENT / SUIVANT
  // Priorité : contexte sessionStorage (liste visible au clic d'une carte)
  // Repli : reconstruction depuis les métadonnées embarquées dans la page
  // (catégorie, tri mémorisé dans localStorage, recherche en cours).
  // ══════════════════════════════════════════════════
  (function () {
    var NAV_KEY  = "wikiNavContext";
    var BACK_KEY = "wikiNavBack";

    // ── Capture du contexte au clic sur une carte ──────────────────────
    document.addEventListener("click", function (e) {
      var card = e.target.closest ? e.target.closest("a.wiki-card") : null;
      if (!card) return;
      var list = card.closest("#wiki-list, .wiki-chapter-strip");
      if (!list) return;
      var cards = Array.prototype.slice.call(list.querySelectorAll("a.wiki-card")).filter(function (c) {
        return !c.hidden;
      });
      var entries = cards.map(function (c) {
        var m = (c.getAttribute("href") || "").match(/^\/wiki\/(\d+)$/);
        if (!m) return null;
        var titleEl = c.querySelector(".wiki-card-title");
        return { id: Number(m[1]), title: titleEl ? titleEl.textContent : "" };
      }).filter(Boolean);
      try { sessionStorage.setItem(NAV_KEY, JSON.stringify(entries)); } catch (_) {}
      // Mémorise l'origine pour le bouton ←
      try {
        var headingEl = document.querySelector(".wiki-chapter-hero-title, .section-title-h1");
        var backLabel = headingEl ? headingEl.textContent.trim() : document.title;
        sessionStorage.setItem(BACK_KEY, JSON.stringify({ href: location.href, label: backLabel }));
      } catch (_) {}
    }, true);

    // ── Sur la page de détail seulement ───────────────────────────────
    var prevBtn = document.getElementById("wiki-nav-prev");
    var nextBtn = document.getElementById("wiki-nav-next");
    if (!prevBtn || !nextBtn) return;

    var pageMatch = location.pathname.match(/^\/wiki\/(\d+)$/);
    if (!pageMatch) return;
    var currentId = Number(pageMatch[1]);

    // Métadonnées de toutes les pages (embarquées dans le HTML)
    var allPages = [];
    try {
      var pagesScript = document.getElementById("wiki-existing-pages");
      if (pagesScript) allPages = JSON.parse(pagesScript.textContent || "[]");
    } catch (_) {}

    // ── Étape 1 : essayer le contexte sessionStorage ───────────────────
    var context = null;
    try { context = JSON.parse(sessionStorage.getItem(NAV_KEY) || "null"); } catch (_) {}

    var idx = -1;
    if (Array.isArray(context)) {
      context.forEach(function (e, i) { if (e && e.id === currentId) idx = i; });
    }

    // ── Étape 2 : reconstruire le contexte depuis les métadonnées ─────
    if (idx === -1 && allPages.length) {
      var backInfo = null;
      try { backInfo = JSON.parse(sessionStorage.getItem(BACK_KEY) || "null"); } catch (_) {}

      var backHref = (backInfo && backInfo.href) || "";

      // Détermine le filtre de catégorie depuis l'URL d'origine
      var catFilter = "";
      var catMatch = backHref.match(/\/wiki\/categorie\/([^/?#]+)/);
      if (catMatch) catFilter = decodeURIComponent(catMatch[1]);

      // Si pas d'origine catégorie, utilise la catégorie de la page courante
      if (!catFilter) {
        try {
          var metaEl = document.getElementById("wiki-current-page-meta");
          if (metaEl) {
            var meta = JSON.parse(metaEl.textContent || "{}");
            catFilter = meta.category || "";
          }
        } catch (_) {}
      }

      // Filtre par catégorie (inclut extraCats)
      var filtered = catFilter
        ? allPages.filter(function (p) {
            return p.category === catFilter ||
                   (Array.isArray(p.extraCats) && p.extraCats.indexOf(catFilter) !== -1);
          })
        : allPages.slice();

      // Applique le même tri que la liste d'origine
      var sortKey = localStorage.getItem("wiki-filter-sort") || "alpha-asc";
      filtered.sort(function (a, b) {
        switch (sortKey) {
          case "alpha-desc":  return (b.title || "").localeCompare(a.title || "", "fr", { sensitivity: "base" });
          case "date-desc":   return (b.date || 0) - (a.date || 0);
          case "date-asc":    return (a.date || 0) - (b.date || 0);
          case "rating-desc": return (b.rating || 0) - (a.rating || 0);
          default:            return (a.title || "").localeCompare(b.title || "", "fr", { sensitivity: "base" });
        }
      });

      context = filtered;
      context.forEach(function (e, i) { if (e && e.id === currentId) idx = i; });

      // Sauvegarde ce contexte reconstruit pour les navigations suivantes
      if (idx !== -1) {
        try { sessionStorage.setItem(NAV_KEY, JSON.stringify(context)); } catch (_) {}
      }
    }

    if (idx === -1) return; // ni contexte ni métadonnées → on garde le serveur

    function applyBtn(btn, entry) {
      var label = btn.querySelector(".wiki-page-nav-label");
      if (!entry) {
        btn.classList.add("wiki-page-nav-disabled");
        btn.removeAttribute("href");
        btn.title = "";
        if (label) label.textContent = "";
        return;
      }
      btn.classList.remove("wiki-page-nav-disabled");
      btn.href = "/wiki/" + entry.id;
      btn.title = entry.title;
      if (label) label.textContent = entry.title;
    }

    applyBtn(prevBtn, context[idx - 1] || null);
    applyBtn(nextBtn, context[idx + 1] || null);

    // Applique le contexte de retour au bouton ←
    var backLink = document.querySelector(".wiki-detail-banner-back");
    if (backLink) {
      var storedBack = null;
      try { storedBack = JSON.parse(sessionStorage.getItem(BACK_KEY) || "null"); } catch (_) {}
      if (storedBack && storedBack.href) {
        var bp = "";
        try { bp = new URL(storedBack.href, location.origin).pathname; } catch (_) {}
        if (!/^\/wiki\/\d+$/.test(bp)) {
          backLink.href = storedBack.href;
          if (storedBack.label) {
            backLink.setAttribute("aria-label", storedBack.label);
            backLink.title = storedBack.label;
          }
        }
      }
    }
  })();

  // ══════════════════════════════════════════════════
  // 15. FAVORI (page wiki) — bouton dans la page de lecture
  // ══════════════════════════════════════════════════
  (function () {
    var btn = document.getElementById("wiki-fav-btn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      fetch("/favoris/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemType: "wiki", itemId: Number(btn.dataset.itemId) }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) btn.classList.toggle("active", d.active);
        });
    });
  })();

  // ══════════════════════════════════════════════════
  // 16. ÉDITEUR DE VARIANTES (formulaire position)
  // ══════════════════════════════════════════════════
  (function () {
    var editor    = document.getElementById("wiki-variante-editor");
    var hiddenIn  = document.getElementById("wiki-variantes-hidden");
    if (!editor || !hiddenIn) return;

    var varList = editor.querySelector(".wiki-var-list");
    var addBtn  = editor.querySelector(".wiki-var-add-btn");

    // Données en mémoire
    var data = [];
    try { data = JSON.parse(hiddenIn.value || "[]"); } catch (_) { data = []; }
    if (!Array.isArray(data)) data = [];

    function uid() { return "v_" + Date.now() + "_" + Math.floor(Math.random() * 1e6); }

    function sync() {
      hiddenIn.value = JSON.stringify(data);
    }

    // Miniatures des images existantes d'une variante avec bouton de suppression
    function makeImgPreview(obj, fieldPrefix) {
      var zone = document.createElement("div");
      zone.className = "wiki-var-imgs";
      function render() {
        zone.innerHTML = "";
        var imgs = Array.isArray(obj.images) ? obj.images : [];
        imgs.forEach(function (src, i) {
          var thumb = document.createElement("div");
          thumb.className = "wiki-var-img-thumb";
          var img = document.createElement("img");
          img.src = src;
          img.alt = "";
          var rm = document.createElement("button");
          rm.type = "button";
          rm.className = "wiki-var-img-rm";
          rm.title = "Supprimer cette image";
          rm.textContent = "\u00D7";
          rm.addEventListener("click", function () {
            obj.images.splice(i, 1);
            sync();
            render();
          });
          thumb.appendChild(img);
          thumb.appendChild(rm);
          zone.appendChild(thumb);
        });
        // Champ d'upload pour ajouter des images
        var fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.name = fieldPrefix + obj.id;
        fileInput.accept = "image/*";
        fileInput.multiple = true;
        fileInput.className = "wiki-var-img-input";
        zone.appendChild(fileInput);
      }
      render();
      return zone;
    }

    function makeSubItem(sv, parentData) {
      var wrap = document.createElement("div");
      wrap.className = "wiki-var-sub-item";
      wrap.dataset.id = sv.id;

      var head = document.createElement("div");
      head.className = "wiki-var-item-head";

      var nom = document.createElement("input");
      nom.type = "text";
      nom.className = "wiki-var-nom";
      nom.placeholder = "Nom de la sous-variante\u2026";
      nom.value = sv.nom || "";
      nom.addEventListener("input", function () { sv.nom = nom.value; sync(); });

      var del = document.createElement("button");
      del.type = "button";
      del.className = "wiki-var-del-btn";
      del.title = "Supprimer";
      del.textContent = "\u00D7";
      del.addEventListener("click", function () {
        var idx = parentData.variantes.indexOf(sv);
        if (idx !== -1) parentData.variantes.splice(idx, 1);
        wrap.remove();
        sync();
      });

      head.appendChild(nom);
      head.appendChild(del);

      var desc = document.createElement("textarea");
      desc.className = "wiki-var-desc";
      desc.placeholder = "Description\u2026";
      desc.rows = 2;
      desc.value = sv.description || "";
      desc.addEventListener("input", function () { sv.description = desc.value; sync(); });

      if (!Array.isArray(sv.images)) sv.images = [];
      wrap.appendChild(head);
      wrap.appendChild(desc);
      wrap.appendChild(makeImgPreview(sv, "variante_sub_img_"));
      return wrap;
    }

    function makeItem(v) {
      var wrap = document.createElement("div");
      wrap.className = "wiki-var-item";
      wrap.dataset.id = v.id;

      var head = document.createElement("div");
      head.className = "wiki-var-item-head";

      var nom = document.createElement("input");
      nom.type = "text";
      nom.className = "wiki-var-nom";
      nom.placeholder = "Nom de la variante\u2026";
      nom.value = v.nom || "";
      nom.addEventListener("input", function () { v.nom = nom.value; sync(); });

      var del = document.createElement("button");
      del.type = "button";
      del.className = "wiki-var-del-btn";
      del.title = "Supprimer";
      del.textContent = "\u00D7";
      del.addEventListener("click", function () {
        var idx = data.indexOf(v);
        if (idx !== -1) data.splice(idx, 1);
        wrap.remove();
        sync();
      });

      head.appendChild(nom);
      head.appendChild(del);

      var desc = document.createElement("textarea");
      desc.className = "wiki-var-desc";
      desc.placeholder = "Description\u2026";
      desc.rows = 3;
      desc.value = v.description || "";
      desc.addEventListener("input", function () { v.description = desc.value; sync(); });

      if (!Array.isArray(v.images)) v.images = [];

      var subList = document.createElement("div");
      subList.className = "wiki-var-sub-list";
      if (!Array.isArray(v.variantes)) v.variantes = [];
      v.variantes.forEach(function (sv) { subList.appendChild(makeSubItem(sv, v)); });

      var subAddBtn = document.createElement("button");
      subAddBtn.type = "button";
      subAddBtn.className = "wiki-var-sub-add-btn";
      subAddBtn.textContent = "+ Ajouter une sous-variante";
      subAddBtn.addEventListener("click", function () {
        var sv = { id: uid(), nom: "", description: "", images: [] };
        v.variantes.push(sv);
        subList.appendChild(makeSubItem(sv, v));
        sync();
      });

      wrap.appendChild(head);
      wrap.appendChild(desc);
      wrap.appendChild(makeImgPreview(v, "variante_img_"));
      wrap.appendChild(subList);
      wrap.appendChild(subAddBtn);
      return wrap;
    }

    // Initialiser depuis données existantes
    data.forEach(function (v) {
      if (!v.id) v.id = uid();
      if (!Array.isArray(v.variantes)) v.variantes = [];
      varList.appendChild(makeItem(v));
    });

    addBtn.addEventListener("click", function () {
      var v = { id: uid(), nom: "", description: "", variantes: [] };
      data.push(v);
      varList.appendChild(makeItem(v));
      sync();
    });
  })();

  // ══════════════════════════════════════════════════
  // 17. NOTES PERSONNELLES (page de lecture)
  // ══════════════════════════════════════════════════
  (function () {
    var noteWrap = document.querySelector(".wiki-user-note");
    if (!noteWrap) return;
    var area   = noteWrap.querySelector(".wiki-user-note-area");
    var status = noteWrap.querySelector(".wiki-user-note-status");
    var pageId = Number(noteWrap.dataset.pageId);
    if (!area || !pageId) return;

    var timer = null;
    var saving = false;

    function save() {
      if (saving) return;
      saving = true;
      status.textContent = "Enregistrement\u2026";
      fetch("/wiki/" + pageId + "/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: area.value }),
      })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          saving = false;
          status.textContent = d.ok ? "Sauvegard\u00e9" : "Erreur";
          setTimeout(function () { status.textContent = ""; }, 2000);
        })
        .catch(function () {
          saving = false;
          status.textContent = "Erreur";
        });
    }

    area.addEventListener("input", function () {
      clearTimeout(timer);
      status.textContent = "";
      timer = setTimeout(save, 1200);
    });
  })();

})();
