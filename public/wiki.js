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
  var ultraToggle     = document.getElementById("wiki-ultra-toggle");
  var wikiList        = document.getElementById("wiki-list");
  var searchInput     = document.getElementById("wiki-search-input");
  var searchClear     = document.getElementById("wiki-search-clear");
  var resultCount     = document.getElementById("wiki-result-count");
  var advToggle       = document.getElementById("wiki-adv-toggle");
  var advPanel        = document.getElementById("wiki-adv-panel");
  var advStarsWrap    = document.getElementById("wiki-adv-stars");
  var advStarReset    = document.getElementById("wiki-adv-star-reset");
  var advOwned        = document.getElementById("adv-owned");
  var advFlame        = document.getElementById("adv-flame");
  var advInterested   = document.getElementById("adv-interested");

  var activeCategory  = localStorage.getItem("wiki-filter-cat") || "";
  var activeTag       = localStorage.getItem("wiki-filter-tag") || "";
  var activeSort      = localStorage.getItem("wiki-filter-sort") || "alpha-asc";
  // Par défaut : ultra masqué. Seulement "0" explicite = affiché.
  var hideUltra       = localStorage.getItem("wiki-hide-ultra") !== "0";
  var searchQuery     = localStorage.getItem("wiki-filter-search") || "";
  var advMinRating    = Number(localStorage.getItem("wiki-filter-rating")) || 0;

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

  // Score de pertinence d'une carte pour un terme de recherche
  function scoreCard(card, q) {
    if (!q) return 1; // tout passe si pas de query
    var words = q.split(/\s+/).filter(Boolean);
    var title   = norm(card.dataset.title || "");
    var derived = norm(card.dataset.derived || "");
    var tags    = norm(card.dataset.tags || "").replace(/\|/g, " ");
    var content = norm(card.dataset.content || "");
    var cat     = norm(card.dataset.category || "");

    var score = 0;
    words.forEach(function (w) {
      if (title === w)              score += 12;
      else if (title.startsWith(w)) score += 8;
      else if (title.includes(w))   score += 5;

      if (derived.includes(w))      score += 4;
      if (tags.includes(w))         score += 3;
      if (content.includes(w))      score += 2;
      if (cat.includes(w))          score += 1;
    });
    return score;
  }

  function applyFilters() {
    if (!wikiList) return;
    var cards   = Array.from(wikiList.querySelectorAll(".wiki-card"));
    var q       = norm(searchQuery);
    var hasAdv  = advMinRating > 0 ||
                  (advOwned && advOwned.checked) ||
                  (advFlame && advFlame.checked) ||
                  (advInterested && advInterested.checked);

    var scores = new Map();

    // Filtrage
    cards.forEach(function (card) {
      var extraCats = (card.dataset.extraCats || "").split("|").filter(Boolean);
      var okCat = !activeCategory ||
        (activeCategory === "__owned__" ? card.dataset.owned === "1"
          : card.dataset.category === activeCategory || extraCats.indexOf(activeCategory) !== -1);
      var cardTags  = (card.dataset.tags || "").split("|");
      var okTag     = !activeTag || cardTags.indexOf(activeTag) !== -1;
      var okUltra   = !hideUltra || card.dataset.ultra !== "1";

      // Recherche textuelle
      var sc = scoreCard(card, q);
      var okSearch = !q || sc > 0;
      scores.set(card, sc);

      // Filtres avancés
      var okRating     = !advMinRating || Number(card.dataset.rating) >= advMinRating;
      var okOwned      = !(advOwned && advOwned.checked) || card.dataset.owned === "1";
      var okFlame      = !(advFlame && advFlame.checked) || card.dataset.flame === "1";
      var okInterested = !(advInterested && advInterested.checked) || card.dataset.interested === "1";

      card.hidden = !(okCat && okTag && okUltra && okSearch && okRating && okOwned && okFlame && okInterested);
    });

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

  // Checkboxes avancées
  var advCbMap = [
    [advOwned,      "wiki-filter-owned"],
    [advFlame,      "wiki-filter-flame"],
    [advInterested, "wiki-filter-interested"],
  ];
  advCbMap.forEach(function (pair) {
    var cb = pair[0], key = pair[1];
    if (!cb) return;
    if (localStorage.getItem(key) === "1") cb.checked = true;
    cb.addEventListener("change", function () {
      localStorage.setItem(key, cb.checked ? "1" : "0");
      applyFilters();
    });
  });

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
    tagFilter.querySelectorAll(".tag-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        tagFilter.querySelectorAll(".tag-chip").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        activeTag = (chip.dataset.tag || "").toLowerCase();
        localStorage.setItem("wiki-filter-tag", activeTag);
        applyFilters();
      });
    });
    // Restaure le tag actif visuellement
    if (activeTag) {
      var restoredTagChip = tagFilter.querySelector('[data-tag="' + activeTag + '"]');
      if (restoredTagChip) {
        tagFilter.querySelectorAll(".tag-chip").forEach(function (c) { c.classList.remove("active"); });
        restoredTagChip.classList.add("active");
      } else {
        activeTag = "";
        localStorage.removeItem("wiki-filter-tag");
      }
    }
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
    ultraToggle.textContent = hideUltra ? "\uD83D\uDD13 Afficher Ultra" : "\uD83D\uDD12 Masquer Ultra";
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

  // Restaure la barre de recherche
  if (searchInput && searchQuery) {
    searchInput.value = searchQuery;
    if (searchClear) searchClear.hidden = false;
  }
  // Ouvre le panneau avancé si un filtre avancé est actif
  var anyAdv = advMinRating > 0 ||
      (advOwned && advOwned.checked) ||
      (advFlame && advFlame.checked) ||
      (advInterested && advInterested.checked);
  if (advPanel && anyAdv) {
    advPanel.hidden = false;
    if (advToggle) advToggle.innerHTML = "Filtres avanc\u00e9s &#9652;";
  }

  var filtersPanel = document.getElementById("wiki-filters-panel");
  if (filtersPanel && (anyAdv || activeCategory || activeTag || activeSort !== "alpha-asc" || !hideUltra)) {
    filtersPanel.open = true;
  }

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
    document.querySelectorAll(".wiki-infobox-img, .wiki-gallery-img, .wiki-form-existing-image, .wiki-card-img").forEach(function (img) {
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

  // Rend cliquables toutes les images de la galerie et des formulaires
  function attachLightboxToImages() {
    document.querySelectorAll(".wiki-infobox-img, .wiki-gallery-img, .wiki-form-existing-image, .wiki-card-img").forEach(function (img) {
      if (img.dataset.lbBound) return;
      img.dataset.lbBound = "1";
      img.style.cursor = "zoom-in";
      img.addEventListener("click", function () {
        openLightbox(lbGetSrc(img));
      });
    });
  }
  attachLightboxToImages();

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
  // 11. CARROUSEL MOBILE (images suivantes)
  // ══════════════════════════════════════════════════
  (function () {
    var rail = document.querySelector(".wiki-infobox-images-rest");
    if (!rail) return;
    var imgs = rail.querySelectorAll(".wiki-infobox-img");
    if (imgs.length < 2) return;

    // Dots indicateurs
    var dotsWrap = document.createElement("div");
    dotsWrap.className = "wiki-carousel-dots";
    rail.parentNode.insertBefore(dotsWrap, rail.nextSibling);
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

    function goTo(i) {
      current = i;
      imgs[i].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      setDot(i);
    }

    setDot(0);

    // Auto-scroll toutes les 3,5 s si le carrousel est visible (mobile)
    var timer = setInterval(function () {
      if (paused) return;
      // Ne fait rien si le rail n'est pas scrollable (desktop)
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
    var KEY = "wiki-hero-collapsed";

    function apply(collapsed) {
      hero.classList.toggle("collapsed", collapsed);
      hero.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }

    apply(localStorage.getItem(KEY) === "1");

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
    var rating      = document.getElementById("wiki-hero-rating");
    var owned       = document.getElementById("wiki-hero-owned");
    var flame       = document.getElementById("wiki-hero-flame");
    var interested  = document.getElementById("wiki-hero-interested");

    form.addEventListener("submit", function () {
      if (rating)     localStorage.setItem("wiki-filter-rating", rating.value);
      if (owned)      localStorage.setItem("wiki-filter-owned", owned.checked ? "1" : "0");
      if (flame)      localStorage.setItem("wiki-filter-flame", flame.checked ? "1" : "0");
      if (interested) localStorage.setItem("wiki-filter-interested", interested.checked ? "1" : "0");
    });
  })();

  // ══════════════════════════════════════════════════
  // 7. NAVIGATION CONTEXTUELLE PRÉCÉDENT / SUIVANT
  // Les flèches de la page de lecture doivent suivre la position dans
  // la liste qu'on parcourait (résultats de recherche, chapitre d'une
  // catégorie…), pas toujours l'ordre alphabétique global. On mémorise
  // donc, au clic sur une carte, la liste déjà filtrée/triée où elle
  // se trouvait ; la page de lecture s'en sert si elle y retrouve son
  // propre id, sinon elle garde le repli alphabétique du serveur.
  // ══════════════════════════════════════════════════
  (function () {
    var NAV_KEY = "wikiNavContext";

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
    }, true);

    var prevBtn = document.getElementById("wiki-nav-prev");
    var nextBtn = document.getElementById("wiki-nav-next");
    if (!prevBtn || !nextBtn) return;

    var pageMatch = location.pathname.match(/^\/wiki\/(\d+)$/);
    if (!pageMatch) return;
    var currentId = Number(pageMatch[1]);

    var context = null;
    try { context = JSON.parse(sessionStorage.getItem(NAV_KEY) || "null"); } catch (_) { context = null; }
    if (!Array.isArray(context)) return;

    var idx = -1;
    context.forEach(function (entry, i) { if (entry && entry.id === currentId) idx = i; });
    if (idx === -1) return;

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
  })();

})();
