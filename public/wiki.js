(function () {
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

  var categoryFilter = document.getElementById("wiki-category-filter");
  var tagFilter = document.getElementById("wiki-tag-filter");
  var list = document.getElementById("wiki-list");
  var activeCategory = "";
  var activeTag = "";

  function applyFilters() {
    if (!list) return;
    var cards = list.querySelectorAll(".wiki-card");
    cards.forEach(function (card) {
      var matchesCategory =
        !activeCategory ||
        (activeCategory === "__owned__" ? card.dataset.owned === "1" : card.dataset.category === activeCategory);
      var tags = (card.dataset.tags || "").split("|");
      var matchesTag = !activeTag || tags.indexOf(activeTag) !== -1;
      card.hidden = !(matchesCategory && matchesTag);
    });
  }

  if (categoryFilter) {
    categoryFilter.querySelectorAll(".tag-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        categoryFilter.querySelectorAll(".tag-chip").forEach(function (c) {
          c.classList.remove("active");
        });
        chip.classList.add("active");
        activeCategory = chip.dataset.category || "";
        applyFilters();
      });
    });
  }

  if (tagFilter) {
    tagFilter.querySelectorAll(".tag-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        tagFilter.querySelectorAll(".tag-chip").forEach(function (c) {
          c.classList.remove("active");
        });
        chip.classList.add("active");
        activeTag = (chip.dataset.tag || "").toLowerCase();
        applyFilters();
      });
    });
  }

  var addForm = document.querySelector(".links-add-form");
  if (addForm) {
    addForm.addEventListener("submit", function () {
      var btn = addForm.querySelector('button[type="submit"]');
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = "Enregistrement...";
    });
  }

  document.querySelectorAll(".link-delete-form, .link-delete-form-inline").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      if (!window.confirm("Supprimer cette page ?")) {
        e.preventDefault();
      }
    });
  });
})();
