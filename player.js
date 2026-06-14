/*!
 * Bitstreaming Player v1.1 Mas buffer 
 * Reproductor HLS centralizado - https://bitstreaming.net
 * Actualizar este archivo en GitHub propaga cambios a todos los clientes.
 */
(function () {
  // ─── CONFIGURACIÓN ───────────────────────────────────────────────────────────
  const DOMINIO_STREAM = 'bitstreaming.net';

  const PLYR_CSS = 'https://cdn.plyr.io/3.7.8/plyr.css';
  const PLYR_JS  = 'https://cdn.plyr.io/3.7.8/plyr.js';
  const HLS_JS   = 'https://cdn.jsdelivr.net/npm/hls.js@latest';

  // ─── OBTENER PARÁMETRO src DE LA URL DEL SCRIPT ──────────────────────────────
  const scriptTag = document.currentScript;
  const params    = new URLSearchParams(scriptTag.src.split('?')[1] || '');
  const source    = params.get('src');

  if (!source) {
    console.error('[BitPlayer] Falta el parámetro ?src= en el script.');
    return;
  }

  // ─── VALIDAR QUE EL SOURCE SEA DE BITSTREAMING.NET ───────────────────────────
  let srcHostname;
  try {
    srcHostname = new URL(source).hostname;
  } catch (e) {
    console.error('[BitPlayer] URL de stream inválida.');
    return;
  }

  const dominioPermitido = srcHostname === DOMINIO_STREAM || srcHostname.endsWith('.' + DOMINIO_STREAM);

  if (!dominioPermitido) {
    console.warn('[BitPlayer] Source no autorizado:', srcHostname);
    return;
  }

  // ─── INYECTAR CSS DE PLYR ─────────────────────────────────────────────────────
  if (!document.querySelector('link[href="' + PLYR_CSS + '"]')) {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = PLYR_CSS;
    document.head.appendChild(link);
  }

  // ─── INYECTAR CONTENEDOR HTML EN EL LUGAR DEL SCRIPT ────────────────────────
  const uid = 'bsp-' + Math.random().toString(36).substr(2, 8);
  const wrapper = document.createElement('div');
  wrapper.className = 'bsp-wrapper';
  wrapper.style.cssText = 'position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden;box-shadow:0 8px 25px rgba(0,0,0,0.6);margin:0 auto 30px auto;';

  if (!document.getElementById('bsp-plyr-fix')) {
    const sf = document.createElement('style');
    sf.id = 'bsp-plyr-fix';
    sf.textContent =
      '.bsp-wrapper .plyr{position:absolute;top:0;left:0;width:100%;height:100%;}' +
      '.bsp-wrapper video{width:100%;height:100%;object-fit:contain;}' +
      '.bsp-wrapper .plyr__controls{opacity:0;transition:opacity .4s;pointer-events:none;}' +
      '.bsp-wrapper.bsp-ready .plyr__controls{opacity:1;pointer-events:auto;}' +
      '.bsp-spinner{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10;pointer-events:none;transition:opacity .5s;}' +
      '.bsp-spinner svg{width:56px;height:56px;animation:bsp-spin .8s linear infinite;filter:drop-shadow(0 0 12px rgba(99,102,241,.45));}' +
      '.bsp-spinner svg circle{fill:none;stroke:url(#bsp-grad);stroke-width:4;stroke-linecap:round;stroke-dasharray:80;stroke-dashoffset:60;}' +
      '.bsp-ready .bsp-spinner{opacity:0;}' +
      '@keyframes bsp-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(sf);
  }

  wrapper.innerHTML =
    '<div class="bsp-spinner"><svg viewBox="0 0 40 40"><defs><linearGradient id="bsp-grad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#6366f1"/><stop offset="100%" stop-color="#a78bfa"/></linearGradient></defs><circle cx="20" cy="20" r="16"/></svg></div>' +
    '<video id="' + uid + '" class="plyr__video" playsinline crossorigin></video>';
  scriptTag.parentNode.insertBefore(wrapper, scriptTag);

  // ─── CARGAR LIBRERÍAS Y ARRANCAR ─────────────────────────────────────────────
  function cargarScript(url, callback) {
    if (document.querySelector('script[src="' + url + '"]')) { callback(); return; }
    const s = document.createElement('script');
    s.src = url;
    s.onload = callback;
    document.head.appendChild(s);
  }

  cargarScript(PLYR_JS, function () {
    cargarScript(HLS_JS, function () {
      iniciar();
    });
  });

  // ─── LÓGICA DEL REPRODUCTOR ──────────────────────────────────────────────────
  function iniciar() {
    const video = document.getElementById(uid);
    if (!video) return;

    let plyrInstance = null;

    const opciones = {
      controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'settings', 'fullscreen'],
      settings: ['quality'],
      autoplay: false,
      muted: false,
      quality: { default: 0, forced: true }
    };

    function iniciarReproductor() {
      if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        const hls = new Hls({ 
          requestTimeout: 8000, 
          retryDelay: 2000,
          capLevelToPlayerSize: true, // Limita la calidad (1080p, 720p...) según el tamaño del marco en pantalla
          maxBufferLength: 30,
          maxMaxBufferLength: 40,
          liveSyncDurationCount: 4,
          startFragPrefetch: true,
          enableWorker: true
        });
        hls.loadSource(source);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          wrapper.classList.add('bsp-ready');
          const calidades = [0].concat(hls.levels.map(function (l) { return l.height; }).filter(function (h) { return h; }));
          const etiquetas = { 0: 'Auto' };
          hls.levels.forEach(function (l) { if (l.height) etiquetas[l.height] = l.height + 'p'; });
          opciones.quality = {
            default: 0,
            options: calidades,
            forced: true,
            onChange: function (q) {
              if (q === 0) hls.currentLevel = -1;
              else {
                const idx = hls.levels.findIndex(function (l) { return l.height === q; });
                if (idx !== -1) hls.currentLevel = idx;
              }
            }
          };
          if (plyrInstance) { plyrInstance.destroy(); }
          plyrInstance = new Plyr(video, Object.assign({}, opciones, { i18n: { qualityLabel: etiquetas } }));
        });

        hls.on(Hls.Events.ERROR, function (event, data) {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                setTimeout(function () { hls.destroy(); iniciarReproductor(); }, 5000);
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls.recoverMediaError();
                break;
              default:
                setTimeout(function () { hls.destroy(); iniciarReproductor(); }, 5000);
                break;
            }
          }
        });

      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari — HLS nativo
        video.src = source;
        video.addEventListener('loadedmetadata', function () { wrapper.classList.add('bsp-ready'); });
        video.addEventListener('error', function () {
          setTimeout(function () { video.src = ''; video.src = source; }, 5000);
        });
        if (plyrInstance) { plyrInstance.destroy(); }
        plyrInstance = new Plyr(video, opciones);

      } else {
        // Fallback navegadores antiguos
        if (plyrInstance) { plyrInstance.destroy(); }
        plyrInstance = new Plyr(video, opciones);
        video.addEventListener('loadedmetadata', function () { wrapper.classList.add('bsp-ready'); });
        video.src = source;
      }
    }

    iniciarReproductor();
  }

})();
