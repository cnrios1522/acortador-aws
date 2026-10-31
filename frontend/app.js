// IMPORTANTE: reemplaza por la IP pública de tu EC2 ANTES de subir a S3.
const API_BASE_URL = "http://3.93.187.127:8000";

const form = document.getElementById("shorten-form");
const originalInput = document.getElementById("original-url");
const submitBtn = document.getElementById("submit-btn");
const statusText = document.getElementById("status");
const result = document.getElementById("result");
const shortInput = document.getElementById("short-url");
const copyBtn = document.getElementById("copy-btn");

function setStatus(message, error = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", error);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.hidden = true;
  setStatus("");
  if (!originalInput.checkValidity()) {
    setStatus("Ingresa una URL válida que empiece por http:// o https://", true);
    return;
  }
  const url = originalInput.value.trim();
  if (!/^https?:\/\//i.test(url)) {
    setStatus("La URL debe empezar por http:// o https://", true);
    return;
  }
  submitBtn.disabled = true;
  submitBtn.textContent = "Generando...";
  try {
    const response = await fetch(`${API_BASE_URL}/shorten`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ original_url: url }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(response.status === 422
        ? "URL no válida. Comprueba el formato."
        : (data.detail || `Error del servidor (${response.status})`));
    }
    shortInput.value = data.short_url;
    document.getElementById("open-link").href = data.short_url;
    document.getElementById("short-code").textContent = `UUID: ${data.short_code}`;
    result.hidden = false;
    setStatus("¡Enlace generado y guardado correctamente!");
  } catch (error) {
    setStatus(error instanceof TypeError
      ? "No se puede conectar con la API. Revisa la IP, el puerto 8000 y CORS."
      : error.message, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Generar enlace corto";
  }
});

copyBtn.addEventListener("click", async () => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(shortInput.value);
      setStatus("Enlace copiado al portapapeles.");
    } else {
      // Los sitios web estáticos de S3 funcionan por HTTP; usar alternativa.
      shortInput.focus();
      shortInput.select();
      const copied = document.execCommand("copy");
      setStatus(copied
        ? "Enlace copiado al portapapeles."
        : "Enlace seleccionado. Presiona Ctrl+C para copiarlo.");
    }
  } catch (error) {
    shortInput.focus();
    shortInput.select();
    setStatus("Enlace seleccionado. Presiona Ctrl+C para copiarlo.");
  }
});
