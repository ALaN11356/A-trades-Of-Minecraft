function verificarID(callback) {
  document.addEventListener("DOMContentLoaded", () => {
    const id = sessionStorage.getItem('userId');
    if (!id) {
      window.location.href = 'index.html?tramposo';
      return;
    }

    const popup = document.createElement('div');
    popup.id = 'verificacionPopup';
    popup.textContent = 'Verificando ID 1/2...';
    Object.assign(popup.style, {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: '#1a0000',
      padding: '20px', 
      border: '2px solid crimson',
      color: '#ff4444',
      fontFamily: 'UnifrakturCook, cursive',
      fontSize: '1.4em',
      boxShadow: '0 0 30px red',
      borderRadius: '10px',
      zIndex: 9999,
      textAlign: 'center'
    });
    document.body.appendChild(popup);

    fetch('/verificar-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
    .then(res => res.json())
    .then(data => {
      if (!data.acceso) {
        window.location.href = 'index.html?tramposo';
        return;
      }

      popup.textContent = 'Verificando ID 2/2...';
      setTimeout(() => {
        popup.remove();
        callback();
      }, 1500);
    })
    .catch(() => {
      popup.textContent = 'Error infernal al verificar. Regresando...';
      setTimeout(() => {
        window.location.href = 'index.html?tramposo';
      }, 2000);
    });
  });
}
