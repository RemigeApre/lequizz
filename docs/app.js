(function () {
  var STORAGE_KEY = "lequizz_attempt";
  var HISTORY_KEY = "lequizz_history";

  var config = null;
  var state = null;
  var app = document.getElementById("app");

  function loadAttempt() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { data: {}, sectionIndex: 0 };
      var parsed = JSON.parse(raw);
      return { data: parsed.data || {}, sectionIndex: parsed.sectionIndex || 0 };
    } catch (e) {
      return { data: {}, sectionIndex: 0 };
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
    var html = '<fieldset class="question"><legend>' + r.label + '</legend>';
    html += '<ul class="ranking-list" data-question-id="ranking_' + r.id + '">';
    order.forEach(function (itemIdx) {
      html += '<li draggable="true" data-index="' + itemIdx + '"><span class="handle">&#8942;&#8942;</span> ' + r.items[itemIdx] + '</li>';
    });
    html += '</ul><input type="hidden" name="ranking_' + r.id + '" class="ranking-order" /></fieldset>';
    return html;
  }

  function renderMatrixSection(section, existingData) {
    var html = '<div class="legend">';
    config.levels.forEach(function (lvl) {
      html += '<span><strong>' + lvl.key + '</strong> = ' + lvl.label + '</span>';
    });
    html += '</div>';

    var globalIndex = 0;
    var existingMatrix = (existingData && existingData.matrix) || {};

    section.groups.forEach(function (group) {
      html += '<fieldset class="matrix-group">';
      if (group.title) html += '<legend>' + group.title + '</legend>';
      html += '<div class="table-scroll"><table class="matrix-table"><thead><tr><th class="item-col">Pratique</th>';
      config.levels.forEach(function (lvl) {
        html += '<th title="' + lvl.label + '">' + lvl.key + '</th>';
      });
      html += '</tr></thead><tbody>';

      group.items.forEach(function (item) {
        var i = globalIndex;
        globalIndex += 1;
        html += '<tr><td class="item-col">' + item + '</td>';
        config.levels.forEach(function (lvl) {
          var existingVal = existingMatrix[i] ? Number(existingMatrix[i][lvl.key]) : 1;
          html += '<td><select name="m_' + i + '_' + lvl.key + '">';
          config.scaleLabels.forEach(function (label, li) {
            var sel = existingVal === li + 1 ? " selected" : "";
            html += '<option value="' + (li + 1) + '"' + sel + ">" + label + "</option>";
          });
          html += "</select></td>";
        });
        html += "</tr>";
      });

      html += "</tbody></table></div></fieldset>";
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
      state = { data: {}, sectionIndex: 0 };
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
  }

  fetch("./questions.json")
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      config = cfg;
      state = loadAttempt();
      var idx = Math.min(Math.max(state.sectionIndex, 0), config.sections.length - 1);
      renderSection(idx);
    });
})();
