(function () {
  // =====================
  // MARKDOWN RENDERER
  // =====================
  function esc(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function inline(s) {
    return s
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code>$1</code>");
  }

  function renderMarkdown(text) {
    if (!text) return "";
    var lines = text.split("\n");
    var out = [];
    var inList = false;

    function closeList() {
      if (inList) { out.push("</ul>"); inList = false; }
    }

    lines.forEach(function (rawLine) {
      var line = esc(rawLine);
      if (/^## /.test(line)) {
        closeList();
        out.push("<h2>" + inline(line.slice(3)) + "</h2>");
      } else if (/^### /.test(line)) {
        closeList();
        out.push("<h3>" + inline(line.slice(4)) + "</h3>");
      } else if (/^---+\s*$/.test(line)) {
        closeList();
        out.push("<hr />");
      } else if (/^- /.test(line)) {
        if (!inList) { out.push("<ul>"); inList = true; }
        out.push("<li>" + inline(line.slice(2)) + "</li>");
      } else if (line.trim() === "") {
        closeList();
      } else {
        closeList();
        out.push("<p>" + inline(line) + "</p>");
      }
    });
    closeList();
    return out.join("\n");
  }

  // =====================
  // RENDER DETAIL CONTENT
  // =====================
  document.querySelectorAll(".wiki-md").forEach(function (el) {
    var raw = el.querySelector(".wiki-md-raw");
    if (!raw) return;
    el.innerHTML = renderMarkdown(raw.textContent || raw.innerText);
  });

  // =====================
  // CATEGORY / OWNED SYNC
  // =====================
  var categorySelect = document.getElementById("wiki-category-select");
  var ownedField = document.getElementById("wiki-owned-field");

  function syncOwnedVisibility() {
    if (!categorySelect || !ownedField) return;
    ownedField.hidden = categorySelect.value !== "objets";
  }
  if (categorySelect) {
    categorySelect.addEventListener("change", syncOwnedVisibility);
    syncOwnedVisibility();
  }

  // =====================
  // CATEGORY / TAG FILTERS
  // =====================
  var categoryFilter = document.getElementById("wiki-category-filter");
  var tagFilter = document.getElementById("wiki-tag-filter");
  var list = document.getElementById("wiki-list");
  var activeCategory = "";
  var activeTag = "";

  function applyFilters() {
    if (!list) return;
    list.querySelectorAll(".wiki-card").forEach(function (card) {
      var matchesCategory =
        !activeCategory ||
        (activeCategory === "__owned__"
          ? card.dataset.owned === "1"
          : card.dataset.category === activeCategory);
      var tags = (card.dataset.tags || "").split("|");
      var matchesTag = !activeTag || tags.indexOf(activeTag) !== -1;
      card.hidden = !(matchesCategory && matchesTag);
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

  // =====================
  // AUTO-RESIZE TEXTAREA
  // =====================
  function autoResize(ta) {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  }

  document.querySelectorAll(".wiki-textarea").forEach(function (ta) {
    ta.addEventListener("input", function () { autoResize(ta); });
    autoResize(ta);
  });

  // =====================
  // IMAGE PREVIEW
  // =====================
  document.querySelectorAll(".wiki-image-field").forEach(function (wrapper) {
    var input = wrapper.querySelector(".wiki-image-input");
    var preview = wrapper.querySelector(".wiki-image-preview-new");
    var removeChk = wrapper.querySelector("#wiki-remove-image");
    var currentImg = wrapper.querySelector("#wiki-current-image");
    if (!input || !preview) return;

    input.addEventListener("change", function () {
      if (input.files && input.files[0]) {
        preview.src = URL.createObjectURL(input.files[0]);
        preview.hidden = false;
        // Si on uploade une nouvelle image, la case "supprimer" devient inutile
        if (removeChk) removeChk.checked = false;
      } else {
        preview.hidden = true;
        preview.src = "";
      }
    });

    // Masquer l'image actuelle quand on coche "supprimer"
    if (removeChk && currentImg) {
      removeChk.addEventListener("change", function () {
        currentImg.style.opacity = removeChk.checked ? "0.3" : "1";
      });
    }
  });

  // =====================
  // TAG SUGGESTIONS
  // =====================
  document.querySelectorAll(".wiki-tag-suggestions").forEach(function (container) {
    var inputId = container.dataset.for;
    var input = document.getElementById(inputId);
    if (!input) return;

    function currentTags() {
      return input.value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    }

    function syncChips() {
      var current = currentTags();
      container.querySelectorAll(".wiki-tag-chip").forEach(function (chip) {
        chip.classList.toggle("active", current.indexOf(chip.dataset.tag) !== -1);
      });
    }

    container.querySelectorAll(".wiki-tag-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var tag = chip.dataset.tag;
        var current = currentTags();
        var idx = current.indexOf(tag);
        if (idx === -1) {
          current.push(tag);
        } else {
          current.splice(idx, 1);
        }
        input.value = current.join(", ");
        syncChips();
      });
    });

    input.addEventListener("input", syncChips);
    syncChips();
  });

  // =====================
  // MARKDOWN TOOLBAR
  // =====================
  function insertMd(ta, action) {
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var sel = ta.value.slice(start, end);
    var before = ta.value.slice(0, start);
    var after = ta.value.slice(end);
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
        var lineText = before.slice(ls).replace(/^#{1,6}\s*/, "");
        before = before.slice(0, ls) + "## " + lineText;
        ta.value = before + sel + after;
        cursor = before.length + sel.length;
        autoResize(ta);
        ta.selectionStart = ta.selectionEnd = cursor;
        ta.focus();
        return;
      }
      case "h3": {
        var ls3 = before.lastIndexOf("\n") + 1;
        var lineText3 = before.slice(ls3).replace(/^#{1,6}\s*/, "");
        before = before.slice(0, ls3) + "### " + lineText3;
        ta.value = before + sel + after;
        cursor = before.length + sel.length;
        autoResize(ta);
        ta.selectionStart = ta.selectionEnd = cursor;
        ta.focus();
        return;
      }
      case "list":
        if (sel) {
          insert = sel.split("\n").map(function (l) { return "- " + l; }).join("\n");
        } else {
          insert = "- ";
        }
        cursor = start + insert.length;
        break;
      case "hr":
        insert = (before === "" || before.endsWith("\n") ? "" : "\n") + "---\n";
        cursor = start + insert.length;
        break;
      default:
        return;
    }

    ta.value = before + insert + after;
    ta.selectionStart = ta.selectionEnd = cursor;
    autoResize(ta);
    ta.focus();
  }

  document.querySelectorAll(".md-toolbar").forEach(function (toolbar) {
    var editor = toolbar.closest(".wiki-editor");
    if (!editor) return;
    var ta = editor.querySelector(".wiki-textarea");
    var previewPane = editor.querySelector(".wiki-md-preview");
    var previewBtn = toolbar.querySelector(".md-preview-btn");
    var isPreview = false;
    if (!ta) return;

    toolbar.querySelectorAll("[data-md]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        insertMd(ta, btn.dataset.md);
      });
    });

    ta.addEventListener("keydown", function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key === "b") { e.preventDefault(); insertMd(ta, "bold"); }
      if (e.key === "i") { e.preventDefault(); insertMd(ta, "italic"); }
    });

    if (previewBtn && previewPane) {
      previewBtn.addEventListener("click", function (e) {
        e.preventDefault();
        isPreview = !isPreview;
        if (isPreview) {
          var rendered = renderMarkdown(ta.value);
          previewPane.innerHTML = rendered || "<p class=\"wiki-md-empty\">Rien &agrave; afficher.</p>";
          ta.hidden = true;
          previewPane.hidden = false;
          previewBtn.textContent = "\u00c9diter";
          previewBtn.classList.add("active");
        } else {
          ta.hidden = false;
          previewPane.hidden = true;
          previewBtn.textContent = "Aper\u00e7u";
          previewBtn.classList.remove("active");
        }
      });
    }
  });

  // =====================
  // SUBMIT GUARDS
  // =====================
  document.querySelectorAll(".wiki-form").forEach(function (form) {
    form.addEventListener("submit", function () {
      // S'assurer que la textarea est visible pour que son contenu soit soumis
      var ta = form.querySelector(".wiki-textarea");
      if (ta) ta.hidden = false;
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = "Enregistrement\u2026"; }
    });
  });

  document.querySelectorAll(".link-delete-form, .link-delete-form-inline").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      if (!window.confirm("Supprimer cette page ?")) e.preventDefault();
    });
  });
})();
