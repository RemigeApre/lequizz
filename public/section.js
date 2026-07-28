(function () {
  var LEVEL_COLORS = { a: "#6c8ebf", b: "#9b6cbf", c: "#4fa5a0", d: "#d9932f", e: "#c0455a" };

  function setFreqClass(select, value) {
    select.className = select.className.replace(/\bfreq-val-\d+\b/g, "").trim();
    select.classList.add("freq-val-" + value);
  }

  function levelOptionLabel(select, levelKey) {
    return select.querySelector('option[value="' + levelKey + '"]');
  }

  document.querySelectorAll(".level-picker").forEach(function (picker) {
    var itemCard = picker.closest(".item-card");
    var levelSelect = picker.querySelector(".level-select");
    var freqSelect = picker.querySelector(".freq-select");
    var itemIndex = picker.dataset.itemIndex;

    function hiddenFor(levelKey) {
      return itemCard.querySelector('input[type="hidden"][name="m_' + itemIndex + "_" + levelKey + '"]');
    }

    freqSelect.addEventListener("change", function () {
      var levelKey = levelSelect.value;
      var hidden = hiddenFor(levelKey);
      if (hidden) hidden.value = freqSelect.value;
      var opt = levelOptionLabel(levelSelect, levelKey);
      if (opt) {
        var baseLabel = opt.textContent.replace(/\s*\([^)]*\)\s*$/, "");
        var freqLabel = freqSelect.options[freqSelect.selectedIndex].textContent;
        opt.textContent = baseLabel + " (" + freqLabel + ")";
      }
      setFreqClass(freqSelect, freqSelect.value);
    });

    levelSelect.addEventListener("change", function () {
      var levelKey = levelSelect.value;
      var hidden = hiddenFor(levelKey);
      var v = hidden ? hidden.value : "1";
      freqSelect.value = v;
      setFreqClass(freqSelect, v);
      levelSelect.style.borderLeftColor = LEVEL_COLORS[levelKey] || "";
    });
  });

  document.querySelectorAll(".item-flag").forEach(function (details) {
    var summary = details.querySelector(".item-flag-summary");
    var itemCard = details.closest(".item-card");
    var testHidden = itemCard.querySelector(".test-hidden");
    var dislikeHidden = itemCard.querySelector(".dislike-hidden");

    details.querySelectorAll(".item-flag-option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var flag = btn.dataset.flag;
        testHidden.value = flag === "test" ? "1" : "0";
        dislikeHidden.value = flag === "dislike" ? "1" : "0";
        summary.classList.remove("flag-test", "flag-dislike");
        if (flag === "test") summary.classList.add("flag-test");
        if (flag === "dislike") summary.classList.add("flag-dislike");
        details.open = false;
        testHidden.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
  });

  document.querySelectorAll(".item-fav-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var hidden = btn.parentElement.querySelector(".fav-hidden");
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
})();
