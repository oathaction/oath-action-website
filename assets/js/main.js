/* =====================================================================
   OATH & ACTION — shared behavior
   - Injects the shared header + footer so markup stays DRY across pages
     (a single source of truth; trivial to port to Astro/Next layouts).
   - Mobile nav toggle, active-link state, reveal-on-scroll, count-ups.
   No dependencies. Works from file:// (no fetch needed).
   ===================================================================== */
(function () {
  document.documentElement.classList.add("js");

  /* ---- Brand mark (inline SVG: mechanism cog + red signal node) ---- */
  var MARK =
    '<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">' +
    '<rect x="1.5" y="1.5" width="29" height="29" rx="4" fill="none" stroke="#121212" stroke-width="1.5"/>' +
    '<circle cx="16" cy="16" r="6.5" fill="none" stroke="#121212" stroke-width="1.5"/>' +
    '<path d="M16 3v4M16 25v4M3 16h4M25 16h4" stroke="#121212" stroke-width="1.5"/>' +
    '<circle cx="16" cy="16" r="2.6" fill="#E63946"/></svg>';

  /* ---- Navigation model ---- */
  var NAV = [
    ["explain.html", "Explain"],
    ["track.html", "Track"],
    ["connect.html", "Connect"],
    ["act.html", "Act"],
    ["dispatches.html", "Dispatches"],
    ["toolkit.html", "Toolkit"],
    ["jobs.html", "Jobs"],
    ["about.html", "About"]
  ];

  var current = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  var navKey = document.body.getAttribute("data-nav") || current;

  function navLinks() {
    return NAV.map(function (n) {
      var active = n[0] === navKey ? ' class="active" aria-current="page"' : "";
      return '<a href="' + n[0] + '"' + active + ">" + n[1] + "</a>";
    }).join("");
  }

  /* ---- Header ---- */
  var header =
    '<a class="skip-link" href="#main">Skip to content</a>' +
    '<header class="site-header"><div class="container bar">' +
    '<a class="brand" href="index.html" aria-label="Oath & Action home">' + MARK +
    '<span class="brand-name">Oath&nbsp;&amp;&nbsp;Action<small>From spectators to stewards</small></span></a>' +
    '<nav class="nav" aria-label="Primary">' + navLinks() + "</nav>" +
    '<div class="header-cta">' +
    '<a class="btn btn-ghost btn-sm" href="contact.html">Join</a>' +
    '<a class="btn btn-primary btn-sm" href="act.html">Take action</a>' +
    '<button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false"><span></span></button>' +
    "</div></div></header>";

  /* ---- Footer ---- */
  var footer =
    '<footer class="site-footer"><div class="container">' +
    '<div class="footer-top">' +
    '<div class="footer-brand">' +
    '<a class="brand" href="index.html">' + MARK +
    '<span class="brand-name" style="color:#fff">Oath&nbsp;&amp;&nbsp;Action<small>From spectators to stewards</small></span></a>' +
    "<p>Nonpartisan civic media and a democracy-reform platform. We explain how power works, track who is changing it, and turn understanding into action.</p>" +
    '<div class="signup mt-6" style="max-width:420px">' +
    '<input class="input" type="email" placeholder="Your email" aria-label="Email for newsletter">' +
    '<button class="btn btn-primary">Subscribe</button></div>' +
    "</div>" +
    footCol("Platform", [["explain.html","Explain"],["track.html","Track"],["connect.html","Connect"],["act.html","Act"]]) +
    footCol("Read & data", [["dispatches.html","Dispatches"],["tracker.html","Reform Tracker"],["bill.html","Bill tracker"],["scorecard.html","Rep scorecards"],["issue.html","Issue briefs"]]) +
    footCol("Get involved", [["contact.html","Volunteer"],["donate.html","Donate"],["events.html","Events"],["jobs.html","Jobs & fellowships"],["toolkit.html","Organizer toolkit"]]) +
    footCol("Organization", [["about.html","About"],["editorial-standards.html","Editorial standards"],["privacy.html","Privacy"],["contact.html","Contact"]]) +
    "</div>" +
    '<div class="footer-bottom">' +
    '<span>© 2026 Oath &amp; Action. A 501(c)(3) nonpartisan civic organization.</span>' +
    '<span class="pledge">Clarity is our duty. Action is our promise.</span>' +
    '<span>Privacy · Terms · Editorial independence</span>' +
    "</div></div></footer>";

  function footCol(title, links) {
    return '<div class="footer-col"><h5>' + title + "</h5>" +
      links.map(function (l) { return '<a href="' + l[0] + '">' + l[1] + "</a>"; }).join("") + "</div>";
  }

  var mount = document.getElementById("site-header");
  if (mount) mount.outerHTML = header;
  var fmount = document.getElementById("site-footer");
  if (fmount) fmount.outerHTML = footer;

  /* ---- Mobile nav toggle ---- */
  var toggle = document.querySelector(".nav-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll(".nav a").forEach(function (a) {
      a.addEventListener("click", function () { document.body.classList.remove("nav-open"); });
    });
  }

  /* ---- Reveal on scroll ---- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---- Count-up for stats ([data-count]) ---- */
  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var dec = (el.getAttribute("data-count").split(".")[1] || "").length;
    var dur = 1100, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = (target * eased).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  var counts = document.querySelectorAll("[data-count]");
  if ("IntersectionObserver" in window && counts.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var io2 = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { countUp(e.target); io2.unobserve(e.target); } });
    }, { threshold: 0.6 });
    counts.forEach(function (el) { io2.observe(el); });
  }

  /* ---- Simple filter chips (visual only on the prototype) ---- */
  document.querySelectorAll("[data-chipgroup]").forEach(function (group) {
    group.addEventListener("click", function (e) {
      var chip = e.target.closest(".chip");
      if (!chip) return;
      group.querySelectorAll(".chip").forEach(function (c) { c.classList.remove("active"); });
      chip.classList.add("active");
    });
  });

  /* ---- Article TOC scrollspy: highlight the section you're reading ---- */
  var tocLinks = Array.prototype.slice.call(document.querySelectorAll(".toc a[href^='#']"));
  if (tocLinks.length && "IntersectionObserver" in window) {
    var targets = tocLinks
      .map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); })
      .filter(Boolean);
    var setActive = function (id) {
      tocLinks.forEach(function (a) {
        a.classList.toggle("active", a.getAttribute("href") === "#" + id);
      });
    };
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: "-20% 0px -70% 0px", threshold: 0 });
    targets.forEach(function (t) { spy.observe(t); });
  }

  /* ---- Demo forms: prevent navigation, show acknowledgement ---- */
  document.querySelectorAll("form[data-demo]").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var note = form.querySelector("[data-formnote]");
      if (note) { note.hidden = false; form.querySelectorAll("input,textarea,select,button").forEach(function(el){ if(el.type!=="button") el.disabled = true; }); }
    });
  });

  /* ---- Back-to-top floating button ---- */
  var toTop = document.createElement("button");
  toTop.className = "to-top";
  toTop.setAttribute("aria-label", "Back to top");
  toTop.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  toTop.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  document.body.appendChild(toTop);
  var onScroll = function () { toTop.classList.toggle("show", window.scrollY > 700); };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- Copy-to-clipboard ([data-copy]; copies its value, or page URL if empty) ---- */
  var flash;
  function showFlash(msg) {
    if (!flash) { flash = document.createElement("div"); flash.className = "copied-flash"; document.body.appendChild(flash); }
    flash.textContent = msg;
    requestAnimationFrame(function () { flash.classList.add("show"); });
    clearTimeout(showFlash._t);
    showFlash._t = setTimeout(function () { flash.classList.remove("show"); }, 1600);
  }
  document.querySelectorAll("[data-copy]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault();
      var text = el.getAttribute("data-copy") || location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { showFlash("Copied to clipboard"); },
          function () { showFlash("Copied"); });
      } else { showFlash("Copied"); }
    });
  });

  /* ---- Privacy consent banner (remembers choice in localStorage) ---- */
  function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return "dismissed"; } }
  function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  if (storageGet("oa-consent") === null) {
    var banner = document.createElement("div");
    banner.className = "consent";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Privacy notice");
    banner.innerHTML =
      '<p>We use privacy-respecting analytics to improve our reporting — no ad trackers, ever. ' +
      'See our <a href="privacy.html">Privacy Policy</a>.</p>' +
      '<div class="consent-actions">' +
      '<button class="btn btn-ghost btn-sm" data-consent="declined" style="border-color:rgba(255,255,255,.3);color:#fff">Decline</button>' +
      '<button class="btn btn-primary btn-sm" data-consent="accepted">Accept</button></div>';
    document.body.appendChild(banner);
    setTimeout(function () { banner.classList.add("show"); }, 900);
    banner.addEventListener("click", function (e) {
      var b = e.target.closest("[data-consent]");
      if (!b) return;
      storageSet("oa-consent", b.getAttribute("data-consent"));
      banner.classList.remove("show");
      setTimeout(function () { banner.remove(); }, 450);
    });
  }
})();
