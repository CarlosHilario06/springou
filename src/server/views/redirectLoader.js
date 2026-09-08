const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/**
 * Só aceita ID de pixel no formato do Facebook (numérico). Qualquer coisa
 * fora disso seria injetada dentro de um <script> — não vale o risco.
 */
function sanitizePixelId(pixelId) {
  const value = String(pixelId ?? "").trim();
  return /^\d{6,20}$/.test(value) ? value : null;
}

/**
 * Página intermediária do redirect. Existe para dar tempo do pixel disparar
 * antes de o visitante sair para a oferta.
 */
export function renderRedirectLoader({
  url,
  pixelId,
  loaderTitle,
  loaderSubtitle,
  delayMs = 1200,
}) {
  // JSON.stringify escapa aspas e barras — seguro dentro do <script>.
  const urlJson = JSON.stringify(String(url)).replace(/</g, "\\u003c");
  const safePixelId = sanitizePixelId(pixelId);

  const title = escapeHtml(loaderTitle || "Só um instante...");
  const subtitle = escapeHtml(
    loaderSubtitle || "Estamos preparando seu conteúdo."
  );

  const pixelScript = safePixelId
    ? `
  <script>
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', ${JSON.stringify(safePixelId)});
    fbq('track', 'PageView');
  </script>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${title}</title>
  <link rel="preconnect" href="${escapeHtml(new URL(url).origin)}" />${pixelScript}
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0f172a;
      color: #f8fafc;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      padding: 24px;
    }
    .box { text-align: center; max-width: 420px; }
    .spinner {
      width: 48px;
      height: 48px;
      border: 5px solid rgba(248, 250, 252, 0.2);
      border-top-color: #f8fafc;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 20px;
    }
    h1 { font-size: 22px; line-height: 1.3; margin: 0 0 8px; font-weight: 600; }
    p { margin: 0; font-size: 15px; line-height: 1.5; opacity: 0.75; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .spinner { animation-duration: 3s; }
    }
  </style>
</head>
<body>
  <div class="box">
    <div class="spinner"></div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
  </div>
  <noscript>
    <p><a href="${escapeHtml(url)}" style="color:#f8fafc">Clique aqui para continuar</a></p>
  </noscript>
  <script>
    (function () {
      var target = ${urlJson};
      setTimeout(function () {
        if (typeof fbq === "function") { fbq('track', 'Lead'); }
        window.location.replace(target);
      }, ${Number(delayMs) || 1200});
    })();
  </script>
</body>
</html>`;
}
