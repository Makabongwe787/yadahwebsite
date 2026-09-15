/**
 * Yadah Technologies - Main JavaScript
 * Fully offline, no external dependencies
 */

(function() {
  'use strict';

  /**
   * Hero Slider - Auto-rotating slides
   */
  function initSlider() {
    var slides = document.querySelectorAll('.hero-slide');
    var dots = document.querySelectorAll('.slider-dot');
    var currentSlide = 0;
    var slideCount = slides.length;
    var intervalTime = 5000;

    function showSlide(index) {
      currentSlide = index;
      if (currentSlide >= slideCount) currentSlide = 0;
      if (currentSlide < 0) currentSlide = slideCount - 1;

      slides.forEach(function(slide, i) {
        slide.classList.remove('active');
      });
      dots.forEach(function(dot, i) {
        dot.classList.remove('active');
      });

      if (slides[currentSlide]) slides[currentSlide].classList.add('active');
      if (dots[currentSlide]) dots[currentSlide].classList.add('active');
    }

    function nextSlide() {
      showSlide(currentSlide + 1);
    }

    // Dot click handlers
    dots.forEach(function(dot, index) {
      dot.addEventListener('click', function() {
        showSlide(index);
      });
    });

    // Auto advance
    var sliderInterval = setInterval(nextSlide, intervalTime);

    // Pause on hover
    var heroSlider = document.querySelector('.hero-slider');
    if (heroSlider) {
      heroSlider.addEventListener('mouseenter', function() {
        clearInterval(sliderInterval);
      });
      heroSlider.addEventListener('mouseleave', function() {
        sliderInterval = setInterval(nextSlide, intervalTime);
      });
    }
  }

  /**
   * Hero images - remove near-white background (Slide 1)
   * Works offline (no libraries). Converts image to an in-memory PNG.
   */
  function initHeroImageCutouts() {
    var imgs = document.querySelectorAll('img[data-cutout="white"]');
    if (!imgs.length) return;

    function applyWhiteCutout(img) {
      // Higher = remove more (more aggressive). 245-250 is typical for white JPG backgrounds.
      var threshold = parseInt(img.getAttribute('data-cutout-threshold') || '246', 10);
      // Feather softens edges so we don't get a harsh halo.
      var feather = 22;
      // Crop padding around the detected subject
      var pad = 6;

      function clamp(n, min, max) {
        return n < min ? min : (n > max ? max : n);
      }

      function isNearWhite(r, g, b) {
        // Near-white check using per-channel + overall brightness.
        // This is more stable than average alone for JPEG artifacts.
        return r >= threshold && g >= threshold && b >= threshold;
      }

      function run() {
        try {
          if (!img.naturalWidth || !img.naturalHeight) return;

          var canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;

          var ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;

          ctx.drawImage(img, 0, 0);
          var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          var d = imageData.data;

          // First pass: make near-white pixels transparent with feathering.
          // Feathering based on brightness distance from threshold.
          for (var i = 0; i < d.length; i += 4) {
            var r = d[i], g = d[i + 1], b = d[i + 2];
            var a = d[i + 3];
            if (a === 0) continue;

            if (isNearWhite(r, g, b)) {
              d[i + 3] = 0;
              continue;
            }

            // feather zone: close to white in all channels (handles JPEG halo)
            var minCh = Math.min(r, g, b);
            if (minCh >= threshold - feather) {
              var t = (threshold - minCh) / feather; // 0..1
              d[i + 3] = Math.round(a * clamp(t, 0, 1));
            }
          }

          ctx.putImageData(imageData, 0, 0);

          // Second pass: trim transparent borders (tight crop to subject)
          var trimmed = ctx.getImageData(0, 0, canvas.width, canvas.height);
          var td = trimmed.data;
          var w = canvas.width;
          var h = canvas.height;

          var minX = w, minY = h, maxX = -1, maxY = -1;
          for (var y = 0; y < h; y++) {
            for (var x = 0; x < w; x++) {
              var idx = (y * w + x) * 4 + 3;
              if (td[idx] > 0) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
              }
            }
          }

          // If we didn't find any non-transparent pixels, bail.
          if (maxX < 0 || maxY < 0) return;

          minX = clamp(minX - pad, 0, w - 1);
          minY = clamp(minY - pad, 0, h - 1);
          maxX = clamp(maxX + pad, 0, w - 1);
          maxY = clamp(maxY + pad, 0, h - 1);

          var outW = Math.max(1, maxX - minX + 1);
          var outH = Math.max(1, maxY - minY + 1);

          var out = document.createElement('canvas');
          out.width = outW;
          out.height = outH;
          var octx = out.getContext('2d', { willReadFrequently: true });
          if (!octx) return;
          octx.drawImage(canvas, minX, minY, outW, outH, 0, 0, outW, outH);

          img.src = out.toDataURL('image/png');
          img.removeAttribute('data-cutout'); // run once
        } catch (e) {
          // Ignore (canvas may fail if image can't be read)
        }
      }

      if (img.complete) run();
      else img.addEventListener('load', run, { once: true });
    }

    imgs.forEach(function(img) {
      applyWhiteCutout(img);
    });
  }

  /**
   * Hero slides - match content background to image side
   * Samples a few background pixels from each slide image and applies
   * CSS variables on the slide so the left content blends with the right.
   */
  function initHeroSlideBackgrounds() {
    var slides = document.querySelectorAll('.hero-slide');
    if (!slides.length) return;

    function clampByte(n) {
      n = Math.round(n);
      if (n < 0) return 0;
      if (n > 255) return 255;
      return n;
    }

    function isNearWhite(r, g, b) {
      return r >= 245 && g >= 245 && b >= 245;
    }

    function median(values) {
      if (!values.length) return null;
      var a = values.slice().sort(function(x, y) { return x - y; });
      var mid = Math.floor(a.length / 2);
      return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
    }

    function sampleBgFromImage(img) {
      if (!img.naturalWidth || !img.naturalHeight) return null;

      var c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0);

      var w = c.width;
      var h = c.height;

      var mode = (img.getAttribute('data-bg-sample') || 'left').toLowerCase();
      // Region to sample
      var x0 = 0, x1 = w;
      if (mode === 'left') {
        x0 = 0;
        x1 = Math.floor(w * 0.38);
      } else if (mode === 'right') {
        x0 = Math.floor(w * 0.62);
        x1 = w;
      } else {
        // all
        x0 = 0;
        x1 = w;
      }

      // Sample a sparse grid and pick the dominant quantized color.
      // This avoids landing on the product/white regions (common in slides 5/6).
      var stepX = Math.max(6, Math.floor((x1 - x0) / 32));
      var stepY = Math.max(6, Math.floor(h / 28));

      var buckets = Object.create(null); // key -> {count, r, g, b}
      for (var y = 4; y < h - 4; y += stepY) {
        for (var x = x0 + 4; x < x1 - 4; x += stepX) {
          var p = ctx.getImageData(x, y, 1, 1).data;
          var r = p[0], g = p[1], b = p[2], a = p[3];
          if (a < 200) continue;
          if (isNearWhite(r, g, b)) continue;
          // ignore near-black shadows
          if (r <= 18 && g <= 18 && b <= 18) continue;

          // Quantize to reduce noise; 4-bit per channel is enough.
          var rq = r >> 4;
          var gq = g >> 4;
          var bq = b >> 4;
          var key = (rq << 8) | (gq << 4) | bq;

          var bucket = buckets[key];
          if (!bucket) bucket = buckets[key] = { count: 0, r: 0, g: 0, b: 0 };
          bucket.count++;
          bucket.r += r;
          bucket.g += g;
          bucket.b += b;
        }
      }

      var bestKey = null;
      var bestCount = 0;
      for (var k in buckets) {
        if (buckets[k].count > bestCount) {
          bestCount = buckets[k].count;
          bestKey = k;
        }
      }

      if (!bestKey || bestCount < 10) {
        // fallback to median of a few safe edge samples
        var fallback = [];
        var safePoints = [
          [x0 + 6, 6],
          [x0 + 6, h - 7],
          [Math.floor((x0 + x1) / 2), 6],
          [Math.floor((x0 + x1) / 2), h - 7]
        ];
        for (var i = 0; i < safePoints.length; i++) {
          var sp = safePoints[i];
          var pp = ctx.getImageData(sp[0], sp[1], 1, 1).data;
          if (pp[3] < 200) continue;
          if (isNearWhite(pp[0], pp[1], pp[2])) continue;
          fallback.push([pp[0], pp[1], pp[2]]);
        }
        if (fallback.length < 2) return null;
        return { r: median(fallback.map(function(v){return v[0];})),
                 g: median(fallback.map(function(v){return v[1];})),
                 b: median(fallback.map(function(v){return v[2];})) };
      }

      var best = buckets[bestKey];
      return {
        r: best.r / best.count,
        g: best.g / best.count,
        b: best.b / best.count
      };
    }

    slides.forEach(function(slide) {
      var inner = slide.querySelector('.hero-slide-inner');
      var img = slide.querySelector('.hero-slide-image img');
      if (!inner || !img) return;

      function apply(attempt) {
        try {
          attempt = attempt || 0;
          // Sometimes the browser reports complete=true briefly with naturalWidth=0.
          if (!img.naturalWidth || !img.naturalHeight) {
            if (attempt < 10) setTimeout(function() { apply(attempt + 1); }, 120);
            return;
          }

          var bg = sampleBgFromImage(img);
          if (!bg) return;

          var r = clampByte(bg.r);
          var g = clampByte(bg.g);
          var b = clampByte(bg.b);
          inner.style.setProperty('--slide-bg', 'rgb(' + r + ', ' + g + ', ' + b + ')');
        } catch (e) {
          // Ignore sampling failures
        }
      }

      // Prefer decode() when available (waits until image is ready to draw)
      if (img.decode) {
        img.decode().then(function() { apply(0); }).catch(function() { apply(0); });
      } else if (img.complete) {
        apply(0);
      } else {
        img.addEventListener('load', function() { apply(0); }, { once: true });
      }
    });
  }

  /**
   * Mobile menu toggle
   */
  function initMobileMenu() {
    var menuToggle = document.querySelector('.menu-toggle');
    var mainNav = document.querySelector('.main-nav');

    if (menuToggle && mainNav) {
      menuToggle.addEventListener('click', function() {
        mainNav.classList.toggle('active');
      });
    }
  }

  /**
   * Initialize on DOM ready
   */
  function init() {
    initSlider();
    initMobileMenu();
    initHeroImageCutouts();
    initHeroSlideBackgrounds();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
