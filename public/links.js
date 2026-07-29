(function () {
  var filterBar = document.getElementById("links-filter");
  var list = document.getElementById("links-list");
  var sortSelect = document.getElementById("links-sort-select");

  if (filterBar && list) {
    var activeTag = "";

    function applyFilter() {
      var cards = list.querySelectorAll(".link-card");
      cards.forEach(function (card) {
        if (!activeTag) {
          card.hidden = false;
          return;
        }
        var tags = (card.dataset.tags || "").split("|");
        card.hidden = tags.indexOf(activeTag) === -1;
      });
    }

    filterBar.querySelectorAll(".tag-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        filterBar.querySelectorAll(".tag-chip").forEach(function (c) {
          c.classList.remove("active");
        });
        chip.classList.add("active");
        activeTag = (chip.dataset.tag || "").toLowerCase();
        applyFilter();
      });
    });
  }

  if (sortSelect && list) {
    sortSelect.addEventListener("change", function () {
      var cards = Array.prototype.slice.call(list.querySelectorAll(".link-card"));
      if (sortSelect.value === "alpha") {
        cards.sort(function (a, b) {
          return a.dataset.title.localeCompare(b.dataset.title, "fr");
        });
      } else {
        cards.sort(function (a, b) {
          return Number(b.dataset.id) - Number(a.dataset.id);
        });
      }
      cards.forEach(function (card) {
        list.appendChild(card);
      });
    });
  }

  var addForm = document.querySelector(".links-add-form");
  if (addForm) {
    addForm.addEventListener("submit", function () {
      var btn = addForm.querySelector('button[type="submit"]');
      if (!btn) return;
      btn.disabled = true;
      btn.textContent = "Ajout...";
    });
  }

  document.querySelectorAll(".link-delete-form").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      if (!window.confirm("Supprimer ce lien ?")) {
        e.preventDefault();
      }
    });
  });
})();
