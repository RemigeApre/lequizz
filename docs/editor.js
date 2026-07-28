(function () {
  var config = null;

  var loadStatus = document.getElementById("load-status");
  var saveStatus = document.getElementById("save-status");
  var loadPanel = document.getElementById("load-panel");
  var editorRoot = document.getElementById("editor-root");
  var sectionSelect = document.getElementById("section-select");
  var sectionPanel = document.getElementById("section-panel");

  function onLoaded() {
    loadPanel.style.display = "none";
    editorRoot.style.display = "block";

    sectionSelect.innerHTML = "";
    config.sections.forEach(function (section, i) {
      var opt = document.createElement("option");
      opt.value = i;
      opt.textContent = section.title;
      sectionSelect.appendChild(opt);
    });

    sectionSelect.addEventListener("change", function () {
      renderSectionPanel(Number(sectionSelect.value));
    });

    renderSectionPanel(0);
  }

  document.getElementById("load-remote-btn").addEventListener("click", function () {
    fetch("./questions.json")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (cfg) {
        config = cfg;
        onLoaded();
      })
      .catch(function () {
        loadStatus.textContent =
          "Impossible de charger automatiquement (normal si tu as ouvert ce fichier directement depuis ton disque). Utilise le champ 'choisir un fichier' juste a cote, en pointant vers docs/questions.json.";
      });
  });

  document.getElementById("load-file-input").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        config = JSON.parse(reader.result);
        onLoaded();
      } catch (err) {
        loadStatus.textContent = "Fichier JSON invalide : " + err.message;
      }
    };
    reader.readAsText(file);
  });

  function makeItemRow(value, onChange, onDelete) {
    var row = document.createElement("div");
    row.className = "item-row";

    var input = document.createElement("input");
    input.type = "text";
    input.value = value;
    input.addEventListener("input", function () {
      onChange(input.value);
    });

    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Supprimer";
    delBtn.addEventListener("click", onDelete);

    row.appendChild(input);
    row.appendChild(delBtn);
    return row;
  }

  function makeAddRow(placeholder, onAdd) {
    var row = document.createElement("div");
    row.className = "add-row";

    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;

    var addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "Ajouter";
    addBtn.addEventListener("click", function () {
      var val = input.value.trim();
      if (!val) return;
      onAdd(val);
    });

    row.appendChild(input);
    row.appendChild(addBtn);
    return row;
  }

  function renderItemList(container, items, onRerender) {
    items.forEach(function (item, i) {
      container.appendChild(
        makeItemRow(
          item,
          function (newVal) {
            items[i] = newVal;
          },
          function () {
            items.splice(i, 1);
            onRerender();
          }
        )
      );
    });
    container.appendChild(
      makeAddRow("Nouvel item...", function (val) {
        items.push(val);
        onRerender();
      })
    );
  }

  function renderRankingEditor(container, ranking, rerenderAll) {
    var block = document.createElement("div");
    block.className = "group-block";

    var labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = ranking.label;
    labelInput.style.width = "100%";
    labelInput.style.marginBottom = "0.5rem";
    labelInput.addEventListener("input", function () {
      ranking.label = labelInput.value;
    });

    var h = document.createElement("div");
    h.innerHTML = "<strong>Classement (glisser-deposer sur le site) :</strong>";

    block.appendChild(h);
    block.appendChild(labelInput);

    var listDiv = document.createElement("div");
    renderItemList(listDiv, ranking.items, rerenderAll);
    block.appendChild(listDiv);

    container.appendChild(block);
  }

  function renderSpectrumEditor(container, spectrum, rerenderAll) {
    var block = document.createElement("div");
    block.className = "group-block";

    var labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = spectrum.label;
    labelInput.style.width = "100%";
    labelInput.style.marginBottom = "0.5rem";
    labelInput.addEventListener("input", function () {
      spectrum.label = labelInput.value;
    });

    var h = document.createElement("div");
    h.innerHTML = "<strong>Echelle personnalisee (une seule reponse, non comptee dans le score) :</strong>";

    block.appendChild(h);
    block.appendChild(labelInput);

    var listDiv = document.createElement("div");
    renderItemList(listDiv, spectrum.scaleLabels, rerenderAll);
    block.appendChild(listDiv);

    container.appendChild(block);
  }

  function renderMatrixEditor(section) {
    sectionPanel.innerHTML = "";

    function rerender() {
      renderMatrixEditor(section);
    }

    section.groups.forEach(function (group, gi) {
      var block = document.createElement("div");
      block.className = "group-block";

      var titleRow = document.createElement("div");
      titleRow.className = "group-title-row";

      var titleInput = document.createElement("input");
      titleInput.type = "text";
      titleInput.value = group.title || "";
      titleInput.placeholder = "Titre du groupe (optionnel)";
      titleInput.addEventListener("input", function () {
        group.title = titleInput.value || null;
      });

      var delGroupBtn = document.createElement("button");
      delGroupBtn.type = "button";
      delGroupBtn.textContent = "Supprimer ce groupe";
      delGroupBtn.addEventListener("click", function () {
        section.groups.splice(gi, 1);
        rerender();
      });

      titleRow.appendChild(titleInput);
      titleRow.appendChild(delGroupBtn);
      block.appendChild(titleRow);

      var itemsDiv = document.createElement("div");
      renderItemList(itemsDiv, group.items, rerender);
      block.appendChild(itemsDiv);

      sectionPanel.appendChild(block);
    });

    var addGroupBtn = document.createElement("button");
    addGroupBtn.type = "button";
    addGroupBtn.textContent = "Ajouter un groupe";
    addGroupBtn.addEventListener("click", function () {
      section.groups.push({ title: "Nouveau groupe", items: [] });
      rerender();
    });
    sectionPanel.appendChild(addGroupBtn);

    if (section.rankings && section.rankings.length) {
      var h2 = document.createElement("h2");
      h2.textContent = "Classements";
      sectionPanel.appendChild(h2);
      section.rankings.forEach(function (r) {
        renderRankingEditor(sectionPanel, r, rerender);
      });
    }

    if (section.spectrums && section.spectrums.length) {
      var h3 = document.createElement("h2");
      h3.textContent = "Questions a echelle personnalisee";
      sectionPanel.appendChild(h3);
      section.spectrums.forEach(function (sp) {
        renderSpectrumEditor(sectionPanel, sp, rerender);
      });
    }
  }

  function renderProfileEditor(section) {
    sectionPanel.innerHTML = "";

    function rerender() {
      renderProfileEditor(section);
    }

    section.fields.forEach(function (field) {
      var block = document.createElement("div");
      block.className = "group-block";

      var labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.value = field.label;
      labelInput.style.width = "100%";
      labelInput.style.marginBottom = "0.5rem";
      labelInput.addEventListener("input", function () {
        field.label = labelInput.value;
      });

      block.appendChild(labelInput);

      var optionsDiv = document.createElement("div");
      renderItemList(optionsDiv, field.options, rerender);
      block.appendChild(optionsDiv);

      sectionPanel.appendChild(block);
    });

    if (section.rankings && section.rankings.length) {
      var h2 = document.createElement("h2");
      h2.textContent = "Classements";
      sectionPanel.appendChild(h2);
      section.rankings.forEach(function (r) {
        renderRankingEditor(sectionPanel, r, rerender);
      });
    }
  }

  function renderSectionPanel(idx) {
    var section = config.sections[idx];
    sectionSelect.value = String(idx);
    if (section.type === "matrix") {
      renderMatrixEditor(section);
    } else if (section.type === "profile") {
      renderProfileEditor(section);
    }
  }

  document.getElementById("download-btn").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "questions.json";
    a.click();
    URL.revokeObjectURL(url);
    saveStatus.textContent = "Telecharge. Mets ce fichier sur GitHub, dans docs/questions.json, a la place de l'ancien.";
  });

  document.getElementById("copy-btn").addEventListener("click", function () {
    var text = JSON.stringify(config, null, 2);
    navigator.clipboard.writeText(text).then(function () {
      saveStatus.textContent = "JSON copie dans le presse-papier.";
    });
  });

  // --- Enregistrement direct sur GitHub via l'API Contents ---
  var GH_TOKEN_KEY = "lequizz_gh_token";

  var ghTokenInput = document.getElementById("gh-token");
  var ghRememberInput = document.getElementById("gh-remember");
  var ghStatus = document.getElementById("gh-status");

  var rememberedToken = localStorage.getItem(GH_TOKEN_KEY);
  if (rememberedToken) {
    ghTokenInput.value = rememberedToken;
    ghRememberInput.checked = true;
  }

  function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  document.getElementById("gh-save-btn").addEventListener("click", function () {
    var repo = document.getElementById("gh-repo").value.trim();
    var branch = document.getElementById("gh-branch").value.trim() || "main";
    var path = document.getElementById("gh-path").value.trim();
    var token = ghTokenInput.value.trim();

    if (!config) {
      ghStatus.textContent = "Charge d'abord un questions.json.";
      return;
    }
    if (!repo || !path || !token) {
      ghStatus.textContent = "Depot, chemin et token sont obligatoires.";
      return;
    }

    if (ghRememberInput.checked) {
      localStorage.setItem(GH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(GH_TOKEN_KEY);
    }

    var apiUrl = "https://api.github.com/repos/" + repo + "/contents/" + path;
    var headers = {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
    };

    ghStatus.textContent = "Recuperation du fichier actuel sur GitHub...";

    fetch(apiUrl + "?ref=" + encodeURIComponent(branch), { headers: headers })
      .then(function (r) {
        if (!r.ok) throw new Error("Lecture impossible (HTTP " + r.status + "). Verifie le depot/chemin/token.");
        return r.json();
      })
      .then(function (current) {
        ghStatus.textContent = "Envoi de la mise a jour...";
        var body = {
          message: "Mise a jour de questions.json via l'editeur",
          content: utf8ToBase64(JSON.stringify(config, null, 2)),
          sha: current.sha,
          branch: branch,
        };
        return fetch(apiUrl, {
          method: "PUT",
          headers: Object.assign({ "Content-Type": "application/json" }, headers),
          body: JSON.stringify(body),
        });
      })
      .then(function (r) {
        if (!r.ok) {
          return r.json().then(function (err) {
            throw new Error(err.message || "Echec de l'ecriture (HTTP " + r.status + ")");
          });
        }
        ghStatus.textContent = "Enregistre sur GitHub. Le site se republie automatiquement dans 1-2 minutes.";
      })
      .catch(function (err) {
        ghStatus.textContent = "Erreur : " + err.message;
      });
  });
})();
