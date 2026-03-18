/*!
 * Bitstreaming Player v1.0
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
  if (!document.querySelector(`link[href="${PLYR_CSS}"]`)) {
    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = PLYR_CSS;
    document.head.appendChild(link);
  }

  // ─── INYECTAR CONTENEDOR HTML EN EL LUGAR DEL SCRIPT ────────────────────────
  const uid = 'bsp-' + Math.random().toString(36).substr(2, 8);
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'max-width:100%;margin:0 auto 30px auto;background:#000;border-radius:12px;overflow:hidden;box-shadow:0 8px 25px rgba(0,0,0,0.6);';
  wrapper.innerHTML = `<video id="${uid}" class="plyr__video" playsinline controls crossorigin style="width:100%;height:auto;display:block;"></video>`;
  scriptTag.parentNode.insertBefore(wrapper, scriptTag);

  // ─── CARGAR LIBRERÍAS Y ARRANCAR ─────────────────────────────────────────────
  function cargarScript(url, callback) {
    if (document.querySelector(`script[src="${url}"]`)) { callback(); return; }
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
        const hls = new Hls({ requestTimeout: 8000, retryDelay: 2000 });
        hls.loadSource(source);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, function () {
          const calidades = [0, ...hls.levels.map(l => l.height).filter(h => h)];
          opciones.quality = {
            default: 0,
            options: calidades,
            forced: true,
            onChange: function (q) {
              if (q === 0) hls.currentLevel = -1;
              else {
                const idx = hls.levels.findIndex(l => l.height === q);
                if (idx !== -1) hls.currentLevel = idx;
              }
            }
          };
          if (plyrInstance) { plyrInstance.destroy(); }
          plyrInstance = new Plyr(video, opciones);
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
        video.addEventListener('error', function () {
          setTimeout(function () { video.src = ''; video.src = source; }, 5000);
        });
        if (plyrInstance) { plyrInstance.destroy(); }
        plyrInstance = new Plyr(video, opciones);

      } else {
        // Fallback navegadores antiguos
        if (plyrInstance) { plyrInstance.destroy(); }
        plyrInstance = new Plyr(video, opciones);
        video.src = source;
      }
    }

    iniciarReproductor();
  }

})();
