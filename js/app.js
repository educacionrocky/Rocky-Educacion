
// Buscar elementos del HTML
const mensaje = document.getElementById("mensaje");
const boton = document.getElementById("btnCambiar");

// Acción al hacer clic
boton.addEventListener("click", () => {
  mensaje.textContent = "¡El JavaScript está funcionando!";
});
