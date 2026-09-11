document.addEventListener("DOMContentLoaded", () => {

    const button = document.getElementById("testButton");
    const status = document.getElementById("status");

    button.addEventListener("click", () => {
        status.textContent =
            "Pixeliser fonctionne !";
    });

});
