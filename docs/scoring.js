function normalizeItem(item) {
  if (typeof item === "string") return { text: item, variants: null };
  return { text: item.text, variants: item.variants || null };
}

function flattenItemsRaw(section) {
  const items = [];
  for (const group of section.groups) {
    for (const item of group.items) items.push(normalizeItem(item));
  }
  return items;
}

function flattenItems(section) {
  return flattenItemsRaw(section).map((it) => it.text);
}

function computeMatrixScore(config, section, sectionData) {
  const rawItems = flattenItemsRaw(section);
  const matrix = (sectionData && sectionData.matrix) || {};
  const scaleMax = config.scaleLabels.length;
  const levelCount = config.levels.length;
  const maxPerItem = scaleMax * levelCount;

  let raw = 0;
  let units = 0;
  rawItems.forEach((item, i) => {
    if (item.variants) {
      item.variants.forEach((_, vi) => {
        const levels = (matrix[i] && matrix[i][vi]) || {};
        for (const lvl of config.levels) {
          const v = Number(levels[lvl.key]);
          if (!Number.isNaN(v)) raw += v;
        }
        units += 1;
      });
    } else {
      const levels = matrix[i] || {};
      for (const lvl of config.levels) {
        const v = Number(levels[lvl.key]);
        if (!Number.isNaN(v)) raw += v;
      }
      units += 1;
    }
  });

  const max = units * maxPerItem;
  const percentage = max ? Math.round((raw / max) * 1000) / 10 : 0;

  return { raw, max, percentage, itemCount: rawItems.length };
}

function labelRanking(ranking, order, checked) {
  const itemsOrder = Array.isArray(order) ? order : ranking.items.map((_, i) => i);
  if (ranking.checkable) {
    const checkedSet = new Set(checked || []);
    return itemsOrder.filter((i) => checkedSet.has(i)).map((i) => ranking.items[i]).filter((v) => v !== undefined);
  }
  return itemsOrder.map((i) => ranking.items[i]).filter((v) => v !== undefined);
}

function labelSpectrum(spectrum, value) {
  const idx = Number(value);
  return spectrum.scaleLabels[idx - 1] || null;
}

function labelMultiselect(multiselect, selected) {
  const indices = Array.isArray(selected) ? selected : [];
  return indices.map((i) => multiselect.options[i]).filter((v) => v !== undefined);
}

function conditionMet(section, sectionData, condition) {
  if (!condition) return true;
  const items = flattenItems(section);
  const idx = items.indexOf(condition.itemText);
  if (idx === -1) return true;
  const levels = (sectionData.matrix || {})[idx] || {};
  return Object.keys(levels).some((k) => Number(levels[k]) > 1);
}

function computeScores(config, answers) {
  const sections = {};

  for (const section of config.sections) {
    const sectionData = answers[section.key] || {};

    if (section.type === "matrix") {
      const score = computeMatrixScore(config, section, sectionData);
      const rankings = {};
      if (section.rankings) {
        for (const r of section.rankings) {
          if (!conditionMet(section, sectionData, r.condition)) continue;
          rankings[r.id] = labelRanking(
            r,
            (sectionData.rankings || {})[r.id],
            (sectionData.rankingsChecked || {})[r.id]
          );
        }
      }
      const spectrums = {};
      if (section.spectrums) {
        for (const sp of section.spectrums) {
          spectrums[sp.id] = labelSpectrum(sp, (sectionData.spectrums || {})[sp.id]);
        }
      }
      const multiselects = {};
      if (section.multiselects) {
        for (const ms of section.multiselects) {
          multiselects[ms.id] = labelMultiselect(ms, (sectionData.multiselects || {})[ms.id]);
        }
      }
      sections[section.key] = { type: "matrix", ...score, rankings, spectrums, multiselects };
    } else if (section.type === "profile") {
      const fields = {};
      for (const f of section.fields) {
        const idx = Number((sectionData.fields || {})[f.id]);
        fields[f.id] = f.options[idx];
      }
      const rankings = {};
      for (const r of section.rankings || []) {
        rankings[r.id] = labelRanking(
          r,
          (sectionData.rankings || {})[r.id],
          (sectionData.rankingsChecked || {})[r.id]
        );
      }
      sections[section.key] = { type: "profile", fields, rankings };
    }
  }

  return { sections };
}

window.Scoring = { flattenItems, flattenItemsRaw, computeScores };
