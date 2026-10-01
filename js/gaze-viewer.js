/* Interactive view of decode-time attention.
   Data: js/gaze-demo-data.js (window.GAZE_DEMO), see tools/build_assets.py. */
(function () {
  "use strict";

  var DEMO = window.GAZE_DEMO;
  if (!DEMO) return;

  var GRID = DEMO.grid; // visual tokens per side
  var REGION = DEMO.region; // tokens per side of a gaze region
  var PER_SIDE = GRID / REGION; // regions per side
  var REGION_COUNT = PER_SIDE * PER_SIDE;
  var REGION_CELLS = REGION * REGION;
  var TOPK = DEMO.topk;
  var VISUAL_TOKENS = GRID * GRID;

  var STEP_MS = 720;
  var END_PAUSE_MS = 2000;
  var FADE_MS = 260;
  var VISIBLE_SHARE = 0.3;
  var VEIL_RGB = "14, 26, 48";
  var VEIL_MAX = 0.7;
  var HEAT_STOPS = [
    [255, 255, 204],
    [255, 237, 160],
    [254, 217, 118],
    [254, 178, 76],
    [253, 141, 60],
    [252, 78, 42],
    [227, 26, 28],
    [189, 0, 38],
    [128, 0, 38],
  ];

  var reducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var ICONS = {
    prev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h2v12H3zM14 2v12L6 8z"/></svg>',
    next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 2h2v12h-2zM2 2l8 6-8 6z"/></svg>',
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2l10 6-10 6z"/></svg>',
    pause:
      '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2h4v12H3zM9 2h4v12H9z"/></svg>',
  };

  var VIEWS = ["gaze", "dense"];
  var VIEW_LABELS = {
    gaze: "Gaze Attention",
    dense: "Dense attention",
  };

  /* ---------- data ---------- */

  function decodeBytes(text) {
    var binary = atob(text);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function unpackNibbles(bytes) {
    var levels = new Uint8Array(bytes.length * 2);
    for (var i = 0; i < bytes.length; i += 1) {
      levels[2 * i] = bytes[i] >> 4;
      levels[2 * i + 1] = bytes[i] & 15;
    }
    return levels;
  }

  var EXAMPLES = {};
  DEMO.examples.forEach(function (raw) {
    var example = {
      id: raw.id,
      image: raw.image,
      alt: raw.alt,
      aspect: raw.size[0] / raw.size[1],
      gaze: {
        tokens: raw.gaze.tokens,
        regions: decodeBytes(raw.gaze.regions),
        heat: decodeBytes(raw.gaze.heat),
      },
      dense: {
        tokens: raw.dense.tokens,
        heat: unpackNibbles(decodeBytes(raw.dense.heat)),
      },
    };
    if (raw.fixed) {
      // The same answer, always shown with the fixed head (used by the still frames).
      example.fixed = {
        tokens: raw.gaze.tokens,
        regions: decodeBytes(raw.fixed.regions),
        heat: decodeBytes(raw.fixed.heat),
      };
    }
    EXAMPLES[raw.id] = example;
  });

  function tokensOf(example, view) {
    return example[view].tokens;
  }

  /* Decode step `step` generates token `step + 1`; the first token comes from prefill. */
  function frameOf(example, view, step) {
    var data = example[view];
    if (view === "dense") {
      return {
        heat: data.heat.subarray(
          step * VISUAL_TOKENS,
          (step + 1) * VISUAL_TOKENS,
        ),
      };
    }
    return {
      regions: data.regions.subarray(step * TOPK, (step + 1) * TOPK),
      heat: data.heat.subarray(
        step * TOPK * REGION_CELLS,
        (step + 1) * TOPK * REGION_CELLS,
      ),
    };
  }

  /* How much of a region is revealed (0 = veiled, 1 = clear): the selected regions. */
  function regionWeights(frame) {
    var weights = new Float32Array(REGION_COUNT);
    if (frame.regions) {
      for (var i = 0; i < frame.regions.length; i += 1) {
        weights[frame.regions[i]] = 1;
      }
    }
    return weights;
  }

  function wordAt(tokens, index) {
    function isBreak(i) {
      return /^\s/.test(tokens[i]) || /^[^\w]+$/.test(tokens[i]);
    }
    if (/^[^\w\s]+$/.test(tokens[index])) return tokens[index];
    var start = index;
    while (start > 0 && !isBreak(start)) start -= 1;
    var end = index + 1;
    while (end < tokens.length && !isBreak(end)) end += 1;
    return tokens.slice(start, end).join("").trim();
  }

  /* ---------- drawing ---------- */

  var HEAT_LUT = (function () {
    var lut = [];
    for (var i = 0; i < 256; i += 1) {
      var position = (i / 255) * (HEAT_STOPS.length - 1);
      var low = Math.floor(position);
      var high = Math.min(HEAT_STOPS.length - 1, low + 1);
      var mix = position - low;
      var rgb = [0, 1, 2].map(function (c) {
        return Math.round(
          HEAT_STOPS[low][c] + (HEAT_STOPS[high][c] - HEAT_STOPS[low][c]) * mix,
        );
      });
      var alpha = (0.14 + 0.68 * (i / 255)).toFixed(3);
      lut.push("rgba(" + rgb.join(",") + "," + alpha + ")");
    }
    return lut;
  })();

  /* The model resizes every image to a square, so the token grid spans the whole image:
     on a non-square image the cells and regions are rectangles. */
  function drawCells(ctx, x0, y0, width, height, count, values, maxLevel) {
    var cellWidth = width / count;
    var cellHeight = height / count;
    for (var row = 0; row < count; row += 1) {
      var top = Math.round(y0 + row * cellHeight);
      var bottom = Math.round(y0 + (row + 1) * cellHeight);
      for (var col = 0; col < count; col += 1) {
        var left = Math.round(x0 + col * cellWidth);
        var right = Math.round(x0 + (col + 1) * cellWidth);
        var level = Math.round((values[row * count + col] / maxLevel) * 255);
        ctx.fillStyle = HEAT_LUT[level];
        ctx.fillRect(left, top, right - left, bottom - top);
      }
    }
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  function paint(ctx, width, height, image, frame, view, weights) {
    var unit = width / 400; // line widths scale with the canvas
    ctx.clearRect(0, 0, width, height);
    if (image && image.complete && image.naturalWidth) {
      ctx.drawImage(image, 0, 0, width, height);
    } else {
      ctx.fillStyle = "#1a2a47";
      ctx.fillRect(0, 0, width, height);
    }

    if (view === "dense") {
      ctx.fillStyle = "rgba(" + VEIL_RGB + ", 0.2)";
      ctx.fillRect(0, 0, width, height);
      drawCells(ctx, 0, 0, width, height, GRID, frame.heat, 15);
      return;
    }

    var regionWidth = width / PER_SIDE;
    var regionHeight = height / PER_SIDE;
    var region, line, k;
    function box(index) {
      var row = Math.floor(index / PER_SIDE);
      var col = index % PER_SIDE;
      var left = Math.round(col * regionWidth);
      var top = Math.round(row * regionHeight);
      return {
        x: left,
        y: top,
        w: Math.round((col + 1) * regionWidth) - left,
        h: Math.round((row + 1) * regionHeight) - top,
      };
    }

    for (region = 0; region < REGION_COUNT; region += 1) {
      var alpha = VEIL_MAX * (1 - weights[region]);
      if (alpha > 0.004) {
        var veil = box(region);
        ctx.fillStyle = "rgba(" + VEIL_RGB + "," + alpha.toFixed(3) + ")";
        ctx.fillRect(veil.x, veil.y, veil.w, veil.h);
      }
    }

    for (k = 0; k < frame.regions.length; k += 1) {
      var cells = box(frame.regions[k]);
      drawCells(
        ctx,
        cells.x,
        cells.y,
        cells.w,
        cells.h,
        REGION,
        frame.heat.subarray(k * REGION_CELLS, (k + 1) * REGION_CELLS),
        255,
      );
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = Math.max(1, unit);
    ctx.beginPath();
    for (line = 1; line < PER_SIDE; line += 1) {
      var y = Math.round(line * regionHeight) + 0.5;
      var x = Math.round(line * regionWidth) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    ctx.stroke();

    var inset = 2 * unit;
    ctx.lineWidth = 2.4 * unit;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    for (k = 0; k < frame.regions.length; k += 1) {
      var b = box(frame.regions[k]);
      roundedRect(
        ctx,
        b.x + inset,
        b.y + inset,
        b.w - 2 * inset,
        b.h - 2 * inset,
        7 * unit,
      );
      ctx.stroke();
    }
  }

  var imageCache = {};
  /* Returns the image at once; `onLoad` runs later if it still has to load. */
  function loadImage(src, onLoad) {
    var image = imageCache[src];
    if (!image) {
      image = new Image();
      image.decoding = "async";
      image.src = src;
      imageCache[src] = image;
    }
    if (!(image.complete && image.naturalWidth)) {
      image.addEventListener("load", onLoad, { once: true });
    }
    return image;
  }

  /* Size the canvas to its frame (which has the aspect ratio of the image). */
  function fitCanvas(canvas, aspect) {
    var cssWidth = canvas.parentElement.clientWidth;
    if (!cssWidth) return null;
    var width = Math.round(
      cssWidth * Math.min(window.devicePixelRatio || 1, 2),
    );
    var height = Math.round(width / aspect);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { width: width, height: height };
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /* ---------- still frames ---------- */

  function initStill(canvas) {
    var example = EXAMPLES[canvas.dataset.example];
    var view = canvas.dataset.view;
    if (!example || !example[view]) return;
    var tokens = tokensOf(example, view);
    var word = (canvas.dataset.word || "").toLowerCase();
    var tokenIndex = -1;
    for (var i = 1; i < tokens.length; i += 1) {
      if (tokens[i].trim().toLowerCase() === word) {
        tokenIndex = i;
        break;
      }
    }
    if (tokenIndex < 1) return;
    var frame = frameOf(example, view, tokenIndex - 1);
    var weights = regionWeights(frame);
    var image;
    canvas.parentElement.style.aspectRatio = String(example.aspect);
    function render() {
      var size = fitCanvas(canvas, example.aspect);
      if (size) {
        paint(
          canvas.getContext("2d"),
          size.width,
          size.height,
          image,
          frame,
          view,
          weights,
        );
      }
    }
    image = loadImage(example.image, render);
    render();
    if (window.ResizeObserver)
      new ResizeObserver(render).observe(canvas.parentElement);
    else window.addEventListener("resize", render);
  }

  /* ---------- viewer ---------- */

  function Viewer(root) {
    var self = this;
    this.root = root;
    this.exampleIds = (root.dataset.examples || "")
      .split(",")
      .map(function (id) {
        return id.trim();
      })
      .filter(function (id) {
        return EXAMPLES[id];
      });
    if (!this.exampleIds.length) this.exampleIds = Object.keys(EXAMPLES);
    this.exampleIndex = 0;
    this.view =
      VIEWS.indexOf(root.dataset.view) < 0 ? "gaze" : root.dataset.view;
    this.step = 0;
    this.playing = !reducedMotion;
    this.visible = false;
    this.timer = null;
    this.animation = null;
    this.weights = new Float32Array(REGION_COUNT);

    this.build();
    this.reserveAnswerHeight();
    if (reducedMotion) this.step = Math.min(3, this.stepCount() - 1);
    this.applyStep(false);

    var answerWidth = this.answer.clientWidth;
    function onResize() {
      if (self.answer.clientWidth !== answerWidth) {
        answerWidth = self.answer.clientWidth;
        self.reserveAnswerHeight();
        self.applyStep(false);
      } else {
        self.draw();
      }
    }
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(this.root);
    else window.addEventListener("resize", onResize);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        self.reserveAnswerHeight();
        self.applyStep(false);
      });
    }
    // Play only while a good part of the image is on screen.
    if (window.IntersectionObserver) {
      new IntersectionObserver(
        function (entries) {
          var latest = entries[entries.length - 1];
          self.visible =
            latest.isIntersecting && latest.intersectionRatio >= VISIBLE_SHARE;
          self.schedule();
        },
        { threshold: VISIBLE_SHARE },
      ).observe(this.slot);
    } else {
      this.visible = true;
      this.schedule();
    }
    document.addEventListener("visibilitychange", function () {
      self.schedule();
    });
  }

  Viewer.prototype.example = function () {
    return EXAMPLES[this.exampleIds[this.exampleIndex]];
  };

  Viewer.prototype.tokens = function () {
    return tokensOf(this.example(), this.view);
  };

  Viewer.prototype.stepCount = function () {
    return this.tokens().length - 1;
  };

  Viewer.prototype.build = function () {
    var self = this;
    var root = this.root;
    root.textContent = "";

    // The slot is as tall as the tallest image, so that switching examples does not move the page.
    var stage = element("div", "gv-stage");
    this.slot = element("div", "gv-frame-slot");
    this.slot.style.aspectRatio = String(
      Math.min.apply(
        null,
        this.exampleIds.map(function (id) {
          return EXAMPLES[id].aspect;
        }),
      ),
    );
    this.frame = element("div", "gv-frame");
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("role", "img");
    this.frame.appendChild(this.canvas);
    this.slot.appendChild(this.frame);
    stage.appendChild(this.slot);

    var legend = element("div", "gv-legend");
    legend.appendChild(element("span", null, "low"));
    legend.appendChild(element("span", "gv-legend-bar is-heat"));
    legend.appendChild(element("span", null, "high"));
    legend.appendChild(
      element("span", "gv-legend-title", "attention score (log-normalized)"),
    );
    stage.appendChild(legend);
    root.appendChild(stage);

    var sidePanel = element("div", "gv-side");

    var toolbar = element("div", "gv-toolbar");
    this.viewButtons = this.segmented(
      toolbar,
      "View",
      VIEWS.map(function (view) {
        return { value: view, label: VIEW_LABELS[view] };
      }),
      function (value) {
        self.setView(value);
      },
    );
    sidePanel.appendChild(toolbar);

    var qa = element("div", "gv-qa");
    var question = element("p", "gv-line gv-question");
    question.appendChild(element("span", "gv-tag", "Q"));
    question.appendChild(element("span", null, DEMO.question));
    qa.appendChild(question);
    var answer = element("p", "gv-line gv-answer");
    answer.appendChild(element("span", "gv-tag is-answer", "A"));
    this.answer = element("span", "gv-tokens");
    answer.appendChild(this.answer);
    qa.appendChild(answer);
    sidePanel.appendChild(qa);

    this.status = element("p", "gv-status");
    this.status.setAttribute("aria-live", "off");
    this.statusWord = element("span", "gv-status-word");
    this.statusText = element("span", "gv-status-text");
    this.status.appendChild(this.statusWord);
    this.status.appendChild(this.statusText);
    sidePanel.appendChild(this.status);

    var controls = element("div", "gv-controls");
    var transport = element("div", "gv-transport");
    this.prevButton = this.iconButton(
      "gv-btn",
      ICONS.prev,
      "Previous word",
      function () {
        self.pause();
        self.setStep(
          self.step > 0 ? self.step - 1 : self.stepCount() - 1,
          true,
        );
      },
    );
    this.playButton = this.iconButton(
      "gv-btn gv-play",
      ICONS.pause,
      "Pause",
      function () {
        if (self.playing) self.pause();
        else self.play();
      },
    );
    this.nextButton = this.iconButton(
      "gv-btn",
      ICONS.next,
      "Next word",
      function () {
        self.pause();
        self.setStep(
          self.step < self.stepCount() - 1 ? self.step + 1 : 0,
          true,
        );
      },
    );
    transport.appendChild(this.prevButton);
    transport.appendChild(this.playButton);
    transport.appendChild(this.nextButton);
    this.progress = element("span", "gv-progress");
    transport.appendChild(this.progress);
    controls.appendChild(transport);

    var thumbs = element("div", "gv-thumbs");
    thumbs.setAttribute("role", "group");
    thumbs.setAttribute("aria-label", "Example image");
    this.thumbButtons = this.exampleIds.map(function (id, index) {
      var button = element("button", "gv-thumb");
      button.type = "button";
      button.setAttribute(
        "aria-label",
        "Example " + (index + 1) + ": " + EXAMPLES[id].alt,
      );
      var thumb = document.createElement("img");
      thumb.src = EXAMPLES[id].image;
      thumb.alt = "";
      button.appendChild(thumb);
      button.addEventListener("click", function () {
        self.setExample(index);
      });
      thumbs.appendChild(button);
      return button;
    });
    controls.appendChild(thumbs);
    sidePanel.appendChild(controls);
    root.appendChild(sidePanel);

    root.addEventListener("keydown", function (event) {
      if (event.key === "ArrowRight") self.nextButton.click();
      else if (event.key === "ArrowLeft") self.prevButton.click();
      else return;
      event.preventDefault();
    });

    this.syncControls();
  };

  Viewer.prototype.segmented = function (parent, label, options, onSelect) {
    var group = element("div", "gv-group");
    group.appendChild(element("span", "gv-group-label", label));
    var wrap = element("div", "segmented");
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", label);
    var buttons = options.map(function (option) {
      var button = element("button", null, option.label);
      button.type = "button";
      button.dataset.value = option.value;
      button.addEventListener("click", function () {
        onSelect(option.value);
      });
      wrap.appendChild(button);
      return button;
    });
    group.appendChild(wrap);
    parent.appendChild(group);
    return buttons;
  };

  Viewer.prototype.iconButton = function (className, icon, label, onClick) {
    var button = element("button", className);
    button.type = "button";
    button.innerHTML = icon;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", onClick);
    return button;
  };

  Viewer.prototype.syncControls = function () {
    var self = this;
    this.viewButtons.forEach(function (button) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.value === self.view),
      );
    });
    this.thumbButtons.forEach(function (button, index) {
      button.setAttribute("aria-pressed", String(index === self.exampleIndex));
    });
    this.playButton.innerHTML = this.playing ? ICONS.pause : ICONS.play;
    this.playButton.setAttribute("aria-label", this.playing ? "Pause" : "Play");
  };

  Viewer.prototype.renderTokens = function () {
    var self = this;
    var tokens = this.tokens();
    var word = null; // tokens of one word stay on the same line
    this.answer.textContent = "";
    this.tokenNodes = tokens.map(function (token, index) {
      var text = token.replace(/^\s+/, "");
      if (text.length < token.length || !word) {
        if (word) self.answer.appendChild(document.createTextNode(" "));
        word = element("span", "gv-word-group");
        self.answer.appendChild(word);
      }
      var node;
      if (index === 0) {
        node = element("span", "gv-word", text);
      } else {
        node = element("button", "gv-token", text);
        node.type = "button";
        node.addEventListener("click", function () {
          self.pause();
          self.setStep(index - 1, true);
        });
      }
      word.appendChild(node);
      return node;
    });
  };

  /* Reserve room for the longest answer so that switching examples does not move the page. */
  Viewer.prototype.reserveAnswerHeight = function () {
    var self = this;
    var line = this.answer.parentElement;
    var saved = { index: this.exampleIndex, view: this.view };
    var tallest = 0;
    line.style.minHeight = "";
    this.exampleIds.forEach(function (id, index) {
      VIEWS.forEach(function (view) {
        self.exampleIndex = index;
        self.view = view;
        self.renderTokens();
        tallest = Math.max(tallest, line.offsetHeight);
      });
    });
    this.exampleIndex = saved.index;
    this.view = saved.view;
    this.renderTokens();
    if (tallest) line.style.minHeight = tallest + "px";
  };

  Viewer.prototype.applyStep = function (animate) {
    var example = this.example();
    var tokens = this.tokens();
    var current = this.step + 1;
    var frame = frameOf(example, this.view, this.step);
    this.currentFrame = frame;
    this.frame.style.aspectRatio = String(example.aspect);

    this.tokenNodes.forEach(function (node, index) {
      node.classList.toggle("is-current", index === current);
      node.classList.toggle("is-future", index > current);
    });

    var total = VISUAL_TOKENS.toLocaleString("en-US");
    var parts =
      this.view === "gaze"
        ? [
            "Gaze Attention attends to ",
            [TOPK * REGION_CELLS + " of " + total + " visual tokens"],
            " (" + TOPK + " regions).",
          ]
        : [
            "Dense attention attends to ",
            ["all " + total + " visual tokens"],
            ".",
          ];
    this.statusWord.textContent =
      "While generating “" + wordAt(tokens, current) + "”";
    var statusText = this.statusText;
    statusText.textContent = "";
    parts.forEach(function (part) {
      if (Array.isArray(part))
        statusText.appendChild(element("b", null, part[0]));
      else statusText.appendChild(document.createTextNode(part));
    });

    this.progress.textContent = this.step + 1 + " / " + this.stepCount();
    this.canvas.setAttribute(
      "aria-label",
      example.alt +
        " " +
        this.statusWord.textContent +
        ": " +
        statusText.textContent,
    );

    var target = regionWeights(frame);
    if (animate && !reducedMotion && this.view === "gaze")
      this.animateTo(target);
    else {
      this.cancelAnimation();
      this.weights = target;
      this.draw();
    }
  };

  Viewer.prototype.cancelAnimation = function () {
    if (this.animation) cancelAnimationFrame(this.animation);
    this.animation = null;
  };

  Viewer.prototype.animateTo = function (target) {
    var self = this;
    var from = this.weights;
    var start = null;
    this.cancelAnimation();
    function tick(now) {
      if (start === null) start = now;
      var progress = Math.min(1, (now - start) / FADE_MS);
      var eased = 1 - Math.pow(1 - progress, 3);
      var mixed = new Float32Array(REGION_COUNT);
      for (var i = 0; i < REGION_COUNT; i += 1)
        mixed[i] = from[i] + (target[i] - from[i]) * eased;
      self.weights = mixed;
      self.draw();
      self.animation = progress < 1 ? requestAnimationFrame(tick) : null;
    }
    this.animation = requestAnimationFrame(tick);
  };

  Viewer.prototype.draw = function () {
    var self = this;
    var example = this.example();
    if (!this.currentFrame || !fitCanvas(this.canvas, example.aspect)) return;
    this.image = loadImage(example.image, function () {
      if (self.example() === example) self.paintNow();
    });
    this.paintNow();
  };

  Viewer.prototype.paintNow = function () {
    if (!this.canvas.width) return;
    paint(
      this.canvas.getContext("2d"),
      this.canvas.width,
      this.canvas.height,
      this.image,
      this.currentFrame,
      this.view,
      this.weights,
    );
  };

  Viewer.prototype.setStep = function (step, animate) {
    this.step = Math.max(0, Math.min(this.stepCount() - 1, step));
    this.applyStep(animate);
    this.schedule();
  };

  Viewer.prototype.setExample = function (index) {
    this.exampleIndex = index;
    this.step = 0;
    this.renderTokens();
    this.syncControls();
    this.applyStep(false);
    this.schedule();
  };

  Viewer.prototype.setView = function (view) {
    if (view === this.view) return;
    var word = wordAt(this.tokens(), this.step + 1).toLowerCase();
    this.view = view;
    this.renderTokens();
    // Stay on the same word when the other model generated it too.
    var tokens = this.tokens();
    var step = 0;
    for (var i = 1; i < tokens.length; i += 1) {
      if (wordAt(tokens, i).toLowerCase() === word) {
        step = i - 1;
        break;
      }
    }
    this.step = step;
    this.syncControls();
    this.applyStep(false);
    this.schedule();
  };

  Viewer.prototype.play = function () {
    this.playing = true;
    this.syncControls();
    if (this.step >= this.stepCount() - 1) this.setStep(0, false);
    this.schedule();
  };

  Viewer.prototype.pause = function () {
    this.playing = false;
    this.syncControls();
    this.schedule();
  };

  /* While playing, the answer is generated word by word; then the next example starts. */
  Viewer.prototype.schedule = function () {
    var self = this;
    clearTimeout(this.timer);
    if (!this.playing || !this.visible || document.hidden) return;
    var last = this.stepCount() - 1;
    this.timer = setTimeout(
      function () {
        if (self.step < last) self.setStep(self.step + 1, true);
        else self.setExample((self.exampleIndex + 1) % self.exampleIds.length);
      },
      this.step >= last ? END_PAUSE_MS : STEP_MS,
    );
  };

  function init() {
    document.querySelectorAll("canvas[data-gaze-still]").forEach(initStill);
    document.querySelectorAll("[data-gaze-viewer]").forEach(function (root) {
      new Viewer(root);
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
