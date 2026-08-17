const reference = new URLSearchParams(location.search).get("reference") ?? "";
const output = document.querySelector("#application-reference");
if (output) {
  output.textContent = /^FXD-A-\d{8}-[A-Z0-9]{10}$/.test(reference)
    ? reference
    : "Recorded";
}
