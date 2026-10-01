/* Result charts. All numbers are taken from the tables and figures of the paper. */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var COLOR = {
    gaze: "#3b78c4",
    gazeLight: "#4f8cd8",
    other: "#7d8898",
    ink: "#1f2937",
    surface: "#f8fafd",
  };

  /* ---------- tooltip ---------- */

  var tooltip = null;

  function showTip(title, lines, x, y) {
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "chart-tooltip";
      tooltip.setAttribute("role", "status");
      document.body.appendChild(tooltip);
    }
    tooltip.textContent = "";
    var strong = document.createElement("strong");
    strong.textContent = title;
    tooltip.appendChild(strong);
    lines.forEach(function (line) {
      var row = document.createElement("span");
      row.textContent = line;
      tooltip.appendChild(row);
    });
    tooltip.classList.add("is-visible");
    var box = tooltip.getBoundingClientRect();
    var left = Math.min(window.innerWidth - box.width - 8, Math.max(8, x + 14));
    var top = y - box.height - 12;
    if (top < 8) top = y + 18;
    tooltip.style.left = left + "px";
    tooltip.style.top = top + "px";
  }

  function hideTip() {
    if (tooltip) tooltip.classList.remove("is-visible");
  }

  function bindTip(node, title, lines) {
    node.addEventListener("pointerenter", function (event) {
      showTip(title, lines, event.clientX, event.clientY);
    });
    node.addEventListener("pointermove", function (event) {
      showTip(title, lines, event.clientX, event.clientY);
    });
    // After a tap the tooltip stays until the mark loses focus or the page scrolls.
    node.addEventListener("pointerleave", function (event) {
      if (event.pointerType !== "touch") hideTip();
    });
    node.addEventListener("focus", function () {
      var box = node.getBoundingClientRect();
      showTip(title, lines, box.left + box.width / 2, box.top);
    });
    node.addEventListener("blur", hideTip);
  }

  function bindStaticTips() {
    document.querySelectorAll("[data-tip-title]").forEach(function (node) {
      var lines = (node.getAttribute("data-tip-body") || "")
        .split("|")
        .filter(Boolean);
      bindTip(node, node.getAttribute("data-tip-title"), lines);
    });
  }

  /* ---------- line chart ---------- */

  function svg(tag, attributes, text) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attributes || {}).forEach(function (key) {
      node.setAttribute(key, attributes[key]);
    });
    if (text != null) node.textContent = text;
    return node;
  }

  function signed(value, digits) {
    if (Math.abs(value) < 1e-9) return "0";
    return (value > 0 ? "+" : "−") + Math.abs(value).toFixed(digits);
  }

  function marker(shape, x, y, color, radius) {
    var common = { class: "marker", stroke: COLOR.surface, "stroke-width": 2 };
    var node;
    if (shape === "square") {
      node = svg("rect", {
        x: x - radius,
        y: y - radius,
        width: 2 * radius,
        height: 2 * radius,
        rx: 1.5,
        fill: color,
      });
    } else if (shape === "diamond") {
      var d = radius + 1.5;
      node = svg("path", {
        d:
          "M" +
          x +
          " " +
          (y - d) +
          "L" +
          (x + d) +
          " " +
          y +
          "L" +
          x +
          " " +
          (y + d) +
          "L" +
          (x - d) +
          " " +
          y +
          "Z",
        fill: color,
      });
    } else if (shape === "ring") {
      node = svg("circle", { cx: x, cy: y, r: radius, fill: COLOR.surface });
      node.setAttribute("class", "marker");
      node.setAttribute("stroke", color);
      node.setAttribute("stroke-width", 2.4);
      return node;
    } else {
      node = svg("circle", { cx: x, cy: y, r: radius, fill: color });
    }
    Object.keys(common).forEach(function (key) {
      node.setAttribute(key, common[key]);
    });
    return node;
  }

  function legendKey(series) {
    var key = svg("svg", {
      class: "legend-key",
      viewBox: "0 0 30 14",
      "aria-hidden": "true",
    });
    key.appendChild(
      svg("line", {
        x1: 1,
        y1: 7,
        x2: 29,
        y2: 7,
        stroke: series.color,
        "stroke-width": series.emphasis ? 2.6 : 2,
        "stroke-linecap": "round",
      }),
    );
    key.appendChild(marker(series.marker, 15, 7, series.color, 4));
    return key;
  }

  function renderLineChart(container, config) {
    var width = container.clientWidth;
    if (!width) return;
    var compact = width < 500;
    var labels = config.directLabels && !compact;
    var margin = {
      top: 18,
      right: labels ? config.labelSpace : 18,
      bottom: 48,
      left: 44,
    };
    var height = config.height;
    var plotWidth = width - margin.left - margin.right;
    var plotHeight = height - margin.top - margin.bottom;
    function X(value) {
      return (
        margin.left +
        ((value - config.xDomain[0]) /
          (config.xDomain[1] - config.xDomain[0])) *
          plotWidth
      );
    }
    function Y(value) {
      return (
        margin.top +
        ((config.yDomain[1] - value) /
          (config.yDomain[1] - config.yDomain[0])) *
          plotHeight
      );
    }

    var root = svg("svg", {
      class: "chart-svg",
      width: width,
      height: height,
      viewBox: "0 0 " + width + " " + height,
    });

    config.yTicks.forEach(function (tick) {
      root.appendChild(
        svg("line", {
          class: tick === 0 ? "zero-line" : "grid-line",
          x1: margin.left,
          x2: width - margin.right,
          y1: Y(tick) + 0.5,
          y2: Y(tick) + 0.5,
        }),
      );
      root.appendChild(
        svg(
          "text",
          {
            class: "tick-label",
            x: margin.left - 8,
            y: Y(tick) + 4,
            "text-anchor": "end",
          },
          signed(tick, config.yDigits),
        ),
      );
    });
    config.xTicks.forEach(function (tick) {
      root.appendChild(
        svg(
          "text",
          {
            class: "tick-label",
            x: X(tick.value),
            y: height - margin.bottom + 18,
            "text-anchor": "middle",
          },
          tick.label,
        ),
      );
    });
    root.appendChild(
      svg(
        "text",
        {
          class: "axis-title",
          x: margin.left + plotWidth / 2,
          y: height - 8,
          "text-anchor": "middle",
        },
        (compact && config.xTitleShort) || config.xTitle,
      ),
    );

    config.series.forEach(function (series) {
      var path = series.points
        .map(function (point, index) {
          return (
            (index ? "L" : "M") +
            X(point.x).toFixed(1) +
            " " +
            Y(point.y).toFixed(1)
          );
        })
        .join("");
      root.appendChild(
        svg("path", {
          class: "series-line" + (series.emphasis ? " is-emphasis" : ""),
          d: path,
          stroke: series.color,
        }),
      );
    });

    function addPoint(point, shape, color, radius) {
      var x = X(point.x);
      var y = Y(point.y);
      var hit = svg("circle", {
        class: "hit",
        cx: x,
        cy: y,
        r: 14,
        tabindex: 0,
        role: "img",
        "aria-label": point.tip.title + ". " + point.tip.lines.join(". "),
      });
      bindTip(hit, point.tip.title, point.tip.lines);
      root.appendChild(hit);
      root.appendChild(marker(shape, x, y, color, radius));
    }

    config.series.forEach(function (series) {
      series.points.forEach(function (point) {
        if (point.hidden) return;
        addPoint(
          point,
          point.marker || series.marker,
          series.color,
          point.radius || (series.emphasis ? 5 : 4.5),
        );
      });
    });
    if (config.origin) addPoint(config.origin, "circle", COLOR.ink, 5);

    function addLabel(point, label) {
      root.appendChild(
        svg(
          "text",
          {
            class: "direct-label" + (label.muted ? " is-muted" : ""),
            x: X(point.x) + label.dx,
            y: Y(point.y) + label.dy,
            "text-anchor": label.anchor || "start",
          },
          label.text,
        ),
      );
    }
    if (labels || config.alwaysLabel) {
      config.series.forEach(function (series) {
        series.points.forEach(function (point) {
          if (point.label) addLabel(point, point.label);
        });
      });
      if (config.origin && config.origin.label)
        addLabel(config.origin, config.origin.label);
    }

    container.textContent = "";
    container.appendChild(root);
  }

  function mountLineChart(id, config, legendId) {
    var container = document.getElementById(id);
    if (!container) return;
    if (legendId) {
      var legend = document.getElementById(legendId);
      legend.textContent = "";
      config.series
        .slice()
        .reverse()
        .forEach(function (series) {
          var item = document.createElement("li");
          item.appendChild(legendKey(series));
          item.appendChild(document.createTextNode(series.name));
          legend.appendChild(item);
        });
    }
    function render() {
      renderLineChart(container, config);
    }
    render();
    if (window.ResizeObserver) new ResizeObserver(render).observe(container);
    else window.addEventListener("resize", render);
  }

  /* ---------- image benchmarks (Table 1) ---------- */

  function budgetSeries(spec) {
    var base = spec.rows[0];
    return {
      name: spec.name,
      color: spec.color,
      marker: spec.marker,
      emphasis: spec.emphasis,
      points: spec.rows.map(function (row, index) {
        var share = (row.entries / base.entries) * 100;
        var delta = row.average - base.average;
        return {
          x: share,
          y: delta,
          hidden: index === 0,
          label:
            index ===
            (spec.labelAt == null ? spec.rows.length - 1 : spec.labelAt)
              ? spec.label
              : null,
          tip: {
            title: signed(delta, 1) + " points",
            lines: [
              spec.name + " on " + spec.model,
              row.entries +
                " of " +
                base.entries +
                " visual KV entries (" +
                Math.round(share) +
                "%)",
              "Average " +
                row.average.toFixed(1) +
                " vs. " +
                base.average.toFixed(1) +
                " with dense attention",
            ],
          },
        };
      }),
    };
  }

  var IMAGE_CHART = {
    height: 330,
    xDomain: [100, 0],
    yDomain: [-12, 3.2],
    yTicks: [-10, -5, 0],
    yDigits: 0,
    xTicks: [100, 75, 50, 25, 0].map(function (value) {
      return { value: value, label: value + "%" };
    }),
    xTitle:
      "Visual KV entries attended to, relative to dense attention (fewer →)",
    xTitleShort: "Share of visual KV entries attended to (fewer →)",
    directLabels: true,
    labelSpace: 132,
    origin: {
      x: 100,
      y: 0,
      tip: {
        title: "Dense attention",
        lines: [
          "Qwen2.5-VL-3B: 63.3 (256 entries)",
          "LLaVA-OV-7B: 62.4 (196 entries)",
          "Cambrian-4B: 59.7 (576 entries)",
          "Cambrian-4B + token compression: 57.8 (144 entries)",
        ],
      },
    },
    series: [
      budgetSeries({
        name: "InfiniPot-V",
        model: "Qwen2.5-VL-3B",
        color: COLOR.other,
        marker: "diamond",
        label: { text: "InfiniPot-V −10.5", dx: 12, dy: 17, muted: true },
        rows: [
          { entries: 256, average: 63.3 },
          { entries: 128, average: 60.3 },
          { entries: 50, average: 52.8 },
        ],
      }),
      budgetSeries({
        name: "HERMES",
        model: "LLaVA-OV-7B",
        color: COLOR.other,
        marker: "square",
        label: { text: "HERMES −10.1", dx: 12, dy: -7, muted: true },
        rows: [
          { entries: 196, average: 62.4 },
          { entries: 100, average: 57.9 },
          { entries: 40, average: 52.3 },
        ],
      }),
      budgetSeries({
        name: "Gaze Attention + token compression",
        model: "Cambrian-4B + token compression",
        color: COLOR.gazeLight,
        marker: "ring",
        label: {
          text: "+ token compression +0.5",
          dx: 0,
          dy: 27,
          anchor: "middle",
          muted: true,
        },
        rows: [
          { entries: 144, average: 57.8 },
          { entries: 58, average: 59.2 },
          { entries: 40, average: 58.3 },
        ],
      }),
      budgetSeries({
        name: "Gaze Attention",
        model: "Cambrian-4B",
        color: COLOR.gaze,
        marker: "circle",
        emphasis: true,
        label: { text: "Gaze Attention +0.7", dx: 12, dy: 4 },
        rows: [
          { entries: 576, average: 59.7 },
          { entries: 292, average: 61.1 },
          { entries: 148, average: 61.2 },
          { entries: 76, average: 60.4 },
        ],
      }),
    ],
  };

  /* ---------- video benchmarks (Table 2), Cambrian-4B only ---------- */

  function videoRow(entries, scores) {
    return {
      entries: entries,
      // Keep the full mean so that rounding does not change the score gap.
      average:
        scores.reduce(function (sum, score) {
          return sum + score;
        }, 0) / scores.length,
    };
  }

  var VIDEO_BASELINE = videoRow(20000, [58.8, 65.9, 53.5, 57.5, 77.1, 60.5]);
  var VIDEO_CHART = {
    height: IMAGE_CHART.height,
    xDomain: [100, 0],
    yDomain: [-2.1, 2.1],
    yTicks: [-2, -1, 0, 1, 2],
    yDigits: 0,
    xTicks: IMAGE_CHART.xTicks,
    xTitle: IMAGE_CHART.xTitle,
    xTitleShort: IMAGE_CHART.xTitleShort,
    directLabels: true,
    labelSpace: IMAGE_CHART.labelSpace,
    origin: {
      x: 100,
      y: 0,
      tip: {
        title: "Dense attention",
        lines: ["Cambrian-4B: 62.2 (20K visual KV entries)"],
      },
    },
    series: [
      budgetSeries({
        name: "Dense, fewer tokens",
        model: "Cambrian-4B",
        color: COLOR.other,
        marker: "diamond",
        label: { text: "Fewer tokens −1.7", dx: 12, dy: 4, muted: true },
        rows: [
          VIDEO_BASELINE,
          videoRow(4000, [55.7, 61.4, 53.2, 54.0, 75.3, 63.7]),
        ],
      }),
      budgetSeries({
        name: "HERMES",
        model: "Cambrian-4B",
        color: COLOR.other,
        marker: "square",
        label: { text: "HERMES −0.2", dx: 12, dy: 4, muted: true },
        rows: [
          VIDEO_BASELINE,
          videoRow(4000, [58.1, 65.0, 53.4, 56.2, 76.5, 62.7]),
        ],
      }),
      budgetSeries({
        name: "Gaze Attention",
        model: "Cambrian-4B",
        color: COLOR.gaze,
        marker: "circle",
        emphasis: true,
        label: { text: "Gaze Attention +1.1", dx: 12, dy: 4 },
        rows: [
          VIDEO_BASELINE,
          videoRow(4000, [60.4, 67.5, 53.8, 56.8, 80.4, 62.9]),
          videoRow(2000, [59.4, 67.1, 53.2, 56.6, 79.9, 63.8]),
        ],
      }),
    ],
  };

  /* ---------- ablations (Fig. 6), relative to the default setting ---------- */

  function ablationSeries(name, unit, positions, names, scores, defaultIndex) {
    var reference = scores[defaultIndex];
    return {
      name: name,
      color: COLOR.gaze,
      marker: "circle",
      emphasis: true,
      points: scores.map(function (score, index) {
        var delta = score - reference;
        var isDefault = index === defaultIndex;
        var first = index === 0;
        var last = index === scores.length - 1;
        var label = null;
        if (isDefault)
          label = {
            text: "default",
            dx: 0,
            dy: -13,
            anchor: "middle",
            muted: true,
          };
        else if (first)
          label = { text: signed(delta, 1), dx: 9, dy: delta < 0 ? 15 : -10 };
        else if (last)
          label = {
            text: signed(delta, 1),
            dx: -4,
            dy: delta < 0 ? 19 : -11,
            anchor: "end",
          };
        return {
          x: positions[index],
          y: delta,
          marker: isDefault ? "ring" : "circle",
          radius: isDefault ? 6 : 4.5,
          label: label,
          tip: {
            title: isDefault ? "Default" : signed(delta, 1) + " points",
            lines: [
              names[index] + " " + unit,
              isDefault
                ? "Reference setting"
                : "Relative to the default setting",
            ],
          },
        };
      }),
    };
  }

  var ABLATION_AXIS = {
    height: 214,
    yDomain: [-1.3, 0.95],
    yTicks: [-1, -0.5, 0, 0.5],
    yDigits: 1,
    directLabels: true,
    alwaysLabel: true,
    labelSpace: 18,
  };

  function ablationChart(extra) {
    var config = {};
    Object.keys(ABLATION_AXIS).forEach(function (key) {
      config[key] = ABLATION_AXIS[key];
    });
    Object.keys(extra).forEach(function (key) {
      config[key] = extra[key];
    });
    return config;
  }

  var CONTEXT_CHART = ablationChart({
    xDomain: [-2.5, 34],
    xTicks: [0, 4, 16, 32].map(function (value) {
      return { value: value, label: String(value) };
    }),
    xTitle: "Context tokens per image or frame",
    series: [
      ablationSeries(
        "Context tokens",
        "context tokens",
        [0, 2, 4, 16, 32],
        ["0", "2", "4", "16", "32"],
        [67.2, 67.7, 68.1, 68.5, 68.7],
        2,
      ),
    ],
  });

  var REGION_NAMES = ["1×1", "2×2", "4×4", "6×6", "12×12"];
  var REGION_CHART = ablationChart({
    xDomain: [-0.45, 4.45],
    xTicks: REGION_NAMES.map(function (label, index) {
      return { value: index, label: label };
    }),
    xTitle: "Tokens per gaze region",
    series: [
      ablationSeries(
        "Region size",
        "tokens per region",
        [0, 1, 2, 3, 4],
        REGION_NAMES,
        [69.2, 69.2, 69.0, 69.0, 68.5],
        3,
      ),
    ],
  });

  function init() {
    bindStaticTips();
    mountLineChart("image-chart", IMAGE_CHART, "image-chart-legend");
    mountLineChart("video-chart", VIDEO_CHART, "video-chart-legend");
    mountLineChart("context-chart", CONTEXT_CHART);
    mountLineChart("region-chart", REGION_CHART);
    window.addEventListener("scroll", hideTip, { passive: true });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
