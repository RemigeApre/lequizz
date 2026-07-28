(function () {
  var STORAGE_KEY = "lequizz_attempt";
  var HISTORY_KEY = "lequizz_history";

  var config = null;
  var state = null;
  var app = document.getElementById("app");

  function loadAttempt() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { data: {}, sectionIndex: 0, doneGroups: {}, toTest: {} };
      var parsed = JSON.parse(raw);
      return {
        data: parsed.data || {},
        sectionIndex: parsed.sectionIndex || 0,
        doneGroups: parsed.doneGroups || {},
        toTest: parsed.toTest || {},
      };
    } catch (e) {
      return { data: {}, sectionIndex: 0, doneGroups: {}, toTest: {} };
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function clearAttempt() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function saveHistory(scores) {
    var history = [];
    try {
      history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    } catch (e) {
      history = [];
    }
    history.unshift({ date: new Date().toISOString(), scores: scores });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
    return history;
  }

  function renderRanking(r, existingOrder) {
    var order = Array.isArray(existingOrder) ? existingOrder : r.items.map(function (_, i) { return i; });
    var html = '<fieldset class="question" data-ranking-id="' + r.id + '">';
    html += "<legend>" + r.label + "</legend>";
    html += '<ul class="ranking-list" data-question-id="ranking_' + r.id + '">';
    order.forEach(function (itemIdx) {
      html += '<li draggable="true" data-index="' + itemIdx + '"><span class="handle">&#8942;&#8942;</span> ' + r.items[itemIdx] + '</li>';
    });
    html += '</ul><input type="hidden" name="ranking_' + r.id + '" class="ranking-order" /></fieldset>';
    return html;
  }

  function conditionMetClient(section, sectionData, condition) {
    if (!condition) return true;
    var items = window.Scoring.flattenItems(section);
    var idx = items.indexOf(condition.itemText);
    if (idx === -1) return true;
    var levels = (sectionData.matrix || {})[idx] || {};
    return Object.keys(levels).some(function (k) { return Number(levels[k]) > 1; });
  }

  function updateConditionalRankings(section) {
    if (!section.rankings) return;
    var sectionData = state.data[section.key] || {};
    section.rankings.forEach(function (r) {
      if (!r.condition) return;
      var fieldset = document.querySelector('[data-ranking-id="' + r.id + '"]');
      if (!fieldset) return;
      fieldset.style.display = conditionMetClient(section, sectionData, r.condition) ? "" : "none";
    });
  }

  function levelOptionText(lvl, valueNum) {
    return lvl.label + " (" + config.scaleLabels[valueNum - 1] + ")";
  }

  function setFreqClass(select, value) {
    select.className = select.className.replace(/\bfreq-val-\d+\b/g, "").trim();
    select.classList.add("freq-val-" + value);
  }

  function renderItemCard(item, i, existingMatrix, sectionKey) {
    var itemKey = sectionKey + ":" + i;
    var toTest = !!state.toTest[itemKey];
    var html = '<div class="item-card">';
    html += '<div class="item-header">';
    html += '<button type="button" class="test-toggle' + (toTest ? " active" : "") +
      '" data-item-key="' + itemKey + '" title="Marquer comme decouverte a tester">' +
      (toTest ? "★" : "☆") + " decouverte a tester</button>";
    html += '<span class="item-name">' + item + "</span>";
    html += "</div>";

    var firstLevelKey = config.levels[0].key;
    var firstVal = existingMatrix[i] ? Number(existingMatrix[i][firstLevelKey]) : 1;

    html += '<div class="level-picker" data-item-index="' + i + '">';
    html += '<select class="level-select' + (firstVal > 1 ? " level-answered" : "") + '">';
    config.levels.forEach(function (lvl) {
      var v = existingMatrix[i] ? Number(existingMatrix[i][lvl.key]) : 1;
      html += '<option value="' + lvl.key + '">' + levelOptionText(lvl, v) + "</option>";
    });
    html += '</select>';
    html += '<select class="freq-select freq-val-' + firstVal + '">';
    config.scaleLabels.forEach(function (label, li) {
      var sel = firstVal === li + 1 ? " selected" : "";
      html += '<option value="' + (li + 1) + '"' + sel + ">" + label + "</option>";
    });
    html += "</select></div>";

    config.levels.forEach(function (lvl) {
      var existingVal = existingMatrix[i] ? Number(existingMatrix[i][lvl.key]) : 1;
      html += '<input type="hidden" name="m_' + i + "_" + lvl.key + '" value="' + existingVal + '" />';
    });

    html += "</div>";
    return html;
  }

  function renderSpectrum(sp, existingValue) {
    var current = existingValue ? Number(existingValue) : 3;
    var html = '<fieldset class="question"><legend>' + sp.label + "</legend>";
    html += '<div class="pill-group" data-name="spectrum_' + sp.id + '">';
    sp.scaleLabels.forEach(function (label, li) {
      var active = current === li + 1 ? " active" : "";
      html += '<button type="button" class="pill' + active + '" data-value="' + (li + 1) + '">' + label + "</button>";
    });
    html += "</div>";
    html += '<input type="hidden" name="spectrum_' + sp.id + '" value="' + current + '" /></fieldset>';
    return html;
  }

  function renderMatrixSection(section, existingData) {
    var html = "";

    var multiGroup = section.groups.length > 1;
    if (multiGroup) {
      html += '<div class="fold-controls">' +
        '<button type="button" class="link-button" data-fold-action="open">Tout deplier</button>' +
        '<button type="button" class="link-button" data-fold-action="close">Tout replier</button>' +
        '</div>';
    }

    var globalIndex = 0;
    var existingMatrix = (existingData && existingData.matrix) || {};

    section.groups.forEach(function (group, gi) {
      var groupKey = section.key + ":" + gi;
      var isDone = !!state.doneGroups[groupKey];
      var openAttr = (!multiGroup || gi === 0) && !isDone ? " open" : "";
      html += '<details class="matrix-group' + (isDone ? " done" : "") + '"' + openAttr +
        ' data-group-key="' + groupKey + '"><summary>' +
        '<span class="group-title-text">' + (group.title || "Toutes les pratiques") + " (" + group.items.length + ")</span>" +
        '<label class="group-done-toggle"><input type="checkbox" class="group-done-checkbox"' +
        (isDone ? " checked" : "") + " /> OK, termine</label></summary>";
      html += '<div class="item-cards">';

      group.items.forEach(function (item) {
        var i = globalIndex;
        globalIndex += 1;
        html += renderItemCard(item, i, existingMatrix, section.key);
      });

      html += "</div></details>";
    });

    (section.rankings || []).forEach(function (r) {
      var existingOrder = existingData && existingData.rankings && existingData.rankings[r.id];
      html += renderRanking(r, existingOrder);
    });

    (section.spectrums || []).forEach(function (sp) {
      var existingValue = existingData && existingData.spectrums && existingData.spectrums[sp.id];
      html += renderSpectrum(sp, existingValue);
    });

    return html;
  }

  function renderProfileSection(section, existingData) {
    var html = "";
    var existingFields = (existingData && existingData.fields) || {};

    section.fields.forEach(function (f) {
      html += '<fieldset class="question"><legend>' + f.label + '</legend><div class="choices">';
      f.options.forEach(function (opt, optIndex) {
        var checked = String(existingFields[f.id]) === String(optIndex) ? " checked" : "";
        html +=
          '<label class="choice"><input type="radio" name="field_' + f.id + '" value="' + optIndex + '"' +
          checked + " /> " + opt + "</label>";
      });
      html += "</div></fieldset>";
    });

    (section.rankings || []).forEach(function (r) {
      var existingOrder = existingData && existingData.rankings && existingData.rankings[r.id];
      html += renderRanking(r, existingOrder);
    });

    return html;
  }

  function parseSection(section, idx) {
    var form = document.getElementById("quiz-form");
    var formData = new FormData(form);

    if (section.type === "matrix") {
      var items = window.Scoring.flattenItems(section);
      var matrix = {};
      items.forEach(function (_, i) {
        var levels = {};
        config.levels.forEach(function (lvl) {
          var v = Number(formData.get("m_" + i + "_" + lvl.key));
          levels[lvl.key] = Number.isNaN(v) ? 1 : v;
        });
        matrix[i] = levels;
      });

      var rankings = {};
      (section.rankings || []).forEach(function (r) {
        var raw = formData.get("ranking_" + r.id);
        rankings[r.id] = raw ? String(raw).split(",").map(Number) : r.items.map(function (_, i) { return i; });
      });

      var spectrums = {};
      (section.spectrums || []).forEach(function (sp) {
        var v = Number(formData.get("spectrum_" + sp.id));
        spectrums[sp.id] = Number.isNaN(v) ? 3 : v;
      });

      return { matrix: matrix, rankings: rankings, spectrums: spectrums };
    }

    if (section.type === "profile") {
      var fields = {};
      section.fields.forEach(function (f) {
        fields[f.id] = formData.get("field_" + f.id);
      });
      var rankings2 = {};
      (section.rankings || []).forEach(function (r) {
        var raw2 = formData.get("ranking_" + r.id);
        rankings2[r.id] = raw2 ? String(raw2).split(",").map(Number) : r.items.map(function (_, i) { return i; });
      });
      return { fields: fields, rankings: rankings2 };
    }

    return {};
  }

  function renderResultRow(section, s) {
    var html = '<div class="result-section"><h2>' + section.title + "</h2>";

    if (s.type === "matrix") {
      html += '<div class="result-row"><div class="result-label"><span>Score global</span><span>' +
        s.percentage + '%</span></div><div class="bar"><div class="bar-fill" style="width:' +
        s.percentage + '%"></div></div></div>';
      Object.keys(s.rankings || {}).forEach(function (rid) {
        html += '<p class="ranking-result"><strong>Classement :</strong> ' + s.rankings[rid].join(" > ") + "</p>";
      });
      Object.keys(s.spectrums || {}).forEach(function (spid) {
        var sp = section.spectrums.find(function (x) { return x.id === spid; });
        html += '<p class="ranking-result"><strong>' + (sp ? sp.label : spid) + " :</strong> " + s.spectrums[spid] + "</p>";
      });
    } else if (s.type === "profile") {
      html += '<ul class="answer-list">';
      section.fields.forEach(function (f) {
        html += "<li><strong>" + f.label + "</strong><br /><span>" + (s.fields[f.id] || "-") + "</span></li>";
      });
      Object.keys(s.rankings || {}).forEach(function (rid) {
        html += "<li><strong>Classement</strong><br /><span>" + s.rankings[rid].join(" > ") + "</span></li>";
      });
      html += "</ul>";
    }

    html += "</div>";
    return html;
  }

  function renderHistory(history) {
    if (!history || history.length <= 1) return "";
    var html = '<div class="result-section"><h2>Historique (sur ce navigateur)</h2><ul class="answer-list">';
    history.slice(1).forEach(function (entry) {
      var d = new Date(entry.date).toLocaleString("fr-FR");
      var parts = config.sections
        .filter(function (s) { return s.type === "matrix"; })
        .map(function (s) {
          var sc = entry.scores.sections[s.key];
          return s.title + ": " + (sc ? sc.percentage : "-") + "%";
        })
        .join(" — ");
      html += "<li><strong>" + d + "</strong><br /><span>" + parts + "</span></li>";
    });
    html += "</ul></div>";
    return html;
  }

  function renderToTestList() {
    var keys = Object.keys(state.toTest).filter(function (k) { return state.toTest[k]; });
    if (!keys.length) return "";

    var html = '<div class="result-section"><h2>Tes decouvertes a tester (' + keys.length + ")</h2><ul class=\"answer-list\">";
    keys.forEach(function (key) {
      var parts = key.split(":");
      var sectionKey = parts[0];
      var itemIdx = Number(parts[1]);
      var section = config.sections.find(function (s) { return s.key === sectionKey; });
      if (!section) return;
      var items = window.Scoring.flattenItems(section);
      var label = items[itemIdx];
      if (label === undefined) return;
      html += "<li><span>" + label + " <em>(" + section.title + ")</em></span></li>";
    });
    html += "</ul></div>";
    return html;
  }

  function computeCurrentScores() {
    return window.Scoring.computeScores(config, state.data);
  }

  function renderTopNav() {
    return '<div class="top-nav">' +
      '<span class="top-nav-brand">' + config.title + "</span>" +
      '<button type="button" id="results-nav-btn" class="top-nav-results">Resultats</button>' +
      "</div>";
  }

  function wireTopNav() {
    document.getElementById("results-nav-btn").addEventListener("click", function () {
      renderResult(computeCurrentScores(), false);
    });
  }

  function renderResult(scores, isFinal) {
    var html = renderTopNav();
    html += "<h1>" + (isFinal ? "Merci, voici ton resultat" : "Tes resultats jusqu'ici") + "</h1>";
    if (!isFinal) {
      html += '<p class="intro">Le quiz n\'est pas termine : voici les resultats bases sur ce que tu as deja rempli.</p>';
    }
    config.sections.forEach(function (section) {
      html += renderResultRow(section, scores.sections[section.key]);
    });
    html += renderToTestList();

    if (isFinal) {
      html += renderHistory(saveHistory(scores));
    }

    html += '<div class="form-actions">';
    if (isFinal) {
      html += '<button type="button" id="restart-btn">Refaire le quiz</button>';
    } else {
      html += '<button type="button" id="continue-btn">Continuer le quiz</button>';
    }
    html += "</div>";

    app.innerHTML = html;
    wireTopNav();

    if (isFinal) {
      document.getElementById("restart-btn").addEventListener("click", function () {
        state = { data: {}, sectionIndex: 0, doneGroups: {}, toTest: {} };
        persist();
        renderSection(0);
      });
    } else {
      document.getElementById("continue-btn").addEventListener("click", function () {
        renderSection(Math.min(Math.max(state.sectionIndex, 0), config.sections.length - 1));
      });
    }
  }

  function renderSection(idx) {
    var section = config.sections[idx];
    var html = renderTopNav();
    html += '<p class="progress">Etape ' + (idx + 1) + " / " + config.sections.length + "</p>";
    html += "<h1>" + section.title + "</h1>";
    if (idx === 0 && config.intro) html += '<p class="intro">' + config.intro + "</p>";
    if (section.intro) html += '<p class="intro">' + section.intro + "</p>";

    html += '<form id="quiz-form">';
    html += section.type === "matrix"
      ? renderMatrixSection(section, state.data[section.key])
      : renderProfileSection(section, state.data[section.key]);

    html += '<div class="form-actions">';
    if (idx > 0) html += '<button type="button" id="prev-btn" class="link-button">&larr; Section precedente</button>';
    html += '<button type="submit">' + (idx + 1 >= config.sections.length ? "Voir mon resultat" : "Section suivante") + "</button>";
    html += "</div></form>";

    app.innerHTML = html;
    wireTopNav();
    window.initRankingLists();
    if (section.type === "matrix") updateConditionalRankings(section);

    var quizForm = document.getElementById("quiz-form");
    quizForm.addEventListener("change", function (e) {
      var freqSelect = e.target.closest(".freq-select");
      if (freqSelect) {
        var picker = freqSelect.closest(".level-picker");
        var levelSelect = picker.querySelector(".level-select");
        var itemIndex = picker.dataset.itemIndex;
        var levelKey = levelSelect.value;
        var lvl = config.levels.find(function (l) { return l.key === levelKey; });
        var hidden = picker.parentElement.querySelector(
          'input[type="hidden"][name="m_' + itemIndex + "_" + levelKey + '"]'
        );
        var v = Number(freqSelect.value);
        if (hidden) hidden.value = freqSelect.value;
        var opt = levelSelect.querySelector('option[value="' + levelKey + '"]');
        if (opt && lvl) opt.textContent = levelOptionText(lvl, v);
        setFreqClass(freqSelect, v);
        levelSelect.classList.toggle("level-answered", v > 1);
      }

      var levelSelectChanged = e.target.closest(".level-select");
      if (levelSelectChanged) {
        var picker2 = levelSelectChanged.closest(".level-picker");
        var freqSelect2 = picker2.querySelector(".freq-select");
        var itemIndex2 = picker2.dataset.itemIndex;
        var levelKey2 = levelSelectChanged.value;
        var hidden2 = picker2.parentElement.querySelector(
          'input[type="hidden"][name="m_' + itemIndex2 + "_" + levelKey2 + '"]'
        );
        var v2 = hidden2 ? Number(hidden2.value) : 1;
        freqSelect2.value = String(v2);
        setFreqClass(freqSelect2, v2);
        levelSelectChanged.classList.toggle("level-answered", v2 > 1);
      }

      state.data[section.key] = parseSection(section, idx);
      persist();
      if (section.type === "matrix") updateConditionalRankings(section);
    });

    quizForm.addEventListener("submit", function (e) {
      e.preventDefault();
      state.data[section.key] = parseSection(section, idx);
      var nextIdx = idx + 1;
      if (nextIdx >= config.sections.length) {
        var scores = window.Scoring.computeScores(config, state.data);
        clearAttempt();
        renderResult(scores, true);
        return;
      }
      state.sectionIndex = nextIdx;
      persist();
      renderSection(nextIdx);
    });

    var prevBtn = document.getElementById("prev-btn");
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        state.data[section.key] = parseSection(section, idx);
        state.sectionIndex = idx - 1;
        persist();
        renderSection(idx - 1);
      });
    }

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

    document.querySelectorAll(".group-done-checkbox").forEach(function (checkbox) {
      checkbox.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      checkbox.addEventListener("change", function () {
        var details = checkbox.closest("details.matrix-group");
        var groupKey = details.dataset.groupKey;
        state.doneGroups[groupKey] = checkbox.checked;
        persist();
        details.classList.toggle("done", checkbox.checked);
        if (checkbox.checked) details.open = false;
      });
    });
  }

  // Delegated click handler for pills + "decouverte a tester" — attached once, survives re-renders.
  app.addEventListener("click", function (e) {
    var testBtn = e.target.closest(".test-toggle");
    if (testBtn) {
      var itemKey = testBtn.dataset.itemKey;
      var isOn = !state.toTest[itemKey];
      state.toTest[itemKey] = isOn;
      persist();
      testBtn.classList.toggle("active", isOn);
      testBtn.textContent = (isOn ? "★" : "☆") + " decouverte a tester";
      return;
    }

    var btn = e.target.closest(".pill");
    if (!btn) return;
    var group = btn.closest(".pill-group");
    var input = group.parentElement.querySelector('input[type="hidden"][name="' + group.dataset.name + '"]');
    if (input) {
      input.value = btn.dataset.value;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    Array.prototype.forEach.call(group.querySelectorAll(".pill"), function (p) {
      p.classList.remove("active");
    });
    btn.classList.add("active");
  });

  fetch("./questions.json")
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      config = cfg;
      state = loadAttempt();
      var idx = Math.min(Math.max(state.sectionIndex, 0), config.sections.length - 1);
      renderSection(idx);
    });
})();
