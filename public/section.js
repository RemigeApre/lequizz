(function () {
  var LEVEL_COLORS = { jamais: "#7a7f87", a: "#6c8ebf", b: "#9b6cbf", c: "#4fa5a0", d: "#d9932f", e: "#c0455a" };

  function scaleFor(levelKey) {
    return levelKey === "jamais" ? (window.JAMAIS_SCALE || []) : (window.DEFAULT_SCALE || []);
  }

  // Reutilise le degrade freq-val-1..5 existant : l'echelle a 3 points de
  // "jamais" pioche dedans a intervalles larges (1, 3, 5).
  function freqValClass(levelKey, value) {
    if (levelKey === "jamais") {
      return "freq-val-" + ([1, 3, 5][value - 1] || 1);
    }
    return "freq-val-" + value;
  }

  function setFreqClass(select, className) {
    select.className = select.className.replace(/\bfreq-val-\d+\b/g, "").trim();
    select.classList.add(className);
  }

  // Certains items (godes ethniques/animaux/fantastiques...) ont un volet de
  // classement cache juste en dessous, qui ne s'affiche que si la reponse
  // n'est plus au defaut complet ("jamais" + valeur 1 = "pas interessee").
  function updateReveal(itemId, levelKey, value) {
    var target = document.getElementById("reveal-" + itemId);
    if (!target) return;
    target.hidden = levelKey === "jamais" && Number(value) === 1;
  }

  document.querySelectorAll(".level-picker").forEach(function (picker) {
    var itemCard = picker.closest(".item-card");
    var levelSelect = picker.querySelector(".level-select");
    var freqSelect = picker.querySelector(".freq-select");
    var itemId = picker.dataset.itemId;
    var variantKey = picker.dataset.variantKey;
    var namePrefix = "m_" + itemId + (variantKey !== undefined ? "_" + variantKey : "") + "_";

    function hiddenFor(levelKey) {
      return itemCard.querySelector('input[type="hidden"][name="' + namePrefix + levelKey + '"]');
    }

    freqSelect.addEventListener("change", function () {
      var levelKey = levelSelect.value;
      var hidden = hiddenFor(levelKey);
      if (hidden) hidden.value = freqSelect.value;
      setFreqClass(freqSelect, freqValClass(levelKey, Number(freqSelect.value)));
      updateReveal(itemId, levelKey, freqSelect.value);
    });

    levelSelect.addEventListener("change", function () {
      var levelKey = levelSelect.value;
      var scale = scaleFor(levelKey);
      var hidden = hiddenFor(levelKey);
      var v = hidden ? parseInt(hidden.value, 10) : 1;
      if (!v || v < 1 || v > scale.length) v = 1;

      freqSelect.innerHTML = "";
      scale.forEach(function (label, li) {
        var opt = document.createElement("option");
        opt.value = String(li + 1);
        opt.textContent = label;
        if (li + 1 === v) opt.selected = true;
        freqSelect.appendChild(opt);
      });

      setFreqClass(freqSelect, freqValClass(levelKey, v));
      levelSelect.style.borderLeftColor = LEVEL_COLORS[levelKey] || "";
      updateReveal(itemId, levelKey, v);
    });
  });

  document.querySelectorAll(".item-fav-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var hidden = btn.closest(".item-title-row").querySelector(".fav-hidden");
      var isOn = hidden.value !== "1";
      hidden.value = isOn ? "1" : "0";
      btn.classList.toggle("active", isOn);
      btn.innerHTML = isOn ? "&#9733;" : "&#9734;";
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  document.querySelectorAll(".group-done-toggle").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var details = btn.closest("details.matrix-group");
      var hidden = details.querySelector(".group-done-hidden");
      var isDone = hidden.value !== "1";
      hidden.value = isDone ? "1" : "0";
      btn.classList.toggle("active", isDone);
      btn.innerHTML = isDone ? "&#10003; Complet" : "Complet";
      details.classList.toggle("done", isDone);
      if (isDone) details.open = false;
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
    });
  });

  // Arrivée depuis "Questions liées" d'une page wiki (?q=...) : ouvre le
  // groupe concerné s'il était replié, puis défile jusqu'à la question et
  // la met brièvement en évidence.
  (function () {
    var q = new URLSearchParams(window.location.search).get("q");
    if (!q) return;

    var target = null;
    if (q.indexOf("spectrum:") === 0) {
      target = document.querySelector('[data-spectrum-id="' + CSS.escape(q.slice(9)) + '"]');
    } else if (q.indexOf("ranking:") === 0) {
      target = document.querySelector('[data-ranking-id="' + CSS.escape(q.slice(8)) + '"]');
    } else if (q.indexOf("multiselect:") === 0) {
      target = document.querySelector('[data-multiselect-id="' + CSS.escape(q.slice(12)) + '"]');
    } else {
      var picker = document.querySelector('.level-picker[data-item-id="' + CSS.escape(q) + '"]');
      target = picker ? picker.closest(".item-card") : document.querySelector('[data-field-id="' + CSS.escape(q) + '"]');
    }
    if (!target) return;

    var group = target.closest("details.matrix-group");
    if (group && !group.open) group.open = true;

    setTimeout(function () {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("wiki-link-highlight");
      setTimeout(function () { target.classList.remove("wiki-link-highlight"); }, 2500);
    }, 50);
  })();
})();
