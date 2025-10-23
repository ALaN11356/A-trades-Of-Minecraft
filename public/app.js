// app.js - funciones compartidas: login, session, helpers
async function login(id, contraseña){
  const r = await fetch('/api/login', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({id,contraseña}) });
  return await r.json();
}
async function logout(){ await fetch('/api/logout', { method:'POST' }); window.location.href='index.html'; }
async function getSession(){ const r = await fetch('/api/session'); return await r.json(); }

// utility: mostrar enlaces admin dependiendo de la sesión
(async ()=>{
  try{
    const s = await getSession();
    if(s.ok && s.isAdmin){
      const a = document.createElement('a'); a.href='admin.html'; a.textContent='Panel Admin'; a.style.marginLeft='10px';
      document.body.prepend(a);
    }
    if(s.ok){
      const acc = document.createElement('a'); acc.href='account.html'; acc.textContent='Mi cuenta'; acc.style.marginLeft='10px'; document.body.prepend(acc);
    }
  }catch(e){ }
})();

// small helper to fill login forms if exist
document.addEventListener('DOMContentLoaded', ()=>{
  const f = document.querySelector('form[data-login]');
  if(!f) return;
  f.addEventListener('submit', async (ev)=>{
    ev.preventDefault();
    const id = f.querySelector('[name=id]').value;
    const contraseña = f.querySelector('[name=contraseña]').value;
    const r = await login(id, contraseña);
    if(r.ok){ window.location.href='tienda.html'; } else { alert('Credenciales incorrectas'); }
  });
});
