(function () {
  function setFreqClass(select, value) {
    select.className = select.className.replace(/\bfreq-val-\d+\b/g, "").trim();
    select.classList.add("freq-val-" + value);
  }

  function levelOptionLabel(select, levelKey) {
    var opt = select.querySelector('option[value="' + levelKey + '"]');
    return opt;
  }

  document.querySelectorAll(".level-picker").forEach(function (picker) {
    var itemCard = picker.closest(".item-card");
    var levelSelect = picker.querySelector(".level-select");
    var freqSelect = picker.querySelector(".freq-select");
    var itemIndex = picker.dataset.itemIndex;

    function hiddenFor(levelKey) {
      return itemCard.querySelector('input[type="hidden"][name="m_' + itemIndex + "_" + levelKey + '"]');
    }

    function updateFireIcon() {
      var maxValText = freqSelect.options[freqSelect.options.length - 1].value;
      var hiddenInputs = itemCard.querySelectorAll('input[type="hidden"][name^="m_' + itemIndex + '_"]');
      var hasMax = Array.prototype.some.call(hiddenInputs, function (inp) {
        return inp.value === maxValText;
      });
      var fire = itemCard.querySelector(".fire-icon");
      if (fire) fire.style.display = hasMax ? "" : "none";
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
      levelSelect.classList.toggle("level-answered", Number(freqSelect.value) > 1);
      updateFireIcon();
    });

    levelSelect.addEventListener("change", function () {
      var levelKey = levelSelect.value;
      var hidden = hiddenFor(levelKey);
      var v = hidden ? hidden.value : "1";
      freqSelect.value = v;
      setFreqClass(freqSelect, v);
      levelSelect.classList.toggle("level-answered", Number(v) > 1);
    });
  });

  document.querySelectorAll(".test-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var hidden = btn.parentElement.querySelector(".test-hidden");
      var isOn = hidden.value !== "1";
      hidden.value = isOn ? "1" : "0";
      btn.classList.toggle("active", isOn);
      btn.innerHTML = (isOn ? "&#9733;" : "&#9734;") + " decouverte a tester";
    });
  });

  document.querySelectorAll(".dislike-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var hidden = btn.parentElement.querySelector(".dislike-hidden");
      var isOn = hidden.value !== "1";
      hidden.value = isOn ? "1" : "0";
      btn.classList.toggle("active", isOn);
      btn.innerHTML = (isOn ? "&#128078;" : "&#129293;") + " aime pas";
    });
  });

  document.querySelectorAll(".group-done-checkbox").forEach(function (checkbox) {
    checkbox.addEventListener("click", function (e) {
      e.stopPropagation();
    });
    checkbox.addEventListener("change", function () {
      var details = checkbox.closest("details.matrix-group");
      var hidden = details.querySelector(".group-done-hidden");
      if (hidden) hidden.value = checkbox.checked ? "1" : "0";
      details.classList.toggle("done", checkbox.checked);
      if (checkbox.checked) details.open = false;
    });
  });

  var foldControls = document.querySelector(".fold-controls");
  if (foldControls) {
    foldControls.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-fold-action]");
      if (!btn) return;
      var open = btn.dataset.foldAction === "open";
      document.querySelectorAll("details.matrix-group").forEach(function (d) {
        d.open = open;
      });
    });
  }
})();
