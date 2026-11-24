(function () {
  var API = "https://abacus.jasoncameron.dev";
  var NS = "layer2hunters-return-of-the-satoshi-v1";
  var ROLES = ["节点运行者", "持币人", "矿工", "支持者"];
  var ROLE_KEYS = {
    "节点运行者": "nodes",
    "持币人": "holders",
    "矿工": "miners",
    "支持者": "supporters"
  };
  var COOLDOWN_MS = 20000;
  var COOLDOWN_KEY = "rot-satoshi-last-sign-v1";
  var LOCAL_ROLL_KEY = "rot-satoshi-my-signs-v1";

  var form = document.getElementById("sign-form");
  var signBtn = document.getElementById("sign-btn");
  var counterNum = document.getElementById("counter-num");
  var counterHint = document.getElementById("counter-hint");
  var successState = document.getElementById("success-state");
  var successDetail = document.getElementById("success-detail");
  var toast = document.getElementById("toast");
  var toastTimer = null;

  var counts = { "节点运行者": 0, "持币人": 0, "矿工": 0, "支持者": 0 };
  var loaded = false;

  function totalOf(map) {
    return ROLES.reduce(function (sum, role) { return sum + (map[role] || 0); }, 0);
  }

  function render(map) {
    var n = totalOf(map);
    counterNum.textContent = String(n);
    if (!loaded && n === 0) {
      counterHint.textContent = "正在连接节点…";
    } else if (n === 0) {
      counterHint.textContent = "创世块已写出。联署从你开始。";
    } else if (n === 1) {
      counterHint.textContent = "第一份公开签名已就位。大厅里开始有掌声了。";
    } else {
      counterHint.textContent = "已有 " + n + " 份签名落在这张公开计数上。不上链，但气氛在。";
    }
    var max = Math.max(1, n);
    document.querySelectorAll(".role-card").forEach(function (card) {
      var role = card.getAttribute("data-role");
      var c = map[role] || 0;
      card.querySelector("[data-count]").textContent = String(c);
      card.querySelector(".role-bar span").style.width = (c / max) * 100 + "%";
    });
  }

  function showSuccess(detailText) {
    successDetail.textContent = detailText || "大厅已经记下你了。中本聪大概还是看不到，但我们看到了。";
    successState.hidden = false;
    toast.hidden = false;
    toast.textContent = "签名成功";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 3200);
    signBtn.classList.add("is-done");
    signBtn.textContent = "签名成功";
    setTimeout(function () {
      signBtn.textContent = "签名，支持回归";
      signBtn.classList.remove("is-done");
    }, 1600);
    successState.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function readCooldown() {
    try {
      var raw = localStorage.getItem(COOLDOWN_KEY);
      var ts = raw ? parseInt(raw, 10) : 0;
      return isNaN(ts) ? 0 : ts;
    } catch (err) {
      return 0;
    }
  }

  function writeCooldown() {
    try { localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch (err) {}
  }

  function rememberLocal(alias, role) {
    try {
      var list = [];
      var raw = localStorage.getItem(LOCAL_ROLL_KEY);
      if (raw) list = JSON.parse(raw);
      if (!Array.isArray(list)) list = [];
      list.push({ alias: alias, role: role, at: new Date().toISOString() });
      localStorage.setItem(LOCAL_ROLL_KEY, JSON.stringify(list.slice(-20)));
    } catch (err) {}
  }

  function parseCount(res, data) {
    if (res.status === 404) return 0;
    if (!res.ok) throw new Error("counter " + res.status);
    if (data && typeof data.value === "number") return data.value;
    if (data && data.error) return 0;
    return 0;
  }

  function fetchJSON(url) {
    return fetch(url, { method: "GET", cache: "no-store" }).then(function (res) {
      return res.text().then(function (text) {
        var data = {};
        if (text) {
          try { data = JSON.parse(text); } catch (err) { data = {}; }
        }
        return { res: res, data: data };
      });
    });
  }

  function loadCounts() {
    return Promise.all(ROLES.map(function (role) {
      var url = API + "/get/" + NS + "/" + ROLE_KEYS[role];
      return fetchJSON(url).then(function (out) {
        return [role, parseCount(out.res, out.data)];
      });
    })).then(function (entries) {
      var next = { "节点运行者": 0, "持币人": 0, "矿工": 0, "支持者": 0 };
      entries.forEach(function (pair) { next[pair[0]] = pair[1]; });
      counts = next;
      loaded = true;
      render(counts);
      return counts;
    });
  }

  function incrementRemote(role) {
    var url = API + "/hit/" + NS + "/" + ROLE_KEYS[role];
    return fetchJSON(url).then(function (out) {
      if (!out.res.ok && out.res.status !== 404) {
        throw new Error("hit " + out.res.status);
      }
      var value = parseCount(out.res, out.data);
      if (out.res.ok) counts[role] = Math.max(counts[role], value);
      loaded = true;
      render(counts);
      return value;
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var data = new FormData(form);
    var alias = String(data.get("alias") || "").trim().slice(0, 20);
    var role = String(data.get("role") || "");
    if (ROLES.indexOf(role) === -1) role = "支持者";

    var now = Date.now();
    var last = readCooldown();
    var cooling = last && (now - last) < COOLDOWN_MS;

    // Always show success immediately on click. Never look like a failure.
    if (cooling) {
      showSuccess("这一票已经收下了。稍等片刻再签，大厅还记得你。");
      return;
    }

    counts[role] = (counts[role] || 0) + 1;
    loaded = true;
    render(counts);
    writeCooldown();
    rememberLocal(alias, role);
    showSuccess("大厅已经记下你了。中本聪大概还是看不到，但我们看到了。");

    incrementRemote(role).then(function () {
      return loadCounts();
    }).catch(function () {
      // Keep the optimistic success on screen; retry quietly once.
      setTimeout(function () {
        incrementRemote(role).then(function () { return loadCounts(); }).catch(function () {});
      }, 2000);
    });
  });

  render(counts);
  loadCounts().catch(function () {
    loaded = true;
    counterHint.textContent = "创世块已写出。联署从你开始。";
    render(counts);
  });
})();
