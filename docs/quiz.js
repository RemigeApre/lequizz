function initRankingLists() {
  function updateOrderInput(list) {
    var input = list.parentElement.querySelector(
      'input.ranking-order[name="' + list.dataset.questionId + '"]'
    );
    var order = Array.prototype.map.call(list.children, function (li) {
      return li.dataset.index;
    });
    input.value = order.join(",");
    input.dispatchEvent(new Event("change", { bubbles: true }));

    if (list.classList.contains("ranking-checkable")) {
      var checkedInput = list.parentElement.querySelector(
        'input.ranking-checked[name="' + list.dataset.questionId + '_checked"]'
      );
      var checkedIdxs = [];
      Array.prototype.forEach.call(list.children, function (li) {
        var cb = li.querySelector(".ranking-check");
        if (cb && cb.checked) checkedIdxs.push(li.dataset.index);
      });
      if (checkedInput) {
        checkedInput.value = checkedIdxs.join(",");
        checkedInput.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
  }

  function getDragAfterElement(list, y) {
    var items = Array.prototype.slice.call(
      list.querySelectorAll("li:not(.dragging)")
    );
    return items.reduce(
      function (closest, child) {
        var box = child.getBoundingClientRect();
        var offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        }
        return closest;
      },
      { offset: Number.NEGATIVE_INFINITY, element: null }
    ).element;
  }

  document.querySelectorAll(".ranking-list").forEach(function (list) {
    if (list.dataset.rankingReady) return;
    list.dataset.rankingReady = "1";

    updateOrderInput(list);

    var dragging = null;

    list.addEventListener("dragstart", function (e) {
      dragging = e.target;
      e.target.classList.add("dragging");
    });

    list.addEventListener("dragend", function (e) {
      e.target.classList.remove("dragging");
      dragging = null;
      updateOrderInput(list);
    });

    list.addEventListener("dragover", function (e) {
      e.preventDefault();
      var after = getDragAfterElement(list, e.clientY);
      if (!dragging) return;
      if (after == null) {
        list.appendChild(dragging);
      } else {
        list.insertBefore(dragging, after);
      }
    });

    list.addEventListener("change", function (e) {
      if (!e.target.classList.contains("ranking-check")) return;
      var li = e.target.closest("li");
      if (li) li.classList.toggle("unchecked", !e.target.checked);
      updateOrderInput(list);
    });
  });
}

window.initRankingLists = initRankingLists;
