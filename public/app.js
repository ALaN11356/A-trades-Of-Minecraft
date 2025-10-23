window.addEventListener('DOMContentLoaded', () => {
  const audio = document.getElementById('musica');
  const btn = document.getElementById('verificarID');

  // Activar música cuando se presione el botón
  btn.addEventListener('click', () => {
    audio.volume = 1;
    audio.loop = true;
    audio.play().catch(err => {
      console.error("Error al reproducir el audio:", err);
    });
  });
});

// SPA opcional
function irA(pagina) {
  const titulo = document.getElementById('titulo');
  switch (pagina) {
    case 'inicio':
      titulo.textContent = "Inicio";
      break;
    case 'acerca':
      titulo.textContent = "Acerca de";
      break;
    case 'contacto':
      titulo.textContent = "Contacto";
      break;
  }
  history.pushState(null, '', `/${pagina}`);
}
