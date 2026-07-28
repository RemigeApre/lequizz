(function () {
  var STORAGE_KEY = "lequizz_attempt";
  var HISTORY_KEY = "lequizz_history";

  var config = null;
  var state = null;
  var app = document.getElementById("app");

  function loadAttempt() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { data: {}, sectionIndex: 0, doneGroups: {} };
      var parsed = JSON.parse(raw);
      return {
        data: parsed.data || {},
        sectionIndex: parsed.sectionIndex || 0,
        doneGroups: parsed.doneGroups || {},
      };
    } catch (e) {
      return { data: {}, sectionIndex: 0, doneGroups: {} };
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function clearAttempt() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function hasProgress(attempt) {
    return attempt.sectionIndex > 0 || Object.keys(attempt.data || {}).length > 0;
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
    var html = '<fieldset class="question"><legend>' + r.label + '</legend>';
    html += '<ul class="ranking-list" data-question-id="ranking_' + r.id + '">';
    order.forEach(function (itemIdx) {
      html += '<li draggable="true" data-index="' + itemIdx + '"><span class="handle">&#8942;&#8942;</span> ' + r.items[itemIdx] + '</li>';
    });
    html += '</ul><input type="hidden" name="ranking_' + r.id + '" class="ranking-order" /></fieldset>';
    return html;
  }

  function renderItemCard(item, i, existingMatrix) {
    var html = '<div class="item-card"><div class="item-name">' + item + "</div>";
    config.levels.forEach(function (lvl) {
      var existingVal = existingMatrix[i] ? Number(existingMatrix[i][lvl.key]) : 1;
      var fieldName = "m_" + i + "_" + lvl.key;
      html += '<div class="level-row">';
      html += '<span class="level-label"><strong>' + lvl.key + "</strong> — " + lvl.label + "</span>";
      html += '<div class="pill-group" data-name="' + fieldName + '">';
      config.scaleLabels.forEach(function (label, li) {
        var active = existingVal === li + 1 ? " active" : "";
        html += '<button type="button" class="pill' + active + '" data-value="' + (li + 1) + '">' + label + "</button>";
      });
      html += "</div>";
      html += '<input type="hidden" name="' + fieldName + '" value="' + existingVal + '" />';
      html += "</div>";
    });
    html += "</div>";
    return html;
  }

  function renderMatrixSection(section, existingData) {
    var html = '<div class="legend">';
    config.levels.forEach(function (lvl) {
      html += '<span><strong>' + lvl.key + '</strong> = ' + lvl.label + '</span>';
    });
    html += '</div>';

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
        html += renderItemCard(item, i, existingMatrix);
      });

      html += "</div></details>";
    });

    (section.rankings || []).forEach(function (r) {
      var existingOrder = existingData && existingData.rankings && existingData.rankings[r.id];
      html += renderRanking(r, existingOrder);
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
          checked + " required /> " + opt + "</label>";
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

      return { matrix: matrix, rankings: rankings };
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

  function renderResult(scores) {
    var history = saveHistory(scores);
    var html = "<h1>Merci, voici ton resultat</h1>";
    config.sections.forEach(function (section) {
      html += renderResultRow(section, scores.sections[section.key]);
    });
    html += renderHistory(history);
    html += '<button type="button" id="restart-btn">Refaire le quiz</button>';
    app.innerHTML = html;
    document.getElementById("restart-btn").addEventListener("click", function () {
      state = { data: {}, sectionIndex: 0, doneGroups: {} };
      persist();
      renderSection(0);
    });
  }

  function renderResumePrompt(savedAttempt) {
    var idx = Math.min(Math.max(savedAttempt.sectionIndex, 0), config.sections.length - 1);
    var html = "<h1>Reprendre le quiz ?</h1>";
    html += '<p class="intro">Une progression a ete trouvee sur ce navigateur, arrivee a la section "' +
      config.sections[idx].title + '". Si c\'est une autre personne qui repond maintenant, choisis ' +
      '"Recommencer a zero".</p>';
    html += '<div class="form-actions">';
    html += '<button type="button" id="resume-btn">Reprendre ou j\'en etais</button>';
    html += '<button type="button" id="restart-fresh-btn" class="link-button">Recommencer a zero</button>';
    html += "</div>";
    app.innerHTML = html;

    document.getElementById("resume-btn").addEventListener("click", function () {
      state = savedAttempt;
      renderSection(idx);
    });
    document.getElementById("restart-fresh-btn").addEventListener("click", function () {
      state = { data: {}, sectionIndex: 0, doneGroups: {} };
      persist();
      renderSection(0);
    });
  }

  function renderSection(idx) {
    var section = config.sections[idx];
    var html = '<p class="progress">Etape ' + (idx + 1) + " / " + config.sections.length + "</p>";
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
    window.initRankingLists();

    document.getElementById("quiz-form").addEventListener("submit", function (e) {
      e.preventDefault();
      state.data[section.key] = parseSection(section, idx);
      var nextIdx = idx + 1;
      if (nextIdx >= config.sections.length) {
        var scores = window.Scoring.computeScores(config, state.data);
        clearAttempt();
        renderResult(scores);
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

  // Delegated click handler for pill buttons — attached once, survives re-renders.
  app.addEventListener("click", function (e) {
    var btn = e.target.closest(".pill");
    if (!btn) return;
    var group = btn.closest(".pill-group");
    var input = group.parentElement.querySelector('input[type="hidden"][name="' + group.dataset.name + '"]');
    if (input) input.value = btn.dataset.value;
    Array.prototype.forEach.call(group.querySelectorAll(".pill"), function (p) {
      p.classList.remove("active");
    });
    btn.classList.add("active");
  });

  fetch("./questions.json")
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      config = cfg;
      var saved = loadAttempt();
      if (hasProgress(saved)) {
        renderResumePrompt(saved);
      } else {
        state = saved;
        renderSection(0);
      }
    });
})();
